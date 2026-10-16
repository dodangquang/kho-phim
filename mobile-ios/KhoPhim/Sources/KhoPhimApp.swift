import SwiftUI

@main
struct KhoPhimApp: App {
    @StateObject private var domainManager = DomainManager()
    @StateObject private var watchHistoryManager = WatchHistoryManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(domainManager)
                .environmentObject(watchHistoryManager)
                .preferredColorScheme(.dark)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var domainManager: DomainManager
    @EnvironmentObject var watchHistoryManager: WatchHistoryManager
    @State private var selectedTab: TabItem = .home

    enum TabItem: String, CaseIterable {
        case home = "Trang chủ"
        case single = "Phim lẻ"
        case series = "Phim bộ"
        case search = "Tìm kiếm"
        case history = "Lịch sử"

        var icon: String {
            switch self {
            case .home: return "house.fill"
            case .single: return "film.fill"
            case .series: return "tv.fill"
            case .search: return "magnifyingglass"
            case .history: return "clock.fill"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(categoryTab: .home)
                .tabItem {
                    Label(TabItem.home.rawValue, systemImage: TabItem.home.icon)
                }
                .tag(TabItem.home)

            HomeView(categoryTab: .single)
                .tabItem {
                    Label(TabItem.single.rawValue, systemImage: TabItem.single.icon)
                }
                .tag(TabItem.single)

            HomeView(categoryTab: .series)
                .tabItem {
                    Label(TabItem.series.rawValue, systemImage: TabItem.series.icon)
                }
                .tag(TabItem.series)

            SearchView()
                .tabItem {
                    Label(TabItem.search.rawValue, systemImage: TabItem.search.icon)
                }
                .tag(TabItem.search)

            HistoryView()
                .tabItem {
                    Label(TabItem.history.rawValue, systemImage: TabItem.history.icon)
                }
                .tag(TabItem.history)
        }
        .tint(Color.red)
    }
}
