/* «رياضة», the sports world (2026-11-15): the viewer's own sports channel, not a shelf of posters.
   The screen is a stage in the chosen favourite's colours (a club, a league, a national team or a player): the score of its match
   while it is on, else the time left to the next one, where it stands in the race, its last five, and its headlines running along
   the foot as on a sports channel. Below the stage, one after another: the season's path (results and fixtures on one line of
   time), the league as a race of points, the side on the pitch, the news desk, the scorers, and what can be watched now. Every
   name opens its own page (club, league, player, match). Data: crimson-hub's /sport/* (free public sources), kept on the device
   so the stage draws at once and freshens behind. Favourites are kept per profile (CS.settings.sportFavs). */
(function () {
  var h = CS.h;
  var KINDS = { team: 'نادي', league: 'دوري', nation: 'منتخب', player: 'لاعب' };
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var STILL = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the hub ---------- */
  function hub(path) { return CS.config.hubUrl + '/sport/' + path; }
  /* the kept copy at once when there is one (fresh() is called with a newer one when it comes), else the hub's answer */
  function ask(path, keepMs, fresh) {
    var key = 'sp:' + path, kept = CS.cache.get(key), age = CS.cache.age(key);
    if (!CS.config.hubUrl) return Promise.reject(new Error('no hub'));
    var asking = function () {
      return CS.fetchJson(hub(path), { timeout: 20000, cache: 'no-store' }).then(function (d) {
        if (!d || d.error) throw new Error((d && d.error) || 'empty');
        CS.cache.set(key, d);
        return d;
      });
    };
    if (kept && age < keepMs) return Promise.resolve(kept);
    if (kept) { asking().then(function (d) { if (fresh) fresh(d); }, function () { /* the kept one stays */ }); return Promise.resolve(kept); }
    return asking();
  }

  /* the hub's news can come back empty for a while (the news sources turn its addresses away after many asks): the device then asks
     Bing News itself, from home. The TV may read any address and Windows reads it through its own proxy (CS.netUrl); the phone keeps
     what the hub gave */
  function newsHere(q) {
    if (window.CS_ANDROID || !q || typeof DOMParser === 'undefined') return Promise.resolve([]);
    return CS.fetchText('https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&setlang=ar&cc=SA', { timeout: 9000, cache: 'no-store' }).then(function (x) {
      var doc = new DOMParser().parseFromString(x, 'text/xml'), since = Date.now() - 10 * 864e5;
      return Array.prototype.slice.call(doc.getElementsByTagName('item')).map(function (it) {
        var t = function (n) { var e = it.getElementsByTagName(n)[0]; return e ? e.textContent.trim() : ''; };
        var at = Date.parse(t('pubDate'));
        return { title: t('title'), source: t('News:Source').replace(/\s+on MSN$/i, ''), at: isNaN(at) ? '' : new Date(at).toISOString(), link: t('link'), image: t('News:Image'), desc: t('description').replace(/<[^>]+>/g, '').slice(0, 220) };
      }).filter(function (a) { return a.title && (!a.at || Date.parse(a.at) > since); }).slice(0, 14);
    }).catch(function () { return []; });
  }
  /* a world drawn with no news: they join it when the TV's own ask brings some (the ticker on the stage, the desk above the story) */
  function lateNews(page, stage, q, label) {
    newsHere(q).then(function (list) {
      if (!list.length || !stage.isConnected || page.querySelector('.sw-news')) return;
      var tk = ticker(list, label, function () { var n = page.querySelector('.sw-news .f'); if (n) CS.nav.focus(n); });
      if (tk) stage.appendChild(tk);
      var seg = segNews(list, label);
      if (!seg) return;
      page.insertBefore(seg, page.querySelector('.sw-about, .sw-watch'));
      var bar = stage.querySelector('.sw-segbar');
      if (bar) bar.appendChild(h('button.chip.f', { onclick: function () { var f = seg.querySelector('.f'); if (f) CS.nav.focus(f); } }, 'الأخبار'));
    });
  }
  function newsAsk(t, nation) {
    var n = nm(t);
    return nation ? 'منتخب ' + n : t && t.ar && /^ال/.test(t.ar) && t.ar.length <= 8 ? 'نادي ' + t.ar : n;
  }

  /* ---------- favourites, per profile ---------- */
  function favBox() {
    var all = CS.settings.sportFavs || (CS.settings.sportFavs = {});
    var who = CS.profiles && CS.profiles.current ? CS.profiles.current() : 'main';
    return all[who] || (all[who] = { list: [], cur: 0 });
  }
  function favs() { return favBox().list; }
  function keyOf(f) { return f.kind + ':' + f.code + ':' + f.id; }
  function isFav(kind, code, id) { return favs().some(function (f) { return f.kind === kind && f.code === code && String(f.id) === String(id); }); }
  function toggleFav(f) {
    var box = favBox(), at = box.list.map(keyOf).indexOf(keyOf(f));
    if (at >= 0) { box.list.splice(at, 1); if (box.cur >= box.list.length) box.cur = Math.max(0, box.list.length - 1); }
    else if (box.list.length >= 10) { CS.toast('عشر مفضلات بالكثير: شيل وحدة أول'); return false; }
    else box.list.push(f);
    CS.saveSettings();
    return at < 0;
  }
  function favOfTeam(t, code, nation) { return { kind: nation ? 'nation' : 'team', code: code, id: t.id, name: t.name, ar: t.ar || '', logo: t.logo || '', color: t.color || '', alt: t.alt || '' }; }

  /* ---------- words and colours ---------- */
  function nm(t) { return t ? (t.ar || t.name || '') : ''; }
  function clock(at) { return new Date(at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); }
  function day(at) {
    var d = new Date(at), now = new Date(), n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    if (n === 0) return 'اليوم';
    if (n === 1) return 'بكرة';
    if (n === -1) return 'أمس';
    if (n > 1 && n < 7) return DAYS[d.getDay()];
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function when(at) { return day(at) + ' · ' + clock(at); }
  function lum(hex) {
    var c = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!c) return 0.1;
    var n = parseInt(c[1], 16);
    var ch = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  /* the stage's colours from a team's: its own colour owns the band; one too dark to tell from the night gives way to its second;
     words on the band are black or white, whichever reads (4.5:1) */
  function paint(el, t) {
    var a = (t && t.color) || '', b = (t && t.alt) || '';
    if (!a || lum(a) < 0.012) { if (b && lum(b) > 0.012) { var x = a; a = b; b = x; } }
    if (!a || lum(a) < 0.012) a = '#ed0b18';
    if (!b || b.toLowerCase() === a.toLowerCase()) b = lum(a) > 0.5 ? '#111111' : '#ffffff';
    /* on the whole screen, so the sections under the stage take the same colours */
    var root = (el.closest && el.closest('.sw')) || el;
    root.style.setProperty('--club', a);
    root.style.setProperty('--club2', b);
    root.style.setProperty('--club-ink', lum(a) > 0.32 ? '#101010' : '#ffffff');
    root.style.setProperty('--club2-ink', lum(b) > 0.32 ? '#101010' : '#ffffff');
    /* the night under the stage takes the darker of the two (Al-Nassr's navy, not its yellow, which turns olive on black) */
    var dark = lum(b) < lum(a) && lum(b) > 0.004 ? b : a;
    root.style.setProperty('--club-tint', dark);
    /* and the lighter one marks «ours» on the night (a score, a name) */
    root.style.setProperty('--club-light', lum(a) >= lum(b) ? a : b);
  }
  /* the away side's colours, for a match: its own, unless it is the home side's (yellow against yellow): then its second */
  function near(x, y) {
    var p = /^#?([0-9a-f]{6})$/i.exec(x || ''), q = /^#?([0-9a-f]{6})$/i.exec(y || '');
    if (!p || !q) return false;
    var a = parseInt(p[1], 16), b = parseInt(q[1], 16);
    return Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)) < 90;
  }
  function paintAway(el, t) {
    var root = (el.closest && el.closest('.sw')) || el;
    var a = (t && t.color) || '', b = (t && t.alt) || '';
    if (!a || lum(a) < 0.012) { if (b && lum(b) > 0.012) { var x = a; a = b; b = x; } }
    if (!a || lum(a) < 0.012) a = '#8a8f98';
    if (!b || b.toLowerCase() === a.toLowerCase()) b = lum(a) > 0.5 ? '#111111' : '#ffffff';
    if (near(root.style.getPropertyValue('--club'), a)) { var y = a; a = b; b = y; }
    root.style.setProperty('--away', a);
    root.style.setProperty('--away2', b);
    root.style.setProperty('--away-ink', lum(a) > 0.32 ? '#101010' : '#ffffff');
  }
  function crest(t, cls) {
    var wrap = h('span.sw-crest' + (cls ? '.' + cls : ''));
    if (t && t.logo) {
      var img = h('img', { src: t.logo, alt: '', loading: 'lazy', decoding: 'async' });
      img.onerror = function () { img.remove(); wrap.textContent = (nm(t) || '?').replace(/^ال/, '').charAt(0); wrap.classList.add('sw-crest-text'); };
      wrap.appendChild(img);
    } else { wrap.textContent = (nm(t) || '?').replace(/^ال/, '').charAt(0); wrap.classList.add('sw-crest-text'); }
    return wrap;
  }
  /* a number of points the way it is said: نقطة واحدة، نقطتين، 3 نقاط، 11 نقطة */
  function points(n) { return n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتين' : n <= 10 ? n + ' نقاط' : n + ' نقطة'; }
  function resultWord(r) { return r === 'W' ? 'فوز' : r === 'D' ? 'تعادل' : r === 'L' ? 'خسارة' : ''; }
  function title(text, sub) { return h('div.sw-seg-head', null, [h('h2.sw-seg-title', { text: text }), sub ? h('span.sw-seg-sub', { text: sub }) : null]); }

  /* ---------- what can be watched: the live add-ons' matches (Sports Streams…), matched by the teams' names ---------- */
  var liveItems = null, liveItemsAt = 0;
  function streamsNow() {
    if (liveItems && Date.now() - liveItemsAt < 120e3) return Promise.resolve(liveItems);
    var cats = CS.addons.liveCatalogs().filter(function (c) { return c.cat.type !== 'tv'; }).slice(0, 4);
    return Promise.all(cats.map(function (c) { return CS.addons.catalog(c.addon, c.cat, {}).catch(function () { return []; }); })).then(function (lists) {
      var seen = {}; liveItems = [].concat.apply([], lists).filter(function (m) { return !seen[m.id] && (seen[m.id] = 1); });
      liveItemsAt = Date.now();
      return liveItems;
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(al|el|fc|sc|cf|afc|club|the|de)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function streamFor(m, items) {
    var a = norm(m && m.home && m.home.name), b = norm(m && m.away && m.away.name);
    if (!a || !b) return null;
    return (items || []).filter(function (it) { var n = ' ' + norm(it.name) + ' '; return n.indexOf(' ' + a + ' ') >= 0 && n.indexOf(' ' + b + ' ') >= 0; })[0] || null;
  }
  function watch(item) { CS.views.streams(item, { id: item.id, title: item.name }, {}); }

/* «.group» marks a row that runs sideways (nav.js: left and right stay in it, up and down go to the next one); a list that runs
   down (the race, the scorers, the side on the pitch, the picker's grid) is not one, so the arrows move in it by place */
  /* =============== the stage =============== */
  /* the score graphic: the match on now (its score and minute), else the next (the time left, counted down) */
  function bug(m, me, opts) {
    opts = opts || {};
    var box = h('div.sw-bug' + (m && m.state === 'in' ? '.on-air' : ''));
    if (!m) { box.appendChild(h('div.sw-bug-none', { text: opts.none || 'ما فيه مباراة قادمة معروفة الحين' })); return box; }
    var side = function (t, where) {
      return h('div.sw-bug-team.' + where + (me && t && t.id === me ? '.mine' : ''), null, [crest(t, 'big'), h('span.sw-bug-name', { text: nm(t) })]);
    };
    var mid = h('div.sw-bug-mid');
    if (m.state === 'in' || m.done) {
      mid.appendChild(h('div.sw-score', null, [h('span', { text: m.hs != null ? String(m.hs) : '-' }), h('i'), h('span', { text: m.as != null ? String(m.as) : '-' })]));
      mid.appendChild(h('div.sw-bug-state', null, m.state === 'in' ? [h('span.sw-live', { text: 'مباشر' }), h('span', { text: m.clock || m.detail || '' })] : [h('span', { text: 'انتهت · ' + day(m.at) })]));
    } else {
      var count = h('div.sw-count');
      mid.appendChild(count);
      mid.appendChild(h('div.sw-bug-state', null, [h('span', { text: when(m.at) })]));
      var tick = function () {
        var left = Math.max(0, Date.parse(m.at) - Date.now()), d = Math.floor(left / 864e5), hr = Math.floor(left % 864e5 / 36e5), mi = Math.floor(left % 36e5 / 6e4);
        count.innerHTML = '';
        [[d, 'يوم'], [hr, 'ساعة'], [mi, 'دقيقة']].forEach(function (x, i) {
          if (i === 0 && !d) return;
          count.appendChild(h('span.sw-count-part', null, [h('b', { text: String(x[0]).padStart(i ? 2 : 1, '0') }), h('small', { text: x[1] })]));
        });
      };
      tick();
      box._tick = tick;
    }
    box.appendChild(side(m.home, 'home'));
    box.appendChild(mid);
    box.appendChild(side(m.away, 'away'));
    box.appendChild(h('div.sw-bug-league', { text: [m.league, m.venue].filter(Boolean).join(' · ') }));
    return box;
  }
  function formStrip(form) {
    if (!form || !form.length) return null;
    return h('div.sw-form', null, [h('span.sw-mini-label', { text: 'آخر ' + form.length })].concat(form.map(function (f) {
      var m = f.m, mine = m.home && f.r ? (m.hs + '-' + m.as) : '';
      return h('span.sw-form-cell.' + (f.r || 'n'), { title: resultWord(f.r) }, [h('b', { text: resultWord(f.r).charAt(0) || '·' }), h('small', { text: mine })]);
    })));
  }
  /* where it stands: the rows around it, as a broadcast's standings graphic */
  function ladder(st, me, open) {
    if (!st || !st.around || !st.around.length) return null;
    var top = st.around[0].pts || 1;
    var rows = st.around.map(function (r) {
      var mine = r.team && r.team.id === me;
      var b = h('button.sw-ladder-row.f' + (mine ? '.mine' : ''), { onclick: function () { open(r.team); } }, [
        h('span.sw-ladder-pos', { text: String(r.pos) }), crest(r.team), h('span.sw-ladder-name', { text: nm(r.team) }),
        h('span.sw-ladder-bar', null, h('i', { style: { width: Math.max(8, Math.round((r.pts / top) * 100)) + '%' } })), h('span.sw-ladder-pts', { text: String(r.pts) })
      ]);
      return b;
    });
    var gap = st.gap > 0 ? 'يبعد ' + points(st.gap) + ' عن الصدارة' : st.pos === 1 ? 'في الصدارة' : 'متساوي مع المتصدر';
    return h('div.sw-ladder', null, [h('div.sw-mini-head', null, [h('span.sw-mini-label', { text: st.league || 'الترتيب' }), h('span.sw-ladder-gap', { text: gap })])].concat(rows));
  }
  function ticker(news, label, go) {
    if (!news || !news.length) return null;
    var line = function () { return h('span.sw-ticker-copy', null, news.slice(0, 10).map(function (n) { return h('span.sw-ticker-item', null, [h('i'), n.title]); })); };
    var run = h('span.sw-ticker-run', null, [line(), line()]);
    var seconds = Math.max(40, Math.round(news.slice(0, 10).reduce(function (s, n) { return s + n.title.length; }, 0) / 5));
    if (!STILL) run.style.animationDuration = seconds + 's';
    return h('button.sw-ticker.f', { onclick: go, 'aria-label': 'الأخبار' }, [h('span.sw-ticker-tag', { text: label }), h('span.sw-ticker-window', null, run)]);
  }

  /* =============== the sections under the stage =============== */
  /* the season's path: what is done on the right, what is to come on the left, now between them (the focus starts there) */
  function segPath(results, fixtures, me, openMatch) {
    var done = (results || []).slice(0, 8).reverse(), next = (fixtures || []).slice(0, 8);
    if (!done.length && !next.length) return null;
    var node = function (m) {
      var other = m.home && m.home.id === me ? m.away : m.home, home = m.home && m.home.id === me;
      var r = m.done ? (m.hs === m.as ? 'D' : ((m.hs > m.as) === home ? 'W' : 'L')) : '';
      return h('button.sw-node.f' + (m.done ? '.done.' + r : '.next') + (m.state === 'in' ? '.on-air' : ''), { onclick: function () { openMatch(m); } }, [
        h('span.sw-node-day', { text: m.done ? day(m.at) : when(m.at) }), crest(other),
        h('span.sw-node-vs', { text: (home ? 'ضد ' : 'عند ') + nm(other) }),
        m.done || m.state === 'in' ? h('span.sw-node-score', null, [h('b', { text: String(home ? m.hs : m.as) }), ' - ', h('span', { text: String(home ? m.as : m.hs) })])
          : h('span.sw-node-score', { text: m.league })
      ]);
    };
    var track = h('div.htrack', null, done.map(node).concat([h('div.sw-now', null, h('span', { text: 'الآن' }))]).concat(next.map(node)));
    var seg = h('section.sw-seg.sw-path', null, [title('المشوار', done.length + ' لعبها · ' + next.length + ' جاية'), h('div.row.group.sw-path-row', null, h('div.hscroll', { 'data-pad': '160' }, track))]);
    seg._start = function () { return track.querySelector('.sw-node.next') || track.querySelector('.sw-node:last-of-type'); };
    return seg;
  }
  /* the league as a race: each club a bar of its points, its rank and its name on it; the favourite in its own colour */
  function segRace(table, me, openTeam, name) {
    var g = table && table[0];
    if (!g || !g.rows || !g.rows.length) return null;
    var top = Math.max.apply(null, g.rows.map(function (r) { return r.pts || 0; })) || 1;
    var rows = g.rows.map(function (r) {
      var mine = r.team && r.team.id === me;
      return h('button.sw-race-row.f' + (mine ? '.mine' : ''), { onclick: function () { openTeam(r.team); } }, [
        h('span.sw-race-pos', { text: String(r.pos) }),
        h('span.sw-race-lane', null, h('span.sw-race-bar', { style: { width: Math.max(14, Math.round((r.pts / top) * 100)) + '%' } }, [crest(r.team), h('span.sw-race-name', { text: nm(r.team) })])),
        h('span.sw-race-pts', { text: String(r.pts) }),
        h('span.sw-race-rec', { text: r.w + ' ف · ' + r.d + ' ت · ' + r.l + ' خ' }),
        h('span.sw-race-gd', { text: (r.gd > 0 ? '+' : '') + r.gd })
      ]);
    });
    var tables = table.length > 1 ? ' · ' + table.length + ' مجموعات' : '';
    return h('section.sw-seg.sw-race', null, [title('السباق', (name || '') + tables)].concat(rows));
  }
  /* the side on the pitch: the last match's eleven in their places (our goal on the right, attacking left); else the squad by line */
  var ROWS = [/^G/, /^(LB|RB|LWB|RWB|CD|CB|SW|D)/, /^(DM|CDM)/, /^(LM|RM|CM|M\b|M$|M-)/, /^(AM|CAM|LW|RW)/, /^(F|CF|ST|LF|RF|S)/];
  function rowOf(pos) { for (var i = 0; i < ROWS.length; i++) if (ROWS[i].test(pos || '')) return i; return 3; }
  function sideOf(pos) { return /(^L|-L$|L$)/.test(pos || '') && !/^CL/.test(pos) ? 0 : /(^R|-R$|R$)/.test(pos || '') ? 2 : 1; }
  function linesOf(players, formation) {
    var keep = players.filter(function (p) { return /^G/.test(p.pos || ''); });
    var out = players.filter(function (p) { return !/^G/.test(p.pos || ''); }).sort(function (a, b) { return rowOf(a.pos) - rowOf(b.pos); });
    var counts = /^\d+(-\d+)+$/.test(formation || '') ? formation.split('-').map(Number) : null;
    if (keep.length === 1 && counts && counts.reduce(function (s, n) { return s + n; }, 0) === out.length) {
      var lines = [keep], at = 0;
      counts.forEach(function (n) { lines.push(out.slice(at, at + n)); at += n; });
      return lines;
    }
    var by = [];
    players.forEach(function (p) { var r = rowOf(p.pos); (by[r] = by[r] || []).push(p); });
    return by.filter(Boolean);
  }
  function pitch(players, openPlayer, cls, formation) {
    var lines = linesOf(players, formation);
    var field = h('div.sw-pitch' + (cls ? '.' + cls : ''), null, [h('i.sw-pitch-half'), h('i.sw-pitch-circle'), h('i.sw-pitch-box.right'), h('i.sw-pitch-box.left')]);
    lines.forEach(function (line, li) {
      line.sort(function (a, b) { return sideOf(b.pos) - sideOf(a.pos); }); /* right-footed side on top, as a team attacking left sees it */
      line.forEach(function (p, pi) {
        var x = lines.length === 1 ? 50 : 92 - li * (84 / (lines.length - 1)), y = (pi + 1) * (100 / (line.length + 1));
        field.appendChild(h('button.sw-player.f', { style: { right: (100 - x) + '%', top: y + '%' }, onclick: function () { if (p.id) openPlayer(p); } }, [
          h('span.sw-player-num', { text: p.num || '·' }), h('span.sw-player-name', { text: p.name })
        ]));
      });
    });
    return field;
  }
  function segSide(lineup, squad, openPlayer, note) {
    var seg = h('section.sw-seg.sw-side', null, [title('التشكيلة', note || '')]);
    if (lineup && lineup.start && lineup.start.length >= 7) { seg.appendChild(pitch(lineup.start, openPlayer, null, lineup.formation)); return seg; }
    if (!squad || !squad.length) return null;
    var by = {};
    squad.forEach(function (p) { (by[p.line || 'أخرى'] = by[p.line || 'أخرى'] || []).push(p); });
    var cols = h('div.sw-squad');
    ['حارس', 'دفاع', 'وسط', 'هجوم'].concat(Object.keys(by).filter(function (k) { return ['حارس', 'دفاع', 'وسط', 'هجوم'].indexOf(k) < 0; })).forEach(function (k) {
      if (!by[k]) return;
      cols.appendChild(h('div.sw-squad-col', null, [h('h3', { text: k })].concat(by[k].map(function (p) {
        return h('button.sw-squad-man.f', { onclick: function () { openPlayer(p); } }, [h('b', { text: p.num || '·' }), h('span', { text: p.name })]);
      }))));
    });
    seg.appendChild(cols);
    return seg;
  }
  /* the news desk: the lead story large with its picture, the rest as a column of headlines; OK reads one */
  function segNews(news, label) {
    if (!news || !news.length) return null;
    var lead = news[0], rest = news.slice(1, 9);
    var story = function (n, big) {
      return h('button.sw-story.f' + (big ? '.lead' : ''), { onclick: function () { read(n); } }, [
        big && n.image ? h('span.sw-story-pic', null, h('img', { src: n.image, alt: '', loading: 'lazy' })) : null,
        h('span.sw-story-words', null, [h('span.sw-story-title', { text: n.title }), h('span.sw-story-meta', { text: [n.source, n.at ? day(n.at) + ' ' + clock(n.at) : ''].filter(Boolean).join(' · ') }),
          big && n.desc ? h('span.sw-story-desc', { text: n.desc }) : null])
      ]);
    };
    /* the lead story a row of its own, the rest two by two under it: down always goes down */
    var seg = h('section.sw-seg.sw-news', null, [title('الأخبار', label || ''), h('div.sw-news-desk', null, [story(lead, true), h('div.sw-news-list', null, rest.map(function (n) { return story(n, false); }))])]);
    return seg;
  }
  function read(n) {
    var box = h('div.sw-read', null, [
      n.image ? h('img.sw-read-pic', { src: n.image, alt: '' }) : null,
      h('div.sw-read-words', null, [h('h2', { text: n.title }), h('p.sw-read-meta', { text: [n.source, n.at ? when(n.at) : ''].filter(Boolean).join(' · ') }),
        h('p.sw-read-desc', { text: n.desc || 'ما وصلنا من الخبر غير عنوانه. الخبر كامل في موقع ' + (n.source || 'المصدر') + '.' }),
        h('button.btn.f.primary', { onclick: function () { CS.nav.pop(); } }, CS.iconKids('back', 'رجوع'))])
    ]);
    var el = h('section.screen.sw-reader', null, box);
    CS.nav.push({ name: 'sw-read', el: el, modal: true, defaultFocus: function () { return el.querySelector('.f'); } });
  }
  function segScorers(goals, assists, openPlayer) {
    if (!goals || !goals.length) return null;
    var top = goals[0].value || 1;
    var col = function (list, word) {
      return h('div.sw-score-col', null, [h('h3', { text: word })].concat(list.slice(0, 6).map(function (p, i) {
        return h('button.sw-scorer.f', { onclick: function () { openPlayer(p); } }, [
          h('span.sw-scorer-rank', { text: String(i + 1) }), crest(p.team), h('span.sw-scorer-name', { text: p.name }),
          h('span.sw-scorer-bar', null, h('i', { style: { width: Math.round(p.value / (list[0].value || top) * 100) + '%' } })), h('span.sw-scorer-n', { text: String(p.value) })
        ]);
      })));
    };
    return h('section.sw-seg.sw-scorers', null, [title('الهدّافون'), h('div.sw-score-cols', null, [col(goals, 'أهداف'), assists && assists.length ? col(assists, 'صناعة') : null])]);
  }
  function segAbout(about) {
    if (!about || !about.text) return null;
    return h('section.sw-seg.sw-about', null, [title('الحكاية'), h('div.sw-about-box', null, [about.image ? h('img', { src: about.image, alt: '', loading: 'lazy' }) : null,
      h('p', { text: about.text }), h('span.sw-about-src', { text: 'من ويكيبيديا' })])]);
  }
  /* what can be watched now: the favourite's matches that have a stream, then the live add-ons' whole section */
  function segWatch(matches) {
    var seg = h('section.sw-seg.sw-watch.group', null, [title('شاهد')]);
    var row = h('div.sw-watch-row');
    seg.appendChild(row);
    row.appendChild(h('button.sw-watch-all.f', { onclick: function () { CS.views.browse('sport'); } }, [h('span.sw-watch-ico', { html: CS.icon('play') }), h('span', { text: 'كل البث المباشر' })]));
    streamsNow().then(function (items) {
      (matches || []).forEach(function (m) {
        var it = streamFor(m, items);
        if (!it || !row.isConnected) return;
        row.insertBefore(h('button.sw-watch-one.f', { onclick: function () { watch(it); } }, [crest(m.home), h('span', { text: nm(m.home) + ' × ' + nm(m.away) }), crest(m.away), h('span.sw-live', { text: m.state === 'in' ? 'مباشر' : day(m.at) })]), row.lastChild);
      });
    }, function () { /* no live add-on answered */ });
    return seg;
  }
  /* the bar of sections at the stage's foot: one press goes down to that section */
  function segBar(page) {
    var bar = h('div.sw-segbar.group');
    page.querySelectorAll('.sw-seg').forEach(function (s) {
      var t = s.querySelector('.sw-seg-title');
      if (!t) return;
      bar.appendChild(h('button.chip.f', { onclick: function () { var f = s._start ? s._start() : s.querySelector('.f'); if (f) CS.nav.focus(f); } }, t.textContent));
    });
    return bar;
  }

  /* =============== one world: a club, a national team, a league or a player =============== */
  function openTeam(t, code) {
    if (!t || !t.id) return;
    teamPage(code, t.id);
  }
  function openMatch(m) { if (m && m.id) matchPage(m.code || '', m.id, m); }
  function openPlayer(p, code) { if (p && p.id) playerPage(code, p.id); }

  /* draws a team's world into page; me: its id. Gives back what the stage polls */
  function drawTeam(page, stage, d, code, opts) {
    var me = d.team.id;
    paint(stage, d.team);
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band'));
    stage.appendChild(h('div.sw-mark', null, crest(d.team, 'mark')));
    if (opts.rail) stage.appendChild(opts.rail);
    var line = [d.league || (d.nation ? 'منتخب' : ''), d.standing ? 'المركز ' + d.standing.pos + ' من ' + d.standing.of : '', d.standing ? d.standing.pts + ' نقطة' : ''].filter(Boolean);
    stage.appendChild(h('div.sw-id', null, [h('h1.sw-name', { text: nm(d.team) }), h('div.sw-id-line', { text: line.join('   ') }), opts.favBtn || null]));
    var now = d.live || d.next;
    var b = bug(now, me);
    var act = h('div.sw-bug-acts.group');
    if (now) act.appendChild(h('button.btn.f.primary', { onclick: function () { openMatch(now); } }, CS.iconKids('list', now.state === 'in' ? 'المباراة' : 'تفاصيل المباراة')));
    b.appendChild(act);
    stage.appendChild(b);
    stage._bug = b;
    streamsNow().then(function (items) {
      var it = now && streamFor(now, items);
      if (it && act.isConnected) act.insertBefore(h('button.btn.f.watch', { onclick: function () { watch(it); } }, CS.iconKids('play', now.state === 'in' ? 'شاهد الحين' : 'البث')), act.firstChild);
    }, function () { });
    var side = h('div.sw-side-col');
    var lad = ladder(d.standing, me, function (t) { openTeam(t, code); });
    if (lad) side.appendChild(lad);
    var fs = formStrip(d.form);
    if (fs) side.appendChild(fs);
    stage.appendChild(side);
    var tk = ticker(d.news, nm(d.team), function () { var n = page.querySelector('.sw-news .f'); if (n) CS.nav.focus(n); });
    if (tk) stage.appendChild(tk);

    var segs = [];
    segs.push(segPath(d.results, d.fixtures, me, openMatch));
    if (d.standing) {
      var race = h('section.sw-seg.sw-race.wait', null, [title('السباق', d.standing.league)]);
      segs.push(race);
      ask('league/' + code, 5 * 60e3).then(function (L) { var r = segRace(L.table, me, function (t) { openTeam(t, code); }, L.name); if (r && race.isConnected) race.replaceWith(r); else race.remove(); }, function () { race.remove(); });
    }
    var side2 = segSide(null, d.squad, function (p) { openPlayer(p, code); }, d.squad && d.squad.length ? d.squad.length + ' لاعب' : '');
    if (side2) segs.push(side2);
    /* the eleven of the last match, when it is known, take the squad's place */
    var last = d.results && d.results[0];
    if (last && side2) ask('match/' + (last.code || code) + '/' + last.id, 6 * 3600e3).then(function (M) {
      var mine = (M.lineups || []).filter(function (l) { return (l.side === 'home' ? M.match.home : M.match.away).id === me; })[0];
      if (!mine || !side2.isConnected) return;
      var fresh = segSide(mine, null, function (p) { openPlayer(p, code); }, 'آخر تشكيلة: ' + (mine.formation || '') + ' ضد ' + nm(M.match.home.id === me ? M.match.away : M.match.home));
      if (fresh) side2.replaceWith(fresh);
    }, function () { });
    segs.push(segNews(d.news, nm(d.team)));
    segs.push(segAbout(d.about));
    segs.push(segWatch([].concat(d.live ? [d.live] : [], (d.fixtures || []).slice(0, 3))));
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(segBar(page));
    if (!(d.news && d.news.length)) lateNews(page, stage, newsAsk(d.team, d.nation), nm(d.team));
    return { tick: function () { if (b._tick) b._tick(); }, live: { code: code, id: me } };
  }

  function drawLeague(page, stage, L, opts) {
    paint(stage, { color: '#ed0b18', alt: '#ffffff' });
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band'));
    stage.appendChild(h('div.sw-mark', null, crest({ logo: L.logo, name: L.name }, 'mark')));
    if (opts.rail) stage.appendChild(opts.rail);
    var leader = L.table && L.table[0] && L.table[0].rows[0];
    stage.appendChild(h('div.sw-id', null, [h('h1.sw-name', { text: L.name }), h('div.sw-id-line', { text: [leader ? 'المتصدر: ' + nm(leader.team) + ' ' + leader.pts + ' نقطة' : '', L.scorers && L.scorers[0] ? 'الهداف: ' + L.scorers[0].name + ' (' + L.scorers[0].value + ')' : ''].filter(Boolean).join('   ') }), opts.favBtn || null]));
    var now = (L.live && L.live[0]) || (L.fixtures && L.fixtures[0]) || null;
    var b = bug(now, '');
    var act = h('div.sw-bug-acts.group');
    if (now) act.appendChild(h('button.btn.f.primary', { onclick: function () { openMatch(now); } }, CS.iconKids('list', now.state === 'in' ? 'المباراة' : 'تفاصيل المباراة')));
    b.appendChild(act);
    stage.appendChild(b);
    var side = h('div.sw-side-col');
    if (L.table && L.table[0]) {
      var st = { league: 'القمة', around: L.table[0].rows.slice(0, 5), pos: 1, gap: 0 };
      var lad = ladder(st, '', function (t) { openTeam(t, L.code); });
      if (lad) {
        var diff = L.table[0].rows[0].pts - ((L.table[0].rows[1] || {}).pts || 0);
        lad.querySelector('.sw-ladder-gap').textContent = diff > 0 ? 'الأول يسبق الثاني بـ' + points(diff) : 'الأول والثاني متساويين';
        side.appendChild(lad);
      }
    }
    stage.appendChild(side);
    var tk = ticker(L.news, L.name, function () { var n = page.querySelector('.sw-news .f'); if (n) CS.nav.focus(n); });
    if (tk) stage.appendChild(tk);
    /* the round: matches on now, then the next ones, then the last results, as one line of time */
    var segs = [];
    var round = h('section.sw-seg.sw-round', null, [title('الجولة', (L.live && L.live.length ? L.live.length + ' مباشر الحين · ' : '') + (L.fixtures || []).length + ' جاية')]);
    var track = h('div.htrack', null, [].concat((L.results || []).slice(0, 6).reverse(), L.live || [], (L.fixtures || []).slice(0, 10)).map(function (m) {
      return h('button.sw-fix.f' + (m.state === 'in' ? '.on-air' : m.done ? '.done' : ''), { onclick: function () { openMatch(m); } }, [
        h('span.sw-fix-when', { text: m.state === 'in' ? 'مباشر ' + (m.clock || '') : m.done ? 'انتهت · ' + day(m.at) : when(m.at) }),
        h('span.sw-fix-side', null, [crest(m.home), h('span', { text: nm(m.home) }), h('b', { text: m.hs != null ? String(m.hs) : '' })]),
        h('span.sw-fix-side', null, [crest(m.away), h('span', { text: nm(m.away) }), h('b', { text: m.as != null ? String(m.as) : '' })])
      ]);
    }));
    round.appendChild(h('div.row.group', null, h('div.hscroll', { 'data-pad': '120' }, track)));
    round._start = function () { return track.querySelector('.on-air') || track.querySelector('.sw-fix:not(.done)') || track.querySelector('.sw-fix'); };
    segs.push(round);
    segs.push(segRace(L.table, '', function (t) { openTeam(t, L.code); }, L.name));
    segs.push(segScorers(L.scorers, L.assists, function (p) { openPlayer(p, L.code); }));
    segs.push(segNews(L.news, L.name));
    segs.push(segWatch([].concat(L.live || [], (L.fixtures || []).slice(0, 4))));
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(segBar(page));
    if (!(L.news && L.news.length)) lateNews(page, stage, L.name, L.name);
    return { tick: function () { if (b._tick) b._tick(); }, live: null };
  }

  function drawPlayer(page, stage, P, club, opts) {
    paint(stage, P.team || {});
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band'));
    stage.appendChild(h('div.sw-mark.player', null, P.photo ? h('img.sw-photo', { src: P.photo, alt: '' }) : h('span.sw-big-num', { text: P.num || '' })));
    if (opts.rail) stage.appendChild(opts.rail);
    stage.appendChild(h('div.sw-id', null, [h('h1.sw-name', { text: P.name }), h('div.sw-id-line', { text: [P.team ? nm(P.team) : '', P.line || P.pos, P.num ? 'رقم ' + P.num : '', P.age ? P.age + ' سنة' : '', P.country].filter(Boolean).join('   ') }), opts.favBtn || null]));
    /* this season in numbers: the league first, then the other competitions */
    var main = (P.splits || []).filter(function (s) { return /pro league|premier|liga|serie|bundesliga|ligue/i.test(s.name); })[0] || (P.splits || [])[0];
    var nums = h('div.sw-numbers');
    if (main) {
      ['G', 'A', 'STRT', 'SOG', 'YC'].forEach(function (k) {
        var v = main.values.filter(function (x) { return x.key === k; })[0];
        if (v) nums.appendChild(h('div.sw-number', null, [h('b', { text: String(v.value) }), h('small', { text: v.ar })]));
      });
      nums.appendChild(h('div.sw-numbers-note', { text: main.name }));
    }
    var b = h('div.sw-bug.sw-bug-numbers', null, nums);
    stage.appendChild(b);
    var tk = ticker(P.news, P.name, function () { var n = page.querySelector('.sw-news .f'); if (n) CS.nav.focus(n); });
    if (tk) stage.appendChild(tk);
    var segs = [];
    if ((P.splits || []).length > 1) {
      var comp = h('section.sw-seg.sw-splits', null, [title('في كل بطولة')]);
      P.splits.forEach(function (s) {
        var pick = function (k) { var v = s.values.filter(function (x) { return x.key === k; })[0]; return v ? v.value : '-'; };
        comp.appendChild(h('button.sw-split.f', null, [h('span.sw-split-name', { text: s.name }), h('span', { text: pick('STRT') + ' أساسي' }), h('span', { text: pick('G') + ' أهداف' }), h('span', { text: pick('A') + ' صناعة' })]));
      });
      segs.push(comp);
    }
    if (club) segs.push(segPath(club.results, club.fixtures, club.team.id, openMatch));
    segs.push(segNews(P.news, P.name));
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(segBar(page));
    if (!(P.news && P.news.length)) lateNews(page, stage, P.name, P.name);
    return { tick: function () { }, live: null };
  }

  /* =============== the screen that holds a world =============== */
  function worldScreen(opts) {
    var el = h('section.screen.sw' + (opts.home ? '.sw-home' : ''));
    var stage = h('div.sw-stage');
    var page = h('div.vtrack', null, [stage]);
    var box = h('div.rows.vscroll.sw-scroll', { 'data-pad': '120' }, page);
    el.appendChild(CS.views.topbar(opts.home ? 'sport' : null));
    el.appendChild(box);
    var timers = [], polled = null;
    var screen = {
      name: opts.home ? 'sportworld' : 'sportpage', el: el, tab: opts.home ? 0.75 : undefined,
      defaultFocus: function () { return el.querySelector('.sw-bug-acts .f') || el.querySelector('.sw-rail .on') || el.querySelector('.f'); },
      destroy: function () { timers.forEach(clearInterval); },
      shown: function () { if (opts.home && screen._redraw) screen._redraw(); }
    };
    if (window.CS_ANDROID) el.appendChild(h('button.m-back', { 'aria-label': 'رجوع', html: CS.icon('back'), onclick: function () { CS.nav.pop(); } }));
    CS.nav.push(screen);
    if (CS.setBg) CS.setBg('', true);
    /* the stage's clock (the countdown) each 20 s; the favourite's live score each minute while this screen is on top */
    timers.push(setInterval(function () { if (polled && polled.tick) polled.tick(); }, 20000));
    timers.push(setInterval(function () {
      if (!polled || !polled.live || CS.nav.top() !== screen) return;
      CS.fetchJson(hub('live?t=' + polled.live.code + ':' + polled.live.id), { timeout: 12000, cache: 'no-store' }).then(function (r) {
        var m = (r.matches || [])[0], b = stage._bug;
        if (!m || !b || !b.isConnected) return;
        if (m.state === 'in' || (b.classList.contains('on-air') && m.done)) screen._redraw && screen._redraw(true);
      }, function () { });
    }, 60000));
    return { el: el, stage: stage, page: page, screen: screen, set: function (p) { polled = p; } };
  }
  function clear(page, stage) { Array.prototype.slice.call(page.children).forEach(function (c) { if (c !== stage) c.remove(); }); }
  function loading(stage) {
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band'));
    stage.appendChild(h('div.sw-id', null, CS.skel.lines([40, 60])));
    stage.appendChild(h('div.sw-bug.skel', null, CS.skel.lines([80, 50])));
  }
  function failed(stage, again) {
    stage.innerHTML = '';
    stage.appendChild(CS.errorState({ title: 'ما قدرنا نجيب عالمك الرياضي', reason: 'خدمة الرياضة ما ردّت. تأكد من الإنترنت وجرّب مرة ثانية.', retry: again }));
    CS.nav.refocus();
  }

  /* a favourite's face: its crest, or for a player his shirt number in his club's colours (his club's crest is the club's) */
  function favFace(f) {
    return f.kind === 'player' ? h('span.sw-rail-num', { text: f.num || (f.name || '?').charAt(0), style: { background: f.color || '#ed0b18', color: lum(f.color) > 0.32 ? '#101010' : '#fff', borderColor: f.alt || '#fff' } })
      : crest({ logo: f.logo, name: f.ar || f.name });
  }
  /* the favourites as a rail of crests at the stage's top left: OK switches world, the last one adds */
  function rail(cur, pick) {
    var list = favs();
    return h('div.sw-rail.group', null, list.map(function (f, i) {
      var face = favFace(f);
      var b = h('button.sw-rail-fav.f' + (i === cur ? '.on' : ''), { onclick: function () { pick(i); }, 'aria-label': (f.ar || f.name) + ' · ' + (KINDS[f.kind] || '') }, [
        face, h('span.sw-rail-name', { text: f.ar || f.name })
      ]);
      b.style.setProperty('--fav', f.color || '#ed0b18');
      return b;
    }).concat([h('button.sw-rail-add.f', { onclick: function () { pickFavs(); }, 'aria-label': 'المفضلات' }, [h('span.ico-wrap', { html: CS.icon('plus') }), h('span.sw-rail-name', { text: 'مفضلاتي' })])]));
  }
  /* «تابعه» on a page: the world joins (or leaves) the favourites */
  function favButton(f) {
    var on = isFav(f.kind, f.code, f.id);
    var b = h('button.btn.f.sw-fav-btn' + (on ? '.on' : ''), null, CS.iconKids(on ? 'check' : 'heart', on ? 'من مفضلاتك' : 'أضفه لمفضلاتك'));
    b.onclick = function () { var now = toggleFav(f); CS.setIcon(b, now ? 'check' : 'heart', now ? 'من مفضلاتك' : 'أضفه لمفضلاتك'); b.classList.toggle('on', now); CS.toast(now ? 'انضاف لمفضلاتك' : 'انشال من مفضلاتك'); };
    return b;
  }

  /* draws a favourite (or any entity) into a world screen */
  /* a favourite kept before its logo or number was known (or from an older list) takes them from its own world */
  function fillFav(f, o) {
    var changed = false;
    Object.keys(o).forEach(function (k) { if (o[k] && !f[k]) { f[k] = o[k]; changed = true; } });
    if (changed) CS.saveSettings();
  }
  function drawEntity(w, f, opts, again) {
    var done = function (p) { w.set(p); CS.nav.refocus(); };
    var fail = function () { failed(w.stage, again); };
    if (f.kind === 'team' || f.kind === 'nation') {
      return ask('team/' + f.code + '/' + f.id, 3 * 60e3, again && function () { again(true); }).then(function (d) {
        if (opts.alive && !opts.alive()) return;
        fillFav(f, { logo: d.team.logo, color: d.team.color, alt: d.team.alt, ar: d.team.ar });
        clear(w.page, w.stage); done(drawTeam(w.page, w.stage, d, f.code, opts));
      }, fail);
    }
    if (f.kind === 'league') {
      return ask('league/' + f.code, 3 * 60e3, again && function () { again(true); }).then(function (L) {
        if (opts.alive && !opts.alive()) return;
        fillFav(f, { logo: L.logo });
        clear(w.page, w.stage); done(drawLeague(w.page, w.stage, L, opts));
      }, fail);
    }
    if (f.kind === 'player') {
      return ask('player/' + f.code + '/' + f.id, 30 * 60e3).then(function (P) {
        fillFav(f, { num: P.num, color: P.team && P.team.color, alt: P.team && P.team.alt });
        var club = P.team && P.team.id ? ask('team/' + (f.teamCode || f.code) + '/' + P.team.id, 3 * 60e3).catch(function () { return null; }) : Promise.resolve(null);
        return club.then(function (c) { if (opts.alive && !opts.alive()) return; clear(w.page, w.stage); done(drawPlayer(w.page, w.stage, P, c, opts)); });
      }, fail);
    }
    return Promise.resolve();
  }

  /* =============== the section itself («رياضة») =============== */
  function sportWorld() {
    if (!CS.config.hubUrl) { CS.views.browse('sport'); return; }
    var w = worldScreen({ home: true });
    var drawn = '', token = 0;
    /* each drawing has its number: an answer for an earlier favourite, arriving late after quick presses, is dropped */
    function draw(quiet, keepRail) {
      var mine = ++token;
      var box = favBox(), list = box.list;
      if (!list.length) { welcome(w); return; }
      if (box.cur >= list.length) box.cur = 0;
      var f = list[box.cur];
      drawn = keyOf(f) + '|' + list.map(keyOf).join(',');
      if (!quiet) loading(w.stage);
      var r = rail(box.cur, function (i) {
        if (i === favBox().cur) return;
        favBox().cur = i; CS.saveSettings();
        sweep(w.el, list[i].color, function () { draw(false, true); });
      });
      drawEntity(w, f, { rail: r, alive: function () { return mine === token; } }, draw).then(function () {
        if (mine !== token) return;
        var on = w.stage.querySelector('.sw-rail .on');
        /* after a change of favourite the focus stays on the rail, where the next press may go on along it */
        if (keepRail && on) { CS.nav.focus(on, 'instant'); return; }
        if (!quiet && on && (!CS.nav.current() || !w.el.contains(CS.nav.current()) || CS.nav.current().classList.contains('tab'))) CS.nav.focus(w.screen.defaultFocus() || on, 'instant');
      });
    }
    /* coming back from the picker (or after a change of favourites elsewhere): drawn again only when they changed */
    w.screen._redraw = function (force) {
      var box = favBox(), list = box.list, f = list[box.cur];
      var now = f ? keyOf(f) + '|' + list.map(keyOf).join(',') : '';
      if (force || now !== drawn) draw(!!force);
    };
    draw();
  }
  /* the channel change: the new favourite's colour sweeps across the screen (over the stage, which is drawn again under it), and the
     new world is put in at the moment it covers all of it (half way, 190 ms of 380) */
  function sweep(screenEl, color, then) {
    if (STILL) { then(); return; }
    var s = h('i.sw-sweep', { style: { background: color || '#ed0b18' } });
    screenEl.appendChild(s);
    void s.offsetWidth; /* its start is laid out before it moves, or a slow TV jumps to its end */
    s.classList.add('go');
    setTimeout(then, 190);
    setTimeout(function () { s.remove(); }, 420);
  }
  function welcome(w) {
    paint(w.stage, { color: '#ed0b18', alt: '#ffffff' });
    clear(w.page, w.stage);
    w.stage.innerHTML = '';
    w.stage.appendChild(h('i.sw-band'));
    w.stage.appendChild(h('div.sw-welcome', null, [
      h('h1.sw-name', { text: 'عالمك الرياضي' }),
      h('p', { text: 'اختر ناديك ودوريك ومنتخبك ولاعبك المفضل، ويصير هذا القسم قناتك: نتيجة مباراتهم وقت ما تلعب، والوقت الباقي على اللي بعدها، ومركزهم، وأخبارهم بالعربي، والتشكيلة، وكل شي عنهم.' }),
      h('button.btn.f.primary', { onclick: pickFavs }, CS.iconKids('heart', 'اختر مفضلاتك'))
    ]));
    /* the leagues' world meanwhile: the Saudi league, to start from */
    ask('league/ksa.1', 5 * 60e3).then(function (L) {
      var r = segRace(L.table, '', function (t) { openTeam(t, 'ksa.1'); }, L.name);
      if (r) w.page.appendChild(r);
      var n = segNews(L.news, L.name);
      if (n) w.page.appendChild(n);
      w.page.appendChild(segWatch(L.live || []));
    }, function () { });
    CS.nav.focus(w.stage.querySelector('.f'), 'instant');
  }

  /* =============== pages: a club, a league, a player, a match =============== */
  function teamPage(code, id) {
    var w = worldScreen({});
    var nation = code === 'fifa.friendly';
    loading(w.stage);
    var go = function () {
      ask('team/' + code + '/' + id, 3 * 60e3).then(function (d) {
        clear(w.page, w.stage);
        w.set(drawTeam(w.page, w.stage, d, code, { favBtn: favButton(favOfTeam(d.team, code, nation)) }));
        CS.nav.focus(w.screen.defaultFocus(), 'instant');
      }, function () { failed(w.stage, go); });
    };
    go();
  }
  function leaguePage(code) {
    var w = worldScreen({});
    loading(w.stage);
    var go = function () {
      ask('league/' + code, 3 * 60e3).then(function (L) {
        clear(w.page, w.stage);
        w.set(drawLeague(w.page, w.stage, L, { favBtn: favButton({ kind: 'league', code: code, id: code, name: L.en || L.name, ar: L.name, logo: L.logo, color: '#ed0b18', alt: '#ffffff' }) }));
        CS.nav.focus(w.screen.defaultFocus(), 'instant');
      }, function () { failed(w.stage, go); });
    };
    go();
  }
  function playerPage(code, id) {
    var w = worldScreen({});
    loading(w.stage);
    var go = function () {
      ask('player/' + code + '/' + id, 30 * 60e3).then(function (P) {
        var club = P.team && P.team.id ? ask('team/' + code + '/' + P.team.id, 3 * 60e3).catch(function () { return null; }) : Promise.resolve(null);
        club.then(function (c) {
          clear(w.page, w.stage);
          var f = { kind: 'player', code: code, teamCode: code, id: P.id, name: P.name, ar: '', num: P.num || '', logo: P.photo || '', color: P.team && P.team.color, alt: P.team && P.team.alt };
          w.set(drawPlayer(w.page, w.stage, P, c, { favBtn: favButton(f) }));
          CS.nav.focus(w.screen.defaultFocus(), 'instant');
        });
      }, function () { failed(w.stage, go); });
    };
    go();
  }
  /* the match centre: the score graphic, the minute of each goal and card on a line of 90, both elevens on one pitch, the numbers */
  function matchPage(code, id, seed) {
    var el = h('section.screen.sw.sw-match');
    var stage = h('div.sw-stage');
    var page = h('div.vtrack', null, [stage]);
    el.appendChild(CS.views.topbar(null));
    el.appendChild(h('div.rows.vscroll.sw-scroll', { 'data-pad': '120' }, page));
    if (window.CS_ANDROID) el.appendChild(h('button.m-back', { 'aria-label': 'رجوع', html: CS.icon('back'), onclick: function () { CS.nav.pop(); } }));
    var timer = 0;
    var screen = { name: 'sw-match', el: el, defaultFocus: function () { return el.querySelector('.sw-bug-acts .f') || el.querySelector('.f'); }, destroy: function () { clearInterval(timer); } };
    CS.nav.push(screen);
    if (seed) { paint(stage, seed.home); stage.appendChild(h('i.sw-band')); stage.appendChild(bug(seed, '')); } else loading(stage);
    var draw = function (first) {
      return ask('match/' + code + '/' + id, 25e3).then(function (M) {
        var m = M.match;
        paint(stage, m.home);
        paintAway(stage, m.away);
        stage.innerHTML = '';
        Array.prototype.slice.call(page.children).forEach(function (c) { if (c !== stage) c.remove(); });
        /* a match is two sides: the home side's colours on the right, the away side's on the left */
        stage.appendChild(h('i.sw-band'));
        stage.appendChild(h('i.sw-band.away'));
        var b = bug(m, '');
        var act = h('div.sw-bug-acts.group');
        act.appendChild(h('button.btn.f', { onclick: function () { openTeam(m.home, code); } }, nm(m.home)));
        act.appendChild(h('button.btn.f', { onclick: function () { openTeam(m.away, code); } }, nm(m.away)));
        b.appendChild(act);
        stage.appendChild(b);
        streamsNow().then(function (items) {
          var it = streamFor(m, items);
          if (it && act.isConnected) act.insertBefore(h('button.btn.f.watch', { onclick: function () { watch(it); } }, CS.iconKids('play', m.state === 'in' ? 'شاهد الحين' : 'البث')), act.firstChild);
        }, function () { });
        /* each goal and card at its minute, home above the line and away under it */
        if ((M.events || []).length) {
          var line = h('div.sw-events', null, [h('i.sw-events-line'), h('span.sw-events-ht', { text: 'الشوط الثاني' })]);
          /* two of a side within eight minutes: the later one's name stands a step further out, so neither covers the other */
          var lastAt = { home: -99, away: -99 }, step = { home: 0, away: 0 };
          M.events.filter(function (e) { return e.type !== 'sub'; }).forEach(function (e) {
            var min = Math.min(95, parseInt(e.min, 10) || 0), side = e.side || 'home';
            step[side] = min - lastAt[side] < 8 ? (step[side] + 1) % 3 : 0;
            lastAt[side] = min;
            var mark = h('span.sw-event.' + e.type + '.' + side, { style: { right: (min / 95 * 100) + '%' }, title: e.min + ' ' + e.who }, [h('i'), h('small', { text: e.min + ' ' + (e.who || '').split(' ').slice(-1)[0] })]);
            if (step[side]) mark.style[side === 'home' ? 'paddingBottom' : 'paddingTop'] = (12 + step[side] * 34) + 'px';
            line.appendChild(mark);
          });
          stage.appendChild(line);
        }
        if ((M.stats || []).length) {
          var seg = h('section.sw-seg.sw-stats', null, [title('الأرقام')]);
          M.stats.forEach(function (s) {
            var a = parseFloat(s.home) || 0, c = parseFloat(s.away) || 0, sum = a + c || 1;
            seg.appendChild(h('div.sw-stat', null, [h('b', { text: s.home }), h('span.sw-stat-bars', null, [h('i.home', { style: { width: Math.round(a / sum * 100) + '%' } }), h('i.away', { style: { width: Math.round(c / sum * 100) + '%' } })]), h('b', { text: s.away }), h('span.sw-stat-name', { text: s.ar })]));
          });
          page.appendChild(seg);
        }
        (M.lineups || []).forEach(function (l) {
          if (!l.start || !l.start.length) return;
          var t = l.side === 'home' ? m.home : m.away;
          var seg = h('section.sw-seg.sw-side', null, [title(nm(t), l.formation || '')]);
          seg.appendChild(pitch(l.start, function (p) { openPlayer(p, code); }, l.side, l.formation));
          if (l.bench && l.bench.length) seg.appendChild(h('div.sw-bench', null, [h('span.sw-mini-label', { text: 'الاحتياط' })].concat(l.bench.slice(0, 12).map(function (p) { return h('span', { text: (p.num ? p.num + ' ' : '') + p.name }); }))));
          page.appendChild(seg);
        });
        if (first) CS.nav.focus(screen.defaultFocus(), 'instant');
        clearInterval(timer);
        if (m.state === 'in') timer = setInterval(function () { if (CS.nav.top() === screen) draw(false); }, 30000);
      }, function () { if (first) failed(stage, function () { draw(true); }); });
    };
    draw(true);
  }

  /* =============== the favourites' picker =============== */
  function pickFavs() {
    var el = h('section.screen.sw.sw-pick');
    var head = h('div.sw-pick-head', null, [h('h1', { text: 'مفضلاتك' }), h('p', { text: 'اختر اللي تتابعه: يطلع فوق في قسم الرياضة، وتصير له قناته.' })]);
    var kinds = h('div.row.group.genre-row.sw-pick-kinds', null, h('div.hscroll', null, h('div.htrack')));
    var mine = h('div.sw-pick-mine.group');
    var body = h('div.vtrack', null, [head, mine, kinds]);
    el.appendChild(CS.views.topbar(null));
    el.appendChild(h('div.rows.vscroll.sw-scroll', { 'data-pad': '120' }, body));
    if (window.CS_ANDROID) el.appendChild(h('button.m-back', { 'aria-label': 'رجوع', html: CS.icon('back'), onclick: function () { CS.nav.pop(); } }));
    var screen = { name: 'sw-pick', el: el, defaultFocus: function () { return el.querySelector('.sw-pick-kinds .chip.on') || el.querySelector('.f'); } };
    CS.nav.push(screen);
    var grid = null;
    function drawMine() {
      mine.innerHTML = '';
      var list = favs();
      if (!list.length) { mine.appendChild(h('p.sw-pick-none', { text: 'ما اخترت شي للحين.' })); return; }
      list.forEach(function (f) {
        mine.appendChild(h('button.sw-pick-chosen.f', { onclick: function () { toggleFav(f); drawMine(); if (grid && grid._paint) grid._paint(); } }, [favFace(f), h('span', { text: f.ar || f.name }), h('span.ico-wrap', { html: CS.icon('close') })]));
      });
    }
    drawMine();
    var tiles = function (items, make, isOn) {
      var g = h('div.sw-pick-grid');
      g._paint = function () { Array.prototype.forEach.call(g.children, function (b) { b.classList.toggle('on', !!(b._f && isOn(b._f))); }); };
      items.forEach(function (it) {
        var f = make(it);
        var b = h('button.sw-pick-tile.f', { onclick: function () { toggleFav(f); g._paint(); drawMine(); } }, [crest(it), h('span', { text: nm(it) || it.name })]);
        b._f = f;
        g.appendChild(b);
      });
      g._paint();
      return g;
    };
    var show = function (g) { if (grid) grid.remove(); grid = g; body.appendChild(g); };
    var choose = function (which, chip) {
      Array.prototype.forEach.call(kinds.querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c === chip); });
      if (grid) grid.remove();
      grid = h('div.sw-pick-wait', null, CS.skel.cards(6));
      body.appendChild(grid);
      ask('leagues', 24 * 3600e3).then(function (all) {
        var isOn = function (f) { return isFav(f.kind, f.code, f.id); };
        if (which === 'leagues') {
          show(tiles(all.leagues.map(function (l) { return { id: l.code, name: l.ar, ar: l.ar, logo: l.logo || '', code: l.code }; }), function (l) { return { kind: 'league', code: l.code, id: l.code, name: l.name, ar: l.ar, logo: l.logo || '', color: '#ed0b18', alt: '#ffffff' }; }, isOn));
        } else if (which === 'nations') {
          show(tiles(all.nations.teams, function (t) { return favOfTeam(t, 'fifa.friendly', true); }, isOn));
        } else if (which === 'players') {
          var clubs = favs().filter(function (f) { return f.kind === 'team'; });
          var wrap = h('div.sw-pick-players');
          if (!clubs.length) wrap.appendChild(h('p.sw-pick-none', { text: 'اختر ناديك أول من «الأندية»، وبعدها تطلع لك هنا تشكيلته تختار منها.' }));
          clubs.forEach(function (c) {
            var part = h('div.sw-pick-squad', null, [h('h2', { text: c.ar || c.name })]);
            wrap.appendChild(part);
            ask('team/' + c.code + '/' + c.id, 3 * 60e3).then(function (d) {
              part.appendChild(tiles((d.squad || []).map(function (p) { return { id: p.id, name: p.num ? p.num + ' · ' + p.name : p.name, logo: p.photo || '', num: p.num }; }), function (p) {
                return { kind: 'player', code: c.code, teamCode: c.code, id: p.id, name: p.name.replace(/^\d+ · /, ''), ar: '', num: p.num || '', logo: p.logo || '', color: c.color, alt: c.alt };
              }, isOn));
            }, function () { part.appendChild(h('p.sw-pick-none', { text: 'ما قدرنا نجيب تشكيلة ' + (c.ar || c.name) })); });
          });
          show(wrap);
        } else {
          var lg = all.leagues.filter(function (l) { return l.code === which; })[0] || all.leagues[0];
          show(tiles(lg.teams, function (t) { return favOfTeam(t, lg.code, false); }, isOn));
        }
        CS.nav.refocus();
      }, function () { show(CS.errorState({ title: 'ما قدرنا نجيب القوائم', reason: 'خدمة الرياضة ما ردّت. جرّب بعد شوي.', retry: function () { choose(which, chip); } })); });
    };
    var tr = kinds.querySelector('.htrack');
    var first = null;
    [['ksa.1', 'الدوري السعودي'], ['eng.1', 'الإنجليزي'], ['esp.1', 'الإسباني'], ['ita.1', 'الإيطالي'], ['ger.1', 'الألماني'], ['fra.1', 'الفرنسي'],
      ['afc.champions', 'أبطال آسيا'], ['uefa.champions', 'أبطال أوروبا'], ['nations', 'المنتخبات'], ['leagues', 'الدوريات'], ['players', 'اللاعبين']].forEach(function (k, i) {
      var c = h('button.chip.f' + (i ? '' : '.on'), { onclick: function () { choose(k[0], c); } }, k[1]);
      if (!i) first = c;
      tr.appendChild(c);
    });
    choose('ksa.1', first);
    CS.nav.focus(first, 'instant');
  }

  CS.views.sportWorld = sportWorld;
  CS.views.sportTeam = teamPage;
  CS.views.sportLeague = leaguePage;
  CS.views.sportMatch = matchPage;
  CS.views.sportPick = pickFavs;
})();
