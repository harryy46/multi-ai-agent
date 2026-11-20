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
      </style>
    </head>
    <body><div id="adminLockModal" style="display:none;position:fixed;inset:0;background:#020617;z-index:9999;align-items:center;justify-content:center;padding:20px;"><div style="background:#0f172a;border:1px solid #1e293b;padding:24px;border-radius:14px;max-width:360px;width:100%;text-align:center;color:#f8fafc;"><h2 style="margin:0 0 8px 0;">🔐 SaaS Admin Login</h2><p style="color:#94a3b8;font-size:13px;margin-bottom:16px;">Dashboard & Bookings access karne ke liye Admin PIN daalein</p><input id="adminPinInput" type="password" inputmode="numeric" placeholder="Enter Admin PIN" style="width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;text-align:center;font-size:18px;letter-spacing:4px;margin-bottom:12px;"><button onclick="unlockAdmin()" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Unlock Dashboard</button><p id="pinErr" style="color:#f87171;font-size:12px;margin-top:10px;"></p></div></div>
      <div class="container">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;">AI Support & Booking SaaS</h2>
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
          window._recs=records;if(!records||records.length===0) {
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
        function copyClientLink(){const id=document.getElementById("bizSelect").value;const url=window.location.origin+"/?b="+encodeURIComponent(id);if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>alert("Client Link Copied! "+url)).catch(()=>prompt("Copy link:",url));}else{prompt("Copy link:",url);}} const _origInit=init; init=async function(){await _origInit(); const p=new URLSearchParams(window.location.search).get("b"); if(p && allBusinesses[p]){document.getElementById("bizSelect").value=p; resetChat(); const h=document.querySelector("h1,h2"); if(h)h.innerText=allBusinesses[p].name; const t=document.getElementById("tabAdmin"); if(t&&t.parentElement)t.parentElement.style.display="none"; const s=document.getElementById("bizSelect"); if(s){if(s.previousElementSibling)s.previousElementSibling.style.display="none"; s.style.display="none";} const cb=document.getElementById("copyLinkBtn"); if(cb)cb.style.display="none"; const r=document.getElementById("recordsBox"); if(r&&r.parentElement)r.parentElement.style.display="none";}}; const DEFAULT_PIN="4646"; function checkAdminAuth(){const p=new URLSearchParams(window.location.search).get("b"); if(p) return; const saved=localStorage.getItem("saas_admin_pin"); if(saved!==DEFAULT_PIN){document.getElementById("adminLockModal").style.display="flex";}else{addLockBtn();}} function unlockAdmin(){const val=document.getElementById("adminPinInput").value.trim(); if(val===DEFAULT_PIN){localStorage.setItem("saas_admin_pin",val); document.getElementById("adminLockModal").style.display="none"; addLockBtn();}else{document.getElementById("pinErr").innerText="Galat PIN! Dobara koshish karein.";}} function lockAdmin(){localStorage.removeItem("saas_admin_pin"); location.reload();} function addLockBtn(){if(document.getElementById("lockBtn"))return; const h=document.querySelector("h1,h2"); if(h){const b=document.createElement("button"); b.id="lockBtn"; b.innerText="🔒 Lock"; b.onclick=lockAdmin; b.style.cssText="float:right;background:#1e293b;color:#f87171;border:1px solid #334155;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;"; h.appendChild(b);}} const _origFetch=window.fetch; window.fetch=function(u,o){o=o?o:{}; if(typeof u==="string"&&u.indexOf("/api/business")!==-1){const pin=localStorage.getItem("saas_admin_pin")?localStorage.getItem("saas_admin_pin"):""; o.headers=Object.assign({},o.headers,{"x-admin-pin":pin});} return _origFetch(u,o);}; checkAdminAuth(); function openWaAlert(p,n,b,t,d){const cl=String(p||"").replace(/[^0-9]/g,"");const num=cl.length===10?"91"+cl:cl;const msg="Namaste "+(n||"Customer")+", aapki *"+(b||"Business")+"* par *"+(t||"Booking")+"* confirm ho gayi hai! Details: "+(d||"");const u=num?"https://wa.me/"+num+"?text="+encodeURIComponent(msg):"https://wa.me/?text="+encodeURIComponent(msg);window.open(u,"_blank");}setInterval(function(){const box=document.getElementById("recordsBox");if(!box||!window._recs)return;const cards=box.querySelectorAll(".record");window._recs.forEach(function(r,i){if(cards[i]&&!cards[i].querySelector(".wab")){const b=document.createElement("button");b.type="button";b.className="wab";b.innerText="📲 WhatsApp Customer";b.style.cssText="display:block;margin-top:8px;padding:7px 12px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;";b.onclick=function(){openWaAlert(r.phone,r.customerName,r.businessName?r.businessName:r.businessId,r.requestType,r.details);};cards[i].appendChild(b);}});},800);init();

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
            if(data.records){renderRecords(data.records);const L=data.records[data.records.length-1];if(L){const d=document.createElement("div");d.style.margin="6px 0 12px 0";const b=document.createElement("button");b.type="button";b.innerText="📲 Send Booking Receipt on WhatsApp";b.style.cssText="padding:9px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;";b.onclick=function(){openWaAlert(L.phone,L.customerName,L.businessName?L.businessName:L.businessId,L.requestType,L.details);};d.appendChild(b);chatBox.appendChild(d);}}
          } catch (e) {
            chatBox.innerHTML += '<div class="msg err">Error: ' + e.message + '</div>';
          }
          btn.disabled = false;
          btn.innerText = 'Send';
          chatBox.scrollTop = chatBox.scrollHeight;
        }
      </script>
    </body>
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

const JB_BIN=process.env.JSONBIN_BIN,JB_KEY=process.env.JSONBIN_KEY;async function pullCloud(){if(!JB_BIN||!JB_KEY)return;try{const r=await fetch("https://api.jsonbin.io/v3/b/"+JB_BIN+"/latest",{headers:{"X-Master-Key":JB_KEY}});const j=await r.json();if(j&&j.record&&j.record.businesses){fs.writeFileSync("database.json",JSON.stringify(j.record,null,2));console.log("CLOUD_PULLED");}}catch(e){console.error("PULL_ERR",e.message);}}function pushCloud(d){if(!JB_BIN||!JB_KEY)return;fetch("https://api.jsonbin.io/v3/b/"+JB_BIN,{method:"PUT",headers:{"Content-Type":"application/json","X-Master-Key":JB_KEY},body:JSON.stringify(d)}).catch(e=>console.error("PUSH_ERR",e.message));}
pullCloud().then(()=>app.listen(process.env.PORT || 3000, () => {
  console.log('Multi-Business AI SaaS running at http://localhost:3000');
});
