const fs = require('fs');

// Read original server.js
const original = fs.readFileSync('server.js', 'utf8');

// Find the route handler boundaries
const startMarker = "// FRONTEND UI (Chat + Live Bookings + Admin Business Builder)";
const startIdx = original.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Start marker not found!');
  process.exit(1);
}

// Find template literal boundaries
const searchArea = original.slice(startIdx);
const openIdx = searchArea.indexOf(String.fromCharCode(96)); // opening backtick
const closeIdx = searchArea.indexOf(String.fromCharCode(96), openIdx + 1); // closing backtick
if (openIdx === -1 || closeIdx === -1) {
  console.error('Could not find template backticks');
  process.exit(1);
}

// Find the }); after the closing backtick
const afterTemplate = searchArea.slice(closeIdx + 1);
const routeEndRel = afterTemplate.indexOf('});');
if (routeEndRel === -1) {
  console.error('Could not find route end });');
  process.exit(1);
}
const endIdx = startIdx + closeIdx + 1 + routeEndRel + 2; // include })

console.log('startIdx:', startIdx);
console.log('endIdx:', endIdx);
console.log('before length:', startIdx);
console.log('after length:', original.length - endIdx);

const before = original.slice(0, startIdx);
const after = original.slice(endIdx);

// New route handler
const newRoute = `// FRONTEND UI — Dark Smart Booking Dashboard (single-file, server.js)
app.get('/', (req, res) => {
  res.send(\`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Booking — AI Appointment & Business SaaS</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <script>if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").catch(function(){});}</script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 16px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #1e293b; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #6366f1, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .header .subtitle { font-size: 13px; color: #94a3b8; margin-top: 2px; }
    .card { background: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155; }
    .card-title { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #f8fafc; }
    select, input, textarea, button { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px; margin-top: 6px; }
    button.primary { background: #2563eb; border: none; cursor: pointer; font-weight: 700; }
    button.primary:hover { background: #1d4ed8; }
    button.ghost { background: transparent; border-color: #64748b; color: #cbd5e1; }
    button.ghost:hover { background: #1e293b; border-color: #94a3b8; }
    #chatBox { height: 320px; overflow-y: auto; border: 1px solid #334155; padding: 12px; border-radius: 8px; margin: 12px 0; background: #0f172a; }
    .msg { margin-bottom: 10px; padding: 9px 13px; border-radius: 10px; max-width: 82%; line-height: 1.4; font-size: 14px; }
    .user { background: #2563eb; margin-left: auto; }
    .bot { background: #334155; }
    .err { background: #7f1d1d; color: #fecaca; font-size: 12px; }
    .record { background: #0f172a; padding: 10px; border-left: 4px solid #10b981; margin-bottom: 8px; border-radius: 6px; font-size: 13px; }
    .hidden { display: none !important; }
    label { font-size: 13px; color: #94a3b8; display: block; margin-top: 10px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row > * { flex: 1; min-width: 140px; }
    .muted { color: #94a3b8; font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #334155; color: #cbd5e1; }
    .badge.confirmed { background: rgba(16,185,129,.2); color: #34d399; }
    .badge.cancelled { background: rgba(239,68,68,.2); color: #f87171; }
    .badge.pending { background: rgba(234,179,8,.2); color: #facc15; }

    /* Accordion / Collapsible Sections */
    .accordion-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      color: #f8fafc;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease, border-color 0.15s ease;
      margin-bottom: 10px;
    }
    .accordion-btn:hover { background: #151d30; border-color: #475569; }
    .accordion-btn:focus { outline: 2px solid #2563eb; outline-offset: -2px; }
    .accordion-btn .accordion-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: transform 0.2s ease;
      color: #94a3b8;
    }
    .accordion-btn[aria-expanded="true"] .accordion-icon { transform: rotate(180deg); }
    .accordion-content {
      overflow: hidden;
      transition: max-height 0.25s ease, opacity 0.2s ease, padding 0.2s ease;
      max-height: 0;
      opacity: 0;
      padding: 0 16px;
    }
    .accordion-content.open {
      max-height: 5000px;
      opacity: 1;
      padding: 12px 16px 16px;
    }
    .accordion-content .card { margin-top: 0; margin-bottom: 12px; }

    /* Bookings toolbar inside accordion */
    .bk-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; align-items: center; }
    .bk-search { flex: 1; min-width: 180px; }
    .bk-filters { display: flex; flex-wrap: wrap; gap: 6px; }
    .bk-filter { padding: 5px 10px; border-radius: 999px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer; }
    .bk-filter.active { background: #2563eb; border-color: #2563eb; color: #fff; }
    .bk-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .bk-act-btn { padding: 6px 12px; border-radius: 8px; border: none; font-size: 11px; font-weight: 700; cursor: pointer; }
    .bk-act-btn.confirm { background: #16a34a; color: #fff; }
    .bk-act-btn.complete { background: #2563eb; color: #fff; }
    .bk-act-btn.cancel { background: #dc2626; color: #fff; }
    .bk-act-btn.whatsapp { background: #15803d; color: #fff; }
    .bk-act-btn.receipt { background: #4f46e5; color: #fff; }

    /* Admin Setup Center */
    .setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .setup-grid.full { grid-column: 1 / -1; }

    /* Mobile */
    @media (max-width: 768px) {
      body { padding: 10px; font-size: 14px; }
      .row { flex-direction: column; }
      .row > * { width: 100%; }
    }
  </style>
  <style id="sb-mobile-css">*{box-sizing:border-box;}html,body{max-width:100vw;overflow-x:hidden;}@media(max-width:768px){body{padding:10px!important;font-size:14px!important;}header,main,section,div,form{max-width:100%!important;}[style*="grid-template-columns"],.grid,.row{grid-template-columns:1fr!important;}input,select,textarea,button{width:100%!important;font-size:15px!important;padding:12px!important;}}</style>
</head>
<body>
  <div id="adminLockModal" style="display:none;position:fixed;inset:0;background:#020617;z-index:9999;align-items:center;justify-content:center;padding:20px;">
    <div style="background:#0f172a;border:1px solid #1e293b;padding:24px;border-radius:14px;max-width:360px;width:100%;text-align:center;color:#f8fafc;">
      <h2 style="margin:0 0 8px 0;">🔐 SaaS Admin Login</h2>
      <p style="color:#94a3b8;font-size:13px;margin-bottom:16px;">Dashboard & Bookings access karne ke liye Admin PIN daalein</p>
      <input id="adminPinInput" type="password" inputmode="numeric" placeholder="Enter Admin PIN" style="width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;text-align:center;font-size:18px;letter-spacing:4px;margin-bottom:12px;">
      <button onclick="unlockAdmin()" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Unlock Dashboard</button>
      <p id="pinErr" style="color:#f87171;font-size:12px;margin-top:10px;"></p>
    </div>
  </div>

  <div class="container">
    <div class="header">
      <div>
        <h1>Smart Booking</h1>
        <div class="subtitle">Enterprise Booking & Support SaaS — Dark Dashboard</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:#34d399;background:rgba(16,185,129,.14);border:1px solid rgba(52,211,153,.35);padding:4px 10px;border-radius:999px;">● Cloud Synced</span>
        <button type="button" onclick="location.reload()" style="padding:6px 10px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,.25);font-size:12px;border-radius:8px;cursor:pointer;">Refresh</button>
      </div>
    </div>

    <!-- 1. OVERVIEW & STATS -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-overview" onclick="toggleAccordion('acc-overview', this)">
      <span>📊 Overview & Stats</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-overview" class="accordion-content">
      <div class="card" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Active Businesses</div>
          <div style="font-size:28px;font-weight:800;color:#f8fafc;margin-top:4px;" id="statBiz">—</div>
        </div>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Total Bookings</div>
          <div style="font-size:28px;font-weight:800;color:#f8fafc;margin-top:4px;" id="statBookings">—</div>
        </div>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">WhatsApp Alerts</div>
          <div style="font-size:28px;font-weight:800;color:#34d399;margin-top:4px;">Enabled</div>
        </div>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;">
          <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">AI Engine</div>
          <div style="font-size:28px;font-weight:800;color:#6366f1;margin-top:4px;">24/7</div>
        </div>
      </div>
    </div>

    <!-- 2. CHAT & BUSINESS SELECTOR -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-chat" onclick="toggleAccordion('acc-chat', this)">
      <span>💬 Chat & Business Selector</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-chat" class="accordion-content">
      <div class="card">
        <label style="margin-top:0;"><b>Select Active Business:</b></label>
        <select id="bizSelect" onchange="resetChat()"></select>
        <button id="copyLinkBtn" type="button" onclick="copyClientLink()" style="margin-top:8px;width:100%;padding:10px;background:#0f172a;color:#38bdf8;border:1px solid #38bdf8;border-radius:8px;font-weight:bold;cursor:pointer;">🔗 Copy Client Shareable Chat Link</button>
        <div id="chatBox"></div>
        <div style="display: flex; gap: 8px;">
          <input id="msgInput" placeholder="Hinglish me message likhein..." style="margin-top:0;" onkeypress="if(event.key==='Enter') sendMsg()">
          <button class="primary" id="sendBtn" onclick="sendMsg()" style="width: 90px; margin-top:0;">Send</button>
        </div>
      </div>
    </div>

    <!-- 3. SAVED BOOKINGS & ORDERS (with toolbar inside) -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-bookings" onclick="toggleAccordion('acc-bookings', this)">
      <span>📋 Saved Bookings & Orders</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-bookings" class="accordion-content">
      <div class="card">
        <div class="bk-toolbar">
          <input type="search" id="bkSearch" class="bk-search" placeholder="Search name, phone, ID..." oninput="filterBookings()">
          <div class="bk-filters">
            <button type="button" class="bk-filter active" data-status="all" onclick="setBookingFilter('all')">All</button>
            <button type="button" class="bk-filter" data-status="confirmed" onclick="setBookingFilter('confirmed')">Confirmed</button>
            <button type="button" class="bk-filter" data-status="cancelled" onclick="setBookingFilter('cancelled')">Cancelled</button>
            <button type="button" class="bk-filter" data-status="pending" onclick="setBookingFilter('pending')">Pending</button>
          </div>
        </div>
        <div id="recordsBox" style="max-height: 420px; overflow-y: auto;"></div>
      </div>
    </div>

    <!-- 4. ADMIN SETUP CENTER -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-admin-setup" onclick="toggleAccordion('acc-admin-setup', this)">
      <span>⚙️ Admin Setup Center</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-admin-setup" class="accordion-content">
      <div class="card">
        <h3 class="card-title">Admin Profile & Workspace Setup</h3>
        <div class="setup-grid">
          <div>
            <label>Admin Name</label>
            <input id="setupName" placeholder="Your name">
          </div>
          <div>
            <label>Role / Title</label>
            <input id="setupRole" placeholder="SaaS Owner, Admin, etc.">
          </div>
          <div>
            <label>WhatsApp Alert Number</label>
            <input id="setupPhone" placeholder="9198XXXXXXXX" type="tel">
          </div>
          <div>
            <label>Support Email</label>
            <input id="setupEmail" placeholder="admin@domain.com" type="email">
          </div>
          <div>
            <label>Default Active Business</label>
            <select id="setupDefaultBiz"></select>
          </div>
          <div>
            <label>Admin PIN</label>
            <input id="setupPin" placeholder="4646" maxlength="8" type="text">
          </div>
        </div>
        <div class="setup-grid" style="margin-top:10px;">
          <div>
            <label>Workspace / Brand Label</label>
            <input id="setupBrand" placeholder="Smart Booking SaaS">
          </div>
          <div>
            <label>Receipt Note / Footer</label>
            <input id="setupFooter" placeholder="Thank you for your booking!">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:#cbd5e1;">
          <input id="setupAutoWa" type="checkbox" checked style="width:15px;height:15px;cursor:pointer;">
          <label for="setupAutoWa" style="cursor:pointer;margin:0;">Enable Auto WhatsApp Prompts on Booking / Confirm / Complete / Receipt</label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
          <button class="primary" onclick="saveAdminSetup()">Save Setup</button>
          <button class="ghost" onclick="applyDefaultBusiness()">Switch to Default Business</button>
          <button class="ghost" onclick="copyAdminUrl()">Copy Admin URL</button>
          <button class="ghost" onclick="copyClientUrl()">Copy Client Link</button>
          <span id="setupStatus" style="font-size:12px;color:#34d399;font-weight:600;align-self:center;"></span>
        </div>
      </div>
    </div>

    <!-- 5. + ADD BUSINESS (stacked vertically) -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-addbiz" onclick="toggleAccordion('acc-addbiz', this)">
      <span>➕ Add Business</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-addbiz" class="accordion-content">
      <div class="card">
        <h3 class="card-title">Naya Business AI Agent Banayein</h3>
        <p class="muted">Kisi bhi client ka business details daalein, AI turant uske liye train ho jayega:</p>

        <label>Business Name <span class="muted">(e.g., Royal Men's Salon / FitZone Gym)</span></label>
        <input id="bName" placeholder="Business ka naam likhein...">

        <label>Category / Type <span class="muted">(e.g., Salon, Gym, Coaching, Real Estate)</span></label>
        <input id="bType" placeholder="Business category likhein...">

        <label>Services, Pricing, Timings & Address</label>
        <textarea id="bDetails" rows="4" placeholder="Jaise: Haircut ₹150, Beard ₹100, Facial ₹500. Timings: 9 AM - 9 PM. Location: Sector 4, Udaipur."></textarea>

        <label>AI Behavior / Custom Rules <span class="muted">(Optional)</span></label>
        <textarea id="bInst" rows="2" placeholder="Jaise: Polite Hinglish me baat karein, service aur time confirm karke booking save karein."></textarea>

        <button class="primary" onclick="addBusiness()" style="margin-top: 16px;">Save & Launch AI Agent</button>
        <p id="adminMsg" style="font-size: 13px; color: #10b981; margin-top: 10px;"></p>
      </div>
    </div>

  </div>

  <script>
    let history = [];
    let allBusinesses = {};
    let currentBookingFilter = 'all';

    // Accordion toggle
    function toggleAccordion(panelId, btn) {
      const panel = document.getElementById(panelId);
      const isOpen = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    }

    // Stats
    async function loadStats() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        document.getElementById('statBiz').textContent = Object.keys(data.businesses || {}).length || '0';
        document.getElementById('statBookings').textContent = (data.records || []).length || '0';
      } catch (e) { console.error('stats load failed', e); }
    }

    // Business dropdown
    function populateDropdown(businesses, selectId) {
      allBusinesses = businesses;
      const sel = document.getElementById(selectId || 'bizSelect');
      const currentVal = sel.value;
      sel.innerHTML = Object.entries(businesses).map(([id, b]) =>
        '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
      ).join('');
      if (currentVal && businesses[currentVal]) sel.value = currentVal;

      // Also populate setup default biz
      const setupSel = document.getElementById('setupDefaultBiz');
      if (setupSel) {
        setupSel.innerHTML = Object.entries(businesses).map(([id, b]) =>
          '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
        ).join('');
        if (currentVal && businesses[currentVal]) setupSel.value = currentVal;
      }
    }

    function resetChat() {
      history = [];
      const bizId = document.getElementById('bizSelect').value;
      const bName = allBusinesses[bizId] ? allBusinesses[bizId].name : 'AI Assistant';
      document.getElementById('chatBox').innerHTML = '<div class="msg bot">Namaste! <b>' + bName + '</b> me aapka swagat hai. Main aapki kaise madad kar sakta hoon?</div>';
    }

    async function init() {
      const res = await fetch('/api/data');
      const data = await res.json();
      populateDropdown(data.businesses);
      renderRecords(data.records);
      resetChat();
      loadStats();
      loadAdminSetup();
    }

    function copyClientLink() {
      const id = document.getElementById('bizSelect').value;
      const url = window.location.origin + '/?b=' + encodeURIComponent(id);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => alert('Client Link Copied! ' + url)).catch(() => prompt('Copy link:', url));
      } else { prompt('Copy link:', url); }
    }

    // Chat
    async function sendMsg() {
      const input = document.getElementById('msgInput');
      const btn = document.getElementById('sendBtn');
      const text = input.value.trim();
      if (!text) return;
      const bizId = document.getElementById('bizSelect').value;

      const chatBox = document.getElementById('chatBox');
      chatBox.innerHTML += '<div class="msg user">' + text + '</div>';
      input.value = '';
      btn.disabled = true;
      btn.innerText = '...';
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: bizId, message: text, history })
        });
        const data = await res.json();

        if (data.reply) {
          chatBox.innerHTML += '<div class="msg bot">' + data.reply.replace(/\\n/g, '<br>') + '</div>';
          history.push({ role: 'user', parts: [{ text }] });
          history.push({ role: 'model', parts: [{ text: data.reply }] });
        } else if (data.error) {
          chatBox.innerHTML += '<div class="msg err">Error: ' + data.error + '</div>';
        }
        if (data.records) renderRecords(data.records);
      } catch (e) {
        chatBox.innerHTML += '<div class="msg err">Error: ' + e.message + '</div>';
      }
      btn.disabled = false;
      btn.innerText = 'Send';
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Bookings rendering + filtering
    function renderRecords(records) {
      const box = document.getElementById('recordsBox');
      if (!records || records.length === 0) {
        box.innerHTML = '<p class="muted" style="padding:12px;">Abhi koi booking nahi hai.</p>';
        return;
      }
      let html = '';
      for (const r of records) {
        const status = (r.status || 'pending').toLowerCase();
        if (currentBookingFilter !== 'all' && status !== currentBookingFilter) continue;

        const id = r.id || '—';
        const biz = r.businessName || r.businessId || '—';
        const name = r.customerName || '—';
        const phone = r.phone || '—';
        const type = r.requestType || 'Booking';
        const details = r.details || '—';
        const ts = r.timestamp || '';

        html += '<div class="record" style="display:flex;flex-direction:column;gap:6px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<strong>[' + id + '] ' + biz + '</strong>' +
            '<span class="badge ' + status + '">' + status + '</span>' +
          '</div>' +
          '<div style="font-size:13px;">Customer: ' + name + ' (' + phone + ')</div>' +
          '<div style="font-size:13px;">' + type + ': ' + details + '</div>' +
          '<div class="muted" style="font-size:11px;">' + ts + '</div>' +
          '<div class="bk-actions">' +
            '<button type="button" class="bk-act-btn confirm" onclick="updateBookingStatus(\\'' + id + '\\',\\'confirmed\\')">Confirm</button>' +
            '<button type="button" class="bk-act-btn complete" onclick="updateBookingStatus(\\'' + id + '\\',\\'completed\\')">Complete</button>' +
            '<button type="button" class="bk-act-btn cancel" onclick="updateBookingStatus(\\'' + id + '\\',\\'cancelled\\')">Cancel</button>' +
            '<button type="button" class="bk-act-btn whatsapp" onclick="openWhatsApp(\\'' + phone + '\\',\\'' + id + '\\',\\'' + biz + '\\',\\'' + type + '\\',\\'' + details + '\\')">WhatsApp</button>' +
            '<button type="button" class="bk-act-btn receipt" onclick="openReceipt(\\'' + id + '\\',\\'' + biz + '\\',\\'' + name + '\\',\\'' + phone + '\\',\\'' + type + '\\',\\'' + details + '\\')">Receipt</button>' +
          '</div>' +
        '</div>';
      }
      box.innerHTML = html || '<p class="muted" style="padding:12px;">No bookings match the current filter.</p>';
    }

    function filterBookings() {
      const q = document.getElementById('bkSearch').value.toLowerCase();
      const rows = document.queryencerAll('#recordsBox .record');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    }

    function setBookingFilter(status) {
      currentBookingFilter = status;
      document.querySelectorAll('.bk-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
      });
      renderRecords(window.__lastRecords || []);
    }

    // Store records globally for filtering
    const originalRender = renderRecords;
    renderRecords = function(records) {
      window.__lastRecords = records;
      originalRender(records);
    };

    async function updateBookingStatus(id, status) {
      if (status === 'cancelled' && !confirm('Cancel this booking?')) return;
      try {
        await fetch('/api/businesses/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const res = await fetch('/api/data');
        const data = await res.json();
        renderRecords(data.records);
      } catch (e) { alert('Failed: ' + e.message); }
    }

    function openWhatsApp(phone, id, biz, type, details) {
      const clean = phone.replace(/\\D/g, '');
      const msg = encodeURIComponent('Booking ' + id + ' at ' + biz + ': ' + type + ' - ' + details);
      window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
    }

    function openReceipt(id, biz, name, phone, type, details) {
      const win = window.open('', '_blank');
      win.document.write('<html><head><title>Receipt ' + id + '</title><style>body{font-family:sans-serif;padding:20px;background:#0b1120;color:#f8fafc}.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;max-width:400px;margin:0 auto}</style></head><body><div class="card"><h2>Booking Receipt</h2><p><b>ID:</b> ' + id + '</p><p><b>Business:</b> ' + biz + '</p><p><b>Customer:</b> ' + name + ' (' + phone + ')</p><p><b>Type:</b> ' + type + '</p><p><b>Details:</b> ' + details + '</p><p class="muted">Smart Booking SaaS</p></div></body></html>');
    }

    // Add Business
    async function addBusiness() {
      const name = document.getElementById('bName').value.trim();
      const type = document.getElementById('bType').value.trim();
      const details = document.getElementById('bDetails').value.trim();
      const instructions = document.getElementById('bInst').value.trim();
      if (!name || !type || !details) return alert('Please fill Name, Type and Details!');

      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, details, instructions })
      });
      const data = await res.json();
      if (data.success) {
        populateDropdown(data.businesses);
        document.getElementById('bizSelect').value = data.id;
        document.getElementById('bName').value = '';
        document.getElementById('bType').value = '';
        document.getElementById('bDetails').value = '';
        document.getElementById('bInst').value = '';
        resetChat();
        document.getElementById('adminMsg').textContent = '✅ Business created and selected!';
      }
    }

    // Admin Setup
    const SETUP_KEY = 'sb_admin_setup_v1';
    function loadAdminSetup() {
      try {
        const s = JSON.parse(localStorage.getItem(SETUP_KEY) || '{}');
        document.getElementById('setupName').value = s.name || '';
        document.getElementById('setupRole').value = s.role || '';
        document.getElementById('setupPhone').value = s.phone || '';
        document.getElementById('setupEmail').value = s.email || '';
        document.getElementById('setupPin').value = s.pin || '4646';
        document.getElementById('setupBrand').value = s.brand || 'Smart Booking SaaS';
        document.getElementById('setupFooter').value = s.footer || 'Thank you for your booking!';
        document.getElementById('setupAutoWa').checked = s.autoWa !== false;
        if (s.defaultBiz) document.getElementById('setupDefaultBiz').value = s.defaultBiz;
      } catch (e) {}
    }

    function saveAdminSetup() {
      const data = {
        name: document.getElementById('setupName').value.trim(),
        role: document.getElementById('setupRole').value.trim(),
        phone: document.getElementById('setupPhone').value.trim(),
        email: document.getElementById('setupEmail').value.trim(),
        pin: document.getElementById('setupPin').value.trim() || '4646',
        brand: document.getElementById('setupBrand').value.trim() || 'Smart Booking SaaS',
        footer: document.getElementById('setupFooter').value.trim(),
        autoWa: document.getElementById('setupAutoWa').checked,
        defaultBiz: document.getElementById('setupDefaultBiz').value
      };
      localStorage.setItem(SETUP_KEY, JSON.stringify(data));
      showSetupStatus('Setup saved!');
    }

    function applyDefaultBusiness() {
      const biz = document.getElementById('setupDefaultBiz').value;
      if (biz && allBusinesses[biz]) {
        document.getElementById('bizSelect').value = biz;
        document.getElementById('bizSelect').dispatchEvent(new Event('change'));
        showSetupStatus('Switched to ' + allBusinesses[biz].name);
      }
    }

    function copyAdminUrl() {
      navigator.clipboard.writeText(window.location.origin + window.location.pathname).then(() => showSetupStatus('Admin URL copied!'));
    }

    function copyClientUrl() {
      const biz = document.getElementById('setupDefaultBiz').value;
      const url = window.location.origin + '/?b=' + encodeURIComponent(biz);
      navigator.clipboard.writeText(url).then(() => showSetupStatus('Client link copied!'));
    }

    function showSetupStatus(msg) {
      const el = document.getElementById('setupStatus');
      el.textContent = msg;
      setTimeout(() => el.textContent = '', 2000);
    }

    // Admin PIN lock
    const DEFAULT_PIN = '4646';
    function checkAdminAuth() {
      const p = new URLSearchParams(window.location.search).get('b');
      if (p) return;
      const saved = localStorage.getItem('saas_admin_pin');
      if (saved !== DEFAULT_PIN) {
        document.getElementById('adminLockModal').style.display = 'flex';
      }
    }
    function unlockAdmin() {
      const val = document.getElementById('adminPinInput').value.trim();
      if (val === DEFAULT_PIN) {
        localStorage.setItem('saas_admin_pin', val);
        document.getElementById('adminLockModal').style.display = 'none';
      } else {
        document.getElementById('pinErr').innerText = 'Galat PIN! Dobara koshish karein.';
      }
    }

    // Init
    checkAdminAuth();
    init();
  </script>
</body>
</html>
\`);
});
`;

fs.writeFileSync('server.js', before + newRoute + after, 'utf8');
console.log('New server.js generated successfully');