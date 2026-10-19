(function (root) {
  'use strict';
  function candidate(data, source) {
    if (!data || (typeof data.vote_average !== 'number' && typeof data.vote_average !== 'string')) return null;
    var score = Number(data.vote_average);
    var votes = data.vote_count == null ? null : Number(data.vote_count);
    if (!isFinite(score) || score <= 0 || score > 10 || (votes !== null && (!isFinite(votes) || votes < 1))) return null;
    return { score: Math.round(score * 10) / 10, source: source, votes: votes === null ? null : Math.floor(votes) };
  }
  function fromMovie(movie) {
    return movie ? candidate(movie.imdb, 'IMDb') || candidate(movie.tmdb, 'TMDB') : null;
  }
  function label(rating) {
    return rating ? '\u2605 ' + rating.source + ' ' + rating.score.toFixed(1) : '';
  }
  function detail(rating) {
    return rating ? label(rating) + '/10' + (rating.votes === null ? '' : ' \u00b7 ' + rating.votes + ' lượt đánh giá') : 'Chưa có điểm';
  }
  // Labels contain only fixed source names and validated numbers.
  function html(movie, className, showEmpty) {
    var rating = fromMovie(movie);
    return rating || showEmpty ? '<span class="' + className + '">' + (showEmpty ? detail(rating) : label(rating)) + '</span>' : '';
  }
  var api = { fromMovie: fromMovie, label: label, detail: detail, html: html };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KhoRatings = api;
}(typeof window !== 'undefined' ? window : this));
