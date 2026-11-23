import { api, tokenStore } from './common.js';

const $ = (id) => document.getElementById(id);

if (tokenStore.get()) $('goDash').classList.remove('hidden');

function show(which) {
  const up = which === 'up';
  $('formUp').classList.toggle('hidden', !up);
  $('formIn').classList.toggle('hidden', up);
  $('tabUp').setAttribute('aria-selected', String(up));
  $('tabIn').setAttribute('aria-selected', String(!up));
}
$('tabUp').addEventListener('click', () => show('up'));
$('tabIn').addEventListener('click', () => show('in'));

async function submit(e, { path, body, errEl, btn, busy }) {
  e.preventDefault();
  errEl.textContent = '';
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = busy;
  try {
    const r = await api(path, { method: 'POST', body: body() });
    tokenStore.set(r.token);
    location.href = '/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = label;
  }
}

$('formUp').addEventListener('submit', (e) => submit(e, {
  path: '/auth/signup', errEl: $('errUp'), btn: $('btnUp'), busy: 'Creating...',
  body: () => ({ businessName: $('upName').value, phone: $('upPhone').value, password: $('upPass').value }),
}));
$('formIn').addEventListener('submit', (e) => submit(e, {
  path: '/auth/login', errEl: $('errIn'), btn: $('btnIn'), busy: 'Logging in...',
  body: () => ({ phone: $('inPhone').value, password: $('inPass').value }),
}));
