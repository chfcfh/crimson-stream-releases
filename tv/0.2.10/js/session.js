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

    /* Arabic subtitles for what is playing -> {fitted, plain, others, list} */
    findSubs: function (meta, video, stream) {
      var extra = {};
      if (stream.file) extra.filename = stream.file;
      if (stream.size) extra.videoSize = stream.size;
      return CS.addons.subtitles(meta.type, video.id, extra).then(function (all) {
        var g = CS.subs.arrange(all);
        g.list = g.fitted.concat(g.plain, g.others);
        CS.log('subtitles found', 'fitted', g.fitted.length, 'ours', g.plain.length, 'others', g.others.length);
        return g;
      });
    },

    /* {label, note} for a subtitle in the list (i = its place) */
    subLabel: function (s, i) {
      if (CS.subs.isFitted(s)) return { label: 'عربية ' + (i + 1) + ' — مضبوطة على ملف الحلقة', note: 'تبي كمبيوترك شغّال وأنت في البيت' };
      var src = String(s.id || '').replace(/^⚡\s*\d+\s*/, '');
      var addon = s._addon ? s._addon.manifest.name : '';
      return { label: 'عربية ' + (i + 1) + (src ? ' — ' + src : addon ? ' — ' + addon : ''), note: addon };
    }
  };
})();
