package com.phimmoitv.app

import android.app.Application
import android.graphics.Bitmap
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import com.phimmoitv.app.network.NetworkModule

/**
 * Lớp Application khởi tạo các cấu hình tối ưu RAM đặc biệt cho Android TV (1GB - 2GB RAM).
 */
class TvApp : Application(), ImageLoaderFactory {

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .okHttpClient(NetworkModule.okHttpClient)
            // 1. Tối ưu định dạng Bitmap: RGB_565 tốn 2 bytes/pixel thay vì ARGB_8888 tốn 4 bytes/pixel (Giảm 50% RAM ảnh poster)
            .bitmapConfig(Bitmap.Config.RGB_565)
            // 2. Giới hạn bộ nhớ RAM cache ảnh: Chỉ sử dụng tối đa 15% dung lượng RAM của App
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.15)
                    .build()
            }
            // 3. Cache ảnh vào bộ nhớ trong (Disk) thay vì giữ trong RAM
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024) // 100 MB trên đĩa
                    .build()
            }
            .memoryCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            // Cho phép tự động giải phóng bộ nhớ khi hệ thống báo Low Memory
            .respectCacheHeaders(false)
            .build()
    }
}
