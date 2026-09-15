// Home page: read form -> POST /api/submit-job -> redirect to job.html?id=.
let quality = "standard";
const formats = new Set(["glb"]);
const $ = (id) => document.getElementById(id);
// Same-origin when API_URL is "" (npm start serves frontend too; Vercel same).
const API = ((typeof BL_CONFIG !== "undefined" && BL_CONFIG.API_URL) ||
  (location.protocol.indexOf("http") === 0 ? location.origin : "")).replace(/\/$/, "");

const QUALITY_NOTES = {
  draft: "<b>Draft</b> — fast export, basic lighting, ~30s",
  standard: "<b>Standard</b> — HDRI + PBR clearcoat + bloom, ~90s",
  cinematic: "<b>Cinematic</b> — 4K + depth of field + volumetrics, ~4min"
};

document.querySelectorAll("#qualityRow .chip").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("#qualityRow .chip").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    quality = b.dataset.q;
    $("qualityNote").innerHTML = QUALITY_NOTES[quality];
  };
});

document.querySelectorAll("#formatRow .chip").forEach((b) => {
  b.onclick = () => {
    b.classList.toggle("on");
    b.classList.contains("on") ? formats.add(b.dataset.f) : formats.delete(b.dataset.f);
  };
});

$("script").placeholder = SAMPLE_SCRIPT;

// Copy button + Cmd/Ctrl+Enter to submit (editor conveniences).
$("copyBtn").onclick = () => {
  navigator.clipboard.writeText($("script").value || SAMPLE_SCRIPT);
  $("copyBtn").textContent = "copied";
  setTimeout(() => ($("copyBtn").textContent = "copy"), 1200);
};
$("script").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); $("submitBtn").click(); }
});

// Live runner + API dots (best-effort; silently absent when backend is down).
(async () => {
  try {
    const r = await fetch(API + "/api/runner");
    if (!r.ok) return;
    const info = await r.json();
    if (info && info.status === "active") {
      $("runnerPill").classList.add("live");
      $("runnerText").textContent = "worker active";
    } else {
      $("runnerText").textContent = "worker idle";
    }
  } catch { /* backend down — dots stay neutral */ }
  try {
    const h = await fetch(API + "/api/health");
    if (h.ok) $("apiHealth").classList.add("up");
  } catch { /* ignore */ }
})();

$("submitBtn").onclick = async () => {
  const script = $("script").value.trim() || SAMPLE_SCRIPT;
  if (formats.size === 0) { $("msg").textContent = "Select at least one format."; return; }
  if (!API) { $("msg").textContent = "Backend not configured."; return; }
  $("msg").textContent = "";
  $("submitBtn").disabled = true;
  $("submitBtn").textContent = "Submitting…";

  try {
    const res = await fetch(API + "/api/submit-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, formats: [...formats], quality })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Submit failed");
    try {
      localStorage.setItem("bl_job_" + data.jobId, JSON.stringify({ script, formats: [...formats], quality, t: Date.now() }));
    } catch { /* private mode — job page still works without cached script */ }
    location.href = "job.html?id=" + data.jobId;
  } catch (e) {
    $("msg").textContent = e.message || "Backend unreachable. Is `npm start` running?";
    $("submitBtn").disabled = false;
    $("submitBtn").textContent = "Render model";
  }
};
