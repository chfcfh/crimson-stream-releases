/* The match player (the owner's wish, 2026-11-22: «مشغل خاص بالمباريات… عرض ملخص المباراة و عرض التشكيلة… شي ديناميكي»; and the next
   day, «سو كل الافكار»). While a live football match plays, the player knows the match and lives with it, without covering the picture:
   - The stream already carries its channel's own score graphic, so none is laid over it all the time.
   - Each moment comes on as a broadcast's lower third when the picture shows it: a goal (the scoring side's colours, the scorer, the
     minute, the new score), a sending-off, half time, the second half, full time; the official elevens when they come out; a goal of a
     favourite side in another match. ESPN gives each event its real time; the stream runs behind the stadium (CS.settings.matchDelay
     seconds), so nothing is told before it is seen. «شفته الحين», pressed when a goal or a whistle shows, sets that delay to the second.
   - Joining a match on, a short card says where it stands. Before kick-off, half time and full time bring a studio card: the score, the
     run of play as a wave, the numbers that matter, the player of the match by his numbers; before it, the two sides' form and meetings.
   - The bar (OSD) carries the score at its top, and a button «المباراة»; Down, with the bar hidden, opens the match centre at the side:
     the story (the wave, then each event at its minute), both elevens on one pitch (each player opens his numbers), the numbers, the
     table as it would stand if the match ended now, and the other matches on now.
   Data: crimson-hub /sport/play/<event> every 25 s, /sport/now each minute (/sport/find?q= finds the match by the stream's title; the
   sports world names it when it starts the stream, hint()). Nothing here runs for a channel or a match the hub cannot find. */
