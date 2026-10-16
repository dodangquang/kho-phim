// Kho Phim Web Application - iPhone & Mobile Optimized
(function () {
  'use strict';

  // API Config
  const API_BASE = 'https://phimapi.com';
  const IMG_BASE = 'https://phimimg.com';

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
  const iframePlayer = document.getElementById('iframe-player');
  const playerErrorBanner = document.getElementById('player-error-banner');
  const playerErrorText = document.getElementById('player-error-text');
  const playerSwitchModeBtn = document.getElementById('player-switch-mode-btn');
  const playerToast = document.getElementById('player-toast');

  // Categories Definition
  const CATEGORIES = [
    { id: 'all', title: 'Tất cả' },
    { id: 'phim-thuyet-minh', title: '🎙️ Thuyết Minh', path: 'v1/api/danh-sach/phim-thuyet-minh' },
    { id: 'phim-long-tieng', title: '🎧 Lồng Tiếng', path: 'v1/api/danh-sach/phim-long-tieng' },
    { id: 'viet-nam', title: '🇻🇳 Việt Nam', path: 'v1/api/quoc-gia/viet-nam' },
    { id: 'phim-moi', title: '🔥 Phim Mới', path: 'danh-sach/phim-moi-cap-nhat', legacy: true },
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
      return JSON.parse(localStorage.getItem('khophim_history') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveWatchHistoryItem(item) {
    let list = getWatchHistory();
    list = list.filter(x => x.movieSlug !== item.movieSlug);
    list.unshift(item);
    if (list.length > 50) list = list.slice(0, 50);
    localStorage.setItem('khophim_history', JSON.stringify(list));
  }

  function removeWatchHistoryItem(slug) {
    let list = getWatchHistory().filter(x => x.movieSlug !== slug);
    localStorage.setItem('khophim_history', JSON.stringify(list));
    renderHistoryScreen();
  }

  function clearAllWatchHistory() {
    if (confirm('Bạn có chắc chắn muốn xoá toàn bộ lịch sử xem không?')) {
      localStorage.removeItem('khophim_history');
      renderHistoryScreen();
    }
  }

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
      pill.textContent = cat.title;
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
      const items = (data.data && data.data.items) ? data.data.items : (data.items || []);
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
  async function loadCategoryBrowse(cat, page = 1) {
    categoryPage = page;
    browseTitle.textContent = cat.title;
    switchTab('browse');

    if (page === 1) {
      browseGrid.innerHTML = '<div class="spinner"></div>';
    }

    const { items, totalPages } = await fetchCategory(cat, page);
    categoryTotalPages = totalPages;

    if (page === 1) {
      browseGrid.innerHTML = '';
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

    browseLoadMoreBtn.style.display = categoryPage < categoryTotalPages ? 'block' : 'none';
  }

  if (browseLoadMoreBtn) {
    browseLoadMoreBtn.onclick = () => {
      const cat = CATEGORIES.find(c => c.id === activeCategory);
      if (cat && categoryPage < categoryTotalPages) {
        loadCategoryBrowse(cat, categoryPage + 1);
      }
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

  // Load Home Screen
  async function loadHomeScreen() {
    homeSectionsContainer.innerHTML = '<div class="spinner"></div>';

    // Fetch top sections in parallel
    const homeSectionsDef = [
      CATEGORIES.find(c => c.id === 'phim-thuyet-minh'),
      CATEGORIES.find(c => c.id === 'phim-long-tieng'),
      CATEGORIES.find(c => c.id === 'viet-nam'),
      CATEGORIES.find(c => c.id === 'phim-moi'),
      CATEGORIES.find(c => c.id === 'phim-chieu-rap'),
      CATEGORIES.find(c => c.id === 'phim-bo'),
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
          <span class="hero-badge" style="background:var(--accent-red);">${badge}</span>
          ${year ? `<span class="hero-badge">${year}</span>` : ''}
          ${ep ? `<span class="hero-badge">${ep}</span>` : ''}
        </div>
        <h1 class="hero-title">${movie.name}</h1>
        <div class="hero-buttons">
          <button class="btn-primary" onclick="openMovieDetail('${movie.slug}', true)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Xem ngay
          </button>
          <button class="btn-secondary" onclick="openMovieDetail('${movie.slug}')">
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

      if (!json || !json.movie) {
        detailModal.innerHTML = `
          <div class="detail-modal" style="padding:40px; text-align:center;">
            <p>Không tìm thấy thông tin phim.</p>
            <button class="btn-primary" style="margin-top:16px;" onclick="closeMovieDetail()">Đóng</button>
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
    if (!fromPopState && window.location.hash.startsWith('#detail-')) {
      history.back();
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

    playerErrorText.textContent = 'Luồng phát trực tiếp gặp lỗi hoặc máy chủ quá tải.';
    playerErrorBanner.style.display = 'block';

    const embedBtn = document.getElementById('player-try-embed-btn');
    if (embedUrl) {
      embedBtn.style.display = 'inline-flex';
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
  }

  function trackAndSaveHistory() {
    if (!currentPlayingMovie || !currentPlayingEpisode) return;
    if (videoPlayer.currentTime > 2 && videoPlayer.duration > 0) {
      const { primary } = getMovieImageUrls(currentPlayingMovie);
      saveWatchHistoryItem({
        movieSlug: currentPlayingMovie.slug,
        movieTitle: currentPlayingMovie.name,
        posterUrl: primary,
        episodeSlug: currentPlayingEpisode.slug,
        episodeName: currentPlayingEpisode.name,
        serverName: currentDetailEpisodes[currentServerIndex]?.server_name || 'Server VIP',
        currentTime: Math.floor(videoPlayer.currentTime),
        duration: Math.floor(videoPlayer.duration),
        timestamp: Date.now()
      });
    }
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
        currentDetailEpisodes[currentServerIndex]?.server_name || 'Server VIP'
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

    videoPlayer.pause();
    videoPlayer.src = '';
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (_) {}
      hlsInstance = null;
    }
    iframePlayer.src = 'about:blank';
    iframePlayer.style.display = 'none';
    videoPlayer.style.display = 'block';

    playerOverlay.classList.remove('open');

    if (!fromPopState && window.location.hash.startsWith('#player-')) {
      history.back();
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
    handlePlaybackError(videoPlayer.src, currentPlayingEpisode?.link_embed);
  });

  // Handle native iOS Safari "Done" button to cleanly exit player overlay
  videoPlayer.addEventListener('webkitendfullscreen', () => {
    closeVideoPlayer();
  });

  // Save history on pause and when user switches apps or minimizes Safari
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
      const items = (data.data && data.data.items) ? data.data.items : [];

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
    const history = getWatchHistory();
    if (history.length === 0) {
      historyEmpty.style.display = 'block';
      historyList.innerHTML = '';
      return;
    }

    historyEmpty.style.display = 'none';
    historyList.innerHTML = '';

    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item';

      const progressPct = Math.min(100, Math.round((item.currentTime / (item.duration || 1)) * 100));
      const formattedCurrent = formatTime(item.currentTime);
      const formattedTotal = formatTime(item.duration);

      card.innerHTML = `
        <img class="history-thumb" src="${item.posterUrl}" alt="${item.movieTitle}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='icon.png';">
        <div class="history-info">
          <div class="history-title">${item.movieTitle}</div>
          <div class="history-sub">${item.episodeName} • ${item.serverName || 'VIP'}</div>
          <div class="history-sub" style="font-size:11px; color:var(--text-muted);">${formattedCurrent} / ${formattedTotal} (${progressPct}%)</div>
          <div class="history-progress-wrap">
            <div class="history-progress-bar" style="width: ${progressPct}%;"></div>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-resume" onclick="openMovieDetail('${item.movieSlug}', true)">
            Tiếp tục
          </button>
          <button class="icon-btn" onclick="removeHistoryItemDirect('${item.movieSlug}')" title="Xoá">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-muted)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;
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
    formatImageUrl,
    resolveImageUrl,
    getMovieImageUrls,
    startVideoPlayback,
    fallbackToIframe,
    handlePlaybackError
  };

  // App Init
  renderCategoryPills();
  loadHomeScreen();

})();
