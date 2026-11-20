import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const app = express();
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DB_FILE = './database.json';

const MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.7-flash'
];

// Default data agar database.json pehli baar ban rahi ho
const defaultData = {
  businesses: {
    clinic: {
      name: "SmileCare Dental & Medical Clinic",
      type: "Healthcare / Clinic",
      details: "Timings: Subah 10 AM se Raat 8 PM tak (Sunday band). Doctors: Dr. Sharma (Dentist, Fees ₹500), Dr. Verma (General Physician, Fees ₹400). Address: Shastri Circle, Udaipur.",
      instructions: "Aap ek polite clinic receptionist hain. Hinglish me baat karein. Patient ki problem samjhein, doctor aur fees batayein, aur appointment book karne ke liye unka Naam, Phone Number, aur Preferred Time maangein."
    },
    restaurant: {
      name: "Spice Villa Cafe & Restaurant",
      type: "Restaurant / Cafe",
      details: "Timings: 11 AM se 11 PM. Menu: Paneer Tikka (₹240), Dal Makhani (₹220), Woodfire Margherita Pizza (₹350), Cold Coffee (₹120). Home delivery 5km tak free hai.",
      instructions: "Aap ek friendly restaurant manager hain. Hinglish me baat karein. Menu suggest karein, table booking ya food delivery order lene ke liye Customer ka Naam, Phone, Item/Guests, aur Time/Address maangein."
    },
    ecommerce: {
      name: "Beautiful Jewelry Store",
      type: "E-commerce Store",
      details: "Products: Gold-Plated Necklaces (₹1,299), Silver Rings (₹799), Bridal Sets (₹3,499). Shipping: Free all-India delivery (3-5 days). Return Policy: 7-day easy exchange/return.",
      instructions: "Aap ek helpful e-commerce support executive hain. Hinglish me baat karein. Customers ko jewelry recommend karein, policies batayein, aur order book ya track karne me madad karein."
    }
  },
  records: []
};

// Database Load & Save Functions (Permanent Storage)
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const saveRecordTool = {
  name: "save_customer_request",
  description: "Jab customer appointment book kare, restaurant me order/table book kare, ya store par order place kare tab is tool ko call karein.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      businessId: { type: Type.STRING, description: "Active business ki ID" },
      customerName: { type: Type.STRING, description: "Customer ka poora naam" },
      phone: { type: Type.STRING, description: "Customer ka mobile number" },
      requestType: { type: Type.STRING, description: "Appointment, Food Order, Table Booking, ya Product Order" },
      details: { type: Type.STRING, description: "Time, date, ya items ki poori detail" }
    },
    required: ["businessId", "customerName", "phone", "requestType", "details"]
  }
};

