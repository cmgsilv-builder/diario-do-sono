import * as S from './store.js';
import { nowLocal, today, mins, addMin, hm, dur, durShort, dateKey, fmtDate, addDays, weekday, uid, esc, byT, avg, fmtNum, ageText, minOfDay } from './util.js';
import { currentState, suggestion, nights, nightOf, dayInfo, typical, lastFeed } from './stats.js';
import { nightTimeline, bars, stacked, dayStrip, marker, kindOf } from './charts.js';

const $ = s => document.querySelector(s);
const view = $('#view'), sheet = $('#sheet');
const CODES = [['M', 'Mamou'], ['T', 'Toque/shh'], ['C', 'Colo'], ['S', 'Voltou sozinho'], ['F', 'Fralda'], ['A', 'Ficou acordado']];
const CODE_LABEL = Object.fromEntries(CODES);
const PLACES = ['berço', 'carrinho', 'carro', 'colo', 'sling', 'cama'];
const HOW = [['sozinho', 'Sozinho'], ['ajuda', 'Com ajuda']];
let tab = (location.hash.slice(1) || 'now');
if (!['now', 'log', 'charts', 'more'].includes(tab)) tab = 'now';
let logDate = today(), range = 14, planN = 4, planWake = '06:30';

// ---------- topo e sincronização ----------
function renderHeader() {
  $('#title').textContent = 'Diário do sono';
  const name = S.config.babyName, age = ageText(S.config.birth);
  $('#sub').textContent = [name, age].filter(Boolean).join(' · ');
  const st = S.status, pend = S.pendingCount();
  const map = {
    ok: ['ok', `Sincronizado${S.status.last ? ' ' + S.status.last.toTimeString().slice(0, 5) : ''}`],
    sync: ['sync', 'Sincronizando…'], offline: ['warn', `Offline${pend ? ` · ${pend} pendente${pend > 1 ? 's' : ''}` : ''}`],
    err: ['err', 'Erro na sincronização'], local: ['warn', 'Só neste aparelho'], idle: ['sync', '…']
  };
  const [cls, txt] = map[st.state] || map.idle;
  const b = $('#syncBtn'); b.className = 'sync ' + cls; b.querySelector('span').textContent = txt; b.title = st.msg || txt;
}

function render() {
  renderHeader();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  ({ now: renderNow, log: renderLog, charts: renderCharts, more: renderMore })[tab]();
}

// ---------- descrição de um registro ----------
function iconFor(e) {
  if (e.type === 'sleep') return `<svg viewBox="0 0 20 20"><rect x="2" y="6" width="16" height="8" rx="4" fill="${e.kind === 'night' ? 'var(--ink)' : 'var(--accent)'}"/></svg>`;
  if (e.type === 'wake') return `<svg viewBox="0 0 20 20">${marker(kindOf(e), 10, 10.5)}</svg>`;
  if (e.type === 'feed') return `<svg viewBox="0 0 20 20">${marker('f', 10, 10)}</svg>`;
  if (e.type === 'health') return `<svg viewBox="0 0 20 20"><path d="M10 3v14M3 10h14" stroke="var(--crit)" stroke-width="3" stroke-linecap="round"/></svg>`;
  return `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="none" stroke="var(--ink2)" stroke-width="2"/></svg>`;
}
function describe(e) {
  const d = e.end ? mins(e.t, e.end) : null;
  if (e.type === 'sleep') return { title: e.kind === 'night' ? 'Noite' : 'Soneca', time: `${hm(e.t)} – ${e.end ? hm(e.end) : 'agora'}`, sub: [d != null ? dur(d) : 'dormindo', e.place, e.how === 'sozinho' ? 'dormiu sozinho' : e.how === 'ajuda' ? 'com ajuda' : '', e.score ? `noite ${e.score}/10` : '', e.partial ? 'incompleta' : ''] };
  if (e.type === 'wake') return { title: 'Despertar', time: `${hm(e.t)}${e.end ? ' – ' + hm(e.end) : ''}`, sub: [(e.codes || []).map(c => CODE_LABEL[c]).join(', ') || 'sem código', d != null ? durShort(d) : (!e.end && mins(e.t, nowLocal()) < 180 ? 'acordado agora' : '')] };
  if (e.type === 'feed') return { title: 'Mamou', time: hm(e.t), sub: [] };
  if (e.type === 'health') return { title: 'Saúde', time: hm(e.t), sub: [e.temp ? `${fmtNum(+e.temp)} °C` : '', e.med ? `${e.med}${e.dose ? ' ' + e.dose : ''}` : ''] };
  if (e.type === 'weight') return { title: 'Peso', time: fmtDate(dateKey(e.t)), sub: [e.grams ? `${(+e.grams).toLocaleString('pt-BR')} g` : ''] };
  return { title: e.type, time: hm(e.t), sub: [] };
}
function row(e, extra = '') {
  const d = describe(e);
  const sub = [...d.sub, e.by ? `por ${e.by}` : '', e.note || ''].filter(Boolean).map(esc).join(' · ');
  return `<button class="row" data-act="edit" data-id="${e.id}"><span class="ic">${iconFor(e)}</span><span class="rt">${esc(d.time)}</span><span class="rb"><b>${esc(d.title)}</b>${extra}<small>${sub}</small></span></button>`;
}

