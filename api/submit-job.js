// POST /api/submit-job — Vercel serverless version of server.js handler.
// Same validation, same Firestore write, same runner lock + GitHub dispatch.
const { getDb, cors } = require("./_db");

const FORMATS = ["glb", "fbx", "stl", "usd"];
const QUALITIES = ["draft", "standard", "cinematic"];

module.exports = async (req, res) => {
  if (cors(req, res)) return;
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

    // Runner lock: Firestore is a hint, GitHub runs are the truth.
    // A dead worker can leave status=active behind; verify before trusting it.
    const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_WORKFLOW = "blender-runner.yml" } = process.env;
    const ghHeaders = GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } : null;

    // true = a runner workflow is really alive; false = safe to dispatch; null = couldn't check
    const githubBusy = async () => {
      if (!ghHeaders || !GITHUB_OWNER || !GITHUB_REPO) return null;
      try {
        const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?status=queued,in_progress&per_page=5`, { headers: ghHeaders });
        if (!r.ok) return null;
        const d = await r.json();
        return (d.workflow_runs || []).some((x) => x.status === "queued" || x.status === "in_progress");
      } catch (e) { console.warn("GitHub runs check failed:", e.message); return null; }
    };

    const dispatchRunner = async (reason) => {
      if (!ghHeaders || !GITHUB_OWNER || !GITHUB_REPO) {
        console.warn("GitHub env missing — job queued but runner NOT triggered.");
        return;
      }
      console.log(`Dispatching runner (${reason})...`);
      const d = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`, {
        method: "POST",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
      });
      if (!d.ok) { console.error("Dispatch failed:", d.status); await database.collection("system").doc("runner").update({ status: "inactive" }); }
    };

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
        const busy = await githubBusy();
        if (busy) {
          await runnerRef.set({ status: "active", lastActive: Date.now() }, { merge: true });
        } else {
          await dispatchRunner(busy === false ? "no live workflow found" : "could not verify, dispatching anyway");
        }
      } else {
        // Lock claims active — confirm a workflow is really alive first.
        const busy = await githubBusy();
        if (busy === false) {
          console.log("Stale runner lock (no live workflow) — resetting and dispatching.");
          await runnerRef.set({ status: "active", startedAt: Date.now(), lastActive: Date.now(), triggeredJobId: jobId }, { merge: true });
          await dispatchRunner("stale lock reset");
        } else if (busy !== null) {
          console.log(`Job ${jobId} queued — runner already ACTIVE.`);
        } else {
          console.log(`Job ${jobId} queued — runner lock active (GitHub unverifiable).`);
        }
      }
    } catch (e) { console.error("Runner check failed (job still queued):", e.message); }

    res.status(201).json({ jobId });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ error: e.message || "Internal server error" });
  }
};
