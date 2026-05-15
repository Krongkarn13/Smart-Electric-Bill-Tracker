// server/index.js
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { db, COLLECTIONS } = require('./firebase');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─────────────────────────────────────────
// Helper
// ─────────────────────────────────────────
const ok  = (res, data)      => res.json({ success: true, data });
const err = (res, msg, code=500) => res.status(code).json({ success: false, message: msg });

// USER_ID แบบง่าย — ในอนาคตเปลี่ยนเป็น Firebase Auth UID
// ตอนนี้ใช้ query param ?uid=xxx หรือ default = 'default_user'
const uid = (req) => req.query.uid || req.body?.uid || 'default_user';

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.SETTINGS).doc(uid(req)).get();
    if (!doc.exists) {
      // ส่งค่า default กลับไป
      return ok(res, { rate: 4.50, budget: 2500, vat: 7, billStart: 1 });
    }
    ok(res, doc.data());
  } catch (e) {
    err(res, e.message);
  }
});

// PUT /api/settings
app.put('/api/settings', async (req, res) => {
  try {
    const { rate, budget, vat, billStart } = req.body;
    const payload = {
      rate:      parseFloat(rate)      || 4.50,
      budget:    parseFloat(budget)    || 2500,
      vat:       parseFloat(vat)       || 7,
      billStart: parseInt(billStart)   || 1,
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTIONS.SETTINGS).doc(uid(req)).set(payload, { merge: true });
    ok(res, payload);
  } catch (e) {
    err(res, e.message);
  }
});

// ─────────────────────────────────────────
// METERS
// ─────────────────────────────────────────

// GET /api/meters  → ดึงทั้งหมด เรียงตามวันที่
app.get('/api/meters', async (req, res) => {
  try {
    const snap = await db
      .collection(COLLECTIONS.METERS)
      .where('userId', '==', uid(req))
      .orderBy('date', 'asc')
      .get();
    const meters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ok(res, meters);
  } catch (e) {
    err(res, e.message);
  }
});

// POST /api/meters  → เพิ่มรายการใหม่
app.post('/api/meters', async (req, res) => {
  try {
    const { date, reading, actual, ft, note } = req.body;
    if (!date || reading == null) return err(res, 'date และ reading จำเป็น', 400);

    const payload = {
      userId:    uid(req),
      date,
      reading:   parseFloat(reading),
      actual:    parseFloat(actual)  || 0,
      ft:        parseFloat(ft)      || 0,
      note:      note || '',
      createdAt: new Date().toISOString(),
    };
    const docRef = await db.collection(COLLECTIONS.METERS).add(payload);
    ok(res, { id: docRef.id, ...payload });
  } catch (e) {
    err(res, e.message);
  }
});

// PUT /api/meters/:id  → แก้ไข
app.put('/api/meters/:id', async (req, res) => {
  try {
    const { date, reading, actual, ft, note } = req.body;
    const payload = {
      ...(date    !== undefined && { date }),
      ...(reading !== undefined && { reading: parseFloat(reading) }),
      ...(actual  !== undefined && { actual:  parseFloat(actual)  }),
      ...(ft      !== undefined && { ft:      parseFloat(ft)      }),
      ...(note    !== undefined && { note }),
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTIONS.METERS).doc(req.params.id).update(payload);
    ok(res, { id: req.params.id, ...payload });
  } catch (e) {
    err(res, e.message);
  }
});

// DELETE /api/meters/:id
app.delete('/api/meters/:id', async (req, res) => {
  try {
    await db.collection(COLLECTIONS.METERS).doc(req.params.id).delete();
    ok(res, { id: req.params.id, deleted: true });
  } catch (e) {
    err(res, e.message);
  }
});

// ─────────────────────────────────────────
// APPLIANCES
// ─────────────────────────────────────────

// GET /api/appliances
app.get('/api/appliances', async (req, res) => {
  try {
    const snap = await db
      .collection(COLLECTIONS.APPLIANCES)
      .where('userId', '==', uid(req))
      .orderBy('createdAt', 'asc')
      .get();
    const appliances = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ok(res, appliances);
  } catch (e) {
    err(res, e.message);
  }
});

