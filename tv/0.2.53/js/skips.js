/* «تخطي المقدمة» (the owner, 2026-11-20: «نبي الملخص و اغنية البداية … مانبي يسوي سكب لدقيقة من الحلقة نفسها»): where an episode's recap and
   opening are, from two lists people fill in by hand for each episode, so a skip never guesses or jumps a set number of seconds.
   - AniSkip (anime, by MyAnimeList's id): each time comes with the length of the file it was taken on. The same episode is out in versions
     whose opening sits in different places (Frieren 1: at 0:03 in one, 1:56 in another, 0:43 in a third), so only a time taken on a file
     of this one's length is used. Those are «sure»: they may skip by themselves when the viewer chose that.
   - TheIntroDB (series and anime, by the IMDb id and Cinemeta's season and episode): no length to check against, so its times are only
     ever offered as a button the viewer presses on seeing the opening; never skipped by themselves.
   A time that cannot be right (an opening over 3 minutes, a recap over 5, one reaching the last 30 s) is dropped. No time: no button.
   Asked by the device itself: all three answer any origin, the TV's file:// too. */
(function () {
  var INTRO_DB = 'https://api.theintrodb.org/v2/media';
  var ANISKIP = 'https://api.aniskip.com/v2/skip-times/';
  var ARM = 'https://arm.haglund.dev/api/v2/';
  var LONGEST = { recap: 300, intro: 180 };
  var SAME = 2; /* seconds: AniSkip's file is this one when their lengths are this close */
  var NAMES = { recap: 'تخطي الملخص', intro: 'تخطي المقدمة' };

  function sane(list, dur) {
    return list.filter(function (s) {
      return s.end - s.start >= 5 && s.end - s.start <= LONGEST[s.kind] && s.start >= 0 && (!dur || s.end < dur - 30);
    });
  }

  /* TheIntroDB: by the IMDb id and Cinemeta's season and episode (the numbers the app plays by) */
  function introDb(imdb, season, episode) {
    return CS.fetchJson(INTRO_DB + '?imdb_id=' + imdb + '&season=' + season + '&episode=' + episode, { timeout: 8000 }).then(function (j) {
      var out = [];
      [['recap', j && j.recap], ['intro', j && j.intro]].forEach(function (x) {
        var s = x[1] && x[1][0];
        if (!s || s.end_ms == null) return;
        out.push({ kind: x[0], start: (+s.start_ms || 0) / 1000, end: +s.end_ms / 1000, sure: false, from: 'TheIntroDB' });
      });
      return out;
    }, function () { return []; });
  }

  /* AniSkip: by MyAnimeList's id and its own episode number, only times taken on a file of this one's length */
  function aniSkip(mal, episode, dur) {
    if (!mal || !episode || !dur) return Promise.resolve([]);
    var url = ANISKIP + mal + '/' + episode + '?types=op&types=mixed-op&types=recap&episodeLength=' + Math.round(dur);
    return CS.fetchJson(url, { timeout: 8000 }).then(function (j) {
      var out = [], elsewhere = {};
      (j && j.results || []).forEach(function (r) {
        if (!r.interval) return;
        var kind = r.skipType === 'recap' ? 'recap' : 'intro';
        if (Math.abs((+r.episodeLength || 0) - dur) <= SAME) out.push({ kind: kind, start: +r.interval.startTime || 0, end: +r.interval.endTime, sure: true, from: 'AniSkip' });
        else elsewhere[kind] = 1;
      });
      /* timed on other versions only: the versions differ, and which one TheIntroDB's time was taken on cannot be told */
      out.elsewhere = elsewhere;
      return out;
    }, function () { return []; }); /* 404: nobody has timed this one */
  }

  /* MyAnimeList's title and episode for what is played: an anime id's own (kitsu:12:3), or the season of an IMDb show that is an anime
     (arm.haglund.dev lists a show's MyAnimeList titles by TVDB season; a season split over two titles there is left to TheIntroDB). What
     arm says is kept a month */
  function armGet(path, key) {
    var kept = CS.cache.get(key, 30 * 864e5);
    if (kept) return Promise.resolve(kept.v);
    return CS.fetchJson(ARM + path, { timeout: 8000 }).then(function (v) { CS.cache.set(key, { v: v }); return v; }, function () { return null; });
  }
  function animeOf(meta, video) {
    var own = /^(kitsu|anilist|mal):(\d+)(?::(\d+))?$/.exec(video.id || '') || /^(kitsu|anilist|mal):(\d+)$/.exec(meta.id || '');
    var episode = own && own[3] ? +own[3] : +video.episode;
    if (own) {
      if (own[1] === 'mal') return Promise.resolve({ mal: +own[2], episode: episode });
      var site = own[1] === 'kitsu' ? 'kitsu' : 'anilist';
      return armGet('ids?source=' + site + '&id=' + own[2], 'arm-' + site + ':' + own[2]).then(function (r) {
        return r && r.myanimelist ? { mal: r.myanimelist, episode: episode } : null;
      });
    }
    if (!/^tt\d+$/.test(meta.id || '') || video.season == null) return Promise.resolve(null);
    return armGet('imdb?id=' + meta.id + '&include=myanimelist,thetvdb-season', 'arm-imdb:' + meta.id).then(function (list) {
      var mine = (list || []).filter(function (x) { return x.myanimelist && +x['thetvdb-season'] === +video.season; });
      return mine.length === 1 ? { mal: mine[0].myanimelist, episode: +video.episode } : null;
    });
  }

  /* an episode's recap and opening, soonest first: AniSkip's for this very file where it has them, TheIntroDB's for what it lacks, unless
     AniSkip shows the episode's versions differ there (then none: better no button than one at the wrong time) */
  function find(meta, video, dur) {
    if (!meta || !video || meta.type !== 'series' || !(dur > 120) || !isFinite(dur)) return Promise.resolve([]);
    var tt = /^tt\d+$/.test(meta.id || '') && video.season != null && video.episode != null;
    return Promise.all([
      animeOf(meta, video).then(function (a) { return a ? aniSkip(a.mal, a.episode, dur) : []; }, function () { return []; }),
      tt ? introDb(meta.id, video.season, video.episode) : Promise.resolve([])
    ]).then(function (got) {
      var sure = sane(got[0], dur), have = {};
      sure.forEach(function (s) { have[s.kind] = 1; });
      Object.keys(got[0].elsewhere || {}).forEach(function (k) { have[k] = 1; });
      var out = sure.concat(sane(got[1], dur).filter(function (s) { return !have[s.kind]; }));
      out.sort(function (a, b) { return a.start - b.start; });
      if (out.length) CS.log('skips', out.map(function (s) { return s.kind + ' ' + Math.round(s.start) + '-' + Math.round(s.end) + ' ' + s.from + (s.sure ? ' (this file)' : ''); }).join(', '));
      return out;
    });
  }

  /* the part being played now, if it is one to skip: from its start to a second before its end */
  function at(list, t) {
    for (var i = 0; i < (list || []).length; i++) { var s = list[i]; if (t >= s.start && t < s.end - 1) return s; }
    return null;
  }

  CS.skips = { find: find, at: at, name: function (s) { return NAMES[s.kind] || 'تخطي'; }, _: { sane: sane } };
})();
