import { MongoClient } from 'mongodb';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
const app = express();
app.set('trust proxy', 1);

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-min-32-chars';
const JWT_EXPIRES_IN = '7d';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

// Static file routes
app.get('/phase1.js', (req, res) => res.type('application/javascript').send(fs.readFileSync(new URL('./phase1.js', import.meta.url), 'utf8')));
app.get('/phase2.js', (req, res) => res.type('application/javascript').send(fs.readFileSync(new URL('./phase2.js', import.meta.url), 'utf8')));
app.get('/phase3.js', (req, res) => res.type('application/javascript').send(fs.readFileSync(new URL('./phase3.js', import.meta.url), 'utf8')));

app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json').send(`[{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.smartbooking.app",
      "sha256_cert_fingerprints": ["36:13:B7:9E:AC:21:CD:E5:C7:A8:A5:69:11:EA:A0:32:B8:7F:16:90:70:FF:A7:EB:66:52:CF:89:25:3E:52:42"]
    }
  }]`);
});

app.use(express.json());
app.use(cookieParser());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DB_FILE = './database.json';

const MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.7-flash'
];

// Default data
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
  records: [],
  users: []
};

// Database Load & Save Functions
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

// User Authentication Helpers
function findUserByEmail(email) {
  const db = loadDB();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id) {
  const db = loadDB();
  return db.users.find(u => u.id === id);
}

async function createUser(userData) {
  const db = loadDB();
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const newUser = {
    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    email: userData.email.toLowerCase(),
    password: hashedPassword,
    businessName: userData.businessName || '',
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  saveDB(db);
  return newUser;
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = findUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const user = findUserById(decoded.userId);
      if (user) req.user = user;
    }
  }
  next();
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

// ============ AUTHENTICATION ROUTES ============

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { businessName, email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const user = await createUser({ businessName: businessName || '', email, password });
    const token = generateToken(user);
    
    res.cookie('token', token, cookieOptions);
    res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, businessName: user.businessName }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = generateToken(user);
    res.cookie('token', token, cookieOptions);
    res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, businessName: user.businessName }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: 0 });
  res.json({ success: true });
});

// Get current user
app.get('/api/auth/me', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({ 
      user: { id: req.user.id, email: req.user.email, businessName: req.user.businessName }
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ============ EXISTING ROUTES ============

app.get('/api/data', (req, res) => {
  res.json(loadDB());
});

app.post('/api/businesses', (req, res) => { 
  const ep = process.env.ADMIN_PIN ? process.env.ADMIN_PIN : '4646'; 
  if (req.headers['x-admin-pin'] !== ep) return res.status(401).json({error:'Invalid Admin PIN'});
  
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
      db.records.unshift(bookingData);
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

// ============ FRONTEND ROUTE ============

app.get('/', optionalAuth, (req, res) => {
  if (req.user) {
    res.send(generateDashboard(req.user));
  } else {
    res.send(generateLoginPage());
  }
});

function generateDashboard(user) {
  return `<!DOCTYPE html>
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
      display: none;
      padding: 12px 16px 16px;
    }
    .accordion-content.open {
      display: block;
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
  <div class="container">
    <div class="header">
      <div>
        <h1>Smart Booking</h1>
        <div class="subtitle">Enterprise Booking & Support SaaS — Dark Dashboard</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:#34d399;background:rgba(16,185,129,.14);border:1px solid rgba(52,211,153,.35);padding:4px 10px;border-radius:999px;">● Cloud Synced</span>
        <span style="font-size:13px;color:#94a3b8;">Welcome, ${user.email}</span>
        <button type="button" onclick="logout()" style="padding:6px 10px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;">Logout</button>
      </div>
    </div>

    <!-- 1. OVERVIEW & STATS -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-overview" data-target="acc-overview">
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
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-chat" data-target="acc-chat">
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
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-bookings" data-target="acc-bookings">
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
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-admin-setup" data-target="acc-admin-setup">
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
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-addbiz" data-target="acc-addbiz">
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

    function toggleAccordion(panelId, btn) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
      // Force display override to ensure visibility regardless of CSS
      panel.style.display = isOpen ? 'block' : 'none';
    }

    // Attach click handler immediately (not waiting for DOMContentLoaded)
    document.body.addEventListener('click', function(e) {
      const btn = e.target.closest('.accordion-btn[data-target]');
      if (btn) {
        const targetId = btn.getAttribute('data-target');
        toggleAccordion(targetId, btn);
      }
    });

    async function logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.reload();
      } catch (e) {
        window.location.reload();
      }
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        document.getElementById('statBiz').textContent = Object.keys(data.businesses || {}).length || '0';
        document.getElementById('statBookings').textContent = (data.records || []).length || '0';
      } catch (e) { console.error('stats load failed', e); }
    }

    function populateDropdown(businesses, selectId) {
      allBusinesses = businesses;
      const sel = document.getElementById(selectId || 'bizSelect');
      const currentVal = sel.value;
      sel.innerHTML = Object.entries(businesses).map(([id, b]) =>
        '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
      ).join('');
      if (currentVal && businesses[currentVal]) sel.value = currentVal;

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
      const rows = document.querySelectorAll('#recordsBox .record');
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

    function toggleAccordion(panelId, btn) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    }

    init();
  </script>
