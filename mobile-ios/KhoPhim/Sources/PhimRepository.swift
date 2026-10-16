import Foundation

class PhimRepository {
    static let shared = PhimRepository()

    private func formatImageUrl(_ url: String) -> String {
        var trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        if trimmed.starts(with: "http://") {
            trimmed = "https://" + String(trimmed.dropFirst(7))
        }
        if trimmed.starts(with: "https://") {
            return trimmed
        }
        if trimmed.starts(with: "//") {
            return "https:" + trimmed
        }
        let clean = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if clean.starts(with: "uploads/") || clean.starts(with: "upload/") {
            return "https://phimimg.com/" + clean
        }
        if clean.contains(".vn/") || clean.contains(".com/") || clean.contains(".net/") || clean.contains(".org/") {
            return "https://" + clean
        }
        return "https://phimimg.com/" + clean
    }

    private func parseMovies(from json: [String: Any]) -> [MovieItem] {
        var itemsArr: [[String: Any]] = []
        if let dataObj = json["data"] as? [String: Any], let items = dataObj["items"] as? [[String: Any]] {
            itemsArr = items
        } else if let items = json["items"] as? [[String: Any]] {
            itemsArr = items
        }

        var results: [MovieItem] = []
        for item in itemsArr {
            guard let slug = item["slug"] as? String, !slug.isEmpty else { continue }
            let name = (item["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? slug
            let posterRaw = (item["poster_url"] as? String) ?? ""
            let thumbRaw = (item["thumb_url"] as? String) ?? ""

            let poster = formatImageUrl(posterRaw)
            let thumb = formatImageUrl(thumbRaw)

            let isPosterCdn = poster.contains("phimimg.com") && !poster.contains("danviet") && !poster.contains("kenh14")
            let isThumbCdn = thumb.contains("phimimg.com") && !thumb.contains("danviet") && !thumb.contains("kenh14")

            let finalPoster = (!isPosterCdn && isThumbCdn) ? thumb : (!poster.isEmpty ? poster : thumb)
            let finalBanner = isThumbCdn ? thumb : (!thumb.isEmpty ? thumb : poster)

            let quality = (item["quality"] as? String) ?? (item["year"] as? String)
            let epBadge = (item["episode_current"] as? String) ?? (item["time"] as? String)

            results.append(
                MovieItem(
                    title: name,
                    slug: slug,
                    posterUrl: finalPoster,
                    bannerUrl: finalBanner,
                    badge: quality?.isEmpty == false ? quality : nil,
                    episodeBadge: epBadge?.isEmpty == false ? epBadge : nil
                )
            )
        }
        return results
    }

    func getCategoryPage(path: String, page: Int = 1) async -> [MovieItem] {
        let clean = path.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        var apiUrl = "https://phimapi.com/v1/api/danh-sach/\(clean)?page=\(page)"
        if clean == "phim-moi" {
            apiUrl = "https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=\(page)"
        } else if clean.starts(with: "the-loai/") || clean.starts(with: "quoc-gia/") || clean.starts(with: "danh-sach/") {
            apiUrl = "https://phimapi.com/v1/api/\(clean)?page=\(page)"
        }

        guard let url = URL(string: apiUrl) else { return [] }
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return parseMovies(from: json)
            }
        } catch {}
        return []
    }

