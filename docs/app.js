// Kho Phim Web Application - iPhone & Mobile Optimized
(function () {
  'use strict';

  // API Config
  const API_BASE = 'https://phimapi.com';
  const IMG_BASE = 'https://phimimg.com';

  // Danh sách các phim đối chiếu máy chủ bị lỗi link/404 -> tự động xóa khỏi kho
  const BROKEN_MOVIE_SLUGS = new Set([
    'vision-quest',
    'mot-tran-thanh-danh'
  ]);

  function isBrokenMovie(slug) {
    if (!slug) return false;
    const clean = slug.toLowerCase().trim().replace(/^\/+|\/+$/g, '');
    return BROKEN_MOVIE_SLUGS.has(clean) || clean.includes('vision-quest') || clean.includes('mot-tran-thanh-danh');
  }

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
  let hlsInstance = null;
  let currentPlayerMode = 'hls';
  let hlsRecoveryAttempts = 0;
  let streamWatchdogTimer = null;
  let searchDebounceTimer = null;
  let historySaveTimer = null;

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

  const VN_FLAG_HTML = '<span class="vn-flag-icon" aria-label="Việt Nam"><svg viewBox="0 0 30 20" width="18" height="12"><rect width="30" height="20" fill="#da251d"/><polygon points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15" fill="#ffff00"/></svg></span>';

  // Categories Definition
  const CATEGORIES = [
    { id: 'all', title: 'Tất cả' },
    { id: 'moi-cap-nhat', title: '⚡ Mới Cập Nhật Tập Mới', path: 'danh-sach/phim-moi-cap-nhat', legacy: true },
    { id: 'phim-thuyet-minh', title: '🎙️ Thuyết Minh', path: 'v1/api/danh-sach/phim-thuyet-minh' },
    { id: 'phim-long-tieng', title: '🎧 Lồng Tiếng', path: 'v1/api/danh-sach/phim-long-tieng' },
    { id: 'viet-nam', title: `${VN_FLAG_HTML}Việt Nam`, path: 'v1/api/quoc-gia/viet-nam' },
    { id: 'phim-le', title: '🎬 Phim Lẻ', path: 'v1/api/danh-sach/phim-le' },
    { id: 'phim-chieu-rap', title: '🍿 Chiếu Rạp', path: 'v1/api/danh-sach/phim-chieu-rap' },
    { id: 'phim-bo', title: '📺 Phim Bộ', path: 'v1/api/danh-sach/phim-bo' },
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

    // Check if domain prefix without protocol (e.g. danviet.vn/..., i.ex-cdn.com/..., phimimg.com/...)
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
    return lower.includes('danviet') || lower.includes('kenh14') || lower.includes('soha.vn') || lower.includes('zingnews');
  }

  function isReliableCdn(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (lower.includes('phimimg.com') || lower.includes('img.phimapi.com') || lower.includes('kkphim')) && !isBlockedOrThirdPartyDomain(url);
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
  function getWatchHistory() {
    try {
      const saved = localStorage.getItem('khophim_history') || localStorage.getItem('kho_phim_history') || localStorage.getItem('phimmoi_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      const cleanList = parsed.filter(item => item && item.movieSlug && !isBrokenMovie(item.movieSlug));
      if (cleanList.length !== parsed.length) {
        try {
          localStorage.setItem('khophim_history', JSON.stringify(cleanList));
          localStorage.setItem('khophim_watch_history', JSON.stringify(cleanList));
        } catch (_) {}
      }
      return cleanList;
    } catch (e) {
      console.warn('Failed to parse watch history:', e);
      return [];
    }
  }

  function saveWatchHistoryItem(item) {
    if (!item || !item.movieSlug) return;
    try {
      let list = getWatchHistory();
      const existing = list.find(x => x.movieSlug === item.movieSlug);
      if (existing) {
        if ((!item.duration || item.duration <= 0) && existing.duration > 0 && (!item.episodeSlug || item.episodeSlug === existing.episodeSlug)) {
          item.duration = existing.duration;
        }
        if ((!item.currentTime || item.currentTime <= 0) && existing.currentTime > 0 && item.episodeSlug === existing.episodeSlug) {
          item.currentTime = existing.currentTime;
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
      renderContinueWatchingHome();
    } catch (e) {
      console.warn('Failed to save watch history:', e);
    }
  }

  function removeWatchHistoryItem(slug) {
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
    const url = cat.legacy
      ? `${API_BASE}/${cat.path}?page=${page}`
      : `${API_BASE}/${cat.path}?page=${page}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      const rawItems = (data.data && data.data.items) ? data.data.items : (data.items || []);
      // Loại bỏ các phim bị lỗi link/404 khỏi kho
      const filteredRawItems = rawItems.filter(m => !isBrokenMovie(m.slug));
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
    card.onclick = () => openMovieDetail(movie.slug);

    const { primary, fallback } = getMovieImageUrls(movie);
    const badge = movie.quality || movie.year || '';
    const epBadge = movie.episode_current || movie.time || '';

    card.innerHTML = `
      <div class="movie-poster-wrap">
        <img
          src="${primary}"
          alt="${movie.name}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="if(this.dataset.failed!=='1'&&'${fallback}'&&'${fallback}'!==this.src){this.dataset.failed='1';this.src='${fallback}';}else{this.onerror=null;this.src='icon.png';}"
        >
        ${badge ? `<span class="movie-badge-top-left">${badge}</span>` : ''}
        ${epBadge ? `<span class="movie-badge-top-right">${epBadge}</span>` : ''}
      </div>
      <div class="movie-title">${movie.name}</div>
    `;
    return card;
  }

  // Render Continue Watching Shelf on Home Screen (Landscape card matching mobile app)
  function renderContinueWatchingHome() {
    if (!continueWatchingSection) return;
    const history = getWatchHistory().filter(item => !isBrokenMovie(item.movieSlug));
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
          <img class="continue-thumb-img" src="${item.posterUrl || 'icon.png'}" alt="${item.movieTitle || 'Phim'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='icon.png';" loading="lazy">
          <div class="continue-play-overlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="continue-ep-badge">${item.episodeName || 'Tập 1'}</div>
          <div class="continue-progress-wrap">
            <div class="continue-progress-bar" style="width: ${Math.max(5, progressPct)}%;"></div>
          </div>
        </div>
        <div class="continue-info">
          <div class="continue-title" title="${item.movieTitle || 'Phim'}">${item.movieTitle || 'Phim'}</div>
          <div class="continue-sub">${item.episodeName || 'Tập 1'} • ${timeLabel}</div>
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
      CATEGORIES.find(c => c.id === 'phim-thuyet-minh'),
      CATEGORIES.find(c => c.id === 'phim-long-tieng'),
      CATEGORIES.find(c => c.id === 'viet-nam'),
      CATEGORIES.find(c => c.id === 'phim-le'),
      CATEGORIES.find(c => c.id === 'phim-bo'),
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

      if (tvModeActive && !currentTvFocusedEl) {
        setTimeout(() => {
          const heroPlay = document.getElementById('hero-play-btn');
          if (heroPlay) setTvFocus(heroPlay);
        }, 150);
      }
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
          <span class="hero-badge" style="background:var(--accent-red);">${badge}</span>
          ${year ? `<span class="hero-badge">${year}</span>` : ''}
          ${ep ? `<span class="hero-badge">${ep}</span>` : ''}
        </div>
        <h1 class="hero-title">${movie.name}</h1>
        <div class="hero-buttons">
          <button id="hero-play-btn" class="btn-primary" onclick="openMovieDetail('${movie.slug}', true)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Xem ngay
          </button>
          <button id="hero-info-btn" class="btn-secondary" onclick="openMovieDetail('${movie.slug}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            Chi tiết
          </button>
        </div>
      </div>
    `;
  }

  // Open Movie Detail Modal
  window.openMovieDetail = async function (slug, autoPlay = false) {
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
      let resp = await fetch(`${API_BASE}/phim/${slug}`);
      let json = await resp.json();

      if (!json || !json.movie) {
        resp = await fetch(`https://ophim1.com/phim/${slug}`);
        json = await resp.json();
      }

      if (!json || !json.movie || isBrokenMovie(slug) || isBrokenMovie(json.movie.slug)) {
        detailModal.innerHTML = `
          <div class="detail-modal" style="padding:40px; text-align:center;">
            <p style="font-size:16px; margin-bottom:12px; color:var(--accent-red); font-weight:bold;">Phim này đã bị gỡ khỏi kho</p>
            <p style="font-size:13px; color:var(--text-secondary); margin-bottom:20px;">Máy chủ gốc của nhà cung cấp bị lỗi nguồn phát (HTTP 404). Hệ thống đã tự động đối chiếu và loại bỏ phim này khỏi kho.</p>
            <button class="btn-primary" onclick="closeMovieDetail()">Đóng</button>
          </div>
        `;
        return;
      }

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
      console.error('Detail fetch error:', e);
      detailModal.innerHTML = `
        <div class="detail-modal" style="padding:40px; text-align:center;">
          <p>Lỗi tải dữ liệu: ${e.message}</p>
          <button class="btn-primary" style="margin-top:16px;" onclick="closeMovieDetail()">Đóng</button>
        </div>
      `;
    }
  };

  window.closeMovieDetail = function (fromPopState = false) {
    detailModal.classList.remove('open');
    if (tvModeActive) {
      setTimeout(() => {
        const fallback = findDefaultInitialFocus();
        if (fallback) setTvFocus(fallback);
      }, 50);
    }
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

        <div class="detail-backdrop" style="background-image: url('${backdropUrl}');"></div>

        <div class="detail-body">
          <h2 class="detail-title">${movie.name}</h2>
          <div class="detail-origin-title">${movie.origin_name || ''}</div>

          <div class="detail-meta-row">
            ${movie.quality ? `<span class="meta-pill accent">${movie.quality}</span>` : ''}
            ${movie.year ? `<span class="meta-pill">${movie.year}</span>` : ''}
            ${movie.episode_current ? `<span class="meta-pill">${movie.episode_current}</span>` : ''}
            ${movie.time ? `<span class="meta-pill">${movie.time}</span>` : ''}
          </div>

          <div style="display:flex; gap:10px; margin-bottom:20px;">
            <button class="btn-primary" style="flex:1;" onclick="playFirstOrResumeEpisode()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              ${historyItem ? 'Tiếp tục xem' : 'Phát ngay'}
            </button>
          </div>

          ${historyItem ? `
            <div style="background:rgba(255,255,255,0.06); padding:10px 14px; border-radius:8px; margin-bottom:20px; font-size:12.5px;">
              <span>Đang xem dở: <strong>${historyItem.episodeName}</strong></span>
              <div class="history-progress-wrap" style="margin-top:6px;">
                <div class="history-progress-bar" style="width:${Math.min(100, Math.round((historyItem.currentTime / (historyItem.duration || 1)) * 100))}%;"></div>
              </div>
            </div>
          ` : ''}

          <div class="detail-overview">
            ${movie.content ? movie.content.replace(/<[^>]*>/g, '') : 'Chưa có tóm tắt cho phim này.'}
          </div>

          <div style="margin-bottom:16px; font-size:12.5px; color:var(--text-secondary); line-height:1.6;">
            <div><strong>Thể loại:</strong> ${genres}</div>
            <div><strong>Quốc gia:</strong> ${countries}</div>
            ${movie.director ? `<div><strong>Đạo diễn:</strong> ${movie.director}</div>` : ''}
            ${movie.actor ? `<div><strong>Diễn viên:</strong> ${movie.actor.join(', ')}</div>` : ''}
          </div>

          <!-- Server Tabs & Episodes -->
          ${renderServersAndEpisodesHtml(episodes, movie.slug)}
        </div>
      </div>
    `;

    detailModal.innerHTML = html;

    if (tvModeActive) {
      setTimeout(() => {
        const playBtn = detailModal.querySelector('.btn-primary');
        if (playBtn) setTvFocus(playBtn);
      }, 50);
    }
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
              ${srv.server_name || `Server ${idx + 1}`}
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
              ${ep.name}
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
    if (historyItem && historyItem.serverName) {
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
  function requestPlayerFullscreen() {
    try {
      if (videoPlayer.webkitEnterFullscreen) {
        if (videoPlayer.readyState >= 1) {
          videoPlayer.webkitEnterFullscreen();
        } else {
          const onMeta = () => {
            try { videoPlayer.webkitEnterFullscreen(); } catch (_) {}
            videoPlayer.removeEventListener('loadedmetadata', onMeta);
          };
          videoPlayer.addEventListener('loadedmetadata', onMeta);
        }
      } else if (playerOverlay.requestFullscreen) {
        playerOverlay.requestFullscreen().catch(() => {});
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else if (videoPlayer.requestFullscreen) {
        videoPlayer.requestFullscreen().catch(() => {});
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Auto fullscreen request suppressed:', e);
    }
  }

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

    startHlsStream(streamUrl, embedUrl, Math.floor(videoPlayer.currentTime || 0));
  }

  // Video Playback Engine (Native iOS HLS + hls.js + Auto Web Embed fallback)
  function startVideoPlayback(movie, episode, allServerEpisodes, serverName, resumePosition = 0) {
    currentPlayingMovie = movie;
    currentPlayingEpisode = episode;
    currentPlayingEpisodesList = allServerEpisodes;

    if (!window.location.hash.startsWith('#player-')) {
      try {
        history.pushState({ modal: 'player', slug: movie.slug }, '', '#player-' + movie.slug);
      } catch (_) {}
    }

    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
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

    startHlsStream(streamUrl, embedUrl, resumePosition);

    // User gesture fullscreen
    requestPlayerFullscreen();

    // Start auto-save history timer
    if (historySaveTimer) clearInterval(historySaveTimer);
    historySaveTimer = setInterval(trackAndSaveHistory, 3000);
  }

  function startHlsStream(streamUrl, embedUrl, resumePosition = 0) {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }

    // Ensure protocols are https to prevent Mixed Content
    if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;
    if (streamUrl.startsWith('http://')) streamUrl = 'https://' + streamUrl.slice(7);
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
    if (embedUrl.startsWith('http://')) embedUrl = 'https://' + embedUrl.slice(7);

    const applyResumePosition = () => {
      if (resumePosition > 0) {
        try {
          videoPlayer.currentTime = resumePosition;
        } catch (_) {}
      }
    };

    if (streamUrl && streamUrl.includes('.m3u8')) {
      // 1. Native HLS for Safari iOS / Mac Safari
      if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = streamUrl;
        videoPlayer.load();

        if (videoPlayer.readyState >= 1) {
          applyResumePosition();
        } else {
          const onMeta = () => {
            applyResumePosition();
            videoPlayer.removeEventListener('loadedmetadata', onMeta);
          };
          videoPlayer.addEventListener('loadedmetadata', onMeta);
        }

        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              requestPlayerFullscreen();
            })
            .catch(e => {
              console.log('Native iOS Autoplay prevented (waiting for tap):', e);
            });
        }
      }
      // 2. hls.js for Chrome, Edge, Firefox, Android
      else if (window.Hls && Hls.isSupported()) {
        if (hlsInstance) {
          try { hlsInstance.destroy(); } catch (_) {}
          hlsInstance = null;
        }
        hlsRecoveryAttempts = 0;
        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 30,
          manifestLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 2,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 3,
          nudgeMaxRetry: 5
        });
        hlsInstance.loadSource(streamUrl);
        hlsInstance.attachMedia(videoPlayer);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          applyResumePosition();
          const playPromise = videoPlayer.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                requestPlayerFullscreen();
              })
              .catch(e => console.log('Hls.js autoplay prevented (tap to play):', e));
          }
        });

        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // If CORS preflight blocked or 0 status, fallback to Web Embed immediately
                if (data.response && data.response.code === 0) {
                  console.warn('HLS stream CORS/network blocked, auto-falling back to Web Embed immediately.');
                  handlePlaybackError(streamUrl, embedUrl);
                  return;
                }
                if (hlsRecoveryAttempts < 2) {
                  hlsRecoveryAttempts++;
                  console.warn('Hls network error, reloading attempt', hlsRecoveryAttempts);
                  hlsInstance.startLoad();
                } else {
                  console.warn('Hls unrecoverable network error, auto-fallback to embed');
                  handlePlaybackError(streamUrl, embedUrl);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                if (hlsRecoveryAttempts === 0) {
                  hlsRecoveryAttempts++;
                  console.warn('Hls media error, recovering...');
                  hlsInstance.recoverMediaError();
                } else if (hlsRecoveryAttempts === 1) {
                  hlsRecoveryAttempts++;
                  console.warn('Hls media error, swapping audio codec...');
                  try { hlsInstance.swapAudioCodec(); } catch (_) {}
                  hlsInstance.recoverMediaError();
                } else {
                  console.warn('Hls unrecoverable media error, auto-fallback to embed');
                  handlePlaybackError(streamUrl, embedUrl);
                }
                break;
              default:
                console.error('Fatal unrecoverable HLS error:', data);
                handlePlaybackError(streamUrl, embedUrl);
                break;
            }
          }
        });
      }
      // 3. Fallback to direct src
      else {
        videoPlayer.src = streamUrl;
        videoPlayer.play().catch(e => {
          if (e.name !== 'NotAllowedError') {
            handlePlaybackError(streamUrl, embedUrl);
          }
        });
      }

      // Stream watchdog: only if playback was started but stalled at 0s for >10s
      streamWatchdogTimer = setTimeout(() => {
        if (currentPlayerMode === 'hls' && !videoPlayer.paused && videoPlayer.currentTime === 0) {
          console.warn('Stream watchdog detected stall at 0s, auto-falling back to embed.');
          handlePlaybackError(streamUrl, embedUrl);
        }
      }, 10000);
    } else if (embedUrl) {
      fallbackToIframe(embedUrl, false);
    } else {
      handlePlaybackError(streamUrl, embedUrl);
    }
  }

  function handlePlaybackError(streamUrl, embedUrl) {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }

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

    const is404 = streamUrl && (streamUrl.includes('kvp726.com') || streamUrl.includes('404'));
    playerErrorText.textContent = is404
      ? 'Máy chủ CDN gốc chưa tải xong tập này (Lỗi HTTP 404 từ nhà cung cấp nguồn).'
      : 'Luồng phát trực tiếp gặp lỗi hoặc máy chủ quá tải.';
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
    if (!embedUrl) {
      handlePlaybackError('', '');
      return;
    }
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }
    // Update player mode FIRST so any videoPlayer events know embed is active
    currentPlayerMode = 'embed';
    updatePlayerModeButton();
    playerErrorBanner.style.display = 'none';

    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (_) {}
      hlsInstance = null;
    }
    try {
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
    } catch (_) {}
    videoPlayer.style.display = 'none';
    iframePlayer.style.display = 'block';

    if (iframePlayer.src !== embedUrl) {
      iframePlayer.src = embedUrl;
    }

    if (isAuto) {
      showPlayerToast('⚠️ Đang phát bằng Trình phát Dự phòng (Web Embed)');
    }
    trackAndSaveHistory(true);
  }

  function trackAndSaveHistory(force = false) {
    if (!currentPlayingMovie || !currentPlayingEpisode) return;
    const currentT = Math.floor(videoPlayer.currentTime || 0);
    const rawDur = videoPlayer.duration;
    const dur = (rawDur && isFinite(rawDur) && !isNaN(rawDur) && rawDur > 0) ? Math.floor(rawDur) : 0;

    const existing = getWatchHistory().find(x => x.movieSlug === currentPlayingMovie.slug);
    const isSameEp = existing && existing.episodeSlug === currentPlayingEpisode.slug;
    const finalCurrentTime = (currentT > 0) ? currentT : (isSameEp ? (existing.currentTime || 0) : 0);
    const finalDuration = (dur > 0) ? dur : (isSameEp ? (existing.duration || 0) : 0);

    const { primary } = getMovieImageUrls(currentPlayingMovie);
    saveWatchHistoryItem({
      movieSlug: currentPlayingMovie.slug,
      movieTitle: currentPlayingMovie.name,
      posterUrl: primary,
      episodeSlug: currentPlayingEpisode.slug,
      episodeName: currentPlayingEpisode.name,
      serverName: (currentDetailEpisodes[currentServerIndex] && currentDetailEpisodes[currentServerIndex].server_name) || 'Server VIP',
      currentTime: finalCurrentTime,
      duration: finalDuration,
      timestamp: Date.now()
    });
  }

  // Next Episode Playback
  window.playNextEpisode = function () {
    if (!currentPlayingEpisode || !currentPlayingEpisodesList) return;
    const currentIdx = currentPlayingEpisodesList.findIndex(e => e.slug === currentPlayingEpisode.slug);
    if (currentIdx !== -1 && currentIdx + 1 < currentPlayingEpisodesList.length) {
      const nextEp = currentPlayingEpisodesList[currentIdx + 1];
      startVideoPlayback(
        currentPlayingMovie,
        nextEp,
        currentPlayingEpisodesList,
        (currentDetailEpisodes[currentServerIndex] && currentDetailEpisodes[currentServerIndex].server_name) || 'Server VIP'
      );
    } else {
      alert('Đã hết tập tiếp theo trong danh sách!');
    }
  };

  // Close Player
  window.closeVideoPlayer = function (fromPopState = false) {
    trackAndSaveHistory();

    if (historySaveTimer) {
      clearInterval(historySaveTimer);
      historySaveTimer = null;
    }

    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }
    currentPlayerMode = 'hls';

    // 1. Immediately mute, reset and pause HTML5 video
    try {
      videoPlayer.pause();
      videoPlayer.muted = true;
      videoPlayer.currentTime = 0;
      videoPlayer.removeAttribute('src');
      videoPlayer.src = '';
      videoPlayer.load();
    } catch (_) {}

    // 2. Fully stop and destroy HLS streaming instance
    if (hlsInstance) {
      try {
        hlsInstance.stopLoad();
        hlsInstance.detachMedia();
        hlsInstance.destroy();
      } catch (_) {}
      hlsInstance = null;
    }

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

    if (tvModeActive) {
      setTimeout(() => {
        if (detailModal && detailModal.classList.contains('open')) {
          const playBtn = detailModal.querySelector('.btn-primary');
          if (playBtn) setTvFocus(playBtn);
        } else {
          const fallback = findDefaultInitialFocus();
          if (fallback) setTvFocus(fallback);
        }
      }, 60);
    }

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
    // Auto play next episode
    const currentIdx = currentPlayingEpisodesList.findIndex(e => e.slug === currentPlayingEpisode.slug);
    if (currentIdx !== -1 && currentIdx + 1 < currentPlayingEpisodesList.length) {
      playNextEpisode();
    }
  });

  videoPlayer.addEventListener('playing', () => {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }
  });

  videoPlayer.addEventListener('error', (e) => {
    if (currentPlayerMode !== 'hls') return;
    const currentSrc = videoPlayer.getAttribute('src');
    if (!currentSrc || currentSrc === 'about:blank' || !videoPlayer.error) return;
    console.warn('HTML5 video error, auto-falling back to embed:', videoPlayer.error);
    handlePlaybackError(videoPlayer.src, currentPlayingEpisode ? currentPlayingEpisode.link_embed : '');
  });

  // Handle native iOS Safari "Done" button to cleanly exit player overlay
  videoPlayer.addEventListener('webkitendfullscreen', () => {
    closeVideoPlayer();
  });

  // Save history on pause and when user switches apps or minimizes Safari
  let lastRecordedHistorySec = 0;
  videoPlayer.addEventListener('timeupdate', () => {
    const cur = Math.floor(videoPlayer.currentTime || 0);
    if (Math.abs(cur - lastRecordedHistorySec) >= 3) {
      lastRecordedHistorySec = cur;
      trackAndSaveHistory();
    }
  });

  videoPlayer.addEventListener('pause', () => {
    if (streamWatchdogTimer) {
      clearTimeout(streamWatchdogTimer);
      streamWatchdogTimer = null;
    }
    trackAndSaveHistory();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) trackAndSaveHistory();
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
    const val = e.target.value.trim();
    searchClearBtn.style.display = val ? 'block' : 'none';

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
      const items = rawItems.filter(m => !isBrokenMovie(m.slug));

      searchStatus.innerHTML = '';

      if (items.length === 0) {
        searchStatus.innerHTML = `<div class="search-empty">Không tìm thấy phim nào khớp với "<strong>${query}</strong>".</div>`;
        return;
      }

      searchGrid.innerHTML = '';
      items.forEach(movie => {
        searchGrid.appendChild(createMovieCard(movie));
      });
    } catch (e) {
      console.error('Search error:', e);
      searchStatus.innerHTML = `<div class="search-empty">Lỗi tìm kiếm: ${e.message}</div>`;
    }
  }

  // History Screen Render
  function renderHistoryScreen() {
    const history = getWatchHistory().filter(item => !isBrokenMovie(item.movieSlug));
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
        <img class="history-thumb" src="${item.posterUrl || 'icon.png'}" alt="${item.movieTitle || 'Phim'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='icon.png';">
        <div class="history-info">
          <div class="history-title">${item.movieTitle || 'Phim'}</div>
          <div class="history-sub">${item.episodeName || 'Tập 1'} • ${item.serverName || 'VIP'}</div>
          <div class="history-sub" style="font-size:11px; color:var(--text-muted);">${progressLabel}</div>
          <div class="history-progress-wrap">
            <div class="history-progress-bar" style="width: ${Math.max(5, progressPct)}%;"></div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-resume" type="button">
            Tiếp tục
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

  // ==========================================================================
  // SMART TV REMOTE NAVIGATION SYSTEM (Samsung Tizen, LG webOS & Android TV)
  // ==========================================================================

  let currentTvFocusedEl = null;
  let tvModeActive = false;
  let tvToastTimer = null;

  function showTvToast(msg, duration = 2000) {
    const toast = document.getElementById('tv-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    if (tvToastTimer) clearTimeout(tvToastTimer);
    tvToastTimer = setTimeout(() => {
      toast.style.display = 'none';
      tvToastTimer = null;
    }, duration);
  }

  // Register Samsung Tizen & LG webOS hardware keys
  function initSmartTvDevice() {
    // 1. Samsung Tizen Input Device Key Registration
    if (typeof window.tizen !== 'undefined' && window.tizen.tvinputdevice) {
      const tizenKeys = [
        'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
        'MediaFastForward', 'MediaRewind', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
      ];
      tizenKeys.forEach(keyName => {
        try { window.tizen.tvinputdevice.registerKey(keyName); } catch (_) {}
      });
    }

    // 2. LG webOS platform ready
    if (window.PalmSystem && window.PalmSystem.stageReady) {
      try { window.PalmSystem.stageReady(); } catch (_) {}
    }

    // 3. Auto-detect TV from user-agent
    const isTvUserAgent = /SmartTV|Tizen|web0s|webOS|HbbTV|NetCast|POV_TV|Viera|BRAVIA|GoogleTV|Android.*TV|AppleTV|Roku/i.test(navigator.userAgent);
    if (isTvUserAgent) {
      document.body.classList.add('tv-mode');
      tvModeActive = true;
    }
  }

  // Comprehensive Key definitions for Samsung, LG, Android TV, PC
  const KEY_GROUPS = {
    UP: [38, 29460, 'ArrowUp', 'Up', 'UIKeyInputUpArrow', 'arrowup', 'up'],
    DOWN: [40, 29461, 'ArrowDown', 'Down', 'UIKeyInputDownArrow', 'arrowdown', 'down'],
    LEFT: [37, 4, 29459, 'ArrowLeft', 'Left', 'UIKeyInputLeftArrow', 'arrowleft', 'left'],
    RIGHT: [39, 5, 29458, 'ArrowRight', 'Right', 'UIKeyInputRightArrow', 'arrowright', 'right'],
    ENTER: [13, 29443, 'Enter', 'Select', 'Accept', 'OK', 'enter', 'ok'],
    BACK: [27, 8, 461, 10009, 'Escape', 'Backspace', 'Back', 'Return', 'GoBack', 'escape', 'back', 'return'],
    PLAY_PAUSE: [179, 10252, 32, 'MediaPlayPause', 'MediaPlay', 'MediaPause', ' '],
    FAST_FORWARD: [417, 'MediaFastForward'],
    REWIND: [412, 'MediaRewind']
  };

  function isKeyMatch(e, group) {
    if (!e) return false;
    const code = e.keyCode || e.which;
    const key = (e.key || '').toLowerCase();
    const rawCode = (e.code || '').toLowerCase();
    for (let i = 0; i < group.length; i++) {
      const item = group[i];
      if (typeof item === 'number' && code === item) return true;
      if (typeof item === 'string') {
        const lower = item.toLowerCase();
        if (key === lower || rawCode === lower) return true;
      }
    }
    return false;
  }

  function setTvFocus(element) {
    if (!element) return;
    if (currentTvFocusedEl && currentTvFocusedEl !== element) {
      currentTvFocusedEl.classList.remove('tv-focused');
    }
    currentTvFocusedEl = element;
    currentTvFocusedEl.classList.add('tv-focused');
    tvModeActive = true;
    document.body.classList.add('tv-mode');

    // 1. Vertical view alignment for TV
    const rect = element.getBoundingClientRect();
    const headerHeight = 70;
    if (rect.top < headerHeight + 20) {
      const scrollDiff = rect.top - headerHeight - 40;
      window.scrollBy({ top: scrollDiff, behavior: 'smooth' });
    } else if (rect.bottom > window.innerHeight - 80) {
      const scrollDiff = rect.bottom - window.innerHeight + 100;
      window.scrollBy({ top: scrollDiff, behavior: 'smooth' });
    }

    // 2. Horizontal centering inside horizontal rows
    const row = element.closest('.movie-row') || element.closest('.continue-row') || element.closest('.category-filter-bar') || element.closest('.server-tab-row');
    if (row) {
      const itemLeft = element.offsetLeft;
      const targetScrollLeft = Math.max(0, itemLeft - (row.clientWidth / 2) + (element.clientWidth / 2));
      try {
        row.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      } catch (_) {
        row.scrollLeft = targetScrollLeft;
      }
    }

    if (element.tagName === 'INPUT') {
      try { element.focus(); } catch (_) {}
    }
  }

  function clearTvFocus() {
    if (currentTvFocusedEl) {
      currentTvFocusedEl.classList.remove('tv-focused');
      currentTvFocusedEl = null;
    }
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  // Get logical horizontal bands (rows) on the Home Screen
  function getHomeBands() {
    const bands = [];

    // Band 0: Header (Logo, History, Search)
    const headerItems = Array.from(document.querySelectorAll('.app-header .logo-area, .app-header .icon-btn')).filter(isElementVisible);
    if (headerItems.length > 0) bands.push({ name: 'header', items: headerItems });

    // Band 1: Category Filter Pills
    const pills = Array.from(document.querySelectorAll('#category-filter-bar .pill-chip')).filter(isElementVisible);
    if (pills.length > 0) bands.push({ name: 'categories', items: pills });

    // Band 2: Billboard (Hero Banner)
    const heroButtons = Array.from(document.querySelectorAll('#hero-banner .btn-primary, #hero-banner .btn-secondary')).filter(isElementVisible);
    if (heroButtons.length > 0) bands.push({ name: 'billboard', items: heroButtons });

    // Band 3: Continue Watching Row
    const continueSection = document.getElementById('continue-watching-section');
    if (continueSection && continueSection.style.display !== 'none') {
      const continueCards = Array.from(continueSection.querySelectorAll('.continue-card')).filter(isElementVisible);
      if (continueCards.length > 0) bands.push({ name: 'continue', items: continueCards });
    }

    // Band 4+: Each Movie Section Row
    const sections = Array.from(document.querySelectorAll('#home-sections .movie-section')).filter(isElementVisible);
    sections.forEach((sec, idx) => {
      const cards = Array.from(sec.querySelectorAll('.movie-card')).filter(isElementVisible);
      if (cards.length > 0) {
        bands.push({ name: `section-${idx}`, items: cards });
      }
    });

    // Band Bottom: Bottom Nav Tabs
    const tabs = Array.from(document.querySelectorAll('.bottom-nav .nav-tab')).filter(isElementVisible);
    if (tabs.length > 0) bands.push({ name: 'tabs', items: tabs });

    return bands;
  }

  function getClosestItemByX(items, targetX) {
    if (!items || items.length === 0) return null;
    let closest = items[0];
    let minDiff = Infinity;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const r = it.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      const diff = Math.abs(centerX - targetX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = it;
      }
    }
    return closest;
  }

  function findDefaultInitialFocus() {
    // In player: back button or mode button
    if (playerOverlay && playerOverlay.classList.contains('open')) {
      const playerBtns = Array.from(playerOverlay.querySelectorAll('.icon-btn, .player-mode-btn')).filter(isElementVisible);
      return playerBtns[0] || null;
    }

    // In detail modal: play button or close button
    if (detailModal && detailModal.classList.contains('open')) {
      const playBtn = detailModal.querySelector('.btn-primary');
      if (playBtn && isElementVisible(playBtn)) return playBtn;
      const closeBtn = detailModal.querySelector('.detail-close-btn');
      if (closeBtn && isElementVisible(closeBtn)) return closeBtn;
      const anyBtn = detailModal.querySelector('button');
      if (anyBtn && isElementVisible(anyBtn)) return anyBtn;
    }

    // In Home screen
    if (currentTab === 'home') {
      const heroPlay = document.querySelector('#hero-banner .btn-primary');
      if (heroPlay && isElementVisible(heroPlay)) return heroPlay;
      const firstContinue = document.querySelector('.continue-card');
      if (firstContinue && isElementVisible(firstContinue)) return firstContinue;
      const firstCard = document.querySelector('.movie-card');
      if (firstCard && isElementVisible(firstCard)) return firstCard;
      const activePill = document.querySelector('.pill-chip.active') || document.querySelector('.pill-chip');
      if (activePill && isElementVisible(activePill)) return activePill;
    }

    // In Browse
    if (currentTab === 'browse') {
      const firstCard = document.querySelector('#browse-grid .movie-card');
      if (firstCard && isElementVisible(firstCard)) return firstCard;
    }

    // In Search
    if (currentTab === 'search') {
      if (searchInput && isElementVisible(searchInput)) return searchInput;
    }

    const anyInteractive = document.querySelector('.movie-card, .btn-primary, .pill-chip, .nav-tab');
    return anyInteractive || null;
  }

  // Hierarchical Smart TV Directional Navigator
  function navigateDirection(direction) {
    // Layer 1: Player Overlay
    if (playerOverlay && playerOverlay.classList.contains('open')) {
      const playerBtns = Array.from(playerOverlay.querySelectorAll('.icon-btn, .player-mode-btn')).filter(isElementVisible);
      if (playerBtns.length === 0) return;
      const currentIdx = playerBtns.indexOf(currentTvFocusedEl);
      if (direction === 'LEFT' && currentIdx > 0) {
        setTvFocus(playerBtns[currentIdx - 1]);
      } else if (direction === 'RIGHT' && currentIdx < playerBtns.length - 1) {
        setTvFocus(playerBtns[currentIdx + 1]);
      } else if (direction === 'UP' || direction === 'DOWN') {
        if (currentIdx === -1) setTvFocus(playerBtns[0]);
      }
      return;
    }

    // Layer 2: Detail Modal
    if (detailModal && detailModal.classList.contains('open')) {
      navigateDetailModal(direction);
      return;
    }

    // Layer 3: Home View (Hierarchical Band Navigation)
    if (currentTab === 'home') {
      navigateHomeBands(direction);
      return;
    }

    // Layer 4: Other Views (Browse Grid, Search Grid, etc.)
    navigateGeneralGrid(direction);
  }

  function navigateHomeBands(direction) {
    const bands = getHomeBands();
    if (bands.length === 0) return;

    if (!currentTvFocusedEl || !isElementVisible(currentTvFocusedEl)) {
      const initial = findDefaultInitialFocus();
      if (initial) setTvFocus(initial);
      return;
    }

    // Find current band and item index
    let currentBandIdx = -1;
    let currentItemIdx = -1;
    for (let b = 0; b < bands.length; b++) {
      const idx = bands[b].items.indexOf(currentTvFocusedEl);
      if (idx !== -1) {
        currentBandIdx = b;
        currentItemIdx = idx;
        break;
      }
    }

    // If current element is not in bands, default to initial focus
    if (currentBandIdx === -1) {
      const initial = findDefaultInitialFocus();
      if (initial) setTvFocus(initial);
      return;
    }

    const currentBand = bands[currentBandIdx];
    const currentRect = currentTvFocusedEl.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;

    switch (direction) {
      case 'UP':
        if (currentBandIdx > 0) {
          const targetBand = bands[currentBandIdx - 1];
          const closestItem = getClosestItemByX(targetBand.items, currentCenterX);
          if (closestItem) setTvFocus(closestItem);
        } else {
          // Already at top header -> scroll to absolute top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        break;

      case 'DOWN':
        if (currentBandIdx < bands.length - 1) {
          const targetBand = bands[currentBandIdx + 1];
          const closestItem = getClosestItemByX(targetBand.items, currentCenterX);
          if (closestItem) setTvFocus(closestItem);
        }
        break;

      case 'LEFT':
        if (currentItemIdx > 0) {
          setTvFocus(currentBand.items[currentItemIdx - 1]);
        }
        break;

      case 'RIGHT':
        if (currentItemIdx < currentBand.items.length - 1) {
          setTvFocus(currentBand.items[currentItemIdx + 1]);
        }
        break;
    }
  }

  function navigateDetailModal(direction) {
    const closeBtn = detailModal.querySelector('.detail-close-btn');
    const playBtn = detailModal.querySelector('.btn-primary');
    const serverBtns = Array.from(detailModal.querySelectorAll('.server-btn')).filter(isElementVisible);
    const episodeBtns = Array.from(detailModal.querySelectorAll('.episode-btn')).filter(isElementVisible);

    const isCurrent = (el) => currentTvFocusedEl === el;

    if (!currentTvFocusedEl || !isElementVisible(currentTvFocusedEl)) {
      if (playBtn) setTvFocus(playBtn);
      else if (closeBtn) setTvFocus(closeBtn);
      return;
    }

    switch (direction) {
      case 'UP':
        if (episodeBtns.some(isCurrent)) {
          const epIdx = episodeBtns.indexOf(currentTvFocusedEl);
          const cols = 5;
          if (epIdx >= cols) {
            setTvFocus(episodeBtns[epIdx - cols]);
          } else if (serverBtns.length > 0) {
            setTvFocus(serverBtns[0]);
          } else if (playBtn) {
            setTvFocus(playBtn);
          } else if (closeBtn) {
            setTvFocus(closeBtn);
          }
        } else if (serverBtns.some(isCurrent)) {
          if (playBtn) setTvFocus(playBtn);
          else if (closeBtn) setTvFocus(closeBtn);
        } else if (isCurrent(playBtn)) {
          if (closeBtn) setTvFocus(closeBtn);
        }
        break;

      case 'DOWN':
        if (isCurrent(closeBtn)) {
          if (playBtn) setTvFocus(playBtn);
          else if (serverBtns.length > 0) setTvFocus(serverBtns[0]);
          else if (episodeBtns.length > 0) setTvFocus(episodeBtns[0]);
        } else if (isCurrent(playBtn)) {
          if (serverBtns.length > 0) setTvFocus(serverBtns[0]);
          else if (episodeBtns.length > 0) setTvFocus(episodeBtns[0]);
        } else if (serverBtns.some(isCurrent)) {
          if (episodeBtns.length > 0) setTvFocus(episodeBtns[0]);
        } else if (episodeBtns.some(isCurrent)) {
          const epIdx = episodeBtns.indexOf(currentTvFocusedEl);
          const cols = 5;
          if (epIdx + cols < episodeBtns.length) {
            setTvFocus(episodeBtns[epIdx + cols]);
          }
        }
        break;

      case 'LEFT':
        if (serverBtns.some(isCurrent)) {
          const idx = serverBtns.indexOf(currentTvFocusedEl);
          if (idx > 0) setTvFocus(serverBtns[idx - 1]);
        } else if (episodeBtns.some(isCurrent)) {
          const idx = episodeBtns.indexOf(currentTvFocusedEl);
          if (idx > 0) setTvFocus(episodeBtns[idx - 1]);
        }
        break;

      case 'RIGHT':
        if (serverBtns.some(isCurrent)) {
          const idx = serverBtns.indexOf(currentTvFocusedEl);
          if (idx < serverBtns.length - 1) setTvFocus(serverBtns[idx + 1]);
        } else if (episodeBtns.some(isCurrent)) {
          const idx = episodeBtns.indexOf(currentTvFocusedEl);
          if (idx < episodeBtns.length - 1) setTvFocus(episodeBtns[idx + 1]);
        }
        break;
    }
  }

  function navigateGeneralGrid(direction) {
    const candidates = Array.from(document.querySelectorAll(
      '.nav-tab, .pill-chip, .movie-card, #search-input, #browse-load-more, button, a'
    )).filter(isElementVisible);

    if (candidates.length === 0) return;
    if (!currentTvFocusedEl || !isElementVisible(currentTvFocusedEl)) {
      setTvFocus(candidates[0]);
      return;
    }

    const currentRect = currentTvFocusedEl.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let best = null;
    let minScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (cand === currentTvFocusedEl) continue;

      const r = cand.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;

      let dx = 0;
      let dy = 0;

      switch (direction) {
        case 'UP':
          if (r.bottom <= currentRect.bottom - 4 || centerY < currentCenterY - 6) {
            dy = Math.max(0, currentRect.top - r.bottom);
            dx = Math.abs(centerX - currentCenterX);
            const score = dy + 2.0 * dx;
            if (score < minScore) {
              minScore = score;
              best = cand;
            }
          }
          break;

        case 'DOWN':
          if (r.top >= currentRect.top + 4 || centerY > currentCenterY + 6) {
            dy = Math.max(0, r.top - currentRect.bottom);
            dx = Math.abs(centerX - currentCenterX);
            const score = dy + 2.0 * dx;
            if (score < minScore) {
              minScore = score;
              best = cand;
            }
          }
          break;

        case 'LEFT':
          if (r.right <= currentRect.right - 4 || centerX < currentCenterX - 6) {
            dx = Math.max(0, currentRect.left - r.right);
            dy = Math.abs(centerY - currentCenterY);
            const score = dx + 3.0 * dy;
            if (score < minScore) {
              minScore = score;
              best = cand;
            }
          }
          break;

        case 'RIGHT':
          if (r.left >= currentRect.left + 4 || centerX > currentCenterX + 6) {
            dx = Math.max(0, r.left - currentRect.right);
            dy = Math.abs(centerY - currentCenterY);
            const score = dx + 3.0 * dy;
            if (score < minScore) {
              minScore = score;
              best = cand;
            }
          }
          break;
      }
    }

    if (best) {
      setTvFocus(best);
    }
  }

  // Master Remote Control Event Handler
  let backPressCount = 0;
  let backPressResetTimer = null;

  window.addEventListener('keydown', (e) => {
    // 1. BACK Key Handling (Samsung 10009, webOS 461, Escape 27, Backspace 8)
    if (isKeyMatch(e, KEY_GROUPS.BACK)) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        document.activeElement.blur();
        e.preventDefault();
        return;
      }

      if (playerOverlay && playerOverlay.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeVideoPlayer();
        return;
      }

      if (detailModal && detailModal.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeMovieDetail();
        return;
      }

      if (currentTab !== 'home') {
        e.preventDefault();
        switchTabDirect('home');
        return;
      }

      backPressCount++;
      if (backPressCount === 1) {
        showTvToast('Nhấn BACK lần nữa để thoát Kho Phim', 2500);
        if (backPressResetTimer) clearTimeout(backPressResetTimer);
        backPressResetTimer = setTimeout(() => {
          backPressCount = 0;
        }, 2500);
        e.preventDefault();
        return;
      } else {
        try {
          if (typeof window.tizen !== 'undefined' && window.tizen.application) {
            window.tizen.application.getCurrentApplication().exit();
          } else if (window.close) {
            window.close();
          }
        } catch (_) {}
      }
      return;
    }

    // 2. In Player Overlay Video Controls (Seek / Volume)
    if (playerOverlay && playerOverlay.classList.contains('open')) {
      if (isKeyMatch(e, KEY_GROUPS.LEFT) || isKeyMatch(e, KEY_GROUPS.REWIND)) {
        e.preventDefault();
        if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
          videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
          showTvToast(`⏪ -10s (${formatTime(videoPlayer.currentTime)})`);
        }
        return;
      }

      if (isKeyMatch(e, KEY_GROUPS.RIGHT) || isKeyMatch(e, KEY_GROUPS.FAST_FORWARD)) {
        e.preventDefault();
        if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
          const maxDur = (videoPlayer.duration && isFinite(videoPlayer.duration)) ? videoPlayer.duration : 999999;
          videoPlayer.currentTime = Math.min(maxDur, videoPlayer.currentTime + 10);
          showTvToast(`⏩ +10s (${formatTime(videoPlayer.currentTime)})`);
        }
        return;
      }

      if (isKeyMatch(e, KEY_GROUPS.PLAY_PAUSE)) {
        e.preventDefault();
        if (videoPlayer) {
          if (videoPlayer.paused) {
            videoPlayer.play().catch(() => {});
            showTvToast('▶️ Đang phát');
          } else {
            videoPlayer.pause();
            showTvToast('⏸️ Tạm dừng');
          }
        }
        return;
      }
    }

    // 3. Arrow Keys Navigation (D-Pad UP, DOWN, LEFT, RIGHT)
    let dir = null;
    if (isKeyMatch(e, KEY_GROUPS.UP)) dir = 'UP';
    else if (isKeyMatch(e, KEY_GROUPS.DOWN)) dir = 'DOWN';
    else if (isKeyMatch(e, KEY_GROUPS.LEFT)) dir = 'LEFT';
    else if (isKeyMatch(e, KEY_GROUPS.RIGHT)) dir = 'RIGHT';

    if (dir) {
      e.preventDefault();
      navigateDirection(dir);
      return;
    }

    // 4. ENTER / OK Key Handling
    if (isKeyMatch(e, KEY_GROUPS.ENTER)) {
      if (playerOverlay && playerOverlay.classList.contains('open')) {
        // In player, Enter toggles play/pause unless a button is explicitly focused
        if (currentTvFocusedEl && currentTvFocusedEl !== videoPlayer && currentTvFocusedEl.closest('.player-header')) {
          currentTvFocusedEl.click();
        } else if (videoPlayer) {
          if (videoPlayer.paused) {
            videoPlayer.play().catch(() => {});
            showTvToast('▶️ Đang phát');
          } else {
            videoPlayer.pause();
            showTvToast('⏸️ Tạm dừng');
          }
        }
        e.preventDefault();
        return;
      }

      if (currentTvFocusedEl) {
        e.preventDefault();
        if (currentTvFocusedEl.tagName === 'INPUT') {
          currentTvFocusedEl.focus();
        } else {
          currentTvFocusedEl.click();
        }
      }
      return;
    }
  });

  // Initialize Smart TV integrations
  initSmartTvDevice();

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
    renderContinueWatchingHome,
    setTvFocus,
    clearTvFocus,
    navigateDirection,
    getHomeBands,
    findDefaultInitialFocus,
    isKeyMatch,
    KEY_GROUPS,
    showTvToast
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
