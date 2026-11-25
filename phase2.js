(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCustPage = location.pathname.includes('chat') || Boolean(bizParam);

  function normBiz(name) {
    return String(name || '').trim().toLowerCase();
  }

  function extractPrice(text) {
    if (!text) return 0;
    const m = String(text).match(/(?:rs.?|inr|₹)?s*(d{2,6})/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function getSelectedPanelValues() {
    const srvEl = document.querySelector('#sb-p1-services .sb-p1-btn.active');
    const slotEl = document.querySelector('#sb-p1-slots .sb-p1-btn.active:not(.booked)');
    const stfEl = document.querySelector('#sb-p1-staff .sb-p1-btn.active');
    return {
      service: srvEl ? srvEl.textContent.trim() : '',
      slot: slotEl ? slotEl.textContent.trim() : '',
      staff: stfEl ? stfEl.textContent.trim() : ''
    };
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
        return String((data && data.u) || '').trim();
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
      #sb-p2-rev-bar{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;}
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
      const anchor = document.getElementById('sb-pro-bar') || document.querySelector('h1,h2,h3');
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
              recordPayment(bizName, {
                orderId,
                service: cur.service,
                slot: cur.slot,
                amount,
                mode: 'UPI_PAID',
                upiId
              });
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
            recordPayment(bizName, {
              orderId,
              service: cur.service,
              slot: cur.slot,
              amount,
              mode: 'PAY_LATER'
            });
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
      renderAdminRevenue();
    });
  } else {
    initCustomerPaymentBox();
    renderAdminRevenue();
  }
  setInterval(renderAdminRevenue, 3000);
})();
