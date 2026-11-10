/* What the TV player (player.js) and the Windows player (desktop.js) share: the next episode, its source, the Arabic
   subtitles for what is playing and their names, and when a video counts as finished. */
(function () {
  var LANG = { en: 'الإنجليزية', eng: 'الإنجليزية', ar: 'العربية', ara: 'العربية', ja: 'اليابانية', jpn: 'اليابانية', ko: 'الكورية', kor: 'الكورية',
    fr: 'الفرنسية', fre: 'الفرنسية', fra: 'الفرنسية', es: 'الإسبانية', spa: 'الإسبانية', de: 'الألمانية', ger: 'الألمانية', deu: 'الألمانية',
    it: 'الإيطالية', ita: 'الإيطالية', ru: 'الروسية', rus: 'الروسية', hi: 'الهندية', hin: 'الهندية', tr: 'التركية', tur: 'التركية',
    zh: 'الصينية', chi: 'الصينية', zho: 'الصينية', pt: 'البرتغالية', por: 'البرتغالية', ro: 'الرومانية', rum: 'الرومانية', ron: 'الرومانية' };

  CS.session = {
    CREDITS: 0.93, /* past this share of the video it counts as finished */

    /* a language code (en, ara…) in Arabic; '' when unknown */
    langName: function (code) { return LANG[String(code || '').toLowerCase()] || ''; },

    isFinished: function (pos, dur) { return dur > 0 && pos / dur >= CS.session.CREDITS; },

    /* the episode after this one, if it is already out */
    nextVideo: function (meta, video) {
      if (meta.type !== 'series' || !meta.videos) return null;
      /* in the order of the story: the add-ons do not always list a season's episodes that way */
      var vids = meta.videos.filter(function (x) { return x.season > 0; }).sort(function (a, b) { return (a.season - b.season) || ((a.episode || 0) - (b.episode || 0)); });
      var i = vids.findIndex(function (x) { return x.id === video.id; });
      var n = i >= 0 ? vids[i + 1] : null;
      if (n && n.released && new Date(n.released) > new Date()) return null;
      return n || null;
    },

    /* the source for the next episode most like the one playing now -> {list, pick} */
    nextSource: function (meta, nextVideo, stream) {
      return CS.addons.streams(meta.type, nextVideo.id).then(function (raw) {
        var list = CS.streams.order(raw);
        var pick = CS.streams.pickLike(list, CS.streams.memo(stream));
        CS.log('next episode source', pick ? pick.addonName + ' ' + (pick.file || '').slice(0, 60) : 'none');
        return { list: list, pick: pick };
      }).catch(function () { return { list: [], pick: null }; });
    },

    /* Arabic words for a title (crimson-hub, from Arabic Wikipedia) -> {text, name}; kept once known. null: nothing now */
    arabicInfo: function (m) {
      if (!CS.config.hubUrl || !m || !/^tt\d{5,10}$/.test(m.id || '')) return Promise.resolve(null);
      var key = 'ar:' + m.id, kept = CS.cache.get(key);
      if (kept) return Promise.resolve(kept);
      return CS.fetchJson(CS.config.hubUrl + '/ar/' + m.id, { timeout: 9000, cache: 'no-store' }).then(function (r) {
        if (r.later) return null;
        var info = { text: r.text || '', name: r.name || '' };
        CS.cache.set(key, info);
        return info;
      }, function () { return null; });
    },

    /* Arabic subtitles for what is playing -> {fitted, plain, others, list} */
    findSubs: function (meta, video, stream) {
      var extra = {};
      if (stream.file) extra.filename = stream.file;
      if (stream.size) extra.videoSize = stream.size;
      return CS.addons.subtitles(meta.type, video.id, extra).then(function (all) {
        var g = CS.subs.arrange(all);
        return CS.session.nearbyRows(meta, video, stream, g).then(function () {
          g.list = g.fitted.concat(g.plain, g.others);
          CS.log('subtitles found', 'fitted', g.fitted.length, 'ours', g.plain.length, 'others', g.others.length);
          return g;
        });
      });
    },

    /* A TV whose «عنوان كمبيوترك» is a PC with the fitter other than the owner's (a friend's, with Crimson Helper): our add-on
       gives the two rows «مضبوطة على ملفك» only for the owner's PC, so they are made here, for the first two Arabic subtitles,
       and everything after goes as at the owner's. The PC is asked once a minute at most. */
    nearbyRows: function (meta, video, stream, g) {
      var S = CS.settings;
      if (CS.desktop || g.fitted.length || !stream.file || !S.pc) return Promise.resolve();
      var base = CS.pcUrl(CS.config.ports.speeder), seen = CS.session.nearbySeen;
      var check = seen && seen.base === base && Date.now() - seen.at < 60000 ? Promise.resolve(seen.ok)
        : CS.fetchJson(base + '/manifest.json', { timeout: 2500, cache: 'no-store' }).then(function (m) { return !!m && m.id === CS.config.speederId; }, function () { return false; })
          .then(function (ok) { CS.session.nearbySeen = { base: base, ok: ok, at: Date.now() }; return ok; });
      /* the link being played goes too: the PC finds the file by its name in its own Torrentio list only when the source came
         from there, and reads it from this link otherwise (another add-on, another service, a torrent) */
      var played = CS.streams.playUrl(stream);
      return check.then(function (ok) {
        if (!ok) return;
        g.fitted = g.plain.concat(g.others).slice(0, 2).map(function (s, k) {
          return { id: '⚡ ' + (k + 1) + ' مضبوطة على ملفك', lang: 'ara', _addon: s._addon,
            url: CS.subs.jobLink(base, { t: meta.type, id: video.id, f: stream.file, u: s.url, s: CS.subs.leadMs, own: true, p: played || undefined }) };
        });
      });
    },

    /* {label, note} for a subtitle in the list (i = its place) */
    subLabel: function (s, i) {
      if (CS.subs.isFitted(s)) return { label: 'عربية ' + (i + 1) + ' — مضبوطة', note: 'تبي كمبيوترك شغّال وأنت في البيت' };
      /* what is left of a subtitle's id once its number and its add-on's marks are gone */
      var src = String(s.id || '').replace(/^⚡\s*\d+\s*/, '').replace(/^v\d\+?\|\d+\|/, '').replace(/^\d+$/, '');
      var addon = s._addon ? s._addon.manifest.name : '';
      return { label: 'عربية ' + (i + 1) + (src ? ' — ' + src : addon ? ' — ' + addon : ''), note: addon };
    }
  };
})();
