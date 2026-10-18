import SwiftUI
import AVKit

struct DetailView: View {
    let movie: MovieItem
    @EnvironmentObject var watchHistoryManager: WatchHistoryManager
    @State private var movieDetail: MovieDetail?
    @State private var isLoading = true
    @State private var selectedServer: String = ""
    @State private var activeEpisode: EpisodeSource?
    @State private var showPlayer = false

    var body: some View {
        ZStack {
            Color(red: 20/255, green: 20/255, blue: 20/255).ignoresSafeArea()

            if isLoading {
                ProgressView().tint(.red)
            } else if let detail = movieDetail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Backdrop
                        ZStack(alignment: .bottom) {
                            AsyncImage(url: URL(string: detail.backdropUrl ?? movie.posterUrl)) { phase in
                                if let img = phase.image {
                                    img.resizable().scaledToFill()
                                } else {
                                    Color.black
                                }
                            }
                            .frame(height: 250)
                            .clipped()

                            LinearGradient(
                                colors: [.clear, Color(red: 20/255, green: 20/255, blue: 20/255)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        }
                        .frame(height: 250)

                        VStack(alignment: .leading, spacing: 12) {
                            Text(detail.title)
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)

                            HStack(spacing: 8) {
                                if !detail.quality.isEmpty {
                                    Text(detail.quality)
                                        .font(.system(size: 10, weight: .bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.red)
                                        .cornerRadius(3)
                                }
                                if !detail.year.isEmpty {
                                    Text(detail.year)
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                }
                                Text("Độ nét cao")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.green)
                            }

                            // Big Play Button
                            let lastProgress = watchHistoryManager.getProgress(for: movie.slug)
                            let currentEpisodes = detail.episodes.filter { $0.serverName == selectedServer }
                            let resumeEp = PlaybackPolicy.resumeEpisode(in: currentEpisodes, progress: lastProgress, server: selectedServer)

                            if let playEp = resumeEp {
                                Button {
                                    activeEpisode = playEp
                                    selectedServer = playEp.serverName
                                    showPlayer = true
                                } label: {
                                    HStack {
                                        Image(systemName: "play.fill")
                                        Text(lastProgress != nil ? "Tiếp Tục Xem (\(playEp.episodeName))" : "Xem Phim Ngay")
                                    }
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(Color.red)
                                    .cornerRadius(8)
                                }
                            } else {
                                Text("Phim chưa có nguồn HLS phát trực tiếp. Hãy thử lại sau.")
                                    .font(.system(size: 13)).foregroundColor(.gray)
                                Button("Tải lại nguồn phát") { Task { await loadDetail() } }.tint(.red)
                            }

                            // Synopsis
                            if !detail.overview.isEmpty {
                                Text("Nội dung phim")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.top, 4)

                                Text(detail.overview)
                                    .font(.system(size: 13))
                                    .foregroundColor(.gray)
                                    .lineSpacing(4)
                            }

                            // Server Picker
                            let servers = Array(Set(detail.episodes.map { $0.serverName })).sorted()
                            if servers.count > 1 {
                                Text("Nguồn phát")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.top, 8)

                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(servers, id: \.self) { srv in
                                            Button {
                                                selectedServer = srv
                                            } label: {
                                                Text(srv)
                                                    .font(.system(size: 12, weight: .bold))
                                                    .foregroundColor(.white)
                                                    .padding(.horizontal, 14)
                                                    .padding(.vertical, 8)
                                                    .background(selectedServer == srv ? Color.red : Color(red: 35/255, green: 35/255, blue: 35/255))
                                                    .cornerRadius(6)
                                            }
                                        }
                                    }
                                }
                            }

                            // Episode Grid
                            let filtered = detail.episodes.filter { $0.serverName == selectedServer }
                            if !filtered.isEmpty {
                                Text("Danh sách tập (\(filtered.count) tập)")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.top, 8)

                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                    ForEach(filtered) { ep in
                                        let isWatched = lastProgress.map { PlaybackPolicy.matches($0, episode: ep) } ?? false
                                        Button {
                                            activeEpisode = ep
                                            showPlayer = true
                                        } label: {
                                            Text(ep.episodeName)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundColor(.white)
                                                .frame(maxWidth: .infinity)
                                                .frame(height: 40)
                                                .background(isWatched ? Color.red.opacity(0.85) : Color(red: 35/255, green: 35/255, blue: 35/255))
                                                .cornerRadius(6)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.bottom, 32)
                    }
                }
            } else {
                VStack(spacing: 16) {
                    Text("Không tải được thông tin hoặc nguồn phát.").foregroundColor(.white)
                    Button("Thử lại") { Task { await loadDetail() } }.tint(.red)
                }
            }
        }
        .task {
            await loadDetail()
        }
        .fullScreenCover(isPresented: $showPlayer) {
            if let ep = activeEpisode, let detail = movieDetail {
                IOSPlayerView(
                    movie: movie,
                    currentEpisode: ep,
                    allEpisodes: detail.episodes,
                    watchHistoryManager: watchHistoryManager
                ) {
                    showPlayer = false
                }
            }
        }
    }

    @MainActor
    private func loadDetail() async {
        isLoading = true
        let detail = await PhimRepository.shared.getMovieDetail(slug: movie.slug)
        guard !Task.isCancelled else { return }
        movieDetail = detail
        if let detail = detail {
            selectedServer = PlaybackPolicy.resumeEpisode(
                in: detail.episodes,
                progress: watchHistoryManager.getProgress(for: movie.slug),
                server: selectedServer
            )?.serverName ?? ""
        }
        isLoading = false
    }
}

