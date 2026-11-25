(function () {
  const p = new URLSearchParams(location.search);
  const isCust =
    location.pathname.includes('chat') ||
    p.has('b') ||
    p.has('business') ||
    p.has('client');
  if (!isCust) return;

  const biz = (p.get('b') || p.get('business') || 'Smart Booking').trim();
  const defaultSlots = [
    '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM',
    '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
    '06:00 PM', '07:00 PM', '08:00 PM'
  ];
  const staffList = ['Any Available', 'Senior Staff', 'Specialist'];
  let selService = '';
  let selSlot = '';
  let selStaff = 'Any Available';

  if (!document.getElementById('sb-p1-css')) {
    const st = document.createElement('style');
    st.id = 'sb-p1-css';
    st.textContent =
      '#sb-p1-panel{margin:12px auto;max-width:680px;background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;color:#fff;font-family:sans-serif;box-sizing:border-box}' +
      '.sb-p1-title{font-size:12px;font-weight:700;color:#38bdf8;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.4px}' +
      '.sb-p1-grid{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.sb-p1-chip{padding:7px 11px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px;font-weight:600;cursor:pointer;transition:0.15s}' +
      '.sb-p1-chip.sel{background:#4f46e5;border-color:#6366f1;color:#fff}' +
      '.sb-p1-chip.booked{background:#020617;border-color:#1e293b;color:#475569;text-decoration:line-through;cursor:not-allowed}' +
      '.sb-p1-note{font-size:11px;color:#94a3b8;margin-top:-6px;margin-bottom:10px}';
    document.head.appendChild(st);
  }

  function syncDropdown() {
    const sel = document.querySelector('select');
    if (!sel || !biz) return;
    if (!Array.from(sel.options).some((o) => o.value === biz)) {
      const opt = document.createElement('option');
      opt.value = biz;
      opt.text = biz;
      sel.insertBefore(opt, sel.firstChild);
    }
    if (sel.value !== biz) {
      sel.value = biz;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function setInput(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncForm() {
    if (selService) {
      setInput('cbService', selService + (selStaff !== 'Any Available' ? ' [' + selStaff + ']' : ''));
    }
    if (selSlot) {
      setInput('cbTime', 'Today ' + selSlot);
    }
  }

  async function buildPanel() {
    syncDropdown();
    if (document.getElementById('sb-p1-panel')) return;

    const anchor =
      document.getElementById('sb-quick-wrap') ||
      document.querySelector('form') ||
      document.body.lastElementChild;
    if (!anchor) return;

    const cfg = await fetch('/api/biz-config?b=' + encodeURIComponent(biz))
      .then((r) => r.json())
      .catch(() => ({}));
    const bookedList = await fetch('/api/walkin-bookings?b=' + encodeURIComponent(biz))
      .then((r) => r.json())
      .catch(() => []);
    const bookedTimes = (Array.isArray(bookedList) ? bookedList : []).map((x) =>
      String(x.time || '').toLowerCase()
    );

    const rawServices = (cfg && cfg.s ? cfg.s : 'Haircut Rs 150, Beard Rs 80, Facial Rs 400')
      .split(/[,\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (document.getElementById('sb-p1-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sb-p1-panel';
    panel.innerHTML =
      '<div class="sb-p1-title">1. Select Service</div>' +
      '<div class="sb-p1-grid" id="sb-p1-svcs"></div>' +
      '<div class="sb-p1-title">2. Select Available Time Slot</div>' +
      '<div class="sb-p1-grid" id="sb-p1-slots"></div>' +
      '<div class="sb-p1-note">Grey slots are already booked.</div>' +
      '<div class="sb-p1-title">3. Preferred Staff / Specialist</div>' +
      '<div class="sb-p1-grid" id="sb-p1-staff"></div>';

    anchor.insertAdjacentElement('afterend', panel);

    const svcBox = document.getElementById('sb-p1-svcs');
    rawServices.forEach((sv) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-p1-chip';
      b.textContent = sv;
      b.onclick = () => {
        selService = sv;
        svcBox.querySelectorAll('.sb-p1-chip').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        syncForm();
      };
      svcBox.appendChild(b);
    });

    const slotBox = document.getElementById('sb-p1-slots');
    defaultSlots.forEach((sl) => {
      const isBooked = bookedTimes.some(
        (t) => t.includes(sl.toLowerCase()) || t.includes(sl.replace(':00 ', ' ').toLowerCase())
      );
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-p1-chip' + (isBooked ? ' booked' : '');
      b.textContent = isBooked ? sl + ' (Booked)' : sl;
      b.disabled = isBooked;
      if (!isBooked) {
        b.onclick = () => {
          selSlot = sl;
          slotBox.querySelectorAll('.sb-p1-chip').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          syncForm();
        };
      }
      slotBox.appendChild(b);
    });

    const stfBox = document.getElementById('sb-p1-staff');
    staffList.forEach((st) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-p1-chip' + (st === selStaff ? ' sel' : '');
      b.textContent = st;
      b.onclick = () => {
        selStaff = st;
        stfBox.querySelectorAll('.sb-p1-chip').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        syncForm();
      };
      stfBox.appendChild(b);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(buildPanel, 300));
  } else {
    setTimeout(buildPanel, 300);
  }
  setTimeout(buildPanel, 1200);
})();