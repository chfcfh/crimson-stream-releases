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
  /* one row's look and action (also used to bring an open list up to date in place) */
  function fillRow(b, r) {
    b.classList.toggle('on', !!r.on);
    b.classList.toggle('dim', !!r.dim);
    b.onclick = function () { r.act(); };
    b.innerHTML = '';
    b.appendChild(CS.h('span.panel-main', null, r.on ? CS.iconKids('check', r.label) : r.label));
    if (r.note) b.appendChild(CS.h('span.panel-note', { text: r.note }));
  }
  function openPanel(title, rows, focusIdx) {
    var p = el('panel');
    p.innerHTML = '';
    p._kind = '';
    p.appendChild(CS.h('h3', { text: title }));
    var list = CS.h('div.panel-list.vscroll', null, CS.h('div.vtrack'));
    rows.forEach(function (r) {
      var b = CS.h('button.panel-row.f');
      fillRow(b, r);
      list.firstChild.appendChild(b);
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

  /* The subtitle list stays up to date while it is open: the shares come in one by one, «نحسب التطابق…» ends, a subtitle fails.
     It used to be drawn once, so the viewer closed and opened it again to see them. Rows are brought up to date in place, the
     focus where it was; a change in their number draws the list again on the same row */
  var subsWatch = 0;
  function subsPanel() {
    if (!P) return;
    var b = subRows();
    openPanel(b.title, b.rows, b.focus);
    el('panel')._kind = 'subs';
    var me = P, look = function (x) { return x.title + '|' + x.rows.map(function (r) { return r.label + '~' + (r.note || '') + '~' + !!r.on + '~' + !!r.dim; }).join('|'); };
    var sig = look(b);
    clearInterval(subsWatch);
    subsWatch = setInterval(function () {
      var p = el('panel'), top = CS.nav.top();
      if (P !== me || !top || top.name !== 'panel' || p._kind !== 'subs') { clearInterval(subsWatch); return; }
      var now = subRows(), s = look(now);
      if (s === sig) return;
      sig = s;
      var btns = p.querySelectorAll('.panel-row');
      if (btns.length !== now.rows.length) {
        var at = Array.prototype.indexOf.call(p.querySelectorAll('.f'), CS.nav.current());
        CS.nav.pop();
        openPanel(now.title, now.rows, Math.max(0, at));
        el('panel')._kind = 'subs';
        return;
      }
      p.querySelector('h3').textContent = now.title;
      now.rows.forEach(function (r, i) { fillRow(btns[i], r); });
    }, 1000);
  }

  function subRows() {
    var rows = [{ label: 'بدون ترجمة', on: !P.sub, act: function () { chooseSub(null, true); closePanel(); } }];
    /* the way back when the fitting went wrong: every subtitle as it was downloaded, none moved by the PC (the list is brought up
       to date by itself, so it stays open) */
    rows.push({ label: 'الترجمات بدون ضبط', note: P.rawSubs ? 'شغّال: كل ترجمة مثل ما نزلت' : 'لو الضبط خرّبها', on: !!P.rawSubs, act: function () { rawSubs(!P.rawSubs); } });
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
    return { title: 'الترجمة' + (P.matchNone && !top ? ' — ما نقدر نحسب التطابق لهالملف' : ''), rows: rows, focus: focus };
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
      return { label: name, on: t.enabled, act: function () { tracks.forEach(function (x, j) { x.enabled = j === i; }); CS.log('audio track', i, name); if (P) CS.session.audioChosen(P.meta, t.language || t.label); closePanel(); } };
    });
    if (!rows.length) rows.push({ label: 'مسار صوت واحد', on: true, act: closePanel });
    openPanel('الصوت', rows, Math.max(0, tracks.findIndex(function (t) { return t.enabled; })));
  }
  /* The audio track in a language wanted for this title (session.js, audioWanted: its original, or the viewer's own choice) goes
     on when the file starts on another: a file from a Russian pack starts on its dubs, the original after them. And a file with
     none of them, though each track names its language, gives way to the next source the automatic choice left waiting. Run when
     the file is open and when the wanted languages are known, whichever comes last; once for a file */
  function chooseAudio(me) {
    if (P !== me || me.audioDone || !me.wantAudio || !me.opened) return;
    me.audioDone = true;
    var tracks = audioTracks();
    if (!tracks.length) return;
    var langs = tracks.map(function (t) { return t.language || t.label || ''; });
    var k = CS.session.audioPick(me.wantAudio, langs, tracks.findIndex(function (t) { return t.enabled; }));
    if (k >= 0) {
      tracks.forEach(function (x, j) { x.enabled = j === k; });
      var c = CS.streams.langCode(langs[k]);
      CS.log('audio track', k, langs[k], 'wanted', me.wantAudio.list.join('/'));
      CS.toast('الصوت: ' + CS.streams.langName(c) + (c === me.wantAudio.orig ? ' (لغة العمل الأصلية)' : ''), 3500);
    }
    if (CS.session.wrongAudio(me, langs)) {
      CS.toast('هالمصدر ما فيه صوت ' + CS.streams.langName(me.wantAudio.list[0]) + ' — نجرّب اللي بعده', 4500);
      CS.player.play(me.meta, me.video, me.alternates[0], { resume: me.resume, alternates: me.alternates.slice(1), hopped: true });
    }
  }

  /* ---------- subtitles for this video ---------- */
  /* «الترجمات بدون ضبط»: on, the subtitle on now goes back to how it was downloaded (a fitted row: the one it was made from),
     and fitted lines arriving later are kept for the list's shares only. Off: the fitted lines again */
  function rawSubs(on) {
    if (!P) return;
    P.rawSubs = on;
    P.subPicked = true;
    var s = P.sub;
    if (on && s && CS.subs.isFitted(s)) {
      var u = CS.subs.sourceOf(s.url);
      s = P.subList.filter(function (x) { return x.url === u; })[0] || P.subList.filter(function (x) { return !CS.subs.isFitted(x); })[0] || null;
    }
    CS.toast(on ? 'الترجمة مثل ما نزلت، بدون ضبط' : 'رجعنا الترجمة المضبوطة');
    if (s) chooseSub(s, false);
  }

  function chooseSub(s, byUser) {
    if (!P) return;
    var me = P;
    if (byUser) P.subPicked = true;
    if (byUser && s && CS.subs.isFitted(s)) P.rawSubs = false; /* a «مضبوطة على ملفك» row chosen: the fitting is wanted again */
    /* picked while the fitted one was still on its way: that wait stops here, so the shares are worked out now */
    if (byUser) measure(me, P.subGroups);
    P.sub = s;
    if (!s) { P.renderer.set([]); return; }
    if (P.fittedCues && P.fittedCues[s.url] && !P.rawSubs) { /* already fitted to this file line by line */
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
            if (me.subPicked && me.sub === s && !me.rawSubs) me.renderer.set(f.cues); /* the viewer's own choice gets its fitted lines too */
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
    var base = CS.settings.pc ? CS.pcUrl(CS.config.ports.speeder) : '';
    var list = all.filter(function (s) { return !CS.subs.isFitted(s); }).slice(0, 16);
    if (!base || !me.stream.file || !list.length) { done(false); return; }
    var alive = function () { return P === me; };
    CS.fetchJson(base + '/manifest.json', { timeout: 2500, cache: 'no-store' }).then(function (m) {
      if (!alive()) return;
      if (!m || m.id !== CS.config.speederId) { done(false); return; }
      var fit = { url: CS.subs.jobLink(base, { t: me.meta.type, id: me.video.id, f: me.stream.file, u: list[0].url, s: CS.subs.leadMs, own: true, p: CS.streams.playUrl(me.stream) || undefined }) };
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
        if (me.subPicked && me.sub === s && !me.rawSubs) me.renderer.set(r.cues); /* the viewer's own choice gets its fitted lines too */
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

  /* No PC fitting here: the file's own index gives the time of every subtitle line in a handful of small reads (fileindex.js), an
     English subtitle that stands on those times lends its words, and each Arabic subtitle is fitted to that on the TV itself, one at
     a time with the page free between them. A subtitle the fitting does not bring closer stays as it came. done(true): the file
     had a reference, whatever came of each subtitle */
  function fitByIndex(me, all, done) {
    var FI = CS.fileIndex, L = CS.linefit, url = CS.streams.playUrl(me.stream);
    var list = all.filter(function (s) { return !CS.subs.isFitted(s); }).slice(0, 12);
    if (!FI || !L || !L.align || !url || !list.length) { done(false); return; }
    var alive = function () { return P === me; }, t0 = Date.now();
    me.match = me.match || {};
    me.fittedCues = me.fittedCues || {};
    me.matchFor = {};
    list.forEach(function (s) { me.matchFor[s.url] = 1; });
    me.matchBusy = 'نضبط الترجمة على ملف الحلقة…';
    var toMs = function (cues) { return cues.map(function (c) { return { start: Math.round(c.start * 1000), end: Math.round(c.end * 1000), text: c.lines.join('\n') }; }); };
    var toApp = function (cues) { return cues.map(function (c) { return { start: c.start / 1000, end: c.end / 1000, lines: c.text.split('\n') }; }); };
    var stop = function (why) { CS.log('index timing', why); if (alive()) { me.matchBusy = ''; done(false); } };
    FI.readIndex(FI.linkReader(url), alive).then(function (index) {
      if (!alive() || !index) return null;
      return FI.englishList(me.meta.type, me.video.id, index, me.stream.file).then(function (eng) {
        var k = 0;
        var next = function () {
          var x = eng[k++];
          if (!x || !alive()) return Promise.resolve(null);
          return CS.subs.load(x.url).then(function (cues) { return { name: String(x.id || '').slice(0, 30), cues: toMs(cues) }; });
        };
        return FI.reference(index, next, L).then(function (r) {
          CS.log('index timing', r ? r.ref.length + ' lines from ' + r.track + ', words ' + Math.round(r.words * 100) + '%' : 'no reference', index.requests + ' reads', k + ' English', (Date.now() - t0) + 'ms');
          return r;
        });
      });
    }).then(function (r) {
      if (!alive()) return;
      if (!r) { stop('nothing in this file\'s index'); return; }
      var best = null, i = 0, need = r.words >= 0.6 ? 0 : 0.1; /* a reference of times alone moves a subtitle only on a clear gain */
      var one = function () {
        if (!alive()) return;
        if (i >= list.length) {
          me.matchBusy = '';
          if (best && !me.subPicked && CS.settings.subAuto) {
            me.sub = best.s;
            me.renderer.set(best.cues);
            CS.toast('ضبطنا الترجمة على ملف الحلقة');
          }
          done(true);
          return;
        }
        var s = list[i++], t1 = Date.now();
        CS.subs.load(s.url).then(function (cues) {
          if (!alive()) return;
          var raw = toMs(cues);
          if (!L.reallyArabic(raw)) return;
          var before = L.matchShare(raw, r.ref), f = L.fitToFile(raw, r.ref), after = f.snapped ? L.matchShare(f.cues, r.ref) : before;
          var take = f.snapped && after > before + need;
          me.match[s.url] = take ? after : before;
          CS.log('index fit', String(s.id).slice(0, 24), Math.round(before * 100) + '% -> ' + Math.round(after * 100) + '%', take ? '' : '(as it came)', (Date.now() - t1) + 'ms');
          if (!take) { if (!best || before > best.share) best = { s: s, cues: cues, share: before }; return; }
          var fitted = toApp(f.cues);
          me.fittedCues[s.url] = fitted;
          if (me.subPicked && me.sub === s && !me.rawSubs) me.renderer.set(fitted); /* the viewer's own choice gets its fitted lines too */
          if (!best || after > best.share) best = { s: s, cues: fitted, share: after };
        }).catch(function (e) { CS.log('index fit failed', e.message || e.name); }).then(function () { setTimeout(one, 60); });
      };
      one();
    }).catch(function (e) { stop('failed: ' + (e && (e.message || e.name))); });
  }

  /* the PC cannot be reached from here: the file's own index first (on the TV itself), then a fitter on this home network, then
     with the owner's code the hub, and the file's own track is read line by line only if all are away */
  function fitElsewhere(me, list, all) {
    if (!me.indexTried) {
      me.indexTried = true;
      fitByIndex(me, all, function (ok) { if (!ok && P === me) fitElsewhere(me, list, all); });
      return;
    }
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
        if (me.subPicked && me.sub === s && !me.rawSubs) me.renderer.set(r.cues);
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
      if (me.subPicked && me.sub === s && !me.rawSubs) me.renderer.set(r.cues); /* the viewer's own choice gets its fitted lines too */
    }).then(function () { me.matchBusy = ''; takeBest(me); });
  }

  /* With every share known: the subtitle with the highest share on this file takes over by itself (the owner wants the highest,
     however small the lead), the automatic choice being on and the viewer not having chosen one. A tie keeps the one on. The one
     on, shown as it came while it was being fitted, gets its fitted lines */
  function takeBest(me) {
    if (P !== me || me.subPicked || me.rawSubs || !CS.settings.subAuto) return;
    var best = null;
    (me.subList || []).forEach(function (s) { var v = me.match && me.match[s.url]; if (v != null && (!best || v > best.v)) best = { s: s, v: v }; });
    if (!best) return;
    var cur = me.sub && me.match ? me.match[me.sub.url] : null;
    if (best.s === me.sub || (cur != null && best.v <= cur)) {
      if (me.sub && me.fittedCues && me.fittedCues[me.sub.url]) me.renderer.set(me.fittedCues[me.sub.url]);
      return;
    }
    CS.log('best match takes over', String(best.s.id).slice(0, 30), Math.round(best.v * 100) + '%', cur != null ? 'from ' + Math.round(cur * 100) + '%' : '');
    chooseSub(best.s, false);
    CS.toast('بدّلنا لترجمة أدق: تطابق ' + Math.round(best.v * 100) + '%');
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
      /* the first subtitle shows at once, and the one fitted to this very file takes over when it comes: as on the phone and on
         Windows. The TV used to show none while it waited, and a slow fit (Primetime: 100 s on the owner's PC) left the film's
         start with no subtitle at all, though its own subtitles were right as they came */
      var t0 = Date.now();
      if (first) chooseSub(first, false); else P.sub = fit;
      CS.subs.waitFitted(fit.url, function () { return P === me && !P.subPicked; }, {
        ready: function (cues, tries) {
          P.sub = fit;
          P.renderer.set(cues);
          CS.log('subtitle fitted to the file is on', cues.length + ' lines', (Date.now() - t0) + 'ms', 'try ' + tries);
          CS.toast('ضبطنا الترجمة على ملف الحلقة');
          me.measured = true;
          fitTheRest(me, fit, g.list);
        },
        slow: function () { /* the first one is on already */ },
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

  /* ---------- Torrentio's notice clips ---------- */
  /* When TorBox does not hand over the file (the account refused, too many asks, not ready yet), Torrentio plays a 30-second
     1080p clip that says why, in place of the episode. Every one of its clips is exactly 30 s and none can be read by the app
     (no CORS), so the length and the source tell it apart. That clip is never progress: no saving, no «watched», no next episode */
  function isNotice(me) {
    var d = v.duration || 0, s = me.stream || {};
    var viaTorrentio = /torrentio/i.test(s.addonName || '') || /torrentio/i.test(CS.streams.playUrl(s) || '');
    return viaTorrentio && Math.abs(d - 30) < 0.6;
  }
  /* the clip ended: the next equal source the automatic choice kept, or back to the list with this one marked */
  function noticeOver(me) {
    if (P !== me) return;
    var next = me.alternates && me.alternates[0];
    if (next) {
      CS.log('notice clip over, trying the next', next.addonName, (next.file || '').slice(0, 60));
      CS.player.play(me.meta, me.video, next, { resume: me.resume, alternates: me.alternates.slice(1) });
      return;
    }
    leave(false).then(function () { CS.player.close(); CS.views.streams(me.meta, me.video, { failed: me.stream }); });
  }

  /* ---------- saving progress ---------- */
  function save(force) {
    if (!P || !v.duration || P.ended || P.notice) return Promise.resolve();
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
  /* the auto pick tried several equal sources: one that never started gives way to the next, quietly */
  function nextSource(me, why) {
    if (P !== me || me.started || !me.alternates || !me.alternates.length) return false;
    var next = me.alternates[0];
    CS.log('source did not start (' + why + '), trying the next', next.addonName, (next.file || '').slice(0, 60));
    CS.toast('المصدر ما اشتغل — نجرّب اللي بعده', 3000);
    CS.player.play(me.meta, me.video, next, { resume: me.resume, alternates: me.alternates.slice(1) });
    return true;
  }
  function leave(finishedNow) {
    if (!P) return Promise.resolve();
    var me = P;
    var d = v.duration || 0, c = v.currentTime || 0;
    var done = !me.notice && (finishedNow || CS.session.isFinished(c, d));
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
        if (!d || P.notice) return;
        if (P.retries && c > (P.resume || 0) + 60) P.retries = 0; /* a minute back on its feet: a later cut gets all its tries again */
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
        if (P.notice) { noticeOver(P); return; }
        if (P.next && CS.settings.autoNext) playNext();
        else leave(true).then(function () { CS.player.close(); });
      });
      v.addEventListener('loadedmetadata', function () {
        if (!P) return;
        CS.log('file opened', Math.round(performance.now() - P.t0) + 'ms', 'duration ' + Math.round(v.duration) + 's', 'audio tracks ' + (v.audioTracks ? v.audioTracks.length : 'n/a'));
        if (isNotice(P)) {
          P.notice = true;
          P.opened = true;
          CS.log('torrentio notice clip in place of the file: TorBox did not hand it over');
          CS.toast('هذا مو الحلقة: TorBox ما سلّم الملف، فـ Torrentio شغّل مقطع ٣٠ ثانية مكتوب فيه السبب. بعده ' + (P.alternates && P.alternates.length ? 'نجرّب المصدر اللي بعده' : 'نرجعك للمصادر'), 12000, 'error');
          return;
        }
        if (P.resume && P.resume > 5 && P.resume < v.duration - 30) v.currentTime = P.resume;
        P.opened = true;
        chooseAudio(P);
      });
      v.addEventListener('error', function () {
        if (!P) return;
        var err = v.error || {};
        CS.log('video error', err.code, err.message || '');
        var me = P;
        /* it was playing and stopped (Wi-Fi, the PC's ⚡ restarting, TorBox refusing for a moment): try the same source again from
           the same spot, three times with longer waits. A refusal that lasts a little while (seen: the asks again right after a cut
           were refused) gets time to pass */
        var WAITS = [3000, 10000, 25000];
        if (me.started && !me.notice && (me.retries || 0) < WAITS.length) {
          var wait = WAITS[me.retries || 0];
          me.retries = (me.retries || 0) + 1;
          var at = me.lastTime || 0;
          spin(true, 'انقطع الاتصال — نعيد المحاولة (' + me.retries + ' من ' + WAITS.length + ')…');
          CS.log('retrying the source', me.retries, 'from', Math.round(at), 'in', wait + 'ms');
          setTimeout(function () {
            if (P !== me) return;
            me.resume = at;
            v.src = CS.streams.playUrl(me.stream);
            v.play().catch(function (e) { CS.log('play refused', e.message); });
          }, wait);
          return;
        }
        if (!me.started && nextSource(me, 'error ' + err.code)) return;
        spin(false);
        var viaTorBox = /torrentio/i.test(me.stream.addonName || '') && !me.stream.speeder;
        CS.toast(me.started && viaTorBox ? 'المصدر انقطع وما رجع بعد ٣ محاولات — TorBox رفض يكمّل (الحساب أو النت). جرّب بعد شوي أو اختر مصدر ثاني'
          : me.started ? 'المصدر انقطع وما رجع بعد ٣ محاولات — اختر مصدر ثاني'
          : err.code === 4 ? 'التلفزيون ما يشغّل هالملف — اختر مصدر ثاني' : 'المصدر وقف — اختر مصدر ثاني', 9000);
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
        P.alternates = opts.alternates || null;
        P.hopped = !!opts.hopped; /* this one took the place of a source with no track in the wanted language */
        (function (me) { CS.session.audioWanted(meta).then(function (w) { if (P === me) { me.wantAudio = w; chooseAudio(me); } }); })(P);
        if (P.alternates && P.alternates.length) {
          var me = P;
          /* nothing on screen after 25 s: the next one may be quicker */
          setTimeout(function () { nextSource(me, 'no picture after 25 s'); }, 25000);
        }
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
