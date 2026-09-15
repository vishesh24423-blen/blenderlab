// GET /api/job?id=... — status polling without exposing Firebase keys to the browser.
const { getDb } = require("./_db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const snap = await getDb().collection("jobs").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Job not found" });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
