import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDB } from '../db.js';
import { runChat } from '../services/gemini.js';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Please wait a moment and send your message again.' },
});

// Har business ke liye din bhar me kitne AI messages (Gemini ka kharcha control me rakhne ke liye)
const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT || 400);
const counters = new Map();
function underDailyLimit(slug) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${slug}:${day}`;
  const n = (counters.get(key) || 0) + 1;
  counters.set(key, n);
  if (counters.size > 5000) for (const k of counters.keys()) if (!k.endsWith(day)) counters.delete(k);
  return n <= DAILY_LIMIT;
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-20).map((m) => {
    const role = m && m.role === 'model' ? 'model' : 'user';
    const text = m && m.parts && m.parts[0] && typeof m.parts[0].text === 'string' ? m.parts[0].text.slice(0, 800) : '';
    return text ? { role, parts: [{ text }] } : null;
  }).filter(Boolean);
}

async function bySlug(slug) {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return null;
  return getDB().collection('businesses').findOne({ slug });
}

router.get('/public/:slug', async (req, res, next) => {
  try {
    const b = await bySlug(req.params.slug);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    res.json({ name: b.name, category: b.category, address: b.address, services: b.services, hours: b.hours, closedDays: b.closedDays });
  } catch (e) { next(e); }
});

router.post('/chat/:slug', chatLimiter, async (req, res, next) => {
  try {
    const biz = await bySlug(req.params.slug);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const message = String((req.body || {}).message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is empty' });
    if (message.length > 500) return res.status(400).json({ error: 'Keep your message under 500 characters' });
    if (!underDailyLimit(biz.slug)) {
      return res.status(429).json({ error: "Today's chat limit has been reached. Please contact the business directly." });
    }
    const { reply, booking } = await runChat({ biz, message, history: cleanHistory((req.body || {}).history) });
    res.json({ reply, booking });
  } catch (e) {
    console.error('[chat error]', e.message);
    res.status(502).json({ error: 'The assistant is not available right now. Please try again shortly.' });
  }
});

export default router;