// ---------- AGORA ----------
function feedText(feed, now) {
  if (!feed) return 'Nenhuma mamada registrada ainda.';
  return `Última mamada às <b>${hm(feed.t)}</b> · há ${durShort(mins(feed.t, now))}`;
}
function guide(feed, now) {
  const sf = feed ? mins(feed.t, now) : null;
  const tip = 'Tente nesta ordem: <b>pausa de 1 a 3 min</b> → <b>toque/shh no berço</b> → <b>colo</b> e de volta ao berço.';
  if (sf == null) return `Sem mamada registrada. ${tip}`;
  if (sf >= 180) return `Última mamada há <b>${dur(sf)}</b>. Pela regra de vocês (3h ou mais), pode oferecer a mamada.`;
  return `Última mamada há <b>${dur(sf)}</b>, menos de 3h. ${tip}`;
}
function people() {
  const set = new Set(S.all().map(e => e.by).filter(Boolean));
  if (S.settings.me) set.add(S.settings.me);
  return [...set].slice(0, 4);
}
function chips(list, cur, act, id) {
  return list.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="${act}" data-id="${id}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
}

function renderNow() {
  const evs = S.all(), now = nowLocal(), st = currentState(evs, now);
  let h = '';
  if (!S.settings.me) {
    h += `<section class="card setup"><h2>Primeiro, quem é você?</h2><p class="muted">O nome aparece em cada registro. Assim dá para ver como vocês dividem as noites.</p>
      <form id="meForm" class="inline"><input id="meInput" placeholder="Seu nome" autocomplete="given-name" required><button class="btn primary">Salvar</button></form>
      <p class="muted small">Para os dois verem os mesmos dados, configure a sincronização em <a href="#more" data-tab="more">Mais</a>.</p></section>`;
  }
  if (st.mode === 'night-wake') {
    const w = st.wake;
    h += `<section class="hero wake"><div class="lbl">Despertar · desde ${hm(w.t)}</div><div class="num">${durShort(mins(w.t, now))}</div>
      <p class="hint">${guide(lastFeed(evs.filter(e => e.id !== w.id), w.t), now)}<br><span class="muted">Fralda vazou? Troque primeiro.</span></p>
      <div class="codes">${CODES.map(([c, l]) => `<button class="code ${(w.codes || []).includes(c) ? 'on' : ''}" data-act="code" data-id="${w.id}" data-c="${c}"><b>${c}</b><span>${l}</span></button>`).join('')}</div>
      <div class="who"><span class="muted small">Quem levantou</span>${chips(people().map(p => [p, p]), w.by, 'who', w.id)}</div>
      <div class="actions"><button class="btn big primary" data-act="endWake" data-id="${w.id}">Voltou a dormir</button><button class="btn" data-act="morning" data-id="${st.sleep.id}">Acordou para o dia</button></div></section>`;
  } else if (st.mode === 'night') {
    const s = st.sleep, n = nightOf(evs, s);
    h += `<section class="hero night"><div class="lbl">Noite · dormiu às ${hm(s.t)}</div><div class="num">${dur(mins(s.t, now))}</div>
      <p class="meta">${feedText(st.feed, now)}</p><p class="meta">${n.wakes.length} despertar${n.wakes.length === 1 ? '' : 'es'} até agora · ${n.feeds} mamada${n.feeds === 1 ? '' : 's'}</p>
      ${sleepTags(s)}
      <div class="actions"><button class="btn big primary" data-act="startWake">Acordou</button><button class="btn" data-act="morning" data-id="${s.id}">Acordou para o dia</button></div></section>`;
  } else if (st.mode === 'nap') {
    const s = st.sleep, el = mins(s.t, now), idx = dayInfo(evs, dateKey(s.t)).naps.findIndex(x => x.id === s.id);
    const warn = idx === 0 && el > 90 ? `<p class="hint warn">Passou de 1h30, o limite que vocês usam na 1ª soneca.</p>` : '';
    h += `<section class="hero nap"><div class="lbl">Soneca ${idx + 1} · dormiu às ${hm(s.t)}</div><div class="num">${durShort(el)}</div>${warn}
      ${sleepTags(s)}
      <div class="actions"><button class="btn big primary" data-act="endSleep" data-id="${s.id}">Acordou</button></div></section>`;
  } else {
    const since = st.since;
    if (!since) {
      h += `<section class="hero"><div class="lbl">Nada registrado ainda</div><p class="meta">Comece pelo que está acontecendo agora.</p>
        <div class="actions grid"><button class="btn big primary" data-act="startNap">Dormiu · soneca</button><button class="btn big" data-act="startNight">Dormiu · noite</button><button class="btn" data-act="feed">Mamou</button><button class="btn" data-act="add" data-type="sleep" data-kind="night">Registrar noite passada</button></div></section>`;
    } else {
      const el = mins(since, now), sg = suggestion(evs, now, since);
      const tgt = sg.target, ratio = el / tgt;
      const cls = el > tgt + 20 ? 'late' : el >= tgt - 20 ? 'soon' : 'calm';
      const stateTxt = cls === 'late' ? 'Janela longa. Ele pode estar passando do ponto.' : cls === 'soon' ? 'Hora de observar os sinais de sono.' : 'Tranquilo por enquanto.';
      let sugTxt = sg.mode === 'nap'
        ? `Soneca ${sg.idx + 1} por volta de <b>${hm(sg.at)}</b> <span class="muted">(janela típica dele: ${dur(sg.target)})</span>`
        : `Noite por volta de <b>${hm(sg.at)}</b> <span class="muted">(última janela de ${dur(sg.target)})</span>`;
      if (sg.at < now) sugTxt = sg.mode === 'nap'
        ? `A soneca ${sg.idx + 1} estava prevista para <b>${hm(sg.at)}</b>. Já passou. Se ele mostrar sono, pode deitar.`
        : `A noite estava prevista para <b>${hm(sg.at)}</b>. Já passou. Se ele já dormiu, registre com a hora certa no Diário.`;
      else if (sg.longWin) sugTxt += `<br><span class="warnText">A última janela passaria de 2h30. Vale um cochilo curto no carrinho perto de ${hm(sg.catnap)}.</span>`;
      const evening = minOfDay(now) >= 17 * 60 + 30 || sg.mode === 'bed';
      h += `<section class="hero day ${cls}"><div class="lbl">Acordado desde ${hm(since)}</div><div class="num">${dur(el)}</div>
        <div class="meter" role="img" aria-label="Tempo acordado em relação à janela típica"><span style="width:${Math.min(100, ratio * 100).toFixed(0)}%"></span></div>
        <p class="meta">${stateTxt}</p><p class="meta">${sugTxt}</p><p class="meta">${feedText(st.feed, now)}</p>
        <div class="actions grid"><button class="btn big ${evening ? '' : 'primary'}" data-act="startNap">Dormiu · soneca</button><button class="btn big ${evening ? 'primary' : ''}" data-act="startNight">Dormiu · noite</button><button class="btn" data-act="feed">Mamou</button><button class="btn" data-act="add" data-type="health">Saúde</button></div></section>`;
    }
  }
  const recent = evs.filter(e => e.t <= addMin(now, 1)).sort(byT).reverse().slice(0, 8);
  const di = dayInfo(evs, today());
  h += `<section class="card"><div class="cardhead"><h2>Hoje</h2><span class="muted small">${di.naps.length} soneca${di.naps.length === 1 ? '' : 's'} · ${dur(di.total)}</span></div>${dayStrip(di)}</section>`;
  h += `<section class="card"><div class="cardhead"><h2>Últimos registros</h2><button class="link" data-act="goLog">Ver diário</button></div>${recent.length ? recent.map(e => row(e)).join('') : '<p class="muted">Nada ainda.</p>'}</section>`;
  view.innerHTML = h;
  const f = $('#meForm');
  if (f) f.addEventListener('submit', ev => { ev.preventDefault(); const v = $('#meInput').value.trim(); if (v) { S.saveSettings({ me: v }); toast(`Olá, ${v}.`); } });
}
function sleepTags(s) {
  return `<div class="tags"><div>${chips(HOW, s.how, 'how', s.id)}</div><div>${chips(PLACES.slice(0, 4).map(p => [p, p]), s.place, 'place', s.id)}</div></div>`;
}

