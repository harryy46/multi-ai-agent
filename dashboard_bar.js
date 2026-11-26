(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCustPage = location.pathname.includes('chat') || Boolean(bizParam);
  if (isCustPage) return;

  function clickButtonByLabel(labels) {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const lbl of labels) {
      const found = btns.find(b => {
        if (b.closest('#sb-unified-action-bar')) return false;
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt === lbl.toLowerCase() || txt.includes(lbl.toLowerCase());
      });
      if (found) {
        found.click();
        return true;
      }
    }
    return false;
  }

  function scrollToSection(matcherFn) {
    const els = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, section'));
    const target = els.find(el => {
      if (el.closest('#sb-unified-action-bar')) return false;
      return el.children.length <= 4 && matcherFn((el.textContent || '').trim());
    });
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    return false;
  }

  function getActiveBiz() {
    const sel = document.querySelector('select');
    return (sel && sel.value) ? sel.value.trim() : 'Salon (Salon)';
  }

  function injectProStyles() {
    if (document.getElementById('sb-pro-bar-style')) return;
    const st = document.createElement('style');
    st.id = 'sb-pro-bar-style';
    st.textContent = `
      #sb-unified-action-bar {
        grid-column: 1 / -1;
        width: 100%;
        max-width: 1280px;
        margin: 12px auto 16px;
        padding: 12px 14px;
        box-sizing: border-box;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.94));
        border: 1px solid rgba(99, 102, 241, 0.4);
        box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        position: relative;
        z-index: 40;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .sb-pro-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sb-pro-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.38);
        color: #6ee7b7;
        font-size: 11px;
        font-weight: 700;
        margin-right: 4px;
      }
      .sb-pro-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }
      .sb-pro-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(15, 23, 42, 0.85);
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.14s ease, background 0.16s ease, border-color 0.16s ease;
      }
      .sb-pro-btn:hover {
        transform: translateY(-1px);
        background: rgba(51, 65, 85, 0.95);
        border-color: rgba(129, 140, 248, 0.6);
        color: #ffffff;
      }
      .sb-pro-btn--primary {
        background: linear-gradient(135deg, #4f46e5, #2563eb);
        border-color: rgba(129, 140, 248, 0.55);
        color: #ffffff;
      }
      .sb-pro-btn--wa {
        background: linear-gradient(135deg, #059669, #16a34a);
        border-color: rgba(74, 222, 128, 0.45);
        color: #ffffff;
      }
      #sb-bar-toast {
        font-size: 11px;
        font-weight: 700;
        color: #34d399;
        padding: 4px 10px;
      }
    `;
    document.head.appendChild(st);
  }

  function mountBar() {
    if (document.getElementById('sb-unified-action-bar')) {
      const lbl = document.getElementById('sb-pro-biz-label');
      if (lbl) lbl.textContent = getActiveBiz();
      return true;
    }
    if (!document.body) return false;

    injectProStyles();

    const bar = document.createElement('div');
    bar.id = 'sb-unified-action-bar';

    const left = document.createElement('div');
    left.className = 'sb-pro-left';

    const pill = document.createElement('span');
    pill.className = 'sb-pro-pill';
    pill.innerHTML = '<span class="sb-pro-dot"></span><span id="sb-pro-biz-label">' + getActiveBiz() + '</span>';
    left.appendChild(pill);

    const toast = document.createElement('span');
    toast.id = 'sb-bar-toast';

    const actions = [
      { icon: '📅', label: 'Bookings', cls: 'sb-pro-btn--primary', fn: () => scrollToSection(t => /^Saved Bookings/i.test(t)) },
      { icon: '🏢', label: 'Add Business', cls: '', fn: () => scrollToSection(t => /^\+?Add Business$/i.test(t)) },
      { icon: '⚙️', label: 'Admin Setup', cls: '', fn: () => document.getElementById('sb-admin-profile-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
      { icon: '💳', label: 'Shop & UPI', cls: '', fn: () => clickButtonByLabel(['Shop & UPI']) },
      { icon: '⚡', label: 'Walk-in', cls: '', fn: () => clickButtonByLabel(['+ Walk-in', 'Walk-in']) },
      { icon: '👥', label: 'Customers', cls: '', fn: () => clickButtonByLabel(['Customers']) },
      { icon: '🔗', label: 'Client Link', cls: '', fn: () => {
        navigator.clipboard?.writeText(location.origin + '/?b=' + encodeURIComponent(getActiveBiz())).catch(() => {});
        toast.textContent = '✓ Client link copied';
        setTimeout(() => { toast.textContent = ''; }, 2200);
      }},
      { icon: '💬', label: 'WhatsApp', cls: 'sb-pro-btn--wa', fn: () => {
        const msg = encodeURIComponent('Hello from ' + getActiveBiz() + ' — Smart Booking Dashboard');
        window.open('https://wa.me/?text=' + msg, '_blank', 'noopener');
      }}
    ];

    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sb-pro-btn ' + a.cls;
      btn.innerHTML = '<span>' + a.icon + '</span><span>' + a.label + '</span>';
      btn.onclick = () => a.fn(btn, toast);
      left.appendChild(btn);
    });

    bar.appendChild(left);
    bar.appendChild(toast);

    const brandEl = Array.from(document.querySelectorAll('div, header, nav')).find(el => {
      const txt = (el.textContent || '');
      return txt.includes('Smart Booking') && txt.includes('Enterprise Booking') && el.offsetHeight > 25 && el.offsetHeight < 160;
    });

    if (brandEl && brandEl.parentNode) {
      brandEl.insertAdjacentElement('afterend', bar);
    } else {
      document.body.prepend(bar);
    }

    document.addEventListener('change', (e) => {
      if (e.target && e.target.tagName === 'SELECT') {
        const lbl = document.getElementById('sb-pro-biz-label');
        if (lbl) lbl.textContent = getActiveBiz();
      }
    });

    return true;
  }

  function start() {
    if (mountBar()) return;
    const obs = new MutationObserver(() => {
      if (mountBar()) {
        obs.disconnect();
      }
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    setTimeout(() => {
      mountBar();
      obs.disconnect();
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
