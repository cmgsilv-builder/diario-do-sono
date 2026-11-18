// Contas a partir dos registros: noites, dias, janelas típicas e estado atual.
import { mins, dateKey, addDays, addMin, minOfDay, median, byT, toLocal, parse } from './util.js';

const isFeed = e => (e.type === 'feed') || (e.type === 'wake' && (e.codes || []).includes('M'));

export function nightOf(evs, s) {
  const lim = s.end || toLocal(new Date(parse(s.t).getTime() + 15 * 3600e3));
  const wakes = evs.filter(e => e.type === 'wake' && e.t >= s.t && e.t <= lim).sort(byT);
  const feeds = wakes.filter(isFeed).length;
  const first = wakes.length ? mins(s.t, wakes[0].t) : (s.end ? mins(s.t, s.end) : null);
  const awake = wakes.reduce((a, w) => a + (w.end ? Math.max(0, mins(w.t, w.end)) : 0), 0);
  const help = wakes.filter(w => !(w.codes || []).includes('M') && !(w.codes || []).includes('S')).length;
  const self = wakes.filter(w => (w.codes || []).includes('S')).length;
  const lastFeedBefore = evs.filter(e => isFeed(e) && e.t <= s.t && e.t >= addMin(s.t, -180)).sort(byT).pop();
  return { s, date: dateKey(s.t), wakes, feeds, first, awake, help, self, lastFeedBefore, total: s.end ? mins(s.t, s.end) - awake : null, ok: !!s.end && !s.partial };
}

export function nights(evs, fromKey, toKey) {
  return evs.filter(e => e.type === 'sleep' && e.kind === 'night' && dateKey(e.t) >= fromKey && dateKey(e.t) <= toKey)
    .sort(byT).map(s => nightOf(evs, s));
}

export function dayInfo(evs, D) {
  const sleeps = evs.filter(e => e.type === 'sleep');
  const morning = sleeps.filter(s => s.kind === 'night' && s.end && dateKey(s.end) === D).sort((a, b) => (a.end < b.end ? -1 : 1)).pop();
  const naps = sleeps.filter(s => s.kind === 'nap' && dateKey(s.t) === D).sort(byT);
  const bed = sleeps.filter(s => s.kind === 'night' && dateKey(s.t) === D).sort(byT)[0] || null;
  const up = morning ? morning.end : null;
  const wins = []; let prev = up;
  for (const n of naps) { wins.push(prev ? mins(prev, n.t) : null); prev = n.end || null; }
  const lastWin = bed && prev ? mins(prev, bed.t) : null;
  const total = naps.reduce((a, n) => a + (n.end ? mins(n.t, n.end) : 0), 0);
  return { D, up, naps, wins, lastWin, bed, total, complete: !!(up && bed && naps.length && naps.every(n => n.end)) };
}

const DEF = { win: [110, 110, 110, 105], nap: [80, 60, 45, 30], last: { 3: 135, 4: 95 } };
export function typical(evs, D, n = 14) {
  const win = [[], [], [], []], nap = [[], [], [], []], last = { 3: [], 4: [] };
  for (let i = 1; i <= n; i++) {
    const d = dayInfo(evs, addDays(D, -i));
    if (!d.up) continue;
    d.wins.forEach((w, j) => { if (w != null && j < 4 && w > 20 && w < 240) win[j].push(w); });
    d.naps.forEach((x, j) => { if (x.end && j < 4) nap[j].push(mins(x.t, x.end)); });
    if (d.complete && d.lastWin != null) last[d.naps.length >= 4 ? 4 : 3].push(d.lastWin);
  }
  const med = (a, dflt) => (a.length >= 3 ? Math.round(median(a)) : dflt);
  return {
    win: win.map((a, j) => med(a, DEF.win[j])),
    nap: nap.map((a, j) => med(a, DEF.nap[j])),
    last: { 3: med(last[3], DEF.last[3]), 4: med(last[4], DEF.last[4]) },
    fromData: win[0].length >= 3
  };
}

export function lastFeed(evs, now) {
  return evs.filter(e => isFeed(e) && e.t <= now).sort(byT).pop() || null;
}

export function currentState(evs, now) {
  const sleeps = evs.filter(e => e.type === 'sleep' && e.t <= now).sort(byT);
  const open = [...sleeps].reverse().find(s => !s.end);
  const feed = lastFeed(evs, now);
  if (open) {
    if (open.kind === 'night') {
      const w = evs.filter(e => e.type === 'wake' && e.t >= open.t && !e.end).sort(byT).pop() || null;
      return { mode: w ? 'night-wake' : 'night', sleep: open, wake: w, feed };
    }
    return { mode: 'nap', sleep: open, feed };
  }
  const last = sleeps.filter(s => s.end && s.end <= now).sort((a, b) => (a.end < b.end ? -1 : 1)).pop() || null;
  return { mode: 'awake', since: last ? last.end : null, lastSleep: last, feed };
}

// Sugestão do próximo sono, a partir das janelas típicas dele.
export function suggestion(evs, now, since) {
  const D = dateKey(now);
  const di = dayInfo(evs, D);
  const ty = typical(evs, D);
  const idx = di.naps.length;
  const target = ty.win[Math.min(idx, 3)];
  let mode = 'nap';
  if (idx >= 4) mode = 'bed';
  else {
    const napT = addMin(since, target);
    const after = addMin(napT, ty.nap[Math.min(idx, 3)] + 75);
    if (minOfDay(after) > 18 * 60 + 50 || dateKey(after) !== dateKey(since)) mode = 'bed';
  }
  if (mode === 'nap') return { mode, idx, target, at: addMin(since, target), ty };
  const lastT = ty.last[idx >= 4 ? 4 : 3];
  const ideal = addMin(since, lastT);
  const lo = `${D}T18:15`, hi = `${D}T18:45`;
  const bed = ideal < lo ? lo : ideal > hi ? hi : ideal;
  const win = mins(since, bed);
  return { mode, idx, target: win, at: bed, ty, longWin: win > 150, catnap: win > 150 ? addMin(since, 75) : null };
}
