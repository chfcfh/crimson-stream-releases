/* «مشاهدة مع صديق»: two or more Crimson apps play the same file at the same moment, through a room on crimson-hub (room.js).
   The one who opens the room leads: its play, pause, jumps and episodes go to the others, whose own keys for those do nothing.
   Everyone plays the very same file, each from their own account: its hash and name are sent, never a link (a link holds the
   leader's TorBox key).
   The time: each app sets its clock by the room's (of the pings of the last minute, the one with the shortest trip), and the
   leader says "at the room's time T I was at P", so where it is now is known whatever the network's delay. The TV's place comes
   from Crimson's clock (subs.js, 0 to +42 ms from the picture), Windows' from mpv's.
   A friend a little off is brought back by playing up to 4% faster or slower until the two meet (the voice keeps its pitch):
   nothing jumps while watching. A friend still loading, or stopping to load, has the leader wait, paused, and both go on
   together at a moment set a little ahead. The players lend what they can do through CS.player.sync (player.js, desktop.js). */
(function () {
  var MAX_RATE = 0.04;        /* at most 4% faster or slower */
  var GAIN = 0.3;             /* 100 ms off -> 3% for a start; the gap closes by itself in a few seconds */
  var FAR = 2.0;              /* this far off while playing (it waited for data alone): a jump, the only one */
  var TICK = 250, HB_MS = 1000, PING_MS = 5000;
  var MAX_HOLD = 90000;       /* a friend still loading after this long: the others go on, he catches up when he can */
  var AHEAD_HOLD = 800, AHEAD_PLAY = 350; /* a start set this far ahead, so it happens at the same moment everywhere */
  var KEEP_MS = 6 * 3600e3;   /* a room the app was in comes back after a restart for this long */

  var R = null;  /* the room: {code, key, isLead, ws, open, id, members, tries} */
  var L = null;  /* leading: {item, seq, playing, hold, holdSince, stall, startAt, startPos, sentPos, lastSent, reports, skip, nullTimer} */
  var M = null;  /* following: {state, item, phase, why, loaded, rate, diffs, lastD, playTimer, playSeq, alignSeq, jumpSeq, openSeq} */
  var clock = { samples: [], offset: null, rtt: null };
  var tickTimer = 0, pingTimer = 0, selfUntil = 0, changeFns = [];

  function sync() { return CS.player && CS.player.sync; }
  function hub() { return (CS.config && CS.config.hubUrl) || ''; }
  function now() { return performance.now(); }
  function kind() { return window.CS_ANDROID ? 'phone' : CS.desktop ? 'pc' : CS.isTV ? 'tv' : 'web'; }
  /* the profile's own name; one never named (the main one's «الرئيسي») says nothing about who it is */
  function myName() {
    try { var p = CS.profiles && CS.profiles.get(CS.profiles.current()); return p && p.name ? String(p.name).slice(0, 24) : ''; } catch (e) { return ''; }
  }
  var KIND_NAME = { tv: 'التلفزيون', pc: 'الكمبيوتر', phone: 'الجوال', web: 'المتصفح' };
  function nameOf(m) { return m && m.name ? m.name : 'صديقك'; }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[b.length >> 1] : 0; }
  function changed() { changeFns.forEach(function (f) { try { f(); } catch (e) { /* a screen gone */ } }); }
  /* the hub, with its answer's status kept (a room missing is 404, one that is there answers a plain ask with 426) */
  function ask(path, method) {
    var url = hub() + path, ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
    return fetch(CS.netUrl ? CS.netUrl(url, 10000) : url, { method: method || 'GET', cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      clearTimeout(t);
      return r.text().then(function (x) { var j = null; try { j = JSON.parse(x); } catch (e) { /* not JSON */ } return { status: r.status, j: j }; });
    }, function (e) { clearTimeout(t); throw e; });
  }
  function say(text) { var S = sync(); if (S && S.say) S.say(text); }

  /* ---------- the clock ---------- */
  /* of the last pings, the one with the shortest trip says the time best: its answer came back halfway through it */
  function bestSample(samples) {
    var best = null;
    samples.forEach(function (s) { if (!best || s.rtt < best.rtt) best = s; });
    return best;
  }
  function serverNow() { return clock.offset == null ? Date.now() : now() + clock.offset; }
  function toServer(perfMs) { return clock.offset == null ? Date.now() - (now() - perfMs) : perfMs + clock.offset; }
  function toLocal(serverMs) { return clock.offset == null ? now() + (serverMs - Date.now()) : serverMs - clock.offset; }
  function onPong(m) {
    var t1 = now(), rtt = t1 - m.c;
    if (!(rtt >= 0 && rtt < 10000) || typeof m.s !== 'number') return;
    clock.samples.push({ rtt: rtt, off: m.s - (m.c + t1) / 2 });
    while (clock.samples.length > 12) clock.samples.shift(); /* about the last minute */
    var b = bestSample(clock.samples);
    clock.offset = b.off;
    clock.rtt = b.rtt;
  }

  /* ---------- the file: the same one everywhere ---------- */
  var RESOLVE = /\/([0-9a-f]{40})\/[^\/]+\/(\d+)(?:\/|$)/i;   /* Torrentio's /resolve/<service>/<key>/<hash>/<cached>/<file>/… */
  function hashOf(o) { return String(o.infoHash || (RESOLVE.exec(o.url || '') || /\/([0-9a-f]{40})(?:\/|$)/i.exec(o.url || '') || [])[1] || '').toLowerCase(); }
  function idxOf(o) { if (o.fileIdx != null && o.fileIdx !== '') return +o.fileIdx; var m = RESOLVE.exec(o.url || ''); return m ? +m[2] : null; }
  function fileOf(o) { return { hash: hashOf(o), idx: idxOf(o), name: o.file || (o.lines && o.lines[0]) || '', size: o.size || 0 }; }
  /* the leader's file among this app's own sources: by its hash (and its place in a pack), else by name and size */
  function findSame(list, f) {
    if (!f) return null;
    var i, o;
    if (f.hash) for (i = 0; i < list.length; i++) {
      o = list[i];
      if (hashOf(o) === f.hash && (f.idx == null || idxOf(o) == null || idxOf(o) === f.idx)) return o;
    }
    if (f.name) for (i = 0; i < list.length; i++) {
      o = list[i];
      var n = o.file || (o.lines && o.lines[0]) || '';
      if (n === f.name && (!f.size || !o.size || Math.abs(o.size - f.size) <= f.size * 0.01)) return o;
    }
    return null;
  }
  function itemOf(meta, video, stream) {
    return {
      meta: { id: meta.id, type: meta.type, name: meta.name || '', poster: meta.poster || '' },
      video: { id: video.id, season: video.season, episode: video.episode, title: video.title || '' },
      file: fileOf(stream)
    };
  }
  function sameItem(a, b) {
    if (!a || !b || a.video.id !== b.video.id) return false;
    return a.file.hash ? a.file.hash === b.file.hash && a.file.idx === b.file.idx : a.file.name === b.file.name;
  }

  /* how fast to play, from how far ahead (+) or behind (-) of the leader this player is (seconds). Closer than 30 ms is left
     alone; a correction under way goes on until 12 ms */
  function rateFor(d, was) {
    if (Math.abs(d) < (was !== 1 ? 0.012 : 0.03)) return 1;
    return round3(1 - Math.max(-MAX_RATE, Math.min(MAX_RATE, d * GAIN)));
  }

  /* ---------- the room's line ---------- */
  function send(m) {
    if (!R || !R.ws || R.ws.readyState !== 1) return false;
    try { R.ws.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  function connect() {
    if (!R) return;
    var q = '?kind=' + kind() + '&name=' + encodeURIComponent(myName()) + (R.key ? '&key=' + R.key : '');
    var ws;
    try { ws = new WebSocket(hub().replace(/^http/, 'ws') + '/room/' + R.code + q); } catch (e) { retry(); return; }
    R.ws = ws;
    ws.onopen = function () {
      if (!R || R.ws !== ws) return;
      R.open = true;
      R.tries = 0;
      for (var i = 0; i < 6; i++) setTimeout(function () { send({ t: 'ping', c: now() }); }, i * 150);
      clearInterval(pingTimer);
      pingTimer = setInterval(function () { send({ t: 'ping', c: now() }); }, PING_MS);
      changed();
    };
    ws.onmessage = function (e) { if (R && R.ws === ws) onMessage(e.data); };
    ws.onclose = function () {
      if (!R || R.ws !== ws) return;
      R.open = false;
      R.ws = null;
      clearInterval(pingTimer);
      changed();
      retry();
    };
  }
  /* the line dropped (the TV's Wi-Fi, the PC asleep): again, less often each time, unless the room is gone */
  function retry() {
    if (!R) return;
    R.tries = (R.tries || 0) + 1;
    clearTimeout(R.retryTimer);
    var r0 = R;
    R.retryTimer = setTimeout(function () {
      if (R !== r0) return;
      ask('/room/' + r0.code).then(function (r) {
        if (R !== r0) return;
        if (r.status === 404) { gone('الغرفة انتهت'); return; }
        connect(); /* 426: it is there (a plain ask is not a join) */
      }, function () { if (R === r0) retry(); });
    }, Math.min(15000, 1000 * Math.pow(2, R.tries - 1)));
  }
  function onMessage(text) {
    var m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || !R) return;
    if (m.t === 'pong') { onPong(m); return; }
    if (m.t === 'hello') {
      R.id = m.id;
      R.isLead = !!m.lead;
      if (R.key && !R.isLead) { gone('ما قدرنا نرجع للغرفة كصاحبها'); return; }
      membersNow(m.members || [], true);
      if (R.isLead) leadHello(); else if (m.state) onState(m.state);
      changed();
      return;
    }
    if (m.t === 'members') { membersNow(m.members || [], false); return; }
    if (m.t === 'state' && !R.isLead) { onState(m); return; }
    if (m.t === 'report' && R.isLead) { onReport(m); return; }
    if (m.t === 'end' && !R.isLead) gone('صاحب الغرفة أنهاها');
  }
  function membersNow(list, first) {
    var before = {};
    (R.members || []).forEach(function (x) { before[x.id] = x; });
    var after = {};
    list.forEach(function (x) { after[x.id] = x; if (!before[x.id]) x.since = now(); else x.since = before[x.id].since; });
    R.members = list;
    if (!first) {
      list.forEach(function (x) { if (!before[x.id] && x.id !== R.id) CS.toast(x.lead ? 'رجع صاحب الغرفة' : 'دخل ' + nameOf(x) + ' من ' + (KIND_NAME[x.kind] || 'جهازه')); });
      Object.keys(before).forEach(function (id) { if (!after[id] && id !== R.id) CS.toast(before[id].lead ? 'صاحب الغرفة طلع — ننتظره يرجع' : 'طلع ' + nameOf(before[id]) + ' من الغرفة'); });
    }
    if (R.isLead && L) {
      Object.keys(L.reports).forEach(function (id) { if (!after[id]) delete L.reports[id]; });
      /* one who just came opens what is on now */
      if (!first && list.some(function (x) { return !before[x.id] && !x.lead; })) leadState(false);
    }
    changed();
  }
  function persist() {
    CS.settings.room = R ? { code: R.code, key: R.key || '', at: Date.now() } : null;
    CS.saveSettings();
  }
  function start(code, key) {
    leave(true);
    R = { code: code, key: key || '', members: [], tries: 0 };
    if (key) L = { item: null, seq: 1, playing: false, reports: {}, skip: {} };
    else M = { phase: 'idle', rate: 1, diffs: [] };
    persist();
    connect();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, TICK);
    changed();
  }
  /* the room ended or could not be reached again: the player goes on by itself */
  function gone(why) {
    if (!R) return;
    CS.toast(why, 6000);
    leave(true);
  }
  function leave(quiet) {
    if (R) {
      if (R.isLead && !quiet) send({ t: 'end' });
      clearTimeout(R.retryTimer);
      var ws = R.ws;
      R = null;
      if (ws) setTimeout(function () { try { ws.close(1000, 'bye'); } catch (e) { /* closed */ } }, 300);
    }
    clearInterval(tickTimer);
    clearInterval(pingTimer);
    if (M) { clearTimeout(M.playTimer); var S = sync(); if (S && M.rate !== 1 && S.active()) S.setRate(1); if (S && S.unlock) S.unlock(); }
    if (L) clearTimeout(L.nullTimer);
    L = null;
    M = null;
    say(null);
    if (CS.settings.room) { CS.settings.room = null; CS.saveSettings(); }
    changed();
  }

  /* ---------- leading ---------- */
  function friends() { return R ? (R.members || []).filter(function (x) { return !x.lead && x.id !== R.id; }) : []; }
  function placeNow() {
    var S = sync();
    return S && S.active() ? S.now() : null;
  }
  function leadState(hb) {
    if (!L || !R) return;
    var p = placeNow();
    var m = { t: 'state', v: 1, seq: L.seq, hb: hb ? 1 : 0, item: L.item, playing: L.playing && !L.hold && !L.stall, stall: !!L.stall, hold: !!L.hold };
    if (L.startAt) { m.playing = true; m.pos = round3(L.startPos); m.at = L.startAt; }
    else if (p) { m.pos = round3(p.pos); m.at = Math.round(toServer(p.at)); }
    else { m.pos = round3(L.holdPos || 0); m.at = Math.round(serverNow()); }
    if (!m.playing) L.sentPos = m.pos;
    send(m);
    L.lastSent = now();
  }
  function leadHello() {
    if (!L) L = { item: null, seq: 1, playing: false, reports: {}, skip: {} };
    var S = sync(), P = CS.player && CS.player.playing && CS.player.playing();
    /* back in the room (a restart, the line dropped) with a video already on: it is what the others watch */
    if (!L.item && P && S && S.active() && P.meta && P.video && P.stream) {
      L.item = itemOf(P.meta, P.video, P.stream);
      L.playing = !S.paused();
      L.seq++;
    }
    leadState(false);
  }
  function onReport(r) {
    if (!L || !r.from) return;
    var was = L.reports[r.from];
    L.reports[r.from] = r;
    if (r.phase === 'ready' || r.phase === 'playing') delete L.skip[r.from];
    if (!was || was.phase !== r.phase) changed();
    if (r.phase === 'failed' && (!was || was.phase !== 'failed')) {
      var m = (R.members || []).filter(function (x) { return x.id === r.from; })[0];
      CS.toast(nameOf(m) + (r.why === 'nofile' ? ' ما لقى نفس الملف في مصادره — تأكد إن عنده نفس الإضافة وإن ملفاتها ما تنخفى (مثل 4K)' : ' ما قدر يشغّل نفس الملف'), 9000);
    }
    if (r.phase === 'off' && was && was.phase !== 'off') CS.toast(nameOf((R.members || []).filter(function (x) { return x.id === r.from; })[0]) + ' طلع من الحلقة', 4000);
  }
  /* those the leader waits for: still loading or stopped to load; while waiting, also those not yet standing where it waits.
     One that has not said anything about this video yet has 30 s to (from the video's start, or from coming in) */
  function waitingFor() {
    if (!L || !L.item) return [];
    return friends().filter(function (m) {
      if (L.skip[m.id]) return false;
      var r = L.reports[m.id];
      if (!r || r.seq < L.itemSeq) return now() - Math.max(L.itemAt || 0, m.since || 0) < 30000;
      if (r.phase === 'loading' || r.phase === 'stalled') return true;
      if (r.phase !== 'ready' && r.phase !== 'playing') return false; /* failed, off, idle */
      return !!L.hold && r.seq < L.holdSeq;
    });
  }
  function selfAct(f) { selfUntil = now() + 1500; f(); }
  function holdOn() {
    L.hold = true;
    L.holdSince = now();
    var p = placeNow();
    L.holdPos = p ? p.pos : L.holdPos || 0;
    selfAct(function () { sync().pause(); });
    L.seq++;
    L.holdSeq = L.seq;
    leadState(false);
  }
  /* everyone is ready: on together, a moment ahead */
  function goTogether(ahead) {
    var S = sync(), p = placeNow();
    L.hold = false;
    L.stall = false;
    L.playing = true;
    L.startPos = p ? p.pos : L.holdPos || 0;
    L.startAt = Math.round(serverNow() + ahead);
    L.seq++;
    leadState(false);
    var me = L, at = L.startAt;
    clearTimeout(L.startTimer);
    L.startTimer = setTimeout(function () {
      if (L !== me || me.startAt !== at) return;
      selfAct(function () { S.play(); });
      setTimeout(function () { if (L === me && me.startAt === at) { me.startAt = 0; leadState(true); } }, 400);
    }, Math.max(0, toLocal(at) - now()));
  }
  function holdText(waiting) {
    var r = waiting[0] && L.reports[waiting[0].id];
    return 'ننتظر ' + nameOf(waiting[0]) + (r && r.phase === 'stalled' ? ' — النت عنده يحمّل' : ' يجهز…');
  }
  function leadTick() {
    var S = sync();
    if (!L || !L.item || !S || !S.active()) return;
    var others = friends().length;
    /* paused or played by something other than its keys (the TV sent the app to the back): the others follow it too */
    if (now() > selfUntil && !L.hold && !L.startAt) {
      if (L.playing && S.paused()) { L.playing = false; L.stall = false; L.seq++; leadState(false); }
      else if (!L.playing && !S.paused() && !S.buffering()) { L.playing = true; L.seq++; leadState(false); }
    }
    /* its own stop to load: the others stand at its place, and go on when it does */
    var stall = L.playing && !L.hold && !L.startAt && S.buffering();
    if (stall !== !!L.stall) { L.stall = stall; L.seq++; leadState(false); }
    var waiting = waitingFor();
    if (L.playing && !L.hold && !L.startAt && waiting.length) holdOn();
    else if (L.hold && !waiting.length && S.ready() && !S.seeking()) goTogether(AHEAD_HOLD);
    else if (L.hold && now() - L.holdSince > MAX_HOLD && S.ready()) {
      waiting.forEach(function (m) { L.skip[m.id] = 1; });
      CS.toast(nameOf(waiting[0]) + ' تأخر كثير — كمّلنا، ويلحقنا لما يجهز', 6000);
      goTogether(AHEAD_PLAY);
    }
    say(L.hold && waiting.length ? holdText(waiting) : null);
    /* paused: once the picture settled, its very place (a pause lands a frame or two after it was asked) */
    var p = placeNow();
    if (!L.playing || L.hold) {
      if (p && L.sentPos != null && Math.abs(p.pos - L.sentPos) > 0.01 && !S.seeking()) { L.seq++; if (L.hold) L.holdSeq = L.seq; leadState(false); return; }
    }
    if (others && now() - (L.lastSent || 0) > (L.playing && !L.hold ? HB_MS : 5000)) leadState(true);
  }
  /* the leader's own keys (player.js, desktop.js). true: this play is started here, at the moment set for everyone */
  function leadUser(a) {
    if (!L || !L.item) return false;
    var S = sync();
    /* the player says it a moment later (Windows: on its next report): not a pause or a play of something else */
    selfUntil = now() + 1500;
    if (a === 'pause') {
      clearTimeout(L.startTimer);
      L.playing = false; L.hold = false; L.startAt = 0; L.stall = false;
      L.seq++;
      leadState(false);
      return false;
    }
    if (a === 'play') {
      if (L.hold) waitingFor().forEach(function (m) { L.skip[m.id] = 1; }); /* pressed while waiting: on without them */
      if (!friends().length || !S || !S.active()) { L.playing = true; L.hold = false; L.seq++; setTimeout(function () { leadState(false); }, 50); return false; }
      goTogether(AHEAD_PLAY);
      return true;
    }
    if (a === 'seek') {
      clearTimeout(L.startTimer);
      L.startAt = 0;
      L.seq++;
      /* the new place once the jump is made */
      setTimeout(function () { if (L) leadState(false); }, 120);
      return false;
    }
    return false;
  }

  /* ---------- following ---------- */
  function following() { return !!(R && !R.isLead && M && M.item && M.phase !== 'off' && M.phase !== 'failed'); }
  function setPhase(p, why) {
    if (!M || (M.phase === p && (why || '') === (M.why || ''))) return;
    M.phase = p;
    M.why = why || '';
    report();
    changed();
  }
  function report() {
    if (!M || !R || R.isLead) return;
    var p = placeNow();
    send({ t: 'report', seq: M.state ? M.state.seq : 0, phase: M.phase, why: M.why || '', pos: p ? round3(p.pos) : 0, at: p ? Math.round(toServer(p.at)) : 0,
      d: M.lastD != null ? Math.round(M.lastD * 1000) : null, rate: M.rate });
    M.lastReport = now();
  }
  function onState(s) {
    if (!M) M = { phase: 'idle', rate: 1, diffs: [] };
    var before = M.state;
    M.state = s;
    if (!before || before.seq !== s.seq) {
      M.diffs = [];
      if (M.playTimer && (!s.playing || s.stall)) { clearTimeout(M.playTimer); M.playTimer = 0; }
      if (before && before.playing && !s.playing && !s.hold && !s.stall && M.loaded && following()) CS.toast('وقّف صاحب الغرفة', 2500);
    }
    if (!s.item) {
      if (M.item && following()) { var S = sync(); if (S && S.active()) S.stop(); CS.toast('صاحب الغرفة طلع من الحلقة', 4000); }
      M.item = null;
      M.loaded = false;
      setPhase('idle');
      return;
    }
    if (!sameItem(s.item, M.item)) { openItem(s); return; }
    apply();
  }
  function openItem(s) {
    var it = s.item, my = M.openSeq = (M.openSeq || 0) + 1;
    M.item = it;
    M.loaded = false;
    M.rate = 1;
    setPhase('loading');
    CS.toast('صاحب الغرفة يشغّل ' + it.meta.name + (it.meta.type === 'series' && it.video.season != null ? ' · ' + CS.epLabel(it.video.season, it.video.episode) : ''), 4000);
    CS.addons.meta(it.meta.type, it.meta.id).then(null, function () { return null; }).then(function (meta) {
      if (!M || M.openSeq !== my) return null;
      meta = meta || { id: it.meta.id, type: it.meta.type, name: it.meta.name, poster: it.meta.poster, videos: [] };
      var video = (meta.videos || []).filter(function (v) { return v.id === it.video.id; })[0] || it.video;
      return Promise.all([CS.addons.streams(meta.type, video.id), CS.session.audioWanted(meta)]).then(function (got) {
        if (!M || M.openSeq !== my) return;
        var list = CS.streams.order(got[0], true, got[1].list);
        var pick = findSame(list, it.file);
        if (!pick || !CS.streams.playUrl(pick)) {
          CS.log('together: the leader\'s file is not among', list.length, 'sources', it.file.name);
          CS.toast('ما لقينا نفس ملف صاحب الغرفة في مصادرك — تأكد إن عندك نفس الإضافة (Torrentio مع TorBox) وإنها ما تخفي ملفات مثل 4K', 10000, 'error');
          setPhase('failed', 'nofile');
          return;
        }
        CS.log('together: same file', pick.addonName, (pick.file || '').slice(0, 70));
        var st = M.state, at = st.playing && !st.stall ? st.pos + Math.max(0, serverNow() - st.at) / 1000 : st.pos;
        M.opening = true; /* the video on before it is left on the way: not a leaving */
        sync().open(meta, video, pick, { resume: Math.max(0, at), together: 'follow' });
      });
    }).then(null, function (e) {
      if (!M || M.openSeq !== my) return;
      CS.log('together: could not open', e && e.message);
      setPhase('failed', 'error');
    });
  }
  function schedulePlay(s) {
    if (M.playTimer || M.playSeq === s.seq) return;
    M.playSeq = s.seq;
    M.playTimer = setTimeout(function () {
      M.playTimer = 0;
      var S = sync(), st = M && M.state;
      if (!S || !S.active() || !st || st.seq !== s.seq || !st.playing || st.stall) return;
      selfAct(function () { S.play(); });
      setPhase('playing');
    }, Math.max(0, toLocal(s.at) - now()));
  }
  function apply() {
    var S = sync(), s = M && M.state;
    if (!s || !s.item || !M.loaded || !S || !S.active() || M.phase === 'off' || M.phase === 'failed') return;
    var p = S.now();
    if (!p) return;
    var tNow = serverNow(), playing = s.playing && !s.stall;
    if (!playing || tNow < s.at) {
      /* stand at the leader's place (a start set ahead begins on its moment) */
      if (!S.paused()) selfAct(function () { S.pause(); });
      if (M.rate !== 1) { M.rate = 1; S.setRate(1); }
      if (Math.abs(p.pos - s.pos) > 0.02 && M.alignSeq !== s.seq) { M.alignSeq = s.seq; S.seek(s.pos); }
      var ready = S.ready() && !S.seeking() && Math.abs(p.pos - s.pos) < 0.15;
      setPhase(ready ? 'ready' : 'loading');
      if (playing && ready) schedulePlay(s);
      return;
    }
    var target = s.pos + (toServer(p.at) - s.at) / 1000;
    if (S.paused()) {
      if (M.playTimer) return;
      /* the leader plays on and this one is off from it (it came in late): to its place first, while still paused */
      if (Math.abs(p.pos - target) > 0.4) {
        if (M.jumpSeq !== s.seq || !S.seeking() && Math.abs(p.pos - target) > 3) { M.jumpSeq = s.seq; S.seek(target + 0.3); }
        setPhase('loading');
        return;
      }
      if (S.seeking() || !S.ready()) { setPhase('loading'); return; }
      selfAct(function () { S.play(); });
      setPhase('playing');
      return;
    }
    if (S.buffering()) { setPhase('stalled'); M.diffs = []; return; }
    setPhase('playing');
    steer(S, p, target);
  }
  function steer(S, p, target) {
    var d = p.pos - target - (+CS.settings.togetherAdjust || 0) / 1000;
    M.diffs.push(d);
    while (M.diffs.length > 5) M.diffs.shift();
    if (M.diffs.length < 3) return;
    var dm = median(M.diffs);
    M.lastD = dm;
    if (Math.abs(dm) > FAR) {
      CS.log('together: ' + Math.round(dm * 1000) + ' ms off, to the leader\'s place');
      M.diffs = [];
      if (M.rate !== 1) { M.rate = 1; S.setRate(1); }
      S.seek(target + (now() - p.at) / 1000 + 0.3);
      return;
    }
    var r = rateFor(dm, M.rate);
    if (r !== M.rate && (r === 1 || Math.abs(r - M.rate) >= 0.002)) { M.rate = r; S.setRate(r); }
  }
  function followTick() {
    if (!M || !M.item) return;
    apply();
    if (now() - (M.lastReport || 0) > 1000) report();
  }

  function tick() {
    if (!R) return;
    if (R.isLead) leadTick(); else followTick();
  }

  CS.together = {
    /* the screens (views.js) */
    status: function () {
      if (!R) return null;
      return { code: R.code, lead: R.isLead == null ? !!R.key : R.isLead, open: !!R.open, members: R.members || [], me: R.id,
        phase: M ? M.phase : '', why: M ? M.why : '', item: (L && L.item) || (M && M.item) || null, rtt: clock.rtt, d: M ? M.lastD : null,
        reports: L ? L.reports : {} };
    },
    onChange: function (f) { changeFns.push(f); return function () { changeFns = changeFns.filter(function (x) { return x !== f; }); }; },
    /* a new room, led from here -> its code */
    create: function () {
      if (!hub()) return Promise.reject(new Error('no hub'));
      return ask('/room', 'POST').then(function (r) {
        var j = r.j || {};
        if (r.status !== 200 || !/^\d{6}$/.test(j.code || '') || !j.key) throw new Error('no room (' + r.status + ')');
        start(j.code, j.key);
        return j.code;
      });
    },
    /* into a friend's room by its six digits */
    join: function (code) {
      if (!/^\d{6}$/.test(code || '')) return Promise.reject(new Error('bad code'));
      return ask('/room/' + code).then(function (r) {
        if (r.status === 404) { var err = new Error('no room'); err.noRoom = true; throw err; }
        if (r.status !== 426) throw new Error('no answer (' + r.status + ')');
        start(code, '');
      });
    },
    leave: function () { leave(false); },
    /* back into the video the leader is on, after leaving it */
    rejoin: function () { if (M && M.state && M.state.item) { M.item = null; M.phase = 'idle'; onState(M.state); } },
    /* the players (player.js, desktop.js) */
    leading: function () { return !!(R && L && (R.isLead || (R.key && R.isLead == null))); },
    following: following,
    /* the keys for play, pause and jumps do nothing for a friend: the leader's own are what count */
    locked: function () { return following() && !!M.loaded; },
    /* a video is starting. true (the leader, with friends in the room): it starts paused and waits for them */
    onPlayStart: function (meta, video, stream, opts) {
      if (!R) return false;
      opts = opts || {};
      if (R.isLead || (R.key && R.isLead == null)) {
        if (!L) L = { item: null, seq: 1, playing: false, reports: {}, skip: {} };
        clearTimeout(L.nullTimer);
        clearTimeout(L.startTimer);
        L.item = itemOf(meta, video, stream);
        L.seq++;
        L.itemSeq = L.holdSeq = L.seq;
        L.itemAt = now();
        L.playing = true;
        L.stall = false;
        L.startAt = 0;
        L.skip = {};
        L.hold = friends().length > 0;
        L.holdSince = now();
        L.holdPos = opts.resume || 0;
        leadState(false);
        return L.hold;
      }
      if (!M) return false;
      if (opts.together === 'follow') { M.opening = false; M.loaded = false; return true; }
      /* the friend chose something else himself: he is out of the leader's video until he comes back to it */
      setPhase('off');
      return false;
    },
    /* the file is open in the player (a friend's: now it can stand at the leader's place) */
    onLoaded: function () { if (M && M.item && M.phase !== 'off') { M.loaded = true; apply(); } },
    /* the video is left (Back, the end, an error). The leader: the friends close theirs too, unless another starts at once */
    onLeave: function (failed) {
      if (!R) return;
      if (R.isLead && L) {
        clearTimeout(L.nullTimer);
        var me = L;
        L.nullTimer = setTimeout(function () { if (L === me) { me.item = null; me.seq++; leadState(false); say(null); } }, 2500);
        return;
      }
      if (M && M.item) {
        if (M.opening) return;
        M.loaded = false;
        if (M.rate !== 1) M.rate = 1;
        if (failed) setPhase('failed', 'error');
        else if (M.phase !== 'failed') setPhase('off'); /* a failure said first stays what the leader hears */
      }
    },
    /* the leader's own keys: 'pause' | 'play' | 'seek'. true: the play is started by this module, at the moment set for all */
    userAct: function (a) {
      if (R && R.isLead) return leadUser(a);
      return false;
    },
    /* a start that may come back after a restart (main.js) */
    resume: function () {
      var r = CS.settings.room;
      if (R) return;
      if (!r || !/^\d{6}$/.test(r.code || '') || !hub()) return;
      if (Date.now() - (r.at || 0) > KEEP_MS) { CS.settings.room = null; CS.saveSettings(); return; }
      start(r.code, r.key || '');
    },
    /* for the checks (tools/test.js) */
    _: { bestSample: bestSample, rateFor: rateFor, findSame: findSame, fileOf: fileOf, sameItem: sameItem, itemOf: itemOf, median: median }
  };
})();
