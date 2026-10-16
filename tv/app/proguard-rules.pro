# Keep data models
-keep class com.phimmoitv.app.data.** { *; }

# Keep OkHttp & Media3
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

-keep class androidx.media3.** { *; }
