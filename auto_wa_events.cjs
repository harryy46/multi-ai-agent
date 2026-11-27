const fs = require('fs');
let code = fs.readFileSync('phase3.js', 'utf8');

// Fix any earlier key reference typo if present
code = code.replace(/map\[normBiz\(biz\) \|\| 'default'\]/g, 'map[normBiz(biz) || "default"]');

const autoWaBlock = `
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
      ].filter(Boolean).join('\\n');
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
    ].filter(Boolean).join('\\n');
  }

  function buildWaUrl(msg, cardEl, recObj) {
    const phone = typeof extractPhoneDigits === 'function' ? extractPhoneDigits(cardEl, recObj) : '';
    return phone
      ? ('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg))
      : ('https://wa.me/?text=' + encodeURIComponent(msg));
  }

  function triggerWhatsApp(stage, biz, rec, cardEl, allowPromptFallback) {
    const msg = formatWaMessage(stage, biz, rec);
    const url = buildWaUrl(msg, cardEl, rec);
    const win = window.open(url, '_blank', 'noopener');
    if (!win && allowPromptFallback) {
      let bar = document.getElementById('sb-p3-wa-toast');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sb-p3-wa-toast';
        bar.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#0f172a;color:#f8fafc;border:1px solid #22c55e;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:sans-serif;font-size:12px;display:flex;align-items:center;gap:10px;';
        document.body.appendChild(bar);
      }
      bar.innerHTML = '<span>WhatsApp message ready (' + stage + ')</span><a href="' + url + '" target="_blank" rel="noopener" style="background:#16a34a;color:#fff;padding:6px 10px;border-radius:8px;text-decoration:none;font-weight:700;">Open WhatsApp</a>';
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
`;

if (!code.includes('hookAutoBookingWhatsApp')) {
  code = code.replace(
    /function enhanceAdminCardsAndAnalytics\(\) \{/,
    autoWaBlock + '\n  function enhanceAdminCardsAndAnalytics() {'
  );

  code = code.replace(
    /ensureWhatsAppButtonsOnCards\(biz\);/,
    `hookAutoBookingWhatsApp();
    ensureWhatsAppButtonsOnCards(biz);`
  );

  code = code.replace(
    /waBtn\.onclick = \(\) => \{[\s\S]*?window\.open\(url, '_blank', 'noopener'\);\s*\};/,
    `waBtn.onclick = () => {
        triggerWhatsApp('BOOKED', biz, rec, card, false);
      };`
  );

  // Wire Confirm, Complete, Cancel + Receipt button on each Phase 2 card
  code = code.replace(
    /const cancelBtn = card\.querySelector\('button\[data-p2-act="CANCELLED"\]'\);/,
    `if (!btnRow.querySelector('[data-p3-receipt]')) {
        const rcBtn = document.createElement('button');
        rcBtn.type = 'button';
        rcBtn.setAttribute('data-p3-receipt', '1');
        rcBtn.textContent = 'Receipt';
        rcBtn.style.cssText = 'padding:5px 10px;border-radius:7px;border:none;background:#4f46e5;color:#fff;font-size:11px;font-weight:700;cursor:pointer;';
        rcBtn.onclick = () => {
          triggerWhatsApp('RECEIPT', biz, rec, card, false);
        };
        btnRow.appendChild(rcBtn);
      }

      ['CONFIRMED', 'COMPLETED'].forEach(actName => {
        const stBtn = card.querySelector('button[data-p2-act="' + actName + '"]');
        if (stBtn && !stBtn.dataset.p3WaBound) {
          stBtn.dataset.p3WaBound = '1';
          stBtn.addEventListener('click', () => {
            const updated = Object.assign({}, rec, { status: actName });
            triggerWhatsApp(actName, biz, updated, card, false);
          });
        }
      });

      const cancelBtn = card.querySelector('button[data-p2-act="CANCELLED"]');`
  );
}

// Also hook customer page load so auto-booking WhatsApp runs even before admin cards exist
code = code.replace(
  /function tick\(\) \{/,
  `function tick() {
    hookAutoBookingWhatsApp();`
);

fs.writeFileSync('phase3.js', code, 'utf8');
console.log('AUTO_WHATSAPP_BOOKING_CONFIRM_COMPLETE_RECEIPT_ADDED');