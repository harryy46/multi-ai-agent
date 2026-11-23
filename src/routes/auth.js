import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { checkPassword, hashPassword, requireAuth, signToken } from '../auth.js';
import { normalizePhone } from '../time.js';
import { defaultBusiness } from '../validate.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

function slugify(name) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'biz';
  return `${base}-${randomBytes(2).toString('hex')}`;
}

router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { businessName, phone, password } = req.body || {};
    const name = String(businessName || '').trim().slice(0, 80);
    const p = normalizePhone(phone);
    if (name.length < 2) return res.status(400).json({ error: 'Enter your business name' });
    if (!p) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const db = getDB();
    const userId = new ObjectId();
    try {
      await db.collection('users').insertOne({
        _id: userId, phone: p, passwordHash: await hashPassword(password), createdAt: new Date(),
      });
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: 'This number is already registered. Please log in.' });
      throw e;
    }
    await db.collection('businesses').insertOne({
      ownerId: userId, name, slug: slugify(name), ...defaultBusiness, createdAt: new Date(),
    });
    res.json({ token: signToken(userId), businessName: name });
  } catch (e) { next(e); }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const p = normalizePhone((req.body || {}).phone);
    const password = (req.body || {}).password;
    if (!p || typeof password !== 'string') return res.status(400).json({ error: 'Enter your mobile number and password' });
    const user = await getDB().collection('users').findOne({ phone: p });
    const ok = user && (await checkPassword(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Mobile number or password is incorrect' });
    const biz = await getDB().collection('businesses').findOne({ ownerId: user._id });
    res.json({ token: signToken(user._id), businessName: biz ? biz.name : '' });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const biz = await getDB().collection('businesses').findOne({ ownerId: new ObjectId(req.userId) });
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    res.json({ businessName: biz.name, slug: biz.slug });
  } catch (e) { next(e); }
});

export default router;
