// Sab kuch Indian Standard Time (IST, UTC+5:30) me hai.
const IST_OFFSET_MIN = 330;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const pad = (n) => String(n).padStart(2, '0');

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
}

export const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function istDate(ms = Date.now()) {
  return new Date(ms + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

export function istMinutesNow(ms = Date.now()) {
  const d = new Date(ms + IST_OFFSET_MIN * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const dayName = (dateStr) => DAYS[weekday(dateStr)];

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// IST ke date + time se asli UTC instant banata hai
export function toInstant(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
}

// +91, 0 prefix, spaces hata ke 10 digit Indian mobile number return karta hai, warna null
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// Din ke saare slot start-times (minutes me): working hours, closed days aur break ke hisab se
export function generateGrid(biz, dateStr) {
  const h = biz.hours || {};
  const step = biz.slotMinutes || 30;
  if ((biz.closedDays || []).includes(weekday(dateStr))) return [];
  const open = toMinutes(h.open || '10:00');
  const close = toMinutes(h.close || '20:00');
  const bs = h.breakStart ? toMinutes(h.breakStart) : null;
  const be = h.breakEnd ? toMinutes(h.breakEnd) : null;
  const out = [];
  for (let t = open; t + step <= close; t += step) {
    if (bs !== null && be !== null && t < be && t + step > bs) continue;
    out.push(t);
  }
  return out;
}
