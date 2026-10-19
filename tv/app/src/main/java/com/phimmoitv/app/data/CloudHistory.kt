package com.phimmoitv.app.data

import android.content.Context
import android.util.Base64
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.security.SecureRandom
import java.util.Date
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class SyncAccount(val name: String? = null, val message: String = "Chưa đăng nhập", val qrUrl: String? = null, val uid: String? = null)

class CloudHistory private constructor(context: Context) {
    private val context = context.applicationContext
    private val prefs = this.context.getSharedPreferences("khophim_cloud_history_v1", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutableRevision = MutableStateFlow(0L)
    val revision: StateFlow<Long> = mutableRevision
    private val mutableAccount = MutableStateFlow(SyncAccount())
    val account: StateFlow<SyncAccount> = mutableAccount
    private var owner = "guest"
    private var epoch = 0
    private var syncJob: Job? = null
    private var pairingJob: Job? = null
    private var pairingListener: ListenerRegistration? = null
    private var pairingRef: com.google.firebase.firestore.DocumentReference? = null
    private var pairingEpoch = 0
    private var pairingActive = false
    private var credentialPending = false
    private var historyListener: ListenerRegistration? = null
    private var metaListener: ListenerRegistration? = null
    private var auth: FirebaseAuth? = null
    private var db: FirebaseFirestore? = null
    private var syncing = false
    private var accountUrl = "https://khophimqd.vercel.app/account/"
    val enabled: Boolean get() = auth != null && db != null

    init {
        migrate()
        runCatching {
            val config = JSONObject(this.context.assets.open("firebase-config.json").bufferedReader().use { it.readText() })
            if (config.optBoolean("enabled") && config.optString("apiKey").isNotBlank() && config.optString("appId").isNotBlank()) {
                val options = FirebaseOptions.Builder().setApiKey(config.getString("apiKey")).setApplicationId(config.getString("appId"))
                    .setProjectId(config.getString("projectId")).build()
                val app = FirebaseApp.getApps(this.context).find { it.name == "khophim-sync" }
                    ?: FirebaseApp.initializeApp(this.context, options, "khophim-sync")
                auth = FirebaseAuth.getInstance(app); db = FirebaseFirestore.getInstance(app)
                accountUrl = config.optString("accountUrl", accountUrl)
                auth!!.addAuthStateListener { value ->
                    if (!pairingActive && !credentialPending) {
                        val current = value.currentUser?.takeIf { !it.isAnonymous }
                        if (current != null && current.uid == prefs.getString("approved_uid", null)) activate(current, false)
                        else if (current != null) value.signOut()
                        else if (owner != "guest") activate(null, false)
                    }
                }
            }
        }.onFailure { mutableAccount.value = SyncAccount(message = "Chức năng tài khoản đang được thiết lập.") }
    }
    @Synchronized private fun read(): HistorySyncState = runCatching {
        val state = gson.fromJson(prefs.getString(owner, null), HistorySyncState::class.java) ?: HistorySyncState()
        state.rows = HistoryPolicy.merge(emptyList(), state.rows, state.clearedAt); state
    }.getOrDefault(HistorySyncState())
    @Synchronized private fun write(value: HistorySyncState) { value.dirty.keys.retainAll(value.rows.map { it.movieSlug }.toSet()); prefs.edit().putString(owner, gson.toJson(value)).apply() }
    @Synchronized private fun migrate() {
        if (prefs.getBoolean("migrated", false)) return
        val previous = context.getSharedPreferences("phimmoi_watch_history", Context.MODE_PRIVATE).getString("history_list", null)
        val type = object : TypeToken<List<WatchProgress>>() {}.type
        val rows = runCatching { (gson.fromJson<List<WatchProgress>>(previous, type) ?: emptyList()).map(HistoryPolicy::fromProgress) }.getOrDefault(emptyList())
        write(HistorySyncState(rows = HistoryPolicy.merge(emptyList(), rows, 0)))
        prefs.edit().putBoolean("migrated", true).apply()
    }
    @Synchronized fun ownerKey(): String = owner
    @Synchronized fun history(): List<WatchProgress> = read().rows.filter { !it.deleted }.take(60).map { it.progress() }
    @Synchronized fun save(value: WatchProgress, expectedOwner: String? = null) {
        if (expectedOwner != null && owner != expectedOwner) return
        val row = HistoryPolicy.normalize(HistoryPolicy.fromProgress(value).copy(timestamp = System.currentTimeMillis())) ?: return
        val state = read(); state.rows = HistoryPolicy.merge(state.rows, listOf(row), state.clearedAt)
        state.dirty[row.movieSlug] = row.timestamp; write(state); changed(); schedule()
    }
    @Synchronized fun remove(slug: String) {
        val row = HistoryPolicy.normalize(HistoryRow(slug, timestamp = System.currentTimeMillis(), deleted = true)) ?: return
        val state = read(); state.rows = HistoryPolicy.merge(state.rows, listOf(row), state.clearedAt)
        state.dirty[slug] = row.timestamp; write(state); changed(); schedule()
    }
    @Synchronized fun clear() { write(HistorySyncState(clearedAt = System.currentTimeMillis(), clearDirty = true)); changed(); schedule() }
    private fun changed() { mutableRevision.value += 1 }
    @Synchronized private fun activate(user: FirebaseUser?, importGuest: Boolean) {
        if (!importGuest && user != null && owner == user.uid && historyListener != null) return
        if (user != null && user.providerData.none { it.providerId == "google.com" }) return
        epoch++; syncJob?.cancel(); historyListener?.remove(); metaListener?.remove(); syncing = false
        owner = "guest"
        val guest = if (user != null && importGuest) read().rows.filter { !it.deleted } else emptyList()
        owner = user?.uid ?: "guest"
        if (user != null) prefs.edit().putString("approved_uid", user.uid).apply()
        val state = read(); state.rows = HistoryPolicy.merge(state.rows, guest, state.clearedAt)
        guest.forEach { state.dirty[it.movieSlug] = it.timestamp }; write(state)
        if (guest.isNotEmpty()) { val active = owner; owner = "guest"; write(HistorySyncState()); owner = active }
        mutableAccount.value = SyncAccount(user?.let { it.displayName ?: it.email ?: "Tài khoản Google" }, if (user == null) "Chưa đăng nhập" else "Đang đồng bộ…", uid = user?.uid)
        changed()
        if (user != null) {
            val uid = user.uid; val generation = epoch
            val root = db!!.collection("users").document(uid)
            historyListener = root.collection("history").orderBy("timestamp", Query.Direction.DESCENDING).limit(120).addSnapshotListener { snapshot, error ->
                if (generation != epoch || owner != uid) return@addSnapshotListener
                if (error != null) { offline(); return@addSnapshotListener }
                val rows = snapshot?.documents?.mapNotNull { doc -> runCatching { doc.toObject(HistoryRow::class.java) }.getOrNull() } ?: emptyList()
                reconcile(rows, 0); if (snapshot?.metadata?.isFromCache == false) schedule(0)
            }
            metaListener = root.collection("meta").document("history").addSnapshotListener { snapshot, error ->
                if (generation != epoch || owner != uid) return@addSnapshotListener
                if (error != null) { offline(); return@addSnapshotListener }
                reconcile(emptyList(), snapshot?.getLong("clearedAt") ?: 0)
                if (snapshot?.metadata?.isFromCache == false) schedule(0)
            }
            schedule(0)
        }
    }
    @Synchronized private fun reconcile(rows: List<HistoryRow>, clearedAt: Long) {
        val state = read(); state.clearedAt = maxOf(state.clearedAt, clearedAt)
        state.rows = HistoryPolicy.merge(state.rows, rows, state.clearedAt)
        rows.forEach { row -> if ((state.dirty[row.movieSlug] ?: Long.MAX_VALUE) <= row.timestamp) state.dirty.remove(row.movieSlug) }
        state.dirty.entries.removeAll { it.value <= state.clearedAt }
        if (clearedAt >= state.clearedAt) state.clearDirty = false
        write(state); changed()
    }
    private fun offline() { mutableAccount.value = mutableAccount.value.copy(message = "Chưa đồng bộ được. Lịch sử vẫn được lưu trên thiết bị.") }
    private fun schedule(delayMs: Long = 1500) {
        if (owner == "guest" || !enabled) return
        syncJob?.cancel(); syncJob = scope.launch { delay(delayMs); syncNow() }
    }
    fun syncNow() {
        if (!enabled || owner == "guest" || syncing) return
        val uid = owner; val generation = epoch; val state = read(); val root = db!!.collection("users").document(uid)
        syncing = true
        val batch = state.rows.filter { state.dirty[it.movieSlug] == it.timestamp }
        scope.launch {
            try {
                if (state.clearDirty) {
                    val clearTime = db!!.runTransaction { tx ->
                        val ref = root.collection("meta").document("history"); val previous = tx.get(ref).getLong("clearedAt") ?: 0
                        maxOf(previous, state.clearedAt).also { tx.set(ref, mapOf("clearedAt" to it)) }
                    }.awaitResult()
                    if (generation != epoch || uid != owner) return@launch
                    reconcile(emptyList(), clearTime)
                }
                for (row in batch) {
                    if (generation != epoch || uid != owner) return@launch
                    val chosen = db!!.runTransaction { tx ->
                        val meta = tx.get(root.collection("meta").document("history")).getLong("clearedAt") ?: 0
                        val ref = root.collection("history").document(row.movieSlug)
                        val previous = tx.get(ref).toObject(HistoryRow::class.java)
                        if (row.timestamp <= meta) return@runTransaction null
                        val latest = HistoryPolicy.later(previous, row)
                        if (latest == row) tx.set(ref, row.cloud() + ("updatedAt" to FieldValue.serverTimestamp()))
                        latest
                    }.awaitResult()
                    if (generation != epoch || uid != owner) return@launch
                    if (chosen != null) reconcile(listOf(chosen), 0)
                    synchronized(this@CloudHistory) { val current = read(); if (current.dirty[row.movieSlug] == row.timestamp) { current.dirty.remove(row.movieSlug); write(current) } }
                }
                if (generation == epoch && uid == owner) mutableAccount.value = mutableAccount.value.copy(message = "Đã đồng bộ")
            } catch (_: Exception) { if (generation == epoch && uid == owner) offline() }
            finally { if (generation == epoch && uid == owner) { syncing = false; schedule(30000) } }
        }
    }
    fun signOut() {
        prefs.edit().remove("approved_uid").apply()
        cancelPairing(); auth?.signOut(); activate(null, false)
    }
    fun cancelPairing() {
        pairingEpoch++; pairingJob?.cancel(); pairingListener?.remove(); pairingListener = null
        pairingRef?.delete(); pairingRef = null; pairingActive = false
        mutableAccount.value = mutableAccount.value.copy(qrUrl = null)
    }
    fun signIn() {
        if (!enabled || owner != "guest" || credentialPending) return
        cancelPairing(); val generation = pairingEpoch; pairingActive = true
        mutableAccount.value = SyncAccount(message = "Đang tạo mã QR…")
        val secret = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val sessionId = ByteArray(16).also { SecureRandom().nextBytes(it) }.base64()
        pairingJob = scope.launch {
            try {
                val anonymous = auth!!.signInAnonymously().awaitResult().user ?: error("Missing pairing session")
                if (generation != pairingEpoch) return@launch
                val ref = db!!.collection("pairings").document(sessionId)
                val expires = System.currentTimeMillis() + 300000
                ref.set(mapOf("ownerUid" to anonymous.uid, "createdAt" to FieldValue.serverTimestamp(), "expiresAt" to Timestamp(Date(expires)))).awaitResult()
                if (generation != pairingEpoch) { ref.delete(); return@launch }
                pairingRef = ref
                mutableAccount.value = SyncAccount(message = "Quét mã QR bằng điện thoại. Mã hết hạn sau 5 phút.", qrUrl = accountUrl + "#pair=" + sessionId + "&key=" + secret.base64())
                var accepting = false
                pairingListener = ref.addSnapshotListener { snapshot, error ->
                    if (generation != pairingEpoch || accepting) return@addSnapshotListener
                    if (error != null) { cancelPairing(); mutableAccount.value = SyncAccount(message = "Không liên kết được. Kiểm tra kết nối và thử lại."); return@addSnapshotListener }
                    val payload = snapshot?.getString("payload") ?: return@addSnapshotListener
                    val iv = snapshot.getString("iv") ?: return@addSnapshotListener
                    val sender = snapshot.getString("senderUid") ?: return@addSnapshotListener
                    accepting = true
                    scope.launch {
                        try {
                            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(secret, "AES"), GCMParameterSpec(128, iv.unbase64()))
                            val credential = JSONObject(String(cipher.doFinal(payload.unbase64()), Charsets.UTF_8))
                            require(credential.getString("uid") == sender)
                            if (generation != pairingEpoch) return@launch
                            credentialPending = true
                            val user = auth!!.signInWithCredential(GoogleAuthProvider.getCredential(credential.getString("googleIdToken"), null)).awaitResult().user
                            if (generation != pairingEpoch) { auth!!.signOut(); credentialPending = false; return@launch }
                            require(user != null && user.uid == sender)
                            // Verify the claimed identity before exposing any account history.
                            pairingListener?.remove(); pairingListener = null; pairingJob?.cancel()
                            pairingRef = null; pairingActive = false; pairingEpoch++
                            ref.delete(); credentialPending = false
                            activate(user, true)
                        } catch (_: Exception) {
                            credentialPending = false
                            if (generation == pairingEpoch) { cancelPairing(); auth?.signOut(); activate(null, false); mutableAccount.value = SyncAccount(message = "Không xác nhận được tài khoản. Hãy tạo mã mới.") }
                        }
                    }
                }
                delay(300000)
                if (generation == pairingEpoch) { cancelPairing(); mutableAccount.value = SyncAccount(message = "Mã QR đã hết hạn. Hãy đăng nhập lại để tạo mã mới.") }
            } catch (_: CancellationException) { }
            catch (_: Exception) { if (generation == pairingEpoch) { cancelPairing(); mutableAccount.value = SyncAccount(message = "Không tạo được mã QR. Kiểm tra kết nối và thử lại.") } }
        }
    }
    private fun ByteArray.base64() = Base64.encodeToString(this, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private fun String.unbase64() = Base64.decode(this, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private suspend fun <T> com.google.android.gms.tasks.Task<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { if (continuation.isActive) continuation.resumeWith(Result.success(it)) }
        addOnFailureListener { if (continuation.isActive) continuation.resumeWith(Result.failure(it)) }
    }
    companion object {
        @Volatile private var instance: CloudHistory? = null
        fun get(context: Context): CloudHistory = instance ?: synchronized(this) { instance ?: CloudHistory(context).also { instance = it } }
    }
}
