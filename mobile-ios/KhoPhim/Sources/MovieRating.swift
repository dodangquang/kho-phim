import Foundation

struct MovieRating: Codable, Hashable {
    let score: Double
    let source: String
    let votes: Int?
    var label: String { "★ "+source+" "+String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), score) }
    var detailLabel: String { label+"/10"+(votes.map { " · \($0) lượt đánh giá" } ?? "") }

    static func fromMovie(_ movie: [String: Any]) -> MovieRating? {
        for (key, source) in [("imdb", "IMDb"), ("tmdb", "TMDB")] {
            guard let data = movie[key] as? [String: Any],
                  let raw = data["vote_average"], let score = Double(String(describing: raw)),
                  score.isFinite, score > 0, score <= 10 else { continue }
            var votes: Int? = nil
            if let count = data["vote_count"], !(count is NSNull) {
                guard let value = Double(String(describing: count)), value.isFinite, value >= 1, value < Double(Int.max) else { continue }
                votes = Int(value)
            }
            return MovieRating(score: (score * 10).rounded() / 10, source: source, votes: votes)
        }
        return nil
    }
}
