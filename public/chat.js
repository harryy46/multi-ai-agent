import { api, el, prettyDate, prettyTime } from './common.js';

const slug = location.pathname.split('/').filter(Boolean)[1] || '';
const msgs = document.getElementById('msgs');
const log = document.getElementById('log');
const input = document.getElementById('msg');
const send = document.getElementById('send');
let history = [];
let busy = false;

function add(text, who) {
  const b = el('div', { class: `bub ${who}`, text });
  msgs.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

function addTicket(b) {
  const when = `${prettyDate(b.date)}, ${prettyTime(b.time)}`;
  msgs.append(el('div', { class: 'ticket' },
    el('div', { text: 'Booking confirmed' }),
    el('strong', { text: b.code }),
    el('div', { text: [b.service, when].filter(Boolean).join(' · ') }),
  ));
  log.scrollTop = log.scrollHeight;
}

async function ask(text) {
  if (busy || !text.trim()) return;
  busy = true;
  send.disabled = true;
  add(text, 'me');
  input.value = '';
  const typing = add('Typing...', 'bot typing');
  try {
    const r = await api(`/chat/${encodeURIComponent(slug)}`, { method: 'POST', body: { message: text, history } });
    typing.remove();
    add(r.reply, 'bot');
    if (r.booking) addTicket(r.booking);
    history.push({ role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text: r.reply }] });
    history = history.slice(-20);
  } catch (e) {
    typing.remove();
    add(e.message, 'bot');
  } finally {
    busy = false;
    send.disabled = false;
    input.focus();
  }
}

document.getElementById('form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });

try {
  const biz = await api(`/public/${encodeURIComponent(slug)}`);
  document.title = `${biz.name} – Booking`;
  document.getElementById('bizName').textContent = biz.name;
  document.getElementById('bizMeta').textContent = [biz.category, biz.address].filter(Boolean).join(' · ');
  if (biz.services && biz.services.length) {
    const chips = document.getElementById('chips');
    chips.classList.remove('hidden');
    for (const s of biz.services) {
      chips.append(el('button', { class: 'chip', type: 'button', text: `${s.name} · ₹${s.price}`, onclick: () => ask(`I'd like to book ${s.name}`) }));
    }
  }
  add(`Hi! Ask me anything about ${biz.name}, or book an appointment here.`, 'bot');
  input.disabled = false;
  send.disabled = false;
  input.focus();
} catch (e) {
  document.getElementById('bizName').textContent = 'This link is not valid';
  document.getElementById('bizMeta').textContent = 'Ask the business for a new link.';
}
