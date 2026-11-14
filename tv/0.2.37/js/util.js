/* Small helpers shared by every part of the app: DOM, fetch with a time limit, formatting, keys, the eye mark, logs. */
var CS = window.CS || {};
window.CS = CS;

CS.$ = function (id) { return document.getElementById(id); };

/* h('div.card.f', {onclick: fn, 'data-x': 1}, [children or text]) */
CS.h = function (tag, attrs, kids) {
  var parts = tag.split('.');
  var el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
};

CS.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/* fetch with a time limit; LAN addresses get a short one so a sleeping PC never holds the screen */
CS.isLan = function (url) { return /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost)/.test(url); };
/* the Windows version keeps the browser's protections on: other sites are read through its own window (/proxy) */
CS.netUrl = function (url, ms) {
  return CS.desktop && !window.CS_ANDROID && /^https?:/i.test(url) ? 'https://app.crimson/proxy?u=' + encodeURIComponent(url) + '&t=' + (ms || 15000) : url;
};
/* a list in a new order each time */
CS.shuffled = function (list, rnd) {
  var a = list.slice(), r = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
};
/* one from each queue in turn, in an order that changes every round, until all are empty. next() -> an item, or null at the end */
CS.takeInTurn = function (queues, rnd) {
  var names = Object.keys(queues), round = [];
  return function () {
    for (var tries = 0; tries <= names.length * 2; tries++) {
      if (!round.length) {
        round = CS.shuffled(names.filter(function (n) { return queues[n].length; }), rnd);
        if (!round.length) return null;
      }
      var q = queues[round.shift()];
      if (q.length) return q.shift();
    }
    return null;
  };
};
/* the next pages of a list. fetchPage(skip) -> items; add(fresh) gets only what was not shown yet.
   A page with nothing new is passed over: Kitsu answers skip=20 with its first page again, and goes on at 40. It ends by itself:
   an empty page, three such pages in a row, a failure, or a limit if one is given. Lists may be as long as they like: only what is near the
   viewer is on the page. seen: titles to leave out, shared when several rows should not repeat each other */
CS.pager = function (fetchPage, shown, start, add, limit, seen) {
  var skip = start, busy = false, over = false, count = 0, max = limit || Infinity, step = start || 20;
  seen = seen || {};
  shown.forEach(function (m) { if (m.id) { seen[m.id] = 1; count++; } });
  return function () {
    if (busy || over) return Promise.resolve(false);
    if (count >= max) { over = true; return Promise.resolve(false); }
    busy = true;
    var tryPage = function (left) {
      return fetchPage(skip).then(function (items) {
        skip += items.pageSize || items.length || step;
        var fresh = items.filter(function (m) { if (!m.id || seen[m.id]) return false; seen[m.id] = 1; return true; });
        if (fresh.length) {
          busy = false;
          count += fresh.length;
          add(fresh);
          return true;
        }
        if (items.length && left > 1) return tryPage(left - 1);
        busy = false;
        over = true;
        return false;
      }, function () { busy = false; over = true; return false; });
    };
    return tryPage(3);
  };
};
/* «يعرض الآن» › «مكتبتي»: the soonest next episode first (one already out before one to come), those with no date last; the rest as they came */
CS.soonestFirst = function (metas) {
  return metas.map(function (m, i) { return { m: m, i: i, d: /^\d{4}-\d\d-\d\d$/.test(m.nextAir || '') ? m.nextAir : '~' }; })
    .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i; })
    .map(function (x) { return x.m; });
};
/* «يعرض الآن»: a show's next episode as people say it, from its date (YYYY-MM-DD, of the show's own country, as TMDB gives it).
   This week by its day, further by its date; '' when not known */
