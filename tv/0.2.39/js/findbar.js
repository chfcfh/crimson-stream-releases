/* Search with the random pick's choices (owner's request): the kind, country or form, genres, rating, time, length and "seen", plus
   «الأكثر مشاهدة», which puts first what the most people watched under whatever is chosen. The choices are buttons in one line; each
   opens a small list, as the source filter does. Asked of crimson-hub (/cat/find). The search screen itself is in views.js. */
(function () {
  var h = CS.h;
  var DEFAULTS = { kind: 'all', form: 'any', country: '', genres: [], min: 0, era: '', short: false, sort: 'popular', hideSeen: false };
  var KINDS = [['all', 'الكل'], ['movie', 'أفلام'], ['series', 'مسلسلات'], ['anime', 'أنمي']];
  var FORMS = [['any', 'أي واحد'], ['series', 'مسلسل'], ['movie', 'فيلم']];
  var COUNTRIES = [['', 'أي بلد'], ['KR', 'كوري'], ['JP', 'ياباني'], ['US', 'أمريكي'], ['GB', 'بريطاني'], ['TR', 'تركي'], ['IN', 'هندي'], ['ES', 'إسباني'], ['TH', 'تايلندي'], ['CN', 'صيني'], ['FR', 'فرنسي']];
  var GENRES = [['', 'الكل'], ['action', 'أكشن'], ['romance', 'رومانسي'], ['comedy', 'كوميديا'], ['drama', 'دراما'], ['crime', 'جريمة'], ['mystery', 'غموض'], ['thriller', 'إثارة'],
    ['horror', 'رعب'], ['scifi', 'خيال علمي'], ['fantasy', 'فانتازيا'], ['adventure', 'مغامرة'], ['family', 'عائلي'], ['history', 'تاريخي'], ['war', 'حرب'], ['documentary', 'وثائقي']];
  var MINS = [[0, 'أي تقييم'], [6, '★ 6 وفوق'], [7, '★ 7 وفوق'], [7.5, '★ 7.5 وفوق'], [8, '★ 8 وفوق']];
  var ERAS = [['', 'أي وقت'], ['new', 'آخر 3 سنين'], ['2010', 'العشرية الماضية'], ['2000', 'الألفينات'], ['old', 'قبل 2000']];
  var LENGTHS = [[false, 'أي مدة'], [true, 'أقل من ساعة ونص']];
  var SEEN = [[false, 'يطلع'], [true, 'لا تطلعه']];

  function words(list, v) { var x = list.filter(function (o) { return o[0] === v; })[0]; return x ? x[1] : ''; }

  /* the choices as last left, anything missing filled in */
  function choices() {
    var c = Object.assign({}, DEFAULTS, CS.settings.searchFind || {});
    c.genres = Array.isArray(c.genres) ? c.genres.slice() : [];
    return c;
  }
  function save(c) { CS.settings.searchFind = c; CS.saveSettings(); }
  /* the length is about films only */
  function shortApplies(c) { return c.kind === 'movie' || (c.kind === 'anime' && c.form === 'movie'); }
  /* anything chosen at all: then the hub answers instead of the add-ons' search */
  function active(c) {
    return c.kind !== 'all' || !!c.country || c.genres.length > 0 || !!c.min || !!c.era || (c.short && shortApplies(c)) || c.sort === 'watched' || !!c.hideSeen;
  }

  /* the hub's address for these choices, a name if one is typed, and a page */
  function query(c, text, page) {
    var p = ['kind=' + c.kind, 'sort=' + c.sort, 'page=' + (page || 1)];
    if (text) p.push('q=' + encodeURIComponent(text));
    if (c.kind === 'anime') p.push('form=' + (c.form || 'any'));
    else if (c.country) p.push('country=' + c.country);
    if (c.genres.length) p.push('genres=' + c.genres.join(','));
    if (c.min) p.push('min=' + c.min);
    if (c.era) p.push('era=' + c.era);
    if (c.short && shortApplies(c) && !text) p.push('short=1');
    return '/cat/find?' + p.join('&');
  }

  /* a page of titles, skip counted the way the app's lists count it; the seen ones left out when that is asked */
  function page(c, text, skip) {
    return CS.fetchJson(CS.config.hubUrl + query(c, text, Math.floor((skip || 0) / 20) + 1), { timeout: 20000 }).then(function (r) {
      var metas = (r && r.metas) || [];
      if (c.hideSeen) metas = metas.filter(function (m) { return !CS.roll.seen(m.id); });
      metas.pageSize = 20;
      metas.total = r && r.total;
      return metas;
    });
  }

  /* the row's name: what is shown, in one line */
  function title(c, text) {
    var what = c.kind === 'anime' ? (c.form === 'movie' ? 'أفلام أنمي' : c.form === 'series' ? 'مسلسلات أنمي' : 'أنمي') : (c.kind === 'all' ? 'أفلام ومسلسلات' : words(KINDS, c.kind));
    if (c.kind !== 'anime' && c.country) what += ' — ' + words(COUNTRIES, c.country);
    var bits = [c.sort === 'watched' ? 'الأكثر مشاهدة' : text ? 'نتائج «' + text + '»' : 'الأشهر الحين', what];
    if (c.sort === 'watched' && text) bits.splice(1, 0, '«' + text + '»');
    if (c.genres.length) bits.push(c.genres.map(function (g) { return words(GENRES, g); }).join(' أو '));
    if (c.min) bits.push(words(MINS, c.min));
    if (c.era) bits.push(words(ERAS, c.era));
    if (c.short && shortApplies(c) && !text) bits.push('أقل من ساعة ونص');
    return bits.join(' · ');
  }

  /* a small list of one choice's values; several = genres, chosen and let go in place, Back or «تم» closes */
  function pick(name, list, isOn, choose, several) {
    var track = h('div.vtrack');
    var box = h('div.filter-list.vscroll', { 'data-pad': '20' }, track);
    function draw() {
      var keep = CS.nav.current(), at = keep && keep._v;
      track.innerHTML = '';
      list.forEach(function (o) {
        var on = isOn(o[0]);
        var b = h('button.panel-row.f' + (on ? '.on' : ''), { onclick: function () {
          choose(o[0]);
          if (several && o[0]) { draw(); return; }
          CS.nav.pop();
        } }, h('span.panel-main', null, on ? CS.iconKids('check', o[1]) : o[1]));
        b._on = on;
        b._v = o[0];
        track.appendChild(b);
      });
      if (several) track.appendChild(h('button.panel-row.f', { onclick: function () { CS.nav.pop(); } }, h('span.panel-main', { text: 'تم' })));
      var back = at != null ? Array.prototype.filter.call(track.children, function (x) { return x._v === at; })[0] : null;
      if (back) CS.nav.focus(back, 'no-scroll');
    }
    draw();
    box.style.height = Math.min(track.children.length, 7) * 86 + 'px';
    var modal = h('section.screen.confirm', null, h('div.confirm-box.filter-box', null, [h('p', { text: name + (several ? ' (اختر أكثر من واحد)' : '') }), box]));
    CS.nav.push({ name: 'filter-pick', modal: true, el: modal, defaultFocus: function () {
      return Array.prototype.filter.call(track.children, function (x) { return x._on; })[0] || track.firstChild;
    } });
  }

  /* the line of buttons. changed(c) runs after every change, with the choices as saved */
  function bar(changed) {
    var c = choices();
    var el = h('div.row.group.find-bar', { 'data-key': 'find' });
    function set(f) { return function (v) { f(v); save(c); draw(); changed(c); }; }
    function btn(key, name, value, on, onclick) {
      return h('button.chip.f.filter-btn' + (on ? '.on' : ''), { 'data-key': key, onclick: onclick }, [
        h('span.filter-k', { text: name + ':' }), h('span', { text: value }), h('span.ico-wrap', { html: CS.icon('chevron') })
      ]);
    }
    function draw() {
      var cur = CS.nav.current(), key = cur && cur.dataset && el.contains(cur) ? cur.dataset.key : null;
      var kids = [];
      /* the switch the owner asked for comes first: it works with any of the others */
      kids.push(h('button.chip.f.filter-btn.find-watched' + (c.sort === 'watched' ? '.on' : ''), { 'data-key': 'sort', 'aria-pressed': c.sort === 'watched' ? 'true' : 'false',
        onclick: set(function () { c.sort = c.sort === 'watched' ? 'popular' : 'watched'; }) }, c.sort === 'watched' ? CS.iconKids('check', 'الأكثر مشاهدة') : 'الأكثر مشاهدة'));
      kids.push(btn('kind', 'النوع', words(KINDS, c.kind), c.kind !== 'all', function () { pick('النوع', KINDS, function (v) { return v === c.kind; }, set(function (v) { c.kind = v; })); }));
      if (c.kind === 'anime') kids.push(btn('form', 'الشكل', words(FORMS, c.form), c.form !== 'any', function () { pick('الشكل', FORMS, function (v) { return v === c.form; }, set(function (v) { c.form = v; })); }));
      else kids.push(btn('country', 'البلد', words(COUNTRIES, c.country), !!c.country, function () { pick('البلد', COUNTRIES, function (v) { return v === c.country; }, set(function (v) { c.country = v; })); }));
      kids.push(btn('genres', 'التصنيف', c.genres.length ? (c.genres.length > 2 ? c.genres.length + ' تصنيفات' : c.genres.map(function (g) { return words(GENRES, g); }).join('، ')) : 'الكل', c.genres.length > 0, function () {
        pick('التصنيف', GENRES, function (v) { return v ? c.genres.indexOf(v) >= 0 : !c.genres.length; }, set(function (v) { c.genres = CS.roll.toggleGenre(c.genres, v); }), true);
      }));
      kids.push(btn('min', 'التقييم', words(MINS, c.min), !!c.min, function () { pick('أقل تقييم', MINS, function (v) { return v === c.min; }, set(function (v) { c.min = v; })); }));
      kids.push(btn('era', 'الفترة', words(ERAS, c.era), !!c.era, function () { pick('الفترة', ERAS, function (v) { return v === c.era; }, set(function (v) { c.era = v; })); }));
      if (shortApplies(c)) kids.push(btn('short', 'المدة', words(LENGTHS, !!c.short), !!c.short, function () { pick('المدة', LENGTHS, function (v) { return v === !!c.short; }, set(function (v) { c.short = v; })); }));
      kids.push(btn('seen', 'اللي شفته', words(SEEN, !!c.hideSeen), !!c.hideSeen, function () { pick('اللي شفته', SEEN, function (v) { return v === !!c.hideSeen; }, set(function (v) { c.hideSeen = v; })); }));
      if (active(c)) kids.push(h('button.chip.f.filter-clear', { 'data-key': 'clear', onclick: set(function () {
        Object.keys(DEFAULTS).forEach(function (k) { c[k] = k === 'genres' ? [] : DEFAULTS[k]; });
      }) }, 'امسح الفلاتر'));
      el.innerHTML = '';
      el.appendChild(h('div.filter-btns', null, kids));
      var back = key ? el.querySelector('.f[data-key="' + key + '"]') || el.querySelector('.f') : null;
      if (back) CS.nav.focus(back, 'no-scroll');
    }
    draw();
    return el;
  }

  CS.find = { DEFAULTS: DEFAULTS, choices: choices, active: active, query: query, page: page, title: title, bar: bar, shortApplies: shortApplies };
})();
