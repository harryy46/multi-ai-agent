import { api, el, prettyDate, prettyTime, shiftDate, toast, todayIST, tokenStore } from './common.js';

if (!tokenStore.get()) location.replace('/');
const $ = (id) => document.getElementById(id);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let biz = null;
let current = todayIST();

/* ---------- Header + share link ---------- */
async function init() {
  biz = await api('/my/business', { auth: true });
  $('bizName').textContent = biz.name;
  const url = `${location.origin}/b/${biz.slug}`;
  $('link').textContent = url;
  $('wa').href = `https://wa.me/?text=${encodeURIComponent(`Book an appointment at ${biz.name}: ${url}`)}`;
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Select the link and copy it'); }
  };
  fillSettings();
  fillAddServices();
  $('day').value = current;
  await loadDay();
}
$('logout').onclick = () => { tokenStore.clear(); location.href = '/'; };

/* ---------- Tabs ---------- */
function tab(which) {
  const b = which === 'b';
  $('paneB').classList.toggle('hidden', !b);
  $('paneS').classList.toggle('hidden', b);
  $('navB').setAttribute('aria-selected', String(b));
  $('navS').setAttribute('aria-selected', String(!b));
}
$('navB').onclick = () => tab('b');
$('navS').onclick = () => tab('s');

/* ---------- Bookings (day sheet) ---------- */
async function loadDay() {
  $('day').value = current;
  const sheet = $('sheet');
  sheet.replaceChildren(el('div', { class: 'empty', text: 'Loading...' }));
  try {
    const { bookings } = await api(`/my/bookings?date=${current}`, { auth: true });
    renderSheet(bookings);
  } catch (e) {
    sheet.replaceChildren(el('div', { class: 'empty', text: e.message }));
  }
}

function renderSheet(list) {
  const sheet = $('sheet');
  if (!list.length) {
    sheet.replaceChildren(el('div', { class: 'empty', text: `No bookings on ${prettyDate(current)} yet. Share your customer link or click "Add booking".` }));
    return;
  }
  sheet.replaceChildren(...list.map(row));
}

async function setStatus(id, status) {
  if (status === 'cancelled' && !confirm('Cancel this booking? The slot will open up again.')) return;
  try {
    await api(`/my/bookings/${id}`, { method: 'PATCH', auth: true, body: { status } });
    toast(status === 'cancelled' ? 'Booking cancelled' : 'Booking marked as done');
    loadDay();
  } catch (e) { toast(e.message); }
}

function row(b) {
  const off = b.status !== 'confirmed';
  const badge = b.status === 'confirmed' ? null : el('span', { class: `badge ${b.status}`, text: b.status === 'cancelled' ? 'Cancelled' : 'Done' });
  const wa = `https://wa.me/91${b.phone}`;
  return el('div', { class: `slotrow${off ? ' off' : ''}` },
    el('div', { class: 't' }, prettyTime(b.time).split(' ')[0], el('small', { text: `${prettyTime(b.time).split(' ')[1]} · ${b.durationMin} min` })),
    el('div', {},
      el('div', { class: 'who' }, el('span', { text: b.customerName }), badge),
      el('div', { class: 'meta', text: [b.service, b.price != null ? `₹${b.price}` : null, b.source === 'ai' ? 'AI chat' : 'Owner'].filter(Boolean).join(' · ') }),
      el('div', { class: 'meta' }, el('a', { href: `tel:${b.phone}`, text: b.phone }), ' · ', el('a', { href: wa, target: '_blank', rel: 'noopener', text: 'WhatsApp' }), ' · ', el('span', { text: `Code ${b.code}` })),
    ),
    b.status === 'confirmed'
      ? el('div', { class: 'acts' },
        el('button', { class: 'btn small ghost', type: 'button', text: 'Done', onclick: () => setStatus(b.id, 'completed') }),
        el('button', { class: 'btn small danger', type: 'button', text: 'Cancel', onclick: () => setStatus(b.id, 'cancelled') }))
      : null,
  );
}

$('prev').onclick = () => { current = shiftDate(current, -1); loadDay(); };
$('next').onclick = () => { current = shiftDate(current, 1); loadDay(); };
$('today').onclick = () => { current = todayIST(); loadDay(); };
$('day').onchange = (e) => { if (e.target.value) { current = e.target.value; loadDay(); } };

/* ---------- Manual booking ---------- */
function fillAddServices() {
  const sel = $('aSvc');
  sel.replaceChildren();
  if (!biz.services.length) {
    sel.append(el('option', { value: '', text: 'No services set' }));
  } else {
    for (const s of biz.services) sel.append(el('option', { value: s.name, text: `${s.name} (₹${s.price}, ${s.duration} min)` }));
  }
}

