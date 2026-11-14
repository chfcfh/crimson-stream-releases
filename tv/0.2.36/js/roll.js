/* The random pick: what is asked of crimson-hub (/cat/random) and the small decisions around it. The screen is in views.js (rollOptions, rollResult). */
(function () {
  var DEFAULTS = { source: 'all', kind: 'movie', country: '', form: 'any', genres: [], min: 0, era: '', short: false, skipSeen: true, then: 'card' };

  /* the viewer's choices as last left, with anything missing filled in */
  function choices() {
    var c = Object.assign({}, DEFAULTS, CS.settings.roll || {});
    c.genres = Array.isArray(c.genres) ? c.genres.slice() : [];
    return c;
  }

  /* "under an hour and a half" is about movies only */
  function shortApplies(c) { return c.kind === 'movie' || (c.kind === 'anime' && c.form === 'movie'); }

  /* the hub's address for these choices. The country is not asked for anime, the form only for anime */
  function query(c, count) {
    var p = ['kind=' + c.kind];
    if (c.kind === 'anime') p.push('form=' + (c.form || 'any'));
    else if (c.country) p.push('country=' + c.country);
    if (c.genres && c.genres.length) p.push('genres=' + c.genres.join(','));
    if (c.min) p.push('min=' + c.min);
    if (c.era) p.push('era=' + c.era);
    if (c.short && shortApplies(c)) p.push('short=1');
    if (count) p.push('count=1');
    return '/cat/random?' + p.join('&');
  }

  /* a stepper's next value: OK goes through them in turn and comes round again */
  function next(list, v) {
    var i = list.map(function (o) { return o[0]; }).indexOf(v);
    return list[(i + 1) % list.length][0];
  }

  /* "from my library": what was saved there, of the kind asked (anime cannot be told apart in the library, so it takes both),
     and when "seen" is left out, only what was never started */
  function libraryPicks(items, c) {
    return (items || []).filter(function (it) {
      if (!it || !it._id || (it.type !== 'movie' && it.type !== 'series')) return false;
      if (c.kind !== 'anime' && it.type !== c.kind) return false;
      var st = it.state || {};
      return !(c.skipSeen && (st.timeWatched > 0 || st.timeOffset > 0 || st.flaggedWatched > 0 || !!st.watched));
    }).map(function (it) { return { id: it._id, type: it.type, name: it.name || '', poster: it.poster || '' }; });
  }

  /* titles the viewer asked never to see again, newest first; a few hundred is plenty */
  function never(list, id) {
    return [id].concat((list || []).filter(function (x) { return x !== id; })).slice(0, 300);
  }

  /* a random episode of a series: a real one (no specials) that has already come out */
  function randomEpisode(meta, rnd, now) {
    var out = (meta.videos || []).filter(function (v) {
      if (!(v.season > 0)) return false;
      var t = v.released ? Date.parse(v.released) : NaN;
      return isNaN(t) || t <= now;
    });
    return out.length > 1 ? out[Math.floor(rnd() * out.length)] : null;
  }

  /* genres are chosen several at a time: a press adds or takes one away. "All" ('') clears them, and taking the last one away is "all" again */
  function toggleGenre(list, g) {
    if (!g) return [];
    var out = (list || []).slice(), i = out.indexOf(g);
    if (i >= 0) out.splice(i, 1); else out.push(g);
    return out;
  }

  /* watched, or kept in the library. One taken off the library without ever being played is not "seen" */
  function seen(id) {
    var it = CS.lib && CS.lib.get(id);
    if (!it) return false;
    var st = it.state || {};
    return !it.removed || st.timeWatched > 0 || st.timeOffset > 0 || !!st.watched || st.flaggedWatched > 0;
  }

  /* the titles of an answer worth trying: each once, none seen (when that is asked), none picked lately */
  function fresh(metas, isSeen, lately) {
    var skip = {};
    (lately || []).forEach(function (id) { skip[id] = 1; });
    return (metas || []).filter(function (m) {
      if (!m || !m.id || skip[m.id]) return false;
      skip[m.id] = 1;
      return !(isSeen && isSeen(m.id));
    });
  }

  /* the last five picks, newest first, so one passed by can be found again */
  function remember(list, m) {
    var small = { id: m.id, type: m.type, name: m.name || '', poster: m.poster || '' };
    return [small].concat((list || []).filter(function (x) { return x && x.id !== m.id; })).slice(0, 5);
  }

  /* the reel's landing: an easing that starts at the speed the reel was already turning (px per second), so it slows down
     rather than jumping. Its first control point sets the starting slope: slope = speed × time / distance */
  function landing(distance, ms, speed) {
    var slope = speed * ms / 1000 / Math.max(1, distance);
    var y1 = Math.min(0.9, Math.max(0.05, 0.3 * slope));
    return 'cubic-bezier(0.3,' + y1.toFixed(3) + ',0.12,1)';
  }

  /* where a series starts: where it was left, or its first episode (specials, season 0, come last) */
  function startVideo(meta, resume) {
    if (meta.type !== 'series') return { id: meta.id, title: meta.name };
    var vids = meta.videos || [];
    var at = resume && vids.filter(function (v) { return v.id === resume.videoId; })[0];
    if (at) return at;
    return vids.filter(function (v) { return v.season > 0; }).sort(function (a, b) { return (a.season - b.season) || ((a.episode || 0) - (b.episode || 0)); })[0] || null;
  }

  CS.roll = { DEFAULTS: DEFAULTS, choices: choices, shortApplies: shortApplies, query: query, next: next, toggleGenre: toggleGenre, seen: seen, fresh: fresh, remember: remember,
    libraryPicks: libraryPicks, never: never, randomEpisode: randomEpisode, landing: landing, startVideo: startVideo };
})();
