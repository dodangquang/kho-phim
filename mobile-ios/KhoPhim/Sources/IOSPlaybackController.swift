import Foundation
import AVFoundation
import Combine

// The observer always retains the AVPlayer that created its token.
private final class PlayerTimeObservation {
    let owner: AVPlayer
    let token: Any

    init(owner: AVPlayer, token: Any) {
        self.owner = owner
        self.token = token
    }

    deinit { owner.removeTimeObserver(token) }
}

final class IOSPlaybackController: ObservableObject {
    @Published private(set) var player: AVPlayer?
    @Published private(set) var currentTime: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var isLoading = false
    @Published private(set) var isReady = false
    @Published private(set) var canSeek = false
    @Published private(set) var isSeeking = false
    @Published private(set) var errorMessage: String?

    private var timeObservation: PlayerTimeObservation?
    private var statusObservation: NSKeyValueObservation?
    private var playbackObservation: NSKeyValueObservation?
    private var notifications: [NSObjectProtocol] = []
    private var generation = 0
    private var seekRequest = 0
    private var wantsToPlay = true
    private var hasStartedPlayback = false
    private var pendingResume: Double?
    private var pendingSeekTarget: Double?
    private var lastSavedAt: TimeInterval = 0
    private var movie: MovieItem?
    private var episode: EpisodeSource?
    private var history: WatchHistoryManager?

    deinit {
        statusObservation?.invalidate()
        playbackObservation?.invalidate()
        notifications.forEach { NotificationCenter.default.removeObserver($0) }
        player?.pause()
        player?.replaceCurrentItem(with: nil)
    }

