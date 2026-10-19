(function (global) {
  'use strict';
  var C = global.KhoCore;
  var categories = [
    ['Tìm Kiếm', 'search'], ['Trang Chủ', 'home'],
    ['Phim Lẻ', 'danh-sach/phim-le'], ['Phim Bộ', 'danh-sach/phim-bo'],
    ['Chiếu Rạp', 'danh-sach/phim-chieu-rap'], ['Đã Xem', 'history'], ['Cài Đặt', 'settings']
  ];
  function el(id) { return document.getElementById(id); }
  function visible(node, show) { node.classList.toggle('hidden', !show); }
  function text(id, value) { el(id).textContent = value; }
  function button(label, action, className) {
    var node = document.createElement('button');
    node.type = 'button'; node.textContent = label; node.onclick = action;
    node.className = className || 'tv-btn tv-btn-secondary';
    return node;
  }
  var main = el('main');
  var menu = Array.prototype.slice.call(el('menu').children);
  var mainRows = [];
  var gridCards = [];
  var detailRows = [];
  var currentFocus = null;
  var lastMainFocus = null;
  var scene = 'main';
  var selected = 1;
  var page = 1;
  var totalPages = 1;
  var listItems = [];
  var query = '';
  var movie = null;
  var servers = [];
  var serverIndex = 0;
  var episodePage = 0;
  var activeEpisodeIndex = 0;
  var activeEpisode = null;
  var historyEntry = null;
  var detailAutoPlay = false;
  var request = new C.Request();
  var detailRequest = new C.Request();
  var cache = new C.Cache(6);
  var detailCache = new C.Cache(3);
  var sourceSizes = {};
  var toastTimer = null;
  var hudTimer = null;
  var subtitleTimer = null;
  var hudVisible = true;
  var lastNav = 0;
  var lastSave = 0;
  var exitTime = 0;
  var busy = false;
  var lastHistoryPosition = 0;
  var homeInitialFocus = true;
  var posterLayoutFrame = null;
  var playerControls = [el('player-back'), el('rewind'), el('pause'), el('forward'), el('next-episode')];
  function isHome() { return categories[selected][1] === 'home'; }
  function toast(message) {
    text('toast', message); visible(el('toast'), true); clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { visible(el('toast'), false); }, 3200);
  }
  function focus(node) {
    if (!node || node.disabled) return;
    if (currentFocus) currentFocus.classList.remove('tv-focused');
    currentFocus = node; node.classList.add('tv-focused'); node.focus();
    var wasExpanded = el('sidebar').classList.contains('expanded');
    var expanded = node.parentNode === el('menu');
    el('sidebar').classList.toggle('expanded', expanded);
    if (wasExpanded !== expanded && scene === 'main') { updateMainRows(gridCards); refreshPosterLayout(); }
    if (scene === 'main' && isHome() && !expanded && home) home.reveal(node);
    else if (!expanded) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function gridColumns() {
    if (categories[selected][1] === 'history') return Math.max(1, Math.floor((main.clientWidth - 104 + 20) / 300));
    return 6;
  }
  function updateMainRows(cards) {
    gridCards = cards || gridCards;
    if (isHome()) { mainRows = home ? home.rows() : []; return; }
    var path = categories[selected][1];
    var rows = [];
    if (path === 'search') rows.push([el('search-input'), el('search-button')]);
    if (path === 'history') rows.push([el('history-clear')]);
    if (path === 'settings') {
      var accountButtons = Array.prototype.slice.call(el('settings').querySelectorAll('[data-sync-panel] button')).filter(function (node) { return !node.disabled; });
      if (accountButtons.length) rows.push(accountButtons);
      rows.push([el('clear-cache'), el('clear-history')]);
    }
    var columns = gridColumns();
    for (var i = 0; i < gridCards.length; i += columns) rows.push(gridCards.slice(i, i + columns));
    if (path !== 'settings') rows.push([el('previous'), el('retry'), el('next')].filter(function (node) { return !node.disabled; }));
    mainRows = rows.filter(function (row) { return row.length; });
  }
  function navigateRows(rows, direction, allowMenu) {
    var r = -1; var c = -1;
    for (var i = 0; i < rows.length; i++) {
      var index = rows[i].indexOf(currentFocus);
      if (index !== -1) { r = i; c = index; break; }
    }
    if (r < 0) { if (rows.length) focus(rows[0][0]); return; }
    if (direction === 37) {
      if (c > 0) focus(rows[r][c - 1]);
      else if (allowMenu) { lastMainFocus = currentFocus; focus(menu[selected]); }
    } else if (direction === 39) {
      if (c + 1 < rows[r].length) focus(rows[r][c + 1]);
    } else {
      var target = r + (direction === 38 ? -1 : 1);
      if (target >= 0 && target < rows.length) focus(rows[target][Math.min(c, rows[target].length - 1)]);
    }
  }
  function child(tag, className, value) {
    var node = document.createElement(tag); node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function imageWindow(container) {
    global.KhoPosters.prune();
    var horizontal = container.classList.contains('tv-shelf-row');
    var left = container.scrollLeft;
    var right = left + container.clientWidth;
    var rowRect = horizontal ? container.getBoundingClientRect() : null;
    var mainRect = horizontal ? main.getBoundingClientRect() : null;
    var inViewport = !horizontal || (rowRect.top + 18 < mainRect.bottom && rowRect.bottom > mainRect.top);
    var nearVertical = !horizontal || (rowRect.top < mainRect.bottom + 540 && rowRect.bottom > mainRect.top);
    Array.prototype.forEach.call(container.querySelectorAll('canvas[data-src]'), function (image) {
      var card = image.closest('.tv-card, .tv-continue-card');
      var wanted = nearVertical && (!horizontal || (card.offsetLeft + card.offsetWidth >= left - 170 && card.offsetLeft <= right + 170));
      global.KhoPosters.request(image, wanted, inViewport ? 0 : 1);
    });
  }
  function refreshPosterLayout() {
    if (posterLayoutFrame !== null) return;
    posterLayoutFrame = global.requestAnimationFrame(function () {
      posterLayoutFrame = null;
      if (scene !== 'main') return;
      if (isHome()) Array.prototype.forEach.call(el('home').querySelectorAll('.tv-shelf-row'), imageWindow);
      else imageWindow(el('grid'));
    });
  }
  function createCard(item, continuing, domain) {
    // Chromium 69 inserts an anonymous inner box in native buttons. Percentage
    // widths then shrink to the title width, leaving a blank strip beside art.
    var card = child('div', continuing ? 'tv-continue-card' : 'tv-card');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.onclick = function () { openDetail(item.slug, continuing); };
    card.setAttribute('data-slug', item.slug);
    var wrap = child('span', continuing ? 'tv-continue-thumb-wrap' : 'tv-card-poster-wrap');
    var image = global.KhoPosters.create(C.image(continuing ? (item.banner || item.thumb_url || item.poster_url || item.poster) : (item.poster_url || item.posterUrl || item.thumb_url), domain), continuing);
    wrap.appendChild(image);
    if (continuing) {
      var track = child('span', 'tv-continue-progress');
      var fill = child('span', 'tv-continue-progress-bar');
      fill.style.width = (item.durationMs > 0 ? Math.min(100, item.positionMs / item.durationMs * 100) : 0) + '%';
      fill.style.display = 'block'; track.appendChild(fill); wrap.appendChild(track);
    } else {
      wrap.appendChild(child('span', 'tv-badge-left', item.quality || item.year || 'HD'));
      if (item.episode_current) wrap.appendChild(child('span', 'tv-badge-right', item.episode_current));
      var rating = global.KhoRatings.fromMovie(item);
      if (rating) wrap.appendChild(child('span', 'movie-rating', global.KhoRatings.label(rating)));
    }
    var info = child('span', continuing ? 'tv-continue-info' : 'tv-card-info');
    info.appendChild(child('span', continuing ? 'tv-continue-title' : 'tv-card-title', item.name || item.title || item.origin_name || item.slug));
    if (continuing) info.appendChild(child('span', 'tv-continue-sub', 'Xem tiếp · ' + (item.episodeName || 'Tập 1')));
    else {
      var meta = child('span', 'tv-card-meta');
      meta.appendChild(child('span', 'tv-card-match', item.lang || 'Vietsub'));
      meta.appendChild(child('span', 'tv-card-hd', item.quality || 'HD')); info.appendChild(meta);
    }
    card.appendChild(wrap); card.appendChild(info);
    return card;
  }
  var home = new global.KhoHome({
    card: createCard, images: imageWindow, open: openDetail, focus: focus,
    changed: function () {
      if (!isHome()) return;
      updateMainRows(gridCards);
      if (homeInitialFocus && home && home.hero && scene === 'main') { homeInitialFocus = false; focus(el('hero-play')); }
    }
  });
  function renderList(result, moveFocus) {
    busy = false; listItems = result.items; totalPages = result.totalPages;
    el('grid').textContent = '';
    var cards = [];
    var fragment = document.createDocumentFragment();
    listItems.forEach(function (item) {
      var card = createCard(item, categories[selected][1] === 'history', result.imageDomain);
      cards.push(card); fragment.appendChild(card);
    });
    el('grid').appendChild(fragment); imageWindow(el('grid'));
    el('previous').disabled = page <= 1; el('next').disabled = page >= totalPages;
    text('page-label', 'Trang ' + page + ' / ' + totalPages);
    text('status', listItems.length ? '' : 'Chưa có phim. Bạn có thể đổi danh mục hoặc từ khóa.');
    updateMainRows(cards);
    if (moveFocus && scene === 'main') focus(cards[0] || el('retry'));
  }
  function loadList(force, moveFocus) {
    request.cancel();
    var path = categories[selected][1];
    if (path === 'settings') return;
    if (path === 'home') { home.activate(); return; }
    if (path === 'history') {
      var entries = C.history();
      renderList({ items: entries.slice((page - 1) * C.PAGE_SIZE, page * C.PAGE_SIZE), totalPages: Math.max(1, Math.ceil(entries.length / C.PAGE_SIZE)), imageDomain: 'https://phimimg.com' }, moveFocus); return;
    }
    if (path === 'search' && !query) { renderList({ items: [], totalPages: 1 }, false); text('status', 'Nhập từ khóa tìm kiếm trên remote để khám phá kho phim.'); return; }
    var key = path + '|' + query + '|' + page;
    var saved = force ? null : cache.get(key);
    if (saved) { renderList(saved, moveFocus); return; }
    busy = true; el('grid').textContent = '';
    text('status', 'Đang tải danh sách...'); el('previous').disabled = el('next').disabled = true;
    updateMainRows([]); if (moveFocus) focus(el('retry'));
    var suffix = path === 'search' ? 'tim-kiem?keyword=' + encodeURIComponent(query) + '&' : path + '?';
    var sourcePage = Math.floor((page - 1) * C.PAGE_SIZE / (sourceSizes[path] || C.PAGE_SIZE)) + 1;
    request.get(['https://phimapi.com/v1/api/' + suffix + 'page=' + sourcePage + '&limit=' + C.PAGE_SIZE], function (error, data) {
      busy = false;
      if (error) { text('status', error.message); text('page-label', 'Không có kết nối'); el('previous').disabled = page <= 1; updateMainRows([]); return; }
      var result = C.list(data, page); sourceSizes[path] = result.sourceSize;
      cache.set(key, result); renderList(result, moveFocus);
    }, function (json) { return Array.isArray((json.data || json).items); });
  }
  function switchCategory(index, initial) {
    if (scene !== 'main') return;
    if (!initial) homeInitialFocus = false;
    request.cancel(); home.pause(true);
    selected = index; page = 1; totalPages = 1; lastMainFocus = null; query = ''; gridCards = [];
    var path = categories[index][1];
    menu.forEach(function (node, menuIndex) { node.classList.toggle('active', index === menuIndex); });
    el('home').classList.toggle('active', path === 'home');
    el('browse').classList.toggle('active', path !== 'home');
    main.scrollTop = 0;
    text('heading', path === 'search' ? 'Tìm Kiếm Phim' : path === 'history' ? 'Lịch Sử Đã Xem' : path === 'settings' ? 'Cài Đặt Ứng Dụng' : categories[index][0]);
    text('page-label', ''); text('status', '');
    visible(el('search-bar'), path === 'search'); visible(el('settings'), path === 'settings');
    visible(el('grid'), path !== 'settings'); visible(el('pager'), path !== 'settings'); visible(el('history-clear'), path === 'history');
    el('grid').className = path === 'history' ? 'tv-movie-grid history-grid' : 'tv-movie-grid';
    el('grid').textContent = ''; global.KhoPosters.prune(); el('search-input').value = '';
    focus(menu[index]);
    if (path === 'settings') {
      text('platform-info', 'Nền tảng: ' + navigator.userAgent);
      text('player-info', player.av ? 'Trình phát Samsung AVPlay sẵn sàng.' : 'Trình phát Web: HLS.js trên PC, HLS gốc trên TV/Safari.');
      text('diagnostic', global.KhoBoot.error ? 'Lỗi gần nhất: ' + global.KhoBoot.error : '');
      updateMainRows([]);
    } else loadList(false, false);
  }
  function doSearch() {
    query = el('search-input').value.replace(/^\s+|\s+$/g, '').slice(0, 80); page = 1;
    el('search-input').blur(); focus(el('search-button')); loadList(false, false);
  }
  function pageChange(delta) {
    if (busy) return;
    var target = page + delta; if (target < 1 || target > totalPages) return;
    page = target; loadList(false, true);
  }

  function episodes() { return servers[serverIndex] ? servers[serverIndex].server_data : []; }
  function updateDetailRows() {
    var actions = [el('play'), el('detail-back')].filter(function (node) { return !node.disabled; });
    detailRows = [actions];
    var sourceButtons = Array.prototype.slice.call(el('servers').children);
    if (sourceButtons.length) detailRows.push(sourceButtons);
    var episodeButtons = Array.prototype.slice.call(el('episodes').children);
    for (var i = 0; i < episodeButtons.length; i += 6) detailRows.push(episodeButtons.slice(i, i + 6));
    var paging = [el('episode-previous'), el('episode-next')].filter(function (node) { return !node.disabled; });
    if (paging.length) detailRows.push(paging);
  }
  function renderEpisodes() {
    var items = episodes();
    el('episodes').textContent = '';
    episodePage = Math.min(episodePage, Math.max(0, Math.ceil(items.length / C.EPISODE_PAGE_SIZE) - 1));
    var start = episodePage * C.EPISODE_PAGE_SIZE;
    items.slice(start, start + C.EPISODE_PAGE_SIZE).forEach(function (episode, offset) {
      var node = button(episode.name || 'Tập ' + (start + offset + 1), function () { startPlayback(start + offset, 0); }, 'tv-ep-btn');
      el('episodes').appendChild(node);
    });
    el('episode-previous').disabled = episodePage === 0;
    el('episode-next').disabled = start + C.EPISODE_PAGE_SIZE >= items.length;
    text('episode-heading', 'Chọn tập · ' + (items.length ? (start + 1) + '–' + Math.min(start + C.EPISODE_PAGE_SIZE, items.length) + ' / ' + items.length : 'Chưa có tập'));
    text('detail-status', 'Chọn tập hoặc đổi nguồn phát nếu video không hoạt động.');
    el('play').disabled = !items.length;
    updateDetailRows();
  }
  function selectServer(index) {
    serverIndex = index;
    episodePage = 0;
    Array.prototype.forEach.call(el('servers').children, function (node, i) { node.classList.toggle('active', i === index); });
    renderEpisodes();
    focus(el('servers').children[index]);
  }
  function displayDetail(data) {
    movie = data.movie;
    el('detail-backdrop').src = C.image(movie.thumb_url || movie.poster_url);
    text('detail-rating', global.KhoRatings.detail(global.KhoRatings.fromMovie(movie)));
    text('detail-year', movie.year || '');
    text('detail-quality', movie.quality || 'HD');
    servers = (Array.isArray(data.episodes) ? data.episodes : []).filter(function (server) { return server && Array.isArray(server.server_data) && server.server_data.length; });
    serverIndex = 0;
    episodePage = 0;
    historyEntry = C.findHistory(movie.slug);
    if (historyEntry) {
      for (var i = 0; i < servers.length; i++) {
        if (servers[i].server_name === historyEntry.serverName) { serverIndex = i; break; }
      }
    }
    text('detail-title', movie.name || movie.origin_name || movie.slug);
    var names = Array.isArray(movie.category) ? movie.category.map(function (category) { return category.name; }).join(', ') : '';
    text('detail-meta', [movie.lang, names].filter(Boolean).join(' · '));
    /* Read text only. API HTML is never inserted into the application's DOM. */
    text('overview', String(movie.content || 'Nội dung đang cập nhật.').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 650));
    text('play', historyEntry && historyEntry.positionMs > 0 ? 'Xem tiếp · ' + historyEntry.episodeName : 'Xem phim');
    el('play').onclick = resumePlayback;
    el('servers').textContent = '';
    servers.forEach(function (server, index) {
      var node = button(server.server_name || 'Nguồn ' + (index + 1), function () { selectServer(index); }, 'tv-server-pill');
      node.classList.toggle('active', index === serverIndex);
      el('servers').appendChild(node);
    });
    renderEpisodes();
    focus(el('play').disabled ? el('detail-back') : el('play'));
    if (detailAutoPlay) { detailAutoPlay = false; resumePlayback(); }
  }
  function openDetail(slug, autoPlay) {
    if (!slug) return;
    detailAutoPlay = !!autoPlay;
    home.pause();
    if (scene === 'main') lastMainFocus = currentFocus;
    scene = 'detail';
    visible(el('detail'), true);
    el('detail').scrollTop = 0;
    el('detail-backdrop').removeAttribute('src');
    text('detail-year', ''); text('detail-quality', '');
    movie = null;
    servers = [];
    text('detail-title', 'Đang tải thông tin phim...');
    text('detail-meta', '');
    text('overview', '');
    text('detail-status', 'Bạn có thể nhấn Return để quay lại ngay.');
    el('servers').textContent = '';
    el('episodes').textContent = '';
    el('play').disabled = true;
    el('episode-previous').disabled = true;
    el('episode-next').disabled = true;
    updateDetailRows();
    focus(el('detail-back'));
    var saved = detailCache.get(slug);
    if (saved) { displayDetail(saved); return; }
    var encoded = encodeURIComponent(slug);
    detailRequest.get(['https://phimapi.com/phim/' + encoded], function (error, data) {
      if (error || !data.movie) {
        text('detail-title', 'Chưa tải được thông tin phim');
        text('detail-status', error ? error.message : 'Nguồn dữ liệu không trả về thông tin phim.');
        el('play').disabled = false;
        text('play', 'Thử lại');
        el('play').onclick = function () { openDetail(slug); };
        updateDetailRows();
        return;
      }
      detailCache.set(slug, data);
      displayDetail(data);
    }, function (json) { return !!json.movie; });
  }
  function closeDetail() {
    detailRequest.cancel();
    scene = 'main';
    visible(el('detail'), false);
    el('detail-backdrop').removeAttribute('src');
    if (isHome()) home.activate();
    movie = null;
    servers = [];
    var restored = lastMainFocus && document.body.contains(lastMainFocus) ? lastMainFocus : null;
    if (!restored && isHome() && lastMainFocus && lastMainFocus.hasAttribute('data-slug')) {
      var slug = lastMainFocus.getAttribute('data-slug');
      Array.prototype.some.call(el('home').querySelectorAll('[data-slug]'), function (node) {
        if (node.getAttribute('data-slug') !== slug) return false;
        restored = node; return true;
      });
    }
    focus(restored || menu[selected]);
  }
  function resumePlayback() {
    var items = episodes();
    var index = 0;
    var resume = 0;
    historyEntry = movie ? C.findHistory(movie.slug) : null;
    if (historyEntry && servers[serverIndex] && historyEntry.serverName === servers[serverIndex].server_name) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].slug === historyEntry.episodeSlug || (!items[i].slug && items[i].name === historyEntry.episodeName)) {
          index = i;
          resume = historyEntry.positionMs;
          break;
        }
      }
    }
    startPlayback(index, resume);
  }
  function saveProgress(completed) {
    if (!movie || !activeEpisode || (player.position < 1000 && !completed)) return;
    C.save({
      slug: movie.slug, name: movie.name || movie.origin_name,
      poster_url: C.image(movie.poster_url || movie.thumb_url), banner: C.image(movie.thumb_url || movie.poster_url),
      episodeSlug: activeEpisode.slug || '', episodeName: activeEpisode.name || '',
      serverName: servers[serverIndex] ? servers[serverIndex].server_name : '',
      positionMs: completed ? 0 : Math.floor(player.position), durationMs: player.duration,
      updatedAt: Date.now()
    });
    lastSave = Date.now();
    lastHistoryPosition = player.position;
  }
  function showHud(permanent) {
    hudVisible = true;
    visible(el('hud'), true);
    clearTimeout(hudTimer);
    if (!permanent && player.state !== 'paused') hudTimer = setTimeout(function () {
      if (scene !== 'player' || player.state !== 'playing') return;
      hudVisible = false;
      visible(el('hud'), false);
      if (currentFocus) { currentFocus.classList.remove('tv-focused'); currentFocus.blur(); }
    }, 5000);
  }
  function startPlayback(index, resume) {
    var episode = episodes()[index];
    if (!episode || !movie) return;
    var url = C.stream(episode);
    if (!url) { toast('Tập này chưa có luồng phát trực tiếp. Hãy chọn nguồn khác.'); return; }
    if (scene === 'player') saveProgress(false);
    activeEpisodeIndex = index;
    activeEpisode = episode;
    scene = 'player';
    lastSave = Date.now();
    lastHistoryPosition = 0;
    text('now-playing', (movie.name || movie.origin_name) + ' · ' + (episode.name || 'Tập phim'));
    text('clock', '00:00 / 00:00');
    el('progress-fill').style.width = '0%';
    text('subtitle', '');
    el('next-episode').disabled = index + 1 >= episodes().length;
    document.body.classList.add('playing');
    document.documentElement.classList.add('playing');
    home.releaseImages();
    el('detail-backdrop').removeAttribute('src');
    visible(el('app'), false);
    visible(el('detail'), false);
    visible(el('player'), true);
    showHud(false);
    focus(el('pause'));
    player.open(url, resume || 0);
  }
  function stopPlayback() {
    saveProgress(false);
    player.stop();
    clearTimeout(hudTimer);
    clearTimeout(subtitleTimer);
    text('subtitle', '');
    text('player-message', '');
    visible(el('player'), false);
    visible(el('app'), true);
    visible(el('detail'), true);
    if (movie) el('detail-backdrop').src = C.image(movie.thumb_url || movie.poster_url);
    document.body.classList.remove('playing');
    document.documentElement.classList.remove('playing');
    scene = 'detail';
    historyEntry = movie ? C.findHistory(movie.slug) : null;
    text('play', historyEntry && historyEntry.positionMs > 0 ? 'Xem tiếp · ' + historyEntry.episodeName : 'Xem phim');
    focus(el('play'));
  }
  function nextEpisode() {
    if (activeEpisodeIndex + 1 < episodes().length) startPlayback(activeEpisodeIndex + 1, 0);
    else toast('Đã đến tập cuối của nguồn này.');
  }
  var player = new global.KhoPlayer({
    message: function (message) { text('player-message', message); },
    error: function (message) { text('player-message', message); showHud(true); focus(el('player-back')); },
    state: function (state) {
      text('pause', state === 'paused' ? 'Tiếp tục' : 'Tạm dừng');
      showHud(state === 'paused');
      if (state === 'paused') saveProgress(false);
    },
    time: function (position, duration) {
      if (scene !== 'player') return;
      if (hudVisible) {
        text('clock', C.time(position) + ' / ' + C.time(duration));
        el('progress-fill').style.width = (duration > 0 ? Math.min(100, position / duration * 100) : 0) + '%';
      }
      if (Date.now() - lastSave >= 15000 && Math.abs(position - lastHistoryPosition) > 1000) saveProgress(false);
    },
    subtitle: function (value, duration) {
      clearTimeout(subtitleTimer);
      text('subtitle', value.replace(/<[^>]*>/g, ''));
      subtitleTimer = setTimeout(function () { text('subtitle', ''); }, Math.min(30000, duration || 4000));
    },
    ended: function () {
      saveProgress(true);
      /* Close first so a completed item is not saved again as unfinished. */
      player.position = 0;
      if (activeEpisodeIndex + 1 < episodes().length) nextEpisode();
      else { stopPlayback(); toast('Bạn đã xem hết nguồn này.'); }
    }
  });
  function back() {
    if (scene === 'player') { stopPlayback(); return; }
    if (scene === 'detail') { closeDetail(); return; }
    if (currentFocus === el('search-input')) { el('search-input').blur(); focus(el('search-button')); return; }
    if (menu.indexOf(currentFocus) === -1) { lastMainFocus = currentFocus; focus(menu[selected]); return; }
    if (Date.now() - exitTime < 2000) {
      try { if (global.tizen) global.tizen.application.getCurrentApplication().exit(); } catch (ignore) {}
      return;
    }
    exitTime = Date.now();
    toast('Nhấn Return lần nữa trong 2 giây để thoát ứng dụng.');
  }
  function keydown(event) {
    homeInitialFocus = false;
    var code = event.keyCode || event.which;
    if ((code >= 37 && code <= 40) || code === 13 || code === 10009 || code === 27 || code === 461) global.KhoPosters.deferForInput();
    if (code === 10009 || code === 27 || code === 461) { event.preventDefault(); back(); return; }
    /* Let the TV IME edit text; Enter submits, Down returns to app navigation. */
    if (event.target === el('search-input') && code !== 13 && code !== 40) return;
    if (code === 32 && currentFocus && currentFocus.getAttribute('role') === 'button') {
      event.preventDefault();
      if (!event.repeat) currentFocus.click();
      return;
    }
    if (code === 13) {
      event.preventDefault();
      if (event.repeat) return;
      if (scene === 'player' && !hudVisible) { player.setPaused(player.state === 'playing'); showHud(player.state === 'paused'); focus(el('pause')); return; }
      if (currentFocus === el('search-input')) doSearch();
      else if (currentFocus && !currentFocus.disabled) currentFocus.click();
      return;
    }
    if (scene === 'player') {
      if (code === 415 || code === 19 || code === 10252) {
        event.preventDefault();
        player.setPaused(code === 19 || (code === 10252 && player.state === 'playing'));
        return;
      }
      if (code === 413) { event.preventDefault(); stopPlayback(); return; }
      if (code === 412 || code === 417) { event.preventDefault(); player.seek(code === 412 ? -10000 : 10000); return; }
    }
    if (code < 37 || code > 40) return;
    event.preventDefault();
    if (Date.now() - lastNav < 85) return;
    lastNav = Date.now();
    if (scene === 'player') {
      if (!hudVisible && (code === 37 || code === 39)) { player.seek(code === 37 ? -10000 : 10000); return; }
      if (!hudVisible) { showHud(false); focus(el('pause')); return; }
      showHud(player.state === 'paused' || player.state === 'error');
      navigateRows([playerControls.filter(function (node) { return !node.disabled; })], code, false);
    } else if (scene === 'detail') navigateRows(detailRows, code, false);
    else if (menu.indexOf(currentFocus) !== -1) {
      var index = menu.indexOf(currentFocus);
      if (code === 38 && index > 0) focus(menu[index - 1]);
      if (code === 40 && index + 1 < menu.length) focus(menu[index + 1]);
      if (code === 39 && mainRows.length) focus(lastMainFocus && document.body.contains(lastMainFocus) && !lastMainFocus.disabled ? lastMainFocus : mainRows[0][0]);
    } else navigateRows(mainRows, code, true);
  }
  menu.forEach(function (node, index) { node.onclick = function () { switchCategory(index); }; });
  el('search-button').onclick = doSearch;
  el('previous').onclick = function () { pageChange(-1); };
  el('next').onclick = function () { pageChange(1); };
  el('retry').onclick = function () { loadList(true, false); };
  el('detail-back').onclick = closeDetail;
  el('episode-previous').onclick = function () { episodePage--; renderEpisodes(); focus(el('episodes').firstChild); };
  el('episode-next').onclick = function () { episodePage++; renderEpisodes(); focus(el('episodes').firstChild); };
  el('player-back').onclick = stopPlayback;
  el('pause').onclick = function () { player.setPaused(player.state === 'playing'); };
  el('rewind').onclick = function () { player.seek(-10000); showHud(false); };
  el('forward').onclick = function () { player.seek(10000); showHud(false); };
  el('next-episode').onclick = nextEpisode;
  global.KhoSync.onBeforeAccountChange(function () { if (scene === 'player') stopPlayback(); if (scene === 'detail') closeDetail(); });
  global.KhoSync.onHistoryChange(function () {
    if (scene !== 'main') return;
    if (categories[selected][1] === 'history') loadList(true, false);
    else if (categories[selected][1] === 'settings') updateMainRows(gridCards);
    else if (isHome()) home.activate();
  });

  el('clear-history').onclick = function () {
    global.KhoSync.clear();
    try { global.localStorage.removeItem(C.HISTORY_KEY); toast('Đã xóa lịch sử của ứng dụng này.'); } catch (ignore) { toast('TV không cho phép xóa lịch sử lúc này.'); }
  };
  el('clear-cache').onclick = function () { cache.clear(); detailCache.clear(); home.clear(); global.KhoPosters.clear(); toast('Đã xóa bộ nhớ tạm danh sách và poster.'); };
  el('history-clear').onclick = function () { el('clear-history').click(); page = 1; loadList(false, false); focus(el('history-clear')); };
  document.addEventListener('focusin', function (event) {
    if (event.target.tagName === 'BUTTON' || event.target.getAttribute('role') === 'button' || event.target === el('search-input')) {
      if (currentFocus && currentFocus !== event.target) currentFocus.classList.remove('tv-focused');
      currentFocus = event.target;
      currentFocus.classList.add('tv-focused');
    }
  });
  document.addEventListener('keydown', keydown);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && scene === 'player') stopPlayback();
  });
  global.addEventListener('pagehide', function () { saveProgress(false); player.stop(); request.cancel(); detailRequest.cancel(); home.pause(); });
  global.addEventListener('online', function () { toast('Đã có mạng. Chọn Tải lại để cập nhật danh sách.'); });
  global.addEventListener('offline', function () { toast('Mất kết nối mạng. Giao diện và lịch sử vẫn dùng được.'); });
  try {
    if (global.tizen && global.tizen.tvinputdevice) {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'].forEach(function (name) {
        try { global.tizen.tvinputdevice.registerKey(name); } catch (ignoreKey) {}
      });
    }
  } catch (ignoreInput) {}
  switchCategory(1, true);
  global.KhoBoot.ready = true;
  text('footer', 'Kho Phim ' + C.VERSION + ' · TV Edition · ' + (player.av ? 'Samsung AVPlay' : 'Trình phát Web'));
}(window));
