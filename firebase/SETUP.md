# Google login and shared history

Status: implementation and emulator tests are ready. Public configuration is disabled until the owner creates a Firebase project, accepts its first-use terms, and connects the registered apps. Do not publish an APK update manifest until configured APK assets exist.

## Firebase console

Create a dedicated **Spark** project for Kho Phim. Analytics, Gemini, Developer Program enrollment, Functions, Storage and a billing account are not required. Spark has service quotas; the implementation does not enable billing or promise unlimited use.

1. Enable Authentication providers **Google** and **Anonymous**. Anonymous sessions are used only for temporary device pairing and cannot access watch history.
2. Register a web app, Android `com.phimmoi.mobile`, and Android TV `com.phimmoitv.app`. Keep those package names and the existing Android signing certificate. Download each Android app's `google-services.json` and the web app's public SDK config. This flow gets the Google credential in a real browser; APKs do not embed a Google OAuth client secret.
3. Authorize `khophimqd.vercel.app` and `dodangquang.github.io` for web Google login. Add an exact preview hostname only while validating that deployment; do not use wildcard domains.
4. Create the **Standard / Native mode** Firestore database, preferably `asia-southeast1` if available. Start with restrictive rules, then deploy **firebase/firestore.rules**. Do not use open test-mode rules.
5. Configure the public identifiers using `node tools/configure-sync.cjs web-config.json mobile-google-services.json tv-google-services.json`. The script verifies both Android package names and that all three configs belong to the same project. No service-account private key is needed.
6. Deploy Firestore rules with an authorized owner session (`firebase deploy --only firestore:rules --project PROJECT_ID`, or the console Rules editor). Set the default Google support email in Authentication. The app's privacy page is `/account/privacy.html`.

Public app config belongs in source. Google/Firebase ID tokens, refresh tokens, service-account keys and developer login credentials do not.

## Data and device pairing

`users/{uid}/history/{movieSlug}` stores canonical milliseconds, episode/server identity, client viewing time, a deletion marker and a server update timestamp. Google-authenticated users can access only their own path. Transactions / update-time preconditions keep older offline writes from replacing a newer viewing action. A clear watermark prevents cleared history returning from an offline device. The newest 60 visible films are retained locally; each sync query is bounded. After the first fetch, web polling requests changes by server update time and pauses while hidden. Native apps use Firestore listeners.

Each account has its own local cache and pending writes. Guest history is imported once when that device explicitly signs in, then removed from the guest cache. Signing out returns to guest history. Changing accounts closes an active player so late progress cannot be attributed to the new account. Cloud updates never recreate an active player's decoder.

TV / APK creates a random 128-bit pairing ID and a separate 256-bit key. A QR URL carries both in its fragment. Pairing expires after five minutes; the claim is allowed once. The phone signs in through the Firebase Google popup, encrypts the short-lived Google credential with AES-GCM, and sends ciphertext to the pairing document. The key never reaches Firestore. The receiver exchanges the credential with Firebase and verifies that the resulting UID matches the authenticated claimant before activating history. A canceled or mismatched result cannot activate a different account.

Successful receivers delete their pairing document. Abandoned expired documents contain only ciphertext and metadata and cannot be claimed. A Spark project does not require TTL billing; operators may remove expired pairing documents through the console. Do not switch to a paid plan just to enable cleanup.

## Validation and rollout

- `node --test docs/tests/sync-history.test.cjs docs/tests/sync-pairing.test.cjs`
- `node docs/tests/sync-browser.cjs` and `--webkit` with Playwright installed; these use a mock transport and mock Google popup, not a real Google grant.
- `cd firebase && npm ci --ignore-scripts && npm test` with Java 17. This runs actual Firestore Security Rules in the emulator, including cross-account denial, anonymous denial, expiry, single-use claims and monotonic saves.
- Android `testDebugUnitTest assembleRelease` on both projects. The Firebase BoM is pinned to 34.0.0 to stay compatible with this repo's Kotlin 2.0 toolchain. A wider compiler migration is separate work.
- Real project validation still requires an enabled backend: actual Google popup in Safari, two independent web sessions, Mobile APK, Android TV QR pairing, an offline retry, account switching, clearing and app restart. Do not describe emulator success as a completed live Google login.

When ready, increment web asset versions and both APK version codes, build/sign using the existing certificate, publish verified assets, then merge the update manifests. iOS native and the locally packaged Samsung WGT do not gain sync from changes to web/APK sources.
