// server/firebase.js
const admin = require('firebase-admin');
require('dotenv').config();

// ป้องกันการ initialize ซ้ำ (เช่น ตอน dev ที่ nodemon restart)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
  ?.replace(/\\n/g, '\n')
  ?.replace(/^"|"$/g, '')   // ตัด " ที่หัวท้ายออกถ้ามี
  ?.trim(),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId:    process.env.FIREBASE_CLIENT_ID,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

// Collection names
const COLLECTIONS = {
  SETTINGS:   'settings',
  METERS:     'meters',
  APPLIANCES: 'appliances',
};

module.exports = { db, admin, COLLECTIONS };