    func getNetflixHomeSections() async -> (hero: MovieItem?, sections: [MovieSection]) {
        async let thuyetMinhReq = getCategoryPage(path: "danh-sach/phim-thuyet-minh")
        async let longTiengReq = getCategoryPage(path: "danh-sach/phim-long-tieng")
        async let vietNamReq = getCategoryPage(path: "quoc-gia/viet-nam")
        async let newestReq = getCategoryPage(path: "phim-moi")
        async let theaterReq = getCategoryPage(path: "phim-chieu-rap")
        async let seriesReq = getCategoryPage(path: "phim-bo")
        async let actionReq = getCategoryPage(path: "the-loai/hanh-dong")
        async let animeReq = getCategoryPage(path: "the-loai/hoat-hinh")
        async let horrorReq = getCategoryPage(path: "the-loai/kinh-di")
        async let scifiReq = getCategoryPage(path: "the-loai/vien-tuong")
        async let romanceReq = getCategoryPage(path: "the-loai/tinh-cam")

        let (thuyetMinh, longTieng, vietNam, newest, theater, series, action, anime, horror, scifi, romance) = await (
            thuyetMinhReq, longTiengReq, vietNamReq, newestReq, theaterReq, seriesReq, actionReq, animeReq, horrorReq, scifiReq, romanceReq
        )

        let hero = thuyetMinh.first ?? longTieng.first ?? vietNam.first ?? newest.first
        var sections: [MovieSection] = []

        if !thuyetMinh.isEmpty { sections.append(MovieSection(title: "🎙️ Phim Thuyết Minh", slug: "danh-sach/phim-thuyet-minh", movies: thuyetMinh)) }
        if !longTieng.isEmpty { sections.append(MovieSection(title: "🎧 Phim Lồng Tiếng", slug: "danh-sach/phim-long-tieng", movies: longTieng)) }
        if !vietNam.isEmpty { sections.append(MovieSection(title: "🇻🇳 Phim Việt Nam", slug: "quoc-gia/viet-nam", movies: vietNam)) }
        if !newest.isEmpty { sections.append(MovieSection(title: "🔥 Phim Mới Cập Nhật", slug: "phim-moi", movies: newest)) }
        if !theater.isEmpty { sections.append(MovieSection(title: "🍿 Phim Chiếu Rạp", slug: "phim-chieu-rap", movies: theater)) }
        if !series.isEmpty { sections.append(MovieSection(title: "📺 Phim Bộ Đang Hot", slug: "phim-bo", movies: series)) }
        if !action.isEmpty { sections.append(MovieSection(title: "⚔️ Hành Động & Kịch Tính", slug: "the-loai/hanh-dong", movies: action)) }
        if !anime.isEmpty { sections.append(MovieSection(title: "💥 Anime & Hoạt Hình", slug: "the-loai/hoat-hinh", movies: anime)) }
        if !horror.isEmpty { sections.append(MovieSection(title: "👻 Kinh Dị & Rùng Rợn", slug: "the-loai/kinh-di", movies: horror)) }
        if !scifi.isEmpty { sections.append(MovieSection(title: "🚀 Khoa Học Viễn Tưởng", slug: "the-loai/vien-tuong", movies: scifi)) }
        if !romance.isEmpty { sections.append(MovieSection(title: "🌸 Tình Cảm Lãng Mạn", slug: "the-loai/tinh-cam", movies: romance)) }

        return (hero, sections)
    }

    func search(query: String) async -> [MovieItem] {
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let encoded = clean.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return [] }
        let apiUrl = "https://phimapi.com/v1/api/tim-kiem?keyword=\(encoded)&limit=50&page=1"
        guard let url = URL(string: apiUrl) else { return [] }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return parseMovies(from: json)
            }
        } catch {}
        return []
    }

    func getMovieDetail(slug: String) async -> MovieDetail? {
        let clean = slug.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        let providers = [
            "https://phimapi.com/phim/\(clean)",
            "https://ophim1.com/phim/\(clean)"
        ]

        for p in providers {
            guard let url = URL(string: p) else { continue }
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                if let http = response as? HTTPURLResponse, http.statusCode == 200,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let movieObj = json["movie"] as? [String: Any] {
                    let title = (movieObj["name"] as? String) ?? clean
                    let content = (movieObj["content"] as? String) ?? ""
                    let overview = content.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                    let poster = formatImageUrl((movieObj["poster_url"] as? String) ?? "")
                    let thumb = formatImageUrl((movieObj["thumb_url"] as? String) ?? "")
                    let isPosterCdn = poster.contains("phimimg.com") && !poster.contains("danviet") && !poster.contains("kenh14")
                    let isThumbCdn = thumb.contains("phimimg.com") && !thumb.contains("danviet") && !thumb.contains("kenh14")
                    let finalPoster = (!isPosterCdn && isThumbCdn) ? thumb : (!poster.isEmpty ? poster : thumb)
                    let finalBanner = isThumbCdn ? thumb : (!thumb.isEmpty ? thumb : poster)
                    let year = (movieObj["year"] as? String) ?? ""
                    let quality = (movieObj["quality"] as? String) ?? ""

                    var episodesList: [EpisodeSource] = []
                    if let epArr = json["episodes"] as? [[String: Any]] {
                        for srv in epArr {
                            let srvName = (srv["server_name"] as? String) ?? "Server VIP"
                            if let srvData = srv["server_data"] as? [[String: Any]] {
                                for (idx, ep) in srvData.enumerated() {
                                    let epName = (ep["name"] as? String) ?? "Tập \(idx + 1)"
                                    let epSlug = (ep["slug"] as? String) ?? "tap-\(idx + 1)"
                                    var stream = (ep["link_m3u8"] as? String) ?? ""
                                    if stream.isEmpty, let embed = ep["link_embed"] as? String, embed.contains("url=") {
                                        stream = embed.components(separatedBy: "url=").last?.components(separatedBy: "&").first ?? embed
                                    }
                                    if !stream.isEmpty {
                                        episodesList.append(
                                            EpisodeSource(
                                                id: "\(srvName)-\(epSlug)-\(idx)",
                                                serverName: srvName,
                                                episodeName: epName,
                                                episodeSlug: epSlug,
                                                streamUrl: stream
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }

                    return MovieDetail(
                        title: title,
                        slug: clean,
                        posterUrl: finalPoster,
                        backdropUrl: finalBanner,
                        overview: overview,
                        year: year,
                        quality: quality,
                        episodes: episodesList,
                        relatedMovies: []
                    )
                }
            } catch {}
        }
        return nil
    }
}