async function callGeminiWithFallback(contents, systemPrompt, useTools = true) {
  let lastError;
  for (const modelName of MODELS) {
    try {
      const config = { systemInstruction: systemPrompt };
      if (useTools) config.tools = [{ functionDeclarations: [saveRecordTool] }];
      const res = await ai.models.generateContent({ model: modelName, contents, config });
      return { res, modelName };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// API: Saare businesses aur saved bookings fetch karne ke liye
app.get('/api/data', (req, res) => {
  res.json(loadDB());
});

// API: Admin Panel se naya business add karne ke liye
app.post('/api/businesses', (req, res) => { const ep=process.env.ADMIN_PIN?process.env.ADMIN_PIN:'4646'; if(req.headers['x-admin-pin']!==ep)return res.status(401).json({error:'Invalid Admin PIN'});
  const { name, type, details, instructions } = req.body;
  if (!name || !type || !details) {
    return res.status(400).json({ error: "Name, Type aur Details zaroori hain!" });
  }
  const db = loadDB();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.floor(100 + Math.random() * 900);
  db.businesses[id] = {
    name,
    type,
    details,
    instructions: instructions || `Aap ${name} ke polite AI assistant hain. Hinglish me baat karein aur customer ki booking/order ke liye unka Naam, Phone Number, aur Time/Details maangein.`
  };
  saveDB(db);
  res.json({ success: true, id, businesses: db.businesses });
});

// API: Chat aur Booking
app.post('/api/chat', async (req, res) => {
  try {
    const { businessId, message, history = [] } = req.body;
    const db = loadDB();
    const biz = db.businesses[businessId];
    if (!biz) return res.status(400).json({ error: "Invalid business selected" });

    const systemPrompt = `
      Business ID: ${businessId}
      Business Name: ${biz.name} (${biz.type})
      Business Details & Pricing: ${biz.details}
      Role & Rules: ${biz.instructions}
      Important: Jab customer saari zaroori details (Naam, Phone, Time/Items) de de, toh 'save_customer_request' tool call karke booking confirm karein. Jawaab chhota, natural aur helpful rakhein.
    `;

    const contents = [...history, { role: 'user', parts: [{ text: message }] }];
    const { res: response } = await callGeminiWithFallback(contents, systemPrompt, true);

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const bookingData = {
        id: "REQ-" + Math.floor(1000 + Math.random() * 9000),
        businessName: biz.name,
        timestamp: new Date().toLocaleString('en-IN'),
        ...call.args
      };
      db.records.unshift(bookingData); // Nayi booking sabse upar save hogi
      saveDB(db);

      const { res: followUp } = await callGeminiWithFallback([
        ...contents,
        response.candidates[0].content,
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: call.name,
              response: { status: "confirmed", bookingId: bookingData.id }
            }
          }]
        }
      ], systemPrompt, false);

      return res.json({ reply: followUp.text, records: db.records });
    }

    res.json({ reply: response.text, records: db.records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FRONTEND UI (Chat + Live Bookings + Admin Business Builder)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Multi-Business AI SaaS</title><link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#2563eb"><script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script><link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#2563eb"><script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script><link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#2563eb"><script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script><link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#2563eb"><script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 16px; }
        .container { max-width: 960px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
        .tabs { display: flex; gap: 8px; }
        .tab-btn { background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .tab-btn.active { background: #2563eb; border-color: #2563eb; color: white; }
        .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
        .card { background: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155; }
        select, input, textarea, button { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; font-size: 14px; margin-top: 6px; }
        button.primary { background: #2563eb; border: none; cursor: pointer; font-weight: bold; }
        button.primary:hover { background: #1d4ed8; }
        #chatBox { height: 340px; overflow-y: auto; border: 1px solid #334155; padding: 12px; border-radius: 8px; margin: 12px 0; background: #0f172a; }
        .msg { margin-bottom: 10px; padding: 9px 13px; border-radius: 10px; max-width: 82%; line-height: 1.4; font-size: 14px; }
        .user { background: #2563eb; margin-left: auto; }
        .bot { background: #334155; }
        .err { background: #7f1d1d; color: #fecaca; font-size: 12px; }
        .record { background: #0f172a; padding: 10px; border-left: 4px solid #10b981; margin-bottom: 8px; border-radius: 6px; font-size: 13px; }
        .hidden { display: none; }
        label { font-size: 13px; color: #94a3b8; display: block; margin-top: 10px; }
      <style>.nexa-shell{width:100%!important;max-width:920px!important;margin:0 auto!important}.nexa-nav{width:100%!important;box-sizing:border-box!important}.nexa-kpis{width:100%!important;max-width:920px!important;margin:0 auto 14px auto!important;padding:0 12px!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;box-sizing:border-box!important}.nexa-kpi{width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important}<style>@keyframes nexaPulseRing{0%{box-shadow:0 0 0 0 rgba(99,102,241,0.55)}100%{box-shadow:0 0 0 12px rgba(99,102,241,0)}}button,.nexa-opt-btn,.nexa-role-btn,.nexa-primary-btn,.nexa-sub-btn,.nexa-kpi{transition:transform 0.16s cubic-bezier(0.22,1,0.36,1),box-shadow 0.2s ease,border-color 0.2s ease,background 0.2s ease!important}button:active,.nexa-opt-btn:active,.nexa-role-btn:active,.nexa-primary-btn:active,.nexa-sub-btn:active{transform:scale(0.95)!important;animation:nexaPulseRing 0.35s ease-out!important}.nexa-kpi:hover{transform:translateY(-2px)!important;border-color:rgba(99,102,241,0.45)!important}</style></style></style>
    </head>
    <body><div id="adminLockModal" style="display:none;position:fixed;inset:0;background:#020617;z-index:9999;align-items:center;justify-content:center;padding:20px;"><div style="background:#0f172a;border:1px solid #1e293b;padding:24px;border-radius:14px;max-width:360px;width:100%;text-align:center;color:#f8fafc;"><h2 style="margin:0 0 8px 0;">🔐 SaaS Admin Login</h2><p style="color:#94a3b8;font-size:13px;margin-bottom:16px;">Dashboard & Bookings access karne ke liye Admin PIN daalein</p><input id="adminPinInput" type="password" inputmode="numeric" placeholder="Enter Admin PIN" style="width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;text-align:center;font-size:18px;letter-spacing:4px;margin-bottom:12px;"><button onclick="unlockAdmin()" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Unlock Dashboard</button><p id="pinErr" style="color:#f87171;font-size:12px;margin-top:10px;"></p></div></div>
      <div class="container">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;"><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;font-family:'Plus Jakarta Sans',-sans-serif!important}body{margin:0!important;background:radial-gradient(circle at 10% 0%,rgba(99,102,241,0.18),transparent 40%),#060a14!important;color:#f8fafc!important;padding:0 0 48px 0 !important}.nexa-nav{position:sticky;top:0;z-index:9999;background:rgba(6,10,20,0.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(148,163,184,0.16);padding:11px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.nexa-brand{display:flex;align-items:center;gap:10px}.nexa-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#10b981);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:1.1rem;box-shadow:0 6px 18px rgba(99,102,241,0.35)}.nexa-title{font-weight:800;font-size:1.05rem;color:#fff;tracking:-0.02em}.nexa-sub{font-size:0.7rem;color:#94a3b8;display:block}.nexa-pill{font-size:0.7rem;font-weight:700;color:#34d399;background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.35);padding:5px 12px;border-radius:999px;display:flex;align-items:center;gap:6px}.nexa-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981}.nexa-kpis{max-width:920px;margin:0 16px 14px 16px;padding:0;display:grid;grid-template-columns:repeat(4,1mr);gap:8px}@media(max-width:680px){.nexa-kpis{grid-template-columns:repeat(2,1fr)}}.nexa-kpi{background:linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.7));border:1px solid rgba(148,163,184,0.16);border-radius:14px;padding:10s 12px;box-shadow:0 8px 24px rgba(0,0,0,0.28)}.nexa-kpi-l{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:#94a3b8;font-weight:700}.nexa-kpi-v{font-size:1.35rem;font-weight:800;color:#fff;margin-top:3px}.nexa-kpi-t{font-size:0.65rem;color:#34d399;margin-top:2px;font-weight:600}body>:not(.nexa-shell) h1{display:none!important}.container,.wrap,main-wrap,body>div:not(.nexa-shell){max-width:920px!important;margin:0 auto!important;padding:0 16px!important}.card,[class*='card']:not(.nexa-kpi),[class*='box'],[class*='panel'],body>div:not(.nexa-shell)>div;background:rgba(15,23,42,0.85)!important;backdrop-filter:blur(16px);border:1px solid rgba(148,163,184,0.16)!important;border-radius:16px!important;box-shadow:0 16px 36px rgba(0,0,0,0.42)!important;padding:18px!important;margin-bottom:16px!important}select,input,textarea{background:#080d18!important;border:1px solid rgba(148,163,184,0.24)!important;color:#f8fafc!important;border-radius:12px!important;padding:11px 14px!important}button{border-radius:12px!important;font-weight:700!important}#sendBtn,button[type='submit']{background:linear-gradient(135deg,#4f46e5,#6366f1)!important;border:none!important;color:#fff!important}#recordsList>div,[id*='record']>div,[id*='booking']>div{background:linear-gradient(145deg,#0c1426,#152034)!important;border:1px solid rgba(99,102,241,0.24)!important;border-left:4px solid #10b981!important;border-radius:14px!important;padding:14px 16px!important;margin-bottom:12px!important;position:relative!important}#recordsList>div::before,[id*='record']>div::before,[id*='booking']>div::before{content:'CONFIRMED';position:absolute;top:12px;right:12px;font-size:0.64rem;font-weight:800;letter-spacing:0.07em;color:#34d399;background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.32);padding:3px 8px;border-radius:6px}</style><div class="nexa-shell"><header class="nexa-nav"><div class="nexa-brand"><div class="nexa-logo">N</div><div><span class="nexa-title">NexaDesk AI</span><span class="nexa-sub">Enterprise Booking & Support SaaS</span></div></div><div class="nexa-pill"><span class="nexa-dot"></span>Cloud Synced</div></header><section class="nexa-kpis"><div class="nexa-kpi"><div class="nexa-kpi-l">ACTIVE TENANTS</div><div class="kpi-val nexa-kpi-v" id="kpiBiz">1+</div><div class="nexa-kpi-t">Multi-Business Ready</div></div><div class="nexa-kpi"><div class="nexa-kpi-l">SAVED BOOKINGS</div><div class="kpi-val nexa-kpi-v" id="kpiBook">Live</div><div class="nexa-kpi-t">JSONBin Cloud Safe</div></div><div class="nexa-kpi"><div class="nexa-kpi-l">WHATSAXP ALERTS</div><div class="nexa-kpi-v">Instant</div><div class="nexa-kpi-t">1-Click Customer Receipt</div></div><div class="nexa-kpi"><div class="nexa-kpi-l">AI ERGINE</div><div class="nexa-kpi-v">24/7</div><div class="nexa-kpi-t">Hinglish Auto-Extrctor</div></div></section></div><script>setInterval(function(){var b=document.querySelectorAll('select option').length;var r=document.querySelectorAll('#recordsList>div,[id*=record]>div,[id*=booking]>div').length;if(b&&document.getElementById('kpiBiz'))document.getElementById('+piBiz').textContent=b;if(document.getElementById('+piBook'))document.getElementById('kpiBook').textContent=r;},1000);</script>NexaDesk AI — Enterprise SaaS</h2>
          <div class="tabs">
            <button class="tab-btn active" id="tabChat" onclick="switchTab('chat')">AI Chat & Bookings</button>
            <button class="tab-btn" id="tabAdmin" onclick="switchTab('admin')">+ Add Business (Admin)</button>
          </div>
        </div>

        <!-- TAB 1: CHAT & BOOKINGS -->
        <div id="viewChat" class="grid">
          <div class="card">
            <label style="margin-top:0;"><b>Select Active Business:</b></label>
            <select id="bizSelect" onchange="resetChat()"></select><button id="copyLinkBtn" type="button" onclick="copyClientLink()" style="margin-top:8px;width:100%;padding:10px;background:#0f172a;color:#38bdf8;border:1px solid #38bdf8;border-radius:8px;font-weight:bold;cursor:pointer;">🔗 Copy Client Shareable Chat Link</button>
            <div id="chatBox"></div>
            <div style="display: flex; gap: 8px;">
              <input id="msgInput" placeholder="Hinglish me message likhein..." style="margin-top:0;" onkeypress="if(event.key==='Enter') sendMsg()">
              <button class="primary" id="sendBtn" onclick="sendMsg()" style="width: 90px; margin-top:0;">Send</button>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-top:0;">Saved Bookings & Orders</h3>
            <p style="font-size: 12px; color: #94a3b8;">Permanent Database (database.json) me safe:</p>
            <div id="recordsBox" style="max-height: 390px; overflow-y: auto;"></div>
          </div>
        </div>

        <!-- TAB 2: ADMIN PANEL -->
        <div id="viewAdmin" class="card hidden" style="max-width: 600px; margin: 0 auto;">
          <h3 style="margin-top:0;">Naya Business AI Agent Banayein</h3>
          <p style="font-size: 13px; color: #94a3b8;">Kisi bhi client ka business details daalein, AI turant uske liye train ho jayega:</p>
          
          <label>Business Name (e.g., Royal Men's Salon / FitZone Gym)</label>
          <input id="bName" placeholder="Business ka naam likhein...">

          <label>Category / Type (e.g., Salon, Gym, Coaching, Real Estate)</label>
          <input id="bType" placeholder="Business category likhein...">

          <label>Services, Pricing, Timings & Address</label>
          <textarea id="bDetails" rows="4" placeholder="Jaise: Haircut ₹150, Beard ₹100, Facial ₹500. Timings: 9 AM - 9 PM. Location: Sector 4, Udaipur."></textarea>

          <label>AI Behavior / Custom Rules (Optional)</label>
          <textarea id="bInst" rows="2" placeholder="Jaise: Polite Hinglish me baat karein, service aur time confirm karke booking save karein."></textarea>

          <button class="primary" onclick="addBusiness()" style="margin-top: 16px;">Save & Launch AI Agent</button>
          <p id="adminMsg" style="font-size: 13px; color: #10b981; margin-top: 10px;"></p>
        </div>
      </div>

      <script>
        let history = [];
        let allBusinesses = {};

        function switchTab(tab) {
          document.getElementById('viewChat').classList.toggle('hidden', tab !== 'chat');
          document.getElementById('viewAdmin').classList.toggle('hidden', tab !== 'admin');
          document.getElementById('tabChat').classList.toggle('active', tab === 'chat');
          document.getElementById('tabAdmin').classList.toggle('active', tab === 'admin');
        }

        function renderRecords(records) {
          const box = document.getElementById('recordsBox');
          if (!records || records.length === 0) {
            box.innerHTML = '<p style="color: #64748b; font-size: 13px;">Abhi koi booking nahi hai.</p>';
            return;
          }
          box.innerHTML = records.map(r => 
            '<div class="record"><b>[' + r.id + '] ' + (r.businessName || r.businessId) + '</b><br>' +
            'Customer: ' + r.customerName + ' (' + r.phone + ')<br>' +
            r.requestType + ': ' + r.details + '<br>' +
            '<span style="color:#64748b; font-size:11px;">' + (r.timestamp || '') + '</span></div>'
          ).join('');
        }

        function populateDropdown(businesses, selectId) {
          allBusinesses = businesses;
          const sel = document.getElementById(selectId || 'bizSelect');
          const currentVal = sel.value;
          sel.innerHTML = Object.entries(businesses).map(([id, b]) => 
            '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
          ).join('');
          if (currentVal && businesses[currentVal]) sel.value = currentVal;
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
        }
        function copyClientLink(){const id=document.getElementById("bizSelect").value;const url=window.location.origin+"/?b="+encodeURIComponent(id);if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>alert("Client Link Copied! "+url)).catch(()=>prompt("Copy link:",url));}else{prompt("Copy link:",url);}} const _origInit=init; init=async function(){await _origInit(); const p=new URLSearchParams(window.location.search).get("b"); if(p && allBusinesses[p]){document.getElementById("bizSelect").value=p; resetChat(); const h=document.querySelector("h1,h2"); if(h)h.innerText=allBusinesses[p].name; const t=document.getElementById("tabAdmin"); if(t&&t.parentElement)t.parentElement.style.display="none"; const s=document.getElementById("bizSelect"); if(s){if(s.previousElementSibling)s.previousElementSibling.style.display="none"; s.style.display="none";} const cb=document.getElementById("copyLinkBtn"); if(cb)cb.style.display="none"; const r=document.getElementById("recordsBox"); if(r&&r.parentElement)r.parentElement.style.display="none";}}; const DEFAULT_PIN="4646"; function checkAdminAuth(){const p=new URLSearchParams(window.location.search).get("b"); if(p) return; const saved=localStorage.getItem("saas_admin_pin"); if(saved!==DEFAULT_PIN){document.getElementById("adminLockModal").style.display="flex";}else{addLockBtn();}} function unlockAdmin(){const val=document.getElementById("adminPinInput").value.trim(); if(val===DEFAULT_PIN){localStorage.setItem("saas_admin_pin",val); document.getElementById("adminLockModal").style.display="none"; addLockBtn();}else{document.getElementById("pinErr").innerText="Galat PIN! Dobara koshish karein.";}} function lockAdmin(){localStorage.removeItem("saas_admin_pin"); location.reload();} function addLockBtn(){if(document.getElementById("lockBtn"))return; const h=document.querySelector("h1,h2"); if(h){const b=document.createElement("button"); b.id="lockBtn"; b.innerText="🔒 Lock"; b.onclick=lockAdmin; b.style.cssText="float:right;background:#1e293b;color:#f87171;border:1px solid #334155;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;"; h.appendChild(b);}} const _origFetch=window.fetch; window.fetch=function(u,o){o=o?o:{}; if(typeof u==="string"&&u.indexOf("/api/business")!==-1){const pin=localStorage.getItem("saas_admin_pin")?localStorage.getItem("saas_admin_pin"):""; o.headers=Object.assign({},o.headers,{"x-admin-pin":pin});} return _origFetch(u,o);}; checkAdminAuth(); init();

        async function addBusiness() {
          const name = document.getElementById('bName').value.trim();
          const type = document.getElementById('bType').value.trim();
          const details = document.getElementById('bDetails').value.trim();
          const instructions = document.getElementById('bInst').value.trim();
          if (!name || !type || !details) return alert("Please Name, Type aur Details bharein!");

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
            switchTab('chat');
          }
        }

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
      </script>
    <style>.nexa-role-bar{max-width:920px;margin:0 auto 12px auto;padding:0 12px;display:flex;gap:8px;justify-content:flex-end;box-sizing:border-box}.nexa-role-btn{padding:8px 14px!important;font-size:0.78rem!important;background:rgba(15,23,42,0.9)!important;color:#cbd5e1!important;border:1px solid rgba(148,163,184,0.25)!important;cursor:pointer}.nexa-role-btn.active{background:linear-gradient(135deg,#4f46e5,#6366f1)!important;color:#fff!important;border-color:transparent!important}#nexaAdminLoginModal{display:none;position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,0.82);backdrop-filter:blur(10px);align-items:center;justify-content:center;padding:16px}.nexa-login-card{width:100%;max-width:380px;background:#0f172a;border:1px solid rgba(148,163,184,0.22);border-radius:16px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.6)}.nexa-login-card h3{margin:0 0 6px 0;font-size:1.05rem;color:#fff}.nexa-login-card p{margin:0 0 14px 0;font-size:0.78rem;color:#94a3b8}.nexa-login-err{color:#f87171;font-size:0.75rem;margin-top:8px;min-height:16px}.nexa-admin-locked [class*="admin"],.nexa-admin-locked [id*="admin"]{display:none!important}</style><div class="nexa-role-bar"><button type="button" class="nexa-role-btn active" id="btnCustomerMode" onclick="nexaSetCustomerMode()">Customer Portal</button><button type="button" class="nexa-role-btn" id="btnAdminMode" onclick="nexaOpenAdminLogin()">Admin Login</button></div><div id="nexaAdminLoginModal"><div class="nexa-login-card"><h3>Admin Portal Login</h3><p>Enter your 4-digit Admin PIN to manage businesses & bookings.</p><input type="password" id="nexaPinInput" maxlength="8" placeholder="Enter Admin PIN" style="width:100%;margin-bottom:10px"><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" onclick="nexaCloseAdminLogin()" style="padding:9px 14px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,0.25)">Cancel</button><button type="button" onclick="nexaVerifyAdminPin()" style="padding:9px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none">Unlock Admin</button></div><div class="nexa-login-err" id="nexaPinErr"></div></div></div><script>window.nexaAdminUnlocked=false;function nexaSetCustomerMode(){window.nexaAdminUnlocked=false;document.body.classList.add("nexa-admin-locked");document.getElementById("btnCustomerMode").classList.add("active");document.getElementById("btnAdminMode").classList.remove("active");document.getElementById("btnAdminMode").textContent="Admin Login";}function nexaOpenAdminLogin(){if(window.nexaAdminUnlocked){nexaApplyAdminMode();return;}document.getElementById("nexaPinInput").value="";document.getElementById("nexaPinErr").textContent="";document.getElementById("nexaAdminLoginModal").style.display="flex";setTimeout(function(){var i=document.getElementById("nexaPinInput");if(i)i.focus();},50);}function nexaCloseAdminLogin(){document.getElementById("nexaAdminLoginModal").style.display="none";}function nexaApplyAdminMode(){window.nexaAdminUnlocked=true;document.body.classList.remove("nexa-admin-locked");document.getElementById("btnAdminMode").classList.add("active");document.getElementById("btnCustomerMode").classList.remove("active");document.getElementById("btnAdminMode").textContent="Admin Panel (Unlocked)";}function nexaVerifyAdminPin(){var val=(document.getElementById("nexaPinInput").value||"").trim();if(val==="4646"){nexaCloseAdminLogin();nexaApplyAdminMode();}else{document.getElementById("nexaPinErr").textContent="Invalid PIN. Please enter valid Admin PIN.";}}document.addEventListener("DOMContentLoaded",function(){nexaSetCustomerMode();});</script><style>#ng{position:fixed;inset:0;z-index:99999;background:#060a14;display:flex;align-items:center;justify-content:center;padding:16px}.nb{width:100%;max-width:420px;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:22px;color:#f8fafc}.nh{display:none}.nbtn{width:100%;padding:12px 14px!important;margin-bottom:8px!important;text-align:left!important;background:#090f1d!important;color:#f8fafc!important;border:1px solid rgba(148,163,184,.25)!important;border-radius:12px!important;cursor:pointer;transition:transform .14s ease,border-color .18s ease!important}.nbtn:hover,.nsel{border-color:#6366f1!important;background:#17223b!important}.nbtn:active,.npri:active{transform:scale(.95)!important}.npri{width:100%;padding:12px!important;background:linear-gradient(135deg,#4f46e5,#6366f1)!important;color:#fff!important;border:none!important;border-radius:12px!important;font-weight:700!important;cursor:pointer;transition:transform .14s ease!important}</style><div id=ng><div class=nb id=ns1><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 1 • WELCOME</div><h2 style="margin:6px 0">Welcome to NexaDesk AI</h2><p style="color:#94a3b8;font-size:.84rem;margin:0 0 14px">Smart AI support & booking workspace.</p><button type=button class=npri onclick=ngStep(2)>Continue</button></div><div class="nb nh" id=ns2><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 2 • LANGUAGE</div><h2 style="margin:6px 0">Choose Language</h2><button type=button class=nbtn onclick=ngLang("English",this)>English</button><button type=button class=nbtn onclick=ngLang("Hindi",this)>Hindi (हिन्दी)</button><button type=button class=nbtn onclick=ngLang("Hinglish",this)>Hinglish</button><button type=button class=npri onclick=ngStep(3)>Next: Login Panel</button></div><div class="nb nh" id=ns3><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 3 • LOGIN</div><h2 style="margin:6px 0">Select Login Panel</h2><p id=nlbl style="color:#94a3b8;font-size:.8rem;margin:0 0 12px">Language: Hinglish</p><button type=button class=nbtn onclick=ngDone(false)>Customer Login</button><button type=button class=nbtn onclick=ngPinBox()>Business Admin Login (PIN)</button><div id=npbox class=nh style="margin-top:8px"><input type=password id=npin placeholder="Enter Admin PIN" style="width:100%;margin-bottom:8px"><button type=button class=npri onclick=ngCheckPin()>Verify & Open Admin</button><div id=nperr style="color:#f87171;font-size:.75rem;margin-top:6px"></div></div></div></div><script>window.nLang="Hinglish";function ngStep(n){[1,2,3].forEach(function(k){document.getElementById("ns"+k).classList.toggle("nh",k!==n)});if(n===3)document.getElementById("nlbl").textContent="Language: "+window.nLang}function ngLang(l,b){window.nLang=l;document.querySelectorAll("#ns2 .nbtn").forEach(function(x){x.classList.remove("nsel")});b.classList.add("nsel")}function ngPinBox(){document.getElementById("npbox").classList.remove("nh");document.getElementById("npin").value="";document.getElementById("nperr").textContent=""}function ngCheckPin(){if(document.getElementById("npin").value.trim()==="4646")ngDone(true);else document.getElementById("nperr").textContent="Invalid PIN"}function ngDone(adm){document.getElementById("ng").style.display="none";if(adm&&typeof nexaApplyAdminMode==="function")nexaApplyAdminMode();else if(!adm&&typeof nexaSetCustomerMode==="function")nexaSetCustomerMode();var ip=document.querySelector("input[placeholder*=message],textarea");if(ip)ip.placeholder=window.nLang==="Hindi"?"यहाँ संदेश लिखें...":window.nLang==="English"?"Type message here...":"Hinglish me message likhein..."}</script><style>#ng{position:fixed;inset:0;z-index:99999;background:#060a14;display:flex;align-items:center;justify-content:center;padding:16px}.nb{width:100%;max-width:420px;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:22px;color:#f8fafc}.nh{display:none}.nbtn{width:100%;padding:12px 14px!important;margin-bottom:8px!important;text-align:left!important;background:#090f1d!important;color:#f8fafc!important;border:1px solid rgba(148,163,184,.25)!important;border-radius:12px!important;cursor:pointer;transition:transform .14s ease,border-color .18s ease!important}.nbtn:hover,.nsel{border-color:#6366f1!important;background:#17223b!important}.nbtn:active,.npri:active{transform:scale(.95)!important}.npri{width:100%;padding:12px!important;background:linear-gradient(135deg,#4f46e5,#6366f1)!important;color:#fff!important;border:none!important;border-radius:12px!important;font-weight:700!important;cursor:pointer;transition:transform .14s ease!important}.nexa-cust-only [class*=admin],.nexa-cust-only [id*=admin],.nexa-cust-only [id*=record],.nexa-cust-only [id*=booking]{display:none!important}.nexa-admin-only [class*=chat],.nexa-admin-only [id*=chat]{display:none!important}</style><div id=ng><div class=nb id=ns1><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 1 • WELCOME</div><h2 style="margin:6px 0">Welcome to NexaDesk AI</h2><p style="color:#94a3b8;font-size:.84rem;margin:0 0 14px">Smart AI booking & support workspace.</p><button type=button class=npri onclick=ngStep(2)>Continue</button></div><div class="nb nh" id=ns2><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 2 • LANGUAGE</div><h2 style="margin:6px 0">Choose Language</h2><button type=button class=nbtn onclick=ngLang("English",this)>English</button><button type=button class=nbtn onclick=ngLang("Hindi",this)>Hindi (हिन्दी)</button><button type=button class=nbtn onclick=ngLang("Hinglish",this)>Hinglish</button><button type=button class=npri onclick=ngStep(3)>Next: Login Panel</button></div><div class="nb nh" id=ns3><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 3 • LOGIN</div><h2 style="margin:6px 0">Select Login Panel</h2><p id=nlbl style="color:#94a3b8;font-size:.8rem;margin:0 0 12px">Language: Hinglish</p><button type=button class=nbtn onclick=ngOpen("customer")>Customer Login (Customer Page Only)</button><button type=button class=nbtn onclick=ngPin()>Business Admin Login (Admin Page Only)</button><div id=npbox class="nh" style="margin-top:8px"><input type=password id=npin placeholder="Enter Admin PIN" style="width:100%;margin-bottom:8px"><button type=button class=npri onclick=ngVerify()>Verify & Open Admin</button><div id=nperr style="color:#f87171;font-size:.75rem;margin-top:6px"></div></div></div></div><script>window.nLang="Hinglish";function ngStep(n){[1,2,3].forEach(function(k){document.getElementById("ns"+k).classList.toggle("nh",k!==n)});if(n===3)document.getElementById("nlbl").textContent="Language: "+window.nLang}function ngLang(l,b){window.nLang=l;document.querySelectorAll("#ns2 .nbtn").forEach(function(x){x.classList.remove("nsel")});b.classList.add("nsel")}function ngPin(){document.getElementById("npbox").classList.remove("nh");document.getElementById("npin").value="";document.getElementById("nperr").textContent=""}function ngVerify(){if(document.getElementById("npin").value.trim()==="4646")ngOpen("admin");else document.getElementById("nperr").textContent="Invalid Admin PIN"}function ngOpen(r){document.getElementById("ng").style.display="none";document.body.classList.remove("nexa-cust-only","nexa-admin-only");document.body.classList.add(r==="admin"?"nexa-admin-only":"nexa-cust-only");var ip=document.querySelector("input[placeholder*=message],textarea");if(ip)ip.placeholder=window.nLang==="Hindi"?"यहाँ संदेश लिखें...":window.nLang==="English"?"Type message here...":"Hinglish me message likhein..."}document.addEventListener("DOMContentLoaded",function(){ngStep(1)});</script></body>
    </html>
  `);
});

app.get("/manifest.json", (req, res) => { res.json({ name: "AI Support and Booking SaaS", short_name: "AI Agent SaaS", start_url: "/", display: "standalone", background_color: "#0b1120", theme_color: "#2563eb", icons: [{ src: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png", sizes: "512x512", type: "image/png" }] }); });
app.get("/sw.js", (req, res) => { res.type("application/javascript"); res.send("self.addEventListener('fetch', () =;"); });
app.get("/manifest.json", (req, res) => { res.json({ name: "AI Support and Booking SaaS", short_name: "AI Agent SaaS", start_url: "/", display: "standalone", background_color: "#0b1120", theme_color: "#2563eb", icons: [{ src: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png", sizes: "512x512", type: "image/png" }] }); });
app.get("/sw.js", (req, res) => { res.type("application/javascript"); res.send("self.addEventListener('fetch', () =;"); });
app.get("/manifest.json", (req, res) => { res.json({ name: "AI Support and Booking SaaS", short_name: "AI Agent SaaS", start_url: "/", display: "standalone", background_color: "#0b1120", theme_color: "#2563eb", icons: [{ src: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png", sizes: "512x512", type: "image/png" }] }); });
app.get("/sw.js", (req, res) => { res.type("application/javascript"); res.send("self.addEventListener('fetch', () =;"); });
app.get("/manifest.json", (req, res) => { res.json({ name: "AI Support and Booking SaaS", short_name: "AI Agent SaaS", start_url: "/", display: "standalone", background_color: "#0b1120", theme_color: "#2563eb", icons: [{ src: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png", sizes: "512x512", type: "image/png" }] }); });
app.get("/sw.js", (req, res) => { res.type("application/javascript"); res.send("self.addEventListener('fetch', () =;"); });
app.listen(process.env.PORT || 3000, () => {
  console.log('Multi-Business AI SaaS running at http://localhost:3000');
});
