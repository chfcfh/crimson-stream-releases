/* The TV version's updates: a newer copy of the screens is fetched from the public releases page (checked against its
   SHA-256 list), kept in storage and used from the next start (boot.js). The Windows version updates as a program. */
(function () {
  if (CS.desktop) return;
  var BASE = 'https://raw.githubusercontent.com/chfcfh/crimson-stream-releases/main/tv/';

  /* this start reached the screens: the copy it runs is good */
  setTimeout(function () {
    if (CS.nav && CS.nav.top && CS.nav.top()) { try { localStorage.removeItem('cs.bundleTry'); } catch (e) { /* nothing to clear */ } }
  }, 10000);

  function get(url) {
    return new Promise(function (ok, fail) {
      var x = new XMLHttpRequest();
      x.open('GET', url);
      x.timeout = 30000;
      x.onload = function () { if (x.status === 200) ok(x.responseText); else fail(new Error('HTTP ' + x.status)); };
      x.onerror = x.ontimeout = function () { fail(new Error('no connection')); };
      x.send();
    });
  }
  function sha(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }
  function file(dir, f) {
    return get(dir + f.path + '?v=' + encodeURIComponent(f.sha256)).then(function (text) {
      return sha(text).then(function (h) {
        if (h && h !== f.sha256) throw new Error('changed in transit: ' + f.path);
        return text;
      });
    });
  }

  function check() {
    var running = window.CS_BUNDLE || CS.version;
    get(BASE + 'version.json?t=' + Date.now()).then(function (t) {
      var v = JSON.parse(t);
      if (!v || !v.version || !window.CS_NEWER(v.version, running)) return;
      if (localStorage.getItem('cs.bundleBad') === v.version) return;
      var kept = null;
      try { kept = JSON.parse(localStorage.getItem('cs.bundle') || 'null'); } catch (e) { /* none */ }
      if (kept && kept.version === v.version) return; /* already here, used from the next start */
      var dir = BASE + v.version + '/';
      var all = [v.css, v.body].concat(v.scripts);
      return Promise.all(all.map(function (f) { return file(dir, f); })).then(function (texts) {
        var bundle = { version: v.version, css: texts[0], body: texts[1], scripts: texts.slice(2) };
        localStorage.setItem('cs.bundle', JSON.stringify(bundle));
        CS.log('update ready', v.version);
        CS.toast('نزل تحديث ' + v.version + ' — يتطبّق المرة الجاية تفتح التطبيق', 7000);
      });
    }).catch(function (e) { CS.log('update not fetched', e.message); });
  }
  setTimeout(check, 30000);
})();
