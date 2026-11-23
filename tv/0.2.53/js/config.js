/* Values that differ from one home to another, kept in one place (the version comes from appinfo.json). */
var CS = window.CS || {};
window.CS = CS;

CS.config = {
  ports: { stremioServer: 11470, speeder: 11480, devlog: 11481 },
  /* the Arabic subtitles add-on: always asked, even when it is not in the account */
  arabicSubsUrl: 'https://arabic-subs.aeneme9.workers.dev',
  hubUrl: 'https://crimson-hub.aeneme9.workers.dev', /* crimson-hub on Cloudflare: subtitles fitted by the owner's PC for a TV that cannot reach it. Empty: not in use */
  arabicSubsId: 'faz3a.arabic.subtitles',
  /* the ⚡ add-on on the PC */
  speederId: 'local.stremio.speeder',
  /* the add-on from torrentio-cloud.aeneme9.workers.dev: the same sources from any network, right after the PC's */
  cloudId: 'crimson.torrentio.cloud'
};