    func load(movie: MovieItem, episode: EpisodeSource, history: WatchHistoryManager) {
        saveProgress()
        tearDown()
        self.movie = movie
        self.episode = episode
        self.history = history
        currentTime = 0
        duration = 0
        isReady = false
        canSeek = false
        isSeeking = false
        isPlaying = false
        isLoading = true
        errorMessage = nil
        wantsToPlay = true
        hasStartedPlayback = false
        lastSavedAt = 0

        guard let url = PlaybackPolicy.directHLSURL(episode.streamUrl) else {
            isLoading = false
            errorMessage = "Nguồn này không có liên kết HLS trực tiếp. Hãy chọn nguồn hoặc tập khác."
            return
        }
        if let saved = history.getProgress(for: movie.slug), PlaybackPolicy.matches(saved, episode: episode),
           saved.positionMs > 2000,
           saved.durationMs <= 0 || saved.positionMs < saved.durationMs - 1000 {
            pendingResume = Double(saved.positionMs) / 1000
        }

        let item = AVPlayerItem(url: url)
        let newPlayer = AVPlayer(playerItem: item)
        newPlayer.automaticallyWaitsToMinimizeStalling = true
        player = newPlayer
        let session = generation

        let token = newPlayer.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self, weak newPlayer] _ in
            guard let self = self, let newPlayer = newPlayer, self.isCurrent(newPlayer, session) else { return }
            self.updateTimeline(newPlayer)
            self.applyPendingResume(newPlayer, session)
            if !self.isSeeking && Date.timeIntervalSinceReferenceDate - self.lastSavedAt >= 5 {
                self.saveProgress()
            }
        }
        timeObservation = PlayerTimeObservation(owner: newPlayer, token: token)

        statusObservation = item.observe(\.status, options: [.initial, .new]) { [weak self, weak newPlayer, weak item] _, _ in
            DispatchQueue.main.async {
                guard let self = self, let newPlayer = newPlayer, let item = item,
                      self.isCurrent(newPlayer, session), newPlayer.currentItem === item else { return }
                switch item.status {
                case .readyToPlay:
                    guard !self.isReady else { return }
                    self.isReady = true
                    self.updateTimeline(newPlayer)
                    if !self.applyPendingResume(newPlayer, session) { self.playIfRequested(newPlayer) }
                case .failed:
                    self.fail("Không thể mở nguồn phát. Thử lại hoặc chọn nguồn khác.", player: newPlayer, session: session)
                default: break
                }
            }
        }
        playbackObservation = newPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self, weak newPlayer] _, _ in
            DispatchQueue.main.async {
                guard let self = self, let newPlayer = newPlayer, self.isCurrent(newPlayer, session), self.isReady else { return }
                let status = newPlayer.timeControlStatus
                if self.hasStartedPlayback && !self.isSeeking {
                    self.wantsToPlay = status != .paused
                    self.isPlaying = self.wantsToPlay
                }
                self.isLoading = self.wantsToPlay && status == .waitingToPlayAtSpecifiedRate
            }
        }
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self, weak newPlayer] _ in
            guard let self = self, let newPlayer = newPlayer else { return }
            self.fail("Nguồn phát bị gián đoạn. Thử lại hoặc chọn nguồn khác.", player: newPlayer, session: session)
        })
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self, weak newPlayer] _ in
            guard let self = self, let newPlayer = newPlayer, self.isCurrent(newPlayer, session) else { return }
            self.updateTimeline(newPlayer)
            self.saveProgress()
            self.wantsToPlay = false
            self.isPlaying = false
            self.isLoading = false
        })
    }

    func togglePlayback() {
        guard isReady, errorMessage == nil, let player = player else { return }
        wantsToPlay.toggle()
        isPlaying = wantsToPlay
        if wantsToPlay { playIfRequested(player) } else {
            player.pause()
            isLoading = false
            saveProgress()
        }
    }

    func seekBy(_ seconds: Double) {
        guard seconds.isFinite, let player = player else { return }
        let base = pendingSeekTarget ?? player.currentTime().seconds
        guard let position = PlaybackPolicy.finiteSeconds(base) else { return }
        seek(to: position + seconds)
    }

    func seek(to requested: Double) {
        guard isReady, canSeek, let player = player,
              let target = PlaybackPolicy.seekTarget(requested, duration: duration, seekable: seekableRange(player)) else { return }
        pendingResume = nil
        performSeek(player, to: target, session: generation, playAfterSeek: wantsToPlay)
    }

    func retry() {
        guard let movie = movie, let episode = episode, let history = history else { return }
        load(movie: movie, episode: episode, history: history)
    }

    func stop() {
        saveProgress()
        tearDown()
        movie = nil
        episode = nil
        history = nil
        isReady = false
        canSeek = false
        isLoading = false
        isPlaying = false
    }

    func saveProgress() {
        guard isReady, pendingResume == nil, !isSeeking,
              let movie = movie, let episode = episode, let history = history,
              currentTime.isFinite, duration.isFinite, currentTime > 2, duration > 0,
              duration < Double(Int64.max) / 1000 else { return }
        let position = min(currentTime, duration)
        guard let positionMs = Int64(exactly: (position * 1000).rounded(.down)),
              let durationMs = Int64(exactly: (duration * 1000).rounded(.down)) else { return }
        history.saveProgress(WatchProgress(
            movieSlug: movie.slug, movieTitle: movie.title, posterUrl: movie.posterUrl, bannerUrl: movie.bannerUrl,
            episodeSlug: episode.episodeSlug, episodeName: episode.episodeName,
            serverName: episode.serverName, streamUrl: episode.streamUrl,
            positionMs: positionMs, durationMs: durationMs,
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        ))
        lastSavedAt = Date.timeIntervalSinceReferenceDate
    }

    private func isCurrent(_ candidate: AVPlayer, _ session: Int) -> Bool {
        generation == session && player === candidate
    }

    private func tearDown() {
        // Invalidate queued callbacks before releasing the previous player.
        generation += 1
        seekRequest += 1
        statusObservation?.invalidate()
        statusObservation = nil
        playbackObservation?.invalidate()
        playbackObservation = nil
        notifications.forEach { NotificationCenter.default.removeObserver($0) }
        notifications.removeAll()
        player?.pause()
        player?.currentItem?.cancelPendingSeeks()
        timeObservation = nil
        player?.replaceCurrentItem(with: nil)
        player = nil
        pendingResume = nil
        pendingSeekTarget = nil
        isSeeking = false
    }

    private func seekableRange(_ player: AVPlayer) -> ClosedRange<Double>? {
        let ranges = player.currentItem?.seekableTimeRanges.compactMap { value -> ClosedRange<Double>? in
            let range = value.timeRangeValue
            let start = range.start.seconds
            let end = CMTimeRangeGetEnd(range).seconds
            guard start.isFinite, end.isFinite, start >= 0, end > start else { return nil }
            return start...end
        } ?? []
        return ranges.first(where: { $0.contains(currentTime) }) ?? ranges.last
    }

    private func updateTimeline(_ player: AVPlayer) {
        if !isSeeking, let position = PlaybackPolicy.finiteSeconds(player.currentTime().seconds) { currentTime = position }
        if let value = player.currentItem?.duration.seconds, let finite = PlaybackPolicy.finiteSeconds(value), finite > 0 {
            duration = finite
        }
        canSeek = isReady && PlaybackPolicy.seekTarget(currentTime, duration: duration, seekable: seekableRange(player)) != nil
    }

    @discardableResult
    private func applyPendingResume(_ player: AVPlayer, _ session: Int) -> Bool {
        guard isReady, !isSeeking, let resume = pendingResume,
              let target = PlaybackPolicy.seekTarget(resume, duration: duration, seekable: seekableRange(player)) else { return false }
        pendingResume = nil
        performSeek(player, to: target, session: session, playAfterSeek: wantsToPlay)
        return true
    }

    private func performSeek(_ player: AVPlayer, to target: Double, session: Int, playAfterSeek: Bool) {
        player.currentItem?.cancelPendingSeeks()
        seekRequest += 1
        let request = seekRequest
        isSeeking = true
        pendingSeekTarget = target
        currentTime = target
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: CMTime(seconds: 0.25, preferredTimescale: 600)) { [weak self, weak player] finished in
            DispatchQueue.main.async {
                guard let self = self, let player = player, self.isCurrent(player, session), self.seekRequest == request else { return }
                self.isSeeking = false
                self.pendingSeekTarget = nil
                if finished { self.currentTime = target }
                self.updateTimeline(player)
                if playAfterSeek && self.wantsToPlay { self.playIfRequested(player) }
                self.saveProgress()
            }
        }
    }

    private func playIfRequested(_ player: AVPlayer) {
        guard wantsToPlay, errorMessage == nil else { return }
        hasStartedPlayback = true
        isPlaying = true
        player.play()
    }

    private func fail(_ message: String, player: AVPlayer, session: Int) {
        guard isCurrent(player, session) else { return }
        saveProgress()
        player.pause()
        pendingResume = nil
        pendingSeekTarget = nil
        wantsToPlay = false
        isReady = false
        canSeek = false
        isSeeking = false
        isLoading = false
        isPlaying = false
        errorMessage = message
    }
}
