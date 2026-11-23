import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'x'.repeat(40);
const { createApp } = await import('../src/app.js');
const { setDB } = await import('../src/db.js');
const { makeFakeDB } = await import('./fakedb.js');
const { addDays, istDate } = await import('../src/time.js');
const jwt = (await import('jsonwebtoken')).default;

let server; let base;
before(async () => {
  setDB(makeFakeDB());
  await new Promise((r) => { server = createApp().listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.clone().json(); } catch { /* html */ }
  return { res, data };
};

test('purane khule routes ab band hain', async () => {
  assert.equal((await call('/api/data')).res.status, 404);
  assert.equal((await call('/api/cloud-state')).res.status, 404);
  assert.equal((await call('/api/otp/send', { method: 'POST', body: { target: '9876543210' } })).res.status, 404);
  assert.equal((await call('/api/businesses', { method: 'POST', body: { name: 'x' } })).res.status, 404);
});

test('bina login ke owner routes band, nakli token reject', async () => {
  assert.equal((await call('/api/my/bookings')).res.status, 401);
  const fake = jwt.sign({ sub: 'abc' }, 'galat-secret-galat-secret-galat-secret');
  assert.equal((await call('/api/my/business', { token: fake })).res.status, 401);
});

test('security headers, static files, privacy, assetlinks', async () => {
  const { res } = await call('/healthz');
  assert.ok(res.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal(res.headers.get('x-powered-by'), null);
  const p = await call('/privacy');
  assert.equal(p.res.status, 200);
  assert.match(await p.res.text(), /Privacy Policy/);
  const al = await call('/.well-known/assetlinks.json');
  assert.equal(al.data[0].target.package_name, 'com.smartbooking.app');
  assert.equal((await call('/manifest.json')).data.short_name, 'Smart Booking');
  assert.equal((await call('/dashboard')).res.status, 200);
  assert.equal((await call('/b/some-shop-1234')).res.status, 200);
});

test('signup validation', async () => {
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { businessName: 'A', phone: '9876543210', password: 'longenough1' } })).res.status, 400);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { businessName: 'Shop', phone: '123', password: 'longenough1' } })).res.status, 400);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { businessName: 'Shop', phone: '9876543210', password: 'short' } })).res.status, 400);
});

test('poora flow: signup, settings, booking, dusra owner alag, cancel', async () => {
  const s1 = await call('/api/auth/signup', { method: 'POST', body: { businessName: 'Royal Salon', phone: '98765 43210', password: 'password123' } });
  assert.equal(s1.res.status, 200);
  const t1 = s1.data.token;
  const dup = await call('/api/auth/signup', { method: 'POST', body: { businessName: 'Other', phone: '+919876543210', password: 'password123' } });
  assert.equal(dup.res.status, 409);

  const bad = await call('/api/auth/login', { method: 'POST', body: { phone: '9876543210', password: 'wrongpass' } });
  assert.equal(bad.res.status, 401);
  const good = await call('/api/auth/login', { method: 'POST', body: { phone: '9876543210', password: 'password123' } });
  assert.equal(good.res.status, 200);

  const biz = await call('/api/my/business', { token: t1 });
  assert.equal(biz.data.name, 'Royal Salon');
  assert.match(biz.data.slug, /^royal-salon-[0-9a-f]{4}$/);
  assert.equal(biz.data.passwordHash, undefined);

  const put = await call('/api/my/business', { method: 'PUT', token: t1, body: { services: [{ name: 'Haircut', price: 200, duration: 30 }], hours: { open: '10:00', close: '20:00' } } });
  assert.equal(put.res.status, 200);
  assert.equal((await call('/api/my/business', { method: 'PUT', token: t1, body: { hours: { open: '22:00', close: '10:00' } } })).res.status, 400);

  const pub = await call(`/api/public/${biz.data.slug}`);
  assert.equal(pub.data.services[0].name, 'Haircut');
  assert.equal(pub.data.ownerId, undefined);

  const date = addDays(istDate(), 2);
  const slots = await call(`/api/my/slots?date=${date}&service=Haircut`, { token: t1 });
  assert.ok(slots.data.slots.includes('11:00'));

  const body = { date, time: '11:00', service: 'Haircut', customerName: 'Amit', phone: '9812345678' };
  const b1 = await call('/api/my/bookings', { method: 'POST', token: t1, body });
  assert.equal(b1.res.status, 200);
  assert.equal(b1.data.booking.status, 'confirmed');
  const b2 = await call('/api/my/bookings', { method: 'POST', token: t1, body: { ...body, customerName: 'Ravi' } });
  assert.equal(b2.res.status, 409);

  const list = await call(`/api/my/bookings?date=${date}`, { token: t1 });
  assert.equal(list.data.bookings.length, 1);

  // Doosra owner pehle owner ki booking nahi dekh sakta
  const s2 = await call('/api/auth/signup', { method: 'POST', body: { businessName: 'City Clinic', phone: '9000000001', password: 'password123' } });
  const t2 = s2.data.token;
  assert.equal((await call(`/api/my/bookings?date=${date}`, { token: t2 })).data.bookings.length, 0);
  const steal = await call(`/api/my/bookings/${b1.data.booking.id}`, { method: 'PATCH', token: t2, body: { status: 'cancelled' } });
  assert.equal(steal.res.status, 404);

  const cancel = await call(`/api/my/bookings/${b1.data.booking.id}`, { method: 'PATCH', token: t1, body: { status: 'cancelled' } });
  assert.equal(cancel.data.booking.status, 'cancelled');
  const again = await call('/api/my/bookings', { method: 'POST', token: t1, body: { ...body, customerName: 'Ravi' } });
  assert.equal(again.res.status, 200);
});

test('public chat: galat slug aur khaali message', async () => {
  assert.equal((await call('/api/chat/Bad_Slug', { method: 'POST', body: { message: 'hi' } })).res.status, 404);
  assert.equal((await call('/api/chat/no-such-biz-1234', { method: 'POST', body: { message: 'hi' } })).res.status, 404);
});
