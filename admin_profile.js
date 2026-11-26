(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCustPage = location.pathname.includes('chat') || Boolean(bizParam);
  if (isCustPage) return;

  const SETUP_KEY = 'sb_admin_full_setup_v1';

  function getBusinessOptions() {
    const sel = document.querySelector('select');
    const names = [];
    if (sel && sel.options) {
      Array.from(sel.options).forEach(opt => {
        const t = (opt.textContent || opt.value || '').trim();
        if (t && !names.includes(t)) names.push(t);
      });
    }
    if (!names.length) names.push('Salon (Salon)');
    return names;
  }

  function loadSetup() {
    const opts = getBusinessOptions();
    try {
      const saved = JSON.parse(localStorage.getItem(SETUP_KEY) || '{}');
      return {
        name: saved.name || 'Haridev Katara',
        role: saved.role || 'SaaS Owner & Admin',
        phone: saved.phone || '',
        email: saved.email || '',
        pin: saved.pin || '4646',
        defaultBiz: saved.defaultBiz || opts[0] || 'Salon (Salon)',
        brandTag: saved.brandTag || 'Smart Booking SaaS',
        receiptFooter: saved.receiptFooter || 'Thank you for your booking! Keep this receipt for reference.',
        autoWa: saved.autoWa !== false
      };
    } catch (_) {
      return {
        name: 'Haridev Katara',
        role: 'SaaS Owner & Admin',
        phone: '',
        email: '',
        pin: '4646',
        defaultBiz: opts[0] || 'Salon (Salon)',
        brandTag: 'Smart Booking SaaS',
        receiptFooter: 'Thank you for your booking! Keep this receipt for reference.',
        autoWa: true
      };
    }
  }

  function saveSetup(data) {
    localStorage.setItem(SETUP_KEY, JSON.stringify(data));
    localStorage.setItem('sb_admin_profile_v1', JSON.stringify({
      name: data.name,
      role: data.role,
      phone: data.phone,
      email: data.email,
      pin: data.pin
    }));
  }

  function applyDefaultBusinessIfNeeded(setup) {
    const sel = document.querySelector('select');
    if (!sel || !setup.defaultBiz || sel.dataset.sbDefaultApplied) return;
    const match = Array.from(sel.options).find(
      o => (o.textContent || o.value || '').trim().toLowerCase() === setup.defaultBiz.trim().toLowerCase()
    );
    if (match && sel.value !== match.value) {
      sel.value = match.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sel.dataset.sbDefaultApplied = '1';
  }

  function renderAdminSetupSection() {
    const oldCard = document.getElementById('sb-admin-profile-card');
    if (oldCard && oldCard.dataset.sbSetupV2) return;

    const addBizHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span')).find(
      el => /^\s*\+?\s*Add Business\s*$/i.test((el.textContent || '').trim())
    );
    const anchor = (addBizHeading && (addBizHeading.closest('section, form, .card, [class*="card"], [class*="panel"]') || addBizHeading.parentElement))
      || document.getElementById('sb-p3-analytics')
      || document.body.lastElementChild;

    if (!anchor || !anchor.parentNode) return;
    if (oldCard && oldCard.parentNode) oldCard.parentNode.removeChild(oldCard);

    const setup = loadSetup();
    const bizList = getBusinessOptions();
    if (!bizList.includes(setup.defaultBiz)) bizList.unshift(setup.defaultBiz);

    const card = document.createElement('div');
    card.id = 'sb-admin-profile-card';
    card.dataset.sbSetupV2 = '1';
    card.style.cssText = 'margin:16px 0;padding:16px;border-radius:14px;background:#0f172a;border:1px solid #334155;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div>
          <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:#38bdf8;text-transform:uppercase;">ADMIN PROFILE &amp; SETUP</div>
          <h3 style="margin:2px 0 0;font-size:16px;font-weight:700;color:#f8fafc;">Admin Setup Center</h3>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span id="sb-prof-badge" style="padding:4px 10px;border-radius:999px;background:#1e293b;border:1px solid #475569;font-size:11px;font-weight:700;color:#cbd5e1;">${setup.name} • ${setup.defaultBiz}</span>
          <button type="button" id="sb-prof-lock-btn" style="padding:6px 12px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Verify PIN</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Admin Name</label>
          <input id="sb-prof-name" type="text" value="${setup.name}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Role / Title</label>
          <input id="sb-prof-role" type="text" value="${setup.role}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">WhatsApp Alert Number</label>
          <input id="sb-prof-phone" type="text" placeholder="e.g. 9198XXXXXXXX" value="${setup.phone}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Support Email</label>
          <input id="sb-prof-email" type="email" placeholder="admin@domain.com" value="${setup.email}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Default Active Business</label>
          <select id="sb-prof-def-biz" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;">
            ${bizList.map(b => `<option value="${b.replace(/"/g, '&quot;')}" ${b === setup.defaultBiz ? 'selected' : ''}>${b}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Admin PIN</label>
          <input id="sb-prof-pin" type="text" maxlength="8" value="${setup.pin}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:10px;">
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Workspace / Brand Label</label>
          <input id="sb-prof-brand" type="text" value="${setup.brandTag}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Receipt Note / Footer</label>
          <input id="sb-prof-footer" type="text" value="${setup.receiptFooter.replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#f8fafc;font-size:12px;" />
        </div>
      </div>

      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:12px;color:#cbd5e1;">
        <input id="sb-prof-autowa" type="checkbox" ${setup.autoWa ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;" />
        <label for="sb-prof-autowa" style="cursor:pointer;">Enable Auto WhatsApp Prompts on Booking / Confirm / Complete / Receipt</label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;">
        <button type="button" id="sb-prof-save-btn" style="padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Save Setup</button>
        <button type="button" id="sb-prof-apply-biz" style="padding:8px 12px;border-radius:8px;border:none;background:#059669;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Switch to Default Biz</button>
        <button type="button" id="sb-prof-copy-admin" style="padding:8px 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">Copy Admin URL</button>
        <button type="button" id="sb-prof-copy-biz" style="padding:8px 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">Copy Client Link</button>
        <span id="sb-prof-status" style="font-size:11px;color:#4ade80;font-weight:600;"></span>
      </div>
    `;

    anchor.parentNode.insertBefore(card, anchor);
    applyDefaultBusinessIfNeeded(setup);

    const statusEl = card.querySelector('#sb-prof-status');
    const setStatus = (txt, isErr) => {
      if (!statusEl) return;
      statusEl.style.color = isErr ? '#f87171' : '#4ade80';
      statusEl.textContent = txt;
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    };

    const readForm = () => ({
      name: (card.querySelector('#sb-prof-name').value || '').trim() || 'Admin',
      role: (card.querySelector('#sb-prof-role').value || '').trim() || 'Admin',
      phone: (card.querySelector('#sb-prof-phone').value || '').trim(),
      email: (card.querySelector('#sb-prof-email').value || '').trim(),
      defaultBiz: (card.querySelector('#sb-prof-def-biz').value || '').trim() || 'Salon (Salon)',
      pin: (card.querySelector('#sb-prof-pin').value || '').trim() || '4646',
      brandTag: (card.querySelector('#sb-prof-brand').value || '').trim() || 'Smart Booking SaaS',
      receiptFooter: (card.querySelector('#sb-prof-footer').value || '').trim(),
      autoWa: Boolean(card.querySelector('#sb-prof-autowa').checked)
    });

    card.querySelector('#sb-prof-save-btn').onclick = () => {
      const next = readForm();
      saveSetup(next);
      const badge = card.querySelector('#sb-prof-badge');
      if (badge) badge.textContent = next.name + ' • ' + next.defaultBiz;
      setStatus('Setup saved!');
    };

    card.querySelector('#sb-prof-apply-biz').onclick = () => {
      const next = readForm();
      saveSetup(next);
      const sel = document.querySelector('select');
      if (sel) {
        const match = Array.from(sel.options).find(
          o => (o.textContent || o.value || '').trim().toLowerCase() === next.defaultBiz.toLowerCase()
        );
        if (match) {
          sel.value = match.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      setStatus('Switched to ' + next.defaultBiz);
    };

    card.querySelector('#sb-prof-copy-admin').onclick = () => {
      navigator.clipboard?.writeText(location.origin + location.pathname).catch(() => {});
      setStatus('Admin URL copied!');
    };

    card.querySelector('#sb-prof-copy-biz').onclick = () => {
      const chosen = (card.querySelector('#sb-prof-def-biz').value || 'Salon (Salon)').trim();
      navigator.clipboard?.writeText(location.origin + '/?b=' + encodeURIComponent(chosen)).catch(() => {});
      setStatus('Client link copied!');
    };

    card.querySelector('#sb-prof-lock-btn').onclick = () => {
      const current = loadSetup();
      const entered = prompt('Enter Admin PIN (' + current.pin + '):');
      if (entered === null) return;
      if (String(entered).trim() === String(current.pin).trim()) {
        setStatus('PIN verified!');
      } else {
        setStatus('Incorrect PIN!', true);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(renderAdminSetupSection, 350));
  } else {
    setTimeout(renderAdminSetupSection, 350);
  }
  setTimeout(renderAdminSetupSection, 1800);
})();