// ---------- DIÁRIO ----------
function renderLog() {
  const evs = S.all(), D = logDate, di = dayInfo(evs, D);
  const nightS = evs.filter(e => e.type === 'sleep' && e.kind === 'night' && dateKey(e.t) === D).sort(byT)[0];
  let h = `<div class="datenav"><button class="btn icon" data-act="logPrev" aria-label="Dia anterior">‹</button>
    <label class="dlabel"><span>${weekday(D)}, ${fmtDate(D)}${D === today() ? ' · hoje' : ''}</span><input type="date" id="logPick" value="${D}" aria-label="Escolher data"></label>
    <button class="btn icon" data-act="logNext" aria-label="Próximo dia" ${D >= today() ? 'disabled' : ''}>›</button></div>`;
  // Dia
  const stats = [['Acordou', di.up ? hm(di.up) : '—'], ['Sonecas', String(di.naps.length)], ['Total', dur(di.total)], ['Última janela', di.lastWin != null ? dur(di.lastWin) : '—']];
  h += `<section class="card"><div class="cardhead"><h2>Dia</h2></div><div class="mini">${stats.map(([l, v]) => `<div><small>${l}</small><b class="${l === 'Última janela' && di.lastWin > 150 ? 'warnText' : ''}">${v}</b></div>`).join('')}</div>${dayStrip(di)}`;
  const dayItems = evs.filter(e => dateKey(e.t) === D && (e.type === 'feed' || e.type === 'health' || e.type === 'weight' || (e.type === 'sleep' && e.kind === 'nap'))).sort(byT);
  h += dayItems.map(e => {
    let extra = '';
    if (e.type === 'sleep') { const i = di.naps.findIndex(n => n.id === e.id); if (di.wins[i] != null) extra = ` <span class="muted small">· janela antes ${dur(di.wins[i])}</span>`; }
    return row(e, extra);
  }).join('') || '<p class="muted">Nenhum registro de dia.</p>';
  h += `</section>`;
  // Noite
  h += `<section class="card"><div class="cardhead"><h2>Noite de ${fmtDate(D)}</h2></div>`;
  if (nightS) {
    const n = nightOf(evs, nightS);
    const ms = [['Dormiu', hm(nightS.t)], ['1º sono', n.first != null ? dur(n.first) : '—'], ['Mamadas', String(n.feeds)], ['Despertares', String(n.wakes.length)]];
    h += `<div class="mini">${ms.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>`;
    h += row(nightS) + n.wakes.map(w => row(w)).join('');
    h += `<div class="score"><span class="muted small">Como foi a noite (1 a 10)</span><div>${Array.from({ length: 10 }, (_, i) => `<button class="chip sm ${nightS.score === i + 1 ? 'on' : ''}" data-act="score" data-id="${nightS.id}" data-v="${i + 1}">${i + 1}</button>`).join('')}</div></div>`;
  } else h += '<p class="muted">Nenhuma noite registrada nesta data.</p>';
  h += `</section>`;
  h += `<section class="card"><div class="cardhead"><h2>Adicionar</h2></div><div class="addgrid">
    <button class="btn" data-act="add" data-type="sleep" data-kind="nap">Soneca</button><button class="btn" data-act="add" data-type="sleep" data-kind="night">Noite</button>
    <button class="btn" data-act="add" data-type="wake">Despertar</button><button class="btn" data-act="add" data-type="feed">Mamada</button>
    <button class="btn" data-act="add" data-type="health">Saúde</button><button class="btn" data-act="add" data-type="weight">Peso</button></div></section>`;
  view.innerHTML = h;
  $('#logPick').addEventListener('change', e => { if (e.target.value) { logDate = e.target.value > today() ? today() : e.target.value; render(); } });
}

