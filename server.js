// ponytail: the ONLY backend file. Plain-JS port of reference app/api/submit-job/route.ts
// + GET proxies so the browser never needs Firebase keys or a SDK.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname)); // serves index.html, job.html, guide.html directly

// ---- Firebase Admin (lazy, same as reference) ----
let db = null;
function getDb() {
  if (db) return db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_CONFIG;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env");
  const cred = JSON.parse(raw);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
  db = admin.firestore();
  return db;
}

const FORMATS = ["glb", "fbx", "stl", "usd"];
const QUALITIES = ["draft", "standard", "cinematic"];

// ---- POST /api/submit-job (mirrors reference route.ts) ----
app.post("/api/submit-job", async (req, res) => {
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
    console.log(`Job created: ${jobId} (${formats.join(", ")})`);

    // Runner lock (same transaction as reference)
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
          console.warn("GitHub env missing — job queued but runner NOT triggered (set GITHUB_TOKEN/OWNER/REPO).");
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
            console.log("Runner already active — job queued.");
          } else {
            const d = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`, {
              method: "POST",
              headers: { ...hdr, "Content-Type": "application/json" },
              body: JSON.stringify({ ref: "main" }),
            });
            if (d.ok) console.log(`Workflow dispatched for ${jobId}`);
            else { console.error("Dispatch failed:", d.status); await runnerRef.update({ status: "inactive" }); }
          }
        }
      } else console.log(`Job ${jobId} queued — runner already ACTIVE.`);
    } catch (e) { console.error("Runner check failed (job still queued):", e.message); }

    res.status(201).json({ jobId });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ error: e.message || "Internal server error" });
  }
});

// ---- GET /api/job/:id — lets job.html poll WITHOUT Firebase keys in the browser ----
app.get("/api/job/:id", async (req, res) => {
  try {
    const snap = await getDb().collection("jobs").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Job not found" });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Query-param alias (same shape Vercel serves): GET /api/job?id=...
app.get("/api/job", async (req, res) => {
  try {
    if (!req.query.id) return res.status(400).json({ error: "Missing id" });
    const snap = await getDb().collection("jobs").doc(req.query.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Job not found" });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- GET /api/runner — status pill without a Firestore SDK ----
app.get("/api/runner", async (req, res) => {
  try {
    const snap = await getDb().collection("system").doc("runner").get();
    res.json(snap.exists ? snap.data() : { status: "inactive" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BlenderLab mini backend: http://localhost:${PORT}`));
