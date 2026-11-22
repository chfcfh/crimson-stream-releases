/* What the TV player (player.js) and the Windows player (desktop.js) share: the next episode, its source, the Arabic
   subtitles for what is playing and their names, and when a video counts as finished. */
(function () {
  var LANG = { en: 'الإنجليزية', eng: 'الإنجليزية', ar: 'العربية', ara: 'العربية', ja: 'اليابانية', jpn: 'اليابانية', ko: 'الكورية', kor: 'الكورية',
    fr: 'الفرنسية', fre: 'الفرنسية', fra: 'الفرنسية', es: 'الإسبانية', spa: 'الإسبانية', de: 'الألمانية', ger: 'الألمانية', deu: 'الألمانية',
    it: 'الإيطالية', ita: 'الإيطالية', ru: 'الروسية', rus: 'الروسية', hi: 'الهندية', hin: 'الهندية', tr: 'التركية', tur: 'التركية',
    zh: 'الصينية', chi: 'الصينية', zho: 'الصينية', pt: 'البرتغالية', por: 'البرتغالية', ro: 'الرومانية', rum: 'الرومانية', ron: 'الرومانية' };

  /* ---------- a title's own language ----------
     The country in a title's page, for when crimson-hub gives no answer: only countries of one main language */
  var COUNTRY_LANG = {};
  [['en', 'united states|usa|us|united kingdom|uk|australia|new zealand|ireland'], ['ja', 'japan'], ['ko', 'south korea|korea'],
    ['zh', 'china|hong kong|taiwan'], ['fr', 'france'], ['de', 'germany|austria'], ['it', 'italy'], ['es', 'spain|mexico|argentina|colombia|chile|peru'],
    ['pt', 'brazil|portugal'], ['ru', 'russia'], ['tr', 'turkey|türkiye'], ['th', 'thailand'], ['sv', 'sweden'], ['da', 'denmark'], ['no', 'norway'],
    ['nl', 'netherlands'], ['pl', 'poland'], ['id', 'indonesia'], ['fa', 'iran'],
    ['ar', 'egypt|saudi arabia|syria|lebanon|kuwait|united arab emirates|jordan|iraq|morocco|tunisia|algeria|qatar']
  ].forEach(function (l) { l[1].split('|').forEach(function (c) { COUNTRY_LANG[c] = l[0]; }); });
  function guessLang(meta) {
    if (/^kitsu:/.test(meta.id || '')) return 'ja'; /* an anime listed by Kitsu with no IMDb id */
    var langs = String(meta.country || '').split(',').map(function (c) { return COUNTRY_LANG[c.trim().toLowerCase()] || ''; });
    /* the first country says it, and no other country named says otherwise */
    return langs[0] && langs.every(function (l) { return !l || l === langs[0]; }) ? langs[0] : '';
  }
  function imdbOf(meta) {
    var tt = /^tt\d{5,10}$/;
    return tt.test(meta.id || '') ? meta.id : tt.test(meta.imdb_id || '') ? meta.imdb_id : '';
  }
  var askingLang = {};
  function wantedOf(meta, o) {
    var own = (CS.settings.audioOwn || {})[meta.id] || '', list = [];
    var add = function (c) { if (c && list.indexOf(c) < 0) list.push(c); };
    add(own);
    if (!own) add(CS.settings.audioLang === 'ara' ? 'ar' : CS.settings.audioLang === 'eng' ? 'en' : '');
    add(o.lang);
    return { list: list, orig: o.lang, own: own, sure: !!(own || o.sure) };
  }

  CS.session = {
    CREDITS: 0.93, /* past this share of the video it counts as finished */

    /* A title's original language, two letters ('' when not known) -> {lang, sure}. Asked once of crimson-hub, which has it from
       TMDB by the IMDb id, and kept for good (a title TMDB does not know: a week). With no answer it is guessed from the country
       in the title's page, or Japanese for an anime listed by Kitsu, and the hub is asked again next time. A guess chooses the
       audio track and orders the sources, but may not turn a playing source away (sure: false) */
    originalLang: function (meta) {
      var id = imdbOf(meta), guess = { lang: guessLang(meta), sure: false };
      if (!id || !CS.config.hubUrl) return Promise.resolve(guess);
      var key = 'ol:' + id, kept = CS.cache.get(key);
      if (kept && (kept.lang || Date.now() - kept.at < 7 * 86400e3)) return Promise.resolve(kept.lang ? { lang: kept.lang, sure: true } : guess);
      if (!askingLang[id]) {
        askingLang[id] = CS.fetchJson(CS.config.hubUrl + '/cat/lang/' + id + '.json', { timeout: 4000 }).then(function (r) {
          delete askingLang[id];
          if (!r || typeof r.lang !== 'string') return guess;
          var lang = /^[a-z]{2}$/.test(r.lang) ? r.lang : '';
          CS.cache.set(key, { lang: lang, at: Date.now() });
          return lang ? { lang: lang, sure: true } : guess;
        }, function () { delete askingLang[id]; return guess; });
      }
      return askingLang[id];
    },
    /* The audio languages wanted for a title, the first wanted most -> {list, orig, own, sure}: the viewer's own choice for it
       (a track chosen in the player: the next episodes follow), else the setting's (Arabic or English when a file has it),
       then the original. An empty list: nothing is known, and nothing is done about languages */
    audioWanted: function (meta) {
      return CS.session.originalLang(meta).then(function (o) { return wantedOf(meta, o); });
    },
    /* the same at once, for a player that sets its language as the file opens: null while the hub is still to be asked */
    audioWantedNow: function (meta) {
      var id = imdbOf(meta), kept = id ? CS.cache.get('ol:' + id) : null;
      if (kept && kept.lang) return wantedOf(meta, { lang: kept.lang, sure: true });
      if (!id || !CS.config.hubUrl || (kept && Date.now() - kept.at < 7 * 86400e3)) return wantedOf(meta, { lang: guessLang(meta), sure: false });
      return null;
    },
    /* the viewer chose an audio track themselves: its language is wanted for this title from now on */
    audioChosen: function (meta, lang) {
      var c = CS.streams.langCode(lang);
      if (!meta || !meta.id || !c) return;
      var own = CS.settings.audioOwn || (CS.settings.audioOwn = {});
      if (own[meta.id] === c) return;
      delete own[meta.id];
      own[meta.id] = c;
      var keys = Object.keys(own);
      if (keys.length > 300) delete own[keys[0]]; /* the last 300 titles */
      CS.saveSettings();
      CS.log('audio language chosen for', meta.id, c);
    },
    /* Which of a file's audio tracks to play: langs as its player names them, on the one playing now -> its place in the list,
       or -1 to leave what is on (it is in the most wanted language the file has, or the file has none of them) */
    audioPick: function (wanted, langs, on) {
      var codes = (langs || []).map(CS.streams.langCode), list = (wanted && wanted.list) || [];
      for (var i = 0; i < list.length; i++) {
        var k = codes.indexOf(list[i]);
        if (k >= 0) return codes[on] === list[i] ? -1 : k;
      }
      return -1;
    },
    /* A file is open and its audio tracks are known: their languages are kept for the source list. true: it was the automatic
       choice with others waiting behind it, every track names its language, and none is a wanted one (a dubbed copy its name
       did not give away) — the caller goes on to the next source. Once per title played: when the next has none either, the
       title is likely not as believed, and none of its sources is turned away again (for a month) */
    wrongAudio: function (me, langs) {
      langs = langs || [];
      CS.streams.heard(me.stream, langs);
      var w = me.wantAudio, codes = langs.map(CS.streams.langCode);
      if (!w || !w.list.length || !w.sure || !codes.length || codes.some(function (c) { return !c; })) return false;
      if (w.list.some(function (c) { return codes.indexOf(c) >= 0; })) return false;
      var off = 'audioNetOff:' + me.meta.id;
      if (CS.cache.get(off, 30 * 86400e3)) return false;
      if (me.hopped) {
        CS.cache.set(off, 1);
        CS.log('audio: the next source has no', w.list.join('/'), 'track either (' + codes.join(',') + '): this title\'s sources are left alone from now');
        return false;
      }
      if (!me.alternates || !me.alternates.length) return false;
      CS.log('audio: no', w.list.join('/'), 'track in this file (' + codes.join(',') + '), going on to the next source');
      return true;
    },

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
      return Promise.all([CS.addons.streams(meta.type, nextVideo.id), CS.session.audioWanted(meta)]).then(function (got) {
        var list = CS.streams.order(got[0], false, got[1].list);
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
