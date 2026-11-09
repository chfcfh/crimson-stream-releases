/* The screens: sign-in, home, title page, sources, search, library, settings. */
(function () {
  var h = CS.h;
  var BG_DEFAULT = 'img/crimson.jpg';
  var bgTimer = 0, bgNow = '';

  function setBg(url, now) {
    url = url || BG_DEFAULT;
    if (url === bgNow) return;
    clearTimeout(bgTimer);
    bgTimer = setTimeout(function () {
      var art = CS.$('bg-art');
      var img = new Image();
      img.onload = function () {
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
    var tabs = [
      { id: 'home', label: 'الرئيسية', go: function () { CS.nav.popToRoot(); } },
      window.CS_ANDROID ? null : { id: 'movie', label: 'أفلام', go: function () { browse('movie'); } },
      window.CS_ANDROID ? null : { id: 'series', label: 'مسلسلات', go: function () { browse('series'); } },
      window.CS_ANDROID ? null : { id: 'anime', label: 'أنمي', go: function () { browse('anime'); } },
      { id: 'search', label: 'بحث', go: function () { CS.views.search(); } },
      { id: 'library', label: 'مكتبتي', go: function () { CS.views.library(); } },
      CS.downloads ? { id: 'downloads', label: 'التحميلات', go: function () { CS.views.downloads(); } } : null,
      { id: 'settings', label: 'الإعدادات', go: function () { CS.views.settings(); } }
    ].filter(Boolean);
    return h('header.topbar', null, [
      h('div.brand', null, [h('span.brand-eye', { html: CS.eyeSvg() }), h('span', { text: 'CRIMSON STREAM' })]),
      h('nav.tabs.group', null, tabs.map(function (t) {
        return h('button.tab.f' + (t.id === active ? '.on' : ''), { onclick: function () { if (t.id !== active) t.go(); } }, t.label);
      }).concat(window.CS_ANDROID ? [] : [
        /* who is watching: shown once there is more than one profile (the phone has it in settings) */
        CS.profiles.askAtStart() ? h('button.tab.tab-pf.f', { 'aria-label': 'تبديل الملف', title: CS.profiles.name(CS.profiles.get(CS.profiles.current())), onclick: function () { profiles(false); } },
          avatar(CS.profiles.get(CS.profiles.current()))) : null
      ])),
      h('div.clock', { 'data-clock': 1 })
    ]);
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
    if (opts.tag) c.appendChild(h('div.card-tag', { text: opts.tag }));
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

  /* a card of "continue watching" plays straight on, from the source used before. When that cannot be done at once, its page opens */
  var resuming = false;
  function continueTitle(m) {
    if (resuming) return;
    resuming = true;
    var from = CS.nav.top();
    var toPage = function () {
      resuming = false;
      if (CS.nav.top() === from) CS.views.detail(m.type, m.id, m, { resume: true });
    };
    CS.toast('نجهّز لك الحلقة…');
    CS.addons.meta(m.type, m.id).then(function (meta) {
      var rp = CS.lib.resumePoint(meta.id);
      var video = meta.type === 'series' ? rp && (meta.videos || []).filter(function (v) { return v.id === rp.videoId; })[0] : { id: meta.id, title: meta.name };
      if (!video) return toPage();
      return Promise.race([CS.addons.streams(meta.type, video.id), CS.sleep(9000).then(function () { return null; })]).then(function (raw) {
        if (!raw) return toPage();
        var list = CS.streams.order(raw);
        var pick = CS.streams.pickLike(list, CS.settings.lastPick[meta.id]) || list.filter(function (o) { return o.cached !== false; })[0];
        if (!pick || !CS.streams.playUrl(pick) || CS.nav.top() !== from) return toPage();
        resuming = false;
        return CS.player.play(meta, video, pick, { list: list, resume: rp && rp.offset > 5 ? rp.offset : 0 });
      });
    }).catch(toPage);
  }

  /* a long OK press on a "continue watching" card offers its page or removing it; a short one plays it (on release).
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
            CS.start(true);
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
  function rowWindow(r, at, force, few) {
    var metas = r._metas;
    if (!metas || r._parked) return;
    /* only every few posters, and at once when the next would be missing */
    if (!force && r._at != null && Math.abs(at - r._at) < 4 && (r._to >= metas.length || r._to - at > 4) && (r._from <= 0 || at - r._from > 2)) return;
    var tr = r.querySelector('.htrack');
    r._at = at;
    r._from = Math.max(0, at - CARDS_BEHIND);
    r._to = Math.min(metas.length, at + CARDS_AHEAD + 1);
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
        /* the episode's own picture when there is one, as "up next" does elsewhere */
        var keptEp = ep && kept && kept.videos ? kept.videos.filter(function (v) { return v.id === vid; })[0] : null;
        var epPic = (keptEp && keptEp.thumbnail) || (ep && /^tt/.test(it._id) ? 'https://episodes.metahub.space/' + it._id + '/' + ep[1] + '/' + ep[2] + '/w780.jpg' : '');
        var wide = (kept && kept.background) || wideImage(it._id);
        var c = card(m, {
          progress: st.duration ? st.timeOffset / st.duration : null,
          wide: true,
          image: epPic || wide,
          image2: epPic ? wide : '',
          caption: line,
          hero: line,
          open: function () { continueTitle(m); }
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
      setBg(m.background || '', true);
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
        setBg(meta.background || '', true);
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
    var track = h('div.vtrack');
    var listBox = h('div.streams-list.vscroll', { 'data-pad': '120' }, track);
    el.appendChild(head);
    el.appendChild(status);
    el.appendChild(listBox);
    addBack(el);

    var raw = [], answered = {}, touched = false, shownKeys = {};
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
        h('div.source-addon', null, [h('span.source-name', null, o.speeder ? CS.iconKids('bolt', addonLabel(o.addonId, o.addonName)) : o.addonName), isBest ? h('span.best-tag', { text: 'الأفضل لك' }) : o.cached === true ? h('span.cached', { text: 'جاهز' }) : o.cached === false ? h('span.uncached', { text: 'يحتاج تحميل' }) : null]),
        h('div.source-badges', null, CS.streams.badges(o).map(function (t) { return h('span.badge' + (t === 'Dolby Vision' ? '.dv' : ''), { text: t }); })),
        /* the best one is told by what it offers; a file's name is for telling the others apart */
        isBest && CS.streams.badges(o).length ? null : h('div.source-file', { text: o.file || o.lines[0] || o.name }),
        h('div.source-note', { text: notReady ? 'مو جاهز للتحميل' : opts.download && o.speeder ? 'يمر عبر كمبيوترك: يلزم يبقى شغّال وأنت في البيت' : failed ? 'ما اشتغل قبل شوي' : isMemo ? 'مثل اختيارك السابق' : o.needsServer ? 'يحتاج Stremio في كمبيوترك' : (o.seeds ? o.seeds + ' مشارك' : '') })
      ]);
      b._stream = o;
      return b;
    }
    /* the one to take without thinking: for a download, a direct and ready one; after a failure, none is promised */
    var bestNow = null;
    function bestOf(list, pick) {
      if (opts.failed) return null;
      if (!opts.download) return pick;
      var fit = list.filter(function (o) { return !o.speeder && o.cached !== false; });
      return CS.streams.pickLike(fit, memo) || list.filter(function (o) { return o.cached !== false; })[0] || null;
    }
    function draw() {
      var list = opts.download ? CS.streams.forDownload(raw) : CS.streams.order(raw, !!(opts.failed && opts.failed.speeder));
      var pick = CS.streams.pickLike(list, memo);
      if (!touched) {
        bestNow = bestOf(list, pick);
        if (bestNow) {
          pick = bestNow;
          list = [bestNow].concat(list.filter(function (o) { return o !== bestNow; }));
        }
        track.innerHTML = '';
        shownKeys = {};
        if (!list.length) {
          var all = Object.keys(answered).length >= adds.length;
          var failedAll = all && adds.length && adds.every(function (a) { return answered[a.manifest.id] === null; });
          if (!all) CS.skel.sources(4).forEach(function (x) { track.appendChild(x); });
          else if (failedAll) track.appendChild(CS.errorState({
            title: 'ما ردّت الإضافات', reason: 'كل إضافات المصادر في حسابك ما ردّت. غالبًا الإنترنت مقطوع أو الإضافة متوقفة.',
            retry: function () { CS.nav.pop(); streams(meta, video, opts); }, back: function () { CS.nav.pop(); },
            details: 'streams ' + meta.type + ' ' + video.id + '\n' + adds.map(function (a) { return a.manifest.name + ': no answer'; }).join('\n')
          }));
          else track.appendChild(CS.emptyState({
            icon: 'search', title: 'ما فيه مصادر لهالعنوان',
            text: adds.length ? 'إضافاتك ما لقت له أي رابط الحين. جرّب بعد شوي، أو أضف إضافة مصادر ثانية في حسابك.' : 'ما في حسابك إضافة مصادر (مثل Torrentio). أضفها في Stremio ثم حدّث الإضافات من الإعدادات.',
            action: { icon: 'retry', label: 'دوّر مرة ثانية', run: function () { CS.nav.pop(); streams(meta, video, opts); } }
          }));
        }
        list.forEach(function (o, i) {
          if (bestNow && i === 1) track.appendChild(h('h2.sources-head', { text: 'مصادر ثانية' }));
          shownKeys[keyOf(o)] = 1;
          track.appendChild(rowFor(o, memo && o === pick));
        });
        var target = null;
        if (opts.failed) target = Array.prototype.filter.call(track.querySelectorAll('.source'), function (x) { return !x.classList.contains('dim'); })[0];
        else if (pick) target = Array.prototype.filter.call(track.querySelectorAll('.source'), function (x) { return x._stream === pick; })[0];
        target = target || track.querySelector('.source') || track.querySelector('.f'); /* nothing found: the state's first button */
        if (target) CS.nav.focus(target, 'instant');
      } else {
        /* the user is already choosing: add late answers at the end, without moving anything */
        list.forEach(function (o) { if (!shownKeys[keyOf(o)]) { shownKeys[keyOf(o)] = 1; track.appendChild(rowFor(o, false)); } });
      }
    }
    var alive = true;
    var scr = {
      name: 'streams', el: el,
      keys: function (e) { if (e.keyCode >= 37 && e.keyCode <= 40) touched = true; return false; },
      destroy: function () { alive = false; } /* late answers after leaving are dropped */
    };
    CS.nav.push(scr);
    drawStatus();
    draw();
    CS.addons.streams(meta.type, video.id, function (a, s) {
      if (!alive) return;
      answered[a.manifest.id] = s ? s.length : null;
      if (s) raw = raw.concat(s);
      drawStatus();
      draw();
    });
  }

  /* =============== search =============== */
  function search() {
    var el = section('search');
    var input = h('input.search-input.f', { type: 'text', placeholder: 'اكتب اسم فيلم أو مسلسل…', autocomplete: 'off' });
    var track = h('div.vtrack');
    var results = h('div.rows.vscroll', { 'data-anchor': '0' }, track);
    el.appendChild(topbar('search'));
    el.appendChild(h('div.search-bar', null, [input]));
    el.appendChild(results);
    var timer = 0, last = '', wantResults = false;
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
      var popular = CS.addons.homeCatalogs().filter(function (c) { return catName(c.cat) === 'الأشهر' && kindOf(c) !== 'other' && kindOf(c) !== 'anime'; });
      popular.forEach(function (c) {
        var r = skeletonRow(rowName(c), c.key);
        track.appendChild(r);
        loadCatalog(c, r, function () { CS.nav.refocus(); });
      });
    }
    function run() {
      var q = input.value.trim();
      if (q === last) return;
      last = q;
      track.innerHTML = '';
      if (q.length < 2) { startingPoints(); return; }
      var cats = CS.addons.searchCatalogs();
      var left = cats.length;
      /* every catalog answered with nothing (or failed): say it, instead of an empty screen */
      var oneDone = function () {
        if (--left > 0 || last !== q || track.querySelector('.row')) return;
        track.appendChild(CS.emptyState({ icon: 'search', title: 'ما لقينا شيء باسم «' + q + '»', text: 'جرّب الاسم بالإنجليزي أو جزء منه، مثل «breaking» بدل «بريكنق باد».' }));
      };
      if (!cats.length) track.appendChild(CS.emptyState({ icon: 'plus', title: 'ما فيه إضافة بحث', text: 'إضافات حسابك ما فيها بحث. Cinemeta مثلاً تبحث في الأفلام والمسلسلات.' }));
      cats.forEach(function (c) {
        var r = row((c.cat.type === 'movie' ? 'أفلام' : c.cat.type === 'series' ? 'مسلسلات' : c.cat.name) + ' — ' + c.addon.manifest.name, CS.skel.cards(7), c.addon.manifest.id + c.cat.type + c.cat.id);
        track.appendChild(r);
        CS.addons.catalog(c.addon, c.cat, { search: q }).then(function (metas) {
          if (last !== q) return;
          if (!metas.length) { r.remove(); oneDone(); return; }
          fillRow(r, metas.slice(0, 30).map(function (m) { return card(m); }));
          remember(q);
          oneDone();
          /* typing is over (Enter pressed): the first result takes the focus */
          if (wantResults && document.activeElement !== input) { wantResults = false; var f = track.querySelector('.card.f'); if (f) CS.nav.focus(f); }
        }, function () { r.remove(); oneDone(); });
      });
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
    CS.nav.push({ name: 'search', el: el, tab: 1, defaultFocus: function () { return input; } });
    startingPoints();
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
  function avatar(p) {
    return h('span.pf-avatar', { style: { background: CS.profiles.color(p) }, text: Array.from(CS.profiles.name(p))[0] || '؟' });
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

  /* the main profile is locked: its four digits first, then "then" */
  function askPin(then) {
    if (!CS.profiles.hasPin()) { then(); return; }
    pinPad({
      title: 'رمز الملف الرئيسي',
      note: 'اكتب الرمز عشان تدخل',
      check: function (pin) {
        var r = CS.profiles.checkPin(pin);
        if (r === 'ok') { setTimeout(then, 0); return null; }
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
      h('p.confirm-note', { text: 'افتح link.stremio.com وأنت داخل حساب Stremio، واكتب هالرمز ووافق. بعدها ينشال قفل الملف الرئيسي من هذا الجهاز.' }),
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

  /* atStart: shown before home (more than one profile); otherwise opened from the top bar or settings */
  function profiles(atStart) {
    var el = section('profiles');
    var editing = false;
    var title = h('h1.pf-title');
    var tiles = h('div.pf-tiles.group');
    var editBtn = h('button.btn.f', { onclick: function () { editing = !editing; draw(); } });
    el.appendChild(h('div.pf-box', null, [
      title, tiles,
      h('p.pf-note', { text: 'الملف الرئيسي مكتبته ومتابعته في حساب Stremio. الملفات الثانية تنحفظ في هذا الجهاز بس، وما تلمس حسابك، وتنحذف إذا انحذف التطبيق.' }),
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
          h('span.pf-kind', { text: p.id === 'main' ? 'حساب Stremio' + (CS.profiles.hasPin() ? ' · مقفول' : '') : 'هذا الجهاز بس' })
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
          CS.start(false);
        });
      };
      if (p.id === 'main') askPin(go); else go();
    }

    /* a new profile (p null) or one to rename, recolour or remove; the locked main one from another profile asks its PIN */
    function edit(p) {
      if (p && p.id === 'main' && !CS.profiles.isMain() && CS.profiles.hasPin()) { askPin(function () { editNow(p); }); return; }
      editNow(p);
    }
    function editNow(p) {
      var color = p ? p.color || 0 : CS.profiles.freeColor();
      var input = h('input.setting-input.pf-input.f', { type: 'text', value: p ? CS.profiles.name(p) : '', placeholder: 'الاسم', maxlength: '20', autocomplete: 'off' });
      var pic = h('span.pf-avatar');
      function paint() {
        pic.style.background = CS.profiles.COLORS[color];
        pic.textContent = Array.from(input.value.trim())[0] || '؟';
      }
      input.addEventListener('input', paint);
      input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { input.blur(); save(); } });
      var box = h('div.confirm-box.pf-edit');
      var modal = h('section.screen.confirm', null, box);
      function save() {
        var name = input.value.trim();
        if (!name) { CS.toast('اكتب اسم للملف'); CS.nav.focus(input); return; }
        var made = null;
        if (p) { CS.profiles.rename(p.id, name); CS.profiles.setColor(p.id, color); }
        else if (!(made = CS.profiles.add(name, color))) { CS.toast('وصلت للحد: ' + CS.profiles.MAX + ' ملفات'); }
        CS.nav.pop();
        draw(made ? made.id : p && p.id);
      }
      function form() {
        box.innerHTML = '';
        box.appendChild(h('p', { text: p ? 'تعديل الملف' : 'ملف جديد' }));
        box.appendChild(h('div.pf-form', null, [
          h('div.pf-form-row.group', null, [
            h('button.pf-color.f', { 'aria-label': 'غيّر اللون', onclick: function () { color = (color + 1) % CS.profiles.COLORS.length; paint(); } }, pic),
            input
          ])
        ]));
        box.appendChild(h('p.confirm-note', { text: p && p.id === 'main' ? 'الاسم واللون هنا بس، وما يتغير شيء في حسابك. اضغط على الدائرة تغيّر اللون.' : 'اضغط على الدائرة تغيّر اللون.' }));
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
        box.appendChild(h('p.confirm-note', { text: 'مكتبته ومتابعة مشاهدته في هذا الجهاز تنحذف ولا ترجع. حسابك في Stremio ما يتأثر.' }));
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
      { label: 'الملف', value: function () { var p = CS.profiles.get(CS.profiles.current()); return CS.profiles.name(p) + (p.id !== 'main' ? ' (هذا الجهاز بس)' : p.name ? ' (الرئيسي)' : ''); }, act: function () { profiles(false); } },
      /* the lock is set from the main profile only */
      CS.profiles.isMain() ? { label: 'قفل الملف الرئيسي برمز', value: function () { return CS.profiles.hasPin() ? 'شغّال' : 'مطفي'; }, act: function () {
        if (CS.profiles.hasPin()) askPin(function () { CS.profiles.clearPin(); CS.toast('انشال القفل'); draw(); });
        else newPin();
      } } : null,
      CS.profiles.isMain() ? { label: 'تغيير الرمز', value: function () { return ''; }, hidden: function () { return !CS.profiles.hasPin(); }, act: function () { askPin(newPin); } } : null,
      { label: 'تحديث الإضافات والمكتبة', value: function () { return CS.addons.all().length + ' إضافة'; }, act: function () { CS.toast('لحظة، نحدّث…'); Promise.all([CS.addons.load(true), CS.lib.load()]).then(function () { CS.toast('تم التحديث'); draw(); if (homeScreen) homeScreen.redrawRows(); }); } },
      { label: 'خروج من الحساب', value: function () { return ''; }, act: function () { CS.api.logout(); S.authKey = ''; S.email = ''; CS.saveSettings(); CS.cache.drop('addons'); CS.cache.drop('lib'); login(); } },
      { head: 'الترجمة' },
      Object.assign({ label: 'الحجم' }, cycle('subSize', ['s', 'm', 'l', 'xl'], ['صغير', 'متوسط', 'كبير', 'كبير جدًا'])),
      Object.assign({ label: 'الشكل' }, cycle('subStyle', ['shadow', 'box'], ['ظل حول الحروف', 'خلفية داكنة'])),
      Object.assign({ label: 'اللون' }, cycle('subColor', ['white', 'yellow'], ['أبيض', 'أصفر'])),
      Object.assign({ label: 'الارتفاع عن أسفل الشاشة' }, cycle('subLift', [4, 6, 8, 10, 12, 15], ['4%', '6%', '8%', '10%', '12%', '15%'])),
      Object.assign({ label: 'اختيار الترجمة العربية تلقائيًا' }, cycle('subAuto', [true, false], ['نعم', 'لا'])),
      phoneSkips ? null : { label: 'توقيتات محفوظة لكل عنوان', value: function () { return Object.keys(S.subOffsets).filter(function (k) { return S.subOffsets[k]; }).length + ' عنوان'; }, act: function () { S.subOffsets = {}; CS.saveSettings(); CS.toast('رجّعنا كل التوقيتات لوقتها'); } },
      { head: 'التشغيل' },
      Object.assign({ label: 'الحلقة التالية تلقائيًا' }, cycle('autoNext', [true, false], ['نعم', 'لا'])),
      phoneSkips ? null : Object.assign({ label: 'مقدار التقديم والتأخير (يمين ويسار)' }, cycle('seekStep', [5, 10, 15, 30, 60], ['5 ثوانٍ', '10 ثوانٍ', '15 ثانية', '30 ثانية', 'دقيقة'])),
      phoneSkips ? null : Object.assign({ label: 'تكبير القفزة مع الضغط المتكرر' }, cycle('seekSpeedup', [true, false], ['نعم (×3 ثم ×6)', 'لا، نفس المقدار دايمًا'])),
      CS.desktop && !window.CS_ANDROID ? { label: 'حجم الواجهة', value: function () { return { 0.65: 'صغير جدًا', 0.75: 'صغير', 0.8: 'متوسط', 0.9: 'كبير', 1: 'كبير جدًا (مثل التلفزيون)' }[S.uiSize] || 'متوسط'; },
        act: function () { var v = [0.65, 0.75, 0.8, 0.9, 1]; S.uiSize = v[(v.indexOf(S.uiSize) + 1) % v.length]; CS.saveSettings(); CS.fitPage(); } } : null,
      Object.assign({ label: 'الدقة المفضّلة' }, cycle('preferQuality', ['best', '1080p', '720p'], ['الأعلى', '1080p', '720p'])),
      phoneSkips ? null : Object.assign({ label: 'لغة الصوت' }, cycle('audioLang', ['original', 'ara', 'eng'], ['الأصلية', 'العربية إذا فيه', 'الإنجليزية إذا فيه'])),
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
        note: 'الرمز ينحفظ في هذا الجهاز بس',
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
    login: login, home: home, detail: detail, streams: streams, search: search, library: library, downloads: downloads, settings: settings, profiles: profiles,
    home_: function () { return homeScreen; }
  };
})();
