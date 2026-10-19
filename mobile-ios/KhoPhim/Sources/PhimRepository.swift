import Foundation

class PhimRepository {
    static let shared = PhimRepository()

    private func formatImageUrl(_ url: String) -> String { SourcePolicy.imageURL(url) }

    private func parseMovies(from json: [String: Any]) -> [MovieItem] {
        var itemsArr: [[String: Any]] = []
        if let dataObj = json["data"] as? [String: Any], let items = dataObj["items"] as? [[String: Any]] {
            itemsArr = items
        } else if let items = json["items"] as? [[String: Any]] {
            itemsArr = items
        }

        var results: [MovieItem] = []
        for item in itemsArr {
            guard let slug = item["slug"] as? String, SourcePolicy.isCurrentSlug(slug) else { continue }
            let name = (item["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? slug
            let posterRaw = (item["poster_url"] as? String) ?? ""
            let thumbRaw = (item["thumb_url"] as? String) ?? ""

            let poster = formatImageUrl(posterRaw)
            let thumb = formatImageUrl(thumbRaw)

            let finalPoster = !poster.isEmpty ? poster : thumb
            let finalBanner = !thumb.isEmpty ? thumb : poster

            let quality = (item["quality"] as? String) ?? (item["year"] as? String)
            let epBadge = (item["episode_current"] as? String) ?? (item["time"] as? String)

            let modifiedObj = item["modified"] as? [String: Any]
            let modifiedTime = modifiedObj?["time"] as? String

            results.append(
                MovieItem(
                    title: name,
                    slug: slug,
                    posterUrl: finalPoster,
                    bannerUrl: finalBanner,
                    badge: quality?.isEmpty == false ? quality : nil,
                    episodeBadge: epBadge?.isEmpty == false ? epBadge : nil,
                    modifiedTime: modifiedTime, rating: MovieRating.fromMovie(item)
                )
            )
        }

        // Sắp xếp các phim: phim mới cập nhật lên đầu
        results.sort { (a, b) -> Bool in
            let timeA = a.modifiedTime ?? ""
            let timeB = b.modifiedTime ?? ""
            if !timeA.isEmpty && !timeB.isEmpty && timeA != timeB {
                return timeA > timeB
            }
            if !timeA.isEmpty && timeB.isEmpty {
                return true
            }
            if timeA.isEmpty && !timeB.isEmpty {
                return false
            }
            return (a.badge ?? "") > (b.badge ?? "")
        }

        return results
    }

    func getCategoryPage(path: String, page: Int = 1) async -> [MovieItem] {
        guard let url = SourcePolicy.categoryURL(path, page: page) else { return [] }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")

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
        async let moiCapNhatReq = getCategoryPage(path: "danh-sach/phim-moi-cap-nhat")
        async let vietNamReq = getCategoryPage(path: "quoc-gia/viet-nam")
        async let theaterReq = getCategoryPage(path: "phim-chieu-rap")
        async let seriesReq = getCategoryPage(path: "phim-bo")
        async let actionReq = getCategoryPage(path: "the-loai/hanh-dong")
        async let animeReq = getCategoryPage(path: "the-loai/hoat-hinh")
        async let horrorReq = getCategoryPage(path: "the-loai/kinh-di")
        async let scifiReq = getCategoryPage(path: "the-loai/vien-tuong")
        async let romanceReq = getCategoryPage(path: "the-loai/tinh-cam")

        let (moiCapNhat, vietNam, theater, series, action, anime, horror, scifi, romance) = await (
            moiCapNhatReq, vietNamReq, theaterReq, seriesReq, actionReq, animeReq, horrorReq, scifiReq, romanceReq
        )

        let hero = moiCapNhat.first ?? vietNam.first
        var sections: [MovieSection] = []

        if !moiCapNhat.isEmpty { sections.append(MovieSection(title: "⚡ Phim Mới Cập Nhật", slug: "danh-sach/phim-moi-cap-nhat", movies: moiCapNhat)) }
        if !vietNam.isEmpty { sections.append(MovieSection(title: "🇻🇳 Phim Việt Nam", slug: "quoc-gia/viet-nam", movies: vietNam)) }
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
        guard !clean.isEmpty else { return [] }
        var components = URLComponents(string: SourcePolicy.apiBase + "/v1/api/tim-kiem")
        components?.queryItems = [URLQueryItem(name: "keyword", value: clean), URLQueryItem(name: "limit", value: "50"), URLQueryItem(name: "page", value: "1")]
        guard let url = components?.url else { return [] }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return parseMovies(from: json)
            }
        } catch {}
        return []
    }

    func getMovieDetail(slug: String) async -> MovieDetail? {
        guard let url = SourcePolicy.detailURL(slug) else { return nil }
        let clean = slug
        let providers = [url]

        for url in providers {
            do {
                var request = URLRequest(url: url)
                request.timeoutInterval = 20
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                let (data, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, http.statusCode == 200,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let movieObj = json["movie"] as? [String: Any] {
                    let title = (movieObj["name"] as? String) ?? clean
                    let content = (movieObj["content"] as? String) ?? ""
                    let overview = content.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                    let poster = formatImageUrl((movieObj["poster_url"] as? String) ?? "")
                    let thumb = formatImageUrl((movieObj["thumb_url"] as? String) ?? "")
                    let finalPoster = !poster.isEmpty ? poster : thumb
                    let finalBanner = !thumb.isEmpty ? thumb : poster
                    let year = movieObj["year"].map { String(describing: $0) } ?? ""
                    let quality = (movieObj["quality"] as? String) ?? ""

                    var episodesList: [EpisodeSource] = []
                    if let epArr = json["episodes"] as? [[String: Any]] {
                        for srv in epArr {
                            let srvName = (srv["server_name"] as? String) ?? "Tủ Phim"
                            if let srvData = srv["server_data"] as? [[String: Any]] {
                                for (idx, ep) in srvData.enumerated() {
                                    let epName = (ep["name"] as? String) ?? "Tập \(idx + 1)"
                                    let epSlug = (ep["slug"] as? String) ?? "tap-\(idx + 1)"
                                    if let stream = PlaybackPolicy.streamURL(
                                        m3u8: (ep["link_m3u8"] as? String) ?? "",
                                        embed: (ep["link_embed"] as? String) ?? ""
                                    ), SourcePolicy.isGatewayStream(stream.absoluteString) {
                                        episodesList.append(
                                            EpisodeSource(
                                                id: "\(srvName)-\(epSlug)-\(idx)",
                                                serverName: srvName,
                                                episodeName: epName,
                                                episodeSlug: epSlug,
                                                streamUrl: stream.absoluteString
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
                        relatedMovies: [], rating: MovieRating.fromMovie(movieObj)
                    )
                }
            } catch {}
        }
        return nil
    }
}
