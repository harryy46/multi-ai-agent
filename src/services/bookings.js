import { ObjectId } from 'mongodb';
import { randomInt } from 'node:crypto';
import { getDB } from '../db.js';
import {
  addDays, fromMinutes, generateGrid, isValidDate, isValidTime,
  istDate, istMinutesNow, normalizePhone, toInstant, toMinutes,
} from '../time.js';

export const MAX_ADVANCE_DAYS = 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

export function publicBooking(b) {
  return {
    id: String(b._id), code: b.code, customerName: b.customerName, phone: b.phone,
    service: b.service, price: b.price ?? null, date: b.date, time: b.time,
    durationMin: b.durationMin, status: b.status, source: b.source,
  };
}

export function findService(biz, name) {
  const list = biz.services || [];
  if (!list.length) return { ok: true, service: null };
  const options = list.map((s) => s.name);
  if (!name) return { ok: false, error: 'service_required', options };
  const q = String(name).trim().toLowerCase();
  const s = list.find((x) => x.name.toLowerCase() === q)
    || list.find((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
  return s ? { ok: true, service: s } : { ok: false, error: 'unknown_service', options };
}

// Ek booking kitne consecutive slots rokti hai
function neededStarts(startMin, step, service) {
  const n = Math.max(1, Math.ceil(((service && service.duration) || step) / step));
  return Array.from({ length: n }, (_, i) => startMin + i * step);
}

export async function getAvailableSlots(biz, dateStr, service = null) {
  if (!isValidDate(dateStr)) return { error: 'invalid_date' };
  const today = istDate();
  if (dateStr < today) return { error: 'past_date' };
  if (dateStr > addDays(today, MAX_ADVANCE_DAYS)) return { error: 'too_far' };

  const step = biz.slotMinutes || 30;
  const grid = generateGrid(biz, dateStr);
  if (!grid.length) return { date: dateStr, closed: true, slots: [] };

  const gridSet = new Set(grid);
  const dayStart = toInstant(dateStr, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const locks = await getDB().collection('slot_locks')
    .find({ businessId: biz._id, slotAt: { $gte: dayStart, $lt: dayEnd } }).toArray();
  const taken = new Set(locks.map((l) => Math.round((l.slotAt.getTime() - dayStart.getTime()) / 60000)));
  const nowMin = dateStr === today ? istMinutesNow() : -1;

  const slots = grid
    .filter((t) => t > nowMin && neededStarts(t, step, service).every((x) => gridSet.has(x) && !taken.has(x)))
    .map(fromMinutes);
  return { date: dateStr, slots };
}

export async function createBooking(biz, input) {
  const { date, time, customerName, phone, service: serviceName, source = 'ai' } = input;
  const name = String(customerName || '').trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: 'invalid_name' };
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return { ok: false, error: 'invalid_phone' };
  if (!isValidTime(time)) return { ok: false, error: 'invalid_time' };

  const sv = findService(biz, serviceName);
  if (!sv.ok) return { ok: false, error: sv.error, options: sv.options };

  const av = await getAvailableSlots(biz, date, sv.service);
  if (av.error) return { ok: false, error: av.error };
  if (!av.slots.includes(time)) return { ok: false, error: 'slot_unavailable', slots: av.slots.slice(0, 8) };

  const step = biz.slotMinutes || 30;
  const db = getDB();
  const _id = new ObjectId();
  const dayStart = toInstant(date, '00:00');
  const locks = neededStarts(toMinutes(time), step, sv.service).map((m) => ({
    businessId: biz._id, slotAt: new Date(dayStart.getTime() + m * 60000), bookingId: _id,
  }));

  // Pehle slot lock karo. Do log ek saath try karein to database ka unique index ek ko hi jaane dega.
  try {
    await db.collection('slot_locks').insertMany(locks, { ordered: true });
  } catch (e) {
    await db.collection('slot_locks').deleteMany({ bookingId: _id });
    if (e && (e.code === 11000 || e.writeErrors)) {
      const again = await getAvailableSlots(biz, date, sv.service);
      return { ok: false, error: 'slot_unavailable', slots: (again.slots || []).slice(0, 8) };
    }
    throw e;
  }

  const doc = {
    _id, businessId: biz._id, code: makeCode(), customerName: name, phone: cleanPhone,
    service: sv.service ? sv.service.name : null, price: sv.service ? sv.service.price : null,
    date, time, startAt: locks[0].slotAt, durationMin: locks.length * step,
    status: 'confirmed', source, createdAt: new Date(),
  };
  try {
    await db.collection('bookings').insertOne(doc);
  } catch (e) {
    await db.collection('slot_locks').deleteMany({ bookingId: _id });
    throw e;
  }
  return { ok: true, booking: publicBooking(doc) };
}

export async function listBookings(biz, dateStr) {
  const rows = await getDB().collection('bookings')
    .find({ businessId: biz._id, date: dateStr }).sort({ startAt: 1 }).toArray();
  return rows.map(publicBooking);
}

export async function setBookingStatus(biz, id, status) {
  if (!ObjectId.isValid(id)) return null;
  const db = getDB();
  const _id = new ObjectId(id);
  const res = await db.collection('bookings').findOneAndUpdate(
    { _id, businessId: biz._id, status: 'confirmed' },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  const doc = res && (res.value !== undefined ? res.value : res);
  if (!doc) return null;
  if (status === 'cancelled') await db.collection('slot_locks').deleteMany({ bookingId: _id });
  return publicBooking(doc);
}