</body>
</html>`;
}

function generateLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Booking — Sign In</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <script>if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").catch(function(){});}</script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 16px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .login-container { width: 100%; max-width: 420px; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; }
    .login-header { text-align: center; margin-bottom: 28px; }
    .login-header .logo { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #6366f1, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px; }
    .login-header .subtitle { color: #94a3b8; font-size: 14px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #0f172a; padding: 4px; border-radius: 10px; }
    .tab-btn { flex: 1; padding: 12px; border: none; background: transparent; color: #94a3b8; font-weight: 600; font-size: 14px; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
    .tab-btn.active { background: #2563eb; color: #fff; }
    .form-group { margin-bottom: 18px; }
    label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
    input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: #f8fafc; font-size: 15px; }
    input:focus { outline: 2px solid #2563eb; outline-offset: -2px; border-color: #2563eb; }
    .btn { width: 100%; padding: 14px; border-radius: 10px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-ghost { background: transparent; border: 1px solid #334155; color: #cbd5e1; }
    .btn-ghost:hover { background: #1e293b; border-color: #64748b; }
    .error { color: #f87171; font-size: 13px; margin-bottom: 12px; min-height: 18px; text-align: center; }
    .divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #64748b; font-size: 13px; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #334155; }
    .footer-text { text-align: center; color: #64748b; font-size: 13px; margin-top: 20px; }
    .hidden { display: none !important; }
    @media (max-width: 480px) {
      body { padding: 12px; }
      .login-container { padding: 24px; border-radius: 12px; }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <div class="logo">Smart Booking</div>
      <div class="subtitle">Enterprise Booking & Support SaaS</div>
    </div>
    
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab-btn active" id="tabLogin" aria-selected="true" onclick="switchTab('login')">Login</button>
      <button type="button" role="tab" class="tab-btn" id="tabSignup" aria-selected="false" onclick="switchTab('signup')">Sign Up</button>
    </div>

    <div id="errorMsg" class="error"></div>

    <form id="formLogin" novalidate>
      <div class="form-group">
        <label for="loginEmail">Email</label>
        <input type="email" id="loginEmail" autocomplete="email" required placeholder="you@domain.com">
      </div>
      <div class="form-group">
        <label for="loginPassword">Password</label>
        <input type="password" id="loginPassword" autocomplete="current-password" required placeholder="••••••••">
      </div>
      <button type="submit" class="btn btn-primary">Login</button>
    </form>

    <form id="formSignup" class="hidden" novalidate>
      <div class="form-group">
        <label for="signupBusinessName">Business Name (optional)</label>
        <input type="text" id="signupBusinessName" autocomplete="organization" placeholder="e.g., Royal Salon">
      </div>
      <div class="form-group">
        <label for="signupEmail">Email</label>
        <input type="email" id="signupEmail" autocomplete="email" required placeholder="you@domain.com">
      </div>
      <div class="form-group">
        <label for="signupPassword">Password</label>
        <input type="password" id="signupPassword" autocomplete="new-password" required minlength="6" placeholder="Min. 6 characters">
      </div>
      <button type="submit" class="btn btn-primary">Create Account</button>
    </form>

    <div class="divider">or</div>
    <button type="button" class="btn btn-ghost" onclick="location.href='/'">Continue as Guest (View Demo)</button>

    <div class="footer-text">
      Smart Booking — AI Appointment & Business SaaS
    </div>
  </div>

  <script>
    function switchTab(tab) {
      const isLogin = tab === 'login';
      document.getElementById('formLogin').classList.toggle('hidden', !isLogin);
      document.getElementById('formSignup').classList.toggle('hidden', isLogin);
      document.getElementById('tabLogin').classList.toggle('active', isLogin);
      document.getElementById('tabSignup').classList.toggle('active', !isLogin);
      document.getElementById('tabLogin').setAttribute('aria-selected', String(isLogin));
      document.getElementById('tabSignup').setAttribute('aria-selected', String(!isLogin));
      document.getElementById('errorMsg').textContent = '';
    }

    function showError(msg) {
      document.getElementById('errorMsg').textContent = msg;
    }

    async function handleLogin(e) {
      e.preventDefault();
      showError('');
      const btn = e.target.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Logging in...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPassword').value
          })
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          showError(data.error || 'Login failed');
        }
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    async function handleSignup(e) {
      e.preventDefault();
      showError('');
      const btn = e.target.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Creating account...';

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            businessName: document.getElementById('signupBusinessName').value,
            email: document.getElementById('signupEmail').value,
            password: document.getElementById('signupPassword').value
          })
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          showError(data.error || 'Sign up failed');
        }
      } catch (err) {
        showError('Network error. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    document.getElementById('formLogin').addEventListener('submit', handleLogin);
    document.getElementById('formSignup').addEventListener('submit', handleSignup);
  </script>
</body>
</html>`;
}

