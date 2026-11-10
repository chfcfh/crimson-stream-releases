/* Settings and a small cache, both kept in the TV's local storage. */
(function () {
  var DESKTOP = !!(window.chrome && window.chrome.webview);
  var DEFAULTS = {
    authKey: '',
    email: '',
    fitCode: '',                /* the code from the PC's owner, for having subtitles fitted from afar (crimson-hub) */
    pc: DESKTOP ? '127.0.0.1' : CS.config.homePc, /* TV: the owner's PC (⚡, Stremio's server); Windows: this PC's Stremio server */
    logUrl: '',                 /* while building: where the app sends its log lines */
    subSize: 'm',               /* s | m | l | xl */
    subStyle: 'shadow',         /* shadow | box */
    subColor: 'white',          /* white | yellow */
    subLift: 8,                 /* % of the screen height above the bottom */
    subScale: 100,              /* the Windows version's size in the subtitle panel, % */
    subAuto: true,              /* pick the best Arabic subtitle by itself */
    subOffsets: {},             /* title id -> ms (minus = earlier) */
    autoNext: true,             /* the next episode starts by itself */
    seekStep: 10,               /* seconds per press of right/left */
    seekSpeedup: true,          /* holding or pressing many times makes the steps bigger (×3, then ×6) */
    uiSize: 0.8,                /* the Windows version: how big everything is (1 = as on the TV) */
    preferQuality: 'best',      /* best | 1080p | 720p */
    autoBest: true,             /* the best source plays by itself (views.js, maybeAuto); on unless the viewer turns it off */
    audioLang: 'original',      /* original | ara | eng */
    lastPick: {},               /* title id -> what was chosen last time (add-on, binge group, quality) */
    sourceFilter: null,         /* the source list's filter: {audio: [codes], subs: [codes], res: [2160, 1080…]} */
    recentSearches: [],         /* the last few things searched for: typing on a remote is slow */
    cwHintSeen: false,          /* the long-press hint on continue watching is said once */
    roll: null,                 /* the random pick's choices as last left (roll.js fills in what is missing) */
    rollRecent: [],             /* the last five random picks: {id, type, name, poster} */
    rollNever: [],              /* titles the random pick must never land on again (ids, newest first) */
    debug: false                /* on: log lines go to the PC (tools/devlog.js); off for every new install */
  };
  var KEY = 'cs.settings';

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { s = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = s[k] !== undefined ? s[k] : JSON.parse(JSON.stringify(DEFAULTS[k]));
    return out;
  }
  CS.settings = load();
  CS.saveSettings = function () {
    try { localStorage.setItem(KEY, JSON.stringify(CS.settings)); } catch (e) { CS.log('settings not saved', e.message); }
  };

  /* cache: {t: time saved, v: value} under "c:<key>" */
  CS.cache = {
    get: function (key, maxAgeMs) {
      try {
        var raw = localStorage.getItem('c:' + key);
        if (!raw) return null;
        var o = JSON.parse(raw);
        if (maxAgeMs && Date.now() - o.t > maxAgeMs) return null;
        return o.v;
      } catch (e) { return null; }
    },
    age: function (key) {
      try { var o = JSON.parse(localStorage.getItem('c:' + key)); return o ? Date.now() - o.t : Infinity; } catch (e) { return Infinity; }
    },
    set: function (key, v) {
      var raw = JSON.stringify({ t: Date.now(), v: v });
      try { localStorage.setItem('c:' + key, raw); }
      catch (e) {
        /* full: drop the oldest half of the cache and try once more */
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.slice(0, 2) === 'c:') keys.push(k); }
        /* oldest first; each entry's age is read once (sorting used to re-read and re-parse entries many times) */
        var ages = {};
        keys.forEach(function (k) { ages[k] = CS.cache.age(k.slice(2)); });
        keys.sort(function (a, b) { return ages[b] - ages[a]; });
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (k) { localStorage.removeItem(k); });
        try { localStorage.setItem('c:' + key, raw); } catch (e2) { /* give up quietly */ }
      }
    },
    drop: function (key) { try { localStorage.removeItem('c:' + key); } catch (e) { /* nothing */ } }
  };

  CS.pcUrl = function (port) { return CS.settings.pc ? 'http://' + CS.settings.pc + ':' + port : ''; };
})();