async function loadSlots() {
  const t = $('aTime');
  t.replaceChildren(el('option', { value: '', text: 'Loading...' }));
  try {
    const q = new URLSearchParams({ date: $('aDate').value, service: $('aSvc').value });
    const r = await api(`/my/slots?${q}`, { auth: true });
    t.replaceChildren(...(r.slots.length
      ? r.slots.map((s) => el('option', { value: s, text: prettyTime(s) }))
      : [el('option', { value: '', text: r.closed ? 'Closed that day' : 'No slots available' })]));
  } catch (e) {
    t.replaceChildren(el('option', { value: '', text: e.message }));
  }
}

$('addBtn').onclick = () => {
  $('addForm').classList.toggle('hidden');
  if (!$('addForm').classList.contains('hidden')) {
    $('aDate').value = current < todayIST() ? todayIST() : current;
    $('aDate').min = todayIST();
    loadSlots();
  }
};
$('aSvc').onchange = loadSlots;
$('aDate').onchange = loadSlots;

$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('aErr').textContent = '';
  try {
    const r = await api('/my/bookings', {
      method: 'POST', auth: true,
      body: { date: $('aDate').value, time: $('aTime').value, service: $('aSvc').value || undefined, customerName: $('aName').value, phone: $('aPhone').value },
    });
    toast(`Booked. Code ${r.booking.code}`);
    $('aName').value = '';
    $('aPhone').value = '';
    current = r.booking.date;
    $('addForm').classList.add('hidden');
    loadDay();
  } catch (err) {
    $('aErr').textContent = err.message;
    loadSlots();
  }
});

/* ---------- Settings ---------- */
function svcRow(s = { name: '', price: '', duration: 30 }) {
  const wrap = el('div', { class: 'svcrow' },
    el('input', { class: 'name', 'aria-label': 'Service name', placeholder: 'Service (e.g. Haircut)', maxlength: 60, value: s.name }),
    el('input', { class: 'price', 'aria-label': 'Price in rupees', type: 'number', min: 0, placeholder: '₹ Price', value: s.price }),
    el('input', { class: 'dur', 'aria-label': 'Minutes', type: 'number', min: 5, max: 480, placeholder: 'Min', value: s.duration }),
    el('button', { class: 'btn small danger', type: 'button', text: 'Remove', onclick: () => wrap.remove() }),
  );
  return wrap;
}

function fillSettings() {
  $('sName').value = biz.name;
  $('sCat').value = biz.category || '';
  $('sAddr').value = biz.address || '';
  $('sDetails').value = biz.details || '';
  $('sInstr').value = biz.instructions || '';
  $('sOpen').value = biz.hours.open;
  $('sClose').value = biz.hours.close;
  $('sBS').value = biz.hours.breakStart || '';
  $('sBE').value = biz.hours.breakEnd || '';
  $('sSlot').value = String(biz.slotMinutes);
  $('days').replaceChildren(...DAYS.map((d, i) => el('label', {},
    el('input', { type: 'checkbox', value: i, checked: biz.closedDays.includes(i) }), d)));
  $('svcList').replaceChildren(...biz.services.map(svcRow));
}
$('addSvc').onclick = () => $('svcList').append(svcRow());

$('setForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('sErr').textContent = '';
  const hours = { open: $('sOpen').value, close: $('sClose').value };
  if ($('sBS').value || $('sBE').value) { hours.breakStart = $('sBS').value; hours.breakEnd = $('sBE').value; }
  const services = [...$('svcList').children].map((r) => ({
    name: r.querySelector('.name').value, price: r.querySelector('.price').value, duration: r.querySelector('.dur').value,
  })).filter((s) => s.name.trim() || s.price !== '');
  const btn = $('sSave');
  btn.disabled = true;
  try {
    biz = await api('/my/business', {
      method: 'PUT', auth: true,
      body: {
        name: $('sName').value, category: $('sCat').value, address: $('sAddr').value,
        details: $('sDetails').value, instructions: $('sInstr').value,
        hours, slotMinutes: Number($('sSlot').value),
        closedDays: [...document.querySelectorAll('#days input:checked')].map((c) => Number(c.value)),
        services,
      },
    });
    $('bizName').textContent = biz.name;
    fillSettings();
    fillAddServices();
    toast('Settings saved');
  } catch (err) {
    $('sErr').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

init().catch((e) => { $('bizName').textContent = e.message; });