CS.nextEpisodeWords = function (day, now) {
  var d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(day || '');
  if (!d) return '';
  now = now || new Date();
  var at = Date.UTC(+d[1], +d[2] - 1, +d[3]), n = Math.round((at - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (n < 0) return 'نزلت حلقة جديدة';
  if (n === 0) return 'حلقة جديدة اليوم';
  if (n === 1) return 'حلقة جديدة بكرة';
  if (n < 7) return 'حلقة جديدة ' + ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(at).getUTCDay()];
  /* a date is longer than a day: "new" is left out so it fits a phone's poster */
  return 'حلقة ' + (+d[3]) + ' ' + ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][+d[2] - 1];
};
/* minutes in Arabic, the way people say them */
CS.minLeft = function (n) {
  if (n === 1) return 'دقيقة';
  if (n === 2) return 'دقيقتين';
  return n + (n >= 3 && n <= 10 ? ' دقايق' : ' دقيقة');
};
CS.fetchText = function (url, opts) {
  opts = opts || {};
  var ctl = new AbortController();
  var ms = opts.timeout || (CS.isLan(url) ? 4000 : 12000);
  var max = opts.maxBytes || 12e6; /* an answer bigger than this is refused, so a broken or hostile add-on cannot freeze the app */
  var t = setTimeout(function () { ctl.abort(); }, ms);
  return fetch(CS.netUrl(url, ms), { method: opts.method || 'GET', body: opts.body, headers: opts.headers, signal: ctl.signal, cache: opts.cache || 'default' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var len = +r.headers.get('content-length');
      if (len && len > max) throw new Error('too large (' + Math.round(len / 1e6) + ' MB)');
      return (opts.binary ? r.arrayBuffer() : r.text()).then(function (b) {
        if ((opts.binary ? b.byteLength : b.length) > max) throw new Error('too large');
        return b;
      });
    })
    .finally(function () { clearTimeout(t); });
};
CS.fetchJson = function (url, opts) {
  return CS.fetchText(url, opts).then(function (t) { return JSON.parse(t); });
};

/* run tasks with at most n at once; each result comes back through onEach as soon as it is ready */
CS.pool = function (items, n, worker) {
  var i = 0, out = new Array(items.length);
  function next() {
    if (i >= items.length) return Promise.resolve();
    var k = i++;
    return Promise.resolve().then(function () { return worker(items[k], k); })
      .then(function (v) { out[k] = v; }, function (e) { out[k] = undefined; CS.log('pool item failed', String(e && e.message || e)); })
      .then(next);
  }
  var runners = [];
  for (var j = 0; j < Math.min(n, items.length); j++) runners.push(next());
  return Promise.all(runners).then(function () { return out; });
};

CS.fmtTime = function (sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
};
CS.fmtSize = function (bytes) {
  if (!bytes) return '';
  var gb = bytes / 1073741824;
  return gb >= 1 ? gb.toFixed(gb >= 10 ? 0 : 1) + ' GB' : Math.round(bytes / 1048576) + ' MB';
};
/* an episode in words, for the screens */
CS.epLabel = function (season, episode) {
  return (season ? 'الموسم ' + season : 'خاص') + ' · الحلقة ' + episode;
};
/* the same as a code, for the Windows player's bar (drawn by the program itself, which does not order mixed Arabic and numbers) */
CS.epCode = function (season, episode) {
  return 'S' + (season < 10 ? '0' : '') + season + 'E' + (episode < 10 ? '0' : '') + episode;
};

/* icons, drawn: one weight everywhere, the colour of the text beside them */
var ICONS = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  down: '<path d="M12 4v12M6.5 11l5.5 5.5 5.5-5.5M5 20.5h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  bolt: '<path d="M13.5 2.5L5 13.5h6l-1 8 9-11.5h-6z" fill="currentColor" stroke="none"/>',
  retry: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 3.5v4h-4"/>',
  update: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.2"/>',
  back: '<path d="M9 5l7 7-7 7"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  heart: '<path d="M12 20.5s-8-4.8-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.2-8 11-8 11z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  /* a list read from the right: its dots on the right */
  list: '<path d="M4 6.5h11M4 12h11M4 17.5h11"/><g fill="currentColor" stroke="none"><circle cx="19.5" cy="6.5" r="1.5"/><circle cx="19.5" cy="12" r="1.5"/><circle cx="19.5" cy="17.5" r="1.5"/></g>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><g fill="currentColor" stroke="none"><circle cx="8.6" cy="8.6" r="1.35"/><circle cx="15.4" cy="15.4" r="1.35"/><circle cx="15.4" cy="8.6" r="1.35"/><circle cx="8.6" cy="15.4" r="1.35"/><circle cx="12" cy="12" r="1.35"/></g>'
};
CS.icon = function (name) {
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
};
/* the kids of a button: its icon and its words */
CS.iconKids = function (name, text) {
  return [CS.h('span.ico-wrap', { html: CS.icon(name) }), text ? CS.h('span', { text: text }) : null];
};
/* the same, into a button already on the screen */
CS.setIcon = function (el, name, text) {
  el.innerHTML = '';
  CS.iconKids(name, text).forEach(function (k) { if (k) el.appendChild(k); });
};

