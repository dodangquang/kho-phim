import Foundation

// Pure input and timeline rules shared by the repository and native player.
enum PlaybackPolicy {
    static func movieSlug(_ raw: String) -> String? {
        let slug = raw.trimmingCharacters(in: CharacterSet(charactersIn: "/ \t\r\n"))
        guard !slug.isEmpty, slug != ".", slug != "..",
              !slug.contains("/"), !slug.contains("\\"),
              !slug.contains("?"), !slug.contains("#"),
              slug.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              slug.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
        // Years and sequel numbers are part of the API slug. Never strip them.
        return slug
    }

    static func directHLSURL(_ raw: String) -> URL? {
        var candidate = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        for _ in 0..<3 {
            if candidate.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
               candidate.rangeOfCharacter(from: .controlCharacters) == nil,
               let components = URLComponents(string: candidate),
               let scheme = components.scheme?.lowercased(),
               ["http", "https"].contains(scheme),
               let host = components.host, !host.isEmpty,
               components.user == nil, components.password == nil,
               components.path.lowercased().hasSuffix(".m3u8"),
               let url = components.url {
                return url
            }
            guard let decoded = candidate.removingPercentEncoding, decoded != candidate else { break }
            candidate = decoded
        }
        return nil
    }

    static func streamURL(m3u8: String, embed: String) -> URL? {
        if let direct = directHLSURL(m3u8) { return direct }
        if let direct = directHLSURL(embed) { return direct }
        guard let components = URLComponents(string: embed.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              components.host?.isEmpty == false else { return nil }
        for item in components.queryItems ?? [] where ["url", "src", "link"].contains(item.name.lowercased()) {
            if let value = item.value, let direct = directHLSURL(value) { return direct }
        }
        return nil
    }

    static func finiteSeconds(_ seconds: Double) -> Double? {
        guard seconds.isFinite, seconds >= 0 else { return nil }
        return seconds
    }

    static func seekTarget(_ requested: Double, duration: Double, seekable: ClosedRange<Double>?) -> Double? {
        guard requested.isFinite else { return nil }
        if let range = seekable, range.lowerBound.isFinite, range.upperBound.isFinite,
           range.lowerBound >= 0, range.upperBound > range.lowerBound {
            return min(max(requested, range.lowerBound), range.upperBound)
        }
        guard duration.isFinite, duration > 0 else { return nil }
        return min(max(requested, 0), duration)
    }

    static func matches(_ progress: WatchProgress, episode: EpisodeSource) -> Bool {
        progress.episodeSlug == episode.episodeSlug && progress.serverName == episode.serverName
    }

    static func resumeEpisode(in episodes: [EpisodeSource], progress: WatchProgress?, server: String) -> EpisodeSource? {
        if let progress = progress,
           let saved = episodes.first(where: { matches(progress, episode: $0) }) { return saved }
        return episodes.first(where: { $0.serverName == server }) ?? episodes.first
    }
}
