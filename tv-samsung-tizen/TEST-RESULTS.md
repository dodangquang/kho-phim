# Kiểm tra Kho Phim 1.0.10 — 17/10/2026

## Chromium 69 thật

Engine: HeadlessChrome/69.0.3494.0 (V8 6.9.409), Windows, viewport 1920×1080. Đã tải snapshot r575458 từ kho chính thức của Google vào work để kiểm tra; browser này không được đóng gói trong bản phát hành.

Bản 1.0.9 trước sửa: chiều ngang nội dung thẻ 246 px, khung poster 161 px; ảnh chụp tái hiện dải trống như ảnh người dùng gửi.

Bản 1.0.10: chiều ngang nội dung thẻ, khung poster và canvas cùng 246 px ở trang chủ. Các trạng thái đã thử:

1. Trang chủ, chưa focus thẻ.
2. Hai hàng danh mục khi cuộn xuống, tiêu đề ngắn/dài khác nhau.
3. Thẻ đã focus.
4. Trang danh mục với menu mở.
5. Trang danh mục với menu thu gọn.
6. Hàng Xem tiếp với ảnh ngang.
7. Lịch sử với ảnh ngang.

Đã kiểm tra Enter mở chi tiết, Escape/Return trả focus và Space mở lại. Khung và canvas phủ đủ chiều ngang trong cả 7 trạng thái; tỷ lệ canvas phù hợp khung, khung dọc cao 346 px và khung ngang cao 156 px. Không có lỗi runtime trong các luồng này.

Dữ liệu đo: tests/results-legacy-v1.0.10.json. API/ảnh được trả từ fixture lưu sẵn bằng CDP; các file HTML/CSS/JavaScript runtime được phục vụ nguyên bản, không sửa chuỗi nguồn để giả lập engine.

## Edge: 36/36 kiểm tra qua

Edge 154.0.4258.62, Playwright 1.62.1, Acorn 8.15.0, phân tích cú pháp ES5. AVPlay và dữ liệu API được mô phỏng; HTTP cache ảnh được tắt bằng Cache-Control: no-store.

1. All runtime JavaScript parses as ES5
2. Six-film pagination preserves every item for 6, 12 and 24-item source pages
3. Two bounded poster downloads prioritize visible cards; repeated input cannot starve painting
4. Small thumbnails keep source aspect ratio; resize redraws from cache and offscreen cards keep pixels
5. Duplicate posters share one load; detached rows and playback restore from cache without refetch
6. Thumbnail LRU stays within 48 entries and 16MiB; clear cancels stale callbacks
7. Watchdog refreshes on progress, clears on pause, rearms on resume and closes stalled video
8. Poster frames retain full height while network images are still loading and no card is focused
9. Original banner/menu retained with six larger films and no focus zoom/glow
10. Initial home loads only nearby shelves; no remote script or iframe
11. Poster canvases fit their fixed 346px frames with matching aspect ratio before focus
12. Unfocused and focused cards keep identical poster frame dimensions
13. Movie cards retain focus, Enter/Space activation and Return after replacing native buttons
14. Remote traverses all eleven virtual shelves without losing focus or growing DOM
15. Horizontal shelf Next/Previous replaces a six-film window without accumulating cards
16. Distant shelves restore all six posters without focus or refetch, with HTTP image cache disabled
17. Six-film home windows traverse all four parts of fixed 24-film API pages
18. Opening and closing sidebar redraws every category poster to the new width without focus stretch
19. Returning to a category page restores six cached posters without downloading again
20. Category pagination uses original poster style and retains only six films
21. 500 episodes rendered as 24-button pages; detail fits on screen
22. AVPlay async state order, pause saves history, close releases, resume seeks
23. Rapid seek requests coalesce into one AVPlay seek
24. Playback completion clears progress and opens next episode
25. Leaving app releases the player and returns to episode selection
26. Late prepare callback cannot restart a closed player
27. AVPlay error closes decoder and remains navigable with Return
28. Remote reaches hidden menu items and activates settings
29. Canceled old searches cannot overwrite new results
30. Remote grid navigation tracks original responsive poster columns
31. Offline boot, settings, corrupt history recovery, scoped history deletion
32. History bounded at 40; unsafe URL rejected; direct HLS extracted safely
33. Both detail API failures show retry and allow returning to catalog
34. Original Continue Watching row resumes and restores focus after progress updates
35. Cache clear frees thumbnail cache and old shelves, then rebuilds only the visible window
36. No browser runtime errors across all tested flows

## Phạm vi

Không thay đổi code cache poster, trình phát, dựng kệ, stylesheet gốc và icon so với 1.0.9. Chưa chạy 1.0.10, ký chứng chỉ hoặc cài trên TV Samsung thật; không đo FPS/RAM trên TV. Kiểm tra trên Chromium 69 Windows là bằng chứng tái hiện và sửa lỗi bố cục, không phải chứng nhận phần cứng Tizen.
