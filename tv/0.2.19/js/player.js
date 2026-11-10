/* The player: the file plays straight on the TV (Dolby Vision and Atmos kept), subtitles from subs.js, the remote,
   continue-watching saves, and the next episode readied before the end. */
(function () {
  var v, box, osd, P = null; /* P = what is playing now */
  var hideTimer = 0, saveTick = 0, lastPos = 0, seekAcc = 0, seekTimer = 0, seekTarget = null;

  function el(id) { return CS.$(id); }

  function showOsd(ms) {
    if (!el('osd-buttons').children.length) buttons();
    updateBar();
    osd.classList.add('on');
    el('player').classList.add('osd-on');
    clearTimeout(hideTimer);
    if (ms !== 0) hideTimer = setTimeout(function () { if (!v.paused && !panelOpen()) hideOsd(); }, ms || 4500);
  }
  function hideOsd() { osd.classList.remove('on'); el('player').classList.remove('osd-on'); clearTimeout(hideTimer); }
  function panelOpen() { return !el('panel').classList.contains('hidden'); }

  function spin(on, text) {
    el('player-spin').classList.toggle('on', !!on);
    el('player-spin-text').textContent = text || '';
  }
  function spinning() { return el('player-spin').classList.contains('on'); }
  /* while it waits: how much of the next few seconds is already here (6 s ahead = ready to go on) */
  function loadingText() {
    var ahead = 0;
    try {
      var b = v.buffered;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + .5 && b.end(i) > v.currentTime) ahead = b.end(i) - v.currentTime;
    } catch (e) { /* nothing yet */ }
    return 'يحمّل… ' + Math.min(99, Math.round(ahead / 6 * 100)) + '٪';
  }

  function updateBar() {
    if (!P) return;
    var d = v.duration || P.duration || 0, c = seekTarget != null ? seekTarget : v.currentTime;
    el('osd-cur').textContent = CS.fmtTime(c);
    el('osd-dur').textContent = d ? '-' + CS.fmtTime(d - c) : '';
    var pc = d ? Math.min(100, c / d * 100) : 0;
    el('osd-fill').style.width = pc + '%';
    el('osd-knob').style.left = pc + '%';
    var tip = el('osd-tip');
    if (seekTarget != null) { tip.textContent = CS.fmtTime(seekTarget); tip.style.left = pc + '%'; tip.classList.add('on'); }
    else tip.classList.remove('on');
    try {
      var b = v.buffered, end = 0;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 1 && b.end(i) > end) end = b.end(i);
      el('osd-buf').style.width = (d ? Math.min(100, end / d * 100) : 0) + '%';
    } catch (e) { /* nothing buffered yet */ }
  }

  /* the bar comes up with the focus on the time line: right and left seek there, down goes to the buttons */
  function openOsd(ms) {
    showOsd(ms);
    var bar = el('osd-bar');
    if (CS.nav.current() !== bar) CS.nav.focus(bar, 'no-scroll');
  }
  function onBar() { return CS.nav.current() === el('osd-bar'); }

  /* ---------- seeking with the arrows: each press adds a step, the jump happens when you stop pressing ---------- */
  function seekBy(sec) {
    if (!P || !v.duration) return;
    if (seekTarget == null) { seekTarget = v.currentTime; seekAcc = 0; }
    seekAcc++;
    var base = Math.abs(sec) * (CS.settings.seekStep || 10) / 10; /* sec is in the default 10 s step: 10 = one step, 30 = three */
    var step = !CS.settings.seekSpeedup ? base : seekAcc > 12 ? base * 6 : seekAcc > 5 ? base * 3 : base;
    seekTarget = Math.max(0, Math.min(v.duration - 2, seekTarget + (sec > 0 ? step : -step)));
    openOsd();
    updateBar();
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () {
      var t = seekTarget;
      seekTarget = null;
      seekAcc = 0;
      if (t != null) { v.currentTime = t; CS.log('seek to', Math.round(t)); }
      updateBar();
    }, 650);
  }

  function seekToPointer(e, jump) {
    if (!P || !v.duration) return;
    var r = el('osd-bar').getBoundingClientRect();
    var f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var t = f * v.duration;
    var tip = el('osd-tip');
    tip.textContent = CS.fmtTime(t);
    tip.style.left = f * 100 + '%';
    tip.classList.add('on');
    if (!jump) return;
    clearTimeout(seekTimer);
    seekTarget = null;
    seekAcc = 0;
    v.currentTime = Math.min(t, v.duration - 2);
    CS.log('seek by pointer to', Math.round(t));
    updateBar();
  }

  /* ---------- buttons on the bar ---------- */
  function buttons() {
    var b = el('osd-buttons');
    b.innerHTML = '';
    var list = [
      { id: 'play', label: CS.iconKids(v.paused ? 'play' : 'pause', v.paused ? 'تشغيل' : 'إيقاف مؤقت'), act: togglePlay },
      { id: 'subs', label: 'الترجمة', act: subsPanel },
      { id: 'delay', label: 'توقيت الترجمة', act: delayPanel },
      { id: 'audio', label: 'الصوت', act: audioPanel },
      { id: 'source', label: 'المصدر', act: function () { var me = P; leave(false).then(function () { CS.player.close(); CS.views.streams(me.meta, me.video, { current: me.stream }); }); } }
    ];
    if (P && P.next) list.push({ id: 'next', label: 'الحلقة التالية', act: function () { playNext(); } });
    list.forEach(function (x) {
      var btn = CS.h('button.osd-btn.f', { 'data-id': x.id, onclick: function () { x.act(); } }, x.label);
      b.appendChild(btn);
    });
    return b;
  }

  function togglePlay() {
    if (!P) return;
    if (v.paused) v.play().catch(function (e) { CS.log('play refused', e.message); });
    else { v.pause(); CS.lib.flush(); }
    showOsd(v.paused ? 0 : 3000);
    var pb = el('osd-buttons').querySelector('[data-id=play]');
    if (pb) CS.setIcon(pb, v.paused ? 'play' : 'pause', v.paused ? 'تشغيل' : 'إيقاف مؤقت');
  }

  /* ---------- side panels (subtitles, timing, audio) ---------- */
  function openPanel(title, rows, focusIdx) {
    var p = el('panel');
    p.innerHTML = '';
    p.appendChild(CS.h('h3', { text: title }));
    var list = CS.h('div.panel-list.vscroll', null, CS.h('div.vtrack'));
    rows.forEach(function (r) {
      list.firstChild.appendChild(CS.h('button.panel-row.f' + (r.on ? '.on' : '') + (r.dim ? '.dim' : ''), { onclick: function () { r.act(); } }, [
        CS.h('span.panel-main', null, r.on ? CS.iconKids('check', r.label) : r.label), r.note ? CS.h('span.panel-note', { text: r.note }) : null
      ]));
    });
    p.appendChild(list);
    p.classList.remove('hidden');
    showOsd(0);
    var scr = {
      name: 'panel', modal: true, el: p, keep: true,
      focusRoot: function () { return p; },
      defaultFocus: function () { var all = p.querySelectorAll('.f'); return all[focusIdx || 0] || all[0]; },
      destroy: function () { p.classList.add('hidden'); showOsd(); }
    };
    CS.nav.push(scr);
  }
  function closePanel() { if (CS.nav.top() && CS.nav.top().name === 'panel') CS.nav.pop(); }

  function subLabel(s, i) { return CS.session.subLabel(s, i); }

  function subsPanel() {
    if (!P) return;
    var rows = [{ label: 'بدون ترجمة', on: !P.sub, act: function () { chooseSub(null, true); closePanel(); } }];
    var focus = 0;
    var shares = P.match || {}, top = 0;
    Object.keys(shares).forEach(function (u) { if (shares[u] > top) top = shares[u]; });
    /* how well each one fits this file; for a file with nothing to compare with, the panel's title says so */
    var matchNote = function (s) {
      var v = shares[s.url];
      if (v == null) return P.matchFor && P.matchFor[s.url] && P.matchBusy || '';
      if (!v) return 'ما تطابقت مع ملفك';
      return 'تطابق ' + Math.round(v * 100) + '%' + (v === top ? ' · الأفضل' : '');
    };
    var place = 0;
    P.subList.forEach(function (s, i) {
      if (P.fitGone && CS.subs.isFitted(s)) return; /* the PC cannot be reached from here: these would not play */
      var l = subLabel(s, place++);
      if (P.sub === s) focus = rows.length;
      var match = matchNote(s);
      /* our own add-on's name on every row says nothing */
      var ours = s._addon && s._addon.manifest.id === CS.addons.SUBS_ID && !CS.subs.isFitted(s);
      var note = [match, match || ours ? '' : l.note, P.subFailed[s.url] ? 'ما اشتغلت' : ''].filter(Boolean).join(' · ');
      rows.push({ label: l.label, note: note, on: P.sub === s, dim: !!P.subFailed[s.url], act: function () { chooseSub(s, true); closePanel(); } });
    });
    if (!P.subList.length) rows.push({ label: P.subsLoading ? 'ندوّر على ترجمات…' : 'ما فيه ترجمة عربية لهالحلقة', act: function () { closePanel(); } });
    openPanel('الترجمة' + (P.matchNone && !top ? ' — ما نقدر نحسب التطابق لهالملف' : ''), rows, focus);
  }

  function delayText(ms) {
    if (!ms) return 'في وقتها';
    return (ms < 0 ? 'أبكر ' : 'أبطأ ') + (Math.abs(ms) / 1000).toFixed(1) + ' ث';
  }
  function nudgeDelay(ms) {
    if (!P) return;
    P.renderer.delay = Math.round((P.renderer.delay + ms) / 100) * 100;
    CS.settings.subOffsets[P.meta.id] = P.renderer.delay;
    CS.saveSettings();
    var n = el('sub-nudge');
    n.textContent = 'الترجمة: ' + delayText(P.renderer.delay);
    n.classList.remove('hidden');
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.classList.add('hidden'); }, 1800);
    P.renderer.shown = null;
  }
  function delayPanel() {
    if (!P) return;
    var rows = [
      { label: 'أبكر 0.1 ثانية', note: 'CH+', act: function () { nudgeDelay(-100); delayPanel(); } },
      { label: 'أبطأ 0.1 ثانية', note: 'CH−', act: function () { nudgeDelay(100); delayPanel(); } },
      { label: 'أبكر 0.5 ثانية', act: function () { nudgeDelay(-500); delayPanel(); } },
      { label: 'أبطأ 0.5 ثانية', act: function () { nudgeDelay(500); delayPanel(); } },
      { label: 'رجّعها لوقتها', note: delayText(P.renderer.delay), act: function () { nudgeDelay(-P.renderer.delay); delayPanel(); } }
    ];
    var keep = CS.nav.top() && CS.nav.top().name === 'panel' ? CS.nav.current() : null;
    var idx = keep ? Array.prototype.indexOf.call(el('panel').querySelectorAll('.f'), keep) : 0;
    closePanel();
    openPanel('توقيت الترجمة — ' + delayText(P.renderer.delay) + ' (ينحفظ لهالعنوان)', rows, Math.max(0, idx));
  }

  function audioTracks() {
    var t = v.audioTracks, out = [];
    if (!t) return out;
    for (var i = 0; i < t.length; i++) out.push(t[i]);
    return out;
  }
  function audioPanel() {
    var tracks = audioTracks();
    var rows = tracks.map(function (t, i) {
      var lang = (t.language || '').toLowerCase();
      var name = [CS.session.langName(lang) || (lang && lang !== 'und' ? lang : ''), t.label].filter(Boolean).join(' · ') || 'مسار ' + (i + 1);
      return { label: name, on: t.enabled, act: function () { tracks.forEach(function (x, j) { x.enabled = j === i; }); CS.log('audio track', i, name); closePanel(); } };
    });
    if (!rows.length) rows.push({ label: 'مسار صوت واحد', on: true, act: closePanel });
    openPanel('الصوت', rows, Math.max(0, tracks.findIndex(function (t) { return t.enabled; })));
  }
  function pickAudioByLanguage() {
    var want = CS.settings.audioLang;
    if (!want || want === 'original') return;
    var tracks = audioTracks();
    var codes = want === 'ara' ? ['ar', 'ara', 'arabic'] : ['en', 'eng', 'english'];
    var k = tracks.findIndex(function (t) { return codes.indexOf((t.language || '').toLowerCase()) >= 0 || codes.indexOf((t.label || '').toLowerCase()) >= 0; });
    if (k >= 0 && !tracks[k].enabled) { tracks.forEach(function (x, j) { x.enabled = j === k; }); CS.log('audio language picked', want, k); }
  }

  /* ---------- subtitles for this video ---------- */
  function chooseSub(s, byUser) {
    if (!P) return;
    var me = P;
    if (byUser) P.subPicked = true;
    /* picked while the fitted one was still on its way: that wait stops here, so the shares are worked out now */
    if (byUser) measure(me, P.subGroups);
    P.sub = s;
    if (!s) { P.renderer.set([]); return; }
    if (P.fittedCues && P.fittedCues[s.url]) { /* already fitted to this file line by line */
      P.renderer.set(P.fittedCues[s.url]);
      if (byUser) CS.toast('الترجمة: ' + subLabel(s, P.subList.indexOf(s)).label);
      return;
    }
    var t0 = Date.now();
    if (byUser && CS.subs.isFitted(s)) CS.toast('كمبيوترك يضبط الترجمة على ملف الحلقة… يمكن ياخذ دقيقة');
    CS.subs.load(s.url).then(function (cues) {
      if (P !== me || P.sub !== s) return;
      if (!cues.length) throw new Error('empty');
      P.renderer.set(cues);
      CS.log('subtitle on', String(s.id).slice(0, 40), cues.length + ' lines', (Date.now() - t0) + 'ms');
      if (byUser) CS.toast('الترجمة: ' + subLabel(s, P.subList.indexOf(s)).label);
    }).catch(function (e) {
      if (P !== me) return;
      P.subFailed[s.url] = 1;
      CS.log('subtitle failed', String(s.id).slice(0, 40), e.message || e.name);
      if (P.sub !== s) return;
      /* try the next one by itself */
      var next = P.subList.filter(function (x) { return !P.subFailed[x.url] && !CS.subs.isFitted(x); })[0];
      if (next && !byUser) chooseSub(next, false);
      else if (byUser) CS.toast('هالترجمة ما اشتغلت، جرّب غيرها');
    });
  }

  /* no fitted subtitle from a PC: the file's own subtitle track is read through its index (mkvindex.js), slowly, while the video plays.
     Then each Arabic subtitle is fitted to it and the best one takes over, without a stop. A file with no such index stays as it is. */
  function fitFromFile(me, list) {
    var M = CS.mkvIndex;
    if (!M || !CS.linefit || !window.AbortController || !window.TextDecoder || me.fitStarted || !list.length) return;
    me.fitStarted = true;
    me.match = me.match || {};
    me.matchFor = me.matchFor || {};
    list.forEach(function (s) { me.matchFor[s.url] = 1; });
    me.matchBusy = 'نحسب التطابق، ياخذ كم دقيقة'; /* the file's track is read slowly, to stay within the file server's limits */
    var alive = function () { return P === me; }, t0 = Date.now();
    /* the video opens first, and a source left at once costs no reads */
    setTimeout(function () {
      if (!alive()) return;
      M.read(M.pageRead(me.stream.url), alive, function (t) { CS.streams.remember(me.stream, t); }).then(function (out) {
        if (!alive()) return;
        CS.log('file track read', out ? out.lines.length + ' lines, ' + out.requests + ' reads, ' + Math.round((Date.now() - t0) / 1000) + 's' : 'not possible for this file');
        if (!out) { me.matchBusy = ''; me.matchNone = true; return; }
        var best = null, k = 0;
        me.fittedCues = me.fittedCues || {};
        var next = function () {
          if (!alive()) return;
          if (k >= list.length) {
            me.matchBusy = '';
            if (best && !me.subPicked && CS.settings.subAuto) {
              me.sub = best.s;
              me.renderer.set(best.cues);
              CS.toast('ضبطنا الترجمة على ملف الحلقة');
            }
            return;
          }
          var s = list[k++], t1 = Date.now();
          CS.subs.load(s.url).then(function (cues) {
            if (!alive()) return;
            var f = M.fitCues(cues, out.lines);
            CS.log('line fit', String(s.id).slice(0, 30), f ? Math.round(f.paired * 100) + '% paired' : 'not fitted', (Date.now() - t1) + 'ms');
            me.match[s.url] = f ? f.share : 0;
            if (!f) return;
            me.fittedCues[s.url] = f.cues;
            if (me.subPicked && me.sub === s) me.renderer.set(f.cues); /* the viewer's own choice gets its fitted lines too */
            if (!best || f.share > best.share) best = { s: s, cues: f.cues, share: f.share };
          }).catch(function (e) { CS.log('line fit failed', e.message || e.name); }).then(function () { setTimeout(next, 200); });
        };
        next();
      }).catch(function (e) {
        if (!alive()) return;
        me.matchBusy = '';
        me.matchNone = true;
        CS.log('file track not read', e.message || e.name);
      });
    }, 20000);
  }

  /* a speeder on this TV's own home network (Settings, «عنوان كمبيوترك»): a friend with the fitter on their own PC. Our Arabic
     add-on gives fitted rows only for the owner's PC, so here the links are made by the app. done(true): it fitted at least one */
  function fitNearby(me, all, done) {
    /* the owner's own PC is reached through the add-on's rows already: one that failed there would fail here too */
    var base = CS.settings.pc && CS.settings.pc !== CS.config.homePc ? CS.pcUrl(CS.config.ports.speeder) : '';
    var list = all.filter(function (s) { return !CS.subs.isFitted(s); }).slice(0, 16);
    if (!base || !me.stream.file || !list.length) { done(false); return; }
    var alive = function () { return P === me; };
    CS.fetchJson(base + '/manifest.json', { timeout: 2500, cache: 'no-store' }).then(function (m) {
      if (!alive()) return;
      if (!m || m.id !== CS.config.speederId) { done(false); return; }
      var fit = { url: CS.subs.jobLink(base, { t: me.meta.type, id: me.video.id, f: me.stream.file, u: list[0].url, s: 0, own: true }) };
      var best = null, got = 0;
      me.match = me.match || {};
      me.fittedCues = me.fittedCues || {};
      me.matchFor = {};
      list.forEach(function (s) { me.matchFor[s.url] = 1; });
      me.matchBusy = 'نحسب التطابق…';
      CS.log('fitting on this home network\'s PC', list.length + ' subtitles');
      CS.subs.fitAll(fit, list, alive, function (s, r) {
        me.match[s.url] = r.share;
        if (!r.cues.length) return;
        got++;
        me.fittedCues[s.url] = r.cues;
        if (me.subPicked && me.sub === s) me.renderer.set(r.cues); /* the viewer's own choice gets its fitted lines too */
        if (r.share != null && (!best || r.share > best.share)) best = { s: s, cues: r.cues, share: r.share };
      }).then(function () {
        if (!alive()) return;
        me.matchBusy = '';
        if (best && !me.subPicked && CS.settings.subAuto) {
          me.sub = best.s;
          me.renderer.set(best.cues);
          CS.toast('ضبطنا الترجمة على ملف الحلقة');
        }
        done(got > 0);
      });
    }, function () { if (alive()) done(false); });
  }

  /* the PC cannot be reached from here: a fitter on this home network first, then with the owner's code the hub, and the file's own
     track is read only if both are away */
  function fitElsewhere(me, list, all) {
    if (me.nearbyTried) { fitAway(me, list, all); return; }
    me.nearbyTried = true;
    fitNearby(me, all, function (ok) { if (!ok && P === me) fitAway(me, list, all); });
  }

  function fitAway(me, list, all) {
    if (!CS.subs.hubOn() || !me.stream.file) { fitFromFile(me, list); return; }
    var best = null, WAITING = 'ننتظر ضبط الترجمة…';
    me.match = me.match || {};
    me.fittedCues = me.fittedCues || {};
    me.matchFor = {};
    all.forEach(function (s) { me.matchFor[s.url] = 1; });
    me.matchBusy = WAITING;
    CS.subs.hubFit({ t: me.meta.type, id: me.video.id, f: me.stream.file }, all, function () { return P === me; }, {
      one: function (s, r) {
        me.match[s.url] = r.share;
        if (!r.cues.length) return;
        me.fittedCues[s.url] = r.cues;
        if (me.subPicked && me.sub === s) me.renderer.set(r.cues);
        if (r.share != null && (!best || r.share > best.share)) best = { s: s, cues: r.cues, share: r.share };
      },
      asleep: function () { fitFromFile(me, list); },
      bad: function () { CS.toast('رمز ضبط الترجمة غير صحيح'); fitFromFile(me, list); },
      end: function () {
        if (me.matchBusy === WAITING) me.matchBusy = '';
        if (best && !me.subPicked && CS.settings.subAuto) {
          me.sub = best.s;
          me.renderer.set(best.cues);
          CS.toast('ضبطنا الترجمة على ملف الحلقة');
        }
      }
    });
  }

  /* the PC is there: the other subtitles are fitted by it too, so any of them can be chosen, each with its match share */
  function fitTheRest(me, fit, list) {
    me.match = {};
    me.fittedCues = me.fittedCues || {};
    me.matchFor = {};
    list.forEach(function (s) { me.matchFor[s.url] = 1; });
    me.matchBusy = 'نحسب التطابق…';
    CS.subs.fitAll(fit, list, function () { return P === me; }, function (s, r) {
      me.match[s.url] = r.share;
      if (CS.subs.isFitted(s) || !r.cues.length) return;
      me.fittedCues[s.url] = r.cues;
      if (me.subPicked && me.sub === s) me.renderer.set(r.cues); /* the viewer's own choice gets its fitted lines too */
    }).then(function () { me.matchBusy = ''; });
  }

  /* the match shares of the list, without choosing for the viewer: with the automatic choice off, or once the viewer picked one
     before the fitted subtitle came. Before, neither case worked any share out, so the list showed none. Once per video. */
  function measure(me, g) {
    if (me.measured || !g || P !== me) return;
    me.measured = true;
    var fit = g.fitted[0], all = g.plain.concat(g.others), toFit = all.slice(0, 6);
    if (!fit || me.fitGone) { fitElsewhere(me, toFit, all); return; }
    var home = (/^(https?:\/\/[^\/]+)/.exec(fit.url) || [])[1];
    CS.fetchText(home + '/manifest.json', { timeout: 2500, cache: 'no-store' }).then(function () {
      if (P === me) fitTheRest(me, fit, g.list);
    }, function () {
      if (P !== me) return;
      me.fitGone = true; /* the PC is not around: its rows would not play */
      fitElsewhere(me, toFit, all);
    });
  }

  function loadSubs() {
    var me = P;
    P.subsLoading = true;
    CS.session.findSubs(P.meta, P.video, P.stream).then(function (g) {
      if (P !== me) return;
      P.subsLoading = false;
      P.subList = g.list;
      P.subGroups = g;
      if (!CS.settings.subAuto || P.subPicked) { measure(me, g); return; }
      var first = g.plain[0] || g.others[0];
      var fit = g.fitted[0];
      var toFit = g.plain.concat(g.others).slice(0, 6);
      if (!fit) {
        if (first) chooseSub(first, false);
        me.measured = true;
        fitElsewhere(me, toFit, g.plain.concat(g.others));
        return;
      }
      /* the one fitted to this very file comes first, and is waited for: a line off by seconds is worse than a moment with none.
         A PC that is off is known in seconds; one that takes long gets a stand-in until it is done */
      var t0 = Date.now();
      P.sub = fit;
      CS.subs.waitFitted(fit.url, function () { return P === me && !P.subPicked; }, {
        ready: function (cues, tries) {
          P.sub = fit;
          P.renderer.set(cues);
          CS.log('subtitle fitted to the file is on', cues.length + ' lines', (Date.now() - t0) + 'ms', 'try ' + tries);
          CS.toast('ضبطنا الترجمة على ملف الحلقة');
          me.measured = true;
          fitTheRest(me, fit, g.list);
        },
        slow: function () {
          if (!first) return;
          chooseSub(first, false);
          CS.toast('الضبط طوّل، نعرض ترجمة مؤقتة لين يخلص');
        },
        gone: function () {
          P.subFailed[fit.url] = 1;
          P.fitGone = true;
          if (first && P.sub === fit) chooseSub(first, false);
          me.measured = true;
          fitElsewhere(me, toFit, g.plain.concat(g.others));
        }
      });
    });
  }

  /* ---------- saving progress ---------- */
  function save(force) {
    if (!P || !v.duration || P.ended) return Promise.resolve();
    var pos = v.currentTime, played = 0;
    if (!v.paused && lastPos) played = Math.max(0, Math.min(15, pos - lastPos));
    lastPos = pos;
    var p = CS.lib.progress(P.meta, P.video.id, pos, v.duration, played);
    return force ? p.then(CS.lib.flush) : p;
  }

  /* ---------- the next episode ---------- */
  function prepareNext() {
    if (!P || !P.next || P.nextPrep) return;
    P.nextPrep = CS.session.nextSource(P.meta, P.next, P.stream);
  }
  function nextCard(sec) {
    var c = el('next-card');
    if (!P || !P.next) { c.classList.add('hidden'); return; }
    c.innerHTML = '';
    c.appendChild(CS.h('div.next-label', { text: 'الحلقة التالية' }));
    c.appendChild(CS.h('div.next-name', { text: CS.epLabel(P.next.season, P.next.episode) + (P.next.title ? ' · ' + P.next.title : '') }));
    c.appendChild(CS.h('div.next-count', { text: sec > 0 ? 'تبدأ بعد ' + sec + ' ث — OK الحين، رجوع للإلغاء' : 'OK للتشغيل' }));
    c.classList.remove('hidden');
  }
  /* once per episode: the countdown, the end of the file and the button can all ask for it */
  function playNext() {
    if (!P || !P.next || P.ended) return;
    var meta = P.meta, nv = P.next, prev = P.stream;
    var prep = P.nextPrep || Promise.resolve(null);
    CS.lib.finished(meta, P.video.id, nv.id);
    P.ended = true;
    spin(true, 'الحلقة التالية…');
    prep.then(function (r) {
      if (r && r.pick) return CS.player.play(meta, nv, r.pick, { list: r.list });
      return CS.session.nextSource(meta, nv, prev).then(function (r2) {
        if (!r2.pick) { CS.toast('ما فيه مصدر للحلقة التالية'); return CS.player.stop(); }
        return CS.player.play(meta, nv, r2.pick, { list: r2.list });
      });
    });
  }

  /* ---------- leaving ---------- */
  function leave(finishedNow) {
    if (!P) return Promise.resolve();
    var me = P;
    var d = v.duration || 0, c = v.currentTime || 0;
    var done = finishedNow || CS.session.isFinished(c, d);
    var p = done && !me.ended ? CS.lib.finished(me.meta, me.video.id, me.next ? me.next.id : null) : save(true);
    me.ended = true;
    me.renderer.stop();
    clearInterval(saveTick);
    clearInterval(me.nextTimer);
    try { v.pause(); } catch (e) { /* already stopped */ }
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* nothing loaded */ }
    if (P === me) P = null;
    el('next-card').classList.add('hidden');
    return p.then(CS.lib.flush);
  }

  /* ---------- the player screen ---------- */
  var screen = {
    name: 'player', keep: true,
    focusRoot: function () { return osd; },
    shown: function () { },
    keys: function (e) {
      var k = e.keyCode, K = CS.KEY;
      if (!P) return false;
      var nc = el('next-card');
      if (!nc.classList.contains('hidden') && P.nextCountdown != null) {
        if (k === K.OK) { clearInterval(P.nextTimer); playNext(); return true; }
        if (CS.isBack(e)) { clearInterval(P.nextTimer); P.nextCountdown = null; P.cardDismissed = true; nc.classList.add('hidden'); return true; }
      }
      if (k === K.PLAY) { if (v.paused) togglePlay(); return true; }
      if (k === K.PAUSE) { if (!v.paused) togglePlay(); return true; }
      if (k === K.PLAYPAUSE || k === K.SPACE) { togglePlay(); return true; }
      if (k === K.STOP) { CS.player.stop(); return true; }
      if (k === K.FF) { seekBy(30); return true; }
      if (k === K.REW) { seekBy(-30); return true; }
      if (k === K.CHUP || k === K.RED) { nudgeDelay(-100); return true; }
      if (k === K.CHDOWN || k === K.GREEN) { nudgeDelay(100); return true; }
      if (k === K.YELLOW) { subsPanel(); return true; }
      if (k === K.BLUE || k === K.INFO) { toggleDebug(); return true; }
      var on = osd.classList.contains('on');
      if (!on) {
        if (k === K.LEFT) { seekBy(-10); return true; }
        if (k === K.RIGHT) { seekBy(10); return true; }
        if (k === K.OK) { togglePlay(); openOsd(); return true; }
        if (k === K.UP || k === K.DOWN) { openOsd(); return true; }
        if (CS.isBack(e)) { CS.player.stop(); return true; }
        return true;
      }
      if (CS.isBack(e)) { hideOsd(); return true; }
      var cur = CS.nav.current();
      var inButtons = cur && cur.classList.contains('osd-btn');
      if (!inButtons) {
        /* on the time line (or nowhere yet) */
        showOsd();
        if (!onBar()) CS.nav.focus(el('osd-bar'), 'no-scroll');
        if (k === K.LEFT) { seekBy(-10); return true; }
        if (k === K.RIGHT) { seekBy(10); return true; }
        if (k === K.OK) { togglePlay(); return true; }
        if (k === K.DOWN) { var first = el('osd-buttons').querySelector('.f'); if (first) CS.nav.focus(first, 'no-scroll'); return true; }
        return true;
      }
      showOsd();
      if (k === K.UP) { CS.nav.focus(el('osd-bar'), 'no-scroll'); return true; }
      if (k === K.DOWN) { hideOsd(); return true; }
      return false; /* left/right/OK move between and press the buttons */
    }
  };

  var debugTimer = 0;
  function toggleDebug() {
    var d = el('debug');
    if (!d.classList.contains('hidden')) { d.classList.add('hidden'); clearInterval(debugTimer); return; }
    d.classList.remove('hidden');
    var draw = function () {
      if (!P) return;
      var r = P.renderer.report();
      var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
      d.textContent = [
        'video ' + (v.videoWidth || '?') + 'x' + (v.videoHeight || '?') + '  dropped ' + (q.droppedVideoFrames || 0) + '/' + (q.totalVideoFrames || 0),
        'clock: report every ' + r.reportGapMedianMs + ' ms (95%: ' + r.reportGap95Ms + ')  late reports ' + r.reportBehindMedianMs + ' ms (95%: ' + r.reportBehind95Ms + ')  frame reports ' + r.frameReports,
        'lines: ' + r.lines + '  appeared after their time ' + r.lineLateMedianMs + ' ms (95%: ' + r.lineLate95Ms + ')  delay ' + P.renderer.delay + ' ms',
        'sub: ' + String(P.sub ? P.sub.id : 'none').slice(0, 60),
        'src: ' + (P.stream.addonName || '') + ' ' + (P.stream.file || '').slice(0, 70)
      ].join('\n');
    };
    draw();
    debugTimer = setInterval(draw, 1000);
  }

  CS.player = {
    init: function () {
      v = el('video'); box = el('subs'); osd = el('osd');
      /* the Magic Remote pointer: moving it shows the bar; a click on the time line jumps there */
      var bar = el('osd-bar');
      el('player').addEventListener('mousemove', function () { if (P && !panelOpen()) showOsd(); });
      bar.addEventListener('mousemove', function (e) { seekToPointer(e, false); });
      bar.addEventListener('mouseleave', function () { if (seekTarget == null) el('osd-tip').classList.remove('on'); });
      bar.addEventListener('click', function (e) {
        if (!e.isTrusted || (e.clientX === 0 && e.clientY === 0)) { togglePlay(); return; } /* OK on the remote */
        seekToPointer(e, true);
      });
      v.addEventListener('waiting', function () { if (P) spin(true, P.started ? loadingText() : 'يجهّز التشغيل…'); });
      v.addEventListener('seeking', function () { if (P) spin(true, 'يحمّل…'); });
      v.addEventListener('loadedmetadata', function () { if (P && !P.started && spinning()) spin(true, 'يجهّز التشغيل…'); });
      v.addEventListener('progress', function () { if (P && P.started && spinning()) el('player-spin-text').textContent = loadingText(); });
      v.addEventListener('playing', function () { spin(false); if (P && osd.classList.contains('on') && !panelOpen()) showOsd(2500); if (P && !P.started) { P.started = true; CS.log('playing', Math.round(performance.now() - P.t0) + 'ms after the press', v.videoWidth + 'x' + v.videoHeight); } });
      v.addEventListener('canplay', function () { spin(false); });
      v.addEventListener('seeked', function () { spin(false); if (P) P.renderer.clock.reset(); });
      v.addEventListener('pause', function () { if (P) { showOsd(0); P.renderer.clock.reset(); } });
      v.addEventListener('timeupdate', function () {
        if (!P) return;
        if (v.currentTime > 1 && !v.seeking) P.lastTime = v.currentTime; /* where to come back after a drop */
        if (osd.classList.contains('on')) updateBar();
        var d = v.duration, c = v.currentTime;
        if (!d) return;
        if (P.next && !P.nextPrep && c / d > 0.8) prepareNext();
        /* the end card in the last 25 seconds (or at the credits) */
        if (P.next && CS.settings.autoNext && P.nextCountdown == null && !P.cardDismissed && d - c < 25 && d > 300) {
          P.nextCountdown = Math.max(1, Math.round(d - c - 2));
          nextCard(P.nextCountdown);
          P.nextTimer = setInterval(function () {
            if (!P || P.nextCountdown == null) return;
            P.nextCountdown--;
            nextCard(P.nextCountdown);
            if (P.nextCountdown <= 0) { clearInterval(P.nextTimer); playNext(); }
          }, 1000);
        }
      });
      v.addEventListener('ended', function () {
        if (!P || P.ended) return; /* the next episode is already on its way */
        if (P.next && CS.settings.autoNext) playNext();
        else leave(true).then(function () { CS.player.close(); });
      });
      v.addEventListener('loadedmetadata', function () {
        if (!P) return;
        CS.log('file opened', Math.round(performance.now() - P.t0) + 'ms', 'duration ' + Math.round(v.duration) + 's', 'audio tracks ' + (v.audioTracks ? v.audioTracks.length : 'n/a'));
        if (P.resume && P.resume > 5 && P.resume < v.duration - 30) v.currentTime = P.resume;
        pickAudioByLanguage();
      });
      v.addEventListener('error', function () {
        if (!P) return;
        var err = v.error || {};
        CS.log('video error', err.code, err.message || '');
        var me = P;
        /* it was playing and stopped (Wi-Fi, the PC's ⚡ restarting): try the same source again from the same spot, twice */
        if (me.started && (me.retries || 0) < 2) {
          me.retries = (me.retries || 0) + 1;
          var at = me.lastTime || 0;
          spin(true, 'انقطع الاتصال — نعيد المحاولة (' + me.retries + ')…');
          CS.log('retrying the source', me.retries, 'from', Math.round(at));
          setTimeout(function () {
            if (P !== me) return;
            me.resume = at;
            v.src = CS.streams.playUrl(me.stream);
            v.play().catch(function (e) { CS.log('play refused', e.message); });
          }, me.retries * 2500);
          return;
        }
        spin(false);
        CS.toast(err.code === 4 ? 'التلفزيون ما يشغّل هالملف — اختر مصدر ثاني' : 'المصدر وقف — اختر مصدر ثاني', 6000);
        leave(false).then(function () { CS.player.close(); CS.views.streams(me.meta, me.video, { failed: me.stream }); });
      });
    },
    playing: function () { return P; },
    /* meta: title page; video: {id, season, episode, title} (a movie: the movie itself); stream: parsed source */
    play: function (meta, video, stream, opts) {
      opts = opts || {};
      var url = CS.streams.playUrl(stream);
      if (!url) { CS.toast(stream.needsServer ? 'هالمصدر يبي Stremio شغّال في كمبيوترك' : 'هالمصدر ما له رابط'); return Promise.resolve(); }
      var before = P ? leave(false) : Promise.resolve();
      return before.then(function () {
        var resume = opts.resume;
        if (resume == null) {
          var rp = CS.lib.resumePoint(meta.id);
          if (rp && rp.videoId === video.id && rp.offset > 5) resume = rp.offset;
        }
        P = {
          meta: meta, video: video, stream: stream, t0: performance.now(), resume: resume || 0,
          next: CS.session.nextVideo(meta, video), subList: [], subFailed: {}, sub: null,
          renderer: new CS.subs.Renderer(v, box)
        };
        P.renderer.delay = CS.settings.subOffsets[meta.id] || 0;
        CS.subs.applyStyle(box);
        P.renderer.start();
        CS.settings.lastPick[meta.id] = CS.streams.memo(stream);
        CS.saveSettings();
        el('osd-buttons').innerHTML = ''; /* rebuilt for this video (the next-episode button may change) */
        el('osd-name').textContent = meta.name;
        el('osd-sub').textContent = meta.type === 'series' ? CS.epLabel(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : (meta.releaseInfo || '');
        var badges = el('osd-badges');
        badges.innerHTML = '';
        CS.streams.badges(stream).forEach(function (b) { badges.appendChild(CS.h('span.badge', { text: b })); });
        el('player').classList.remove('hidden');
        document.body.classList.add('playing');
        spin(true, (stream.speeder ? 'عبر كمبيوترك — ' : '') + 'يتصل بالمصدر…');
        hideOsd();
        if (!CS.nav.top() || CS.nav.top().name !== 'player') {
          CS.nav.push(Object.assign(screen, { el: el('player') }));
          CS.nav.drop('streams'); /* Back from the video goes to the title page */
        }
        CS.log('play', meta.id, video.id, stream.addonName, (stream.file || '').slice(0, 80), url.replace(/\/[^/]{24,}\//g, '/…/').slice(0, 100));
        v.muted = false;
        v.src = url;
        v.play().catch(function (e) { CS.log('autoplay refused', e.message); });
        lastPos = 0;
        clearInterval(saveTick);
        saveTick = setInterval(function () { if (P && !v.paused) save(false); }, 10000);
        loadSubs();
      });
    },
    stop: function () {
      return leave(false).then(function () { CS.player.close(); });
    },
    close: function () {
      el('player').classList.add('hidden');
      document.body.classList.remove('playing');
      hideOsd();
      el('panel').classList.add('hidden');
      el('debug').classList.add('hidden');
      clearInterval(debugTimer);
      while (CS.nav.top() && (CS.nav.top().name === 'player' || CS.nav.top().name === 'panel')) CS.nav.pop();
      if (CS.onPlayerClosed) CS.onPlayerClosed();
    },
    flush: function () { return save(true); }
  };
})();
