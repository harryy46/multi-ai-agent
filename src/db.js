import { MongoClient } from 'mongodb';

let client;
let db;

export function getDB() {
  if (!db) throw new Error('Database is not connected');
  return db;
}

// Sirf tests ke liye: fake db inject karne ke kaam aata hai
export function setDB(fake) {
  db = fake;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'smart_booking');

  await Promise.all([
    db.collection('users').createIndex({ phone: 1 }, { unique: true }),
    db.collection('businesses').createIndex({ slug: 1 }, { unique: true }),
    db.collection('businesses').createIndex({ ownerId: 1 }, { unique: true }),
    db.collection('bookings').createIndex({ businessId: 1, date: 1, startAt: 1 }),
    // Double-booking roknewala asli lock: ek business ka ek slot ek hi booking ko mil sakta hai
    db.collection('slot_locks').createIndex({ businessId: 1, slotAt: 1 }, { unique: true }),
    db.collection('slot_locks').createIndex({ bookingId: 1 }),
  ]);
  return db;
}

export async function closeDB() {
  if (client) await client.close();
}
