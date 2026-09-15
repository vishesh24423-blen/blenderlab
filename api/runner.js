// GET /api/runner — worker status for the nav dot, no Firestore SDK in the browser.
const { getDb, cors } = require("./_db");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const snap = await getDb().collection("system").doc("runner").get();
    res.json(snap.exists ? snap.data() : { status: "inactive" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
