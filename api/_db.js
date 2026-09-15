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

// CORS + preflight for browser calls. Returns true if the request was
// an OPTIONS preflight (already answered) so handlers can return early.
function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { getDb, admin, cors };
