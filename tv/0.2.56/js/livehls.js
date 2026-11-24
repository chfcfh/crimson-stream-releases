/*
 * Crimson Stream — Proprietary & Confidential
 * Copyright (c) 2026 محمد. All rights reserved.
 * Unauthorized copying, sharing or use of this file, by any means, is strictly prohibited.
 */
/* A live match on the TV, played through hls.js (js/lib, Apache-2.0) in place of the TV's own player, so that a piece the match
   relay leaves hanging is asked for again, the way the PC's ⚡ (Speeder.cs) and the phone (LiveData.kt) get them since 0.2.52.
   The owner, 2026-11-24, Real Madrid - PSV: his TV stood on one second for over a minute and then jumped 44 s ahead, while the
   same pieces came to the PC at over 100 Mbps. The relay now and then keeps one ask waiting 15-50 s though the same piece asked
   for again comes at once. So a piece not in after 1.5 s is asked for a second time beside the first, and a third time at 3.5 s;
   the first whole answer is played and the others are let go. The lists (.m3u8) go as before.
   hls.js is fetched once from the releases page (checked against its SHA-256 below) and kept on the TV. A TV with no
   MediaSource, or one where hls.js fails, plays the match with its own player as before (player.js openSrc). */
(function () {
  var LIB = { file: 'hls-1.7.4.light.min.js', sha256: '482cccb3a224554f64d8c2cf0d335dba4a3819bdb726afbfddfe15de4c277d82' };
  var REMOTE = 'https://raw.githubusercontent.com/chfcfh/crimson-stream-releases/main/tv/lib/'; /* release.py puts js/lib there */
  var KEY = 'cs.hlsLib';
  var HEDGES = [1500, 3500]; /* the second and third asks of a piece, as on the PC and the phone */
  var getting = null;

  function log() { if (CS.log) CS.log.apply(null, arguments); }
  function mse() { return !!(window.MediaSource || window.ManagedMediaSource); }
  function sha(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }
  function run(text) {
    var s = document.createElement('script');
    s.text = text;
    document.head.appendChild(s);
    return window.Hls || null;
  }
  /* the package's own copy (a TV installed from this version's .ipk, the preview) */
  function packaged() {
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = 'js/lib/' + LIB.file;
      s.onload = function () { ok(window.Hls || null); };
      s.onerror = function () { s.parentNode.removeChild(s); ok(null); }; /* a TV on an update from the releases page: not in its package */
      document.head.appendChild(s);
    });
  }
  function kept() {
    try {
      var k = JSON.parse(localStorage.getItem(KEY) || 'null');
      return k && k.file === LIB.file && k.sha256 === LIB.sha256 && k.text ? k.text : null; /* kept only once checked */
    } catch (e) { return null; }
  }
  function fetchText() {
    return new Promise(function (ok, fail) {
      var x = new XMLHttpRequest();
      x.open('GET', REMOTE + LIB.file + '?v=' + LIB.sha256.slice(0, 12));
      x.timeout = 30000;
      x.onload = function () { if (x.status === 200) ok(x.responseText); else fail(new Error('HTTP ' + x.status)); };
      x.onerror = x.ontimeout = function () { fail(new Error('no connection')); };
      x.send();
    }).then(function (text) {
      return sha(text).then(function (h) {
        if (h && h !== LIB.sha256) throw new Error('changed in transit');
        try { localStorage.setItem(KEY, JSON.stringify({ file: LIB.file, sha256: LIB.sha256, text: text })); }
        catch (e) { log('hls.js not kept (storage full)'); }
        return text;
      });
    });
  }
  /* hls.js itself: in memory, kept, in the package, or from the releases page */
  function lib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (getting) return getting;
    getting = Promise.resolve().then(function () {
      var text = kept();
      if (text) return run(text);
      return packaged().then(function (H) { return H || fetchText().then(run); });
    }).then(function (H) {
      getting = null;
      if (!H) throw new Error('not loaded');
      return H;
    }, function (e) { getting = null; throw e; });
    return getting;
  }

  /* the stats a piece's loader shares with hls.js (it keeps the object it read first): the winning ask's numbers copied in */
  function copyStats(to, from) {
    ['aborted', 'loaded', 'total', 'chunkCount', 'bwEstimate', 'retry'].forEach(function (k) { if (k in from) to[k] = from[k]; });
    ['loading', 'parsing', 'buffering'].forEach(function (k) { if (from[k] && to[k]) Object.assign(to[k], from[k]); });
    to.aborted = false;
  }
  /* hls.js's own loader for each ask of a piece; up to three asks, the first whole answer wins (an ask that fails brings the
     next one at once) */
  function hedged(Base, hedges, onLate) {
    function Ask(config) {
      this.config = config;
      this.asks = [new Base(config)];
      this.stats = this.asks[0].stats;
      this.timers = [];
      this.done = false;
      this.winner = null;
      this.context = null;
      this.cbs = null;
    }
    Ask.prototype.load = function (context, cfg, cbs) {
      var me = this, failed = 0, t0 = Date.now();
      me.context = context;
      me.cbs = cbs;
      var lost = function (tell) {
        failed++;
        if (me.done || failed < me.asks.length) return; /* another ask is still out */
        if (me.asks.length > hedges.length) { me.done = true; me.letGo(null); tell(); return; }
        more(); /* every ask so far failed: the next one now */
      };
      var send = function (l, n) {
        l.load(context, cfg, {
          onSuccess: function (resp, stats, ctx, net) {
            if (me.done) return;
            me.done = true;
            me.winner = l;
            me.letGo(l);
            if (stats !== me.stats) copyStats(me.stats, stats);
            if (n && onLate) onLate(n + 1, Date.now() - t0);
            cbs.onSuccess(resp, me.stats, ctx, net);
          },
          onError: function (err, ctx, net) { lost(function () { cbs.onError(err, ctx, net, me.stats); }); },
          onTimeout: function (stats, ctx, net) { lost(function () { cbs.onTimeout(me.stats, ctx, net); }); },
          onProgress: n === 0 && cbs.onProgress ? function (stats, ctx, data, net) { if (!me.done) cbs.onProgress(me.stats, ctx, data, net); } : undefined
        });
      };
      var more = function () {
        if (me.done || me.asks.length > hedges.length) return;
        var l = new Base(me.config);
        me.asks.push(l);
        send(l, me.asks.length - 1);
      };
      send(me.asks[0], 0);
      hedges.forEach(function (at, i) {
        me.timers.push(setTimeout(function () { if (!me.done && me.asks.length === i + 1) more(); }, at));
      });
    };
    Ask.prototype.letGo = function (keep) {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      this.asks.forEach(function (l) { if (l !== keep) { try { l.abort(); l.destroy(); } catch (e) { /* already gone */ } } });
    };
    Ask.prototype.abort = function () {
      if (this.done) return;
      this.done = true;
      this.letGo(null);
      this.stats.aborted = true;
      if (this.cbs && this.cbs.onAbort) this.cbs.onAbort(this.stats, this.context, null);
    };
    Ask.prototype.destroy = function () {
      this.done = true;
      this.letGo(this.winner);
      if (this.winner) { try { this.winner.destroy(); } catch (e) { /* gone */ } }
      this.asks = [];
      this.cbs = null;
    };
    Ask.prototype.getResponseHeader = function (name) {
      var w = this.winner || this.asks[0];
      return w && w.getResponseHeader ? w.getResponseHeader(name) : null;
    };
    return Ask;
  }

  /* hls.js's fetch loader, which the light build does not hand out: an Hls made for progressive loading picks it (config.ts
     enableStreamingMode). Pieces go through it with the browser's cache off (fetchSetup below): with the cache on, the browser
     holds a second ask of the same address until the first one answers or 20 s pass (Chromium's cache lock; measured in the
     preview, 2026-11-24: the second ask of a hanging piece reached the relay 20 s late), which is the very wait asking again
     is for. null: hls.js's XHR loader, cache and all */
  var fetchBase;
  function fetchLoader(Hls) {
    if (fetchBase !== undefined) return fetchBase;
    fetchBase = null;
    try {
      var probe = new Hls({ progressive: true });
      if (probe.config.loader && probe.config.loader !== Hls.DefaultConfig.loader) fetchBase = probe.config.loader;
      probe.destroy();
    } catch (e) { /* stays null */ }
    return fetchBase;
  }

  /* a live HLS address this TV can play through hls.js */
  function fits(url) {
    if (!mse() || CS.desktop) return false; /* the PC and the phone play matches with their own players, which already ask again */
    return /^https?:\/\/[^?#]+\.m3u8?(?:[?#]|$)/i.test(url || '');
  }

  /* the match into the video. Resolves to a handle {destroy} once hls.js has it, or null (no hls.js here: the TV's own player).
     how.alive(): still the video on screen; how.cut(why): the connection is gone (player.js reconnects); how.fail(why): hls.js
     cannot play it here (player.js goes back to the TV's own player) */
  function open(video, url, how) {
    return lib().then(function (Hls) {
      if (!how.alive()) return null;
      if (!Hls.isSupported()) { log('hls.js: not supported on this TV'); return null; }
      var late = 0, Base = fetchLoader(Hls);
      if (!Base) log('hls.js: no fetch loader here, pieces through XHR (a second ask may wait on the first)');
      var hls = new Hls({
        fLoader: hedged(Base || Hls.DefaultConfig.loader, HEDGES, function (n, ms) { late++; log('live piece came on ask', n, 'after', ms + 'ms'); }),
        fetchSetup: function (context, init) { init.cache = 'no-store'; return new self.Request(context.url, init); },
        liveDurationInfinity: true, /* a live stream reads as endless, as with the TV's own player (the bar says «مباشر») */
        maxBufferLength: 30,
        backBufferLength: 20, /* the TV's memory */
        fragLoadPolicy: { default: {
          maxTimeToFirstByteMs: 20000, maxLoadTimeMs: 40000,
          timeoutRetry: { maxNumRetry: 3, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 }
        } }
      });
      var mended = 0, gone = false;
      hls.on(Hls.Events.ERROR, function (ev, d) {
        if (!d || !d.fatal || gone) return;
        log('hls.js error', d.type, d.details);
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mended < 2) { mended++; hls.recoverMediaError(); return; }
        gone = true;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) how.cut('hls ' + d.details);
        else how.fail('hls ' + d.details);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function (ev, d) { log('hls.js: live list read,', (d.levels || []).length, 'qualities'); });
      hls.attachMedia(video);
      hls.loadSource(url);
      return { destroy: function () { gone = true; try { hls.destroy(); } catch (e) { /* gone */ } }, late: function () { return late; } };
    }, function (e) { log('hls.js not loaded:', e.message); return null; });
  }

  CS.livehls = { fits: fits, open: open, lib: lib, hedged: hedged };

  /* fetched and kept a while after the start, so the first match does not wait for it (the TV only: desktop.js, loaded after
     this file, has said by then whether this is the PC or the phone) */
  setTimeout(function () {
    if (CS.desktop || !mse() || window.Hls || kept()) return;
    fetchText().then(function () { log('hls.js kept'); }, function (e) { log('hls.js not fetched:', e.message); });
  }, 20000);
})();
