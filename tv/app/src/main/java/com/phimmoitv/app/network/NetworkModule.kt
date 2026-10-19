package com.phimmoitv.app.network

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object NetworkModule {

    val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(AdBlockInterceptor())
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
