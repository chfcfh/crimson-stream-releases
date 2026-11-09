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

  /* 0.2.6 saved the automatic fitting of one file as the title's timing, and the next episode started off by it: those
     saved values are not the viewer's, and go once */
  if (!CS.settings.offsetsClean) {
    CS.settings.subOffsets = {};
    CS.settings.offsetsClean = true;
    CS.saveSettings();
  }

  var screenToast = CS.toast;
  CS.toast = function (msg, ms, kind, action) {
    screenToast(msg, ms, kind, action);
    if (P && P.loaded) host({ t: 'osd', text: msg });
  };

  function toSrt(cues) {
    function t(x) {
      var ms = Math.max(0, Math.round(x * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + ',' + ('00' + (ms % 1000)).slice(-3);
    }
    return cues.map(function (c, i) { return (i + 1) + '\n' + t(c.start) + ' --> ' + t(c.end) + '\n' + c.lines.join('\n') + '\n'; }).join('\n');
  }
  CS.toSrt = toSrt;

  function subTitle(s, i) { return CS.session.subLabel(s, i).label; }

  var subKeys = 0, rangeN = 0, ranges = {};

  /* the phone reads the file through its app (a page may not follow the source's redirects); the app keeps to the played file */
  function hostRead(a, b) {
    return new Promise(function (ok, no) {
      var id = ++rangeN;
      ranges[id] = { ok: ok, no: no };
      host({ t: 'range', id: id, a: a, b: b });
    });
  }

  /* the phone has no second player to read a file's subtitle track with: it goes through the file's index (mkvindex.js), slowly */
  function readOnPhone(me) {
    if (!window.CS_ANDROID || !CS.mkvIndex || !CS.linefit || me.refStarted) return;
    me.refStarted = true;
    var alive = function () { return P === me; }, t0 = Date.now();
    setTimeout(function () { /* the video opens first, and a source left at once costs no reads */
      if (!alive()) return;
      CS.mkvIndex.read(hostRead, alive).then(function (out) {
        if (!alive()) return;
        CS.log('file track read', out ? out.lines.length + ' lines, ' + out.requests + ' reads, ' + Math.round((Date.now() - t0) / 1000) + 's' : 'not possible for this file');
        if (out) { me.ref = out.lines; fitSent(me); }
      }).catch(function (e) { if (alive()) CS.log('file track not read', e.message || e.name); });
    }, 20000);
  }

  /* each Arabic subtitle not fitted yet, one at a time with the page free between them: paired line by line with the file's
     own track. The one that pairs best takes over. One that pairs too little stays as it came. */
  function fitSent(me) {
    if (me.fitting) { me.fitAgain = true; return; }
    me.fitting = true;
    /* (a phone reopens the video to change a subtitle, so the best is told once, when all are done) */
    (CS.linefit ? Promise.resolve(CS.linefit) : Promise.reject(new Error('no linefit'))).then(function (L) {
      var next = function () {
        if (P !== me) return;
        var one = (me.sent || []).filter(function (x) { return !x.tried; })[0];
        if (!one) {
          me.fitting = false;
          if (me.fitAgain) { me.fitAgain = false; fitSent(me); return; }
          if (me.bestKey && me.bestKey !== me.bestTold) {
            me.bestTold = me.bestKey;
            if (CS.settings.subAuto) host({ t: 'sub-best', key: me.bestKey });
            if (!me.fitTold) { me.fitTold = true; CS.toast('ضبطنا الترجمة على ملف الحلقة'); }
          }
          return;
        }
        one.tried = true;
        try {
          var raw = one.cues.map(function (c) { return { start: c.start * 1000, end: c.end * 1000, text: c.lines.join('\n') }; });
          if (L.reallyArabic(raw)) {
            var f = L.fitToFile(raw, me.ref);
            var share = f.snapped ? L.matchShare(f.cues, me.ref) : 0;
            CS.log('line fit', one.title, f.snapped ? Math.round(share * 100) + '% on the file' : 'too little paired');
            if (f.snapped) {
              var fitted = f.cues.map(function (c) { return { start: c.start / 1000, end: c.end / 1000, lines: c.text.split('\n') }; });
              host({ t: 'sub-fit', key: one.key, text: toSrt(fitted), title: one.title + ' · تطابق ' + Math.round(share * 100) + '%' });
              if (share > (me.bestShare || 0)) { me.bestShare = share; me.bestKey = one.key; }
            }
          } else CS.log('line fit', one.title, 'not really Arabic');
        } catch (e) { CS.log('line fit failed', one.title, e.message || e.name); }
        setTimeout(next, 30);
      };
      next();
    }).catch(function (e) { me.fitting = false; CS.log('line fit not available', e.message || e.name); });
  }

  /* Arabic subtitles: the one fitted to the file comes first and is waited for, the others are there to choose with J. With no
     fitted one, or when it takes long, the first good one is shown instead */
  function loadSubs(me) {
    CS.session.findSubs(me.meta, me.video, me.stream).then(function (g) {
      if (P !== me) return;
      var plain = g.plain.concat(g.others);
      if (!plain.length && !g.fitted.length) { CS.toast('ما فيه ترجمة عربية لهالحلقة'); return; }
      var first = plain[0], fit = g.fitted[0], good = [];
      /* rank: 2 = fitted to this file (wins), 1 = the first good one, 0 = only to choose with J */
      var deliver = function (s, i, rank, cues, share) {
        if (P !== me || !cues.length) return false;
        var one = { key: 'k' + (++subKeys), cues: cues, title: subTitle(s, i) + (share ? ' · تطابق ' + Math.round(share * 100) + '%' : ''), s: s };
        host({ t: 'sub', key: one.key, text: toSrt(cues), title: one.title, rank: CS.settings.subAuto ? rank : 0 });
        CS.log('subtitle sent', subTitle(s, i), cues.length + ' lines', 'rank ' + rank);
        /* the one fitted on the owner's PC is exact already */
        if (rank < 2) {
          good[i] = one.key;
          (me.sent = me.sent || []).push(one);
          if (me.ref) fitSent(me);
        }
        return true;
      };
      var send = function (s, i, rank) {
        return CS.subs.load(s.url).then(function (cues) { return deliver(s, i, rank, cues); },
          function (e) { CS.log('subtitle failed', String(s.id).slice(0, 40), e.message || e.name); return false; });
      };
      /* all sent as the video opens (a phone reopens the video for each one), so none is selected while the fitted one is awaited */
      var chain = first ? send(first, 0, fit ? 0 : 1) : Promise.resolve(false);
      var loaded = chain.then(function (ok) {
        /* the first did not work: select the next one that does */
        var rest = plain.slice(1, 6);
        var pickedYet = ok || !!fit;
        return CS.pool(rest, 2, function (s) {
          var idx = plain.indexOf(s);
          return send(s, idx, pickedYet ? 0 : 1).then(function (done) { if (done) pickedYet = true; });
        });
      });
      if (!fit) { readOnPhone(me); return; }
      var standIn = false, fitOn = false;
      var showStandIn = function (say) {
        if (standIn) return;
        standIn = true;
        loaded.then(function () {
          var key = good.filter(Boolean)[0];
          if (P !== me || fitOn || !key || !CS.settings.subAuto) return;
          host({ t: 'sub-best', key: key });
          if (say) CS.toast('الضبط طوّل، نعرض ترجمة مؤقتة لين يخلص');
        });
      };
      CS.subs.waitFitted(fit.url, function () { return P === me; }, {
        ready: function (cues) {
          fitOn = true;
          /* the others are fitted by the PC too, each with its match share. The fitted one goes in right after: on a phone that
             reopens the video once, and the reopened video takes whatever is ready by then. A slow one still arrives later */
          var fitShare = 0;
          var all = loaded.then(function () {
            var sentNow = (me.sent || []).slice();
            return CS.subs.fitAll(fit, [fit].concat(sentNow.map(function (o) { return o.s; })), function () { return P === me; }, function (s, r) {
              if (s === fit) { fitShare = r.share; return; }
              var one = sentNow.filter(function (o) { return o.s === s; })[0];
              if (!one || !r.cues.length) return;
              one.tried = true; /* no need to fit it here again */
              host({ t: 'sub-fit', key: one.key, text: toSrt(r.cues), title: one.title + (r.share == null ? '' : ' · تطابق ' + Math.round(r.share * 100) + '%') });
            });
          });
          Promise.race([all, CS.sleep(4000)]).then(function () {
            if (deliver(fit, 0, 2, cues, fitShare)) CS.toast('ضبطنا الترجمة على ملف الحلقة');
          });
        },
        slow: function () { showStandIn(true); },
        gone: function () { showStandIn(false); readOnPhone(me); }
      });
    });
  }

  /* a downloaded video brings its subtitles with it, and they are fitted to the file like any others; one saved without
     any looks for them on the internet */
  function loadSavedSubs(me) {
    var d = CS.downloads.byId(me.stream.download);
    var saved = d ? d.subs : [];
    if (!saved.length) { loadSubs(me); return; }
    var fitted = saved.some(function (s) { return s.rank >= 2; });
    CS.pool(saved, 2, function (s) {
      return CS.downloads.readSub(s.url).then(function (cues) {
        if (P !== me || !cues.length) return;
        var one = { key: 'k' + (++subKeys), cues: cues, title: s.title };
        host({ t: 'sub', key: one.key, text: toSrt(cues), title: one.title, rank: CS.settings.subAuto ? s.rank : 0 });
        if (s.rank < 2) {
          (me.sent = me.sent || []).push(one);
          if (me.ref) fitSent(me);
        }
      });
    }).then(function () { if (!fitted) readOnPhone(me); });
  }

  function downloadedNext(nv) { return CS.downloads ? CS.downloads.ready(nv.id) : null; }

  function save(force) {
    if (!P || !P.dur || P.ended) return Promise.resolve();
    var played = P.paused || !lastPos ? 0 : Math.max(0, Math.min(15, P.pos - lastPos));
    lastPos = P.pos;
    var p = CS.lib.progress(P.meta, P.video.id, P.pos, P.dur, played);
    return force ? p.then(CS.lib.flush) : p;
  }

  function prepareNext() {
    if (!P || !P.next || P.nextPrep || downloadedNext(P.next)) return;
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
    var kept = downloadedNext(nv);
    if (kept) { play(meta, nv, CS.downloads.stream(kept), {}); return; }
    /* the viewer may leave the video while the next one's source is looked up: then nothing starts */
    prep.then(function (r) {
      if (P !== me) return;
      if (r && r.pick) return play(meta, nv, r.pick, {});
      return CS.session.nextSource(meta, nv, prev).then(function (r2) {
        if (P !== me) return;
        if (!r2.pick) { CS.toast('ما فيه مصدر للحلقة التالية'); host({ t: 'stop' }); return; }
        return play(meta, nv, r2.pick, {});
      });
    }).catch(function (e) {
      CS.log('next episode not started', e && e.message);
      if (P === me) { CS.toast('ما فيه مصدر للحلقة التالية'); host({ t: 'stop' }); }
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
    var url = stream.download ? '' : CS.streams.playUrl(stream);
    if (!url && !stream.download) { CS.toast(stream.needsServer ? 'هالمصدر يبي Stremio شغّال في جهازك' : 'هالمصدر ما له رابط'); return Promise.resolve(); }
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
        CS.toast('المصدر ما فتح خلال دقيقة — اختر مصدر ثاني', 6000);
      CS.views.streams(me.meta, me.video, { failed: me.stream });
    }, 60000);
    lastPos = 0;
    CS.settings.lastPick[meta.id] = CS.streams.memo(stream);
    CS.saveSettings();
    var st = CS.settings;
    host({
      t: 'play', url: url, download: stream.download || '', start: resume || 0, mute: !!opts.mute,
      barTitle: meta.name, hasNext: !!P.next, badges: CS.streams.badges(stream).join('   ·   '),
      barSub: meta.type === 'series' ? (window.CS_ANDROID ? CS.epLabel : CS.epCode)(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : (meta.releaseInfo || ''),
      title: meta.name + (meta.type === 'series' ? ' · ' + CS.epCode(video.season, video.episode) + (video.title ? ' · ' + video.title : '') : ''),
      subDelay: (st.subOffsets[meta.id] || 0) / 1000, seekStep: st.seekStep || 10, speedup: st.seekSpeedup !== false,
      style: { size: st.subSize, color: st.subColor, style: st.subStyle, lift: st.subLift, scale: st.subScale }
    });
    CS.nav.drop('streams');
    CS.log('play', meta.id, video.id, stream.addonName, (stream.file || '').slice(0, 80));
    if (stream.download) loadSavedSubs(P); else loadSubs(P);
    return Promise.resolve();
  }

  window.chrome.webview.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.t === 'host-log') { CS.log(m.text); return; }
    if (m.t === 'sub-view') { CS.settings.subScale = m.scale; CS.settings.subLift = m.lift; CS.saveSettings(); return; } /* the subtitle panel */
    if (m.t === 'host-toast') { CS.toast(m.text, 7000); return; }
    /* the phone: an update is here, and installing it is one touch away */
    if (m.t === 'update-ready') { CS.toast('نزل تحديث ' + m.version, 12000, 'ok', { label: 'ثبّته', run: function () { host({ t: 'check-update' }); } }); return; }
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
    if (m.t === 'ref-lines') { if (P) { P.ref = m.lines; fitSent(P); } return; }
    if (m.t === 'range-r') {
      var w = ranges[m.id];
      if (!w) return;
      delete ranges[m.id];
      if (m.status !== 206) {
        var err = new Error('status ' + m.status);
        err.status = m.status;
        err.retryAfter = m.retry;
        w.no(err);
        return;
      }
      var bin = atob(m.data), bytes = new Uint8Array(bin.length);
      for (var bi = 0; bi < bin.length; bi++) bytes[bi] = bin.charCodeAt(bi);
      w.ok(bytes);
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
      CS.toast('المصدر ما اشتغل (' + (m.error || 'خطأ') + ') — اختر مصدر ثاني', 6000);
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
  /* from the downloads, maybe with no internet: the title's page is taken as last seen, for the next episode and the
     watched marks; without it the video still plays, and the marks wait for the next time it is played from its page */
  CS.player.playDownload = function (d) {
    var i = d.info;
    var known = CS.cache.get('meta:' + i.type + ':' + i.metaId);
    return play(known || { id: i.metaId, type: i.type, name: i.name, poster: i.poster, videos: [] }, i.video, CS.downloads.stream(d), {});
  };
})();
