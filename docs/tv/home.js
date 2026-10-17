/* Same eleven shelves as the original UI; only visible shelves own live cards.
   ES5, one cancellable catalog request, visible shelves only, six films per shelf. */
(function (global) {
  'use strict';
  var C = global.KhoCore;
  var definitions = [
    ['🎙️ Phim Thuyết Minh', 'danh-sach/phim-thuyet-minh'],
    ['🎧 Phim Lồng Tiếng', 'danh-sach/phim-long-tieng'],
    ['🇻🇳 Phim Việt Nam', 'quoc-gia/viet-nam'],
    ['⚡ Mới Cập Nhật Tập Mới', 'danh-sach/phim-moi'],
    ['🍿 Chiếu Rạp Đặc Sắc', 'danh-sach/phim-chieu-rap'],
    ['📺 Phim Bộ Hot', 'danh-sach/phim-bo'],
    ['⚔️ Phim Hành Động', 'the-loai/hanh-dong'],
    ['💥 Anime / Hoạt Hình', 'danh-sach/hoat-hinh'],
    ['👻 Phim Kinh Dị', 'the-loai/kinh-di'],
    ['🚀 Viễn Tưởng', 'the-loai/vien-tuong'],
    ['🌸 Tình Cảm', 'the-loai/tinh-cam']
  ];
  function Home(options) {
    this.options = options;
    this.main = document.getElementById('main');
    this.container = document.getElementById('shelves');
    this.request = new C.Request();
    this.cache = new C.Cache(6);
    this.shelves = [];
    this.active = false;
    this.loading = -1;
    this.priority = 0;
    this.hero = null;
    this.frame = null;
    this.continueStamp = '';
    var self = this;
    definitions.forEach(function (definition, index) {
      var section = document.createElement('div');
      section.className = 'tv-shelf-section';
      section.setAttribute('data-shelf', index);
      var title = document.createElement('h2');
      title.className = 'shelf-title';
      title.textContent = definition[0];
      var arrow = document.createElement('span');
      arrow.className = 'shelf-more-badge';
      arrow.textContent = '›';
      title.appendChild(arrow);
      var row = document.createElement('div');
      row.className = 'tv-shelf-row';
      section.appendChild(title);
      section.appendChild(row);
      self.container.appendChild(section);
      var shelf = { index: index, path: definition[1], section: section, row: row, page: 1, total: 1, sourceSize: C.PAGE_SIZE, mounted: false, result: null, error: false };
      self.shelves.push(shelf);
      self.placeholder(shelf, 'Đang tải phim...');
      row.addEventListener('scroll', function () { if (shelf.mounted) self.options.images(row); });
    });
    this.main.addEventListener('scroll', function () {
      if (!self.active || self.frame !== null) return;
      self.frame = global.requestAnimationFrame(function () { self.frame = null; self.updateWindow(); });
    });
    document.getElementById('continue-row').addEventListener('scroll', function () { self.options.images(this); });
  }
  Home.prototype.placeholder = function (shelf, label) {
    shelf.row.textContent = '';
    global.KhoPosters.prune();
    var self = this;
    var placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.className = 'shelf-placeholder';
    placeholder.textContent = label;
    placeholder.onclick = function () { shelf.error = false; self.prioritize(shelf.index); self.pump(); };
    shelf.row.appendChild(placeholder);
    shelf.result = null;
  };
  Home.prototype.setHero = function (item, imageDomain) {
    if (this.hero || !item) return;
    this.hero = item;
    document.getElementById('hero-title').textContent = item.name || item.origin_name || item.slug;
    document.getElementById('hero-year').textContent = item.year || 'MỚI CẬP NHẬT';
    document.getElementById('hero-quality').textContent = item.quality || 'HD';
    document.getElementById('hero-overview').textContent = item.content ? String(item.content).replace(/<[^>]*>/g, '').slice(0, 300) : 'Khám phá những bộ phim hấp dẫn nhất. Trải nghiệm điện ảnh chất lượng cao ngay trên Smart TV của bạn.';
    this.heroImage = C.image(item.thumb_url || item.poster_url, imageDomain);
    document.getElementById('hero-image').src = this.heroImage;
    var self = this;
    var play = document.getElementById('hero-play');
    var detail = document.getElementById('hero-detail');
    play.disabled = detail.disabled = false;
    play.onclick = function () { self.options.open(item.slug, true); };
    detail.onclick = function () { self.options.open(item.slug, false); };
    this.options.changed();
  };
  Home.prototype.continueWatching = function () {
    var list = C.history().slice(0, C.PAGE_SIZE);
    var stamp = JSON.stringify(list);
    if (stamp === this.continueStamp) return;
    this.continueStamp = stamp;
    var section = document.getElementById('continue-section');
    section.classList.toggle('hidden', !list.length);
    var row = document.getElementById('continue-row');
    row.textContent = '';
    var self = this;
    list.forEach(function (item) { row.appendChild(self.options.card(item, true, 'https://phimimg.com')); });
    this.options.images(row);
  };
  Home.prototype.activate = function () {
    this.active = true;
    if (this.heroImage) document.getElementById('hero-image').src = this.heroImage;
    this.continueWatching();
    this.options.images(document.getElementById('continue-row'));
    this.updateWindow();
  };
  Home.prototype.pause = function (release) {
    this.active = false;
    this.request.cancel();
    this.loading = -1;
    if (this.frame !== null) { global.cancelAnimationFrame(this.frame); this.frame = null; }
    if (release) {
      var self = this;
      this.shelves.forEach(function (shelf) {
        shelf.mounted = false;
        self.placeholder(shelf, 'Tải danh sách phim');
      });
      document.getElementById('continue-row').textContent = '';
      document.getElementById('hero-image').removeAttribute('src');
      this.continueStamp = '';
    }
  };
  Home.prototype.clear = function () {
    this.pause(true);
    this.cache.clear();
    this.hero = null;
    this.heroImage = '';
    document.getElementById('hero-play').disabled = document.getElementById('hero-detail').disabled = true;
    document.getElementById('hero-image').removeAttribute('src');
    this.shelves.forEach(function (shelf) { shelf.result = null; shelf.error = false; shelf.mounted = false; });
  };
  Home.prototype.releaseImages = function () {
    Array.prototype.forEach.call(document.getElementById('home').querySelectorAll('img[src]'), function (image) { image.removeAttribute('src'); });
    global.KhoPosters.release(document.getElementById('home'));
  };
  Home.prototype.prioritize = function (index) {
    this.priority = index;
    if (this.loading !== -1 && this.loading !== index && !this.shelves[index].result) {
      this.request.cancel(); this.loading = -1;
    }
  };
  Home.prototype.updateWindow = function () {
    if (!this.active) return;
    var top = this.main.scrollTop;
    var base = this.container.offsetTop;
    var first = Math.max(0, Math.min(this.shelves.length - 1, Math.floor((top - base) / C.SHELF_HEIGHT)));
    var lastVisible = Math.max(first, Math.min(this.shelves.length - 1, Math.floor((top + this.main.clientHeight - base - 1) / C.SHELF_HEIGHT)));
    var last = Math.min(lastVisible, first + 2);
    var self = this;
    this.shelves.forEach(function (shelf, index) {
      var wanted = index >= first && index <= last;
      if (!wanted && shelf.mounted) {
        shelf.mounted = false;
        self.placeholder(shelf, 'Tải danh sách phim');
      } else if (wanted && !shelf.mounted) {
        shelf.mounted = true;
        shelf.error = false;
        var saved = self.cache.get(shelf.path + '|' + shelf.page);
        if (saved) self.render(shelf, saved);
      }
      if (wanted && shelf.result) self.options.images(shelf.row);
    });
    if (this.loading !== -1 && !this.shelves[this.loading].mounted) { this.request.cancel(); this.loading = -1; }
    this.options.changed();
    this.pump();
  };
  Home.prototype.pump = function () {
    if (!this.active || this.loading !== -1) return;
    var target = null;
    var preferred = this.shelves[this.priority];
    if (preferred && preferred.mounted && !preferred.result && !preferred.error) target = preferred;
    for (var i = 0; !target && i < this.shelves.length; i++) {
      if (this.shelves[i].mounted && !this.shelves[i].result && !this.shelves[i].error) target = this.shelves[i];
    }
    if (!target) return;
    this.loading = target.index;
    var self = this;
    var sourcePage = Math.floor((target.page - 1) * C.PAGE_SIZE / target.sourceSize) + 1;
    var url = 'https://phimapi.com/v1/api/' + target.path + '?page=' + sourcePage + '&limit=' + C.PAGE_SIZE;
    this.request.get([url], function (error, data) {
      self.loading = -1;
      if (!self.active || !target.mounted) return;
      if (error) {
        target.error = true;
        var wasFocused = target.row.contains(document.activeElement);
        self.placeholder(target, 'Không tải được · Thử lại');
        if (wasFocused) self.options.focus(target.row.firstChild);
        if (!self.hero) document.getElementById('hero-overview').textContent = 'Không tải được dữ liệu. Kiểm tra kết nối mạng và chọn Thử lại ở kệ phim bên dưới.';
        document.getElementById('home-status').textContent = error.message;
      } else {
        var result = C.list(data, target.page);
        target.sourceSize = result.sourceSize;
        self.cache.set(target.path + '|' + target.page, result);
        self.render(target, result);
        if (target.index === 0) self.setHero(result.items[0], result.imageDomain);
        document.getElementById('home-status').textContent = '';
      }
      self.options.changed();
      self.pump();
    }, function (json) { return Array.isArray((json.data || json).items); });
  };
  Home.prototype.render = function (shelf, result) {
    var wasFocused = shelf.row.contains(document.activeElement);
    shelf.result = result;
    shelf.total = result.totalPages;
    shelf.row.textContent = '';
    var self = this;
    function more(delta) {
      var node = document.createElement('button');
      node.type = 'button';
      node.className = 'tv-card-more';
      var circle = document.createElement('span');
      circle.className = 'tv-card-more-circle';
      circle.textContent = delta > 0 ? '›' : '‹';
      var title = document.createElement('span');
      title.className = 'tv-card-more-title';
      title.textContent = delta > 0 ? 'Xem Thêm' : 'Quay Lại';
      var sub = document.createElement('span');
      sub.className = 'tv-card-more-sub';
      sub.textContent = 'Trang ' + (shelf.page + delta);
      node.appendChild(circle); node.appendChild(title); node.appendChild(sub);
      node.onclick = function () {
        shelf.page += delta;
        shelf.error = false;
        self.placeholder(shelf, 'Đang tải phim...');
        shelf.row.scrollLeft = 0;
        self.prioritize(shelf.index);
        self.options.focus(shelf.row.firstChild);
        self.options.changed();
        var saved = self.cache.get(shelf.path + '|' + shelf.page);
        if (saved) { self.render(shelf, saved); self.options.changed(); }
        else self.pump();
      };
      return node;
    }
    if (shelf.page > 1) shelf.row.appendChild(more(-1));
    result.items.forEach(function (item) { shelf.row.appendChild(self.options.card(item, false, result.imageDomain)); });
    if (shelf.page < shelf.total) shelf.row.appendChild(more(1));
    if (!shelf.row.children.length) {
      var empty = document.createElement('button');
      empty.className = 'shelf-placeholder'; empty.textContent = 'Chưa có phim · Tải lại';
      empty.onclick = function () { shelf.result = null; shelf.error = false; self.priority = shelf.index; self.pump(); };
      shelf.row.appendChild(empty);
    }
    this.options.images(shelf.row);
    if (wasFocused) this.options.focus(shelf.row.querySelector('.tv-card') || shelf.row.firstChild);
  };
  Home.prototype.rows = function () {
    var rows = [];
    var heroButtons = [document.getElementById('hero-play'), document.getElementById('hero-detail')].filter(function (node) { return !node.disabled; });
    if (heroButtons.length) rows.push(heroButtons);
    var continuing = document.getElementById('continue-row');
    if (continuing.children.length) rows.push(Array.prototype.slice.call(continuing.children));
    this.shelves.forEach(function (shelf) { rows.push(Array.prototype.slice.call(shelf.row.children)); });
    return rows;
  };
  Home.prototype.reveal = function (node) {
    if (node.closest('.hero-content')) { this.main.scrollTop = 0; return; }
    var row = node.closest('.tv-shelf-row');
    if (!row) return;
    var index = Number(row.parentNode.getAttribute('data-shelf'));
    if (row.parentNode.hasAttribute('data-shelf')) this.prioritize(index);
    var left = node.offsetLeft - 52;
    if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left);
    else if (node.offsetLeft + node.offsetWidth > row.scrollLeft + row.clientWidth - 52) row.scrollLeft = node.offsetLeft + node.offsetWidth - row.clientWidth + 70;
    var section = row.parentNode;
    var sectionTop = section.offsetTop;
    var sectionBottom = sectionTop + section.offsetHeight;
    if (sectionTop < this.main.scrollTop + 25) this.main.scrollTop = Math.max(0, sectionTop - 25);
    else if (sectionBottom > this.main.scrollTop + this.main.clientHeight - 25) this.main.scrollTop = sectionBottom - this.main.clientHeight + 25;
    this.options.images(row);
    this.updateWindow();
  };
  global.KhoHome = Home;
}(window));
