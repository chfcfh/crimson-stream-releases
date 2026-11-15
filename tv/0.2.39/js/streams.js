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

  /* The site a torrent was found on, as the add-on writes it: Torrentio after ⚙️, Comet after 🔎. A few names said as people
     know them */
  var SITE_NAMES = { nyaasi: 'Nyaa', nyaa: 'Nyaa', thepiratebay: 'The Pirate Bay', tpb: 'The Pirate Bay', kickasstorrents: 'Kickass', torrentgalaxy: 'TorrentGalaxy' };
  function siteOf(text) {
    var m = /(?:⚙️?|🔎|🔍)\s*([A-Za-z0-9][A-Za-z0-9.+_-]*(?: [A-Za-z][A-Za-z0-9.+_-]*){0,2})/.exec(text);
    if (!m) return '';
    var n = m[1].replace(/\s+$/, '');
    return SITE_NAMES[n.toLowerCase().replace(/[\s.]/g, '')] || n;
  }
  /* The team that put the release out: «[Erai-raws] Show - 01 [1080p].mkv», «Show.S01E01.1080p.x265-Arg0.mkv», «Show S01 [QxR]».
     From the file's name first, then the torrent's. Words a name ends or starts with that are not a team are left out */
  var NOT_TEAM = new RegExp('^(\\d{3,4}p|[0-9a-f]{8}|4k|uhd|hd|sd|bd|bdrip|bdremux|remux|web|webrip|web-dl|dl|rip|tv|dvd|batch|complete|v\\d|' +
    'x26[45]|h\\.?26[45]|hevc|avc|av1|aac|ac3|eac3|flac|opus|dts|hdr|sdr|dv|raws?|subs?|esubs|dub|dubbed|multi|dual|repack|proper|' +
    'uncensored|end|fin|pilot|team|free|release|magnet|torrent|' +
    'eng|english|jpn|jap|japanese|ara|arabic|rus|ita|ger|fre|spa|spanish|ingles|lat|latino|castellano|hin|hindi|' +
    'cr|amzn|nf|dsnp|hmax|atvp|hulu|s\\d+\\.?(e\\d+)?|e\\d+)$', 'i');
  /* a team's name is in Latin letters; a site's address in front of a release is not a team */
  function teamOk(t) { return /^[A-Za-z0-9][A-Za-z0-9 ._&!-]*$/.test(t) && !NOT_TEAM.test(t) && !/^www\.|\.(com|org|net|tv|me|to|re|ru|cc|io|xyz|info)$/i.test(t); }
  function teamIn(name) {
    if (!name) return '';
    var n = name.replace(/\.(mkv|mp4|avi|m4v|ts|webm)$/i, '').replace(/\s+$/, ''), m;
    if ((m = /^\s*\[([^\[\]]{2,24})\]/.exec(n)) && teamOk(m[1].replace(/^\s+|\s+$/g, ''))) return m[1].replace(/^\s+|\s+$/g, '');
    var tail = n.replace(/(\s*\[[0-9A-Fa-f]{8}\])+$/, '');
    if ((m = /-([A-Za-z][A-Za-z0-9]{1,15})$/.exec(tail)) && teamOk(m[1])) return m[1];
    if ((m = /\[([A-Za-z][A-Za-z0-9]{1,9}|YTS\.[A-Z]{2})\]$/i.exec(tail)) && teamOk(m[1])) return m[1];
    return '';
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
      cloud: a.manifest.id === CS.config.cloudId,
      bingeGroup: hints.bingeGroup || '',
      group: (/[-. (]([A-Za-z0-9]{2,12})\)?\.(mkv|mp4)$/.exec(file) || /\b(?:x265|x264|hevc)\s+([A-Za-z0-9]{2,12})\)/i.exec(file) || ['', ''])[1],
      site: siteOf(text),
      team: teamIn(file) || teamIn(lines[0]),
      url: url,
      infoHash: s.infoHash || '',
      fileIdx: s.fileIdx,
      why: ''
    };
    if (s.ytId || s.externalUrl) o.why = 'رابط خارجي';
    else if (hints.proxyHeaders && hints.proxyHeaders.request) o.why = 'يحتاج ترويسات خاصة';
    else if (!url && !s.infoHash) o.why = 'بدون رابط';
    else if (!url && s.infoHash) o.needsServer = true;
    o.langs = langsOf(o);
    var seen = knownTracks()[sameFile(o)];
    if (seen) {
      /* said: what the name says, kept for telling a dubbed-only copy when the file's own audio tracks carry no language;
         heard: the audio languages are the file's own. A file only played (heard()) has its subtitles still from the name */
      var said = o.langs;
      o.langs = { audio: seen.a.length ? seen.a : said.audio, subs: seen.s || said.subs, sure: true, anySubs: seen.s ? seen.s.length > 0 : said.anySubs,
        multiAudio: false, multiSubs: seen.s ? false : said.multiSubs, heard: seen.w === 1 && seen.a.length > 0, said: said };
    }
    return o;
  }

  /* Has this copy none of the audio languages wanted for its title (session.js, audioWanted: the original, or the viewer's own)?
     Its own tracks say so once read; before that its name and flags do: one naming languages, none of them wanted, and not
     "multi" or "dual" (those keep the original beside the dub). A copy that names no language is the original, as nearly always */
  function lacks(o, wanted) {
    if (!wanted || !wanted.length) return false;
    var L = o.langs || {};
    var has = function (list) { return wanted.some(function (c) { return list.indexOf(c) >= 0; }); };
    if (L.heard) return !has(L.audio);
    var S = L.said || L, a = S.audio || [];
    if (!a.length || S.multiAudio || S.dual || a.indexOf('orig') >= 0) return false;
    return !has(a) && !has(S.flags || []);
  }

  /* How good the picture and sound are, the file's size not held against it («الأعلى»): the resolution first, then the kind of
     copy (a Remux over a Blu-ray encode over a web copy over TV), HDR, the sound, and among copies of one kind the bigger file (more
     bitrate). A camera copy or an upscaled one comes last */
  function quality(o) {
    var t = (o.file + ' ' + o.name + ' ' + o.lines.join(' ')).toLowerCase();
    var q = o.res * 4;
    if (/remux\b/.test(t)) q += 900; /* BDRemux, BD-Remux too */
    else if (/blu-?ray|\bbd-?rip\b|\bbrrip\b/.test(t)) q += 600;
    else if (/web-?dl|\bweb\b/.test(t)) q += 450;
    else if (/web-?rip/.test(t)) q += 300;
    else if (/hdtv/.test(t)) q += 100;
    if (/\b(cam|hdcam|camrip|ts|hdts|telesync|tc|telecine|scr|screener)\b/.test(t)) q -= 6000;
    if (/upscal/.test(t)) q -= 4500; /* "4K" made from a smaller picture: below a real 1080p */
    if (o.dv) q += 300; else if (o.hdr10p) q += 250; else if (o.hdr) q += 200;
    if (/truehd|atmos/.test(t)) q += 150; else if (/dts-?hd|dts-?x/.test(t)) q += 120; else if (/\bdts\b/.test(t)) q += 80; else if (/ddp|dd\+|eac3/.test(t)) q += 60;
    if (o.size) q += Math.min(800, Math.log(o.size / 1073741824 + 1) * 220);
    return q;
  }

  /* Ready to play first (a file the service has not fetched would play its "please wait" clip), then the quality, whatever the
     add-on: the owner wants the best on top, through the PC (⚡), the cloud add-on or any other. Between two of the same quality,
     the one through the PC (it starts faster), then the cloud one */
  function rank(o) {
    var r = 0;
    if (o.speeder) r += 3;
    else if (o.cloud) r += 2;
    if (o.cached === true) r += 1e5; else if (o.cached === null && o.url) r += 5e4;
    if (o.needsServer) r -= 2e5;
    if (o.dubOnly) r -= 2e4; /* dubbed only, the title's own language not in it: after every copy that has it, whatever the quality */
    var q = CS.settings.preferQuality;
    if (q === '1080p') r += o.res === 1080 ? 9e3 : o.res === 2160 ? 6e3 : o.res * 2;
    else if (q === '720p') r += o.res === 720 ? 9e3 : o.res === 1080 ? 6e3 : o.res;
    else return r + quality(o);
    if (o.dv) r += 600; else if (o.hdr10p) r += 400; else if (o.hdr) r += 300;
    return r;
  }

  /* the same file from two add-ons has the same name and size */
  function sameFile(o) { return (o.file || o.lines[0] || '') + '|' + o.size; }

  /* ---------- languages: the audio a file has, and the subtitles inside it ----------
     Read from what the add-on writes (the release name, the file name, Torrentio's flags), so it is a good guess, not a
     promise. Once a file was opened and its own track list read (mkvindex.js), that list is kept and shown instead. */
  var LANGS = [
    /* code, name, full words (always a language), short codes (a language only next to other languages, sub/dub/audio
       words, or written in capitals), flags */
    ['ar', 'العربية', 'arabic|arab', 'ara|ar', '🇸🇦🇦🇪🇪🇬🇰🇼🇶🇦🇯🇴🇱🇧🇲🇦🇩🇿🇹🇳🇮🇶🇸🇾'],
    ['en', 'الإنجليزية', 'english', 'eng|en', '🇬🇧🇺🇸'],
    ['ja', 'اليابانية', 'japanese', 'jap|jpn|jp|ja', '🇯🇵'],
    ['ko', 'الكورية', 'korean', 'kor|ko', '🇰🇷'],
    ['zh', 'الصينية', 'chinese|mandarin|cantonese', 'chi|chs|cht|zho|zh', '🇨🇳🇹🇼🇭🇰'],
    ['fr', 'الفرنسية', 'french|truefrench', 'fre|fra|fr|vf|vff|vfq|vfi|vf2', '🇫🇷'],
    ['de', 'الألمانية', 'german', 'ger|deu|de', '🇩🇪'],
    ['es', 'الإسبانية', 'spanish|castellano|latino|espanol', 'spa|esp|es|lat', '🇪🇸🇲🇽'],
    ['it', 'الإيطالية', 'italian', 'ita|it', '🇮🇹'],
    ['pt', 'البرتغالية', 'portuguese|dublado', 'por|pt|ptbr', '🇵🇹🇧🇷'],
    ['ru', 'الروسية', 'russian', 'rus|ru', '🇷🇺'],
    ['uk', 'الأوكرانية', 'ukrainian', 'ukr|ua', '🇺🇦'],
    ['hi', 'الهندية', 'hindi', 'hin', '🇮🇳'],
    ['ta', 'التاميلية', 'tamil', 'tam', ''],
    ['te', 'التيلوغوية', 'telugu', 'tel', ''],
    ['tr', 'التركية', 'turkish', 'tur', '🇹🇷'],
    ['pl', 'البولندية', 'polish', 'pol', '🇵🇱'],
    ['nl', 'الهولندية', 'dutch', 'nld|dut', '🇳🇱'],
    ['sv', 'السويدية', 'swedish', 'swe', '🇸🇪'],
    ['da', 'الدنماركية', 'danish', 'dan', '🇩🇰'],
    ['no', 'النرويجية', 'norwegian', 'nor', '🇳🇴'],
    ['cs', 'التشيكية', 'czech', 'cze|ces', '🇨🇿'],
    ['hu', 'المجرية', 'hungarian', 'hun', '🇭🇺'],
    ['hr', 'الكرواتية', 'croatian', 'hrv', '🇭🇷'],
    ['th', 'التايلندية', 'thai', 'tha', '🇹🇭'],
    ['id', 'الإندونيسية', 'indonesian', 'ind', '🇮🇩'],
    ['fa', 'الفارسية', 'persian|farsi', 'per|fas', '🇮🇷'],
    /* named only by a file's own tracks (their short codes are words too often to be read from a name) */
    ['fi', 'الفنلندية', 'finnish', '', '🇫🇮'],
    ['el', 'اليونانية', 'greek', '', '🇬🇷'],
    ['he', 'العبرية', 'hebrew', '', ''],
    ['ro', 'الرومانية', 'romanian', '', '🇷🇴'],
    ['ms', 'الملايوية', 'malay', '', '🇲🇾'],
    ['vi', 'الفيتنامية', 'vietnamese', '', '🇻🇳'],
    ['bg', 'البلغارية', 'bulgarian', '', '🇧🇬'],
    ['sr', 'الصربية', 'serbian', '', '🇷🇸'],
    ['sk', 'السلوفاكية', 'slovak', '', '🇸🇰'],
    ['sl', 'السلوفينية', 'slovenian', '', '🇸🇮'],
    ['et', 'الإستونية', 'estonian', '', '🇪🇪'],
    ['lv', 'اللاتفية', 'latvian', '', '🇱🇻'],
    ['lt', 'الليتوانية', 'lithuanian', '', '🇱🇹'],
    ['ca', 'الكتالونية', 'catalan', '', ''],
    ['tl', 'الفلبينية', 'filipino|tagalog', '', '🇵🇭'],
    ['bn', 'البنغالية', 'bengali', '', '🇧🇩'],
    ['ur', 'الأردية', 'urdu', '', '🇵🇰']
  ];
  var LANG_NAME = { orig: 'الأصلية' }, FULL = {}, SHORT = {}, FLAG = {};
  LANGS.forEach(function (l) {
    LANG_NAME[l[0]] = l[1];
    l[2].split('|').forEach(function (w) { FULL[w] = l[0]; });
    l[3].split('|').forEach(function (w) { if (w) SHORT[w] = l[0]; });
    (l[4].match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g) || []).forEach(function (f) { FLAG[f] = l[0]; });
  });
  var SUB_WORD = /^(subs?|subbed|subtitles?|subtitulado|legendado|stfr)$/;
  /* one word that holds both: "engsub", "esubs", "arsub" */
  var SUB_JOINED = /^(eng?|ara?|jap|fre|spa|ita|ger|rus|kor|chi|por)subs?$/;
  var AUDIO_WORD = /^(dub|dubbed|dubs|audio|audios|dublado|doblaje|voice)$/;

  function langsOf(o) {
    var text = [o.name].concat(o.lines).join(' ');
    var flags = (text.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g) || []);
    /* "JAP+Sub" (Japanese, with subtitles) is not Japanese subtitles */
    var plain = text.replace(/[\uD800-\uDFFF]/g, ' ').replace(/\+\s*subs?\b/gi, ' withsub ');
    var words = plain.split(/[\s._()\[\]{}|\/,;:+&-]+/).filter(Boolean);
    var lower = words.map(function (w) { return w.toLowerCase(); });
    /* a release that speaks of dubs or carries language flags: the word "Original" in it is a track, not part of a title */
    var dubbed = flags.length > 0 || lower.some(function (x) { return /^(dub|dubs|dubbed|mvo|dvo|avo|dublado|doblaje)$/.test(x); });
    var out = { audio: [], subs: [], multiAudio: false, multiSubs: false, anySubs: false, dual: false };
    var add = function (list, c) { if (c && list.indexOf(c) < 0) list.push(c); };
    function langAt(i) {
      var w = lower[i];
      if (w == null) return '';
      if (FULL[w]) return FULL[w];
      if (!SHORT[w]) return '';
      /* a short code counts in capitals (ITA, RUS), or beside another language or a sub/dub word */
      var caps = words[i].length >= 3 && words[i] === words[i].toUpperCase() && !/^(ES|IT|DE|EN|AR|JA|KO|ZH|FR|PT|RU|UA)$/.test(words[i]);
      var near = function (j) { var x = lower[j]; return x != null && (FULL[x] || SHORT[x] || SUB_WORD.test(x) || AUDIO_WORD.test(x) || x === 'sub'); };
      return caps || near(i - 1) || near(i + 1) ? SHORT[w] : '';
    }
    var subList = false; /* after "sub:" every language is a subtitle */
    for (var i = 0; i < lower.length; i++) {
      var w = lower[i], next = lower[i + 1] || '', prev = lower[i - 1] || '';
      if (w === 'dual' && next === 'audio') { out.dual = true; i++; continue; }
      if (w === 'dual') { out.dual = true; continue; }
      if ((w === 'multi' || w === 'multiple') && (next === 'audio' || next === 'audios')) { out.multiAudio = true; i++; continue; }
      /* "Multiple Subtitle [ENG][ARA]…": the languages after it are subtitles */
      if ((w === 'multi' || w === 'multiple') && SUB_WORD.test(next)) { out.multiSubs = true; subList = true; i++; continue; }
      if (w === 'multisub' || w === 'multisubs' || w === 'msub' || w === 'msubs') { out.multiSubs = true; subList = true; continue; }
      if (w === 'multi' || w === 'multidub' || w === 'multilang') { out.multiAudio = true; continue; }
      if (w === 'vostfr' || w === 'vost') { add(out.subs, 'fr'); add(out.audio, 'orig'); continue; }
      if (w === 'esub' || w === 'esubs') { add(out.subs, 'en'); continue; }
      var joined = SUB_JOINED.exec(w);
      if (joined) { add(out.subs, SHORT[joined[1]] || FULL[joined[1]] || (joined[1] === 'e' ? 'en' : '')); continue; }
      if (w === 'withsub' || w === 'subbed' || w === 'hardsub') { out.anySubs = true; subList = false; continue; }
      if (w === 'sub' || w === 'subs') { subList = !!langAt(i + 1); if (!subList) out.anySubs = true; continue; }
      /* "3xRus": three Russian tracks */
      var count = /^\d+x([a-z]{2,3})$/.exec(w);
      if (count && (SHORT[count[1]] || FULL[count[1]])) { add(out.audio, SHORT[count[1]] || FULL[count[1]]); continue; }
      /* "Dub + MVO + Original": the title's own track is there beside the dubs */
      if ((w === 'original' || w === 'orig') && dubbed) { add(out.audio, 'orig'); continue; }
      var c = langAt(i);
      /* a list of subtitles goes on over region marks (POR-BR, SPA-LA) */
      if (!c) { if (!SUB_WORD.test(w) && w.length > 2) subList = false; continue; }
      if (subList || SUB_WORD.test(next)) add(out.subs, c);
      else add(out.audio, c);
    }
    /* Torrentio's flags: the languages of the release. Ones already named as subtitles stay subtitles; with only
       "Multi Subs" said, a flag cannot be told apart, so it is left out */
    var subsOnly = /multi(ple)?[\s-]*sub/i.test(text) && !/dub|dual|multi(ple)?[\s-]*audio/i.test(text);
    flags.forEach(function (f) { var c = FLAG[f]; if (c && out.subs.indexOf(c) < 0 && !subsOnly) add(out.audio, c); });
    /* every flag's language, whatever it was taken for: a release said to have English may have it as a track though its name
       reads as "Eng Subs" (lacks() does not call such a copy dubbed only) */
    out.flags = [];
    flags.forEach(function (f) { add(out.flags, FLAG[f]); });
    if (out.dual) {
      /* two tracks: the original and a dub (English when none is named) */
      add(out.audio, 'orig');
      if (!out.audio.some(function (c) { return c !== 'orig'; })) add(out.audio, 'en');
    }
    if (out.subs.length || out.multiSubs) out.anySubs = true;
    return out;
  }

  /* a file's own tracks, once read: kept by file (name and size), the last 400 */
  var TRACKS_KEY = 'fileTracks';
  var known = null;
  function knownTracks() { if (!known) known = CS.cache.get(TRACKS_KEY) || {}; return known; }
  /* three letters (and old two-letter ones) as files write them -> ours; '' : a language we do not list */
  var ALIAS = { jpn: 'ja', zho: 'zh', fra: 'fr', deu: 'de', spa: 'es', ita: 'it', por: 'pt', rus: 'ru', ukr: 'uk', hin: 'hi', tur: 'tr', pol: 'pl', nld: 'nl', swe: 'sv', dan: 'da', nor: 'no', ces: 'cs', hun: 'hu', hrv: 'hr', tha: 'th', ind: 'id', fas: 'fa', kor: 'ko', ara: 'ar', eng: 'en',
    nob: 'no', nno: 'no', nb: 'no', nn: 'no', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', iw: 'he', rum: 'ro', ron: 'ro', may: 'ms', msa: 'ms', vie: 'vi', bul: 'bg', srp: 'sr', scc: 'sr', slo: 'sk', slk: 'sk', slv: 'sl', est: 'et', lav: 'lv', lit: 'lt', cat: 'ca', fil: 'tl', tgl: 'tl', ben: 'bn', urd: 'ur', baq: '', eus: '', glg: '', fre: 'fr', ger: 'de', dut: 'nl', cze: 'cs', chi: 'zh', per: 'fa', tam: 'ta', tel: 'te' };
  function iso2(code) {
    /* "spa-419", "pt-BR", "zh-Hans": the language part */
    code = String(code || '').toLowerCase().split(/[-_]/)[0];
    if (!code || code === 'und' || code === 'mul' || code === 'zxx') return '';
    if (code.length === 2 && LANG_NAME[code]) return code;
    if (ALIAS[code] !== undefined) return ALIAS[code];
    return SHORT[code] || FULL[code] || '';
  }

  /* Two sources of one class are the same picture and sound, the size aside: resolution, kind of copy, HDR, sound */
  function klass(o) {
    var t = (o.file + ' ' + o.name + ' ' + o.lines.join(' ')).toLowerCase();
    var kind = /remux\b/.test(t) ? 'remux' : /blu-?ray|\bbd-?rip\b|\bbrrip\b/.test(t) ? 'bluray' : /web-?dl|\bweb\b/.test(t) ? 'webdl' : /web-?rip/.test(t) ? 'webrip' : /hdtv/.test(t) ? 'hdtv' : 'other';
    var hdr = o.dv ? 'dv' : o.hdr10p ? 'hdr10p' : o.hdr ? 'hdr' : 'sdr';
    var sound = /truehd|atmos/.test(t) ? 'truehd' : /dts-?hd|dts-?x/.test(t) ? 'dtshd' : /\bdts\b/.test(t) ? 'dts' : /ddp|dd\+|eac3/.test(t) ? 'ddp' : 'other';
    /* the spoken languages too: an Italian copy is not the same as the original */
    return [o.res, kind, hdr, sound, ((o.langs && o.langs.audio) || []).slice().sort().join(',')].join('|');
  }

  /* Does the source answer? Two bytes asked for; resolves with the time taken, rejects on a refusal or after ms. abort() stops it */
  function probe(o, ms) {
    var url = playUrl(o), c = typeof AbortController !== 'undefined' ? new AbortController() : null, t0 = Date.now();
    var p = new Promise(function (ok, no) {
      if (!url) { no(new Error('no link')); return; }
      /* Windows and the phone: the app asks (the page may not: another origin, or plain http under https) */
      if (CS.hostProbe) { CS.hostProbe(url, ms || 12000).then(ok, no); return; }
      var timer = setTimeout(function () { if (c) c.abort(); no(new Error('timeout')); }, ms || 12000);
      fetch(url, { headers: { Range: 'bytes=0-1' }, signal: c ? c.signal : undefined, cache: 'no-store' }).then(function (r) {
        clearTimeout(timer);
        if (c) c.abort(); /* only the answer is wanted, not a whole file */
        if (r.status === 206 || r.status === 200) ok(Date.now() - t0); else no(new Error('status ' + r.status));
      }, function (e) { clearTimeout(timer); no(e); });
    });
    p.abort = function () { if (c) c.abort(); };
    return p;
  }

  function playUrl(o) {
    if (o.url) return o.url;
    if (o.infoHash) {
      var srv = CS.pcUrl(CS.config.ports.stremioServer);
      if (!srv) return '';
      var which = o.fileIdx != null ? o.fileIdx : o.file ? encodeURIComponent(o.file) : -1;
      return srv + '/' + o.infoHash + '/' + which;
    }
    return '';
  }

  CS.streams = {
    parse: parse,
    quality: quality,
    klass: klass,
    probe: probe,
    /* «تشغيل أفضل مصدر تلقائيًا»: the best and those of its very class (only the size differs), at most n, ready to play */
    peers: function (list, n) {
      var ok = list.filter(function (o) { return o.cached !== false && playUrl(o) && !o.needsServer; });
      if (!ok.length) return [];
      var k = klass(ok[0]);
      return ok.filter(function (o) { return klass(o) === k; }).slice(0, n || 5);
    },
    langsOf: langsOf,
    langName: function (c) { return LANG_NAME[c] || c; },
    /* a played file's own track list (mkvindex.js): its audio languages and the subtitles inside it, kept for next time */
    remember: function (o, tracks) {
      if (!o || !tracks || !tracks.length || !(o.file || o.lines && o.lines[0])) return;
      var a = [], s = [], whole = true; /* whole: every audio track names its language, so "none of them is English" can be said */
      tracks.forEach(function (t) {
        var c = iso2(t.lang);
        if (t.type === 2 && !c) whole = false;
        if (t.type === 2 && c && a.indexOf(c) < 0) a.push(c);
        if (t.type === 17 && !t.forced && c && s.indexOf(c) < 0) s.push(c);
      });
      var all = knownTracks(), key = sameFile(o);
      all[key] = { a: a, s: s, t: Date.now(), w: whole ? 1 : 0 };
      var keys = Object.keys(all);
      if (keys.length > 400) keys.sort(function (x, y) { return all[x].t - all[y].t; }).slice(0, keys.length - 400).forEach(function (k) { delete all[k]; });
      CS.cache.set(TRACKS_KEY, all);
      o.langs = { audio: a.length ? a : o.langs.audio, subs: s, sure: true, anySubs: s.length > 0, multiAudio: false, multiSubs: false, heard: whole && a.length > 0, said: o.langs.said || o.langs };
    },
    /* a played file's audio languages, as its player names them (eng, rus, ja…): kept like remember()'s, for the list and for
       keeping the automatic choice away from a dubbed-only copy next time. The subtitles known for the file stay as they are */
    heard: function (o, langs) {
      if (!o || !langs || !langs.length || !(o.file || o.lines && o.lines[0])) return;
      var a = [], whole = true;
      langs.forEach(function (l) { var c = iso2(l); if (!c) whole = false; else if (a.indexOf(c) < 0) a.push(c); });
      if (!a.length || !whole) return; /* a track that names no language may be the very one wanted: nothing is concluded */
      var all = knownTracks(), key = sameFile(o), was = all[key];
      all[key] = { a: a, s: was && was.s ? was.s : null, t: Date.now(), w: 1 };
      var keys = Object.keys(all);
      if (keys.length > 400) keys.sort(function (x, y) { return all[x].t - all[y].t; }).slice(0, keys.length - 400).forEach(function (k) { delete all[k]; });
      CS.cache.set(TRACKS_KEY, all);
    },
    lacks: lacks,
    /* a track's language as a player names it -> our two letters ('' when unknown or not named) */
    langCode: iso2,
    /* a language's codes as files and players write them: "en" -> en, eng */
    langForms: function (c) {
      var out = [c];
      Object.keys(ALIAS).forEach(function (k) { if (ALIAS[k] === c && out.indexOf(k) < 0) out.push(k); });
      return out;
    },
    /* every add-on's answer -> one ordered list. Torrentio copies already offered through ⚡ are hidden, unless keepCopies
       (⚡ just failed — the PC went off — so the direct copy must be there to pick). The same for copies of what the cloud
       add-on offers, which itself gives way to ⚡ */
    order: function (raw, keepCopies, wanted) {
      var list = raw.map(parse).filter(function (o) { return !o.why; });
      /* wanted: the audio languages wanted for this title; a copy with none of them goes after the others (dubOnly) */
      list.forEach(function (o) { o.dubOnly = lacks(o, wanted); });
      if (!keepCopies) {
        var fast = {}, cloud = {};
        list.forEach(function (o) { if (o.speeder) fast[sameFile(o)] = 1; else if (o.cloud) cloud[sameFile(o)] = 1; });
        list = list.filter(function (o) {
          if (o.speeder) return true;
          if (fast[sameFile(o)]) return false;
          return o.cloud || !cloud[sameFile(o)];
        });
      }
      list.forEach(function (o, i) { o._i = i; o._rank = rank(o); });
      list.sort(function (a, b) { return b._rank - a._rank || a._i - b._i; });
      return list;
    },
    /* for a download: the direct copy of each file instead of its copy through the PC (⚡), so it goes on away from home
       and with the PC off. A file offered only through ⚡ stays, after the direct ones */
    forDownload: function (raw, wanted) {
      var all = CS.streams.order(raw, true, wanted), direct = {};
      all.forEach(function (o) { if (!o.speeder) direct[sameFile(o)] = 1; });
      var viaPc = all.filter(function (o) { return o.speeder && !direct[sameFile(o)]; });
      return all.filter(function (o) { return !o.speeder; }).concat(viaPc);
    },
    playUrl: playUrl,
    /* what to remember about a choice, to pick the same kind next time */
    memo: function (o) { return { addonId: o.addonId, bingeGroup: o.bingeGroup, res: o.res, dv: o.dv, group: o.group, speeder: o.speeder }; },
    pickLike: function (list, memo) {
      if (!list.length) return null;
      if (!memo) return list[0];
      var best = null, bestScore = -1;
      /* the same release through the PC, the cloud add-on or directly */
      function release(g) { return (g || '').replace(/^(speeder|cloud)\|/, ''); }
      list.forEach(function (o) {
        var sc = 0;
        if (memo.bingeGroup && release(o.bingeGroup) === release(memo.bingeGroup)) sc += 100;
        if (memo.group && o.group && o.group.toLowerCase() === (memo.group || '').toLowerCase()) sc += 40;
        if (o.res === memo.res) sc += 20;
        if (o.dv === memo.dv) sc += 6;
        if (o.speeder) sc += 8;
        else if (o.cloud) sc += 7;
        if (o.cached === true) sc += 4;
        if (o.dubOnly) sc -= 60; /* a dubbed-only copy only as the very release chosen before (a dub taken on purpose) */
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
