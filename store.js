// Guarda os registros no aparelho e sincroniza com um repositório privado do GitHub.
// Cada mês vira um arquivo data/AAAA-MM.json. Cada registro tem um id e um carimbo "updated".
// Na mesclagem, ganha a versão com o "updated" mais novo. Excluir = marcar deleted:true.

const K = { ev: 'ds.events', dirty: 'ds.dirty', shas: 'ds.shas', settings: 'ds.settings', config: 'ds.config', cfgDirty: 'ds.configDirty' };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };

let events = load(K.ev, {});
let dirty = load(K.dirty, {});          // mês -> contador de mudanças
let shas = load(K.shas, {});            // caminho -> sha remoto
export const settings = Object.assign({ repo: 'cmgsilv-builder/diario-do-sono-dados', token: '', me: '', api: 'https://api.github.com' }, load(K.settings, {}));
export let config = Object.assign({ babyName: '', birth: '', updated: 0 }, load(K.config, {}));
let configDirty = load(K.cfgDirty, false);

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

export const status = { state: 'idle', msg: '', last: null };
const setStatus = (state, msg) => { status.state = state; status.msg = msg; if (state === 'ok') status.last = new Date(); emit(); };

const month = t => t.slice(0, 7);
const markDirty = m => { dirty[m] = (dirty[m] || 0) + 1; };
function persist() { save(K.ev, events); save(K.dirty, dirty); save(K.shas, shas); save(K.config, config); save(K.cfgDirty, configDirty); }

export const all = () => Object.values(events).filter(e => !e.deleted);
export const get = id => events[id];
export const pendingCount = () => Object.keys(dirty).length + (configDirty ? 1 : 0);

export function put(ev) {
  const prev = events[ev.id];
  if (prev && month(prev.t) !== month(ev.t)) markDirty(month(prev.t));
  const rec = { ...ev, updated: Date.now() };
  if (!prev && !rec.by && settings.me) rec.by = settings.me;
  for (const k of Object.keys(rec)) if (rec[k] === '' || rec[k] === undefined) delete rec[k];
  events[rec.id] = rec;
  markDirty(month(rec.t));
  persist(); emit(); scheduleSync();
  return rec;
}
export function remove(id) { const e = events[id]; if (e) put({ ...e, deleted: true }); }

export function importEvents(list) {
  let n = 0;
  for (const r of list) {
    if (!r || !r.id || !r.t || !r.type) continue;
    const l = events[r.id];
    if (!l || (r.updated || 0) > (l.updated || 0)) { events[r.id] = r; markDirty(month(r.t)); n++; }
  }
  persist(); emit(); scheduleSync();
  return n;
}
export const exportAll = () => Object.values(events).sort((a, b) => (a.t < b.t ? -1 : 1));

export function saveSettings(s) { Object.assign(settings, s); save(K.settings, settings); emit(); }
export function saveConfig(c) { Object.assign(config, c, { updated: Date.now() }); configDirty = true; persist(); emit(); scheduleSync(); }

function mergeRemote(list) {
  let changed = false;
  for (const r of list || []) {
    const l = events[r.id];
    if (!l || (r.updated || 0) > (l.updated || 0)) { events[r.id] = r; changed = true; }
  }
  return changed;
}

// ---------- GitHub ----------
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => { const bin = atob(s.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };

function errMsg(status) {
  if (status === 401) return 'Token inválido ou expirado.';
  if (status === 403) return 'O token não tem permissão de escrita (Contents: Read and write).';
  if (status === 404) return 'Repositório não encontrado ou o token não tem acesso a ele.';
  return `Erro do GitHub (${status}).`;
}
async function req(path, opt = {}) {
  let r;
  try {
    r = await fetch(settings.api.replace(/\/$/, '') + path, {
      ...opt, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + settings.token.trim(), ...(opt.body ? { 'Content-Type': 'application/json' } : {}) }
    });
  } catch { const e = new Error('Sem internet. Os registros ficam guardados aqui e sobem depois.'); e.offline = true; throw e; }
  if (!r.ok) { const e = new Error(errMsg(r.status)); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}
const repoPath = () => `/repos/${settings.repo.trim()}`;
async function getFile(p) {
  try { const j = await req(`${repoPath()}/contents/${p}`); return { json: JSON.parse(b64dec(j.content)), sha: j.sha }; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
async function putFile(p, obj, sha, message) {
  const body = { message, content: b64enc(JSON.stringify(obj, null, 1)) };
  if (sha) body.sha = sha;
  const j = await req(`${repoPath()}/contents/${p}`, { method: 'PUT', body: JSON.stringify(body) });
  return j.content.sha;
}

export async function testConnection() {
  if (!settings.repo || !settings.token) throw new Error('Preencha o repositório e o token.');
  const r = await req(repoPath());
  if (!r.permissions || !r.permissions.push) {
    if (r.permissions) throw new Error('O token só tem leitura. Ele precisa de Contents: Read and write.');
  }
  return r.private ? 'Conectado. O repositório é privado. ✓' : 'Conectado, mas o repositório é PÚBLICO. Deixe-o privado.';
}

let syncing = false, again = false, timer = null;
export function scheduleSync(delay = 1500) { clearTimeout(timer); timer = setTimeout(sync, delay); }

export async function sync() {
  if (!settings.repo || !settings.token) { setStatus('local', 'Só neste aparelho'); return; }
  if (syncing) { again = true; return; }
  syncing = true; setStatus('sync', 'Sincronizando…');
  try {
    // 1. baixar o que mudou
    let list = [];
    try { list = await req(`${repoPath()}/contents/data`); } catch (e) { if (e.status !== 404) throw e; }
    let changed = false;
    for (const f of list) {
      const m = /^(\d{4}-\d{2})\.json$/.exec(f.name); if (!m) continue;
      if (shas[f.path] === f.sha) continue;
      const r = await getFile(f.path);
      if (r) { changed = mergeRemote(r.json.events) || changed; shas[f.path] = r.sha; }
    }
    // 2. configuração (nome e nascimento)
    const rc = await getFile('config.json');
    if (rc) { shas['config.json'] = rc.sha; if ((rc.json.updated || 0) > (config.updated || 0)) { config = Object.assign(config, rc.json); configDirty = false; changed = true; } }
    if (configDirty) {
      shas['config.json'] = await putFile('config.json', config, shas['config.json'], `${settings.me || 'app'}: configuração`);
      configDirty = false;
    }
    persist(); if (changed) emit();
    // 3. subir os meses alterados
    for (const m of Object.keys(dirty)) await pushMonth(m);
    persist();
    setStatus('ok', 'Sincronizado');
  } catch (e) {
    persist();
    setStatus(e.offline ? 'offline' : 'err', e.message);
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(300); }
  }
}

async function pushMonth(m) {
  const path = `data/${m}.json`;
  for (let i = 0; i < 4; i++) {
    const stamp = dirty[m];
    const evs = Object.values(events).filter(e => month(e.t) === m).sort((a, b) => (a.t < b.t ? -1 : 1));
    try {
      shas[path] = await putFile(path, { events: evs }, shas[path], `${settings.me || 'app'}: ${m}`);
      if (dirty[m] === stamp) delete dirty[m];
      return;
    } catch (e) {
      if (e.status === 409 || e.status === 422) {          // alguém salvou antes: mesclar e tentar de novo
        const r = await getFile(path);
        if (r) { if (mergeRemote(r.json.events)) emit(); shas[path] = r.sha; } else delete shas[path];
        continue;
      }
      throw e;
    }
  }
  throw new Error('Conflito ao salvar. Tente de novo.');
}
