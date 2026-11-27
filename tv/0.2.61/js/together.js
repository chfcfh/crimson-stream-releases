/*
 * Crimson Stream — Proprietary & Confidential
 * Copyright (c) 2026 محمد. All rights reserved.
 * Unauthorized copying, sharing or use of this file, by any means, is strictly prohibited.
 */
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
  /* a start set this far ahead (and the slowest player's start delay on top), so it happens at the same moment everywhere */
  var AHEAD_HOLD = 400, AHEAD_PLAY = 400, AHEAD_MAX = 1800;
  var TRIP_SPARE = 150;       /* to spare on a start's word reaching a friend (a trip is its shortest ping's, the rest varies) */
  var SAY_AFTER = 1000;      /* a wait shorter than this says nothing: after a jump it looks like the jump itself */
  var LAG_MAX = 0.8;          /* a player's own start delay (play asked -> picture moving), learnt at each start: it plays that much early */
  var RESYNC = 0.12;          /* a TV this far from the leader while playing (it cannot be steered): one short stop, and all start again together */
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
  /* a player that can play a little faster or slower without a hitch: the PC's mpv and a browser's video. The TV's own player
     cannot (a friend's TV following a PC stuttered all through an episode, 2026-11-15): its speed is never touched, and a leader
     that can steer keeps time with it instead (leadSteer) */
  function steers(k) { return k === 'pc' || k === 'web'; }
  /* the profile's own name; one never named (the main one's «الرئيسي») says nothing about who it is */
  function myName() {
    try { var p = CS.profiles && CS.profiles.get(CS.profiles.current()); return p && p.name ? String(p.name).slice(0, 24) : ''; } catch (e) { return ''; }
  }
  var KIND_NAME = { tv: 'التلفزيون', pc: 'الكمبيوتر', phone: 'الجوال', web: 'المتصفح' };
  function nameOf(m) { return m && m.name ? m.name : 'صديقك'; }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[b.length >> 1] : 0; }
  /* this device's start delay (seconds), learnt and kept: a start is asked for that much before its moment. Each TV takes its own
     time to get going, and that difference would stay for a whole episode (a TV cannot be steered) */
  function lagNow() { return Math.max(0, Math.min(LAG_MAX, (+CS.settings.togetherLag || 0) / 1000)); }
  function learnLag(late, used) {
    var seen = Math.max(0, Math.min(LAG_MAX, used + late)), had = +CS.settings.togetherLagN || 0;
    var next = had ? (lagNow() * 2 + seen) / 3 : seen; /* the first start says it all; later ones are weighed in */
    CS.settings.togetherLag = Math.round(next * 1000);
    CS.settings.togetherLagN = had + 1;
    CS.saveSettings();
    log('start delay ' + Math.round(seen * 1000) + ' ms this time, ' + Math.round(next * 1000) + ' ms kept');
    return next;
  }
  /* the room's lines, also kept across a restart (the app's own log is in memory only, and a room's was gone by the time it was
     asked about, 2026-11-17): the last 300, dated, in localStorage 'cs.roomlog' */
  var LOG_KEY = 'cs.roomlog';
  function log() {
    var args = Array.prototype.slice.call(arguments);
    CS.log.apply(CS, ['together:'].concat(args));
    try {
      var text = args.map(function (a) { return typeof a === 'string' ? a : JSON.stringify(a); }).join(' ').replace(/https?:\/\/[^\s"')]+/g, '…');
      var kept = (localStorage.getItem(LOG_KEY) || '').split('\n').filter(Boolean);
      kept.push(new Date().toISOString().slice(0, 23) + ' ' + text);
      localStorage.setItem(LOG_KEY, kept.slice(-300).join('\n'));
    } catch (e) { /* storage full or off: the memory log still has it */ }
  }
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
    log('room ' + code + (key ? ', leading' : ', following') + ' from the ' + kind());
    connect();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, TICK);
    changed();
  }
  /* the room ended or could not be reached again: the player goes on by itself */
  function gone(why) {
    if (!R) return;
    log('out of the room: ' + why);
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
    var S = sync();
    if (M) { clearTimeout(M.playTimer); if (S && M.rate !== 1 && S.active()) S.setRate(1); if (S && S.unlock) S.unlock(); }
    if (L) { clearTimeout(L.nullTimer); if (S && L.rate && L.rate !== 1 && S.active()) S.setRate(1); }
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
    if (L.aim != null && now() - L.aimAt < 2000) m.aim = L.aim;
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
    r.got = now();
    L.reports[r.from] = r;
    if (r.phase === 'ready' || r.phase === 'playing') delete L.skip[r.from];
    if (L.hold && L.readyAt && r.phase === 'ready' && r.seq >= (L.holdSeq || 0) && !L.readyAt[r.from]) L.readyAt[r.from] = now();
    if (!was || was.phase !== r.phase) changed();
    if (r.phase === 'failed' && (!was || was.phase !== 'failed')) {
      var m = (R.members || []).filter(function (x) { return x.id === r.from; })[0];
      CS.toast(nameOf(m) + (r.why === 'nofile' ? ' ما لقى نفس الملف في مصادره — تأكد إن عنده نفس الإضافة وإن ملفاتها ما تنخفى (مثل 4K)' : ' ما قدر يشغّل نفس الملف'), 9000);
    }
    if (r.phase === 'off' && was && was.phase !== 'off') CS.toast(nameOf((R.members || []).filter(function (x) { return x.id === r.from; })[0]) + ' طلع من الحلقة', 4000);
    /* the leader waiting, and this one now stands ready: on at once, not on the next round */
    if (L.hold && r.phase === 'ready' && (!was || was.phase !== 'ready')) leadTick();
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
  /* the leader stops everyone and waits (why: start, seek, play, loading, retime). When all go on, how long each took is logged */
  function holdStart(why) {
    L.hold = true;
    L.holdSince = now();
    L.holdWhy = why;
    L.readyAt = {};
    L.selfReadyAt = 0;
  }
  function holdDone() {
    var t0 = L.holdSince || now();
    function secs(t) { return ((t - t0) / 1000).toFixed(1) + ' s'; }
    var each = friends().map(function (m) {
      var r = L.reports[m.id], at = L.readyAt && L.readyAt[m.id];
      return nameOf(m) + ' (' + m.kind + ') ' + (at ? 'ready in ' + secs(at) : 'not ready' + (r ? ' (' + r.phase + ')' : '')) +
        (r && r.ahead != null ? ', ' + r.ahead + ' s loaded ahead' : '') + (r && r.mbps != null ? ', ' + r.mbps + ' Mbit/s' : '') + (r && r.ver ? ', ' + r.ver : '');
    });
    log('waited ' + secs(now()) + ' (' + (L.holdWhy || 'hold') + '): here ready in ' + (L.selfReadyAt ? secs(L.selfReadyAt) : '-') + (each.length ? ', ' + each.join(', ') : ''));
  }
  function holdOn(waiting) {
    if (waiting.length) log('waiting for', waiting.map(function (m) { var r = L.reports[m.id]; return nameOf(m) + ' (' + m.kind + ', ' + (r ? r.phase + (r.why ? ' ' + r.why : '') : 'no word yet') + ')'; }).join(', '));
    holdStart(waiting.length ? 'loading' : 'retime');
    var p = placeNow();
    L.holdPos = p ? p.pos : L.holdPos || 0;
    selfAct(function () { sync().pause(); });
    L.seq++;
    L.holdSeq = L.seq;
    leadState(false);
  }
  /* a TV in the room (the leader's own, or a friend's): it cannot be steered, so its start has to be right */
  function tvInRoom() { return !steers(kind()) || friends().some(function (m) { return !steers(m.kind); }); }
  /* how far ahead a start is set: this player's own start delay (it asks for its start that early), and for each friend the
     word's trip to it (half of each one's shortest ping, through the room) plus its start delay, with a little to spare. A
     fixed 400 ms plus the slowest delay made every press of play wait 0.65 s with a TV in the room; this is the TV's own
     start delay and little more. A friend whose trip is not known yet gets the old fixed margin */
  function aheadMs(base) {
    var need = lagNow() * 1000, mine = clock.rtt != null ? clock.rtt / 2 : null;
    friends().forEach(function (m) {
      var r = L.reports[m.id], lag = r ? (+r.lag || 0) * 1000 : 0;
      need = Math.max(need, r && mine != null && r.rtt != null ? mine + r.rtt / 2 + lag + TRIP_SPARE : base + Math.max(lag, lagNow() * 1000));
    });
    return Math.min(AHEAD_MAX, need);
  }
  /* everyone is ready: on together, a moment ahead. This player asks for its start early by its own delay, and learns that
     delay again two seconds in */
  function goTogether(base) {
    var S = sync(), p = placeNow();
    if (L.hold) holdDone();
    L.hold = false;
    L.stall = false;
    L.playing = true;
    L.resyncing = false;
    L.startPos = p ? p.pos : L.holdPos || 0;
    L.startAt = Math.round(serverNow() + aheadMs(base));
    L.seq++;
    leadState(false);
    var me = L, at = L.startAt, lag = lagNow();
    clearTimeout(L.startTimer);
    L.startTimer = setTimeout(function () {
      if (L !== me || me.startAt !== at) return;
      selfAct(function () { S.play(); });
      me.learn = { t: now(), pos: me.startPos, at0: at, used: lag, errs: [] };
      setTimeout(function () { if (L === me && me.startAt === at) { me.startAt = 0; leadState(true); } }, 400 + lag * 1000);
    }, Math.max(0, toLocal(at) - now() - lag * 1000));
  }
  function holdText(waiting) {
    var r = waiting[0] && L.reports[waiting[0].id];
    if (r && r.why === 'resync') return 'نضبط التوقيت مع ' + nameOf(waiting[0]) + '…';
    return 'ننتظر ' + nameOf(waiting[0]) + (r && r.phase === 'stalled' ? ' — النت عنده يحمّل' : ' يجهز…');
  }
  /* two seconds into a start set for everyone: how late (+) or early (-) this player really started, from where it stands now
     against where the start put it. Learnt for next time; a TV in the room off by more than 60 ms has the room start once more */
  function leadLearn(S) {
    var l = L.learn;
    if (!l || L.startAt || now() - l.t < 2000) return;
    var p = L.playing && !L.hold && !L.stall && !S.paused() && !S.buffering() && (L.rate || 1) === 1 ? placeNow() : null;
    if (!p) { L.learn = null; return; }
    l.errs.push(l.pos + (toServer(p.at) - l.at0) / 1000 - p.pos);
    if (l.errs.length < 3) return;
    L.learn = null;
    var late = median(l.errs);
    learnLag(late, l.used);
    if (Math.abs(late) > 0.06 && tvInRoom() && (L.resyncAt == null || now() - L.resyncAt > 120000)) {
      L.resync = true;
      L.resyncAt = now();
      log('this one started ' + Math.round(late * 1000) + ' ms off, once more together');
    }
  }
  /* the friend whose player is not steered (a TV), playing this video and heard from lately: it keeps the time. Only for a
     leader that can steer itself */
  function keeper() {
    if (!steers(kind())) return null;
    var list = friends().filter(function (m) { return !steers(m.kind); });
    for (var i = 0; i < list.length; i++) {
      var r = L.reports[list[i].id];
      if (r && r.phase === 'playing' && r.seq >= L.itemSeq && now() - (r.got || 0) < 3000) return r;
    }
    return null;
  }
  /* a leader on a PC with a TV following: the TV plays on as it is, and the leader plays a little faster or slower to stay with
     it (as a friend's PC stays with a TV that leads). The others follow the leader, so all meet on the TV's time. The TV's
     own nudge (togetherAdjust, «قدّمني») comes in its reports */
  function leadSteer(S) {
    var r = L.playing && !L.hold && !L.stall && !L.startAt && !S.paused() && !S.buffering() ? keeper() : null;
    var p = r && placeNow();
    var was = L.rate || 1;
    if (!p) {
      L.diffs = [];
      if (was !== 1) { L.rate = 1; S.setRate(1); log('back to normal speed'); }
      return;
    }
    var tv = r.pos + (toServer(p.at) - r.at) / 1000; /* where the TV is at the moment this player's place was taken */
    L.diffs = L.diffs || [];
    L.diffs.push(p.pos - tv + (+r.adj || 0) / 1000);
    while (L.diffs.length > 5) L.diffs.shift();
    if (L.diffs.length < 3) return;
    var dm = median(L.diffs);
    L.lastD = dm;
    /* far off: the TV goes to the leader's place by itself (one jump); nothing to steer meanwhile */
    if (Math.abs(dm) > FAR) { if (was !== 1) { L.rate = 1; S.setRate(1); } return; }
    var rate = rateFor(dm, was);
    if (rate !== was && (rate === 1 || Math.abs(rate - was) >= 0.002)) {
      if (was === 1) log('keeping time with the TV, ' + Math.round(dm * 1000) + ' ms off');
      L.rate = rate;
      S.setRate(rate);
    }
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
    /* its own stop to load: the others stand at its place, and go on when it does. A wait under half a second is let pass: it
       stopping everyone would be a cut of its own */
    var buf = L.playing && !L.hold && !L.startAt && S.buffering();
    if (!buf) L.bufSince = 0; else if (!L.bufSince) L.bufSince = now();
    var stall = buf && (!!L.stall || now() - L.bufSince > 500);
    if (stall !== !!L.stall) { L.stall = stall; L.seq++; leadState(false); log((stall ? 'loading here, the others wait' : 'on again')); }
    leadLearn(S);
    /* this one started off while a TV is in the room: one short stop, and all start again from one place */
    if (L.resync && L.playing && !L.hold && !L.startAt && !L.stall) { L.resync = false; L.resyncing = true; holdOn([]); }
    var waiting = waitingFor();
    if (L.hold && !L.selfReadyAt && S.ready() && !S.seeking()) L.selfReadyAt = now();
    if (L.playing && !L.hold && !L.startAt && waiting.length) holdOn(waiting);
    else if (L.hold && !waiting.length && S.ready() && !S.seeking()) goTogether(AHEAD_HOLD);
    else if (L.hold && now() - L.holdSince > MAX_HOLD && S.ready()) {
      waiting.forEach(function (m) { L.skip[m.id] = 1; });
      CS.toast(nameOf(waiting[0]) + ' تأخر كثير — كمّلنا، ويلحقنا لما يجهز', 6000);
      goTogether(AHEAD_PLAY);
    }
    var saying = L.hold && now() - (L.holdSince || 0) > SAY_AFTER;
    say(saying && waiting.length ? holdText(waiting) : saying && L.resyncing ? 'نضبط التوقيت بينكم…' : null);
    leadSteer(S);
    /* paused: once the picture settled, its very place (a pause lands a frame or two after it was asked) */
    var p = placeNow();
    if (!L.playing || L.hold) {
      if (p && L.sentPos != null && Math.abs(p.pos - L.sentPos) > 0.01 && !S.seeking()) { L.seq++; if (L.hold) L.holdSeq = L.seq; leadState(false); return; }
    }
    if (others && now() - (L.lastSent || 0) > (L.playing && !L.hold ? HB_MS : 5000)) leadState(true);
  }
  /* the leader's own keys (player.js, desktop.js). true: this play is started here, at the moment set for everyone */
  function leadUser(a, t) {
    if (!L || !L.item) return false;
    var S = sync();
    /* the TV's arrows: where its jump is heading while the presses go on (it is made 650 ms after the last one). Said now, a
       friend's player starts loading that place before the jump, and is often ready by the time it lands */
    if (a === 'aim') {
      if (friends().length && S && S.active() && t >= 0) { L.aim = round3(t); L.aimAt = now(); leadState(true); }
      return false;
    }
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
      /* someone not standing ready yet (a TV still moving to its place): the start waits for them, as after a stop to load */
      if (!L.hold && waitingFor().length) { L.playing = true; holdStart('play'); L.holdSeq = L.seq; leadState(false); return true; }
      goTogether(AHEAD_PLAY);
      return true;
    }
    if (a === 'seek') {
      clearTimeout(L.startTimer);
      L.startAt = 0;
      L.aim = null;
      L.seq++;
      /* playing with friends: everyone stops at the new place and all go on together once each is ready there, one load each.
         Played on, a friend jumped to where the leader had got to, stopped to load, and jumped again to where the leader then
         waited for him: two loads, a long wait on a slow line (2026-11-17) */
      if ((L.playing || L.hold) && friends().length && S && S.active()) {
        L.playing = true;
        L.stall = false;
        L.resyncing = false;
        holdStart('seek');
        L.holdSeq = L.seq;
        selfAct(function () { S.pause(); });
      }
      /* the new place once the jump is made */
      setTimeout(function () {
        if (!L) return;
        if (L.hold) { var p = placeNow(); if (p) L.holdPos = p.pos; L.holdSeq = L.seq; }
        leadState(false);
      }, 120);
      return false;
    }
    return false;
  }

  /* ---------- following ---------- */
  function following() { return !!(R && !R.isLead && M && M.item && M.phase !== 'off' && M.phase !== 'failed'); }
  function setPhase(p, why) {
    if (!M || (M.phase === p && (why || '') === (M.why || ''))) return;
    if (p === 'stalled' || p === 'failed' || M.phase === 'stalled') log(M.phase + ' -> ' + p + (why ? ' (' + why + ')' : ''));
    if (p === 'loading' && M.phase !== 'loading') M.loadingSince = now();
    if (p === 'ready' && M.phase === 'loading' && M.loadingSince) {
      var S = sync(), ahead = S && S.cached ? S.cached() : null;
      log('ready here in ' + ((now() - M.loadingSince) / 1000).toFixed(1) + ' s' + (ahead != null ? ', ' + ahead.toFixed(1) + ' s loaded ahead' : ''));
    }
    M.phase = p;
    M.why = why || '';
    report();
    changed();
  }
  /* where this player is, for the leader (adj: this friend's own nudge, which a leader keeping time with a TV applies) */
  function report() {
    if (!M || !R || R.isLead) return;
    var p = placeNow(), S = sync(), ahead = p && S.cached ? S.cached() : null;
    send({ t: 'report', seq: M.state ? M.state.seq : 0, phase: M.phase, why: M.why || '', pos: p ? round3(p.pos) : 0, at: p ? Math.round(toServer(p.at)) : 0,
      d: M.lastD != null ? Math.round(M.lastD * 1000) : null, rate: M.rate, adj: +CS.settings.togetherAdjust || 0, lag: round3(lagNow()),
      ahead: ahead == null ? null : Math.round(ahead * 10) / 10, rtt: clock.rtt == null ? null : Math.round(clock.rtt),
      /* for the leader's eyes: how fast this one's line brings the video (a PC's ⚡), and which copy of the app it runs */
      mbps: S && S.speed ? S.speed() : null, ver: CS.version || '' });
    M.lastReport = now();
  }
  function onState(s) {
    if (!M) M = { phase: 'idle', rate: 1, diffs: [] };
    var before = M.state;
    M.state = s;
    if (!before || before.seq !== s.seq) {
      M.aim = null;
      M.diffs = [];
      if (!s.playing || s.stall) M.learn = null; /* a start broken off says nothing about this player's start delay */
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
    var said = M.lastReport || 0;
    if (s.aim != null && M.loaded && following() && (!M.aim || M.aim.pos !== s.aim)) aimAt(s);
    else apply();
    /* a new word from the leader is answered at once, not on the next round (a second on a PC): a leader waiting for
       everyone to stand at its place hears it sooner */
    if ((!before || before.seq !== s.seq) && (M.lastReport || 0) === said) report();
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
          log('the leader\'s file is not among', list.length, 'sources', it.file.name);
          CS.toast('ما لقينا نفس ملف صاحب الغرفة في مصادرك — تأكد إن عندك نفس الإضافة (Torrentio مع TorBox) وإنها ما تخفي ملفات مثل 4K', 10000, 'error');
          setPhase('failed', 'nofile');
          return;
        }
        log('same file', pick.addonName, (pick.file || '').slice(0, 70));
        var st = M.state, at = st.playing && !st.stall ? st.pos + Math.max(0, serverNow() - st.at) / 1000 : st.pos;
        M.opening = true; /* the video on before it is left on the way: not a leaving */
        sync().open(meta, video, pick, { resume: Math.max(0, at), together: 'follow' });
      });
    }).then(null, function (e) {
      if (!M || M.openSeq !== my) return;
      log('could not open', e && e.message);
      setPhase('failed', 'error');
    });
  }
  /* the start set for everyone. Standing ahead of its place (want), this player starts that much later; behind, that much
     earlier; and early by its own start delay. Two seconds in it learns how late it really started */
  function schedulePlay(s, want) {
    if (M.playTimer || M.playSeq === s.seq) return;
    M.playSeq = s.seq;
    var S = sync(), p = S.now(), off = p ? p.pos - want : 0, lag = lagNow();
    var wait = toLocal(s.at) - now() + off * 1000 - lag * 1000;
    M.playTimer = setTimeout(function () {
      M.playTimer = 0;
      var st = M && M.state;
      if (!S || !S.active() || !st || st.seq !== s.seq || !st.playing || st.stall) return;
      selfAct(function () { S.play(); });
      M.startedAt = now();
      M.learn = { t: now(), want: want, at0: s.at, used: lag, missed: Math.max(0, -wait) / 1000, errs: [] };
      setPhase('playing');
    }, Math.max(0, wait));
  }
  /* the leader's TV is about to jump there (its arrows): stand there now, paused, and load it. The leader does not wait for a
     friend aiming; what it says next (the jump made: a new word) takes over, or after 3 s this goes back to following */
  function aimAt(s) {
    var S = sync(), p = S && S.active() ? S.now() : null;
    if (!p) return;
    M.aim = { pos: s.aim, seq: s.seq, until: now() + 3000 };
    clearTimeout(M.playTimer);
    M.playTimer = 0;
    if (!S.paused()) selfAct(function () { S.pause(); });
    if (M.rate !== 1) { M.rate = 1; S.setRate(1); }
    var off = p.pos - s.aim;
    if (steers(kind()) ? Math.abs(off) > 0.02 : off > 1.0 || off < -0.25) S.seek(s.aim);
    setPhase('aim');
  }
  function apply() {
    var S = sync(), s = M && M.state;
    if (!s || !s.item || !M.loaded || !S || !S.active() || M.phase === 'off' || M.phase === 'failed') return;
    var p = S.now();
    if (!p) return;
    if (M.aim) { if (M.aim.seq === s.seq && now() < M.aim.until) return; M.aim = null; }
    var tNow = serverNow(), playing = s.playing && !s.stall;
    /* started for this very start, early by its own start delay, before the moment set for all: left to run. Stopped and put
       back, it looked like loading to the leader, who stopped everyone again, and each early start taught a longer delay */
    if (playing && tNow < s.at && M.playSeq === s.seq && !M.playTimer && !S.paused()) return;
    if (!playing || tNow < s.at) {
      /* stand at the leader's place (a start set ahead begins on its moment). A short stop asked for is under way */
      M.resync = false;
      if (!S.paused()) selfAct(function () { S.pause(); });
      if (M.rate !== 1) { M.rate = 1; S.setRate(1); }
      /* a PC goes to the very place. A TV jumps only when far or well behind (its jumps are slow and may land a little off), and
         starts early or late by how far it stands instead (schedulePlay); its own nudge is where it stands */
      var tv = !steers(kind()), want = s.pos + (tv ? (+CS.settings.togetherAdjust || 0) / 1000 : 0), off = p.pos - want;
      var jump = tv ? off > 1.0 || off < -0.25 : Math.abs(off) > 0.02;
      if (jump && M.alignSeq !== s.seq) { M.alignSeq = s.seq; S.seek(want); }
      /* once jumped for this place, where it landed is where it starts from (the start's timing makes up the rest) */
      var ready = S.ready() && !S.seeking() && (tv ? Math.abs(off) < 3 && (!jump || M.alignSeq === s.seq) : Math.abs(off) < 0.15);
      setPhase(ready ? 'ready' : 'loading');
      if (playing && ready) schedulePlay(s, want);
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
      M.startedAt = now();
      setPhase('playing');
      return;
    }
    /* asked for a short stop to start again together (a TV that started off, or drifted): it plays on until the leader stops */
    if (M.resync) { setPhase('loading', 'resync'); return; }
    /* a wait for data under half a second is let pass: it stopping the room would be a cut of its own */
    if (S.buffering()) {
      if (!M.bufSince) M.bufSince = now();
      if (now() - M.bufSince > 500) { setPhase('stalled'); M.diffs = []; M.learn = null; }
      return;
    }
    M.bufSince = 0;
    setPhase('playing');
    steer(S, p, target);
  }
  /* how late (+) this player really started, against where the start put it (a PC in its first second, before any steering;
     a TV two seconds in, once its clock has settled). Learnt for next time; a TV off by more than 60 ms asks for one more start */
  function followLearn(p) {
    var l = M.learn;
    if (!l || now() - l.t < (steers(kind()) ? 500 : 2000)) return false;
    l.errs.push(l.want + (toServer(p.at) - l.at0) / 1000 - p.pos);
    if (l.errs.length < 3) return true;
    M.learn = null;
    var late = median(l.errs) - l.missed;
    learnLag(late, l.used);
    if (!steers(kind()) && Math.abs(late) > 0.06) askResync('started ' + Math.round(late * 1000) + ' ms off');
    return false;
  }
  /* one short stop of the room, at most every two minutes */
  function askResync(why) {
    if (M.resync || (M.resyncAt != null && now() - M.resyncAt < 120000)) return;
    M.resync = true;
    M.resyncAt = now();
    log(why + ', once more together');
  }
  function steer(S, p, target) {
    var d = p.pos - target - (+CS.settings.togetherAdjust || 0) / 1000;
    M.diffs.push(d);
    while (M.diffs.length > 5) M.diffs.shift();
    if (M.learn) {
      var learning = followLearn(p);
      if (learning || (M.learn && steers(kind()))) return; /* a PC steers only once its start is learnt */
    }
    if (M.diffs.length < 3) return;
    var dm = median(M.diffs);
    M.lastD = dm;
    if (Math.abs(dm) > FAR) {
      log(Math.round(dm * 1000) + ' ms off, to the leader\'s place');
      M.diffs = [];
      if (M.rate !== 1) { M.rate = 1; S.setRate(1); }
      S.seek(target + (now() - p.at) / 1000 + 0.3);
      return;
    }
    if (!steers(kind())) {
      /* a TV plays on at its own speed (a PC that leads keeps time with it). Drifted far enough to be felt: one more start */
      if (!M.learn && now() - (M.startedAt || 0) > 10000 && Math.abs(dm) > RESYNC) askResync('drifted ' + Math.round(dm * 1000) + ' ms');
      return;
    }
    var r = rateFor(dm, M.rate);
    if (r !== M.rate && (r === 1 || Math.abs(r - M.rate) >= 0.002)) { M.rate = r; S.setRate(r); }
  }
  function followTick() {
    if (!M || !M.item) return;
    apply();
    /* a TV keeps the time for a leader that steers: it says where it is twice as often */
    if (now() - (M.lastReport || 0) > (steers(kind()) ? 1000 : 500)) report();
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
        L.rate = 1; /* a new video starts at its normal speed */
        L.diffs = [];
        L.learn = null;
        L.resync = L.resyncing = false;
        L.playing = true;
        L.stall = false;
        L.startAt = 0;
        L.skip = {};
        if (friends().length) holdStart('start'); else { L.hold = false; L.holdSince = now(); }
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
    /* the leader's own keys: 'pause' | 'play' | 'seek', and 'aim' (t: where the TV's arrows are heading). true: the play is started by this module, at the moment set for all */
    userAct: function (a, t) {
      if (R && R.isLead) return leadUser(a, t);
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
    _: { bestSample: bestSample, rateFor: rateFor, findSame: findSame, fileOf: fileOf, sameItem: sameItem, itemOf: itemOf, median: median, lagNow: lagNow, learnLag: learnLag, steers: steers }
  };
})();