// ============ MANIFEST & SW ROUTES ============

app.get("/manifest.json", (req, res) => { 
  res.json({ 
    name: "AI Support and Booking SaaS", 
    short_name: "AI Agent SaaS", 
    start_url: "/", 
    display: "standalone", 
    background_color: "#0b1120", 
    theme_color: "#2563eb", 
    icons: [{ src: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png", sizes: "512x512", type: "image/png" }] 
  }); 
});

app.get("/sw.js", (req, res) => { 
  res.type("application/javascript"); 
  res.send("self.addEventListener('fetch', function() {});"); 
});

app.get('/privacy', (req, res) => res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy - Smart Booking</title><style>body{font-family:sans-serif;max-width:720px;margin:30px auto;padding:0 16px;background:#0f172a;color:#e2e8f0;line-height:1.6}h1,h2{color:#38bdf8}</style></head><body><h1>Privacy Policy - Smart Booking (SB)</h1><p>Effective Date: November 2026</p><p>Smart Booking (SB) collects only the information needed to manage business appointments and customer support (business name, customer name, phone number, and booking details).</p><h2>Data Usage & Security</h2><p>Data is stored securely on MongoDB Atlas and is never sold to third parties. WhatsApp messages are opened directly on your device.</p><h2>Contact</h2><p>For data deletion or support, contact Smart Booking Support via the app.</p></body></html>'));

app.listen(process.env.PORT || 3000, () => {
  console.log('Smart Booking running at http://localhost:3000');
});