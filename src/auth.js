import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export function assertAuthConfig() {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long');
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, { expiresIn: '14d' });
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}
