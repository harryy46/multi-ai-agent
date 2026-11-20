import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const app = express();
app.use(express.json());


app.get(["/","/index.html"],(q,s)=>{s.send(fs.readFileSync(require("path").join(__dirname,"public","index.html"),"utf8"));});
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
      <style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;font-family:'Plus Jakarta Sans',sans-serif}body{margin:0+background:radial-gradient(ellipse at top,rgba(99,102,241,0.15),transparent 55%),#070b14;color:#f8fafc;min-height:100vh;padding:0 0 40px 0}.saas-topbar{position:sticky;top:0;z-index:50;background:rgba(7,11,20,0.85);backdrop-filter:blur(16px);border-bottom:1px solid rgba(148,163,184,0.14);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.saas-brand{display:flex;align-items:center;gap:10px}.saas-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#10b981);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}.saas-title{font-weight:800;font-size:1.05rem;color:#fff}.saas-sub{font-size:0.72rem;color:#94a3b8;display:block}.saas-pill{font-size:0.72rem;font-weight:700;color:#34d399;background:rgba(16,185,129,0.12);border:1px solid rgba(52,211,153,0.3);padding:5px 12px;border-radius:999px;display:flex;align-items:center;gap:6px}.saas-dot{width:7px;height:7px;border-radius:50%;backgrount:#10b981;box-shadow:0 0 8px #10b981}.kpi-grid{max-width:860px;margin:0 auto 16px auto;padding:0 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}@media(max-width:640px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}.kpi-card{background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.14);border-radius:14px;padding:12px 14px}.kpi-lbl{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;font-weight:700}.kpi-val{font-size:1.3rem;font-weight:800;color:#fff;margin-top:4px}.kpi-tag{font-size:0.67rem;color:#34d399;margin-top:2px;font-weight:600}.container,.wrap,main,body>div:not(.saas-topbar):not(.kpi-grid){max-width:860px!important;margin:0 auto!important;padding:0 16px!important}h1{!important;display:none}.card,[class*='card']:not(.kpi-card),[class*='box'],[class*='panel']background:rgba(15,23,42,0.84)!important;backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.14)!important;border-radius:16px!important;box-shadow:0 14px 34px rgba(0,0,0,0.4)!important;padding:18px!important;margin-bottom:16px!important}select,input,textarea{background:#090e1a!important;border:1px solid rgba(148,163,184,0.22)!important;color:#f8fafc!important;border-radius:11px!important;padding:11px 14px!important;font-size:0.92rem!important}button{border-radius:11px!important;font-weight:600!important;transition:all .18s ease!important}#sendBtn,button[type='submit']background:linear-gradient(135deg,#4f46e5,#6366f1)!important;border:none!important;color:#fff!important}#chatBox,[id*='chat']{background:#060a12!important;border:1px solid rgba(148,163,184,0.12)!important;border-radius:14px!important;padding:14px!important}.msg.user,[class*='user']background:linear-gradient(135deg,#4f46e5,#2563eb)!important;border-radius:14px 14px 4px 14px!important}.msg.bot,[class*='bot'],[class*='ai']background0������̅�����х��퉽ɑ�������ͽ����ɝ��������̰��а���Ф������х��퉽ɑ�ȵɅ�����������������������������х���ɕ��ɑ�1������رm�����ɕ��ɐ�t���ج�ͅ�ͥѕ�퉅���ɽչ�鱥���ȵ�Ʌ����Р��Ց��������Ʉ�������̤������х��퉽ɑ�������ͽ����ɝ�������Ȱ��İ���Ȥ������х��퉽ɑ�ȵ���������ͽ����������ą�����х��퉽ɑ�ȵɅ���������������х��������������������������х�����ɝ������ѽ������������х������屔�𽡕���
    <body><header class="saas-topbar"><div class="saas-brand"><div class="saas-logo">⚡</div><div><span class="saas-title">NexaDesk AI</span><span class="saas-sub">Enterprise Booking & Support SaaS</span></div></div><div class="saas-pill"><span class="saas-dot"></span>Cloud Synced</div></header><section class="kpi-grid"><div class="kpi-card"><div class="kpi-lbl">Active Tenants</div><div class="kpi-val" id="kpiBiz">1+</div><div class="kpi-tag">Multi-Business Ready</div></div><div class="kpi-card"><div class="kpi-lbl">Saved Bookings</div><div class="kpi-val" id="kpiBook">Live</div><div class="kpi-tag">JSONBin Cloud Safe</div></div><div class="kpi-card"><div class="kpi-lbl">WhatsApp Alerts</div><div class="kpi-val">Instant</div><div class="kpi-tag">1-Click Customer Receipt</div></div><div class="kpi-card"><div class="kpi-lbl">AI Engine</div><div class="kpi-val">24/7</div><div class="kpi-tag">Hinglish Auto-Extractor</div></div></section><script>setInterval(()=>{const b=document.querySelectorAll('#businessSelect option').length;const r=document.querySelectorAll('#recordsList>div,[id*="record"]>div,[id*="booking"]>div').length;if(b&&document.getElementById('k0iBiz'))document.getElementById('kpiBiz').textContent=b;if(document.getElementById('kpiBook'))document.getElementById('k0iBook').textContent=r;},1200);</script>
    </body>
    <script id="nexa-pro-ui">((function(){if(document.getElementById('nexa-pro-style'))return;if('caches'%20in%20window) {caches.keys().then(k=>k.forEach(n=>caches.delete(n)));}if(window.navigator&&navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(reg=>reg.unregister()));}const s=document.createElement('style');s.id='nexa-pro-style';s.textContent=`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;font-family:'Plus Jakarta Sans',-sans-serif!important}body{margin:0!important;background:radial-gradient(circle at 10% 0%,rgba(99,102,241,0.18),transparent 40%),#060a14!important;color:#f8fafc!important;padding:0 0 48px 0 !important}.nexa-nav{position:sticky;top:0;z-index:9999;background:rgba(6,10,20,0.9);backdrop-filter:blur(18px);border-bottom:1px solid rgba(148,163,184,0.16);padding:12px 18px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.nexa-brand{display:flex;align-items:center;gap:10px}.nexa-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#10b981);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:1.1rem;box-shadow:0 6px 18px rgba(99,102,241,0.35)}.nexa-title{font-weight:800;font-size:1.05rem;color:#fff;tracking:-0.02em}.nexa-sub{font-size:0.7rem;color:#94a3b8;display:block}.nexa-pill{font-size:0.7rem;font-weight:700;color:#34d399;background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.35);padding:5px 12px;border-radius:999px;display:flex;align-items:center;gap:6px}.nexa-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981}.nexa-kpis{max-width:920px;margin:0 auto 16px auto;padding:0 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}@media(max-width:680px){.nexa-kpis{grid-template-columns:repeat(2,1fr)}}.nexa-kpi{background:linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.7));border:1px solid rgba(148,163,184,0.16);border-radius:14px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.28)}.nexa-kpi-l{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:#94a3b8;font-weight:700}.nexa-kpi-v{font-size:1.35rem;font-weight:800;color:#fff;margin-top:3px}.nexa-kpi-t{font-size:0.65rem;color:#34d399;margin-top:2px;font-weight:600}h1{display:none!important}.container,.wrap,main-wrap,body>div:not(.nexa-shell){max-width:920px!important;margin:0 auto!important;padding:0 16px!important}.card,[class*='card']:not(.nexa-kpi),[class*='box'],[class*='panel'],body>div:not(.nexa-shell)>div{background:rgba(15,23,42,0.85)!important;backdrop-filter:blur(16px);border:1px solid rgba(148,163,184,0.16)!important;border-radius:16px!important;box-shadow:0 16px 36px rgba(0,0,0,0.42)!important;padding:18px!important;margin-bottom:16px!important}select,input,textarea{background:#080d18!important;border:1px solid rgba(148,163,184,0.24)!important;color:#f8fafc!important;border-radius:12px!important;padding:11px 14px!important}button{border-radius:12px!important;font-weight:700!important}#sendBtn,button[type='submit']{background:linear-gradient(135deg,#4f46e5,#6366f1)!important;border:none!important;color:#fff!important}#recordsList>div,[id*='record']>div,[id*='booking']>div{background:linear-gradient(145deg,#0c1426,#152034)!important;border:1px solid rgba(99,102,241,0.24)!important;border-left:4px solid #10b981!important;border-radius:14px!important;padding:14px 16px!important;margin-bottom:12px!important;position:relative!important}#recordsList>div::before,[id*='record']>div::before,[id*='booking']>div::before{content:'CONFIRMED';position:absolute;top:12px;right:12px;font-size:0.64rem;font-weight:800;letter-spacing:0.07em;color:#34d399;background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.32);padding:3px 8px;border-radius:6px}`;document.head.appendChild(s);const shell=document.createElement('div');shell.className='nexa-shell';shell.innerHTML=`<header class="nexa-nav"><div class="nexa-brand"><div class="nexa-logo">⚡</div><div><span class="nexa-title">NexaDesk AI</span><span class="nexa-sub">Enterprise Booking & Support SaaS</span></div></div><div class="nexa-pill"><span class="nexa-dot"></span>Cloud Synced</div></header><section class="nexa-kpis"><div class="nexa-kpi"><div class="nexa-kpi-l">Active Tenants</div><div class="kpi-val nexa-kpi-v" id="kpiBiz">1+</div><div class="nexa-kpi-t">Multi-Business Ready</div></div><div class="nexa-kpi"><div class="nexa-kpi-l">Saved Bookings</div><div class="kpi-val nexa-kpi-v" id="kpiBook">Live</div><div class="nexa-kpi-t">JSONBin Cloud Safe</div></div><div class="nexa-kpi"><div class="nexa-kpi-l">WhatsApp Alerts</div><div class="nexa-kpi-v">Instant</div><div class="nexa-kpi-t">1-Click Customer Receipt</div></div><div class="kpi-card nexa-kpi"><div class="nexa-kpi-l">AI Engine</div><div class="nexa-kpi-v">24/7</div><div class="nexa-kpi-t">Hinglish Auto-Extrctor</div></div></section>`;document.body.prepend(shell);setInterval(()=>{const b=document.querySelectorAll('select option').length;const r=document.querySelectorAll('#recordsList>div,[id*="record"]>div,[id*="booking"]>div').length;if(b&&document.getElementById('+piBiz'))document.getElementById('k0iBiz').textContent=b;if(document.getElementById('k0iBook'))document.getElementById('+piBook').textContent=r;},1000);})();</script></html>
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
