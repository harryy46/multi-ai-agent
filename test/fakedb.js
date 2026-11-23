import { ObjectId } from 'mongodb';
// Test ke liye chhota in-memory MongoDB jaisa db (equality, $gte/$lt/$lte, unique keys, $set)
const UNIQUE = { users: [['phone']], businesses: [['slug'], ['ownerId']], slot_locks: [['businessId', 'slotAt']] };
const norm = (v) => (v instanceof Date ? v.getTime() : String(v));

function matches(doc, q) {
  return Object.entries(q).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !cond._bsontype && Object.keys(cond).some((x) => x.startsWith('$'))) {
      return Object.entries(cond).every(([op, x]) => {
        if (op === '$gte') return v >= x;
        if (op === '$lt') return v < x;
        if (op === '$lte') return v <= x;
        throw new Error(`fake db: ${op} supported nahi`);
      });
    }
    return norm(v) === norm(cond);
  });
}

export function makeFakeDB() {
  const store = {};
  const col = (name) => (store[name] ||= []);
  const dup = () => Object.assign(new Error('E11000 duplicate'), { code: 11000 });
  const checkUnique = (name, doc) => {
    for (const keys of UNIQUE[name] || []) {
      if (col(name).some((d) => keys.every((k) => norm(d[k]) === norm(doc[k])))) throw dup();
    }
  };
  return {
    collection(name) {
      const rows = col(name);
      return {
        insertOne: async (d) => { if (!d._id) d._id = new ObjectId(); checkUnique(name, d); rows.push({ ...d }); },
        insertMany: async (docs) => { for (const d of docs) { checkUnique(name, d); rows.push({ ...d }); } },
        findOne: async (q) => rows.find((d) => matches(d, q)) || null,
        find: (q = {}) => {
          let out = rows.filter((d) => matches(d, q));
          const cur = {
            sort: (s) => { const [k, dir] = Object.entries(s)[0]; out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : -1) * dir); return cur; },
            toArray: async () => out,
          };
          return cur;
        },
        updateOne: async (q, u) => { const d = rows.find((x) => matches(x, q)); if (d) Object.assign(d, u.$set); },
        findOneAndUpdate: async (q, u) => { const d = rows.find((x) => matches(x, q)); if (!d) return null; Object.assign(d, u.$set); return d; },
        deleteMany: async (q) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], q)) rows.splice(i, 1); },
        countDocuments: async (q) => rows.filter((d) => matches(d, q)).length,
      };
    },
  };
}
