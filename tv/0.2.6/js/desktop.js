/* The Windows version: the same screens in a window (scaled to fit), and the video handed to mpv in the window
   (CrimsonStream.exe). mpv draws the subtitles on the video's clock; this file still picks them, keeps continue
   watching in the account and starts the next episode. Does nothing on the TV. */
(function () {
  if (!(window.chrome && window.chrome.webview)) return;
  CS.desktop = true;
  CS.isTV = false;
  document.documentElement.classList.add('desktop');

  function host(m) { window.chrome.webview.postMessage(m); }
  CS.host = host;

  /* the screens, scaled into the window. "حجم الواجهة" in the settings: below 1 the page is laid out larger than
     1920×1080 (more room) and then shrunk to the window, so everything looks smaller */
  function fit() {
    /* the phone lays the screens out at its own width (mobile.css): nothing to scale */
    if (window.CS_ANDROID) { CS.uiScale = 1; return; }
    var z = (CS.settings && +CS.settings.uiSize) || 0.8;
    var W = Math.round(1920 / z), H = Math.round(1080 / z);
    var s = Math.min(innerWidth / W, innerHeight / H);
    CS.uiScale = s;
    var r = document.documentElement.style, b = document.body.style;
    r.width = b.width = W + 'px';
    r.height = b.height = H + 'px';
    b.transformOrigin = '0 0';
    b.transform = 'translate(' + Math.round((innerWidth - W * s) / 2) + 'px,' + Math.round((innerHeight - H * s) / 2) + 'px) scale(' + s + ')';
  }
  CS.fitPage = fit;
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  document.addEventListener('keydown', function (e) { if (e.keyCode === 122) { e.preventDefault(); host({ t: 'fullscreen' }); } }, true);

  var P = null, lastPos = 0, watchdog = 0, lastLeft = null;

  var screenToast = CS.toast;
  CS.toast = function (msg, ms) {
    screenToast(msg, ms);
    if (P && P.loaded) host({ t: 'osd', text: msg });
  };

  function toSrt(cues) {
    function t(x) {
      var ms = Math.max(0, Math.round(x * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + ',' + ('00' + (ms % 1000)).slice(-3);
    }
    return cues.map(function (c, i) { return (i + 1) + '\n' + t(c.start) + ' --> ' + t(c.end) + '\n' + c.lines.join('\n') + '\n'; }).join('\n');
  }

  function subTitle(s, i) { return CS.session.subLabel(s, i).label; }

  /* Arabic subtitles: the fast one first (selected), the one fitted to the file when ready, then a few others to choose with J */
  function loadSubs(me) {
    CS.session.findSubs(me.meta, me.video, me.stream).then(function (g) {
      if (P !== me) return;
      var plain = g.plain.concat(g.others);
      if (!plain.length && !g.fitted.length) { CS.toast('لا توجد ترجمة عربية لهذه الحلقة'); return; }
      var first = plain[0];
      /* rank: 2 = fitted to this file (wins), 1 = the first good one, 0 = only to choose with J */
      var send = function (s, i, rank) {
        return CS.subs.load(s.url).then(function (cues) {
          if (P !== me || !cues.length) return false;
          host({ t: 'sub', text: toSrt(cues), title: subTitle(s, i), rank: CS.settings.subAuto ? rank : 0 });
          CS.log('subtitle sent', subTitle(s, i), cues.length + ' lines', 'rank ' + rank);
          return true;
        }, function (e) { CS.log('subtitle failed', String(s.id).slice(0, 40), e.message || e.name); return false; });
      };
      var chain = first ? send(first, 0, 1) : Promise.resolve(false);
      chain.then(function (ok) {
        /* the first did not work: select the next one that does */
        var rest = plain.slice(1, 6), k = 0;
        var pickedYet = ok;
        return CS.pool(rest, 2, function (s) {
          var idx = plain.indexOf(s);
          return send(s, idx, pickedYet ? 0 : 1).then(function (done) { if (done) pickedYet = true; k++; });
        });
      });
      if (g.fitted[0]) send(g.fitted[0], 0, 2).then(function (ok) { if (ok) CS.toast('ضُبطت الترجمة على ملف الحلقة'); });
    });
  }

  function save(force) {
    if (!P || !P.dur || P.ended) return Promise.resolve();
    var played = P.paused || !lastPos ? 0 : Math.max(0, Math.min(15, P.pos - lastPos));
    lastPos = P.pos;
    var p = CS.lib.progress(P.meta, P.video.id, P.pos, P.dur, played);
    return force ? p.then(CS.lib.flush) : p;
  }

  function prepareNext() {
    if (!P || !P.next || P.nextPrep) return;
    var me = P;
    P.nextPrep = CS.session.nextSource(P.meta, P.next, me.stream);
  }

  /* once per episode: the end of the file and the N key can both ask for it */
  function playNext() {
    if (!P || !P.next || P.ended) return;
    var me = P, meta = P.meta, nv = P.next, prev = P.stream, prep = P.nextPrep || Promise.resolve(null);
    P.ended = true;
    CS.lib.finished(meta, P.video.id, nv.id);
    CS.toast('الحلقة التالية: ' + CS.epLabel(nv.season, nv.episode));
    /* the viewer may leave the video while the next one's source is looked up: then nothing starts */
    prep.then(function (r) {
      if (P !== me) return;
      if (r && r.pick) return play(meta, nv, r.pick, {});
      return CS.session.nextSource(meta, nv, prev).then(function (r2) {
        if (P !== me) return;
        if (!r2.pick) { CS.toast('لا يوجد مصدر للحلقة التالية'); host({ t: 'stop' }); return; }
        return play(meta, nv, r2.pick, {});
      });
    }).catch(function (e) {
      CS.log('next episode not started', e && e.message);
      if (P === me) { CS.toast('لا يوجد مصدر للحلقة التالية'); host({ t: 'stop' }); }
    });
  }

  function backToScreens() {
    /* the second click of a double click on the bar's «رجوع» lands on the screens: it presses nothing */
    var root = document.documentElement;
    root.style.pointerEvents = 'none';
    setTimeout(function () { root.style.pointerEvents = ''; }, 450);
    var t = CS.nav.top();
    if (t && t.shown) t.shown();
    CS.nav.refocus();
  }

  function play(meta, video, stream, opts) {
    opts = opts || {};
    var url = CS.streams.playUrl(stream);
    if (!url) { CS.toast(stream.needsServer ? 'هذا المصدر يحتاج Stremio شغّالًا في جهازك' : 'هذا المصدر بلا رابط'); return Promise.resolve(); }
    var resume = opts.resume;
    if (resume == null) {
      var rp = CS.lib.resumePoint(meta.id);
      if (rp && rp.videoId === video.id && rp.offset > 5) resume = rp.offset;
    }
    P = { meta: meta, video: video, stream: stream, next: CS.session.nextVideo(meta, video), pos: resume || 0, dur: 0, paused: false, t0: performance.now(), loaded: false, retried: !!opts.retried };
    var me = P;
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (P !== me || me.loaded) return;
      P = null;
      host({ t: 'stop' });
      CS.log('video never opened');
        CS.toast('المصدر لم يفتح خلال دقيقة — اختر مصدرًا آخر', 6000);
      CS.views.streams(me.meta, me.video, { failed: me.stream });
    }, 60000);
    lastPos = 0;
    CS.settings.lastPick[meta.id] = CS.streams.memo(stream);
    CS.saveSettings();
    var st = CS.settings;
    host({
      t: 'play', url: url, start: resume || 0, mute: !!opts.mute,
      barTitle: meta.name, hasNext: !!P.next, badges: CS.streams.badges(stream).join('   ·   '),
      barSub: meta.type === 'series' ? CS.epLabel(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : (meta.releaseInfo || ''),
      title: meta.name + (meta.type === 'series' ? ' · ' + CS.epLabel(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : ''),
      subDelay: (st.subOffsets[meta.id] || 0) / 1000, seekStep: st.seekStep || 10, speedup: st.seekSpeedup !== false,
      style: { size: st.subSize, color: st.subColor, style: st.subStyle, lift: st.subLift }
    });
    CS.nav.drop('streams');
    CS.log('play', meta.id, video.id, stream.addonName, (stream.file || '').slice(0, 80));
    loadSubs(P);
    return Promise.resolve();
  }

  window.chrome.webview.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.t === 'host-log') { CS.log(m.text); return; }
    if (m.t === 'host-toast') { CS.toast(m.text, 7000); return; }
    if (m.t === 'host-error') {
      CS.log('window error', m.error);
      if (P && !P.loaded) { P = null; clearTimeout(watchdog); }
      CS.toast(m.error, 8000);
      return;
    }
    if (m.t === 'mpv-loaded') {
      if (P) { P.loaded = true; clearTimeout(watchdog); }
      if (P) CS.log('file opened', Math.round(performance.now() - P.t0) + 'ms', 'duration ' + Math.round(m.dur) + 's', 'vo ' + m.vo, 'hwdec ' + m.hwdec);
      return;
    }
    if (m.t === 'mpv') {
      if (!P) return;
      P.pos = m.pos; P.dur = m.dur; P.paused = m.paused;
      if (P.dur && !P.savedAt) P.savedAt = Date.now();
      if (Date.now() - (P.savedAt || 0) > 10000) { P.savedAt = Date.now(); save(false); }
      if (P.next && P.dur && P.pos / P.dur > 0.8) prepareNext();
      return;
    }
    if (m.t === 'mpv-next') { playNext(); return; }
    if (m.t === 'probe') { CS.lastProbe = m; return; }
    if (m.t === 'mpv-end') {
      if (!P) return;
      if (m.reason === 'eof') {
        if (P.next && CS.settings.autoNext) { playNext(); return; }
        var done = P;
        CS.lib.finished(done.meta, done.video.id, done.next ? done.next.id : null);
        P = null;
        host({ t: 'stop' });
        backToScreens();
        return;
      }
      var me = P;
      P = null;
      clearTimeout(watchdog);
      CS.log('video error', m.error);
        /* it was playing and stopped (network): once more from the same spot before giving up */
      if (me.loaded && !me.retried && !/libmpv/.test(m.error || '')) {
        CS.log('retrying the source from', Math.round(me.pos));
        CS.toast('انقطع الاتصال — نعيد المحاولة…');
        play(me.meta, me.video, me.stream, { resume: me.pos, retried: true });
        return;
      }
      /* the player itself is missing or broken: another source will not help, say only why */
      if (/libmpv/.test(m.error || '')) { CS.toast(m.error, 10000); return; }
      CS.toast('المصدر لم يعمل (' + (m.error || 'خطأ') + ') — اختر مصدرًا آخر', 6000);
      CS.views.streams(me.meta, me.video, { failed: me.stream });
      return;
    }
    if (m.t === 'mpv-closed' || m.t === 'app-closing') {
      var me2 = P;
      var after = function () { if (m.t === 'app-closing') host({ t: 'exit' }); };
      if (!me2) { CS.lib.flush().then(after, after); return; }
      P = null;
      lastLeft = { meta: me2.meta, video: me2.video, stream: me2.stream };
      CS.player.leftAt = Date.now();
      if (m.subDelay != null) {
        var ms = Math.round(m.subDelay * 1000);
        if (ms) CS.settings.subOffsets[me2.meta.id] = ms; else delete CS.settings.subOffsets[me2.meta.id];
        CS.saveSettings();
      }
      var dur = m.dur || me2.dur, pos = m.pos || me2.pos;
      var p = CS.session.isFinished(pos, dur) ? CS.lib.finished(me2.meta, me2.video.id, me2.next ? me2.next.id : null)
        : CS.lib.progress(me2.meta, me2.video.id, pos, dur, me2.paused ? 0 : Math.max(0, Math.min(15, pos - lastPos)));
      p.then(CS.lib.flush).then(after, after);
      if (m.t === 'mpv-closed') backToScreens();
    }
  });

  /* the player API the screens use */
  CS.player.play = play;
  CS.player.playing = function () { return P; };
  CS.player.stop = function () { host({ t: 'stop' }); return Promise.resolve(); };
  /* the mouse's forward button: back into the episode just left, from where it stopped (saved by then) */
  CS.player.resumeLast = function () {
    if (P || !lastLeft) return;
    var l = lastLeft;
    lastLeft = null;
    play(l.meta, l.video, l.stream, {});
  };
  CS.player.flush = function () { return save(true); };
})();
