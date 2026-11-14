/* The screens: sign-in, home, title page, sources, search, library, settings. */
(function () {
  var h = CS.h;
  var BG_DEFAULT = 'img/crimson.jpg';
  var bgTimer = 0, bgNow = '', bgWant = '';

  /* only the last picture asked for is shown: one asked for earlier that arrives later (a poster passed on the way) is dropped,
     and a picture that does not load gives the plain background, not the last title's */
  function setBg(url, now) {
    url = url || BG_DEFAULT;
    bgWant = url;
    clearTimeout(bgTimer);
    if (url === bgNow) return;
    bgTimer = setTimeout(function () {
      var art = CS.$('bg-art');
      var img = new Image();
      img.onerror = function () { if (bgWant === url && url !== BG_DEFAULT) setBg(BG_DEFAULT, true); };
      img.onload = function () {
        if (bgWant !== url) return;
        bgNow = url;
        art.style.opacity = 0;
        CS.$('bg').classList.toggle('title-art', url !== BG_DEFAULT); /* the phone darkens a title's picture behind its words */
        setTimeout(function () { art.style.backgroundImage = 'url("' + url + '")'; art.style.opacity = url === BG_DEFAULT ? 0.72 : 0.5; }, 180);
      };
      img.src = url;
    }, now ? 0 : 380);
  }
  CS.setBg = setBg;

  function section(cls) { return h('section.screen.' + cls); }
  /* the phone: a way back on the screen, for a hand that does not know the system's gesture */
  function addBack(el) {
    if (window.CS_ANDROID) el.appendChild(h('button.m-back', { 'aria-label': 'رجوع', html: CS.icon('back'), onclick: function () { CS.nav.pop(); } }));
  }

  function topbar(active) {
    var T = {
      home: { id: 'home', label: 'الرئيسية', go: function () { CS.nav.popToRoot(); } },
      movie: { id: 'movie', label: 'أفلام', go: function () { browse('movie'); } },
      series: { id: 'series', label: 'مسلسلات', go: function () { browse('series'); } },
      anime: { id: 'anime', label: 'أنمي', go: function () { browse('anime'); } },
      airing: CS.config.hubUrl ? { id: 'airing', label: 'يعرض الآن', go: function () { airing(); } } : null,
      random: { id: 'random', label: 'عشوائي', go: function () { rollOptions(); } },
      search: { id: 'search', label: 'بحث', go: function () { CS.views.search(); } },
      library: { id: 'library', label: 'مكتبتي', go: function () { CS.views.library(); } },
      downloads: CS.downloads ? { id: 'downloads', label: 'التحميلات', go: function () { CS.views.downloads(); } } : null,
      settings: { id: 'settings', label: 'الإعدادات', go: function () { CS.views.settings(); } }
    };
    /* the phone's bar at the bottom, in the owner's order (2026-11-13): search second, the three kinds, then random. What is on now
       (2026-11-14) follows the kinds */
    var order = window.CS_ANDROID ? ['home', 'search', 'movie', 'series', 'anime', 'airing', 'random', 'library', 'downloads', 'settings']
      : ['home', 'movie', 'series', 'anime', 'airing', 'random', 'search', 'library', 'downloads', 'settings'];
    var tabs = order.map(function (k) { return T[k]; }).filter(Boolean);
    /* a phone too narrow for all ten slides the bar: the open section is brought to its middle */
    if (window.CS_ANDROID) setTimeout(function () {
      var nav = bar.querySelector('.tabs'), on = nav && nav.querySelector('.tab.on');
      if (!on || nav.scrollWidth <= nav.clientWidth + 1) return;
      var nb = nav.getBoundingClientRect(), ob = on.getBoundingClientRect();
      nav.scrollLeft += (ob.left + ob.width / 2) - (nb.left + nb.width / 2);
    }, 0);
    var bar = h('header.topbar', null, [
      h('div.brand', null, [h('span.brand-eye', { html: CS.eyeSvg() }), h('span', { text: 'CRIMSON STREAM' })]),
      h('nav.tabs.group', null, tabs.map(function (t) {
        return h('button.tab.f' + (t.id === active ? '.on' : ''), { onclick: function () { if (t.id !== active) t.go(); } }, t.label);
      }).concat(window.CS_ANDROID ? [] : [
        /* the home page: a random pick with the last choices, in one press (the phone has its tab for it) */
        active === 'home' ? h('button.tab.tab-dice.f', { 'aria-label': 'اختر لي بآخر اختياراتك', title: 'اختر لي بآخر اختياراتك', onclick: function () { rollResult(CS.roll.choices()); } },
          CS.iconKids('dice', 'اختر لي')) : null,
        /* who is watching: shown once there is more than one profile (the phone has it in settings) */
        CS.profiles.askAtStart() ? h('button.tab.tab-pf.f', { 'aria-label': 'تبديل الملف', title: CS.profiles.name(CS.profiles.get(CS.profiles.current())), onclick: function () { profiles(false); } },
          avatar(CS.profiles.get(CS.profiles.current()))) : null
      ])),
      h('div.clock', { 'data-clock': 1 })
    ]);
    return bar;
  }

  /* a row's name: the usual ones in Arabic, any other as its add-on wrote it */
  var CAT_NAMES = { popular: 'الأشهر', top: 'الأشهر', trending: 'الرائج', featured: 'مختارات', new: 'الجديد', latest: 'الجديد' };
  function catName(cat) {
    var n = cat.name || cat.id || '';
    return CAT_NAMES[n.toLowerCase()] || n;
  }

  /* what a catalog holds, whatever add-on it comes from */
  function kindOf(c) {
    var a = c.addon && c.addon.manifest || {};
    if (c.cat.type === 'anime' || /kitsu|anime/i.test((a.id || '') + ' ' + (a.name || '') + ' ' + (c.cat.name || c.cat.id || ''))) return 'anime';
    return c.cat.type === 'movie' || c.cat.type === 'series' ? c.cat.type : 'other';
  }
  var ROW_NAMES = {
    movie: { 'الأشهر': 'أشهر الأفلام', 'الرائج': 'أفلام رائجة', 'مختارات': 'أفلام مختارة', 'الجديد': 'أفلام جديدة' },
    series: { 'الأشهر': 'أشهر المسلسلات', 'الرائج': 'مسلسلات رائجة', 'مختارات': 'مسلسلات مختارة', 'الجديد': 'مسلسلات جديدة' }
  };
  var ANIME_NAMES = [[/trending/i, 'أنمي رائج'], [/airing/i, 'أنمي يعرض الحين'], [/popular/i, 'أشهر الأنمي'], [/rated|top/i, 'أعلى الأنمي تقييمًا']];
  /* a row's name for the viewer. Only a catalog with a name of its own still shows it */
  function rowName(c) {
    var n = catName(c.cat), kind = kindOf(c), known = ROW_NAMES[kind] && ROW_NAMES[kind][n];
    if (known) return known;
    if (kind === 'anime') {
      var hit = ANIME_NAMES.filter(function (x) { return x[0].test(n); })[0];
      return hit ? hit[1] : n.replace(/kitsu/i, '').trim() || 'أنمي';
    }
    if (/public\s*domain/i.test(n)) return 'أفلام ملكية عامة';
    if (/أفلام|مسلسلات/.test(n)) return n; /* its name already says */
    return n + (kind === 'movie' ? ' — أفلام' : kind === 'series' ? ' — مسلسلات' : '');
  }
  function isPopular(c) { return /popular|^top$/i.test(c.cat.name || '') || /popular/i.test(c.cat.id || ''); }
  function hasGenres(c) { return (c.cat.extra || []).some(function (x) { return x.name === 'genre' && x.options && x.options.length; }); }
  /* a kind's list to ask by genre: "airing" holds only what is on now (3 action anime, against hundreds), the popular list is the widest */
  function widestByGenre(cats) {
    var able = cats.filter(hasGenres);
    return able.filter(isPopular)[0] || able[0] || null;
  }
  function arabicGenres(c) {
    var seen = {};
    return c.cat.extra.filter(function (x) { return x.name === 'genre'; })[0].options.filter(function (o) { var n = genreName(o); if (!n || seen[n]) return false; seen[n] = 1; return true; });
  }
  /* the home page opens with the most popular of movies, series and anime */
  function homeTops(cats) {
    var tops = ['movie', 'series', 'anime'].map(function (kind) {
      var mine = cats.filter(function (c) { return kindOf(c) === kind; });
      return mine.filter(isPopular)[0] || mine[0];
    }).filter(Boolean);
    return tops.length ? tops : cats.slice(0, 3);
  }
  /* and goes on with rows of every section in turn: its genres and its other lists, in a new order each time. When a list has had its row it
     goes to the back of its section and comes round again from where it stopped, so going down reaches everything every list holds. It ends only
     when every list has run out (one.ended, set by whoever asked the add-on) */
  var KIND_WORD = { movie: 'أفلام', series: 'مسلسلات', anime: 'أنمي' };
  function homeMix(cats, tops) {
    var queues = {};
    ['movie', 'series', 'anime', 'other'].forEach(function (kind) {
      var mine = cats.filter(function (c) { return kindOf(c) === kind; });
      var rows = mine.map(function (c) { return { c: c, title: rowName(c), skip: 0, round: tops.indexOf(c) < 0 ? 0 : 1 }; });
      var wide = kind === 'other' ? null : widestByGenre(mine);
      if (wide) rows = rows.concat(arabicGenres(wide).map(function (g) { return { c: wide, extra: { genre: g }, title: KIND_WORD[kind] + ' ' + genreName(g), skip: 0, round: 0 }; }));
      rows.forEach(function (one) { one.queue = kind; });
      if (rows.length) queues[kind] = CS.shuffled(rows);
    });
    var take = CS.takeInTurn(queues);
    return function () {
      for (var one = take(); one; one = take()) {
        if (one.ended) continue;
        queues[one.queue].push(one);
        return one;
      }
      return null;
    };
  }

  var GENRES = {
    action: 'أكشن', adventure: 'مغامرة', animation: 'رسوم متحركة', biography: 'سيرة ذاتية', comedy: 'كوميديا', crime: 'جريمة', documentary: 'وثائقي',
    drama: 'دراما', family: 'عائلي', fantasy: 'خيال', history: 'تاريخي', horror: 'رعب', music: 'موسيقى', musical: 'موسيقي', mystery: 'غموض',
    romance: 'رومانسي', 'sci-fi': 'خيال علمي', 'science fiction': 'خيال علمي', sport: 'رياضة', sports: 'رياضة', thriller: 'إثارة', war: 'حرب', western: 'غرب أمريكي',
    reality: 'واقع', 'reality-tv': 'واقع', 'talk-show': 'برامج حوارية', 'game-show': 'مسابقات', news: 'أخبار', short: 'قصير', 'film-noir': 'نوار',
    supernatural: 'خوارق', 'slice of life': 'يوميات', psychological: 'نفسي', mecha: 'ميكا', school: 'مدرسي', isekai: 'عالم آخر', martial_arts: 'فنون قتالية', 'martial arts': 'فنون قتالية',
    space: 'فضاء', magic: 'سحر', police: 'شرطة', cars: 'سيارات', racing: 'سباقات', 'super power': 'قوى خارقة', vampire: 'مصاصو دماء', historical: 'تاريخي', military: 'عسكري',
    demons: 'شياطين', samurai: 'ساموراي', parody: 'ساخر', game: 'ألعاب', kids: 'أطفال', medical: 'طبي', political: 'سياسي', cooking: 'طبخ', friendship: 'صداقة', tragedy: 'مأساة', zombies: 'زومبي', workplace: 'عمل', youth: 'شباب', law: 'قانون'
  };
  function genreName(g) { return GENRES[String(g).toLowerCase()] || ''; }
  function metaLine(m) {
    var bits = [];
    if (m.releaseInfo) bits.push(m.releaseInfo);
    if (m.runtime) bits.push(String(m.runtime).replace(/(\d+)\s*min\b/i, function (x, n) { return CS.minLeft(+n); }));
    if (m.imdbRating) bits.push('★ ' + m.imdbRating);
    if (m.genres && m.genres.length) bits.push(m.genres.slice(0, 3).map(function (g) { return genreName(g) || g; }).join(' · '));
    return bits.join('   ');
  }
  /* Arabic words already known for this title take the place of the English ones */
  function arabicNow(m) {
    var a = m && CS.cache.get('ar:' + m.id);
    if (a && a.text) { m.description = a.text; m.arabic = true; }
    if (a && a.name) m.arName = a.name;
    return !!(a && a.text);
  }

  function poster(m) {
    var wrap = h('div.poster');
    if (m.poster) {
      var img = h('img', { src: m.poster, loading: 'lazy', decoding: 'async', alt: '' });
      var tries = 0;
      /* while it is tried again, the browser's broken-picture mark stays out of sight */
      img.onload = function () { img.style.visibility = ''; };
      img.onerror = function () {
        img.style.visibility = 'hidden';
        var more = m.fallbacks && m.fallbacks.length;
        if (tries < 2 && !more) {
          tries++;
          setTimeout(function () { img.src = m.poster + (m.poster.indexOf('?') < 0 ? '?' : '&') + 'r=' + tries; }, 900 * tries + Math.random() * 700);
          return;
        }
        if (more) { m = Object.assign({}, m, { poster: m.fallbacks[0], fallbacks: m.fallbacks.slice(1) }); tries = 0; img.src = m.poster; return; }
        img.remove();
        wrap.classList.add('noimg');
      };
      wrap.appendChild(img);
    } else wrap.classList.add('noimg');
    wrap.appendChild(h('div.poster-name', { text: m.name || '' }));
    return wrap;
  }

  function card(m, opts) {
    opts = opts || {};
    var c = h('button.card.f' + (opts.wide ? '.wide' : ''), { onclick: function () {
      var go = function (morphed) { (opts.open || openMeta)(m, morphed); };
      var t = CS.nav.top();
      if (t && t.tab != null) morphOpen(c, m, go); else go(false);
    } });
    c.appendChild(poster(opts.image ? Object.assign({}, m, { poster: opts.image, fallbacks: [opts.image2, m.poster].filter(Boolean) }) : m));
    if (opts.rank) c.appendChild(h('div.card-rank', { text: String(opts.rank) }));
    if (opts.caption) c.appendChild(h('div.card-cap', null, [h('div.card-cap-name', { text: m.name || '' }), h('div.card-cap-line', { text: opts.caption })]));
    if (opts.progress != null) c.appendChild(h('div.progress', null, h('div', { style: { width: Math.round(opts.progress * 100) + '%' } })));
    if (opts.tag) c.appendChild(h('div.card-tag' + (opts.tagLow ? '.card-tag-low' : ''), { text: opts.tag }));
    c._meta = m;
    c._hero = opts.hero;
    if (CS.desktop && m.name) c.title = m.name;
    c._onFocus = function () { prefetch(m); };
    return c;
  }

  /* resting on a poster for a moment fetches its title page in the background, so OK opens it at once */
  var prefetchTimer = 0;
  function prefetch(m) {
    clearTimeout(prefetchTimer);
    if (!m || !m.id || !m.type) return;
    prefetchTimer = setTimeout(function () {
      if (!m.arabic) CS.session.arabicInfo(m).then(function () {
        var cur = CS.nav.current(), top = CS.nav.top();
        if (arabicNow(m) && cur && cur._meta === m && top && top.focusChanged) top.focusChanged(cur);
      });
      CS.addons.meta(m.type, m.id).then(function (full) {
        /* a card that knew little (its title page was not kept) gets its logo and words while it is still chosen */
        var cur = CS.nav.current();
        if (!full || !cur || cur._meta !== m || (m.logo && m.description)) return;
        ['logo', 'background', 'description', 'releaseInfo', 'runtime', 'imdbRating', 'genres'].forEach(function (k) { if (!m[k] && full[k]) m[k] = full[k]; });
        var top = CS.nav.top();
        if (top && top.focusChanged) top.focusChanged(cur);
      }).catch(function () { /* opened normally later */ });
    }, 450);
  }

  /* the first posters of a row come in one after another (the rest are off screen and need no motion) */
  function stagger(cards) {
    cards.slice(0, 6).forEach(function (c, i) {
      if (!c.classList || c.classList.contains('skeleton')) return;
      c.style.animationDelay = (i * 45) + 'ms';
      c.classList.add('stagger');
      c.addEventListener('animationend', function () { c.classList.remove('stagger'); c.style.animationDelay = ''; }, { once: true });
    });
  }

  function row(title, cards, key, hint) {
    stagger(cards);
    var r = h('div.row.group', { 'data-key': key || '' }, [
      h('h2.row-title', null, [title, hint ? h('span.row-hint', { text: hint }) : null]),
      h('div.hscroll', null, h('div.htrack', null, cards))
    ]);
    return r;
  }
  function fillRow(r, cards) {
    var tr = r.querySelector('.htrack');
    if (tr.querySelector('.skeleton, .spin-wrap')) stagger(cards); /* the first real posters, not a redraw */
    tr.innerHTML = '';
    cards.forEach(function (c) { tr.appendChild(c); });
  }

  function openMeta(m, morphed) { CS.views.detail(m.type, m.id, m, { morph: morphed }); }

  /* opening a title from a poster: the poster itself grows from its place to the whole screen while it turns into the
     title's big picture, and the title page rises out of it. A copy of the poster is drawn over the page and only its
     visible area (clip-path), its size (transform) and its opacity move, so the TV draws it smoothly. */
  var morphing = false;

  /* the TV: the same opening as on Windows — the poster swells from its place toward the middle of the screen and melts
     into the title's big picture — but without clipping a growing box every frame (the TV's processor redraws that
     whole picture each time and stutters). The big picture comes in by fading over the page instead; only movement and
     fading are used, which the TV draws without redrawing anything. */
  var LITE_T = 340;
  function liteLayer(bgUrl, src, x, y, w, hh) {
    return h('div.morph.morph-tv', null, [
      bgUrl ? h('div.morph-bg', { style: { backgroundImage: 'url("' + bgUrl + '")', opacity: .72 } }) : null,
      h('div.morph-shade'),
      h('img.morph-poster', { src: src, alt: '', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' } })
    ]);
  }
  function liteSwell(x, y, w, hh) {
    var W = document.body.offsetWidth, H = document.body.offsetHeight;
    var cx = W / 2 - (x + w / 2), cy = H * .42 - (y + hh / 2), sc = Math.max(W / w, H / hh) * .55;
    return { mid: 'translate(' + cx * .6 + 'px,' + cy * .6 + 'px) scale(' + sc * .6 + ')', end: 'translate(' + cx + 'px,' + cy + 'px) scale(' + sc + ')' };
  }
  function morphOpenLite(c, img, m, go) {
    var r = c.getBoundingClientRect();
    var x = r.left, y = r.top, w = r.width, hh = r.height;
    var cached = CS.cache.get('meta:' + m.type + ':' + m.id);
    var bgUrl = m.background || (cached && cached.background) || '';
    if (bgUrl && !m.background) m.background = bgUrl;
    var layer = liteLayer(bgUrl, img.src, x, y, w, hh);
    var poster = layer.querySelector('.morph-poster');
    document.body.appendChild(layer);
    /* the poster moves above the fading layer (inside it, it would start invisible) */
    layer.removeChild(poster);
    poster.classList.add('morph-poster-alone');
    document.body.appendChild(poster);
    var ease = 'cubic-bezier(.22,1,.36,1)', sw = liteSwell(x, y, w, hh);
    /* the picture behind fades in (the whole layer is one piece: only its opacity changes) */
    var fade = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LITE_T * .6, easing: 'ease-out', fill: 'forwards' });
    void fade;
    poster.animate([
      { transform: 'none', opacity: 1 },
      { transform: sw.mid, opacity: bgUrl ? .55 : 1, offset: .55 },
      { transform: sw.end, opacity: bgUrl ? 0 : .25 }
    ], { duration: LITE_T, easing: ease, fill: 'forwards' });
    setTimeout(function () {
      go(true);
      morphing = false; /* the page is there: what is left is only the copy fading, and it holds nothing up */
      var t = CS.nav.top();
      if (t && t.morph) t.morphFrom = { id: m.id, card: c, poster: img.src, bg: bgUrl, lite: true };
    }, LITE_T * .55);
    setTimeout(function () {
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' }).onfinish = function () { layer.remove(); poster.remove(); };
    }, LITE_T + 20);
  }
  function morphCloseLite(f, card) {
    var r = card.getBoundingClientRect();
    if (!r.width) return false;
    var x = r.left, y = r.top, w = r.width, hh = r.height;
    var layer = liteLayer(f.bg, f.poster, x, y, w, hh);
    var poster = layer.querySelector('.morph-poster');
    document.body.appendChild(layer);
    var ease = 'cubic-bezier(.22,1,.36,1)', sw = liteSwell(x, y, w, hh), T = LITE_T - 40;
    layer.animate([{ opacity: 1 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: T, easing: 'ease-in', fill: 'forwards' }).onfinish = function () { layer.remove(); };
    /* the poster comes back down into its card (it is not part of the fading, so it stays whole to the end) */
    layer.removeChild(poster);
    document.body.appendChild(poster);
    poster.classList.add('morph-poster-alone');
    poster.animate([
      { transform: sw.end, opacity: f.bg ? 0 : .25 },
      { transform: sw.mid, opacity: .7, offset: .45 },
      { transform: 'none', opacity: 1 }
    ], { duration: T, easing: ease, fill: 'forwards' }).onfinish = function () {
      poster.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).onfinish = function () { poster.remove(); };
    };
    return true;
  }

  function morphOpen(c, m, go) {
    if (morphing) return;
    /* the viewer asked the device for less movement: the page simply opens */
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { go(false); return; }
    if (!CS.desktop) {
      var tvImg = c.querySelector('.poster img');
      if (!tvImg || !tvImg.complete || !tvImg.naturalWidth || !document.body.animate) { go(false); return; }
      morphing = true;
      morphOpenLite(c, tvImg, m, go);
      return;
    }
    var img = c.querySelector('.poster img');
    if (!img || !img.complete || !document.body.animate) { go(false); return; }
    morphing = true;
    var k = CS.uiScale || 1, b = document.body.getBoundingClientRect(), r = c.getBoundingClientRect();
    var W = document.body.offsetWidth, H = document.body.offsetHeight;
    var x = (r.left - b.left) / k, y = (r.top - b.top) / k, w = r.width / k, hh = r.height / k;
    var cached = CS.cache.get('meta:' + m.type + ':' + m.id);
    var bgUrl = m.background || (cached && cached.background) || '';
    if (bgUrl && !m.background) m.background = bgUrl; /* the title page starts on the same picture the poster opened into */
    var layer = h('div.morph', null, [
      bgUrl ? h('div.morph-bg', { style: { backgroundImage: 'url("' + bgUrl + '")' } }) : null,
      h('div.morph-shade'),
      h('img.morph-poster', { src: img.src, alt: '', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' } })
    ]);
    document.body.appendChild(layer);
    var ease = 'cubic-bezier(.22,1,.36,1)', T = 340;
    var from = 'inset(' + y + 'px ' + (W - x - w) + 'px ' + (H - y - hh) + 'px ' + x + 'px round 14px)';
    layer.animate([{ clipPath: from }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: T, easing: ease, fill: 'forwards' });
    /* the poster swells toward the middle of the screen and dissolves into the big picture */
    var cx = W / 2 - (x + w / 2), cy = H * .42 - (y + hh / 2), sc = Math.max(W / w, H / hh) * .55;
    layer.querySelector('.morph-poster').animate([
      { transform: 'none', opacity: 1 },
      { transform: 'translate(' + cx * .6 + 'px,' + cy * .6 + 'px) scale(' + sc * .6 + ')', opacity: bgUrl ? .55 : 1, offset: .55 },
      { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(' + sc + ')', opacity: bgUrl ? 0 : .25 }
    ], { duration: T, easing: ease, fill: 'forwards' });
    if (bgUrl) layer.querySelector('.morph-bg').animate([{ opacity: 0, transform: 'scale(1.08)' }, { opacity: .72, transform: 'none' }], { duration: T, easing: ease, fill: 'forwards' });
    /* the title page comes up while the poster is still opening; the copy fades away over it */
    setTimeout(function () {
      go(true);
      morphing = false; /* the page is there: what is left is only the copy fading, and it holds nothing up */
      var t = CS.nav.top();
      if (t && t.morph) t.morphFrom = { id: m.id, card: c, poster: img.src, bg: bgUrl };
    }, T * .55);
    setTimeout(function () {
      var out = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' });
      out.onfinish = function () { layer.remove(); };
    }, T + 20);
  }

  /* removing a title from "continue watching": always asked first. The place in the episode is forgotten (in the
     account too); the title itself stays in the library if it is there. */
  function askDismiss(id, name, done, openPage) {
    var box = h('section.screen.confirm', null, h('div.confirm-box', null, [
      h('p', { text: openPage ? '«' + name + '»' : 'تحذف «' + name + '» من متابعة المشاهدة؟' }),
      h('p.confirm-note', { text: openPage ? 'الحذف من المتابعة ينسّينا وين وقفت، وفي أجهزتك الثانية بعد.' : 'بننسى وين وقفت فيه، وفي أجهزتك الثانية بعد.' }),
      h('div.confirm-btns.group', null, [
        openPage ? h('button.btn.f', { onclick: function () { CS.nav.pop(); openPage(); } }, 'صفحة العنوان') : null,
        h('button.btn.primary.f', { onclick: function () {
          CS.lib.dismiss(id);
          CS.nav.pop();
          CS.toast('انحذف من متابعة المشاهدة');
          if (done) done();
        } }, 'احذف'),
        h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'إلغاء')
      ])
    ]));
    CS.nav.push({
      name: 'confirm', modal: true, el: box,
      defaultFocus: function () { var all = box.querySelectorAll('.f'); return all[all.length - 1]; },
      /* the OK still held from the long press (it repeats) presses nothing here; only a new press does */
      keys: function (e) { return e.keyCode === CS.KEY.OK && press.holding; }
    });
  }

  /* a long OK press on a "continue watching" card offers its page or removing it; a short one opens its page (on release).
     The card may have been drawn again meanwhile (the library arrived): the one still focused counts. */
  var press = { card: null, timer: 0, holding: false };
  function pressDown(c) {
    clearTimeout(press.timer);
    press.card = c;
    press.timer = setTimeout(function () {
      press.timer = 0;
      var card = press.card;
      press.card = null;
      if (card && CS.nav.current() === card) { press.holding = true; card._askRemove(); }
    }, 650);
  }
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== CS.KEY.OK) return;
    press.holding = false;
    if (!press.card) return;
    var card = press.card;
    press.card = null;
    if (press.timer) { clearTimeout(press.timer); press.timer = 0; if (CS.nav.current() === card) card.click(); }
  });
  /* the window lost the keyboard while OK was down (its release never comes) */
  window.addEventListener('blur', function () { press.holding = false; });

  /* leaving a title page that a poster opened: the page shrinks back into that poster, in its place in the row (the
     screen under it is already showing; the copy covers it and only its visible area, size and opacity move) */
  CS.morphClose = function (f) {
    var t = CS.nav.top();
    var card = f.card && f.card.isConnected ? f.card : null;
    if (!card && t) card = Array.prototype.filter.call(t.el.querySelectorAll('.card'), function (x) { return x._meta && x._meta.id === f.id; })[0] || null;
    if (!card || !document.body.animate) return false;
    if (CS.nav.current() !== card) CS.nav.focus(card, 'instant');
    if (!CS.desktop || f.lite) return morphCloseLite(f, card);
    var k = CS.uiScale || 1, b = document.body.getBoundingClientRect(), r = card.getBoundingClientRect();
    if (!r.width) return false;
    var W = document.body.offsetWidth, H = document.body.offsetHeight;
    var x = (r.left - b.left) / k, y = (r.top - b.top) / k, w = r.width / k, hh = r.height / k;
    var layer = h('div.morph', null, [
      f.bg ? h('div.morph-bg', { style: { backgroundImage: 'url("' + f.bg + '")', opacity: .72 } }) : null,
      h('div.morph-shade'),
      h('img.morph-poster', { src: f.poster, alt: '', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' } })
    ]);
    document.body.appendChild(layer);
    var ease = 'cubic-bezier(.22,1,.36,1)', T = 320;
    var to = 'inset(' + y + 'px ' + (W - x - w) + 'px ' + (H - y - hh) + 'px ' + x + 'px round 14px)';
    layer.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: to }], { duration: T, easing: ease, fill: 'forwards' });
    var cx = W / 2 - (x + w / 2), cy = H * .42 - (y + hh / 2), sc = Math.max(W / w, H / hh) * .55;
    layer.querySelector('.morph-poster').animate([
      { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(' + sc + ')', opacity: f.bg ? 0 : .25 },
      { transform: 'translate(' + cx * .4 + 'px,' + cy * .4 + 'px) scale(' + Math.max(1, sc * .4) + ')', opacity: .7, offset: .45 },
      { transform: 'none', opacity: 1 }
    ], { duration: T, easing: ease, fill: 'forwards' });
    if (f.bg) layer.querySelector('.morph-bg').animate([{ opacity: .72 }, { opacity: 0 }], { duration: T * .8, easing: ease, fill: 'forwards' });
    setTimeout(function () {
      var out = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' });
      out.onfinish = function () { layer.remove(); };
    }, T);
    return true;
  };

  /* =============== sign-in =============== */
  function login() {
    var el = section('login');
    var codeBox = h('div.code', { text: '····' });
    var qr = h('img.qr', { alt: '' });
    var note = h('p.login-note', { text: 'نجهّز الرمز…' });
    var poll = 0, renew = 0, alive = true;
    var linkUrl = 'https://link.stremio.com';
    function fresh() {
      clearInterval(poll); clearTimeout(renew);
      note.textContent = 'نجهّز الرمز…';
      CS.api.linkCreate().then(function (r) {
        if (!alive) return;
        codeBox.textContent = r.code;
        qr.src = r.qrcode;
        if (r.link && /^https:\/\/link\.stremio\.com\//.test(r.link)) linkUrl = r.link;
        note.textContent = window.CS_ANDROID ? 'اضغط «افتح صفحة الربط»، وادخل حسابك في Stremio، واكتب الرمز، وبعدها وافق وارجع هنا.' : 'امسح الرمز بجوالك أو افتح link.stremio.com واكتب الرمز وأنت داخل حسابك في Stremio، وبعدها وافق.';
        poll = setInterval(function () {
          CS.api.linkRead(r.code).then(function (key) {
            if (!key || !alive) return;
            clearInterval(poll); clearTimeout(renew);
            CS.settings.authKey = key;
            CS.saveSettings();
            note.textContent = 'تم الربط ✓';
            CS.log('signed in by code');
            CS.api.user().then(function (u) { CS.settings.email = u && u.email || ''; CS.saveSettings(); }).catch(function () { });
            CS.enter(true);
          });
        }, 3000);
        renew = setTimeout(fresh, 5 * 60e3);
      }).catch(function (e) {
        note.textContent = 'ما قدرنا نتصل بـ Stremio (' + e.message + ') — بنحاول مرة ثانية';
        renew = setTimeout(fresh, 8000);
      });
    }
    el.appendChild(h('div.login-box', null, [
      h('div.login-eye', { html: CS.eyeSvg() }),
      h('h1', { text: 'CRIMSON STREAM' }),
      h('p.login-lead', { text: 'اربط التطبيق بحسابك في Stremio مرة واحدة: إضافاتك ومتابعة المشاهدة تصير هنا.' }),
      h('div.login-pair', null, [qr, h('div', null, [h('div.code-label', { text: 'الرمز' }), codeBox, h('div.code-site', { text: 'link.stremio.com' })])]),
      note,
      /* a phone cannot scan its own screen: it opens the page instead */
      window.CS_ANDROID ? h('button.btn.primary.f', { onclick: function () { CS.host({ t: 'open-link', url: linkUrl }); } }, 'افتح صفحة الربط') : null,
      h('button.btn.f', { onclick: fresh }, 'رمز جديد')
    ]));
    CS.nav.reset({ name: 'login', el: el, destroy: function () { alive = false; clearInterval(poll); clearTimeout(renew); } });
    setBg(BG_DEFAULT, true);
    fresh();
  }

  /* =============== home =============== */
  var homeScreen = null;

  function heroShower(hero) {
    return function (c) {
      var m = c && c._meta;
      if (!m) return;
      arabicNow(m);
      var logo = hero.querySelector('.hero-logo');
      logo.innerHTML = '';
      if (m.logo) {
        var img = h('img', { src: m.logo, alt: '' });
        img.onerror = function () { logo.textContent = m.name; };
        logo.appendChild(img);
      } else logo.textContent = m.name;
      hero.querySelector('.hero-line').textContent = c._hero || metaLine(m);
      hero.querySelector('.hero-desc').textContent = m.description || '';
      setBg(m.background || wideImage(m.id));
    };
  }
  function wideImage(id) { return id && /^tt/.test(id) ? 'https://images.metahub.space/background/medium/' + id + '/img' : ''; }
  /* lists of any length: thousands of titles are known, but only the posters near the viewer are on the page. The space of the others is kept,
     so the page never changes size or moves by itself.
     A row keeps its titles in r._metas and draws r._make(meta, i); a poster knows its place in c._at */
  var CARDS_BEHIND = 6, CARDS_AHEAD = 12, LINES_BEHIND = 3, LINES_AHEAD = 5;
  var cardStep = 0, isRtl = null;
  function placeOf(c) { return c._at == null ? -1 : c._at; }
  function wantMore(holder, c, within) {
    if (holder._more && holder._metas && placeOf(c) >= holder._metas.length - within) holder._more();
  }
  /* takes away the posters outside [from, to), and adds the missing ones in their order. Posters that stay stay untouched */
  function drawRange(holder, from, to) {
    var have = {}, kids = Array.prototype.slice.call(holder.children), i;
    kids.forEach(function (k) {
      if (k._at == null) { holder.removeChild(k); return; } /* a waiting poster */
      if (k._at < from || k._at >= to) holder.removeChild(k); else have[k._at] = k;
    });
    var after = null;
    for (i = to - 1; i >= from; i--) {
      var c = have[i];
      if (!c) {
        c = holder._make(holder._metas[i], i);
        c._at = i;
        holder.insertBefore(c, after);
      }
      after = c;
    }
  }
  /* few: only that many posters for now (rowUnfinished says more are to come) */
  /* the first poster on screen in a row, by how far the row has gone (where it is going, when it is moving) */
  function firstShown(r, tr, at) {
    if (!cardStep) return at;
    var gone = window.CS_ANDROID ? Math.abs(r.querySelector('.hscroll').scrollLeft) : Math.abs(tr._sx || 0);
    return Math.floor(gone / cardStep);
  }
  function rowWindow(r, at, force, few) {
    var metas = r._metas;
    if (!metas || r._parked) return;
    var tr = r.querySelector('.htrack');
    /* what is on screen is always kept, wherever the focus is in it: a mouse (or a wide screen) can focus a poster far from
       the first one shown, and the posters between were taken away while still in view */
    var seen = firstShown(r, tr, at);
    var from = Math.max(0, Math.min(at - CARDS_BEHIND, seen - 1));
    var to = Math.min(metas.length, Math.max(at + CARDS_AHEAD + 1, seen + CARDS_ACROSS + 2));
    /* only every few posters, and at once when the next would be missing */
    if (!force && r._at != null && Math.abs(at - r._at) < 4 && (r._to >= metas.length || r._to - at > 4) && (r._from <= 0 || at - r._from > 2) &&
      r._from <= from && r._to >= to) return;
    r._at = at;
    r._from = from;
    r._to = to;
    if (few) r._to = Math.min(r._to, Math.max(at, r._from) + few);
    tr._metas = metas;
    tr._make = r._make;
    drawRange(tr, r._from, r._to);
    if (!cardStep && tr.children.length > 1) {
      var a = tr.children[0].getBoundingClientRect(), b = tr.children[1].getBoundingClientRect();
      cardStep = Math.abs(a.left - b.left) / (CS.uiScale || 1);
    }
    if (isRtl == null) isRtl = getComputedStyle(tr).direction === 'rtl';
    var start = r._from * cardStep + 'px', end = (metas.length - r._to) * cardStep + 'px';
    tr.style.paddingRight = isRtl ? start : end;
    tr.style.paddingLeft = isRtl ? end : start;
  }
  /* the same for a page of posters, by whole lines */
  function gridWindow(g, at, force) {
    var metas = g._metas;
    if (!metas) return;
    if (!g._perLine) {
      var kids = g.children, per = 0;
      while (per < kids.length && kids[per].offsetTop === kids[0].offsetTop) per++;
      if (per >= kids.length) { if (metas.length <= kids.length) return; force = true; per = 0; }
      if (per) {
        g._perLine = per;
        g._lineH = kids[per].offsetTop - kids[0].offsetTop;
        var st = getComputedStyle(g);
        g._padTop = parseFloat(st.paddingTop) || 0;
        g._padBottom = parseFloat(st.paddingBottom) || 0;
      }
    }
    if (!g._perLine) { drawRange(g, 0, Math.min(metas.length, 42)); return; }
    var line = Math.floor(at / g._perLine);
    var lines = Math.ceil(metas.length / g._perLine);
    if (!force && g._line != null && Math.abs(line - g._line) < 2 && (g._lastLine >= lines || g._lastLine - line > 2)) return;
    g._line = line;
    var first = Math.max(0, line - LINES_BEHIND);
    g._lastLine = Math.min(lines, line + LINES_AHEAD + 1);
    drawRange(g, first * g._perLine, Math.min(metas.length, g._lastLine * g._perLine));
    g.style.paddingTop = g._padTop + first * g._lineH + 'px';
    g.style.paddingBottom = g._padBottom + (lines - g._lastLine) * g._lineH + 'px';
  }

  /* a page with no end: rows far from the viewer let go of everything but their height (a TV has little memory: at 60 rows, with 1,800 pictures
     held, each frame took 100 ms instead of 17), and draw again on the way back. That work is done between presses, a few posters at a time and the
     nearest row first, so a press never waits for it: the page has already set off */
  var ROWS_BEHIND = 2, ROWS_AHEAD = 3, CARDS_AT_ONCE = 5, CARDS_ACROSS = 9;
  function park(r) {
    if (r._parked || !r._metas || r.querySelector('.card.focused')) return;
    r.style.height = r.offsetHeight + 'px';
    r._parked = true;
    r.classList.add('parked');
    r.querySelector('.htrack').innerHTML = '';
  }
  /* few: what fits across the screen is enough for a row being moved into, the rest follows */
  function unpark(r, few) {
    if (!r._parked) return;
    r._parked = false;
    r.classList.remove('parked');
    r.style.height = '';
    rowWindow(r, r._at || 0, true, few || CARDS_ACROSS);
  }
  function rowUnfinished(r) { return !r._parked && r._metas && r._to != null && r._to < r._metas.length && r._to - (r._at || 0) < CARDS_AHEAD + 1; }
  function growRow(r) {
    if (r._parked) unpark(r, CARDS_AT_ONCE);
    else if (rowUnfinished(r)) rowWindow(r, r._at || 0, true, r._to - Math.max(r._at || 0, r._from) + CARDS_AT_ONCE);
    return rowUnfinished(r);
  }
  function parkFar(track, near) {
    clearTimeout(track._tidy);
    var rows = track.querySelectorAll('.row'), at = Array.prototype.indexOf.call(rows, near);
    if (at < 0) return;
    var i, grow = [], leave = [];
    /* the row itself, what is coming, then what was just left */
    [0, 1, 2, 3, -1, -2].forEach(function (d) { var r = rows[at + d]; if (r && (r._parked || rowUnfinished(r))) grow.push(r); });
    for (i = 0; i < rows.length; i++) {
      if ((i < at - ROWS_BEHIND || i > at + ROWS_AHEAD) && !rows[i]._parked && rows[i]._metas) leave.push(rows[i]);
    }
    (function work() {
      if (!grow.length && !leave.length) return;
      track._tidy = setTimeout(function () {
        if (grow.length) {
          if (!grow[0].isConnected || !growRow(grow[0])) grow.shift();
        } else {
          var r = leave.shift();
          if (r.isConnected) park(r);
        }
        work();
      }, 24);
    })();
  }
  /* the row in the middle of what is on screen, for what has no focus to follow */
  function rowInView(box, track) {
    var mid = box.getBoundingClientRect().top + box.clientHeight / 2, list = track.querySelectorAll('.row');
    for (var i = 0; i < list.length; i++) {
      var b = list[i].getBoundingClientRect();
      if (b.top <= mid && b.bottom >= mid) return list[i];
    }
    return null;
  }
  /* a row taken away (its list came back empty) above the viewer: everything under it rises, and the viewer must not see that */
  function dropRow(r) {
    var cur = CS.nav.current(), here = cur && cur.closest && cur.closest('.row');
    var above = here && r.isConnected && here !== r && (r.compareDocumentPosition(here) & Node.DOCUMENT_POSITION_FOLLOWING);
    r.remove();
    if (above && here.isConnected) CS.nav.ensureVisible(cur, true);
  }
  function canPage(c) {
    var ex = c.cat.extra || [];
    return ex.some(function (x) { return x.name === 'skip'; }) || (c.cat.extraSupported || []).indexOf('skip') >= 0;
  }
  /* a finger's scrolling on a phone, the wheel and the arrows of a mouse: nothing focuses, so where the row now stands says what it should hold */
  function rowFromPosition(r) {
    var tr = r.querySelector('.htrack'), box = r.querySelector('.hscroll');
    if (!r._metas || r._parked || !cardStep) return;
    var gone = window.CS_ANDROID ? Math.abs(box.scrollLeft) : Math.abs(tr._sx || 0);
    var at = Math.round(gone / cardStep) + 2;
    rowWindow(r, at);
    keepFocusIn(tr);
    if (r._more && at >= r._metas.length - 8) r._more();
  }
  /* the wheel can carry the focused poster out of what is kept: the focus moves to what is in view, or the next press would start from nowhere */
  function keepFocusIn(holder) {
    var cur = CS.nav.current();
    if (cur && !cur.isConnected && holder.children.length) CS.nav.focus(holder.children[Math.floor(holder.children.length / 2)], 'no-scroll');
  }
  function followRow(r) {
    if (!window.CS_ANDROID) return;
    var wait = 0;
    r.querySelector('.hscroll').addEventListener('scroll', function () {
      if (wait) return;
      wait = setTimeout(function () { wait = 0; rowFromPosition(r); }, 120);
    }, { passive: true });
  }
  function gridFromPosition(g, box) {
    if (!g._perLine) return;
    var gone = window.CS_ANDROID ? box.scrollTop : Math.abs(g.parentNode._sy || 0);
    var at = Math.round(gone / g._lineH) * g._perLine;
    gridWindow(g, at);
    keepFocusIn(g);
    if (g._more && at >= g._metas.length - g._perLine * 3) g._more();
  }
  function followGrid(g, box) {
    if (!window.CS_ANDROID) return;
    var wait = 0;
    box.addEventListener('scroll', function () {
      if (wait) return;
      wait = setTimeout(function () { wait = 0; if (g.isConnected) gridFromPosition(g, box); }, 120);
    }, { passive: true });
  }
  /* the wheel on a page of rows or of posters. Called on every turn, looked at once it calms */
  function followWheel(screen, gridOf, rowsMoved) {
    var wait = 0;
    screen.slid = function (box, axis) {
      if (axis === 'x') { var r = box.closest('.row'); if (r) rowFromPosition(r); return; }
      clearTimeout(wait);
      wait = setTimeout(function () {
        var g = gridOf && gridOf();
        if (g) gridFromPosition(g, box);
        else if (rowsMoved) rowsMoved(box);
      }, 120);
    };
  }
  /* below the first row the words give way, and about two rows fit. Only movement and fading, which the TV draws smoothly */
  function followDepth(el, c) {
    if (window.CS_ANDROID) return;
    var row = c.closest('.row'), first = el.querySelector('.rows .row:not(.genre-row)'), grid = c.closest('.genre-grid');
    if (grid) { el.classList.add('deep'); wantMore(grid, c, 14); gridSoon(grid, c); return; }
    if (row) { wantMore(row, c, 8); rowSoon(row, c); }
    el.classList.toggle('deep', !!row && row !== first);
  }
  /* just after the press, so the press itself only moves things */
  var windowWait = 0;
  function rowSoon(row, c) {
    if (c._at == null) return;
    clearTimeout(windowWait);
    windowWait = setTimeout(function () { rowWindow(row, c._at); }, 30);
  }
  function gridSoon(grid, c) {
    if (c._at == null) return;
    clearTimeout(windowWait);
    windowWait = setTimeout(function () { gridWindow(grid, c._at); }, 30);
  }

  /* one row of a catalog: from what was kept at once, and fresh when it is old. first(): the row has its first posters */
  /* homeSeen: titles the home page has shown, so that its rows do not repeat each other */
  function loadCatalog(c, r, first, extra, homeSeen) {
    var key = 'cat:' + c.key + (extra && extra.genre ? ':' + extra.genre : '');
    var ranked = !extra && (catName(c.cat) === 'الأشهر' || /most popular/i.test(c.cat.name || ''));
    var cached = CS.cache.get(key);
    var draw = function (metas) {
      if (!r || !r.isConnected) return;
      if (!metas.length) { dropRow(r); return; }
      fillList(r, metas, function (m, i) { return card(m, ranked && i < 10 ? { rank: i + 1 } : null); }, canPage(c) && function (skip) { return CS.addons.catalog(c.addon, c.cat, Object.assign({}, extra || {}, { skip: skip })); }, homeSeen);
      first();
    };
    if (cached) {
      draw(cached);
      if (CS.cache.age(key) > 3 * 3600e3) CS.addons.catalog(c.addon, c.cat, extra).then(function (m) { CS.cache.set(key, m); });
      return;
    }
    return CS.addons.catalog(c.addon, c.cat, extra).then(function (metas) {
      CS.cache.set(key, metas);
      draw(metas);
    }, function (e) {
      CS.log('row failed', c.key, e.message || e.name);
      if (r) dropRow(r);
    });
  }
  /* a row's first posters and how it goes on */
  function fillList(r, metas, make, ask, seen) {
    r._metas = metas.slice();
    r._make = make;
    r._wake = function () { unpark(r); };
    var tr = r.querySelector('.htrack'), waiting = !!tr.querySelector('.skeleton, .spin-wrap');
    rowWindow(r, 0, true);
    if (waiting) stagger(Array.prototype.slice.call(tr.children));
    if (seen) metas.forEach(function (m) { seen[m.id] = 1; });
    if (ask) {
      r._more = CS.pager(ask, metas, metas.pageSize || metas.length, function (fresh) {
        Array.prototype.push.apply(r._metas, fresh);
        rowWindow(r, r._at || 0, true);
      }, 0, seen);
      followRow(r);
    }
  }
  /* the next row of a list that comes round again: from where it stopped, leaving out what the home page has shown. A page with little new
     is added to the next, so a row is never a few lonely posters */
  function nextOfList(one, seen, tries) {
    var c = one.c;
    return CS.addons.catalog(c.addon, c.cat, Object.assign({}, one.extra || {}, one.skip ? { skip: one.skip } : {})).then(function (metas) {
      if (!metas.length) { one.ended = true; return []; }
      one.skip += metas.pageSize || metas.length;
      if (!canPage(c)) one.ended = true;
      var fresh = metas.filter(function (m) { return !seen[m.id]; });
      fresh.forEach(function (m) { seen[m.id] = 1; });
      if (fresh.length >= 8 || !tries || one.ended) return fresh;
      return nextOfList(one, seen, tries - 1).then(function (more) { return fresh.concat(more); });
    });
  }
  function skeletonRow(title, key) {
    return row(title, [h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton')], key);
  }

  /* =============== a tab of its own: movies, series or anime =============== */
  var BROWSE_TAB = { movie: 0.2, series: 0.4, anime: 0.6 };
  function browse(kind) {
    var el = section('home');
    var hero = h('div.hero', null, [h('div.hero-logo'), h('div.hero-line'), h('p.hero-desc')]);
    var track = h('div.vtrack');
    var showHero = heroShower(hero);
    el.appendChild(topbar(kind));
    el.appendChild(hero);
    var rowsBox = h('div.rows.vscroll', { 'data-anchor': '0' }, track);
    el.appendChild(rowsBox);
    var cats = CS.addons.homeCatalogs().filter(function (c) { return kindOf(c) === kind; });
    /* a tab can hold dozens of lists: their rows come as the viewer goes down, and far ones let go, as on the home page */
    var catsLeft = [];
    function addCats(n) {
      CS.pool(catsLeft.splice(0, n), 4, function (c) {
        var r = skeletonRow(rowName(c), c.key);
        track.appendChild(r);
        return loadCatalog(c, r, firstPoster);
      });
    }
    function nearRow(row) {
      parkFar(track, row);
      var all = track.querySelectorAll('.row');
      if (catsLeft.length && Array.prototype.indexOf.call(all, row) >= all.length - 4) addCats(4);
    }
    var screen = {
      name: 'browse', el: el, tab: BROWSE_TAB[kind],
      focusChanged: function (c) {
        if (!c.classList.contains('card')) { el.classList.remove('deep'); return; }
        showHero(c);
        followDepth(el, c);
        var row = c.closest('.row');
        if (row) nearRow(row);
      },
      defaultFocus: function () { return el.querySelector('.row .card.f') || el.querySelector('.tab.on'); }
    };
    followWheel(screen, function () { return track.querySelector('.genre-grid'); }, function (box) {
      var r = rowInView(box, track);
      if (r) { if (r._wake) r._wake(); nearRow(r); }
    });
    /* a phone has no focus to follow: its scrolling says where the viewer is, and the words on top open their title, as at home */
    if (window.CS_ANDROID) {
      hero.onclick = function () { var c = CS.nav.current(); if (c && c._meta) c.click(); };
      var scrollWait = 0;
      rowsBox.addEventListener('scroll', function () {
        if (scrollWait) return;
        scrollWait = setTimeout(function () {
          scrollWait = 0;
          if (!rowsBox.isConnected || track.querySelector('.genre-grid')) return; /* a genre's posters follow the scrolling themselves */
          var r = rowInView(rowsBox, track);
          if (r) { if (r._wake) r._wake(); nearRow(r); }
          if (catsLeft.length && rowsBox.scrollHeight - rowsBox.clientHeight - rowsBox.scrollTop < 900) addCats(3);
        }, 250);
      }, { passive: true });
    }
    CS.nav.push(screen);
    setBg(BG_DEFAULT, true);
    if (!cats.length) {
      track.appendChild(CS.emptyState({ icon: 'plus', title: 'ما فيه قوائم لهالقسم', text: 'ركّب إضافة فيها هالنوع في حسابك على Stremio، وبعدها حدّثها من الإعدادات.' }));
      CS.nav.refocus();
      return;
    }
    /* the first catalog that can be asked by genre gives the choices; only genres with an Arabic name are offered */
    var genreCat = null, genres = [];
    genreCat = widestByGenre(cats);
    if (genreCat) genres = arabicGenres(genreCat);
    var chips = [];
    function pick(genre, chip) {
      chips.forEach(function (x) { x.classList.toggle('on', x === chip); });
      catsLeft = [];
      Array.prototype.slice.call(track.querySelectorAll('.row:not(.genre-row), .genre-grid')).forEach(function (r) { r.remove(); });
      el.classList.remove('deep');
      draw(genre);
    }
    function firstPoster() {
      var f = track.querySelector('.genre-grid .card.f, .row:not(.genre-row) .card.f');
      if (f && f._meta && !screen.heroSet) { screen.heroSet = true; showHero(f); }
      var cur = CS.nav.current();
      if (CS.nav.top() !== screen) return;
      if (!cur || cur.classList.contains('tab') || !cur.isConnected) {
        var onChip = track.querySelector('.chip.on');
        if (onChip || f) CS.nav.focus(onChip || f, 'instant');
      } else CS.nav.refocus();
    }
    function draw(genre) {
      screen.heroSet = false;
      rowsBox.dataset.anchor = genre ? '30' : '0';
      if (genre) {
        var grid = h('div.grid.genre-grid', null, CS.skel.cards(7));
        track.appendChild(grid);
        var key = 'cat:' + genreCat.key + ':' + genre, kept = CS.cache.get(key);
        var fill = function (metas) {
          if (!grid.isConnected) return;
          grid.innerHTML = '';
          if (!metas.length) { grid.appendChild(CS.emptyState({ icon: 'search', title: 'ما فيه عناوين في هالتصنيف', text: 'جرّب تصنيف ثاني.' })); CS.nav.refocus(); return; }
          grid._metas = metas.slice();
          grid._make = function (m) { return card(m); };
          drawRange(grid, 0, Math.min(metas.length, 42));
          gridWindow(grid, 0, true);
          if (canPage(genreCat)) {
            grid._more = CS.pager(function (skip) { return CS.addons.catalog(genreCat.addon, genreCat.cat, { genre: genre, skip: skip }); }, metas, metas.length, function (fresh) {
              Array.prototype.push.apply(grid._metas, fresh);
              gridWindow(grid, Math.max(0, grid._line || 0) * (grid._perLine || 1), true);
            });
            followGrid(grid, rowsBox);
          }
          firstPoster();
        };
        if (kept) { fill(kept); return; }
        CS.addons.catalog(genreCat.addon, genreCat.cat, { genre: genre }).then(function (metas) { CS.cache.set(key, metas); fill(metas); }, function () {
          if (!grid.isConnected) return;
          grid.innerHTML = '';
          grid.appendChild(CS.errorState({ title: 'ما ردّت الإضافة', reason: 'ما قدرنا نجيب هالتصنيف الحين.', retry: function () { pick(genre, track.querySelector('.chip.on')); } }));
          CS.nav.refocus();
        });
        return;
      }
      catsLeft = cats.slice();
      addCats(6);
    }
    if (genres.length) {
      var all = h('button.chip.f.on', { onclick: function () { pick(null, all); } }, 'الكل');
      chips = [all].concat(genres.map(function (g) {
        var b = h('button.chip.f', { onclick: function () { pick(g, b); } }, genreName(g));
        return b;
      }));
      track.appendChild(h('div.row.group.genre-row', { 'data-key': 'genres' }, h('div.hscroll', null, h('div.htrack', null, chips))));
    }
    draw(null);
  }

  /* =============== on now (يعرض الآن): series and anime still giving episodes (the owner's wish, 2026-11-14) ===============
     Asked of the hub (/cat/airing), which keeps only shows with an episode in the last 15 days and more to come: one that ends leaves by
     itself. Each poster says when its next episode comes (CS.nextEpisodeWords). One page of posters, line under line, as a genre's */
  /* the next titles of the chosen kinds: a page of each, taken in turn. A page with nothing on now is passed over, up to three */
  function airingSource(kinds) {
    var page = {}, over = {};
    kinds.forEach(function (k) { page[k] = 1; });
    function one(k, tries) {
      if (over[k]) return Promise.resolve([]);
      return CS.fetchJson(CS.config.hubUrl + '/cat/airing?kind=' + k + '&page=' + (page[k]++)).then(function (r) {
        if (!r || !r.more) over[k] = true;
        var metas = (r && r.metas) || [];
        return metas.length || over[k] || tries <= 1 ? metas : one(k, tries - 1);
      });
    }
    return function () {
      var failed = 0;
      return Promise.all(kinds.map(function (k) {
        return one(k, 3).catch(function () { failed++; over[k] = true; return []; });
      })).then(function (parts) {
        if (failed === kinds.length) throw new Error('hub');
        var out = [], seen = {}, most = 0;
        parts.forEach(function (p) { most = Math.max(most, p.length); });
        for (var i = 0; i < most; i++) parts.forEach(function (p) {
          var m = p[i];
          if (!m || !m.id || seen[m.id]) return;
          seen[m.id] = 1;
          /* Arabic words from TMDB, when the Wikipedia ones are not already known */
          if (m.arDescription && !arabicNow(m)) { m.description = m.arDescription; m.arabic = true; }
          out.push(m);
        });
        return out;
      });
    };
  }
  /* «مكتبتي» (the owner's wish, 2026-11-14): the shows in this profile's library that are on now, the soonest episode first. The hub is asked
     8 at a time (/cat/airing/mine); it knows IMDb and Kitsu ids. One answer for all: the posters are as the library has them */
  function libraryShows() {
    var own = {}, ids = [];
    CS.lib.libraryList().forEach(function (it) {
      if (it.type === 'movie' || own[it._id] || !/^(tt\d+|kitsu:\d+)$/.test(it._id || '')) return;
      own[it._id] = it;
      ids.push(it._id);
    });
    return { own: own, ids: ids.slice(0, 96) };
  }
  function airingMine(shows) {
    var done = false;
    return function () {
      if (done || !shows.ids.length) return Promise.resolve([]);
      done = true;
      var parts = [], failed = 0;
      for (var i = 0; i < shows.ids.length; i += 8) parts.push(shows.ids.slice(i, i + 8));
      return Promise.all(parts.map(function (p) {
        return CS.fetchJson(CS.config.hubUrl + '/cat/airing/mine?ids=' + encodeURIComponent(p.join(','))).then(function (r) { return (r && r.metas) || []; },
          function () { failed++; return []; });
      })).then(function (lists) {
        if (failed === parts.length) throw new Error('hub');
        var out = [], twice = {};
        lists.forEach(function (l) {
          l.forEach(function (m) {
            var it = m && shows.own[m.id];
            /* one show kept under both its Kitsu and its IMDb id: once */
            if (!it || twice[m.imdb || m.id]) return;
            twice[m.imdb || m.id] = 1;
            m.type = it.type;
            if (it.name) m.name = it.name;
            if (it.poster) m.poster = it.poster;
            if (m.arDescription && !arabicNow(m)) { m.description = m.arDescription; m.arabic = true; }
            out.push(m);
          });
        });
        return CS.soonestFirst(out);
      });
    };
  }
  function airing() {
    var el = section('home');
    var hero = h('div.hero', null, [h('div.hero-logo'), h('div.hero-line'), h('p.hero-desc')]);
    var track = h('div.vtrack');
    var showHero = heroShower(hero);
    el.appendChild(topbar('airing'));
    el.appendChild(hero);
    var box = h('div.rows.vscroll', { 'data-anchor': '30' }, track);
    el.appendChild(box);
    var screen = {
      name: 'airing', el: el, tab: 0.7,
      focusChanged: function (c) {
        if (!c.classList.contains('card')) { el.classList.remove('deep'); return; }
        showHero(c);
        followDepth(el, c);
      },
      defaultFocus: function () { return el.querySelector('.genre-grid .card.f') || el.querySelector('.chip.on') || el.querySelector('.tab.on'); }
    };
    followWheel(screen, function () { return track.querySelector('.genre-grid'); });
    /* a phone has no focus to follow: the words on top open their title, as in the other sections */
    if (window.CS_ANDROID) hero.onclick = function () { var c = CS.nav.current(); if (c && c._meta) c.click(); };
    CS.nav.push(screen);
    setBg(BG_DEFAULT, true);
    var KINDS = [['الكل', ['series', 'anime']], ['مسلسلات', ['series']], ['أنمي', ['anime']], ['مكتبتي', 'mine']];
    var chips = KINDS.map(function (k, i) {
      var b = h('button.chip.f' + (i ? '' : '.on'), { onclick: function () { pick(k[1], b); } }, k[0]);
      return b;
    });
    track.appendChild(h('div.row.group.genre-row', { 'data-key': 'kinds' }, h('div.hscroll', null, h('div.htrack', null, chips))));
    var asked = 0;
    function make(m) {
      var said = CS.nextEpisodeWords(m.nextAir);
      return card(m, said ? { tag: said, tagLow: true, hero: said + '   ' + metaLine(m) } : null);
    }
    function pick(kinds, chip) {
      chips.forEach(function (x) { x.classList.toggle('on', x === chip); });
      Array.prototype.slice.call(track.querySelectorAll('.genre-grid')).forEach(function (g) { g.remove(); });
      el.classList.remove('deep');
      draw(kinds);
    }
    function firstPoster() {
      var f = track.querySelector('.genre-grid .card.f');
      if (f && f._meta && !screen.heroSet) { screen.heroSet = true; showHero(f); }
      if (CS.nav.top() !== screen) return;
      var cur = CS.nav.current();
      if (!cur || cur.classList.contains('tab') || !cur.isConnected) {
        var onChip = track.querySelector('.chip.on');
        if (onChip || f) CS.nav.focus(onChip || f, 'instant');
      } else CS.nav.refocus();
    }
    function draw(kinds) {
      var shows = kinds === 'mine' ? libraryShows() : null;
      var mine = ++asked, more = shows ? airingMine(shows) : airingSource(kinds);
      screen.heroSet = false;
      var grid = h('div.grid.genre-grid', null, CS.skel.cards(7));
      track.appendChild(grid);
      /* a short first page leaves the screen half empty and nothing to scroll: the next pages come at once until it is full */
      var fillUp = function () { if (grid.isConnected && grid._more && grid._metas.length < 30) grid._more(); };
      more().then(function (metas) {
        if (mine !== asked || !grid.isConnected) return;
        grid.innerHTML = '';
        if (!metas.length) {
          grid.appendChild(CS.emptyState(!shows ? { icon: 'search', title: 'ما فيه شي يعرض الآن', text: 'جرّب بعدين.' }
            : !shows.ids.length ? { icon: 'heart', title: 'ما في مكتبتك مسلسلات ولا أنمي', text: 'أضف اللي تتابعه بزر «أضف لمكتبتي» من صفحته، ويطلع هنا لما تنزل حلقاته.' }
            : { icon: 'heart', title: 'ولا شي من مكتبتك يعرض الآن', text: 'أول ما يرجع واحد منها وتنزل له حلقة، أو يقرب موسمه الجديد، يطلع هنا.' }));
          CS.nav.refocus();
          return;
        }
        grid._metas = metas.slice();
        grid._make = make;
        drawRange(grid, 0, Math.min(metas.length, 42));
        gridWindow(grid, 0, true);
        grid._more = CS.pager(more, metas, metas.length, function (fresh) {
          Array.prototype.push.apply(grid._metas, fresh);
          gridWindow(grid, Math.max(0, grid._line || 0) * (grid._perLine || 1), true);
          fillUp();
        });
        followGrid(grid, box);
        firstPoster();
        fillUp();
      }, function () {
        if (mine !== asked || !grid.isConnected) return;
        grid.innerHTML = '';
        grid.appendChild(CS.errorState({ title: 'ما قدرنا نجيب اللي يعرض الآن', reason: 'تأكد من الإنترنت وجرّب مرة ثانية.', retry: function () { pick(kinds, track.querySelector('.chip.on')); } }));
        CS.nav.refocus();
      });
    }
    draw(KINDS[0][1]);
  }

  function home() {
    var el = section('home');
    var hero = h('div.hero', null, [h('div.hero-logo'), h('div.hero-line'), h('p.hero-desc')]);
    if (window.CS_ANDROID) hero.onclick = function () { var c = CS.nav.current(); if (c && c._meta) c.click(); };
    var track = h('div.vtrack');
    var rows = h('div.rows.vscroll', { 'data-anchor': '0' }, track);
    el.appendChild(topbar('home'));
    el.appendChild(hero);
    el.appendChild(rows);
    function viewMoved() {
      if (!rows.isConnected) return;
      var r = rowInView(rows, track);
      if (!r) return;
      /* being next, the rows around it are needed now: it may have been a long way */
      r._wake && r._wake();
      parkFar(track, r);
      var all = track.querySelectorAll('.row');
      if (nextMix && Array.prototype.indexOf.call(all, r) >= all.length - 4) addMix(4);
    }
    /* a phone has no focus to follow: its scrolling tells where the viewer is. Looked at a few times a second, not on every step */
    if (window.CS_ANDROID) {
      var scrollWait = 0;
      rows.addEventListener('scroll', function () {
        if (rows.scrollHeight - rows.clientHeight - rows.scrollTop < 900) addMix(3);
        if (scrollWait) return;
        scrollWait = setTimeout(function () { scrollWait = 0; viewMoved(); }, 250);
      }, { passive: true });
    }

    var showHero = heroShower(hero);
    /* going from row to row the words wait for the page to have set off. Along a row they change at once, as they always did */
    var heroWait = 0, heroRow = null;
    function heroFor(c) {
      var row = c.closest('.row');
      clearTimeout(heroWait);
      if (row === heroRow) { showHero(c); return; }
      heroRow = row;
      heroWait = setTimeout(function () { if (CS.nav.current() === c) showHero(c); }, 170);
    }

    /* continue watching first */
    var cwRow = null;
    function drawCW() {
      var list = CS.lib.continueWatching().slice(0, 20);
      var cards = list.map(function (it) {
        var m = { id: it._id, type: it.type, name: it.name, poster: it.poster, background: '', logo: '' };
        var st = it.state, vid = st.video_id || '', ep = /:(\d+):(\d+)$/.exec(vid);
        var left = st.duration ? Math.max(0, Math.round((st.duration - st.timeOffset) / 60000)) : 0;
        var kept = CS.cache.get('meta:' + it.type + ':' + it._id);
        /* before anything can take the focus: the hero reads these at once */
        if (kept) { m.background = kept.background; m.logo = kept.logo; m.description = kept.description; }
        var line = (ep ? CS.epLabel(+ep[1], +ep[2]) + '   ' : '') + (st.timeOffset <= 1 ? 'الحلقة التالية' : left ? 'باقي ' + CS.minLeft(left) : '');
        /* the title's own picture, never a frame of the episode (owner's choice). OK opens its page, where the first
           button goes on from the episode left off */
        var c = card(m, {
          progress: st.duration ? st.timeOffset / st.duration : null,
          wide: true,
          image: (kept && kept.background) || wideImage(it._id),
          caption: line,
          hero: line
        });
        c._cwId = it._id;
        c._askRemove = function () { askDismiss(it._id, it.name, function () { afterRemove(c); }, function () { CS.views.detail(m.type, m.id, m, { resume: true }); }); };
        c.addEventListener('contextmenu', function (e) { e.preventDefault(); CS.nav.focus(c, 'no-scroll'); c._askRemove(); });
        return c;
      });
      if (!cards.length) { if (cwRow) { cwRow.remove(); cwRow = null; } return; }
      var hint = window.CS_ANDROID ? 'اضغط مطوّل على البطاقة لخيارات أكثر' : CS.desktop ? 'زر الفأرة اليمين أو Delete لخيارات أكثر' : 'اضغط مطوّل على OK لخيارات أكثر';
      var was = CS.nav.current();
      if (!cwRow) {
        cwRow = row('متابعة المشاهدة', cards, 'cw', CS.settings.cwHintSeen ? null : hint);
        if (!CS.settings.cwHintSeen) { CS.settings.cwHintSeen = true; CS.saveSettings(); }
        track.insertBefore(cwRow, track.firstChild);
      }
      else fillRow(cwRow, cards);
      /* the focused card was drawn again: the focus moves to its new copy */
      if (was && was._cwId && !was.isConnected && homeScreen && CS.nav.top() === homeScreen) {
        var again = cards.filter(function (c) { return c._cwId === was._cwId; })[0];
        if (again) CS.nav.focus(again, 'instant');
      }
      /* fill hero info from the cached title pages */
      cards.forEach(function (c) {
        var cached = CS.cache.get('meta:' + c._meta.type + ':' + c._meta.id);
        if (cached) { c._meta.background = cached.background; c._meta.logo = cached.logo; c._meta.description = cached.description; }
      });
      drawBecause();
    }

    /* "because you watched": the newest title with a known genre, and the same genre from a catalog that can be asked by it */
    var becauseDone = false;
    function drawBecause() {
      if (becauseDone || !cwRow) return;
      var seed = null, gen = '';
      CS.lib.continueWatching().some(function (it) {
        var k = CS.cache.get('meta:' + it.type + ':' + it._id);
        var g = k && k.genres && k.genres.filter(genreName)[0];
        if (g && (it.type === 'movie' || it.type === 'series')) { seed = it; gen = g; return true; }
        return false;
      });
      if (!seed) return;
      var cat = CS.addons.homeCatalogs().filter(function (c) {
        return c.cat.type === seed.type && (c.cat.extra || []).some(function (x) { return x.name === 'genre' && x.options && x.options.indexOf(gen) >= 0; });
      })[0];
      if (!cat) return;
      becauseDone = true;
      var r = skeletonRow('لأنك شفت ' + seed.name, 'because');
      var afterTops = track.querySelector('.row[data-mix]');
      track.insertBefore(r, afterTops || null);
      var mine = {};
      CS.lib.libraryList().forEach(function (i) { mine[i._id] = 1; });
      CS.lib.continueWatching().forEach(function (i) { mine[i._id] = 1; });
      CS.addons.catalog(cat.addon, cat.cat, { genre: gen }).then(function (metas) {
        var fresh = metas.filter(function (m) { return !mine[m.id]; });
        if (fresh.length < 5 || !r.isConnected) { dropRow(r); return; }
        fillList(r, fresh.slice(0, 20), function (m) { return card(m); });
        CS.nav.refocus();
      }, function () { dropRow(r); });
    }

    /* after a removal: the focus moves to the card that took its place (or the one before), else the first poster */
    function afterRemove(c) {
      var cards = cwRow ? Array.prototype.slice.call(cwRow.querySelectorAll('.card')) : [];
      var i = cards.indexOf(c);
      drawCW();
      var now = cwRow ? cwRow.querySelectorAll('.card') : [];
      var next = now[Math.min(Math.max(i, 0), now.length - 1)] || track.querySelector('.row .card.f');
      if (next) CS.nav.focus(next, 'instant');
    }

    /* rows of every section, added as the viewer goes down. One that comes back empty makes way for the next */
    var nextMix = null, mixNo = 0, homeSeen = {};
    function addMix(count) {
      if (!nextMix) return;
      var fresh = [];
      for (var i = 0; i < count; i++) {
        var one = nextMix();
        if (!one) { nextMix = null; break; }
        var title = one.round ? 'المزيد من ' + one.title : one.title;
        one.round++;
        var r = skeletonRow(title, 'mix' + (++mixNo));
        r.setAttribute('data-mix', '1');
        track.appendChild(r);
        fresh.push({ one: one, r: r });
      }
      CS.pool(fresh, 3, function (f) {
        var c = f.one.c;
        return nextOfList(f.one, homeSeen, 2).then(function (metas) {
          if (!f.r.isConnected) return;
          if (!metas.length) { dropRow(f.r); addMix(1); return; }
          /* a list ending here gives its row; going on along it takes up from where the list as a whole has reached */
          fillList(f.r, metas, function (m) { return card(m); }, canPage(c) && function () {
            var at = f.one.skip;
            return CS.addons.catalog(c.addon, c.cat, Object.assign({}, f.one.extra || {}, { skip: at })).then(function (page) {
              f.one.skip = Math.max(f.one.skip, at + (page.pageSize || page.length));
              return page;
            });
          }, homeSeen);
        }, function (e) {
          /* this list does not answer: it is not asked again now, or a dead line would ask for ever */
          f.one.ended = true;
          CS.log('row failed', c.key, e.message || e.name);
          dropRow(f.r);
          addMix(1);
        });
      });
    }
    function moreRowsNear(c) {
      var row = c.closest('.row');
      if (!row) return;
      parkFar(track, row);
      if (!nextMix) return;
      var all = track.querySelectorAll('.row');
      if (Array.prototype.indexOf.call(all, row) >= all.length - 4) addMix(4);
    }
    function drawRows() {
      Array.prototype.slice.call(track.querySelectorAll('.row:not([data-key=cw]):not([data-key=because])')).forEach(function (r) { r.remove(); });
      homeSeen = {};
      var allCats = CS.addons.homeCatalogs(), cats = homeTops(allCats), rowOf = {};
      cats.forEach(function (c) {
        var r = skeletonRow(rowName(c), c.key);
        r._cat = c;
        rowOf[c.key] = r;
        track.appendChild(r);
      });
      var kept = track.querySelector('.row[data-key=because]');
      if (kept) track.appendChild(kept);
      nextMix = homeMix(allCats, cats);
      var t0 = Date.now();
      CS.pool(cats, 4, function (c) {
        /* by reference: catalog ids may hold characters a selector cannot take */
        return loadCatalog(c, rowOf[c.key], function () {
          /* the first row arrived before any key was pressed: start on its first poster */
          var cur = CS.nav.current();
          if (!CS.touched && CS.nav.top() === homeScreen && (!cur || cur.classList.contains('tab'))) {
            var first = track.querySelector('.row .card.f');
            if (first) CS.nav.focus(first, 'instant');
          } else CS.nav.refocus();
        }, null, homeSeen);
      }).then(function () {
        CS.log('home rows ready', cats.length, (Date.now() - t0) + 'ms');
        var old = track.querySelector('.state');
        if (old) old.remove();
        /* after the first rows, so the rows under them do not repeat what they show */
        if (track.querySelector('.row:not([data-key=cw])')) { addMix(6); return; }
        var box = cats.length
          ? CS.errorState({ title: 'ما وصلنا للإضافات', reason: 'ما ردّت أي إضافة بقوائمها. غالبًا الإنترنت مقطوع أو بطيء الحين.', retry: function () { box.remove(); drawRows(); },
            details: 'home rows: ' + cats.length + ' asked, 0 answered\n' + CS.logs.slice(-8).join('\n') })
          : CS.emptyState({ icon: 'plus', title: 'ما فيه إضافات بقوائم', text: 'ركّب إضافات في حسابك على Stremio (مثل Cinemeta)، وبعدها حدّثها من الإعدادات.',
            action: { label: 'افتح الإعدادات', run: function () { CS.views.settings(); } } });
        track.appendChild(box);
        if (CS.nav.top() === homeScreen && (!CS.nav.current() || !CS.nav.current().isConnected)) CS.nav.refocus();
      });
    }

    homeScreen = {
      name: 'home', el: el, tab: 0,
      /* on a "continue watching" card: Delete asks to remove it, OK waits to tell a long press from a short one */
      keys: function (e) {
        var cur = CS.nav.current();
        if (!cur || !cur._cwId) return false;
        if (e.keyCode === 46) { cur._askRemove(); return true; }
        if (e.keyCode !== CS.KEY.OK) return false;
        if (!e.repeat && press.card !== cur) pressDown(cur);
        return true;
      },
      focusChanged: function (c) { if (c.classList.contains('card')) { heroFor(c); followDepth(el, c); moreRowsNear(c); } else el.classList.remove('deep'); },
      /* far down a page with no end: back goes up to the top before anything else. From a long way it fades and comes back, not flying past everything */
      back: function () {
        var cur = CS.nav.current(), row = cur && cur.closest && cur.closest('.row'), first = track.querySelector('.row');
        if (!row || row === first) return false;
        unpark(first);
        var top = first.querySelector('.card.f');
        if (!top) return false;
        var list = track.querySelectorAll('.row');
        if (Array.prototype.indexOf.call(list, row) <= 4 || window.CS_ANDROID) { CS.nav.focus(top); return true; }
        rows.classList.add('leaping');
        setTimeout(function () {
          CS.nav.focus(top, 'instant');
          rows.classList.remove('leaping');
        }, 140);
        return true;
      },
      defaultFocus: function () { return el.querySelector('.row .card.f') || el.querySelector('.tab.f'); },
      shown: function () { drawCW(); if (CS.nav.current() && CS.nav.current()._meta) showHero(CS.nav.current()); },
      redrawRows: drawRows,
      redrawCW: drawCW
    };
    followWheel(homeScreen, null, viewMoved);
    CS.nav.reset(homeScreen);
    drawCW();
    drawRows();
    setBg(BG_DEFAULT, true);
  }

  /* =============== title page =============== */
  function detail(type, id, seed, opts) {
    opts = opts || {};
    var el = section('detail');
    var info = h('div.detail-info');
    var actions = h('div.actions.group');
    var seasonsBar = h('div.seasons.group.hscroll', { 'data-pad': '60' }, h('div.htrack'));
    var episodes = h('div.row.episodes.group', null, h('div.hscroll', null, h('div.htrack')));
    var epInfo = h('p.ep-info');
    el.appendChild(h('div.vscroll.detail-scroll', { 'data-pad': '80' }, h('div.vtrack', null, [info, actions, seasonsBar, episodes, epInfo])));
    addBack(el);
    var meta = null, watched = new Set(), season = null;
    /* the phone's download button, and the small mark on each episode: they follow the download while it runs */
    var dlBtn = null, dlVideo = null, dlMarks = {};
    var stopDl = CS.downloads ? CS.downloads.onChange(paintDl) : null;

    function dlAct(video) {
      var d = CS.downloads.forVideo(video.id);
      if (d && d.state !== 'failed') CS.views.downloads();
      else streams(meta, video, { download: true });
    }
    function paintDlBtn() {
      if (!dlBtn) return;
      var d = CS.downloads.forVideo(dlVideo.id);
      var what = meta.type === 'series' ? ' الحلقة ' + dlVideo.episode : '';
      if (!d) CS.setIcon(dlBtn, 'down', 'تحميل' + what);
      else if (d.state === 'done') CS.setIcon(dlBtn, 'check', 'محمّل' + what);
      else if (d.state === 'failed') CS.setIcon(dlBtn, 'down', 'أعد التحميل');
      else CS.setIcon(dlBtn, 'down', d.total > 0 ? CS.downloads.short(d) : 'يتحمّل…');
    }
    function paintMark(b, video) {
      var d = CS.downloads.forVideo(video.id);
      if (!d || d.state === 'done') CS.setIcon(b, d ? 'check' : 'down');
      else b.textContent = CS.downloads.short(d);
      b.className = 'ep-dl' + (d ? ' ' + d.state : '');
    }
    function paintDl() {
      paintDlBtn();
      Object.keys(dlMarks).forEach(function (id) { paintMark(dlMarks[id].el, dlMarks[id].video); });
    }

    function drawInfo(m) {
      info.innerHTML = '';
      CS.session.originalLang(m); /* asked now (once per title), so it is known by the time a source is chosen */
      var title = m.logo ? h('div.detail-logo', null, h('img', { src: m.logo, alt: '', onerror: function () { this.parentNode.textContent = m.name; } })) : h('h1.detail-title', { text: m.name });
      info.appendChild(title);
      info.appendChild(h('div.detail-line', { text: metaLine(m) }));
      arabicNow(m);
      var descEl = h('p.detail-desc', { text: m.description || '' });
      var descFrom = h('div.detail-source', { text: m.arabic ? 'الوصف من ويكيبيديا' : '' });
      if (m.description) info.appendChild(descEl);
      info.appendChild(descFrom);
      if (!m.arabic) CS.session.arabicInfo(m).then(function () {
        if (!arabicNow(m) || !descEl.isConnected) return;
        descEl.textContent = m.description;
        descFrom.textContent = 'الوصف من ويكيبيديا';
      });
      if (m.cast && m.cast.length) info.appendChild(h('div.detail-cast', { text: m.cast.slice(0, 5).join('، ') }));
      setBg(m.background || wideImage(m.id), true);
    }
    if (seed) drawInfo(seed);
    else CS.skel.lines([55, 35, 90, 80, 60]).forEach(function (x) { info.appendChild(x); });
    CS.skel.buttons(2).forEach(function (x) { actions.appendChild(x); });
    if (type === 'series') CS.skel.episodes(4).forEach(function (x) { episodes.querySelector('.htrack').appendChild(x); });

    function epVideo(vid) { return meta.videos.filter(function (x) { return x.id === vid; })[0]; }

    function drawActions() {
      actions.innerHTML = '';
      var rp = CS.lib.resumePoint(meta.id);
      var first = null;
      dlVideo = null;
      if (meta.type === 'series') {
        var vid = rp && epVideo(rp.videoId);
        if (vid) {
          var label = rp.offset > 5 ? 'أكمل ' + CS.epLabel(vid.season, vid.episode) + ' من ' + CS.fmtTime(rp.offset) : 'شغّل ' + CS.epLabel(vid.season, vid.episode);
          first = h('button.btn.primary.f', { onclick: function () { streams(meta, vid, { resume: rp.offset > 5 ? rp.offset : 0 }); } }, CS.iconKids('play', label));
          dlVideo = vid;
        } else {
          var e1 = meta.videos.filter(function (x) { return x.season > 0; })[0];
          if (e1) first = h('button.btn.primary.f', { onclick: function () { streams(meta, e1); } }, CS.iconKids('play', 'شغّل ' + CS.epLabel(e1.season, e1.episode)));
          dlVideo = e1 || null;
        }
      } else {
        var mv = { id: meta.id, title: meta.name };
        dlVideo = mv;
        var resumeAt = rp && rp.videoId === meta.id && rp.offset > 5 ? rp.offset : 0;
        first = h('button.btn.primary.f', { onclick: function () { streams(meta, mv, { resume: resumeAt }); } }, CS.iconKids('play', resumeAt ? 'أكمل من ' + CS.fmtTime(resumeAt) : 'شغّل'));
      }
      if (first) actions.appendChild(first);
      var lib = h('button.btn.f.half', {
        onclick: function () {
          var on = CS.lib.toggleLibrary(meta);
          CS.setIcon(lib, on ? 'check' : 'plus', on ? 'في مكتبتي' : 'أضف لمكتبتي');
          CS.toast(on ? 'انضاف لمكتبتك' : 'انحذف من مكتبتك');
        }
      }, CS.lib.inLibrary(meta.id) ? CS.iconKids('check', 'في مكتبتي') : CS.iconKids('plus', 'أضف لمكتبتي'));
      actions.appendChild(lib);
      /* a series of many episodes: one of them at random, to its sources like any other */
      if (meta.type === 'series' && CS.roll.randomEpisode(meta, Math.random, Date.now())) actions.appendChild(h('button.btn.f.half', { onclick: function () {
        var v = CS.roll.randomEpisode(meta, Math.random, Date.now());
        if (!v) return;
        CS.toast('حلقة عشوائية: ' + CS.epLabel(v.season, v.episode));
        streams(meta, v);
      } }, CS.iconKids('dice', 'حلقة عشوائية')));
      dlBtn = null;
      if (CS.downloads && dlVideo) {
        var forDl = dlVideo;
        dlBtn = h('button.btn.f.half', { onclick: function () { dlAct(forDl); } });
        paintDlBtn();
        actions.appendChild(dlBtn);
      }
      if (CS.lib.inContinueWatching(meta.id)) actions.appendChild(h('button.btn.f', { onclick: function () {
        askDismiss(meta.id, meta.name, function () { refreshProgress(); });
      } }, CS.iconKids('close', 'احذف من متابعة المشاهدة')));
      return first;
    }

    function drawSeasons() {
      var seasons = [];
      meta.videos.forEach(function (x) { if (x.season != null && seasons.indexOf(x.season) < 0) seasons.push(x.season); });
      seasons.sort(function (a, b) { return (a || 999) - (b || 999); });
      var tr = seasonsBar.querySelector('.htrack');
      tr.innerHTML = '';
      seasons.forEach(function (s) {
        var b = h('button.season.f' + (s === season ? '.on' : ''), { onclick: function () { season = s; drawSeasons(); drawEpisodes(); } }, s === 0 ? 'خاص' : 'الموسم ' + s);
        b._onFocus = function () { };
        tr.appendChild(b);
      });
      seasonsBar.style.display = seasons.length > 1 ? '' : 'none';
    }

    /* an episode's story on the phone: two lines, and all of it when its words are touched (a touch elsewhere plays) */
    function storyOf(text) {
      var more = h('span.ep-more', { text: 'المزيد' });
      var words = h('span.ep-words', { text: text });
      var box = h('div.ep-story', { onclick: function (e) {
        if (!box.classList.contains('long')) return;
        e.stopPropagation();
        more.textContent = box.classList.toggle('open') ? 'أقل' : 'المزيد';
      } }, [words, more]);
      setTimeout(function () { if (box.isConnected && words.scrollHeight > words.clientHeight + 1) box.classList.add('long'); }, 0);
      return box;
    }
    function epDate(vid) { return new Date(vid.released).toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' }); }

    function drawEpisodes(focusVid) {
      var tr = episodes.querySelector('.htrack');
      tr.innerHTML = '';
      tr._sx = 0; tr.style.transform = '';
      var rp = CS.lib.resumePoint(meta.id);
      var target = null;
      dlMarks = {};
      /* in the order of the story: the add-ons do not always list a season's episodes that way */
      meta.videos.filter(function (x) { return x.season === season; }).sort(function (a, b) { return (a.episode || 0) - (b.episode || 0); }).forEach(function (vid) {
        var future = vid.released && new Date(vid.released) > new Date();
        var mark = null;
        if (CS.downloads && !future) {
          mark = h('span.ep-dl', { onclick: function (e) { e.stopPropagation(); dlAct(vid); } });
          paintMark(mark, vid);
          dlMarks[vid.id] = { el: mark, video: vid };
        }
        var c = h('button.ep.f' + (future ? '.future' : ''), { onclick: function () { if (future) { CS.toast('للحين ما نزلت'); return; } streams(meta, vid); } }, [
          h('div.ep-thumb', null, vid.thumbnail ? h('img', { src: vid.thumbnail, loading: 'lazy', alt: '', onerror: function () { this.remove(); } }) : null),
          h('div.ep-name', { text: 'الحلقة ' + vid.episode + (vid.title ? ' · ' + vid.title : '') }),
          /* the phone shows these in the row: a finger has no focus to bring them up by */
          window.CS_ANDROID && vid.released ? h('div.ep-date', { text: epDate(vid) }) : null,
          window.CS_ANDROID && vid.overview ? storyOf(vid.overview) : null,
          watched.has(vid.id) ? h('div.ep-watched', { html: CS.icon('check') }) : null,
          rp && rp.videoId === vid.id && rp.duration ? h('div.progress', null, h('div', { style: { width: Math.round(rp.offset / rp.duration * 100) + '%' } })) : null,
          mark
        ]);
        c._onFocus = function () {
          epInfo.textContent = (vid.released ? epDate(vid) + ' — ' : '') + (vid.overview || '');
        };
        if (vid.id === focusVid) target = c;
        tr.appendChild(c);
      });
      if (target) { episodes._last = target; }
    }

    var scr = {
      name: 'detail', el: el, morph: !!opts.morph,
      destroy: function () { if (stopDl) stopDl(); },
      defaultFocus: function () { return actions.querySelector('.f'); },
      shown: function () {
        if (!meta) return;
        setBg(meta.background || wideImage(meta.id), true);
        /* coming back from the player: progress and watched marks changed */
        refreshProgress();
      }
    };
    function refreshProgress() {
      var cur = CS.nav.current();
      var keepIdx = cur && cur.classList.contains('ep') ? Array.prototype.indexOf.call(episodes.querySelectorAll('.ep'), cur) : -1;
      var it = CS.lib.get(meta.id);
      var p = meta.type === 'series' && it ? CS.lib.readWatched(it.state.watched, CS.lib.videoOrder(meta)) : Promise.resolve({ set: new Set() });
      /* the buttons are drawn again: the focus goes to the same place among them (the first when that one is gone) */
      var actIdx = cur && cur.parentNode === actions ? Array.prototype.indexOf.call(actions.children, cur) : -1;
      return p.then(function (r) {
        watched = r.set;
        var first = drawActions();
        if (meta.type === 'series') {
          drawEpisodes();
          if (keepIdx >= 0) { var eps = episodes.querySelectorAll('.ep'); if (eps[keepIdx]) CS.nav.focus(eps[keepIdx], 'instant'); }
        }
        var btn = actIdx >= 0 ? actions.children[actIdx] || first || actions.querySelector('.f') : null;
        if (btn && CS.nav.top() === scr) CS.nav.focus(btn, 'instant');
      });
    }
    CS.nav.push(scr);
    /* the account may hold a newer position for this title (watched on the phone): read it fresh */
    CS.lib.refreshItem(id).then(function (changed) { if (changed && meta && CS.nav.top() === scr) refreshProgress(); });

    CS.addons.meta(type, id).then(function (m) {
      meta = m;
      drawInfo(m);
      var it = CS.lib.get(m.id);
      if (m.type === 'series' && m.videos.length) {
        var rp = CS.lib.resumePoint(m.id);
        var at = rp && epVideo(rp.videoId);
        season = at ? at.season : (m.videos.filter(function (x) { return x.season > 0; })[0] || m.videos[0]).season;
        drawSeasons();
        var wp = it ? CS.lib.readWatched(it.state.watched, CS.lib.videoOrder(m)) : Promise.resolve({ set: new Set(), ok: true });
        wp.then(function (r) {
          watched = r.set;
          if (it && it.state.watched) CS.log('watched list read', m.id, r.set.size + ' watched', 'order matches: ' + r.ok);
          drawEpisodes(at ? at.id : null);
          var first = drawActions();
          if (first) CS.nav.focus(first, 'instant');
        });
      } else {
        seasonsBar.style.display = 'none';
        episodes.style.display = 'none';
        var first = drawActions();
        if (first) CS.nav.focus(first, 'instant');
      }
    }).catch(function (e) {
      info.innerHTML = '';
      actions.innerHTML = '';
      seasonsBar.style.display = 'none';
      episodes.style.display = 'none';
      if (seed && seed.name) info.appendChild(h('h1.detail-title', { text: seed.name }));
      actions.appendChild(CS.errorState({
        title: 'ما قدرنا نفتح صفحة العنوان',
        reason: 'ما ردّت إضافات حسابك بمعلومات هالعنوان. تأكد من الإنترنت وجرّب مرة ثانية.',
        retry: function () { CS.nav.pop(); detail(type, id, seed, opts); },
        back: function () { CS.nav.pop(); },
        details: 'meta ' + type + ' ' + id + '\n' + (e && e.message || e)
      }));
      CS.nav.refocus();
    });
  }

  /* =============== sources =============== */
  function streams(meta, video, opts) {
    opts = opts || {};
    /* already on the phone: it plays from there. (Choosing a source for a download, or after the file failed, the list opens as usual) */
    var kept = CS.downloads && !opts.download && !opts.failed && !opts.current ? CS.downloads.ready(video.id) : null;
    if (kept) { CS.player.play(meta, video, CS.downloads.stream(kept), { resume: opts.resume }); return; }
    var el = section('streams');
    var subLine = meta.type === 'series' ? CS.epLabel(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : (meta.releaseInfo || '');
    var head = h('div.streams-head', null, [
      h('h1', { text: meta.name }),
      h('div.streams-sub', { text: opts.download ? 'اختر مصدر التحميل' + (subLine ? ' · ' + subLine : '') : subLine })
    ]);
    var status = h('div.streams-status');
    /* the filter row on top, then the sources (redrawn on their own, so the row keeps its focus) */
    var filterBar = h('div.row.group.source-filters');
    var rowsBox = h('div.source-rows');
    var track = h('div.vtrack', null, [filterBar, rowsBox]);
    var listBox = h('div.streams-list.vscroll', { 'data-pad': '120' }, track);
    el.appendChild(head);
    el.appendChild(status);
    el.appendChild(listBox);
    addBack(el);

    var raw = [], answered = {}, touched = false, shownKeys = {};
    /* the audio languages wanted for this title (session.js: its original, or the viewer's own choice), once known: a copy with
       none of them goes after the others and is said to be dubbed only; the automatic choice waits a moment for the answer */
    var wanted = [], langKnown = false;
    var memo = opts.current ? CS.streams.memo(opts.current) : CS.settings.lastPick[meta.id];
    var adds = CS.addons.all().filter(function (a) { return CS.addons.supports(a, 'stream', meta.type, video.id); });

    function keyOf(o) { return o.addonId + '|' + (o.url || o.infoHash) + '|' + o.fileIdx; }
    /* a source's name in words: the one through the PC says what it is */
    function addonLabel(id, name) { return id === CS.config.speederId ? 'سريع عبر كمبيوترك' : name; }
    var task = CS.progressBox();
    var taskDetail = h('div.task-detail');
    status.appendChild(task.el);
    status.appendChild(taskDetail);
    function drawStatus() {
      var parts = adds.map(function (a) {
        var n = answered[a.manifest.id];
        return addonLabel(a.manifest.id, a.manifest.name) + (n === undefined ? ' …' : n === null ? ' ✕' : ' ' + n);
      });
      var done = Object.keys(answered).length, total = adds.length;
      var waiting = adds.filter(function (a) { return answered[a.manifest.id] === undefined; }).map(function (a) { return a.manifest.name; });
      task.set(total ? done / total : 1, done >= total
        ? 'انتهى البحث — ' + raw.length + ' مصدر'
        : 'نسأل إضافاتك عن المصادر: ' + done + ' من ' + total + (waiting.length ? ' — ننتظر ' + waiting[0] : ''));
      taskDetail.textContent = parts.join('   ·   ');
      /* it stays when something is wrong: no source at all, and the reason is in its words */
      if (done >= total && raw.length) setTimeout(function () { if (el.isConnected) el.classList.add('searched'); }, 900);
    }
    function rowFor(o, isMemo) {
      var failed = opts.failed && keyOf(opts.failed) === keyOf(o);
      var isBest = o === bestNow;
      /* a source the service has not fetched yet would send its "please wait" clip instead of the video */
      var notReady = opts.download && o.cached === false;
      var b = h('button.source.f' + (failed || notReady ? '.dim' : '') + (o.speeder ? '.fast' : '') + (isBest ? '.best' : ''), {
        onclick: function () {
          if (!opts.download) { CS.player.play(meta, video, o, { resume: opts.resume }); return; }
          if (notReady) { CS.toast('هالمصدر مو جاهز للتحميل — اختر مصدر عليه «جاهز»', 5000, 'warn'); return; }
          if (!CS.downloads.start(meta, video, o)) return;
          CS.nav.pop();
          CS.toast('بدأ التحميل — تابعه في «التحميلات»', 4000, 'ok');
        }
      }, [
        h('div.source-addon', null, [h('span.source-name', null, o.speeder ? CS.iconKids('bolt', addonLabel(o.addonId, o.addonName)) : o.addonName), isBest ? h('span.best-tag', { text: 'الأفضل لك' }) : o.cached === true ? h('span.cached', { text: 'جاهز' }) : o.cached === false ? h('span.uncached', { text: 'يحتاج تحميل' }) : null,
          o.dubOnly ? h('span.uncached', { text: 'دبلجة فقط' }) : null]),
        h('div.source-badges', null, CS.streams.badges(o).map(function (t) { return h('span.badge' + (t === 'Dolby Vision' ? '.dv' : ''), { text: t }); })),
        /* the best one is told by what it offers; a file's name is for telling the others apart */
        isBest && CS.streams.badges(o).length ? null : h('div.source-file', { text: o.file || o.lines[0] || o.name }),
        langLine(o),
        h('div.source-note', { text: notReady ? 'مو جاهز للتحميل' : opts.download && o.speeder ? 'يمر عبر كمبيوترك: يلزم يبقى شغّال وأنت في البيت' : failed ? 'ما اشتغل قبل شوي' : isMemo ? 'مثل اختيارك السابق' : o.needsServer ? 'يحتاج Stremio في كمبيوترك' :
          /* the mark after the site's Latin name keeps the count beside its own word (right to left) */
          [o.site ? 'من ' + o.site + '‏' : '', o.seeds ? o.seeds + ' مشارك' : ''].filter(Boolean).join(' · ') })
      ]);
      b._stream = o;
      b._onFocus = function () { probeSoon(o, b); };
      return b;
    }
    /* the languages a source has: its audio, and the subtitles inside the file (a guess from its name, unless the file
       was opened before and its own track list read). A long list shows its first few */
    var LANGS_SHOWN = 6;
    function langLine(o) {
      var L = o.langs || {};
      var names = function (list, more) {
        var shown = list.slice(0, LANGS_SHOWN).map(CS.streams.langName).join('، ');
        var rest = list.length - LANGS_SHOWN;
        return shown + (rest > 0 ? ' و' + rest + ' غيرها' : more ? ' وغيرها' : '');
      };
      var asking = o._probing;
      var unknown = o.speeder && !L.sure ? 'عدة لغات، وقف عليه ونقرا لغاته' : 'عدة لغات، ما ذكروا أي لغات';
      var audio = L.audio && L.audio.length ? names(L.audio, L.multiAudio) : L.multiAudio ? unknown : '';
      var subs = L.subs && L.subs.length ? names(L.subs, L.multiSubs) : L.multiSubs ? unknown : L.anySubs ? 'فيه، ولغتها مو مذكورة' : '';
      if (!audio && !subs && !asking) return null;
      return h('div.source-langs', null, [
        audio ? h('span.lang-part', null, [h('span.lang-k', { text: 'الصوت' }), h('span', { text: audio })]) : null,
        subs ? h('span.lang-part', null, [h('span.lang-k', { text: 'ترجمة مدمجة' }), h('span', { text: subs })]) : null,
        L.sure ? h('span.lang-sure', { text: 'من الملف نفسه' }) : asking ? h('span.lang-sure', { text: 'نقرا لغات الملف…' }) : null
      ]);
    }
    function redrawLangs(o, row) {
      var old = row.querySelector('.source-langs'), now = langLine(o);
      if (old && now) row.replaceChild(now, old);
      else if (old) row.removeChild(old);
      else if (now) row.insertBefore(now, row.querySelector('.source-note'));
    }
    /* a source through the PC whose name does not say its languages: the PC reads them from the file's start, for the one
       the viewer stops on, one at a time (a burst of reads gets the home shut out by the file server) */
    var probeTimer = 0, probing = false;
    function needsProbe(o) {
      var L = o.langs || {};
      if (L.sure || o._probed || !o.speeder || !/\/play\/[A-Za-z0-9_-]+/.test(o.url || '')) return false;
      return L.multiAudio || L.multiSubs || (L.anySubs && !L.subs.length) || (!L.audio.length && !L.subs.length);
    }
    function probeSoon(o, row) {
      clearTimeout(probeTimer);
      if (!needsProbe(o)) return;
      probeTimer = setTimeout(function () {
        if (probing || !alive || !row.isConnected) return;
        probing = true; o._probed = true; o._probing = true;
        redrawLangs(o, row);
        var u = o.url.replace(/\/play\/([A-Za-z0-9_-]+).*$/, '/tracks/$1.json');
        CS.fetchJson(u, { timeout: 70000, cache: 'no-store' }).then(function (r) {
          CS.streams.remember(o, (r && r.tracks) || []);
        }, function (e) { CS.log('file languages not read', e.message || e.name); }).then(function () {
          probing = false; o._probing = false;
          if (alive && row.isConnected) redrawLangs(o, row);
          /* the filter's choices count what is known now (not while one of its buttons is in use) */
          if (alive && lastAll && !filterBar.contains(CS.nav.current())) drawBar(lastAll);
          /* still on a row that needs it: that one next */
          var c = CS.nav.current();
          if (alive && c && c._stream && c !== row) probeSoon(c._stream, c);
        });
      }, 700);
    }

    /* ---------- the filter: one audio language, one language of the subtitles inside the file, one quality, and where
       the source comes from: the site it was found on (Nyaa, The Pirate Bay…) and the team that put it out (Erai-raws…).
       A button for each opens its choices. The languages and quality are kept for next time; the site and team for this
       title only (its next episodes), since another title may have nothing from them ---------- */
    var fromKept = (CS.settings.sourceFrom || {})[meta.id] || {}, placeNames = {};
    function keyName(s) { return (s || '').toLowerCase(); }
    var filt = (function () {
      var f = CS.settings.sourceFilter || {};
      var one = function (x) { return Array.isArray(x) && x.length ? [x[0]] : []; };
      var from = function (n) { if (!n) return []; placeNames[keyName(n)] = n; return [keyName(n)]; };
      return { audio: one(f.audio), subs: one(f.subs), res: one(f.res), site: from(fromKept.site), team: from(fromKept.team) };
    })();
    function filtered() { return filt.audio.length + filt.subs.length + filt.res.length + filt.site.length + filt.team.length > 0; }
    /* but: one kind left out, to count its choices among what the other kinds let through (Erai-raws picked: the sites
       counted are the ones it is on) */
    function passesBut(o, but) {
      var L = o.langs || {}, any = function (want, have) { return !want.length || want.some(function (c) { return (have || []).indexOf(c) >= 0; }); };
      return (but === 'audio' || any(filt.audio, L.audio)) && (but === 'subs' || any(filt.subs, L.subs)) &&
        (but === 'res' || !filt.res.length || filt.res.indexOf(o.res) >= 0) &&
        (but === 'site' || !filt.site.length || filt.site[0] === keyName(o.site)) && (but === 'team' || !filt.team.length || filt.team[0] === keyName(o.team));
    }
    function passes(o) { return passesBut(o, ''); }
    function saveFilter() {
      CS.settings.sourceFilter = { audio: filt.audio, subs: filt.subs, res: filt.res };
      var all = CS.settings.sourceFrom || {};
      var mine = { site: filt.site.length ? placeNames[filt.site[0]] || filt.site[0] : '', team: filt.team.length ? placeNames[filt.team[0]] || filt.team[0] : '', t: Date.now() };
      delete all[meta.id];
      if (mine.site || mine.team) all[meta.id] = mine;
      Object.keys(all).sort(function (a, b) { return (all[b].t || 0) - (all[a].t || 0); }).slice(40).forEach(function (id) { delete all[id]; });
      CS.settings.sourceFrom = all;
      CS.saveSettings();
    }
    function setFilter(kind, v) {
      filt[kind] = v == null ? [] : [v];
      saveFilter();
      draw(kind);
    }
    function clearFilter() {
      filt = { audio: [], subs: [], res: [], site: [], team: [] };
      saveFilter();
      draw('clear');
    }
    var placeLabel = function (v) { return placeNames[v] || v; };
    var KINDS = [
      { key: 'audio', title: 'الصوت', label: function (c) { return CS.streams.langName(c); } },
      { key: 'subs', title: 'الترجمة المدمجة', label: function (c) { return CS.streams.langName(c); } },
      { key: 'res', title: 'الجودة', label: function (r) { return r === 2160 ? '4K' : r + 'p'; } },
      { key: 'site', title: 'الموقع', label: placeLabel },
      { key: 'team', title: 'الفريق', label: placeLabel }
    ];
    var counts = null, lastAll = null;
    /* the choices of one kind, in a small list: "all", then what the sources found have */
    function pickFilter(k, total) {
      var c = counts[k.key], cur = filt[k.key][0];
      var vals = Object.keys(c).map(function (v) { return k.key === 'res' ? +v : v; })
        .sort(function (a, b) { return k.key === 'res' ? b - a : (c[b] - c[a]); });
      var rows = [{ v: null, label: 'الكل', note: total + ' مصدر' }].concat(vals.map(function (v) { return { v: v, label: k.label(v), note: c[v] + ' مصدر' }; }));
      var track = h('div.vtrack');
      var list = h('div.filter-list.vscroll', { 'data-pad': '20' }, track);
      rows.forEach(function (r) {
        var on = r.v === (cur == null ? null : cur);
        var b = h('button.panel-row.f' + (on ? '.on' : ''), { onclick: function () { CS.nav.pop(); setFilter(k.key, r.v); } }, [
          h('span.panel-main', null, on ? CS.iconKids('check', r.label) : r.label), h('span.panel-note', { text: r.note })
        ]);
        b._on = on;
        track.appendChild(b);
      });
      list.style.height = Math.min(rows.length, 7) * 86 + 'px';
      var box = h('div.confirm-box.filter-box', null, [h('p', { text: k.title }), list]);
      var modal = h('section.screen.confirm', null, box);
      CS.nav.push({ name: 'filter-pick', modal: true, el: modal, defaultFocus: function () {
        return Array.prototype.filter.call(track.children, function (x) { return x._on; })[0] || track.firstChild;
      } });
    }
    /* a button for each kind the sources differ in, saying what is picked */
    function drawBar(all) {
      lastAll = all;
      counts = { audio: {}, subs: {}, res: {}, site: {}, team: {} };
      var totals = {};
      /* each kind's choices counted among the sources the other kinds let through */
      KINDS.forEach(function (k) {
        var c = counts[k.key], add = function (v) { c[v] = (c[v] || 0) + 1; };
        var some = all.filter(function (o) { return passesBut(o, k.key); });
        totals[k.key] = some.length;
        some.forEach(function (o) {
          var L = o.langs || {};
          if (k.key === 'audio') (L.audio || []).forEach(function (x) { if (x !== 'orig') add(x); });
          else if (k.key === 'subs') (L.subs || []).forEach(add);
          else if (k.key === 'res') { if (o.res) add(o.res); }
          else if (o[k.key]) {
            /* a site or team written in two ways (BiA, bia) is one */
            var key = keyName(o[k.key]);
            if (!placeNames[key]) placeNames[key] = o[k.key];
            add(key);
          }
        });
      });
      var kids = [];
      KINDS.forEach(function (k) {
        var c = counts[k.key];
        filt[k.key].forEach(function (v) { if (!c[v]) c[v] = 0; }); /* what is picked stays, so it can be let go */
        var keys = Object.keys(c), n = keys.length;
        /* one quality for all, or every source from one site or one team: nothing to choose between */
        if (!n || (k.key === 'res' && n < 2 && !filt.res.length)) return;
        if ((k.key === 'site' || k.key === 'team') && n === 1 && c[keys[0]] >= totals[k.key] && !filt[k.key].length) return;
        var cur = filt[k.key][0];
        var b = h('button.chip.f.filter-btn' + (cur != null ? '.on' : ''), { onclick: function () { pickFilter(k, totals[k.key]); } }, [
          h('span.filter-k', { text: k.title + ':' }), h('span', { text: cur != null ? k.label(cur) : 'الكل' }), h('span.ico-wrap', { html: CS.icon('chevron') })
        ]);
        b._fkey = k.key;
        kids.push(b);
      });
      if (filtered()) { var x = h('button.chip.f.filter-clear', { onclick: clearFilter }, 'امسح الفلتر'); x._fkey = 'clear'; kids.push(x); }
      filterBar.innerHTML = '';
      if (!kids.length) { filterBar.style.display = 'none'; return; }
      filterBar.style.display = '';
      filterBar.appendChild(h('div.filter-btns', null, kids));
      filterBar._last = filterBar.querySelector('.chip');
    }

    /* the one to take without thinking: for a download, a direct and ready one; after a failure, none is promised */
    var bestNow = null;
    function bestOf(list, pick) {
      if (opts.failed) return null;
      if (!opts.download) return pick;
      var fit = list.filter(function (o) { return !o.speeder && o.cached !== false; });
      return CS.streams.pickLike(fit, memo) || list.filter(function (o) { return o.cached !== false; })[0] || null;
    }
    /* chip: the filter chip just pressed (its key): everything is drawn again and the focus stays on it */
    /* «شغّل أفضل مصدر تلقائيًا»: the best of the list by quality plays by itself once the add-ons have answered (or after 6 s),
       unless a key was pressed meanwhile (then the list stays, to choose from). Not for a download, after a failure, or when the
       list was opened from the player to change the source */
    var autoOn = CS.settings.autoBest && !opts.download && !opts.failed && !opts.current, autoDone = false, autoStart = Date.now();
    /* meanwhile a waiting screen instead of the list; back or an arrow shows the list, to choose from */
    var waitBox = null;
    if (autoOn) {
      waitBox = h('div.auto-wait', null, [h('div.auto-wait-spin'), h('div.auto-wait-title', { text: 'نجهّز أفضل مصدر…' }),
        h('div.auto-wait-sub', { text: 'أعلى جودة جاهزة، وأدق ترجمة بعدها. اضغط «رجوع» إذا تبي تختار بنفسك' })]);
      el.classList.add('auto-on');
      el.appendChild(waitBox);
    }
    function showList(why) {
      if (!waitBox) return;
      el.removeChild(waitBox);
      waitBox = null;
      el.classList.remove('auto-on');
      touched = true;
      if (why) CS.toast(why, 5000);
      CS.nav.refocus();
    }
    function maybeAuto(final) {
      if (!autoOn || autoDone || touched || !alive) return;
      var everyone = Object.keys(answered).length >= adds.length;
      if (!everyone && !final && Date.now() - autoStart < 6000) return;
      if (!langKnown && !final) return; /* the title's own language is still being asked (a moment, once per title) */
      var best = bestNow && bestNow.cached !== false && CS.streams.playUrl(bestNow) ? bestNow : null;
      if (!best) { if (final || everyone) showList('ما لقينا مصدر جاهز للتشغيل الحين، اختر بنفسك'); return; }
      autoDone = true;
      /* The best and up to four others of its very class (the same picture, sound and language; only the size differs) are asked
         at once for two bytes, and the first to answer plays. With none equal to it, the best and the next three in the list are
         asked: the best plays if it answers, else the first after it that did. Behind the one playing wait the others that
         answered, then the next in the list, so a failure goes on to the next without the list. None answering: the best plays */
      var playable = list0().filter(function (o) { return o.cached !== false && CS.streams.playUrl(o) && !o.needsServer; });
      if (playable.indexOf(best) < 0) playable.unshift(best);
      /* a dubbed-only copy (the title's own language not in it) is neither tried nor waited behind, while any other can play */
      var own = playable.filter(function (o) { return !o.dubOnly; });
      if (own.length) { playable = own; if (best.dubOnly) best = own[0]; }
      var peers = CS.streams.peers(playable, 5);
      if (peers.indexOf(best) < 0) peers = [best].concat(peers).slice(0, 5);
      var race = peers.length >= 2, asked = race ? peers : playable.slice(0, 4);
      var state = asked.map(function () { return 0; }); /* 0 waiting, 1 answered, -1 no answer */
      var tries = [], decided = false;
      var go = function (first, why) {
        if (decided || !alive) return;
        decided = true;
        tries.forEach(function (x) { x.abort(); });
        var none = why === 'none answered';
        var rest = asked.filter(function (o, i) { return o !== first && (none || state[i] === 1); })
          .concat(playable.filter(function (o) { return asked.indexOf(o) < 0; })).slice(0, 6);
        CS.log('auto source', why, (first.file || first.name).slice(0, 70), CS.streams.badges(first).join(' '), rest.length + ' behind');
        CS.toast('نشغّل أفضل مصدر: ' + CS.streams.badges(first).join(' · '), 4000);
        CS.player.play(meta, video, first, { resume: opts.resume, alternates: rest });
      };
      var settle = function () {
        if (decided) return;
        var i;
        if (race) { i = state.indexOf(1); if (i >= 0) { go(asked[i], 'fastest of ' + asked.length); return; } }
        else {
          for (i = 0; i < asked.length; i++) {
            if (state[i] === 0) return; /* one higher in the list may still answer */
            if (state[i] === 1) { go(asked[i], i ? 'the best did not answer, number ' + (i + 1) + ' did' : 'the best answers'); return; }
          }
        }
        if (state.indexOf(0) < 0) go(best, 'none answered');
      };
      if (asked.length < 2) { go(best, 'alone'); return; }
      if (waitBox) waitBox.querySelector('.auto-wait-title').textContent = race ? 'نجرّب أفضل ' + asked.length + ' مصادر، وأسرعها يشتغل…' : 'نتأكد إن أفضل مصدر يشتغل…';
      tries = asked.map(function (o) { return CS.streams.probe(o, 12000); });
      tries.forEach(function (t, i) {
        t.then(function (ms) {
          state[i] = 1;
          CS.log('auto source: answered', i + 1, 'of', asked.length, ms + 'ms');
          settle();
        }, function (e) {
          state[i] = -1;
          CS.log('auto source: no answer', i + 1, e && e.message);
          settle();
        });
      });
    }
    /* the whole list as it stands, ordered and filtered (maybeAuto) */
    function list0() { return (opts.download ? CS.streams.forDownload(raw, wanted) : CS.streams.order(raw, false, wanted)).filter(passes); }
    if (autoOn) setTimeout(function () { maybeAuto(true); }, 6100);
    function draw(chip) {
      var all = opts.download ? CS.streams.forDownload(raw, wanted) : CS.streams.order(raw, !!(opts.failed && opts.failed.speeder), wanted);
      var list = all.filter(passes);
      /* in the automatic mode the best by quality, not the kind chosen last time */
      var pick = autoOn ? list.filter(function (o) { return o.cached !== false && CS.streams.playUrl(o); })[0] || list[0] || null : CS.streams.pickLike(list, memo);
      var inBar = filterBar.contains(CS.nav.current());
      if (chip || !touched || !inBar) drawBar(all);
      if (!touched || chip) {
        bestNow = bestOf(list, pick);
        if (bestNow) {
          pick = bestNow;
          list = [bestNow].concat(list.filter(function (o) { return o !== bestNow; }));
        }
        rowsBox.innerHTML = '';
        shownKeys = {};
        if (!list.length && all.length) {
          /* there are sources, none of them as the filter asks */
          rowsBox.appendChild(CS.emptyState({
            icon: 'search', title: 'ما فيه مصدر بهالفلتر',
            text: 'لقينا ' + all.length + ' مصدر، بس ولا واحد فيه اللي اخترته.' +
              (filt.audio.length || filt.subs.length ? ' اللغات مأخوذة من اسم المصدر، فممكن الملف فيه أكثر من المكتوب.' : ''),
            action: { icon: 'close', label: 'امسح الفلتر', run: clearFilter }
          }));
        }
        else if (!list.length) {
          var allAnswered = Object.keys(answered).length >= adds.length;
          var failedAll = allAnswered && adds.length && adds.every(function (a) { return answered[a.manifest.id] === null; });
          if (!allAnswered) CS.skel.sources(4).forEach(function (x) { rowsBox.appendChild(x); });
          else if (failedAll) rowsBox.appendChild(CS.errorState({
            title: 'ما ردّت الإضافات', reason: 'كل إضافات المصادر في حسابك ما ردّت. غالبًا الإنترنت مقطوع أو الإضافة متوقفة.',
            retry: function () { CS.nav.pop(); streams(meta, video, opts); }, back: function () { CS.nav.pop(); },
            details: 'streams ' + meta.type + ' ' + video.id + '\n' + adds.map(function (a) { return a.manifest.name + ': no answer'; }).join('\n')
          }));
          else rowsBox.appendChild(CS.emptyState({
            icon: 'search', title: 'ما فيه مصادر لهالعنوان',
            text: adds.length ? 'إضافاتك ما لقت له أي رابط الحين. جرّب بعد شوي، أو أضف إضافة مصادر ثانية في حسابك.' : 'ما في حسابك إضافة مصادر (مثل Torrentio). أضفها في Stremio ثم حدّث الإضافات من الإعدادات.',
            action: { icon: 'retry', label: 'دوّر مرة ثانية', run: function () { CS.nav.pop(); streams(meta, video, opts); } }
          }));
        }
        list.forEach(function (o, i) {
          if (bestNow && i === 1) rowsBox.appendChild(h('h2.sources-head', { text: 'مصادر ثانية' }));
          shownKeys[keyOf(o)] = 1;
          rowsBox.appendChild(rowFor(o, memo && o === pick));
        });
        var target = null;
        /* a filter chip just pressed keeps the focus */
        if (chip) target = Array.prototype.filter.call(filterBar.querySelectorAll('.chip'), function (x) { return x._fkey === chip; })[0] || null;
        if (target) { CS.nav.focus(target, 'instant'); return; }
        if (opts.failed) target = Array.prototype.filter.call(rowsBox.querySelectorAll('.source'), function (x) { return !x.classList.contains('dim'); })[0];
        else if (pick) target = Array.prototype.filter.call(rowsBox.querySelectorAll('.source'), function (x) { return x._stream === pick; })[0];
        target = target || rowsBox.querySelector('.source') || rowsBox.querySelector('.f') || filterBar.querySelector('.f'); /* nothing found: the state's first button */
        if (target) CS.nav.focus(target, 'instant');
      } else {
        /* the user is already choosing: add late answers at the end, without moving anything */
        list.forEach(function (o) { if (!shownKeys[keyOf(o)]) { shownKeys[keyOf(o)] = 1; rowsBox.appendChild(rowFor(o, false)); } });
      }
    }
    var alive = true;
    var scr = {
      name: 'streams', el: el,
      keys: function (e) {
        if (e.keyCode >= 37 && e.keyCode <= 40) { if (waitBox) { showList(); return true; } touched = true; }
        return false;
      },
      back: function () { if (waitBox) { showList(); return true; } return false; }, /* the automatic mode's waiting screen: back shows the list */
      destroy: function () { alive = false; } /* late answers after leaving are dropped */
    };
    CS.nav.push(scr);
    drawStatus();
    draw();
    CS.session.audioWanted(meta).then(function (w) {
      langKnown = true;
      if (!alive) return;
      if (w.list.length) { wanted = w.list; draw(); }
      maybeAuto(false);
    });
    CS.addons.streams(meta.type, video.id, function (a, s) {
      if (!alive) return;
      answered[a.manifest.id] = s ? s.length : null;
      if (s) raw = raw.concat(s);
      drawStatus();
      draw();
      maybeAuto(false);
    });
  }

  /* =============== a random pick: the choices ===============
     Three parts, each in the form that suits it. What to watch (where from, kind, country, genres) as chips; the conditions (rating,
     time, length) as three steppers on one line, OK going through their values; and the two settings set once (seen ones, what
     happens after) as small switches beside the button. Under the button, how many titles fit, as the choices change. */
  var ROLL_KINDS = [['movie', 'فيلم'], ['series', 'مسلسل'], ['anime', 'أنمي']];
  var ROLL_SOURCES = [['all', 'من كل شي'], ['library', 'من مكتبتي']];
  var ROLL_COUNTRIES = [['', 'أي بلد'], ['KR', 'كوري'], ['JP', 'ياباني'], ['US', 'أمريكي'], ['GB', 'بريطاني'], ['TR', 'تركي'], ['IN', 'هندي'], ['ES', 'إسباني'], ['TH', 'تايلندي'], ['CN', 'صيني'], ['FR', 'فرنسي']];
  var ROLL_FORMS = [['series', 'مسلسل'], ['movie', 'فيلم'], ['any', 'أي واحد']];
  var ROLL_GENRES = [['', 'الكل'], ['action', 'أكشن'], ['romance', 'رومانسي'], ['comedy', 'كوميديا'], ['drama', 'دراما'], ['crime', 'جريمة'], ['mystery', 'غموض'], ['thriller', 'إثارة'],
    ['horror', 'رعب'], ['scifi', 'خيال علمي'], ['fantasy', 'فانتازيا'], ['adventure', 'مغامرة'], ['family', 'عائلي'], ['history', 'تاريخي'], ['war', 'حرب'], ['documentary', 'وثائقي']];
  var ROLL_MINS = [[0, 'أي تقييم'], [6, '★ 6 وفوق'], [7, '★ 7 وفوق'], [7.5, '★ 7.5 وفوق'], [8, '★ 8 وفوق']];
  var ROLL_ERAS = [['', 'أي وقت'], ['new', 'جديد'], ['2010', 'العشرية الماضية'], ['2000', 'الألفينات'], ['old', 'قبل 2000']];
  var ROLL_LENGTHS = [[false, 'أي مدة'], [true, 'أقل من ساعة ونص']];
  var ROLL_SEEN = [[true, 'لا تطلعه'], [false, 'عادي يطلع']];
  var ROLL_THEN = [['card', 'اعرض البطاقة'], ['play', 'شغّل على طول']];
  function rollWords(list, v) { var x = list.filter(function (o) { return o[0] === v; })[0]; return x ? x[1] : ''; }
  /* the choices in one line, under the button: what «اختر لي» is about to look for */
  function rollSummary(c) {
    var lib = c.source === 'library';
    var what = c.kind === 'anime' ? (c.form === 'movie' ? 'فيلم أنمي' : c.form === 'series' ? 'مسلسل أنمي' : 'أنمي') : rollWords(ROLL_KINDS, c.kind) + (c.country ? ' ' + rollWords(ROLL_COUNTRIES, c.country) : '');
    var bits = lib ? ['من مكتبتي', c.kind === 'anime' ? 'أي نوع' : rollWords(ROLL_KINDS, c.kind)] : [what];
    if (!lib) {
      if (c.genres.length) bits.push(c.genres.map(function (g) { return rollWords(ROLL_GENRES, g); }).join(' أو '));
      if (c.min) bits.push(rollWords(ROLL_MINS, c.min));
      if (c.era) bits.push(c.era === 'new' ? 'آخر 3 سنين' : rollWords(ROLL_ERAS, c.era));
      if (c.short && CS.roll.shortApplies(c)) bits.push('أقل من ساعة ونص');
    }
    if (c.skipSeen) bits.push('ما شفته');
    return bits.join(' · ');
  }

  function rollOptions() {
    var c = CS.roll.choices();
    var el = section('roll');
    var track = h('div.vtrack');
    el.appendChild(topbar('random'));
    el.appendChild(h('div.vscroll.roll-scroll', { 'data-pad': '80' }, track));
    function choose(set) { return function (v) { set(v); CS.settings.roll = c; CS.saveSettings(); draw(); }; }
    function chips(key, items, isOn, pick, multi) {
      return h('div.hscroll', { 'data-pad': '40' }, h('div.htrack', null, items.map(function (it) {
        var on = isOn(it[0]);
        return h('button.chip.f' + (on ? '.on' : '') + (multi && it[0] ? '.multi' : ''), { 'data-key': key, 'data-v': String(it[0]), 'aria-pressed': on ? 'true' : 'false', onclick: function () { pick(it[0]); } }, it[1]);
      })));
    }
    function optRow(key, label, items, isOn, pick, hint, multi) {
      return h('div.row.group.roll-opt', { 'data-row': key }, [
        h('div.roll-label', null, [label ? h('span', { text: label }) : null, hint ? h('span.roll-hint', { text: hint }) : null]),
        chips(key, items, isOn, pick, multi)
      ]);
    }
    /* a stepper: its name, its value, and dots for where the value is among the others. OK takes the next one */
    function stepper(key, label, list, value, set) {
      var at = Math.max(0, list.map(function (o) { return o[0]; }).indexOf(value));
      return h('button.roll-step.f', { 'data-key': key, onclick: function () { choose(set)(CS.roll.next(list, value)); } }, [
        h('span.roll-step-label', { text: label }),
        h('span.roll-step-value', { text: list[at][1] }),
        h('span.roll-dots', null, list.map(function (o, i) { return h('i' + (i === at ? '.on' : '')); }))
      ]);
    }
    function toggle(key, label, list, value, set) {
      return h('button.roll-toggle.f', { 'data-key': key, onclick: function () { choose(set)(CS.roll.next(list, value)); } }, [
        h('span.roll-toggle-label', { text: label }), h('span.roll-toggle-value', { text: rollWords(list, value) })
      ]);
    }
    var genresOn = function (x) { return x ? c.genres.indexOf(x) >= 0 : !c.genres.length; };
    var pickGenre = choose(function (x) { c.genres = CS.roll.toggleGenre(c.genres, x); });
    function draw() {
      /* what had the focus keeps it when the page is drawn again (a kind brings other rows) */
      var cur = CS.nav.current(), key = cur && cur.dataset ? cur.dataset.key : null, v = cur && cur.dataset ? cur.dataset.v : null;
      var lib = c.source === 'library';
      track.innerHTML = '';
      track.appendChild(h('div.roll-head', null, [h('h1', { text: 'اختيار عشوائي' }), h('p', { text: 'حدّد اللي تبيه، ونختار لك عمل منه بالصدفة.' })]));
      track.appendChild(h('h3.roll-sec', { text: 'وش تبي تشوف' }));
      track.appendChild(optRow('source', 'من وين', ROLL_SOURCES, function (x) { return x === c.source; }, choose(function (x) { c.source = x; })));
      track.appendChild(optRow('kind', 'النوع', ROLL_KINDS, function (x) { return x === c.kind; }, choose(function (x) { c.kind = x; })));
      if (lib) {
        track.appendChild(h('p.roll-note', { text: c.kind === 'anime' ? 'نختار من اللي حفظته في مكتبتك، أفلام ومسلسلات: المكتبة ما تفرّق الأنمي عن غيره.' : 'نختار من اللي حفظته في مكتبتك. البلد والتصنيف والشروط ما تنطبق هنا.' }));
      } else {
        if (c.kind === 'anime') track.appendChild(optRow('form', 'الشكل', ROLL_FORMS, function (x) { return x === c.form; }, choose(function (x) { c.form = x; })));
        else track.appendChild(optRow('country', 'البلد', ROLL_COUNTRIES, function (x) { return x === c.country; }, choose(function (x) { c.country = x; })));
        /* the genres in two lines, all in sight; each line is a row of its own, so up and down go between them */
        /* the hint sits beside the second line on the TV; on the phone the lines wrap into one block, so it goes by the name */
        var multiHint = 'اختر أكثر من واحد';
        track.appendChild(optRow('genres', 'التصنيف', ROLL_GENRES.slice(0, 8), genresOn, pickGenre, window.CS_ANDROID ? multiHint : '', true));
        track.appendChild(optRow('genres', '', ROLL_GENRES.slice(8), genresOn, pickGenre, window.CS_ANDROID ? '' : multiHint, true));
        track.appendChild(h('h3.roll-sec', { text: 'الشروط' }));
        track.appendChild(h('div.row.group.roll-steps', null, [
          stepper('min', 'أقل تقييم', ROLL_MINS, c.min, function (x) { c.min = x; }),
          stepper('era', 'الفترة', ROLL_ERAS, c.era, function (x) { c.era = x; }),
          CS.roll.shortApplies(c) ? stepper('short', 'المدة', ROLL_LENGTHS, !!c.short, function (x) { c.short = x; }) : null
        ]));
      }
      track.appendChild(h('div.row.group.roll-go', null, [
        h('button.btn.primary.f.roll-go-btn', { 'data-key': 'go', onclick: function () {
          if (count.now === 0) { CS.toast(c.source === 'library' ? 'ما فيه شي في مكتبتك يناسب' : 'ما فيه شي يناسب هالاختيارات، خفّف شرط', 'warn'); return; }
          rollResult(CS.roll.choices());
        } }, CS.iconKids('dice', 'اختر لي')),
        /* the switches stand by the button, before the words: those change length, the switches never move */
        h('div.roll-toggles', null, [
          toggle('seen', 'اللي شفته', ROLL_SEEN, !!c.skipSeen, function (x) { c.skipSeen = x; }),
          toggle('then', 'بعد الاختيار', ROLL_THEN, c.then, function (x) { c.then = x; })
        ]),
        h('div.roll-what', null, [h('p.roll-count'), h('p.roll-sum', { text: rollSummary(c) })])
      ]));
      var recent = CS.settings.rollRecent || [];
      if (recent.length) track.appendChild(row('آخر اختياراتك', recent.map(function (m) { return card(m); }), 'roll-recent'));
      askCount();
      var back = key ? track.querySelector('.f[data-key="' + key + '"][data-v="' + v + '"]') || track.querySelector('.f[data-key="' + key + '"]') : null;
      if (back) CS.nav.focus(back, 'no-scroll');
    }
    /* how many titles fit, asked of the hub a moment after the choices stop changing (the library is counted here) */
    var count = { now: null, asked: '', timer: 0 };
    function askCount() {
      if (c.source === 'library') { count.asked = 'library'; count.now = CS.roll.libraryPicks(CS.lib.libraryList(), c).length; paintCount(); return; }
      if (!CS.config.hubUrl) return;
      var q = CS.roll.query(c, true);
      if (q === count.asked) { paintCount(); return; }
      count.asked = q;
      count.now = null;
      paintCount();
      clearTimeout(count.timer);
      count.timer = setTimeout(function () {
        CS.fetchJson(CS.config.hubUrl + q, { timeout: 12000 }).then(function (r) {
          if (count.asked !== q) return;
          count.now = r && typeof r.total === 'number' ? r.total : -1;
          paintCount();
        }, function () { if (count.asked === q) { count.now = -1; paintCount(); } });
      }, 450);
    }
    function paintCount() {
      var p = track.querySelector('.roll-count'), go = track.querySelector('.roll-go-btn');
      if (!p) return;
      var n = count.now, lib = c.source === 'library', about = !lib && (c.genres.length > 1 || (c.kind === 'anime' && c.form === 'any'));
      p.textContent = n == null ? 'نحسب كم عنوان يناسبك…' : n < 0 ? '' : n === 0 ? (lib ? 'ما فيه شي في مكتبتك يناسب' : 'ما فيه شي يناسب، خفّف شرط')
        : (lib ? n + ' عنوان في مكتبتك' : 'يناسبك ' + (about ? 'حوالي ' : '') + n.toLocaleString('en-US') + ' عنوان');
      p.classList.toggle('none', n === 0);
      if (go) go.classList.toggle('dim', n === 0);
    }
    var screen = { name: 'roll', el: el, tab: 0.8, defaultFocus: function () { return el.querySelector('.roll-go-btn'); },
      /* back from a pick: its poster is in "your last picks" now */
      shown: function () { if (screen.drawn) draw(); screen.drawn = true; },
      destroy: function () { clearTimeout(count.timer); } };
    draw();
    CS.nav.push(screen);
    setBg(BG_DEFAULT, true);
  }

  /* =============== a random pick: the reel and what it lands on ===============
     The reel turns while the hub is asked and the titles are checked for a source ready to play; when one is found it slows
     down onto it, the poster stops exactly where the result's poster stands, and the words come in beside it. Only moving and
     fading, which the TV draws without redrawing anything. OK during the landing ends it at once. */
  var REEL = { loop: 8, lead: 5, tail: 10, speed: 3300, land: 1100 };
  var rollPosters = [];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rollResult(c) {
    var el = section('roll-result');
    var stage = h('div.roll-stage');
    el.appendChild(stage);
    addBack(el);
    var alive = true, run = 0, spin = null, landAnim = null, lately = [];
    var screen = {
      name: 'roll-result', el: el,
      destroy: function () { alive = false; stopSpin(); },
      defaultFocus: function () { return stage.querySelector('.roll-card') || stage.querySelector('.f'); },
      keys: function (e) {
        if (landAnim && (e.keyCode === CS.KEY.OK)) { landAnim.finish(); return true; }
        return false;
      }
    };
    el.addEventListener('click', function () { if (landAnim) landAnim.finish(); }, true);
    CS.nav.push(screen);
    setBg(BG_DEFAULT, true);

    function stopSpin() { if (spin) { spin.cancel(); spin = null; } }

    /* one go: the stage drawn afresh, the reel turning, then the hunt for a title */
    function start() {
      var mine = ++run;
      stopSpin();
      landAnim = null;
      stage.innerHTML = '';
      stage.classList.remove('landed');
      var slot = h('div.roll-slot');
      var info = h('div.roll-info');
      var status = h('p.roll-status', { text: 'نختار لك…' });
      var reel = h('div.roll-reel');
      stage.appendChild(slot);
      stage.appendChild(info);
      stage.appendChild(reel);
      stage.appendChild(status);
      var cells = [];
      var n = REEL.loop * 2 + REEL.tail + 1;
      for (var i = 0; i < n; i++) { var cell = h('div.roll-cell'); cells.push(cell); reel.appendChild(cell); }
      var step = 0;
      /* the reel lies along the slot's line, its last cell on the slot itself */
      requestAnimationFrame(function () {
        if (mine !== run) return;
        reel.style.top = slot.offsetTop + 'px';
        reel.style.right = (stage.clientWidth - slot.offsetLeft - slot.offsetWidth) + 'px';
        step = cells[1].offsetLeft - cells[0].offsetLeft;
        if (reduceMotion || !reel.animate || !step) { reel.style.visibility = 'hidden'; return; }
        var from = (n - 1 - REEL.lead) * step;
        spin = reel.animate([{ transform: 'translate3d(' + from + 'px,0,0)' }, { transform: 'translate3d(' + (from - REEL.loop * step) + 'px,0,0)' }],
          { duration: REEL.loop * step / REEL.speed * 1000, iterations: Infinity, easing: 'linear' });
      });
      /* a poster goes onto the reel only once it is decoded, away from the page: put in while still being decoded, it held up
         a frame of the turning reel on the TV (94 ms) */
      function paint(cell, m) {
        if (!m || !m.poster || cell._id === m.id) return;
        cell._id = m.id;
        var img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.src = m.poster;
        var put = function () { if (cell._id !== m.id || mine !== run) return; cell.innerHTML = ''; cell.appendChild(img); };
        if (img.decode) img.decode().then(put, function () { /* a poster that does not load leaves its cell plain */ });
        else img.onload = put;
      }
      function fill(metas) {
        metas = metas.filter(function (m) { return m && m.poster; });
        if (!metas.length) return;
        rollPosters = metas.concat(rollPosters.filter(function (x) { return metas.indexOf(x) < 0; })).slice(0, 16);
        var some = CS.shuffled(metas);
        for (var k = 0; k < REEL.loop; k++) { paint(cells[k], some[k % some.length]); paint(cells[k + REEL.loop], some[k % some.length]); }
        for (var t = 0; t < REEL.tail; t++) paint(cells[REEL.loop * 2 + t], some[(t + 3) % some.length]);
      }
      function say(text) { if (mine === run) status.textContent = text; }
      function failed(kind) {
        if (mine !== run || !alive) return;
        stopSpin();
        reel.remove();
        status.remove();
        var words = {
          none: { icon: 'search', title: 'ما لقينا شي بهالاختيارات', text: 'خفّف الشروط شوي: تقييم أقل، أو فترة أوسع، أو تصنيفات أكثر.' },
          seen: { icon: 'check', title: 'شفت كل اللي لقيناه هنا', text: 'جرّب اختيارات ثانية، أو خلّ «اللي شفته» على «عادي يطلع».' },
          nosource: { icon: 'search', title: 'لقينا عناوين بس ما لها مصدر جاهز الحين', text: 'جرّب مرة ثانية بعد شوي، أو غيّر الاختيارات.' },
          nohub: { icon: 'search', title: 'الاختيار العشوائي مو متاح', text: 'يحتاج crimson-hub، وهالنسخة ما فيها عنوانه.' },
          emptylib: { icon: 'heart', title: 'ما فيه شي في مكتبتك يناسب', text: 'ضيف أعمال لمكتبتك من صفحاتها، أو خلّ «من وين» على «من كل شي».' }
        }[kind];
        var box = words ? CS.emptyState(words) : CS.errorState({ title: 'ما قدرنا نختار الحين', reason: 'ما ردّ crimson-hub. تأكد من الإنترنت وجرّب مرة ثانية.', retry: start });
        stage.appendChild(box);
        if (words) box.appendChild(h('div.state-btns.group', null, [
          h('button.btn.primary.f', { onclick: start }, CS.iconKids('dice', 'جرّب مرة ثانية')),
          h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'عدّل الاختيارات')
        ]));
        CS.nav.focus(box.querySelector('.f'), 'instant');
      }
      var fromLibrary = c.source === 'library';
      if (!CS.config.hubUrl && !fromLibrary) { failed('nohub'); return; }
      /* while the first answer is on its way the reel turns with posters already known: the last answers and the last picks */
      fill(rollPosters.length ? rollPosters : (CS.settings.rollRecent || []));

      /* a title is worth landing on when it has a source ready to play: its page, the episode it starts at, the source */
      function ready(m) {
        return CS.addons.meta(m.type, m.id).then(function (meta) {
          if (!meta) return null;
          /* the rating asked is TMDB's; the title's page shows IMDb's. One under it on IMDb is passed over, so the two never disagree */
          if (!fromLibrary && c.min && meta.imdbRating && +meta.imdbRating < c.min) return null;
          var rp = CS.lib.resumePoint(meta.id), video = CS.roll.startVideo(meta, rp);
          if (!video) return null;
          return Promise.all([Promise.race([CS.addons.streams(meta.type, video.id), CS.sleep(10000).then(function () { return null; })]), CS.session.audioWanted(meta)]).then(function (got) {
            var raw = got[0];
            if (!raw || !raw.length || mine !== run || !alive) return null;
            var list = CS.streams.order(raw, false, got[1].list); /* a dubbed-only copy after the others */
            var pick = CS.streams.pickLike(list, CS.settings.lastPick[meta.id]) || list.filter(function (o) { return o.cached !== false && CS.streams.playUrl(o); })[0];
            if (!pick || !CS.streams.playUrl(pick)) return null;
            return { m: m, meta: meta, video: video, list: list, pick: pick, resume: rp && rp.videoId === video.id && rp.offset > 5 ? rp.offset : 0 };
          });
        }).catch(function () { return null; });
      }
      /* three at a time; the first one ready wins */
      function firstReady(list) {
        return new Promise(function (done) {
          var i = 0, running = 0, over = false;
          (function next() {
            if (over) return;
            if (i >= list.length && !running) { over = true; done(null); return; }
            while (running < 3 && i < list.length) {
              running++;
              ready(list[i++]).then(function (got) {
                running--;
                if (over) return;
                if (got || mine !== run || !alive) { over = true; done(got); return; }
                next();
              });
            }
          })();
        });
      }
      var tested = 0;
      var neverAgain = CS.settings.rollNever || [];
      /* from the library: what was saved there, in a new order; ones passed by in this sitting come round again once the rest are used up */
      function huntLibrary() {
        var all = CS.roll.libraryPicks(CS.lib.libraryList(), c);
        var pool = CS.roll.fresh(all, null, neverAgain.concat(lately));
        if (!pool.length && lately.length) { lately = []; pool = CS.roll.fresh(all, null, neverAgain); }
        if (!pool.length) { failed('emptylib'); return; }
        pool = CS.shuffled(pool).slice(0, 12);
        fill(pool);
        pool.forEach(function (m) { lately.push(m.id); });
        say('نتأكد إن له مصدر جاهز…');
        firstReady(pool).then(function (got) {
          if (mine !== run || !alive) return;
          if (got) { got.total = all.length; got.library = true; land(got); } else failed('nosource');
        });
      }
      function hunt(round) {
        if (mine !== run || !alive) return;
        if (fromLibrary) { huntLibrary(); return; }
        if (round >= 4) { failed(tested ? 'nosource' : 'seen'); return; }
        CS.fetchJson(CS.config.hubUrl + CS.roll.query(c), { cache: 'no-store', timeout: 20000 }).then(function (r) {
          if (mine !== run || !alive) return;
          var metas = r && r.metas || [];
          if (!metas.length && !(r && r.total)) { failed('none'); return; }
          fill(metas);
          var worth = CS.roll.fresh(metas, c.skipSeen ? CS.roll.seen : null, lately.concat(neverAgain, (CS.settings.rollRecent || []).map(function (x) { return x.id; })));
          worth.forEach(function (m) { lately.push(m.id); });
          tested += worth.length;
          if (worth.length) say('نتأكد إن له مصدر جاهز…');
          return firstReady(worth).then(function (got) {
            if (mine !== run || !alive) return;
            if (got) { got.total = r.total; land(got); } else hunt(round + 1);
          });
        }).catch(function (e) { CS.log('random pick failed', String(e && e.message || e)); failed('net'); });
      }
      hunt(0);

      function land(got) {
        CS.settings.rollRecent = CS.roll.remember(CS.settings.rollRecent, got.m);
        CS.saveSettings();
        status.textContent = '';
        var last = cells[n - 1];
        paint(last, got.m);
        var done = function () {
          if (mine !== run || !alive) return;
          landAnim = null;
          show(got);
        };
        if (!spin || !step) { stopSpin(); done(); return; }
        var mx = /matrix\(([^)]+)\)/.exec(getComputedStyle(reel).transform || '');
        var now = mx ? +mx[1].split(',')[4] : (n - 1 - REEL.lead) * step;
        stopSpin();
        reel.style.transform = 'translate3d(' + now + 'px,0,0)';
        landAnim = reel.animate([{ transform: 'translate3d(' + now + 'px,0,0)' }, { transform: 'translate3d(0px,0,0)' }],
          { duration: REEL.land, easing: CS.roll.landing(now, REEL.land, REEL.speed), fill: 'forwards' });
        landAnim.onfinish = done;
      }

      /* the result: its poster where the reel stopped (it opens the title's page), the words beside it, and what to do next */
      function show(got) {
        var m = got.m, meta = got.meta;
        var shown = Object.assign({}, m, {
          name: meta.name || m.name, logo: meta.logo || m.logo, runtime: meta.runtime, genres: (meta.genres && meta.genres.length ? meta.genres : m.genres),
          imdbRating: meta.imdbRating || m.imdbRating, background: m.background || meta.background, description: m.description || meta.description
        });
        arabicNow(shown);
        /* Arabic words from TMDB, when the Wikipedia ones are not already known */
        if (!shown.arabic && m.arDescription) { shown.description = m.arDescription; shown.arabic = true; }
        setBg(shown.background, true);
        var poster = card(shown);
        poster.classList.add('roll-card');
        slot.appendChild(poster);
        /* English words keep their own direction (a question mark at the end, not the start) */
        var desc = h('p.roll-desc', { dir: 'auto', text: shown.description || '' });
        var title = h('h2.roll-title', { dir: 'auto', text: shown.arName || shown.name });
        var playLabel = meta.type === 'series' && got.video.season != null ? 'شغّل ' + CS.epLabel(got.video.season, got.video.episode) : 'شغّل';
        var play = function () { CS.player.play(meta, got.video, got.pick, { list: got.list, resume: got.resume }); };
        var never = function () {
          CS.settings.rollNever = CS.roll.never(CS.settings.rollNever, m.id);
          CS.settings.rollRecent = (CS.settings.rollRecent || []).filter(function (x) { return x.id !== m.id; });
          CS.saveSettings();
          CS.toast('ما راح يطلع لك مرة ثانية');
          start();
        };
        info.appendChild(h('p.roll-from', { text: !got.total ? '' : got.library ? 'من بين ' + got.total + ' عنوان في مكتبتك' : 'من بين ' + got.total.toLocaleString('en-US') + ' عنوان يناسب اختياراتك' }));
        info.appendChild(title);
        info.appendChild(h('div.roll-line', { text: metaLine(shown) }));
        info.appendChild(desc);
        info.appendChild(h('div.roll-btns.group', null, [
          h('button.btn.primary.f', { onclick: play }, CS.iconKids('play', playLabel)),
          h('button.btn.f', { onclick: start }, CS.iconKids('dice', 'غيره')),
          h('button.btn.f', { onclick: never, 'aria-label': 'لا تطلعه مرة ثانية' }, CS.iconKids('close', window.CS_ANDROID ? 'ما أبيه' : 'لا تطلعه مرة ثانية')),
          h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'عدّل الاختيارات')
        ]));
        if (!shown.arabic) CS.session.arabicInfo(shown).then(function () {
          if (mine !== run || !alive || !arabicNow(shown)) return;
          desc.textContent = shown.description;
          if (shown.arName) title.textContent = shown.arName;
        });
        reel.classList.add('gone');
        setTimeout(function () { reel.remove(); }, 260);
        void info.offsetWidth; /* the words are drawn hidden first, so they come in rather than just appear */
        stage.classList.add('landed');
        CS.nav.focus(poster, 'instant');
        if (c.then === 'play') {
          CS.toast('نشغّل «' + (shown.arName || shown.name) + '»…');
          setTimeout(function () { if (mine === run && alive && CS.nav.top() === screen) play(); }, 900);
        }
      }
    }
    start();
  }

  /* =============== search =============== */
  function search() {
    var el = section('search');
    var input = h('input.search-input.f', { type: 'text', placeholder: 'اكتب اسم فيلم أو مسلسل…', autocomplete: 'off' });
    var track = h('div.vtrack');
    /* posters in lines, as a genre's: the remote's poster stays a little under the top, never cut by it */
    var results = h('div.rows.vscroll', { 'data-anchor': '30' }, track);
    el.appendChild(topbar('search'));
    el.appendChild(h('div.search-bar', null, [input]));
    el.appendChild(results);
    var timer = 0, last = null, wantResults = false;
    /* the random pick's choices and «الأكثر مشاهدة» (findbar.js): with any chosen, the hub answers, with or without a name */
    var findBar = CS.config.hubUrl && CS.find ? CS.find.bar(function () { last = null; run(); }) : null;

    /* The answers are one page of posters, line under line, down to the end: no rows in search (the owner's wish, 2026-11-13).
       As with a genre's posters, only the lines near the viewer are on the page, and the next page comes on the way down */
    function gridFor(title) {
      var head = h('h2.row-title', { text: title });
      var g = h('div.grid.genre-grid.search-grid', null, CS.skel.cards(7));
      track.appendChild(head);
      track.appendChild(g);
      g._head = head;
      return g;
    }
    function gridGone(g, empty) {
      g._head.remove();
      g.remove();
      if (empty) track.appendChild(CS.emptyState(empty));
    }
    function gridFill(g, metas, make) {
      g.innerHTML = '';
      g._metas = metas.slice();
      g._make = make;
      drawRange(g, 0, Math.min(metas.length, 42));
      gridWindow(g, 0, true);
      followGrid(g, results);
      /* typing is over (Enter pressed): the first result takes the focus */
      if (wantResults && document.activeElement !== input) { wantResults = false; var f = g.querySelector('.card.f'); if (f) CS.nav.focus(f); }
    }
    function gridAdd(g, fresh) {
      if (!g.isConnected || !g._metas || !fresh.length) return;
      Array.prototype.push.apply(g._metas, fresh);
      gridWindow(g, Math.max(0, g._line || 0) * (g._perLine || 1), true);
    }
    /* several lists in one: their first titles, then their second ones…, each title once */
    function inTurns(parts, seen) {
      var out = [], most = 0;
      parts.forEach(function (p) { most = Math.max(most, p.length); });
      for (var i = 0; i < most; i++) parts.forEach(function (p) { var m = p[i]; if (m && m.id && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
      return out;
    }

    function findGrid(fc, q, mark) {
      var g = gridFor(CS.find.title(fc, q));
      var ask = function (skip) { return CS.find.page(fc, q, skip); };
      ask(0).then(function (metas) {
        if (last !== mark || !g.isConnected) return;
        if (!metas.length) { gridGone(g, { icon: 'search', title: 'ما لقينا شي يناسب', text: q ? 'خفّف فلتر، أو اكتب الاسم بالإنجليزي.' : 'خفّف فلتر وجرّب مرة ثانية.' }); return; }
        if (q) remember(q);
        /* most watched: the first ten carry their place */
        gridFill(g, metas, function (m, i) { return card(m, fc.sort === 'watched' && i < 10 ? { rank: i + 1 } : null); });
        g._more = CS.pager(ask, metas, metas.pageSize || metas.length, function (fresh) { gridAdd(g, fresh); });
      }, function () { if (last === mark && g.isConnected) gridGone(g, { icon: 'search', title: 'ما قدرنا نجيب النتائج', text: 'تأكد من الإنترنت وجرّب مرة ثانية.' }); });
    }

    /* a name, asked of every add-on that searches: their answers in turns (a film, a series, an anime…). They are waited for together,
       but a slow add-on holds the others up for 2.5 s at most: what it brings later goes at the end */
    function nameGrid(q) {
      var cats = CS.addons.searchCatalogs();
      if (!cats.length) { track.appendChild(CS.emptyState({ icon: 'plus', title: 'ما فيه إضافة بحث', text: 'إضافات حسابك ما فيها بحث. Cinemeta مثلاً تبحث في الأفلام والمسلسلات.' })); return; }
      var g = gridFor('نتائج «' + q + '»');
      var parts = cats.map(function () { return []; }), left = cats.length, seen = {}, drawn = false, soon = 0;
      function draw() {
        clearTimeout(soon);
        soon = 0;
        if (drawn || last !== q || !g.isConnected) return;
        var metas = inTurns(parts, seen);
        if (!metas.length) {
          if (!left) gridGone(g, { icon: 'search', title: 'ما لقينا شيء باسم «' + q + '»', text: 'جرّب الاسم بالإنجليزي أو جزء منه، مثل «breaking» بدل «بريكنق باد».' });
          return;
        }
        drawn = true;
        remember(q);
        gridFill(g, metas, function (m) { return card(m); });
      }
      cats.forEach(function (c, k) {
        CS.addons.catalog(c.addon, c.cat, { search: q }).then(function (metas) { return metas.slice(0, 50); }, function () { return []; }).then(function (metas) {
          if (last !== q) return;
          left--;
          if (drawn) { gridAdd(g, inTurns([metas], seen)); return; }
          parts[k] = metas;
          if (!left) draw();
          else if (!soon && metas.length) soon = setTimeout(draw, 2500);
        });
      });
    }

    /* before anything is typed, under what was searched lately: what is popular now, films and series in turns, going on as far as
       the lists go. A list's first page is the one the home page keeps */
    function popularGrid() {
      var lists = CS.addons.homeCatalogs().filter(function (c) { return catName(c.cat) === 'الأشهر' && kindOf(c) !== 'other' && kindOf(c) !== 'anime'; });
      if (!lists.length) return;
      var g = gridFor('الأشهر الحين');
      Promise.all(lists.map(function (c) {
        var key = 'cat:' + c.key, kept = CS.cache.get(key, 3 * 3600e3);
        if (kept) return kept;
        return CS.addons.catalog(c.addon, c.cat).then(function (m) { CS.cache.set(key, m); return m; }, function () { return CS.cache.get(key) || []; });
      })).then(function (firsts) {
        if (!g.isConnected) return;
        var seen = {}, metas = inTurns(firsts, seen);
        if (!metas.length) { gridGone(g, null); return; }
        gridFill(g, metas, function (m) { return card(m); });
        /* further down: the next page of each list, in turns again (seen is shared, so no title comes twice) */
        var got = [], busy = false;
        var pagers = lists.map(function (c, k) {
          return canPage(c) ? CS.pager(function (skip) { return CS.addons.catalog(c.addon, c.cat, { skip: skip }); }, firsts[k], firsts[k].pageSize || firsts[k].length, function (fresh) { got[k] = fresh; }, 0, seen) : null;
        });
        g._more = function () {
          if (busy) return Promise.resolve(false);
          busy = true;
          got = [];
          return Promise.all(pagers.map(function (p) { return p ? p() : false; })).then(function () {
            busy = false;
            var fresh = inTurns(got.map(function (x) { return x || []; }), {});
            gridAdd(g, fresh);
            return fresh.length > 0;
          });
        };
      });
    }
    function remember(q) {
      var kept = (CS.settings.recentSearches || []).filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
      kept.unshift(q);
      CS.settings.recentSearches = kept.slice(0, 8);
      CS.saveSettings();
    }
    /* before anything is typed: what was searched lately, and what is popular now */
    function startingPoints() {
      var recent = CS.settings.recentSearches || [];
      if (recent.length) {
        track.appendChild(h('div.row.group.genre-row', { 'data-key': 'recent' }, [
          h('h2.row-title', { text: 'بحثت عنها قبل' }),
          h('div.hscroll', null, h('div.htrack', null, recent.map(function (q) {
            return h('button.chip.f', { dir: 'auto', onclick: function () { input.value = q; clearTimeout(timer); wantResults = true; run(); } }, q);
          })))
        ]));
      }
      popularGrid();
    }
    function run() {
      var q = input.value.trim();
      var fc = findBar && CS.find.choices(), finding = !!fc && CS.find.active(fc);
      var mark = finding ? CS.find.query(fc, q, 1) : q;
      if (mark === last) return;
      last = mark;
      track.innerHTML = '';
      if (findBar) track.appendChild(findBar);
      if (finding && (q.length >= 2 || !q)) { findGrid(fc, q, mark); return; }
      if (q.length < 2) { startingPoints(); return; }
      nameGrid(q);
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 700); });
    input.addEventListener('keydown', function (e) {
      if (e.keyCode !== 13) return;
      clearTimeout(timer);
      wantResults = true;
      run();
      input.blur();
      var f = track.querySelector('.card.f');
      if (f) { wantResults = false; CS.nav.focus(f); }
    });
    var screen = {
      name: 'search', el: el, tab: 1, defaultFocus: function () { return input; },
      /* the remote down the posters: the lines near it are drawn, and the next page is asked before the end */
      focusChanged: function (c) {
        var g = c.closest && c.closest('.search-grid');
        if (g && c.classList.contains('card')) { wantMore(g, c, 14); gridSoon(g, c); }
      }
    };
    /* the mouse's wheel */
    followWheel(screen, function () { return track.querySelector('.search-grid'); });
    CS.nav.push(screen);
    run();
    if (window.CS_ANDROID) setTimeout(function () { if (input.isConnected) { input.focus(); CS.host({ t: 'show-keyboard' }); } }, 200);
    setBg(BG_DEFAULT, true);
  }

  /* =============== library =============== */
  function library() {
    var el = section('library');
    var grid = h('div.grid');
    el.appendChild(topbar('library'));
    el.appendChild(h('div.vscroll.grid-scroll', { 'data-pad': '80' }, h('div.vtrack', null, grid)));
    var items = CS.lib.libraryList();
    if (!items.length) grid.appendChild(CS.emptyState({
      icon: 'heart', title: 'مكتبتك فاضية', text: 'أي فيلم أو مسلسل تضيفه بزر «أضف لمكتبتي» من صفحته يطلع هنا' + (CS.profiles.isMain() ? '، ويتزامن مع أجهزتك.' : '. ملفك محفوظ في هذا الجهاز بس.'),
      action: { label: 'دوّر على عنوان', run: function () { CS.views.search(); } }
    }));
    items.forEach(function (it) {
      grid.appendChild(card({ id: it._id, type: it.type, name: it.name, poster: it.poster }));
    });
    CS.nav.push({ name: 'library', el: el, tab: 2, defaultFocus: function () { return grid.querySelector('.f') || el.querySelector('.tab.on'); } });
    setBg(BG_DEFAULT, true);
  }

  /* =============== downloads (the phone) =============== */
  function downloads() {
    var el = section('downloads');
    var space = h('p.dl-space');
    var list = h('div.dl-list');
    el.appendChild(topbar('downloads'));
    el.appendChild(h('div.vscroll.grid-scroll', { 'data-pad': '80' }, h('div.vtrack', null, [space, list])));
    var rows = {}, shape = null;

    function askRemove(d) {
      var running = d.state !== 'done' && d.state !== 'failed';
      var box = h('section.screen.confirm', null, h('div.confirm-box', null, [
        h('p', { text: (running ? 'توقّف تحميل «' : 'حذف «') + CS.downloads.nameOf(d) + (running ? '»؟' : '» من جوالك؟') }),
        h('p.confirm-note', { text: running ? 'ينحذف اللي نزل منه.' : 'ترجع مساحته لجوالك، وتقدر تحمّله مرة ثانية.' }),
        h('div.confirm-btns.group', null, [
          h('button.btn.primary.f', { onclick: function () { CS.downloads.remove(d); CS.nav.pop(); } }, running ? 'وقّف واحذف' : 'احذف'),
          h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'إلغاء')
        ])
      ]));
      CS.nav.push({ name: 'confirm', modal: true, el: box, defaultFocus: function () { return box.querySelectorAll('.f')[1]; } });
    }

    /* a download that failed: the links of its title are asked for again (the old one has often expired) */
    function chooseAgain(d) {
      var i = d.info;
      CS.addons.meta(i.type, i.metaId).then(function (m) {
        if (CS.nav.top() && CS.nav.top().el === el) streams(m, i.video, { download: true });
      }, function () { CS.toast('ما قدرنا نفتح المصادر — تأكد من الإنترنت', 5000, 'error'); });
    }

    function rowFor(d) {
      var status = h('div.dl-status');
      var fill = h('div');
      var v = d.info.video;
      var line = d.info.type === 'series' && v.season != null ? CS.epLabel(v.season, v.episode) + (v.title ? ' · ' + v.title : '') : '';
      var row = h('div.dl-row.group.' + d.state, null, [
        h('button.dl-main.f', { onclick: function () {
          var now = CS.downloads.byId(d.id);
          if (!now) return;
          if (now.state === 'done') CS.player.playDownload(now);
          else if (now.state === 'failed') chooseAgain(now);
        } }, [
          d.state === 'done' ? h('span.dl-go', { html: CS.icon('play') }) : null,
          h('div.dl-text', null, [
            line ? h('div.dl-ep', { text: line }) : null,
            status,
            d.state === 'done' || d.state === 'failed' ? null : h('div.dl-bar', null, fill)
          ])
        ]),
        h('button.dl-del.f', { 'aria-label': d.state === 'done' ? 'حذف' : 'وقّف واحذف', html: CS.icon('close'), onclick: function () { askRemove(CS.downloads.byId(d.id) || d); } })
      ]);
      row._paint = function (now) {
        status.textContent = CS.downloads.statusText(now);
        fill.style.transform = 'scaleX(' + CS.downloads.share(now) + ')';
      };
      return row;
    }

    /* a title once, with its downloads under it */
    function groupFor(list) {
      var d = list[0], pic = d.poster || d.info.poster, n = list.length;
      var count = d.info.type !== 'series' ? '' : n === 1 ? 'حلقة واحدة' : n === 2 ? 'حلقتان' : n <= 10 ? n + ' حلقات' : n + ' حلقة';
      return h('div.dl-group', null, [
        h('div.dl-head', null, [
          h('div.dl-poster', null, pic ? h('img', { src: pic, alt: '', onerror: function () { this.remove(); } }) : null),
          h('div.dl-title', null, [h('div.dl-name', { text: d.info.name }), count ? h('div.dl-count', { text: count }) : null])
        ])
      ].concat(list.map(function (x) { rows[x.id] = rowFor(x); return rows[x.id]; })));
    }

    function draw() {
      var all = CS.downloads.list();
      var now = all.map(function (d) { return d.id + ':' + d.state + ':' + (d.poster ? 1 : 0); }).join();
      if (now !== shape) {
        shape = now;
        rows = {};
        list.innerHTML = '';
        if (!all.length) list.appendChild(CS.emptyState({
          icon: 'down', title: 'ما عندك تحميلات',
          text: 'افتح فيلم أو مسلسل واضغط «تحميل» جنب «أضف لمكتبتي»، ويطلع هنا تشوفه حتى بدون إنترنت.',
          action: { label: 'دوّر على عنوان', run: function () { CS.views.search(); } }
        }));
        var groups = [];
        all.forEach(function (d) {
          var last = groups[groups.length - 1];
          if (last && last[0].info.metaId === d.info.metaId) last.push(d); else groups.push([d]);
        });
        groups.forEach(function (g) { list.appendChild(groupFor(g)); });
        if (CS.nav.top() && CS.nav.top().el === el) CS.nav.refocus();
      }
      all.forEach(function (d) { rows[d.id]._paint(d); });
      var free = CS.downloads.free(), used = CS.downloads.used();
      space.textContent = [used ? 'التحميلات ' + CS.downloads.size(used) : '', free ? 'المتاح في جوالك ' + CS.downloads.size(free) : ''].filter(Boolean).join(' · ');
    }

    var stop = CS.downloads.onChange(draw);
    draw();
    CS.nav.push({
      name: 'downloads', el: el, tab: 3, shown: draw, destroy: stop,
      defaultFocus: function () { return list.querySelector('.f') || el.querySelector('.tab.on'); }
    });
    setBg(BG_DEFAULT, true);
  }

  /* =============== profiles: who is watching =============== */
  /* the profile's colour and first letter, or the character picture picked for it (the letter shows if it fails) */
  function avatar(p) {
    var a = h('span.pf-avatar', { style: { background: CS.profiles.color(p) }, text: Array.from(CS.profiles.name(p))[0] || '؟' });
    setFace(a, CS.profiles.image(p));
    return a;
  }
  function setFace(a, url) {
    var old = a.querySelector('img');
    if (old) old.remove();
    a.classList.toggle('pf-img', !!url);
    if (!url) return;
    var im = h('img', { src: url, alt: '', decoding: 'async' });
    im.onerror = function () { im.remove(); a.classList.remove('pf-img'); };
    a.appendChild(im);
  }

  /* ---------- character pictures for a profile ----------
     Anime characters from AniList, series characters (the actor in the role) from TVmaze. Both are free, need no key and
     answer the TV directly. Answers are kept for the session; the popular ones for a week. */
  var faceMemo = {};
  var FAMOUS_SHOWS = ['Breaking Bad', 'Game of Thrones', 'Stranger Things', 'Peaky Blinders', 'La Casa de Papel', 'The Boys'];
  function memo(key, days, make) {
    if (faceMemo[key]) return faceMemo[key];
    var kept = days ? CS.cache.get('face:' + key, days * 864e5) : null;
    if (kept) return (faceMemo[key] = Promise.resolve(kept));
    faceMemo[key] = make().then(function (v) {
      if (days && v && v.length) CS.cache.set('face:' + key, v);
      return v;
    }, function (e) { delete faceMemo[key]; CS.log('character pictures not read', key, e.message); return []; });
    return faceMemo[key];
  }
  function anilist(search) {
    var q = search ? 'query($s:String){Page(perPage:40){characters(search:$s,sort:FAVOURITES_DESC){name{full} image{large}}}}'
      : '{Page(perPage:40){characters(sort:FAVOURITES_DESC){name{full} image{large}}}}';
    return memo('al:' + (search || ''), search ? 0 : 7, function () {
      return CS.fetchJson('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: q, variables: search ? { s: search } : {} }), timeout: 12000 })
        .then(function (r) {
          return ((r && r.data && r.data.Page && r.data.Page.characters) || []).map(function (c) {
            return { name: c.name && c.name.full || '', img: c.image && c.image.large || '' };
          }).filter(function (c) { return CS.profiles.goodImage(c.img) && !/\/default\.(jpg|png)$/.test(c.img); });
        });
    });
  }
  function tvCast(cast) {
    var seen = {};
    return (cast || []).map(function (c) {
      var img = c.character && c.character.image && c.character.image.medium || c.person && c.person.image && c.person.image.medium || '';
      return { name: c.character && c.character.name || '', img: img };
    }).filter(function (c) { if (!CS.profiles.goodImage(c.img) || seen[c.img]) return false; seen[c.img] = 1; return true; }).slice(0, 24);
  }
  /* {name, faces} of a series found by its name, or by its IMDb id (the titles watched) */
  function tvShow(how, key) {
    return memo('tv:' + how + ':' + key, how === 'q' ? 7 : 30, function () {
      var u = how === 'q' ? 'https://api.tvmaze.com/singlesearch/shows?embed=cast&q=' + encodeURIComponent(key)
        : 'https://api.tvmaze.com/lookup/shows?imdb=' + encodeURIComponent(key);
      return CS.fetchJson(u, { timeout: 12000 }).then(function (s) {
        if (!s || !s.id) return [];
        var cast = s._embedded && s._embedded.cast;
        var got = cast ? Promise.resolve(cast) : CS.fetchJson('https://api.tvmaze.com/shows/' + s.id + '/cast', { timeout: 12000 });
        return got.then(function (c) { var f = tvCast(c); return f.length ? [{ name: s.name, faces: f }] : []; });
      });
    }).then(function (v) { return v[0] || null; });
  }
  function tvSearch(q) {
    return memo('tvs:' + q, 0, function () {
      /* TVmaze matches loosely ("gojo" finds "Sky Rojo"): only series whose name holds what was typed */
      var want = q.toLowerCase();
      return CS.fetchJson('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q), { timeout: 12000 }).then(function (list) {
        return (list || []).filter(function (x) { return x.show && String(x.show.name || '').toLowerCase().indexOf(want) >= 0; })
          .slice(0, 3).map(function (x) { return x.show.id; });
      });
    }).then(function (ids) {
      return Promise.all(ids.map(function (id) {
        return memo('tvid:' + id, 30, function () {
          return CS.fetchJson('https://api.tvmaze.com/shows/' + id + '?embed=cast', { timeout: 12000 }).then(function (s) {
            var f = tvCast(s && s._embedded && s._embedded.cast);
            return f.length ? [{ name: s.name, faces: f }] : [];
          });
        }).then(function (v) { return v[0] || null; });
      }));
    });
  }

  /* p: the profile being edited (null: a new one); now: {color, img, name}; done({color, img}) */
  function facePicker(now, done) {
    var el = h('section.screen.face-picker');
    var input = h('input.search-input.f', { type: 'text', placeholder: 'ابحث عن شخصية أو مسلسل… مثل Levi أو Breaking Bad', autocomplete: 'off' });
    var track = h('div.vtrack');
    var rows = h('div.rows.vscroll.face-rows', { 'data-pad': '60' }, track);
    el.appendChild(h('div.face-head', null, [h('h1.pf-title', { text: 'اختر صورة' + (now.name ? ' لـ «' + now.name + '»' : '') }), h('div.search-bar', null, [input])]));
    el.appendChild(rows);
    var alive = true, timer = 0, last = null;

    function pick(o) { done(o); CS.nav.pop(); }
    function tile(f) {
      var on = now.img === f.img;
      var a = h('span.pf-avatar');
      setFace(a, f.img);
      var b = h('button.pf-tile.face-tile.f' + (on ? '.on' : ''), { onclick: function () { pick({ color: now.color, img: f.img }); } }, [
        h('span.pf-pic', null, a), h('span.pf-name', { dir: 'auto', text: f.name })
      ]);
      return b;
    }
    function row(title, kids, key) {
      return h('div.row.group.face-row', { 'data-key': key }, [
        h('h2.row-title', { dir: 'auto', text: title }),
        h('div.hscroll', { 'data-pad': '60' }, h('div.htrack', null, kids))
      ]);
    }
    function colours() {
      var letter = Array.from(now.name || '')[0] || '؟';
      return row('بدون صورة: لون وحرف', CS.profiles.COLORS.map(function (c, i) {
        return h('button.pf-tile.face-tile.f' + (!now.img && now.color === i ? '.on' : ''), { 'aria-label': 'لون ' + (i + 1), onclick: function () { pick({ color: i, img: '' }); } },
          h('span.pf-pic', null, h('span.pf-avatar', { style: { background: c }, text: letter })));
      }), 'colours');
    }
    /* a row that fills in when its answer comes; nothing at all when it brings nothing */
    function later(key, title, p) {
      var r = row(title || '…', [h('div.face-wait', { text: 'نجيب الصور…' })], key);
      track.appendChild(r);
      p.then(function (v) {
        if (!alive || !r.isConnected) return;
        var faces = v && (v.faces || v);
        if (!faces || !faces.length) { r.remove(); return; }
        if (v.name && title === null) r.querySelector('.row-title').textContent = v.name;
        var tr = r.querySelector('.htrack');
        tr.innerHTML = '';
        faces.forEach(function (f) { tr.appendChild(tile(f)); });
        CS.nav.refocus();
      });
    }
    function watched() {
      var seen = {}, out = [];
      CS.lib.continueWatching().concat(CS.lib.libraryList()).forEach(function (it) {
        if (it.type === 'series' && /^tt\d+$/.test(it._id) && !seen[it._id] && out.length < 4) { seen[it._id] = 1; out.push(it._id); }
      });
      return out;
    }
    function startingRows() {
      track.appendChild(colours());
      watched().forEach(function (id) { later('w' + id, null, tvShow('imdb', id)); });
      later('anime', 'أنمي مشهور', anilist(''));
      FAMOUS_SHOWS.forEach(function (n) { later('f' + n, null, tvShow('q', n)); });
    }
    function run() {
      var q = input.value.trim();
      if (q === last) return;
      last = q;
      track.innerHTML = '';
      if (q.length < 2) { startingRows(); return; }
      var anime = anilist(q), shows = tvSearch(q).catch(function () { return []; });
      later('sa', 'أنمي', anime);
      shows.then(function (list) {
        if (!alive || last !== q) return;
        list.forEach(function (s, i) { if (s) later('ss' + i, null, Promise.resolve(s)); });
      });
      /* every answer came back empty: say it, instead of an empty screen */
      Promise.all([anime, shows]).then(function () {
        setTimeout(function () {
          if (alive && last === q && !track.querySelector('.row')) track.appendChild(CS.emptyState({ icon: 'search', title: 'ما لقينا صور باسم «' + q + '»', text: 'جرّب الاسم بالإنجليزي، مثل «Gojo» أو «Dexter».' }));
        }, 50);
      });
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 700); });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { clearTimeout(timer); input.blur(); run(); } });
    run();
    CS.nav.push({ name: 'face-picker', modal: true, el: el, destroy: function () { alive = false; clearTimeout(timer); },
      defaultFocus: function () { return el.querySelector('.face-tile.on') || el.querySelector('.face-tile'); } });
  }
  /* four digits, by the remote (the pad on screen, or its number keys), the keyboard, or touch.
     o: {title, note, check(pin) -> null when done (the pad closes) | {title?, msg?, bad?} to stay and start again, forgot?} */
  function pinPad(o) {
    var digits = '', busy = false;
    var titleEl = h('p', { text: o.title });
    var dots = h('div.pin-dots', { dir: 'ltr' }, [0, 1, 2, 3].map(function () { return h('span.pin-dot'); }));
    var msg = h('p.confirm-note.pin-msg', { text: o.note || ' ' });
    function paint() { Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i < digits.length); }); }
    function press(k) {
      if (busy) return;
      if (k === 'del') { digits = digits.slice(0, -1); paint(); return; }
      if (digits.length >= 4) return;
      digits += k;
      paint();
      if (digits.length < 4) return;
      busy = true;
      setTimeout(function () {
        busy = false;
        var r = o.check(digits);
        if (!r) { CS.nav.pop(); return; }
        if (r.title) titleEl.textContent = r.title;
        msg.textContent = r.msg || o.note || ' ';
        msg.classList.toggle('bad', !!r.bad);
        dots.classList.toggle('bad', !!r.bad);
        digits = '';
        paint();
      }, 150);
    }
    var label = { del: '⌫', cancel: 'إلغاء' };
    var pad = h('div.pin-pad', { dir: 'ltr' }, [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['cancel', '0', 'del']].map(function (row) {
      return h('div.pin-row.group', null, row.map(function (k) {
        return h('button.pin-key.f' + (label[k] ? '.pin-' + k : ''), { onclick: function () { if (k === 'cancel') CS.nav.pop(); else press(k); } }, label[k] || k);
      }));
    }));
    var box = h('div.confirm-box.pin-box', null, [titleEl, dots, msg, pad,
      o.extra ? h('div.confirm-btns.group', null, o.extra) : null,
      o.forgot ? h('div.confirm-btns.group', null, h('button.btn.pin-forgot.f', { onclick: function () { CS.nav.pop(); o.forgot(); } }, 'نسيت الرمز')) : null]);
    var modal = h('section.screen.confirm', null, box);
    CS.nav.push({
      name: 'pin', modal: true, el: modal,
      keys: function (e) {
        var k = e.keyCode;
        if (k >= 48 && k <= 57) { press(String(k - 48)); return true; }
        if (k >= 96 && k <= 105) { press(String(k - 96)); return true; }
        if (k === 8) { press('del'); return true; }
        return false;
      },
      defaultFocus: function () { return pad.querySelector('.pin-key'); }
    });
  }

  /* the main profile is locked: its four digits first, then "then".
     enter: going into the main profile (or editing it): a trusted device goes straight in, and the pad offers to trust
     this one. Turning the lock off or changing the PIN always asks */
  function askPin(then, enter) {
    if (!CS.profiles.hasPin() || (enter && CS.profiles.trusted())) { then(); return; }
    var trustOn = false, trustBtn = null;
    if (enter) {
      trustBtn = h('button.btn.pin-trust.f', { 'aria-pressed': 'false', onclick: function () {
        trustOn = !trustOn;
        trustBtn.classList.toggle('on', trustOn);
        trustBtn.setAttribute('aria-pressed', String(trustOn));
      } }, [h('span.pin-check'), h('span', { text: 'ثق بهذا الجهاز، ولا تسألني عن الرمز مرة ثانية' })]);
    }
    pinPad({
      title: 'رمز الملف الرئيسي',
      note: 'اكتب الرمز عشان تدخل',
      extra: trustBtn,
      check: function (pin) {
        var r = CS.profiles.checkPin(pin);
        if (r === 'ok') {
          if (trustOn) { CS.profiles.trust(); CS.toast('صار هذا الجهاز موثوق: ما يسألك عن الرمز إلا إذا تغيّر'); }
          setTimeout(then, 0);
          return null;
        }
        if (r === 'wait') return { msg: 'جربت كثير. انتظر نص دقيقة وجرب مرة ثانية.', bad: true };
        return { msg: 'الرمز غلط', bad: true };
      },
      forgot: function () { forgotPin(then); }
    });
  }

  /* a forgotten PIN: approving a new sign-in code from the Stremio account proves it is the owner. The PIN goes, and the
     new sign-in takes the old one's place */
  function forgotPin(then) {
    var codeBox = h('div.code', { text: '····' });
    var note = h('p.confirm-note', { text: 'نجهّز الرمز…' });
    var poll = 0, alive = true, linkUrl = 'https://link.stremio.com';
    var box = h('div.confirm-box.pin-box', null, [
      h('p', { text: 'نسيت رمز الملف الرئيسي؟' }),
      h('p.confirm-note', { text: 'افتح link.stremio.com وأنت داخل حساب Stremio، واكتب هالرمز ووافق. بعدها ينشال قفل الملف الرئيسي من كل أجهزتك، وتقدر تحط رمز جديد من الإعدادات.' }),
      codeBox, note,
      h('div.confirm-btns.group', null, [
        window.CS_ANDROID ? h('button.btn.primary.f', { onclick: function () { CS.host({ t: 'open-link', url: linkUrl }); } }, 'افتح صفحة الربط') : null,
        h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'رجوع')
      ])
    ]);
    var modal = h('section.screen.confirm', null, box);
    CS.nav.push({ name: 'pin-forgot', modal: true, el: modal, destroy: function () { alive = false; clearInterval(poll); } });
    CS.api.linkCreate().then(function (r) {
      if (!alive) return;
      codeBox.textContent = r.code;
      if (r.link && /^https:\/\/link\.stremio\.com\//.test(r.link)) linkUrl = r.link;
      note.textContent = 'ننتظر موافقتك…';
      poll = setInterval(function () {
        CS.api.linkRead(r.code).then(function (key) {
          if (!key || !alive) return;
          clearInterval(poll);
          CS.settings.authKey = key;
          CS.saveSettings();
          CS.profiles.clearPin();
          CS.log('main profile PIN removed after a new sign-in');
          CS.toast('انشال القفل');
          CS.nav.pop();
          then();
        });
      }, 3000);
    }).catch(function (e) { note.textContent = 'ما قدرنا نتصل بـ Stremio (' + e.message + ')'; });
  }

  /* atStart: shown before home (more than one profile); otherwise opened from the top bar or settings.
     justSignedIn: the add-on list is read fresh once a profile is picked */
  function profiles(atStart, justSignedIn) {
    var el = section('profiles');
    var editing = false;
    var title = h('h1.pf-title');
    var tiles = h('div.pf-tiles.group');
    var editBtn = h('button.btn.f', { onclick: function () { editing = !editing; draw(); } });
    el.appendChild(h('div.pf-box', null, [
      title, tiles,
      h('p.pf-note', { text: 'الملفات والقفل تطلع في كل جهاز داخل حسابك. مكتبة الملف الرئيسي ومتابعته في حساب Stremio، أما الملفات الثانية فمكتبتها ومتابعتها في كل جهاز بروحه، وما تلمس حسابك، وتروح إذا انحذف التطبيق.' }),
      h('div.pf-btns.group', null, [editBtn])
    ]));
    if (!atStart) addBack(el);

    function draw(focusId) {
      var was = focusId || CS.nav.current() && CS.nav.current()._pid;
      title.textContent = editing ? 'اختر الملف اللي تبي تعدّله' : 'مين يتفرّج؟';
      editBtn.textContent = editing ? 'تم' : 'تعديل الملفات';
      el.classList.toggle('editing', editing);
      tiles.innerHTML = '';
      CS.profiles.list().forEach(function (p) {
        var t = h('button.pf-tile.f' + (p.id === CS.profiles.current() ? '.on' : ''), { onclick: function () { if (editing) edit(p); else pick(p); } }, [
          h('span.pf-pic', null, [avatar(p), h('span.pf-pen', { text: 'تعديل' })]),
          h('span.pf-name', { text: CS.profiles.name(p) }),
          h('span.pf-kind', { text: p.id === 'main' ? 'حساب Stremio' + (CS.profiles.hasPin() ? ' · مقفول' : '') : 'مكتبته في الجهاز' })
        ]);
        t._pid = p.id;
        tiles.appendChild(t);
      });
      if (CS.profiles.list().length < CS.profiles.MAX) {
        var add = h('button.pf-tile.pf-add.f', { onclick: function () { edit(null); } }, [
          h('span.pf-pic', null, h('span.pf-avatar', { html: CS.icon('plus') })),
          h('span.pf-name', { text: 'ملف جديد' }),
          h('span.pf-kind', { text: ' ' })
        ]);
        add._pid = '+';
        tiles.appendChild(add);
      }
      var byId = function (id) { return Array.prototype.filter.call(tiles.children, function (x) { return x._pid === id; })[0]; };
      var f = byId(was) || byId(CS.profiles.current()) || tiles.firstChild;
      if (CS.nav.top() === scr) CS.nav.focus(f, 'no-scroll');
    }

    function pick(p) {
      if (p.id === CS.profiles.current() && !atStart) { CS.nav.pop(); return; }
      var go = function () {
        CS.profiles.use(p.id).then(function () {
          CS.log('profile', p.id === 'main' ? 'main' : 'on this device');
          CS.start(!!justSignedIn);
        });
      };
      if (p.id === 'main') askPin(go, true); else go();
    }

    /* a new profile (p null) or one to rename, recolour or remove; the locked main one from another profile asks its PIN */
    function edit(p) {
      if (p && p.id === 'main' && !CS.profiles.isMain() && CS.profiles.hasPin()) { askPin(function () { editNow(p); }, true); return; }
      editNow(p);
    }
    function editNow(p) {
      var color = p ? p.color || 0 : CS.profiles.freeColor(), img = p ? CS.profiles.image(p) : '';
      var input = h('input.setting-input.pf-input.f', { type: 'text', value: p ? CS.profiles.name(p) : '', placeholder: 'الاسم', maxlength: '20', autocomplete: 'off' });
      var letter = h('span'), pic = h('span.pf-avatar', null, letter);
      setFace(pic, img);
      function paint() {
        pic.style.background = CS.profiles.COLORS[color];
        letter.textContent = Array.from(input.value.trim())[0] || '؟';
      }
      function choose() {
        facePicker({ color: color, img: img, name: input.value.trim() }, function (o) {
          color = o.color; img = o.img;
          setFace(pic, img);
          paint();
          /* the picker closes right after this: then "save" is one press away */
          setTimeout(function () { var s = box.querySelector('.btn.primary'); if (s && s.isConnected) CS.nav.focus(s); }, 0);
        });
      }
      input.addEventListener('input', paint);
      input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { input.blur(); save(); } });
      var box = h('div.confirm-box.pf-edit');
      var modal = h('section.screen.confirm', null, box);
      function save() {
        var name = input.value.trim();
        if (!name) { CS.toast('اكتب اسم للملف'); CS.nav.focus(input); return; }
        var made = null;
        if (p) { CS.profiles.rename(p.id, name); CS.profiles.setColor(p.id, color); CS.profiles.setImage(p.id, img); }
        else if (!(made = CS.profiles.add(name, color, img))) { CS.toast('وصلت للحد: ' + CS.profiles.MAX + ' ملفات'); }
        CS.nav.pop();
        draw(made ? made.id : p && p.id);
      }
      function form() {
        box.innerHTML = '';
        box.appendChild(h('p', { text: p ? 'تعديل الملف' : 'ملف جديد' }));
        box.appendChild(h('div.pf-form', null, [
          h('div.pf-form-row.group', null, [
            h('button.pf-color.f', { 'aria-label': 'اختر صورة أو لون', onclick: choose }, [pic, h('span.pf-color-hint', { text: 'غيّر الصورة' })]),
            input
          ])
        ]));
        box.appendChild(h('p.confirm-note', { text: p && p.id === 'main' ? 'يتغير في Crimson بكل أجهزتك، واسم حسابك في Stremio ما يتغير. اضغط على الصورة تختار شخصية أو لون.' : 'اضغط على الصورة تختار شخصية أو لون.' }));
        box.appendChild(h('div.confirm-btns.group', null, [
          h('button.btn.primary.f', { onclick: save }, p ? 'احفظ' : 'أنشئ الملف'),
          p && p.id !== 'main' ? h('button.btn.f', { onclick: askRemove }, 'احذف الملف') : null,
          h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'رجوع')
        ]));
        paint();
      }
      function askRemove() {
        box.innerHTML = '';
        box.appendChild(h('p', { text: 'تحذف ملف «' + CS.profiles.name(p) + '»؟' }));
        box.appendChild(h('p.confirm-note', { text: 'ينحذف من كل أجهزتك، ومكتبته ومتابعة مشاهدته تنحذف معه ولا ترجع. الملف الرئيسي وحسابك في Stremio ما يتأثرون.' }));
        var no = h('button.btn.f', { onclick: function () { form(); CS.nav.focus(box.querySelector('.btn.primary')); } }, 'لا، خلّه');
        box.appendChild(h('div.confirm-btns.group', null, [
          h('button.btn.primary.f', { onclick: function () {
            var wasCurrent = p.id === CS.profiles.current();
            CS.profiles.remove(p.id);
            CS.nav.pop();
            /* the profile in use is gone: the main one takes over */
            if (wasCurrent) { CS.start(false); return; }
            draw();
          } }, 'احذف'),
          no
        ]));
        CS.nav.focus(no);
      }
      form();
      CS.nav.push({ name: 'profile-edit', modal: true, el: modal, defaultFocus: function () { return input; } });
      if (window.CS_ANDROID && !p) setTimeout(function () { if (input.isConnected) { input.focus(); CS.host({ t: 'show-keyboard' }); } }, 200);
    }

    var scr = { name: 'profiles', el: el, defaultFocus: function () {
      return Array.prototype.filter.call(tiles.children, function (x) { return x._pid === CS.profiles.current(); })[0] || tiles.firstChild;
    } };
    draw();
    if (atStart) CS.nav.reset(scr); else CS.nav.push(scr);
    setBg(BG_DEFAULT, true);
    /* opened while watching: profiles made, changed or removed on another device since start-up show here too */
    if (!atStart) {
      var cur = CS.profiles.current();
      CS.profiles.sync().then(function (changed) {
        if (!changed || !el.isConnected) return;
        /* the profile in use was removed elsewhere: nothing to go back to, a profile has to be picked */
        if (CS.profiles.current() !== cur) profiles(true);
        else draw();
      });
    }
  }

  /* =============== settings =============== */
  function settings() {
    var el = section('settings');
    var list = h('div.settings-list');
    var sample = h('div.sub-sample', null, h('div.cue', null, [h('div.line', { text: '‏هذا شكل الترجمة على الشاشة‏' })]));
    el.appendChild(topbar('settings'));
    el.appendChild(h('div.settings-wrap', null, [h('div.vscroll.settings-scroll', { 'data-pad': '80' }, h('div.vtrack', null, list)), sample]));
    var S = CS.settings;

    function cycle(key, values, labels) {
      return {
        value: function () { return labels[values.indexOf(S[key])] || labels[0]; },
        act: function () { S[key] = values[(values.indexOf(S[key]) + 1) % values.length]; CS.saveSettings(); }
      };
    }
    /* what the phone's own player has no use for stays off its list */
    var phoneSkips = !!window.CS_ANDROID;
    var items = [
      { head: 'الحساب' },
      { label: 'حساب Stremio', value: function () { return S.email || (S.authKey ? 'مربوط' : 'غير مربوط'); }, act: function () { } },
      { label: 'الملف', value: function () { var p = CS.profiles.get(CS.profiles.current()); return CS.profiles.name(p) + (p.id !== 'main' ? ' (مكتبته في الجهاز)' : p.name ? ' (الرئيسي)' : ''); }, act: function () { profiles(false); } },
      /* the lock is set from the main profile only */
      CS.profiles.isMain() ? { label: 'قفل الملف الرئيسي برمز', value: function () { return CS.profiles.hasPin() ? 'شغّال' : 'مطفي'; }, act: function () {
        if (CS.profiles.hasPin()) askPin(function () { CS.profiles.clearPin(); CS.toast('انشال القفل'); draw(); });
        else newPin();
      } } : null,
      CS.profiles.isMain() ? { label: 'تغيير الرمز', value: function () { return ''; }, hidden: function () { return !CS.profiles.hasPin(); }, act: function () { askPin(newPin); } } : null,
      /* a trusted device opens the main profile without the PIN, until the PIN changes */
      CS.profiles.isMain() ? { label: 'الثقة بهذا الجهاز', value: function () { return CS.profiles.trusted() ? 'موثوق' : 'غير موثوق'; }, hidden: function () { return !CS.profiles.hasPin(); }, act: function () {
        if (CS.profiles.trusted()) { CS.profiles.untrust(); CS.toast('شلنا الثقة: الرمز ينطلب في هذا الجهاز من جديد'); draw(); }
        else askPin(function () { CS.profiles.trust(); CS.toast('صار هذا الجهاز موثوق: ما يسألك عن الرمز إلا إذا تغيّر'); draw(); });
      } } : null,
      { label: 'تحديث الإضافات والمكتبة', value: function () { return CS.addons.all().length + ' إضافة'; }, act: function () { CS.toast('لحظة، نحدّث…'); Promise.all([CS.addons.load(true), CS.lib.load()]).then(function () { CS.toast('تم التحديث'); draw(); if (homeScreen) homeScreen.redrawRows(); }); } },
      { label: 'خروج من الحساب', value: function () { return ''; }, act: function () { CS.profiles.signedOut(); CS.api.logout(); S.authKey = ''; S.email = ''; CS.saveSettings(); CS.cache.drop('addons'); CS.cache.drop('lib'); login(); } },
      { head: 'الترجمة' },
      Object.assign({ label: 'الحجم' }, cycle('subSize', ['s', 'm', 'l', 'xl'], ['صغير', 'متوسط', 'كبير', 'كبير جدًا'])),
      Object.assign({ label: 'الشكل' }, cycle('subStyle', ['shadow', 'box'], ['ظل حول الحروف', 'خلفية داكنة'])),
      Object.assign({ label: 'اللون' }, cycle('subColor', ['white', 'yellow'], ['أبيض', 'أصفر'])),
      Object.assign({ label: 'الارتفاع عن أسفل الشاشة' }, cycle('subLift', [4, 6, 8, 10, 12, 15], ['4%', '6%', '8%', '10%', '12%', '15%'])),
      Object.assign({ label: 'اختيار أدق ترجمة تلقائيًا (أعلى تطابق)' }, cycle('subAuto', [true, false], ['نعم', 'لا'])),
      phoneSkips ? null : { label: 'توقيتات محفوظة لكل عنوان', value: function () { return Object.keys(S.subOffsets).filter(function (k) { return S.subOffsets[k]; }).length + ' عنوان'; }, act: function () { S.subOffsets = {}; CS.saveSettings(); CS.toast('رجّعنا كل التوقيتات لوقتها'); } },
      { head: 'التشغيل' },
      Object.assign({ label: 'الحلقة التالية تلقائيًا' }, cycle('autoNext', [true, false], ['نعم', 'لا'])),
      /* the phone: two taps on the right or the left of the video */
      Object.assign({ label: phoneSkips ? 'مقدار التقديم والتأخير (ضغطتين يمين أو يسار)' : 'مقدار التقديم والتأخير (يمين ويسار)' }, cycle('seekStep', [5, 10, 15, 30, 60], ['5 ثوانٍ', '10 ثوانٍ', '15 ثانية', '30 ثانية', 'دقيقة'])),
      phoneSkips ? null : Object.assign({ label: 'تكبير القفزة مع الضغط المتكرر' }, cycle('seekSpeedup', [true, false], ['نعم (×3 ثم ×6)', 'لا، نفس المقدار دايمًا'])),
      CS.desktop && !window.CS_ANDROID ? { label: 'حجم الواجهة', value: function () { return { 0.65: 'صغير جدًا', 0.75: 'صغير', 0.8: 'متوسط', 0.9: 'كبير', 1: 'كبير جدًا (مثل التلفزيون)' }[S.uiSize] || 'متوسط'; },
        act: function () { var v = [0.65, 0.75, 0.8, 0.9, 1]; S.uiSize = v[(v.indexOf(S.uiSize) + 1) % v.length]; CS.saveSettings(); CS.fitPage(); } } : null,
      Object.assign({ label: 'الدقة المفضّلة' }, cycle('preferQuality', ['best', '1080p', '720p'], ['الأعلى (أفضل صورة وصوت، أي حجم)', '1080p', '720p'])),
      Object.assign({ label: 'تشغيل أفضل مصدر تلقائيًا' }, cycle('autoBest', [false, true], ['لا، أختار بنفسي', 'نعم، بدون ما أختار'])),
      /* on every device now: the player takes the track in this language when the file has it, the title's own otherwise */
      Object.assign({ label: 'لغة الصوت' }, cycle('audioLang', ['original', 'ara', 'eng'], ['لغة العمل الأصلية', 'العربية إذا فيه', 'الإنجليزية إذا فيه'])),
      { head: CS.desktop && !window.CS_ANDROID ? 'الخادم' : 'كمبيوترك' },
      { label: window.CS_ANDROID ? 'عنوان كمبيوترك (للتورنت العادي)' : CS.desktop ? 'عنوان خادم Stremio (للتورنت العادي)' : 'عنوان كمبيوترك (لمصادر ⚡ وضبط الترجمة)', input: 'pc' },
      CS.config.hubUrl && !CS.desktop ? { label: 'رمز ضبط الترجمة (من صاحب الكمبيوتر)', input: 'fitCode' } : null,
      { head: 'عن التطبيق' },
      { label: 'الإصدار', value: function () { return CS.version; }, act: function () { } },
      { label: 'التحقق من التحديثات', value: function () { return ''; }, act: function () {
        CS.toast('لحظة، نتحقق…');
        if (CS.desktop) CS.host({ t: 'check-update' }); else if (CS.update) CS.update.check();
      } },
      { head: 'متقدم' },
      Object.assign({ label: 'وضع التشخيص' }, cycle('debug', [false, true], ['مطفي', 'شغّال'])),
      { label: 'سجل التشخيص', value: function () { return CS.logs.length + ' سطر'; }, act: showLogs }
    ];
    /* the phone: what is seldom touched stays folded, so the list a thumb goes through is short */
    var folded = window.CS_ANDROID ? { 'كمبيوترك': true, 'متقدم': true } : {};
    function draw() {
      var cur = CS.nav.current(), idx = cur ? Array.prototype.indexOf.call(list.querySelectorAll('.f'), cur) : -1;
      list.innerHTML = '';
      var hide = false;
      items.filter(Boolean).forEach(function (it) {
        if (it.head) {
          hide = !!folded[it.head];
          if (it.head in folded) {
            list.appendChild(h('button.settings-head.fold.f' + (hide ? '' : '.open'), { 'aria-expanded': hide ? 'false' : 'true', onclick: function () { folded[it.head] = !folded[it.head]; draw(); } }, [h('span', { text: it.head }), h('span.ico-wrap', { html: CS.icon('chevron') })]));
          } else list.appendChild(h('h3.settings-head', { text: it.head }));
          return;
        }
        if (hide || (it.hidden && it.hidden())) return;
        if (it.input) {
          var inp = h('input.setting-input.f', { type: 'text', value: S[it.input] || '', dir: 'ltr' });
          inp.addEventListener('change', function () { S[it.input] = inp.value.trim(); CS.saveSettings(); CS.toast('انحفظ'); });
          list.appendChild(h('div.setting', null, [h('span.setting-label', { text: it.label }), inp]));
          return;
        }
        list.appendChild(h('button.setting.f', { onclick: function () { it.act(); draw(); CS.subs.applyStyle(sample); sample.style.bottom = ''; } }, [
          h('span.setting-label', { text: it.label }), h('span.setting-value', { text: it.value() })
        ]));
      });
      if (idx >= 0) { var f = list.querySelectorAll('.f')[idx]; if (f) CS.nav.focus(f, 'no-scroll'); }
    }
    /* a new PIN, written twice */
    function newPin() {
      var first = '';
      pinPad({
        title: 'اختر رمز من 4 أرقام',
        note: 'الرمز يمشي على كل أجهزتك، واللي داخل الملف الرئيسي فيها يطلع ويكتبه من جديد',
        check: function (pin) {
          if (!first) { first = pin; return { title: 'اكتب الرمز مرة ثانية' }; }
          if (pin !== first) { first = ''; return { title: 'اختر رمز من 4 أرقام', msg: 'الرمزين مختلفين، ابدأ من جديد', bad: true }; }
          CS.profiles.setPin(pin);
          CS.toast('انقفل الملف الرئيسي');
          draw();
          return null;
        }
      });
    }
    function showLogs() {
      var box = h('section.screen.logs', null, h('pre', { dir: 'ltr', text: CS.logs.slice(-60).join('\n') }));
      CS.nav.push({ name: 'logs', el: box, defaultFocus: function () { return null; } });
    }
    draw();
    CS.subs.applyStyle(sample);
    sample.style.bottom = '';
    CS.nav.push({ name: 'settings', el: el, tab: 4, defaultFocus: function () { return list.querySelector('.f'); } });
    setBg(BG_DEFAULT, true);
  }

  CS.views = {
    login: login, home: home, detail: detail, streams: streams, search: search, library: library, downloads: downloads, settings: settings, profiles: profiles, roll: rollOptions, airing: airing,
    home_: function () { return homeScreen; }
  };
})();
