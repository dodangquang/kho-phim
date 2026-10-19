/**
 * KHO PHIM DESKTOP - PC & LAPTOP EDITION JAVASCRIPT
 * Designed specifically for PC and Laptop browsers (Chrome, Edge, Firefox, Safari)
 * Pure Netflix Dark UI + Full Mouse Control + Native Spacebar & Backspace Typing
 */

(function () {
  'use strict';

  // ==========================================================================
  // CONFIG & STATE
  // ==========================================================================
  const API_BASE = 'https://khophimqd.vercel.app/source';
  function isCurrentMovie(slug) { return typeof slug === 'string' && /^tp--[a-zA-Z0-9_-]{1,176}$/.test(slug); }

  const CATEGORY_TABS = {
    single: { title: '🎬 Phim Lẻ', path: 'danh-sach/phim-le' },
    series: { title: '📺 Phim Bộ', path: 'danh-sach/phim-bo' },
    dubbed: { title: '🗣️ Phim Lồng Tiếng', path: 'danh-sach/phim-long-tieng' },
    narrated: { title: '🎙️ Phim Thuyết Minh', path: 'danh-sach/phim-thuyet-minh' },
    theater: { title: '🍿 Phim Chiếu Rạp', path: 'danh-sach/phim-chieu-rap' }
  };

  const VN_FLAG_SVG = '<svg viewBox="0 0 30 20" width="20" height="13" style="display:inline-block; vertical-align:middle; border-radius:2px; margin-right:6px; box-shadow:0 1px 3px rgba(0,0,0,0.5);"><rect width="30" height="20" fill="#da251d"/><polygon points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15" fill="#ffff00"/></svg>';

  const HOME_SECTIONS = [
    { title: '⚡ Phim Mới Cập Nhật', path: 'danh-sach/phim-moi-cap-nhat' },
    { title: `${VN_FLAG_SVG} Phim Việt Nam`, path: 'quoc-gia/viet-nam' },
    { title: '🍿 Chiếu Rạp Đặc Sắc', path: 'danh-sach/phim-chieu-rap' },
    { title: '📺 Phim Bộ Hot', path: 'danh-sach/phim-bo' },
    { title: '🗣️ Phim Lồng Tiếng', path: 'danh-sach/phim-long-tieng' },
    { title: '🎙️ Phim Thuyết Minh', path: 'danh-sach/phim-thuyet-minh' },
    { title: '⚔️ Phim Hành Động', path: 'the-loai/hanh-dong' },
    { title: '💥 Anime / Hoạt Hình', path: 'the-loai/hoat-hinh' },
    { title: '👻 Phim Kinh Dị', path: 'the-loai/kinh-di' },
    { title: '🚀 Viễn Tưởng', path: 'the-loai/vien-tuong' },
    { title: '🌸 Tình Cảm', path: 'the-loai/tinh-cam' }
  ];

  let currentTab = 'home';
  let heroMovieData = null;
  let categoryPage = 1;
  let categoryLoading = false;
  let searchTimeout = null;

  // Detail & Player State
  let currentMovieDetail = null;
  let currentEpisodeList = [];
  let currentEpisode = null;
  let currentServerIndex = 0;
  let detailGeneration = 0;
  let detailAutoplayTimer = null;
  let directSnapshot = null;
  let lastProgressSave = 0;
  let playbackMovie = null;
  let currentPlayerMode = 'hls'; // 'hls' or 'embed'
  let hudTimer = null;

  // DOM Elements
  const tvApp = document.getElementById('tv-app');
  const tvSidebar = document.getElementById('tv-sidebar');
  const tvMainContent = document.getElementById('tv-main-content');
  const heroBanner = document.getElementById('tv-hero-banner');
  const continueSection = document.getElementById('tv-continue-section');
  const continueRow = document.getElementById('tv-continue-row');
  const shelvesContainer = document.getElementById('tv-shelves-container');
  const detailModal = document.getElementById('tv-detail-modal');
  const playerOverlay = document.getElementById('tv-player-overlay');
  const videoPlayer = document.getElementById('tv-video-player');
  const iframePlayer = document.getElementById('tv-iframe-player');
  const playerHud = document.getElementById('tv-player-hud');
  const tvToast = document.getElementById('tv-toast');
  const playback = new window.KhoVideoPlayer(videoPlayer, {
    onBeforeError: () => { captureDirectState(); persistPlaybackProgress(); },
    onError: () => {
      if (!currentEpisode || !playerOverlay.classList.contains('open')) return;
      const embed = sanitizeUrl(currentEpisode.linkEmbed);
      if (embed) startEmbedPlayback(embed, true);
      else showPlaybackError('Không thể tải luồng phim. Hãy thử lại hoặc chọn server khác.');
    },
    onTapRequired: () => { updatePlayPauseUI(false); showPlayerHud(0); showToast('Nhấn Phát để tiếp tục'); }
  });

  // ==========================================================================
  // HELPERS & IMAGE URL RESOLVER (WITH RELIABLE CDN FALLBACK E.G. PHÙ SA)
  // ==========================================================================
  function isBlockedDomain(url) {
    if (!url) return true;
    const lower = String(url).toLowerCase();
    return lower.includes('danviet') || lower.includes('kenh14') || lower.includes('soha.vn') || lower.includes('zingnews') || lower.includes('i.ex-cdn.com');
  }

  function formatImageUrl(url) {
    if (!url) return 'icon.png';
    const trimmed = String(url).trim();
    if (!trimmed) return 'icon.png';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    return 'https://cdn.phimsrv.com/' + trimmed.replace(/^\/+/, '');
  }

  function isSourceImage(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'cdn.phimsrv.com' && !url.username && !url.password; } catch (_) { return false; } }

  function resolveMovieImages(item) {
    if (!item) return { poster: 'icon.png', banner: 'icon.png', fallback: 'icon.png' };
    const rawPoster = String(item.poster_url || item.posterUrl || '').trim();
    const rawThumb = String(item.thumb_url || item.thumbUrl || '').trim();

    const formattedPoster = formatImageUrl(rawPoster);
    const formattedThumb = formatImageUrl(rawThumb);

    const posterBlocked = isBlockedDomain(formattedPoster);
    const thumbBlocked = isBlockedDomain(formattedThumb);
    const posterIsCdn = isSourceImage(formattedPoster) && !posterBlocked;
    const thumbIsCdn = isSourceImage(formattedThumb) && !thumbBlocked;

    let poster = 'icon.png';
    let banner = 'icon.png';

    // If poster is blocked/unreliable (e.g. danviet.vn on "Phù Sa") but thumb is on reliable CDN
    if (thumbIsCdn && (!posterIsCdn || posterBlocked)) {
      poster = formattedThumb;
      banner = formattedThumb;
    } else if (posterIsCdn) {
      poster = formattedPoster;
      banner = thumbIsCdn ? formattedThumb : formattedPoster;
    } else if (formattedThumb && !thumbBlocked) {
      poster = formattedThumb;
      banner = formattedThumb;
    } else if (formattedPoster && !posterBlocked) {
      poster = formattedPoster;
      banner = formattedPoster;
    } else {
      poster = formattedThumb || formattedPoster || 'icon.png';
      banner = formattedThumb || formattedPoster || 'icon.png';
    }

    const fallback = (formattedThumb && formattedThumb !== poster && !thumbBlocked) ? formattedThumb : 'icon.png';
    return { poster, banner, fallback };
  }

  function sanitizeUrl(url) {
    if (!url) return '';
    let clean = String(url).trim();
    if (clean.startsWith('//')) clean = 'https:' + clean;
    if (clean.startsWith('http://')) clean = 'https://' + clean.slice(7);
    return clean;
  }

  function extractM3u8FromEmbed(embedUrl) {
    if (!embedUrl) return '';
    if (embedUrl.includes('url=')) {
      try {
        const raw = embedUrl.split('url=')[1].split('&')[0];
        const dec = decodeURIComponent(raw);
        if (dec.includes('.m3u8') || dec.startsWith('http')) {
          return sanitizeUrl(dec);
        }
      } catch (_) {}
    }
    return '';
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${remS < 10 ? '0' : ''}${remS}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${remS < 10 ? '0' : ''}${remS}`;
  }

  function showToast(msg, duration = 2200) {
    if (!tvToast) return;
    tvToast.textContent = msg;
    tvToast.style.display = 'block';
    clearTimeout(tvToast._timer);
    tvToast._timer = setTimeout(() => {
      tvToast.style.display = 'none';
    }, duration);
  }

  // ==========================================================================
  // DRAG-TO-SCROLL ENGINE FOR HORIZONTAL ROWS (Mouse drag without wheel conflict)
  // ==========================================================================
  let activeDragEl = null;
  let dragStartX = 0;
  let dragScrollStart = 0;
  let isActivelyDragging = false;
  let totalDragDistance = 0;

  function enableDragScroll(element) {
    if (!element) return;

    element.addEventListener('dragstart', (e) => e.preventDefault());

    element.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only primary (left) click
      activeDragEl = element;
      dragStartX = e.pageX;
      dragScrollStart = element.scrollLeft;
      isActivelyDragging = false;
      totalDragDistance = 0;
    });

    // Capture phase: Suppress click if mouse moved more than 6px
    element.addEventListener('click', (e) => {
      if (isActivelyDragging || totalDragDistance > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  // Global window listeners for drag movement & release
  window.addEventListener('mousemove', (e) => {
    if (!activeDragEl) return;
    const dx = e.pageX - dragStartX;
    totalDragDistance = Math.abs(dx);
    if (totalDragDistance > 6) {
      if (!isActivelyDragging) {
        isActivelyDragging = true;
        activeDragEl.classList.add('is-dragging');
      }
      activeDragEl.scrollLeft = dragScrollStart - dx;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!activeDragEl) return;
    const el = activeDragEl;
    el.classList.remove('is-dragging');
    activeDragEl = null;
    setTimeout(() => {
      isActivelyDragging = false;
      totalDragDistance = 0;
    }, 80);
  });

  // ==========================================================================
  // WATCH HISTORY
  // ==========================================================================
  const HISTORY_KEY = 'khophim_desktop_watch_history';

  function getWatchHistory() { return KhoSync.history().map(KhoSyncView.desktop); }

  function saveWatchProgress(item) {
    KhoSync.save(item);
    try {
      let list = getWatchHistory().filter(x => x.slug !== item.slug);
      list.unshift(item);
      if (list.length > 50) list = list.slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function clearAllHistory() {
    KhoSync.clear();
    try {
      localStorage.removeItem(HISTORY_KEY);
      showToast('Đã xóa toàn bộ lịch sử xem');
      renderHistoryView();
      renderContinueWatchingRow();
    } catch (_) {}
  }

  // ==========================================================================
  // DATA FETCHING (TỦ PHIM)
  // ==========================================================================
  async function fetchCategoryMovies(categoryPath, page = 1) {
    const clean = categoryPath.replace(/^\/+|\/+$/g, '');
    let apiUrl = '';
    if (clean === 'danh-sach/phim-moi-cap-nhat' || clean === 'phim-moi') {
      apiUrl = `${API_BASE}/danh-sach/phim-moi-cap-nhat?page=${page}`;
    } else {
      apiUrl = `${API_BASE}/v1/api/${clean}?page=${page}&limit=24`;
    }

    try {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let items = [];
      if (data && data.data && Array.isArray(data.data.items)) {
        items = data.data.items;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
      }
      return items.filter(item => isCurrentMovie(item.slug));
    } catch (e) {
      console.warn('API error for', categoryPath, e);
      return [];
    }
  }

  async function fetchMovieDetail(slug, audioPreference = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const audio = ['lt', 'tm'].includes(audioPreference) ? '?audio=' + audioPreference : '';
      const res = await fetch(API_BASE + '/phim/' + encodeURIComponent(slug) + audio, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.movie && isCurrentMovie(json.movie.slug) ? json : null;
    } catch (_) { return null; }
    finally { clearTimeout(timeout); }
  }

  async function searchMovies(keyword) {
    if (!keyword.trim()) return [];
    const encoded = encodeURIComponent(keyword.trim());
    const apiUrl = `${API_BASE}/v1/api/tim-kiem?keyword=${encoded}&limit=40`;
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.data && Array.isArray(data.data.items)) {
          return data.data.items.filter(item => isCurrentMovie(item.slug));
        }
      }
    } catch (_) {}
    return [];
  }

  // ==========================================================================
  // VIEW RENDERING: HOME
  // ==========================================================================
  async function initHomeScreen() {
    renderContinueWatchingRow();

    // 1. Fetch first category for hero billboard
    let heroList = await fetchCategoryMovies(HOME_SECTIONS[0].path, 1);
    if (heroList.length > 0) {
      heroMovieData = heroList[0];
      renderBillboard(heroMovieData);
    }

    // 2. Fetch and render shelves sequentially
    shelvesContainer.innerHTML = '';
    for (let i = 0; i < HOME_SECTIONS.length; i++) {
      const sec = HOME_SECTIONS[i];
      sec._page = 1;

      const sectionEl = document.createElement('div');
      sectionEl.className = 'tv-shelf-section';
      sectionEl.id = `shelf-${i}`;

      const titleEl = document.createElement('h2');
      titleEl.className = 'shelf-title';
      titleEl.innerHTML = `<span>${sec.title}</span><span class="shelf-more-badge">›</span>`;
      sectionEl.appendChild(titleEl);

      const rowWrap = document.createElement('div');
      rowWrap.className = 'shelf-row-wrap';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'shelf-arrow-btn shelf-arrow-left';
      prevBtn.innerHTML = '‹';
      prevBtn.title = 'Cuộn sang trái';

      const nextBtn = document.createElement('button');
      nextBtn.className = 'shelf-arrow-btn shelf-arrow-right';
      nextBtn.innerHTML = '›';
      nextBtn.title = 'Cuộn sang phải';

      const rowEl = document.createElement('div');
      rowEl.className = 'tv-shelf-row';
      enableDragScroll(rowEl);

      prevBtn.onclick = () => rowEl.scrollBy({ left: -Math.max(350, rowEl.clientWidth * 0.75), behavior: 'smooth' });
      nextBtn.onclick = () => rowEl.scrollBy({ left: Math.max(350, rowEl.clientWidth * 0.75), behavior: 'smooth' });

      rowWrap.appendChild(prevBtn);
      rowWrap.appendChild(rowEl);
      rowWrap.appendChild(nextBtn);
      sectionEl.appendChild(rowWrap);
      shelvesContainer.appendChild(sectionEl);

      // Async fetch movies for this shelf
      fetchCategoryMovies(sec.path, 1).then(movies => {
        if (movies.length === 0) {
          sectionEl.style.display = 'none';
          return;
        }
        renderMovieCardsIntoRow(movies, rowEl, sec);
      });
    }
  }

  function renderBillboard(movie) {
    if (!movie) return;
    const { banner } = resolveMovieImages(movie);
    const title = movie.name || movie.origin_name || 'Kho Phim';
    const quality = movie.quality || 'Full HD';
    const year = movie.year || '2026';
    const epBadge = movie.episode_current || 'Đang chiếu';

    heroBanner.style.backgroundImage = `url('${banner}')`;
    heroBanner.innerHTML = `
      <div class="hero-content">
        <div class="hero-badge-row">
          <span class="hero-badge red">${KhoHistory.escape(quality)}</span>
          <span class="hero-badge">${KhoHistory.escape(year)}</span>
          <span class="hero-badge">${KhoHistory.escape(epBadge)}</span>
        </div>
        <h1 class="hero-title">${KhoHistory.escape(title)}</h1>
        <p class="hero-overview">${KhoHistory.escape(movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : 'Trải nghiệm xem phim chất lượng cao Full HD, Vietsub, Thuyết minh miễn phí trên máy tính.')}</p>
        <div class="hero-actions">
          <button id="hero-play-btn" class="tv-btn tv-btn-primary" tabindex="0">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <span>Xem Ngay</span>
          </button>
          <button id="hero-detail-btn" class="tv-btn tv-btn-secondary" tabindex="0">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            <span>Chi Tiết</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('hero-play-btn').onclick = () => openMovieDetail(movie.slug, true);
    document.getElementById('hero-detail-btn').onclick = () => openMovieDetail(movie.slug, false);
  }

  function renderMovieCardsIntoRow(movies, rowEl, sec = null) {
    rowEl.innerHTML = '';
    movies.forEach(item => {
      const card = createMovieCard(item);
      rowEl.appendChild(card);
    });

    // Add dedicated "Xem thêm" card at the end of every category shelf
    if (sec) {
      const moreCard = document.createElement('div');
      moreCard.className = 'tv-card tv-card-more';
      moreCard.setAttribute('tabindex', '0');
      moreCard.setAttribute('data-sec', sec.path);
      moreCard.innerHTML = `
        <div class="tv-card-more-circle">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
        <div class="tv-card-more-title">Xem Thêm</div>
        <div class="tv-card-more-sub">Tải thêm phim</div>
      `;

      moreCard.onclick = async () => {
        sec._page = (sec._page || 1) + 1;
        moreCard.classList.add('loading');
        moreCard.querySelector('.tv-card-more-title').textContent = 'Đang tải...';
        showToast('Đang tải thêm phim...');

        const newMovies = await fetchCategoryMovies(sec.path, sec._page);
        moreCard.classList.remove('loading');
        moreCard.querySelector('.tv-card-more-title').textContent = 'Xem Thêm';

        if (newMovies && newMovies.length > 0) {
          newMovies.forEach(item => {
            const card = createMovieCard(item);
            rowEl.insertBefore(card, moreCard);
          });
          showToast(`Đã tải thêm ${newMovies.length} phim mới`);
        } else {
          showToast('Đã đến cuối danh mục');
        }
      };

      rowEl.appendChild(moreCard);
    }
  }

  function createMovieCard(item) {
    const { poster, fallback } = resolveMovieImages(item);
    const title = item.name || item.origin_name || item.title || item.slug;
    const quality = item.quality || item.year || 'HD';
    const ep = item.episode_current || '';

    const card = document.createElement('div');
    card.className = 'tv-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-slug', item.slug);

    card.innerHTML = `
      <div class="tv-card-poster-wrap">
        <img src="${KhoHistory.escape(poster)}" alt="${KhoHistory.escape(title)}" loading="lazy">
        <div class="tv-badge-left">${KhoHistory.escape(quality)}</div>
        ${ep ? `<div class="tv-badge-right">${KhoHistory.escape(ep)}</div>` : ''}
      </div>
      <div class="tv-card-info">
        <div class="tv-card-title">${KhoHistory.escape(title)}</div>
        <div class="tv-card-meta">
          ${KhoRatings.html(item, 'tv-card-rating', false)}
          <span class="tv-card-hd">HD</span>
        </div>
      </div>
    `;

    card.querySelector('img').onerror = function () { this.onerror = null; this.src = fallback; };
    card.onclick = () => openMovieDetail(item.slug, false, item.audio_preference);
    return card;
  }

  function renderContinueWatchingRow() {
    const history = getWatchHistory().filter(item => isCurrentMovie(item.slug));
    if (!history || history.length === 0) {
      continueSection.style.display = 'none';
      return;
    }

    continueSection.style.display = 'block';
    continueRow.innerHTML = '';
    enableDragScroll(continueRow);

    const contPrev = document.getElementById('tv-continue-prev-btn');
    const contNext = document.getElementById('tv-continue-next-btn');
    if (contPrev) contPrev.onclick = () => continueRow.scrollBy({ left: -Math.max(350, continueRow.clientWidth * 0.75), behavior: 'smooth' });
    if (contNext) contNext.onclick = () => continueRow.scrollBy({ left: Math.max(350, continueRow.clientWidth * 0.75), behavior: 'smooth' });

    history.slice(0, 15).forEach(item => {
      const card = document.createElement('div');
      card.className = 'tv-continue-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-slug', item.slug);

      const progressPercent = item.durationMs > 0 ? Math.min(100, Math.round((item.positionMs / item.durationMs) * 100)) : 0;

      card.innerHTML = `
        <div class="tv-continue-thumb-wrap">
          <img src="${KhoHistory.escape(item.banner || item.poster)}" alt="${KhoHistory.escape(item.title)}" loading="lazy" onerror="this.onerror=null; this.src='icon.png';">
          <div class="tv-continue-progress">
            <div class="tv-continue-progress-bar" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="tv-continue-info">
          <div class="tv-continue-title">${KhoHistory.escape(item.title)}</div>
          <div class="tv-continue-sub">${KhoHistory.escape(item.episodeName || 'Tập 1')} • Còn ${100 - progressPercent}%</div>
        </div>
      `;

      card.onclick = () => openMovieDetail(item.slug, true);
      continueRow.appendChild(card);
    });
  }

  // ==========================================================================
  // VIEW RENDERING: CATEGORY TABS (SINGLE / SERIES / THEATER)
  // ==========================================================================
  async function loadCategoryView(tabName, reset = true) {
    const config = CATEGORY_TABS[tabName];
    if (!config) return;

    if (reset) {
      categoryPage = 1;
      document.getElementById('tv-category-title').textContent = config.title;
      document.getElementById('tv-category-grid').innerHTML = '<div class="tv-status-msg">Đang tải danh sách phim...</div>';
    }

    categoryLoading = true;
    const movies = await fetchCategoryMovies(config.path, categoryPage);
    categoryLoading = false;

    const grid = document.getElementById('tv-category-grid');
    if (reset) grid.innerHTML = '';

    if (movies.length === 0) {
      if (reset) grid.innerHTML = '<div class="tv-status-msg">Không có phim trong mục này.</div>';
      document.getElementById('tv-load-more-btn').style.display = 'none';
      return;
    }

    movies.forEach(item => {
      const card = createMovieCard(item);
      grid.appendChild(card);
    });

    const loadMoreBtn = document.getElementById('tv-load-more-btn');
    loadMoreBtn.style.display = 'inline-block';
    loadMoreBtn.onclick = () => {
      categoryPage++;
      loadCategoryView(tabName, false);
    };
  }

  // ==========================================================================
  // VIEW RENDERING: SEARCH & HISTORY
  // ==========================================================================
  function setupSearch() {
    const input = document.getElementById('tv-search-input');
    const clearBtn = document.getElementById('tv-search-clear-btn');
    const statusMsg = document.getElementById('tv-search-status');
    const grid = document.getElementById('tv-search-grid');

    // 100% Native typing support: Spaces, Backspace, Delete, Arrows work without any interception
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        input.blur();
      }
    });

    input.oninput = () => {
      const q = input.value.trim();
      clearBtn.style.display = q ? 'block' : 'none';
      clearTimeout(searchTimeout);
      if (!q) {
        grid.innerHTML = '';
        statusMsg.textContent = 'Nhập từ khóa để tìm kiếm bộ phim yêu thích của bạn.';
        return;
      }

      statusMsg.textContent = 'Đang tìm kiếm...';
      searchTimeout = setTimeout(async () => {
        const results = await searchMovies(q);
        grid.innerHTML = '';
        if (results.length === 0) {
          statusMsg.textContent = `Không tìm thấy phim phù hợp với "${q}".`;
          return;
        }
        statusMsg.textContent = `Tìm thấy ${results.length} bộ phim phù hợp:`;
        results.forEach(item => {
          const card = createMovieCard(item);
          grid.appendChild(card);
        });
      }, 350);
    };

    clearBtn.onclick = () => {
      input.value = '';
      clearBtn.style.display = 'none';
      grid.innerHTML = '';
      statusMsg.textContent = 'Nhập từ khóa tìm kiếm để khám phá kho phim.';
      input.focus();
    };
  }

  function renderHistoryView() {
    const history = getWatchHistory();
    const grid = document.getElementById('tv-history-grid');
    const statusMsg = document.getElementById('tv-history-status');
    grid.innerHTML = '';

    if (!history || history.length === 0) {
      statusMsg.style.display = 'block';
      return;
    }
    statusMsg.style.display = 'none';

    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'tv-continue-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-slug', item.slug);

      const progressPercent = item.durationMs > 0 ? Math.min(100, Math.round((item.positionMs / item.durationMs) * 100)) : 0;

      card.innerHTML = `
        <div class="tv-continue-thumb-wrap">
          <img src="${KhoHistory.escape(isCurrentMovie(item.slug) ? (item.banner || item.poster) : 'icon.png')}" alt="${KhoHistory.escape(item.title)}" loading="lazy">
          <div class="tv-continue-progress">
            <div class="tv-continue-progress-bar" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="tv-continue-info">
          <div class="tv-continue-title">${KhoHistory.escape(item.title)}</div>
          <div class="tv-continue-sub">${isCurrentMovie(item.slug) ? KhoHistory.escape(item.episodeName || 'Tập 1') + ' • Đã xem ' + progressPercent + '%' : 'Nguồn cũ đã ngừng dùng · Tìm lại trên Tủ Phim'}</div>
        </div>
      `;

      card.onclick = () => openMovieDetail(item.slug, true);
      grid.appendChild(card);
    });

    document.getElementById('tv-clear-history-btn').onclick = clearAllHistory;
  }

  KhoSync.onBeforeAccountChange(() => { if (document.getElementById('tv-player-overlay').classList.contains('open')) closeVideoPlayer(); closeMovieDetail(); });
  KhoSync.onHistoryChange(() => {
    if (document.getElementById('tv-player-overlay').classList.contains('open')) return;
    renderContinueWatchingRow();
    if (currentTab === 'history') renderHistoryView();
  });

  function setupSettings() {
    const domainList = document.getElementById('tv-domain-list');
    domainList.innerHTML = '';
    const source = document.createElement('span');
    source.className = 'domain-pill active';
    source.textContent = 'Tủ Phim';
    domainList.appendChild(source);

    document.getElementById('tv-clear-cache-btn').onclick = () => {
      try {
        localStorage.removeItem('khophim_desktop_vol');
        sessionStorage.clear();
        showToast('Đã xóa sạch bộ nhớ đệm!');
        setTimeout(() => window.location.reload(), 800);
      } catch (_) {}
    };
  }

  // ==========================================================================
  // VIEW SWITCHER
  // ==========================================================================
  function switchTab(tabName) {
    if (currentTab === tabName) return;
    currentTab = tabName;

    // 1. Update sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 2. Hide all views and show target view
    document.querySelectorAll('.tv-view').forEach(v => v.classList.remove('active'));

    if (tabName === 'home') {
      document.getElementById('view-home').classList.add('active');
      renderContinueWatchingRow();
    } else if (CATEGORY_TABS[tabName]) {
      document.getElementById('view-category').classList.add('active');
      loadCategoryView(tabName, true);
    } else if (tabName === 'search') {
      document.getElementById('view-search').classList.add('active');
      setTimeout(() => {
        const input = document.getElementById('tv-search-input');
        if (input) input.focus();
      }, 100);
    } else if (tabName === 'history') {
      document.getElementById('view-history').classList.add('active');
      renderHistoryView();
    } else if (tabName === 'settings') {
      document.getElementById('view-settings').classList.add('active');
      setupSettings();
    }

    tvMainContent.scrollTop = 0;
  }

  // ==========================================================================
  // MOVIE DETAIL MODAL
  // ==========================================================================
  async function openMovieDetail(slug, autoPlay = false, audioPreference = '', preferredServer = '') {
    if (!isCurrentMovie(slug)) {
      ++detailGeneration;
      clearTimeout(detailAutoplayTimer);
      const saved = getWatchHistory().find(item => item.slug === slug);
      switchTab('search');
      const input = document.getElementById('tv-search-input');
      input.value = saved ? saved.title : '';
      document.getElementById('tv-search-grid').innerHTML = '';
      const status = document.getElementById('tv-search-status');
      status.textContent = 'Nguồn cũ đã ngừng dùng. Tìm lại phim trên Tủ Phim.';
      status.style.display = 'block';
      input.focus();
      return;
    }
    const generation = ++detailGeneration;
    const previousScroll = preferredServer ? detailModal.scrollTop : 0;
    clearTimeout(detailAutoplayTimer);
    showToast('Đang tải thông tin phim...');
    const data = await fetchMovieDetail(slug, audioPreference);
    if (generation !== detailGeneration) return;
    if (preferredServer && playerOverlay.classList.contains('open')) return;
    if (!data || !data.movie) {
      showToast('Không thể tải thông tin phim này');
      return;
    }

    currentMovieDetail = data.movie;
    const movie = data.movie;
    const { poster, banner } = resolveMovieImages(movie);

    document.getElementById('tv-detail-backdrop').style.backgroundImage = `url('${banner}')`;
    document.getElementById('tv-detail-title').textContent = movie.name || movie.origin_name;
    document.getElementById('tv-detail-rating').textContent = KhoRatings.detail(KhoRatings.fromMovie(movie));
    document.getElementById('tv-detail-year').textContent = movie.year || '2026';
    document.getElementById('tv-detail-quality').textContent = movie.quality || 'Full HD';

    const cats = movie.category ? (Array.isArray(movie.category) ? movie.category.map(c => c.name).join(', ') : '') : '';
    document.getElementById('tv-detail-category').textContent = cats || (movie.country ? movie.country[0]?.name : 'Phim Hay');
    document.getElementById('tv-detail-overview').textContent = movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : 'Nội dung phim đang được cập nhật...';
    let audioNotice = document.getElementById('tv-audio-notice');
    if (!audioNotice) {
      audioNotice = document.createElement('p');
      audioNotice.id = 'tv-audio-notice';
      document.getElementById('tv-detail-overview').before(audioNotice);
    }
    audioNotice.textContent = movie.audio_notice || '';
    audioNotice.hidden = !movie.audio_notice;

    // Parse Episodes & Servers
    currentEpisodeList = [];
    const serverTabsEl = document.getElementById('tv-server-tabs');
    const episodeGridEl = document.getElementById('tv-episode-grid');
    serverTabsEl.innerHTML = '';
    episodeGridEl.innerHTML = '';
    enableDragScroll(serverTabsEl);

    const episodesArr = data.episodes || [];
    const history = getWatchHistory().find(x => x.slug === slug);
    const selectedName = preferredServer || (!data.audio && history ? history.serverName : '');
    const savedServer = selectedName ? episodesArr.findIndex(srv => srv.server_name === selectedName) : -1;
    currentServerIndex = savedServer >= 0 ? savedServer : 0;
    if (episodesArr.length > 0) {
      episodesArr.forEach((srv, sIdx) => {
        const srvPill = document.createElement('div');
        srvPill.className = `tv-server-pill ${sIdx === currentServerIndex ? 'active' : ''}`;
        srvPill.setAttribute('tabindex', '0');
        srvPill.textContent = srv.server_name || `Server VIP #${sIdx + 1}`;
        srvPill.onclick = () => {
          currentServerIndex = sIdx;
          document.querySelectorAll('.tv-server-pill').forEach((p, idx) => {
            p.classList.toggle('active', idx === sIdx);
          });
          renderEpisodesForServer(srv);
        };
        serverTabsEl.appendChild(srvPill);
      });

      renderEpisodesForServer(episodesArr[currentServerIndex]);
    }

    // Check watch history progress
    const playBtn = document.getElementById('tv-detail-play-btn');
    const playText = document.getElementById('tv-detail-play-text');
    if (history && history.episodeName) {
      playText.textContent = `Xem Tiếp (${history.episodeName})`;
    } else {
      playText.textContent = 'Xem Phim';
    }

    playBtn.onclick = () => {
      const epToPlay = (history && currentEpisodeList.find(e => e.slug === history.episodeSlug)) || currentEpisodeList[0];
      if (epToPlay) {
        startVideoPlayback(epToPlay, history && epToPlay.slug === history.episodeSlug && (!history.serverName || epToPlay.serverName === history.serverName) ? history.positionMs : 0);
      } else {
        showToast('Chưa có nguồn phát tập này');
      }
    };

    document.getElementById('tv-detail-close-btn').onclick = closeMovieDetail;
    const refresh = document.getElementById('tv-refresh-episodes');
    const refreshStatus = document.getElementById('tv-episode-refresh-status');
    refreshStatus.textContent = preferredServer ? 'Đã làm mới danh sách tập.' : '';
    refresh.onclick = async () => {
      if (refresh.disabled || playerOverlay.classList.contains('open') || currentMovieDetail?.slug !== slug) return;
      refresh.disabled = true;
      refreshStatus.textContent = 'Đang kiểm tra tập mới...';
      const selectedName = episodesArr[currentServerIndex]?.server_name || '';
      const requestGeneration = detailGeneration + 1;
      await openMovieDetail(slug, false, audioPreference, selectedName);
      if (detailGeneration === requestGeneration) {
        refresh.disabled = false;
        if (refreshStatus.textContent === 'Đang kiểm tra tập mới...') refreshStatus.textContent = 'Chưa tải được tập mới. Danh sách hiện tại vẫn dùng được; hãy thử lại.';
      }
    };
    const backBtn = document.getElementById('tv-detail-back-btn');
    if (backBtn) backBtn.onclick = closeMovieDetail;

    detailModal.classList.add('open');
    detailModal.scrollTop = previousScroll;

    if (autoPlay && currentEpisodeList.length > 0) {
      const epToPlay = (history && currentEpisodeList.find(e => e.slug === history.episodeSlug)) || currentEpisodeList[0];
      if (epToPlay) {
        detailAutoplayTimer = setTimeout(() => {
          if (generation === detailGeneration && detailModal.classList.contains('open')) playBtn.onclick();
        }, 200);
      }
    }
  }

  function renderEpisodesForServer(serverObj) {
    const episodeGridEl = document.getElementById('tv-episode-grid');
    episodeGridEl.innerHTML = '';
    currentEpisodeList = [];

    const items = serverObj.server_data || [];
    items.forEach((ep, idx) => {
      const epData = {
        name: ep.name || `Tập ${idx + 1}`,
        slug: ep.slug || `tap-${idx + 1}`,
        linkM3u8: sanitizeUrl(ep.link_m3u8),
        linkEmbed: sanitizeUrl(ep.link_embed),
        serverName: serverObj.server_name || ''
      };
      currentEpisodeList.push(epData);

      const btn = document.createElement('div');
      btn.className = `tv-ep-btn ${idx === 0 ? 'active' : ''}`;
      btn.setAttribute('tabindex', '0');
      btn.textContent = epData.name;
      btn.onclick = () => startVideoPlayback(epData, 0);
      episodeGridEl.appendChild(btn);
    });
  }

  function closeMovieDetail() {
    ++detailGeneration;
    clearTimeout(detailAutoplayTimer);
    detailModal.classList.remove('open');
  }

  // ==========================================================================
  // FULLSCREEN VIDEO PLAYER WITH HLS & AUTO EMBED FALLBACK
  // ==========================================================================
  function startVideoPlayback(episode, resumePositionMs = 0) {
    persistPlaybackProgress();
    playback.stop();
    currentEpisode = episode;
    playbackMovie = currentMovieDetail;
    directSnapshot = { position: Math.max(0, resumePositionMs / 1000), duration: 0, paused: false };
    lastProgressSave = 0;
    showToast(`Đang mở: ${episode.name}`);

    document.getElementById('tv-player-movie-title').textContent = currentMovieDetail ? (currentMovieDetail.name || currentMovieDetail.origin_name) : 'Kho Phim';
    document.getElementById('tv-player-ep-name').textContent = episode.name;

    playerOverlay.classList.add('open');
    showPlayerHud(3500);

    let streamUrl = sanitizeUrl(episode.linkM3u8);
    let embedUrl = sanitizeUrl(episode.linkEmbed);

    if (!streamUrl && embedUrl) {
      streamUrl = extractM3u8FromEmbed(embedUrl);
    }

    document.getElementById('tv-player-error').style.display = 'none';

    // Start direct HLS if m3u8 is available, otherwise embed
    if (streamUrl && streamUrl.includes('.m3u8')) {
      startHlsPlayback(streamUrl, embedUrl, resumePositionMs);
    } else if (embedUrl) {
      startEmbedPlayback(embedUrl, false);
    } else {
      showPlaybackError('Không tìm thấy luồng phát hợp lệ cho tập này.');
    }

    // Connect player buttons
    const sourceToggleBtn = document.getElementById('tv-player-source-toggle-btn');
    if (sourceToggleBtn) sourceToggleBtn.onclick = togglePlayerSource;

    const fsBtn = document.getElementById('tv-player-btn-fullscreen');
    if (fsBtn) fsBtn.onclick = toggleFullscreen;

    const closeBtn = document.getElementById('tv-player-btn-close');
    if (closeBtn) closeBtn.onclick = closeVideoPlayer;
  }

  function captureDirectState() {
    if (currentPlayerMode !== 'hls') return;
    const previous = directSnapshot || { position: 0, duration: 0, paused: false };
    directSnapshot = {
      position: videoPlayer.readyState >= 1 && Number.isFinite(videoPlayer.currentTime) ? videoPlayer.currentTime : previous.position,
      duration: Number.isFinite(videoPlayer.duration) && videoPlayer.duration > 0 ? videoPlayer.duration : previous.duration,
      paused: videoPlayer.readyState >= 1 ? videoPlayer.paused : previous.paused
    };
  }

  function persistPlaybackProgress() {
    if (!currentEpisode || !playbackMovie) return;
    captureDirectState();
    if (!directSnapshot || directSnapshot.position <= 0) return;
    const { poster, banner } = resolveMovieImages(playbackMovie);
    saveWatchProgress({
      title: playbackMovie.name || playbackMovie.origin_name, slug: playbackMovie.slug, poster, banner,
      episodeName: currentEpisode.name, episodeSlug: currentEpisode.slug, serverName: currentEpisode.serverName,
      positionMs: Math.round(directSnapshot.position * 1000), durationMs: Math.round(directSnapshot.duration * 1000), timestamp: Date.now()
    });
  }

  function startHlsPlayback(streamUrl, embedUrl, resumePositionMs = 0, autoplay = true) {
    currentPlayerMode = 'hls';
    playerOverlay.classList.remove('embed-mode');
    updateSourceBadge('⚡ Nguồn: Trực tiếp (HLS)');
    iframePlayer.style.display = 'none';
    iframePlayer.src = 'about:blank';
    videoPlayer.style.display = 'block';
    directSnapshot = { position: Math.max(0, resumePositionMs / 1000), duration: directSnapshot ? directSnapshot.duration : 0, paused: !autoplay };
    const savedVol = Number.parseFloat(localStorage.getItem('khophim_desktop_vol'));
    if (Number.isFinite(savedVol)) {
      videoPlayer.volume = Math.max(0, Math.min(1, savedVol));
      videoPlayer.muted = savedVol === 0;
    }
    document.getElementById('tv-player-error').style.display = 'none';
    playback.open(streamUrl, directSnapshot.position, { autoplay, unmute: false });
    updateVolumeUI();
    updatePlayPauseUI(autoplay);
  }

  function startEmbedPlayback(embedUrl, isAuto = false) {
    if (currentPlayerMode === 'hls') { captureDirectState(); persistPlaybackProgress(); }
    currentPlayerMode = 'embed';
    playback.stop();
    playerOverlay.classList.add('embed-mode');
    updateSourceBadge('🌐 Nguồn: Dự phòng (Embed)');
    videoPlayer.style.display = 'none';
    iframePlayer.style.display = 'block';
    if (iframePlayer.src !== embedUrl) iframePlayer.src = embedUrl;
    document.getElementById('tv-player-error').style.display = 'none';
    if (isAuto) showToast('Đang mở trình phát dự phòng. Dùng nút phát/tua trong video.', 3500);
  }

  function togglePlayerSource() {
    if (!currentEpisode) return;
    const embedUrl = sanitizeUrl(currentEpisode.linkEmbed);
    const streamUrl = sanitizeUrl(currentEpisode.linkM3u8) || extractM3u8FromEmbed(embedUrl);
    if (currentPlayerMode === 'hls') {
      if (embedUrl) startEmbedPlayback(embedUrl);
      else showToast('Tập này không có nguồn dự phòng');
    } else if (streamUrl && streamUrl.includes('.m3u8')) {
      const saved = directSnapshot || { position: 0, paused: false };
      startHlsPlayback(streamUrl, embedUrl, saved.position * 1000, !saved.paused);
    } else showToast('Tập này không có luồng HLS trực tiếp');
    showPlayerHud(3500);
  }

  function updateSourceBadge(text) {
    const btn = document.getElementById('tv-player-source-toggle-btn');
    if (btn) btn.textContent = text;
  }

  function showPlaybackError(msg) {
    const errModal = document.getElementById('tv-player-error');
    const errDesc = document.getElementById('tv-player-error-desc');
    if (errDesc) errDesc.textContent = msg;
    if (errModal) {
      errModal.style.display = 'flex';
      const tryEmbedBtn = document.getElementById('tv-player-btn-embed');
      const backBtn = document.getElementById('tv-player-btn-back');
      backBtn.onclick = closeVideoPlayer;
      if (currentEpisode && currentEpisode.linkEmbed) {
        tryEmbedBtn.style.display = 'inline-flex';
        tryEmbedBtn.onclick = () => startEmbedPlayback(sanitizeUrl(currentEpisode.linkEmbed), false);
      } else {
        tryEmbedBtn.style.display = 'none';
        backBtn.onclick = closeVideoPlayer;
      }
    }
  }

  function closeVideoPlayer() {
    persistPlaybackProgress();
    currentEpisode = null;
    playbackMovie = null;
    playback.stop();
    directSnapshot = null;
    iframePlayer.src = 'about:blank';
    iframePlayer.style.display = 'none';
    playerOverlay.classList.remove('open', 'embed-mode');
    clearTimeout(hudTimer);
    renderContinueWatchingRow();
    if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (_) {}
    }
  }

  window.addEventListener('pagehide', persistPlaybackProgress);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (playerOverlay.requestFullscreen) {
        playerOverlay.requestFullscreen().catch(() => {});
      } else if (playerOverlay.webkitRequestFullscreen) {
        playerOverlay.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function showPlayerHud(duration = 3500) {
    if (!playerHud) return;
    playerHud.classList.add('visible');
    clearTimeout(hudTimer);
    if (duration > 0) {
      hudTimer = setTimeout(() => {
        playerHud.classList.remove('visible');
      }, duration);
    }
  }

  // ==========================================================================
  // DESKTOP VIDEO PLAYER CONTROLS & EVENT HANDLERS
  // ==========================================================================
  const btnPlayPause = document.getElementById('tv-btn-play-pause');
  const iconPlay = document.getElementById('tv-icon-play');
  const iconPause = document.getElementById('tv-icon-pause');
  const btnRewind = document.getElementById('tv-btn-rewind');
  const btnForward = document.getElementById('tv-btn-forward');
  const btnVolume = document.getElementById('tv-btn-volume');
  const iconVolHigh = document.getElementById('tv-icon-volume-high');
  const iconVolMuted = document.getElementById('tv-icon-volume-muted');
  const volumeSlider = document.getElementById('tv-player-volume-slider');
  const btnSpeed = document.getElementById('tv-btn-speed');
  const speedMenu = document.getElementById('tv-speed-menu');
  const clickLayer = document.getElementById('tv-player-click-layer');
  const centerIcon = document.getElementById('tv-player-center-icon');
  const centerPlaySvg = document.getElementById('tv-center-play-svg');
  const centerPauseSvg = document.getElementById('tv-center-pause-svg');
  const btnFullscreen = document.getElementById('tv-player-btn-fullscreen');
  const iconFullscreenEnter = document.getElementById('tv-icon-fullscreen-enter');
  const iconFullscreenExit = document.getElementById('tv-icon-fullscreen-exit');

  // Load saved volume
  const savedVol = localStorage.getItem('khophim_desktop_vol');
  if (savedVol !== null) {
    const v = parseFloat(savedVol);
    if (!isNaN(v) && v >= 0 && v <= 1) {
      videoPlayer.volume = v;
      videoPlayer.muted = (v === 0);
    }
  }

  function updateVolumeUI() {
    const isMuted = videoPlayer.muted || videoPlayer.volume === 0;
    if (iconVolHigh && iconVolMuted) {
      iconVolHigh.style.display = isMuted ? 'none' : 'block';
      iconVolMuted.style.display = isMuted ? 'block' : 'none';
    }
    if (volumeSlider) {
      volumeSlider.value = isMuted ? 0 : videoPlayer.volume;
    }
  }

  function showCenterAnimation(isPlaying) {
    if (!centerIcon || !centerPlaySvg || !centerPauseSvg) return;
    centerPlaySvg.style.display = isPlaying ? 'block' : 'none';
    centerPauseSvg.style.display = isPlaying ? 'none' : 'block';
    centerIcon.classList.remove('animate');
    void centerIcon.offsetWidth; // trigger reflow
    centerIcon.classList.add('animate');
    setTimeout(() => {
      centerIcon.classList.remove('animate');
    }, 450);
  }

  function updatePlayPauseUI(isPlaying) {
    if (iconPlay && iconPause) {
      iconPlay.style.display = isPlaying ? 'none' : 'block';
      iconPause.style.display = isPlaying ? 'block' : 'none';
    }
    if (btnPlayPause) {
      btnPlayPause.title = isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)';
    }
  }

  function togglePlayPause() {
    if (!videoPlayer || currentPlayerMode !== 'hls') return;
    if (videoPlayer.paused) {
      videoPlayer.play().then(() => {
        updatePlayPauseUI(true);
        showCenterAnimation(true);
        showToast('▶️ Đang phát');
      }).catch(e => {
        console.warn('Play error:', e);
      });
    } else {
      videoPlayer.pause();
      updatePlayPauseUI(false);
      showCenterAnimation(false);
      showToast('⏸️ Tạm dừng');
    }
    showPlayerHud(3000);
  }

  // Update HUD progress bar during playback
  videoPlayer.ontimeupdate = () => {
    if (currentPlayerMode !== 'hls' || !currentEpisode) return;
    if (Date.now() - lastProgressSave >= 5000) { persistPlaybackProgress(); lastProgressSave = Date.now(); }
    if (videoPlayer.duration && !isNaN(videoPlayer.duration) && videoPlayer.duration > 0) {
      const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
      const fill = document.getElementById('tv-player-progress-fill');
      if (fill) fill.style.width = `${pct}%`;
      const cur = document.getElementById('tv-player-current-time');
      if (cur) cur.textContent = formatTime(videoPlayer.currentTime);
      const dur = document.getElementById('tv-player-duration');
      if (dur) dur.textContent = formatTime(videoPlayer.duration);
    }
  };

  videoPlayer.addEventListener('play', () => updatePlayPauseUI(true));
  videoPlayer.addEventListener('pause', () => updatePlayPauseUI(false));
  videoPlayer.addEventListener('volumechange', () => updateVolumeUI());

  // Interactive progress bar click to seek
  const progressWrap = document.getElementById('tv-player-progress-wrap');
  if (progressWrap) {
    progressWrap.onclick = (e) => {
      e.stopPropagation();
      const rect = progressWrap.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      if (videoPlayer.duration && !isNaN(videoPlayer.duration)) {
        if (currentPlayerMode === 'hls') playback.seekTo(pos * videoPlayer.duration);
        showPlayerHud(2500);
      }
    };
  }

  // Center click layer to toggle play/pause & double click for fullscreen
  if (clickLayer) {
    let clickTimer = null;
    clickLayer.addEventListener('click', (e) => {
      e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        toggleFullscreen();
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          togglePlayPause();
        }, 220);
      }
    });

    clickLayer.addEventListener('mousemove', () => {
      showPlayerHud(3000);
    });
  }

  // Direct click on videoPlayer (if click layer somehow doesn't intercept)
  videoPlayer.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });

  // Play / Pause Button in Toolbar
  if (btnPlayPause) {
    btnPlayPause.onclick = (e) => {
      e.stopPropagation();
      togglePlayPause();
    };
  }

  // Rewind 10s Button
  if (btnRewind) {
    btnRewind.onclick = (e) => {
      e.stopPropagation();
      if (currentPlayerMode === 'hls') {
        playback.seekBy(-10);
        showToast('⏪ -10 giây');
        showPlayerHud(2500);
      }
    };
  }

  // Forward 10s Button
  if (btnForward) {
    btnForward.onclick = (e) => {
      e.stopPropagation();
      if (currentPlayerMode === 'hls') {
        playback.seekBy(10);
        showToast('⏩ +10 giây');
        showPlayerHud(2500);
      }
    };
  }

  // Volume Button Click (Toggle Mute)
  if (btnVolume) {
    btnVolume.onclick = (e) => {
      e.stopPropagation();
      if (videoPlayer.muted || videoPlayer.volume === 0) {
        videoPlayer.muted = false;
        if (videoPlayer.volume === 0) videoPlayer.volume = 1;
        showToast(`🔊 Âm lượng: ${Math.round(videoPlayer.volume * 100)}%`);
      } else {
        videoPlayer.muted = true;
        showToast('🔇 Đã tắt tiếng');
      }
      localStorage.setItem('khophim_desktop_vol', videoPlayer.volume);
      updateVolumeUI();
      showPlayerHud(2500);
    };
  }

  // Volume Slider Input
  if (volumeSlider) {
    volumeSlider.oninput = (e) => {
      e.stopPropagation();
      const val = parseFloat(volumeSlider.value);
      videoPlayer.volume = val;
      videoPlayer.muted = (val === 0);
      localStorage.setItem('khophim_desktop_vol', val);
      updateVolumeUI();
      showPlayerHud(3000);
    };
  }

  // Mouse Wheel Volume Adjustment
  playerOverlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!videoPlayer) return;
    let vol = videoPlayer.volume;
    if (e.deltaY < 0) {
      vol = Math.min(1, Math.round((vol + 0.05) * 100) / 100);
      videoPlayer.muted = false;
      videoPlayer.volume = vol;
      showToast(`🔊 Âm lượng: ${Math.round(vol * 100)}%`);
    } else {
      vol = Math.max(0, Math.round((vol - 0.05) * 100) / 100);
      videoPlayer.volume = vol;
      videoPlayer.muted = (vol === 0);
      showToast(vol === 0 ? '🔇 Đã tắt tiếng' : `🔊 Âm lượng: ${Math.round(vol * 100)}%`);
    }
    localStorage.setItem('khophim_desktop_vol', vol);
    updateVolumeUI();
    showPlayerHud(2500);
  }, { passive: false });

  // Playback Speed Selector (Cài đặt nhanh chậm)
  if (btnSpeed && speedMenu) {
    btnSpeed.onclick = (e) => {
      e.stopPropagation();
      speedMenu.classList.toggle('open');
      showPlayerHud(4000);
    };

    speedMenu.querySelectorAll('.speed-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const spd = parseFloat(item.dataset.speed);
        if (!isNaN(spd) && videoPlayer) {
          videoPlayer.playbackRate = spd;
          btnSpeed.textContent = `${spd}x`;
          speedMenu.querySelectorAll('.speed-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          speedMenu.classList.remove('open');
          showToast(`⚡ Tốc độ phát: ${spd}x`);
          showPlayerHud(2500);
        }
      };
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.player-speed-container')) {
        speedMenu.classList.remove('open');
      }
    });
  }

  // Fullscreen Button in Toolbar
  if (btnFullscreen) {
    btnFullscreen.onclick = (e) => {
      e.stopPropagation();
      toggleFullscreen();
    };
  }

  function updateFullscreenUI() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (iconFullscreenEnter && iconFullscreenExit) {
      iconFullscreenEnter.style.display = isFs ? 'none' : 'block';
      iconFullscreenExit.style.display = isFs ? 'block' : 'none';
    }
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

  // Player overlay mouse interactions
  playerOverlay.addEventListener('mousemove', () => {
    showPlayerHud(3000);
  });

  // ==========================================================================
  // DESKTOP KEYBOARD CONTROLS (Zero interference with Space and Backspace typing)
  // ==========================================================================
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    // While typing in search input, NEVER intercept any key
    if (isTyping) {
      return;
    }

    // 1. ESC Key: Closes video player or detail modal
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault();
      if (playerOverlay.classList.contains('open')) {
        closeVideoPlayer();
        return;
      }
      if (detailModal.classList.contains('open')) {
        closeMovieDetail();
        return;
      }
      if (currentTab !== 'home') {
        switchTab('home');
        return;
      }
      return;
    }

    // 2. Video Player Shortcuts
    if (playerOverlay.classList.contains('open')) {
      if (currentPlayerMode !== 'hls') return;
      // Space: Play / Pause
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        togglePlayPause();
        return;
      }

      // Up Arrow: Volume +5%
      if (e.key === 'ArrowUp' || e.keyCode === 38) {
        e.preventDefault();
        if (videoPlayer) {
          const vol = Math.min(1, Math.round((videoPlayer.volume + 0.05) * 100) / 100);
          videoPlayer.muted = false;
          videoPlayer.volume = vol;
          localStorage.setItem('khophim_desktop_vol', vol);
          updateVolumeUI();
          showToast(`🔊 Âm lượng: ${Math.round(vol * 100)}%`);
          showPlayerHud(2500);
        }
        return;
      }

      // Down Arrow: Volume -5%
      if (e.key === 'ArrowDown' || e.keyCode === 40) {
        e.preventDefault();
        if (videoPlayer) {
          const vol = Math.max(0, Math.round((videoPlayer.volume - 0.05) * 100) / 100);
          videoPlayer.volume = vol;
          videoPlayer.muted = (vol === 0);
          localStorage.setItem('khophim_desktop_vol', vol);
          updateVolumeUI();
          showToast(vol === 0 ? '🔇 Đã tắt tiếng' : `🔊 Âm lượng: ${Math.round(vol * 100)}%`);
          showPlayerHud(2500);
        }
        return;
      }

      // Left Arrow: Seek back 10s
      if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault();
        if (currentPlayerMode === 'hls') {
          playback.seekBy(-10);
          showToast('⏪ -10 giây');
          showPlayerHud(2500);
        }
        return;
      }

      // Right Arrow: Seek forward 10s
      if (e.key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault();
        if (currentPlayerMode === 'hls') {
          playback.seekBy(10);
          showToast('⏩ +10 giây');
          showPlayerHud(2500);
        }
        return;
      }

      // F Key: Toggle Fullscreen
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // M Key: Mute / Unmute
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (videoPlayer) {
          videoPlayer.muted = !videoPlayer.muted;
          updateVolumeUI();
          showToast(videoPlayer.muted ? '🔇 Đã tắt tiếng' : '🔊 Đã bật tiếng');
          showPlayerHud(2500);
        }
        return;
      }
    }
  });

  // ==========================================================================
  // INITIALIZATION & EVENT BINDINGS
  // ==========================================================================
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    };
  });

  setupSearch();
  initHomeScreen();

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    window.__desktopTest = { openMovieDetail, closeMovieDetail, startVideoPlayback, closeVideoPlayer, togglePlayerSource, getWatchHistory };
  }
})();
