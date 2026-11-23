// Sab pages ke liye chhote helpers. User ka likha text hamesha textContent se dikhta hai (XSS se bachav).
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) n.append(kid);
  return n;
}

export const tokenStore = {
  get() { try { return localStorage.getItem('sb_token') || ''; } catch { return ''; } },
  set(t) { try { localStorage.setItem('sb_token', t); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem('sb_token'); } catch { /* ignore */ } },
};

export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${tokenStore.get()}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Could not reach the server. Check your internet and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* khaali response */ }
  if (res.status === 401 && auth) {
    tokenStore.clear();
    location.href = '/';
    throw new Error('Please log in again.');
  }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.data = data; throw e; }
  return data;
}

export function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function shiftDate(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function prettyDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function prettyTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// Service worker (Play Store / "Add to Home Screen" ke liye)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
