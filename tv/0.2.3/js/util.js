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
  return CS.desktop && /^https?:/i.test(url) ? 'https://app.crimson/proxy?u=' + encodeURIComponent(url) + '&t=' + (ms || 15000) : url;
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
CS.epLabel = function (season, episode) {
  return 'S' + (season < 10 ? '0' : '') + season + 'E' + (episode < 10 ? '0' : '') + episode;
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
CS.eyeSvg = function () {
  var comma = 'M175 62A15 15 0 1 1 157 47.3C163 40 160 34 146 32C168 26 180 42 175 62Z';
  var tomoe = [0, 120, 240].map(function (r) { return '<path d="' + comma + '" transform="rotate(' + r + ' 160 160)"/>'; }).join('');
  return '<svg viewBox="0 0 320 320" aria-hidden="true"><defs>' +
    '<radialGradient id="cs-halo"><stop offset="70%" stop-color="#ed0b18" stop-opacity=".08"/><stop offset="90%" stop-color="#ed0b18" stop-opacity=".42"/><stop offset="100%" stop-color="#ed0b18" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="cs-core" cx="46%" cy="42%"><stop offset="0%" stop-color="#ff3948"/><stop offset="68%" stop-color="#ed0b18"/><stop offset="100%" stop-color="#a5000d"/></radialGradient></defs>' +
    '<circle cx="160" cy="160" r="159" fill="url(#cs-halo)"/><circle cx="160" cy="160" r="145" fill="#070306" stroke="#2b0309" stroke-width="5"/>' +
    '<circle cx="160" cy="160" r="136" fill="url(#cs-core)" stroke="#ff3040" stroke-opacity=".5" stroke-width="2"/>' +
    '<circle cx="160" cy="160" r="119" fill="none" stroke="#54050d" stroke-opacity=".72" stroke-width="2"/>' +
    '<g fill="#080205"><circle cx="160" cy="160" r="101" fill="none" stroke="#080205" stroke-width="6"/>' + tomoe + '</g>' +
    '<circle cx="160" cy="160" r="17" fill="#050204" stroke="#ff263e" stroke-width="4"/></svg>';
};
CS.spinner = function (text) {
  return CS.h('div.spin-wrap.inline', null, [CS.h('div.eye-spin', { html: CS.eyeSvg() }), text ? CS.h('div.spin-text', { text: text }) : null]);
};

var toastTimer = 0;
CS.toast = function (msg, ms) {
  var t = CS.$('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 3500);
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
