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
        setTimeout(function () { art.style.backgroundImage = 'url("' + url + '")'; art.style.opacity = url === BG_DEFAULT ? 0.72 : 0.5; }, 180);
      };
      img.src = url;
    }, now ? 0 : 380);
  }
  CS.setBg = setBg;

  function section(cls) { return h('section.screen.' + cls); }

  function topbar(active) {
    var tabs = [
      { id: 'home', label: 'الرئيسية', go: function () { while (CS.nav.stack.length > 1) CS.nav.pop(); } },
      { id: 'search', label: 'بحث', go: function () { CS.views.search(); } },
      { id: 'library', label: 'مكتبتي', go: function () { CS.views.library(); } },
      { id: 'settings', label: 'الإعدادات', go: function () { CS.views.settings(); } }
    ];
    return h('header.topbar', null, [
      h('div.brand', null, [h('span.brand-eye', { html: CS.eyeSvg() }), h('span', { text: 'CRIMSON STREAM' })]),
      h('nav.tabs.group', null, tabs.map(function (t) {
        return h('button.tab.f' + (t.id === active ? '.on' : ''), { onclick: function () { if (t.id !== active) t.go(); } }, t.label);
      })),
      h('div.clock', { 'data-clock': 1 })
    ]);
  }

  function metaLine(m) {
    var bits = [];
    if (m.releaseInfo) bits.push(m.releaseInfo);
    if (m.runtime) bits.push(m.runtime);
    if (m.imdbRating) bits.push('★ ' + m.imdbRating);
    if (m.genres && m.genres.length) bits.push(m.genres.slice(0, 3).join(' · '));
    return bits.join('   ');
  }

  function poster(m) {
    var wrap = h('div.poster');
    if (m.poster) {
      var img = h('img', { src: m.poster, loading: 'lazy', alt: '' });
      img.onerror = function () { img.remove(); wrap.classList.add('noimg'); };
      wrap.appendChild(img);
    } else wrap.classList.add('noimg');
    wrap.appendChild(h('div.poster-name', { text: m.name || '' }));
    return wrap;
  }

  function card(m, opts) {
    opts = opts || {};
    var c = h('button.card.f' + (opts.wide ? '.wide' : ''), { onclick: function () { (opts.open || openMeta)(m); } });
    c.appendChild(poster(m));
    if (opts.progress != null) c.appendChild(h('div.progress', null, h('div', { style: { width: Math.round(opts.progress * 100) + '%' } })));
    if (opts.tag) c.appendChild(h('div.card-tag', { text: opts.tag }));
    c._meta = m;
    c._hero = opts.hero;
    return c;
  }

  function row(title, cards, key, hint) {
    var r = h('div.row.group', { 'data-key': key || '' }, [
      h('h2.row-title', null, [title, hint ? h('span.row-hint', { text: hint }) : null]),
      h('div.hscroll', null, h('div.htrack', null, cards))
    ]);
    return r;
  }
  function fillRow(r, cards) {
    var tr = r.querySelector('.htrack');
    tr.innerHTML = '';
    cards.forEach(function (c) { tr.appendChild(c); });
  }

  function openMeta(m) { CS.views.detail(m.type, m.id, m); }

  /* removing a title from "continue watching": always asked first. The place in the episode is forgotten (in the
     account too); the title itself stays in the library if it is there. */
  function askDismiss(id, name, done) {
    var box = h('section.screen.confirm', null, h('div.confirm-box', null, [
      h('p', { text: 'إزالة «' + name + '» من متابعة المشاهدة؟' }),
      h('p.confirm-note', { text: 'يُنسى مكان توقفك فيه، وفي جوالك أيضًا.' }),
      h('div.confirm-btns.group', null, [
        h('button.btn.primary.f', { onclick: function () {
          CS.lib.dismiss(id);
          CS.nav.pop();
          CS.toast('أُزيل من متابعة المشاهدة');
          if (done) done();
        } }, 'إزالة'),
        h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'إلغاء')
      ])
    ]));
    CS.nav.push({
      name: 'confirm', modal: true, el: box,
      defaultFocus: function () { return box.querySelectorAll('.f')[1]; },
      /* the OK still held from the long press (it repeats) presses nothing here; only a new press does */
      keys: function (e) { return e.keyCode === CS.KEY.OK && press.holding; }
    });
  }

  /* a long OK press on a "continue watching" card asks to remove it; a short one opens it (on release).
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

  /* =============== sign-in =============== */
  function login() {
    var el = section('login');
    var codeBox = h('div.code', { text: '····' });
    var qr = h('img.qr', { alt: '' });
    var note = h('p.login-note', { text: 'جاري تجهيز الرمز…' });
    var poll = 0, renew = 0, alive = true;
    function fresh() {
      clearInterval(poll); clearTimeout(renew);
      note.textContent = 'جاري تجهيز الرمز…';
      CS.api.linkCreate().then(function (r) {
        if (!alive) return;
        codeBox.textContent = r.code;
        qr.src = r.qrcode;
        note.textContent = 'امسح الرمز بجوالك أو افتح link.stremio.com واكتب الرمز، وأنت مسجّل في Stremio، ثم وافق.';
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
        note.textContent = 'تعذّر الاتصال بـ Stremio (' + e.message + ') — سنحاول مرة أخرى';
        renew = setTimeout(fresh, 8000);
      });
    }
    el.appendChild(h('div.login-box', null, [
      h('div.login-eye', { html: CS.eyeSvg() }),
      h('h1', { text: 'CRIMSON STREAM' }),
      h('p.login-lead', { text: 'اربط التطبيق بحسابك في Stremio مرة واحدة: إضافاتك ومتابعة المشاهدة تصير هنا.' }),
      h('div.login-pair', null, [qr, h('div', null, [h('div.code-label', { text: 'الرمز' }), codeBox, h('div.code-site', { text: 'link.stremio.com' })])]),
      note,
      h('button.btn.f', { onclick: fresh }, 'رمز جديد')
    ]));
    CS.nav.reset({ name: 'login', el: el, destroy: function () { alive = false; clearInterval(poll); clearTimeout(renew); } });
    setBg(BG_DEFAULT, true);
    fresh();
  }

  /* =============== home =============== */
  var homeScreen = null;
  function home() {
    var el = section('home');
    var hero = h('div.hero', null, [h('div.hero-logo'), h('div.hero-line'), h('p.hero-desc')]);
    var track = h('div.vtrack');
    var rows = h('div.rows.vscroll', { 'data-anchor': '0' }, track);
    el.appendChild(topbar('home'));
    el.appendChild(hero);
    el.appendChild(rows);

    function showHero(c) {
      var m = c && c._meta;
      if (!m) return;
      var logo = hero.querySelector('.hero-logo');
      logo.innerHTML = '';
      if (m.logo) {
        var img = h('img', { src: m.logo, alt: '' });
        img.onerror = function () { logo.textContent = m.name; };
        logo.appendChild(img);
      } else logo.textContent = m.name;
      hero.querySelector('.hero-line').textContent = c._hero || metaLine(m);
      hero.querySelector('.hero-desc').textContent = m.description || '';
      setBg(m.background || (m.id && /^tt/.test(m.id) ? 'https://images.metahub.space/background/medium/' + m.id + '/img' : ''));
    }

    /* continue watching first */
    var cwRow = null;
    function drawCW() {
      var list = CS.lib.continueWatching().slice(0, 20);
      var cards = list.map(function (it) {
        var m = { id: it._id, type: it.type, name: it.name, poster: it.poster, background: '', logo: '' };
        var st = it.state, vid = st.video_id || '', ep = /:(\d+):(\d+)$/.exec(vid);
        var left = st.duration ? Math.max(0, Math.round((st.duration - st.timeOffset) / 60000)) : 0;
        var line = (ep ? CS.epLabel(+ep[1], +ep[2]) + '   ' : '') + (st.timeOffset <= 1 ? 'الحلقة التالية' : left ? 'باقي ' + left + ' دقيقة' : '');
        var c = card(m, {
          progress: st.duration ? st.timeOffset / st.duration : null,
          tag: ep ? CS.epLabel(+ep[1], +ep[2]) : null,
          hero: line,
          open: function () { CS.views.detail(m.type, m.id, m, { resume: true }); }
        });
        c._cwId = it._id;
        c._askRemove = function () { askDismiss(it._id, it.name, function () { afterRemove(c); }); };
        c.addEventListener('contextmenu', function (e) { e.preventDefault(); CS.nav.focus(c, 'no-scroll'); c._askRemove(); });
        return c;
      });
      if (!cards.length) { if (cwRow) { cwRow.remove(); cwRow = null; } return; }
      var hint = CS.desktop ? 'زر الفأرة الأيمن أو Delete للإزالة' : 'اضغط مطوّلًا على OK للإزالة';
      var was = CS.nav.current();
      if (!cwRow) { cwRow = row('متابعة المشاهدة', cards, 'cw', hint); track.insertBefore(cwRow, track.firstChild); }
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

    function drawRows() {
      Array.prototype.slice.call(track.querySelectorAll('.row:not([data-key=cw])')).forEach(function (r) { r.remove(); });
      var cats = CS.addons.homeCatalogs(), rowOf = {};
      cats.forEach(function (c) {
        var title = (c.cat.name || c.cat.id) + ' — ' + (c.cat.type === 'movie' ? 'أفلام' : c.cat.type === 'series' ? 'مسلسلات' : c.addon.manifest.name);
        var r = row(title, [h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton'), h('div.card.skeleton')], c.key);
        r._cat = c;
        rowOf[c.key] = r;
        track.appendChild(r);
      });
      var t0 = Date.now();
      CS.pool(cats, 4, function (c) {
        var r = rowOf[c.key]; /* by reference: catalog ids may hold characters a selector cannot take */
        var key = 'cat:' + c.key;
        var cached = CS.cache.get(key);
        var draw = function (metas) {
          if (!r || !r.isConnected) return;
          if (!metas.length) { r.remove(); return; }
          fillRow(r, metas.slice(0, 40).map(function (m) { return card(m); }));
          /* the first row arrived before any key was pressed: start on its first poster */
          var cur = CS.nav.current();
          if (!CS.touched && CS.nav.top() === homeScreen && (!cur || cur.classList.contains('tab'))) {
            var first = track.querySelector('.row .card.f');
            if (first) CS.nav.focus(first, 'instant');
          } else CS.nav.refocus();
        };
        if (cached) {
          draw(cached);
          if (CS.cache.age(key) > 3 * 3600e3) CS.addons.catalog(c.addon, c.cat).then(function (m) { CS.cache.set(key, m); });
          return;
        }
        return CS.addons.catalog(c.addon, c.cat).then(function (metas) {
          CS.cache.set(key, metas);
          draw(metas);
        }, function (e) {
          CS.log('row failed', c.key, e.message || e.name);
          if (r) r.remove();
        });
      }).then(function () { CS.log('home rows ready', cats.length, (Date.now() - t0) + 'ms'); });
    }

    homeScreen = {
      name: 'home', el: el,
      /* on a "continue watching" card: Delete asks to remove it, OK waits to tell a long press from a short one */
      keys: function (e) {
        var cur = CS.nav.current();
        if (!cur || !cur._cwId) return false;
        if (e.keyCode === 46) { cur._askRemove(); return true; }
        if (e.keyCode !== CS.KEY.OK) return false;
        if (!e.repeat && press.card !== cur) pressDown(cur);
        return true;
      },
      focusChanged: function (c) { if (c.classList.contains('card')) showHero(c); },
      defaultFocus: function () { return el.querySelector('.row .card.f') || el.querySelector('.tab.f'); },
      shown: function () { drawCW(); if (CS.nav.current() && CS.nav.current()._meta) showHero(CS.nav.current()); },
      redrawRows: drawRows,
      redrawCW: drawCW
    };
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
    var meta = null, watched = new Set(), season = null;

    function drawInfo(m) {
      info.innerHTML = '';
      var title = m.logo ? h('div.detail-logo', null, h('img', { src: m.logo, alt: '', onerror: function () { this.parentNode.textContent = m.name; } })) : h('h1.detail-title', { text: m.name });
      info.appendChild(title);
      info.appendChild(h('div.detail-line', { text: metaLine(m) }));
      if (m.description) info.appendChild(h('p.detail-desc', { text: m.description }));
      if (m.cast && m.cast.length) info.appendChild(h('div.detail-cast', { text: m.cast.slice(0, 5).join('، ') }));
      setBg(m.background || '', true);
    }
    if (seed) drawInfo(seed);
    else info.appendChild(CS.spinner('جاري التحميل…'));

    function epVideo(vid) { return meta.videos.filter(function (x) { return x.id === vid; })[0]; }

    function drawActions() {
      actions.innerHTML = '';
      var rp = CS.lib.resumePoint(meta.id);
      var first = null;
      if (meta.type === 'series') {
        var vid = rp && epVideo(rp.videoId);
        if (vid) {
          var label = rp.offset > 5 ? 'أكمل ' + CS.epLabel(vid.season, vid.episode) + ' من ' + CS.fmtTime(rp.offset) : 'شغّل ' + CS.epLabel(vid.season, vid.episode);
          first = h('button.btn.primary.f', { onclick: function () { streams(meta, vid, { resume: rp.offset > 5 ? rp.offset : 0 }); } }, '▶  ' + label);
        } else {
          var e1 = meta.videos.filter(function (x) { return x.season > 0; })[0];
          if (e1) first = h('button.btn.primary.f', { onclick: function () { streams(meta, e1); } }, '▶  شغّل ' + CS.epLabel(e1.season, e1.episode));
        }
      } else {
        var mv = { id: meta.id, title: meta.name };
        var resumeAt = rp && rp.videoId === meta.id && rp.offset > 5 ? rp.offset : 0;
        first = h('button.btn.primary.f', { onclick: function () { streams(meta, mv, { resume: resumeAt }); } }, '▶  ' + (resumeAt ? 'أكمل من ' + CS.fmtTime(resumeAt) : 'شغّل'));
      }
      if (first) actions.appendChild(first);
      var lib = h('button.btn.f', {
        onclick: function () {
          var on = CS.lib.toggleLibrary(meta);
          lib.textContent = on ? '✓  في مكتبتي' : '+  أضف لمكتبتي';
          CS.toast(on ? 'أضيف لمكتبتك' : 'أزيل من مكتبتك');
        }
      }, CS.lib.inLibrary(meta.id) ? '✓  في مكتبتي' : '+  أضف لمكتبتي');
      actions.appendChild(lib);
      if (CS.lib.inContinueWatching(meta.id)) actions.appendChild(h('button.btn.f', { onclick: function () {
        askDismiss(meta.id, meta.name, function () { refreshProgress(); });
      } }, '✕  إزالة من متابعة المشاهدة'));
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

    function drawEpisodes(focusVid) {
      var tr = episodes.querySelector('.htrack');
      tr.innerHTML = '';
      tr._sx = 0; tr.style.transform = '';
      var rp = CS.lib.resumePoint(meta.id);
      var target = null;
      meta.videos.filter(function (x) { return x.season === season; }).forEach(function (vid) {
        var future = vid.released && new Date(vid.released) > new Date();
        var c = h('button.ep.f' + (future ? '.future' : ''), { onclick: function () { if (future) { CS.toast('لم تُعرض بعد'); return; } streams(meta, vid); } }, [
          h('div.ep-thumb', null, vid.thumbnail ? h('img', { src: vid.thumbnail, loading: 'lazy', alt: '', onerror: function () { this.remove(); } }) : null),
          h('div.ep-name', { text: 'E' + vid.episode + (vid.title ? ' · ' + vid.title : '') }),
          watched.has(vid.id) ? h('div.ep-watched', { text: '✓' }) : null,
          rp && rp.videoId === vid.id && rp.duration ? h('div.progress', null, h('div', { style: { width: Math.round(rp.offset / rp.duration * 100) + '%' } })) : null
        ]);
        c._onFocus = function () {
          epInfo.textContent = (vid.released ? new Date(vid.released).toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' }) + ' — ' : '') + (vid.overview || '');
        };
        if (vid.id === focusVid) target = c;
        tr.appendChild(c);
      });
      if (target) { episodes._last = target; }
    }

    var scr = {
      name: 'detail', el: el,
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
      info.appendChild(h('h1.detail-title', { text: seed ? seed.name : '' }));
      info.appendChild(h('p.detail-desc', { text: 'تعذّر فتح صفحة العنوان: ' + e.message }));
      actions.appendChild(h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'رجوع'));
      CS.nav.refocus();
    });
  }

  /* =============== sources =============== */
  function streams(meta, video, opts) {
    opts = opts || {};
    var el = section('streams');
    var head = h('div.streams-head', null, [
      h('h1', { text: meta.name }),
      h('div.streams-sub', { text: meta.type === 'series' ? CS.epLabel(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : (meta.releaseInfo || '') })
    ]);
    var status = h('div.streams-status');
    var track = h('div.vtrack');
    var listBox = h('div.streams-list.vscroll', { 'data-pad': '120' }, track);
    el.appendChild(head);
    el.appendChild(status);
    el.appendChild(listBox);

    var raw = [], answered = {}, touched = false, shownKeys = {};
    var memo = opts.current ? CS.streams.memo(opts.current) : CS.settings.lastPick[meta.id];
    var adds = CS.addons.all().filter(function (a) { return CS.addons.supports(a, 'stream', meta.type, video.id); });

    function keyOf(o) { return o.addonId + '|' + (o.url || o.infoHash) + '|' + o.fileIdx; }
    function drawStatus() {
      var parts = adds.map(function (a) {
        var n = answered[a.manifest.id];
        return a.manifest.name + (n === undefined ? ' …' : n === null ? ' ✕' : ' ' + n);
      });
      status.textContent = parts.join('   ·   ');
    }
    function rowFor(o, isMemo) {
      var failed = opts.failed && keyOf(opts.failed) === keyOf(o);
      var b = h('button.source.f' + (failed ? '.dim' : '') + (o.speeder ? '.fast' : ''), {
        onclick: function () { CS.player.play(meta, video, o, { resume: opts.resume }); }
      }, [
        h('div.source-addon', null, [h('span', { text: o.addonName }), o.cached === true ? h('span.cached', { text: 'جاهز' }) : o.cached === false ? h('span.uncached', { text: 'يحتاج تحميل' }) : null]),
        h('div.source-badges', null, CS.streams.badges(o).map(function (t) { return h('span.badge' + (t === 'Dolby Vision' ? '.dv' : ''), { text: t }); })),
        h('div.source-file', { text: o.file || o.lines[0] || o.name }),
        h('div.source-note', { text: failed ? 'لم يعمل قبل قليل' : isMemo ? 'مثل اختيارك السابق' : o.needsServer ? 'يحتاج Stremio في كمبيوترك' : (o.seeds ? '👤 ' + o.seeds : '') })
      ]);
      b._stream = o;
      return b;
    }
    function draw() {
      var list = CS.streams.order(raw, !!(opts.failed && opts.failed.speeder));
      var pick = CS.streams.pickLike(list, memo);
      if (!touched) {
        track.innerHTML = '';
        shownKeys = {};
        if (!list.length) track.appendChild(h('div.streams-empty', { text: Object.keys(answered).length < adds.length ? 'جاري البحث في إضافاتك…' : 'لا توجد مصادر لهذا العنوان' }));
        list.forEach(function (o) { shownKeys[keyOf(o)] = 1; track.appendChild(rowFor(o, memo && o === pick)); });
        var target = null;
        if (opts.failed) target = Array.prototype.filter.call(track.querySelectorAll('.source'), function (x) { return !x.classList.contains('dim'); })[0];
        else if (pick) target = Array.prototype.filter.call(track.querySelectorAll('.source'), function (x) { return x._stream === pick; })[0];
        target = target || track.querySelector('.source');
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
    function run() {
      var q = input.value.trim();
      if (q === last) return;
      last = q;
      track.innerHTML = '';
      if (q.length < 2) return;
      var cats = CS.addons.searchCatalogs();
      cats.forEach(function (c) {
        var r = row((c.cat.type === 'movie' ? 'أفلام' : c.cat.type === 'series' ? 'مسلسلات' : c.cat.name) + ' — ' + c.addon.manifest.name, [CS.spinner()], c.addon.manifest.id + c.cat.type + c.cat.id);
        track.appendChild(r);
        CS.addons.catalog(c.addon, c.cat, { search: q }).then(function (metas) {
          if (last !== q) return;
          if (!metas.length) { r.remove(); return; }
          fillRow(r, metas.slice(0, 30).map(function (m) { return card(m); }));
          /* typing is over (Enter pressed): the first result takes the focus */
          if (wantResults && document.activeElement !== input) { wantResults = false; var f = track.querySelector('.card.f'); if (f) CS.nav.focus(f); }
        }, function () { r.remove(); });
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
    CS.nav.push({ name: 'search', el: el, defaultFocus: function () { return input; } });
    setBg(BG_DEFAULT, true);
  }

  /* =============== library =============== */
  function library() {
    var el = section('library');
    var grid = h('div.grid');
    el.appendChild(topbar('library'));
    el.appendChild(h('div.vscroll.grid-scroll', { 'data-pad': '80' }, h('div.vtrack', null, grid)));
    var items = CS.lib.libraryList();
    if (!items.length) grid.appendChild(h('p.empty', { text: 'مكتبتك فارغة — أضف عناوين من صفحاتها بزر «أضف لمكتبتي».' }));
    items.forEach(function (it) {
      grid.appendChild(card({ id: it._id, type: it.type, name: it.name, poster: it.poster }));
    });
    CS.nav.push({ name: 'library', el: el, defaultFocus: function () { return grid.querySelector('.f') || el.querySelector('.tab.on'); } });
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
    var items = [
      { head: 'الحساب' },
      { label: 'حساب Stremio', value: function () { return S.email || (S.authKey ? 'مربوط' : 'غير مربوط'); }, act: function () { } },
      { label: 'تحديث الإضافات والمكتبة', value: function () { return CS.addons.all().length + ' إضافة'; }, act: function () { CS.toast('جاري التحديث…'); Promise.all([CS.addons.load(true), CS.lib.load()]).then(function () { CS.toast('تم التحديث'); draw(); if (homeScreen) homeScreen.redrawRows(); }); } },
      { label: 'خروج من الحساب', value: function () { return ''; }, act: function () { CS.api.logout(); S.authKey = ''; S.email = ''; CS.saveSettings(); CS.cache.drop('addons'); CS.cache.drop('lib'); login(); } },
      { head: 'الترجمة' },
      Object.assign({ label: 'الحجم' }, cycle('subSize', ['s', 'm', 'l', 'xl'], ['صغير', 'متوسط', 'كبير', 'كبير جدًا'])),
      Object.assign({ label: 'الشكل' }, cycle('subStyle', ['shadow', 'box'], ['ظل حول الحروف', 'خلفية داكنة'])),
      Object.assign({ label: 'اللون' }, cycle('subColor', ['white', 'yellow'], ['أبيض', 'أصفر'])),
      Object.assign({ label: 'الارتفاع عن أسفل الشاشة' }, cycle('subLift', [4, 6, 8, 10, 12, 15], ['4%', '6%', '8%', '10%', '12%', '15%'])),
      Object.assign({ label: 'اختيار الترجمة العربية تلقائيًا' }, cycle('subAuto', [true, false], ['نعم', 'لا'])),
      { label: 'توقيتات محفوظة لكل عنوان', value: function () { return Object.keys(S.subOffsets).filter(function (k) { return S.subOffsets[k]; }).length + ' عنوان'; }, act: function () { S.subOffsets = {}; CS.saveSettings(); CS.toast('رجعت كل التوقيتات لوقتها'); } },
      { head: 'التشغيل' },
      Object.assign({ label: 'الحلقة التالية تلقائيًا' }, cycle('autoNext', [true, false], ['نعم', 'لا'])),
      Object.assign({ label: 'مقدار التقديم والتأخير (يمين ويسار)' }, cycle('seekStep', [5, 10, 15, 30, 60], ['5 ثوانٍ', '10 ثوانٍ', '15 ثانية', '30 ثانية', 'دقيقة'])),
      Object.assign({ label: 'تكبير القفزة مع الضغط المتكرر' }, cycle('seekSpeedup', [true, false], ['نعم (×3 ثم ×6)', 'لا، نفس المقدار دائمًا'])),
      CS.desktop ? { label: 'حجم الواجهة', value: function () { return { 0.65: 'صغير جدًا', 0.75: 'صغير', 0.8: 'متوسط', 0.9: 'كبير', 1: 'كبير جدًا (مثل التلفزيون)' }[S.uiSize] || 'متوسط'; },
        act: function () { var v = [0.65, 0.75, 0.8, 0.9, 1]; S.uiSize = v[(v.indexOf(S.uiSize) + 1) % v.length]; CS.saveSettings(); CS.fitPage(); } } : null,
      Object.assign({ label: 'الدقة المفضّلة' }, cycle('preferQuality', ['best', '1080p', '720p'], ['الأعلى', '1080p', '720p'])),
      Object.assign({ label: 'لغة الصوت' }, cycle('audioLang', ['original', 'ara', 'eng'], ['الأصلية', 'العربية إن وُجدت', 'الإنجليزية إن وُجدت'])),
      { head: CS.desktop ? 'الخادم' : 'كمبيوترك' },
      { label: CS.desktop ? 'عنوان خادم Stremio (للتورنت العادي)' : 'عنوان كمبيوترك (لمصادر ⚡ وضبط الترجمة)', input: 'pc' },
      { head: 'عن التطبيق' },
      { label: 'الإصدار', value: function () { return CS.version; }, act: function () { } },
      Object.assign({ label: 'وضع التشخيص' }, cycle('debug', [false, true], ['مطفأ', 'شغّال'])),
      { label: 'سجل التشخيص', value: function () { return CS.logs.length + ' سطر'; }, act: showLogs }
    ];
    function draw() {
      var cur = CS.nav.current(), idx = cur ? Array.prototype.indexOf.call(list.querySelectorAll('.f'), cur) : -1;
      list.innerHTML = '';
      items.filter(Boolean).forEach(function (it) {
        if (it.head) { list.appendChild(h('h3.settings-head', { text: it.head })); return; }
        if (it.input) {
          var inp = h('input.setting-input.f', { type: 'text', value: S[it.input] || '', dir: 'ltr' });
          inp.addEventListener('change', function () { S[it.input] = inp.value.trim(); CS.saveSettings(); CS.toast('حُفظ'); });
          list.appendChild(h('div.setting', null, [h('span.setting-label', { text: it.label }), inp]));
          return;
        }
        list.appendChild(h('button.setting.f', { onclick: function () { it.act(); draw(); CS.subs.applyStyle(sample); sample.style.bottom = ''; } }, [
          h('span.setting-label', { text: it.label }), h('span.setting-value', { text: it.value() })
        ]));
      });
      if (idx >= 0) { var f = list.querySelectorAll('.f')[idx]; if (f) CS.nav.focus(f, 'no-scroll'); }
    }
    function showLogs() {
      var box = h('section.screen.logs', null, h('pre', { dir: 'ltr', text: CS.logs.slice(-60).join('\n') }));
      CS.nav.push({ name: 'logs', el: box, defaultFocus: function () { return null; } });
    }
    draw();
    CS.subs.applyStyle(sample);
    sample.style.bottom = '';
    CS.nav.push({ name: 'settings', el: el, defaultFocus: function () { return list.querySelector('.f'); } });
    setBg(BG_DEFAULT, true);
  }

  CS.views = {
    login: login, home: home, detail: detail, streams: streams, search: search, library: library, settings: settings,
    home_: function () { return homeScreen; }
  };
})();
