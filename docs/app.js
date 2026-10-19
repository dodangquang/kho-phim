// Kho Phim Web Application - iPhone & Mobile Optimized
(function () {
  'use strict';

  // API Config
  const API_BASE = 'https://khophimqd.vercel.app/source';
  const IMG_BASE = 'https://cdn.phimsrv.com';

  // Source identity is part of the saved slug; legacy history stays separate.
  function isCurrentMovie(slug) { return typeof slug === 'string' && /^tp--[a-zA-Z0-9_-]{1,176}$/.test(slug); }

  // State
  let currentTab = 'home';
  let activeCategory = 'all';
  let categoryPage = 1;
  let categoryTotalPages = 1;
  let currentDetailMovie = null;
  let currentDetailEpisodes = [];
  let currentServerIndex = 0;
  let currentPlayingMovie = null;
  let currentPlayingEpisode = null;
  let currentPlayingEpisodesList = [];
  let currentPlayingServerName = 'Server VIP';
  let currentPlayerMode = 'hls';
  let searchDebounceTimer = null;
  let detailGeneration = 0;
  let directWasPaused = false;

  // DOM Elements
  const views = {
    home: document.getElementById('view-home'),
    browse: document.getElementById('view-browse'),
    search: document.getElementById('view-search'),
    history: document.getElementById('view-history'),
    download: document.getElementById('view-download')
  };

  const navTabs = document.querySelectorAll('.nav-tab');
  const heroBanner = document.getElementById('hero-banner');
  const continueWatchingSection = document.getElementById('continue-watching-section');
  const homeSectionsContainer = document.getElementById('home-sections');
  const browseTitle = document.getElementById('browse-title');
  const browseGrid = document.getElementById('browse-grid');
  const browseLoadMoreBtn = document.getElementById('browse-load-more');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const searchGrid = document.getElementById('search-grid');
  const searchStatus = document.getElementById('search-status');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const detailModal = document.getElementById('detail-modal');
  const playerOverlay = document.getElementById('player-overlay');
  const videoPlayer = document.getElementById('video-player');
  let iframePlayer = document.getElementById('iframe-player');
  const playerErrorBanner = document.getElementById('player-error-banner');
  const playerErrorText = document.getElementById('player-error-text');
  const playerSwitchModeBtn = document.getElementById('player-switch-mode-btn');
  const playerToast = document.getElementById('player-toast');
  const seekControls = document.getElementById('player-seek-controls');
  let seekControlsTimer = null;
  const mobilePlayer = new window.KhoMobilePlayer(videoPlayer, {
    onBeforeError: () => trackAndSaveHistory(),
    onError: () => handlePlaybackError('', currentPlayingEpisode ? currentPlayingEpisode.link_embed : ''),
    onTapRequired: () => showPlayerToast('Chạm nút phát trên video để tiếp tục.'),
    onRecover: () => showPlayerToast('Đang kết nối lại tại vị trí đang xem…')
  });

  const VN_FLAG_HTML = '<span class="vn-flag-icon" aria-label="Việt Nam"><svg viewBox="0 0 30 20" width="18" height="12"><rect width="30" height="20" fill="#da251d"/><polygon points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15" fill="#ffff00"/></svg></span>';

  KhoSync.onBeforeAccountChange(() => { if (playerOverlay.classList.contains('open')) window.closeVideoPlayer(); if (detailModal.classList.contains('open')) window.closeMovieDetail(); });
  KhoSync.onHistoryChange(() => {
    if (playerOverlay.classList.contains('open')) return;
    renderContinueWatchingHome();
    if (currentTab === 'history') renderHistoryScreen();
  });

  // Categories Definition
  const CATEGORIES = [
    { id: 'all', title: 'Tất cả' },
    { id: 'moi-cap-nhat', title: '⚡ Phim Mới Cập Nhật', path: 'danh-sach/phim-moi-cap-nhat' },
    { id: 'viet-nam', title: `${VN_FLAG_HTML}Việt Nam`, path: 'v1/api/quoc-gia/viet-nam' },
    { id: 'phim-le', title: '🎬 Phim Lẻ', path: 'v1/api/danh-sach/phim-le' },
    { id: 'phim-chieu-rap', title: '🍿 Chiếu Rạp', path: 'v1/api/danh-sach/phim-chieu-rap' },
    { id: 'phim-bo', title: '📺 Phim Bộ', path: 'v1/api/danh-sach/phim-bo' },
    { id: 'long-tieng', title: '🗣️ Phim Lồng Tiếng', path: 'v1/api/danh-sach/phim-long-tieng' },
    { id: 'thuyet-minh', title: '🎙️ Phim Thuyết Minh', path: 'v1/api/danh-sach/phim-thuyet-minh' },
    { id: 'hanh-dong', title: '⚔️ Hành Động', path: 'v1/api/the-loai/hanh-dong' },
    { id: 'hoat-hinh', title: '💥 Anime', path: 'v1/api/the-loai/hoat-hinh' },
    { id: 'kinh-di', title: '👻 Kinh Dị', path: 'v1/api/the-loai/kinh-di' },
    { id: 'vien-tuong', title: '🚀 Viễn Tưởng', path: 'v1/api/the-loai/vien-tuong' },
    { id: 'tinh-cam', title: '🌸 Tình Cảm', path: 'v1/api/the-loai/tinh-cam' }
  ];

  // Helper: Format & Clean Image URLs
  function formatImageUrl(url) {
    if (!url) return '';
    let trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://')) {
      trimmed = 'https://' + trimmed.slice(7);
    }
    if (trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('//')) return 'https:' + trimmed;

    const clean = trimmed.replace(/^\/+/, '');

    // Check if it's already an upload path for CDN
    if (clean.startsWith('uploads/') || clean.startsWith('upload/')) {
      return `${IMG_BASE}/${clean}`;
    }

    // Check if domain prefix without protocol (e.g. cdn.phimsrv.com/...)
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\//.test(clean)) {
      return 'https://' + clean;
    }

    return `${IMG_BASE}/${clean}`;
  }

  function resolveImageUrl(url) {
    const formatted = formatImageUrl(url);
    return formatted || 'icon.png';
  }

  function isBlockedOrThirdPartyDomain(url) {
    if (!url) return true;
    const lower = url.toLowerCase();
    return lower.includes('danviet') || lower.includes('kenh14') || lower.includes('soha.vn') || lower.includes('zingnews') || lower.includes('i.ex-cdn.com');
  }

  function isReliableCdn(url) {
    if (!url) return false;
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'cdn.phimsrv.com' && !parsed.username && !parsed.password; } catch (_) { return false; }
  }

  function getMovieImageUrls(movie) {
    if (!movie) return { primary: 'icon.png', fallback: 'icon.png', banner: 'icon.png' };
    const rawPoster = (movie.poster_url || '').trim();
    const rawThumb = (movie.thumb_url || '').trim();
    const resolvedPoster = formatImageUrl(rawPoster);
    const resolvedThumb = formatImageUrl(rawThumb);

    const posterIsCdn = isReliableCdn(resolvedPoster);
    const thumbIsCdn = isReliableCdn(resolvedThumb);
    const posterIsBlocked = isBlockedOrThirdPartyDomain(resolvedPoster);
    const thumbIsBlocked = isBlockedOrThirdPartyDomain(resolvedThumb);

    let primary = '';
    let fallback = '';

    // If thumb is valid CDN and poster is blocked/unreliable (e.g. Phù Sa)
    if (thumbIsCdn && (!posterIsCdn || posterIsBlocked)) {
      primary = resolvedThumb;
      fallback = (posterIsCdn && !posterIsBlocked) ? resolvedPoster : 'icon.png';
    } else if (posterIsCdn) {
      primary = resolvedPoster;
      fallback = (thumbIsCdn && resolvedThumb !== resolvedPoster) ? resolvedThumb : 'icon.png';
    } else if (resolvedThumb && !thumbIsBlocked) {
      primary = resolvedThumb;
      fallback = (resolvedPoster && !posterIsBlocked) ? resolvedPoster : 'icon.png';
    } else if (resolvedPoster && !posterIsBlocked) {
      primary = resolvedPoster;
      fallback = 'icon.png';
    } else {
      primary = resolvedThumb || resolvedPoster || 'icon.png';
      fallback = 'icon.png';
    }

    let banner = thumbIsCdn ? resolvedThumb : ((!thumbIsBlocked && resolvedThumb) ? resolvedThumb : (posterIsCdn ? resolvedPoster : (primary || 'icon.png')));

    return {
      primary: primary || 'icon.png',
      fallback: fallback || 'icon.png',
      banner: banner || 'icon.png'
    };
  }

  // Local Storage History Helper
  function getWatchHistory() { return KhoSync.history().map(KhoSyncView.mobile); }

  function saveWatchHistoryItem(item) {
    if (!item || !item.movieSlug) return;
    try {
      let list = getWatchHistory();
      const existing = list.find(x => x.movieSlug === item.movieSlug);
      if (existing) {
        if ((!item.duration || item.duration <= 0) && existing.duration > 0 && (!item.episodeSlug || item.episodeSlug === existing.episodeSlug)) {
          item.duration = existing.duration;
        }
        if (!item.posterUrl || item.posterUrl === 'icon.png') {
          if (existing.posterUrl && existing.posterUrl !== 'icon.png') {
            item.posterUrl = existing.posterUrl;
          }
        }
      }
      list = list.filter(x => x.movieSlug !== item.movieSlug);
      list.unshift(item);
      if (list.length > 60) list = list.slice(0, 60);
      localStorage.setItem('khophim_history', JSON.stringify(list));
      localStorage.setItem('khophim_watch_history', JSON.stringify(list));
      KhoSync.save(item);
      if (!playerOverlay.classList.contains('open')) renderContinueWatchingHome();
    } catch (e) {
      console.warn('Failed to save watch history:', e);
    }
  }

  function removeWatchHistoryItem(slug) {
    KhoSync.remove(slug);
    let list = getWatchHistory().filter(x => x.movieSlug !== slug);
    try {
      localStorage.setItem('khophim_history', JSON.stringify(list));
      localStorage.setItem('khophim_watch_history', JSON.stringify(list));
    } catch (_) {}
    renderHistoryScreen();
    renderContinueWatchingHome();
  }

  function clearAllWatchHistory() {
    let proceed = true;
    try {
      proceed = window.confirm('Bạn có chắc chắn muốn xoá toàn bộ lịch sử xem không?');
    } catch (_) {
      proceed = true;
    }
    if (proceed) {
      KhoSync.clear();
      try {
        localStorage.removeItem('khophim_history');
        localStorage.removeItem('khophim_watch_history');
        localStorage.removeItem('kho_phim_history');
        localStorage.removeItem('phimmoi_history');
      } catch (_) {}
      renderHistoryScreen();
      renderContinueWatchingHome();
    }
  }

  window.switchTabDirect = function (tabName) {
    switchTab(tabName);
  };

  window.clearHistoryDirect = function () {
    clearAllWatchHistory();
  };

  window.removeHistoryItemDirect = function (slug) {
    removeWatchHistoryItem(slug);
  };

  // Tab Navigation
  function switchTab(tabName) {
    currentTab = tabName;
    Object.keys(views).forEach(key => {
      if (views[key]) {
        views[key].classList.toggle('active', key === tabName);
      }
    });

    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabName === 'history') {
      renderHistoryScreen();
    } else if (tabName === 'home') {
      renderContinueWatchingHome();
    } else if (tabName === 'search') {
      searchInput.focus();
    }
  }

  // Setup Category Pills
  function renderCategoryPills() {
    const bar = document.getElementById('category-filter-bar');
    bar.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = `pill-chip ${cat.id === activeCategory ? 'active' : ''}`;
      pill.innerHTML = cat.title;
      pill.onclick = () => selectCategory(cat);
      bar.appendChild(pill);
    });
  }

  function selectCategory(cat) {
    activeCategory = cat.id;
    renderCategoryPills();

    if (cat.id === 'all') {
      switchTab('home');
    } else {
      loadCategoryBrowse(cat, 1);
    }
  }

  // Fetch Category Data
  async function fetchCategory(cat, page = 1) {
    const url = `${API_BASE}/${cat.path}?page=${page}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      const rawItems = (data.data && data.data.items) ? data.data.items : (data.items || []);
      // Only current-source identifiers enter the catalog.
      const filteredRawItems = rawItems.filter(m => isCurrentMovie(m.slug));
      // Sort movies by newest updated first (modified.time descending)
      const items = [...filteredRawItems].sort((a, b) => {
        const timeA = (a.modified && a.modified.time) ? a.modified.time : '';
        const timeB = (b.modified && b.modified.time) ? b.modified.time : '';
        if (timeA && timeB && timeA !== timeB) {
          return timeB.localeCompare(timeA);
        }
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        return (b.year || 0) - (a.year || 0);
      });
      const totalPages = (data.data && data.data.params && data.data.params.pagination)
        ? data.data.params.pagination.totalPages
        : (data.pagination ? data.pagination.totalPages : 1);
      return { items, totalPages };
    } catch (e) {
      console.error('Fetch category error:', e);
      return { items: [], totalPages: 1 };
    }
  }

  // Browse View (Grid of a specific category)
  let isBrowseLoading = false;
  async function loadCategoryBrowse(cat, page = 1) {
    if (isBrowseLoading && page > 1) return;
    categoryPage = page;
    browseTitle.innerHTML = cat.title;

    const currentScrollY = window.scrollY || document.documentElement.scrollTop;

    if (page === 1) {
      switchTab('browse');
      browseGrid.innerHTML = '<div class="spinner"></div>';
    } else {
      isBrowseLoading = true;
      if (browseLoadMoreBtn) {
        browseLoadMoreBtn.textContent = 'Đang tải thêm...';
        browseLoadMoreBtn.style.pointerEvents = 'none';
        browseLoadMoreBtn.style.opacity = '0.7';
      }
    }

    const { items, totalPages } = await fetchCategory(cat, page);
    categoryTotalPages = totalPages;
    isBrowseLoading = false;

    if (page === 1) {
      browseGrid.innerHTML = '';
    } else {
      if (browseLoadMoreBtn) {
        browseLoadMoreBtn.textContent = 'Tải thêm phim';
        browseLoadMoreBtn.style.pointerEvents = 'auto';
        browseLoadMoreBtn.style.opacity = '1';
      }
    }

    if (!items || items.length === 0) {
      if (page === 1) browseGrid.innerHTML = '<div class="search-empty">Không tìm thấy phim nào.</div>';
      browseLoadMoreBtn.style.display = 'none';
      return;
    }

    items.forEach(movie => {
      const card = createMovieCard(movie);
      browseGrid.appendChild(card);
    });

    if (page > 1) {
      // Prevent any jump or jerk back to top
      window.scrollTo({ top: currentScrollY, behavior: 'instant' });
    }

    browseLoadMoreBtn.style.display = categoryPage < categoryTotalPages ? 'block' : 'none';
  }

  if (browseLoadMoreBtn) {
    browseLoadMoreBtn.type = 'button';
    browseLoadMoreBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const cat = CATEGORIES.find(c => c.id === activeCategory);
      if (cat && categoryPage < categoryTotalPages) {
        loadCategoryBrowse(cat, categoryPage + 1);
      }
      return false;
    };
  }

  // Create Movie Card Component
  function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => openMovieDetail(movie.slug, false, movie.audio_preference);

    const { primary, fallback } = getMovieImageUrls(movie);
    const badge = movie.quality || movie.year || '';
    const epBadge = movie.episode_current || movie.time || '';

    card.innerHTML = `
      <div class="movie-poster-wrap">
        <img
          src="${KhoHistory.escape(primary)}"
          alt="${KhoHistory.escape(movie.name)}"
          loading="lazy"
          referrerpolicy="no-referrer"

        >
        ${badge ? `<span class="movie-badge-top-left">${KhoHistory.escape(badge)}</span>` : ''}
        ${epBadge ? `<span class="movie-badge-top-right">${KhoHistory.escape(epBadge)}</span>` : ''}
        ${KhoRatings.html(movie, 'movie-rating', false)}
      </div>
      <div class="movie-title">${KhoHistory.escape(movie.name)}</div>
    `;
    const img = card.querySelector('img');
    img.onerror = function () {
      if (this.dataset.failed !== '1' && fallback && fallback !== this.src) { this.dataset.failed = '1'; this.src = fallback; }
      else { this.onerror = null; this.src = 'icon.png'; }
    };
    return card;
  }

  // Render Continue Watching Shelf on Home Screen (Landscape card matching mobile app)
  function renderContinueWatchingHome() {
    if (!continueWatchingSection) return;
    const history = getWatchHistory().filter(item => isCurrentMovie(item.movieSlug));
    if (!history || history.length === 0) {
      continueWatchingSection.style.display = 'none';
      continueWatchingSection.innerHTML = '';
      return;
    }

    continueWatchingSection.style.display = 'block';
    continueWatchingSection.innerHTML = `
      <div class="section-header">
        <div class="section-title">🕒 Tiếp tục xem</div>
        <button class="section-more" onclick="window.switchTabDirect('history')">
          Tất cả lịch sử ›
        </button>
      </div>
      <div class="continue-row"></div>
    `;

    const row = continueWatchingSection.querySelector('.continue-row');
    history.slice(0, 15).forEach(item => {
      const card = document.createElement('div');
      card.className = 'continue-card';

      const progressPct = (item.duration > 0)
        ? Math.min(100, Math.round((item.currentTime / item.duration) * 100))
        : (item.currentTime > 0 ? 15 : 0);

      const formattedCurrent = formatTime(item.currentTime);
      const formattedTotal = item.duration > 0 ? formatTime(item.duration) : '';
      const timeLabel = item.duration > 0
        ? `${formattedCurrent} / ${formattedTotal}`
        : (item.currentTime > 0 ? `Đã xem ${formattedCurrent}` : 'Vừa xem');

      card.innerHTML = `
        <div class="continue-thumb-wrap">
          <img class="continue-thumb-img" src="${KhoHistory.escape(item.posterUrl || 'icon.png')}" alt="${KhoHistory.escape(item.movieTitle || 'Phim')}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='icon.png';" loading="lazy">
          <div class="continue-play-overlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="continue-ep-badge">${KhoHistory.escape(item.episodeName || 'Tập 1')}</div>
          <div class="continue-progress-wrap">
            <div class="continue-progress-bar" style="width: ${Math.max(5, progressPct)}%;"></div>
          </div>
        </div>
        <div class="continue-info">
          <div class="continue-title" title="${KhoHistory.escape(item.movieTitle || 'Phim')}">${KhoHistory.escape(item.movieTitle || 'Phim')}</div>
          <div class="continue-sub">${KhoHistory.escape(item.episodeName || 'Tập 1')} • ${timeLabel}</div>
        </div>
      `;

      card.onclick = () => openMovieDetail(item.movieSlug, true);
      row.appendChild(card);
    });
  }

  // Load Home Screen
  async function loadHomeScreen() {
    renderContinueWatchingHome();
    homeSectionsContainer.innerHTML = '<div class="spinner"></div>';

    // Fetch top sections in parallel
    const homeSectionsDef = [
      CATEGORIES.find(c => c.id === 'moi-cap-nhat'),
      CATEGORIES.find(c => c.id === 'viet-nam'),
      CATEGORIES.find(c => c.id === 'phim-le'),
      CATEGORIES.find(c => c.id === 'phim-bo'),
      CATEGORIES.find(c => c.id === 'long-tieng'),
      CATEGORIES.find(c => c.id === 'thuyet-minh'),
      CATEGORIES.find(c => c.id === 'phim-chieu-rap'),
      CATEGORIES.find(c => c.id === 'hanh-dong'),
      CATEGORIES.find(c => c.id === 'hoat-hinh'),
      CATEGORIES.find(c => c.id === 'kinh-di'),
      CATEGORIES.find(c => c.id === 'vien-tuong'),
      CATEGORIES.find(c => c.id === 'tinh-cam')
    ].filter(Boolean);

    try {
      const results = await Promise.all(
        homeSectionsDef.map(cat => fetchCategory(cat, 1).then(res => ({ cat, items: res.items })))
      );

      homeSectionsContainer.innerHTML = '';

      // Hero Movie from first populated section
      let heroItem = null;
      for (const res of results) {
        if (res.items && res.items.length > 0) {
          heroItem = res.items[0];
          break;
        }
      }

      if (heroItem) {
        setupHeroBanner(heroItem);
      }

      // Re-verify Continue Watching shelf on Home
      renderContinueWatchingHome();

      // Render rows
      results.forEach(({ cat, items }) => {
        if (!items || items.length === 0) return;

        const section = document.createElement('div');
        section.className = 'movie-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `
          <div class="section-title">${cat.title}</div>
          <button class="section-more" onclick="selectCategoryById('${cat.id}')">
            Xem thêm ›
          </button>
        `;

        const row = document.createElement('div');
        row.className = 'movie-row';
        items.forEach(movie => {
          row.appendChild(createMovieCard(movie));
        });

        section.appendChild(header);
        section.appendChild(row);
        homeSectionsContainer.appendChild(section);
      });
    } catch (e) {
      console.error('Home load error:', e);
      homeSectionsContainer.innerHTML = '<div class="history-empty">Không thể tải dữ liệu trang chủ. Hãy thử lại sau.</div>';
    }
  }

  window.selectCategoryById = function (catId) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat) selectCategory(cat);
  };

  // Setup Hero Banner
  function setupHeroBanner(movie) {
    const { banner, primary } = getMovieImageUrls(movie);
    const backdropUrl = banner || primary;
    heroBanner.style.backgroundImage = `url('${backdropUrl}')`;

    const badge = movie.quality || 'FHD';
    const year = movie.year || '2024';
    const ep = movie.episode_current || '';

    heroBanner.innerHTML = `
      <div class="hero-content">
        <div class="hero-badge-row">
          <span class="hero-badge" style="background:var(--accent-red);">${KhoHistory.escape(badge)}</span>
          ${year ? `<span class="hero-badge">${KhoHistory.escape(year)}</span>` : ''}
          ${ep ? `<span class="hero-badge">${KhoHistory.escape(ep)}</span>` : ''}
        </div>
        <h1 class="hero-title">${KhoHistory.escape(movie.name)}</h1>
        <div class="hero-buttons">
          <button id="hero-play-btn" class="btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Xem ngay
          </button>
          <button id="hero-info-btn" class="btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            Chi tiết
          </button>
        </div>
      </div>
    `;
    document.getElementById('hero-play-btn').onclick = () => openMovieDetail(movie.slug, true);
    document.getElementById('hero-info-btn').onclick = () => openMovieDetail(movie.slug);
  }

  // Open Movie Detail Modal
  window.openMovieDetail = async function (slug, autoPlay = false, audioPreference = '') {
    if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(slug)) return;
    if (!isCurrentMovie(slug)) {
      ++detailGeneration;
      const saved = getWatchHistory().find(item => item.movieSlug === slug);
      switchTab('search');
      searchInput.value = saved ? saved.movieTitle : '';
      searchGrid.innerHTML = '';
      searchStatus.textContent = 'Nguồn cũ đã ngừng dùng. Tìm lại phim trên Tủ Phim.';
      searchStatus.style.display = 'block';
      if (searchInput.value) { searchClearBtn.style.display = 'flex'; searchInput.focus(); }
      return;
    }
    const generation = ++detailGeneration;
    if (!window.location.hash.startsWith('#detail-') && !window.location.hash.startsWith('#player-')) {
      try {
        history.pushState({ modal: 'detail', slug }, '', '#detail-' + slug);
      } catch (_) {}
    }
    detailModal.classList.add('open');
    detailModal.innerHTML = `
      <div class="detail-modal">
        <div class="detail-header-bar">
          <button class="detail-close-btn" onclick="closeMovieDetail()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div class="spinner" style="margin-top:120px;"></div>
      </div>
    `;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let json;
      try {
        const resp = await fetch(`${API_BASE}/phim/${encodeURIComponent(slug)}${['lt', 'tm'].includes(audioPreference) ? '?audio=' + audioPreference : ''}`, { signal: controller.signal });
        if (!resp.ok) throw new Error('Máy chủ dữ liệu chưa phản hồi. Hãy thử lại.');
        json = await resp.json();
      } finally { clearTimeout(timeout); }
      if (generation !== detailGeneration) return;
      if (!json || !json.movie || !isCurrentMovie(json.movie.slug)) throw new Error('Chưa tải được thông tin phim. Hãy thử lại.');

      const movie = json.movie;
      const episodes = json.episodes || [];
      currentDetailMovie = movie;
      currentDetailEpisodes = episodes;
      currentServerIndex = 0;

      renderDetailContent(movie, episodes);

      if (autoPlay) {
        playFirstOrResumeEpisode(movie, episodes);
      }
    } catch (e) {
      if (generation !== detailGeneration) return;
      console.error('Detail fetch error:', e);
      detailModal.innerHTML = `
        <div class="detail-modal" style="padding:40px; text-align:center;">
          <p>Lỗi tải dữ liệu: ${KhoHistory.escape(e.message)}</p>
          <button class="btn-primary" style="margin-top:16px;" onclick="closeMovieDetail()">Đóng</button>
        </div>
      `;
    }
  };

  window.closeMovieDetail = function (fromPopState = false) {
    ++detailGeneration;
    detailModal.classList.remove('open');
    if (!fromPopState && window.history.length > 1 && window.location.hash.startsWith('#detail-')) {
      try { history.back(); } catch (_) {}
    }
    if (window.location.hash.startsWith('#detail-') || window.location.hash.startsWith('#player-')) {
      try {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        history.replaceState(null, '', cleanUrl);
      } catch (_) {}
    }
  };

  // Render Movie Detail Content
  function renderDetailContent(movie, episodes) {
    const { banner, primary } = getMovieImageUrls(movie);
    const backdropUrl = banner || primary;
    const posterUrl = primary;

    // Categories string
    const genres = (movie.category || []).map(c => c.name).join(', ') || 'Đang cập nhật';
    const countries = (movie.country || []).map(c => c.name).join(', ') || 'Quốc tế';

    // Watch history for this movie
    const historyItem = getWatchHistory().find(x => x.movieSlug === movie.slug);

    let html = `
      <div class="detail-modal">
        <div class="detail-header-bar">
          <button class="detail-close-btn" onclick="closeMovieDetail()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="detail-backdrop"></div>

        <div class="detail-body">
          <h2 class="detail-title">${KhoHistory.escape(movie.name)}</h2>
          <div class="detail-origin-title">${KhoHistory.escape(movie.origin_name || '')}</div>

          <div class="detail-meta-row">
            ${movie.quality ? `<span class="meta-pill accent">${KhoHistory.escape(movie.quality)}</span>` : ''}
            ${movie.year ? `<span class="meta-pill">${KhoHistory.escape(movie.year)}</span>` : ''}
            ${movie.episode_current ? `<span class="meta-pill">${KhoHistory.escape(movie.episode_current)}</span>` : ''}
            ${movie.time ? `<span class="meta-pill">${KhoHistory.escape(movie.time)}</span>` : ''}
          </div>

          ${KhoRatings.html(movie, 'movie-rating-detail', true)}
          ${movie.audio_notice ? `<p class="detail-overview">${KhoHistory.escape(movie.audio_notice)}</p>` : ''}

          <div style="display:flex; gap:10px; margin-bottom:20px;">
            <button class="btn-primary" style="flex:1;" onclick="playFirstOrResumeEpisode()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              ${historyItem ? 'Tiếp tục xem' : 'Phát ngay'}
            </button>
          </div>

          ${historyItem ? `
            <div style="background:rgba(255,255,255,0.06); padding:10px 14px; border-radius:8px; margin-bottom:20px; font-size:12.5px;">
              <span>Đang xem dở: <strong>${KhoHistory.escape(historyItem.episodeName)}</strong></span>
              <div class="history-progress-wrap" style="margin-top:6px;">
                <div class="history-progress-bar" style="width:${Math.min(100, Math.round((historyItem.currentTime / (historyItem.duration || 1)) * 100))}%;"></div>
              </div>
            </div>
          ` : ''}

          <div class="detail-overview">
            ${KhoHistory.escape(movie.content ? movie.content.replace(/<[^>]*>/g, '') : 'Chưa có tóm tắt cho phim này.')}
          </div>

          <div style="margin-bottom:16px; font-size:12.5px; color:var(--text-secondary); line-height:1.6;">
            <div><strong>Thể loại:</strong> ${KhoHistory.escape(genres)}</div>
            <div><strong>Quốc gia:</strong> ${KhoHistory.escape(countries)}</div>
            ${movie.director ? `<div><strong>Đạo diễn:</strong> ${KhoHistory.escape(movie.director)}</div>` : ''}
            ${movie.actor ? `<div><strong>Diễn viên:</strong> ${KhoHistory.escape(movie.actor.join(', '))}</div>` : ''}
          </div>

          <!-- Server Tabs & Episodes -->
          ${renderServersAndEpisodesHtml(episodes, movie.slug)}
        </div>
      </div>
    `;

    detailModal.innerHTML = html;
    detailModal.querySelector('.detail-backdrop').style.backgroundImage = `url("${backdropUrl.replace(/["\\]/g, '')}")`;
  }

  function renderServersAndEpisodesHtml(episodes, slug) {
    if (!episodes || episodes.length === 0) {
      return '<div style="color:var(--text-muted); font-size:13px; margin:20px 0;">Chưa có tập phim nào.</div>';
    }

    const currentServer = episodes[currentServerIndex] || episodes[0];
    const serverData = currentServer ? (currentServer.server_data || []) : [];
    const historyItem = getWatchHistory().find(x => x.movieSlug === slug);

    let serverTabs = '';
    if (episodes.length > 1) {
      serverTabs = `
        <div class="server-tabs-title">Chọn nguồn phát (Server):</div>
        <div class="server-tab-row">
          ${episodes.map((srv, idx) => `
            <button class="server-btn ${idx === currentServerIndex ? 'active' : ''}" onclick="switchDetailServer(${idx})">
              ${KhoHistory.escape(srv.server_name || `Server ${idx + 1}`)}
            </button>
          `).join('')}
        </div>
      `;
    }

    let episodesGrid = `
      <div class="server-tabs-title">Danh sách tập (${serverData.length} tập):</div>
      <div class="episode-grid">
        ${serverData.map((ep, idx) => {
          const isCurrentWatched = historyItem && historyItem.episodeSlug === ep.slug;
          return `
            <button class="episode-btn ${isCurrentWatched ? 'active' : ''}" onclick="playSpecificEpisode(${idx})">
              ${KhoHistory.escape(ep.name)}
              ${isCurrentWatched ? '<div class="ep-progress" style="width:100%;"></div>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    `;

    return serverTabs + episodesGrid;
  }

  window.switchDetailServer = function (idx) {
    currentServerIndex = idx;
    renderDetailContent(currentDetailMovie, currentDetailEpisodes);
  };

  window.playSpecificEpisode = function (epIdx) {
    if (!currentDetailEpisodes || currentDetailEpisodes.length === 0) return;
    const server = currentDetailEpisodes[currentServerIndex] || currentDetailEpisodes[0];
    const serverData = server.server_data || [];
    const ep = serverData[epIdx];
    if (ep) {
      startVideoPlayback(currentDetailMovie, ep, serverData, server.server_name);
    }
  };

  window.playFirstOrResumeEpisode = function (movie = currentDetailMovie, episodes = currentDetailEpisodes) {
    if (!episodes || episodes.length === 0) return;
    const historyItem = getWatchHistory().find(x => x.movieSlug === movie.slug);
    let serverIdx = currentServerIndex;
    if (historyItem && historyItem.serverName && !movie.audio_preference) {
      const matchSrv = episodes.findIndex(s => s.server_name === historyItem.serverName);
      if (matchSrv !== -1) {
        serverIdx = matchSrv;
        currentServerIndex = matchSrv;
      }
    }
    const server = episodes[serverIdx] || episodes[0];
    const serverData = server.server_data || [];

    if (serverData.length === 0) return;

    let targetEp = serverData[0];
    let startPosition = 0;

    if (historyItem) {
      const match = serverData.find(e => e.slug === historyItem.episodeSlug || e.name === historyItem.episodeName);
      if (match) {
        targetEp = match;
        startPosition = historyItem.currentTime || 0;
      }
    }

    startVideoPlayback(movie, targetEp, serverData, server.server_name, startPosition);
  };

  // Fullscreen & orientation handler
  window.requestPlayerFullscreen = function () {
    try {
      if (currentPlayerMode === 'embed') return;
      if (videoPlayer.webkitEnterFullscreen) {
        if (videoPlayer.readyState < 1) {
          showPlayerToast('Video đang tải, hãy thử toàn màn hình khi video sẵn sàng.');
          return;
        }
        videoPlayer.webkitEnterFullscreen();
      } else if (playerOverlay.requestFullscreen) {
        playerOverlay.requestFullscreen().then(() => {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        }).catch(() => {});
      }
    } catch (_) {}
  };

  window.seekVideoBy = function (seconds) {
    if (currentPlayerMode !== 'hls') return;
    if (!mobilePlayer.seekBy(seconds)) showPlayerToast('Đang chuẩn bị video để tua…');
    showSeekControls();
  };

  // These are page controls, separate from Safari's native video controls.
  function hideSeekControls() {
    clearTimeout(seekControlsTimer);
    seekControlsTimer = null;
    seekControls.hidden = true;
  }

  function scheduleSeekControlsHide() {
    clearTimeout(seekControlsTimer);
    if (seekControls.hidden) return;
    seekControlsTimer = setTimeout(() => {
      seekControlsTimer = null;
      // Keep keyboard users' focused controls available until focus leaves.
      try { if (seekControls.querySelector(':focus-visible')) return; }
      catch (_) {} // Older Safari versions do not recognize this selector.
      hideSeekControls();
    }, 3000);
  }

  function showSeekControls() {
    if (!currentPlayingEpisode || currentPlayerMode !== 'hls' || videoPlayer.webkitDisplayingFullscreen) return;
    seekControls.hidden = false;
    scheduleSeekControlsHide();
  }

  window.hideSeekControls = hideSeekControls;
  videoPlayer.addEventListener('pointerup', () => {
    if (seekControls.hidden) showSeekControls();
    else hideSeekControls();
  });
  seekControls.addEventListener('pointerdown', () => clearTimeout(seekControlsTimer));
  seekControls.addEventListener('pointerup', scheduleSeekControlsHide);
  seekControls.addEventListener('pointercancel', scheduleSeekControlsHide);
  seekControls.addEventListener('focusout', scheduleSeekControlsHide);
  videoPlayer.addEventListener('webkitbeginfullscreen', hideSeekControls);

  // Player Source & Toast Helpers
  function showPlayerToast(text, duration = 3500) {
    if (!playerToast) return;
    playerToast.textContent = text;
    playerToast.style.display = 'block';
    if (playerToast._timer) clearTimeout(playerToast._timer);
    playerToast._timer = setTimeout(() => {
      playerToast.style.display = 'none';
    }, duration);
  }

  function updatePlayerModeButton() {
    const btn = document.getElementById('player-switch-mode-btn');
    if (!btn) return;
    if (currentPlayerMode === 'embed') hideSeekControls();
    else showSeekControls();
    if (currentPlayerMode === 'embed') {
      btn.textContent = 'Nguồn: Dự phòng';
      btn.classList.add('embed-active');
      btn.title = 'Đang phát qua Web Embed. Nhấn để đổi sang luồng Trực tiếp (HLS)';
    } else {
      btn.textContent = 'Nguồn: HLS';
      btn.classList.remove('embed-active');
      btn.title = 'Đang phát qua HLS trực tiếp. Nhấn để đổi sang Web Embed';
    }
  }

  window.togglePlayerSource = function () {
    if (!currentPlayingEpisode) return;
    let embedUrl = (currentPlayingEpisode.link_embed || '').trim();
    if (embedUrl.startsWith('http://')) embedUrl = 'https://' + embedUrl.slice(7);

    if (currentPlayerMode === 'hls') {
      if (embedUrl) {
        fallbackToIframe(embedUrl, false);
        showPlayerToast('Đã chuyển sang Trình phát Dự phòng (Web Embed)');
      } else {
        showPlayerToast('Tập này không có nguồn dự phòng.');
      }
    } else {
      switchToHlsDirect();
    }
  };

  function switchToHlsDirect() {
    if (!currentPlayingEpisode) return;
    let streamUrl = (currentPlayingEpisode.link_m3u8 || '').trim();
    let embedUrl = (currentPlayingEpisode.link_embed || '').trim();
    if (streamUrl.startsWith('http://')) streamUrl = 'https://' + streamUrl.slice(7);
    if (embedUrl.startsWith('http://')) embedUrl = 'https://' + embedUrl.slice(7);

    if (!streamUrl) {
      showPlayerToast('Tập này không có luồng HLS trực tiếp.');
      return;
    }

    iframePlayer.src = 'about:blank';
    iframePlayer.style.display = 'none';
    videoPlayer.style.display = 'block';
    playerErrorBanner.style.display = 'none';

    currentPlayerMode = 'hls';
    updatePlayerModeButton();
    showPlayerToast('Đang chuyển sang Trình phát Trực tiếp (HLS)...');

    const saved = getWatchHistory().find(item => item.movieSlug === currentPlayingMovie.slug && item.episodeSlug === currentPlayingEpisode.slug);
    startHlsStream(streamUrl, embedUrl, saved ? saved.currentTime || 0 : 0, !directWasPaused);
  }

  // Video Playback Engine (Native iOS HLS + hls.js + Auto Web Embed fallback)
  function startVideoPlayback(movie, episode, allServerEpisodes, serverName, resumePosition = 0) {
    if (currentPlayingMovie) trackAndSaveHistory();
    currentPlayingMovie = movie;
    currentPlayingEpisode = episode;
    currentPlayingEpisodesList = allServerEpisodes;
    currentPlayingServerName = serverName || 'Server VIP';
    directWasPaused = false;

    if (!window.location.hash.startsWith('#player-')) {
      try {
        history.pushState({ modal: 'player', slug: movie.slug }, '', '#player-' + movie.slug);
      } catch (_) {}
    }
    playerErrorBanner.style.display = 'none';
    iframePlayer.style.display = 'none';
    iframePlayer.src = 'about:blank';
    videoPlayer.style.display = 'block';

    document.getElementById('player-movie-title').textContent = movie.name;
    document.getElementById('player-ep-title').textContent = `${episode.name} • ${serverName}`;

    currentPlayerMode = 'hls';
    updatePlayerModeButton();

    playerOverlay.classList.add('open');

    let streamUrl = (episode.link_m3u8 || '').trim();
    let embedUrl = (episode.link_embed || '').trim();

    // Prevent mixed content on HTTPS GitHub Pages
    if (streamUrl.startsWith('http://')) streamUrl = 'https://' + streamUrl.slice(7);
    if (embedUrl.startsWith('http://')) embedUrl = 'https://' + embedUrl.slice(7);

    // Check resume position from history if not passed
    if (resumePosition <= 0) {
      const historyItem = getWatchHistory().find(x => x.movieSlug === movie.slug && x.episodeSlug === episode.slug);
      if (historyItem && historyItem.currentTime > 5) {
        resumePosition = historyItem.currentTime;
      }
    }

    // Immediately record to history so user sees it in History tab even if video is paused/closed quickly or played in embed mode
    const { primary: movieThumb } = getMovieImageUrls(movie);
    saveWatchHistoryItem({
      movieSlug: movie.slug,
      movieTitle: movie.name,
      posterUrl: movieThumb,
      episodeSlug: episode.slug,
      episodeName: episode.name,
      serverName: serverName || 'Server VIP',
      currentTime: resumePosition || 0,
      duration: 0,
      timestamp: Date.now()
    });

    lastRecordedHistorySec = resumePosition || 0;
    startHlsStream(streamUrl, embedUrl, resumePosition);
  }

  function startHlsStream(streamUrl, embedUrl, resumePosition = 0, autoplay = true) {
    const normalize = url => url.replace(/^http:\/\//, 'https://').replace(/^\/\//, 'https://');
    streamUrl = normalize(streamUrl || '');
    if (streamUrl) mobilePlayer.open(streamUrl, resumePosition, { autoplay });
    else if (embedUrl) fallbackToIframe(normalize(embedUrl));
    else handlePlaybackError('', '');
  }

  function handlePlaybackError(streamUrl, embedUrl) {
    // Auto-fallback to Web Embed if available
    if (embedUrl && currentPlayerMode === 'hls') {
      console.warn('Direct stream failed, automatically switching to Web Embed.');
      fallbackToIframe(embedUrl, true);
      return;
    }

    // In embed mode, never obstruct the iframe with the error dialog
    if (currentPlayerMode === 'embed') {
      return;
    }

    playerErrorText.textContent = 'Chưa tải được luồng phim. Hãy thử lại hoặc chọn server khác.';
    playerErrorBanner.style.display = 'block';

    const embedBtn = document.getElementById('player-try-embed-btn');
    if (embedUrl) {
      embedBtn.style.display = 'inline-flex';
      embedBtn.textContent = 'Thử Trình phát Dự phòng';
      embedBtn.onclick = () => {
        fallbackToIframe(embedUrl, false);
      };
    } else {
      embedBtn.style.display = 'none';
    }
  }

  function fallbackToIframe(embedUrl, isAuto = false) {
    embedUrl = (embedUrl || '').trim().replace(/^http:\/\//, 'https://').replace(/^\/\//, 'https://');
    if (!embedUrl) {
      handlePlaybackError('', '');
      return;
    }
    if (currentPlayerMode === 'hls' && videoPlayer.readyState >= 1) directWasPaused = videoPlayer.paused;
    trackAndSaveHistory();
    // Update player mode before releasing media so pause events cannot overwrite history.
    currentPlayerMode = 'embed';
    updatePlayerModeButton();
    playerErrorBanner.style.display = 'none';

    mobilePlayer.stop();
    videoPlayer.style.display = 'none';
    iframePlayer.style.display = 'block';

    if (iframePlayer.src !== embedUrl) {
      iframePlayer.src = embedUrl;
    }

    if (isAuto) {
      showPlayerToast('⚠️ Đang phát bằng Trình phát Dự phòng (Web Embed)');
    }
  }

  function trackAndSaveHistory() {
    if (!currentPlayingMovie || !currentPlayingEpisode || currentPlayerMode !== 'hls' || videoPlayer.readyState < 2) return;
    const currentT = Math.floor(videoPlayer.currentTime || 0);
    const rawDur = videoPlayer.duration;
    const dur = (rawDur && isFinite(rawDur) && !isNaN(rawDur) && rawDur > 0) ? Math.floor(rawDur) : 0;

    const existing = getWatchHistory().find(x => x.movieSlug === currentPlayingMovie.slug);
    const isSameEp = existing && existing.episodeSlug === currentPlayingEpisode.slug;
    const finalCurrentTime = currentT;
    const finalDuration = (dur > 0) ? dur : (isSameEp ? (existing.duration || 0) : 0);

    const { primary } = getMovieImageUrls(currentPlayingMovie);
    saveWatchHistoryItem({
      movieSlug: currentPlayingMovie.slug,
      movieTitle: currentPlayingMovie.name,
      posterUrl: primary,
      episodeSlug: currentPlayingEpisode.slug,
      episodeName: currentPlayingEpisode.name,
      serverName: currentPlayingServerName,
      currentTime: finalCurrentTime,
      duration: finalDuration,
      timestamp: Date.now()
    });
  }

  // Next Episode Playback
  window.playNextEpisode = function () {
    if (!currentPlayingEpisode || !currentPlayingEpisodesList.length) return;
    const currentIdx = currentPlayingEpisodesList.findIndex(e => e.slug === currentPlayingEpisode.slug);
    if (currentIdx !== -1 && currentIdx + 1 < currentPlayingEpisodesList.length) {
      const nextEp = currentPlayingEpisodesList[currentIdx + 1];
      startVideoPlayback(
        currentPlayingMovie,
        nextEp,
        currentPlayingEpisodesList,
        currentPlayingServerName
      );
    } else {
      alert('Đã hết tập tiếp theo trong danh sách!');
    }
  };

  // Close Player
  window.closeVideoPlayer = function (fromPopState = false) {
    hideSeekControls();
    trackAndSaveHistory();
    currentPlayerMode = 'hls';

    currentPlayingMovie = null;
    currentPlayingEpisode = null;
    currentPlayingEpisodesList = [];
    mobilePlayer.stop();

    // 3. Completely terminate iframe audio & child process by recreating the element
    try {
      if (iframePlayer) {
        iframePlayer.src = 'about:blank';
        iframePlayer.removeAttribute('src');
        iframePlayer.style.display = 'none';
        const parent = iframePlayer.parentNode;
        if (parent) {
          const freshIframe = document.createElement('iframe');
          freshIframe.id = 'iframe-player';
          freshIframe.setAttribute('referrerpolicy', 'no-referrer');
          freshIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
          freshIframe.setAttribute('allowfullscreen', 'true');
          freshIframe.style.display = 'none';
          parent.replaceChild(freshIframe, iframePlayer);
          iframePlayer = freshIframe;
        }
      }
    } catch (_) {}
    videoPlayer.style.display = 'block';
    playerOverlay.classList.remove('open');

    // 4. Immediately clear player hash from URL bar
    if (window.location.hash.startsWith('#player-')) {
      if (!fromPopState && window.history.length > 1) {
        try { history.back(); } catch (_) {}
      }
      try {
        const cleanUrl = (detailModal.classList.contains('open') && currentDetailMovie)
          ? `${window.location.pathname}${window.location.search}#detail-${currentDetailMovie.slug}`
          : `${window.location.pathname}${window.location.search}`;
        history.replaceState(null, '', cleanUrl);
      } catch (_) {}
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    // Try unlock orientation
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (_) {}

    // Refresh detail screen episode badges/progress
    if (currentDetailMovie) {
      renderDetailContent(currentDetailMovie, currentDetailEpisodes);
    }

    // Refresh continue watching on home
    renderContinueWatchingHome();

    // Refresh history screen if active tab and ensure modal doesn't block history
    if (currentTab === 'history') {
      if (detailModal && detailModal.classList.contains('open')) {
        detailModal.classList.remove('open');
      }
      renderHistoryScreen();
    }
  };

  // Video Events
  videoPlayer.addEventListener('ended', () => {
    if (!currentPlayingEpisode || currentPlayerMode !== 'hls') return;
    // Auto play next episode
    const currentIdx = currentPlayingEpisodesList.findIndex(e => e.slug === currentPlayingEpisode.slug);
    if (currentIdx !== -1 && currentIdx + 1 < currentPlayingEpisodesList.length) {
      playNextEpisode();
    }
  });

  // Leaving iOS native fullscreen keeps the same source and playback position.
  videoPlayer.addEventListener('webkitendfullscreen', () => {
    trackAndSaveHistory();
    showSeekControls();
  });

  // Save history on pause and when user switches apps or minimizes Safari
  let lastRecordedHistorySec = 0;
  videoPlayer.addEventListener('timeupdate', () => {
    const cur = Math.floor(videoPlayer.currentTime || 0);
    if (Math.abs(cur - lastRecordedHistorySec) >= 10) {
      lastRecordedHistorySec = cur;
      trackAndSaveHistory();
    }
  });

  videoPlayer.addEventListener('pause', () => {
    trackAndSaveHistory();
  });
  window.addEventListener('pagehide', () => trackAndSaveHistory());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      trackAndSaveHistory();
      hideSeekControls();
    }
  });

  // Browser back button & iOS edge swipe navigation support
  window.addEventListener('popstate', () => {
    if (playerOverlay.classList.contains('open')) {
      closeVideoPlayer(true);
    } else if (detailModal.classList.contains('open')) {
      closeMovieDetail(true);
    }
  });

  // Search Functionality
  searchInput.addEventListener('input', (e) => {
    const rawVal = e.target.value;
    const val = rawVal.trim();
    searchClearBtn.style.display = rawVal.length > 0 ? 'block' : 'none';

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (!val) {
      searchGrid.innerHTML = '';
      searchStatus.innerHTML = '<div class="search-empty">Nhập từ khoá để tìm kiếm bộ phim yêu thích của bạn.</div>';
      return;
    }

    searchStatus.innerHTML = '<div class="spinner"></div>';
    searchGrid.innerHTML = '';

    searchDebounceTimer = setTimeout(() => {
      performSearch(val);
    }, 350);
  });

  // Explicitly allow spacebar, backspace, and all keyboard input on mobile/iPhone
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });

  searchInput.addEventListener('beforeinput', (e) => {
    e.stopPropagation();
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    searchGrid.innerHTML = '';
    searchStatus.innerHTML = '<div class="search-empty">Nhập từ khoá để tìm kiếm bộ phim yêu thích của bạn.</div>';
    searchInput.focus();
  });

  async function performSearch(query) {
    try {
      const encoded = encodeURIComponent(query);
      const resp = await fetch(`${API_BASE}/v1/api/tim-kiem?keyword=${encoded}&limit=40`);
      const data = await resp.json();
      const rawItems = (data.data && data.data.items) ? data.data.items : [];
      const items = rawItems.filter(m => isCurrentMovie(m.slug));

      searchStatus.innerHTML = '';

      if (items.length === 0) {
        searchStatus.innerHTML = `<div class="search-empty">Không tìm thấy phim nào khớp với "<strong>${KhoHistory.escape(query)}</strong>".</div>`;
        return;
      }

      searchGrid.innerHTML = '';
      items.forEach(movie => {
        searchGrid.appendChild(createMovieCard(movie));
      });
    } catch (e) {
      console.error('Search error:', e);
      searchStatus.innerHTML = `<div class="search-empty">Lỗi tìm kiếm: ${KhoHistory.escape(e.message)}</div>`;
    }
  }

  // History Screen Render
  function renderHistoryScreen() {
    const history = getWatchHistory();
    const clearBtn = document.getElementById('history-clear-btn');
    if (!history || history.length === 0) {
      if (historyEmpty) historyEmpty.style.display = 'block';
      if (historyList) historyList.innerHTML = '';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    if (historyEmpty) historyEmpty.style.display = 'none';
    if (historyList) historyList.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'block';

    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item';

      const progressPct = (item.duration > 0)
        ? Math.min(100, Math.round((item.currentTime / item.duration) * 100))
        : (item.currentTime > 0 ? 15 : 0);
      const formattedCurrent = formatTime(item.currentTime);
      const formattedTotal = item.duration > 0 ? formatTime(item.duration) : '--:--';
      const progressLabel = (item.duration > 0)
        ? `${formattedCurrent} / ${formattedTotal} (${progressPct}%)`
        : (item.currentTime > 0 ? `Đã xem ${formattedCurrent}` : 'Vừa xem');

      card.innerHTML = `
        <img class="history-thumb" src="${KhoHistory.escape(isCurrentMovie(item.movieSlug) ? (item.posterUrl || 'icon.png') : 'icon.png')}" alt="${KhoHistory.escape(item.movieTitle || 'Phim')}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='icon.png';">
        <div class="history-info">
          <div class="history-title">${KhoHistory.escape(item.movieTitle || 'Phim')}</div>
          <div class="history-sub">${isCurrentMovie(item.movieSlug) ? KhoHistory.escape(item.episodeName || 'Tập 1') + ' • ' + KhoHistory.escape(item.serverName || 'VIP') : 'Nguồn cũ đã ngừng dùng · Tìm lại trên Tủ Phim'}</div>
          <div class="history-sub" style="font-size:11px; color:var(--text-muted);">${progressLabel}</div>
          <div class="history-progress-wrap">
            <div class="history-progress-bar" style="width: ${Math.max(5, progressPct)}%;"></div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-resume" type="button">
            ${isCurrentMovie(item.movieSlug) ? 'Tiếp tục' : 'Tìm lại phim'}
          </button>
          <button class="icon-btn delete-btn" type="button" title="Xoá">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-muted)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;

      card.onclick = (e) => {
        if (e.target.closest('.delete-btn')) {
          e.stopPropagation();
          removeHistoryItemDirect(item.movieSlug);
        } else {
          openMovieDetail(item.movieSlug, true);
        }
      };

      historyList.appendChild(card);
    });
  }

  window.removeHistoryItemDirect = function (slug) {
    removeWatchHistoryItem(slug);
  };

  window.clearHistoryDirect = function () {
    clearAllWatchHistory();
  };

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${remS < 10 ? '0' : ''}${remS}`;
    }
    return `${m}:${remS < 10 ? '0' : ''}${remS}`;
  }





  // Navigation tab click listeners
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchTab(target);
    });
  });

  // Expose test helpers for verification
  window.__testHelpers = {
    CATEGORIES,
    formatImageUrl,
    resolveImageUrl,
    getMovieImageUrls,
    startVideoPlayback,
    fallbackToIframe,
    handlePlaybackError,
    getWatchHistory,
    saveWatchHistoryItem,
    removeWatchHistoryItem,
    clearAllWatchHistory,
    renderHistoryScreen,
    trackAndSaveHistory,
    renderContinueWatchingHome
  };

  // App Init
  renderCategoryPills();
  renderContinueWatchingHome();
  loadHomeScreen();

  // Handle direct URL hash on initial load
  if (window.location.hash.startsWith('#player-')) {
    const slug = window.location.hash.replace('#player-', '').trim();
    if (slug) {
      setTimeout(() => openMovieDetail(slug, true), 350);
    }
  } else if (window.location.hash.startsWith('#detail-')) {
    const slug = window.location.hash.replace('#detail-', '').trim();
    if (slug) {
      setTimeout(() => openMovieDetail(slug, false), 350);
    }
  }

})();
