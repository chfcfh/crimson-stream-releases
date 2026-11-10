/* Made by tools/make-linefit.py from stremio-arabic-subs/src/index.js: change it there. Loaded only by the Windows version
   (desktop.js), when a file's own subtitle track has been read. Times here are in milliseconds. */
(function () {
const RATIOS = [1, 25 / 23.976, 23.976 / 25, 24 / 23.976, 23.976 / 24, 25 / 24, 24 / 25];
// ---- fitting one subtitle to another: same lines, same moments ----
// For each frame-rate ratio, every pair of line starts within 90 s votes for the shift between them; the true shift is where
// most votes pile up. Then it counts how many lines land within 0.3 s of a reference line.
function align(cand, ref) {
  if (cand.length < 30 || ref.length < 30) return null;
  const C = cand.map(c => c.start),
    R = ref.map(r => r.start);
  const W = 90000,
    BIN = 100,
    N = (2 * W) / BIN + 1;
  const hits = (ratio, offset) => {
    let n = 0,
      j = 0;
    for (const c of C) {
      const x = c * ratio + offset;
      while (j < R.length && R[j] < x - 300) j++;
      if (j < R.length && R[j] <= x + 300) n++;
    }
    return n / C.length;
  };
  const asIs = hits(1, 0);
  if (asIs >= 0.6) return { ratio: 1, offset: 0, score: asIs }; // already in time: nothing to work out
  let best = null,
    same = null;
  for (const ratio of RATIOS) {
    if (same && same.score >= 0.6) break; // a plain shift fits well: no frame-rate change to look for
    const h = new Uint16Array(N);
    let j0 = 0;
    for (const c of C) {
      const x = c * ratio;
      while (j0 < R.length && R[j0] < x - W) j0++;
      for (let j = j0; j < R.length && R[j] <= x + W; j++) h[Math.round((R[j] - x + W) / BIN)]++;
    }
    let peak = 1,
      top = -1;
    for (let k = 1; k < N - 1; k++) {
      const v = h[k - 1] + h[k] + h[k + 1];
      if (v > top) {
        top = v;
        peak = k;
      }
    }
    // fine shift: the middle of the differences close to the peak
    const rough = peak * BIN - W,
      diffs = [];
    let j = 0;
    for (const c of C) {
      const x = c * ratio + rough;
      while (j < R.length && R[j] < x - 400) j++;
      let d = null;
      for (let k = j; k < R.length && R[k] <= x + 400; k++) if (d === null || Math.abs(R[k] - x) < Math.abs(d)) d = R[k] - x;
      if (d !== null) diffs.push(d);
    }
    diffs.sort((a, b) => a - b);
    const offset = rough + (diffs.length ? diffs[diffs.length >> 1] : 0);
    const fit = { ratio, offset, score: hits(ratio, offset) };
    if (ratio === 1) same = fit;
    if (!best || fit.score > best.score) best = fit;
  }
  // a frame-rate change has to be clearly better than none
  if (best.ratio !== 1 && best.score < same.score * 1.15) best = same;
  if (best.score < 0.45) return null; // not the same dialogue, or a different cut: leave it alone
  if (asIs >= best.score - 0.03) return { ratio: 1, offset: 0, score: asIs }; // already in time
  return best;
}

// share of lines that start within 0.3 s of a reference line
function matchShare(cand, ref) {
  const R = ref.map(r => r.start);
  let n = 0;
  for (const c of cand) {
    const j = lowerBound(R, c.start - 300);
    if (j < R.length && R[j] <= c.start + 300) n++;
  }
  return cand.length ? n / cand.length : 0;
}
function lowerBound(arr, x) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Fitting line by line, the last and exact step. A subtitle written for another copy has its own timing for every single
// line (up to 2 s off, in both directions), which no shift of whole parts can cure. Here every Arabic line is paired with
// the line or lines it translates in the reference (the played file's own timing), in order, by time and by length — a
// sequence alignment that also allows one Arabic line for several reference lines, several for one, and lines on either
// side with no partner (sound captions, a line one translator dropped). A paired line takes the reference's exact start and
// end; a line with no partner moves with its neighbours. Returns null when too few lines pair for the result to be trusted.
function spoken(text) {
  return String(text)
    .replace(/<[^>]*>|\{[^}]*\}/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]|♪[^♪]*♪?|[♪♫]/g, ' ')
    .replace(/^\s*-?\s*[A-Z][A-Z .'’-]{1,24}:/gm, ' ') // a speaker's name in capitals
    .replace(/[\s‏‎]+/g, ' ')
    .trim();
}
// (the weights were searched on a test whose answer is known: a file's own subtitle, damaged the way another copy's is)
// The whole fitting of one Arabic subtitle to the played file's timing. The line-by-line step does the real work; the whole-file
// fit (frame rate, a constant shift) goes before it. The part-by-part fit is only a fallback for a subtitle whose parts run
// too far off for pairing (a broadcast copy, 15 s after the ad breaks): measured on real episodes it misplaces lines otherwise.
// Lines that are not the film's (the sites' advertising) are dropped. Returns { cues, paired (share of lines), snapped, parts }.
const NOT_THE_FILM = /subdl|opensubtitles|subscene|subsource|subtitles v\d|https?:|www\.|₫/i;
function fitToFile(raw, truth) {
  let c = raw.filter(x => !NOT_THE_FILM.test(x.text));
  const fit = align(c, truth);
  if (fit && !(fit.ratio === 1 && fit.offset === 0)) c = c.map(x => ({ start: x.start * fit.ratio + fit.offset, end: x.end * fit.ratio + fit.offset, text: x.text }));
  const direct = snap(c, truth);
  const parts = piecewise(c, truth);
  const byParts = parts ? c.map((x, i) => ({ start: x.start + parts.shifts[i], end: x.end + parts.shifts[i], text: x.text })).sort((a, b) => a.start - b.start) : null;
  const viaParts = byParts ? snap(byParts, truth) : null;
  const best = direct && (!viaParts || direct.paired >= viaParts.paired) ? direct : viaParts;
  if (best) return { cues: best.cues, paired: best.paired / best.total, snapped: true, parts: best === viaParts };
  // too little paired: the reference is not this subtitle's film cut, or too thin to trust. Moving parts by it would do harm
  return { cues: c, paired: 0, snapped: false, parts: false };
}

// Fitting to the sound, for a file with no subtitle track of its own. The reference is only where speech starts (no text and no
// sentence boundaries), so a line is never paired far away: the running shift of each part is found first, then a line moves
// to a start of speech only if one lies very near it. Measured against a known answer, pairing freely puts some lines on the
// wrong sentence, seconds off, which is worse to watch than a small delay.
const SOUND = { window: 60000, near: 1500, reach: 600, lead: -200 };
function fitToSound(raw, speech) {
  const onsets = speech.map(x => x.start + SOUND.lead).sort((a, b) => a - b);
  const nearest = t => {
    const i = lowerBound(onsets, t);
    let best = null;
    for (const j of [i - 1, i]) if (j >= 0 && j < onsets.length && (best === null || Math.abs(onsets[j] - t) < Math.abs(best - t))) best = onsets[j];
    return best;
  };
  let c = raw.filter(x => !NOT_THE_FILM.test(x.text));
  const fit = align(c, speech);
  if (fit && !(fit.ratio === 1 && fit.offset === 0)) c = c.map(x => ({ start: x.start * fit.ratio + fit.offset, end: x.end * fit.ratio + fit.offset, text: x.text }));
  for (let round = 0; round < 3; round++) {
    const gaps = c.map(x => {
      const n = nearest(x.start);
      return n !== null && Math.abs(n - x.start) <= SOUND.near ? { at: x.start, by: n - x.start } : null;
    }).filter(Boolean);
    c = c.map(x => {
      const near = gaps.filter(g => Math.abs(g.at - x.start) <= SOUND.window).map(g => g.by).sort((p, q) => p - q);
      const by = near.length >= 8 ? near[near.length >> 1] : 0;
      return { start: x.start + by, end: x.end + by, text: x.text };
    });
  }
  let moved = 0;
  const out = c.map(x => {
    const n = nearest(x.start);
    if (n === null || Math.abs(n - x.start) > SOUND.reach) return x;
    moved++;
    return { start: n, end: x.end + (n - x.start), text: x.text };
  }).sort((p, q) => p.start - q.start);
  for (let k = 0; k + 1 < out.length; k++) if (out[k].end > out[k + 1].start - 20) out[k].end = Math.max(out[k].start + 300, out[k + 1].start - 20);
  return { cues: out.map(x => ({ start: Math.round(x.start), end: Math.round(x.end), text: x.text })), moved: moved / Math.max(1, out.length) };
}

const SNAP = { endW: 0.2, lenW: 1.5, kPen: 0.6, skipA: 2.2, skipR: 1.2, rounds: [8000, 5000, 3000, 3000, 2500], win: 25000, minNear: 5 };
function snap(cand, ref) {
  // pairing is repeated: the lines paired in one round show how far this part of the subtitle runs from the file, and the
  // next round starts from there, so a line is no longer taken for its neighbour
  let cur = cand,
    last = null;
  for (let round = 0; round < SNAP.rounds.length; round++) {
    const limit = SNAP.rounds[round];
    last = pairLines(cur, cand, ref, limit);
    if (!last) return null;
    if (round === SNAP.rounds.length - 1) break;
    const moves = last.pairs.map(p => ({ at: cur[p.i].start, by: p.start - cur[p.i].start })).sort((a, b) => a.at - b.at);
    cur = cur.map(c => {
      const near = moves.filter(v => Math.abs(v.at - c.start) <= SNAP.win).map(v => v.by).sort((a, b) => a - b);
      const by = near.length >= SNAP.minNear ? near[near.length >> 1] : 0;
      return { start: c.start + by, end: c.end + by, text: c.text };
    });
  }
  return last;
}
function pairLines(cur, cand, ref, limit) {
  const R = ref.map(r => ({ start: r.start, end: r.end, len: spoken(r.text).length })).filter(r => r.len > 0);
  const A = cur.map(c => ({ start: c.start, end: c.end, len: Math.max(1, spoken(c.text).length) }));
  const n = A.length,
    m = R.length;
  if (n < 30 || m < 30) return null;
  const ratio = A.reduce((t, c) => t + c.len, 0) / R.reduce((t, r) => t + r.len, 0); // how much longer one language runs
  const lenCost = (la, lr) => SNAP.lenW * Math.abs(Math.log((la + 10) / (lr * ratio + 10)));
  const skipA = i => SNAP.skipA + Math.min(0.6, A[i].len / 80);
  const skipR = j => SNAP.skipR + Math.min(0.9, R[j].len / 45);
  // Only a band of the grid is walked: for each Arabic line, the reference lines starting within a minute past the pairing limit
  // of it. A path outside would take dozens of skips, never the cheapest; the whole grid was 3 million cells and 37 MB for a film,
  // five times over, which the TV (about ten times slower) could not carry. The band rises with i and rows overlap, so the walk
  // from the first corner to the last always exists.
  const BAND = limit + 60000;
  const Rs = R.map(r => r.start);
  const inOrder = Rs.every((t, k) => k === 0 || Rs[k - 1] <= t); // a reference out of order gets the whole grid, as before
  const lo = new Int32Array(n + 1),
    hi = new Int32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = A[Math.min(i, n - 1)].start; // the last row: the reference lines left after the subtitle ends are skipped there
    // a row is also reached right after the lines before it were paired (up to three rows back), and the reference lines up to
    // this line are skipped along it: a gap in the subtitle (two minutes with no line) left those cells outside before
    let early = t;
    for (let k = Math.max(0, i - 3); k < Math.min(i, n); k++) early = Math.min(early, A[k].start);
    lo[i] = i === 0 || !inOrder ? 0 : lowerBound(Rs, early - BAND);
    hi[i] = i === n || !inOrder ? m : Math.min(m, lowerBound(Rs, t + BAND + 1));
  }
  for (let i = n - 1; i >= 0; i--) lo[i] = Math.min(lo[i], lo[i + 1]);
  for (let i = 1; i <= n; i++) hi[i] = Math.max(hi[i], hi[i - 1]);
  for (let i = 0; i < n; i++) hi[i] = Math.max(hi[i], lo[i + 1]);
  const off = new Int32Array(n + 2);
  for (let i = 0; i <= n; i++) off[i + 1] = off[i] + (hi[i] - lo[i] + 1);
  const at = (i, j) => (j < lo[i] || j > hi[i] ? -1 : off[i] + j - lo[i]);
  const cost = new Float64Array(off[n + 1]).fill(Infinity),
    from = new Int32Array(off[n + 1]).fill(-1); // packed: di * 16 + dj, with di and dj the step taken
  cost[0] = 0;
  const step = (i, j, di, dj, c) => {
    if (i + di > n) return;
    const k = at(i + di, j + dj);
    if (k < 0) return;
    const v = cost[at(i, j)] + c;
    if (v < cost[k]) {
      cost[k] = v;
      from[k] = di * 16 + dj;
    }
  };
  for (let i = 0; i <= n; i++)
    for (let j = lo[i]; j <= hi[i]; j++) {
      if (cost[at(i, j)] === Infinity) continue;
      if (i < n) step(i, j, 1, 0, skipA(i));
      if (j < m) step(i, j, 0, 1, skipR(j));
      if (i === n || j === m) continue;
      if (Math.abs(A[i].start - R[j].start) > limit) continue;
      // one Arabic line for 1..4 reference lines
      let len = 0;
      for (let k = 0; k < 4 && j + k < m; k++) {
        if (k && R[j + k].start - R[j + k - 1].end > 1500) break; // a pause: these are not one sentence
        len += R[j + k].len;
        const t = Math.abs(A[i].start - R[j].start) / 1000 + (SNAP.endW * Math.abs(A[i].end - R[j + k].end)) / 1000;
        step(i, j, 1, k + 1, t + lenCost(A[i].len, len) + k * SNAP.kPen);
      }
      // 2..3 Arabic lines for one reference line
      let la = A[i].len;
      for (let k = 1; k < 3 && i + k < n; k++) {
        if (A[i + k].start - A[i + k - 1].end > 1500) break;
        la += A[i + k].len;
        const t = Math.abs(A[i].start - R[j].start) / 1000 + (SNAP.endW * Math.abs(A[i + k].end - R[j].end)) / 1000;
        step(i, j, k + 1, 1, t + lenCost(la, R[j].len) + k * SNAP.kPen);
      }
    }
  // read the pairs back
  const out = cur.map(c => ({ start: c.start, end: c.end, text: c.text, paired: false }));
  const pairs = [];
  let i = n,
    j = m,
    pairedLines = 0;
  while (i > 0 || j > 0) {
    const k = at(i, j),
      f = k < 0 ? -1 : from[k];
    if (f < 0) return null;
    const di = f >> 4,
      dj = f & 15;
    if (di && dj) {
      const r0 = R[j - dj],
        r1 = R[j - 1];
      if (di === 1) {
        out[i - 1].start = r0.start;
        out[i - 1].end = r1.end;
        out[i - 1].paired = true;
        pairs.push({ i: i - 1, start: r0.start });
      } else {
        // several Arabic lines share one reference line: by their lengths
        const total = A.slice(i - di, i).reduce((t, c) => t + c.len, 0);
        let at = r0.start;
        for (let k = i - di; k < i; k++) {
          const span = ((r1.end - r0.start) * A[k].len) / total;
          out[k].start = at;
          out[k].end = at + span;
          out[k].paired = true;
          if (k === i - di) pairs.push({ i: k, start: r0.start });
          at += span;
        }
      }
      pairedLines += di;
    }
    i -= di;
    j -= dj;
  }
  if (pairedLines < n * 0.6) return null;
  // a line with no partner moves as much as the paired lines around it
  let prev = -1;
  for (let k = 0; k <= n; k++) {
    if (k < n && !out[k].paired) continue;
    if (k - prev > 1) {
      const before = prev >= 0 ? out[prev].start - cur[prev].start : null,
        after = k < n ? out[k].start - cur[k].start : null;
      const move = before === null ? after : after === null ? before : (before + after) / 2;
      for (let q = prev + 1; q < k; q++) {
        out[q].start = cur[q].start + (move || 0);
        out[q].end = cur[q].end + (move || 0);
      }
    }
    prev = k;
  }
  // readable and not on top of each other
  const fixed = out.map(c => ({ start: Math.round(c.start), end: Math.round(c.end), text: c.text })).sort((a, b) => a.start - b.start);
  for (let k = 0; k < fixed.length; k++) {
    const next = k + 1 < fixed.length ? fixed[k + 1].start : Infinity;
    if (fixed[k].end - fixed[k].start < 900) fixed[k].end = fixed[k].start + 900; // a very short reference line still has to be read
    if (fixed[k].end > next - 20) fixed[k].end = Math.max(fixed[k].start + 200, next - 20);
  }
  return { cues: fixed, paired: pairedLines, total: n, pairs };
}

// Fitting part by part: for every line, the lines within a minute around it vote for the shift to the reference (up to
// ±60 s); a running median turns the votes into steps (one per ad break), each step is then fine-tuned on its own lines.
function piecewise(cand, ref) {
  if (cand.length < 60 || ref.length < 60) return null;
  const C = cand.map(c => c.start),
    R = ref.map(r => r.start);
  const RANGE = 60000,
    BIN = 100,
    NB = (2 * RANGE) / BIN + 1,
    WIN = 60000;
  const h = new Uint16Array(NB);
  const raw = new Array(C.length).fill(null);
  let a = 0,
    b = 0;
  for (let i = 0; i < C.length; i++) {
    while (C[a] < C[i] - WIN) a++;
    while (b < C.length && C[b] <= C[i] + WIN) b++;
    if (b - a < 8) continue;
    h.fill(0);
    for (let k = a; k < b; k++)
      for (let j = lowerBound(R, C[k] - RANGE); j < R.length && R[j] <= C[k] + RANGE; j++) h[Math.round((R[j] - C[k] + RANGE) / BIN)]++;
    let peak = 0,
      top = 0;
    for (let x = 1; x < NB - 1; x++) {
      const v = h[x - 1] + h[x] + h[x + 1];
      if (v > top) {
        top = v;
        peak = x;
      }
    }
    if (top / (b - a) >= 0.35) raw[i] = peak * BIN - RANGE;
  }
  // lines without a clear vote take their neighbours' shift
  let last = null;
  for (let i = 0; i < raw.length; i++) (raw[i] === null ? (raw[i] = last) : (last = raw[i]));
  last = null;
  for (let i = raw.length - 1; i >= 0; i--) (raw[i] === null ? (raw[i] = last) : (last = raw[i]));
  if (raw[0] === null) return null;
  const smooth = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 4), i + 5).sort((x, y) => x - y);
    return w[w.length >> 1];
  });
  // steps: runs of the same shift, each fine-tuned to the nearest reference lines
  const shifts = new Float64Array(C.length);
  let segments = 0;
  for (let s = 0; s < C.length; ) {
    let e = s + 1;
    while (e < C.length && Math.abs(smooth[e] - smooth[s]) <= 150) e++;
    const diffs = [];
    for (let i = s; i < e; i++) {
      const x = C[i] + smooth[s],
        j = lowerBound(R, x - 400);
      let d = null;
      for (let k = j; k < R.length && R[k] <= x + 400; k++) if (d === null || Math.abs(R[k] - x) < Math.abs(d)) d = R[k] - x;
      if (d !== null) diffs.push(d);
    }
    diffs.sort((x, y) => x - y);
    const fine = smooth[s] + (diffs.length ? diffs[diffs.length >> 1] : 0);
    for (let i = s; i < e; i++) shifts[i] = fine;
    segments++;
    s = e;
  }
  const share = matchShare(cand.map((c, i) => ({ start: c.start + shifts[i] })), ref);
  return { shifts, share, segments };
}


// a subtitle marked Arabic that is really Persian is not to be chosen
function reallyArabic(cues) {
  const t = cues.map(c => c.text).join(' ');
  const persian = (t.match(/[پچژگکی]/g) || []).length,
    letters = (t.match(/[؀-ۿ]/g) || []).length;
  return letters > 0 && persian / letters < 0.02;
}
window.CS.linefit = { fitToFile, reallyArabic, matchShare, align };
})();
