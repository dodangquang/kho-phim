'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ratings = require('../ratings.js');
test('IMDb wins; unrated IMDb falls back to TMDB', () => {
  const movie = { imdb: { vote_average: 8.1, vote_count: 900 }, tmdb: { vote_average: 8.2, vote_count: 127 } };
  assert.equal(ratings.label(ratings.fromMovie(movie)), '★ IMDb 8.1');
  movie.imdb.vote_count = 0;
  assert.equal(ratings.detail(ratings.fromMovie(movie)), '★ TMDB 8.2/10 · 127 lượt đánh giá');
});
test('missing, zero and invalid scores never display a fake rating', () => {
  for (const score of [undefined, null, '', 0, -1, 11, NaN, Infinity, true, '<script>']) {
    assert.equal(ratings.fromMovie({ imdb: { vote_average: score } }), null);
  }
  assert.equal(ratings.html({}, 'movie-rating', false), '');
  assert.equal(ratings.detail(null), 'Chưa có điểm');
});
test('numeric strings, rounding and unknown votes', () => {
  assert.equal(ratings.detail(ratings.fromMovie({ tmdb: { vote_average: '7.25', vote_count: '8' } })), '★ TMDB 7.3/10 · 8 lượt đánh giá');
  assert.equal(ratings.detail(ratings.fromMovie({ imdb: { vote_average: 9 } })), '★ IMDb 9.0/10');
  assert.equal(ratings.fromMovie({ imdb: { vote_average: 8, vote_count: 'invalid' } }), null);
});
test('Samsung ships the same ES5 rating policy', () => {
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../../tv-samsung-tizen/ratings.js'), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../ratings.js'), 'utf8'));
});
