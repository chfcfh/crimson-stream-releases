/* Your Stremio library: continue watching, where you stopped, which episodes you watched — saved to the account,
   so the phone and this app agree. The record format follows Stremio's own (stremio-core LibraryItem).

   Profiles: the main one ('main') is the Stremio account's own library. Every other profile keeps its library and
   watch progress on this device only (cs.plib.<id>), never reads or writes the account, and is gone with the app. */
(function () {
  /* ---------- profiles ---------- */
  var PROFILES_KEY = 'cs.profiles', LOCAL_PREFIX = 'cs.plib.', MAX_PROFILES = 6;
  var COLORS = ['#ed0b18', '#2f7cf6', '#1fa971', '#f2a20c', '#9b51e0', '#e0457b'];
  var prof = readProfiles();

  function readProfiles() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PROFILES_KEY) || 'null'); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.list)) p = { list: [], current: 'main' };
    p.list = p.list.filter(function (x) { return x && x.id; });
    if (!p.list.some(function (x) { return x.id === 'main'; })) p.list.unshift({ id: 'main', name: '', color: 0 });
    if (!p.list.some(function (x) { return x.id === p.current; })) p.current = 'main';
    return p;
  }
  function saveProfiles() {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(prof)); } catch (e) { CS.log('profiles not saved', e.message); }
  }
  function findProfile(id) { return prof.list.filter(function (x) { return x.id === id; })[0] || null; }

  CS.profiles = {
    MAX: MAX_PROFILES,
    COLORS: COLORS,
    list: function () { return prof.list.slice(); },
    current: function () { return prof.current; },
    get: findProfile,
    isMain: function () { return prof.current === 'main'; },
    name: function (p) { return p && p.name || (p && p.id === 'main' ? 'الرئيسي' : 'ملف'); },
    color: function (p) { return COLORS[(p && p.color || 0) % COLORS.length]; },
    /* the first colour no profile has yet */
    freeColor: function () {
      var used = prof.list.map(function (x) { return x.color; });
      for (var i = 0; i < COLORS.length; i++) if (used.indexOf(i) < 0) return i;
      return 0;
    },
    add: function (name, color) {
      if (prof.list.length >= MAX_PROFILES) return null;
      if (color == null) color = CS.profiles.freeColor();
      var p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name || '').trim().slice(0, 20), color: color % COLORS.length };
      prof.list.push(p);
      saveProfiles();
      return p;
    },
    rename: function (id, name) {
      var p = findProfile(id);
      if (!p) return;
      p.name = String(name || '').trim().slice(0, 20);
      saveProfiles();
    },
    setColor: function (id, color) {
      var p = findProfile(id);
      if (!p) return;
      p.color = color % COLORS.length;
      saveProfiles();
    },
    /* a device profile and everything it watched; the main profile cannot be removed */
    remove: function (id) {
      if (id === 'main' || !findProfile(id)) return false;
      prof.list = prof.list.filter(function (x) { return x.id !== id; });
      /* its library is read in right now: forgotten, so nothing writes it back */
      if (loadedFor === id) { clearTimeout(localTimer); localTimer = 0; loadedFor = null; items = {}; }
      try { localStorage.removeItem(LOCAL_PREFIX + id); } catch (e) { /* nothing */ }
      if (prof.current === id) prof.current = 'main';
      saveProfiles();
      return true;
    },
    /* switch: what the profile in use changed is saved first (to the account for the main one); CS.lib.load() reads the new one */
    use: function (id) {
      if (!findProfile(id)) return Promise.resolve(false);
      var done = function () { prof.current = id; saveProfiles(); return true; };
      return CS.lib.flush().then(done, done);
    },
    /* the picker shows at start-up once there is more than one profile */
    askAtStart: function () { return prof.list.length > 1; },

    /* the main profile's lock: four digits, kept on this device (only a hash of them). Five wrong tries in a row wait 30 s */
    hasPin: function () { return !!prof.pin; },
    setPin: function (pin) { prof.pin = pinHash(pin); prof.wrong = 0; prof.until = 0; saveProfiles(); },
    clearPin: function () { delete prof.pin; prof.wrong = 0; prof.until = 0; saveProfiles(); },
    /* -> 'ok' | 'wrong' | 'wait' */
    checkPin: function (pin) {
      if (!prof.pin) return 'ok';
      if (prof.until && Date.now() < prof.until) return 'wait';
      if (pinHash(pin) === prof.pin) { prof.wrong = 0; prof.until = 0; saveProfiles(); return 'ok'; }
      prof.wrong = (prof.wrong || 0) + 1;
      if (prof.wrong >= PIN_TRIES) { prof.wrong = 0; prof.until = Date.now() + PIN_WAIT; }
      saveProfiles();
      return 'wrong';
    }
  };
  var PIN_TRIES = 5, PIN_WAIT = 30000;
  function pinHash(pin) {
    var s = 'crimson-pin:' + pin, x = 2166136261;
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(36);
  }

  var items = {};            /* id -> library item */
  var loadedFor = null;      /* the profile whose library is in "items" */
  var localTimer = 0;
  var saveTimer = 0;
  var flushing = null;       /* the send in flight (one at a time) */
  var flushAgain = false;    /* a change came while it was in flight: another send right after */
  var WATCHED_SHARE = 0.7;   /* Stremio marks a video watched after 70 % of it was played */

  function nowIso() { return new Date().toISOString(); }

  function blank(meta) {
    var t = nowIso();
    return {
      _id: meta.id, name: meta.name, type: meta.type, poster: meta.poster || null, posterShape: meta.posterShape || 'poster',
      removed: true, temp: true, _ctime: t, _mtime: t,
      state: { lastWatched: t, timeWatched: 0, timeOffset: 0, overallTimeWatched: 0, timesWatched: 0, flaggedWatched: 0, duration: 0, video_id: null, watched: null, noNotif: false },
      behaviorHints: { defaultVideoId: null, featuredVideoId: null, hasScheduledVideos: false }
    };
  }

  /* ---------- the watched-episodes bitfield ("anchorVideoId:anchorLength:base64(zlib(bits))") ---------- */
  function b64ToBytes(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function bytesToB64(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function pipe(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function inflate(bytes) {
    return pipe(bytes, new DecompressionStream('deflate')).catch(function () { return pipe(bytes, new DecompressionStream('deflate-raw')); });
  }
  function deflate(bytes) { return pipe(bytes, new CompressionStream('deflate')); }

  /* -> {set: Set of watched video ids, ok: the saved anchor matches this episode order (safe to write back)} */
  function readWatched(str, videoIds) {
    if (!str) return Promise.resolve({ set: new Set(), ok: true });
    var parts = str.split(':');
    var buf = parts.pop(), anchorLen = +parts.pop(), anchorId = parts.join(':');
    return inflate(b64ToBytes(buf)).then(function (bits) {
      var idx = videoIds.indexOf(anchorId);
      var offset = idx >= 0 ? anchorLen - idx - 1 : 0;
      var set = new Set();
      for (var i = 0; i < videoIds.length; i++) {
        var j = i + offset;
        if (j >= 0 && j < bits.length * 8 && (bits[j >> 3] & (1 << (j & 7)))) set.add(videoIds[i]);
      }
      var anchorBit = anchorLen > 0 && ((bits[(anchorLen - 1) >> 3] || 0) & (1 << ((anchorLen - 1) & 7)));
      return { set: set, ok: idx >= 0 && !!anchorBit };
    }).catch(function (e) {
      CS.log('watched list unreadable', e.message);
      return { set: new Set(), ok: false };
    });
  }
  function writeWatched(set, videoIds) {
    var bytes = new Uint8Array(Math.max(1, Math.ceil(videoIds.length / 8)));
    var last = 0;
    videoIds.forEach(function (id, i) { if (set.has(id)) { bytes[i >> 3] |= 1 << (i & 7); last = i; } });
    return deflate(bytes).then(function (z) { return videoIds[last] + ':' + (last + 1) + ':' + bytesToB64(z); });
  }
  function videoOrder(meta) { return (meta.videos || []).map(function (v) { return v.id; }); }

  /* ---------- saving ----------
     A change waits in "pending" (kept in storage, so switching the TV off loses nothing) together with the account time
     it was built on. Before sending, the account's current copy is read: if another device (the phone) changed the title
     since, the newer playback wins (state.lastWatched) and the newer library choice wins (_mtime) — never a blind overwrite. */
  var PENDING_KEY = 'cs.libPending', PENDING_ITEMS_KEY = 'cs.libPendingItems';
  var pending = readPending();   /* id -> account _mtime our change was built on ('' = new to the account) */
  var cacheTimer = 0;
  var serverTime = {};           /* id -> _mtime last seen in the account */
  var rev = {};                  /* id -> local change count (a change made while a send is in flight stays pending) */

  function readPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {}; } catch (e) { return {}; } }

  /* ---------- a device profile's library (never sent anywhere) ---------- */
  /* by the library that is read in, not the profile just picked: until CS.lib.load() reads the new one, a change still
     belongs to the one shown, so a device profile's title can never reach the account */
  function onDevice() { return (loadedFor || CS.profiles.current()) !== 'main'; }
  function readLocal(id) { try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + id) || '{}') || {}; } catch (e) { return {}; } }
  function saveLocal() {
    clearTimeout(localTimer); localTimer = 0;
    if (!loadedFor || loadedFor === 'main') return;
    var raw = JSON.stringify(items);
    try { localStorage.setItem(LOCAL_PREFIX + loadedFor, raw); }
    catch (e) {
      /* storage full: the main library's copy can always be read again from the account */
      CS.cache.drop('lib');
      try { localStorage.setItem(LOCAL_PREFIX + loadedFor, raw); } catch (e2) { CS.log('profile library not saved', e2.message); }
    }
  }
  /* a different profile is about to be read: the main one's copy is written now, the timers of the one before stop */
  function switchTo(who) {
    if (loadedFor === who) return;
    if (loadedFor === 'main' && cacheTimer) CS.cache.set('lib', items);
    if (loadedFor && loadedFor !== 'main') saveLocal();
    clearTimeout(cacheTimer); cacheTimer = 0;
    clearTimeout(saveTimer); saveTimer = 0;
    clearTimeout(localTimer); localTimer = 0;
    loadedFor = who;
    items = {};
    serverTime = {};
    rev = {};
    pending = who === 'main' ? readPending() : {};
  }
  /* the pending titles themselves are kept on their own (small, written at once); the whole library copy is written
     at most every 20 s, so a progress tick never serialises the full library */
  function keepPending() {
    var mine = {};
    for (var id in pending) if (items[id]) mine[id] = items[id];
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      localStorage.setItem(PENDING_ITEMS_KEY, JSON.stringify(mine));
    } catch (e) { CS.log('pending changes not kept', e.message); }
  }
  function cacheSoon() {
    if (cacheTimer) return;
    cacheTimer = setTimeout(function () { cacheTimer = 0; CS.cache.set('lib', items); }, 20000);
  }
  function pendingItems() { try { return JSON.parse(localStorage.getItem(PENDING_ITEMS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function newer(a, b) { return (a || '') > (b || ''); }
  /* the "continue watching" row, as Stremio decides it */
  function inCW(it) { return it.type !== 'other' && (!it.removed || it.temp) && !!it.state && it.state.timeOffset > 0; }

  function queue(item, now) {
    var id = item._id;
    if (onDevice()) {
      item._mtime = nowIso();
      items[id] = item;
      clearTimeout(localTimer);
      localTimer = setTimeout(saveLocal, now ? 0 : 5000);
      return;
    }
    if (!(id in pending)) pending[id] = serverTime[id] != null ? serverTime[id] : (items[id] ? items[id]._mtime : '');
    rev[id] = (rev[id] || 0) + 1;
    item._mtime = nowIso();
    items[id] = item;
    keepPending();
    cacheSoon();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(CS.lib.flush, now ? 0 : 30000);
  }

  /* our change against the account's copy that changed after our change was built on it */
  function merge(ours, srv) {
    var out = JSON.parse(JSON.stringify(srv));
    var ol = ours.state && ours.state.lastWatched, sl = srv.state && srv.state.lastWatched;
    if (newer(ol, sl)) out.state = JSON.parse(JSON.stringify(ours.state));
    /* nothing was played anywhere since, and we removed it from continue watching: the removal stays */
    else if (ol === sl && out.state && ours.state && ours.state.timeOffset === 0) out.state.timeOffset = 0;
    if (newer(ours._mtime, srv._mtime)) { out.removed = ours.removed; out.temp = ours.temp; }
    return out;
  }
  /* what to show for a title: the account copy, our pending change, or both merged */
  function pick(id, srv) {
    serverTime[id] = srv._mtime;
    var mine = items[id];
    if (!(id in pending) || !mine) return srv;
    return newer(srv._mtime, pending[id]) ? merge(mine, srv) : mine;
  }

  CS.lib = {
    readWatched: readWatched,
    videoOrder: videoOrder,
    load: function () {
      var who = CS.profiles.current();
      switchTo(who);
      if (who !== 'main') { items = readLocal(who); return Promise.resolve(items); }
      items = CS.cache.get('lib') || {};
      /* changes made since the last full copy (or before the TV was switched off) */
      var kept = pendingItems();
      for (var pid in kept) if (pid in pending) items[pid] = kept[pid];
      if (!CS.settings.authKey) return Promise.resolve(items);
      return CS.api.library().then(function (list) {
        if (loadedFor !== 'main') return items; /* another profile was picked meanwhile */
        var fresh = {};
        (list || []).forEach(function (it) { if (it && it._id) fresh[it._id] = pick(it._id, it); });
        for (var id in pending) if (!fresh[id] && items[id]) fresh[id] = items[id];
        items = fresh;
        CS.cache.set('lib', items);
        if (Object.keys(pending).length) { CS.log('sending changes kept from last time', Object.keys(pending).length); CS.lib.flush(); }
        return items;
      }).catch(function (e) { CS.log('library not loaded', e.message); return items; });
    },
    /* read one title fresh from the account (it may have been watched on the phone); true when what we show changed */
    refreshItem: function (id) {
      if (!CS.settings.authKey || onDevice()) return Promise.resolve(false);
      return CS.api.libraryGet([id]).then(function (list) {
        if (loadedFor !== 'main') return false;
        var srv = (list || []).filter(function (it) { return it && it._id === id; })[0];
        if (!srv) return false;
        var before = JSON.stringify(items[id] || null);
        items[id] = pick(id, srv);
        if (JSON.stringify(items[id]) === before) return false;
        CS.cache.set('lib', items);
        return true;
      }).catch(function (e) { CS.log('title not refreshed', id, e.message); return false; });
    },
    get: function (id) { return items[id] || null; },
    inLibrary: function (id) { var it = items[id]; return !!(it && !it.removed); },
    /* the "continue watching" row, as Stremio decides it */
    continueWatching: function () {
      return Object.keys(items).map(function (k) { return items[k]; }).filter(inCW).sort(function (a, b) {
        return (b.state.lastWatched || b._mtime || '').localeCompare(a.state.lastWatched || a._mtime || '');
      });
    },
    inContinueWatching: function (id) { return !!items[id] && inCW(items[id]); },
    libraryList: function () {
      return Object.keys(items).map(function (k) { return items[k]; }).filter(function (it) { return !it.removed && it.type !== 'other'; })
        .sort(function (a, b) { return (b._mtime || '').localeCompare(a._mtime || ''); });
    },
    toggleLibrary: function (meta) {
      var it = items[meta.id] ? JSON.parse(JSON.stringify(items[meta.id])) : blank(meta);
      var wasIn = !it.removed && !it.temp;
      it.removed = wasIn;
      it.temp = false;
      queue(it, true);
      return !it.removed;
    },
    /* where to resume: {videoId, offset seconds} for this title */
    resumePoint: function (id) {
      var it = items[id];
      if (!it || !it.state || !it.state.timeOffset) return null;
      return { videoId: it.state.video_id || id, offset: it.state.timeOffset / 1000, duration: (it.state.duration || 0) / 1000 };
    },
    /* called while playing: position and how much was actually played since the last call (seconds) */
    progress: function (meta, videoId, posSec, durSec, playedSec) {
      var it = items[meta.id] ? JSON.parse(JSON.stringify(items[meta.id])) : blank(meta);
      var st = it.state;
      if (st.video_id !== videoId) { st.video_id = videoId; st.timeWatched = 0; st.flaggedWatched = 0; }
      st.lastWatched = nowIso();
      st.timeWatched = Math.round((st.timeWatched || 0) + playedSec * 1000);
      st.overallTimeWatched = Math.round((st.overallTimeWatched || 0) + playedSec * 1000);
      st.timeOffset = Math.max(1, Math.round(posSec * 1000));
      if (durSec > 0) st.duration = Math.round(durSec * 1000);
      if (it.removed && !it.temp) it.temp = true;
      var p = Promise.resolve();
      if (!st.flaggedWatched && st.duration > 0 && st.timeWatched > st.duration * WATCHED_SHARE) {
        st.flaggedWatched = 1;
        st.timesWatched = (st.timesWatched || 0) + 1;
        p = CS.lib.markWatched(it, meta, videoId);
      }
      return p.then(function () { queue(it, false); });
    },
    markWatched: function (it, meta, videoId) {
      if (meta.type !== 'series' || !meta.videos || !meta.videos.length) return Promise.resolve();
      var order = videoOrder(meta);
      return readWatched(it.state.watched, order).then(function (r) {
        if (!r.ok && it.state.watched) { CS.log('watched list kept as is (episode order differs)', meta.id); return; }
        r.set.add(videoId);
        return writeWatched(r.set, order).then(function (s) { it.state.watched = s; });
      });
    },
    /* the video ended or was left at the credits */
    finished: function (meta, videoId, nextVideoId) {
      var it = items[meta.id] ? JSON.parse(JSON.stringify(items[meta.id])) : blank(meta);
      var st = it.state;
      var p = Promise.resolve();
      if (!st.flaggedWatched || st.video_id !== videoId) {
        st.flaggedWatched = 1;
        st.timesWatched = (st.timesWatched || 0) + 1;
        p = CS.lib.markWatched(it, meta, videoId);
      }
      return p.then(function () {
        st.lastWatched = nowIso();
        if (nextVideoId) { st.video_id = nextVideoId; st.timeOffset = 1; st.timeWatched = 0; st.flaggedWatched = 0; st.duration = 0; }
        else st.timeOffset = 0;
        if (it.removed && !it.temp) it.temp = true;
        queue(it, true);
      });
    },
    /* drop a title from continue watching */
    dismiss: function (id) {
      var it = items[id];
      if (!it) return;
      it = JSON.parse(JSON.stringify(it));
      it.state.timeOffset = 0;
      queue(it, true);
    },
    flush: function () {
      clearTimeout(saveTimer);
      if (onDevice()) { saveLocal(); return flushing || Promise.resolve(); }
      if (flushing) { flushAgain = true; return flushing; }
      var ids = Object.keys(pending);
      if (!ids.length || !CS.settings.authKey) return Promise.resolve();
      var revs = {};
      ids.forEach(function (id) { revs[id] = rev[id]; });
      flushing = CS.api.libraryGet(ids).then(function (list) {
        var srv = {};
        (list || []).forEach(function (it) { if (it && it._id) srv[it._id] = it; });
        var changes = ids.map(function (id) {
          var ours = items[id];
          if (!ours) { delete pending[id]; return null; }
          var s = srv[id];
          if (s && newer(s._mtime, pending[id])) {
            var m = merge(ours, s);
            m._mtime = nowIso();
            items[id] = m;
            CS.log('merged with a newer copy from another device', id);
            return m;
          }
          return ours;
        }).filter(Boolean);
        if (!changes.length) { keepPending(); return; }
        return CS.api.libraryPut(changes).then(function () {
          changes.forEach(function (c) {
            serverTime[c._id] = c._mtime;
            if (rev[c._id] === revs[c._id]) delete pending[c._id];
            else pending[c._id] = c._mtime; /* changed again during the send: the account now holds this version */
          });
          keepPending();
          cacheSoon();
          CS.log('library saved', changes.length);
        });
      }).catch(function (e) {
        /* the account could not be read or written: nothing is sent blindly; the changes stay and are tried again */
        CS.log('library not saved, will retry', e.message);
        saveTimer = setTimeout(CS.lib.flush, 60000);
      }).then(function () {
        flushing = null;
        if (flushAgain) { flushAgain = false; clearTimeout(saveTimer); saveTimer = setTimeout(CS.lib.flush, 0); }
      });
      return flushing;
    },
    pendingCount: function () { return Object.keys(pending).length; }
  };
})();
