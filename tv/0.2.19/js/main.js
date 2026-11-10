/* Start-up, the clock, leaving the app, and what happens when the TV puts the app in the background. */
(function () {
  /* the version has one home: appinfo.json (read with XHR: the TV loads the app from local files, where fetch() refuses) */
  CS.version = '';
  (function () {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', 'appinfo.json');
      x.onload = function () { try { CS.version = window.CS_BUNDLE || JSON.parse(x.responseText).version || ''; } catch (e) { /* stays empty */ } };
      x.send();
    } catch (e) { /* stays empty */ }
  })();

  function tickClock() {
    var d = new Date();
    var t = d.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
    Array.prototype.forEach.call(document.querySelectorAll('[data-clock]'), function (c) { c.textContent = t; });
  }

  CS.start = function (justSignedIn) {
    var t0 = Date.now();
    var ready = Promise.all([CS.addons.load(!!justSignedIn), CS.lib.load()]);
    /* with a cached add-on list the home screen shows at once; otherwise it waits for the list */
    var cached = CS.cache.get('addons');
    var go = function () {
      CS.views.home();
      CS.log('home shown', (Date.now() - t0) + 'ms', CS.addons.all().length + ' add-ons');
    };
    if (cached && cached.length && !justSignedIn) { go(); ready.then(function () { var hs = CS.views.home_(); if (hs) hs.redrawCW(); }); }
    else ready.then(go);
  };

  /* signed in: the account's profiles are read first (they may have been made on another device), then "who is
     watching" when there is more than one. A device that has read them before waits less for a slow answer */
  var entering = false, inApp = false;
  CS.enter = function (justSignedIn) {
    if (justSignedIn) CS.profiles.signedIn();
    var t0 = Date.now();
    entering = true; inApp = false;
    CS.profiles.sync(CS.profiles.seen() ? 1500 : 5000).then(function () {
      entering = false; inApp = true;
      CS.log('profiles read', (Date.now() - t0) + 'ms', CS.profiles.list().length);
      if (CS.profiles.askAtStart()) CS.views.profiles(true, justSignedIn);
      else CS.start(justSignedIn);
    });
  };

  /* the main profile's PIN was changed on another device while this one is in it: out to "who is watching", where the
     new PIN is asked (and the trust made again) */
  CS.onMainRelocked = function () {
    if (entering || !inApp) return; /* start-up decides by itself */
    CS.log('main profile PIN changed elsewhere: out to the picker');
    var out = function () {
      CS.views.profiles(true);
      CS.toast('تغيّر رمز الملف الرئيسي من جهاز ثاني، اكتب الرمز الجديد');
    };
    if (CS.player.playing()) CS.player.stop().then(out, out); else out();
  };
  /* a look at the account now and then, and when the app comes back to the front, so such a change is not missed */
  function profilesCheck() { if (inApp && CS.settings.authKey) CS.profiles.sync(); }
  setInterval(profilesCheck, 5 * 60e3);

  CS.onAddonsChanged = function () {
    var hs = CS.views.home_();
    if (hs && hs.el.isConnected) hs.redrawRows();
  };
  CS.onSignedOut = function () {
    CS.settings.authKey = '';
    CS.saveSettings();
    CS.toast('انتهى الربط بحساب Stremio — اربطه من جديد');
    CS.views.login();
  };
  CS.onPlayerClosed = function () {
    var t = CS.nav.top();
    if (t && t.shown) t.shown();
  };

  CS.exitApp = function () {
    var box = CS.h('section.screen.confirm', null, CS.h('div.confirm-box', null, [
      CS.h('p', { text: 'تطلع من Crimson Stream؟' }),
      CS.h('div.confirm-btns.group', null, [
        CS.h('button.btn.primary.f', { onclick: function () {
          var bye = function () { if (CS.desktop) CS.host({ t: 'exit' }); else window.close(); };
          CS.lib.flush().then(bye, bye);
        } }, 'اطلع'),
        CS.h('button.btn.f', { onclick: function () { CS.nav.pop(); } }, 'لا، خلني')
      ])
    ]));
    CS.nav.push({ name: 'confirm', modal: true, el: box, defaultFocus: function () { return box.querySelectorAll('.f')[1]; } });
  };

  /* the TV sends the app to the background (Home button, another app): pause and save */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { profilesCheck(); return; }
    var p = CS.player.playing();
    if (p) { try { CS.$('video').pause(); } catch (e) { /* nothing */ } }
    CS.player.flush();
    CS.lib.flush();
  });
  window.addEventListener('beforeunload', function () { CS.lib.flush(); });

  document.addEventListener('DOMContentLoaded', function () {
    if (CS.settings.debug && CS.settings.pc && !CS.settings.logUrl) CS.settings.logUrl = 'http://' + CS.settings.pc + ':' + CS.config.ports.devlog + '/log';
    if (!CS.settings.debug) CS.settings.logUrl = '';
    CS.log('start', CS.version, navigator.userAgent);
    CS.player.init();
    tickClock();
    setInterval(tickClock, 15000);
    document.body.classList.toggle('tv', CS.isTV);
    /* more than one profile: "who is watching" first, with the last one used in focus */
    if (CS.settings.authKey) CS.enter(false);
    else CS.views.login();
  });
})();
