/* Goal replays (the owner, 2026-11-23: «اول ما البرنامج ينتبه انه فيه هدف يسجل اخر ٢٥ ثانية ويحفظها وتنمسح المقاطع بعد ٣ ايام من انتهاء
   المباراة»). When the match player (matchplay.js) shows a goal, the window that plays the stream (the PC's and the phone's, which keep its
   live pieces) saves the 25 seconds before what is on screen and 5 after, as one MPEG-TS file. Each replay is listed here with its match,
   scorer, minute and score; it is played by its id (CS.player.playReplay, desktop.js), and deleted three days after its match ended.
   The window's side (Speeder.cs, MainForm.cs, LiveData.kt, MainActivity.kt):
     page → host: {t:'replay-save', id, seconds, after, name} · {t:'replay-delete', id}
     host → page: {t:'replay-saved', id, path, url, secs, bytes} · {t:'replay-failed', id, why} · {t:'replay-deleted', id}
   The TV plays the stream itself and keeps no pieces: no replays there yet. */
(function () {
  var h = CS.h;
  var KEY = 'cs.replays', KEEP_DAYS = 3, MATCH_HOURS = 2.5, MOST_BYTES = 1.5e9;
  var native = !!(window.chrome && window.chrome.webview && window.chrome.webview.postMessage);

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function keep(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { CS.log('replays not kept', e.message); } }
  function host(m) { try { window.chrome.webview.postMessage(m); } catch (e) { CS.log('replay ask not sent', e.message); } }
  /* a replay goes three days after its match ended (its kick-off and two and a half hours, when its end is not known) */
  function expiry(r) { var end = Date.parse(r.match && r.match.end || '') || (Date.parse(r.match && r.match.at || '') || r.savedAt) + MATCH_HOURS * 3600e3; return end + KEEP_DAYS * 864e5; }
  function team(t) { return t ? { name: t.name || '', ar: t.ar || '', logo: t.logo || '', color: t.color || '', alt: t.alt || '' } : null; }
  function tn(t) { return t ? (t.ar || t.name || '') : ''; }

  /* the match player tells each goal as it shows on screen */
  function goal(cur, e, score) {
    if (!native || !cur || !cur.data || CS.settings.matchReplays === false) return;
    var d = cur.data, id = ('g' + d.id + '_' + String(e.min || '').replace(/\D/g, '') + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 64);
    var by = e.kind === 'own' ? (e.side === 'home' ? 'away' : 'home') : e.side;
    var list = load();
    list.push({ id: id, ok: false, savedAt: Date.now(), kind: e.kind, who: e.who || '', min: e.min || '', side: by, score: score,
      match: { id: d.id, at: d.at, league: d.league || '', home: team(d.home), away: team(d.away) } });
    keep(list);
    host({ t: 'replay-save', id: id, seconds: 25, after: 5, name: (e.who || 'هدف') + ' ' + (e.min || '') });
    CS.log('replay asked', id, e.who, e.min);
  }
  /* the window's answers */
  function onHost(e) {
    var m = e && e.data;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (x) { return; } }
    if (!m || !/^replay-/.test(m.t || '')) return;
    var list = load(), at = -1;
    list.forEach(function (r, i) { if (r.id === m.id) at = i; });
    if (m.t === 'replay-saved' && at >= 0) {
      list[at].ok = true; list[at].secs = m.secs || 0; list[at].bytes = m.bytes || 0;
      keep(list);
      CS.log('replay saved', m.id, m.secs + ' s', Math.round((m.bytes || 0) / 1e6) + ' MB');
      trim();
      if (CS.replays.changed) CS.replays.changed();
    } else if ((m.t === 'replay-failed' || m.t === 'replay-deleted') && at >= 0) {
      if (m.t === 'replay-failed') CS.log('replay not saved', m.id, m.why);
      list.splice(at, 1);
      keep(list);
    }
  }
  if (native) window.chrome.webview.addEventListener('message', onHost);

  function drop(r) { host({ t: 'replay-delete', id: r.id }); }
  /* three days after the match: gone. A replay never saved (the window was closed meanwhile): gone after a day */
  function sweep() {
    if (!native) return;
    var now = Date.now(), list = load(), left = [];
    list.forEach(function (r) {
      if (now > expiry(r) || (!r.ok && now - r.savedAt > 864e5)) drop(r);
      else left.push(r);
    });
    if (left.length !== list.length) { keep(left); CS.log('replays let go', list.length - left.length); }
  }
  /* about 1 MB a second of picture: past 1.5 GB in all, the oldest go first */
  function trim() {
    var list = load().sort(function (a, b) { return a.savedAt - b.savedAt; }), total = 0;
    list.forEach(function (r) { total += r.bytes || 0; });
    var out = [];
    while (total > MOST_BYTES && list.length > 1) { var r = list.shift(); total -= r.bytes || 0; out.push(r); drop(r); }
    if (out.length) keep(list);
  }
  /* the match's end, once known, sets when its replays go */
  function ended(matchId, at) {
    var list = load(), changed = false;
    list.forEach(function (r) { if (r.match && r.match.id === String(matchId) && !r.match.end) { r.match.end = at; changed = true; } });
    if (changed) keep(list);
  }
  function of(matchId) { return load().filter(function (r) { return r.ok && (!matchId || (r.match && r.match.id === String(matchId))); }).sort(function (a, b) { return a.savedAt - b.savedAt; }); }
  function playable() { return native && !!(CS.player && CS.player.playReplay); }
  function play(r, back) {
    if (!playable()) { CS.toast('الإعادة تشتغل من البرنامج في الكمبيوتر أو الجوال', 3500); return; }
    /* a live match on: the replay plays in its place, and the match comes back when it ends or Back is pressed */
    var was = CS.player.playing && CS.player.playing();
    var live = was && was.live ? { meta: was.meta, video: was.video, stream: was.stream } : null;
    CS.player.playReplay(r.id, 'إعادة: ' + (r.who || 'هدف') + ' ' + (r.min || ''), back || function () { if (live) CS.player.play(live.meta, live.video, live.stream); });
  }
  /* one replay as a row: the ball, the scorer, the minute, the score then, the side's colour */
  function row(r, back) {
    var t = r.side === 'away' ? r.match.away : r.match.home;
    var b = h('button.rp-row.f', { onclick: function () { play(r, back); } }, [
      h('span.rp-play', { html: CS.icon('play') }),
      h('span.rp-words', null, [h('b', { text: (r.who || 'هدف') + (t ? ' · ' + tn(t) : '') }), h('small', { text: [r.min, r.score ? tn(r.match.home) + ' ' + r.score[0] + ' - ' + r.score[1] + ' ' + tn(r.match.away) : '', r.secs ? r.secs + ' ثانية' : ''].filter(Boolean).join(' · ') })])
    ]);
    if (t && t.color) b.style.setProperty('--team', t.color);
    return b;
  }
  /* the sports world's match page: its replays, while they are kept */
  function section(matchId) {
    var list = of(matchId);
    if (!list.length) return null;
    var seg = h('section.sw-seg.rp-seg', null, [CS.sw ? CS.sw.title('إعادات الأهداف', 'تنحذف بعد 3 أيام من المباراة') : h('h2', { text: 'إعادات الأهداف' })]);
    var box = h('div.rp-list');
    list.forEach(function (r) { box.appendChild(row(r)); });
    seg.appendChild(box);
    return seg;
  }

  CS.replays = { goal: goal, ended: ended, of: of, row: row, play: play, section: section, sweep: sweep, supported: function () { return native; }, playable: playable, changed: null, _: { expiry: expiry } };
  /* a while after the app opens: the replays past their three days go */
  setTimeout(sweep, 15000);
})();
