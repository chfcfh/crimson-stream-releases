/* Screens and remote navigation.
   A screen is {name, el, modal?, keys(e)->handled, back()->handled, shown(), hidden(), destroy()}.
   Focusable things carry the class "f"; OK clicks them. Arrows move by position on screen, so right-to-left rows just work.
   Rows that slide sideways are ".hscroll > .htrack"; pages that slide up and down are ".vscroll > .vtrack". */
(function () {
  var stack = [];
  var keyAt = 0; /* last remote key: a resting pointer must not take the focus back right after it */
  var moveAt = 0; /* last arrow move */
  var cur = null; /* focused element */

  function top() { return stack[stack.length - 1]; }
  function host() { return CS.$('screens'); }

  function visible(el) {
    if (!el.isConnected || el.classList.contains('disabled')) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return true;
  }

  function rootOf(s) { return s.focusRoot ? s.focusRoot() : s.el; }
  function shown(list) { return Array.prototype.filter.call(list, visible); }

  function candidates() {
    var s = top();
    if (!s) return [];
    return shown(rootOf(s).querySelectorAll('.f'));
  }

  /* only what an arrow can reach, so a press does not measure every poster on the page (the TV's processor is weak):
     sideways = the same row; up and down = the nearest rows above and below, plus anything that is not in a row */
  function reachable(dir) {
    var s = top();
    if (!s) return [];
    var root = rootOf(s), g = cur && cur.closest('.group');
    if (!g || !root.contains(g)) return candidates();
    if (dir === 'left' || dir === 'right') return shown(g.querySelectorAll('.f'));
    var groups = root.querySelectorAll('.group'), i = Array.prototype.indexOf.call(groups, g), out = [], j, a;
    /* a row far away holds no posters until it is needed (views.js): being next, it is needed now */
    for (j = i - 1; j >= 0; j--) { if (groups[j]._wake) groups[j]._wake(); a = shown(groups[j].querySelectorAll('.f')); if (a.length) { out = out.concat(a); break; } }
    for (j = i + 1; j < groups.length; j++) { if (groups[j]._wake) groups[j]._wake(); a = shown(groups[j].querySelectorAll('.f')); if (a.length) { out = out.concat(a); break; } }
    return out.concat(shown(root.querySelectorAll('.f:not(.group .f)')));
  }

  function setFocus(el, how) {
    if (!el) return;
    /* an answer that arrives after its screen was left must not move the focus: only the screen on top takes it */
    var top0 = top();
    if (top0 && !rootOf(top0).contains(el)) return;
    if (cur && cur !== el) {
      cur.classList.remove('focused');
      if (cur.tagName === 'INPUT' && document.activeElement === cur && how !== 'keep-input') cur.blur();
    }
    cur = el;
    el.classList.add('focused');
    var g = el.closest('.group');
    if (g) g._last = el;
    var s = top();
    if (s) s.lastFocus = el;
    if (how !== 'no-scroll') ensureVisible(el, how === 'instant');
    if (el._onFocus) el._onFocus(el);
    if (s && s.focusChanged) s.focusChanged(el);
  }

  function shift(track, axis, delta, instant) {
    if (!delta) return;
    var k = axis === 'x' ? '_sx' : '_sy';
    track[k] = (track[k] || 0) + delta;
    if (instant) { track.style.transition = 'none'; requestAnimationFrame(function () { track.style.transition = ''; }); }
    track.style.transform = axis === 'x' ? 'translate3d(' + track[k] + 'px,0,0)' : 'translate3d(0,' + track[k] + 'px,0)';
  }

  /* how far a track still has to go in the motion it is making. What is measured on screen is where things are right now, on the way;
     the next move has to be worked out from where they are going, or quick presses overshoot (on the TV a row ended 1,565 px from its place) */
  function stillToGo(track, axis) {
    var m = /matrix\(([^)]+)\)/.exec(getComputedStyle(track).transform || '');
    var now = m ? +m[1].split(',')[axis === 'x' ? 4 : 5] : 0;
    return (track[axis === 'x' ? '_sx' : '_sy'] || 0) - now;
  }

  function ensureVisible(el, instant) {
    var k = CS.uiScale || 1; /* the Windows version scales the 1920×1080 page into its window */
    var r = el.getBoundingClientRect();
    /* the sections' bar, when too many for its width: slid just enough to show the focused one and a bit of the next */
    var tb = el.closest('.tabs');
    if (tb && tb.scrollWidth > tb.clientWidth + 1) {
      var nb = tb.getBoundingClientRect(), edge = 70 * k, dx = 0;
      if (r.left < nb.left + edge) dx = r.left - (nb.left + edge);
      else if (r.right > nb.right - edge) dx = r.right - (nb.right - edge);
      if (dx) tb.scrollLeft += dx / k; /* the same sign in either way a browser counts a right-to-left scroll */
    }
    var hs = el.closest('.hscroll');
    if (hs) {
      var tr = hs.querySelector('.htrack'), c = hs.getBoundingClientRect(), pad = +(hs.dataset.pad || 90) * k;
      var togo = stillToGo(tr, 'x') * k, left = r.left + togo, right = r.right + togo;
      var d = 0;
      if (left < c.left + pad) d = c.left + pad - left;
      else if (right > c.right - pad) d = (c.right - pad) - right;
      /* never slide past the row's start */
      d /= k;
      var start = (tr._sx || 0) + d;
      if (getComputedStyle(hs).direction === 'rtl' ? start < 0 : start > 0) d = -(tr._sx || 0);
      shift(tr, 'x', d, instant);
    }
    var vs = el.closest('.vscroll');
    if (vs) {
      var vt = vs.querySelector('.vtrack'), vc = vs.getBoundingClientRect();
      var box = (el.closest('.group') || el).getBoundingClientRect();
      var ahead = stillToGo(vt, 'y') * k, top = box.top + ahead, bottom = box.bottom + ahead;
      var dy = 0;
      if (vs.dataset.anchor) {
        dy = ((vc.top + +vs.dataset.anchor * k) - top) / k;
        /* the first rows stay where they are */
        if ((vt._sy || 0) + dy > 0) dy = -(vt._sy || 0);
      } else {
        var vpad = +(vs.dataset.pad || 60) * k;
        if (top < vc.top + vpad) dy = (vc.top + vpad - top) / k;
        else if (bottom > vc.bottom - vpad) dy = Math.max((vc.bottom - vpad) - bottom, vc.top + vpad - top) / k;
        if ((vt._sy || 0) + dy > 0) dy = -(vt._sy || 0);
      }
      shift(vt, 'y', dy, instant);
    }
  }

  function centre(r) { return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }

  function move(dir) {
    /* on the update bar's button (outside every screen): any arrow goes back to where the focus was */
    if (cur && cur._outside) {
      var back = cur._back;
      cur.classList.remove('focused');
      cur._outside = false;
      cur = null;
      if (back && back.isConnected && visible(back)) { setFocus(back); return true; }
    }
    if (!cur || !cur.isConnected || !visible(cur) || !rootOf(top()).contains(cur)) {
      var all = candidates();
      if (all.length) setFocus(all[0]);
      return !!all.length;
    }
    var list = reachable(dir);
    if (!list.length) return false;
    var a = cur.getBoundingClientRect(), ac = centre(a);
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === cur) continue;
      var b = el.getBoundingClientRect(), bc = centre(b);
      var main, side;
      if (dir === 'left') { if (bc.x >= ac.x - 1 || b.right > a.right) continue; main = Math.max(0, a.left - b.right); side = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); }
      else if (dir === 'right') { if (bc.x <= ac.x + 1 || b.left < a.left) continue; main = Math.max(0, b.left - a.right); side = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); }
      else if (dir === 'up') { if (bc.y >= ac.y - 1 || b.bottom > a.bottom) continue; main = Math.max(0, a.top - b.bottom); side = Math.abs(bc.x - ac.x); }
      else { if (bc.y <= ac.y + 1 || b.top < a.top) continue; main = Math.max(0, b.top - a.bottom); side = Math.abs(bc.x - ac.x); }
      var score = (dir === 'left' || dir === 'right') ? main + side * 4 : main * 2 + side * 0.6;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) {
      /* down from the last row of a screen: the update bar's «حدّث الآن», when there is one (util.js) */
      var ub = dir === 'down' && CS.updateBar && CS.updateBar.button();
      if (!ub) return false;
      ub._outside = true;
      ub._back = cur;
      cur.classList.remove('focused');
      cur = ub;
      ub.classList.add('focused');
      return true;
    }
    /* going up or down into a row: land on the item last used there */
    if (dir === 'up' || dir === 'down') {
      var g = best.closest('.group');
      if (g && g !== cur.closest('.group') && g._last && g._last.isConnected && visible(g._last)) best = g._last;
    }
    setFocus(best);
    return true;
  }

  /* moving between screens: the new one slides in from the side the way leads (forward: from the left, in a right-to-left
     app) while the old one fades and slides out the other way; going back runs it the other way round. Boxes over a
     screen (modal) and the video do not slide: they grow in or simply show. */
  var ENTER = ['enter', 'enter-fwd', 'enter-back', 'enter-morph', 'enter-still', 'enter-tab'], LEAVE = ['leave', 'leave-fwd', 'leave-back', 'leave-morph', 'leave-tab'];
  function slides(s) { return s && !s.modal && s.el && s.el.id !== 'player'; }
  function enter(el, dir) {
    el.classList.remove.apply(el.classList, ENTER);
    void el.offsetWidth; /* restart the motion when the same screen comes back */
    el.classList.add('enter');
    if (dir) el.classList.add('enter-' + dir);
    clearTimeout(el._enterTimer);
    el._enterTimer = setTimeout(function () { el.classList.remove.apply(el.classList, ENTER); }, 420);
  }
  /* the old screen goes out, then is hidden (or taken out of the page) */
  function leave(s, dir, done) {
    var el = s.el;
    clearTimeout(el._leaveTimer);
    if (!slides(s)) { done(); return; }
    el.classList.remove.apply(el.classList, ENTER);
    el.classList.add('leave', 'leave-' + dir);
    el._leaveTimer = setTimeout(function () { el.classList.remove.apply(el.classList, LEAVE); done(); }, 300);
  }

  /* a press is seen: what has the focus gives a little for a moment */
  function pressed(el) {
    if (!el || !el.classList) return;
    el.classList.add('pressed');
    clearTimeout(el._pressTimer);
    el._pressTimer = setTimeout(function () { el.classList.remove('pressed'); }, 140);
  }

  function show(s, dir) {
    clearTimeout(s.el._leaveTimer); /* coming back while it was still going out */
    s.el.classList.remove.apply(s.el.classList, LEAVE);
    s.el.classList.remove('hidden');
    enter(s.el, slides(s) ? dir : null);
    if (s.shown) s.shown();
    var f = s.lastFocus && s.lastFocus.isConnected ? s.lastFocus : (s.defaultFocus ? s.defaultFocus() : null);
    if (!f || !visible(f)) f = candidates()[0];
    cur = null;
    if (f) setFocus(f, 'instant');
  }

  CS.nav = {
    top: top,
    stack: stack,
    current: function () { return cur; },
    focus: setFocus,
    move: move,
    ensureVisible: ensureVisible,
    push: function (s) {
      var prev = top();
      var dir = prev && slides(prev) && slides(s) ? 'fwd' : null;
      /* opened from a poster that grows into it (views.js morphOpen): the page rises out of it, the old one only fades */
      if (dir && s.morph) dir = 'morph';
      /* the sections of the top bar (home 0, search 1, library 2, downloads 3 on the phone, settings 4): moved between all
         the time, so a short fade and no journey; a section takes the place of the section before it instead of
         piling up — so Back from any section goes home */
      if (prev && s.tab != null && prev.tab != null) {
        dir = 'tab';
        if (prev.tab > 0) {
          stack.pop();
          if (prev.destroy) prev.destroy();
          (function (p) {
            leave(p, dir, function () {
              if (stack.indexOf(p) >= 0) return;
              if (p.el.parentNode && !p.keep) p.el.parentNode.removeChild(p.el); else p.el.classList.add('hidden');
            });
          })(prev);
          prev = null;
        }
      }
      if (prev) {
        prev.lastFocus = cur;
        if (!s.modal) {
          if (prev.hidden) prev.hidden();
          (function (p) { leave(dir ? p : { el: p.el, modal: true }, dir === 'morph' || dir === 'tab' ? dir : 'fwd', function () { if (stack.indexOf(p) >= 0 && top() !== p) p.el.classList.add('hidden'); }); })(prev);
        }
      }
      if (!s.el.parentNode) host().appendChild(s.el);
      stack.push(s);
      show(s, dir);
    },
    pop: function () {
      var s = stack.pop();
      if (!s) return;
      if (s.destroy) s.destroy();
      var t = top();
      var dir = t && slides(t) && slides(s) ? 'back' : null;
      if (dir && s.tab != null && t.tab != null) dir = 'tab';
      /* a page that a poster opened shrinks back into it (views.js CS.morphClose): it fades, the screen under it stays still */
      var shrink = !!(dir && s.morphFrom && CS.morphClose);
      if (shrink) dir = 'morph';
      leave(dir ? s : { el: s.el, modal: true }, dir === 'morph' || dir === 'tab' ? dir : 'back', function () {
        if (stack.indexOf(s) >= 0) return; /* pushed again meanwhile */
        if (s.el.parentNode && !s.keep) s.el.parentNode.removeChild(s.el); else s.el.classList.add('hidden');
      });
      if (t) {
        if (!s.modal) show(t, shrink ? 'still' : dir);
        else { cur = null; var f = t.lastFocus && t.lastFocus.isConnected ? t.lastFocus : candidates()[0]; if (f) setFocus(f, 'no-scroll'); }
        if (shrink) CS.morphClose(s.morphFrom);
      }
    },
    /* back to the first screen in one move: the screens between go at once, only the last one slides away */
    popToRoot: function () {
      while (stack.length > 2) {
        var x = stack.splice(stack.length - 2, 1)[0];
        if (x.destroy) x.destroy();
        clearTimeout(x.el._leaveTimer);
        if (x.el.parentNode && !x.keep) x.el.parentNode.removeChild(x.el); else x.el.classList.add('hidden');
      }
      if (stack.length > 1) CS.nav.pop();
    },
    /* take a screen out of the stack without showing what is under it (the sources list once the video starts) */
    drop: function (name) {
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name !== name) continue;
        var s = stack.splice(i, 1)[0];
        if (s.destroy) s.destroy();
        if (s.el.parentNode && !s.keep) s.el.parentNode.removeChild(s.el);
        return;
      }
    },
    /* replace the whole stack (used after sign-in) */
    reset: function (s) {
      while (stack.length) { var x = stack.pop(); if (x.destroy) x.destroy(); if (x.el.parentNode && !x.keep) x.el.parentNode.removeChild(x.el); else x.el.classList.add('hidden'); }
      CS.nav.push(s);
    },
    refocus: function () {
      var s = top();
      if (!s) return;
      if (cur && cur.isConnected && visible(cur)) return;
      var f = s.defaultFocus ? s.defaultFocus() : candidates()[0];
      if (f) setFocus(f, 'instant');
    }
  };

  /* the remote */
  document.addEventListener('keydown', function (e) {
    var s = top();
    if (!s) return;
    CS.touched = true;
    keyAt = Date.now();
    if (CS.onAnyKey) CS.onAnyKey(e);
    if (s.keys && s.keys(e)) { e.preventDefault(); return; }
    var k = e.keyCode;
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (CS.isBack(e)) {
      e.preventDefault();
      if (typing) { document.activeElement.blur(); return; }
      if (s.back && s.back()) return;
      if (stack.length > 1) CS.nav.pop();
      else if (CS.exitApp) CS.exitApp();
      return;
    }
    if (typing && (k === CS.KEY.LEFT || k === CS.KEY.RIGHT)) return; /* move the caret */
    var dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[k];
    if (dir) {
      e.preventDefault();
      /* holding an arrow: at most one move every 70 ms, so the screen keeps up (120 from row to row: the eye follows the whole page) */
      if (e.repeat && Date.now() - moveAt < (k === 38 || k === 40 ? 120 : 70)) return;
      moveAt = Date.now();
      if (typing) document.activeElement.blur();
      move(dir);
      return;
    }
    if (k === CS.KEY.OK && e.target && e.target.tagName === 'INPUT') return; /* Enter inside the box is the box's own */
    if (k === CS.KEY.OK && cur) {
      e.preventDefault();
      if (cur.tagName === 'INPUT') { cur.focus(); return; }
      if (!e.repeat) pressed(cur);
      cur.click();
      return;
    }
    /* the Windows keyboard: Tab goes to the next thing (Shift+Tab back), the same way the arrows go along a row */
    if (k === 9 && CS.desktop) {
      e.preventDefault();
      if (typing) document.activeElement.blur();
      move(e.shiftKey ? 'right' : 'left');
    }
  });
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    var el = e.target.closest && e.target.closest('.f');
    if (el && el.classList.contains('focused')) pressed(el);
  });

  /* the mouse's side buttons, as in a browser: back = the previous screen (never out of the app), forward = back into
     the episode just left (desktop.js) — instead of the page's own history */
  document.addEventListener('mouseup', function (e) {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    /* the release of the back button that just closed the video lands here: it is not a second «back» */
    if (Date.now() - (CS.player.leftAt || 0) < 1000) return;
    var s = top();
    if (!s) return;
    if (e.button === 4) { if (CS.player.resumeLast) CS.player.resumeLast(); return; }
    if (s.back && s.back()) return;
    if (stack.length > 1) CS.nav.pop();
  });
  document.addEventListener('mousedown', function (e) { if (e.button === 3 || e.button === 4) e.preventDefault(); });

  /* the Magic Remote pointer and the mouse: hovering focuses, clicking activates, the wheel scrolls what is under it */
  document.addEventListener('mouseover', function (e) {
    if (Date.now() - keyAt < 800) return;
    var el = e.target.closest && e.target.closest('.f');
    if (el && el !== cur && candidates().indexOf(el) >= 0) setFocus(el, 'no-scroll');
  });

  /* slide a track by d page pixels, never past its first or last item */
  function slide(box, axis, d) {
    var tr = box.querySelector(axis === 'x' ? '.htrack' : '.vtrack');
    if (!tr) return false;
    var k = axis === 'x' ? '_sx' : '_sy';
    var now = tr[k] || 0, next = now + d;
    if (axis === 'y') {
      var room = Math.max(0, tr.offsetHeight - box.clientHeight);
      next = Math.max(-room, Math.min(0, next));
    } else {
      var roomX = Math.max(0, tr.offsetWidth - box.clientWidth + 2 * (parseFloat(getComputedStyle(box).paddingLeft) || 0));
      next = getComputedStyle(box).direction === 'rtl' ? Math.max(0, Math.min(roomX, next)) : Math.max(-roomX, Math.min(0, next));
    }
    if (next === now) return false;
    /* the wheel glides too, each turn taking over from where the last one is */
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) {
      tr.style.transition = 'transform 200ms cubic-bezier(.3,.55,.2,1)';
      clearTimeout(tr._wheelEnd);
      tr._wheelEnd = setTimeout(function () { tr.style.transition = ''; }, 240);
    }
    shift(tr, axis, next - now, still);
    var s = top();
    if (s && s.slid) s.slid(box, axis);
    return true;
  }

  var wheelAt = 0;
  document.addEventListener('wheel', function (e) {
    var s = top();
    if (!s || s.name === 'player') {
      var now = Date.now();
      if (now - wheelAt < 180) return;
      wheelAt = now;
      move(e.deltaY > 0 ? 'down' : 'up');
      return;
    }
    var k = CS.uiScale || 1;
    var px = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1; /* lines or pages -> pixels */
    var dx = e.deltaX * px / k, dy = e.deltaY * px / k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    var t = e.target.closest ? e.target : null;
    /* the sections' bar, when too many for its width, slides under the pointer (down = on towards its end, the left) */
    var tb = t && t.closest('.tabs');
    if (tb && tb.scrollWidth > tb.clientWidth + 1 && (dx || dy)) { tb.scrollLeft += dx ? dx : -dy; return; }
    /* sideways: the row under the pointer */
    if (dx && t) { var hs = t.closest('.hscroll'); if (hs && slide(hs, 'x', getComputedStyle(hs).direction === 'rtl' ? dx : -dx)) return; }
    if (!dy) return;
    /* on a title's page the wheel over the seasons or the episodes moves only that row (the page stays put) */
    var hs2 = t && s.name === 'detail' && t.closest('.hscroll');
    if (hs2) { slide(hs2, 'x', getComputedStyle(hs2).direction === 'rtl' ? dy : -dy); return; }
    /* up and down: the list under the pointer, else the screen's own list */
    var vs = (t && t.closest('.vscroll')) || (s.el && s.el.querySelector('.vscroll'));
    if (vs) slide(vs, 'y', -dy);
  }, { passive: true });

  /* the mouse: an arrow at each end of a row (seen while the pointer is on the row) moves it most of a width */
  document.addEventListener('mouseover', function (e) {
    var hs = e.target.closest && e.target.closest('.hscroll');
    if (!hs || hs._arrows) return;
    hs._arrows = true;
    ['back', 'on'].forEach(function (side) {
      var b = document.createElement('div');
      b.className = 'row-arrow ' + side;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var d = (side === 'on' ? 1 : -1) * hs.clientWidth * 0.8;
        slide(hs, 'x', getComputedStyle(hs).direction === 'rtl' ? d : -d);
      });
      hs.appendChild(b);
    });
  });
})();
