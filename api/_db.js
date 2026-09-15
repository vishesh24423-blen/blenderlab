// Shared Firestore Admin init for Vercel functions. Same as server.js getDb().
const admin = require("firebase-admin");

let db = null;

function getDb() {
  if (db) return db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_CONFIG;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY env var");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  db = admin.firestore();
  return db;
}

module.exports = { getDb, admin };
