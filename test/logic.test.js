import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { setDB } from '../src/db.js';
import { addDays, generateGrid, fromMinutes, istDate, normalizePhone, weekday } from '../src/time.js';
import { createBooking, getAvailableSlots, setBookingStatus } from '../src/services/bookings.js';
import { cleanBusinessInput } from '../src/validate.js';

// Chhota in-memory fake jo MongoDB ke unique index jaisa hi behave karta hai
function fakeDB() {
  const locks = [];
  const bookings = [];
  const key = (d) => `${String(d.businessId)}|${d.slotAt.getTime()}`;
  return {
    collection(name) {
      if (name === 'slot_locks') {
        return {
          find: (q) => ({
            toArray: async () => locks.filter((l) => String(l.businessId) === String(q.businessId)
              && l.slotAt >= q.slotAt.$gte && l.slotAt < q.slotAt.$lt),
          }),
          insertMany: async (docs) => {
            for (const d of docs) {
              if (locks.some((l) => key(l) === key(d))) { const e = new Error('dup'); e.code = 11000; throw e; }
              locks.push(d);
            }
          },
          deleteMany: async (q) => {
            for (let i = locks.length - 1; i >= 0; i--) if (String(locks[i].bookingId) === String(q.bookingId)) locks.splice(i, 1);
          },
        };
      }
      return {
        insertOne: async (d) => { bookings.push(d); },
        findOneAndUpdate: async (q, u) => {
          const b = bookings.find((x) => String(x._id) === String(q._id) && x.status === q.status);
          if (!b) return null;
          Object.assign(b, u.$set);
          return b;
        },
      };
    },
  };
}

const biz = () => ({
  _id: new ObjectId(), name: 'Test Salon', slotMinutes: 30, closedDays: [],
  hours: { open: '10:00', close: '20:00', breakStart: '13:00', breakEnd: '14:00' },
  services: [{ name: 'Haircut', price: 200, duration: 30 }, { name: 'Facial', price: 800, duration: 60 }],
});
const future = () => addDays(istDate(), 3);

test('phone normalize', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
  assert.equal(normalizePhone('09876543210'), '9876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('5876543210'), null);
});

test('grid: break aur closed day', () => {
  const b = biz();
  const grid = generateGrid(b, future()).map(fromMinutes);
  assert.ok(grid.includes('12:30'));
  assert.ok(!grid.includes('13:00') && !grid.includes('13:30'));
  assert.ok(grid.includes('14:00'));
  assert.ok(grid.includes('19:30') && !grid.includes('20:00'));
  b.closedDays = [weekday(future())];
  assert.equal(generateGrid(b, future()).length, 0);
});

test('booking: ek slot ek hi bar milta hai', async () => {
  setDB(fakeDB());
  const b = biz();
  const base = { date: future(), time: '11:00', service: 'Haircut', phone: '9876543210' };
  const r1 = await createBooking(b, { ...base, customerName: 'Amit' });
  assert.equal(r1.ok, true);
  const r2 = await createBooking(b, { ...base, customerName: 'Ravi' });
  assert.equal(r2.ok, false);
  assert.equal(r2.error, 'slot_unavailable');
  assert.ok(!r2.slots.includes('11:00'));
});

test('booking: do log ek saath try karein to sirf ek jeetta hai', async () => {
  setDB(fakeDB());
  const b = biz();
  const mk = (n) => createBooking(b, { date: future(), time: '15:00', service: 'Haircut', phone: '9876543210', customerName: n });
  const results = await Promise.all([mk('A1'), mk('B2'), mk('C3'), mk('D4')]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test('booking: 60 min service agle slot ko bhi rokti hai', async () => {
  setDB(fakeDB());
  const b = biz();
  const d = future();
  const ok = await createBooking(b, { date: d, time: '10:00', service: 'Facial', phone: '9876543210', customerName: 'Meena' });
  assert.equal(ok.ok, true);
  assert.equal(ok.booking.durationMin, 60);
  const clash = await createBooking(b, { date: d, time: '10:30', service: 'Haircut', phone: '9876543210', customerName: 'Sita' });
  assert.equal(clash.ok, false);
  const next = await createBooking(b, { date: d, time: '11:00', service: 'Haircut', phone: '9876543210', customerName: 'Sita' });
  assert.equal(next.ok, true);
  // 12:30 par Facial break (13:00) se takrayegi, isliye nahi milna chahiye
  const slots = (await getAvailableSlots(b, d, b.services[1])).slots;
  assert.ok(!slots.includes('12:30'));
});

test('booking: cancel karne par slot wapas khul jata hai', async () => {
  setDB(fakeDB());
  const b = biz();
  const d = future();
  const r = await createBooking(b, { date: d, time: '16:00', service: 'Haircut', phone: '9876543210', customerName: 'Kiran' });
  assert.ok(!(await getAvailableSlots(b, d)).slots.includes('16:00'));
  const c = await setBookingStatus(b, String(r.booking.id), 'cancelled');
  assert.equal(c.status, 'cancelled');
  assert.ok((await getAvailableSlots(b, d)).slots.includes('16:00'));
});

test('booking: galat input reject hota hai', async () => {
  setDB(fakeDB());
  const b = biz();
  const base = { date: future(), time: '11:00', service: 'Haircut', phone: '9876543210', customerName: 'Amit' };
  assert.equal((await createBooking(b, { ...base, phone: '123' })).error, 'invalid_phone');
  assert.equal((await createBooking(b, { ...base, customerName: '' })).error, 'invalid_name');
  assert.equal((await createBooking(b, { ...base, service: 'Makeup' })).error, 'unknown_service');
  assert.equal((await createBooking(b, { ...base, service: undefined })).error, 'service_required');
  assert.equal((await createBooking(b, { ...base, date: '2020-01-01' })).error, 'past_date');
  assert.equal((await createBooking(b, { ...base, date: addDays(istDate(), 200) })).error, 'too_far');
  assert.equal((await createBooking(b, { ...base, time: '25:99' })).error, 'invalid_time');
});

test('validate: business settings', () => {
  assert.ok(cleanBusinessInput({ hours: { open: '20:00', close: '10:00' } }).error);
  assert.ok(cleanBusinessInput({ slotMinutes: 25 }).error);
  assert.ok(cleanBusinessInput({ services: [{ name: 'X', price: -5, duration: 30 }] }).error);
  const ok = cleanBusinessInput({ name: ' Royal Salon ', closedDays: [0, 0, 9, 'x'], services: [{ name: 'Cut', price: '150', duration: '30' }] });
  assert.equal(ok.value.name, 'Royal Salon');
  assert.deepEqual(ok.value.closedDays, [0]);
  assert.deepEqual(ok.value.services, [{ name: 'Cut', price: 150, duration: 30 }]);
});
