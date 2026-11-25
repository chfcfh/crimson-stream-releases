/*
 * Crimson Stream — Proprietary & Confidential
 * Copyright (c) 2026 محمد. All rights reserved.
 * Unauthorized copying, sharing or use of this file, by any means, is strictly prohibited.
 */
/* A series in the player (the owner, 2026-11-25: «مقدر اعرف كم باقي حلقة»):
   - «الحلقات»: the season's episodes, to go to any of them (from a source like the one playing, as the next episode's);
   - a small «الحلقة 5 من 12» at the top right while it plays;
   - «ملخص الموسم»: the season's story up to the episode playing, in Arabic, with nothing after it (crimson-hub /recap: Workers AI
     writes it from the episodes' own descriptions, only those before this one). At a season's first episode it is the season before.
   The TV draws the panel over its player. The PC and the phone show the page beside their own video (match-panel, as «المباراة»'s
   centre does), and draw the counter themselves from the 'play' message (desktop.js: epCount, episodes) */
(function () {
  var h = CS.h;
  var cur = null; /* the open panel: {el, tab, meta, video, draw} */
  function desk() { return !!CS.desktop; }
  function host(m) { try { window.chrome.webview.postMessage(m); } catch (e) { CS.log('episodes message not sent', e.message); } }
  /* the window put its panel away (the video stopped, or another took its place): this one goes too */
  if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
    window.chrome.webview.addEventListener('message', function (e) {
      var m = e && e.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (x) { return; } }
      if (m && m.t === 'match-panel-shown' && !m.on && cur) close();
      if (m && m.t === 'episodes-key') open(m.tab === 'recap' ? 'recap' : 'list');
    });
  }

  /* ---------- the episodes ---------- */
  /* a season's episodes in the order of the story (the add-ons do not always list them that way) */
  function seasonEps(meta, season) {
    return (meta && meta.videos || []).filter(function (x) { return x.season === season; }).sort(function (a, b) { return (a.episode || 0) - (b.episode || 0); });
  }
  function seasonsOf(meta) {
    var seen = {};
    (meta && meta.videos || []).forEach(function (x) { if (x.season > 0) seen[x.season] = 1; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  function has(meta) { return !!(meta && meta.type === 'series' && meta.videos && meta.videos.filter(function (x) { return x.season > 0; }).length > 1); }
  /* where this episode stands in its season: its place, and how many the season has */
  function placeOf(meta, video) {
    if (!has(meta) || !video || !(video.season > 0)) return null;
    var eps = seasonEps(meta, video.season), i = eps.findIndex(function (x) { return x.id === video.id; });
    if (i < 0 || eps.length < 2) return null;
    return { n: eps[i].episode === i + 1 ? eps[i].episode : i + 1, of: eps.length, first: i === 0, eps: eps };
  }
  /* «الموسم 2 · الحلقة 5 من 12» (the season only when there are more) */
  function countText(meta, video) {
    var p = placeOf(meta, video);
    if (!p) return '';
    return (seasonsOf(meta).length > 1 ? 'الموسم ' + video.season + ' · ' : '') + 'الحلقة ' + p.n + ' من ' + p.of;
  }

  /* ---------- the counter at the top right (the TV; the PC and the phone draw their own) ---------- */
  function count(meta, video) {
    if (desk()) return;
    var player = CS.$('player');
    if (!player) return;
    var el = CS.$('ep-count');
    if (!el) { el = h('div', { id: 'ep-count', 'aria-hidden': 'true' }); player.appendChild(el); }
    var t = meta && video ? countText(meta, video) : '';
    el.textContent = t;
    el.classList.toggle('on', !!t);
  }

  /* ---------- the panel ---------- */
  function close() {
    while (CS.nav.top() && CS.nav.top().name === 'ep-panel') CS.nav.pop();
  }
  function open(tab) {
    var P = CS.player.playing();
    if (!P || !has(P.meta)) return;
    var meta = P.meta, video = P.video;
    if (cur && cur.el && cur.el.isConnected) { cur.tab = tab || cur.tab; cur.draw(true); return; }
    var el = h('section', { id: 'ep-panel', role: 'dialog', 'aria-label': meta.name });
    if (desk()) host({ t: 'match-panel', on: true });
    var place = placeOf(meta, video);
    var head = h('div.ep-p-head', null, [
      h('h2.ep-p-name', { text: meta.name }),
      h('div.ep-p-where', { text: countText(meta, video) || CS.epLabel(video.season, video.episode) })
    ]);
    var tabsEl = h('div.mp-c-tabs.group', { role: 'tablist' });
    var body = h('div.mp-c-body.vscroll', { 'data-pad': '40' }, h('div.vtrack'));
    el.appendChild(h('button.mp-c-close', { 'aria-label': 'إغلاق', html: CS.icon('close'), onclick: function () { close(); } }));
    el.appendChild(head); el.appendChild(tabsEl); el.appendChild(body);
    (desk() ? document.body : CS.$('player')).appendChild(el);
    CS.$('player').classList.add('ep-open');
    var track = body.firstChild;
    var season = video.season;
    cur = { el: el, tab: tab || 'list', meta: meta, video: video };
    [['list', 'الحلقات'], ['recap', 'ملخص الموسم']].forEach(function (t) {
      tabsEl.appendChild(h('button.mp-c-tab.f', { role: 'tab', 'data-tab': t[0], onclick: function () { if (cur.tab !== t[0]) { cur.tab = t[0]; cur.draw(false); } } }, t[1]));
    });
    cur.draw = function (focusIn) {
      Array.prototype.forEach.call(tabsEl.children, function (b) { var on = b.getAttribute('data-tab') === cur.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      track.innerHTML = '';
      track.style.transform = '';
      var target = cur.tab === 'recap' ? drawRecap(track, meta, video, place) : drawList(track, meta, video, season, function (s) { season = s; cur.draw(true); });
      if (focusIn && target) CS.nav.focus(target, 'instant');
    };
    CS.nav.push({
      name: 'ep-panel', el: el, modal: true,
      defaultFocus: function () { return tabsEl.querySelector('.on'); },
      destroy: function () {
        if (cur && cur.el === el) cur = null;
        if (el.parentNode) el.parentNode.removeChild(el);
        CS.$('player').classList.remove('ep-open');
        if (desk()) host({ t: 'match-panel', on: false });
      }
    });
    cur.draw(false);
    void el.offsetWidth;
    el.classList.add('in');
    /* the list opens on the episode playing; the summary on its tab */
    var first = cur.tab === 'list' ? track.querySelector('.ep-p-row.now') || track.querySelector('.ep-p-row') : null;
    CS.nav.focus(first || tabsEl.querySelector('.on'), 'instant');
  }

  /* the season's episodes: the one playing marked, the watched ones ticked, the ones not out yet dimmed. OK plays one */
  function drawList(track, meta, video, season, toSeason) {
    var seasons = seasonsOf(meta), target = null;
    if (seasons.length > 1) {
      var bar = h('div.ep-p-seasons.group');
      seasons.forEach(function (s) {
        bar.appendChild(h('button.ep-p-season.f' + (s === season ? '.on' : ''), { onclick: function () { if (s !== season) toSeason(s); } }, 'الموسم ' + s));
      });
      track.appendChild(bar);
    }
    var list = h('div.ep-p-list');
    track.appendChild(list);
    var rows = {};
    var now = Date.now();
    seasonEps(meta, season).forEach(function (vid) {
      var future = vid.released && Date.parse(vid.released) > now;
      var isNow = vid.id === video.id;
      var note = isNow ? 'تشوفها الحين' : future ? 'تنزل ' + new Date(vid.released).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long' }) : '';
      var row = h('button.ep-p-row.f' + (isNow ? '.now' : '') + (future ? '.future' : ''), {
        onclick: function () {
          if (isNow) { close(); return; }
          if (future) { CS.toast('للحين ما نزلت', 2500); return; }
          close();
          CS.player.playEpisode(vid);
        }
      }, [
        h('div.ep-p-thumb', null, vid.thumbnail ? h('img', { src: vid.thumbnail, loading: 'lazy', alt: '', onerror: function () { this.remove(); } }) : h('span', { text: String(vid.episode) })),
        h('div.ep-p-words', null, [
          h('b', { text: 'الحلقة ' + vid.episode + (vid.title || vid.name ? ' · ' + (vid.title || vid.name) : '') }),
          note ? h('small' + (isNow ? '.now' : ''), { text: note }) : null
        ]),
        h('span.ep-p-seen')
      ]);
      rows[vid.id] = row;
      if (isNow) target = row;
      list.appendChild(row);
    });
    /* ticks once the account's watched list is read */
    var it = CS.lib.get(meta.id);
    if (it && it.state && it.state.watched) CS.lib.readWatched(it.state.watched, CS.lib.videoOrder(meta)).then(function (r) {
      Object.keys(rows).forEach(function (id) { if (r.set.has(id)) { rows[id].classList.add('seen'); rows[id].querySelector('.ep-p-seen').innerHTML = CS.icon('check'); } });
    }, function () { /* no ticks */ });
    return target || list.querySelector('.ep-p-row');
  }

  /* what the summary covers: this season up to the episode playing, or (at a season's first episode) the season before */
  function recapAsk(meta, video, place) {
    if (!place) return null;
    if (place.first) {
      var prev = seasonsOf(meta).filter(function (s) { return s < video.season; }).pop();
      return prev ? { season: prev, upto: 0, title: 'ملخص الموسم ' + prev, words: 'كل أحداث الموسم ' + prev + '، قبل ما يبدأ هالموسم' } : null;
    }
    var before = place.n - 1;
    return { season: video.season, upto: video.episode, title: 'اللي صار لين الحلقة ' + place.n, words: before === 1 ? 'الحلقة الأولى من الموسم ' + video.season : 'أول ' + before + ' حلقات من الموسم ' + video.season };
  }
  var recaps = {}; /* asked already in this run: id/season/upto -> the hub's answer */
  function drawRecap(track, meta, video, place) {
    var ask = recapAsk(meta, video, place);
    var box = h('div.ep-p-recap');
    track.appendChild(box);
    if (!ask) {
      box.appendChild(h('h3.ep-p-title', { text: 'هذي أول حلقة' }));
      box.appendChild(h('p.ep-p-para.f', { text: 'ما صار شي قبلها تحتاج تعرفه. ' + (meta.description ? 'عن المسلسل: ' + meta.description : '') }));
      return box.querySelector('.f');
    }
    box.appendChild(h('h3.ep-p-title', { text: ask.title }));
    box.appendChild(h('div.ep-p-scope', { text: ask.words + ' · بدون أي شي بعدها' }));
    var text = h('div.ep-p-text');
    box.appendChild(text);
    var id = meta.id, key = id + '/' + ask.season + '/' + ask.upto;
    var can = CS.config.hubUrl && /^(tt\d{5,10}|kitsu:\d{1,8})$/.test(id);
    var show = function (r) {
      if (!cur || cur.tab !== 'recap' || !text.isConnected) return;
      text.innerHTML = '';
      if (r && r.summary) {
        r.summary.split(/\n\s*\n/).forEach(function (p) { if (p.trim()) text.appendChild(h('p.ep-p-para.f', { text: p.trim() })); });
        text.appendChild(h('div.ep-p-note', { text: 'كتبه الذكاء الاصطناعي من وصف الحلقات، فممكن يغلط في تفصيلة' }));
      } else fallback(text, meta, ask, r);
      var f = CS.nav.current(); /* the focus was on the waiting lines, now gone: the summary's first line */
      if (!f || !f.isConnected) CS.nav.focus(text.querySelector('.f') || cur.el.querySelector('.mp-c-tab.on'), 'no-scroll');
    };
    if (recaps[key]) { show(recaps[key]); return text.querySelector('.f'); }
    if (!can) { fallback(text, meta, ask, null); return text.querySelector('.f'); }
    text.appendChild(h('div.ep-p-wait', null, [h('span.ep-p-spin'), h('span', { text: 'نكتب الملخص… أول مرة لهالحلقة ياخذ نص دقيقة تقريباً' })]));
    CS.skel.lines([94, 88, 97, 72]).forEach(function (x) { text.appendChild(x); });
    CS.fetchJson(CS.config.hubUrl + '/recap/' + encodeURIComponent(id).replace('%3A', ':') + '/' + ask.season + '/' + ask.upto + '.json', { timeout: 90000, cache: 'no-store' }).then(function (r) {
      if (r && (r.summary || r.reason === 'no-words')) recaps[key] = r;
      CS.log('recap', key, r && r.summary ? 'written by ' + r.by : r && (r.reason || r.error));
      show(r);
    }, function (e) {
      CS.log('recap not fetched', key, e && e.message);
      show(null);
    });
    return null;
  }
  /* no summary (the hub not reached, too busy, or no descriptions): the episodes' own descriptions, as the add-on gives them */
  function fallback(text, meta, ask, r) {
    var eps = seasonEps(meta, ask.season).filter(function (x) { return !ask.upto || x.episode < ask.upto; });
    var said = eps.filter(function (x) { return x.overview || x.description; });
    text.appendChild(h('p.ep-p-para.f.dim', { text: r && r.reason === 'no-words' ? 'الإضافة ما عندها وصف لهالحلقات، فما نقدر نلخصها.' : r && r.reason === 'busy' ? 'كتبنا ملخصات كثير اليوم. هذي الحلقات اللي فاتت بوصفها:' : 'ما قدرنا نكتب الملخص الحين. هذي الحلقات اللي فاتت بوصفها:' }));
    if (r && r.reason === 'no-words') return;
    said.forEach(function (x) {
      text.appendChild(h('div.ep-p-was.f', null, [h('b', { text: 'الحلقة ' + x.episode + (x.title || x.name ? ' · ' + (x.title || x.name) : '') }), h('p', { text: x.overview || x.description })]));
    });
  }

  CS.episodes = { has: has, countText: countText, count: count, open: open, close: close, placeOf: placeOf, recapAsk: recapAsk };
})();
