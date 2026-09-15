// POST /api/submit-job — Vercel serverless version of server.js handler.
// Same validation, same Firestore write, same runner lock + GitHub dispatch.
const { getDb } = require("./_db");

const FORMATS = ["glb", "fbx", "stl", "usd"];
const QUALITIES = ["draft", "standard", "cinematic"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const database = getDb();
    const { script, formats, quality = "standard" } = req.body || {};
    if (!script || typeof script !== "string")
      return res.status(400).json({ error: "Script is required" });
    if (!Array.isArray(formats) || formats.length === 0)
      return res.status(400).json({ error: "At least one format must be selected" });
    const bad = formats.filter((f) => !FORMATS.includes(f));
    if (bad.length) return res.status(400).json({ error: "Invalid formats: " + bad.join(", ") });

    const jobRef = await database.collection("jobs").add({
      script,
      userId: "anonymous",
      status: "queued",
      formats,
      quality: QUALITIES.includes(quality) ? quality : "standard",
      outputs: {},
      createdAt: Date.now(),
      error: null,
    });
    const jobId = jobRef.id;

    try {
      const runnerRef = database.collection("system").doc("runner");
      let shouldTrigger = false;
      await database.runTransaction(async (t) => {
        const snap = await t.get(runnerRef);
        const data = snap.data() || {};
        const stale = Date.now() - (data.lastActive || 0) > 5 * 60 * 1000;
        if (data.status !== "active" || stale) {
          shouldTrigger = true;
          t.set(runnerRef, { status: "active", startedAt: Date.now(), lastActive: Date.now(), triggeredJobId: jobId }, { merge: true });
        }
      });

      if (shouldTrigger) {
        const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_WORKFLOW = "blender-runner.yml" } = process.env;
        if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
          console.warn("GitHub env missing — job queued but runner NOT triggered.");
        } else {
          const hdr = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" };
          let busy = false;
          try {
            const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?status=queued,in_progress&per_page=5`, { headers: hdr });
            if (r.ok) {
              const d = await r.json();
              busy = (d.workflow_runs || []).some((x) => x.status === "queued" || x.status === "in_progress");
            }
          } catch (e) { console.warn("GitHub runs check failed, dispatching anyway:", e.message); }
          if (busy) {
            await runnerRef.set({ status: "active", lastActive: Date.now() }, { merge: true });
          } else {
            const d = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`, {
              method: "POST",
              headers: { ...hdr, "Content-Type": "application/json" },
              body: JSON.stringify({ ref: "main" }),
            });
            if (!d.ok) { console.error("Dispatch failed:", d.status); await runnerRef.update({ status: "inactive" }); }
          }
        }
      }
    } catch (e) { console.error("Runner check failed (job still queued):", e.message); }

    res.status(201).json({ jobId });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ error: e.message || "Internal server error" });
  }
};
