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

// Default data with enhanced business schema
const defaultData = {
  businesses: {
    clinic: {
      id: 'clinic',
      name: "",
      type: "Healthcare / Clinic",
      details: "Timings: 10 AM - 8 PM (Sunday closed). Doctors: Dr. Sharma (Dentist, Fees ₹500), Dr. Verma (General Physician, Fees ₹400). Address: Shastri Circle, Udaipur.",
      instructions: "You are a polite clinic receptionist. Speak in English. Understand the patient's problem, share doctor details and fees, and ask for their Name, Phone Number, and Preferred Time to book an appointment.",
      adminProfile: {
        adminName: "",
        businessName: "",
        contactPhone: "",
        contactEmail: "",
        address: "",
        bio: ""
      },
      whatsapp: {
        businessNumber: "",
        autoConfirmTemplate: "Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!",
        sendConfirmationLink: true
      },
      services: [],
      staff: [],
      workingHours: {
        monday: { open: "10:00", close: "20:00", closed: false },
        tuesday: { open: "10:00", close: "20:00", closed: false },
        wednesday: { open: "10:00", close: "20:00", closed: false },
        thursday: { open: "10:00", close: "20:00", closed: false },
        friday: { open: "10:00", close: "20:00", closed: false },
        saturday: { open: "10:00", close: "20:00", closed: false },
        sunday: { open: "10:00", close: "20:00", closed: true }
      },
      timeOff: [],
      staff: [],
      upi: {
        enabled: false,
        upiId: "",
        payeeName: "",
        advanceAmount: 0,
        advanceType: "fixed"
      }
    },
    restaurant: {
      id: "restaurant",
      name: "",
      type: "Restaurant / Cafe",
      details: "Timings: 11 AM - 11 PM. Menu: Paneer Tikka (₹240), Dal Makhani (₹220), Woodfire Margherita Pizza (₹350), Cold Coffee (₹120). Free home delivery within 5 km.",
      instructions: "You are a friendly restaurant manager. Speak in English. Suggest menu items, and for table bookings or food delivery orders, ask for Customer Name, Phone, Items/Guests, and Time/Address.",
      adminProfile: {
        adminName: "",
        businessName: "",
        contactPhone: "",
        contactEmail: "",
        address: "",
        bio: ""
      },
      whatsapp: {
        businessNumber: "",
        autoConfirmTemplate: "Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!",
        sendConfirmationLink: true
      },
      services: [],
      staff: [],
      workingHours: {
        monday: { open: "11:00", close: "23:00", closed: false },
        tuesday: { open: "11:00", close: "23:00", closed: false },
        wednesday: { open: "11:00", close: "23:00", closed: false },
        thursday: { open: "11:00", close: "23:00", closed: false },
        friday: { open: "11:00", close: "23:00", closed: false },
        saturday: { open: "11:00", close: "23:00", closed: false },
        sunday: { open: "11:00", close: "23:00", closed: false }
      },
      timeOff: [],
      staff: [],
      upi: {
        enabled: false,
        upiId: "",
        payeeName: "",
        advanceAmount: 0,
        advanceType: "fixed"
      }
    },
    ecommerce: {
      id: "ecommerce",
      name: "",
      type: "E-commerce Store",
      details: "Products: Gold-Plated Necklaces (₹1,299), Silver Rings (₹799), Bridal Sets (₹3,499). Shipping: Free all-India delivery (3-5 days). Return Policy: 7-day easy exchange/return.",
      instructions: "You are a helpful e-commerce support executive. Speak in English. Recommend jewelry to customers, explain policies, and help with placing or tracking orders.",
      adminProfile: {
        adminName: "",
        businessName: "",
        contactPhone: "",
        contactEmail: "",
        address: "",
        bio: ""
      },
      whatsapp: {
        businessNumber: "",
        autoConfirmTemplate: "Your order for {{service}} is confirmed. Order ID: {{bookingId}}. Thank you for shopping with {{businessName}}!",
        sendConfirmationLink: true
      },
      services: [],
      staff: [],
      workingHours: {
        monday: { open: "10:00", close: "20:00", closed: false },
        tuesday: { open: "10:00", close: "20:00", closed: false },
        wednesday: { open: "10:00", close: "20:00", closed: false },
        thursday: { open: "10:00", close: "20:00", closed: false },
        friday: { open: "10:00", close: "20:00", closed: false },
        saturday: { open: "10:00", close: "20:00", closed: false },
        sunday: { open: "10:00", close: "20:00", closed: true }
      },
      timeOff: [],
      staff: [],
      upi: {
        enabled: false,
        upiId: "",
        payeeName: "",
        advanceAmount: 0,
        advanceType: "fixed"
      }
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

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: 0 });
  res.json({ success: true });
});

