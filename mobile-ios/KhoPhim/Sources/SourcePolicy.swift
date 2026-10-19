import Foundation

// Source namespace prevents saved legacy slugs from opening an unrelated Tủ Phim title.
enum SourcePolicy {
    static let apiBase = "https://khophimqd.vercel.app/source"
    static let legacyMessage = "Nguồn cũ đã ngừng dùng. Tìm lại phim trên Tủ Phim."

    static func isCurrentSlug(_ slug: String) -> Bool {
        slug.range(of: "^tp--[A-Za-z0-9_-]{1,176}$", options: .regularExpression) == (slug.startIndex..<slug.endIndex)
    }

    static func categoryURL(_ path: String, page: Int = 1) -> URL? {
        let clean = path.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        let route: String
        if ["phim-moi", "phim-moi-cap-nhat", "danh-sach/phim-moi-cap-nhat"].contains(clean) {
            route = "danh-sach/phim-moi-cap-nhat"
        } else if clean.range(of: "^(the-loai|quoc-gia|danh-sach)/[a-z0-9-]+$", options: .regularExpression) == (clean.startIndex..<clean.endIndex) {
            route = "v1/api/" + clean
        } else if clean.range(of: "^[a-z0-9-]+$", options: .regularExpression) == (clean.startIndex..<clean.endIndex) {
            route = "v1/api/danh-sach/" + clean
        } else { return nil }
        return URL(string: "\(apiBase)/\(route)?page=\(max(1, page))")
    }

    static func detailURL(_ slug: String, audio: String? = nil) -> URL? {
        let suffix = audio.map { ["lt", "tm"].contains($0) ? "?audio=" + $0 : "" } ?? ""
        return isCurrentSlug(slug) ? URL(string: "\(apiBase)/phim/\(slug)" + suffix) : nil
    }

    static func imageURL(_ raw: String) -> String {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URLComponents(string: value), url.scheme == "https", let host = url.host,
              !host.isEmpty, url.user == nil, url.password == nil else { return "" }
        let oldHosts = ["phimimg.com", "phimapi.com", "phimmoichill.net", "phimmoichill.com", "phimmoic.info", "phimmoic.net", "phimmoivip.org"]
        guard !oldHosts.contains(where: { host.lowercased() == $0 || host.lowercased().hasSuffix("." + $0) }) else { return "" }
        return value
    }

    static func isGatewayStream(_ raw: String) -> Bool {
        guard let url = URLComponents(string: raw) else { return false }
        return url.scheme == "https" && url.host == "khophimqd.vercel.app" && url.user == nil && url.password == nil && url.port == nil && url.path.hasPrefix("/source/stream/") && url.path.hasSuffix(".m3u8") && !url.path.contains("..")
    }
}
