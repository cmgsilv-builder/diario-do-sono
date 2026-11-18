// Pequenas funções de data/hora. Todas as horas são guardadas como texto local "AAAA-MM-DDTHH:MM".
export const pad = n => String(n).padStart(2, '0');
export const toLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const nowLocal = () => toLocal(new Date());
export const parse = s => new Date(s);
export const mins = (a, b) => Math.round((parse(b) - parse(a)) / 60000);
export const addMin = (t, m) => toLocal(new Date(parse(t).getTime() + m * 60000));
export const hm = s => (s ? s.slice(11, 16) : '—');
export const minOfDay = s => +s.slice(11, 13) * 60 + +s.slice(14, 16);
export const dur = m => { if (m == null || isNaN(m)) return '—'; m = Math.max(0, Math.round(m)); return `${Math.floor(m / 60)}h${pad(m % 60)}`; };
export const durShort = m => { m = Math.max(0, Math.round(m)); return m < 60 ? `${m} min` : dur(m); };
export const dateKey = s => s.slice(0, 10);
export const today = () => nowLocal().slice(0, 10);
export const fmtDate = k => { const [, m, d] = k.split('-'); return `${d}/${m}`; };
export const addDays = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return toLocal(d).slice(0, 10); };
export const weekday = k => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(k + 'T12:00').getDay()];
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const byT = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
export const fmtNum = (x, d = 1) => (x == null ? '—' : x.toFixed(d).replace('.', ','));

export function ageText(birth) {
  if (!birth) return '';
  const b = new Date(birth + 'T12:00'), n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
  if (n.getDate() < b.getDate()) months--;
  const ref = new Date(b); ref.setMonth(b.getMonth() + months);
  const weeks = Math.floor((n - ref) / (7 * 864e5));
  if (months < 1) return `${Math.floor((n - b) / (7 * 864e5))} semanas`;
  return `${months} ${months === 1 ? 'mês' : 'meses'}${weeks > 0 ? ` e ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}` : ''}`;
}
