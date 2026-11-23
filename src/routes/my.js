import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { requireAuth } from '../auth.js';
import { addDays, isValidDate, istDate } from '../time.js';
import { cleanBusinessInput } from '../validate.js';
import { createBooking, findService, getAvailableSlots, listBookings, setBookingStatus } from '../services/bookings.js';

const router = Router();
router.use(requireAuth);

// Har request par owner ka apna business hi load hota hai, isliye koi doosre ka data nahi dekh sakta
router.use(async (req, res, next) => {
  try {
    const biz = await getDB().collection('businesses').findOne({ ownerId: new ObjectId(req.userId) });
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    req.biz = biz;
    next();
  } catch (e) { next(e); }
});

const shape = (b) => ({
  name: b.name, slug: b.slug, category: b.category, address: b.address, details: b.details,
  instructions: b.instructions, hours: b.hours, closedDays: b.closedDays, slotMinutes: b.slotMinutes, services: b.services,
});

router.get('/business', (req, res) => res.json(shape(req.biz)));

router.put('/business', async (req, res, next) => {
  try {
    const r = cleanBusinessInput(req.body || {});
    if (r.error) return res.status(400).json({ error: r.error });
    await getDB().collection('businesses').updateOne({ _id: req.biz._id }, { $set: { ...r.value, updatedAt: new Date() } });
    const fresh = await getDB().collection('businesses').findOne({ _id: req.biz._id });
    res.json(shape(fresh));
  } catch (e) { next(e); }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const date = req.query.date || istDate();
    if (!isValidDate(date)) return res.status(400).json({ error: 'Date is invalid' });
    res.json({ date, bookings: await listBookings(req.biz, date) });
  } catch (e) { next(e); }
});

router.get('/slots', async (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    const sv = findService(req.biz, req.query.service);
    const r = await getAvailableSlots(req.biz, date, sv.ok ? sv.service : null);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (e) { next(e); }
});

// Owner khud walk-in / phone booking daal sakta hai
router.post('/bookings', async (req, res, next) => {
  try {
    const r = await createBooking(req.biz, { ...(req.body || {}), source: 'owner' });
    if (!r.ok) {
      const msg = {
        slot_unavailable: 'That slot is no longer available', invalid_name: "Enter the customer's name",
        invalid_phone: 'Enter a valid 10-digit mobile number', invalid_time: 'Time is invalid',
        service_required: 'Choose a service', unknown_service: 'That service is not on the list',
        past_date: "You can't book a date in the past", too_far: 'That date is too far ahead',
        invalid_date: 'Date is invalid',
      }[r.error] || 'Could not create the booking';
      return res.status(r.error === 'slot_unavailable' ? 409 : 400).json({ error: msg, slots: r.slots });
    }
    res.json({ booking: r.booking });
  } catch (e) { next(e); }
});

router.patch('/bookings/:id', async (req, res, next) => {
  try {
    const status = (req.body || {}).status;
    if (!['cancelled', 'completed'].includes(status)) return res.status(400).json({ error: 'Status is invalid' });
    const b = await setBookingStatus(req.biz, req.params.id, status);
    if (!b) return res.status(404).json({ error: 'Booking not found or already updated' });
    res.json({ booking: b });
  } catch (e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const today = istDate();
    const rows = await getDB().collection('bookings').countDocuments({
      businessId: req.biz._id, status: 'confirmed', date: { $gte: today, $lte: addDays(today, 7) },
    });
    res.json({ next7days: rows });
  } catch (e) { next(e); }
});

export default router;
