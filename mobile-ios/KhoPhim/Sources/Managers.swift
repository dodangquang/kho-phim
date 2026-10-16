import Foundation

class DomainManager: ObservableObject {
    @Published var activeDomain: String = "https://phimmoic.info"

    let fallbackDomains = [
        "https://phimmoichill.net",
        "https://phimmoichill.com",
        "https://phimmoic.info",
        "https://phimmoic.net",
        "https://phimmoivip.org"
    ]

    private let key = "active_domain"

    init() {
        if let saved = UserDefaults.standard.string(forKey: key) {
            self.activeDomain = saved
        }
    }

    func setActiveDomain(_ domain: String) {
        let clean = domain.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        self.activeDomain = clean
        UserDefaults.standard.set(clean, forKey: key)
    }

    func fetchLatestDomain() async {
        guard let url = URL(string: "https://raw.githubusercontent.com/phimmoi-config/domains/main/active_domain.txt") else { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               text.starts(with: "http") {
                DispatchQueue.main.async {
                    self.setActiveDomain(text)
                }
            }
        } catch {}
    }
}

class WatchHistoryManager: ObservableObject {
    @Published var historyList: [WatchProgress] = []
    private let key = "watch_history"

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
