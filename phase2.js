(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCustPage = location.pathname.includes('chat') || Boolean(bizParam);

  function normBiz(name) {
    return String(name || '').trim().toLowerCase();
  }

  function extractPrice(text) {
    if (!text) return 0;
    const s = String(text);
    const beforeOrAfter = s.match(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|₹)/i);
    if (beforeOrAfter) {
      return Math.round(parseFloat(beforeOrAfter[1] || beforeOrAfter[2]));
    }
    const nums = s.match(/\d{2,6}/g);
    if (nums && nums.length) return parseInt(nums[nums.length - 1], 10);
    return 0;
  }

  function getSelectedPanelValues() {
    const srvEl =
      document.querySelector('#sb-p1-services .sb-p1-btn.active') ||
      document.querySelector('#sb-p1-services button[aria-pressed="true"]');
    const slotEl =
      document.querySelector('#sb-p1-slots .sb-p1-btn.active:not(.booked):not([disabled])') ||
      document.querySelector('#sb-p1-slots button.active:not([disabled])');
    const stfEl =
      document.querySelector('#sb-p1-staff .sb-p1-btn.active') ||
      document.querySelector('#sb-p1-staff button.active');

    let service = srvEl ? (srvEl.dataset.val || srvEl.textContent || '').trim() : '';
    let slot = slotEl ? (slotEl.dataset.val || slotEl.textContent || '').trim() : '';
    const staff = stfEl ? (stfEl.dataset.val || stfEl.textContent || '').trim() : '';

    if (!service) {
      const firstSrv = document.querySelector('#sb-p1-services .sb-p1-btn');
      if (firstSrv) service = (firstSrv.dataset.val || firstSrv.textContent || '').trim();
    }
    if (!slot) {
      const firstSlot = document.querySelector('#sb-p1-slots .sb-p1-btn:not(.booked):not([disabled])');
      if (firstSlot) slot = (firstSlot.dataset.val || firstSlot.textContent || '').trim();
    }

    return { service, slot, staff };
  }

  function getBizKey() {
    const sel = document.querySelector('select');
    return (bizParam || (sel && sel.value) || 'Smart Booking').trim();
  }

  async function fetchBizUpi(bizName) {
    const key = normBiz(bizName);
    try {
      const localMap = JSON.parse(localStorage.getItem('sb_biz_cfg_by_biz') || '{}');
      if (localMap[key] && localMap[key].u) return String(localMap[key].u).trim();
    } catch (_) {}

    if (!bizName) return '';
    try {
      const res = await fetch('/api/biz-config?b=' + encodeURIComponent(bizName) + '&_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return String((data && (data.u || data.upi || data.upiId)) || '').trim();
      }
    } catch (_) {}
    return '';
  }

  function recordPayment(bizName, info) {
    const key = normBiz(bizName) || 'default';
    try {
      const store = JSON.parse(localStorage.getItem('sb_p2_payments') || '{}');
      if (!Array.isArray(store[key])) store[key] = [];
      store[key].push(Object.assign({ ts: Date.now() }, info));
      localStorage.setItem('sb_p2_payments', JSON.stringify(store));
    } catch (_) {}
  }

  function savePhase2Booking(bizName, rec) {
    const key = normBiz(bizName) || 'default';
    try {
      const map = JSON.parse(localStorage.getItem('sb_p2_bookings') || '{}');
      if (!Array.isArray(map[key])) map[key] = [];
      map[key].unshift(Object.assign({
        id: rec.orderId || ('SB-' + String(Date.now()).slice(-4)),
        biz: bizName,
        createdAt: new Date().toLocaleString()
      }, rec));
      localStorage.setItem('sb_p2_bookings', JSON.stringify(map));
    } catch (_) {}
  }

  function updatePhase2BookingStatus(bizName, bookingId, nextStatus) {
    const key = normBiz(bizName) || 'default';
    try {
      const map = JSON.parse(localStorage.getItem('sb_p2_bookings') || '{}');
      if (!Array.isArray(map[key])) return;
      map[key] = map[key].map(item => {
        if (item.id === bookingId) {
          return Object.assign({}, item, { status: nextStatus });
        }
        return item;
      });
      localStorage.setItem('sb_p2_bookings', JSON.stringify(map));
    } catch (_) {}
  }


  function renderPhase2BookingsInAdmin() {
    if (isCustPage) return;
    const bizName = getBizKey();
    const key = normBiz(bizName) || 'default';
    let list = [];
    try {
      const map = JSON.parse(localStorage.getItem('sb_p2_bookings') || '{}');
      list = Array.isArray(map[key]) ? map[key] : [];
    } catch (_) {}

    const searchInp = Array.from(document.querySelectorAll('input')).find(
      i => /search|sb-id|name/i.test(i.placeholder || '')
    );
    const q = searchInp ? (searchInp.value || '').trim().toLowerCase() : '';
    const filtered = q
      ? list.filter(item =>
          String(item.id || '').toLowerCase().includes(q) ||
          String(item.service || '').toLowerCase().includes(q) ||
          String(item.slot || '').toLowerCase().includes(q) ||
          String(item.mode || '').toLowerCase().includes(q)
        )
      : list;

    let wrap = document.getElementById('sb-p2-bookings-wrap');
    if (!wrap) {
      const revBar = document.getElementById('sb-p2-rev-bar');
      if (!revBar || !revBar.parentNode) return;
      wrap = document.createElement('div');
      wrap.id = 'sb-p2-bookings-wrap';
      wrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:8px;';
      revBar.insertAdjacentElement('afterend', wrap);
    }

    if (!filtered.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = filtered.slice(0, 15).map(b => {
      const stLabel = (b.status || 'PENDING').toUpperCase();
      const tag = b.mode === 'UPI_PAID' ? 'PAID ₹' + (b.amount || 0) : 'PAY LATER ₹' + (b.amount || 0);
      const tagColor = b.mode === 'UPI_PAID' ? '#16a34a' : '#d97706';
      const stColor = stLabel === 'CANCELLED' ? '#dc2626' : (stLabel === 'COMPLETED' ? '#2563eb' : '#eab308');
      return `
        <div data-p2-id="${b.id}" style="padding:10px 12px;border-radius:10px;background:#0f172a;border:1px solid #334155;color:#f8fafc;font-size:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <b>${b.id}</b>
              <span style="margin-left:6px;padding:2px 6px;border-radius:6px;background:${stColor};color:#0f172a;font-size:10px;font-weight:800;">${stLabel}</span>
            </div>
            <span style="padding:2px 8px;border-radius:6px;background:${tagColor};color:#fff;font-size:10px;font-weight:800;">${tag}</span>
          </div>
          <div style="margin-top:4px;color:#cbd5e1;">${b.service || 'Service'} • <b>${b.slot || 'Slot'}</b></div>
          <div style="margin-top:2px;font-size:11px;color:#94a3b8;">${b.biz} • ${b.createdAt || ''}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button type="button" data-p2-act="CONFIRMED" style="padding:5px 10px;border-radius:7px;border:none;background:#22c55e;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Confirm</button>
            <button type="button" data-p2-act="COMPLETED" style="padding:5px 10px;border-radius:7px;border:none;background:#2563eb;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Complete</button>
            <button type="button" data-p2-act="CANCELLED" style="padding:5px 10px;border-radius:7px;border:none;background:#dc2626;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Cancel</button>
          </div>
        </div>
      `;
    }).join('');

    Array.from(wrap.querySelectorAll('button[data-p2-act]')).forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('[data-p2-id]');
        const id = card ? card.getAttribute('data-p2-id') : '';
        const nextSt = btn.getAttribute('data-p2-act') || 'PENDING';
        if (id) {
          updatePhase2BookingStatus(bizName, id, nextSt);
          renderPhase2BookingsInAdmin();
        }
      };
    });
  }


  function lockSlotForBiz(bizName, slot) {
    const key = normBiz(bizName);
    if (!key || !slot) return;
    try {
      const map = JSON.parse(localStorage.getItem('sb_booked_slots_by_biz') || '{}');
      if (!Array.isArray(map[key])) map[key] = [];
      if (!map[key].includes(slot)) map[key].push(slot);
      localStorage.setItem('sb_booked_slots_by_biz', JSON.stringify(map));
    } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('sb-p2-style')) return;
    const st = document.createElement('style');
    st.id = 'sb-p2-style';
    st.textContent = `
      #sb-p2-box{max-width:680px;margin:10px auto 14px auto;padding:14px;border-radius:14px;background:#0f172a;border:1px solid #1e293b;color:#f8fafc;font-family:sans-serif;box-sizing:border-box;}
      .sb-p2-title{font-size:11px;font-weight:800;letter-spacing:0.4px;color:#34d399;margin-bottom:8px;text-transform:uppercase;}
      .sb-p2-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
      .sb-p2-mode{flex:1 1 140px;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px;font-weight:700;cursor:pointer;}
      .sb-p2-mode.active{background:#059669;border-color:#10b981;color:#fff;}
      .sb-p2-upi-card{padding:12px;border-radius:12px;background:#020617;border:1px solid #334155;margin-top:8px;}
      .sb-p2-amt{font-size:15px;font-weight:800;color:#38bdf8;margin-bottom:6px;}
      .sb-p2-upi-id{font-size:12px;color:#cbd5e1;margin-bottom:10px;word-break:break-all;}
      .sb-p2-qr{background:#fff;padding:8px;border-radius:10px;display:inline-block;margin:8px 0;}
      .sb-p2-qr img{width:150px;height:150px;display:block;}
      .sb-p2-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
      .sb-p2-link{display:inline-flex;align-items:center;justify-content:center;padding:9px 14px;border-radius:9px;background:#4f46e5;color:#fff;font-size:12px;font-weight:700;text-decoration:none;border:none;cursor:pointer;}
      .sb-p2-confirm{padding:9px 14px;border-radius:9px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;}
      .sb-p2-status{font-size:12px;margin-top:8px;font-weight:700;color:#34d399;}
      #sb-p2-rev-bar{display:flex!important;gap:10px!important;flex-wrap:wrap!important;margin:10px 0!important;width:100%!important;}
      .sb-p2-rev-card{flex:1 1 150px;padding:10px 12px;border-radius:12px;background:#0f172a;border:1px solid #1e293b;color:#f8fafc;}
      .sb-p2-rev-lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;}
      .sb-p2-rev-val{font-size:16px;font-weight:800;color:#34d399;margin-top:4px;}
    `;
    document.head.appendChild(st);
  }

  function renderAdminRevenue() {
    if (isCustPage) return;
    const bizName = getBizKey();
    const key = normBiz(bizName) || 'default';
    let entries = [];
    try {
      const store = JSON.parse(localStorage.getItem('sb_p2_payments') || '{}');
      entries = Array.isArray(store[key]) ? store[key] : [];
    } catch (_) {}

    let paidTotal = 0;
    let laterTotal = 0;
    entries.forEach(e => {
      const amt = Number(e.amount || 0);
      if (e.mode === 'UPI_PAID') paidTotal += amt;
      else laterTotal += amt;
    });

    let bar = document.getElementById('sb-p2-rev-bar');
    if (!bar) {
      const savedHdr = Array.from(document.querySelectorAll('h1,h2,h3,h4,div')).find(
        el => el.children.length === 0 && (el.textContent || '').trim().toLowerCase().includes('saved bookings')
      );
      const anchor = (savedHdr && savedHdr.nextElementSibling) || document.getElementById('sb-pro-bar') || savedHdr;
      if (!anchor || !anchor.parentNode) return;
      bar = document.createElement('div');
      bar.id = 'sb-p2-rev-bar';
      anchor.insertAdjacentElement('afterend', bar);
    }

    bar.innerHTML = `
      <div class="sb-p2-rev-card">
        <div class="sb-p2-rev-lbl">UPI Collected (${bizName})</div>
        <div class="sb-p2-rev-val">₹${paidTotal}</div>
      </div>
      <div class="sb-p2-rev-card">
        <div class="sb-p2-rev-lbl">Pay at Shop / Pending</div>
        <div class="sb-p2-rev-val" style="color:#fbbf24;">₹${laterTotal}</div>
      </div>
    `;
  }

  async function initCustomerPaymentBox() {
    if (!isCustPage) return;
    ensureStyles();

    const bizName = getBizKey();
    const upiId = await fetchBizUpi(bizName);

    let box = document.getElementById('sb-p2-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sb-p2-box';
      const p1 = document.getElementById('sb-p1-panel') || document.getElementById('sb-quick-wrap');
      if (p1 && p1.parentNode) p1.insertAdjacentElement('afterend', box);
      else document.body.prepend(box);
    }

    let mode = 'UPI';

    function refreshBox() {
      const sel = getSelectedPanelValues();
      const amount = extractPrice(sel.service) || 100;
      const orderId = 'SB-' + String(Date.now()).slice(-4);
      const upiUrl = upiId
        ? 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(bizName) + '&am=' + encodeURIComponent(amount) + '&cu=INR&tn=' + encodeURIComponent(orderId + ' - ' + (sel.service || 'Booking'))
        : '';
      const qrUrl = upiUrl
        ? 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=' + encodeURIComponent(upiUrl)
        : '';

      box.innerHTML = `
        <div class="sb-p2-title">Phase 2: Payment & Advance Slot Lock</div>
        <div class="sb-p2-row">
          <button type="button" id="sb-m-upi" class="sb-p2-mode ${mode === 'UPI' ? 'active' : ''}">Pay via UPI Now (₹${amount})</button>
          <button type="button" id="sb-m-later" class="sb-p2-mode ${mode === 'LATER' ? 'active' : ''}">Pay at Shop / Clinic</button>
        </div>
        <div id="sb-p2-detail"></div>
        <div id="sb-p2-st" class="sb-p2-status"></div>
      `;

      const detail = document.getElementById('sb-p2-detail');
      const stEl = document.getElementById('sb-p2-st');

      if (mode === 'UPI') {
        if (!upiId) {
          detail.innerHTML = '<div class="sb-p2-upi-card"><div class="sb-p2-amt">Amount: ₹' + amount + '</div><div class="sb-p2-upi-id" style="color:#fbbf24;">Business UPI ID abhi set nahi hai. Admin ke "Shop & UPI" mein UPI ID save karein, ya "Pay at Shop / Clinic" chunein.</div></div>';
        } else {
          detail.innerHTML = `
            <div class="sb-p2-upi-card">
              <div class="sb-p2-amt">Payable Amount: ₹${amount}</div>
              <div class="sb-p2-upi-id">UPI ID: <b>${upiId}</b> • Slot: <b>${sel.slot || 'Select Slot'}</b></div>
              <div class="sb-p2-qr"><img src="${qrUrl}" alt="UPI QR Code"/></div>
              <div class="sb-p2-actions">
                <a class="sb-p2-link" href="${upiUrl}">Open UPI App</a>
                <button type="button" id="sb-p2-paid-btn" class="sb-p2-confirm">I Have Paid & Lock Slot</button>
              </div>
            </div>
          `;
          const paidBtn = document.getElementById('sb-p2-paid-btn');
          if (paidBtn) {
            paidBtn.onclick = () => {
              const cur = getSelectedPanelValues();
              if (!cur.slot) {
                stEl.style.color = '#f87171';
                stEl.textContent = 'Pehle upar se koi available time slot select karein.';
                return;
              }
              const payRec = { orderId, service: cur.service, slot: cur.slot, amount, mode: 'UPI_PAID', upiId };
              recordPayment(bizName, payRec);
              savePhase2Booking(bizName, payRec);
              lockSlotForBiz(bizName, cur.slot);
              stEl.style.color = '#34d399';
              stEl.textContent = 'Payment recorded (₹' + amount + ') & slot ' + cur.slot + ' locked for ' + bizName + '!';
              if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new Event('storage'));
              }
              setTimeout(() => location.reload(), 600);
            };
          }
        }
      } else {
        detail.innerHTML = `
          <div class="sb-p2-upi-card">
            <div class="sb-p2-amt">Pay at Venue: ₹${amount}</div>
            <div class="sb-p2-upi-id">Aap ₹${amount} venue par pay kar sakte hain. Slot lock karne ke liye confirm karein:</div>
            <button type="button" id="sb-p2-later-btn" class="sb-p2-confirm">Confirm & Lock Slot (Pay Later)</button>
          </div>
        `;
        const laterBtn = document.getElementById('sb-p2-later-btn');
        if (laterBtn) {
          laterBtn.onclick = () => {
            const cur = getSelectedPanelValues();
            if (!cur.slot) {
              stEl.style.color = '#f87171';
              stEl.textContent = 'Pehle upar se koi available time slot select karein.';
              return;
            }
            const laterRec = { orderId, service: cur.service, slot: cur.slot, amount, mode: 'PAY_LATER' };
              recordPayment(bizName, laterRec);
              savePhase2Booking(bizName, laterRec);
            lockSlotForBiz(bizName, cur.slot);
            stEl.style.color = '#fbbf24';
            stEl.textContent = 'Booking noted as Pay Later (₹' + amount + ') & slot ' + cur.slot + ' locked!';
            setTimeout(() => location.reload(), 600);
          };
        }
      }

      document.getElementById('sb-m-upi').onclick = () => {
        mode = 'UPI';
        refreshBox();
    setTimeout(refreshBox, 400);
    setTimeout(refreshBox, 1200);
      };
      document.getElementById('sb-m-later').onclick = () => {
        mode = 'LATER';
        refreshBox();
      };
    }

    refreshBox();
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('#sb-p1-panel')) {
        setTimeout(refreshBox, 50);
      }
    });
  }

  function mountRouteIfNeeded() {
    // Client-side helper only; server serves /phase2.js via server.js
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCustomerPaymentBox();
      renderAdminRevenue(); renderPhase2BookingsInAdmin();
    });
  } else {
    initCustomerPaymentBox();
    renderAdminRevenue(); renderPhase2BookingsInAdmin();
  }
  setInterval(() => { renderAdminRevenue(); renderPhase2BookingsInAdmin(); renderPhase2BookingsInAdmin(); }, 3000);
})();
