import { isValidTime, toMinutes } from './time.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Business settings ko safe tareeke se saaf karta hai. Galat ho to { error } deta hai.
export function cleanBusinessInput(b) {
  const out = {};
  if (b.name !== undefined) {
    out.name = str(b.name, 80);
    if (out.name.length < 2) return { error: 'Business name must be at least 2 characters' };
  }
  if (b.category !== undefined) out.category = str(b.category, 60);
  if (b.address !== undefined) out.address = str(b.address, 200);
  if (b.details !== undefined) out.details = str(b.details, 2000);
  if (b.instructions !== undefined) out.instructions = str(b.instructions, 1500);

  if (b.slotMinutes !== undefined) {
    const n = Number(b.slotMinutes);
    if (![15, 20, 30, 45, 60].includes(n)) return { error: 'Slot length must be 15, 20, 30, 45 or 60 minutes' };
    out.slotMinutes = n;
  }
  if (b.closedDays !== undefined) {
    if (!Array.isArray(b.closedDays)) return { error: 'Closed days value is invalid' };
    out.closedDays = [...new Set(b.closedDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  }
  if (b.hours !== undefined) {
    const h = b.hours || {};
    if (!isValidTime(h.open) || !isValidTime(h.close)) return { error: 'Enter opening and closing time as HH:MM' };
    if (toMinutes(h.open) >= toMinutes(h.close)) return { error: 'Closing time must be after opening time' };
    const hours = { open: h.open, close: h.close };
    if (h.breakStart || h.breakEnd) {
      if (!isValidTime(h.breakStart) || !isValidTime(h.breakEnd) || toMinutes(h.breakStart) >= toMinutes(h.breakEnd)) {
        return { error: 'Break time is invalid' };
      }
      hours.breakStart = h.breakStart;
      hours.breakEnd = h.breakEnd;
    }
    out.hours = hours;
  }
  if (b.services !== undefined) {
    if (!Array.isArray(b.services) || b.services.length > 30) return { error: 'Services list is invalid (max 30)' };
    const services = [];
    for (const s of b.services) {
      const name = str(s && s.name, 60);
      const price = Number(s && s.price);
      const duration = Number(s && s.duration);
      if (!name) return { error: 'Every service needs a name' };
      if (!Number.isFinite(price) || price < 0) return { error: `Price for "${name}" is invalid` };
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) return { error: `Duration for "${name}" must be between 5 and 480 minutes` };
      services.push({ name, price, duration });
    }
    out.services = services;
  }
  return { value: out };
}

export const defaultBusiness = {
  category: 'Business', address: '', details: '', instructions: '',
  hours: { open: '10:00', close: '20:00' }, closedDays: [], slotMinutes: 30, services: [],
};
