/*
 * Crimson Stream — Proprietary & Confidential
 * Copyright (c) 2026 محمد. All rights reserved.
 * Unauthorized copying, sharing or use of this file, by any means, is strictly prohibited.
 */
/* Subscriptions (crimson-hub POST /sub/check, its src/subs.js): the app tells the hub which Stremio account it is signed
   in to and which device it is (its name, system, the system's user name and an id), when it starts or signs in, every
   quarter hour while open, and when it comes back to the front. The owner can suspend an account or one device from his
   dashboard: then the video stops, this device's sign-in is wiped and «أُوقف الاشتراك» shows. A new account that has to
   wait for the owner shows «ينتظر الموافقة» until he lets it in. An app older than the lowest version he allows shows
   «لازم تحدّث» and fetches the update at once. No answer from the hub (no internet, hub down) stops nothing for a
   sign-in this device has already been let in with. A sign-in it has never been let in with waits for the hub's answer
   before the home screen, and with no answer it gets «ما قدرنا نتحقق»: blocking the hub on a device does not get round
   the owner's approval (the app is for his family and friends only). */
(function () {
  var ID_KEY = 'cs.deviceId';   /* this device's id: never wiped with the sign-in */
  var LAST_KEY = 'cs.subLast';  /* the last answer, so a suspended device stays shut out across restarts */
  var OK_KEY = 'cs.subOk';      /* marks of the sign-ins the hub has let in on this device (a hash of each key, never the key) */
  var every = 900, timer = 0, asking = null, lastAsk = 0, shown = '';
  var hold = false, resumeLater = null, answered = null, holdTimer = 0, askingKey = '';
  /* a held start shows «نتحقق من حسابك…» after this long. A screen has to be up within 15 s of a start on a new TV copy,
     or update.js does not clear cs.bundleTry and the next start marks the update bad (boot.js) */
  var HOLD_SCREEN_MS = 4000;

  function stored(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function keep(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* no storage: asked again */ } }
  function asUuid(hex) { return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32); }
  function randomId() {
    var b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return asUuid(Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''));
  }
  /* an id made from something the device keeps (the TV's own id), so it stays the same after the app's data is cleared */
  function idFrom(seed) {
    if (!seed || !(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('crimson-device\n' + seed)).then(function (h) {
      return asUuid(Array.prototype.map.call(new Uint8Array(h), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''));
    }, function () { return ''; });
  }
  function kind() { return window.CS_ANDROID ? 'phone' : CS.desktop ? 'pc' : CS.isTV ? 'tv' : 'web'; }

  /* the Windows and phone apps say it themselves (MainForm.DeviceInfo, MainActivity.deviceInfo) */
  var hostWait = null;
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function (e) {
      var m = e.data;
      if (m && m.t === 'device-info' && hostWait) { var f = hostWait; hostWait = null; f(m); }
    });
  }
  function fromHost() {
    return new Promise(function (ok) {
      hostWait = ok;
      CS.host({ t: 'device-info' });
      setTimeout(function () { if (hostWait === ok) { hostWait = null; ok({}); } }, 3000); /* an older program does not answer */
    });
  }
  function fromTv() {
    var ask = function (uri, p) { return Promise.race([CS.luna(uri, p), CS.sleep(3000).then(function () { return {}; })]); };
    return Promise.all([
      ask('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'sdkVersion'] }),
      ask('luna://com.webos.service.settings/getSystemSettings', { category: 'network', keys: ['deviceName'] }),
      ask('luna://com.webos.service.sm/deviceid/getIDs', { idType: ['LGUDID'] })
    ]).then(function (r) {
      var sys = r[0] || {}, net = (r[1] && r[1].settings) || {}, ids = (r[2] && r[2].idList) || [];
      var model = sys.modelName || '';
      return {
        name: net.deviceName || (model ? 'LG ' + model : 'تلفزيون LG'),
        os: 'webOS' + (sys.sdkVersion ? ' ' + sys.sdkVersion : '') + (model ? ' (' + model + ')' : ''),
        user: '',
        seed: ids[0] && ids[0].idValue || ''
      };
    });
  }
  function fromBrowser() {
    var ua = navigator.userAgent, os = /Windows NT 10/.test(ua) ? 'Windows' : /Android ([\d.]+)/.test(ua) ? 'Android ' + RegExp.$1 : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return Promise.resolve({ name: 'متصفح', os: os, user: '' });
  }

  var known = null;
  function device() {
    if (known) return Promise.resolve(known);
    var k = kind();
    var got = k === 'pc' || k === 'phone' ? fromHost() : k === 'tv' ? fromTv() : fromBrowser();
    return got.then(function (d) {
      var mine = stored(ID_KEY);
      var hostId = /^[0-9a-f-]{32,40}$/i.test(d.id || '') ? String(d.id).toLowerCase() : '';
      return (hostId ? Promise.resolve(hostId) : mine ? Promise.resolve(mine) : idFrom(d.seed)).then(function (id) {
        id = id || randomId();
        keep(ID_KEY, id);
        known = { id: id, name: String(d.name || '').slice(0, 80), os: String(d.os || '').slice(0, 60), user: String(d.user || '').slice(0, 60), app: k, version: CS.version || '' };
        return known;
      });
    });
  }

  function last() { try { return JSON.parse(stored(LAST_KEY) || 'null'); } catch (e) { return null; } }

  /* a short mark of a sign-in key (FNV-1a), enough to know it again without keeping the key twice */
  function mark(key) {
    var h = 0x811c9dc5;
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function marks() { return stored(OK_KEY).split(',').filter(Boolean); }
  function letInHere() { return !!CS.settings.authKey && marks().indexOf(mark(CS.settings.authKey)) >= 0; }
  /* on: the hub let this sign-in in. off: it stopped it (suspended or waiting), so it waits for the hub again */
  function remember(on, all) {
    if (!CS.settings.authKey && !all) return;
    var m = CS.settings.authKey ? mark(CS.settings.authKey) : '';
    var list = all ? [] : marks().filter(function (x) { return x !== m; });
    if (on) list.unshift(m);
    keep(OK_KEY, list.slice(0, 8).join(','));
  }

  /* asked now; the answer decides what shows. One ask at a time for a sign-in; an answer that comes back after the
     sign-in changed («ادخل بحساب ثاني» while it was still asking) is dropped, and the new sign-in is asked about itself */
  function check(why) {
    if (!CS.config.hubUrl) return Promise.resolve(null);
    var key = CS.settings.authKey || '';
    if (asking && askingKey === key) return asking;
    /* back in after an answer (back()): that answer, for the same sign-in, is not asked again */
    if (why === 'start' && answered && answered.key === key && Date.now() - answered.at < 5000) return Promise.resolve(answered.r);
    if (key && !letInHere()) {
      hold = true;
      /* only while a start or a sign-in waits for this answer: not over a screen already in use */
      clearTimeout(holdTimer);
      if (why === 'start' || why === 'sign-in') holdTimer = setTimeout(function () {
        var p = CS.player && CS.player.playing && CS.player.playing();
        if (hold && asking && !shown && !p) screen('checking', 'account');
      }, HOLD_SCREEN_MS);
    }
    lastAsk = Date.now();
    clearTimeout(timer);
    askingKey = key;
    var mine = asking = device().then(function (d) {
      d.version = CS.version || d.version;
      return CS.fetchJson(CS.config.hubUrl + '/sub/check', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', timeout: 15000,
        body: JSON.stringify({ key: key, device: d })
      });
    });
    var stale = function () {
      if (asking === mine) asking = null;
      if ((CS.settings.authKey || '') === key) return false;
      CS.log('subscription answer for another sign-in, dropped', why);
      if (!asking) plan(every);
      return true;
    };
    mine = mine.then(function (r) {
      if (stale()) return null;
      clearTimeout(holdTimer);
      if (!r || !r.state) { unanswered(why, 'no state'); return null; }
      answered = { key: key, at: Date.now(), r: r };
      apply(r, why);
      return r;
    }, function (e) {
      if (stale()) return null;
      clearTimeout(holdTimer);
      unanswered(why, e.message);
      return null;
    });
    asking = mine;
    return mine;
  }
  /* no answer: a sign-in already let in here carries on; one never let in here waits on «ما قدرنا نتحقق» */
  function unanswered(why, err) {
    CS.log('subscription not checked', why, err);
    if (hold && CS.settings.authKey && (!shown || shown === 'checking')) whenStill(function () { screen('unchecked', 'account'); });
    plan(shown ? 60 : every);
  }
  function plan(sec) {
    clearTimeout(timer);
    timer = setTimeout(function () { if (CS.settings.authKey || shown) check('timer'); else plan(every); }, sec * 1000);
  }

  function apply(r, why) {
    every = Math.max(60, Math.min(86400, +r.every || 900));
    if (r.state === 'suspended') {
      keep(LAST_KEY, JSON.stringify({ state: r.state, scope: r.scope, at: Date.now() }));
      remember(false, r.scope === 'device');
      CS.log('subscription suspended', r.scope, why);
      stop(r.scope);
    } else if (r.state === 'update') {
      keep(LAST_KEY, '');
      CS.log('older than the lowest version allowed', CS.version, r.min, why);
      mustUpdate(String(r.min || ''));
    } else if (r.state === 'pending') {
      keep(LAST_KEY, '');
      remember(false);
      waiting();
    } else {
      keep(LAST_KEY, '');
      remember(true);
      hold = false;
      var f = resumeLater; resumeLater = null;
      /* «نتحقق…» was only the wait: the start goes on from where it stopped (or by itself, if it had not got that far) */
      if (shown === 'checking') { shown = ''; if (f) f(); }
      else if (shown) { CS.log('subscription back', shown); shown = ''; back(); }
      else if (f) f(); /* the start waited for this answer: it goes on from where it stopped */
    }
    plan(r.state === 'pending' ? Math.min(every, 60) : every);
  }

  /* the video stops, this device leaves the account (in Stremio too), and the cached lists of the account go */
  function signOut() {
    if (!CS.settings.authKey) return;
    if (CS.together && CS.settings.room) { try { CS.together.leave(); } catch (e) { /* not in a room after all */ } }
    try { CS.profiles.signedOut(); } catch (e) { /* no profiles yet */ }
    CS.api.logout();
    CS.settings.authKey = '';
    CS.settings.email = '';
    CS.settings.room = null;
    CS.saveSettings();
    CS.cache.drop('addons');
    CS.cache.drop('lib');
  }
  function whenStill(go) {
    var p = CS.player && CS.player.playing && CS.player.playing();
    if (p) CS.player.stop().then(go, go); else go();
  }
  function stop(scope) {
    if (shown === 'stop' && !CS.settings.authKey) return; /* already showing, with nothing left to wipe */
    whenStill(function () {
      signOut();
      screen('stop', scope);
    });
  }
  function waiting() {
    if (shown === 'pending') return;
    whenStill(function () { screen('pending', 'account'); });
  }
  /* older than the lowest version the owner allows: the video stops (the sign-in stays) and the update is fetched at once */
  function mustUpdate(min) {
    if (shown === 'update') return;
    whenStill(function () { getUpdate(screen('update', min)); });
  }
  /* the update, the way «حدّث الآن» gets it on each version: the TV fetches the new screens and starts again on them by
     itself; the PC and the phone fetch it with its progress on the update bar, and the next press puts it in (the PC's
     installer, which opens the app again; Android's own window, where the viewer agrees) */
  function getUpdate(note) {
    if (CS.desktop) {
      CS.host({ t: 'check-update' });
      if (note) note.textContent = window.CS_ANDROID
        ? 'ننزّل التحديث. أول ما يجهز اضغط «حدّث الآن» ووافق في نافذة أندرويد.'
        : 'ننزّل التحديث وتشوف وين وصل تحت. أول ما يجهز اضغط «حدّث الآن»، والبرنامج يقفل ويرجع يفتح لحاله.';
      return;
    }
    if (!(CS.update && CS.update.now)) { if (note) note.textContent = 'حدّث التطبيق من المكان اللي نزّلته منه.'; return; }
    if (note) note.textContent = 'ننزّل التحديث…';
    CS.update.now().then(function (ok) {
      if (note && !ok) note.textContent = 'ما قدرنا ننزّل التحديث. تأكد من الإنترنت وجرّب مرة ثانية.';
      else if (note) note.textContent = 'جاهز، نعيد تشغيل التطبيق…';
    });
  }
  /* let in again: back to where a start would go */
  function back() {
    if (CS.settings.authKey) CS.enter(false);
    else CS.views.login();
  }

  function screen(what, scope) {
    shown = what;
    var h = CS.h;
    var note = h('p.login-note', { text: '' });
    var again = function () {
      note.textContent = 'نتحقق…';
      check('again').then(function (r) {
        if (!r) note.textContent = 'ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.';
        else if (r.state !== 'active' && shown === what) note.textContent = what === 'pending' ? 'للحين ما وافق. بنتحقق لحالنا كل دقيقة.' : what === 'update' ? 'للحين لازم تحدّث.' : 'للحين موقوف.';
      });
    };
    var other = function () { signOut(); shown = ''; hold = false; resumeLater = null; clearTimeout(holdTimer); CS.views.login(); };
    var title, lead, btns;
    if (what === 'checking') {
      title = 'نتحقق من حسابك…';
      lead = 'أول مرة تدخل بهالحساب على هالجهاز. ثواني ونكمل.';
      /* the harmless one first: it has the TV's focus, and an OK pressed while waiting must not sign anyone out */
      btns = [h('button.btn.primary.f', { onclick: again }, 'تحقّق الحين'), h('button.btn.f', { onclick: other }, 'ادخل بحساب ثاني')];
    } else if (what === 'unchecked') {
      title = 'ما قدرنا نتحقق من حسابك';
      lead = 'أول مرة تدخل بهالحساب على هالجهاز، ولازم نتأكد من السيرفر قبل لا تكمل. تأكد إن الإنترنت شغال، وبنحاول لحالنا كل دقيقة.';
      btns = [h('button.btn.primary.f', { onclick: again }, 'جرّب مرة ثانية'), h('button.btn.f', { onclick: other }, 'ادخل بحساب ثاني')];
    } else if (what === 'update') {
      title = 'لازم تحدّث التطبيق';
      lead = 'نسختك' + (CS.version ? ' (' + CS.version + ')' : '') + ' قديمة، وصاحب التطبيق يبي الكل على نسخة ' + scope + ' أو أحدث. حدّث وكمّل من مكانك، وحسابك ما يتأثر.';
      btns = [h('button.btn.primary.f', { onclick: function () { getUpdate(note); } }, 'حدّث الآن'), h('button.btn.f', { onclick: again }, 'تحقّق مرة ثانية')];
    } else if (what === 'pending') {
      title = 'حسابك ينتظر الموافقة';
      lead = 'دخلت بحساب Stremio جديد على Crimson Stream، ولازم يوافق عليه صاحب التطبيق أول. خلّ التطبيق مفتوح، وأول ما يوافق تكمل على طول.';
      btns = [h('button.btn.primary.f', { onclick: again }, 'تحقّق الحين'), h('button.btn.f', { onclick: other }, 'ادخل بحساب ثاني')];
    } else {
      title = 'أُوقف الاشتراك';
      lead = scope === 'device'
        ? 'هالجهاز موقوف من Crimson Stream، وطلعناه من حسابك عليه. إذا تحسب إنه خطأ، كلّم صاحب التطبيق.'
        : 'اشتراك حسابك في Crimson Stream موقوف، وطلعناه من هالجهاز. إذا تحسب إنه خطأ، كلّم صاحب التطبيق.';
      btns = [h('button.btn.primary.f', { onclick: again }, 'تحقّق مرة ثانية')];
      if (scope !== 'device') btns.push(h('button.btn.f', { onclick: function () { shown = ''; CS.views.login(); } }, 'ادخل بحساب ثاني'));
    }
    if (CS.desktop) btns.push(h('button.btn.f', { onclick: function () { CS.host({ t: 'exit' }); } }, 'اطلع'));
    var el = h('section.screen.login.sub-stop', null, h('div.login-box', null, [
      h(what === 'checking' ? 'div.login-eye' : 'div.login-eye.still', { html: CS.eyeSvg() }), /* it turns only while it waits */
      h('h1.sub-title', { text: title }),
      h('p.login-lead', { text: lead }),
      note,
      h('div.sub-btns.group', null, btns)
    ]));
    CS.nav.reset({ name: 'sub-' + what, el: el });
    return note;
  }

  CS.sub = {
    check: check,
    /* the start, before the account or the sign-in: a device suspended last time stays shut out until the hub says otherwise */
    atStart: function () {
      var l = last();
      if (l && l.state === 'suspended' && (l.scope === 'device' || !CS.settings.authKey)) {
        screen('stop', l.scope);
        check('start');
        return true;
      }
      if (!CS.settings.authKey) plan(every);
      return false;
    },
    /* while «أُوقف الاشتراك» or «ينتظر الموافقة» shows, the start does not go on to the home screen behind it. A sign-in
       never let in on this device also waits for the hub's first answer: resume carries the start on once it lets it in */
    blocked: function (resume) {
      if (shown && shown !== 'checking') return true;
      if (hold && CS.settings.authKey) { resumeLater = resume || null; return true; }
      return false;
    },
    device: device
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && (CS.settings.authKey || shown) && Date.now() - lastAsk > 120e3) check('front');
  });
})();
