/* «UFC» in the sports world (the owner's wish, 2026-11-17: «ابي نفسها للUFC… تفاصيل و كل الاخبار و كل شيء حرفياً مثل تفاصيل ودقة الكورة»).
   The same channel as football's (sportworld.js), drawn with its parts (CS.sw), for fight nights:
   - The first world is the fight night, the one on now, else the next one, else the last. Its main event is a face-off on the stage: each
     fighter cut out on his corner's colour (red on the right, blue on the left), the time left to the main card, else the round on now,
     else how it ended. Under it: the whole card by its parts, the nights to come, the last results, each division's ranking, the news.
   - A favourite fighter's world: his record large, how he wins, his next bout counted down, his fights one after another, his numbers,
     where he stands in his division, his news, his story.
   - A favourite division's world: its champion, its fifteen, its bouts to come.
   - A bout's page: the two side by side line by line (the tale of the tape), the judges' cards, how each did lately.
   Data: crimson-hub's /sport/ufc/* (ESPN's cards and fighters, UFC.com's rankings, Wikipedia's Arabic names, Arabic news). Favourites are
   kept per profile beside football's (CS.settings.sportFavs[profile].ufc). */
(function () {
  var h = CS.h, sw = CS.sw;
  var RED = '#c8102e', BLUE = '#1d5fd1', GOLD = '#d9a520';
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  /* ---------- favourites, per profile, beside football's ---------- */
  function ubox() { var b = sw.box(); return b.ufc || (b.ufc = { list: [], cur: 0 }); }
  function favs() { return ubox().list; }
  function fkey(f) { return f.kind + ':' + f.id; }
  function isFav(kind, id) { return favs().some(function (f) { return f.kind === kind && String(f.id) === String(id); }); }
  function toggleFav(f) {
    var box = ubox(), at = box.list.map(fkey).indexOf(fkey(f));
    if (at >= 0) { box.list.splice(at, 1); if (box.cur > box.list.length) box.cur = 0; }
    else if (box.list.length >= 10) { CS.toast('عشر مفضلات بالكثير: شيل وحدة أول'); return false; }
    else box.list.push(f);
    CS.saveSettings();
    return at < 0;
  }
  /* what is on the stage now (the world redraws when it changes): 0 is the fight night, then the favourites */
  function key() { var b = ubox(); return 'ufc|' + (b.cur || 0) + '|' + b.list.map(fkey).join(','); }
  /* a name as both sources write it: «Jiří Procházka» and «Jiri Prochazka» are one */
  function nameKey(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, ''); }
  function favOfFighter(f) { return { kind: 'fighter', id: nameKey(f.name), name: f.name, ar: f.ar || '', espn: f.espn ? String(f.espn) : '', div: f.key || f.div || '' }; }
  function favOfDivision(d) { return { kind: 'division', id: d.key, name: d.name, ar: d.ar }; }

  /* ---------- words ---------- */
  function fn(f) { return f ? (f.ar || f.name || '') : ''; }
  function last(f) { var w = fn(f).trim().split(/\s+/); return w[w.length - 1] || ''; }
  /* «UFC Fight Night: Adesanya vs Magomedov» → «UFC فايت نايت: Adesanya ضد Magomedov» (the hub's own Arabic name comes when it has one) */
  function evName(e) { return e.ar || String(e.name || '').replace(/^UFC Fight Night/i, 'UFC فايت نايت').replace(/\s+vs\.?\s+/i, ' ضد '); }
  function rounds(n) { return n === 5 ? '5 جولات' : n === 3 ? '3 جولات' : n + ' جولات'; }
  function endWords(b) {
    if (!b || !b.done) return '';
    return [b.method ? b.method.ar : 'انتهى', b.round && b.method && b.method.key !== 'dec' && b.method.key !== 'draw' ? 'الجولة ' + b.round : '', b.method && /ko|sub|dq/.test(b.method.key) ? b.clock : ''].filter(Boolean).join(' · ');
  }
  function winnerOf(b) { return b && b.winner ? b[b.winner] : null; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function age(n) { return n ? n + ' سنة' : '—'; }
  /* ESPN's feet and inches as centimetres: 5' 10" → 178 سم; 74" → 188 سم */
  function cm(s) {
    var m = /(\d+)'\s*(\d+(?:\.\d+)?)?/.exec(s || ''), r = /^(\d+(?:\.\d+)?)"$/.exec(String(s || '').trim());
    if (m) return Math.round((+m[1] * 12 + (+m[2] || 0)) * 2.54) + ' سم';
    if (r) return Math.round(+r[1] * 2.54) + ' سم';
    return s || '—';
  }
  function kg(s) { var m = /(\d+(?:\.\d+)?)\s*lbs/i.exec(s || ''); return m ? Math.round(+m[1] * 0.4536) + ' كغ' : s || '—'; }
  var STANCE = { Orthodox: 'تقليدية (يمين)', Southpaw: 'معكوسة (يسار)', Switch: 'متبدّلة' };

  /* ---------- small pieces ---------- */
  var BELT = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 9.5h4.2M17.3 9.5h4.2M2.5 14.5h4.2M17.3 14.5h4.2"/><rect x="6.7" y="6.5" width="10.6" height="11" rx="3"/><circle cx="12" cy="12" r="2.4"/></svg>';
  var OCTAGON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M9.6 7.4h4.8l3.2 3.2v2.8l-3.2 3.2H9.6l-3.2-3.2v-2.8z" opacity=".55"/></svg>';
  var ARROW = { up: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.2 10.4 8.6H1.6z" fill="currentColor"/></svg>', down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 9.8 1.6 3.4h8.8z" fill="currentColor"/></svg>' };
  function sized(url, w) { return String(url || '').replace(/&w=\d+&h=\d+/, '&w=' + w + '&h=' + Math.round(w * 436 / 600)); }
  function headOf(id, w) { return id ? 'https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/' + id + '.png&w=' + w + '&h=' + Math.round(w * 436 / 600) : ''; }
  /* a fighter cut out (ESPN's picture has no background); none, or one that does not load: his initial on his corner's colour */
  function face(f, cls, w) {
    var box = h('span.uf-face' + (cls ? '.' + cls : ''));
    var src = f && (f.img ? sized(f.img, w || 300) : headOf(f.espn || f.id, w || 300));
    var blank = function () { box.innerHTML = ''; box.classList.add('blank'); box.appendChild(h('b', { text: (fn(f) || '?').charAt(0) })); };
    if (src) {
      var img = h('img', { src: src, alt: '', loading: 'lazy', decoding: 'async' });
      img.onerror = blank;
      box.appendChild(img);
    } else blank();
    return box;
  }
  function flag(f) { return f && f.flag ? h('img.uf-flag', { src: f.flag, alt: f.country || '', title: f.country || '', loading: 'lazy' }) : null; }
  function rankTag(f) {
    if (!f) return null;
    if (f.champ) return h('span.uf-rank.champ', { html: BELT + '<span>البطل</span>' });
    return f.rank ? h('span.uf-rank', { text: '#' + f.rank }) : null;
  }
  function count(target) {
    var el = h('div.sw-count');
    var tick = function () {
      var left = Math.max(0, Date.parse(target) - Date.now()), d = Math.floor(left / 864e5), hr = Math.floor(left % 864e5 / 36e5), mi = Math.floor(left % 36e5 / 6e4);
      el.innerHTML = '';
      [[d, 'يوم'], [hr, 'ساعة'], [mi, 'دقيقة']].forEach(function (x, i) {
        if (i === 0 && !d) return;
        el.appendChild(h('span.sw-count-part', null, [h('b', { text: String(x[0]).padStart(i ? 2 : 1, '0') }), h('small', { text: x[1] })]));
      });
    };
    tick();
    el._tick = tick;
    return el;
  }
  /* the hour the main card starts (the night's first bouts start hours before it) */
  function mainAt(ev) { return (ev.parts && ev.parts[0] && ev.parts[0].at) || (ev.bouts && ev.bouts[0] && ev.bouts[0].at) || ev.at; }
  /* the bout to show on the stage: the one on now, else the next one to go in (the card runs from its foot up to the main event), else the main event */
  function boutNow(ev) {
    var b = ev.bouts || [];
    return b.filter(function (x) { return x.state === 'in'; })[0] || (ev.state === 'in' ? b.filter(function (x) { return !x.done; }).slice(-1)[0] : null) || b[0] || null;
  }

  /* ---------- streams: the live add-ons' fight nights, matched by the main event's names ---------- */
  function streamOf(ev, items) {
    var b = ev && ev.bouts && ev.bouts[0];
    if (!b) return null;
    var a = sw.norm(String(b.red.name).split(' ').slice(-1)[0]), c = sw.norm(String(b.blue.name).split(' ').slice(-1)[0]);
    var num = (/UFC\s+(\d+)/i.exec(ev.name || '') || [])[1];
    return (items || []).filter(function (it) {
      var n = ' ' + sw.norm(it.name) + ' ';
      return (a && c && n.indexOf(' ' + a + ' ') >= 0 && n.indexOf(' ' + c + ' ') >= 0) || (num && new RegExp('\\bufc ' + num + '\\b').test(n));
    })[0] || null;
  }

  /* ================= the face-off: two fighters, their corners' colours, what is between them ================= */
  function corners(stage) {
    sw.paint(stage, { color: RED, alt: '#ffffff' });
    sw.paintAway(stage, { color: BLUE, alt: '#ffffff' });
    stage.appendChild(h('i.sw-band.uf-band.pair'));
    stage.appendChild(h('i.sw-band.away.uf-band.pair'));
  }
  function plate(f, side, won) {
    return h('div.uf-plate.' + side + (won === true ? '.won' : won === false ? '.lost' : ''), null, [
      h('div.uf-plate-name', { text: fn(f) }),
      h('div.uf-plate-line', null, [flag(f), h('span.uf-record', { text: f.record || '' }), rankTag(f)])
    ]);
  }
  /* the middle: the time left, the round on now, or how it ended; then what the bout is */
  function middle(b, ev) {
    var mid = h('div.uf-mid');
    if (b.state === 'in') {
      mid.appendChild(h('div.uf-live', null, [h('span.sw-live', { text: 'مباشر' }), h('span', { text: b.round ? 'الجولة ' + b.round : '' })]));
      mid.appendChild(h('div.uf-clock', { text: b.clock || '' }));
    } else if (b.done) {
      var w = winnerOf(b);
      mid.appendChild(h('div.uf-result', null, [h('small', { text: w ? 'الفائز' : 'النتيجة' }), h('b', { text: w ? last(w) : (b.method ? b.method.ar : 'انتهى') })]));
      mid.appendChild(h('div.uf-how', { text: endWords(b) }));
      if (b.cards && b.cards.length) mid.appendChild(h('div.uf-cards-mini', { text: b.cards.map(function (c) { return c[0] + '-' + c[1]; }).join('  ·  ') }));
    } else {
      var isMain = !!(ev && ev.bouts && b === ev.bouts[0]);
      mid.appendChild(h('span.uf-vs', { text: isMain ? 'باقي على البطاقة الرئيسية' : 'باقي على النزال' }));
      var c = count(isMain ? mainAt(ev) : b.at);
      mid.appendChild(c);
      mid._tick = c._tick;
      /* the night starts before its main card: when its prelims go on */
      var pre = isMain && ev.parts && ev.parts.length > 1 ? ev.parts[ev.parts.length - 1] : null;
      mid.appendChild(h('div.uf-when', { text: pre && pre.at ? pre.ar + ' من ' + sw.when(pre.at) : sw.when(isMain ? mainAt(ev) : b.at) }));
    }
    var what = [ev && ev.bouts && b === ev.bouts[0] ? 'النزال الرئيسي' : '', b.wcAr, rounds(b.rounds)].filter(Boolean).join(' · ');
    mid.appendChild(h('div.uf-what', null, [b.title ? h('span.uf-belt', { html: BELT + '<span>على الحزام</span>' }) : null, h('span', { text: what })]));
    return mid;
  }
  function faceOff(b, ev, acts) {
    var won = function (side) { return b.done && b.winner ? b.winner === side : null; };
    var mid = middle(b, ev);
    if (acts) mid.appendChild(acts);
    var box = h('div.uf-faceoff' + (b.state === 'in' ? '.on-air' : '') + (b.done ? '.done' : ''), null, [
      h('div.uf-corner.red' + (won('red') === false ? '.lost' : ''), null, [face(b.red, 'big', 600), plate(b.red, 'red', won('red'))]),
      mid,
      h('div.uf-corner.blue' + (won('blue') === false ? '.lost' : ''), null, [face(b.blue, 'big', 600), plate(b.blue, 'blue', won('blue'))])
    ]);
    box._tick = mid._tick;
    return box;
  }

  /* ================= the sections ================= */
  /* one bout of a card: the red corner on the right, the blue on the left, between them the division and the rounds, or how it ended */
  function boutRow(b, open, isMain) {
    var won = function (side) { return b.done && b.winner ? (b.winner === side ? '.won' : '.lost') : ''; };
    var side = function (f, s) {
      return h('span.uf-bout-side.' + s + won(s), null, [face(f, 'small', 200), h('span.uf-bout-who', null, [
        h('span.uf-bout-name', { text: fn(f) }), h('span.uf-bout-line', null, [flag(f), h('span', { text: f.record || '' }), rankTag(f)])
      ]), b.done && b.winner === s ? h('span.uf-won', { text: 'فاز' }) : null]);
    };
    var mid = h('span.uf-bout-mid', null, [
      b.title ? h('span.uf-belt', { html: BELT }) : null,
      h('span.uf-bout-wc', { text: b.wcAr }),
      b.state === 'in' ? h('span.sw-live', { text: 'مباشر' + (b.round ? ' · ج' + b.round : '') }) : b.done ? h('span.uf-bout-end', { text: endWords(b) }) : h('span.uf-bout-rounds', { text: rounds(b.rounds) })
    ]);
    return h('button.uf-bout.f' + (isMain ? '.main' : '') + (b.state === 'in' ? '.on-air' : '') + (b.done ? '.done' : ''), { onclick: function () { open(b); } }, [side(b.red, 'red'), mid, side(b.blue, 'blue')]);
  }
  function segCard(ev, openBout) {
    if (!ev || !ev.bouts || !ev.bouts.length) return null;
    var by = {};
    ev.bouts.forEach(function (b) { by[b.id] = b; });
    var seg = h('section.sw-seg.uf-card', null, [sw.title('البطاقة', ev.bouts.length + ' نزال' + (ev.venue ? ' · ' + ev.venue : ''))]);
    ev.parts.forEach(function (p, pi) {
      seg.appendChild(h('div.uf-part-head', null, [h('h3', { text: p.ar }), h('span', { text: (p.at ? sw.when(p.at) + ' · ' : '') + p.ids.length + ' نزالات' })]));
      p.ids.forEach(function (id, i) { if (by[id]) seg.appendChild(boutRow(by[id], function (b) { boutPage(b, ev); }, pi === 0 && i === 0)); });
    });
    seg._start = function () { return seg.querySelector('.uf-bout.on-air') || seg.querySelector('.uf-bout'); };
    return seg;
  }
  /* the nights to come and the last results: a line of nights, each its date, its name, its main event */
  function nightTile(n, done) {
    var d = new Date(n.at), main = n.main;
    return h('button.uf-night.f' + (done ? '.done' : ''), { onclick: function () { eventPage(n.id, n.m, n); } }, [
      h('span.uf-night-date', null, [h('b', { text: String(d.getDate()) }), h('small', { text: MONTHS[d.getMonth()] })]),
      h('span.uf-night-words', null, [
        h('span.uf-night-name', { text: evName(n) }),
        main && done ? h('span.uf-night-main', { text: winnerOf(main) ? 'فاز ' + fn(winnerOf(main)) + ' · ' + (main.method ? main.method.ar : '') : endWords(main) })
          : h('span.uf-night-main', { text: sw.day(n.at) + ' · ' + sw.clock(n.at) })
      ])
    ]);
  }
  function segNights(list, done, titleText) {
    if (!list || !list.length) return null;
    var track = h('div.htrack', null, list.map(function (n) { return nightTile(n, done); }));
    return h('section.sw-seg.uf-nights', null, [sw.title(titleText, list.length + (done ? ' ليالٍ' : ' ليالٍ جاية')), h('div.row.group', null, h('div.hscroll', { 'data-pad': '120' }, track))]);
  }
  /* each division's ranking: its chips across, then its champion and its fifteen; a name opens his page */
  function openByName(r) {
    if (r.espn) { fighterPage(r.espn); return; }
    CS.toast('لحظة، نجيب ' + fn(r) + '…');
    sw.ask('ufc/find?name=' + encodeURIComponent(r.name), 30 * 864e5).then(function (x) { if (x && x.id) fighterPage(x.id); else CS.toast('ما لقينا صفحة ' + fn(r)); },
      function () { CS.toast('ما لقينا صفحة ' + fn(r)); });
  }
  function rankList(d, me) {
    var wrap = h('div.uf-ranks-box'), list = h('div.uf-ranks');
    /* the fifteen down the right column first, then the left: as a ranking is read */
    list.style.gridTemplateRows = 'repeat(' + Math.ceil(d.ranks.length / 2) + ', auto)';
    if (d.champ) wrap.appendChild(h('button.uf-rank-row.champ.f' + (me && nameKey(d.champ.name) === me ? '.mine' : ''), { onclick: function () { openByName(d.champ); } }, [
      h('span.uf-rank-n', { html: BELT }), h('span.uf-rank-name', { text: fn(d.champ) }), h('span.uf-rank-note', { text: 'البطل' })
    ]));
    d.ranks.forEach(function (r) {
      var move = r.fresh ? h('span.uf-move.fresh', { text: 'جديد' }) : r.move > 0 ? h('span.uf-move.up', { html: ARROW.up + '<span>' + r.move + '</span>' }) : r.move < 0 ? h('span.uf-move.down', { html: ARROW.down + '<span>' + (-r.move) + '</span>' }) : h('span.uf-move');
      list.appendChild(h('button.uf-rank-row.f' + (me && nameKey(r.name) === me ? '.mine' : ''), { onclick: function () { openByName(r); } }, [
        h('span.uf-rank-n', { text: String(r.n) }), h('span.uf-rank-name', { text: fn(r) }), move
      ]));
    });
    wrap.appendChild(list);
    return wrap;
  }
  function segRanks(R, first, me, only) {
    var divs = (R && R.divisions) || [];
    if (!divs.length) return null;
    var cur = divs.filter(function (d) { return d.key === first; })[0] || divs[0];
    var seg = h('section.sw-seg.uf-rankings', null, [sw.title(only ? 'تصنيف ' + cur.ar : 'التصنيف', 'الرسمي من UFC')]);
    var body = h('div.uf-ranks-wrap');
    var draw = function () { body.innerHTML = ''; body.appendChild(rankList(cur, me)); };
    if (!only) {
      var chips = h('div.row.group.genre-row.uf-div-chips', null, h('div.hscroll', null, h('div.htrack', null, divs.map(function (d) {
        var c = h('button.chip.f' + (d === cur ? '.on' : ''), { onclick: function () { cur = d; Array.prototype.forEach.call(chips.querySelectorAll('.chip'), function (x) { x.classList.toggle('on', x === c); }); draw(); } }, d.ar);
        return c;
      }))));
      seg.appendChild(chips);
    }
    seg.appendChild(body);
    draw();
    return seg;
  }
  function segWatch(ev) {
    var seg = h('section.sw-seg.sw-watch.group', null, [sw.title('شاهد')]);
    var row = h('div.sw-watch-row');
    seg.appendChild(row);
    row.appendChild(h('button.sw-watch-all.f', { onclick: function () { CS.views.browse('sport'); } }, [h('span.sw-watch-ico', { html: CS.icon('play') }), h('span', { text: 'كل البث المباشر' })]));
    sw.streamsNow().then(function (items) {
      var it = ev && streamOf(ev, items);
      if (!it || !row.isConnected) return;
      row.insertBefore(h('button.sw-watch-one.f', { onclick: function () { sw.watch(it); } }, [h('span', { text: evName(ev) }), h('span.sw-live', { text: ev.state === 'in' ? 'مباشر' : sw.day(mainAt(ev)) })]), row.lastChild);
    }, function () { });
    return seg;
  }

  /* ================= the rail: the fight night first, then the favourites ================= */
  function favFace(f) {
    if (f.kind === 'division') return h('span.uf-rail-div', { html: BELT });
    return face(f, 'rail', 160);
  }
  function rail(cur, pick) {
    var items = [{ kind: 'night', name: 'ليلة النزال' }].concat(favs());
    return h('div.sw-rail.group.uf-rail', null, items.map(function (f, i) {
      var b = h('button.sw-rail-fav.f' + (i === cur ? '.on' : ''), { onclick: function () { pick(i); }, 'aria-label': fn(f) || f.name }, [
        f.kind === 'night' ? h('span.uf-rail-night', { html: OCTAGON }) : favFace(f), h('span.sw-rail-name', { text: fn(f) || f.name })
      ]);
      b.style.setProperty('--fav', f.kind === 'division' ? GOLD : RED);
      return b;
    }).concat([h('button.sw-rail-add.f', { onclick: pickFavs, 'aria-label': 'مفضلاتي' }, [h('span.ico-wrap', { html: CS.icon('plus') }), h('span.sw-rail-name', { text: 'مفضلاتي' })])]));
  }
  function favButton(f) {
    var on = isFav(f.kind, f.id);
    var b = h('button.btn.f.sw-fav-btn' + (on ? '.on' : ''), null, CS.iconKids(on ? 'check' : 'heart', on ? 'من مفضلاتك' : 'أضفه لمفضلاتك'));
    b.onclick = function () { var now = toggleFav(f); CS.setIcon(b, now ? 'check' : 'heart', now ? 'من مفضلاتك' : 'أضفه لمفضلاتك'); b.classList.toggle('on', now); CS.toast(now ? 'انضاف لمفضلاتك' : 'انشال من مفضلاتك'); };
    return b;
  }

  /* ================= the worlds ================= */
  function goNews(page) { return function () { var n = page.querySelector('.sw-news .f'); if (n) CS.nav.focus(n); }; }
  function goCard(page) { return function () { var s = page.querySelector('.uf-card'); var f = s && (s._start ? s._start() : s.querySelector('.f')); if (f) CS.nav.focus(f); }; }

  /* the fight night: H is the hub's home (or one night alone: {next: ev}) */
  function drawNight(page, stage, H, opts) {
    var ev = H.live || H.next || H.last;
    stage.innerHTML = '';
    corners(stage);
    if (opts.rail) stage.appendChild(opts.rail);
    if (!ev) {
      stage.appendChild(h('div.sw-id.uf-id', null, [sw.nameEl('UFC'), h('div.sw-id-line', { text: 'ما فيه ليلة نزال معروفة الحين' })]));
      return { tick: function () { } };
    }
    var b = boutNow(ev);
    var title = (ev.state === 'in' ? 'الحين: ' : ev.state === 'post' ? 'آخر ليلة: ' : '') + evName(ev);
    stage.appendChild(h('div.uf-id', null, [h('h1.sw-name.uf-title' + (title.length > 30 ? '.long' : ''), { text: title }),
      h('div.sw-id-line', { text: [ev.state === 'post' ? sw.day(ev.at) : 'البطاقة الرئيسية ' + sw.when(mainAt(ev)), ev.venue, ev.city].filter(Boolean).join('   ') }), opts.favBtn || null]));
    var acts = h('div.sw-bug-acts.group');
    if (b) acts.appendChild(h('button.btn.f.primary', { onclick: function () { boutPage(b, ev); } }, CS.iconKids('list', 'تفاصيل النزال')));
    acts.appendChild(h('button.btn.f', { onclick: goCard(page) }, ev.state === 'post' ? 'كل النتائج' : 'البطاقة كاملة'));
    var fo = b ? faceOff(b, ev, acts) : null;
    if (fo) stage.appendChild(fo);
    sw.streamsNow().then(function (items) {
      var it = streamOf(ev, items);
      if (it && acts.isConnected) acts.insertBefore(h('button.btn.f.watch', { onclick: function () { sw.watch(it); } }, CS.iconKids('play', ev.state === 'in' ? 'شاهد الحين' : 'البث')), acts.firstChild);
    }, function () { });
    var tk = sw.ticker(H.news, 'UFC', goNews(page));
    if (tk) stage.appendChild(tk);

    var segs = [segCard(ev, boutPage)];
    if (H.live && H.next && H.next !== ev) segs.push(segNights([{ id: H.next.id, name: H.next.name, ar: H.next.ar, at: H.next.at, m: monthOf(H.next.at) }], false, 'الليلة الجاية'));
    segs.push(segNights((H.nights || []).filter(function (n) { return n.id !== ev.id; }), false, 'الليالي الجاية'));
    segs.push(segNights(H.results, true, 'آخر النتائج'));
    var ranks = h('section.sw-seg.uf-rankings.wait', null, [sw.title('التصنيف')]);
    segs.push(ranks);
    sw.ask('ufc/rankings', 6 * 3600e3).then(function (R) {
      var s = segRanks(R, (b && b.key) || 'p4p');
      if (s && ranks.isConnected) { ranks.replaceWith(s); refreshBar(page, stage); } else ranks.remove();
    }, function () { ranks.remove(); });
    segs.push(sw.segNews(H.news, 'UFC'));
    segs.push(segWatch(ev));
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(sw.segBar(page));
    if (!(H.news && H.news.length)) lateNews(page, stage, 'يو إف سي', 'UFC');
    return { tick: function () { if (fo && fo._tick) fo._tick(); }, live: ev.state === 'in' };
  }
  function refreshBar(page, stage) {
    var old = stage.querySelector('.sw-segbar');
    if (old) old.replaceWith(sw.segBar(page));
  }
  function lateNews(page, stage, q, label) {
    sw.newsHere(q).then(function (list) {
      if (!list.length || !stage.isConnected || page.querySelector('.sw-news')) return;
      var tk = sw.ticker(list, label, goNews(page));
      if (tk) stage.appendChild(tk);
      var seg = sw.segNews(list, label);
      if (!seg) return;
      page.insertBefore(seg, page.querySelector('.sw-about, .sw-watch'));
      refreshBar(page, stage);
    });
  }
  function monthOf(at) { var d = new Date(at); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0'); }

  /* how he wins, as one bar cut in three (by knockout, by submission, by the judges), and his last five */
  function winsBar(F) {
    var all = F.ko + F.sub + F.dec || 1;
    var part = function (n, cls, word) { return n ? h('i.' + cls, { style: { flexGrow: String(n) }, title: word + ' ' + n }) : null; };
    return h('div.uf-wins', null, [
      h('div.sw-mini-head', null, [h('span.sw-mini-label', { text: 'كيف يفوز' }), h('span.sw-ladder-gap', { text: F.wins + ' فوز' })]),
      h('div.uf-wins-bar', null, [part(F.ko, 'ko', 'ضربة قاضية'), part(F.sub, 'sub', 'استسلام'), part(F.dec, 'dec', 'قرار')]),
      h('div.uf-wins-keys', null, [['ko', 'ضربة قاضية', F.ko], ['sub', 'استسلام', F.sub], ['dec', 'قرار الحكام', F.dec]].map(function (k) {
        return h('span.uf-wins-key.' + k[0], null, [h('i'), h('span', { text: k[1] }), h('b', { text: String(k[2]) + ' · ' + pct(k[2], all) + '٪' })]);
      }))
    ]);
  }
  function lastFive(hist) {
    var list = (hist || []).filter(function (x) { return x.result; }).slice(0, 5);
    if (!list.length) return null;
    return h('div.sw-form.uf-form', null, [h('span.sw-mini-label', { text: 'آخر ' + list.length })].concat(list.map(function (x) {
      var r = x.result === 'W' ? 'W' : x.result === 'L' ? 'L' : 'D';
      return h('span.sw-form-cell.' + r, { title: x.resultAr + ' ' + (x.opp ? fn(x.opp) : '') }, [h('b', { text: x.result === 'W' ? 'ف' : x.result === 'L' ? 'خ' : 'ت' }), h('small', { text: x.method === 'ضربة قاضية' ? 'KO' : x.method === 'استسلام' ? 'SUB' : x.method === 'قرار الحكام' ? 'DEC' : '' })]);
    })));
  }
  /* his fights one after another: done on the right, the next on the left, now between (football's path, drawn for bouts) */
  function segHistory(P) {
    var done = (P.history || []).slice(0, 12).reverse();
    if (!done.length && !P.next) return null;
    var node = function (x) {
      return h('button.sw-node.uf-node.f.done.' + (x.result === 'W' ? 'W' : x.result === 'L' ? 'L' : 'D'), { onclick: function () { if (x.opp && x.opp.id) fighterPage(x.opp.id); } }, [
        h('span.sw-node-day', { text: (x.event.short || '') + ' · ' + sw.day(x.at) }), face({ espn: x.opp && x.opp.id, name: x.opp && x.opp.name, ar: x.opp && x.opp.ar }, 'small', 200),
        h('span.sw-node-vs', { text: 'ضد ' + (x.opp ? fn(x.opp) : '') }),
        h('span.uf-node-end', null, [h('b', { text: x.resultAr }), h('span', { text: [x.method, x.round ? 'الجولة ' + x.round : ''].filter(Boolean).join(' · ') })]),
        x.title ? h('span.uf-belt.tiny', { html: BELT }) : null
      ]);
    };
    var kids = done.map(node).concat([h('div.sw-now', null, h('span', { text: 'الآن' }))]);
    if (P.next) {
      var nb = P.next.bout, me = P.fighter.id, other = nb.red.id === me ? nb.blue : nb.red;
      kids.push(h('button.sw-node.uf-node.f.next', { onclick: function () { boutPage(nb, null, P.next.event); } }, [
        h('span.sw-node-day', { text: sw.when(nb.at || P.next.event.at) }), face(other, 'small', 200), h('span.sw-node-vs', { text: 'ضد ' + fn(other) }),
        h('span.uf-node-end', null, [h('span', { text: evName(P.next.event) })])
      ]));
    }
    var track = h('div.htrack', null, kids);
    var seg = h('section.sw-seg.sw-path', null, [sw.title('المشوار', (P.history || []).length + ' نزال في UFC وغيرها'), h('div.row.group.sw-path-row', null, h('div.hscroll', { 'data-pad': '160' }, track))]);
    seg._start = function () { return track.querySelector('.uf-node.next') || track.querySelector('.uf-node:last-of-type'); };
    return seg;
  }
  /* his numbers, added up over his fights that ESPN counted */
  function segNumbers(P) {
    var c = P.career;
    if (!c || !c.fights) return null;
    var per = function (n) { return (n / c.fights).toFixed(1); };
    var tiles = [
      [per(c.ssl), 'ضربة مؤثرة بالنزال'], [pct(c.ssl, c.ssa) + '٪', 'دقة ضرباته المؤثرة'], [String(c.kd), 'مرة أسقط خصمه'],
      [per(c.tdl), 'طرحة بالنزال'], [c.tda ? pct(c.tdl, c.tda) + '٪' : '—', 'نجاح الطرحات'], [String(c.sub), 'محاولة إخضاع']
    ];
    var seg = h('section.sw-seg.uf-numbers', null, [sw.title('الأرقام', 'من ' + c.fights + ' نزال')]);
    seg.appendChild(h('div.row.group.uf-num-row', null, tiles.map(function (t) { return h('button.uf-num.f', null, [h('b', { text: t[0] }), h('small', { text: t[1] })]); })));
    var all = c.head + c.body + c.leg;
    if (all) seg.appendChild(h('div.uf-target', null, [h('span.sw-mini-label', { text: 'وين يضرب' })].concat([['head', 'الرأس', c.head], ['body', 'الجسم', c.body], ['leg', 'الساق', c.leg]].map(function (t) {
      return h('div.uf-target-row', null, [h('span', { text: t[1] }), h('span.uf-target-bar', null, h('i.' + t[0], { style: { width: pct(t[2], all) + '%' } })), h('b', { text: pct(t[2], all) + '٪' })]);
    }))));
    return seg;
  }
  function drawFighter(page, stage, P, opts) {
    var F = P.fighter;
    sw.paint(stage, { color: RED, alt: '#ffffff' });
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band.uf-band'));
    stage.appendChild(h('div.sw-mark.uf-mark', null, face(F, 'big', 600)));
    if (opts.rail) stage.appendChild(opts.rail);
    var line = [F.nick ? '«' + F.nick + '»' : '', F.wcAr, F.age ? F.age + ' سنة' : '', F.country].filter(Boolean);
    stage.appendChild(h('div.sw-id', null, [sw.nameEl(fn(F)), h('div.uf-id-record', null, [h('b', { text: F.record || '' }), h('small', { text: 'فوز · خسارة · تعادل' }), flag(F), rankTag(F)]),
      h('div.sw-id-line', { text: line.join('   ') }), opts.favBtn || null]));
    /* the corner graphic: his next bout counted down, else his last one and how it ended */
    var box = h('div.sw-bug.uf-bug');
    var tickBox = null;
    if (P.next) {
      var nb = P.next.bout, other = nb.red.id === F.id ? nb.blue : nb.red;
      var c = count(nb.at || P.next.event.at);
      tickBox = c;
      box.appendChild(h('div.uf-bug-row', null, [face(other, 'small', 200), h('div.uf-bug-words', null, [h('small', { text: 'نزاله الجاي · ' + evName(P.next.event) }), h('b', { text: 'ضد ' + fn(other) }), h('span', null, [[nb.wcAr, rounds(nb.rounds)].filter(Boolean).join(' · '), other.record ? ' · ' : '', other.record ? h('bdi.uf-record', { text: other.record }) : null])])]));
      box.appendChild(h('div.uf-bug-foot', null, [c, h('div.sw-bug-acts.group', null, [h('button.btn.f.primary', { onclick: function () { boutPage(nb, null, P.next.event); } }, CS.iconKids('list', 'تفاصيل النزال'))])]));
    } else if (P.history && P.history[0]) {
      var x = P.history[0];
      box.classList.add(x.result === 'W' ? 'won' : x.result === 'L' ? 'lost' : 'even');
      box.appendChild(h('div.uf-bug-row', null, [face({ espn: x.opp && x.opp.id, name: x.opp && x.opp.name, ar: x.opp && x.opp.ar }, 'small', 200), h('div.uf-bug-words', null, [
        h('small', { text: 'آخر نزال · ' + sw.day(x.at) }), h('b', { text: x.resultAr + ' ضد ' + (x.opp ? fn(x.opp) : '') }), h('span', { text: [x.method, x.round ? 'الجولة ' + x.round : '', x.clock, x.event.short].filter(Boolean).join(' · ') })
      ])]));
      box.appendChild(h('div.sw-bug-acts.group', null, [h('button.btn.f.primary', { onclick: function () { if (x.opp && x.opp.id) fighterPage(x.opp.id); } }, CS.iconKids('list', 'صفحة ' + (x.opp ? last(x.opp) : 'خصمه')))]));
    } else box.appendChild(h('div.sw-bug-none', { text: 'ما له نزال معروف' }));
    stage.appendChild(box);
    var side = h('div.sw-side-col');
    if (F.wins) side.appendChild(winsBar(F));
    var l5 = lastFive(P.history);
    if (l5) side.appendChild(l5);
    stage.appendChild(side);
    var tk = sw.ticker(P.news, last(F), goNews(page));
    if (tk) stage.appendChild(tk);
    var segs = [segHistory(P), segNumbers(P)];
    var ranks = h('section.sw-seg.uf-rankings.wait', null, [sw.title('وزنه')]);
    if (F.rankKey || F.key) {
      segs.push(ranks);
      sw.ask('ufc/rankings', 6 * 3600e3).then(function (R) { var s = segRanks(R, F.rankKey || F.key, nameKey(F.name), true); if (s && ranks.isConnected) { ranks.replaceWith(s); refreshBar(page, stage); } else ranks.remove(); }, function () { ranks.remove(); });
    }
    segs.push(sw.segNews(P.news, fn(F)));
    segs.push(sw.segAbout(P.about));
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(sw.segBar(page));
    if (!(P.news && P.news.length)) lateNews(page, stage, fn(F) + ' UFC', last(F));
    return { tick: function () { if (tickBox && tickBox._tick) tickBox._tick(); } };
  }
  /* a division: its champion on the band, its fifteen, its bouts to come (from the nights the hub knows) */
  function drawDivision(page, stage, d, H, opts) {
    sw.paint(stage, { color: GOLD, alt: '#ffffff' });
    stage.innerHTML = '';
    stage.appendChild(h('i.sw-band.uf-band.gold'));
    var mark = h('div.sw-mark.uf-mark');
    stage.appendChild(mark);
    if (d.champ) sw.ask('ufc/find?name=' + encodeURIComponent(d.champ.name), 30 * 864e5).then(function (x) { if (x && x.id && mark.isConnected) mark.appendChild(face({ espn: x.id, name: d.champ.name }, 'big', 600)); }, function () { });
    if (opts.rail) stage.appendChild(opts.rail);
    stage.appendChild(h('div.sw-id', null, [sw.nameEl(d.ar), h('div.sw-id-line', { text: [d.champ ? 'البطل: ' + fn(d.champ) : '', d.ranks.length + ' مصنّف'].filter(Boolean).join('   ') }), opts.favBtn || null]));
    var bouts = [];
    [H && H.live, H && H.next].filter(Boolean).forEach(function (ev) { ev.bouts.forEach(function (b) { if (b.key === d.key && !b.done) bouts.push({ b: b, ev: ev }); }); });
    var box = h('div.sw-bug.uf-bug'), tickBox = null;
    if (bouts.length) {
      var x = bouts[0];
      tickBox = count(x.b.at);
      box.appendChild(h('div.uf-bug-row', null, [h('div.uf-bug-words', null, [h('small', { text: x.b.title ? 'نزال على الحزام' : 'نزال الوزن الجاي' }), h('b', { text: fn(x.b.red) + ' ضد ' + fn(x.b.blue) }), h('span', { text: evName(x.ev) })]), tickBox]));
      box.appendChild(h('div.sw-bug-acts.group', null, [h('button.btn.f.primary', { onclick: function () { boutPage(x.b, x.ev); } }, CS.iconKids('list', 'تفاصيل النزال'))]));
    } else box.appendChild(h('div.sw-bug-none', { text: 'ما فيه نزال معروف في هالوزن بالليلة الجاية' }));
    stage.appendChild(box);
    var side = h('div.sw-side-col');
    var top = h('div.sw-ladder.uf-ladder', null, [h('div.sw-mini-head', null, [h('span.sw-mini-label', { text: 'القمة' })])].concat((d.champ ? [{ champ: true, r: d.champ }] : []).concat(d.ranks.slice(0, 4).map(function (r) { return { r: r }; })).map(function (x) {
      return h('button.sw-ladder-row.uf-ladder-row.f' + (x.champ ? '.mine' : ''), { onclick: function () { openByName(x.r); } }, [h('span.sw-ladder-pos', x.champ ? { html: BELT } : { text: String(x.r.n) }), h('span.sw-ladder-name', { text: fn(x.r) })]);
    })));
    side.appendChild(top);
    stage.appendChild(side);
    var segs = [segRanks({ divisions: [d] }, d.key, '', true)];
    if (bouts.length) {
      var seg = h('section.sw-seg.uf-card', null, [sw.title('نزالات الوزن الجاية', bouts.length + ' نزال')]);
      bouts.forEach(function (x) { seg.appendChild(boutRow(x.b, function (b) { boutPage(b, x.ev); })); });
      segs.push(seg);
    }
    segs.filter(Boolean).forEach(function (s) { page.appendChild(s); });
    stage.appendChild(sw.segBar(page));
    lateNews(page, stage, d.ar.replace(/^ال/, '') + ' يو إف سي', d.ar);
    return { tick: function () { if (tickBox && tickBox._tick) tickBox._tick(); } };
  }

  /* draws the world chosen on the rail into the sports section's screen (sportworld.js sportWorld) */
  function world(w, o) {
    var box = ubox(), list = box.list;
    if (box.cur > list.length) box.cur = 0;
    var cur = box.cur || 0, f = cur ? list[cur - 1] : null;
    if (!o.quiet) sw.loading(w.stage);
    var r = rail(cur, function (i) {
      if (i === (ubox().cur || 0)) return;
      ubox().cur = i; CS.saveSettings();
      var g = i ? favs()[i - 1] : null;
      sw.sweep(w.el, g && g.kind === 'division' ? GOLD : RED, function () { o.redraw(false, true); });
    });
    var alive = o.alive;
    var done = function (p) {
      if (!alive()) return;
      w.set(p);
      if (o.done) o.done();
      var on = w.stage.querySelector('.sw-rail .on');
      if (o.keepRail && on) { CS.nav.focus(on, 'instant'); return; }
      if (!o.quiet && (!CS.nav.current() || !w.el.contains(CS.nav.current()) || CS.nav.current().classList.contains('tab'))) CS.nav.focus(w.screen.defaultFocus() || on, 'instant');
      else CS.nav.refocus();
    };
    var fail = function () { if (alive()) { sw.failed(w.stage, o.again); if (o.done) o.done(); } };
    if (!f) {
      return sw.ask('ufc/home', 2 * 60e3, function () { if (alive()) o.redraw(true); }).then(function (H) {
        if (!alive()) return;
        sw.clear(w.page, w.stage);
        var p = drawNight(w.page, w.stage, H, { rail: r });
        /* a night on now: its card asked again each minute while this screen is on top */
        if (p.live) p.tick = (function (t) { var n = 0; return function () { t(); if (++n % 3 === 0 && CS.nav.top() === w.screen) sw.ask('ufc/home', 20e3).then(function () { if (alive()) o.redraw(true); }, function () { }); }; })(p.tick);
        done(p);
      }, fail);
    }
    if (f.kind === 'division') {
      return Promise.all([sw.ask('ufc/rankings', 6 * 3600e3), sw.ask('ufc/home', 5 * 60e3).catch(function () { return null; })]).then(function (x) {
        if (!alive()) return;
        var d = x[0].divisions.filter(function (v) { return v.key === f.id; })[0];
        if (!d) { fail(); return; }
        sw.clear(w.page, w.stage);
        done(drawDivision(w.page, w.stage, d, x[1], { rail: r }));
      }, fail);
    }
    var withId = f.espn ? Promise.resolve(f.espn) : sw.ask('ufc/find?name=' + encodeURIComponent(f.name), 30 * 864e5).then(function (x) {
      if (x && x.id) { f.espn = x.id; CS.saveSettings(); }
      return x && x.id;
    });
    return withId.then(function (id) {
      if (!id) throw new Error('no id');
      return sw.ask('ufc/fighter/' + id, 30 * 60e3);
    }).then(function (P) {
      if (!alive()) return;
      if (P.fighter.ar && !f.ar) { f.ar = P.fighter.ar; CS.saveSettings(); }
      sw.clear(w.page, w.stage);
      done(drawFighter(w.page, w.stage, P, { rail: r }));
    }, fail);
  }

  /* ================= pages ================= */
  function page(fill) {
    var w = sw.worldScreen({});
    sw.loading(w.stage);
    var go = function () { fill(w, go); };
    go();
    return w;
  }
  function fighterPage(id) {
    page(function (w, go) {
      sw.ask('ufc/fighter/' + id, 30 * 60e3).then(function (P) {
        sw.clear(w.page, w.stage);
        w.set(drawFighter(w.page, w.stage, P, { favBtn: favButton(favOfFighter({ name: P.fighter.name, ar: P.fighter.ar, espn: P.fighter.id, key: P.fighter.rankKey || P.fighter.key })) }));
        CS.nav.focus(w.screen.defaultFocus(), 'instant');
      }, function () { sw.failed(w.stage, go); });
    });
  }
  function eventPage(id, m, seed) {
    page(function (w, go) {
      sw.ask('ufc/event/' + id + '?m=' + (m || monthOf(seed && seed.at)), 60e3).then(function (ev) {
        sw.clear(w.page, w.stage);
        w.set(drawNight(w.page, w.stage, ev.state === 'post' ? { last: ev, news: [] } : { next: ev, news: [] }, {}));
        CS.nav.focus(w.screen.defaultFocus(), 'instant');
      }, function () { sw.failed(w.stage, go); });
    });
  }
  /* a bout: the face-off, the tale of the tape (both fighters' pages asked), the judges' cards, how each did lately */
  function boutPage(b, ev, evLite) {
    var w = sw.worldScreen({});
    w.el.classList.add('uf-bout-page');
    var stage = w.stage;
    stage.innerHTML = '';
    corners(stage);
    var where = ev || evLite || {};
    stage.appendChild(h('div.uf-id', null, [h('h1.sw-name.uf-title', { text: fn(b.red) + ' ضد ' + fn(b.blue) }),
      h('div.sw-id-line', { text: [evName(where), b.wcAr, rounds(b.rounds)].filter(Boolean).join('   ') })]));
    var acts = h('div.sw-bug-acts.group', null, [
      h('button.btn.f', { onclick: function () { if (b.red.id) fighterPage(b.red.id); } }, last(b.red)),
      h('button.btn.f', { onclick: function () { if (b.blue.id) fighterPage(b.blue.id); } }, last(b.blue))
    ]);
    var fo = faceOff(b, ev && ev.bouts && ev.bouts[0] === b ? ev : null, acts);
    stage.appendChild(fo);
    w.set({ tick: function () { if (fo._tick) fo._tick(); } });
    var tape = h('section.sw-seg.uf-tape.wait', null, [sw.title('وجهًا لوجه', 'سطر بسطر')]);
    w.page.appendChild(tape);
    if (b.cards && b.cards.length) {
      var cards = h('section.sw-seg.uf-judges', null, [sw.title('بطاقات الحكام', endWords(b))]);
      cards.appendChild(h('div.row.group.uf-judge-row', null, b.cards.map(function (c, i) {
        var lead = c[0] > c[1] ? b.red : c[1] > c[0] ? b.blue : null;
        return h('button.uf-judge.f', null, [h('small', { text: 'الحكم ' + (i + 1) }), h('b', null, [h('span.red', { text: String(c[0]) }), ' - ', h('span.blue', { text: String(c[1]) })]), h('span', { text: lead ? 'لـ' + last(lead) : 'تعادل' })]);
      })));
      w.page.appendChild(cards);
    }
    CS.nav.focus(w.screen.defaultFocus(), 'instant');
    var ask = function (f) { return f && f.id ? sw.ask('ufc/fighter/' + f.id, 30 * 60e3).catch(function () { return null; }) : Promise.resolve(null); };
    Promise.all([ask(b.red), ask(b.blue)]).then(function (two) {
      var R = two[0], B = two[1];
      if (!tape.isConnected) return;
      if (!R && !B) { tape.remove(); return; }
      var fr = (R && R.fighter) || {}, fb = (B && B.fighter) || {}, cr = (R && R.career) || {}, cb = (B && B.career) || {};
      var rows = [
        ['السجل', fr.record || b.red.record, fb.record || b.blue.record],
        ['العمر', age(fr.age), age(fb.age), fr.age, fb.age, -1],
        ['الطول', cm(fr.height), cm(fb.height), parseFloat(cm(fr.height)), parseFloat(cm(fb.height)), 1],
        ['مدى الذراع', cm(fr.reach), cm(fb.reach), parseFloat(cm(fr.reach)), parseFloat(cm(fb.reach)), 1],
        ['الوزن', kg(fr.weight), kg(fb.weight)],
        ['الوقفة', STANCE[fr.stance] || fr.stance || '—', STANCE[fb.stance] || fb.stance || '—'],
        ['بالضربة القاضية', String(fr.ko != null ? fr.ko : '—'), String(fb.ko != null ? fb.ko : '—'), fr.ko, fb.ko, 1],
        ['بالاستسلام', String(fr.sub != null ? fr.sub : '—'), String(fb.sub != null ? fb.sub : '—'), fr.sub, fb.sub, 1],
        ['بقرار الحكام', String(fr.dec != null ? fr.dec : '—'), String(fb.dec != null ? fb.dec : '—'), fr.dec, fb.dec, 1],
        ['ضربات مؤثرة بالنزال', cr.fights ? (cr.ssl / cr.fights).toFixed(1) : '—', cb.fights ? (cb.ssl / cb.fights).toFixed(1) : '—', cr.fights && cr.ssl / cr.fights, cb.fights && cb.ssl / cb.fights, 1],
        ['دقة الضربات', cr.ssa ? pct(cr.ssl, cr.ssa) + '٪' : '—', cb.ssa ? pct(cb.ssl, cb.ssa) + '٪' : '—', cr.ssa && cr.ssl / cr.ssa, cb.ssa && cb.ssl / cb.ssa, 1],
        ['طرحات بالنزال', cr.fights ? (cr.tdl / cr.fights).toFixed(1) : '—', cb.fights ? (cb.tdl / cb.fights).toFixed(1) : '—', cr.fights && cr.tdl / cr.fights, cb.fights && cb.tdl / cb.fights, 1],
        ['النادي', fr.gym || '—', fb.gym || '—'],
        ['البلد', fr.country || b.red.country || '—', fb.country || b.blue.country || '—']
      ];
      var fresh = h('section.sw-seg.uf-tape', null, [sw.title('وجهًا لوجه', 'سطر بسطر'), h('div.uf-tape-head', null, [h('span.red', { text: fn(b.red) }), h('span'), h('span.blue', { text: fn(b.blue) })])].concat(rows.map(function (r) {
        /* a number both have: the better one marked (more is better, except age) */
        var edge = r[5] && r[3] != null && r[4] != null && r[3] !== r[4] && !isNaN(r[3]) && !isNaN(r[4]) ? ((r[3] > r[4]) === (r[5] > 0) ? 'red' : 'blue') : '';
        return h('button.uf-tape-row.f', null, [h('span.v.red' + (edge === 'red' ? '.edge' : ''), { text: r[1] || '—' }), h('span.k', { text: r[0] }), h('span.v.blue' + (edge === 'blue' ? '.edge' : ''), { text: r[2] || '—' })]);
      })));
      tape.replaceWith(fresh);
      /* how each did lately: their last five side by side */
      var l5 = h('section.sw-seg.uf-lately', null, [sw.title('آخر نزالاتهم')]);
      [[R, b.red, 'red'], [B, b.blue, 'blue']].forEach(function (x) {
        var strip = x[0] && lastFive(x[0].history);
        if (strip) l5.appendChild(h('button.uf-lately-row.f.' + x[2], { onclick: function () { if (x[1].id) fighterPage(x[1].id); } }, [h('span.uf-lately-name', { text: fn(x[1]) }), strip]));
      });
      if (l5.children.length > 1) w.page.appendChild(l5);
    });
  }

  /* ================= the favourites' picker: fighters by division, or a division itself ================= */
  function pickFavs() {
    var el = h('section.screen.sw.sw-pick.uf-pick');
    var head = h('div.sw-pick-head', null, [h('h1', { text: 'مفضلاتك في UFC' }), h('p', { text: 'اختر مقاتلك أو وزنك: يطلع فوق في UFC، وتصير له قناته.' })]);
    var kinds = h('div.row.group.sw-pick-seg');
    var divs = h('div.row.group.genre-row.sw-pick-leagues', null, h('div.hscroll', null, h('div.htrack')));
    var mine = h('div.sw-pick-mine.group');
    var body = h('div.vtrack', null, [head, mine, kinds, divs]);
    el.appendChild(CS.views.topbar(null));
    el.appendChild(h('div.rows.vscroll.sw-scroll', { 'data-pad': '120' }, body));
    if (window.CS_ANDROID) el.appendChild(h('button.m-back', { 'aria-label': 'رجوع', html: CS.icon('back'), onclick: function () { CS.nav.pop(); } }));
    var screen = { name: 'uf-pick', el: el, defaultFocus: function () { return el.querySelector('.sw-pick-seg .on') || el.querySelector('.f'); } };
    CS.nav.push(screen);
    var grid = null, kind = 'fighters', div = 'p4p';
    function drawMine() {
      mine.innerHTML = '';
      if (!favs().length) { mine.appendChild(h('p.sw-pick-none', { text: 'ما اخترت شي للحين.' })); return; }
      favs().forEach(function (f) {
        mine.appendChild(h('button.sw-pick-chosen.f', { onclick: function () { toggleFav(f); drawMine(); paint(); } }, [favFace(f), h('span', { text: fn(f) }), h('span.ico-wrap', { html: CS.icon('close') })]));
      });
    }
    function paint() { if (grid) Array.prototype.forEach.call(grid.querySelectorAll('.sw-pick-tile'), function (b) { b.classList.toggle('on', !!(b._f && isFav(b._f.kind, b._f.id))); }); }
    function tile(f, faceEl, words) {
      var b = h('button.sw-pick-tile.uf-pick-tile.f', { onclick: function () { toggleFav(f); paint(); drawMine(); } }, [faceEl, h('span', { text: words })]);
      b._f = f;
      return b;
    }
    function fill() {
      divs.style.display = kind === 'fighters' ? '' : 'none';
      if (grid) grid.remove();
      grid = h('div.sw-pick-wait', null, CS.skel.cards(6));
      body.appendChild(grid);
      sw.ask('ufc/rankings', 6 * 3600e3).then(function (R) {
        var g = h('div.sw-pick-grid');
        if (kind === 'divisions') {
          R.divisions.filter(function (d) { return !/p4p/.test(d.key); }).forEach(function (d) { g.appendChild(tile(favOfDivision(d), h('span.uf-rail-div', { html: BELT }), d.ar)); });
        } else {
          var d = R.divisions.filter(function (x) { return x.key === div; })[0] || R.divisions[0];
          var people = (d.champ ? [{ r: d.champ, tag: 'البطل' }] : []).concat(d.ranks.map(function (r) { return { r: r, tag: '#' + r.n }; }));
          people.forEach(function (p) {
            g.appendChild(tile(favOfFighter({ name: p.r.name, ar: p.r.ar, key: d.key === 'p4p' || d.key === 'w-p4p' ? '' : d.key }), h('span.uf-pick-rank' + (p.tag === 'البطل' ? '.champ' : ''), p.tag === 'البطل' ? { html: BELT } : { text: p.tag }), fn(p.r)));
          });
        }
        grid.remove();
        grid = h('div.sw-pick-body', null, g);
        body.appendChild(grid);
        paint();
        CS.nav.refocus();
      }, function () { grid.remove(); grid = CS.errorState({ title: 'ما قدرنا نجيب التصنيف', reason: 'خدمة الرياضة ما ردّت. جرّب بعد شوي.', retry: fill }); body.appendChild(grid); });
    }
    var mark = function (row, on) { Array.prototype.forEach.call(row.querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c === on); }); };
    var first = null;
    [['fighters', 'المقاتلين'], ['divisions', 'الأوزان']].forEach(function (k, i) {
      var c = h('button.chip.f' + (i ? '' : '.on'), { onclick: function () { kind = k[0]; mark(kinds, c); fill(); } }, k[1]);
      if (!i) first = c;
      kinds.appendChild(c);
    });
    sw.ask('ufc/rankings', 6 * 3600e3).then(function (R) {
      var tr = divs.querySelector('.htrack');
      R.divisions.forEach(function (d) {
        var c = h('button.chip.f' + (d.key === div ? '.on' : ''), { onclick: function () { div = d.key; mark(divs, c); fill(); } }, d.ar);
        tr.appendChild(c);
      });
    }, function () { });
    drawMine();
    fill();
    CS.nav.focus(first, 'instant');
  }

  CS.ufc = { world: world, key: key, fighter: fighterPage, event: eventPage, bout: boutPage, pick: pickFavs, nameKey: nameKey, cm: cm, kg: kg, endWords: endWords, evName: evName };
})();
