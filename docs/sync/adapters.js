(function (root) {
  'use strict';
  function mobile(row) {
    return { movieSlug: row.movieSlug, movieTitle: row.movieTitle, posterUrl: row.posterUrl, bannerUrl: row.bannerUrl, episodeSlug: row.episodeSlug, episodeName: row.episodeName, serverName: row.serverName, currentTime: row.positionMs / 1000, duration: row.durationMs / 1000, timestamp: row.timestamp };
  }
  function desktop(row) {
    return { slug: row.movieSlug, title: row.movieTitle, poster: row.posterUrl, banner: row.bannerUrl, episodeSlug: row.episodeSlug, episodeName: row.episodeName, serverName: row.serverName, positionMs: row.positionMs, durationMs: row.durationMs, timestamp: row.timestamp };
  }
  function tv(row) {
    var value = desktop(row); value.name = row.movieTitle; value.poster_url = row.posterUrl; value.updatedAt = row.timestamp; return value;
  }
  root.KhoSyncView = { mobile: mobile, desktop: desktop, tv: tv };
}(window));