// ---------- GRÁFICOS ----------
function periodStats(evs, from, to) {
  const ns = nights(evs, from, to).filter(n => n.ok);
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) { const di = dayInfo(evs, d); if (di.complete) days.push(di); }
  return {
    ns, days,
    bed: avg(ns.map(n => minOfDay(n.s.t))),
    first: avg(ns.map(n => n.first).filter(v => v != null)),
    feeds: avg(ns.map(n => n.feeds)), wakes: avg(ns.map(n => n.wakes.length)),
    day: avg(days.map(d => d.total))
  };
}
function renderCharts() {
  const evs = S.all(), to = today(), from = addDays(to, -range + 1);
  const cur = periodStats(evs, from, to), prev = periodStats(evs, addDays(from, -range), addDays(from, -1));
  const all = nights(evs, from, to);
  const cmp = (a, b, fmt, goodUp) => {
    if (a == null) return '';
    if (b == null) return '<small class="muted">sem período anterior</small>';
    const better = goodUp ? a > b : a < b, same = Math.abs(a - b) < 0.05 * Math.max(1, Math.abs(b));
    return `<small class="${same ? 'muted' : better ? 'goodText' : 'warnText'}">${same ? '=' : a > b ? '↑' : '↓'} antes ${fmt(b)}</small>`;
  };
  const hmM = m => (m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
  const tiles = [
    ['Dorme às', hmM(cur.bed), ''],
    ['1º sono', dur(cur.first), cmp(cur.first, prev.first, dur, true)],
    ['Mamadas/noite', fmtNum(cur.feeds), cmp(cur.feeds, prev.feeds, v => fmtNum(v), false)],
    ['Despertares/noite', fmtNum(cur.wakes), cmp(cur.wakes, prev.wakes, v => fmtNum(v), false)],
    ['Sono de dia', dur(cur.day), cmp(cur.day, prev.day, dur, null)]
  ];
  let h = `<div class="seg wide" role="group" aria-label="Período">${[7, 14, 30].map(n => `<button data-act="range" data-v="${n}" aria-pressed="${range === n}">${n} dias</button>`).join('')}</div>`;
  h += `<div class="tiles">${tiles.map(([l, v, c]) => `<div class="tile"><small>${l}</small><b>${v}</b>${c}</div>`).join('')}</div>`;
  if (!all.length) { view.innerHTML = h + `<p class="muted center">Sem noites registradas neste período.</p>`; return; }
  const lg = `<div class="legend"><span><svg viewBox="0 0 14 14">${marker('f', 7, 7)}</svg>Mamou</span><span><svg viewBox="0 0 14 14">${marker('h', 7, 7)}</svg>Com ajuda</span><span><svg viewBox="0 0 14 14">${marker('s', 7, 7.5)}</svg>Sozinho</span><span><svg viewBox="0 0 14 14">${marker('a', 7, 7)}</svg>Acordado</span></div>`;
  h += `<section class="card"><h2>Noites</h2>${lg}${nightTimeline(all)}</section>`;
  h += `<section class="card"><h2>Primeiro sono da noite</h2><p class="muted small">Do momento em que dormiu até o primeiro despertar.</p>${bars(cur.ns.map(n => ({ label: fmtDate(n.date), v: n.first != null ? n.first / 60 : null })), { max: 7, step: 1, unit: 'h', fmt: v => dur(v * 60) })}</section>`;
  h += `<section class="card"><h2>Despertares por noite</h2><div class="legend"><span><i style="background:var(--feed)"></i>Com mamada</span><span><i style="background:var(--help)"></i>Sem mamada</span></div>${stacked(cur.ns.map(n => ({ label: fmtDate(n.date), a: n.feeds, b: n.wakes.length - n.feeds })))}</section>`;
  if (cur.days.length) h += `<section class="card"><h2>Sono de dia</h2><p class="muted small">Total das sonecas, só em dias completos.</p>${bars(cur.days.map(d => ({ label: fmtDate(d.D), v: d.total / 60 })), { max: 5, step: 1, unit: 'h', fmt: v => dur(v * 60) })}</section>`;
  const who = {}; all.forEach(n => n.wakes.forEach(w => { const k = w.by || 'não anotado'; who[k] = (who[k] || 0) + 1; }));
  const tot = Object.values(who).reduce((a, b) => a + b, 0);
  if (tot) h += `<section class="card"><h2>Quem levantou</h2><p class="muted small">Despertares registrados por pessoa, no período.</p>${Object.entries(who).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="share"><span>${esc(k)}</span><div class="sbar"><i style="width:${(v / tot * 100).toFixed(0)}%"></i></div><b>${v}</b></div>`).join('')}</section>`;
  view.innerHTML = h;
}

// ---------- MAIS ----------
function plannerHTML() {
  const ty = typical(S.all(), today());
  const cfg = planN === 3 ? { win: [ty.win[0], ty.win[1], Math.max(ty.win[2], 120)], nap: [ty.nap[0], ty.nap[1], Math.min(ty.nap[2], 45)], last: ty.last[3] } : { win: ty.win, nap: ty.nap, last: ty.last[4] };
  const base = today() + 'T' + planWake;
  let t = base, li = `<li><span class="t">${hm(t)}</span>Acorda</li>`;
  cfg.nap.slice(0, planN).forEach((m, i) => { const a = addMin(t, cfg.win[i]), z = addMin(a, m); li += `<li class="nap"><span class="t">${hm(a)} – ${hm(z)}</span>Soneca ${i + 1} <span class="muted">· janela ${dur(cfg.win[i])}</span></li>`; t = z; });
  const ideal = addMin(t, cfg.last), lo = today() + 'T18:15', hi = today() + 'T18:45';
  const bed = ideal < lo ? lo : ideal > hi ? hi : ideal, lw = mins(t, bed);
  li += `<li class="bed"><span class="t">${hm(bed)}</span>Noite <span class="muted">· última janela ${dur(lw)}</span></li>`;
  let msg = `<div class="alert ok">Deitar na faixa de sempre (18:15–18:45).</div>`;
  if (mins(hi, ideal) > 10) msg = `<div class="alert">A conta passaria de 18:45. Encurte a última soneca.</div>`;
  else if (lw > 150) msg = `<div class="alert">A última janela ficaria em ${dur(lw)}. Faça um cochilo curto no carrinho perto de ${hm(addMin(t, 75))} ou use ${planN === 3 ? '4 sonecas' : 'janelas um pouco maiores'}.</div>`;
  return `<div class="planner"><label>Acordou às <input type="time" id="planWake" value="${planWake}"></label>
    <div class="seg" role="group" aria-label="Sonecas">${[3, 4].map(n => `<button data-act="planN" data-v="${n}" aria-pressed="${planN === n}">${n} sonecas</button>`).join('')}</div></div>
    <ul class="plan">${li}</ul>${msg}<p class="muted small">${ty.fromData ? 'Usa as janelas e sonecas típicas dele nos últimos 14 dias.' : 'Ainda há poucos dias registrados. Usando valores típicos para a idade.'} Os sinais de sono dele valem mais que o relógio.</p>`;
}
function renderMore() {
  const s = S.settings, c = S.config;
  const health = S.all().filter(e => e.type === 'health' || e.type === 'weight').sort(byT).reverse().slice(0, 6);
  let h = `<section class="card"><h2>Planejador do dia</h2>${plannerHTML()}</section>`;
  h += `<section class="card"><h2>Guia para um despertar à noite</h2><ol class="steps">
    <li><b>Fralda vazou?</b> Troque primeiro, com pouca luz.</li>
    <li><b>3h ou mais desde a última mamada?</b> Ofereça a mamada. Ajustem esse número com o pediatra, de acordo com o peso.</li>
    <li><b>Menos de 3h?</b> Pausa de 1 a 3 minutos, ouvindo. Às vezes ele volta sozinho.</li>
    <li><b>Não acalmou?</b> Toque e shh no berço.</li>
    <li><b>Ainda não?</b> Colo até acalmar e de volta ao berço.</li>
    <li><b>Choro diferente, febre, puxa a orelha?</b> Não é sono. Trate como doença e registre em Saúde.</li></ol></section>`;
  h += `<section class="card"><div class="cardhead"><h2>Saúde e peso</h2><span><button class="link" data-act="add" data-type="health">+ Saúde</button> <button class="link" data-act="add" data-type="weight">+ Peso</button></span></div>${health.map(e => row(e)).join('') || '<p class="muted">Nada registrado. Anote o peso uma vez por mês.</p>'}</section>`;
  h += `<section class="card"><h2>Bebê</h2><form id="babyForm" class="form">
    <label>Nome<input id="bName" value="${esc(c.babyName)}" autocomplete="off"></label>
    <label>Nascimento<input id="bBirth" type="date" value="${esc(c.birth)}"></label>
    <button class="btn primary">Salvar</button></form></section>`;
  h += `<section class="card"><h2>Sincronização</h2>
    <p class="muted small">Os registros ficam num repositório <b>privado</b> do GitHub. Os dois celulares usam o mesmo repositório e o mesmo token.</p>
    <form id="syncForm" class="form">
      <label>Seu nome<input id="sMe" value="${esc(s.me)}" autocomplete="given-name"></label>
      <label>Repositório (dono/nome)<input id="sRepo" value="${esc(s.repo)}" placeholder="usuario/diario-do-sono-dados" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>Token do GitHub<input id="sToken" type="password" value="${esc(s.token)}" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>
      <div class="btnrow"><button class="btn primary">Salvar e testar</button><button type="button" class="btn" data-act="syncNow">Sincronizar agora</button></div>
      <p id="syncMsg" class="small" aria-live="polite">${S.status.msg ? esc(S.status.msg) : ''}</p>
    </form>
    <details><summary>Como criar o token</summary><ol class="small">
      <li>No GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
      <li>Repository access: <b>Only select repositories</b> → escolha o repositório de dados.</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b>.</li>
      <li>Gere, copie e cole aqui. Mande o mesmo token para o outro celular por uma mensagem privada.</li></ol></details></section>`;
  h += `<section class="card"><h2>Dados</h2><p class="muted small">${S.all().length} registros neste aparelho.</p><div class="btnrow">
    <button class="btn" data-act="exportCsv">Baixar CSV</button><button class="btn" data-act="exportJson">Baixar JSON</button>
    <label class="btn">Importar JSON<input type="file" id="importFile" accept="application/json,.json" hidden></label></div></section>`;
  h += `<section class="card"><h2>Instalar no celular</h2><p class="small"><b>iPhone:</b> abra no Safari → Compartilhar → Adicionar à Tela de Início.<br><b>Android:</b> Chrome → menu ⋮ → Instalar app.</p></section>`;
  view.innerHTML = h;
  $('#planWake').addEventListener('change', e => { planWake = e.target.value || '06:30'; renderMore(); });
  $('#babyForm').addEventListener('submit', e => { e.preventDefault(); S.saveConfig({ babyName: $('#bName').value.trim(), birth: $('#bBirth').value }); toast('Salvo.'); });
  $('#syncForm').addEventListener('submit', async e => {
    e.preventDefault();
    S.saveSettings({ me: $('#sMe').value.trim(), repo: $('#sRepo').value.trim(), token: $('#sToken').value.trim() });
    const m = $('#syncMsg'); m.textContent = 'Testando…';
    try { m.textContent = await S.testConnection(); await S.sync(); m.textContent += ' ' + S.status.msg; }
    catch (err) { m.textContent = err.message; }
  });
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); const n = S.importEvents(Array.isArray(j) ? j : j.events || []); toast(`${n} registros importados.`); }
    catch { toast('Arquivo inválido.'); }
  });
}

// ---------- editor ----------
const dtInput = (id, label, v, req) => `<label>${label}<input type="datetime-local" id="${id}" value="${v ? esc(v) : ''}" ${req ? 'required' : ''}></label>`;
function openEditor(id, preset) {
  const e = id ? { ...S.get(id) } : preset;
  const isNew = !id;
  const T = { sleep: e.kind === 'night' ? 'Noite' : 'Soneca', wake: 'Despertar', feed: 'Mamada', health: 'Saúde', weight: 'Peso' }[e.type];
  let f = '';
  if (e.type === 'sleep') {
    f += `<label>Tipo<select id="fKind"><option value="nap" ${e.kind === 'nap' ? 'selected' : ''}>Soneca</option><option value="night" ${e.kind === 'night' ? 'selected' : ''}>Noite</option></select></label>`;
    f += dtInput('fT', 'Dormiu', e.t, true) + dtInput('fEnd', 'Acordou (vazio = ainda dormindo)', e.end);
    f += `<label>Onde<select id="fPlace"><option value="">—</option>${PLACES.map(p => `<option ${e.place === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>`;
    f += `<label>Como pegou no sono<select id="fHow"><option value="">—</option>${HOW.map(([v, l]) => `<option value="${v}" ${e.how === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    if (e.kind === 'night') f += `<label>Nota da noite (1 a 10)<input id="fScore" type="number" min="1" max="10" inputmode="numeric" value="${e.score || ''}"></label>`;
  } else if (e.type === 'wake') {
    f += dtInput('fT', 'Acordou', e.t, true) + dtInput('fEnd', 'Voltou a dormir', e.end);
    f += `<fieldset><legend>O que aconteceu</legend><div class="codes small">${CODES.map(([c, l]) => `<label class="code ${(e.codes || []).includes(c) ? 'on' : ''}"><input type="checkbox" value="${c}" ${(e.codes || []).includes(c) ? 'checked' : ''}><b>${c}</b><span>${l}</span></label>`).join('')}</div></fieldset>`;
  } else if (e.type === 'feed') {
    f += dtInput('fT', 'Hora', e.t, true);
  } else if (e.type === 'health') {
    f += dtInput('fT', 'Hora', e.t, true);
    f += `<label>Temperatura (°C)<input id="fTemp" type="number" step="0.1" min="34" max="43" inputmode="decimal" value="${e.temp || ''}"></label>`;
    f += `<label>Remédio<input id="fMed" value="${esc(e.med || '')}"></label><label>Dose<input id="fDose" value="${esc(e.dose || '')}"></label>`;
  } else if (e.type === 'weight') {
    f += dtInput('fT', 'Data', e.t, true) + `<label>Peso (g)<input id="fGrams" type="number" min="1000" max="20000" inputmode="numeric" value="${e.grams || ''}" required></label>`;
  }
  f += `<label>Quem<input id="fBy" list="peopleList" value="${esc(e.by || (isNew ? S.settings.me : ''))}"><datalist id="peopleList">${people().map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>`;
  f += `<label>Observação<textarea id="fNote" rows="2">${esc(e.note || '')}</textarea></label>`;
  sheet.innerHTML = `<div class="backdrop" data-act="close"></div><form class="panel" id="edForm" novalidate>
    <div class="cardhead"><h2>${isNew ? 'Novo registro' : 'Editar'} · ${T}</h2><button type="button" class="btn icon" data-act="close" aria-label="Fechar">✕</button></div>
    <div class="form">${f}</div><p id="edErr" class="errText small" aria-live="polite"></p>
    <div class="btnrow"><button class="btn primary big">Salvar</button>${isNew ? '' : '<button type="button" class="btn danger" id="delBtn">Excluir</button>'}</div></form>`;
  sheet.hidden = false;
  sheet.querySelectorAll('.codes input').forEach(i => i.addEventListener('change', () => i.parentElement.classList.toggle('on', i.checked)));
  const del = $('#delBtn');
  if (del) del.addEventListener('click', () => { if (del.dataset.armed) { S.remove(e.id); closeSheet(); toast('Excluído.'); } else { del.dataset.armed = 1; del.textContent = 'Toque de novo para excluir'; } });
  $('#edForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const val = sel => { const el = $(sel); return el ? el.value.trim() : undefined; };
    const r = { ...e, t: val('#fT'), by: val('#fBy'), note: val('#fNote') };
    if (!r.t) return ($('#edErr').textContent = 'Preencha a hora.');
    if (e.type === 'sleep' || e.type === 'wake') { r.end = val('#fEnd') || null; if (r.end && r.end < r.t) return ($('#edErr').textContent = 'O fim está antes do começo.'); }
    if (e.type === 'sleep') { r.kind = val('#fKind'); r.place = val('#fPlace'); r.how = val('#fHow'); const sc = val('#fScore'); r.score = sc ? Math.max(1, Math.min(10, +sc)) : undefined; }
    if (e.type === 'wake') r.codes = [...sheet.querySelectorAll('.codes input:checked')].map(i => i.value);
    if (e.type === 'health') { r.temp = val('#fTemp'); r.med = val('#fMed'); r.dose = val('#fDose'); }
    if (e.type === 'weight') { r.grams = val('#fGrams'); if (!r.grams) return ($('#edErr').textContent = 'Preencha o peso.'); }
    if (r.end === null) delete r.end;
    S.put(r); closeSheet(); toast('Salvo.');
  });
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; render(); }
function askScore(id) {
  sheet.innerHTML = `<div class="backdrop" data-act="close"></div><div class="panel"><div class="cardhead"><h2>Bom dia! Como foi a noite?</h2><button type="button" class="btn icon" data-act="close" aria-label="Fechar">✕</button></div>
    <p class="muted small">1 = muito difícil, 10 = ótima. Ajuda a ver a tendência.</p>
    <div class="scoregrid">${Array.from({ length: 10 }, (_, i) => `<button class="chip big" data-act="scoreClose" data-id="${id}" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="btnrow"><button class="btn" data-act="close">Pular</button></div></div>`;
  sheet.hidden = false;
}

// ---------- toast ----------
let toastTimer;
function toast(msg, editId) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${editId ? `<button class="link" data-act="edit" data-id="${editId}">Editar</button>` : ''}`;
  t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 4500);
}

