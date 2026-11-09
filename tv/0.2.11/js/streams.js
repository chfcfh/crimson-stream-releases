/* Sources: reading what each add-on says about a file (quality, Dolby Vision, size, cached), ordering them, and picking
   the one that matches the last choice for the next episode. */
(function () {
  var CACHE_TAG = /\[(TB|RD|AD|PM|DL|ED|OC|EN|PKP|TRB)\s*(\+|⚡)\]/i;
  var NOT_CACHED = /\[(TB|RD|AD|PM|DL|ED|OC)\s*(download|↓)\]/i;

  function sizeOf(text, hints) {
    if (hints && hints.videoSize) return hints.videoSize;
    var m = /💾\s*([\d.,]+)\s*(TB|GB|MB)/i.exec(text) || /\b([\d.]+)\s*(GB|MB)\b/i.exec(text);
    if (!m) return 0;
    var n = parseFloat(m[1].replace(',', '.'));
    return Math.round(n * (/TB/i.test(m[2]) ? 1099511627776 : /GB/i.test(m[2]) ? 1073741824 : 1048576));
  }

  function parse(s) {
    var a = s._addon || { manifest: { name: '', id: '' } };
    var name = s.name || '', title = s.title || s.description || '';
    var text = name + '\n' + title;
    var hints = s.behaviorHints || {};
    var res = /\b(2160p|4k|uhd)\b/i.test(text) ? 2160 : /\b1080p\b/i.test(text) ? 1080 : /\b720p\b/i.test(text) ? 720 : /\b(480p|sd)\b/i.test(text) ? 480 : 0;
    var lines = title.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var file = hints.filename || '';
    if (!file) { var f = lines.filter(function (l) { return /\.(mkv|mp4|avi|m4v|ts|webm)$/i.test(l); })[0]; if (f) file = f.split('/').pop(); }
    var url = s.url || '';
    var o = {
      raw: s,
      addonId: a.manifest.id,
      addonName: a.manifest.name || '',
      name: name,
      lines: lines,
      file: file,
      res: res,
      dv: /\b(dv|dovi|dolby\s*vision)\b/i.test(text),
      hdr10p: /hdr10\+|hdr10plus/i.test(text),
      hdr: /\bhdr(10)?\b/i.test(text),
      atmos: /atmos/i.test(text),
      audio: (/(truehd|dts-?hd(\s?ma)?|dts-?x|dts|ddp\s?5\.1|ddp|dd\+|eac3|ac3|aac|flac|opus)/i.exec(text) || [''])[0].toUpperCase(),
      codec: (/(x265|hevc|h\.?265|x264|h\.?264|avc|av1)/i.exec(text) || [''])[0].toUpperCase().replace('H.', 'H'),
      size: sizeOf(text, hints),
      seeds: +((/👤\s*(\d+)/.exec(text) || [0, 0])[1]),
      cached: CACHE_TAG.test(name) ? true : NOT_CACHED.test(name) ? false : null,
      speeder: a.manifest.id === CS.config.speederId,
      bingeGroup: hints.bingeGroup || '',
      group: (/[-. (]([A-Za-z0-9]{2,12})\)?\.(mkv|mp4)$/.exec(file) || /\b(?:x265|x264|hevc)\s+([A-Za-z0-9]{2,12})\)/i.exec(file) || ['', ''])[1],
      url: url,
      infoHash: s.infoHash || '',
      fileIdx: s.fileIdx,
      why: ''
    };
    if (s.ytId || s.externalUrl) o.why = 'رابط خارجي';
    else if (hints.proxyHeaders && hints.proxyHeaders.request) o.why = 'يحتاج ترويسات خاصة';
    else if (!url && !s.infoHash) o.why = 'بدون رابط';
    else if (!url && s.infoHash) o.needsServer = true;
    return o;
  }

  function rank(o) {
    var r = 0;
    if (o.speeder) r += 1e6;
    if (o.cached === true) r += 1e5; else if (o.cached === null && o.url) r += 5e4;
    if (o.needsServer) r -= 2e5;
    var q = CS.settings.preferQuality;
    if (q === '1080p') r += o.res === 1080 ? 9e3 : o.res === 2160 ? 6e3 : o.res * 2;
    else if (q === '720p') r += o.res === 720 ? 9e3 : o.res === 1080 ? 6e3 : o.res;
    else r += o.res * 4;
    if (o.dv) r += 600; else if (o.hdr10p) r += 400; else if (o.hdr) r += 300;
    return r;
  }

  /* the same file from two add-ons has the same name and size */
  function sameFile(o) { return (o.file || o.lines[0] || '') + '|' + o.size; }

  CS.streams = {
    parse: parse,
    /* every add-on's answer -> one ordered list. Torrentio copies already offered through ⚡ are hidden, unless keepCopies
       (⚡ just failed — the PC went off — so the direct copy must be there to pick) */
    order: function (raw, keepCopies) {
      var list = raw.map(parse).filter(function (o) { return !o.why; });
      if (!keepCopies) {
        var fast = {};
        list.forEach(function (o) { if (o.speeder) fast[sameFile(o)] = 1; });
        list = list.filter(function (o) { return o.speeder || !fast[sameFile(o)]; });
      }
      list.forEach(function (o, i) { o._i = i; o._rank = rank(o); });
      list.sort(function (a, b) { return b._rank - a._rank || a._i - b._i; });
      return list;
    },
    /* for a download: the direct copy of each file instead of its copy through the PC (⚡), so it goes on away from home
       and with the PC off. A file offered only through ⚡ stays, after the direct ones */
    forDownload: function (raw) {
      var all = CS.streams.order(raw, true), direct = {};
      all.forEach(function (o) { if (!o.speeder) direct[sameFile(o)] = 1; });
      var viaPc = all.filter(function (o) { return o.speeder && !direct[sameFile(o)]; });
      return all.filter(function (o) { return !o.speeder; }).concat(viaPc);
    },
    playUrl: function (o) {
      if (o.url) return o.url;
      if (o.infoHash) {
        var srv = CS.pcUrl(CS.config.ports.stremioServer);
        if (!srv) return '';
        var which = o.fileIdx != null ? o.fileIdx : o.file ? encodeURIComponent(o.file) : -1;
        return srv + '/' + o.infoHash + '/' + which;
      }
      return '';
    },
    /* what to remember about a choice, to pick the same kind next time */
    memo: function (o) { return { addonId: o.addonId, bingeGroup: o.bingeGroup, res: o.res, dv: o.dv, group: o.group, speeder: o.speeder }; },
    pickLike: function (list, memo) {
      if (!list.length) return null;
      if (!memo) return list[0];
      var best = null, bestScore = -1;
      list.forEach(function (o) {
        var sc = 0;
        if (memo.bingeGroup && o.bingeGroup === memo.bingeGroup) sc += 100;
        if (memo.group && o.group && o.group.toLowerCase() === (memo.group || '').toLowerCase()) sc += 40;
        if (o.res === memo.res) sc += 20;
        if (o.dv === memo.dv) sc += 6;
        if (o.speeder) sc += 8;
        if (o.cached === true) sc += 4;
        if (sc > bestScore) { bestScore = sc; best = o; }
      });
      return best;
    },
    badges: function (o) {
      var b = [];
      if (o.res) b.push(o.res === 2160 ? '4K' : o.res + 'p');
      if (o.dv) b.push('Dolby Vision');
      else if (o.hdr10p) b.push('HDR10+');
      else if (o.hdr) b.push('HDR');
      if (o.atmos) b.push('Atmos');
      else if (o.audio) b.push(o.audio);
      if (o.size) b.push(CS.fmtSize(o.size));
      return b;
    }
  };
})();
