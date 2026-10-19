import Foundation
import Combine

class WatchHistoryManager: ObservableObject {
    @Published var historyList: [WatchProgress] = []
    private let key = "watch_history"
    var currentSourceHistory: [WatchProgress] { historyList.filter { SourcePolicy.isCurrentSlug($0.movieSlug) } }

    init() {
        loadHistory()
    }

    func loadHistory() {
        guard let data = UserDefaults.standard.data(forKey: key) else { return }
        if let list = try? JSONDecoder().decode([WatchProgress].self, from: data) {
            self.historyList = list
        }
    }

    func saveProgress(_ progress: WatchProgress) {
        var list = historyList.filter { $0.movieSlug != progress.movieSlug }
        list.insert(progress, at: 0)
        if list.count > 50 {
            list = Array(list.prefix(50))
        }
        self.historyList = list
        if let encoded = try? JSONEncoder().encode(list) {
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }

    func getProgress(for slug: String) -> WatchProgress? {
        return historyList.first { $0.movieSlug == slug }
    }

    func remove(slug: String) {
        self.historyList.removeAll { $0.movieSlug == slug }
        if let encoded = try? JSONEncoder().encode(self.historyList) {
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }

    func clear() {
        self.historyList.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}
