/* Subtitles drawn by the app itself, timed by the video's own clock.
   The TV reports the playing position in steps (and sometimes late); the clock below keeps the most advanced of the recent
   reports and runs it forward with the real time between them, so a line appears on the frame it belongs to — never on a
   late report — and never jumps back to the previous line. */
(function () {
  /* ---------- reading the file ---------- */
  function decode(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (e) { return new TextDecoder('windows-1256').decode(b); }
  }

  function ts(s) {
    /* 01:02:03,456 | 02:03.456 | 0:02:03.45 (ASS) */
    var m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/.exec(s);
    if (!m) return NaN;
    var frac = m[4] ? +('0.' + m[4]) : 0;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + frac;
  }

  function clean(t) {
    return t.replace(/\{[^}]*\}/g, '').replace(/<\/?(i|b|u|font|span|c)[^>]*>/gi, '').replace(/\\N|\\n/g, '\n').replace(/\\h/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
  }

  function parseAss(text) {
    var out = [], fmt = null, inEvents = false;
    text.split(/\r?\n/).forEach(function (line) {
      if (/^\[events\]/i.test(line)) { inEvents = true; return; }
      if (/^\[/.test(line)) { inEvents = false; return; }
      if (!inEvents) return;
      if (/^format:/i.test(line)) { fmt = line.slice(7).split(',').map(function (x) { return x.trim().toLowerCase(); }); return; }
      if (!/^dialogue:/i.test(line) || !fmt) return;
      var parts = line.slice(9).split(','), n = fmt.length;
      var f = parts.slice(0, n - 1).concat([parts.slice(n - 1).join(',')]);
      var o = {};
      fmt.forEach(function (k, i) { o[k] = (f[i] || '').trim(); });
      if (/\\p[1-9]/.test(o.text)) return; /* drawings */
      var t = clean(o.text || '');
      if (t) out.push({ start: ts(o.start), end: ts(o.end), text: t });
    });
    return out;
  }

  function parseSrtVtt(text) {
    var out = [];
    text.replace(/\r/g, '').split(/\n{2,}/).forEach(function (block) {
      var lines = block.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i]);
        if (!m) continue;
        var t = clean(lines.slice(i + 1).join('\n'));
        if (t) out.push({ start: ts(m[1]), end: ts(m[2]), text: t });
        break;
      }
    });
    return out;
  }

  var ARABIC = /[؀-ۿ]/;
  function parse(text) {
    var cues = /\[script info\]|\[events\]/i.test(text.slice(0, 4000)) ? parseAss(text) : parseSrtVtt(text);
    cues = cues.filter(function (c) { return isFinite(c.start) && isFinite(c.end) && c.end > c.start; });
    cues.sort(function (a, b) { return a.start - b.start; });
    cues.forEach(function (c) {
      c.lines = c.text.split('\n').map(function (l) { return ARABIC.test(l) ? '‏' + l.replace(/^‏+|‏+$/g, '') + '‏' : l; });
    });
    return cues;
  }

  /* ---------- the clock ---------- */
  function Clock(video) {
    this.v = video;
    this.reports = [];   /* recent {m: media seconds, p: performance.now()} while playing */
    this.last = -1;
    this.stats = { reports: 0, gaps: [], behind: [], frameReports: 0 };
    var self = this;
    if (video.requestVideoFrameCallback) {
      var onFrame = function (now, meta) {
        if (self.dead) return;
        if (meta && meta.mediaTime != null && !video.paused) { self.add(meta.mediaTime, meta.expectedDisplayTime || now, true); }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
  }
  Clock.prototype.reset = function () { this.reports = []; this.last = -1; };
  Clock.prototype.add = function (m, p, fromFrame) {
    var est = this.estimate(p, true);
    /* a jump of more than 1.5 s either way is a seek: start over */
    if (this.reports.length && Math.abs(m - est) > 1.5) this.reports = [];
    else if (this.reports.length) { this.stats.behind.push(Math.round((est - m) * 1000)); if (this.stats.behind.length > 300) this.stats.behind.shift(); }
    this.reports.push({ m: m, p: p });
    while (this.reports.length > 1 && p - this.reports[0].p > 3000) this.reports.shift();
    if (fromFrame) this.stats.frameReports++;
  };
  /* media time now: the most advanced of the last reports, run forward to now */
  Clock.prototype.estimate = function (p, quiet) {
    var v = this.v, rate = v.playbackRate || 1;
    if (!this.reports.length) return v.currentTime;
    var best = -Infinity, newest = this.reports[this.reports.length - 1];
    for (var i = 0; i < this.reports.length; i++) {
      var r = this.reports[i], e = r.m + (p - r.p) / 1000 * rate;
      if (e > best) best = e;
    }
    /* reports stopped (stall): do not run more than a second past the newest one */
    return Math.min(best, newest.m + 1.0);
  };
  Clock.prototype.now = function () {
    var v = this.v, p = performance.now();
    var raw = v.currentTime;
    var playing = !v.paused && !v.seeking && v.readyState >= 3;
    if (!playing) { this.reset(); this.last = raw; return raw; }
    if (raw !== this.last) {
      if (this.last >= 0 && this.lastAt) { this.stats.gaps.push(Math.round(p - this.lastAt)); if (this.stats.gaps.length > 300) this.stats.gaps.shift(); }
      this.stats.reports++;
      this.lastAt = p;
      this.last = raw;
      this.add(raw, p);
    }
    return this.estimate(p);
  };

  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[b.length >> 1]; }
  function pct(a, q) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; }

  /* ---------- drawing ---------- */
  function Renderer(video, box) {
    this.v = video;
    this.box = box;
    this.cues = [];
    this.delay = 0;          /* ms; + = later, - = earlier */
    this.clock = new Clock(video);
    this.shown = null;
    this.i = 0;
    this.err = [];           /* how far from its own time each line appeared (ms) */
    this.running = false;
    var self = this;
    this.tick = function () {
      if (!self.running) return;
      self.draw();
      requestAnimationFrame(self.tick);
    };
  }
  Renderer.prototype.set = function (cues) { this.cues = cues || []; this.i = 0; this.shown = null; this.prevT = null; this.box.innerHTML = ''; };
  Renderer.prototype.start = function () { if (!this.running) { this.running = true; requestAnimationFrame(this.tick); } };
  Renderer.prototype.stop = function () { this.running = false; this.clock.dead = true; this.box.innerHTML = ''; };
  Renderer.prototype.find = function (t) {
    var c = this.cues, lo = 0, hi = c.length - 1, at = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (c[mid].start <= t) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    /* overlapping lines: show every line that is on at t */
    var on = [];
    for (var k = at; k >= 0 && k > at - 6; k--) if (c[k].end > t && c[k].start <= t) on.unshift(c[k]);
    return on;
  };
  Renderer.prototype.draw = function () {
    if (!this.cues.length) return;
    var est = this.clock.now();
    var t = est - this.delay / 1000;
    var prevT = this.prevT;
    this.prevT = t;
    var on = this.find(t);
    var key = on.map(function (c) { return c.start; }).join('|');
    if (key === this.shown) return;
    this.shown = key;
    var box = this.box;
    box.innerHTML = '';
    var self = this;
    on.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'cue';
      c.lines.forEach(function (l) { var s = document.createElement('div'); s.className = 'line'; s.textContent = l; d.appendChild(s); });
      box.appendChild(d);
      if (!self.v.paused && prevT != null && prevT < c.start && t - prevT < 0.25) { self.err.push(Math.round((t - c.start) * 1000)); if (self.err.length > 500) self.err.shift(); }
    });
  };
  Renderer.prototype.report = function () {
    var s = this.clock.stats;
    return {
      lines: this.err.length,
      lineLateMedianMs: median(this.err), lineLate95Ms: pct(this.err, 0.95),
      reportGapMedianMs: median(s.gaps), reportGap95Ms: pct(s.gaps, 0.95),
      reportBehindMedianMs: median(s.behind), reportBehind95Ms: pct(s.behind, 0.95),
      frameReports: s.frameReports
    };
  };

  CS.subs = {
    parse: parse,
    decode: decode,
    Renderer: Renderer,
    load: function (url) {
      var get = function () {
        return CS.fetchText(url, { binary: true, timeout: CS.isLan(url) ? 90000 : 20000, maxBytes: 6e6 }).then(function (buf) { return parse(decode(buf)); });
      };
      if (!CS.isLan(url)) return get();
      /* from the PC: fitting can take a while (up to 90 s), but a PC that is off or asleep is known in 2.5 s */
      var home = (/^(https?:\/\/[^\/]+)/.exec(url) || [])[1];
      return CS.fetchText(home + '/manifest.json', { timeout: 2500, cache: 'no-store' })
        .then(get, function () { throw new Error('كمبيوترك غير متاح'); });
    },
    /* fitted to the played file by the PC (the speeder's /subsync/ route, given by our Arabic add-on) */
    isFitted: function (s) { return /\/subsync\//.test(s.url || ''); },
    isArabic: function (s) {
      var l = (s.lang || '').toLowerCase();
      return l === 'ara' || l === 'ar' || l === 'arabic' || l === 'ar-sa' || (s._addon && s._addon.manifest.id === CS.addons.SUBS_ID);
    },
    /* Arabic subtitles from all add-ons; ours first (fitted to the file, then as downloaded), then the others */
    arrange: function (all) {
      var ours = all.filter(function (s) { return s._addon && s._addon.manifest.id === CS.addons.SUBS_ID; });
      var fitted = ours.filter(CS.subs.isFitted);
      var plain = ours.filter(function (s) { return fitted.indexOf(s) < 0; });
      var others = all.filter(function (s) { return ours.indexOf(s) < 0 && CS.subs.isArabic(s); });
      var seen = {};
      others = others.filter(function (s) { if (seen[s.url]) return false; seen[s.url] = 1; return true; });
      return { fitted: fitted, plain: plain, others: others };
    },
    applyStyle: function (box) {
      var st = CS.settings;
      /* keep the box's own classes; only the subs-* ones change */
      box.className = box.className.split(' ').filter(function (c) { return c && c.indexOf('subs-') !== 0; })
        .concat(['subs-' + st.subSize, 'subs-' + st.subStyle, 'subs-' + st.subColor]).join(' ');
      box.style.bottom = st.subLift + '%';
    }
  };
})();
