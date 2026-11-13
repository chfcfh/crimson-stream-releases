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

  /* Our add-on shows the fitted lines a quarter second early, to make up for Stremio's LG app drawing them late (SYNC_LEAD in
     stremio-arabic-subs). This app's own clock draws them on time: on the TV, 0 to 42 ms from the picture in 300 captures of the
     screen (2026-11-09). So the lead comes off here, and Stremio's apps keep theirs. tools/test.js checks the two numbers agree. */
  var FITTED_LEAD = 0.25;
  function withoutLead(url, cues) {
    if (!/\/subsync\//.test(url)) return cues;
    cues.forEach(function (c) { c.start += FITTED_LEAD; c.end += FITTED_LEAD; });
    return cues;
  }

  CS.subs = {
    /* the shift (ms) a link made by this app asks the PC for: the same lead as the add-on's rows, which comes off again here */
    leadMs: -Math.round(FITTED_LEAD * 1000),
    parse: parse,
    decode: decode,
    Renderer: Renderer,
    FITTED_LEAD: FITTED_LEAD,
    load: function (url) {
      var get = function () {
        return CS.fetchText(url, { binary: true, timeout: CS.isLan(url) ? 90000 : 20000, maxBytes: 6e6 }).then(function (buf) { return withoutLead(url, parse(decode(buf))); });
      };
      if (!CS.isLan(url)) return get();
      /* from the PC: fitting can take a while (up to 90 s), but a PC that is off or asleep is known in 2.5 s */
      var home = (/^(https?:\/\/[^\/]+)/.exec(url) || [])[1];
      return CS.fetchText(home + '/manifest.json', { timeout: 2500, cache: 'no-store' })
        .then(get, function () { throw new Error('كمبيوترك غير متاح'); });
    },
    /* The subtitle fitted to the file comes first and is waited for. A big file takes the PC minutes; it goes on working after a
       request gives up, so asking again gets the result when it is ready.
       on.ready(cues, tries): it is here. on.slow(): the first request ended without it, show something meanwhile (once).
       on.gone(): it will not come, the PC is off or it stopped trying. alive() false ends it all silently. */
    waitFitted: function (url, alive, on) {
      var tries = 0, done = false, slowTold = false, wait = on.wait || 5000;
      setTimeout(function () { if (!done && !slowTold && alive()) CS.toast('نضبط الترجمة على ملف الحلقة…'); }, 3000);
      /* a stand-in after 15 s, not only once a request gives up: that took 90 s, and a slow file (a friend's Dexter, 4 minutes)
         played its first minute and a half with no subtitle at all. The fitted one still takes over when it comes */
      setTimeout(function () { if (!done && !slowTold && alive()) { slowTold = true; on.slow(); } }, on.slowAfter || 15000);
      var ask = function () {
        if (!alive()) return;
        tries++;
        CS.subs.load(url).then(function (cues) {
          if (!alive()) return;
          if (!cues.length) { done = true; on.gone(); return; }
          done = true;
          on.ready(cues, tries);
        }, function (e) {
          if (!alive()) return;
          CS.log('fitted subtitle not ready', e.message || e.name, 'try ' + tries);
          /* a PC still at work keeps the request open; one that answers 502 has failed (the subtitle could not be fetched): twice is
             enough, where it was asked twelve times over 70 s before the TV fitted it from the file's index itself */
          if (tries >= 12 || /غير متاح/.test(e.message || '') || (/HTTP 50\d/.test(e.message || '') && tries >= 2)) { done = true; on.gone(); return; }
          if (!slowTold) { slowTold = true; on.slow(); }
          setTimeout(ask, wait);
        });
      };
      ask();
    },
    /* the link that has the PC fit this very subtitle to the played file: the fitted link's job, with another subtitle in it */
    fitLink: function (fit, s) {
      if (CS.subs.isFitted(s)) return s.url;
      var m = /^(.*\/subsync\/)([A-Za-z0-9_-]+)(\.\w+)$/.exec(fit.url);
      if (!m) return '';
      var job = JSON.parse(decodeURIComponent(escape(atob(m[2].replace(/-/g, '+').replace(/_/g, '/')))));
      job.u = s.url;
      job.own = true;
      return CS.subs.jobLink(m[1].slice(0, -'/subsync/'.length), job, m[3]);
    },
    /* the subtitle a fitted link was made from (its job's u), or '' */
    sourceOf: function (url) {
      var m = /\/subsync\/([A-Za-z0-9_-]+)\.\w+$/.exec(url || '');
      if (!m) return '';
      try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))).u || ''; } catch (e) { return ''; }
    },
    /* a link that has the speeder at base fit job.u to the file job.f: {t: type, id: video id, f: file name, u: subtitle, s: shift ms, own} */
    jobLink: function (base, job, ext) {
      return base + '/subsync/' + btoa(unescape(encodeURIComponent(JSON.stringify(job)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + (ext || '.srt');
    },
    /* a fit with its match share -> {cues, share}. share: 0-1, the lines on the file's own timing; null when the PC had nothing to compare with */
    loadFit: function (link, timeout) {
      return CS.fetchJson(link.replace(/\.\w+$/, '.json'), { timeout: timeout || 90000, cache: 'no-store' }).then(function (r) {
        return { cues: withoutLead(link, parse(r.srt)), share: r.share };
      });
    },
    /* each of these subtitles fitted by the PC, two at a time; onOne(s, {cues, share}). One that fails is simply left out */
    fitAll: function (fit, list, alive, onOne, timeout) {
      return CS.pool(list, 2, function (s) {
        if (!alive()) return null;
        var link = CS.subs.fitLink(fit, s);
        if (!link) return null;
        return CS.subs.loadFit(link, timeout).then(function (r) { if (alive()) onOne(s, r); }, function (e) { CS.log('fit not ready', String(s.id).slice(0, 30), e.message || e.name); });
      });
    },
    /* From afar (crimson-hub): the request is left with the hub, the owner's PC takes it when it can, and results stay there.
       on.one(s, {cues, share}) for each result; on.asleep(): the PC is not around, something else may be tried meanwhile (once);
       on.bad(): the code was refused; on.end(): nothing more will come. */
    hubOn: function () { return !!(CS.config.hubUrl && CS.settings.fitCode); },
    hubFit: function (what, list, alive, on) {
      var base = CS.config.hubUrl, headers = { 'x-cs-key': CS.settings.fitCode, 'content-type': 'application/json' };
      var byUrl = {}, taken = {}, jobId = '', sleepTold = false, started = Date.now(), wait = on.wait || 10000, limit = on.limit || 20 * 60000;
      var subs = list.filter(function (s) { return !CS.subs.isFitted(s); }).slice(0, 16);
      subs.forEach(function (s) { byUrl[s.url] = s; });
      var opts = function (extra) { return Object.assign({ headers: headers, timeout: 20000, cache: 'no-store' }, extra); };
      var asleep = function () { if (!sleepTold) { sleepTold = true; on.asleep(); } };
      var turn = function (st) {
        if (!alive()) return;
        var fresh = Object.keys(st.subs).filter(function (h) { return st.subs[h].state === 'done' && !taken[h] && byUrl[st.subs[h].url]; });
        CS.pool(fresh, 2, function (h) {
          return CS.fetchText(base + '/fit/' + st.job + '/' + h, opts()).then(function (srt) {
            taken[h] = 1;
            if (alive()) on.one(byUrl[st.subs[h].url], { cues: parse(srt), share: st.subs[h].share });
          }, function (e) { CS.log('fitted subtitle not read', e.message || e.name); });
        }).then(function () {
          if (!alive()) return;
          if (!st.waiting || Date.now() - started > limit) { on.end(); return; }
          if (!st.pcAwake) asleep();
          setTimeout(poll, wait);
        });
      };
      var fail = function (e) {
        if (!alive()) return;
        CS.log('hub', e.message || e.name);
        if (/HTTP 401/.test(e.message || '')) { on.bad(); on.end(); return; }
        asleep();
        if (Date.now() - started > limit || !jobId) { on.end(); return; }
        setTimeout(poll, wait);
      };
      var poll = function () { if (alive()) CS.fetchJson(base + '/fit/' + jobId, opts()).then(turn, fail); };
      if (!subs.length) { on.end(); return; }
      CS.fetchJson(base + '/fit', opts({ method: 'POST', body: JSON.stringify({ t: what.t, id: what.id, f: what.f, subs: subs.map(function (s) { return { url: s.url }; }) }) }))
        .then(function (st) { jobId = st.job; turn(st); }, fail);
    },
    /* fitted to the played file by the PC (the speeder's /subsync/ route, given by our Arabic add-on) */
    isFitted: function (s) { return /\/subsync\//.test(s.url || ''); },
    isArabic: function (s) {
      var l = (s.lang || '').toLowerCase();
      return l === 'ara' || l === 'ar' || l === 'arabic' || l === 'ar-sa' || (s._addon && s._addon.manifest.id === CS.addons.SUBS_ID);
    },
    /* Arabic subtitles from all add-ons; ours first (fitted to the file, then as downloaded), then the others */
    arrange: function (all) {
      /* the add-on's «مضبوطة على ملفك» rows are fitted by the owner's PC: left out, the app fits them itself (faster) */
      var ours = all.filter(function (s) { return s._addon && s._addon.manifest.id === CS.addons.SUBS_ID && !CS.subs.isFitted(s); });
      var fitted = [];
      var plain = ours.filter(function (s) { return fitted.indexOf(s) < 0; });
      var others = all.filter(function (s) { return !(s._addon && s._addon.manifest.id === CS.addons.SUBS_ID) && CS.subs.isArabic(s); });
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
