import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const app = express();
app.get('/.well-known/assetlinks.json',(req,res)=>{res.type('application/json').send("[{\n      \"relation\": [\"delegate_permission/common.handle_all_urls\"],\n      \"target\": {\n        \"namespace\": \"android_app\",\n        \"package_name\": \"com.smartbooking.app\",\n        \"sha256_cert_fingerprints\": [\"36:13:B7:9E:AC:21:CD:E5:C7:A8:A5:69:11:EA:A0:32:B8:7F:16:90:70:FF:A7:EB:66:52:CF:89:25:3E:52:42\"]\n      }\n    }]\n");});

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
      name: "",
      type: "Healthcare / Clinic",
      details: "Timings: Subah 10 AM se Raat 8 PM tak (Sunday band). Doctors: Dr. Sharma (Dentist, Fees ₹500), Dr. Verma (General Physician, Fees ₹400). Address: Shastri Circle, Udaipur.",
      instructions: "Aap ek polite clinic receptionist hain. Hinglish me baat karein. Patient ki problem samjhein, doctor aur fees batayein, aur appointment book karne ke liye unka Naam, Phone Number, aur Preferred Time maangein."
    },
    restaurant: {
      name: "",
      type: "Restaurant / Cafe",
      details: "Timings: 11 AM se 11 PM. Menu: Paneer Tikka (₹240), Dal Makhani (₹220), Woodfire Margherita Pizza (₹350), Cold Coffee (₹120). Home delivery 5km tak free hai.",
      instructions: "Aap ek friendly restaurant manager hain. Hinglish me baat karein. Menu suggest karein, table booking ya food delivery order lene ke liye Customer ka Naam, Phone, Item/Guests, aur Time/Address maangein."
    },
    ecommerce: {
      name: "",
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
    let biz = db.businesses[businessId];
    if(!biz){const _bn=req.body.businessId||req.body.business||req.body.tenantId||'Smart Booking Business';biz={id:_bn,name:_bn,type:'Business',category:'Business',services:'All services',timings:'9 AM - 9 PM',phone:'',address:'',systemPrompt:'You are a helpful AI assistant for '+_bn+'.'};}const systemPrompt = `
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
      </style>
    <style id="sb-mobile-css">*{box-sizing:border-box;}html,body{max-width:100vw;overflow-x:hidden;}@media(max-width:768px){body{padding:10px!important;font-size:14px!important;}header,main,section,div,form{max-width:100%!important;}[style*="grid-template-columns"],.grid,.row{grid-template-columns:1fr!important;}input,select,textarea,button{width:100%!important;font-size:15px!important;padding:12px!important;}}</style>
</head>
    <body><div id="adminLockModal" style="display:none;position:fixed;inset:0;background:#020617;z-index:9999;align-items:center;justify-content:center;padding:20px;"><div style="background:#0f172a;border:1px solid #1e293b;padding:24px;border-radius:14px;max-width:360px;width:100%;text-align:center;color:#f8fafc;"><h2 style="margin:0 0 8px 0;">🔐 SaaS Admin Login</h2><p style="color:#94a3b8;font-size:13px;margin-bottom:16px;">Dashboard & Bookings access karne ke liye Admin PIN daalein</p><input id="adminPinInput" type="password" inputmode="numeric" placeholder="Enter Admin PIN" style="width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;text-align:center;font-size:18px;letter-spacing:4px;margin-bottom:12px;"><button onclick="unlockAdmin()" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Unlock Dashboard</button><p id="pinErr" style="color:#f87171;font-size:12px;margin-top:10px;"></p></div></div>
      <div class="container">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;"><style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif!important}body{margin:0!important;background:#060a14!important;color:#f8fafc!important;padding:0 0 40px!important}.nexa-shell{max-width:920px;margin:0 auto}.nexa-nav{background:rgba(6,10,20,.95);border-bottom:1px solid rgba(148,163,184,.18);padding:11px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.nexa-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#10b981);display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:#fff;margin-right:10px}.nexa-pill{font-size:.72rem;font-weight:700;color:#34d399;background:rgba(16,185,129,.14);border:1px solid rgba(52,211,153,.35);padding:4px 10px;border-radius:999px}.nexa-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 12px;margin-bottom:12px}.nexa-kpi{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:10px 12px}body>:not(.nexa-shell) h1{display:none!important}.container,.wrap,.main-wrap,body>div:not(.nexa-shell){max-width:920px!important;margin:0 auto!important;padding:0 12px!important}select,input,textarea{background:#080d18!important;border:1px solid rgba(148,163,184,.25)!important;color:#f8fafc!important;border-radius:10px!important;padding:10px 12px!important}button{border-radius:10px!important;font-weight:700!important;cursor:pointer;transition:transform .14s ease!important}button:active{transform:scale(.95)!important}#ng{position:fixed;inset:0;z-index:99999;background:#060a14;display:flex;align-items:center;justify-content:center;padding:16px}.nb{width:100%;max-width:420px;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:22px;color:#f8fafc}.nh{display:none!important}.nbtn{width:100%;padding:12px 14px!important;margin-bottom:8px!important;text-align:left!important;background:#090f1d!important;color:#f8fafc!important;border:1px solid rgba(148,163,184,.25)!important}.nbtn:hover,.nsel{border-color:#6366f1!important;background:#17223b!important}.npri{width:100%;padding:12px!important;background:linear-gradient(135deg,#4f46e5,#6366f1)!important;color:#fff!important;border:none!important}.nexa-cust-only [class*=admin],.nexa-cust-only [id*=admin],.nexa-cust-only [id*=record],.nexa-cust-only [id*=booking],.nexa-cust-only [class*=booking]{display:none!important}.nexa-admin-only [class*=chat],.nexa-admin-only [id*=chat]{display:none!important}</style><div class=nexa-shell><header class=nexa-nav><div style="display:flex;align-items:center"><span class=nexa-logo>N</span><div><div style="font-weight:800;font-size:1rem">Smart Booking</div><div style="font-size:.68rem;color:#94a3b8">Enterprise Booking & Support SaaS</div></div></div><div style="display:flex;align-items:center;gap:8px"><span class=nexa-pill>● Cloud Synced</span><button type=button onclick=ngReset() style="padding:6px 10px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,.25);font-size:.72rem">Switch</button></div></header><section class=nexa-kpis><div class=nexa-kpi><div style="font-size:.62rem;color:#94a3b8;font-weight:700">ACTIVE TENANTS</div><div style="font-size:1.25rem;font-weight:800" id=kpiBiz>1+</div></div><div class=nexa-kpi><div style="font-size:.62rem;color:#94a3b8;font-weight:700">SAVED BOOKINGS</div><div style="font-size:1.25rem;font-weight:800" id=kpiBook>Live</div></div><div class=nexa-kpi><div style="font-size:.62rem;color:#94a3b8;font-weight:700">WHATSAPP ALERTS</div><div style="font-size:1.25rem;font-weight:800">Instant</div></div><div class=nexa-kpi><div style="font-size:.62rem;color:#94a3b8;font-weight:700">AI ENGINE</div><div style="font-size:1.25rem;font-weight:800">24/7</div></div></section></div><div id=ng><div class=nb id=ns1><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 1 • WELCOME</div><h2 style="margin:6px 0">Welcome to Smart Booking</h2><p style="color:#94a3b8;font-size:.84rem;margin:0 0 14px">Smart AI support & booking workspace.</p><button type=button class=npri onclick=ngStep(2)>Continue</button></div><div class="nb nh" id=ns2><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 2 • LANGUAGE</div><h2 style="margin:6px 0">Choose Language</h2><button type=button class=nbtn onclick=ngLang("English",this)>English</button><button type=button class=nbtn onclick=ngLang("Hindi",this)>Hindi (हिन्दी)</button><button type=button class=nbtn onclick=ngLang("Hinglish",this)>Hinglish</button><button type=button class=npri onclick=ngStep(3)>Next: Login Panel</button></div><div class="nb nh" id=ns3><div style="color:#34d399;font-size:.7rem;font-weight:800">STEP 3 • LOGIN</div><h2 style="margin:6px 0">Select Login Panel</h2><p id=nlbl style="color:#94a3b8;font-size:.8rem;margin:0 0 12px">Language: Hinglish</p><button type=button class=nbtn onclick=ngOpen("customer")>Customer Login (Customer Page Only)</button><button type=button class=nbtn onclick=ngPin()>Business Admin Login (Admin Page Only)</button><div id=npbox class="nh" style="margin-top:8px"><input type=password id=npin placeholder="Enter Admin PIN" style="width:100%;margin-bottom:8px"><button type=button class=npri onclick=ngVerify()>Verify & Open Admin</button><div id=nperr style="color:#f87171;font-size:.75rem;margin-top:6px"></div></div></div></div><script>window.nLang="Hinglish";function ngStep(n){[1,2,3].forEach(function(k){document.getElementById("ns"+k).classList.toggle("nh",k!==n)});if(n===3)document.getElementById("nlbl").textContent="Language: "+window.nLang}function ngLang(l,b){window.nLang=l;document.querySelectorAll("#ns2 .nbtn").forEach(function(x){x.classList.remove("nsel")});b.classList.add("nsel")}function ngPin(){document.getElementById("npbox").classList.remove("nh");document.getElementById("npin").value="";document.getElementById("nperr").textContent=""}function ngVerify(){if(document.getElementById("npin").value.trim()==="4646")ngOpen("admin");else document.getElementById("nperr").textContent="Invalid Admin PIN"}function ngOpen(r){document.getElementById("ng").style.display="none";document.body.classList.remove("nexa-cust-only","nexa-admin-only");document.body.classList.add(r==="admin"?"nexa-admin-only":"nexa-cust-only");var ip=document.querySelector("input[placeholder*=message],textarea");if(ip)ip.placeholder=window.nLang==="Hindi"?"यहाँ संदेश लिखें...":window.nLang==="English"?"Type message here...":"Hinglish me message likhein..."}function ngReset(){ngStep(1);document.getElementById("npbox").classList.add("nh");document.getElementById("ng").style.display="flex"}</script>AI Support & Booking SaaS</h2>
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
    <style>#nexaAdminBizDash{display:none!important;max-width:920px;margin:0 auto 14px;padding:18px;background:rgba(15,23,42,.95);border:1px solid rgba(99,102,241,.35);border-radius:16px;box-sizing:border-box}.nexa-admin-only #nexaAdminBizDash{display:block!important}.nexa-biz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}@media(max-width:640px){.nexa-biz-grid{grid-template-columns:1fr}}.nexa-biz-full{grid-column:1/-1}#nexaBizStatus{font-size:.78rem;color:#34d399;margin-top:8px;min-height:18px}</style><div id=nexaAdminBizDash><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div style="font-size:.68rem;font-weight:800;color:#34d399;letter-spacing:.06em">ADMIN WORKSPACE</div><h3 style="margin:2px 0 0;font-size:1.1rem;color:#fff">+ Add Business</h3></div><button type=button onclick=nexaTriggerNativeAddBiz() style="padding:8px 12px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,.25);font-size:.75rem">Open Classic Form</button></div><form id=nexaBizForm onsubmit=nexaSaveAdminBiz(event) class=nexa-biz-grid><input type=text id=bizName placeholder="Business Name (e.g. Royal Salon)" required><input type=text id=bizCat placeholder="Category / Type (e.g. Salon, Clinic, Store)" required><input type=text id=bizPhone placeholder="Phone / WhatsApp Number"><input type=text id=bizCity placeholder="City / Address"><textarea id=bizDesc rows=2 id=bizInfo placeholder="Apne business, timing, services ya offers ke baare mein likhein..." class=nexa-biz-full></textarea><div class=nexa-biz-full style="display:flex;justify-content:flex-end"><button type=submit style="padding:11px 18px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none">+ Save & Add Business</button></div></form><div id=nexaBizStatus></div></div><script>function nexaTriggerNativeAddBiz(){var btns=Array.from(document.querySelectorAll("button"));var t=btns.find(function(b){return /add business/i.test(b.textContent||"")&&b.closest("#nexaAdminBizDash")===null});if(t)t.click();}function nexaSaveAdminBiz(e){e.preventDefault();var name=(document.getElementById("bizName").value||"").trim();var cat=(document.getElementById("bizCat").value||"").trim();var ph=(document.getElementById("bizPhone").value||"").trim();var city=(document.getElementById("bizCity").value||"").trim();var desc=(document.querySelector("#nexaBizForm textarea").value||"").trim();if(!name)return;var label=name+(cat?" ("+cat+")":"");var sel=document.querySelector("select");if(sel){var exists=Array.from(sel.options).some(function(o){return o.value===label||o.text===label});if(!exists){var opt=document.createElement("option");opt.value=label;opt.text=label;sel.appendChild(opt)}sel.value=label;sel.dispatchEvent(new Event("change",{bubbles:true}))}window.nexaLastBusiness={name:name,category:cat,phone:ph,city:city,description:desc,updatedAt:new Date().toISOString()};document.getElementById("nexaBizStatus").textContent="Saved: "+label+(city?" • "+city:"");e.target.reset();}</script><style>.nexa-admin-only [placeholder*=message i],.nexa-admin-only [placeholder*=likhein i],.nexa-admin-only #sendBtn,.nexa-admin-only .nexa-shell+div>div:first-child{display:none!important}</style><style>#nexaBizForm textarea{min-height:76px!important;padding:12px!important;line-height:1.45!important}.nexa-admin-only [placeholder*=message i],.nexa-admin-only [placeholder*=likhein i],.nexa-admin-only #sendBtn,.nexa-admin-only .nexa-shell+div>div:first-child{display:none!important}</style><script>function nexaPurgeDemoBiz(){var demos=["smilecare","spice villa","beautiful jewelry store","healthcare / clinic","restaurant / cafe","e-commerce store"];document.querySelectorAll("select").forEach(function(sel){Array.from(sel.options).forEach(function(opt){var t=((opt.text||"")+" "+(opt.value||"")).toLowerCase();if(demos.some(function(d){return t.indexOf(d)!==-1})){opt.remove()}});if(sel.options.length===0){var ph=document.createElement("option");ph.value="";ph.text="No business saved yet — Add in Admin";sel.appendChild(ph)}})}document.addEventListener("DOMContentLoaded",function(){nexaPurgeDemoBiz();setTimeout(nexaPurgeDemoBiz,400);setTimeout(nexaPurgeDemoBiz,1200)});</script><script>function nexaSyncLangTexts(){var lang=window.nLang||"Hinglish";var walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var n;while(n=walk.nextNode()){if(!n.parentElement||n.parentElement.closest("#ng"))continue;var t=n.nodeValue;if(!t)continue;if(lang==="English"){if(/abhi koi booking/i.test(t))n.nodeValue="No bookings yet.";else if(/me safe/i.test(t))n.nodeValue=t.replace(/me safe/gi,"saved in database")}else if(lang==="Hindi"){if(/abhi koi booking|no bookings yet/i.test(t))n.nodeValue="अभी कोई बुकिंग नहीं है।"}else{if(/no bookings yet|अभी कोई बुकिंग/i.test(t))n.nodeValue="Abhi koi booking nahi hai."}}var ip=document.querySelector("input[placeholder*=message i],input[placeholder*=likhein i],textarea:not(#bizDesc)");if(ip)ip.placeholder=lang==="English"?"Type message here...":lang==="Hindi"?"यहाँ संदेश लिखें...":"Hinglish me message likhein..."}var _ngOpen=window.ngOpen;window.ngOpen=function(r){if(typeof _ngOpen==="function")_ngOpen(r);setTimeout(nexaSyncLangTexts,100)};setInterval(nexaSyncLangTexts,800);</script><script>setInterval(function(){var l=window.nLang||"Hinglish";var nb=l==="English"?"No bookings yet.":l==="Hindi"?"अभी कोई बुकिंग नहीं है।":"Abhi koi booking nahi hai.";var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var n;while(n=w.nextNode()){if(!n.parentElement||n.parentElement.closest("#ng"))continue;var t=n.nodeValue;if(t&&/abhi koi booking|no bookings yet|अभी कोई बुकिंग/i.test(t))n.nodeValue=nb}var ip=document.querySelector("input[placeholder*=message i],input[placeholder*=likhein i],input[placeholder*=संदेश],textarea:not(#nexaBizForm textarea)");if(ip)ip.placeholder=l==="English"?"Type message here...":l==="Hindi"?"यहाँ संदेश लिखें...":"Hinglish me message likhein...";document.querySelectorAll("button").forEach(function(b){if(b.closest("#ng"))return;var x=(b.textContent||"").trim();if(/^send$|^भेजें$/i.test(x))b.textContent=l==="Hindi"?"भेजें":"Send"})},700);</script><script>setInterval(function(){document.querySelectorAll("button,a,[role=button]").forEach(function(el){if(el.closest("#ng,#nexaAdminBizDash"))return;var t=(el.textContent||"").replace(/\s+/g," ").trim();if(/ai chat & bookings/i.test(t)||/\+\s*add business\s*\(admin\)/i.test(t)){el.style.setProperty("display","none","important")}})},500);</script><script>setInterval(function(){document.querySelectorAll("button,a").forEach(function(e){var k=(e.textContent||"").toLowerCase();if(k.indexOf("ai chat")===0||k.indexOf("+ add business")===0){e.style.display="none"}})},400);</script><style>.nexa-cust-only .nexa-kpis{display:none!important}#nexaCustBookBox{display:none;max-width:920px;margin:14px auto 0;padding:18px;background:rgba(15,23,42,.95);border:1px solid rgba(99,102,241,.35);border-radius:16px;box-sizing:border-box}.nexa-cust-only #nexaCustBookBox{display:block!important}.nexa-cb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}@media(max-width:640px){.nexa-cb-grid{grid-template-columns:1fr}}.nexa-cb-full{grid-column:1/-1}#nexaCustReceipt{display:none;margin-top:12px;padding:12px;background:rgba(16,185,129,.12);border:1px solid rgba(52,211,153,.35);border-radius:12px;font-size:.82rem;color:#d1fae5}</style><div id='nexaCustBookBox'><div style='font-size:.68rem;font-weight:800;color:#34d399;letter-spacing:.06em'>QUICK BOOKING</div><h3 style='margin:2px 0 0;font-size:1.05rem;color:#fff'>Book Appointment / Order</h3><form id='nexaCustBookForm' onsubmit='nexaSubmitCustBooking(event)' class='nexa-cb-grid'><input type='text' id='cbName' placeholder='Your Name' required><input type='text' id='cbPhone' placeholder='Phone / WhatsApp Number' required><input type='text' id='cbService' placeholder='Service / Item (e.g. Haircut, Checkup)' required><input type='text' id='cbTime' placeholder='Preferred Date & Time (e.g. Today 5 PM)' required><div class='nexa-cb-full' style='display:flex;justify-content:flex-end'><button type='submit' style='padding:11px 18px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none'>Confirm Booking</button></div></form><div id='nexaCustReceipt'></div></div><script>setInterval(function(){if(document.body.classList.contains('nexa-cust-only')){document.querySelectorAll('button,a').forEach(function(b){if(b.closest('#ng,#nexaCustBookBox'))return;var t=(b.textContent||'').toLowerCase();if(t.indexOf('copy client shareable')!==-1){b.style.display='none'}})}},500);function nexaSubmitCustBooking(e){e.preventDefault();var n=document.getElementById('cbName').value.trim();var p=document.getElementById('cbPhone').value.trim();var sv=document.getElementById('cbService').value.trim();var tm=document.getElementById('cbTime').value.trim();var sel=document.querySelector('select');var biz=sel&&sel.value?sel.value:'Smart Booking Business';var id='SB-'+Math.floor(1000+Math.random()*9000);var msg=encodeURIComponent('Booking Confirmed ('+id+')
Business: '+biz+'
Name: '+n+'
Phone: '+p+'
Service: '+sv+'
Time: '+tm);var box=document.getElementById('nexaCustReceipt');box.innerHTML='<b>Booking Confirmed! ID: '+id+'</b><br>'+biz+' • '+sv+' ('+tm+')<br><a href='https://wa.me/?text='+msg+'' target='_blank' style='display:inline-block;margin-top:8px;padding:7px 12px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:700'>Share Receipt on WhatsApp</a>';box.style.display='block';e.target.reset()}</script><script>setInterval(function(){if(document.body.classList.contains('nexa-cust-only')){document.querySelectorAll('button,a').forEach(function(b){if((b.textContent||'').toLowerCase().indexOf('copy client')>-1)b.style.display='none'});document.querySelectorAll('h2,h3,h4,div').forEach(function(el){if(el.children.length===0&&(el.textContent||'').trim()==='Saved Bookings & Orders'&&el.parentElement)el.parentElement.style.display='none'})}document.querySelectorAll('div,p,span').forEach(function(m){if(m.children.length===0&&(m.textContent||'').toLowerCase().indexOf('smilecare')>-1)m.textContent='Welcome! Select a business above or type your message to start.'})},500);function nexaLoadSavedBiz(){var list=JSON.parse(localStorage.getItem('nexaBizList')||'[]');var sel=document.querySelector('select');if(!sel||!list.length)return;Array.from(sel.options).forEach(function(o){if(!o.value)o.remove()});list.forEach(function(lb){if(!Array.from(sel.options).some(function(o){return o.value===lb})){var o=document.createElement('option');o.value=lb;o.text=lb;sel.appendChild(o)}})}setTimeout(nexaLoadSavedBiz,600);setTimeout(nexaLoadSavedBiz,1500);var _os=window.nexaSaveAdminBiz;window.nexaSaveAdminBiz=function(e){var nm=(document.getElementById('bizName').value||'').trim();var ct=(document.getElementById('bizCat').value||'').trim();if(nm){var lb=nm+(ct?' ('+ct+')':'');var arr=JSON.parse(localStorage.getItem('nexaBizList')||'[]');if(arr.indexOf(lb)===-1){arr.push(lb);localStorage.setItem('nexaBizList',JSON.stringify(arr))}}if(typeof _os==='function')_os(e);nexaLoadSavedBiz()};window.nexaSubmitCustBooking=function(e){e.preventDefault();var n=document.getElementById('cbName').value.trim();var p=document.getElementById('cbPhone').value.trim();var sv=document.getElementById('cbService').value.trim();var tm=document.getElementById('cbTime').value.trim();var sel=document.querySelector('select');var biz=(sel&&sel.value)?sel.value:'Smart Booking Business';var id='SB-'+Math.floor(1000+Math.random()*9000);var msg=encodeURIComponent('Booking Confirmed ('+id+')')+'%0ABusiness: '+encodeURIComponent(biz)+'%0AName: '+encodeURIComponent(n)+'%0APhone: '+encodeURIComponent(p)+'%0AService: '+encodeURIComponent(sv)+'%0ATime: '+encodeURIComponent(tm);var box=document.getElementById('nexaCustReceipt');box.innerHTML='<b>Booking Confirmed! ID: '+id+'</b><br>'+biz+' - '+sv+' ('+tm+')<br><a href=https://wa.me/?text='+msg+' target=_blank style=display:inline-block;margin-top:8px;padding:8px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:700>Share Receipt on WhatsApp</a>';box.style.display='block';e.target.reset()};</script><script>var _svBiz=window.nexaSaveAdminBiz;window.nexaSaveAdminBiz=function(e){var nm=(document.getElementById('bizName').value||'').trim();var ct=(document.getElementById('bizCat').value||'').trim();var ph=(document.getElementById('bizPhone').value||'').replace(/[^0-9]/g,'');if(nm&&ph){var lb=nm+(ct?' ('+ct+')':'');var pm=JSON.parse(localStorage.getItem('nexaBizPhones')||'{}');pm[lb]=ph;localStorage.setItem('nexaBizPhones',JSON.stringify(pm))}if(typeof _svBiz==='function')_svBiz(e)};function nexaRenderAdminBookings(){if(document.body.classList.contains('nexa-cust-only'))return;var list=JSON.parse(localStorage.getItem('nexaBookingsList')||'[]');var box=document.getElementById('nexaAdminBookingsList');if(!box){document.querySelectorAll('h2,h3,h4,div').forEach(function(el){if(!box&&el.children.length===0&&(el.textContent||'').trim()==='Saved Bookings & Orders'&&el.parentElement){box=document.createElement('div');box.id='nexaAdminBookingsList';box.style.marginTop='10px';el.parentElement.appendChild(box)}})}if(!box||!list.length)return;box.innerHTML=list.slice().reverse().map(function(b){return '<div style=padding:10px;margin-top:8px;background:#1e293b;border-radius:10px;font-size:12px;color:#e2e8f0><b>'+b.id+'</b> • '+b.biz+'<br>'+b.name+' ('+b.phone+')<br>'+b.service+' — '+b.time+'</div>'}).join('')}setInterval(nexaRenderAdminBookings,1000);window.nexaSubmitCustBooking=function(e){e.preventDefault();var n=document.getElementById('cbName').value.trim();var p=document.getElementById('cbPhone').value.trim();var sv=document.getElementById('cbService').value.trim();var tm=document.getElementById('cbTime').value.trim();var sel=document.querySelector('select');var biz=(sel&&sel.value)?sel.value:'Smart Booking Business';var id='SB-'+Math.floor(1000+Math.random()*9000);var arr=JSON.parse(localStorage.getItem('nexaBookingsList')||'[]');arr.push({id:id,biz:biz,name:n,phone:p,service:sv,time:tm});localStorage.setItem('nexaBookingsList',JSON.stringify(arr));var pm=JSON.parse(localStorage.getItem('nexaBizPhones')||'{}');var ownerPh=pm[biz]||'';var msg=encodeURIComponent('Booking Confirmed ('+id+')')+'%0ABusiness: '+encodeURIComponent(biz)+'%0AName: '+encodeURIComponent(n)+'%0APhone: '+encodeURIComponent(p)+'%0AService: '+encodeURIComponent(sv)+'%0ATime: '+encodeURIComponent(tm);var waUrl='https://wa.me/'+ownerPh+'?text='+msg;var box=document.getElementById('nexaCustReceipt');box.innerHTML='<b>Booking Confirmed! ID: '+id+'</b><br>'+biz+' - '+sv+' ('+tm+')<br><a href='+waUrl+' target=_blank style=display:inline-block;margin-top:8px;padding:8px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:700>Send Receipt to Owner on WhatsApp</a>';box.style.display='block';e.target.reset();nexaRenderAdminBookings()};</script><script>function nexaBubbleOnly(){var sel=document.querySelector('select');var bz=sel&&sel.value?sel.value:'';var l=window.nLang||'Hinglish';var g=document.querySelector('[data-cg]');if(!g){document.querySelectorAll('b,strong').forEach(function(b){if(!g&&(b.textContent||'').toLowerCase().indexOf('smilecare')>-1&&b.parentElement){b.parentElement.setAttribute('data-cg','1');g=b.parentElement}})}if(!g)return;if(!bz){g.textContent=l==='Hindi'?'नमस्ते! कृपया ऊपर से कोई बिज़नेस चुनें।':l==='English'?'Welcome! Please select a business above.':'Namaste! Kripya upar se koi business select karein.';return}g.textContent=l==='Hindi'?'नमस्ते! '+bz+' में आपका स्वागत है। मैं आपकी क्या मदद कर सकता हूँ?':l==='English'?'Welcome to '+bz+'! How can I help you today?':'Namaste! '+bz+' me aapka swagat hai. Main aapki kaise madad kar sakta hoon?'}setInterval(nexaBubbleOnly,400);document.addEventListener('change',function(e){if(e.target&&e.target.tagName==='SELECT')nexaBubbleOnly()});</script><script>setInterval(function(){document.querySelectorAll("div,span").forEach(function(el){if(el.children.length===0&&(el.textContent||"").trim()==="N"&&el.offsetWidth>20&&el.offsetWidth<60){el.textContent="SB"}})},500);</script><script>(function(){const orig=Storage.prototype.setItem;let t;function push(){clearTimeout(t);t=setTimeout(()=>{const d={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);d[k]=localStorage.getItem(k);}fetch('/api/cloud-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:d})}).catch(()=>{});},300);}Storage.prototype.setItem=function(k,v){orig.apply(this,arguments);if(this===localStorage)push();};fetch('/api/cloud-state').then(r=>r.json()).then(j=>{if(j&&j.data&&Object.keys(j.data).length){let ch=false;for(const k in j.data){if(localStorage.getItem(k)!==j.data[k]){orig.call(localStorage,k,j.data[k]);ch=true;}}if(ch&&!sessionStorage.getItem('sb_cs')){sessionStorage.setItem('sb_cs','1');location.reload();}}}).catch(()=>{});})();</script><script id="sb-ui-polish">(function(){function clean(){document.querySelectorAll('div,p,span').forEach(el=>{if(el.children.length===0&&el.textContent.trim()==='No bookings yet.'){const box=el.parentElement;if(box&&box.innerText.includes('SB-'))el.style.display='none';}if(el.children.length===0&&el.textContent.includes('NX-')){el.textContent=el.textContent.replace(/NX-/g,'SB-');}});}setInterval(clean,800);clean();})();</script><script id="sb-skip-welcome">(function(){if(localStorage.getItem("sb_onboarded")==="1"){const skip=()=>{document.querySelectorAll("button").forEach(b=>{const t=(b.innerText||"").trim();if(t==="Continue"||t==="Next: Login Panel")b.click();});};window.addEventListener("DOMContentLoaded",()=>{skip();setTimeout(skip,200);setTimeout(skip,500);});}document.addEventListener("click",e=>{const b=e.target.closest("button");if(b){const t=(b.innerText||"").trim();if(t==="Next: Login Panel"||t.includes("Login")||t.includes("Admin"))localStorage.setItem("sb_onboarded","1");}});})();</script></body>
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

const { MongoClient } = require('mongodb');
let _col;
async function getCol(){if(_col)return _col;const c=new MongoClient(process.env.MONGODB_URI);await c.connect();_col=c.db('smartbooking').collection('app_state');return _col;}
app.get('/api/cloud-state',async(req,res)=>{try{if(!process.env.MONGODB_URI)return res.json({data:{}});const col=await getCol();const doc=await col.findOne({_id:'main'});res.json({data:doc?doc.data:{}});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/cloud-state',async(req,res)=>{try{if(!process.env.MONGODB_URI)return res.json({ok:false});const col=await getCol();await col.updateOne({_id:'main'},{$set:{data:req.body.data||{},updatedAt:new Date()}},{upsert:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});



app.listen(process.env.PORT || 3000, () => {
  console.log('Multi-Business AI SaaS running at http://localhost:3000');
});