// POST /api/appliances
app.post('/api/appliances', async (req, res) => {
  try {
    const { name, watt, qty, hours, days, cat } = req.body;
    if (!name || !watt || !hours || !days) return err(res, 'ข้อมูลไม่ครบ', 400);

    const rate    = 4.50; // คำนวณใหม่ฝั่ง client ได้ตาม setting
    const kwh     = +((watt / 1000) * hours * days * (qty || 1)).toFixed(3);
    const cost    = +(kwh * rate).toFixed(2);

    const payload = {
      userId:    uid(req),
      name,
      watt:      parseFloat(watt),
      qty:       parseInt(qty)   || 1,
      hours:     parseFloat(hours),
      days:      parseFloat(days),
      cat:       cat || 'อื่นๆ',
      kwh,
      cost,
      createdAt: new Date().toISOString(),
    };
    const docRef = await db.collection(COLLECTIONS.APPLIANCES).add(payload);
    ok(res, { id: docRef.id, ...payload });
  } catch (e) {
    err(res, e.message);
  }
});

// PUT /api/appliances/:id
app.put('/api/appliances/:id', async (req, res) => {
  try {
    const fields = ['name','watt','qty','hours','days','cat'];
    const payload = { updatedAt: new Date().toISOString() };
    fields.forEach(f => { if (req.body[f] !== undefined) payload[f] = req.body[f]; });

    // คำนวณ kwh/cost ใหม่ถ้ามีการเปลี่ยนค่า
    const doc = await db.collection(COLLECTIONS.APPLIANCES).doc(req.params.id).get();
    if (doc.exists) {
      const d = doc.data();
      const w = parseFloat(payload.watt  ?? d.watt);
      const h = parseFloat(payload.hours ?? d.hours);
      const dy= parseFloat(payload.days  ?? d.days);
      const q = parseInt(payload.qty     ?? d.qty) || 1;
      payload.kwh  = +((w/1000)*h*dy*q).toFixed(3);
      payload.cost = +(payload.kwh * 4.50).toFixed(2);
    }

    await db.collection(COLLECTIONS.APPLIANCES).doc(req.params.id).update(payload);
    ok(res, { id: req.params.id, ...payload });
  } catch (e) {
    err(res, e.message);
  }
});

// DELETE /api/appliances/:id
app.delete('/api/appliances/:id', async (req, res) => {
  try {
    await db.collection(COLLECTIONS.APPLIANCES).doc(req.params.id).delete();
    ok(res, { id: req.params.id, deleted: true });
  } catch (e) {
    err(res, e.message);
  }
});

// ─────────────────────────────────────────
// SUMMARY (Dashboard aggregate)
// ─────────────────────────────────────────
app.get('/api/summary', async (req, res) => {
  try {
    const userId = uid(req);
    const [metersSnap, appSnap, settingDoc] = await Promise.all([
      db.collection(COLLECTIONS.METERS).where('userId','==',userId).orderBy('date','asc').get(),
      db.collection(COLLECTIONS.APPLIANCES).where('userId','==',userId).get(),
      db.collection(COLLECTIONS.SETTINGS).doc(userId).get(),
    ]);

    const meters     = metersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const appliances = appSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const settings   = settingDoc.exists
      ? settingDoc.data()
      : { rate: 4.50, budget: 2500, vat: 7, billStart: 1 };

    // คำนวณ
    const totalAppCost = appliances.reduce((s, a) => s + a.cost, 0);
    let lastMonthCost  = null;
    let prevMonthCost  = null;

    if (meters.length >= 2) {
      const last  = meters[meters.length - 1];
      const prev  = meters[meters.length - 2];
      lastMonthCost = last.actual || ((last.reading - prev.reading) * settings.rate);
    }
    if (meters.length >= 3) {
      const prev  = meters[meters.length - 2];
      const pp    = meters[meters.length - 3];
      prevMonthCost = prev.actual || ((prev.reading - pp.reading) * settings.rate);
    }

    ok(res, {
      settings,
      totalApplianceCost: +totalAppCost.toFixed(2),
      lastMonthCost:  lastMonthCost  ? +lastMonthCost.toFixed(2)  : null,
      prevMonthCost:  prevMonthCost  ? +prevMonthCost.toFixed(2)  : null,
      meterCount:     meters.length,
      applianceCount: appliances.length,
    });
  } catch (e) {
    err(res, e.message);
  }
});

// ─────────────────────────────────────────
// Health check
// ─────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Catch-all → serve frontend
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ Electric Tracker API running`);
  console.log(`   http://localhost:${PORT}\n`);
});
