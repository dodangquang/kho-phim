import SwiftUI

struct SearchView: View {
    @State private var query = ""
    @State private var results: [MovieItem] = []
    @State private var isSearching = false
    @State private var selectedMovie: MovieItem?
    @State private var searchTask: Task<Void, Never>?

    let trendingTags = [
        "Thuyết Minh", "Lồng Tiếng", "Chiếu Rạp", "Anime",
        "Hành Động", "Việt Nam", "Hàn Quốc", "Kinh Dị", "Tình Cảm", "Viễn Tưởng"
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 20/255, green: 20/255, blue: 20/255).ignoresSafeArea()

                VStack(spacing: 12) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)

                        TextField("Tìm kiếm phim, diễn viên, anime...", text: $query)
                            .foregroundColor(.white)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .onChange(of: query) { newValue in
                                searchTask?.cancel()
                                searchTask = Task {
                                    try? await Task.sleep(nanoseconds: 400_000_000)
                                    await performSearch(query: newValue)
                                }
                            }

                        if !query.isEmpty {
                            Button {
                                query = ""
                                results = []
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color(red: 35/255, green: 35/255, blue: 35/255))
                    .cornerRadius(10)
                    .padding(.horizontal)

                    // Tags
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(trendingTags, id: \.self) { tag in
                                Button {
                                    query = tag
                                    Task {
                                        await performSearch(query: tag)
                                    }
                                } label: {
                                    Text(tag)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 6)
                                        .background(Color(red: 35/255, green: 35/255, blue: 35/255))
                                        .cornerRadius(15)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }

                    if isSearching {
                        Spacer()
                        ProgressView().tint(.red)
                        Spacer()
                    } else if results.isEmpty && !query.isEmpty {
                        Spacer()
                        VStack(spacing: 6) {
                            Text("Không tìm thấy kết quả cho \"\(query)\"")
                                .foregroundColor(.gray)
                                .font(.system(size: 14))
                            Text("Thử từ khóa khác hoặc bấm gợi ý ở trên")
                                .foregroundColor(.gray.opacity(0.6))
                                .font(.system(size: 12))
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                ForEach(results) { movie in
                                    Button {
                                        selectedMovie = movie
                                    } label: {
                                        MovieCardView(movie: movie, width: 110, height: 160)
                                    }
                                }
                            }
                            .padding(.horizontal)
                            .padding(.top, 8)
                        }
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
        }
    }

    private func performSearch(query: String) async {
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            results = []
            isSearching = false
            return
        }
        isSearching = true
        let res = await PhimRepository.shared.search(query: clean)
        self.results = res
        self.isSearching = false
    }
}

struct HistoryView: View {
    @EnvironmentObject var watchHistoryManager: WatchHistoryManager
    @State private var selectedMovie: MovieItem?
    @State private var showConfirmClear = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 20/255, green: 20/255, blue: 20/255).ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Lịch Sử Xem Phim")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)

                        Spacer()

                        if !watchHistoryManager.historyList.isEmpty {
                            Button("Xóa tất cả") {
                                showConfirmClear = true
                            }
                            .font(.system(size: 13))
                            .foregroundColor(.red)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 12)

                    if watchHistoryManager.historyList.isEmpty {
                        Spacer()
                        VStack(spacing: 8) {
                            Text("Bạn chưa có lịch sử xem phim")
                                .font(.system(size: 15))
                                .foregroundColor(.gray)
                        }
                        .frame(maxWidth: .infinity)
                        Spacer()
                    } else {
                        List {
                            ForEach(watchHistoryManager.historyList) { item in
                                Button {
                                    selectedMovie = MovieItem(
                                        title: item.movieTitle,
                                        slug: item.movieSlug,
                                        posterUrl: item.posterUrl,
                                        bannerUrl: item.bannerUrl
                                    )
                                } label: {
                                    HStack(spacing: 12) {
                                        ZStack(alignment: .bottom) {
                                            AsyncImage(url: URL(string: item.bannerUrl ?? item.posterUrl)) { phase in
                                                if let img = phase.image {
                                                    img.resizable().scaledToFill()
                                                } else {
                                                    Color.black
                                                }
                                            }
                                            .frame(width: 100, height: 60)
                                            .clipShape(RoundedRectangle(cornerRadius: 6))

                                            let ratio = item.durationMs > 0 ? Double(item.positionMs) / Double(item.durationMs) : 0
                                            GeometryReader { geo in
                                                Color.red.frame(width: geo.size.width * CGFloat(ratio), height: 3)
                                            }
                                            .frame(height: 3)
                                        }

                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.movieTitle)
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundColor(.white)
                                                .lineLimit(1)

                                            Text("\(item.serverName) • \(item.episodeName)")
                                                .font(.system(size: 12))
                                                .foregroundColor(.red)

                                            let curMin = item.positionMs / 60000
                                            let totalMin = item.durationMs / 60000
                                            Text("Đã xem \(curMin)/\(totalMin) phút")
                                                .font(.system(size: 11))
                                                .foregroundColor(.gray)
                                        }

                                        Spacer()

                                        Button {
                                            watchHistoryManager.remove(slug: item.movieSlug)
                                        } label: {
                                            Image(systemName: "trash")
                                                .font(.system(size: 14))
                                                .foregroundColor(.gray)
                                        }
                                        .buttonStyle(.borderless)
                                    }
                                }
                                .listRowBackground(Color(red: 28/255, green: 28/255, blue: 28/255))
                                .listRowSeparatorTint(Color.white.opacity(0.1))
                            }
                        }
                        .listStyle(.plain)
                        .scrollContentBackground(.hidden)
                    }
                }
            }
            .alert("Xác nhận xóa", isPresented: $showConfirmClear) {
                Button("Xóa hết", role: .destructive) {
                    watchHistoryManager.clear()
                }
                Button("Hủy", role: .cancel) {}
            } message: {
                Text("Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem phim?")
            }
            .navigationDestination(isPresented: Binding(
                get: { selectedMovie != nil },
                set: { if !$0 { selectedMovie = nil } }
            )) {
                if let movie = selectedMovie {
                    DetailView(movie: movie)
                }
            }
        }
    }
}