// FULLSCREEN LANDSCAPE VIDEO PLAYER FOR IOS
struct IOSPlayerView: View {
    let movie: MovieItem
    @State var currentEpisode: EpisodeSource
    let allEpisodes: [EpisodeSource]
    let watchHistoryManager: WatchHistoryManager
    let onClose: () -> Void

    @StateObject private var playback = IOSPlaybackController()
    @State private var showControls = true
    @State private var isSeeking = false
    @State private var seekSliderValue: Double = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Native Video Player
            if let p = playback.player {
                VideoPlayer(player: p)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation {
                            showControls.toggle()
                        }
                    }
            }

            // Touch Controls Overlay
            if showControls {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                        .onTapGesture { withAnimation { showControls = false } }

                    // Top Bar
                    VStack {
                        HStack {
                            Button(action: {
                                playback.stop()
                                onClose()
                            }) {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(8)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(movie.title)
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                                Text("\(currentEpisode.serverName) • \(currentEpisode.episodeName)")
                                    .font(.system(size: 12))
                                    .foregroundColor(.red)
                            }

                            Spacer()
                        }
                        .padding(.horizontal)
                        .padding(.top, 16)

                        Spacer()

                        // Center Controls (Rewind 10s, Play/Pause, Forward 10s)
                        HStack(spacing: 50) {
                            Button {
                                playback.seekBy(-10)
                            } label: {
                                Image(systemName: "gobackward.10")
                                    .font(.system(size: 30))
                                    .foregroundColor(.white)
                            }
                            .disabled(!playback.canSeek)

                            Button {
                                playback.togglePlayback()
                            } label: {
                                Image(systemName: playback.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                    .font(.system(size: 60))
                                    .foregroundColor(.red)
                            }
                            .disabled(!playback.isReady)

                            Button {
                                playback.seekBy(10)
                            } label: {
                                Image(systemName: "goforward.10")
                                    .font(.system(size: 30))
                                    .foregroundColor(.white)
                            }
                            .disabled(!playback.canSeek)
                        }

                        Spacer()

                        // Bottom Scrub Bar
                        VStack(spacing: 4) {
                            HStack {
                                Text(formatTime(isSeeking ? seekSliderValue : playback.currentTime))
                                    .font(.system(size: 12))
                                    .foregroundColor(.white)

                                Spacer()

                                // Next Episode
                                let sameServer = allEpisodes.filter { $0.serverName == currentEpisode.serverName }
                                if let idx = sameServer.firstIndex(of: currentEpisode), idx + 1 < sameServer.count {
                                    let next = sameServer[idx + 1]
                                    Button {
                                        switchEpisode(next)
                                    } label: {
                                        Text("Tập kế tiếp (\(next.episodeName)) ▶")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(.red)
                                    }
                                }

                                Spacer()

                                Text(formatTime(playback.duration))
                                    .font(.system(size: 12))
                                    .foregroundColor(.gray)
                            }

                            Slider(
                                value: Binding(
                                    get: { min(max(isSeeking ? seekSliderValue : playback.currentTime, 0), max(playback.duration, 1)) },
                                    set: { newVal in
                                        isSeeking = true
                                        seekSliderValue = newVal
                                    }
                                ),
                                in: 0...max(playback.duration, 1),
                                onEditingChanged: { editing in
                                    if !editing {
                                        isSeeking = false
                                        playback.seek(to: seekSliderValue)
                                    }
                                }
                            )
                            .tint(.red)
                            .disabled(!playback.canSeek || playback.duration <= 0)
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 20)
                    }
                }
            }
            if let error = playback.errorMessage {
                VStack(spacing: 16) {
                    Text(error).multilineTextAlignment(.center).foregroundColor(.white)
                    Button("Thử lại") { retryPlayback() }.tint(.red)
                    Button("Chọn nguồn hoặc tập khác") { playback.stop(); onClose() }.foregroundColor(.white)
                }
                .padding(24)
                .background(Color.black.opacity(0.9))
                .cornerRadius(12)
            } else if playback.isLoading {
                VStack(spacing: 12) {
                    ProgressView("Đang tải video...").tint(.red).foregroundColor(.white)
                    Button("Tải lại nguồn phát") { retryPlayback() }.tint(.red)
                }
                .padding().background(Color.black.opacity(0.75)).cornerRadius(10)
            }
        }
        .onAppear {
            setOrientation(.landscape)
            playback.load(movie: movie, episode: currentEpisode, history: watchHistoryManager)
        }
        .onDisappear {
            playback.stop()
            setOrientation(.portrait)
        }
    }

    private func switchEpisode(_ ep: EpisodeSource) {
        isSeeking = false
        seekSliderValue = 0
        currentEpisode = ep
        playback.load(movie: movie, episode: ep, history: watchHistoryManager)
    }

    private func retryPlayback() {
        isSeeking = false
        seekSliderValue = 0
        playback.retry()
    }

    private func setOrientation(_ orientation: UIInterfaceOrientationMask) {
        if #available(iOS 16.0, *) {
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
            let preferences = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: orientation)
            windowScene.requestGeometryUpdate(preferences) { _ in }
        } else {
            UIDevice.current.setValue(orientation == .landscape ? UIInterfaceOrientation.landscapeRight.rawValue : UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && seconds > 0 && seconds < Double(Int.max) else { return "00:00" }
        let s = Int(seconds)
        let hours = s / 3600
        let minutes = (s % 3600) / 60
        let sec = s % 60
        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, sec)
        } else {
            return String(format: "%02d:%02d", minutes, sec)
        }
    }
}
