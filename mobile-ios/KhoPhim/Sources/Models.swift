import Foundation

struct MovieItem: Identifiable, Codable, Hashable {
    var id: String { slug }
    let title: String
    let slug: String
    let posterUrl: String
    let bannerUrl: String?
    let badge: String?
    let episodeBadge: String?
    let modifiedTime: String?

    init(title: String, slug: String, posterUrl: String, bannerUrl: String? = nil, badge: String? = nil, episodeBadge: String? = nil, modifiedTime: String? = nil) {
        self.title = title
        self.slug = slug
        self.posterUrl = posterUrl
        self.bannerUrl = bannerUrl
        self.badge = badge
        self.episodeBadge = episodeBadge
        self.modifiedTime = modifiedTime
    }
}

struct MovieSection: Identifiable {
    var id: String { slug }
    let title: String
    let slug: String
    let movies: [MovieItem]
}

struct MovieDetail: Identifiable {
    var id: String { slug }
    let title: String
    let slug: String
    let posterUrl: String
    let backdropUrl: String?
    let overview: String
    let year: String
    let quality: String
    let episodes: [EpisodeSource]
    let relatedMovies: [MovieItem]
}

struct EpisodeSource: Identifiable, Codable, Hashable {
    let id: String
    let serverName: String
    let episodeName: String
    let episodeSlug: String
    let streamUrl: String
}

struct WatchProgress: Identifiable, Codable {
    var id: String { movieSlug }
    let movieSlug: String
    let movieTitle: String
    let posterUrl: String
    let bannerUrl: String?
    let episodeSlug: String
    let episodeName: String
    let serverName: String
    let streamUrl: String
    let positionMs: Int64
    let durationMs: Int64
    let timestamp: Int64
}