/* remote keys (webOS) plus the PC keyboard for previews */
CS.KEY = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, BACKSPACE: 8, ESC: 27,
  PLAY: 415, PAUSE: 19, PLAYPAUSE: 179, STOP: 413, REW: 412, FF: 417,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, CHUP: 33, CHDOWN: 34, INFO: 457, SPACE: 32
};
CS.isBack = function (e) {
  var k = e.keyCode;
  if (k === CS.KEY.BACK || k === CS.KEY.ESC) return true;
  /* Backspace means "back" except while typing in a box */
  return k === CS.KEY.BACKSPACE && !(document.activeElement && document.activeElement.tagName === 'INPUT');
};

/* the three-tomoe Sharingan from Crimson Eye, used as the brand mark and the loading spinner */
var eyeCount = 0;
CS.eyeSvg = function () {
  /* each copy names its own colours: copies sharing names lose them (turn black) when the first copy's screen is hidden */
  var n = ++eyeCount, halo = 'cs-halo-' + n, core = 'cs-core-' + n;
  var comma = 'M175 62A15 15 0 1 1 157 47.3C163 40 160 34 146 32C168 26 180 42 175 62Z';
  var tomoe = [0, 120, 240].map(function (r) { return '<path d="' + comma + '" transform="rotate(' + r + ' 160 160)"/>'; }).join('');
  return '<svg viewBox="0 0 320 320" aria-hidden="true"><defs>' +
    '<radialGradient id="' + halo + '"><stop offset="70%" stop-color="#ed0b18" stop-opacity=".08"/><stop offset="90%" stop-color="#ed0b18" stop-opacity=".42"/><stop offset="100%" stop-color="#ed0b18" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="' + core + '" cx="46%" cy="42%"><stop offset="0%" stop-color="#ff3948"/><stop offset="68%" stop-color="#ed0b18"/><stop offset="100%" stop-color="#a5000d"/></radialGradient></defs>' +
    '<circle cx="160" cy="160" r="159" fill="url(#' + halo + ')"/><circle cx="160" cy="160" r="145" fill="#070306" stroke="#2b0309" stroke-width="5"/>' +
    '<circle cx="160" cy="160" r="136" fill="url(#' + core + ')" stroke="#ff3040" stroke-opacity=".5" stroke-width="2"/>' +
    '<circle cx="160" cy="160" r="119" fill="none" stroke="#54050d" stroke-opacity=".72" stroke-width="2"/>' +
    '<g fill="#080205"><circle cx="160" cy="160" r="101" fill="none" stroke="#080205" stroke-width="6"/>' + tomoe + '</g>' +
    '<circle cx="160" cy="160" r="17" fill="#050204" stroke="#ff263e" stroke-width="4"/></svg>';
};
CS.spinner = function (text) {
  return CS.h('div.spin-wrap.inline', null, [CS.h('div.eye-spin', { html: CS.eyeSvg() }), text ? CS.h('div.spin-text', { text: text }) : null]);
};

/* ---------- notes at the bottom of the screen ----------
   CS.toast(text, ms, kind) — kind: 'ok' | 'error' | 'warn' | 'info'; without it the text decides (a failure word → error,
   a done word → ok). Up to three stay stacked (newest at the bottom), so one never hides another; the same text again
   only renews its time. */
var TOAST_ICONS = { warn: '!', info: 'i' };
function toastKind(msg) {
  if (/ما قدرت|ما قدرنا|ما تثبّت|خطأ|ما فيه|مفقود|تالف|انقطع|رُفض|ما اشتغل|ما اكتمل|ما تكفي|ما لقينا|ما فتح|وقف/.test(msg)) return 'error';
  if (/^تم|انحذف|انضاف|جاهز|نزل تحديث|ضبطنا|رجّعنا|انحفظ|نسخنا/.test(msg)) return 'ok';
  if (/لحظة|يتثبّت|يتطبّق|نعيد/.test(msg)) return 'info';
  return 'info';
}
CS.toast = function (msg, ms, kind, action) {
  var box = CS.$('toast');
  if (!box) return;
  msg = String(msg == null ? '' : msg);
  kind = kind || toastKind(msg);
  var same = Array.prototype.filter.call(box.children, function (t) { return t._msg === msg && !t.classList.contains('out'); })[0];
  var t = same;
  if (!t) {
    t = CS.h('div.toast.' + kind, null, [
      CS.h('span.toast-icon', kind === 'ok' ? { html: CS.icon('check') } : kind === 'error' ? { html: CS.icon('close') } : { text: TOAST_ICONS[kind] || 'i' }),
      CS.h('span.toast-text', { text: msg }),
      /* a note that can be acted on at once (the phone, by touch) */
      action ? CS.h('button.toast-act', { onclick: function () { action.run(); } }, action.label) : null
    ]);
    t._msg = msg;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    requestAnimationFrame(function () { t.classList.add('show'); });
  }
  clearTimeout(t._timer);
  t._timer = setTimeout(function () {
    t.classList.add('out');
    t.classList.remove('show');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
  }, ms || 3500);
};