// ---------- exportar ----------
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function toCsv() {
  const cols = ['tipo', 'subtipo', 'inicio', 'fim', 'minutos', 'codigos', 'onde', 'como', 'quem', 'temperatura', 'remedio', 'dose', 'peso_g', 'nota_noite', 'observacao'];
  const q = v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const lines = S.all().sort(byT).map(e => [e.type, e.kind, e.t, e.end, e.end ? mins(e.t, e.end) : '', (e.codes || []).join(' '), e.place, e.how, e.by, e.temp, e.med, e.dose, e.grams, e.score, e.note].map(q).join(','));
  return [cols.join(','), ...lines].join('\n');
}

// ---------- ações ----------
const actions = {
  code(b) { const w = S.get(b.dataset.id), set = new Set(w.codes || []); set.has(b.dataset.c) ? set.delete(b.dataset.c) : set.add(b.dataset.c); S.put({ ...w, codes: [...set] }); },
  who(b) { const w = S.get(b.dataset.id); S.put({ ...w, by: w.by === b.dataset.v ? '' : b.dataset.v }); },
  how(b) { const s = S.get(b.dataset.id); S.put({ ...s, how: s.how === b.dataset.v ? '' : b.dataset.v }); },
  place(b) { const s = S.get(b.dataset.id); S.put({ ...s, place: s.place === b.dataset.v ? '' : b.dataset.v }); },
  startWake() { const r = S.put({ id: uid(), type: 'wake', t: nowLocal(), codes: [], by: S.settings.me }); toast(`Despertar às ${hm(r.t)}`, r.id); },
  endWake(b) { const w = S.get(b.dataset.id); S.put({ ...w, end: nowLocal() }); toast('Voltou a dormir.', w.id); },
  morning(b) {
    const s = S.get(b.dataset.id), now = nowLocal();
    S.all().filter(e => e.type === 'wake' && e.t >= s.t && !e.end).forEach(w => S.put({ ...w, end: now }));
    S.put({ ...S.get(s.id), end: now }); askScore(s.id);
  },
  startNap() { const r = S.put({ id: uid(), type: 'sleep', kind: 'nap', t: nowLocal() }); toast(`Soneca às ${hm(r.t)}`, r.id); },
  startNight() { const r = S.put({ id: uid(), type: 'sleep', kind: 'night', t: nowLocal() }); toast(`Noite às ${hm(r.t)}`, r.id); },
  endSleep(b) { const s = S.get(b.dataset.id); S.put({ ...s, end: nowLocal() }); toast(`Dormiu ${durShort(mins(s.t, nowLocal()))}.`, s.id); },
  feed() { const r = S.put({ id: uid(), type: 'feed', t: nowLocal() }); toast(`Mamada às ${hm(r.t)}`, r.id); },
  edit(b) { openEditor(b.dataset.id); },
  add(b) {
    const base = tab === 'log' ? logDate : today();
    const t = `${base}T${nowLocal().slice(11)}`;
    const type = b.dataset.type, preset = { id: uid(), type, t: tab === 'log' && base !== today() ? `${base}T${type === 'sleep' && b.dataset.kind === 'night' ? '18:30' : '12:00'}` : t };
    if (type === 'sleep') preset.kind = b.dataset.kind || 'nap';
    if (type === 'wake') preset.codes = [];
    openEditor(null, preset);
  },
  score(b) { const s = S.get(b.dataset.id); S.put({ ...s, score: +b.dataset.v }); },
  scoreClose(b) { const s = S.get(b.dataset.id); S.put({ ...s, score: +b.dataset.v }); closeSheet(); toast('Anotado. Bom dia!'); },
  close() { closeSheet(); },
  goLog() { setTab('log'); },
  logPrev() { logDate = addDays(logDate, -1); render(); },
  logNext() { if (logDate < today()) { logDate = addDays(logDate, 1); render(); } },
  range(b) { range = +b.dataset.v; render(); },
  planN(b) { planN = +b.dataset.v; renderMore(); },
  syncNow() { S.sync(); },
  exportCsv() { download(`diario-sono-${today()}.csv`, toCsv(), 'text/csv'); },
  exportJson() { download(`diario-sono-${today()}.json`, JSON.stringify({ events: S.exportAll(), config: S.config }, null, 1), 'application/json'); }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { e.preventDefault(); setTab(t.dataset.tab); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (fn) { e.preventDefault(); if (b.closest('#toast')) $('#toast').classList.remove('on'); fn(b); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
$('#syncBtn').addEventListener('click', () => { if (!S.settings.token) setTab('more'); else S.sync(); });

function setTab(t) { tab = t; history.replaceState(null, '', '#' + t); window.scrollTo(0, 0); render(); }

S.onChange(() => {
  renderHeader();
  const a = document.activeElement;
  if (!sheet.hidden) return;
  if (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  render();
});
setInterval(() => { if (tab === 'now' && sheet.hidden && document.visibilityState === 'visible') renderNow(); }, 30000);
setInterval(() => { if (document.visibilityState === 'visible') S.sync(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { S.sync(); render(); } });
window.addEventListener('online', () => S.sync());
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (['now', 'log', 'charts', 'more'].includes(t) && t !== tab) { tab = t; render(); } });

render();
S.sync();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
