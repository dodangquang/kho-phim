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

  const VN_FLAG_SVG = '<svg viewBox="0 0 30 20" width="20" height="13" style="display:inline-block; vertical-align:middle; border-radius:2px; margin-right:6px; box-shadow:0 1px 3px rgba(0,0,0,0.5);"><rect width="30" height="20" fill="#da251d"/><polygon points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15" fill="#ffff00"/></svg>';

  const HOME_SECTIONS = [
    { title: '⚡ Phim Mới Cập Nhật', path: 'danh-sach/phim-moi-cap-nhat' },
    { title: '🎙️ Phim Thuyết Minh', path: 'danh-sach/phim-thuyet-minh' },
    { title: '🎧 Phim Lồng Tiếng', path: 'danh-sach/phim-long-tieng' },
    { title: `${VN_FLAG_SVG} Phim Việt Nam`, path: 'quoc-gia/viet-nam' },
    { title: '🍿 Chiếu Rạp Đặc Sắc', path: 'danh-sach/phim-chieu-rap' },
    { title: '📺 Phim Bộ Hot', path: 'danh-sach/phim-bo' },
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
  let hlsInstance = null;
  let currentPlayerMode = 'hls'; // 'hls' or 'embed'
  let streamWatchdogTimer = null;
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
    return 'https://phimimg.com/' + trimmed.replace(/^\/+/, '');
  }

  function resolveMovieImages(item) {
    if (!item) return { poster: 'icon.png', banner: 'icon.png', fallback: 'icon.png' };
    const rawPoster = String(item.poster_url || item.posterUrl || '').trim();
    const rawThumb = String(item.thumb_url || item.thumbUrl || '').trim();

    const formattedPoster = formatImageUrl(rawPoster);
    const formattedThumb = formatImageUrl(rawThumb);

    const posterBlocked = isBlockedDomain(formattedPoster);
    const thumbBlocked = isBlockedDomain(formattedThumb);
    const posterIsCdn = formattedPoster.includes('phimimg.com') && !posterBlocked;
    const thumbIsCdn = formattedThumb.includes('phimimg.com') && !thumbBlocked;

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
    let heroList = await fetchCategoryMovies(HOME_SECTIONS[0].path, 1);
    if (heroList.length === 0) {
      heroList = await fetchCategoryMovies('danh-sach/phim-thuyet-minh', 1);
    }
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
          <span class="hero-badge red">${quality}</span>
          <span class="hero-badge">${year}</span>
          <span class="hero-badge">${epBadge}</span>
        </div>
        <h1 class="hero-title">${title}</h1>
        <p class="hero-overview">${movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : 'Trải nghiệm xem phim chất lượng cao Full HD, Vietsub, Thuyết minh miễn phí trên máy tính.'}</p>
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
        <img src="${poster}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
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
          <img src="${item.banner || item.poster}" alt="${item.title}" loading="lazy" onerror="this.onerror=null; this.src='icon.png';">
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
    enableDragScroll(serverTabsEl);

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
    const backBtn = document.getElementById('tv-detail-back-btn');
    if (backBtn) backBtn.onclick = closeMovieDetail;

    detailModal.classList.add('open');
    detailModal.scrollTop = 0;

    if (autoPlay && currentEpisodeList.length > 0) {
      const epToPlay = (history && currentEpisodeList.find(e => e.slug === history.episodeSlug)) || currentEpisodeList[0];
      if (epToPlay) {
        setTimeout(() => startVideoPlayback(epToPlay, history ? history.positionMs : 0), 200);
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

    // Connect player buttons
    const sourceToggleBtn = document.getElementById('tv-player-source-toggle-btn');
    if (sourceToggleBtn) sourceToggleBtn.onclick = togglePlayerSource;

    const fsBtn = document.getElementById('tv-player-btn-fullscreen');
    if (fsBtn) fsBtn.onclick = toggleFullscreen;

    const closeBtn = document.getElementById('tv-player-btn-close');
    if (closeBtn) closeBtn.onclick = closeVideoPlayer;
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
            showPlaybackError('Máy chủ trực tiếp bị lỗi hoặc chặn kết nối.');
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
      } else {
        tryEmbedBtn.style.display = 'none';
        backBtn.onclick = closeVideoPlayer;
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

    // Exit fullscreen if active
    if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (_) {}
    }
  }

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

  // Update HUD progress bar during playback
  videoPlayer.ontimeupdate = () => {
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

  // Interactive progress bar click to seek
  const progressWrap = document.getElementById('tv-player-progress-wrap');
  if (progressWrap) {
    progressWrap.onclick = (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      if (videoPlayer.duration && !isNaN(videoPlayer.duration)) {
        videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration, pos * videoPlayer.duration));
        showPlayerHud(2500);
      }
    };
  }

  // Player overlay mouse interactions
  playerOverlay.addEventListener('mousemove', () => {
    showPlayerHud(3000);
  });

  videoPlayer.addEventListener('click', () => {
    if (videoPlayer.paused) {
      videoPlayer.play().catch(() => {});
      showToast('▶️ Đang phát');
    } else {
      videoPlayer.pause();
      showToast('⏸️ Tạm dừng');
    }
    showPlayerHud(3000);
  });

  videoPlayer.addEventListener('dblclick', () => {
    toggleFullscreen();
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
      // Space: Play / Pause
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        if (videoPlayer) {
          if (videoPlayer.paused) {
            videoPlayer.play().catch(() => {});
            showToast('▶️ Đang phát');
          } else {
            videoPlayer.pause();
            showToast('⏸️ Tạm dừng');
          }
          showPlayerHud(3000);
        }
        return;
      }

      // Left Arrow: Seek back 10s
      if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault();
        if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
          videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
          showToast('⏪ -10 giây');
          showPlayerHud(2500);
        }
        return;
      }

      // Right Arrow: Seek forward 10s
      if (e.key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault();
        if (videoPlayer && !isNaN(videoPlayer.currentTime)) {
          videoPlayer.currentTime = Math.min(videoPlayer.duration || 99999, videoPlayer.currentTime + 10);
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

})();