(function () {
  var h = CS.h;
  var cur = null; /* the match on: {id, meta, data, firstSeen, told, credit, joinedAt, timers, others} */
  var hints = {};
  var mounted = false, alertEl, stripEl, studioEl, centre = null, queue = [], showing = false;
  /* the PC and the phone play the video in their own player, over the page: there the page tells the window what to draw (desktop.js,
     MainForm, MainActivity): {t:'match-on'}, {t:'match-alert'}, {t:'match-score'}, {t:'match-panel'}. The TV draws it all itself */
  function desk() { return !!CS.desktop; }
  /* the window's text boxes (Bar.cs, Android's) take embeddings, not the isolates the page's ltr() uses: LRI to LRE, RLI to RLE, PDI to PDF */
  function flat(x) { return String(x).replace(/\u2066|\u2068/g, '\u202a').replace(/\u2067/g, '\u202b').replace(/\u2069/g, '\u202c'); }
  function host(m) { for (var k in m) if (typeof m[k] === 'string') m[k] = flat(m[k]); try { window.chrome.webview.postMessage(m); } catch (e) { CS.log('match message not sent', e.message); } }
  if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
    window.chrome.webview.addEventListener('message', function (e) {
      var m = e && e.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (x) { return; } }
      if (m && m.t === 'match-panel-shown' && !m.on && centre && centre.el) {
        while (CS.nav.top() && (CS.nav.top().name === 'mp-card' || CS.nav.top().name === 'mp-centre')) CS.nav.pop();
      }
    });
  }
  var ALERT_KIND = { goal: 'goal', pen: 'goal', own: 'goal', red: 'card', red2: 'card', yellow: 'card', 'pen-miss': 'info', sub: 'sub', 'var': 'var' };

  /* ---------- time: what the picture shows now ---------- */
  function delayMs() { var d = +CS.settings.matchDelay; return (isNaN(d) ? 90 : Math.max(0, Math.min(300, d))) * 1000; }
  /* the stadium's clock as the hub has it */
  function stadiumNow() { return Date.now() + (cur ? cur.offset : 0); }
  /* and as the picture shows it: less how far the stream runs behind */
  function seenNow() { return stadiumNow() - delayMs(); }
  function atOf(e) { var t = Date.parse(e.at || ''); return isNaN(t) ? (cur.firstSeen[keyOf(e)] || 0) + delayMs() : t; }
  function keyOf(e) { return e.kind + '|' + e.min + '|' + e.side + '|' + e.who; }
  function visible(e) { return atOf(e) <= seenNow(); }
  function isGoal(e) { return e.kind === 'goal' || e.kind === 'pen' || e.kind === 'own'; }
  /* the side a goal counts for: the one whose score moved when it came (ask), else its team's, the other one's for an own goal */
  function credit(e) {
    var k = cur && cur.credit[keyOf(e)];
    if (k) return k;
    /* ESPN sides an own goal with the team it counts for (Nashville 0-1 Cincinnati, 2026-11-23: Yazbek of Nashville, side «away»),
       so no turning it round: flipped, the wave, the alert and the score held back for the picture all gave it to the wrong team */
    return e.side;
  }
  function shown(d) { return (d.events || []).filter(visible); }
  /* the score the picture has reached: the hub's, less the goals still to come on screen */
  function score(d) {
    var hs = d.home.score || 0, as = d.away.score || 0;
    (d.events || []).forEach(function (e) {
      if (!isGoal(e) || visible(e)) return;
      var c = credit(e);
      if (c === 'home') hs = Math.max(0, hs - 1); else if (c === 'away') as = Math.max(0, as - 1);
    });
    return [hs, as];
  }
  /* the minute on screen, counted from the half's real start; else the hub's clock. n: the minutes played, for the wave */
  function minute(d) {
    var ev = shown(d), kinds = ev.map(function (e) { return e.kind; });
    if (kinds.indexOf('end') >= 0 || (d.done && ev.length === (d.events || []).length)) return { text: 'انتهت', state: 'post', n: 999 };
    if (d.state === 'pre' && !ev.length) return { text: d.at && CS.sw ? CS.sw.when(d.at) : 'قبل البداية', state: 'pre', n: 0 };
    if (kinds.indexOf('half') >= 0 && kinds.indexOf('second') < 0) return { text: 'استراحة', state: 'half', n: 45 };
    var p = kinds.indexOf('second') >= 0 ? 2 : 1, start = Date.parse((d.starts || {})[p] || '');
    if (!isNaN(start)) {
      var played = (seenNow() - start) / 60000, m = Math.floor(played) + 1;
      if (m < 1) return { text: p === 1 ? 'قبل البداية' : 'استراحة', state: p === 1 ? 'pre' : 'half', n: p === 1 ? 0 : 45 };
      var base = p === 1 ? 0 : 45, cap = p === 1 ? 45 : 90, t = base + m;
      return { text: t > cap ? cap + '+' + (t - cap) + '′' : t + '′', state: 'in', n: base + played };
    }
    return { text: d.clock || '', state: d.state, n: parseInt(d.clock, 10) || 0 };
  }

  /* ---------- words and pieces ---------- */
  function tn(t) { return t ? (t.ar || t.name || '') : ''; }
  /* a minute («45+2′», «10'») kept left to right inside Arabic words */
  function ltr(s) { return s ? '\u2066' + s + '\u2069' : ''; }
  function lum(hex) { return CS.sw && CS.sw.lum ? CS.sw.lum(hex) : 0.2; }
  /* a side's colour that reads on the night (white for a black kit), and the words that read on it */
  function colourOf(t, other) {
    var c = (t && t.color) || '', a = (t && t.alt) || '';
    if (!c || lum(c) < 0.015) c = a && lum(a) > 0.015 ? a : '#8a8f98';
    if (other && other.color && c.toLowerCase() === String(other.color).toLowerCase() && a) c = a;
    return c;
  }
  function inkOn(c) { return lum(c) > 0.32 ? '#101010' : '#ffffff'; }
  function crest(t, cls) {
    var w = h('span.mp-crest' + (cls ? '.' + cls : ''));
    if (t && t.logo) { var i = h('img', { src: t.logo, alt: '', decoding: 'async' }); i.onerror = function () { i.remove(); w.textContent = tn(t).charAt(0); }; w.appendChild(i); }
    else w.textContent = tn(t).charAt(0);
    return w;
  }
  var ICON = {
    ball: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#fff"/><path d="M12 7.6l3.3 2.4-1.3 3.9h-4L8.7 10z" fill="#111"/><path d="M12 3v4.6M15.3 10l4.3-1.4M14 13.9l2.6 3.7M10 13.9l-2.6 3.7M8.7 10L4.4 8.6" stroke="#111" stroke-width="1.4" fill="none"/></svg>',
    whistle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="14" r="5"/><path d="M13 11l8-3v4l-6 2M9 9V5M6 6.5 4.5 5"/></svg>',
    sub: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19V6M4 10l4-4 4 4" stroke="#1fbf75"/><path d="M16 5v13M12 14l4 4 4-4" stroke="#ff5a5f"/></svg>',
    up: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.8 10.6 7.4H1.4z" fill="#1fbf75"/></svg>',
    down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.2 1.4 4.6h9.2z" fill="#ff5a5f"/></svg>',
    shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5 3.5 6.5l2 4 2-1V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.6-2.2 2.7-4 2.7S8.6 5.1 8 3.5z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  function mark(kind) {
    if (isGoal({ kind: kind })) return h('i.mp-mark.goal' + (kind === 'own' ? '.own' : ''), { html: ICON.ball });
    if (kind === 'yellow') return h('i.mp-mark.card.yellow');
    if (kind === 'red' || kind === 'red2') return h('i.mp-mark.card.red' + (kind === 'red2' ? '.two' : ''));
    if (kind === 'sub') return h('i.mp-mark.sub', { html: ICON.sub });
    if (kind === 'pen-miss') return h('i.mp-mark.miss', { html: ICON.ball });
    if (kind === 'lineup') return h('i.mp-mark.whistle', { html: ICON.shirt });
    return h('i.mp-mark.whistle', { html: ICON.whistle });
  }
  var WORD = { goal: 'هدف', pen: 'هدف من ركلة جزاء', own: 'هدف عكسي', red: 'طرد', red2: 'طرد بإنذار ثاني', yellow: 'إنذار', sub: 'تبديل', 'pen-miss': 'ركلة جزاء ضائعة',
    kickoff: 'بدأت المباراة', half: 'نهاية الشوط الأول', second: 'بدأ الشوط الثاني', end: 'نهاية المباراة', 'var': 'مراجعة الفيديو' };
  var RESULT = { W: 'ف', L: 'خ', D: 'ت' };

  /* ---------- the moments: one lower third at a time ---------- */
  function mount() {
    if (mounted) return;
    var p = CS.$('player');
    if (!p) return;
    mounted = true;
    alertEl = h('div', { id: 'mp-alert', 'aria-live': 'polite' });
    p.appendChild(alertEl);
    studioEl = h('div', { id: 'mp-studio' });
    p.appendChild(studioEl);
    stripEl = h('div', { id: 'mp-strip' });
    /* in the bar's top, between the title (right) and the badges (left) */
    var top = p.querySelector('.osd-top'), title = top && top.querySelector('.osd-title');
    if (top) top.insertBefore(stripEl, title ? title.nextSibling : top.firstChild);
  }
  function lowerThird(o) {
    /* o: {kind, side, title, who, sub, score:[h,a], team (another match's side), pair (another match's two sides)} */
    var d = cur.data, side = o.team || (o.side === 'away' ? d.away : o.side === 'home' ? d.home : null), other = side === d.home ? d.away : d.home;
    var c = side ? colourOf(side, other) : '#ed0b18';
    var box = h('div.mp-lt.' + (o.kind || 'info') + (side ? '' : '.plain'));
    box.style.setProperty('--team', c);
    box.style.setProperty('--team-ink', inkOn(c));
    box.appendChild(h('div.mp-lt-band', null, side ? crest(side, 'lt') : h('span.mp-lt-ico', { html: o.kind === 'lineup' ? ICON.shirt : ICON.whistle })));
    box.appendChild(h('div.mp-lt-words', null, [
      h('div.mp-lt-kicker', null, [o.kind && !/^(info|catch|lineup|other)$/.test(o.kind) ? mark(o.kind) : null, h('span', { text: o.title })]),
      o.who ? h('div.mp-lt-who', { text: o.who }) : null,
      o.sub ? h('div.mp-lt-sub', { text: o.sub }) : null
    ]));
    var pair = o.pair || [d.home, d.away];
    if (o.score) box.appendChild(h('div.mp-lt-score', null, [crest(pair[0], 'mini'), h('b', { text: o.score[0] + ' - ' + o.score[1] }), crest(pair[1], 'mini')]));
    return box;
  }
  function tell(o) { queue.push(o); if (!showing) next(); }
  function next() {
    var o = queue.shift();
    if (o && cur && cur.data && desk()) {
      /* the window draws it (text only) in the side's colour */
      var d = cur.data, side = o.team || (o.side === 'away' ? d.away : o.side === 'home' ? d.home : null);
      var ms = o.kind === 'catch' ? 7000 : o.kind === 'studio' ? 12000 : isGoal(o) ? 8000 : 6000;
      host({ t: 'match-alert', kind: ALERT_KIND[o.kind] || 'info', title: o.title, sub: [o.who, o.sub].filter(Boolean).join(' · '), score: o.score ? o.score[0] + ' - ' + o.score[1] : '',
        color: side ? colourOf(side, side === d.home ? d.away : d.home) : '#ed0b18', ms: ms });
      showing = true;
      setTimeout(next, ms + 300);
      return;
    }
    /* not on screen yet (mount): nothing to show it in */
    if (!o || !cur || !alertEl) { showing = false; if (!alertEl) queue = []; return; }
    showing = true;
    alertEl.innerHTML = '';
    var box = lowerThird(o);
    alertEl.appendChild(box);
    void box.offsetWidth; /* laid out off screen first, or a slow TV jumps to the end */
    box.classList.add('in');
    var hold = o.kind === 'catch' ? 7000 : isGoal(o) ? 8000 : 6000;
    setTimeout(function () {
      box.classList.remove('in');
      box.classList.add('out');
      setTimeout(function () { if (box.parentNode) box.remove(); next(); }, 260);
    }, hold);
  }
  function scoreWords(d, sc) { return tn(d.home) + ' ' + sc[0] + ' - ' + sc[1] + ' ' + tn(d.away); }
  /* events that reached the picture since the last look: each told once; those older than the moment the viewer joined are not */
  function check() {
    if (!cur || !cur.data) return;
    var d = cur.data, alerts = CS.settings.matchAlerts !== false;
    shown(d).forEach(function (e) {
      var k = keyOf(e);
      if (cur.told[k]) return;
      cur.told[k] = 1;
      if (atOf(e) < cur.joinedAt || !alerts) return;
      if (!/^(goal|pen|own|red|red2|half|second|end|kickoff|pen-miss)$/.test(e.kind)) return;
      var sc = score(d), team = e.side === 'home' ? d.home : e.side === 'away' ? d.away : null;
      if (isGoal(e)) {
        var by = credit(e), bt = by === 'home' ? d.home : by === 'away' ? d.away : null;
        tell({ kind: e.kind, side: by, title: WORD[e.kind] + (bt ? ' ' + tn(bt) : ''), who: e.who, sub: [ltr(e.min), e.also ? 'صناعة ' + e.also : ''].filter(Boolean).join(' · '), score: sc });
        if (CS.replays) CS.replays.goal(cur, e, sc);
      }
      else if (e.kind === 'red' || e.kind === 'red2' || e.kind === 'pen-miss') tell({ kind: e.kind, side: e.side, title: WORD[e.kind] + (team ? ' · ' + tn(team) : ''), who: e.who, sub: ltr(e.min) });
      else tell({ kind: 'info', side: '', title: WORD[e.kind], sub: scoreWords(d, sc), score: e.kind === 'kickoff' ? null : sc });
      if (e.kind === 'end' && CS.replays) CS.replays.ended(d.id, e.at);
      /* half time and full time: the studio, once the lower third has had its moment */
      if (e.kind === 'half' || e.kind === 'end') setTimeout(function () { studio(e.kind); }, 6500);
    });
    /* drawn again only when something on screen changes (the check runs each second): the minute, the score, a new moment, a new answer */
    var sc2 = score(d), mn = minute(d).text, vis = shown(d).length;
    var top = sc2.join('-') + '|' + mn, body = vis + '|' + d.now + '|' + (cur.othersAt || '');
    if (top !== cur.topSig) { cur.topSig = top; paintStrip(); }
    if (centre && centre.el && centre.el.isConnected && (top !== centre.topSig || body !== centre.bodySig)) {
      var whole = body !== centre.bodySig;
      centre.topSig = top; centre.bodySig = body;
      centre.refresh(whole);
    }
    if (studioEl && studioEl.classList.contains('on') && studioEl._tick) studioEl._tick();
  }
  /* joining a match on: where it stands, once, a moment after the picture comes; before kick-off, the studio */
  function catchUp() {
    if (!cur || !cur.data || cur.caught) return;
    cur.caught = true;
    var d = cur.data, m = minute(d);
    if (m.state === 'pre') { studio('pre'); return; }
    var goals = shown(d).filter(isGoal).map(function (e) { return (e.who || '') + ' ' + ltr(e.min); });
    tell({ kind: 'catch', side: '', title: m.state === 'post' ? 'انتهت المباراة' : m.state === 'half' ? 'بين الشوطين' : 'الدقيقة ' + ltr(m.text), who: scoreWords(d, score(d)), sub: goals.length ? 'الأهداف: ' + goals.join('، ') : 'ما فيه أهداف للحين', score: null });
  }

  /* ---------- the score at the top of the bar ---------- */
  function paintStrip() {
    if (!cur || !cur.data) return;
    var d = cur.data, sc = score(d), m = minute(d);
    /* the window's own bar: one line, as the picture has it */
    if (desk()) { host({ t: 'match-score', text: tn(d.home) + ' ' + sc[0] + ' - ' + sc[1] + ' ' + tn(d.away) + ' · ' + ltr(m.text) }); return; }
    if (!stripEl) return;
    stripEl.innerHTML = '';
    stripEl.className = 'on';
    stripEl.appendChild(h('span.mp-strip-side', null, [crest(d.home), h('span', { text: tn(d.home) })]));
    stripEl.appendChild(h('b.mp-strip-score', { text: sc[0] + ' - ' + sc[1] }));
    stripEl.appendChild(h('span.mp-strip-side.away', null, [h('span', { text: tn(d.away) }), crest(d.away)]));
    stripEl.appendChild(h('span.mp-strip-min' + (m.state === 'in' ? '.live' : ''), { text: m.text }));
  }

  /* ================= the run of play: a wave ================= */
  /* each side's pressure in three-minute steps (shots, corners, goals: the hub's weights), the home side's above the line, the away
     side's under it; time runs from the right, as Arabic reads; drawn only as far as the picture has reached. The goals as balls */
  /* «90'+5'» is the 95th minute */
  function minOf(e) { var m = /(\d+)\D*\+\s*(\d+)/.exec((e && e.min) || ''); return m ? +m[1] + +m[2] : parseInt((e && e.min) || '', 10) || 0; }
  function waveOf(d, cls) {
    var mn = minute(d), upto, span;
    if (mn.state === 'post') {
      upto = 90;
      (d.pressure || []).forEach(function (p) { if (p.m > upto) upto = p.m; });
      shown(d).forEach(function (e) { var m = minOf(e); if (m > upto) upto = m; });
      upto = Math.min(upto, 130); span = upto;
    } else { upto = Math.min(mn.n, 130); span = Math.max(90, Math.ceil(upto / 15) * 15); }
    var step = 3, n = Math.ceil(span / step);
    var hb = [], ab = [], i;
    for (i = 0; i < n; i++) { hb.push(0); ab.push(0); }
    (d.pressure || []).forEach(function (p) {
      if (p.m > upto) return;
      var b = Math.min(n - 1, Math.floor(p.m / step));
      if (p.s === 'home') hb[b] += p.w; else ab[b] += p.w;
    });
    /* smoothed over its neighbours, so a wave and not a comb */
    var smooth = function (a) { return a.map(function (v, k) { return (a[k - 1] || 0) * 0.25 + v * 0.5 + (a[k + 1] || 0) * 0.25; }); };
    hb = smooth(hb); ab = smooth(ab);
    var top = Math.max(4, Math.max.apply(null, hb.concat(ab)));
    var W = 900, H = 160, mid = H / 2, last = Math.min(n, Math.ceil(upto / step));
    var xOf = function (m) { return W - (m / span) * W; };
    var path = function (a, dir) {
      if (!last) return '';
      var pts = [];
      for (var k = 0; k < last; k++) pts.push([xOf(k * step + step / 2), mid - dir * (a[k] / top) * (mid - 10)]);
      var s = 'M' + xOf(0) + ',' + mid + ' L' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
      for (var j = 1; j < pts.length; j++) {
        var cx = ((pts[j - 1][0] + pts[j][0]) / 2).toFixed(1);
        s += ' C' + cx + ',' + pts[j - 1][1].toFixed(1) + ' ' + cx + ',' + pts[j][1].toFixed(1) + ' ' + pts[j][0].toFixed(1) + ',' + pts[j][1].toFixed(1);
      }
      return s + ' L' + xOf(Math.min(upto, span)).toFixed(1) + ',' + mid + ' Z';
    };
    var hc = colourOf(d.home, d.away), ac = colourOf(d.away, d.home);
    var goals = shown(d).filter(isGoal).map(function (e) {
      var m = minOf(e), by = credit(e), y = by === 'home' ? 16 : H - 16;
      return '<g transform="translate(' + xOf(Math.min(m, span)).toFixed(1) + ',' + y + ')"><circle r="11" fill="#fff"/><circle r="11" fill="none" stroke="' + (by === 'home' ? hc : ac) + '" stroke-width="3"/></g>';
    }).join('');
    var half = h('span.mp-wave-45', { text: '45' });
    half.style.right = (45 / span * 100).toFixed(1) + '%';
    var axis = h('div.mp-wave-axis', null, [h('span', { text: 'البداية' }), half, h('span', { text: span > 90 && span < 105 ? '90+' + Math.round(span - 90) : String(Math.round(span)) })]);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="' + xOf(45) + '" y1="6" x2="' + xOf(45) + '" y2="' + (H - 6) + '" stroke="#ffffff33" stroke-dasharray="4 6"/>' +
      '<path d="' + path(hb, 1) + '" fill="' + hc + '" fill-opacity=".85"/><path d="' + path(ab, -1) + '" fill="' + ac + '" fill-opacity=".85"/>' +
      '<line x1="0" y1="' + mid + '" x2="' + W + '" y2="' + mid + '" stroke="#ffffff55" stroke-width="2"/>' + goals + '</svg>';
    return h('div.mp-wave' + (cls ? '.' + cls : ''), null, [
      h('div.mp-wave-head', null, [h('span', null, [crest(d.home, 'tiny'), h('span', { text: tn(d.home) })]), h('b', { text: 'مجرى المباراة' }), h('span', null, [h('span', { text: tn(d.away) }), crest(d.away, 'tiny')])]),
      h('div.mp-wave-plot', { html: svg }),
      axis
    ]);
  }

  /* the player of the match by his numbers: goals first, then assists, shots on target, shots, a keeper's saves */
  function bestOf(d) {
    var best = null;
    (d.lineups || []).forEach(function (l) {
      l.start.concat(l.bench).forEach(function (p) {
        var s = p.st || {}, v = (s.g || 0) * 6 + (s.a || 0) * 4 + (s.sot || 0) * 1.5 + (s.sh || 0) * 0.5 + (s.sv || 0) * 1.2 - (s.rc || 0) * 4 - (s.og || 0) * 4;
        if (v > 0 && (!best || v > best.v)) best = { v: v, p: p, side: l.side };
      });
    });
    return best;
  }
  function numbersLine(s) {
    var out = [];
    if (s.g) out.push(s.g === 1 ? 'هدف' : s.g + ' أهداف');
    if (s.a) out.push(s.a === 1 ? 'صناعة' : s.a + ' صناعات');
    if (s.sh) out.push(s.sh + ' تسديدات' + (s.sot ? ' (' + s.sot + ' على المرمى)' : ''));
    if (s.sv) out.push(s.sv + ' تصديات');
    if (s.fc) out.push(s.fc + ' أخطاء');
    return out.join(' · ');
  }

  /* ================= the studio: before kick-off, at half time, at full time ================= */
  /* a card across the foot of the picture for half a minute (or until Back): the score, the wave, the numbers that matter and the
     player of the match; before kick-off, the time left, both sides' last five and how they met before. OK opens the match centre */
  function studio(kind) {
    if (!cur || !cur.data) return;
    var d = cur.data, sc = score(d);
    if (desk()) {
      var gist = [];
      if (kind === 'pre') {
        ['home', 'away'].forEach(function (sd) { var f = (d.form || {})[sd] || []; if (f.length) gist.push(tn(sd === 'home' ? d.home : d.away) + ' ' + f.map(function (g) { return RESULT[g.r] || '·'; }).join('')); });
        if (d.h2h && d.h2h.games.length) gist.push('المواجهات ' + d.h2h.tally.home + '-' + d.h2h.tally.draw + '-' + d.h2h.tally.away);
      } else {
        /* the star first: the numbers that fit follow (possession in whole numbers) */
        var bp = bestOf(d);
        if (bp) gist.push((kind === 'end' ? 'نجم المباراة ' : 'الأبرز ') + bp.p.name);
        ['possessionPct', 'totalShots', 'shotsOnTarget'].forEach(function (k) { var x = (d.stats || []).filter(function (y) { return y.key === k; })[0]; var r = function (v) { return k === 'possessionPct' ? Math.round(parseFloat(v)) || v : v; }; if (x) gist.push(x.ar + ' ' + r(x.home) + '-' + r(x.away)); });
      }
      var who = kind === 'pre' ? '' : scoreWords(d, sc), line = who;
      gist.forEach(function (g) { var next = line ? line + ' · ' + g : g; if (next.length <= 80) line = next; });
      tell({ kind: 'studio', side: '', title: kind === 'pre' ? 'قبل المباراة' : kind === 'half' ? 'تحليل الشوط الأول' : 'نهاية المباراة', who: '', sub: line, score: null });
      return;
    }
    if (!studioEl) return;
    studioEl.innerHTML = '';
    var card = h('div.mp-st-card.' + kind);
    var title = kind === 'pre' ? 'قبل المباراة' : kind === 'half' ? 'تحليل الشوط الأول' : 'نهاية المباراة';
    card.appendChild(h('div.mp-st-head', null, [
      h('span.mp-st-title', { text: title }),
      h('div.mp-st-score', null, [crest(d.home, 'mid'), h('span', { text: tn(d.home) }), h('b', { text: kind === 'pre' ? 'ضد' : sc[0] + ' - ' + sc[1] }), h('span', { text: tn(d.away) }), crest(d.away, 'mid')]),
      h('span.mp-st-hint', { text: ltr('OK') + ': المباراة كاملة · رجوع: إخفاء' })
    ]));
    var body = h('div.mp-st-body');
    if (kind === 'pre') {
      var left = h('div.mp-st-col');
      var count = h('b.mp-st-count');
      var tick = function () {
        var ms = Math.max(0, Date.parse(d.at) - seenNow()), mi = Math.floor(ms / 60000), hr = Math.floor(mi / 60);
        count.textContent = ms <= 0 ? 'الحين' : hr ? hr + ' س ' + (mi % 60) + ' د' : mi + ' دقيقة';
      };
      tick();
      studioEl._tick = tick;
      left.appendChild(h('div.mp-st-block', null, [h('small', { text: 'باقي على البداية' }), count, h('small', { text: d.venue || '' })]));
      var lu = (d.lineups || []).filter(function (l) { return l.start.length; });
      left.appendChild(h('div.mp-st-block', null, [h('small', { text: 'التشكيلة' }), h('span', { text: lu.length ? 'نزلت: ' + lu.map(function (l) { return tn(l.side === 'home' ? d.home : d.away) + ' ' + ltr(l.formation || ''); }).join(' · ') : 'تنزل قبل البداية بساعة تقريبًا' })]));
      body.appendChild(left);
      var mid = h('div.mp-st-col.wide');
      ['home', 'away'].forEach(function (side) {
        var f = (d.form || {})[side] || [];
        if (!f.length) return;
        mid.appendChild(h('div.mp-st-form', null, [crest(side === 'home' ? d.home : d.away, 'tiny'), h('span.mp-st-form-name', { text: tn(side === 'home' ? d.home : d.away) })].concat(f.map(function (g) {
          return h('span.mp-st-res.' + (g.r || 'n'), { title: g.opp + ' ' + g.score, text: RESULT[g.r] || '·' });
        }))));
      });
      if (d.h2h && d.h2h.games.length) {
        var t = d.h2h.tally;
        mid.appendChild(h('div.mp-st-h2h', null, [
          h('small', { text: 'آخر ' + d.h2h.games.length + ' مواجهات' }),
          h('div.mp-st-h2h-bar', null, [h('i.home', { style: { flexGrow: String(t.home || 0.001), background: colourOf(d.home, d.away) } }), h('i.draw', { style: { flexGrow: String(t.draw || 0.001) } }), h('i.away', { style: { flexGrow: String(t.away || 0.001), background: colourOf(d.away, d.home) } })]),
          h('div.mp-st-h2h-keys', null, [h('span', { text: tn(d.home) + ' ' + t.home }), h('span', { text: 'تعادل ' + t.draw }), h('span', { text: tn(d.away) + ' ' + t.away })])
        ]));
      }
      body.appendChild(mid);
    } else {
      studioEl._tick = null;
      body.appendChild(h('div.mp-st-col.wide', null, waveOf(d, 'studio')));
      var nums = h('div.mp-st-col');
      ['possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners'].forEach(function (k) {
        var s = (d.stats || []).filter(function (x) { return x.key === k; })[0];
        if (!s) return;
        var a = parseFloat(s.home) || 0, b = parseFloat(s.away) || 0, sum = a + b || 1;
        nums.appendChild(h('div.mp-st-num', null, [h('b', { text: s.home }), h('span', null, [h('small', { text: s.ar }), h('span.mp-stat-bars', null, [h('i', { style: { width: Math.round(a / sum * 100) + '%', background: colourOf(d.home, d.away) } }), h('i', { style: { width: Math.round(b / sum * 100) + '%', background: colourOf(d.away, d.home) } })])]), h('b', { text: s.away })]));
      });
      var best = bestOf(d);
      if (best) {
        var bt = best.side === 'home' ? d.home : d.away, c = colourOf(bt, best.side === 'home' ? d.away : d.home);
        nums.appendChild(h('div.mp-st-best', null, [h('b.mp-man-num', { text: best.p.num || '·', style: { background: c, color: inkOn(c) } }), h('span', null, [h('small', { text: kind === 'end' ? 'نجم المباراة بالأرقام' : 'الأبرز للحين' }), h('b', { text: best.p.name }), h('small', { text: numbersLine(best.p.st || {}) })])]));
      }
      body.appendChild(nums);
    }
    card.appendChild(body);
    studioEl.appendChild(card);
    studioEl.classList.remove('on');
    void studioEl.offsetWidth;
    studioEl.classList.add('on');
    CS.$('player').classList.add('mp-studio-on');
    clearTimeout(studioEl._hide);
    studioEl._hide = setTimeout(hideStudio, kind === 'pre' ? 25000 : 30000);
  }
  function hideStudio() { if (studioEl) { clearTimeout(studioEl._hide); studioEl.classList.remove('on'); studioEl._tick = null; var p = CS.$('player'); if (p) p.classList.remove('mp-studio-on'); } }
  function studioOn() { return !!(studioEl && studioEl.classList.contains('on')); }

  /* ================= the match centre ================= */
  var TABS = [['story', 'الملخص'], ['lineup', 'التشكيلة'], ['stats', 'الأرقام'], ['table', 'الترتيب'], ['others', 'مباريات ثانية']];
  /* the goals' replays, where the window keeps them (the PC, the phone: replays.js) */
  function tabs() { return CS.replays && CS.replays.supported() ? TABS.concat([['replays', 'الإعادات']]) : TABS; }
  function replaysOf(d) {
    var box = h('div.rp-list');
    var list = CS.replays ? CS.replays.of(d.id) : [];
    if (!list.length) { box.appendChild(h('p.mp-empty', { text: 'كل هدف يطلع لك ينحفظ هنا: آخر 25 ثانية قبله و5 بعده. تنحذف بعد 3 أيام من المباراة.' })); return box; }
    list.forEach(function (r) { box.appendChild(CS.replays.row(r)); });
    return box;
  }
  function openCentre() {
    if (!cur || !cur.data) { CS.toast(cur ? 'نجيب المباراة…' : 'ما عرفنا هالمباراة', 2500); return; }
    hideStudio();
    var tab = (centre && centre.tab) || 'story';
    var el = h('section', { id: 'mp-centre' });
    if (desk()) host({ t: 'match-panel', on: true });
    var head = h('div.mp-c-head'), tabsEl = h('div.mp-c-tabs.group', { role: 'tablist' }), body = h('div.mp-c-body.vscroll', { 'data-pad': '40' }, h('div.vtrack')), foot = h('div.mp-c-foot.group');
    el.appendChild(h('button.mp-c-close', { 'aria-label': 'إغلاق', html: CS.icon('close'), onclick: function () { CS.nav.pop(); } }));
    el.appendChild(head); el.appendChild(tabsEl); el.appendChild(body); el.appendChild(foot);
    /* the TV: over its own player. The PC and the phone: over the whole page, which the window shows beside its video */
    (desk() ? document.body : CS.$('player')).appendChild(el);
    /* the moments step aside, to the left of the centre */
    CS.$('player').classList.add('mp-open');
    var track = body.firstChild;
    tabs().forEach(function (t) {
      tabsEl.appendChild(h('button.mp-c-tab.f' + (t[0] === tab ? '.on' : ''), { role: 'tab', 'data-tab': t[0], onclick: function () { tab = t[0]; centre.tab = tab; draw(true); } }, t[1]));
    });
    function draw(keepFocus) {
      var d = cur.data;
      Array.prototype.forEach.call(tabsEl.children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false'); });
      headOf(head, d);
      track.innerHTML = '';
      track.style.transform = '';
      var part = tab === 'lineup' ? lineupOf(d) : tab === 'stats' ? statsOf(d) : tab === 'table' ? tableOf(d) : tab === 'others' ? othersOf() : tab === 'replays' ? replaysOf(d) : storyOf(d);
      track.appendChild(part);
      if (!keepFocus) return;
      var on = tabsEl.querySelector('.on');
      if (on && CS.nav.current() !== on && !el.contains(CS.nav.current())) CS.nav.focus(on, 'no-scroll');
    }
    /* whole: the body too (new facts); else the head only. The focus stays where it was: on the same tab, or the same line of the body */
    centre = { el: el, tab: tab, refresh: function (whole) {
      if (!whole) { headOf(head, cur.data); return; }
      var f = CS.nav.current(), inBody = f && body.contains(f), at = inBody ? Array.prototype.indexOf.call(body.querySelectorAll('.f'), f) : -1;
      var y = track.style.transform;
      draw(false);
      if (inBody) { track.style.transform = y; var all = body.querySelectorAll('.f'); var g = all[Math.min(at, all.length - 1)]; if (g) CS.nav.focus(g, 'no-scroll'); }
      else if (!f || !f.isConnected) CS.nav.refocus(); /* on a tab or the delay's buttons: drawn once, the focus stays */
    } };
    CS.nav.push({ name: 'mp-centre', el: el, modal: true, defaultFocus: function () { return tabsEl.querySelector('.on'); }, destroy: function () { if (centre && centre.el === el) centre.el = null; CS.$('player').classList.remove('mp-open'); if (desk()) host({ t: 'match-panel', on: false }); } });
    draw(false);
    footOf(foot);
    void el.offsetWidth;
    el.classList.add('in');
    CS.nav.focus(tabsEl.querySelector('.on'), 'instant');
  }
  function headOf(head, d) {
    var sc = score(d), m = minute(d);
    head.innerHTML = '';
    head.appendChild(h('div.mp-c-league', { text: [d.league, d.venue].filter(Boolean).join(' · ') }));
    head.appendChild(h('div.mp-c-teams', null, [
      h('div.mp-c-team', null, [crest(d.home, 'big'), h('span', { text: tn(d.home) })]),
      h('div.mp-c-mid', null, [h('b.mp-c-score', { text: sc[0] + ' - ' + sc[1] }), h('span.mp-c-min' + (m.state === 'in' ? '.live' : ''), { text: m.text })]),
      h('div.mp-c-team', null, [crest(d.away, 'big'), h('span', { text: tn(d.away) })])
    ]));
  }
  /* the story so far: the wave, then each event at its minute on a line down the middle, the home side's on the right */
  function storyOf(d) {
    var list = shown(d).filter(function (e) { return e.kind !== 'var'; });
    var box = h('div.mp-story');
    if (!list.length) { box.appendChild(h('p.mp-empty', { text: d.state === 'pre' ? 'المباراة ما بدأت. التشكيلة تنزل قبلها بساعة تقريبًا.' : 'ما صار شي يُذكر للحين.' })); return box; }
    if ((d.pressure || []).length) box.appendChild(h('button.mp-wave-wrap.f', null, waveOf(d)));
    var lane = h('div.mp-lane');
    list.slice().reverse().forEach(function (e) {
      if (!e.side) { lane.appendChild(h('button.mp-ev.mid.f', null, [h('span.mp-ev-line', null, [mark(e.kind), h('span', { text: WORD[e.kind] || e.text })])])); return; }
      var words = h('span.mp-ev-words', null, e.kind === 'sub'
        ? [h('b', { text: 'تبديل' }), h('small.mp-ev-sub', null, [h('i', { html: ICON.up }), h('span', { text: e.who || '' }), h('i', { html: ICON.down }), h('span', { text: e.also || '' })])]
        : [h('b', { text: e.who || WORD[e.kind] || '' }), h('small', { text: [WORD[e.kind], e.also && isGoal(e) ? 'صناعة ' + e.also : ''].filter(Boolean).join(' · ') })]);
      lane.appendChild(h('button.mp-ev.f.' + e.side + (isGoal(e) ? '.big' : ''), null, [h('span.mp-ev-min', { text: e.min }), h('span.mp-ev-body', null, [mark(e.kind), words])]));
    });
    box.appendChild(lane);
    return box;
  }
  /* both elevens on one pitch: the home side from the bottom, the away side from the top, each by its formation's lines */
  function lines(start, formation) {
    var gk = start.filter(function (p) { return /^G/.test(p.pos); })[0] || start.filter(function (p) { return p.place === 1; })[0] || start[0];
    var rest = start.filter(function (p) { return p !== gk; }).sort(function (a, b) { return (a.place || 99) - (b.place || 99); });
    var counts = /^\d+(-\d+)+$/.test(formation || '') ? formation.split('-').map(Number) : null;
    if (!counts || counts.reduce(function (s, n) { return s + n; }, 0) !== rest.length) counts = rest.length === 10 ? [4, 4, 2] : [rest.length];
    var out = [[gk]], at = 0;
    counts.forEach(function (n) { out.push(rest.slice(at, at + n)); at += n; });
    return out;
  }
  function marksOf(d) {
    var marks = {};
    shown(d).forEach(function (e) {
      var m = marks[e.who] = marks[e.who] || {};
      if (isGoal(e) && e.kind !== 'own') (m.goals = m.goals || []).push(e.min);
      if (e.kind === 'yellow') m.yellow = 1;
      if (e.kind === 'red' || e.kind === 'red2') m.red = 1;
      if (e.kind === 'sub') { m.off = e.min; (marks[e.also] = marks[e.also] || {}).on = e.min; }
    });
    return marks;
  }
  function lineupOf(d) {
    var box = h('div.mp-lineup');
    var lu = d.lineups || [];
    if (!lu.length) { box.appendChild(h('p.mp-empty', { text: 'التشكيلة ما نزلت للحين.' })); return box; }
    var marks = marksOf(d);
    var tags = {};
    var pitchEl = h('div.mp-pitch', null, [h('i.mp-pitch-half'), h('i.mp-pitch-circle'), h('i.mp-pitch-box.top'), h('i.mp-pitch-box.bottom')]);
    ['home', 'away'].forEach(function (side) {
      var l = lu.filter(function (x) { return x.side === side; })[0];
      if (!l || !l.start.length) return;
      var t = side === 'home' ? d.home : d.away, other = side === 'home' ? d.away : d.home, c = colourOf(t, other);
      var rows = lines(l.start, l.formation);
      rows.forEach(function (row, ri) {
        /* the home side's goal at the bottom (its lines climb to the middle), the away side's at the top */
        var y = side === 'home' ? 93 - ri * (35 / Math.max(1, rows.length - 1)) : 7 + ri * (35 / Math.max(1, rows.length - 1));
        row.forEach(function (p, pi) {
          var x = (pi + 1) * (100 / (row.length + 1));
          var mk = marks[p.name] || {};
          /* each player opens his numbers in this match */
          var dot = h('button.mp-man.f' + (mk.off ? '.off' : ''), { style: { left: (side === 'home' ? 100 - x : x) + '%', top: y + '%' }, onclick: function () { playerCard(d, p, side, mk); } }, [
            h('b.mp-man-num', { text: p.num || '·', style: { background: c, color: inkOn(c) } }),
            h('span.mp-man-name', { text: shortName(p) }),
            mk.goals ? h('i.mp-man-goal', { html: ICON.ball }) : null,
            mk.red ? h('i.mp-man-card.red') : mk.yellow ? h('i.mp-man-card.yellow') : null,
            mk.off ? h('i.mp-man-off', { html: ICON.down }) : null
          ]);
          pitchEl.appendChild(dot);
        });
      });
      tags[side] = h('span.mp-pitch-tag.' + side, null, [crest(t), h('span', { text: tn(t) }), l.formation ? h('bdi.mp-formation', { dir: 'ltr', text: l.formation }) : null]);
    });
    /* the away side's name over the pitch (it plays down from the top), the home side's under it */
    box.appendChild(h('div.mp-pitch-wrap', null, [tags.away || null, pitchEl, tags.home || null]));
    /* who came on, side by side */
    var bench = h('div.mp-bench');
    ['home', 'away'].forEach(function (side) {
      var l = lu.filter(function (x) { return x.side === side; })[0];
      if (!l) return;
      var came = l.bench.filter(function (p) { return (marks[p.name] || {}).on; });
      bench.appendChild(h('div.mp-bench-col', null, [h('h4', { text: 'دخلوا · ' + tn(side === 'home' ? d.home : d.away) })].concat(came.length ? came.map(function (p) {
        return h('span.mp-bench-man', null, [h('i', { html: ICON.up }), h('b', { text: p.num || '' }), h('span', { text: p.name })]);
      }) : [h('span.mp-bench-none', { text: 'ما فيه تبديل للحين' })])));
    });
    box.appendChild(h('button.mp-bench-wrap.f', null, bench));
    return box;
  }
  /* a player's numbers in this match, at the foot of the centre; Back puts it away */
  function playerCard(d, p, side, mk) {
    var host = centre && centre.el;
    if (!host) return;
    var t = side === 'home' ? d.home : d.away, c = colourOf(t, side === 'home' ? d.away : d.home), s = p.st || {};
    var chips = [['g', 'أهداف'], ['a', 'صناعة'], ['sh', 'تسديدات'], ['sot', 'على المرمى'], ['sv', 'تصديات'], ['fc', 'أخطاء'], ['fs', 'تعرّض لأخطاء'], ['yc', 'إنذار'], ['rc', 'طرد']].filter(function (k) { return s[k[0]]; });
    var card = h('div.mp-card', null, [
      h('div.mp-card-head', null, [h('b.mp-man-num', { text: p.num || '·', style: { background: c, color: inkOn(c) } }), h('span', null, [h('b', { text: p.name }), h('small', { text: tn(t) + (posAr(p.pos) ? ' · ' + posAr(p.pos) : '') })]), crest(t)]),
      chips.length ? h('div.mp-card-nums', null, chips.map(function (k) { return h('span', null, [h('b', { text: String(s[k[0]]) }), h('small', { text: k[1] })]); }))
        : h('p.mp-card-none', { text: 'ما سجّل أرقام في هالمباراة للحين' }),
      h('div.mp-card-notes', { text: [mk.goals ? 'سجّل في ' + mk.goals.map(ltr).join('، ') : '', mk.on ? 'دخل في ' + ltr(mk.on) : '', mk.off ? 'طلع في ' + ltr(mk.off) : ''].filter(Boolean).join(' · ') }),
      h('button.mp-c-btn.wide.f', { onclick: function () { CS.nav.pop(); } }, 'رجوع')
    ]);
    host.appendChild(card);
    CS.nav.push({ name: 'mp-card', el: card, modal: true, defaultFocus: function () { return card.querySelector('.f'); } });
  }
  /* ESPN's place on the pitch in words: «CF-R» is a forward, «LB» a full back */
  function posAr(pos) {
    var p = String(pos || '').toUpperCase().replace(/-[LRC]$/, '');
    return /^G/.test(p) ? 'حارس' : /^(LB|RB|LWB|RWB)$/.test(p) ? 'ظهير' : /^(CD|CB|D|SW)$/.test(p) ? 'مدافع' : /^(DM|CDM)$/.test(p) ? 'وسط دفاعي' : /^(AM|CAM)$/.test(p) ? 'وسط هجومي' :
      /^(LW|RW|LM|RM)$/.test(p) ? 'جناح' : /^(CM|M)$/.test(p) ? 'وسط' : /^(CF|ST|F|S)$/.test(p) ? 'مهاجم' : '';
  }
  function shortName(p) {
    var n = String(p.name || '').trim();
    if (/[\u0600-\u06FF]/.test(n)) { var w = n.split(/\s+/); return w.length > 1 && /^(عبد|أبو|ابو|بن|دي|دا|فان)$/.test(w[w.length - 2]) ? w.slice(-2).join(' ') : w[w.length - 1]; }
    return p.en || n;
  }
  function statsOf(d) {
    var box = h('div.mp-stats');
    if (!(d.stats || []).length) { box.appendChild(h('p.mp-empty', { text: 'الأرقام تبدأ مع صافرة البداية.' })); return box; }
    var hc = colourOf(d.home, d.away), ac = colourOf(d.away, d.home);
    d.stats.forEach(function (s) {
      var a = parseFloat(s.home) || 0, b = parseFloat(s.away) || 0, sum = a + b || 1;
      box.appendChild(h('button.mp-stat.f', null, [
        h('span.mp-stat-row', null, [h('b', { text: s.home }), h('span', { text: s.ar }), h('b', { text: s.away })]),
        h('span.mp-stat-bars', null, [h('i.home', { style: { width: Math.round(a / sum * 100) + '%', background: hc } }), h('i.away', { style: { width: Math.round(b / sum * 100) + '%', background: ac } })])
      ]));
    });
    return box;
  }
  /* the table as it would stand if the match ended as the picture has it now: both sides moved, the steps up or down marked */
  function liveTable(d) {
    var t = d.table, m = minute(d);
    if (!t || !t.rows.length) return null;
    if (m.state !== 'in' && m.state !== 'half') return { rows: t.rows.map(function (r) { return Object.assign({ move: 0 }, r); }), live: false };
    var sc = score(d), rows = t.rows.map(function (r) { return Object.assign({ was: r.pos }, r); });
    rows.forEach(function (r) {
      var mine = r.id === d.home.id ? 0 : r.id === d.away.id ? 1 : -1;
      if (mine < 0) return;
      var gf = sc[mine], ga = sc[1 - mine];
      r.pl += 1; r.gd += gf - ga; r.pts += gf > ga ? 3 : gf === ga ? 1 : 0;
    });
    rows.sort(function (a, b) { return b.pts - a.pts || b.gd - a.gd || a.was - b.was; });
    rows.forEach(function (r, i) { r.pos = i + 1; r.move = r.was - r.pos; });
    return { rows: rows, live: true };
  }
  function tableOf(d) {
    var box = h('div.mp-table');
    var t = liveTable(d);
    if (!t) { box.appendChild(h('p.mp-empty', { text: 'ما فيه ترتيب لهالبطولة.' })); return box; }
    if (t.live) box.appendChild(h('p.mp-tr-note', { text: 'الترتيب لو انتهت المباراة الحين' }));
    box.appendChild(h('div.mp-tr.head', null, [h('span', { text: '#' }), h('span', { text: 'الفريق' }), h('span', { text: 'لعب' }), h('span', { text: '+/-' }), h('span', { text: 'نقاط' })]));
    t.rows.forEach(function (r) {
      var mine = r.id === d.home.id ? 'home' : r.id === d.away.id ? 'away' : '';
      var mv = r.move > 0 ? h('i.mp-tr-move', { html: ICON.up }) : r.move < 0 ? h('i.mp-tr-move', { html: ICON.down }) : null;
      var row = h('button.mp-tr.f' + (mine ? '.mine' : ''), null, [h('span', null, [mv, h('span', { text: String(r.pos) })]), h('span.mp-tr-name', { text: mine ? tn(mine === 'home' ? d.home : d.away) : r.name }), h('span', { text: String(r.pl) }), h('span.ltr', { text: (r.gd > 0 ? '+' : '') + r.gd }), h('b', { text: String(r.pts) })]);
      if (mine) row.style.setProperty('--team', colourOf(mine === 'home' ? d.home : d.away, mine === 'home' ? d.away : d.home));
      box.appendChild(row);
    });
    return box;
  }
  /* the other matches on now, each its league, two sides and score */
  function othersOf() {
    var box = h('div.mp-others');
    var list = ((cur && cur.others) || []).filter(function (m) { return m.id !== (cur.data && cur.data.id); });
    if (!list.length) { box.appendChild(h('p.mp-empty', { text: cur && cur.others ? 'ما فيه مباريات ثانية مباشرة الحين.' : 'نجيب المباريات…' })); return box; }
    list.forEach(function (m) {
      box.appendChild(h('button.mp-om.f' + (m.state === 'in' ? '.live' : ''), null, [
        h('span.mp-om-league', { text: m.league || '' }),
        h('span.mp-om-side', null, [crest(m.home, 'tiny'), h('span', { text: tn(m.home) })]),
        h('b.mp-om-score', { text: (m.home.score != null ? m.home.score : '-') + ' - ' + (m.away.score != null ? m.away.score : '-') }),
        h('span.mp-om-side.away', null, [h('span', { text: tn(m.away) }), crest(m.away, 'tiny')]),
        h('span.mp-om-clock', { text: m.state === 'in' ? (m.clock || 'مباشر') : 'انتهت' })
      ]));
    });
    return box;
  }
  /* how far the picture runs behind the stadium: «شفته الحين», pressed as a goal or a whistle shows, sets it to the second */
  function syncNow() {
    if (!cur || !cur.data) return;
    var now = stadiumNow();
    var cands = (cur.data.events || []).filter(function (e) {
      if (!/^(goal|pen|own|kickoff|second|half|end|red|red2)$/.test(e.kind)) return false;
      var t = Date.parse(e.at || ''), ago = (now - t) / 1000;
      return !isNaN(t) && ago >= 2 && ago <= 300;
    }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
    var e = cands[0];
    if (!e) { CS.toast('اضغطه لحظة ما تشوف هدف أو صافرة في الصورة', 4000); return; }
    var secs = Math.round((now - Date.parse(e.at)) / 1000);
    CS.settings.matchDelay = Math.max(0, Math.min(300, secs));
    CS.saveSettings();
    CS.toast('ضبطناها على ' + (WORD[e.kind] || 'آخر لقطة') + ': البث متأخر ' + secs + ' ثانية', 4000);
    if (centre) centre.bodySig = '';
    check();
  }
  function footOf(foot) {
    foot.innerHTML = '';
    var s = Math.round(delayMs() / 1000), alerts = CS.settings.matchAlerts !== false;
    var set = function (v) { CS.settings.matchDelay = Math.max(0, Math.min(300, v)); CS.saveSettings(); paintStrip(); footOf(foot); if (centre) centre.bodySig = ''; check(); CS.nav.focus(foot.querySelectorAll('.f')[v < s ? 1 : 2], 'no-scroll'); };
    foot.appendChild(h('span.mp-c-sync', null, [h('b', { text: 'البث متأخر ' + s + ' ثانية' }), h('small', { text: 'اضغط «شفته» لحظة ما تشوف هدف أو صافرة' })]));
    foot.appendChild(h('button.mp-c-btn.seen.f', { onclick: function () { syncNow(); footOf(foot); CS.nav.focus(foot.querySelector('.seen'), 'no-scroll'); } }, [h('span.ico-wrap', { html: ICON.eye }), h('span', { text: 'شفته' })]));
    foot.appendChild(h('button.mp-c-btn.f', { 'aria-label': 'أقل', onclick: function () { set(s - 15); } }, '−15'));
    foot.appendChild(h('button.mp-c-btn.f', { 'aria-label': 'أكثر', onclick: function () { set(s + 15); } }, '+15'));
    foot.appendChild(h('button.mp-c-btn.wide.f' + (alerts ? '.on' : ''), { onclick: function () { CS.settings.matchAlerts = !alerts; CS.saveSettings(); footOf(foot); CS.nav.focus(foot.querySelector('.wide'), 'no-scroll'); } }, alerts ? 'التنبيهات: شغّالة' : 'التنبيهات: مطفّية'));
  }

  /* ================= the match's life while it plays ================= */
  function ask(id) {
    var me = cur;
    return CS.fetchJson(CS.config.hubUrl + '/sport/play/' + id, { timeout: 15000, cache: 'no-store' }).then(function (d) {
      if (cur !== me || !d || d.error || !d.home) return;
      var t = Date.parse(d.now);
      if (!isNaN(t)) me.offset = t - Date.now();
      var fresh = (d.events || []).filter(function (e) { return !me.firstSeen[keyOf(e)]; });
      fresh.forEach(function (e) { me.firstSeen[keyOf(e)] = Date.now() + me.offset; });
      var first = !me.data, goals = fresh.filter(isGoal);
      if (!first && goals.length === 1) {
        var dh = (d.home.score || 0) - (me.data.home.score || 0), da = (d.away.score || 0) - (me.data.away.score || 0);
        if (dh + da === 1) me.credit[keyOf(goals[0])] = dh ? 'home' : 'away';
      }
      /* the official elevens, the moment they come out before kick-off */
      var hadLineups = me.data && (me.data.lineups || []).some(function (l) { return l.start.length; });
      var hasLineups = (d.lineups || []).some(function (l) { return l.start.length; });
      me.data = d;
      if (!first && !hadLineups && hasLineups && d.state === 'pre' && CS.settings.matchAlerts !== false) {
        tell({ kind: 'lineup', side: '', title: 'نزلت التشكيلة', who: scoreWords(d, ['', '']).replace(/\s+-\s+/, ' ضد '), sub: d.lineups.map(function (l) { return tn(l.side === 'home' ? d.home : d.away) + ' ' + ltr(l.formation || ''); }).join(' · ') });
      }
      if (first) {
        /* what already happened before the viewer joined is not told again as it comes on screen */
        me.joinedAt = Date.now() + me.offset - delayMs();
        (d.events || []).forEach(function (e) { if (visible(e)) me.told[keyOf(e)] = 1; });
        CS.log('match found', d.id, d.home.name, '-', d.away.name, d.state);
        if (desk()) host({ t: 'match-on', on: true });
        if (CS.player && CS.player.refreshButtons) CS.player.refreshButtons();
      }
      check();
    }, function (e) { CS.log('match not read', e.message); });
  }
  /* the other matches on now, each minute: the centre lists them, and a goal for a favourite side there is told */
  function favouriteIds() {
    var box = CS.sw && CS.sw.box ? CS.sw.box() : null, ids = {};
    ((box && box.list) || []).forEach(function (f) { if (f.kind === 'team' || f.kind === 'nation') ids[String(f.id)] = 1; });
    return ids;
  }
  function askOthers() {
    var me = cur;
    return CS.fetchJson(CS.config.hubUrl + '/sport/now', { timeout: 15000, cache: 'no-store' }).then(function (r) {
      if (cur !== me || !r || !r.matches) return;
      var fav = favouriteIds(), was = {};
      (me.others || []).forEach(function (m) { was[m.id] = m; });
      r.matches.forEach(function (m) {
        var old = was[m.id];
        if (!old || m.id === (me.data && me.data.id) || CS.settings.matchAlerts === false) return;
        [['home', 0], ['away', 1]].forEach(function (x) {
          var side = m[x[0]], before = old[x[0]].score || 0;
          if ((side.score || 0) > before && (fav[side.id] || fav[(x[1] ? m.home : m.away).id])) {
            tell({ kind: 'other', team: side, title: 'هدف في مباراة ثانية · ' + tn(side), who: tn(m.home) + ' ' + (m.home.score || 0) + ' - ' + (m.away.score || 0) + ' ' + tn(m.away), sub: [m.league, ltr(m.clock)].filter(Boolean).join(' · '), score: [m.home.score || 0, m.away.score || 0], pair: [m.home, m.away] });
          }
        });
      });
      me.others = r.matches;
      me.othersAt = r.at;
    }, function () { /* tried again next minute */ });
  }
  function start(meta) {
    stop();
    if (!CS.config.hubUrl || !meta) return;
    mount();
    var me = cur = { meta: meta, data: null, offset: 0, firstSeen: {}, told: {}, credit: {}, joinedAt: Date.now() - delayMs(), timers: [], others: null };
    var id = hints[meta.id];
    var found = id ? Promise.resolve(id) : CS.fetchJson(CS.config.hubUrl + '/sport/find?q=' + encodeURIComponent(meta.name || ''), { timeout: 12000 }).then(function (r) { return r && r.match && r.match.id; }, function () { return null; });
    found.then(function (mid) {
      if (cur !== me) return;
      if (!mid) { CS.log('no match for this stream', meta.name); cur = null; return; }
      me.id = mid;
      ask(mid).then(function () { if (cur === me) setTimeout(catchUp, 2500); });
      askOthers();
      me.timers.push(setInterval(function () { ask(mid); }, 25000));
      me.timers.push(setInterval(function () { askOthers(); }, 60000));
      me.timers.push(setInterval(function () { if (cur === me) check(); }, 1000));
    });
  }
  function stop() {
    if (cur) cur.timers.forEach(clearInterval);
    if (cur && cur.data && desk()) host({ t: 'match-on', on: false });
    cur = null;
    queue = [];
    showing = false;
    if (alertEl) alertEl.innerHTML = '';
    hideStudio();
    if (stripEl) { stripEl.innerHTML = ''; stripEl.className = ''; }
    while (CS.nav.top() && (CS.nav.top().name === 'mp-card' || CS.nav.top().name === 'mp-centre')) CS.nav.pop();
  }
  /* the player's keys while the studio is up: Back puts it away (not the video), OK opens the match centre */
  function keys(e) {
    if (!studioOn()) return false;
    if (CS.isBack(e)) { hideStudio(); return true; }
    if (e.keyCode === CS.KEY.OK) { openCentre(); return true; }
    return false;
  }

  CS.matchplay = {
    /* the sports world names the match of the stream it starts (its ESPN event) */
    hint: function (item, eventId) { if (item && item.id && eventId) hints[item.id] = String(eventId); },
    start: start, stop: stop, open: openCentre, keys: keys,
    active: function () { return !!(cur && cur.data); },
    /* for the tests, and the replays (replays.js) */
    _: { lines: lines, minute: minute, score: score, set: function (c) { cur = c; }, get: function () { return cur; }, tell: function (o) { tell(o); }, keyOf: keyOf,
      liveTable: liveTable, bestOf: bestOf, waveOf: waveOf, studio: studio, syncNow: syncNow }
  };
})();
