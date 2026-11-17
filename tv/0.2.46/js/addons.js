/* Your Stremio add-ons: the list from the account, and asking them for rows, title pages, sources and subtitles. */
(function () {
  /* used only before sign-in (and in the PC preview) */
  var DEFAULT_URLS = [
    'https://v3-cinemeta.strem.io/manifest.json',
    'https://opensubtitles-v3.strem.io/manifest.json',
    CS.config.arabicSubsUrl + '/p/manifest.json'
  ];
  var SPEEDER_ID = CS.config.speederId;
  var SUBS_ID = CS.config.arabicSubsId;
  /* add-ons that only work inside Stremio itself */
  var SKIP_IDS = { 'org.stremio.local': 1 };
  /* live kinds (sports, TV channels, events): their rows are a section of their own («رياضة», views.js), never the home page's,
     and they stay out of the general search (a film's name is not asked of every sport's list) */
  var LIVE_TYPES = { sport: 1, tv: 1, events: 1 };
  /* a live match's page, kept a little while in memory only: moving across its row asks for each card's page */
  var livePages = {};

  var list = [];

  function base(url) { return url.replace(/\/manifest\.json(\?.*)?$/, ''); }
  function wrap(a) { return { transportUrl: a.transportUrl, base: base(a.transportUrl), manifest: a.manifest, flags: a.flags || {} }; }

  function resourceOf(addon, name) {
    var res = addon.manifest.resources || [];
    for (var i = 0; i < res.length; i++) {
      var r = res[i];
      if (r === name) return { name: name };
      if (r && r.name === name) return r;
    }
    return null;
  }
  function supports(addon, name, type, id) {
    if (SKIP_IDS[addon.manifest.id]) return false;
    var r = resourceOf(addon, name);
    if (!r) return false;
    var types = r.types || addon.manifest.types || [];
    if (type && types.length && types.indexOf(type) < 0) return false;
    var pre = r.idPrefixes || addon.manifest.idPrefixes;
    if (id && pre && pre.length && !pre.some(function (p) { return id.indexOf(p) === 0; })) return false;
    return true;
  }

  function extraStr(extra) {
    if (!extra) return '';
    var parts = [];
    for (var k in extra) if (extra[k] !== undefined && extra[k] !== null && extra[k] !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(extra[k]));
    return parts.length ? '/' + parts.join('&') : '';
  }
  var KITSU_META = { base: 'https://anime-kitsu.strem.fun', manifest: { id: 'community.anime.kitsu', name: 'Anime Kitsu', resources: ['meta'], types: ['series', 'movie'], idPrefixes: ['kitsu', 'anilist', 'mal'] } };
  function url(addon, resource, type, id, extra) {
    return addon.base + '/' + resource + '/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + extraStr(extra) + '.json';
  }

  /* a catalog that cannot be listed without something typed or chosen first */
  function needsInput(c) {
    return (c.extraRequired || []).length > 0 || (c.extra || []).some(function (x) { return x.isRequired; });
  }

  function trimMeta(m) {
    if (!m || !m.id) return null;
    return {
      id: m.id, type: m.type, name: m.name || '', poster: m.poster || '', background: m.background || '', logo: m.logo || '',
      description: (m.description || '').slice(0, 320), releaseInfo: m.releaseInfo || m.year || '', imdbRating: m.imdbRating || '',
      genres: (m.genres || m.genre || []).slice(0, 3), runtime: m.runtime || '', posterShape: m.posterShape || 'poster'
    };
  }

  /* the lists from the hub (by language, by service, by year): always there, in the account or not. If it does not answer, last time's list stands */
  function withDiscover(addons) {
    if (!CS.config.hubUrl) return Promise.resolve(addons);
    var u = CS.config.hubUrl + '/cat/manifest.json';
    return CS.fetchJson(u).then(function (m) { CS.cache.set('discover', m); return m; }, function () { return CS.cache.get('discover'); }).then(function (m) {
      return m && m.catalogs ? addons.concat([{ transportUrl: u, manifest: m, flags: {} }]) : addons;
    });
  }

  CS.addons = {
    SPEEDER_ID: SPEEDER_ID,
    SUBS_ID: SUBS_ID,
    all: function () { return list; },
    supports: supports,
    url: url,
    trimMeta: trimMeta,

    /* cached list first (instant start), then the account's current list */
    load: function (fresh) {
      var cached = CS.cache.get('addons');
      if (cached && cached.length && !fresh) {
        list = cached.map(wrap);
        CS.addons.refresh();
        return Promise.resolve(list);
      }
      return CS.addons.refresh();
    },
    refresh: function () {
      var p = CS.settings.authKey ? CS.api.addons() : Promise.all(DEFAULT_URLS.map(function (u) {
        return CS.fetchJson(u).then(function (m) { return { transportUrl: u, manifest: m, flags: {} }; }, function () { return null; });
      })).then(function (a) { return a.filter(Boolean); });
      return p.then(withDiscover).then(function (addons) {
        var slim = addons.map(function (a) { return { transportUrl: a.transportUrl, manifest: a.manifest, flags: a.flags }; });
        var changed = JSON.stringify(slim) !== JSON.stringify(CS.cache.get('addons'));
        CS.cache.set('addons', slim);
        list = slim.map(wrap);
        if (changed && CS.onAddonsChanged) CS.onAddonsChanged();
        return list;
      }).catch(function (e) {
        CS.log('add-on list not refreshed', e.message);
        /* code 1 = "Session does not exist" (checked against api.strem.io): the sign-in ended on the server */
        if (e.code === 1 && /session/i.test(e.message || 'session') && CS.onSignedOut) CS.onSignedOut();
        return list;
      });
    },

    /* the rows of the home screen: every catalog that needs nothing typed in (movies, series, your TorBox lists…) */
    homeCatalogs: function () {
      var out = [];
      list.forEach(function (a) {
        if (!resourceOf(a, 'catalog')) return;
        (a.manifest.catalogs || []).forEach(function (c) {
          if (c.type === 'channel' || LIVE_TYPES[c.type] || needsInput(c)) return; /* channels: not in version 1; live ones: «رياضة» */
          out.push({ addon: a, cat: c, key: a.manifest.id + ':' + c.type + ':' + c.id });
        });
      });
      return out;
    },
    isLive: function (type) { return !!LIVE_TYPES[type]; },
    /* the rows of «رياضة»: every live catalog of the account's add-ons that needs nothing typed in. Sports first, then events, then
       TV channels, each add-on's in its own order (Sports Streams: Live Now, Today, then each sport) */
    liveCatalogs: function () {
      var out = [], ORDER = { sport: 0, events: 1, tv: 2 };
      list.forEach(function (a) {
        if (!resourceOf(a, 'catalog')) return;
        (a.manifest.catalogs || []).forEach(function (c) {
          if (LIVE_TYPES[c.type] && !needsInput(c)) out.push({ addon: a, cat: c, key: a.manifest.id + ':' + c.type + ':' + c.id, at: out.length });
        });
      });
      return out.sort(function (x, y) { return ORDER[x.cat.type] - ORDER[y.cat.type] || x.at - y.at; });
    },
    searchCatalogs: function () {
      var out = [];
      list.forEach(function (a) {
        (a.manifest.catalogs || []).forEach(function (c) {
          if (c.type === 'channel' || LIVE_TYPES[c.type]) return;
          var names = (c.extra || []).map(function (x) { return x.name; }).concat(c.extraSupported || []);
          if (names.indexOf('search') >= 0) out.push({ addon: a, cat: c });
        });
      });
      return out;
    },
    catalog: function (addon, cat, extra) {
      return CS.fetchJson(url(addon, 'catalog', cat.type, cat.id, extra)).then(function (r) {
        var metas = (r.metas || []).map(trimMeta).filter(Boolean);
        /* a page that left titles out says how far it really reached */
        if (r.pageSize) metas.pageSize = r.pageSize;
        /* an anime add-on's list: one card a show, not one a season (findbar.js CS.anilist.shows) */
        return CS.anilist && metas.some(CS.anilist.isAnime) ? CS.anilist.shows(metas) : metas;
      });
    },

    /* the full title page (episodes included) from the first add-on that knows the title */
    meta: function (type, id) {
      var key = 'meta:' + type + ':' + id, live = !!LIVE_TYPES[type];
      /* a live match's page is never kept on the device: «live now» and its times change, and every match is a new title */
      var fresh = live ? (livePages[key] && Date.now() - livePages[key].at < 120000 ? livePages[key].m : null) : CS.cache.get(key, 6 * 3600e3);
      if (fresh) return Promise.resolve(fresh);
      var cands = list.filter(function (a) { return supports(a, 'meta', type, id); });
      /* an anime listed by AniList, MyAnimeList or Kitsu («يعرض الآن», the search's season): the free Anime Kitsu add-on when the account
         has none for it. Its page answers under the title's kitsu: id, whose episodes the stream add-ons know */
      if (!cands.length && /^(kitsu|anilist|mal):\d+$/.test(id)) cands = [KITSU_META];
      var i = 0;
      function next() {
        if (i >= cands.length) {
          var stale = live ? null : CS.cache.get(key);
          return stale ? stale : Promise.reject(new Error('ما لقينا صفحة لهالعنوان'));
        }
        var a = cands[i++];
        return CS.fetchJson(url(a, 'meta', type, id)).then(function (r) {
          if (!r || !r.meta) return next();
          var m = r.meta;
          var keep = {
            id: m.id, type: m.type || type, name: m.name || '', poster: m.poster || '', background: m.background || '', logo: m.logo || '',
            description: m.description || '', releaseInfo: m.releaseInfo || m.year || '', imdbRating: m.imdbRating || '',
            genres: m.genres || m.genre || [], runtime: m.runtime || '', cast: (m.cast || []).slice(0, 6), director: m.director || [],
            behaviorHints: m.behaviorHints || {},
            /* for the title's own language (session.js): the IMDb id of a title listed under another id, and the country to guess from */
            country: typeof m.country === 'string' ? m.country.slice(0, 80) : '', imdb_id: typeof m.imdb_id === 'string' ? m.imdb_id : '',
            videos: (m.videos || []).map(function (v) {
              return { id: v.id, title: v.title || v.name || '', season: v.season, episode: v.episode != null ? v.episode : v.number, released: v.released || v.firstAired || '', thumbnail: v.thumbnail || '', overview: (v.overview || v.description || '').slice(0, 280) };
            })
          };
          /* long series (hundreds of episodes) are kept with short episode texts, and not at all past ~400 KB,
             so one title cannot push everything else out of the TV's small storage */
          var stored = keep.videos.length > 150
            ? Object.assign({}, keep, { videos: keep.videos.map(function (v) { return Object.assign({}, v, { overview: v.overview.slice(0, 120) }); }) })
            : keep;
          if (live) { livePages[key] = { m: keep, at: Date.now() }; return keep; }
          var size = JSON.stringify(stored).length;
          if (size < 400000) CS.cache.set(key, stored); else CS.log('title page not kept (too big)', id, size);
          return keep;
        }, next);
      }
      return Promise.resolve(next());
    },

    /* sources from every add-on at once; onAddon(addon, streams) as each one answers */
    streams: function (type, id, onAddon) {
      var cands = list.filter(function (a) { return supports(a, 'stream', type, id); });
      return Promise.all(cands.map(function (a) {
        var t0 = Date.now();
        return CS.fetchJson(url(a, 'stream', type, id), { cache: 'no-store' }).then(function (r) {
          var s = (r.streams || []).map(function (x) { x._addon = a; return x; });
          CS.log('streams', a.manifest.name, s.length, (Date.now() - t0) + 'ms');
          if (onAddon) onAddon(a, s);
          return s;
        }, function (e) {
          CS.log('streams failed', a.manifest.name, e.message || e.name);
          if (onAddon) onAddon(a, null);
          return [];
        });
      })).then(function (all) { return [].concat.apply([], all); });
    },

    /* subtitles from every subtitle add-on; extra = {filename, videoSize, videoHash} */
    subtitles: function (type, id, extra) {
      /* a live match has none, and asking would send every match to our Arabic add-on (always asked, below) */
      if (LIVE_TYPES[type]) return Promise.resolve([]);
      var cands = list.filter(function (a) { return supports(a, 'subtitles', type, id); });
      if (!cands.some(function (a) { return a.manifest.id === SUBS_ID; })) {
        /* our Arabic add-on is always asked, even if it is not in the account: its keyless version (/p), so an account
           without it (a friend's) never spends the owner's SubDL and SubSource keys */
        cands.push({ base: CS.config.arabicSubsUrl + '/p', manifest: { id: SUBS_ID, name: 'ترجمة عربية ⚡' } });
      }
      return Promise.all(cands.map(function (a) {
        return CS.fetchJson(url(a, 'subtitles', type, id, extra), { cache: 'no-store' }).then(function (r) {
          return (r.subtitles || []).map(function (s) { s._addon = a; return s; });
        }, function (e) { CS.log('subtitles failed', a.manifest.name, e.message || e.name); return []; });
      })).then(function (all) { return [].concat.apply([], all); });
    }
  };
})();