/* ---------- an update is here: a bar at the bottom of every screen until «حدّث الآن» ----------
   It does not go away on its own: an update used to be told in a note of a few seconds, and nobody knew. Out of the way while
   a video plays on the TV (it would sit on the subtitles), back after. The TV's remote reaches its button from the last row of a
   screen (down), or with the red key; a pointer or a touch presses it. show(version, run): run() does the update */
CS.updateBar = (function () {
  var bar = null, btn = null, run = null;
  function sync() {
    if (!bar) return;
    var t = CS.nav && CS.nav.top && CS.nav.top();
    bar.classList.toggle('away', !!(t && t.name === 'player'));
  }
  function go() {
    if (!run || !btn || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'نحدّث…';
    run();
    setTimeout(function () { if (btn) { btn.disabled = false; btn.textContent = 'حدّث الآن'; } }, 15000); /* a refused install: it can be pressed again */
  }
  return {
    show: function (version, act) {
      run = act;
      if (!bar) {
        btn = CS.h('button.update-go', { onclick: go }, 'حدّث الآن');
        bar = CS.h('div.update-bar', { role: 'status' }, [CS.h('span.update-icon', { html: CS.icon('update') }), CS.h('span.update-text'), btn]);
        document.body.appendChild(bar);
        setInterval(sync, 700);
        var before = CS.onAnyKey;
        CS.onAnyKey = function (e) { if (before) before(e); if (e.keyCode === 403 && bar && !bar.classList.contains('away')) go(); }; /* the red key */
        requestAnimationFrame(function () { bar.classList.add('show'); });
      }
      bar.querySelector('.update-text').textContent = 'نزل تحديث ' + version + ' — اضغط «حدّث الآن» عشان تاخذه';
      sync();
      CS.log('update bar', version);
    },
    /* the button, while it can be reached (nav.js: down from the last row) */
    button: function () { return bar && !bar.classList.contains('away') ? btn : null; }
  };
})();

/* ---------- placeholders while content is on its way (they take the shape of what comes) ---------- */
CS.skel = {
  cards: function (n) { var a = []; for (var i = 0; i < (n || 7); i++) a.push(CS.h('div.card.skeleton')); return a; },
  episodes: function (n) { var a = []; for (var i = 0; i < (n || 4); i++) a.push(CS.h('div.ep.skeleton-ep', null, [CS.h('div.ep-thumb.skeleton'), CS.h('div.skel-line.short')])); return a; },
  sources: function (n) { var a = []; for (var i = 0; i < (n || 4); i++) a.push(CS.h('div.source.skeleton-source', null, [CS.h('div.skel-line.addon'), CS.h('div.skel-line'), CS.h('div.skel-line.short')])); return a; },
  lines: function (widths) { return (widths || [70, 90, 60]).map(function (w) { return CS.h('div.skel-line', { style: { width: w + '%' } }); }); },
  buttons: function (n) { var a = []; for (var i = 0; i < (n || 2); i++) a.push(CS.h('div.skel-pill')); return a; }
};

/* ---------- a failure the viewer can act on ----------
   CS.errorState({ title, reason, retry, details, back }) → an element: what went wrong in plain words, «أعد المحاولة»
   (when there is something to retry), and the technical details — shown on the screen (the TV has no clipboard) and, in
   the Windows version, copied with «انسخ التفاصيل». */
CS.errorState = function (o) {
  var details = CS.h('pre.state-details.hidden', { text: o.details || '' });
  var btns = [];
  if (o.retry) btns.push(CS.h('button.btn.primary.f', { onclick: function () { o.retry(); } }, CS.iconKids('retry', 'جرّب مرة ثانية')));
  if (o.details) {
    btns.push(CS.h('button.btn.f', { onclick: function () {
      details.classList.toggle('hidden');
      if (CS.desktop && navigator.clipboard) navigator.clipboard.writeText(o.details).then(function () { CS.toast('نسخنا التفاصيل', 2500, 'ok'); }, function () { /* shown on the screen anyway */ });
    } }, CS.desktop ? 'انسخ التفاصيل' : 'التفاصيل'));
  }
  if (o.back) btns.push(CS.h('button.btn.f', { onclick: function () { o.back(); } }, 'رجوع'));
  return CS.h('div.state.state-error', null, [
    CS.h('div.state-icon', { text: '!' }),
    CS.h('h2.state-title', { text: o.title || 'صار خطأ' }),
    o.reason ? CS.h('p.state-text', { text: o.reason }) : null,
    btns.length ? CS.h('div.state-btns.group', null, btns) : null,
    details
  ]);
};

/* ---------- nothing here yet: what it means and the next step ---------- */
CS.emptyState = function (o) {
  return CS.h('div.state.state-empty', null, [
    CS.h('div.state-icon', ICONS[o.icon] ? { html: CS.icon(o.icon) } : { text: o.icon || '○' }),
    CS.h('h2.state-title', { text: o.title || '' }),
    o.text ? CS.h('p.state-text', { text: o.text }) : null,
    o.action ? CS.h('div.state-btns.group', null, [CS.h('button.btn.primary.f', { onclick: o.action.run }, o.action.icon ? CS.iconKids(o.action.icon, o.action.label) : o.action.label)]) : null
  ]);
};

/* ---------- a job with steps: a live bar, its share and the step it is on ---------- */
CS.progressBox = function () {
  var fill = CS.h('div.task-fill');
  var label = CS.h('span.task-label');
  var pct = CS.h('span.task-pct');
  var el = CS.h('div.task', null, [CS.h('div.task-head', null, [label, pct]), CS.h('div.task-bar', null, fill)]);
  return {
    el: el,
    set: function (share, text) {
      share = Math.max(0, Math.min(1, share || 0));
      fill.style.transform = 'scaleX(' + share + ')';
      pct.textContent = Math.round(share * 100) + '٪';
      if (text != null) label.textContent = text;
      el.classList.toggle('done', share >= 1);
    }
  };
};

/* logs: kept in memory (settings screen shows the tail) and, when a log address is set, sent to the PC */
CS.logs = [];
var logQueue = [], logTimer = 0;
CS.log = function () {
  var line = new Date().toISOString().slice(11, 23) + ' ' + Array.prototype.map.call(arguments, function (a) {
    return typeof a === 'string' ? a : JSON.stringify(a);
  }).join(' ');
  /* links keep only their site: add-on links can carry personal keys (TorBox, Real-Debrid…) */
  line = line.replace(/https?:\/\/[^\s"')]+/g, function (m) { var h = /^https?:\/\/([^\/?#]+)/.exec(m); return (h ? h[1] : '') + '/…'; });
  CS.logs.push(line);
  if (CS.logs.length > 400) CS.logs.splice(0, 100);
  try { console.log(line); } catch (e) { /* no console */ }
  var to = CS.settings && CS.settings.logUrl;
  if (!to) return;
  logQueue.push(line);
  if (!logTimer) logTimer = setTimeout(function () {
    var body = logQueue.join('\n');
    logQueue = [];
    logTimer = 0;
    fetch(CS.netUrl(to, 4000), { method: 'POST', body: body }).catch(function () { /* PC off: drop */ });
  }, 800);
};
window.addEventListener('error', function (e) { CS.log('ERROR', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno); });
window.addEventListener('unhandledrejection', function (e) { CS.log('REJECTED', String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); });

/* luna service call (webOS only) */
CS.luna = function (uri, params) {
  return new Promise(function (resolve) {
    if (typeof PalmServiceBridge === 'undefined') return resolve({ returnValue: false, errorText: 'not webOS' });
    var b = new PalmServiceBridge();
    b.onservicecallback = function (msg) { try { resolve(JSON.parse(msg)); } catch (e) { resolve({ returnValue: false }); } };
    b.call(uri, JSON.stringify(params || {}));
    CS._bridges = CS._bridges || [];
    CS._bridges.push(b); /* keep a reference until the answer arrives */
    if (CS._bridges.length > 20) CS._bridges.shift();
  });
};
CS.isTV = typeof PalmServiceBridge !== 'undefined' || /Web0S|webOS/i.test(navigator.userAgent);
