/**
 * KHO PHIM TV - SMART TV EDITION JAVASCRIPT
 * Designed specifically for Smart TV (Samsung Tizen, LG webOS, Android TV)
 * High performance 60fps, Zero-lag spatial navigation, Netflix 10-foot UI
 */

(function () {
  'use strict';

  // ==========================================================================
  // CONFIG & STATE
  // ==========================================================================
  const API_DOMAINS = [
    'https://phimmoic.info',
    'https://phimmoichill.net',
    'https://phimmoic.net',
    'https://phimmoivip.org'
  ];
  let activeDomain = API_DOMAINS[0];

  const CATEGORY_TABS = {
    single: { title: '🎬 Phim Lẻ', path: 'danh-sach/phim-le' },
    series: { title: '📺 Phim Bộ', path: 'danh-sach/phim-bo' },
    theater: { title: '🍿 Phim Chiếu Rạp', path: 'danh-sach/phim-chieu-rap' }
  };

  const HOME_SECTIONS = [
    { title: '🎙️ Phim Thuyết Minh', path: 'danh-sach/phim-thuyet-minh' },
    { title: '🎧 Phim Lồng Tiếng', path: 'danh-sach/phim-long-tieng' },
    { title: '🇻🇳 Phim Việt Nam', path: 'quoc-gia/viet-nam' },
    { title: '⚡ Mới Cập Nhật Tập Mới', path: 'danh-sach/phim-moi-cap-nhat' },
    { title: '🍿 Chiếu Rạp Đặc Sắc', path: 'danh-sach/phim-chieu-rap' },
    { title: '📺 Phim Bộ Hot', path: 'danh-sach/phim-bo' },
    { title: '⚔️ Phim Hành Động', path: 'the-loai/hanh-dong' },
    { title: '💥 Anime / Hoạt Hình', path: 'the-loai/hoat-hinh' },
    { title: '👻 Phim Kinh Dị', path: 'the-loai/kinh-di' },
    { title: '🚀 Viễn Tưởng', path: 'the-loai/vien-tuong' },
    { title: '🌸 Tình Cảm', path: 'the-loai/tinh-cam' }
  ];

  let currentTab = 'home';
  let currentFocusedEl = null;
  let heroMovieData = null;
  let categoryPage = 1;
  let categoryLoading = false;
  let searchTimeout = null;

  // Detail & Player State
  let currentMovieDetail = null;
  let currentEpisodeList = [];
  let currentEpisode = null;
  let currentServerIndex = 0;
  let hlsInstance = null;
  let currentPlayerMode = 'hls'; // 'hls' or 'embed'
  let streamWatchdogTimer = null;
  let hudTimer = null;
  let lastNavTime = 0;

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

  // ==========================================================================
  // HELPERS & IMAGE URL RESOLVER
  // ==========================================================================
  function formatImageUrl(url) {
    if (!url) return 'icon.png';
    const trimmed = String(url).trim();
    if (!trimmed) return 'icon.png';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    return 'https://phimimg.com/' + trimmed.replace(/^\/+/, '');
  }

  function resolveMovieImages(item) {
    let poster = formatImageUrl(item.poster_url || item.posterUrl || item.thumb_url || item.thumbUrl);
    let banner = formatImageUrl(item.thumb_url || item.thumbUrl || item.poster_url || item.posterUrl);
    return { poster, banner };
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

  function isVisible(el) {
    return el && el.isConnected && el.offsetParent !== null;
  }

  function getGridColumns(cards) {
    if (!cards || cards.length < 2) return 1;
    const firstTop = cards[0].offsetTop;
    let count = 0;
    for (let i = 0; i < cards.length; i++) {
      if (Math.abs(cards[i].offsetTop - firstTop) < 20) {
        count++;
      } else {
        break;
      }
    }
    return Math.max(1, count);
  }

  // ==========================================================================
  // WATCH HISTORY
  // ==========================================================================
  const HISTORY_KEY = 'khophim_tv_watch_history';

  function getWatchHistory() {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  function saveWatchProgress(item) {
    try {
      let list = getWatchHistory().filter(x => x.slug !== item.slug);
      list.unshift(item);
      if (list.length > 50) list = list.slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function clearAllHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
      showToast('Đã xóa toàn bộ lịch sử xem');
      renderHistoryView();
      renderContinueWatchingRow();
    } catch (_) {}
  }

  // ==========================================================================
  // DATA FETCHING (PHIMAPI & OPHIM)
  // ==========================================================================
  async function fetchCategoryMovies(categoryPath, page = 1) {
    const clean = categoryPath.replace(/^\/+|\/+$/g, '');
    let apiUrl = '';
    if (clean === 'danh-sach/phim-moi-cap-nhat' || clean === 'phim-moi') {
      apiUrl = `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`;
    } else {
      apiUrl = `https://phimapi.com/v1/api/${clean}?page=${page}&limit=24`;
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
      return items;
    } catch (e) {
      console.warn('API error for', categoryPath, e);
      return [];
    }
  }

  async function fetchMovieDetail(slug) {
    const urls = [
      `https://phimapi.com/phim/${slug}`,
      `https://ophim1.com/phim/${slug}`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json && (json.status === true || json.movie)) {
            return json;
          }
        }
      } catch (_) {}
    }
    return null;
  }

  async function searchMovies(keyword) {
    if (!keyword.trim()) return [];
    const encoded = encodeURIComponent(keyword.trim());
    const apiUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&limit=40`;
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.data && Array.isArray(data.data.items)) {
          return data.data.items;
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
    const heroList = await fetchCategoryMovies('danh-sach/phim-thuyet-minh', 1);
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

      const rowEl = document.createElement('div');
      rowEl.className = 'tv-shelf-row';
      sectionEl.appendChild(rowEl);
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

    // Auto focus hero button on startup
    setTimeout(() => {
      const playBtn = document.getElementById('hero-play-btn');
      if (playBtn) setFocus(playBtn);
    }, 400);
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
          <span class="hero-badge red">${quality}</span>
          <span class="hero-badge">${year}</span>
          <span class="hero-badge">${epBadge}</span>
        </div>
        <h1 class="hero-title">${title}</h1>
        <p class="hero-overview">${movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : 'Trải nghiệm xem phim chất lượng cao Full HD, Vietsub, Thuyết minh miễn phí.'}</p>
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
          let firstNewCard = null;
          newMovies.forEach(item => {
            const card = createMovieCard(item);
            rowEl.insertBefore(card, moreCard);
            if (!firstNewCard) firstNewCard = card;
          });
          showToast(`Đã tải thêm ${newMovies.length} phim mới`);
          if (firstNewCard) {
            setFocus(firstNewCard);
          }
        } else {
          showToast('Đã đến cuối danh mục');
        }
      };

      rowEl.appendChild(moreCard);
    }
  }

  function createMovieCard(item) {
    const { poster } = resolveMovieImages(item);
    const title = item.name || item.origin_name || item.title || item.slug;
    const quality = item.quality || item.year || 'HD';
    const ep = item.episode_current || '';

    const card = document.createElement('div');
    card.className = 'tv-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-slug', item.slug);

    card.innerHTML = `
      <div class="tv-card-poster-wrap">
        <img src="${poster}" alt="${title}" loading="lazy">
        <div class="tv-badge-left">${quality}</div>
        ${ep ? `<div class="tv-badge-right">${ep}</div>` : ''}
      </div>
      <div class="tv-card-info">
        <div class="tv-card-title">${title}</div>
        <div class="tv-card-meta">
          <span class="tv-card-match">98% Phù hợp</span>
          <span class="tv-card-hd">HD</span>
        </div>
      </div>
    `;

    card.onclick = () => openMovieDetail(item.slug);
    return card;
  }

  function renderContinueWatchingRow() {
    const history = getWatchHistory();
    if (!history || history.length === 0) {
      continueSection.style.display = 'none';
      return;
    }

    continueSection.style.display = 'block';
    continueRow.innerHTML = '';
    history.slice(0, 15).forEach(item => {
      const card = document.createElement('div');
      card.className = 'tv-continue-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-slug', item.slug);

      const progressPercent = item.durationMs > 0 ? Math.min(100, Math.round((item.positionMs / item.durationMs) * 100)) : 0;

      card.innerHTML = `
        <div class="tv-continue-thumb-wrap">
          <img src="${item.banner || item.poster}" alt="${item.title}" loading="lazy">
          <div class="tv-continue-progress">
            <div class="tv-continue-progress-bar" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="tv-continue-info">
          <div class="tv-continue-title">${item.title}</div>
          <div class="tv-continue-sub">${item.episodeName || 'Tập 1'} • Còn ${100 - progressPercent}%</div>
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

    let firstNewCard = null;
    movies.forEach(item => {
      const card = createMovieCard(item);
      grid.appendChild(card);
      if (!firstNewCard) firstNewCard = card;
    });

    const loadMoreBtn = document.getElementById('tv-load-more-btn');
    loadMoreBtn.style.display = 'inline-block';
    loadMoreBtn.onclick = () => {
      categoryPage++;
      loadCategoryView(tabName, false);
    };

    if (reset && firstNewCard) {
      setTimeout(() => setFocus(firstNewCard), 180);
    } else if (!reset && firstNewCard) {
      setFocus(firstNewCard);
    }
  }

  // ==========================================================================
  // VIEW RENDERING: SEARCH & HISTORY
  // ==========================================================================
  function setupSearch() {
    const input = document.getElementById('tv-search-input');
    const clearBtn = document.getElementById('tv-search-clear-btn');
    const statusMsg = document.getElementById('tv-search-status');
    const grid = document.getElementById('tv-search-grid');

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
      }, 400);
    };

    input.addEventListener('keydown', (e) => {
      // Allow spaces, backspace, and cursor movements without bubbling or blocking
      e.stopPropagation();
      if (e.keyCode === 8 || e.key === 'Backspace' || e.keyCode === 32 || e.key === ' ' || e.keyCode === 37 || e.key === 'ArrowLeft' || e.keyCode === 39 || e.key === 'ArrowRight') {
        return;
      }
      if (e.keyCode === 13 || e.key === 'Enter') {
        input.blur();
        const firstCard = grid.querySelector('.tv-movie-card');
        if (firstCard) setFocus(firstCard);
      }
    });

    clearBtn.onclick = () => {
      input.value = '';
      clearBtn.style.display = 'none';
      grid.innerHTML = '';
      statusMsg.textContent = 'Nhập từ khóa tìm kiếm trên remote để khám phá kho phim.';
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
          <img src="${item.banner || item.poster}" alt="${item.title}" loading="lazy">
          <div class="tv-continue-progress">
            <div class="tv-continue-progress-bar" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <div class="tv-continue-info">
          <div class="tv-continue-title">${item.title}</div>
          <div class="tv-continue-sub">${item.episodeName || 'Tập 1'} • Đã xem ${progressPercent}%</div>
        </div>
      `;

      card.onclick = () => openMovieDetail(item.slug, true);
      grid.appendChild(card);
    });

    document.getElementById('tv-clear-history-btn').onclick = clearAllHistory;
  }

  function setupSettings() {
    const domainList = document.getElementById('tv-domain-list');
    domainList.innerHTML = '';
    API_DOMAINS.forEach(dom => {
      const pill = document.createElement('div');
      pill.className = `domain-pill ${dom === activeDomain ? 'active' : ''}`;
      pill.setAttribute('tabindex', '0');
      pill.textContent = dom.replace('https://', '');
      pill.onclick = () => {
        activeDomain = dom;
        setupSettings();
        showToast(`Đã chuyển sang máy chủ: ${dom}`);
      };
      domainList.appendChild(pill);
    });

    document.getElementById('tv-clear-cache-btn').onclick = () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        showToast('Đã xóa sạch bộ nhớ đệm!');
        setTimeout(() => window.location.reload(), 1000);
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
      }, 150);
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
  async function openMovieDetail(slug, autoPlay = false) {
    showToast('Đang tải thông tin phim...');
    const data = await fetchMovieDetail(slug);
    if (!data || !data.movie) {
      showToast('Không thể tải thông tin phim này');
      return;
    }

    currentMovieDetail = data.movie;
    const movie = data.movie;
    const { poster, banner } = resolveMovieImages(movie);

    document.getElementById('tv-detail-backdrop').style.backgroundImage = `url('${banner}')`;
    document.getElementById('tv-detail-title').textContent = movie.name || movie.origin_name;
    document.getElementById('tv-detail-year').textContent = movie.year || '2026';
    document.getElementById('tv-detail-quality').textContent = movie.quality || 'Full HD';

    const cats = movie.category ? (Array.isArray(movie.category) ? movie.category.map(c => c.name).join(', ') : '') : '';
    document.getElementById('tv-detail-category').textContent = cats || (movie.country ? movie.country[0]?.name : 'Phim Hay');
    document.getElementById('tv-detail-overview').textContent = movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : 'Nội dung phim đang được cập nhật...';

    // Parse Episodes & Servers
    currentEpisodeList = [];
    const serverTabsEl = document.getElementById('tv-server-tabs');
    const episodeGridEl = document.getElementById('tv-episode-grid');
    serverTabsEl.innerHTML = '';
    episodeGridEl.innerHTML = '';

    const episodesArr = data.episodes || [];
    if (episodesArr.length > 0) {
      episodesArr.forEach((srv, sIdx) => {
        const srvPill = document.createElement('div');
        srvPill.className = `tv-server-pill ${sIdx === 0 ? 'active' : ''}`;
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

      renderEpisodesForServer(episodesArr[0]);
    }

    // Check watch history progress
    const history = getWatchHistory().find(x => x.slug === slug);
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
        startVideoPlayback(epToPlay, history ? history.positionMs : 0);
      } else {
        showToast('Chưa có nguồn phát tập này');
      }
    };

    document.getElementById('tv-detail-close-btn').onclick = closeMovieDetail;

    detailModal.classList.add('open');
    setFocus(playBtn);

    if (autoPlay && currentEpisodeList.length > 0) {
      const epToPlay = (history && currentEpisodeList.find(e => e.slug === history.episodeSlug)) || currentEpisodeList[0];
      if (epToPlay) {
        setTimeout(() => startVideoPlayback(epToPlay, history ? history.positionMs : 0), 300);
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
        linkEmbed: sanitizeUrl(ep.link_embed)
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
    detailModal.classList.remove('open');
    const firstCard = tvMainContent.querySelector('.tv-card.tv-focused, .tv-continue-card.tv-focused, .tv-card');
    if (firstCard) setFocus(firstCard);
  }

  // ==========================================================================
  // FULLSCREEN VIDEO PLAYER WITH HLS & AUTO EMBED FALLBACK
  // ==========================================================================
  function startVideoPlayback(episode, resumePositionMs = 0) {
    currentEpisode = episode;
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

    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
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

    // Connect source toggle button
    const sourceToggleBtn = document.getElementById('tv-player-source-toggle-btn');
    if (sourceToggleBtn) {
      sourceToggleBtn.onclick = togglePlayerSource;
    }
  }

  function startHlsPlayback(streamUrl, embedUrl, resumePositionMs = 0) {
    currentPlayerMode = 'hls';
    updateSourceBadge('⚡ Nguồn: Trực tiếp (HLS)');

    iframePlayer.style.display = 'none';
    iframePlayer.src = 'about:blank';
    videoPlayer.style.display = 'block';

    const resumeSeconds = resumePositionMs > 0 ? resumePositionMs / 1000 : 0;

    if (window.Hls && Hls.isSupported()) {
      if (hlsInstance) {
        try { hlsInstance.destroy(); } catch (_) {}
        hlsInstance = null;
      }

      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 2,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 3
      });

      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(videoPlayer);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resumeSeconds > 0) {
          try { videoPlayer.currentTime = resumeSeconds; } catch (_) {}
        }
        videoPlayer.play().catch(e => console.warn('HLS play error:', e));
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('HLS fatal error:', data.type, data.details);
          if (embedUrl && currentPlayerMode === 'hls') {
            console.log('Auto-fallback to web embed...');
            startEmbedPlayback(embedUrl, true);
          } else {
            showPlaybackError('Máy chủ trực tiếp bị lỗi hoặc chặn kết nối trên TV.');
          }
        }
      });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      videoPlayer.src = streamUrl;
      videoPlayer.addEventListener('loadedmetadata', () => {
        if (resumeSeconds > 0) {
          try { videoPlayer.currentTime = resumeSeconds; } catch (_) {}
        }
        videoPlayer.play().catch(() => {});
      }, { once: true });
      videoPlayer.onerror = () => {
        if (embedUrl && currentPlayerMode === 'hls') {
          startEmbedPlayback(embedUrl, true);
        }
      };
    } else if (embedUrl) {
      startEmbedPlayback(embedUrl, true);
      return;
    }

    // Stream Watchdog: If stalled at 0s for >8s, auto fallback to embed!
    streamWatchdogTimer = setTimeout(() => {
      if (currentPlayerMode === 'hls' && embedUrl && videoPlayer.currentTime === 0 && !videoPlayer.paused) {
        console.warn('Stream stalled, switching to embed');
        startEmbedPlayback(embedUrl, true);
      }
    }, 8000);
  }

  function startEmbedPlayback(embedUrl, isAuto = false) {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }

    currentPlayerMode = 'embed';
    updateSourceBadge('🌐 Nguồn: Dự phòng (Embed)');

    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (_) {}
      hlsInstance = null;
    }
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    videoPlayer.style.display = 'none';

    iframePlayer.style.display = 'block';
    if (iframePlayer.src !== embedUrl) {
      iframePlayer.src = embedUrl;
    }

    document.getElementById('tv-player-error').style.display = 'none';

    if (isAuto) {
      showToast('⚠️ Đang phát bằng Trình phát Dự phòng (Web Embed)', 3000);
    }
  }

  function togglePlayerSource() {
    if (!currentEpisode) return;
    let streamUrl = sanitizeUrl(currentEpisode.linkM3u8);
    let embedUrl = sanitizeUrl(currentEpisode.linkEmbed);
    if (!streamUrl && embedUrl) streamUrl = extractM3u8FromEmbed(embedUrl);

    if (currentPlayerMode === 'hls') {
      if (embedUrl) {
        startEmbedPlayback(embedUrl, false);
        showToast('Đã đổi sang Trình phát Dự phòng (Web Embed)');
      } else {
        showToast('Tập này không có nguồn dự phòng');
      }
    } else {
      if (streamUrl) {
        startHlsPlayback(streamUrl, embedUrl, Math.round((videoPlayer.currentTime || 0) * 1000));
        showToast('Đang chuyển sang Trực tiếp (HLS)...');
      } else {
        showToast('Tập này không có luồng HLS trực tiếp');
      }
    }
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
      if (currentEpisode && currentEpisode.linkEmbed) {
        tryEmbedBtn.style.display = 'inline-flex';
        tryEmbedBtn.onclick = () => startEmbedPlayback(sanitizeUrl(currentEpisode.linkEmbed), false);
        setFocus(tryEmbedBtn);
      } else {
        tryEmbedBtn.style.display = 'none';
        backBtn.onclick = closeVideoPlayer;
        setFocus(backBtn);
      }
    }
  }

  function closeVideoPlayer() {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }

    // 1. Save progress before closing
    if (videoPlayer && !isNaN(videoPlayer.currentTime) && currentMovieDetail && currentEpisode) {
      const { poster, banner } = resolveMovieImages(currentMovieDetail);
      saveWatchProgress({
        title: currentMovieDetail.name || currentMovieDetail.origin_name,
        slug: currentMovieDetail.slug,
        poster,
        banner,
        episodeName: currentEpisode.name,
        episodeSlug: currentEpisode.slug,
        positionMs: Math.round(videoPlayer.currentTime * 1000),
        durationMs: Math.round((videoPlayer.duration || 0) * 1000),
        timestamp: Date.now()
      });
    }

    // 2. Teardown player
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();

    iframePlayer.src = 'about:blank';
    iframePlayer.style.display = 'none';
    playerOverlay.classList.remove('open');

    // 3. Return focus to detail play button
    const playBtn = document.getElementById('tv-detail-play-btn');
    if (playBtn) setFocus(playBtn);
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

  // Update HUD progress bar during playback
  videoPlayer.ontimeupdate = () => {
    if (videoPlayer.duration && !isNaN(videoPlayer.duration) && videoPlayer.duration > 0) {
      const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
      document.getElementById('tv-player-progress-fill').style.width = `${pct}%`;
      document.getElementById('tv-player-current-time').textContent = formatTime(videoPlayer.currentTime);
      document.getElementById('tv-player-duration').textContent = formatTime(videoPlayer.duration);
    }
  };

  // ==========================================================================
  // PURE 60FPS SPATIAL FOCUS & D-PAD NAVIGATION ENGINE
  // ==========================================================================
  function setFocus(element) {
    if (!element) return;
    if (currentFocusedEl && currentFocusedEl !== element) {
      currentFocusedEl.classList.remove('tv-focused');
    }
    currentFocusedEl = element;
    currentFocusedEl.classList.add('tv-focused');

    // Sidebar expansion tracking
    const isInSidebar = element.closest('#tv-sidebar');
    if (isInSidebar) {
      tvSidebar.classList.add('expanded');
    } else {
      tvSidebar.classList.remove('expanded');
    }

    // Scroll handling:
    if (!isInSidebar && !element.closest('#tv-detail-modal') && !element.closest('#tv-player-overlay')) {
      const rect = element.getBoundingClientRect();

      // 1. Horizontal scroll inside shelf rows
      const shelfRow = element.closest('.tv-shelf-row');
      if (shelfRow) {
        const shelfRect = shelfRow.getBoundingClientRect();
        const elOffset = rect.left - shelfRect.left + shelfRow.scrollLeft;
        const targetScroll = Math.max(0, elOffset - (shelfRow.clientWidth / 2) + (element.clientWidth / 2));
        shelfRow.scrollLeft = targetScroll;
      }

      // 2. Vertical scroll inside main content
      if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    }
  }

  function focusSidebar() {
    tvSidebar.classList.add('expanded');
    const activeItem = tvSidebar.querySelector(`.sidebar-item[data-tab="${currentTab}"]`) || tvSidebar.querySelector('.sidebar-item');
    if (activeItem) setFocus(activeItem);
  }

  function navigate(direction) {
    if (!currentFocusedEl || !isVisible(currentFocusedEl)) {
      const initial = document.querySelector('.tv-view.active .tv-btn-primary, .tv-view.active .tv-card, .sidebar-item.active');
      if (initial) setFocus(initial);
      return;
    }

    // Zone 1: In Video Player Overlay
    if (playerOverlay.classList.contains('open')) {
      handlePlayerNavigation(direction);
      return;
    }

    // Zone 2: In Detail Modal
    if (detailModal.classList.contains('open')) {
      handleDetailNavigation(direction);
      return;
    }

    // Zone 3: In Left Sidebar
    const inSidebar = currentFocusedEl.closest('#tv-sidebar');
    if (inSidebar) {
      handleSidebarNavigation(direction);
      return;
    }

    // Zone 4: In Main Content Area
    handleMainContentNavigation(direction);
  }

  function handleSidebarNavigation(direction) {
    const items = Array.from(tvSidebar.querySelectorAll('.sidebar-item')).filter(isVisible);
    const idx = items.indexOf(currentFocusedEl);
    if (idx === -1) return;

    switch (direction) {
      case 'UP':
        if (idx > 0) setFocus(items[idx - 1]);
        break;
      case 'DOWN':
        if (idx < items.length - 1) setFocus(items[idx + 1]);
        break;
      case 'RIGHT':
        tvSidebar.classList.remove('expanded');
        jumpFromSidebarToContent();
        break;
    }
  }

  function jumpFromSidebarToContent() {
    if (currentTab === 'home') {
      if (tvMainContent.scrollTop < 220) {
        const heroBtn = document.getElementById('hero-play-btn');
        if (heroBtn && isVisible(heroBtn)) {
          setFocus(heroBtn);
          return;
        }
      }
      const firstCard = tvMainContent.querySelector('#view-home .tv-card, #view-home .tv-continue-card');
      if (firstCard) setFocus(firstCard);
    } else if (CATEGORY_TABS[currentTab]) {
      const firstCard = document.querySelector('#tv-category-grid .tv-card');
      if (firstCard) setFocus(firstCard);
    } else if (currentTab === 'search') {
      const input = document.getElementById('tv-search-input');
      if (input) setFocus(input);
    } else if (currentTab === 'history') {
      const card = document.querySelector('#tv-history-grid .tv-continue-card');
      if (card) setFocus(card);
      else {
        const clearBtn = document.getElementById('tv-clear-history-btn');
        if (clearBtn) setFocus(clearBtn);
      }
    } else if (currentTab === 'settings') {
      const pill = document.querySelector('.domain-pill');
      if (pill) setFocus(pill);
    }
  }

  function handleMainContentNavigation(direction) {
    if (currentTab === 'home') {
      handleHomeNavigation(direction);
    } else if (CATEGORY_TABS[currentTab]) {
      handleCategoryNavigation(direction);
    } else if (currentTab === 'search') {
      handleSearchNavigation(direction);
    } else if (currentTab === 'history') {
      handleHistoryNavigation(direction);
    } else if (currentTab === 'settings') {
      handleSettingsNavigation(direction);
    }
  }

  // Navigation inside Category View (Phim lẻ, Phim bộ, Chiếu rạp)
  function handleCategoryNavigation(direction) {
    const grid = document.getElementById('tv-category-grid');
    const cards = Array.from(grid.querySelectorAll('.tv-card')).filter(isVisible);
    const loadMoreBtn = document.getElementById('tv-load-more-btn');
    const cols = getGridColumns(cards);

    if (currentFocusedEl === loadMoreBtn) {
      if (direction === 'UP' && cards.length > 0) {
        setFocus(cards[cards.length - 1]);
      } else if (direction === 'LEFT') {
        focusSidebar();
      }
      return;
    }

    const idx = cards.indexOf(currentFocusedEl);
    if (idx === -1) {
      if (cards.length > 0) setFocus(cards[0]);
      return;
    }

    switch (direction) {
      case 'LEFT':
        if (idx % cols === 0) {
          focusSidebar();
        } else if (idx > 0) {
          setFocus(cards[idx - 1]);
        }
        break;

      case 'RIGHT':
        if ((idx + 1) % cols !== 0 && idx + 1 < cards.length) {
          setFocus(cards[idx + 1]);
        }
        break;

      case 'UP':
        if (idx >= cols) {
          setFocus(cards[idx - cols]);
        } else {
          tvMainContent.scrollTop = 0;
        }
        break;

      case 'DOWN':
        if (idx + cols < cards.length) {
          setFocus(cards[idx + cols]);
        } else if (isVisible(loadMoreBtn)) {
          setFocus(loadMoreBtn);
        }
        break;
    }
  }

  // Navigation inside Search View
  function handleSearchNavigation(direction) {
    const input = document.getElementById('tv-search-input');
    const clearBtn = document.getElementById('tv-search-clear-btn');
    const grid = document.getElementById('tv-search-grid');
    const cards = Array.from(grid.querySelectorAll('.tv-card')).filter(isVisible);
    const cols = getGridColumns(cards);

    if (currentFocusedEl === input) {
      if (direction === 'LEFT') focusSidebar();
      else if (direction === 'RIGHT' && isVisible(clearBtn)) setFocus(clearBtn);
      else if (direction === 'DOWN' && cards.length > 0) setFocus(cards[0]);
      return;
    }

    if (currentFocusedEl === clearBtn) {
      if (direction === 'LEFT') setFocus(input);
      else if (direction === 'DOWN' && cards.length > 0) setFocus(cards[0]);
      return;
    }

    const idx = cards.indexOf(currentFocusedEl);
    if (idx === -1) return;

    switch (direction) {
      case 'LEFT':
        if (idx % cols === 0) focusSidebar();
        else if (idx > 0) setFocus(cards[idx - 1]);
        break;
      case 'RIGHT':
        if ((idx + 1) % cols !== 0 && idx + 1 < cards.length) setFocus(cards[idx + 1]);
        break;
      case 'UP':
        if (idx < cols) setFocus(input);
        else setFocus(cards[idx - cols]);
        break;
      case 'DOWN':
        if (idx + cols < cards.length) setFocus(cards[idx + cols]);
        break;
    }
  }

  // Navigation inside History View
  function handleHistoryNavigation(direction) {
    const clearBtn = document.getElementById('tv-clear-history-btn');
    const grid = document.getElementById('tv-history-grid');
    const cards = Array.from(grid.querySelectorAll('.tv-continue-card')).filter(isVisible);
    const cols = getGridColumns(cards);

    if (currentFocusedEl === clearBtn) {
      if (direction === 'LEFT') focusSidebar();
      else if (direction === 'DOWN' && cards.length > 0) setFocus(cards[0]);
      return;
    }

    const idx = cards.indexOf(currentFocusedEl);
    if (idx === -1) return;

    switch (direction) {
      case 'LEFT':
        if (idx % cols === 0) focusSidebar();
        else if (idx > 0) setFocus(cards[idx - 1]);
        break;
      case 'RIGHT':
        if ((idx + 1) % cols !== 0 && idx + 1 < cards.length) setFocus(cards[idx + 1]);
        break;
      case 'UP':
        if (idx < cols) setFocus(clearBtn);
        else setFocus(cards[idx - cols]);
        break;
      case 'DOWN':
        if (idx + cols < cards.length) setFocus(cards[idx + cols]);
        break;
    }
  }

  // Navigation inside Settings View
  function handleSettingsNavigation(direction) {
    const pills = Array.from(document.querySelectorAll('.domain-pill')).filter(isVisible);
    const cacheBtn = document.getElementById('tv-clear-cache-btn');

    if (pills.includes(currentFocusedEl)) {
      const idx = pills.indexOf(currentFocusedEl);
      if (direction === 'LEFT') {
        if (idx === 0) focusSidebar();
        else setFocus(pills[idx - 1]);
      } else if (direction === 'RIGHT' && idx < pills.length - 1) {
        setFocus(pills[idx + 1]);
      } else if (direction === 'DOWN' && cacheBtn) {
        setFocus(cacheBtn);
      }
      return;
    }

    if (currentFocusedEl === cacheBtn) {
      if (direction === 'LEFT') focusSidebar();
      else if (direction === 'UP' && pills.length > 0) setFocus(pills[0]);
    }
  }

  // Navigation inside Home Screen (Billboard + Continue Watching + Shelves)
  function handleHomeNavigation(direction) {
    const heroPlay = document.getElementById('hero-play-btn');
    const heroDetail = document.getElementById('hero-detail-btn');
    const hasContinue = continueSection.style.display !== 'none';
    const continueCards = hasContinue ? Array.from(continueRow.querySelectorAll('.tv-continue-card')).filter(isVisible) : [];

    // Sub-zone A: On Hero Billboard Buttons
    if (currentFocusedEl === heroPlay) {
      if (direction === 'LEFT') focusSidebar();
      else if (direction === 'RIGHT' && heroDetail) setFocus(heroDetail);
      else if (direction === 'DOWN') {
        if (continueCards.length > 0) setFocus(continueCards[0]);
        else {
          const firstShelfCard = shelvesContainer.querySelector('.tv-card');
          if (firstShelfCard) setFocus(firstShelfCard);
        }
      }
      return;
    }

    if (currentFocusedEl === heroDetail) {
      if (direction === 'LEFT' && heroPlay) setFocus(heroPlay);
      else if (direction === 'DOWN') {
        if (continueCards.length > 0) setFocus(continueCards[0]);
        else {
          const firstShelfCard = shelvesContainer.querySelector('.tv-card');
          if (firstShelfCard) setFocus(firstShelfCard);
        }
      }
      return;
    }

    // Sub-zone B: In horizontal shelf row or continue row
    const rowEl = currentFocusedEl.closest('.tv-shelf-row');
    if (!rowEl) return;

    // Horizontal inside the row
    if (direction === 'LEFT') {
      const prev = currentFocusedEl.previousElementSibling;
      if (prev && isVisible(prev)) {
        setFocus(prev);
      } else {
        // At leftmost item of row -> jump into Left Sidebar!
        focusSidebar();
      }
      return;
    }

    if (direction === 'RIGHT') {
      const next = currentFocusedEl.nextElementSibling;
      if (next && isVisible(next)) {
        setFocus(next);
      }
      return;
    }

    // Vertical jump between shelves / billboard
    const curRect = currentFocusedEl.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;

    // 1. If currently in Continue Watching Row
    if (rowEl === continueRow) {
      if (direction === 'UP') {
        if (heroPlay) setFocus(heroPlay);
      } else if (direction === 'DOWN') {
        const firstShelfRow = shelvesContainer.querySelector('.tv-shelf-row');
        if (firstShelfRow) {
          const target = getClosestCardInRow(firstShelfRow, curCenterX);
          if (target) setFocus(target);
        }
      }
      return;
    }

    // 2. If in one of the Home Category Shelves
    const allShelves = Array.from(shelvesContainer.querySelectorAll('.tv-shelf-section')).filter(isVisible);
    const currentSection = currentFocusedEl.closest('.tv-shelf-section');
    const shelfIdx = allShelves.indexOf(currentSection);

    if (shelfIdx === -1) return;

    if (direction === 'UP') {
      if (shelfIdx === 0) {
        if (continueCards.length > 0) {
          const target = getClosestCardInRow(continueRow, curCenterX);
          if (target) setFocus(target);
        } else if (heroPlay) {
          setFocus(heroPlay);
        }
      } else {
        const prevShelf = allShelves[shelfIdx - 1];
        const prevRow = prevShelf.querySelector('.tv-shelf-row');
        if (prevRow) {
          const target = getClosestCardInRow(prevRow, curCenterX);
          if (target) setFocus(target);
        }
      }
    } else if (direction === 'DOWN') {
      if (shelfIdx < allShelves.length - 1) {
        const nextShelf = allShelves[shelfIdx + 1];
        const nextRow = nextShelf.querySelector('.tv-shelf-row');
        if (nextRow) {
          const target = getClosestCardInRow(nextRow, curCenterX);
          if (target) setFocus(target);
        }
      }
    }
  }

  function getClosestCardInRow(rowEl, targetX) {
    const cards = Array.from(rowEl.querySelectorAll('.tv-card, .tv-continue-card')).filter(isVisible);
    if (cards.length === 0) return null;
    let closest = cards[0];
    let minDiff = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const r = c.getBoundingClientRect();
      const diff = Math.abs((r.left + r.width / 2) - targetX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c;
      }
    }
    return closest;
  }

  function handleDetailNavigation(direction) {
    const playBtn = document.getElementById('tv-detail-play-btn');
    const closeBtn = document.getElementById('tv-detail-close-btn');
    const serverTabs = Array.from(document.querySelectorAll('.tv-server-pill')).filter(isVisible);
    const epBtns = Array.from(document.querySelectorAll('.tv-ep-btn')).filter(isVisible);

    if (currentFocusedEl === playBtn) {
      if (direction === 'RIGHT') setFocus(closeBtn);
      else if (direction === 'DOWN') {
        if (serverTabs.length > 0) setFocus(serverTabs[0]);
        else if (epBtns.length > 0) setFocus(epBtns[0]);
      }
    } else if (currentFocusedEl === closeBtn) {
      if (direction === 'LEFT') setFocus(playBtn);
      else if (direction === 'DOWN') {
        if (serverTabs.length > 0) setFocus(serverTabs[0]);
        else if (epBtns.length > 0) setFocus(epBtns[0]);
      }
    } else if (currentFocusedEl.classList.contains('tv-server-pill')) {
      const idx = serverTabs.indexOf(currentFocusedEl);
      if (direction === 'LEFT' && idx > 0) setFocus(serverTabs[idx - 1]);
      else if (direction === 'RIGHT' && idx < serverTabs.length - 1) setFocus(serverTabs[idx + 1]);
      else if (direction === 'UP') setFocus(playBtn);
      else if (direction === 'DOWN' && epBtns.length > 0) setFocus(epBtns[0]);
    } else if (currentFocusedEl.classList.contains('tv-ep-btn')) {
      const idx = epBtns.indexOf(currentFocusedEl);
      const cols = 10;
      if (direction === 'LEFT' && idx > 0) setFocus(epBtns[idx - 1]);
      else if (direction === 'RIGHT' && idx < epBtns.length - 1) setFocus(epBtns[idx + 1]);
      else if (direction === 'UP') {
        if (idx >= cols) setFocus(epBtns[idx - cols]);
        else if (serverTabs.length > 0) setFocus(serverTabs[0]);
        else setFocus(playBtn);
      } else if (direction === 'DOWN' && idx + cols < epBtns.length) {
        setFocus(epBtns[idx + cols]);
      }
    }
  }

  function handlePlayerNavigation(direction) {
    showPlayerHud(3500);

    // If error modal is open, navigate between retry and back
    const errModal = document.getElementById('tv-player-error');
    if (errModal && errModal.style.display !== 'none') {
      const tryEmbed = document.getElementById('tv-player-btn-embed');
      const backBtn = document.getElementById('tv-player-btn-back');
      if (direction === 'LEFT' && tryEmbed && isVisible(tryEmbed)) setFocus(tryEmbed);
      else if (direction === 'RIGHT' && backBtn) setFocus(backBtn);
      return;
    }

    if (direction === 'UP') {
      // Toggle stream source on Up key
      togglePlayerSource();
      return;
    }

    if (direction === 'LEFT') {
      if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
        showToast(`⏪ -10s (${formatTime(videoPlayer.currentTime)})`);
      }
    } else if (direction === 'RIGHT') {
      if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
        const maxD = videoPlayer.duration || 999999;
        videoPlayer.currentTime = Math.min(maxD, videoPlayer.currentTime + 10);
        showToast(`⏩ +10s (${formatTime(videoPlayer.currentTime)})`);
      }
    }
  }

  // ==========================================================================
  // MASTER KEYBOARD & REMOTE HANDLER (SAMSUNG TIZEN, LG WEBOS, ANDROID TV)
  // ==========================================================================
  const REMOTE_KEYS = {
    UP: [38, 29460, 'ArrowUp', 'Up'],
    DOWN: [40, 29461, 'ArrowDown', 'Down'],
    LEFT: [37, 4, 29459, 'ArrowLeft', 'Left'],
    RIGHT: [39, 5, 29458, 'ArrowRight', 'Right'],
    ENTER: [13, 29443, 'Enter', 'Select', 'Accept', 'OK', 'ok'],
    BACK: [27, 461, 10009, 'Escape', 'Back', 'Return'],
    PLAY_PAUSE: [179, 10252, 'MediaPlayPause', 'MediaPlay', 'MediaPause']
  };

  function matchKey(e, list) {
    const code = e.keyCode || e.which;
    const key = e.key;
    return list.some(k => k === code || k === key);
  }

  window.addEventListener('keydown', e => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (isTyping) {
      // While typing in search input, NEVER intercept text editing keys:
      if (e.keyCode === 8 || e.key === 'Backspace') {
        return; // Allow native character deletion
      }
      if (e.keyCode === 32 || e.key === ' ' || e.key === 'Spacebar') {
        return; // Allow native space insertion
      }
      if (e.keyCode === 37 || e.key === 'ArrowLeft' || e.keyCode === 39 || e.key === 'ArrowRight') {
        return; // Allow cursor movement within text
      }
      if (e.keyCode === 13 || e.key === 'Enter') {
        activeEl.blur();
        const firstCard = document.querySelector('#tv-search-grid .tv-movie-card');
        if (firstCard) setFocus(firstCard);
        e.preventDefault();
        return;
      }
      if (e.keyCode === 10009 || e.keyCode === 461 || e.key === 'Escape' || e.keyCode === 27) {
        activeEl.blur();
        e.preventDefault();
        return;
      }
      if (e.keyCode === 38 || e.key === 'ArrowUp') {
        activeEl.blur();
        const sidebarSearch = document.querySelector('.sidebar-item[data-tab="search"]');
        if (sidebarSearch) setFocus(sidebarSearch);
        e.preventDefault();
        return;
      }
      if (e.keyCode === 40 || e.key === 'ArrowDown') {
        activeEl.blur();
        const firstCard = document.querySelector('#tv-search-grid .tv-movie-card');
        const clearBtn = document.getElementById('tv-search-clear-btn');
        if (firstCard) setFocus(firstCard);
        else if (clearBtn && clearBtn.style.display !== 'none') setFocus(clearBtn);
        e.preventDefault();
        return;
      }
      return;
    }

    // 1. Back Key Handling (Remote BACK button or PC Backspace outside input)
    if (matchKey(e, REMOTE_KEYS.BACK) || e.keyCode === 8 || e.key === 'Backspace') {
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
      showToast('Nhấn Back lần nữa để thoát Kho Phim');
      return;
    }

    // 2. Play/Pause Key
    if (matchKey(e, REMOTE_KEYS.PLAY_PAUSE) || (playerOverlay.classList.contains('open') && (e.keyCode === 32 || e.key === ' '))) {
      e.preventDefault();
      if (playerOverlay.classList.contains('open') && videoPlayer) {
        if (videoPlayer.paused) {
          videoPlayer.play().catch(() => {});
          showToast('▶️ Đang phát');
        } else {
          videoPlayer.pause();
          showToast('⏸️ Tạm dừng');
        }
      }
      return;
    }

    // 3. Arrow Keys Navigation (Throttled for 60fps responsiveness)
    let dir = null;
    if (matchKey(e, REMOTE_KEYS.UP)) dir = 'UP';
    else if (matchKey(e, REMOTE_KEYS.DOWN)) dir = 'DOWN';
    else if (matchKey(e, REMOTE_KEYS.LEFT)) dir = 'LEFT';
    else if (matchKey(e, REMOTE_KEYS.RIGHT)) dir = 'RIGHT';

    if (dir) {
      e.preventDefault();
      const now = Date.now();
      if (now - lastNavTime < 35) return;
      lastNavTime = now;
      navigate(dir);
      return;
    }

    // 4. Enter / OK Key
    if (matchKey(e, REMOTE_KEYS.ENTER)) {
      e.preventDefault();
      if (playerOverlay.classList.contains('open')) {
        const errModal = document.getElementById('tv-player-error');
        if (errModal && errModal.style.display !== 'none') {
          if (currentFocusedEl) currentFocusedEl.click();
          return;
        }

        if (videoPlayer) {
          if (videoPlayer.paused) {
            videoPlayer.play().catch(() => {});
            showToast('▶️ Đang phát');
          } else {
            videoPlayer.pause();
            showToast('⏸️ Tạm dừng');
          }
        }
        return;
      }

      if (currentFocusedEl) {
        if (currentFocusedEl.classList.contains('sidebar-item')) {
          const tab = currentFocusedEl.getAttribute('data-tab');
          switchTab(tab);
        } else {
          currentFocusedEl.click();
        }
      }
    }
  });

  // Register Samsung Tizen remote input keys
  if (typeof window.tizen !== 'undefined' && window.tizen.tvinputdevice) {
    try {
      const keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
      keys.forEach(k => {
        try { window.tizen.tvinputdevice.registerKey(k); } catch (_) {}
      });
    } catch (_) {}
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.onclick = () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    };
  });

  setupSearch();
  initHomeScreen();

})();
