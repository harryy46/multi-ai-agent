(function () {
  const params = new URLSearchParams(location.search);
  const bizParam = (params.get('b') || params.get('business') || params.get('client') || '').trim();
  const isCust = location.pathname.includes('chat') || Boolean(bizParam);
  if (!isCust) return;

  const DEFAULT_SERVICES = ['Haircut Rs 150', 'Beard Rs 80', 'Facial Rs 400'];
  const DEFAULT_STAFF = ['Any Available', 'Senior Staff', 'Specialist'];

  function parseServices(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
      .split(/[,\n;]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function parseStaff(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
      .split(/[,\n;]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function formatHour(h24) {
    const period = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return String(h12).padStart(2, '0') + ':00 ' + period;
  }

  function to24Hour(token, fallbackPeriod) {
    if (!token) return null;
    const clean = token.trim().toUpperCase();
    const m = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!m) return null;
    let hr = parseInt(m[1], 10);
    const mer = m[3] || fallbackPeriod || '';
    if (mer === 'PM' && hr < 12) hr += 12;
    if (mer === 'AM' && hr === 12) hr = 0;
    if (hr < 0 || hr > 23) return null;
    return hr;
  }

  function buildSlotsFromTiming(timingStr) {
    const defaultSlots = [
      '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM',
      '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
      '06:00 PM', '07:00 PM', '08:00 PM'
    ];
    if (!timingStr || typeof timingStr !== 'string') return defaultSlots;
    const rangeMatch = timingStr.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(?:-|to|–)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
    if (!rangeMatch) return defaultSlots;

    const endMerMatch = rangeMatch[2].match(/(AM|PM)$/i);
    const endMer = endMerMatch ? endMerMatch[1].toUpperCase() : 'PM';
    const startMerMatch = rangeMatch[1].match(/(AM|PM)$/i);
    const startMer = startMerMatch ? startMerMatch[1].toUpperCase() : (endMer === 'PM' ? 'AM' : '');

    const startH = to24Hour(rangeMatch[1], startMer);
    const endH = to24Hour(rangeMatch[2], endMer);
    if (startH === null || endH === null || endH <= startH) return defaultSlots;

    const slots = [];
    for (let h = startH; h <= endH; h++) {
      slots.push(formatHour(h));
    }
    return slots.length ? slots : defaultSlots;
  }

  function getBookedSlots(bizKey) {
    try {
      const map = JSON.parse(localStorage.getItem('sb_booked_slots_by_biz') || '{}');
      return Array.isArray(map[bizKey]) ? map[bizKey] : [];
    } catch (_) {
      return [];
    }
  }

  function saveBookedSlot(bizKey, slot) {
    try {
      const map = JSON.parse(localStorage.getItem('sb_booked_slots_by_biz') || '{}');
      if (!Array.isArray(map[bizKey])) map[bizKey] = [];
      if (!map[bizKey].includes(slot)) map[bizKey].push(slot);
      localStorage.setItem('sb_booked_slots_by_biz', JSON.stringify(map));
    } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('sb-p1-dyn-style')) return;
    const st = document.createElement('style');
    st.id = 'sb-p1-dyn-style';
    st.textContent = `
      #sb-p1-panel{max-width:680px;margin:10px auto 14px auto;padding:14px;border-radius:14px;background:#0f172a;border:1px solid #1e293b;color:#f8fafc;font-family:sans-serif;box-sizing:border-box;}
      .sb-p1-sec{margin-bottom:14px;}
      .sb-p1-sec:last-child{margin-bottom:0;}
      .sb-p1-lbl{font-size:11px;font-weight:800;letter-spacing:0.4px;color:#38bdf8;margin-bottom:8px;text-transform:uppercase;}
      .sb-p1-list{display:flex;flex-direction:column;gap:8px;}
      .sb-p1-btn{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:13px;font-weight:600;cursor:pointer;text-align:center;transition:0.15s;}
      .sb-p1-btn:hover{border-color:#6366f1;}
      .sb-p1-btn.active{background:#4f46e5;border-color:#6366f1;color:#fff;}
      .sb-p1-btn.booked{background:#020617;border-color:#1e293b;color:#64748b;text-decoration:line-through;cursor:not-allowed;opacity:0.7;}
      .sb-p1-hint{font-size:11px;color:#94a3b8;margin-top:6px;}
    `;
    document.head.appendChild(st);
  }

  function syncFormInputs(serviceVal, slotVal, staffVal) {
    const inputs = Array.from(document.querySelectorAll('input,textarea'));
    const srvInp = inputs.find(i => /service|item|haircut|checkup/i.test(i.placeholder || ''));
    const tmInp = inputs.find(i => /date|time|slot|preferred/i.test(i.placeholder || ''));
    const stfInp = inputs.find(i => /staff|specialist|doctor|stylist/i.test(i.placeholder || ''));

    const setNativeVal = (el, val) => {
      if (!el || !val) return;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    if (srvInp && serviceVal) setNativeVal(srvInp, serviceVal);
    if (tmInp && slotVal) setNativeVal(tmInp, slotVal);
    if (stfInp && staffVal) setNativeVal(stfInp, staffVal);
  }

  async function loadBizConfig(bizName) {
    let cfg = {};
    try {
      const localCfg = JSON.parse(localStorage.getItem('sb_biz_cfg') || '{}');
      if (localCfg && typeof localCfg === 'object') cfg = Object.assign({}, cfg, localCfg);
    } catch (_) {}

    if (bizName) {
      try {
        const res = await fetch('/api/biz-config?b=' + encodeURIComponent(bizName));
        if (res.ok) {
          const remote = await res.json();
          if (remote && typeof remote === 'object') cfg = Object.assign({}, cfg, remote);
        }
      } catch (_) {}
    }
    return cfg;
  }

  async function renderPanel() {
    ensureStyles();
    const sel = document.querySelector('select');
    const activeBiz = (bizParam || (sel && sel.value) || 'Smart Booking').trim();

    let panel = document.getElementById('sb-p1-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sb-p1-panel';
      const anchor = document.getElementById('sb-quick-wrap') || document.getElementById('sb-cust-header');
      if (anchor && anchor.parentNode) {
        anchor.insertAdjacentElement('afterend', panel);
      } else {
        document.body.prepend(panel);
      }
    }

    const cfg = await loadBizConfig(activeBiz);
    const services = parseServices(cfg.s || cfg.services || '');
    const serviceList = services.length ? services : DEFAULT_SERVICES;

    const slots = buildSlotsFromTiming(cfg.t || cfg.timings || '');
    const bookedSet = new Set(getBookedSlots(activeBiz));

    const customStaff = parseStaff(cfg.staff || cfg.specialists || '');
    const staffList = customStaff.length ? customStaff : DEFAULT_STAFF;

    let selectedService = serviceList[0] || '';
    let selectedSlot = slots.find(s => !bookedSet.has(s)) || '';
    let selectedStaff = staffList[0] || '';

    panel.innerHTML = `
      <div class="sb-p1-sec">
        <div class="sb-p1-lbl">1. SELECT SERVICE (${activeBiz})</div>
        <div class="sb-p1-list" id="sb-p1-services"></div>
      </div>
      <div class="sb-p1-sec">
        <div class="sb-p1-lbl">2. SELECT AVAILABLE TIME SLOT</div>
        <div class="sb-p1-list" id="sb-p1-slots"></div>
        <div class="sb-p1-hint">Grey slots are already booked for ${activeBiz}.</div>
      </div>
      <div class="sb-p1-sec">
        <div class="sb-p1-lbl">3. PREFERRED STAFF / SPECIALIST</div>
        <div class="sb-p1-list" id="sb-p1-staff"></div>
      </div>
    `;

    const srvBox = document.getElementById('sb-p1-services');
    const slotBox = document.getElementById('sb-p1-slots');
    const stfBox = document.getElementById('sb-p1-staff');

    function updateSelectionUI() {
      Array.from(srvBox.children).forEach(b => b.classList.toggle('active', b.dataset.val === selectedService));
      Array.from(slotBox.children).forEach(b => {
        if (!b.disabled) b.classList.toggle('active', b.dataset.val === selectedSlot);
      });
      Array.from(stfBox.children).forEach(b => b.classList.toggle('active', b.dataset.val === selectedStaff));

      const combinedService = selectedStaff && selectedStaff !== 'Any Available'
        ? selectedService + ' (' + selectedStaff + ')'
        : selectedService;
      syncFormInputs(combinedService, selectedSlot, selectedStaff);
    }

    serviceList.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sb-p1-btn';
      btn.dataset.val = item;
      btn.textContent = item;
      btn.onclick = () => {
        selectedService = item;
        updateSelectionUI();
      };
      srvBox.appendChild(btn);
    });

    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isBooked = bookedSet.has(slot);
      btn.className = 'sb-p1-btn' + (isBooked ? ' booked' : '');
      btn.dataset.val = slot;
      btn.disabled = isBooked;
      btn.textContent = slot;
      if (!isBooked) {
        btn.onclick = () => {
          selectedSlot = slot;
          updateSelectionUI();
        };
      }
      slotBox.appendChild(btn);
    });

    staffList.forEach(stf => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sb-p1-btn';
      btn.dataset.val = stf;
      btn.textContent = stf;
      btn.onclick = () => {
        selectedStaff = stf;
        updateSelectionUI();
      };
      stfBox.appendChild(btn);
    });

    updateSelectionUI();

    document.addEventListener('submit', () => {
      if (selectedSlot) {
        saveBookedSlot(activeBiz, selectedSlot);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    renderPanel();
  }
})();
