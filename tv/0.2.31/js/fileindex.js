/* The played file's subtitle times from its own index, in a handful of small reads, on any device and for any file size.
   An MKV's Cues list the time of every subtitle line (text tracks, and picture tracks: one entry when a picture shows, one when it
   clears); an MP4's moov gives every subtitle sample's time and byte size. Measured 2026-11-10 on the files watched at home: MKV 5
   requests and 0.3-1.7 MB even for an 81.7 GB film, MP4 5-8 requests and 6-12 MB; 100% of the PC's reference lines within 0.06 s
   of an index entry. The words come from an English subtitle whose times stand on the index (the free OpenSubtitles add-on);
   Arabic fitted to "index times + those words" lands where the PC's fit puts it, 98% of lines on average.
   The same file runs in the app (CS.fileIndex) and in the PC fitter (require). Reads go one at a time, a little apart, and the first
   refusal (429) ends them: the file server shuts a home out for minutes after a burst, and the video with it. */
(function (root) {
  var ID = { SEGMENT: 0x18538067, SEEKHEAD: 0x114D9B74, SEEK: 0x4DBB, SEEKID: 0x53AB, SEEKPOS: 0x53AC, INFO: 0x1549A966, SCALE: 0x2AD7B1,
    TRACKS: 0x1654AE6B, TRACK: 0xAE, NUM: 0xD7, TYPE: 0x83, CODEC: 0x86, LANG: 0x22B59C, LANGB: 0x22B59D, NAME: 0x536E, FORCED: 0x55AA, HEARING: 0x55AB,
    CUES: 0x1C53BB6B, CUEPOINT: 0xBB, CUETIME: 0xB3, CUEPOS: 0xB7, CUETRACK: 0xF7, CUEDUR: 0xB2, CLUSTER: 0x1F43B675 };
  var GAP = 400, HEAD = 256 * 1024, MAXINDEX = 32 * 1024 * 1024, MAXMOOV = 80 * 1024 * 1024;
  var nextSlot = 0, shutUntil = 0;
  var utf8 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function slot() {
    var now = Date.now(), at = Math.max(now, nextSlot);
    nextSlot = at + GAP;
    return at > now ? new Promise(function (ok) { setTimeout(ok, at - now); }) : Promise.resolve();
  }

  /* ---------- MKV (EBML) ---------- */
  function idAt(d, i) {
    if (i >= d.length) return null;
    var b = d[i], n = 1, m = 0x80;
    while (n <= 4 && !(b & m)) { n++; m >>= 1; }
    if (n > 4 || i + n > d.length) return null;
    var v = 0;
    for (var k = 0; k < n; k++) v = v * 256 + d[i + k];
    return { v: v, n: n };
  }
  function sizeAt(d, i) {
    if (i >= d.length) return null;
    var b = d[i], n = 1, m = 0x80;
    while (n <= 8 && !(b & m)) { n++; m >>= 1; }
    if (n > 8 || i + n > d.length) return null;
    var v = b & (m - 1), all = v === m - 1;
    for (var k = 1; k < n; k++) { if (d[i + k] !== 255) all = false; v = v * 256 + d[i + k]; }
    return { v: all ? -1 : v, n: n };
  }
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
  function tracksOf(d, a, b) {
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
      });
      out.push(t);
    });
    return out;
  }
  function mkv(get, head) {
    var seg = -1;
    walk(head, 0, head.length, function (id, h) { if (id === ID.SEGMENT) { seg = h; return false; } });
    if (seg < 0) return Promise.resolve(null);
    var seek = {}, scale = 1000000, tracks = null;
    walk(head, seg, head.length, function (id, h, sz) {
      if (id === ID.CLUSTER) return false;
      var inside = sz >= 0 && h + sz <= head.length;
      if (id === ID.SEEKHEAD && inside) walk(head, h, h + sz, function (e, x, s) {
        if (e !== ID.SEEK) return;
        var sid = 0, pos = -1;
        walk(head, x, x + s, function (e2, y, s2) { if (e2 === ID.SEEKID) sid = uint(head, y, s2); if (e2 === ID.SEEKPOS) pos = uint(head, y, s2); });
        if (sid && pos >= 0 && seek[sid] === undefined) seek[sid] = seg + pos;
      });
      if (id === ID.INFO && inside) walk(head, h, h + sz, function (e, x, s) { if (e === ID.SCALE) scale = uint(head, x, s); });
      if (id === ID.TRACKS && inside) tracks = tracksOf(head, h, h + sz);
    });
    /* one whole element at pos: its header first, then its body in one read */
    var element = function (pos) {
      return get(pos, pos + 15).then(function (hd) {
        var e = idAt(hd, 0), s = e && sizeAt(hd, e.n);
        if (!s || s.v < 0 || s.v > MAXINDEX) return null;
        return get(pos + e.n + s.n, pos + e.n + s.n + s.v - 1).then(function (d) { return { id: e.v, d: d }; });
      });
    };
    var needTracks = tracks || !(seek[ID.TRACKS] >= 0) ? Promise.resolve() : element(seek[ID.TRACKS]).then(function (x) { if (x) tracks = tracksOf(x.d, 0, x.d.length); });
    return needTracks.then(function () {
      if (!tracks || !tracks.some(function (t) { return t.type === 17; }) || !(seek[ID.CUES] >= 0)) return { kind: 'mkv', subs: [] };
      return element(seek[ID.CUES]).then(function (x) {
        if (!x || x.id !== ID.CUES) return { kind: 'mkv', subs: [] };
        var d = x.d, per = {};
        walk(d, 0, d.length, function (id, h, sz) {
          if (id !== ID.CUEPOINT) return;
          var tm = 0;
          walk(d, h, h + sz, function (e, a, s) {
            if (e === ID.CUETIME) tm = uint(d, a, s);
            if (e !== ID.CUEPOS) return;
            var tr = 0, du = 0;
            walk(d, a, a + s, function (e2, b, s2) { if (e2 === ID.CUETRACK) tr = uint(d, b, s2); else if (e2 === ID.CUEDUR) du = uint(d, b, s2); });
            (per[tr] = per[tr] || []).push({ t: tm, du: du });
          });
        });
        var ms = scale / 1000000;
        var subs = tracks.filter(function (t) { return t.type === 17; }).map(function (t) {
          var cues = (per[t.num] || []).map(function (c) { return { start: Math.round(c.t * ms), end: Math.round((c.t + c.du) * ms) }; });
          cues.sort(function (a, b) { return a.start - b.start; });
          return { num: t.num, codec: t.codec || '', lang: t.lang || 'eng', name: t.name || '', forced: !!t.forced, hearing: !!t.hearing,
            text: /^(S_TEXT|S_ASS|S_SSA)/.test(t.codec || ''), cues: cues };
        });
        return { kind: 'mkv', subs: subs, indexBytes: d.length };
      });
    });
  }

  /* ---------- MP4 ---------- */
  function u32(d, i) { return ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3]; }
  function u64(d, i) { return u32(d, i) * 4294967296 + u32(d, i + 4); }
  function s32(d, i) { var v = u32(d, i); return v >= 2147483648 ? v - 4294967296 : v; }
  function s64(d, i) { var hi = u32(d, i), lo = u32(d, i + 4); return hi >= 2147483648 ? -((4294967295 - hi) * 4294967296 + (4294967296 - lo)) : hi * 4294967296 + lo; }
  function name4(d, i) { return String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]); }
  function boxes(d, a, b) {
    var out = [], i = a;
    while (i + 8 <= b) {
      var size = u32(d, i), hdr = 8, type = name4(d, i + 4);
      if (size === 1) { if (i + 16 > b) break; size = u64(d, i + 8); hdr = 16; } else if (size === 0) size = b - i;
      if (size < hdr) break;
      out.push({ type: type, data: i + hdr, end: Math.min(b, i + size) });
      i += size;
    }
    return out;
  }
  function find(list, type) { for (var i = 0; i < list.length; i++) if (list[i].type === type) return list[i]; return null; }
  function mp4(get, head, size) {
    /* the top boxes one after another (each header is a 16-byte read past what the first read holds) until moov */
    var at = 0, n = 0;
    var next = function () {
      if (n++ > 16 || at >= size) return Promise.resolve(null);
      var h = at + 16 <= head.length ? Promise.resolve(head.subarray(at, at + 16)) : get(at, Math.min(size - 1, at + 15));
      return h.then(function (b) {
        if (b.length < 8) return null;
        var s = u32(b, 0), type = name4(b, 4);
        if (s === 1) s = u64(b, 8); else if (s === 0) s = size - at;
        if (type === 'moov') return { at: at, size: s };
        if (s < 8) return null;
        at += s;
        return next();
      });
    };
    return next().then(function (moov) {
      if (!moov || moov.size > MAXMOOV) return { kind: 'mp4', subs: [] };
      var body = moov.at + moov.size <= head.length ? Promise.resolve(head.subarray(moov.at, moov.at + moov.size)) : get(moov.at, moov.at + moov.size - 1);
      return body.then(function (d) {
        var top = boxes(d, 8, d.length), mvhd = find(top, 'mvhd');
        var movieScale = mvhd ? (d[mvhd.data] === 1 ? u32(d, mvhd.data + 20) : u32(d, mvhd.data + 12)) : 1000;
        var subs = [];
        top.filter(function (x) { return x.type === 'trak'; }).forEach(function (trak) {
          var tb = boxes(d, trak.data, trak.end), mdia = find(tb, 'mdia');
          if (!mdia) return;
          var mb = boxes(d, mdia.data, mdia.end), hdlr = find(mb, 'hdlr'), mdhd = find(mb, 'mdhd'), minf = find(mb, 'minf');
          var handler = hdlr ? name4(d, hdlr.data + 8) : '';
          if (!/^(sbtl|text|subt)$/.test(handler) || !mdhd || !minf) return;
          var v1 = d[mdhd.data] === 1, scale = u32(d, mdhd.data + (v1 ? 20 : 12)), bits = (d[mdhd.data + (v1 ? 32 : 20)] << 8) + d[mdhd.data + (v1 ? 33 : 21)];
          var lang = String.fromCharCode(((bits >> 10) & 31) + 0x60, ((bits >> 5) & 31) + 0x60, (bits & 31) + 0x60);
          var stbl = find(boxes(d, minf.data, minf.end), 'stbl');
          if (!stbl) return;
          var sb = boxes(d, stbl.data, stbl.end), stsd = find(sb, 'stsd'), stts = find(sb, 'stts'), stsz = find(sb, 'stsz');
          if (!stts || !stsz) return;
          var codec = stsd ? name4(d, stsd.data + 12) : '';
          /* an edit list: where the track's time 0 stands on the film's */
          var shift = 0, edts = find(tb, 'edts'), elst = edts && find(boxes(d, edts.data, edts.end), 'elst');
          if (elst) {
            var ev1 = d[elst.data] === 1, count = u32(d, elst.data + 4), p = elst.data + 8;
            for (var k = 0; k < count; k++) {
              var dur = ev1 ? u64(d, p) : u32(d, p), mt = ev1 ? s64(d, p + 8) : s32(d, p + 4);
              p += ev1 ? 20 : 12;
              if (mt === -1) shift += (dur / movieScale) * 1000; else { shift -= (mt / scale) * 1000; break; }
            }
          }
          var fixed = u32(d, stsz.data + 4), samples = u32(d, stsz.data + 8), runs = u32(d, stts.data + 4), cues = [], t = 0, i = 0;
          for (var r = 0; r < runs; r++) {
            var cnt = u32(d, stts.data + 8 + r * 8), delta = u32(d, stts.data + 12 + r * 8);
            for (var c = 0; c < cnt && i < samples; c++, i++) {
              var bytes = fixed || u32(d, stsz.data + 12 + i * 4);
              if (bytes > 2) cues.push({ start: Math.round((t / scale) * 1000 + shift), end: Math.round(((t + delta) / scale) * 1000 + shift), bytes: bytes });
              t += delta;
            }
          }
          subs.push({ codec: codec, lang: lang, name: '', text: /^(tx3g|text|wvtt|stpp)$/.test(codec), cues: cues });
        });
        return { kind: 'mp4', subs: subs, indexBytes: moov.size };
      });
    });
  }

  /* The OpenSubtitles hash of a file: its size plus the first and the last 64 KB as little-endian 64-bit numbers, all mod 2^64.
     It finds the subtitles uploaded for this very copy. Kept as two 32-bit halves: old TVs have no BigInt */
  function osHash(head, tail, size) {
    var lo = size % 4294967296, hi = Math.floor(size / 4294967296);
    var add = function (d) {
      for (var i = 0; i + 8 <= 65536 && i + 8 <= d.length; i += 8) {
        var l = d[i] + (d[i + 1] << 8) + (d[i + 2] << 16) + ((d[i + 3] << 24) >>> 0), h = d[i + 4] + (d[i + 5] << 8) + (d[i + 6] << 16) + ((d[i + 7] << 24) >>> 0);
        lo += l;
        hi += h + Math.floor(lo / 4294967296);
        lo %= 4294967296;
        hi %= 4294967296;
      }
    };
    add(head);
    add(tail);
    var hex = function (v) { var s = v.toString(16); while (s.length < 8) s = '0' + s; return s; };
    return hex(hi) + hex(lo);
  }

  /* everything the index says about the file's subtitles: { kind, subs: [{codec, lang, name, text, cues: [{start, end, bytes?}]}],
     size, hash, requests } or null. read(a, b): a promise of bytes a..b (Uint8Array), whose .size is the file's size once known;
     a refusal rejects with .status 429 */
  function readIndex(read, alive) {
    alive = alive || function () { return true; };
    if (Date.now() < shutUntil) return Promise.resolve(null);
    var requests = 0, refused = false;
    var get = function (a, b) {
      return slot().then(function () {
        if (refused || !alive()) throw new Error('stopped');
        requests++;
        return read(a, b);
      }).catch(function (e) {
        if (e && e.status === 429 && !refused) { refused = true; shutUntil = Date.now() + Math.max(300, +e.retryAfter || 0) * 1000; }
        throw e;
      });
    };
    return get(0, HEAD - 1).then(function (head) {
      var size = read.size || 0;
      var isMkv = head[0] === 0x1A && head[1] === 0x45 && head[2] === 0xDF && head[3] === 0xA3;
      var isMp4 = !isMkv && head.length > 8 && /^(ftyp|moov|mdat|free|skip|wide)$/.test(name4(head, 4));
      if ((!isMkv && !isMp4) || (isMp4 && !size)) return null;
      return (isMkv ? mkv(get, head) : mp4(get, head, size)).then(function (out) {
        if (!out) return null;
        out.size = size;
        out.requests = requests;
        if (!size || size < 131072) return out;
        /* the hash, for an English subtitle uploaded for this very copy: one more small read */
        return get(size - 65536, size - 1).then(function (tail) { out.hash = osHash(head, tail, size); out.requests = requests; return out; }, function () { return out; });
      });
    }).catch(function (e) { if (e && e.message === 'stopped') return null; throw e; });
  }

  /* reading straight from a link (the TV's page, or the PC fitter through its own proxy). Only the first read goes through the
     source's redirects: those have limits of their own */
  function linkReader(url) {
    var at = url;
    var read = function (a, b) {
      var c = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = setTimeout(function () { if (c) c.abort(); }, 60000);
      return fetch(at, { headers: { Range: 'bytes=' + a + '-' + b }, signal: c ? c.signal : undefined }).then(function (r) {
        if (r.status !== 206) {
          var e = new Error('status ' + r.status);
          e.status = r.status;
          e.retryAfter = r.headers.get('retry-after');
          if (c) c.abort();
          throw e;
        }
        if (r.url) at = r.url;
        var range = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
        if (range) read.size = +range[1];
        return r.arrayBuffer();
      }).then(function (buf) { clearTimeout(timer); return new Uint8Array(buf); }, function (e) { clearTimeout(timer); throw e; });
    };
    read.size = 0;
    return read;
  }

  /* ---------- the reference the Arabic is fitted to ---------- */
  function lowerBound(a, x) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
  function nearest(sorted, t) {
    var i = lowerBound(sorted, t), best = null;
    for (var j = i - 1; j <= i; j++) if (j >= 0 && j < sorted.length && (best === null || Math.abs(sorted[j] - t) < Math.abs(best - t))) best = sorted[j];
    return best;
  }
  function onShare(cues, sorted, w) {
    var n = 0;
    for (var i = 0; i < cues.length; i++) { var x = nearest(sorted, cues[i].start); if (x !== null && Math.abs(x - cues[i].start) <= w) n++; }
    return n / Math.max(1, cues.length);
  }
  function guess(ms) { var n = Math.max(4, Math.min(90, Math.round((ms / 1000) * 14))), s = ''; while (s.length < n) s += 'x'; return s; }

  /* the track to read times from: words inside the file before pictures, the fullest kind, plain English first */
  function pickTrack(subs) {
    var tracks = subs.filter(function (s) { return s.cues.length >= 30; });
    if (!tracks.length) return null;
    var pool = tracks.some(function (t) { return t.text; }) ? tracks.filter(function (t) { return t.text; }) : tracks;
    var most = 0;
    pool.forEach(function (t) { most = Math.max(most, t.cues.length); });
    var signs = function (t) { return /forced|signs|songs/i.test(t.name || ''); };
    var full = pool.filter(function (t) { return t.cues.length >= most * 0.45 && !signs(t); });
    if (!full.length) full = pool;
    var eng = function (t) { return /^en/i.test(t.lang || '') || /english/i.test(t.name || ''); }, sdh = function (t) { return t.hearing || /sdh|hearing|\bcc\b/i.test(t.name || ''); };
    var by = function (f) { return full.filter(f).sort(function (a, b) { return a.cues.length - b.cues.length; })[0]; }; /* the plainer one: fewer lines than the hearing-impaired */
    return by(function (t) { return eng(t) && t.text && !sdh(t); }) || by(function (t) { return eng(t) && t.text; }) || by(eng) || by(function (t) { return t.text; }) || by(function () { return true; });
  }

  /* How well an English subtitle stands on the file's own times: { moved (it, aligned), on, tight, back } or null.
     back counts the other way: the file's moments it accounts for (a subtitle of half the film stands well but covers half) */
  function standing(cues, T, entries, L) {
    if (cues.length < 30) return null;
    var fit = L.align(cues, T.cues);
    var moved = fit && !(fit.ratio === 1 && fit.offset === 0) ? cues.map(function (c) { return { start: c.start * fit.ratio + fit.offset, end: c.end * fit.ratio + fit.offset, text: c.text }; }) : cues;
    var marks = moved.map(function (c) { return c.start; }).concat(moved.map(function (c) { return c.end; })).sort(function (a, b) { return a - b; });
    var back = 0;
    for (var i = 0; i < entries.length; i++) { var x = nearest(marks, entries[i]); if (x !== null && Math.abs(x - entries[i]) <= 300) back++; }
    return { moved: moved, on: onShare(moved, entries, 300), tight: onShare(moved, entries, 100), back: back / Math.max(1, entries.length) };
  }

  /* The reference: the file's own line times, with words where an English subtitle stands on them.
     english(): a promise of English subtitles one by one, as next() -> promise of {name, cues (ms, text)} or null when there are no
     more; it stops at the first that stands well. L: the fitting library (align). Gives { ref, track, words, english } or null */
  function reference(index, nextEnglish, L) {
    var T = index && pickTrack(index.subs || []);
    if (!T) return Promise.resolve(null);
    var entries = T.cues.map(function (c) { return c.start; }).sort(function (a, b) { return a - b; });
    var best = null, tried = 0;
    var look = function () {
      if (tried >= 12 || (best && best.tight >= 0.9 && best.back >= 0.9)) return Promise.resolve();
      return nextEnglish().then(function (x) {
        if (!x) return;
        tried++;
        var s = standing(x.cues, T, entries, L);
        if (s && (!best || Math.min(s.tight, s.back) > Math.min(best.tight, best.back) || (Math.min(s.tight, s.back) === Math.min(best.tight, best.back) && s.on > best.on))) { s.name = x.name; best = s; }
        return look();
      }, function () { tried++; return look(); });
    };
    return look().then(function () {
      var good = best && best.on >= 0.6 && best.back >= 0.6, ref, words = 0;
      if (T.text) {
        var S = good ? best.moved.slice().sort(function (a, b) { return a.start - b.start; }) : [], starts = S.map(function (c) { return c.start; }), got = 0;
        ref = T.cues.map(function (c) {
          var text = null;
          if (good) {
            var k = lowerBound(starts, c.start - 300);
            while (k + 1 < starts.length && Math.abs(starts[k + 1] - c.start) < Math.abs(starts[k] - c.start)) k++; /* the nearest English line */
            if (k < starts.length && Math.abs(starts[k] - c.start) <= 300) { text = S[k].text; got++; }
          }
          if (!text) text = c.bytes ? new Array(Math.max(2, Math.min(121, c.bytes - 1))).join('x') : guess(c.end - c.start);
          return { start: c.start, end: c.end > c.start ? c.end : c.start + 2500, text: text };
        });
        words = got / Math.max(1, ref.length);
      } else if (good) {
        /* pictures: the English lines, each moved onto the moment the file shows and clears a picture */
        ref = best.moved.map(function (c) {
          var s = nearest(entries, c.start), e = nearest(entries, c.end);
          var start = s !== null && Math.abs(s - c.start) <= 300 ? s : c.start;
          var end = e !== null && Math.abs(e - c.end) <= 600 && e > start ? e : c.end + (start - c.start);
          return { start: Math.round(start), end: Math.round(end), text: c.text };
        }).sort(function (a, b) { return a.start - b.start; });
        words = best.on;
      } else {
        ref = [];
        for (var i = 0; i + 1 < entries.length; i++) {
          var gap = entries[i + 1] - entries[i];
          if (gap <= 8000 && gap >= 400) ref.push({ start: entries[i], end: entries[i + 1], text: guess(gap) });
        }
      }
      if (ref.length < 30) return null;
      return { ref: ref, track: (T.lang || '') + ' ' + T.codec + ' ' + T.cues.length + (T.text ? ' lines' : ' entries'), words: words, english: good ? best.name : '' };
    });
  }

  /* the free OpenSubtitles add-on's English subtitles for this file, best for this very copy first (the hash) */
  var OPENSUBS = 'https://opensubtitles-v3.strem.io';
  function englishList(type, id, index, filename) {
    var extra = [];
    if (index && index.hash) extra.push('videoHash=' + index.hash);
    if (index && index.size) extra.push('videoSize=' + index.size);
    if (filename) extra.push('filename=' + encodeURIComponent(filename));
    var url = OPENSUBS + '/subtitles/' + type + '/' + encodeURIComponent(id) + (extra.length ? '/' + extra.join('&') : '') + '.json';
    return fetch(url).then(function (r) { return r.ok ? r.json() : { subtitles: [] }; }).then(function (j) {
      var all = (j && j.subtitles) || [];
      return all.filter(function (x) { return /^(eng|en)$/i.test(x.lang || ''); }).sort(function (a, b) { return (b.m === 'h' ? 1 : 0) - (a.m === 'h' ? 1 : 0); });
    });
  }

  var api = { readIndex: readIndex, linkReader: linkReader, reference: reference, englishList: englishList, osHash: osHash, pickTrack: pickTrack };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CS = root.CS || {}; root.CS.fileIndex = api; }
})(typeof window !== 'undefined' ? window : this);