app.get('/api/auth/me', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({ 
      user: { id: req.user.id, email: req.user.email, businessName: req.user.businessName }
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ============ BUSINESS CONFIG ROUTES ============

app.get('/api/businesses', (req, res) => {
  const db = loadDB();
  const businesses = Object.values(db.businesses).map(b => ({
    id: b.id,
    name: b.name,
    type: b.type
  }));
  res.json({ businesses });
});

app.get('/api/business/:id/config', (req, res) => {
  const db = loadDB();
  const biz = db.businesses[req.params.id];
  if (!biz) {
    return res.status(404).json({ error: 'Business not found' });
  }
  res.json(biz);
});

app.post('/api/business/:id/config', async (req, res) => {
  try {
    const db = loadDB();
    const bizId = req.params.id;
    if (!db.businesses[bizId]) {
      return res.status(404).json({ error: 'Business not found' });
    }
    const updates = req.body;
    db.businesses[bizId] = { ...db.businesses[bizId], ...updates, updatedAt: new Date().toISOString() };
    saveDB(db);
    res.json({ success: true, business: db.businesses[bizId] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API to get business config for chat (used by AI)
app.get('/api/business/:id/chat-config', (req, res) => {
  const db = loadDB();
  const biz = db.businesses[req.params.id];
  if (!biz) {
    return res.status(404).json({ error: 'Business not found' });
  }
  res.json({
    services: biz.services || [],
    staff: biz.staff || [],
    workingHours: biz.workingHours || {},
    timeOff: biz.timeOff || [],
    upi: biz.upi || { enabled: false }
  });
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
    return res.status(400).json({ error: "Name, Type, and Details are required!" });
  }
  const db = loadDB();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Math.floor(100 + Math.random() * 900);
  const newBusiness = {
    id,
    name,
    type,
    details,
    instructions: instructions || `You are a polite AI assistant for ${name}. Speak in English and ask for the customer's Name, Phone Number, and preferred Time/Details to book an appointment or place an order.`,
    adminProfile: { adminName: "", businessName: name, contactPhone: "", contactEmail: "", address: "", bio: "" },
    whatsapp: { businessNumber: "", autoConfirmTemplate: "Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!", sendConfirmationLink: true },
    services: [],
    staff: [],
    workingHours: {
      monday: { open: "10:00", close: "20:00", closed: false },
      tuesday: { open: "10:00", close: "20:00", closed: false },
      wednesday: { open: "10:00", close: "20:00", closed: false },
      thursday: { open: "10:00", close: "20:00", closed: false },
      friday: { open: "10:00", close: "20:00", closed: false },
      saturday: { open: "10:00", close: "20:00", closed: false },
      sunday: { open: "10:00", close: "20:00", closed: true }
    },
    timeOff: [],
    staff: [],
    upi: { enabled: false, upiId: "", payeeName: "", advanceAmount: 0, advanceType: "fixed" }
  };
  db.businesses[id] = newBusiness;
  saveDB(db);
  res.json({ success: true, id, business: newBusiness });
});

// ============ CHAT ROUTE WITH BUSINESS CONFIG ============

const saveRecordTool = {
  name: "save_customer_request",
  description: "Call this tool when a customer books an appointment, places a food order or table booking at a restaurant, or places a product order at a store.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      businessId: { type: Type.STRING, description: "Active business ID" },
      customerName: { type: Type.STRING, description: "Customer full name" },
      phone: { type: Type.STRING, description: "Customer mobile number" },
      requestType: { type: Type.STRING, description: "Appointment, Food Order, Table Booking, or Product Order" },
      details: { type: Type.STRING, description: "Time, date, or items details" }
    },
    required: ["businessId", "customerName", "phone", "requestType", "details"]
  }
};



function findBusinessById(businessId) {
  const db = loadDB();
  return db.businesses[businessId];
}

function generateBookingId() {
  return "REQ-" + Math.floor(1000 + Math.random() * 9000);
}

function generateUpiPaymentLink(upiId, payeeName, amount, note) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toString(),
    cu: 'INR',
    tn: note
  });
  return `upi://pay?${params.toString()}`;
}

function generateWhatsAppLink(phone, message) {
  const clean = phone.replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

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
      
      Services: ${JSON.stringify(biz.services || [])}
      Staff: ${JSON.stringify(biz.staff || [])}
      Working Hours: ${JSON.stringify(biz.workingHours || {})}
      Time Off: ${JSON.stringify(biz.timeOff || [])}
      UPI Enabled: ${biz.upi?.enabled || false}
      
      Important: When the customer provides all required details (Name, Phone, Time/Items), call the 'save_customer_request' tool to confirm the booking. Keep replies short, natural, and helpful.
      Never book on time-off dates. Never offer unavailable time slots.
      Always quote exact prices from the services list.
      If UPI is enabled and advance payment is required, inform the customer about the advance amount.
    `;

    const contents = [...history, { role: 'user', parts: [{ text: message }] }];
    const { res: response } = await callGeminiWithFallback(contents, systemPrompt, true);

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const bookingId = generateBookingId();
      const bookingData = {
        id: bookingId,
        businessId: businessId,
        businessName: biz.name,
        timestamp: new Date().toLocaleString('en-IN'),
        ...call.args
      };
      db.records.unshift(bookingData);
      saveDB(db);

      // Generate WhatsApp confirmation link if enabled
      let whatsappLink = null;
      const bizConfig = db.businesses[businessId];
      if (biz.whatsapp?.sendConfirmationLink && biz.whatsapp.businessNumber) {
        const template = biz.whatsapp.autoConfirmTemplate || "Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!";
        const msg = biz.whatsapp.autoConfirmTemplate
          .replace('{{service}}', call.args.requestType || 'Booking')
          .replace('{{date}}', new Date().toLocaleDateString('en-IN'))
          .replace('{{time}}', call.args.time || 'TBD')
          .replace('{{bookingId}}', bookingId)
          .replace('{{businessName}}', biz.name);
        const link = generateWhatsAppLink(biz.whatsapp.businessNumber, msg);
        whatsappLink = link;
      }

      // Determine initial status based on UPI advance payment
      let initialStatus = 'confirmed';
      let advanceRequired = false;
      let upiLink = null;
      if (biz.upi?.enabled && biz.upi.advanceAmount > 0) {
        initialStatus = 'pending_advance';
        advanceRequired = true;
        const amount = biz.upi.advanceType === 'percentage' 
          ? (biz.upi.advanceAmount / 100) * (call.args.price || 0)
          : biz.upi.advanceAmount;
        upiLink = generateUpiPaymentLink(biz.upi.upiId, biz.upi.payeeName, amount, `Advance for booking ${bookingId}`);
      }

      const bookingDataFull = {
        id: generateBookingId(),
        businessId: businessId,
        businessName: biz.name,
        timestamp: new Date().toLocaleString('en-IN'),
        ...call.args,
        status: initialStatus,
        advanceRequired,
        upiLink
      };
      db.records.unshift(bookingDataFull);
      saveDB(db);

      const { res: followUp } = await callGeminiWithFallback([
        ...contents,
        response.candidates[0].content,
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: call.name,
              response: { 
                status: "confirmed", 
                bookingId: bookingData.id,
                advanceRequired: advanceRequired,
                upiLink: upiLink,
                whatsappLink: whatsappLink
              }
            }
          }]
        }
      ], systemPrompt, false);

      return res.json({ reply: followUp.text, records: db.records, booking: bookingData });
    }

    res.json({ reply: response.text, records: db.records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BOOKING MANAGEMENT ROUTES ============

app.patch('/api/booking/:id', async (req, res) => {
  try {
    const { status, advanceVerified, utrReference } = req.body;
    const db = loadDB();
    const record = db.records.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Booking not found' });
    
    if (status) record.status = status;
    if (advanceVerified) {
      record.advanceVerified = true;
      record.advanceVerifiedAt = new Date().toISOString();
    }
    if (utrReference) record.utrReference = utrReference;
    if (record.advanceRequired && record.advanceVerified) {
      record.status = 'confirmed';
    }
    record.updatedAt = new Date().toISOString();
    saveDB(db);
    res.json({ success: true, booking: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/booking/:id/whatsapp', (req, res) => {
  try {
    const db = loadDB();
    const record = db.records.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Booking not found' });
    
    const biz = db.businesses[record.businessId];
    const bizConfig = db.businesses[record.businessId];
    if (!bizConfig.whatsapp?.businessNumber) {
      return res.status(400).json({ error: 'WhatsApp not configured for this business' });
    }
    
    const template = bizConfig.whatsapp?.autoConfirmTemplate || "Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!";
    const msg = bizConfig.whatsapp.autoConfirmTemplate
      .replace('{{service}}', record.requestType || 'Booking')
      .replace('{{date}}', new Date().toLocaleDateString('en-IN'))
      .replace('{{time}}', record.time || 'TBD')
      .replace('{{bookingId}}', record.id)
      .replace('{{businessName}}', biz.name);
    
    const link = generateWhatsAppLink(bizConfig.whatsapp.businessNumber, msg);
    res.json({ success: true, whatsappLink: link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPI payment verification
app.post('/api/booking/:id/upi/verify', async (req, res) => {
  try {
    const { utrReference } = req.body;
    const db = loadDB();
    const record = db.records.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Booking not found' });
    if (!record.advanceRequired) return res.status(400).json({ error: 'Advance payment not required for this booking' });
    
    record.utrReference = utrReference;
    record.advanceVerified = true;
    record.advanceVerifiedAt = new Date().toISOString();
    record.status = 'confirmed';
    record.updatedAt = new Date().toISOString();
    saveDB(db);
    
    res.json({ success: true, booking: record });
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

// ============ DASHBOARD GENERATOR ============

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
    .badge.pending_advance { background: rgba(249,115,22,.2); color: #fb923c; }

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
    .bk-act-btn.upi { background: #7c3aed; color: #fff; }
    .bk-act-btn.verify { background: #16a34a; color: #fff; }

    /* Admin Setup Center */
    .setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .setup-grid.full { grid-column: 1 / -1; }
    .tab-buttons { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab-btn { padding: 8px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: 13px; font-weight: 600; }
    .tab-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .form-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .form-row > * { flex: 1; min-width: 200px; }
    .service-row, .staff-row, .timeoff-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; padding: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; }
    .service-row > *, .staff-row > *, .timeoff-row > * { flex: 1; min-width: 120px; }
    .service-row input, .staff-row input, .timeoff-row input { margin-top: 0 !important; width: auto; flex: 1; }
    .timeoff-row input[type="date"] { width: 160px; }
    .remove-btn { background: #dc2626; color: #fff; border: none; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; }

    /* UPI Section */
    .upi-section { background: #0f172a; padding: 16px; border-radius: 10px; border: 1px solid #334155; margin-top: 12px; }
    .upi-link { display: inline-block; margin-top: 8px; padding: 8px 16px; background: #7c3aed; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }

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
          <input id="msgInput" placeholder="Type your message here..." style="margin-top:0;" onkeypress="if(event.key==='Enter') sendMsg()">
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
            <button type="button" class="bk-filter" data-status="pending_advance" onclick="setBookingFilter('pending_advance')">Pending Advance</button>
          </div>
        </div>
        <div id="recordsBox" style="max-height: 420px; overflow-y: auto;"></div>
      </div>
    </div>

    <!-- 4. ADMIN SETUP CENTER (Enhanced) -->
    <button type="button" class="accordion-btn" aria-expanded="false" aria-controls="acc-admin-setup" data-target="acc-admin-setup">
      <span>⚙️ Admin Setup Center</span>
      <span class="accordion-icon">▼</span>
    </button>
    <div id="acc-admin-setup" class="accordion-content">
      <div class="card">
        <h3 class="card-title">Admin Setup Center</h3>
        
        <!-- Business Selector -->
        <div style="margin-bottom: 16px;">
          <label style="font-weight: 600; margin-bottom: 8px; display: block;">Select Business to Configure:</label>
          <select id="configBizSelect" onchange="loadBusinessConfig()" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px;"></select>
        </div>

        <div class="tab-buttons" id="configTabs">
          <button type="button" class="tab-btn active" data-tab="profile">👤 Profile</button>
          <button type="button" class="tab-btn" data-tab="whatsapp">💬 WhatsApp</button>
          <button type="button" class="tab-btn" data-tab="services">🛠 Services & Pricing</button>
          <button type="button" class="tab-btn" data-tab="staff">👥 Staff</button>
          <button type="button" class="tab-btn" data-tab="hours">🕐 Hours & Time Off</button>
          <button type="button" class="tab-btn" data-tab="upi">💳 UPI & Advance</button>
        </div>

        <!-- Profile Tab -->
        <div id="tab-profile" class="tab-panel active">
          <div class="card">
            <h3 class="card-title">Admin & Business Profile</h3>
            <div class="setup-grid">
              <div>
                <label>Admin Name</label>
                <input id="cfgAdminName" placeholder="Your name">
              </div>
              <div>
                <label>Business Name</label>
                <input id="cfgBusinessName" placeholder="Business name">
              </div>
              <div>
                <label>Contact Phone</label>
                <input id="cfgContactPhone" placeholder="+91 98765 43210" type="tel">
              </div>
              <div>
                <label>Contact Email</label>
                <input id="cfgContactEmail" placeholder="contact@business.com" type="email">
              </div>
              <div class="setup-grid full">
                <label>Address</label>
                <textarea id="cfgAddress" rows="2" placeholder="Full business address"></textarea>
              </div>
              <div class="setup-grid full">
                <label>Business Bio / Tagline</label>
                <textarea id="cfgBio" rows="2" placeholder="Short description for customers"></textarea>
              </div>
            </div>
          </div>

          <!-- WhatsApp Tab -->
          <div id="tab-whatsapp" class="tab-panel">
            <div class="card">
              <h3 class="card-title">WhatsApp Settings</h3>
              <div class="setup-grid">
                <div>
                  <label>Business WhatsApp Number (with country code)</label>
                  <input id="cfgWaNumber" placeholder="919876543210" type="tel">
                </div>
                <div>
                  <label>
                    <input type="checkbox" id="cfgWaAutoConfirm" checked>
                    Send WhatsApp Booking Confirmation Link
                  </label>
                </div>
              </div>
              <div class="setup-grid full">
                <label>Auto-Confirm Message Template</label>
                <textarea id="cfgWaTemplate" rows="3" placeholder="Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!"></textarea>
                <p class="muted" style="font-size: 11px; margin-top: 4px;">Available variables: {{service}}, {{date}}, {{time}}, {{bookingId}}, {{businessName}}, {{customerName}}</p>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
                <button class="primary" onclick="saveBusinessConfig('whatsapp')">Save WhatsApp Settings</button>
              </div>
            </div>
          </div>

          <!-- Services & Pricing Tab -->
          <div id="tab-services" class="tab-panel">
            <div class="card">
              <h3 class="card-title">Services & Pricing</h3>
              <p class="muted" style="margin-bottom: 12px;">Add, edit, or remove services. These will be used by the AI for booking and pricing.</p>
              <div id="servicesList"></div>
              <div class="service-row" style="background: transparent; border: none; padding: 0; margin-top: 12px;">
                <input type="text" id="newServiceName" placeholder="Service Name (e.g., Haircut)" style="flex: 2;">
                <input type="number" id="newServicePrice" placeholder="Price (₹)" style="flex: 1; width: 100px;" min="0">
                <input type="number" id="newServiceDuration" placeholder="Duration (mins)" style="flex: 1; width: 100px;" min="5">
                <button type="button" class="primary" onclick="addService()" style="width: auto; height: 40px;">+ Add Service</button>
              </div>
              <div id="servicesList"></div>
            </div>
          </div>

          <!-- Staff Tab -->
          <div id="tab-staff" class="tab-panel">
            <div class="card">
              <h3 class="card-title">Staff / Employees</h3>
              <p class="muted" style="margin-bottom: 12px;">Add staff members who can handle bookings.</p>
              <div class="staff-row" style="background: transparent; border: none; padding: 0; margin-top: 12px;">
                <input type="text" id="newStaffName" placeholder="Staff Name" style="flex: 2;">
                <input type="text" id="newStaffRole" placeholder="Role / Specialty (e.g., Senior Stylist)" style="flex: 2;">
                <select id="newStaffStatus" style="width: 120px;">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <button type="button" class="primary" onclick="addStaff()" style="width: auto; height: 40px;">+ Add Staff</button>
              </div>
              <div id="staffList"></div>
            </div>
          </div>

          <!-- Hours & Time Off Tab -->
          <div id="tab-hours" class="tab-panel">
            <div class="card">
              <h3 class="card-title">Working Hours & Time Off</h3>
              
              <div style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 12px; color: #cbd5e1;">Weekly Working Hours</h4>
                <div id="workingHoursGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;"></div>
              </div>

              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155;">
                <h4 style="margin-bottom: 12px; color: #cbd5e1;">Time Off / Blocked Dates</h4>
                <p class="muted" style="margin-bottom: 12px;">Add holidays, staff leave, or maintenance days when no bookings are accepted.</p>
                <div class="timeoff-row" style="background: transparent; border: none; padding: 0; margin-top: 8px;">
                  <input type="date" id="newTimeOffStart" style="flex: 1;">
                  <input type="date" id="newTimeOffEnd" style="flex: 1;">
                  <input type="text" id="newTimeOffReason" placeholder="Reason (e.g., Holiday, Staff Leave)" style="flex: 2;">
                  <button type="button" class="primary" onclick="addTimeOff()" style="width: auto; height: 40px;">+ Add Time Off</button>
                </div>
                <div id="timeOffList"></div>
              </div>
            </div>
          </div>

          <!-- UPI & Advance Tab -->
          <div id="tab-upi" class="tab-panel">
            <div class="card">
              <h3 class="card-title">UPI Payment & Advance Booking Lock</h3>
              
              <div class="setup-grid">
                <div>
                  <label>
                    <input type="checkbox" id="cfgUpiEnabled" onchange="toggleUpiFields()">
                    Require Advance Payment to Lock Booking
                  </label>
                </div>
              </div>

              <div id="upiFields" class="upi-section" style="display: none;">
                <div class="setup-grid">
                  <div>
                    <label>Business UPI ID</label>
                    <input id="cfgUpiId" placeholder="yourbusiness@upi">
                  </div>
                  <div>
                    <label>Payee Name</label>
                    <input id="cfgUpiPayee" placeholder="Business Name">
                  </div>
                  <div>
                    <label>Advance Amount</label>
                    <input type="number" id="cfgUpiAmount" placeholder="500" min="0" step="10">
                  </div>
                  <div>
                    <label>Advance Type</label>
                    <select id="cfgUpiType">
                      <option value="fixed">Fixed Amount (₹)</option>
                      <option value="percentage">Percentage of Service Price (%)</option>
                    </select>
                  </div>
                  <div class="setup-grid full">
                    <label>Payee Name (for UPI)</label>
                    <input id="cfgUpiPayeeName" placeholder="Business Name for UPI">
                  </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
                  <button class="primary" onclick="saveBusinessConfig('upi')">Save UPI Settings</button>
                </div>

                <div class="upi-section" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155;">
                  <h4 style="margin-bottom: 12px;">Test UPI Payment Link</h4>
                  <div class="setup-grid">
                    <div>
                      <label>Test Amount (₹)</label>
                      <input type="number" id="testUpiAmount" value="500" min="1">
                    </div>
                    <div>
                      <label>Test Note</label>
                      <input id="testUpiNote" placeholder="Advance for booking #123">
                    </div>
                  </div>
                  <button type="button" class="ghost" onclick="generateTestUpiLink()" style="margin-top: 8px;">Generate Test UPI Link</button>
                  <div id="testUpiResult" class="upi-section" style="margin-top: 12px; display: none;">
                    <strong>UPI Link:</strong>
                    <div style="margin-top: 8px; word-break: break-all;">
                      <code id="upiLinkDisplay" style="background: #0f172a; padding: 8px; border-radius: 6px; display: block; font-size: 12px;"></code>
                    </div>
                    <button type="button" class="ghost" onclick="copyUpiLink()" style="margin-top: 8px; width: auto;">Copy Link</button>
                    <a id="upiLinkAnchor" class="upi-link" href="#" target="_blank" style="display: none;">Open in UPI App</a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <button class="primary" onclick="saveAllBusinessConfig()">💾 Save All Configuration</button>
            <button class="ghost" onclick="loadBusinessConfig()">🔄 Reload</button>
            <span id="configStatus" style="font-size:12px;color:#34d399;font-weight:600;align-self:center;margin-top:4px;"></span>
          </div>
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
        <h3 class="card-title">Create New Business AI Agent</h3>
        <p class="muted">Enter your business details below to instantly train your AI booking assistant:</p>

        <label>Business Name <span class="muted">(e.g., Royal Men's Salon / FitZone Gym)</span></label>
        <input id="bName" placeholder="Enter business name...">

        <label>Category / Type <span class="muted">(e.g., Salon, Gym, Coaching, Real Estate)</span></label>
        <input id="bType" placeholder="Enter business category...">

        <label>Services, Pricing, Timings & Address</label>
        <textarea id="bDetails" rows="4" placeholder="e.g., Haircut ₹150, Beard ₹100, Facial ₹500. Timings: 9 AM - 9 PM. Location: Sector 4, Udaipur."></textarea>

        <label>AI Behavior / Custom Rules <span class="muted">(Optional)</span></label>
        <textarea id="bInst" rows="2" placeholder="e.g., Use a polite tone, confirm the service and time slot before saving the booking."></textarea>

        <button class="primary" onclick="addBusiness()" style="margin-top: 16px;">Save & Launch AI Agent</button>
        <p id="adminMsg" style="font-size: 13px; color: #10b981; margin-top: 10px;"></p>
      </div>
    </div>

  </div>

  <script>
    let history = [];
    let allBusinesses = {};
    let currentBookingFilter = 'all';
    let currentConfigBizId = null;

    function toggleAccordion(panelId, btn) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
      panel.style.display = isOpen ? 'block' : 'none';
    }

    document.body.addEventListener('click', function(e) {
      const btn = e.target.closest('.accordion-btn[data-target]');
      if (btn) {
        const targetId = btn.getAttribute('data-target');
        const panel = document.getElementById(targetId);
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        panel.style.display = isOpen ? 'block' : 'none';
      }
    });

    // Tab switching for Admin Setup Center
    document.addEventListener('click', function(e) {
      const tabBtn = e.target.closest('.tab-btn[data-tab]');
      if (tabBtn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        document.getElementById('tab-' + tabBtn.dataset.tab).classList.add('active');
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

    let history = [];
    let allBusinesses = {};
    let currentBookingFilter = 'all';
    let currentConfigBizId = null;

    function populateDropdown(businesses, selectId) {
      allBusinesses = businesses;
      const sel = document.getElementById(selectId || 'bizSelect');
      const currentVal = sel.value;
      sel.innerHTML = Object.entries(businesses).map(([id, b]) =>
        '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
      ).join('');
      if (currentVal && businesses[currentVal]) sel.value = currentVal;

      // Also populate config business selector
      const configSel = document.getElementById('configBizSelect');
      if (configSel) {
        configSel.innerHTML = Object.entries(businesses).map(([id, b]) =>
          '<option value="' + id + '">' + b.name + ' (' + b.type + ')</option>'
        ).join('');
        if (currentConfigBizId && businesses[currentConfigBizId]) configSel.value = currentConfigBizId;
        else if (businesses[configSel.value]) configSel.value = configSel.value;
      }
      
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
      document.getElementById('chatBox').innerHTML = '<div class="msg bot">Welcome! <b>' + bName + '</b> How can I help you today?</div>';
    }

    async function init() {
      const res = await fetch('/api/data');
      const data = await res.json();
      populateDropdown(data.businesses);
      renderRecords(data.records);
      resetChat();
      loadStats();
      loadAdminSetup();
      loadBusinessConfig();
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
        if (data.booking) {
          renderRecords([data.booking, ...(window.__lastRecords || [])]);
        } else if (data.records) {
          renderRecords(data.records);
        }
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
        box.innerHTML = '<p class="muted" style="padding:12px;">No bookings found.</p>';
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

        let actionButtons = '';
        if (status === 'pending_advance') {
          actionButtons += '<button type="button" class="bk-act-btn upi" onclick="showUpiPayment(\\'' + id + '\\')">💳 UPI Payment</button>';
          actionButtons += '<button type="button" class="bk-act-btn verify" onclick="verifyAdvancePayment(\\'' + id + '\\')">✅ Verify Payment</button>';
        } else {
          actionButtons += '<button type="button" class="bk-act-btn confirm" onclick="updateBookingStatus(\\'' + id + '\\',\\'confirmed\\')">Confirm</button>';
          actionButtons += '<button type="button" class="bk-act-btn complete" onclick="updateBookingStatus(\\'' + id + '\\',\\'completed\\')">Complete</button>';
          actionButtons += '<button type="button" class="bk-act-btn cancel" onclick="updateBookingStatus(\\'' + id + '\\',\\'cancelled\\')">Cancel</button>';
        }
        actionButtons += '<button type="button" class="bk-act-btn whatsapp" onclick="openWhatsApp(\\'' + phone + '\\',\\'' + id + '\\',\\'' + biz + '\\',\\'' + type + '\\',\\'' + details + '\\')">💬 WhatsApp</button>';
        actionButtons += '<button type="button" class="bk-act-btn receipt" onclick="openReceipt(\\'' + id + '\\',\\'' + biz + '\\',\\'' + name + '\\',\\'' + phone + '\\',\\'' + type + '\\',\\'' + details + '\\')">🧾 Receipt</button>';

        html += '<div class="record" style="display:flex;flex-direction:column;gap:6px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<strong>[' + id + '] ' + biz + '</strong>' +
            '<span class="badge ' + status + '">' + status + '</span>' +
          '</div>' +
          '<div style="font-size:13px;">Customer: ' + name + ' (' + phone + ')</div>' +
          '<div style="font-size:13px;">' + type + ': ' + details + '</div>' +
          '<div class="muted" style="font-size:11px;">' + ts + '</div>' +
          '<div class="bk-actions">' + actionButtons + '</div>' +
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
        await fetch('/api/booking/' + id, {
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

    async function updateBookingStatus(id, status) {
      if (status === 'cancelled' && !confirm('Cancel this booking?')) return;
      try {
        await fetch('/api/booking/' + id, {
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
      panel.style.display = isOpen ? 'block' : 'none';
    }

    document.body.addEventListener('click', function(e) {
      const btn = e.target.closest('.accordion-btn[data-target]');
      if (btn) {
        const targetId = btn.getAttribute('data-target');
        const panel = document.getElementById(targetId);
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        panel.style.display = isOpen ? 'block' : 'none';
      }
    });

    // Tab switching for Admin Setup Center
    document.addEventListener('click', function(e) {
      const tabBtn = e.target.closest('.tab-btn[data-tab]');
      if (tabBtn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        document.getElementById('tab-' + tabBtn.dataset.tab).classList.add('active');
      }
    });

    // Business Config Selector
    function loadBusinessConfig() {
      const select = document.getElementById('configBizSelect');
      const bizId = select.value;
      if (!bizId) return;
      currentConfigBizId = bizId;
      fetch('/api/business/' + bizId + '/config')
        .then(r => r.json())
        .then(biz => {
          // Profile tab
          document.getElementById('cfgAdminName').value = biz.adminProfile?.adminName || '';
          document.getElementById('cfgBusinessName').value = biz.adminProfile?.businessName || biz.name || '';
          document.getElementById('cfgContactPhone').value = biz.adminProfile?.contactPhone || '';
          document.getElementById('cfgContactEmail').value = biz.adminProfile?.contactEmail || '';
          document.getElementById('cfgAddress').value = biz.adminProfile?.address || '';
          document.getElementById('cfgBio').value = biz.adminProfile?.bio || '';

          // WhatsApp
          document.getElementById('cfgWaNumber').value = biz.whatsapp?.businessNumber || '';
          document.getElementById('cfgWaAutoConfirm').checked = biz.whatsapp?.sendConfirmationLink !== false;
          document.getElementById('cfgWaTemplate').value = biz.whatsapp?.autoConfirmTemplate || 'Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!';

          // Services
          renderServices(biz.services || []);
          
          // Staff
          renderStaff(biz.staff || []);
          
          // Working Hours
          renderWorkingHours(biz.workingHours || {});
          
          // Time Off
          renderTimeOff(biz.timeOff || []);
          
          // UPI
          document.getElementById('cfgUpiEnabled').checked = biz.upi?.enabled || false;
          toggleUpiFields();
          document.getElementById('cfgUpiId').value = biz.upi?.upiId || '';
          document.getElementById('cfgUpiPayee').value = biz.upi?.payeeName || '';
          document.getElementById('cfgUpiAmount').value = biz.upi?.advanceAmount || 0;
          document.getElementById('cfgUpiType').value = biz.upi?.advanceType || 'fixed';
          document.getElementById('cfgUpiPayeeName').value = biz.upi?.payeeName || '';
          
          currentConfigBizId = bizId;
        })
        .catch(e => console.error('Failed to load business config:', e));
    }

    function saveBusinessConfig(section) {
      if (!currentConfigBizId) return alert('Select a business first');
      const bizId = currentConfigBizId;
      
      let updates = {};
      if (section === 'profile' || section === 'all') {
        updates.adminProfile = {
          adminName: document.getElementById('cfgAdminName').value.trim(),
          businessName: document.getElementById('cfgBusinessName').value.trim(),
          contactPhone: document.getElementById('cfgContactPhone').value.trim(),
          contactEmail: document.getElementById('cfgContactEmail').value.trim(),
          address: document.getElementById('cfgAddress').value.trim(),
          bio: document.getElementById('cfgBio').value.trim()
        };
      }
      if (section === 'whatsapp' || section === 'all') {
        updates.whatsapp = {
          businessNumber: document.getElementById('cfgWaNumber').value.trim(),
          sendConfirmationLink: document.getElementById('cfgWaAutoConfirm').checked,
          autoConfirmTemplate: document.getElementById('cfgWaTemplate').value.trim()
        };
      }
      if (section === 'upi' || section === 'all') {
        updates.upi = {
          enabled: document.getElementById('cfgUpiEnabled').checked,
          upiId: document.getElementById('cfgUpiId').value.trim(),
          payeeName: document.getElementById('cfgUpiPayee').value.trim(),
          advanceAmount: parseFloat(document.getElementById('cfgUpiAmount').value) || 0,
          advanceType: document.getElementById('cfgUpiType').value,
          payeeName: document.getElementById('cfgUpiPayeeName').value.trim()
        };
      }

      fetch('/api/business/' + currentConfigBizId + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) showConfigStatus('Saved successfully!');
        else alert('Error: ' + d.error);
      })
      .catch(e => alert('Error: ' + e.message));
    }

    function saveAllBusinessConfig() {
      saveBusinessConfig('all');
    }

    function showConfigStatus(msg) {
      const el = document.getElementById('configStatus');
      el.textContent = msg;
      setTimeout(() => el.textContent = '', 2000);
    }

    function toggleUpiFields() {
      const enabled = document.getElementById('cfgUpiEnabled').checked;
      document.getElementById('upiFields').style.display = enabled ? 'block' : 'none';
    }

    function generateTestUpiLink() {
      const upiId = document.getElementById('cfgUpiId').value;
      const payee = document.getElementById('cfgUpiPayee').value;
      const amount = document.getElementById('testUpiAmount').value;
      const note = document.getElementById('testUpiNote').value;
      if (!upiId) return alert('Enter UPI ID first');
      const link = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(payee) + '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent(note);
      document.getElementById('upiLinkDisplay').textContent = link;
      document.getElementById('testUpiResult').style.display = 'block';
      document.getElementById('upiLinkAnchor').href = link;
      document.getElementById('upiLinkAnchor').style.display = 'inline-block';
    }

    function copyUpiLink() {
      const link = document.getElementById('upiLinkDisplay').textContent;
      navigator.clipboard.writeText(link).then(() => alert('UPI Link copied!'));
    }

    function toggleUpiFields() {
      const enabled = document.getElementById('cfgUpiEnabled').checked;
      document.getElementById('upiFields').style.display = enabled ? 'block' : 'none';
    }

    // Services
    function renderServices(services) {
      const list = document.getElementById('servicesList');
      list.innerHTML = (services || []).map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      
      fetch('/api/business/' + currentConfigBizId + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [{ name, price, duration }] })
      }).then(r => r.json()).then(d => {
        if (d.success) {
          document.getElementById('newServiceName').value = '';
          document.getElementById('newServicePrice').value = '';
          document.getElementById('newServiceDuration').value = '';
          loadBusinessConfig();
        } else alert('Error: ' + d.error);
      });
    }

    function updateService(idx, el) {
      // For simplicity, reload on change - in production, use debounced save
      loadBusinessConfig();
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      // In a real implementation, this would call an API to remove the service
      loadBusinessConfig();
    }

    // Staff
    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      loadBusinessConfig();
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      loadBusinessConfig();
    }

    // Working Hours
    function renderWorkingHours(hours) {
      const grid = document.getElementById('workingHoursGrid');
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      grid.innerHTML = days.map(day => {
        const h = hours[day] || { open: '10:00', close: '20:00', closed: day === 'sunday' };
        return '<div style="background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155;">' +
          '<label style="font-weight: 600; text-transform: capitalize; display: block; margin-bottom: 8px;">' + day + '</label>' +
          '<label><input type="checkbox" ' + (h.closed ? 'checked' : '') + ' onchange="updateHours(\\'' + day + '\\', this)"> Closed</label>' +
          '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
            '<div style="flex: 1;"><label>Open</label><input type="time" value="' + h.open + '" onchange="updateHoursTime(\\'' + day + '\\', \\'open\\', this)"></div>' +
            '<div style="flex: 1;"><label>Close</label><input type="time" value="' + h.close + '" onchange="updateHoursTime(\\'' + day + '\\', \\'close\\', this)"></div>' +
          '</div></div>';
      }).join('');
    }

    function updateHours(day, checkbox) {
      // In a real implementation, this would save to the database
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would save to the database
    }

    // Time Off
    function renderTimeOff(timeOff) {
      const list = document.getElementById('timeOffList');
      list.innerHTML = (timeOff || []).map((t, i) => 
        '<div class="timeoff-row">' +
          '<strong>' + (t.reason || 'Time Off') + '</strong>: ' + (t.start || '') + ' to ' + (t.end || '') +
          '<button type="button" class="remove-btn" onclick="removeTimeOff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      // In a real implementation, this would save to the database
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      loadBusinessConfig();
    }

    function generateTestUpiLink() {
      const upiId = document.getElementById('cfgUpiId').value;
      const payee = document.getElementById('cfgUpiPayeeName').value || document.getElementById('cfgUpiPayee').value;
      const amount = document.getElementById('testUpiAmount').value;
      const note = document.getElementById('testUpiNote').value;
      if (!upiId) return alert('Enter UPI ID first');
      const link = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(payee) + '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent(note);
      document.getElementById('upiLinkDisplay').textContent = link;
      document.getElementById('testUpiResult').style.display = 'block';
      document.getElementById('upiLinkAnchor').href = link;
      document.getElementById('upiLinkAnchor').style.display = 'inline-block';
    }

    function copyUpiLink() {
      const link = document.getElementById('upiLinkDisplay').textContent;
      navigator.clipboard.writeText(link).then(() => alert('UPI Link copied!'));
    }

    function toggleUpiFields() {
      const enabled = document.getElementById('cfgUpiEnabled').checked;
      document.getElementById('upiFields').style.display = enabled ? 'block' : 'none';
    }

    // WhatsApp for bookings
    function openWhatsApp(phone, id, biz, type, details) {
      const clean = phone.replace(/\\D/g, '');
      const msg = encodeURIComponent('Booking ' + id + ' at ' + biz + ': ' + type + ' - ' + details);
      window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
    }

    function showUpiPayment(bookingId) {
      const record = window.__lastRecords?.find(r => r.id === bookingId);
      if (!record) return alert('Booking not found');
      const db = JSON.parse(localStorage.getItem('database') || '{}');
      const biz = db.businesses?.[record.businessId];
      if (!biz?.upi?.enabled) return alert('UPI not configured for this business');
      const upiId = biz.upi.upiId;
      const payee = biz.upi.payeeName;
      const amount = biz.upi.advanceType === 'percentage' 
        ? (biz.upi.advanceAmount / 100) * (record.price || 0)
        : biz.upi.advanceAmount;
      const link = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(payee) + '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent('Advance for booking ' + bookingId);
      window.open(link, '_blank');
    }

    function verifyAdvancePayment(bookingId) {
      const utr = prompt('Enter UTR Reference Number:');
      if (!utr) return;
      fetch('/api/booking/' + bookingId + '/upi/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utrReference: utr })
      }).then(r => r.json()).then(d => {
        if (d.success) {
          alert('Payment verified! Booking confirmed.');
          loadBusinessConfig(); // reload to refresh
        } else alert('Error: ' + d.error);
      });
    }

    function showUpiPayment(bookingId) {
      const record = window.__lastRecords?.find(r => r.id === bookingId);
      if (!record) return alert('Booking not found');
      // This would open a modal or redirect to UPI payment
      alert('UPI payment link would open here for booking ' + bookingId);
    }

    async function verifyAdvancePayment(id) {
      const utr = prompt('Enter UTR Reference Number:');
      if (!utr) return;
      try {
        const res = await fetch('/api/booking/' + id + '/upi/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ utrReference: utr })
        });
        const data = await res.json();
        if (data.success) {
          alert('Payment verified! Booking confirmed.');
          loadBusinessConfig();
        } else alert('Error: ' + data.error);
      } catch (e) { alert('Error: ' + e.message); }
    }

    // Open WhatsApp with booking confirmation
    function openWhatsApp(phone, id, biz, type, details) {
      const clean = phone.replace(/\\D/g, '');
      const msg = encodeURIComponent('Booking ' + id + ' at ' + biz + ': ' + type + ' - ' + details);
      window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
    }

    async function loadBusinessConfig() {
      const select = document.getElementById('configBizSelect');
      const bizId = select.value;
      if (!bizId) return;
      try {
        const res = await fetch('/api/business/' + bizId + '/config');
        const biz = await res.json();
        
        // Profile tab
        document.getElementById('cfgAdminName').value = biz.adminProfile?.adminName || '';
        document.getElementById('cfgBusinessName').value = biz.adminProfile?.businessName || biz.name || '';
        document.getElementById('cfgContactPhone').value = biz.adminProfile?.contactPhone || '';
        document.getElementById('cfgContactEmail').value = biz.adminProfile?.contactEmail || '';
        document.getElementById('cfgAddress').value = biz.adminProfile?.address || '';
        document.getElementById('cfgBio').value = biz.adminProfile?.bio || '';

        // WhatsApp
        document.getElementById('cfgWaNumber').value = biz.whatsapp?.businessNumber || '';
        document.getElementById('cfgWaAutoConfirm').checked = biz.whatsapp?.sendConfirmationLink !== false;
        document.getElementById('cfgWaTemplate').value = biz.whatsapp?.autoConfirmTemplate || 'Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!';

        // Services
        renderServices(biz.services || []);
        
        // Staff
        renderStaff(biz.staff || []);
        
        // Working Hours
        renderWorkingHours(biz.workingHours || {});
        
        // Time Off
        renderTimeOff(biz.timeOff || []);
        
        // UPI
        document.getElementById('cfgUpiEnabled').checked = biz.upi?.enabled || false;
        toggleUpiFields();
        document.getElementById('cfgUpiId').value = biz.upi?.upiId || '';
        document.getElementById('cfgUpiPayee').value = biz.upi?.payeeName || '';
        document.getElementById('cfgUpiAmount').value = biz.upi?.advanceAmount || 0;
        document.getElementById('cfgUpiType').value = biz.upi?.advanceType || 'fixed';
        document.getElementById('cfgUpiPayeeName').value = biz.upi?.payeeName || '';
        
        currentConfigBizId = select.value;
      } catch (e) { console.error('Failed to load business config:', e); }
    }

    function renderServices(services) {
      const list = document.getElementById('servicesList');
      list.innerHTML = (services || []).map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function renderWorkingHours(hours) {
      const grid = document.getElementById('workingHoursGrid');
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      grid.innerHTML = days.map(day => {
        const h = hours[day] || { open: '10:00', close: '20:00', closed: day === 'sunday' };
        return '<div style="background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155;">' +
          '<label style="font-weight: 600; text-transform: capitalize; display: block; margin-bottom: 8px;">' + day + '</label>' +
          '<label><input type="checkbox" ' + (h.closed ? 'checked' : '') + ' onchange="updateHours(\\'' + day + '\\', this)"> Closed</label>' +
          '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
            '<div style="flex: 1;"><label>Open</label><input type="time" value="' + h.open + '" onchange="updateHoursTime(\\'' + day + '\\', \\'open\\', this)"></div>' +
            '<div style="flex: 1;"><label>Close</label><input type="time" value="' + h.close + '" onchange="updateHoursTime(\\'' + day + '\\', \\'close\\', this)"></div>' +
          '</div></div>';
      }).join('');
    }

    function updateHours(day, checkbox) {
      if (currentConfigBizId) {
        // In a real implementation, this would call an API
      }
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would call an API
    }

    function renderTimeOff(timeOff) {
      const list = document.getElementById('timeOffList');
      list.innerHTML = (timeOff || []).map((t, i) => 
        '<div class="timeoff-row">' +
          '<strong>' + (t.reason || 'Time Off') + '</strong>: ' + (t.start || '') + ' to ' + (t.end || '') +
          '<button type="button" class="remove-btn" onclick="removeTimeOff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function renderTimeOff(timeOff) {
      const list = document.getElementById('timeOffList');
      list.innerHTML = (timeOff || []).map((t, i) => 
        '<div class="timeoff-row">' +
          '<strong>' + (t.reason || 'Time Off') + '</strong>: ' + (t.start || '') + ' to ' + (t.end || '') +
          '<button type="button" class="remove-btn" onclick="removeTimeOff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateHours(day, checkbox) {
      // In a real implementation, this would call an API
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would call an API
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function updateHours(day, checkbox) {
      // In a real implementation, this would call an API
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would call an API
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    // Config saving
    function saveBusinessConfig(section) {
      if (!currentConfigBizId) return alert('Select a business first');
      const bizId = currentConfigBizId;
      
      let updates = {};
      if (section === 'profile' || section === 'all') {
        updates.adminProfile = {
          adminName: document.getElementById('cfgAdminName').value.trim(),
          businessName: document.getElementById('cfgBusinessName').value.trim(),
          contactPhone: document.getElementById('cfgContactPhone').value.trim(),
          contactEmail: document.getElementById('cfgContactEmail').value.trim(),
          address: document.getElementById('cfgAddress').value.trim(),
          bio: document.getElementById('cfgBio').value.trim()
        };
      }
      if (section === 'whatsapp' || section === 'all') {
        updates.whatsapp = {
          businessNumber: document.getElementById('cfgWaNumber').value.trim(),
          sendConfirmationLink: document.getElementById('cfgWaAutoConfirm').checked,
          autoConfirmTemplate: document.getElementById('cfgWaTemplate').value.trim()
        };
      }
      if (section === 'upi' || section === 'all') {
        updates.upi = {
          enabled: document.getElementById('cfgUpiEnabled').checked,
          upiId: document.getElementById('cfgUpiId').value.trim(),
          payeeName: document.getElementById('cfgUpiPayee').value.trim(),
          advanceAmount: parseFloat(document.getElementById('cfgUpiAmount').value) || 0,
          advanceType: document.getElementById('cfgUpiType').value,
          payeeName: document.getElementById('cfgUpiPayeeName').value.trim()
        };
      }
      if (section === 'services' || section === 'all') {
        // Services are saved individually via add/remove
      }
      if (section === 'staff' || section === 'all') {
        // Staff saved individually
      }
      if (section === 'hours' || section === 'all') {
        // Hours saved individually
      }
      if (section === 'timeoff' || section === 'all') {
        // Time off saved individually
      }

      const payload = { ...updates };
      fetch('/api/business/' + currentConfigBizId + '/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) showConfigStatus('Saved successfully!');
        else alert('Error: ' + d.error);
      })
      .catch(e => alert('Error: ' + e.message));
    }

    function saveAllBusinessConfig() {
      saveBusinessConfig('all');
    }

    function showConfigStatus(msg) {
      const el = document.getElementById('configStatus');
      el.textContent = msg;
      setTimeout(() => el.textContent = '', 2000);
    }

    function toggleUpiFields() {
      const enabled = document.getElementById('cfgUpiEnabled').checked;
      document.getElementById('upiFields').style.display = enabled ? 'block' : 'none';
    }

    function generateTestUpiLink() {
      const upiId = document.getElementById('cfgUpiId').value;
      const payee = document.getElementById('cfgUpiPayee').value;
      const amount = document.getElementById('testUpiAmount').value;
      const note = document.getElementById('testUpiNote').value;
      if (!upiId) return alert('Enter UPI ID first');
      const link = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(payee) + '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent(note);
      document.getElementById('upiLinkDisplay').textContent = link;
      document.getElementById('testUpiResult').style.display = 'block';
      document.getElementById('upiLinkAnchor').href = link;
      document.getElementById('upiLinkAnchor').style.display = 'inline-block';
    }

    function copyUpiLink() {
      const link = document.getElementById('upiLinkDisplay').textContent;
      navigator.clipboard.writeText(link).then(() => alert('UPI Link copied!'));
    }

    function toggleUpiFields() {
      const enabled = document.getElementById('cfgUpiEnabled').checked;
      document.getElementById('upiFields').style.display = enabled ? 'block' : 'none';
    }

    function showUpiPayment(bookingId) {
      const record = window.__lastRecords?.find(r => r.id === bookingId);
      if (!record) return alert('Booking not found');
      const db = JSON.parse(localStorage.getItem('database') || '{}');
      const biz = db.businesses?.[record.businessId];
      if (!biz?.upi?.enabled) return alert('UPI not configured for this business');
      const upiId = biz.upi.upiId;
      const payee = biz.upi.payeeName;
      const amount = biz.upi.advanceType === 'percentage' 
        ? (biz.upi.advanceAmount / 100) * (record.price || 0)
        : biz.upi.advanceAmount;
      const link = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(payee) + '&am=' + amount + '&cu=INR&tn=' + encodeURIComponent('Advance for booking ' + bookingId);
      window.open(link, '_blank');
    }

    function verifyAdvancePayment(bookingId) {
      const utr = prompt('Enter UTR Reference Number:');
      if (!utr) return;
      fetch('/api/booking/' + bookingId + '/upi/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utrReference: utr })
      }).then(r => r.json()).then(d => {
        if (d.success) {
          alert('Payment verified! Booking confirmed.');
          loadBusinessConfig();
        } else alert('Error: ' + d.error);
      });
    }

    function openWhatsApp(phone, id, biz, type, details) {
      const clean = phone.replace(/\\D/g, '');
      const msg = encodeURIComponent('Booking ' + id + ' at ' + biz + ': ' + type + ' - ' + details);
      window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
    }

    async function loadBusinessConfig() {
      const select = document.getElementById('configBizSelect');
      const bizId = select.value;
      if (!bizId) return;
      try {
        const res = await fetch('/api/business/' + bizId + '/config');
        const biz = await res.json();
        
        // Profile tab
        document.getElementById('cfgAdminName').value = biz.adminProfile?.adminName || '';
        document.getElementById('cfgBusinessName').value = biz.adminProfile?.businessName || biz.name || '';
        document.getElementById('cfgContactPhone').value = biz.adminProfile?.contactPhone || '';
        document.getElementById('cfgContactEmail').value = biz.adminProfile?.contactEmail || '';
        document.getElementById('cfgAddress').value = biz.adminProfile?.address || '';
        document.getElementById('cfgBio').value = biz.adminProfile?.bio || '';

        // WhatsApp
        document.getElementById('cfgWaNumber').value = biz.whatsapp?.businessNumber || '';
        document.getElementById('cfgWaAutoConfirm').checked = biz.whatsapp?.sendConfirmationLink !== false;
        document.getElementById('cfgWaTemplate').value = biz.whatsapp?.autoConfirmTemplate || 'Your booking for {{service}} on {{date}} at {{time}} is confirmed. Booking ID: {{bookingId}}. Thank you for choosing {{businessName}}!';

        // Services
        renderServices(biz.services || []);
        
        // Staff
        renderStaff(biz.staff || []);
        
        // Working Hours
        renderWorkingHours(biz.workingHours || {});
        
        // Time Off
        renderTimeOff(biz.timeOff || []);
        
        // UPI
        document.getElementById('cfgUpiEnabled').checked = biz.upi?.enabled || false;
        toggleUpiFields();
        document.getElementById('cfgUpiId').value = biz.upi?.upiId || '';
        document.getElementById('cfgUpiPayee').value = biz.upi?.payeeName || '';
        document.getElementById('cfgUpiAmount').value = biz.upi?.advanceAmount || 0;
        document.getElementById('cfgUpiType').value = biz.upi?.advanceType || 'fixed';
        document.getElementById('cfgUpiPayeeName').value = biz.upi?.payeeName || '';
        
        currentConfigBizId = bizId;
      } catch (e) { console.error('Failed to load business config:', e); }
    }

    function renderServices(services) {
      const list = document.getElementById('servicesList');
      list.innerHTML = (services || []).map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function renderWorkingHours(hours) {
      const grid = document.getElementById('workingHoursGrid');
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      grid.innerHTML = days.map(day => {
        const h = hours[day] || { open: '10:00', close: '20:00', closed: day === 'sunday' };
        return '<div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;">' +
          '<label style="font-weight:600;text-transform:capitalize;display:block;margin-bottom:8px;">' + day + '</label>' +
          '<label><input type="checkbox" ' + (h.closed ? 'checked' : '') + ' onchange="updateHours(\\'' + day + '\\', this)"> Closed</label>' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<div style="flex:1"><label>Open</label><input type="time" value="' + h.open + '" onchange="updateHoursTime(\\'' + day + '\\',\\'open\\',this)"></div>' +
            '<div style="flex:1"><label>Close</label><input type="time" value="' + h.close + '" onchange="updateHoursTime(\\'' + day + '\\',\\'close\\',this)"></div>' +
          '</div></div>';
      }).join('');
    }

    function updateHours(day, checkbox) {
      if (currentConfigBizId) {
        // In a real implementation, this would call an API
      }
    }

    function updateHoursTime(day, field, input) {
      if (currentConfigBizId) {
        // In a real implementation, this would call an API
      }
    }

    function renderTimeOff(timeOff) {
      let list = document.getElementById('timeOffList');
      list.innerHTML = timeOff.map((t, i) => 
        '<div class="timeoff-row">' +
          '<strong>' + (t.reason || 'Time Off') + '</strong>: ' + (t.start || '') + ' to ' + (t.end || '') +
          '<button type="button" class="remove-btn" onclick="removeTimeOff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      // In a real implementation, this would call an API
      loadBusinessConfig();
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function updateHours(day, checkbox) {
      // In a real implementation, this would call an API
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would call an API
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderStaff(staff) {
      const list = document.getElementById('staffList');
      list.innerHTML = (staff || []).map((s, i) => 
        '<div class="staff-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Staff Name" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)">' +
          '<input type="text" value="' + (s.role || '') + '" placeholder="Role / Specialty" data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="flex: 2;">' +
          '<select data-idx="' + i + '" onchange="updateStaff(' + i + ', this)" style="width: 120px;">' +
            '<option value="active" ' + (s.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (s.status === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
          '</select>' +
          '<button type="button" class="remove-btn" onclick="removeStaff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addStaff() {
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const status = document.getElementById('newStaffStatus').value;
      if (!name) return alert('Enter staff name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateStaff(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeStaff(idx) {
      if (!confirm('Remove this staff member?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function updateHours(day, checkbox) {
      // In a real implementation, this would call an API
    }

    function updateHoursTime(day, field, input) {
      // In a real implementation, this would call an API
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderTimeOff(timeOff) {
      let list = document.getElementById('timeOffList');
      list.innerHTML = timeOff.map((t, i) => 
        '<div class="timeoff-row">' +
          '<strong>' + (t.reason || 'Time Off') + '</strong>: ' + (t.start || '') + ' to ' + (t.end || '') +
          '<button type="button" class="remove-btn" onclick="removeTimeOff(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addTimeOff() {
      const start = document.getElementById('newTimeOffStart').value;
      const end = document.getElementById('newTimeOffEnd').value;
      const reason = document.getElementById('newTimeOffReason').value.trim();
      if (!start || !reason) return alert('Enter start date and reason');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function removeTimeOff(idx) {
      if (!confirm('Remove this time off?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }

    function renderServices(services) {
      let list = document.getElementById('servicesList');
      list.innerHTML = services.map((s, i) => 
        '<div class="service-row">' +
          '<input type="text" value="' + (s.name || '') + '" placeholder="Service Name" data-idx="' + i + '" onchange="updateService(' + i + ', this)">' +
          '<input type="number" value="' + (s.price || 0) + '" placeholder="Price (₹)" min="0" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<input type="number" value="' + (s.duration || 30) + '" placeholder="Duration (mins)" min="5" data-idx="' + i + '" onchange="updateService(' + i + ', this)" style="width: 100px;">' +
          '<button type="button" class="remove-btn" onclick="removeService(' + i + ')">Remove</button>' +
        '</div>'
      ).join('');
    }

    function addService() {
      const name = document.getElementById('newServiceName').value.trim();
      const price = parseFloat(document.getElementById('newServicePrice').value) || 0;
      const duration = parseInt(document.getElementById('newServiceDuration').value) || 30;
      if (!name) return alert('Enter service name');
      if (!currentConfigBizId) return alert('Select a business first');
      loadBusinessConfig();
    }

    function updateService(idx, el) {
      // In a real implementation, this would call an API
    }

    function removeService(idx) {
      if (!confirm('Remove this service?')) return;
      if (!currentConfigBizId) return;
      loadBusinessConfig();
    }
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