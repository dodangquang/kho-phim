import SwiftUI

struct MovieCardView: View {
    let movie: MovieItem
    var width: CGFloat = 110
    var height: CGFloat = 160

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topTrailing) {
                AsyncImage(url: URL(string: movie.posterUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        Color.gray.opacity(0.3)
                    case .empty:
                        ProgressView()
                            .tint(.red)
                    @unknown default:
                        Color.black
                    }
                }
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: 6))

                // Episode badge
                if let ep = movie.episodeBadge, !ep.isEmpty {
                    Text(ep)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.yellow)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.black.opacity(0.75))
                        .cornerRadius(3)
                        .padding(4)
                }

                // Quality badge top-left
                if let badge = movie.badge, !badge.isEmpty {
                    Text(badge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.red.opacity(0.85))
                        .cornerRadius(3)
                        .padding(4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                if let rating = movie.rating {
                    Text(rating.label)
                        .font(.system(size: 9, weight: .bold)).foregroundColor(.yellow)
                        .padding(4).background(Color.black.opacity(0.85)).cornerRadius(3).padding(4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }

            Text(movie.title)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(1)
                .frame(width: width, alignment: .leading)
        }
        .frame(width: width)
    }
}

struct HomeView: View {
    enum CategoryTab {
        case home
        case single
        case series
    }

    let categoryTab: CategoryTab
    @EnvironmentObject var watchHistoryManager: WatchHistoryManager
    @State private var heroMovie: MovieItem?
    @State private var sections: [MovieSection] = []
    @State private var categoryMovies: [MovieItem] = []
    @State private var categoryPage = 1
    @State private var isLoading = true
    @State private var selectedMovie: MovieItem?

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 20/255, green: 20/255, blue: 20/255).ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.red)
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            // Hero Banner
                            if let hero = heroMovie {
                                HeroBannerView(movie: hero) {
                                    selectedMovie = hero
                                }
                            }

                            // Continue Watching (Only on Home)
                            if categoryTab == .home && !watchHistoryManager.historyList.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Tiếp Tục Xem")
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        LazyHStack(spacing: 12) {
                                            ForEach(watchHistoryManager.historyList) { item in
                                                ContinueWatchingCard(item: item) {
                                                    selectedMovie = MovieItem(
                                                        title: item.movieTitle,
                                                        slug: item.movieSlug,
                                                        posterUrl: item.posterUrl,
                                                        bannerUrl: item.bannerUrl
                                                    )
                                                }
                                            }
                                        }
                                        .padding(.horizontal)
                                    }
                                }
                            }

                            // Themed Rows for Home
                            if categoryTab == .home {
                                ForEach(sections) { section in
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(section.title)
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundColor(.white)
                                            .padding(.horizontal)

                                        ScrollView(.horizontal, showsIndicators: false) {
                                            LazyHStack(spacing: 10) {
                                                ForEach(section.movies) { movie in
                                                    Button {
                                                        selectedMovie = movie
                                                    } label: {
                                                        MovieCardView(movie: movie)
                                                    }
                                                }
                                            }
                                            .padding(.horizontal)
                                        }
                                    }
                                }
                            } else {
                                // Category Grid (Single or Series)
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                    ForEach(categoryMovies) { movie in
                                        Button {
                                            selectedMovie = movie
                                        } label: {
                                            MovieCardView(movie: movie, width: 110, height: 160)
                                        }
                                    }
                                }
                                .padding(.horizontal)

                                // Load More Button
                                Button {
                                    Task {
                                        let slug = categoryTab == .single ? "phim-le" : "phim-bo"
                                        categoryPage += 1
                                        let more = await PhimRepository.shared.getCategoryPage(path: slug, page: categoryPage)
                                        categoryMovies.append(contentsOf: more)
                                    }
                                } label: {
                                    Text("Tải thêm phim")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 10)
                                        .background(Color(red: 40/255, green: 40/255, blue: 40/255))
                                        .cornerRadius(8)
                                }
                                .padding(.vertical, 16)
                            }
                        }
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationDestination(isPresented: Binding(
                get: { selectedMovie != nil },
                set: { if !$0 { selectedMovie = nil } }
            )) {
                if let movie = selectedMovie {
                    DetailView(movie: movie)
                }
            }
            .task {
                await loadData()
            }
        }
    }

    private func loadData() async {
        isLoading = true
        if categoryTab == .home {
            if sections.isEmpty {
                let res = await PhimRepository.shared.getNetflixHomeSections()
                self.heroMovie = res.hero
                self.sections = res.sections
            }
        } else {
            let slug = categoryTab == .single ? "phim-le" : "phim-bo"
            let movies = await PhimRepository.shared.getCategoryPage(path: slug, page: 1)
            self.categoryMovies = movies
            self.heroMovie = movies.first
        }
        isLoading = false
    }
}

struct HeroBannerView: View {
    let movie: MovieItem
    let onPlay: () -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            AsyncImage(url: URL(string: movie.bannerUrl ?? movie.posterUrl)) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Color.black
                }
            }
            .frame(height: 280)
            .clipped()

            LinearGradient(
                colors: [.clear, Color.black.opacity(0.6), Color(red: 20/255, green: 20/255, blue: 20/255)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(spacing: 10) {
                Text(movie.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)

                Button(action: onPlay) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                        Text("Xem Phim")
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
                    .background(Color.white)
                    .cornerRadius(6)
                }
            }
            .padding(.bottom, 16)
        }
        .frame(height: 280)
    }
}

struct ContinueWatchingCard: View {
    let item: WatchProgress
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            VStack(alignment: .leading, spacing: 4) {
                ZStack(alignment: .bottom) {
                    AsyncImage(url: URL(string: item.bannerUrl ?? item.posterUrl)) { phase in
                        if let img = phase.image {
                            img.resizable().scaledToFill()
                        } else {
                            Color.black
                        }
                    }
                    .frame(width: 140, height: 85)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                    // Progress bar
                    let ratio = item.durationMs > 0 ? Double(item.positionMs) / Double(item.durationMs) : 0
                    GeometryReader { geo in
                        Color.red
                            .frame(width: geo.size.width * CGFloat(ratio), height: 3)
                    }
                    .frame(height: 3)
                }

                Text(item.movieTitle)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text("\(item.serverName) • \(item.episodeName)")
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
                    .lineLimit(1)
            }
            .frame(width: 140)
        }
    }
}
