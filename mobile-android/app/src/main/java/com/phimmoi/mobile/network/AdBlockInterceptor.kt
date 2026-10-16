package com.phimmoi.mobile.network

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

class AdBlockInterceptor : Interceptor {

    private val blockedKeywords = listOf(
        "popads", "adsterra", "histats", "doubleclick",
        "google-analytics", "serving-sys", "admob", "creativecdn",
        "adservice", "adnxs", "bidswitch", "criteo", "taboola",
        "outbrain", "yandex", "mgid", "exoclick", "juicyads",
        "propellerads", "trafficjunky", "syndication", "onclick"
    )

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val url = request.url.toString().lowercase()
        val host = request.url.host.lowercase()
        val isAd = blockedKeywords.any { host.contains(it) || url.contains(it) }
        if (isAd) {
            return Response.Builder()
                .request(request)
                .protocol(okhttp3.Protocol.HTTP_1_1)
                .code(204)
                .message("Blocked by PhimMoi AdBlocker")
                .body("".toResponseBody("text/plain".toMediaTypeOrNull()))
                .build()
        }
        return chain.proceed(request)
    }
}
