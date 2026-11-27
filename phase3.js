(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCustPage = location.pathname.includes('chat') || Boolean(bizParam);

  function normBiz(name) {
    return String(name || '').trim().toLowerCase();
  }

  function getActiveBiz() {
    const sel = document.querySelector('select');
    return (bizParam || (sel && sel.value) || 'Smart Booking').trim();
  }

  function getBizCfg(bizName) {
    const key = normBiz(bizName);
    if (!key) return {};
    try {
      const map = JSON.parse(localStorage.getItem('sb_biz_cfg_by_biz') || '{}');
      return (map && map[key]) || {};
    } catch (_) {
      return {};
    }
  }

  function unlockSlotForBiz(bizName, slot) {
    const key = normBiz(bizName);
    if (!key || !slot) return;
    try {
      const map = JSON.parse(localStorage.getItem('sb_booked_slots_by_biz') || '{}');
      if (!Array.isArray(map[key])) return;
      map[key] = map[key].filter(s => String(s).trim().toLowerCase() !== String(slot).trim().toLowerCase());
      localStorage.setItem('sb_booked_slots_by_biz', JSON.stringify(map));
    } catch (_) {}
  }

  function extractPhoneDigits(cardEl, recObj) {
    const raw = (recObj && (recObj.phone || recObj.mobile || recObj.whatsapp)) || (cardEl ? cardEl.textContent : '');
    const m = String(raw || '').match(/(?:\+?91[-\s]?)?([6-9]\d{9})/);
    return m ? ('91' + m[1]) : '';
  }

  function formatWaMessage(stage, biz, rec) {
    const id = (rec && rec.id) || ('SB-' + String(Date.now()).slice(-4));
    const srv = (rec && rec.service) || 'Appointment';
    const slot = (rec && rec.slot) || '';
    const staff = (rec && rec.staff) || '';
    const amt = Number((rec && rec.amount) || 0);
    const payTxt = (rec && rec.mode === 'UPI_PAID')
      ? ('PAID ₹' + amt)
      : ('PAY LATER ₹' + amt);
    const st = (rec && rec.status) || (stage === 'BOOKED' ? 'PENDING' : stage);

    if (stage === 'RECEIPT') {
      return [
        '🧾 *BILLING RECEIPT*',
        'Business: ' + biz,
        'Booking ID: ' + id,
        'Service: ' + srv,
        staff ? ('Staff: ' + staff) : '',
        slot ? ('Slot: ' + slot) : '',
        'Total Amount: ₹' + amt,
        'Payment Status: ' + payTxt,
        'Booking Status: ' + st,
        'Date: ' + new Date().toLocaleString()
      ].filter(Boolean).join('\n');
    }

    const headMap = {
      BOOKED: '✅ *BOOKING CONFIRMED / SLOT LOCKED*',
      CONFIRMED: '👍 *APPOINTMENT CONFIRMED*',
      COMPLETED: '🎉 *SERVICE COMPLETED — THANK YOU!*'
    };

    return [
      headMap[stage] || '📌 *BOOKING UPDATE*',
      'Business: ' + biz,
      'Booking ID: ' + id,
      'Service: ' + srv,
      staff ? ('Staff: ' + staff) : '',
      slot ? ('Slot: ' + slot) : '',
      'Payment: ' + payTxt,
      'Status: ' + st
    ].filter(Boolean).join('\n');
  }

  function triggerWhatsApp(stage, biz, rec, cardEl, allowPromptFallback) {
    const msg = formatWaMessage(stage, biz, rec);
    const phone = extractPhoneDigits(cardEl, rec);
    const url = phone
      ? ('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg))
      : ('https://wa.me/?text=' + encodeURIComponent(msg));
    const win = window.open(url, '_blank', 'noopener');
    if (!win && allowPromptFallback) {
      let bar = document.getElementById('sb-p3-wa-toast');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sb-p3-wa-toast';
        bar.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#0f172a;color:#f8fafc;border:1px solid #22c55e;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:sans-serif;font-size:12px;display:flex;align-items:center;gap:10px;';
        document.body.appendChild(bar);
      }
      bar.innerHTML = '<span>WhatsApp ready (' + stage + ')</span><a href="' + url + '" target="_blank" rel="noopener" style="background:#16a34a;color:#fff;padding:6px 10px;border-radius:8px;text-decoration:none;font-weight:700;">Open WhatsApp</a>';
    }
  }

  function hookAutoBookingWhatsApp() {
    if (!isCustPage || window.__sbP3BookingWaHooked) return;
    window.__sbP3BookingWaHooked = true;

    document.addEventListener('click', (e) => {
      const target = e.target && e.target.closest ? e.target.closest('#sb-p2-paid-btn, #sb-p2-later-btn') : null;
      if (!target) return;

      const biz = getActiveBiz();
      const key = normBiz(biz) || 'default';
      setTimeout(() => {
        try {
          const map = JSON.parse(localStorage.getItem('sb_p2_bookings') || '{}');
          const list = Array.isArray(map[key]) ? map[key] : [];
          const latest = list[0] || {
            id: 'SB-' + String(Date.now()).slice(-4),
            service: 'Appointment',
            slot: '',
            amount: 0,
            mode: target.id === 'sb-p2-paid-btn' ? 'UPI_PAID' : 'PAY_LATER',
            status: 'PENDING'
          };
          triggerWhatsApp('BOOKED', biz, latest, null, true);
        } catch (_) {}
      }, 120);
    }, true);
  }

  function parseBreakHours(offText) {
    if (!offText) return [];
    const hours = [];
    const m = String(offText).match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?\s*(?:-|to|–)\s*(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
    if (!m) return hours;

    const to24 = (raw, fallbackMer) => {
      let hr = parseInt(raw, 10);
      const mer = (fallbackMer || '').toUpperCase();
      if (mer === 'PM' && hr < 12) hr += 12;
      if (mer === 'AM' && hr === 12) hr = 0;
      return hr;
    };

    const endMer = (m[4] || '').toUpperCase() || 'PM';
    const startMer = (m[2] || '').toUpperCase() || (endMer === 'PM' ? 'AM' : '');
    const sH = to24(m[1], startMer);
    const eH = to24(m[3], endMer);
    if (!Number.isNaN(sH) && !Number.isNaN(eH) && eH >= sH) {
      for (let h = sH; h <= eH; h++) hours.push(h);
    }
    return hours;
  }

  function slotMatchesBreak(slotLabel, breakHours) {
    if (!slotLabel || !breakHours.length) return false;
    const m = String(slotLabel).trim().match(/^(\d{1,2})(?::\d{2})?\s*(AM|PM)$/i);
    if (!m) return false;
    let hr = parseInt(m[1], 10);
    const mer = m[2].toUpperCase();
    if (mer === 'PM' && hr < 12) hr += 12;
    if (mer === 'AM' && hr === 12) hr = 0;
    return breakHours.includes(hr);
  }

  function applyBreakRulesToCustomerSlots() {
    if (!isCustPage) return;
    const biz = getActiveBiz();
    const cfg = getBizCfg(biz);
    const offText = cfg.off || cfg.weeklyOff || '';
    const breakHours = parseBreakHours(offText);

    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayShort = dayNames[new Date().getDay()];
    const isOffToday = new RegExp('\\b' + todayShort + '(?:day)?\\s*off\\b', 'i').test(offText);

    const slotBtns = Array.from(document.querySelectorAll('#sb-p1-slots .sb-p1-btn'));
    slotBtns.forEach(btn => {
      const label = (btn.dataset.val || btn.textContent || '').trim();
      const inBreak = isOffToday || slotMatchesBreak(label, breakHours);
      if (inBreak && !btn.classList.contains('booked')) {
        btn.disabled = true;
        btn.classList.add('booked');
        btn.title = isOffToday ? ('Off today (' + offText + ')') : ('Break time (' + offText + ')');
      }
    });
  }

  function enhanceAdminCardsAndAnalytics() {
    if (isCustPage) return;
    const biz = getActiveBiz();
    const key = normBiz(biz) || 'default';
    let bookings = [];
    try {
      const map = JSON.parse(localStorage.getItem('sb_p2_bookings') || '{}');
      bookings = Array.isArray(map[key]) ? map[key] : [];
    } catch (_) {}

    let ana = document.getElementById('sb-p3-analytics');
    if (!ana) {
      const wrap = document.getElementById('sb-p2-bookings-wrap') || document.getElementById('sb-p2-rev-bar');
      if (wrap && wrap.parentNode) {
        ana = document.createElement('div');
        ana.id = 'sb-p3-analytics';
        ana.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:10px;background:#020617;border:1px solid #1e293b;color:#cbd5e1;font-size:11px;line-height:1.5;';
        wrap.insertAdjacentElement('afterend', ana);
      }
    }

    if (ana) {
      const total = bookings.length;
      const paidCount = bookings.filter(b => b.mode === 'UPI_PAID').length;
      const laterCount = bookings.filter(b => b.mode !== 'UPI_PAID').length;
      const srvCount = {};
      bookings.forEach(b => {
        const s = b.service || 'Service';
        srvCount[s] = (srvCount[s] || 0) + 1;
      });
      const topSrv = Object.entries(srvCount).sort((a, b) => b[1] - a[1])[0];
      const nextAnaHtml = '<b>Bookings:</b> ' + total +
        ' • <b>UPI Paid:</b> ' + paidCount +
        ' • <b>Pay Later:</b> ' + laterCount +
        (topSrv ? (' • <b>Top Service:</b> ' + topSrv[0] + ' (' + topSrv[1] + ')') : '');
      if (ana.dataset.sig !== nextAnaHtml) {
        ana.dataset.sig = nextAnaHtml;
        ana.innerHTML = nextAnaHtml;
      }
    }

    const cards = Array.from(document.querySelectorAll('[data-p2-id]'));
    cards.forEach(card => {
      const id = card.getAttribute('data-p2-id');
      const rec = bookings.find(x => x.id === id) || { id };

      const actBtn = card.querySelector('button[data-p2-act]') ||
        Array.from(card.querySelectorAll('button')).find(b =>
          ['confirm', 'complete', 'cancel'].includes((b.textContent || '').trim().toLowerCase())
        );
      const btnRow = actBtn ? actBtn.parentElement : null;

      const waBtn = card.querySelector('[data-p2-wa="1"]');
      if (waBtn && !waBtn.dataset.p3Bound) {
        waBtn.dataset.p3Bound = '1';
        waBtn.onclick = () => triggerWhatsApp('BOOKED', biz, rec, card, false);
      }

      const rcBtn = card.querySelector('[data-p2-rc="1"]');
      if (rcBtn && !rcBtn.dataset.p3Bound) {
        rcBtn.dataset.p3Bound = '1';
        rcBtn.onclick = () => triggerWhatsApp('RECEIPT', biz, rec, card, false);
      });

      const cancelBtn = card.querySelector('button[data-p2-act="CANCELLED"]');
      if (cancelBtn && !cancelBtn.dataset.p3Bound) {
        cancelBtn.dataset.p3Bound = '1';
        cancelBtn.addEventListener('click', () => {
          if (rec && rec.slot) {
            unlockSlotForBiz(biz, rec.slot);
            if (typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new Event('storage'));
            }
          }
        });
      }
    });
  }

  function tick() {
    hookAutoBookingWhatsApp();
    applyBreakRulesToCustomerSlots();
    enhanceAdminCardsAndAnalytics();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 200));
  } else {
    setTimeout(tick, 200);
  }
  setInterval(tick, 10000);
})();
