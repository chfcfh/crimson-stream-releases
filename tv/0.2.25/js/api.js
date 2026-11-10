/* The Stremio account: sign-in by code (approved from the phone), the add-on list, and the library (continue watching). */
(function () {
  var API = 'https://api.strem.io/api/';
  var LINK = 'https://link.stremio.com/api/v2/';

  function call(method, body) {
    return CS.fetchJson(API + method, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, timeout: 15000, cache: 'no-store' })
      .then(function (r) {
        if (r.error) { var e = new Error(r.error.message || 'api error'); e.code = r.error.code; throw e; }
        return r.result;
      });
  }

  CS.api = {
    /* a code the user approves at link.stremio.com while signed in on the phone */
    linkCreate: function () {
      return CS.fetchJson(LINK + 'create?type=Create', { cache: 'no-store' }).then(function (r) { return r.result || r; });
    },
    /* resolves with the authKey once approved; null while still waiting */
    linkRead: function (code) {
      return CS.fetchJson(LINK + 'read?type=Read&code=' + encodeURIComponent(code), { cache: 'no-store' })
        .then(function (r) { return r && r.result && r.result.authKey ? r.result.authKey : null; })
        .catch(function () { return null; });
    },
    user: function () { return call('getUser', { authKey: CS.settings.authKey }); },
    logout: function () { return call('logout', { authKey: CS.settings.authKey }).catch(function () { /* already gone */ }); },
    addons: function () {
      return call('addonCollectionGet', { authKey: CS.settings.authKey, update: true }).then(function (r) { return r.addons || []; });
    },
    library: function () {
      return call('datastoreGet', { authKey: CS.settings.authKey, collection: 'libraryItem', ids: [], all: true });
    },
    libraryGet: function (ids) {
      return call('datastoreGet', { authKey: CS.settings.authKey, collection: 'libraryItem', ids: ids, all: false });
    },
    libraryPut: function (items) {
      return call('datastorePut', { authKey: CS.settings.authKey, collection: 'libraryItem', changes: items });
    }
  };
})();
