/* The played file's own subtitle lines, read through its index instead of downloading it. An MKV's Cues list every line of a text
   track with its time and its place in the file, so a small read per line gives the whole track: about 2 MB of a 1 GB file. It is
   the timing the Arabic subtitles are fitted to (linefit.js). Files with no such index give null and stay as they are.
   read(a, b) is given by each device: a promise of the bytes a..b (Uint8Array); a refusal rejects with .status set.
   The file server shuts out a home for minutes after a burst of requests (429), and the video with it. So reads go at most 3 a second
   and the first refusal ends the whole read, which is remembered until the server's time is over. */
(function () {
  var ID = { EBML: 0x1A45DFA3, SEGMENT: 0x18538067, SEEKHEAD: 0x114D9B74, SEEK: 0x4DBB, SEEKID: 0x53AB, SEEKPOS: 0x53AC, INFO: 0x1549A966, SCALE: 0x2AD7B1,
    TRACKS: 0x1654AE6B, TRACK: 0xAE, NUM: 0xD7, TYPE: 0x83, CODEC: 0x86, LANG: 0x22B59C, LANGB: 0x22B59D, NAME: 0x536E, FORCED: 0x55AA, HEARING: 0x55AB, ENCODED: 0x6D80,
    CUES: 0x1C53BB6B, CUEPOINT: 0xBB, CUETIME: 0xB3, CUEPOS: 0xB7, CUETRACK: 0xF7, CUECLUSTER: 0xF1, CUEREL: 0xF0, CUEDUR: 0xB2,
    CLUSTER: 0x1F43B675, GROUP: 0xA0, BLOCK: 0xA1, SIMPLE: 0xA3, BLOCKDUR: 0x9B };
  var POOL = 3, GAP = 340, LINE = 512, MAXINDEX = 16 * 1024 * 1024, CHUNK = 1024 * 1024;
  var nextSlot = 0, shutUntil = 0;
  /* the next free moment for a request, for every read on this device */
  function slot() {
    var now = Date.now(), at = Math.max(now, nextSlot);
    nextSlot = at + GAP;
    return at > now ? new Promise(function (ok) { setTimeout(ok, at - now); }) : Promise.resolve();
  }

  /* an element's id at i: { v, n } or null when the bytes run out */
  function idAt(d, i) {
    if (i >= d.length) return null;
    var b = d[i], n = 1, m = 0x80;
    while (n <= 4 && !(b & m)) { n++; m >>= 1; }
    if (n > 4 || i + n > d.length) return null;
    var v = 0;
    for (var k = 0; k < n; k++) v = v * 256 + d[i + k];
    return { v: v, n: n };
  }
  /* a size at i: { v, n }; v is -1 for "unknown" (all ones) */
  function sizeAt(d, i) {
    if (i >= d.length) return null;
    var b = d[i], n = 1, m = 0x80;
    while (n <= 8 && !(b & m)) { n++; m >>= 1; }
    if (n > 8 || i + n > d.length) return null;
    var v = b & (m - 1), all = v === m - 1;
    for (var k = 1; k < n; k++) { if (d[i + k] !== 255) all = false; v = v * 256 + d[i + k]; }
    return { v: all ? -1 : v, n: n };
  }
  /* calls f(id, dataStart, dataSize) for the elements of d[a..b); an element reaching past the bytes is still told (f checks) */
  function walk(d, a, b, f) {
    var i = a;
    while (i < b) {
      var e = idAt(d, i);
      if (!e) return;
      var s = sizeAt(d, i + e.n);
      if (!s) return;
      var h = i + e.n + s.n;
      if (f(e.v, h, s.v) === false) return;
      if (s.v < 0) return;
      i = h + s.v;
    }
  }
  function uint(d, a, n) { var v = 0; for (var i = 0; i < n; i++) v = v * 256 + d[a + i]; return v; }
  function ascii(d, a, n) { var s = ''; for (var i = 0; i < n && d[a + i]; i++) s += String.fromCharCode(d[a + i]); return s; }
  var utf8 = window.TextDecoder ? new TextDecoder('utf-8') : null;

  function parseTracks(d, a, b) {
    var out = [];
    walk(d, a, b, function (id, h, sz) {
      if (id !== ID.TRACK) return;
      var t = {};
      walk(d, h, Math.min(d.length, h + sz), function (e, x, s) {
        if (e === ID.NUM) t.num = uint(d, x, s);
        else if (e === ID.TYPE) t.type = uint(d, x, s);
        else if (e === ID.CODEC) t.codec = ascii(d, x, s);
        else if (e === ID.LANG || e === ID.LANGB) t.lang = ascii(d, x, s);
        else if (e === ID.NAME) t.name = utf8 ? utf8.decode(d.subarray(x, x + s)) : '';
        else if (e === ID.FORCED) t.forced = uint(d, x, s) === 1;
        else if (e === ID.HEARING) t.hearing = uint(d, x, s) === 1;
        else if (e === ID.ENCODED) t.encoded = true;
      });
      out.push(t);
    });
    return out;
  }

  function isText(t) { return t.type === 17 && !t.encoded && /^(S_TEXT\/(UTF8|ASS|SSA|WEBVTT)|S_ASS|S_SSA)/.test(t.codec || ''); }

  /* the track to fit to: the fullest kind that reads the same as the film. Plain English first, as long as it is not much thinner than
     the fullest track (a track marked forced may really be the full one, and one really forced has few lines) */
  function pickTrack(tracks, count) {
    var text = tracks.filter(function (t) { return isText(t) && (count[t.num] || 0) >= 30; });
    if (!text.length) return null;
    var most = 0;
    text.forEach(function (t) { most = Math.max(most, count[t.num]); });
    var full = text.filter(function (t) { return count[t.num] >= most * 0.6 && !/forced|signs|songs/i.test(t.name || ''); });
    if (!full.length) full = text;
    var eng = function (t) { return /^en/i.test(t.lang || ''); }, ara = function (t) { return /^ar/i.test(t.lang || ''); };
    var sdh = function (t) { return t.hearing || /sdh|hearing|\bcc\b/i.test(t.name || ''); };
    var by = function (f) { return full.filter(f).sort(function (a, b) { return count[b.num] - count[a.num]; })[0]; };
    return by(function (t) { return eng(t) && !sdh(t) && !t.forced; }) || by(function (t) { return eng(t) && !t.forced; }) || by(function (t) { return ara(t) && !t.forced; }) ||
      by(function (t) { return !t.forced; }) || by(function () { return true; });
  }

  function assText(codec, s) {
    if (!/ASS|SSA/.test(codec)) return s;
    /* a block is ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text */
    var cut = 0;
    for (var i = 0; i < 8; i++) {
      var c = s.indexOf(',', cut);
      if (c < 0) return s;
      cut = c + 1;
    }
    return s.slice(cut).replace(/\\[Nn]/g, '\n');
  }

  /* gives { lines: [{start, end, text}] in ms, by time, track, ... }, or null when this file cannot be read this way */
  function readFile(read, alive) {
    alive = alive || function () { return true; };
    var requests = 0, misses = 0, refused = false;
    if (Date.now() < shutUntil) return Promise.resolve(null);
    var get = function (a, b) {
      return slot().then(function () {
        if (refused || !alive()) throw new Error('stopped');
        requests++;
        return read(a, b);
      }).catch(function (e) {
        if (e && e.status === 429 && !refused) {
          refused = true;
          shutUntil = Date.now() + Math.max(300, +e.retryAfter || 0) * 1000;
        }
        throw e;
      });
    };
    var element = function (pos) { /* one whole element at pos, within reason */
      return get(pos, pos + 15).then(function (d) {
        var e = idAt(d, 0), s = e && sizeAt(d, e.n);
        if (!s || s.v < 0 || s.v > MAXINDEX) return null;
        var h = e.n + s.n, whole = new Uint8Array(s.v);
        var pieces = [];
        for (var at = 0; at < s.v; at += CHUNK) pieces.push(at);
        return pieces.reduce(function (p, at) {
          return p.then(function () {
            return get(pos + h + at, pos + h + Math.min(s.v, at + CHUNK) - 1).then(function (c) { whole.set(c.subarray(0, Math.min(c.length, s.v - at)), at); });
          });
        }, Promise.resolve()).then(function () { return { id: e.v, d: whole }; });
      });
    };
    return get(0, 256 * 1024 - 1).then(function (head) {
      var seg = -1;
      walk(head, 0, head.length, function (id, h) { if (id === ID.SEGMENT) { seg = h; return false; } });
      if (seg < 0) return null;
      var seek = {}, scale = 1000000, tracks = null;
      walk(head, seg, head.length, function (id, h, sz) {
        if (id === ID.CLUSTER) return false;
        var inside = sz >= 0 && h + sz <= head.length;
        if (id === ID.SEEKHEAD && inside) {
          walk(head, h, h + sz, function (e, x, s) {
            if (e !== ID.SEEK) return;
            var sid = 0, pos = -1;
            walk(head, x, x + s, function (e2, y, s2) {
              if (e2 === ID.SEEKID) sid = uint(head, y, s2);
              if (e2 === ID.SEEKPOS) pos = uint(head, y, s2);
            });
            if (sid && pos >= 0 && seek[sid] === undefined) seek[sid] = seg + pos;
          });
        }
        if (id === ID.INFO && inside) { seek[ID.INFO] = -2; walk(head, h, h + sz, function (e, x, s) { if (e === ID.SCALE) scale = uint(head, x, s); }); }
        if (id === ID.TRACKS && inside) tracks = parseTracks(head, h, h + sz);
        if (id === ID.CUES) seek[ID.CUES] = seek[ID.CUES] === undefined ? h - 12 : seek[ID.CUES];
      });
      if (!(seek[ID.CUES] >= 0)) return null;
      var needInfo = seek[ID.INFO] >= 0 ? element(seek[ID.INFO]).then(function (x) {
        if (x) walk(x.d, 0, x.d.length, function (e, a, s) { if (e === ID.SCALE) scale = uint(x.d, a, s); });
      }) : Promise.resolve();
      var needTracks = tracks ? Promise.resolve() : (seek[ID.TRACKS] >= 0 ? element(seek[ID.TRACKS]).then(function (x) { if (x) tracks = parseTracks(x.d, 0, x.d.length); }) : Promise.resolve());
      return needInfo.then(function () { return needTracks; }).then(function () {
        if (!tracks || !tracks.some(isText)) return null;
        return element(seek[ID.CUES]);
      }).then(function (x) {
        if (!x || x.id !== ID.CUES) return null;
        var per = {}, count = {}, d = x.d;
        walk(d, 0, d.length, function (id, h, sz) {
          if (id !== ID.CUEPOINT) return;
          var tm = 0;
          walk(d, h, h + sz, function (e, a, s) {
            if (e === ID.CUETIME) tm = uint(d, a, s);
            if (e !== ID.CUEPOS) return;
            var c = { t: tm, cl: -1, rel: -1, du: 0 }, tr = 0;
            walk(d, a, a + s, function (e2, b, s2) {
              if (e2 === ID.CUETRACK) tr = uint(d, b, s2);
              else if (e2 === ID.CUECLUSTER) c.cl = uint(d, b, s2);
              else if (e2 === ID.CUEREL) c.rel = uint(d, b, s2);
              else if (e2 === ID.CUEDUR) c.du = uint(d, b, s2);
            });
            if (c.cl >= 0 && c.rel >= 0) { (per[tr] = per[tr] || []).push(c); count[tr] = (count[tr] || 0) + 1; }
          });
        });
        var track = pickTrack(tracks, count);
        if (!track) return null;
        var list = per[track.num].sort(function (a, b) { return a.t - b.t; });
        var ms = scale / 1000000, heads = {}, guess = 12, next = 0, got = [], failed = 0;

        /* the block at this place, if it is this track's: { text, du } or null */
        var blockAt = function (buf) {
          var e = idAt(buf, 0), s = e && sizeAt(buf, e.n);
          if (!s || s.v <= 0 || (e.v !== ID.GROUP && e.v !== ID.SIMPLE)) return null;
          var h = e.n + s.n, sz = s.v, du = 0;
          if (e.v === ID.GROUP) {
            var inner = -1, innerSize = 0;
            walk(buf, h, Math.min(buf.length, h + sz), function (id, a, l) {
              if (id === ID.BLOCK) { inner = a; innerSize = l; }
              if (id === ID.BLOCKDUR) du = uint(buf, a, l);
            });
            if (inner < 0) return null;
            h = inner; sz = innerSize;
          }
          var t = sizeAt(buf, h);
          if (!t || t.v !== track.num) return null;
          return { from: h + t.n + 3, to: h + sz, du: du };
        };
        var one = function (c) {
          var at = seg + c.cl;
          var take = function (hs, again) {
            return get(at + hs + c.rel, at + hs + c.rel + LINE - 1).then(function (buf) {
              var b = blockAt(buf);
              if (!b) {
                if (again) return null;
                misses++;
                return get(at, at + 15).then(function (cl) { /* this cluster's header is not the size guessed */
                  var i = idAt(cl, 0), s = i && sizeAt(cl, i.n);
                  if (!s || i.v !== ID.CLUSTER) return null;
                  var real = i.n + s.n;
                  heads[c.cl] = real;
                  guess = real;
                  return take(real, true);
                });
              }
              heads[c.cl] = hs;
              if (b.to <= buf.length) return { buf: buf, b: b };
              if (b.to > 64 * 1024) return null;
              return get(at + hs + c.rel, at + hs + c.rel + b.to - 1).then(function (more) { return { buf: more, b: b }; }); /* a long line */
            });
          };
          return take(heads[c.cl] || guess, !!heads[c.cl]).then(function (r) {
            if (!r) { failed++; return; }
            var text = utf8 ? utf8.decode(r.buf.subarray(r.b.from, r.b.to)) : '';
            text = assText(track.codec, text).replace(/\r/g, '').trim();
            if (!text) return;
            var start = c.t * ms, du = (c.du || r.b.du || 0) * ms;
            got.push({ start: Math.round(start), end: Math.round(start + du), text: text, noEnd: !du });
          }, function () { failed++; });
        };
        var worker = function () {
          if (next >= list.length || refused || !alive()) return Promise.resolve();
          return one(list[next++]).then(worker);
        };
        var workers = [];
        for (var w = 0; w < POOL; w++) workers.push(worker());
        return Promise.all(workers).then(function () {
          if (refused || !alive() || got.length < 30 || got.length < list.length * 0.8) return null;
          got.sort(function (a, b) { return a.start - b.start; });
          got.forEach(function (l, i) {
            if (l.noEnd) l.end = Math.min(l.start + 3000, i + 1 < got.length ? got[i + 1].start : l.start + 3000);
            delete l.noEnd;
          });
          return { lines: got, track: track.lang || String(track.num), total: list.length, failed: failed, misses: misses, requests: requests };
        });
      });
    });
  }

  /* the same subtitle, each line where the file's own track says: { cues, paired } in the player's form, or null */
  function fitCues(cues, ref) {
    var L = window.CS && CS.linefit;
    if (!L) return null;
    var raw = cues.map(function (c) { return { start: c.start * 1000, end: c.end * 1000, text: c.lines.join('\n') }; });
    if (!L.reallyArabic(raw)) return null;
    var f = L.fitToFile(raw, ref);
    if (!f.snapped) return null;
    return { paired: f.paired, cues: f.cues.map(function (c) { return { start: c.start / 1000, end: c.end / 1000, lines: c.text.split('\n') }; }) };
  }

  /* reading straight from the page (the TV). Only the first read goes through the source's redirects: those have limits of their own */
  function pageRead(url) {
    var at = url;
    return function (a, b) {
      var c = new AbortController(), timer = setTimeout(function () { c.abort(); }, 30000);
      return fetch(at, { headers: { Range: 'bytes=' + a + '-' + b }, signal: c.signal }).then(function (r) {
        if (r.status !== 206) { /* a server answering with the whole file must not go on sending it */
          var e = new Error('status ' + r.status);
          e.status = r.status;
          e.retryAfter = r.headers.get('retry-after');
          c.abort();
          throw e;
        }
        if (r.url) at = r.url;
        return r.arrayBuffer();
      }).then(function (buf) { clearTimeout(timer); return new Uint8Array(buf); }, function (e) { clearTimeout(timer); throw e; });
    };
  }

  window.CS = window.CS || {};
  window.CS.mkvIndex = { read: readFile, fitCues: fitCues, pageRead: pageRead };
})();
