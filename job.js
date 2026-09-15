// Job page: ?id= -> poll GET /api/job/:id -> stepper + 3D viewer. Plain fetch, no SDK.
const id = new URLSearchParams(location.search).get("id") || "";
let saved = null;
try { saved = JSON.parse(localStorage.getItem("bl_job_" + id) || "null"); } catch { saved = null; }
const statusEl = document.getElementById("status");
const msgEl = document.getElementById("msg");
const API = ((typeof BL_CONFIG !== "undefined" && BL_CONFIG.API_URL) ||
  (location.protocol.indexOf("http") === 0 ? location.origin : "")).replace(/\/$/, "");

document.getElementById("jobId").textContent = id ? "job " + id : "(missing id)";
document.getElementById("scriptPrev").textContent = (saved && saved.script) || "—";

function setStatus(s) {
  statusEl.textContent = s.toUpperCase();
  statusEl.className = "pill " + s;
}

// Stepper: queued -> processing -> done (failed marks the current step).
function setSteps(status) {
  const order = ["queued", "processing", "done"];
  const items = document.querySelectorAll("#steps li");
  items.forEach((li) => li.classList.remove("current", "passed", "failed-step"));
  if (status === "failed") {
    const cur = document.querySelector('#steps li[data-step="processing"]');
    if (cur) cur.classList.add("failed-step");
    const q = document.querySelector('#steps li[data-step="queued"]');
    if (q) q.classList.add("passed");
    return;
  }
  const idx = order.indexOf(status);
  items.forEach((li) => {
    const i = order.indexOf(li.dataset.step);
    if (i < idx || status === "done") li.classList.add("passed");
    if (i === idx && status !== "done") li.classList.add("current");
  });
  if (status === "done") {
    const d = document.querySelector('#steps li[data-step="done"]');
    if (d) d.classList.add("current");
  }
}

function fmtSize(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

function showModel(url, formats, size) {
  document.getElementById("viewerWrap").style.display = "block";
  document.getElementById("viewer").setAttribute("src", url);
  document.getElementById("hudMeta").textContent =
    "glb · " + fmtSize(size) + " · drag to orbit";
  const dl = document.getElementById("dl");
  dl.innerHTML = "";
  (formats || ["glb"]).forEach((f) => {
    const a = document.createElement("a");
    a.href = url; a.textContent = "Download ." + f.toUpperCase(); a.target = "_blank"; a.rel = "noopener";
    dl.appendChild(a);
  });
}

function fail(msg) {
  setStatus("failed");
  setSteps("failed");
  msgEl.textContent = msg;
}

if (!id) {
  fail("Missing job id.");
} else if (!API) {
  fail("Backend not configured (API_URL is empty).");
} else {
  setStatus("queued");
  setSteps("queued");
  const tick = async () => {
    let job;
    try {
      const r = await fetch(API + "/api/job?id=" + encodeURIComponent(id));
      const text = await r.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      if (!body) throw new Error("No API at " + API + " (HTTP " + r.status + "). Open the app via `npm start` at http://localhost:3000 — Live Server and file:// have no backend.");
      if (!r.ok) throw new Error(body.error || ("Request failed (HTTP " + r.status + ")"));
      job = body;
    } catch (e) {
      fail(e.message || "Backend unreachable.");
      return;
    }
    const status = job.status || "queued";
    const outs = job.outputs || {};
    const fmts = (saved && saved.formats) || job.formats || [];

    document.getElementById("kvQuality").textContent = job.quality || (saved && saved.quality) || "—";
    document.getElementById("kvFormats").textContent = fmts.map((f) => "." + f).join("  ") || "—";
    if (outs.glb && outs.glb.size) document.getElementById("kvSize").textContent = fmtSize(outs.glb.size);

    setStatus(status);
    setSteps(status);
    if (status === "done") {
      if (!outs.glb || !outs.glb.url) { fail("Job finished but no GLB output was produced."); return; }
      msgEl.textContent = "";
      showModel(outs.glb.url, ["glb"], outs.glb.size);
      const dl = document.getElementById("dl");
      Object.keys(outs).forEach((f) => {
        if (f === "glb" || f === "preview" || !outs[f] || !outs[f].url) return;
        const a = document.createElement("a");
        a.href = outs[f].url; a.textContent = "Download ." + f.toUpperCase();
        a.target = "_blank"; a.rel = "noopener";
        a.style.background = "var(--surface-2)"; a.style.color = "var(--text)";
        a.style.border = "1px solid var(--line-strong)";
        dl.appendChild(a);
      });
      const extra = Object.keys(outs).filter((f) => f !== "preview" && outs[f] && outs[f].url).length;
      document.getElementById("hudMeta").textContent =
        "glb · " + fmtSize(outs.glb.size) + (extra > 1 ? " · +" + (extra - 1) + " more below" : " · drag to orbit");
      return; // stop polling
    }
    if (status === "failed") {
      const box = document.getElementById("errBox");
      box.style.display = "block";
      document.getElementById("errText").textContent = job.error || "Unknown worker error.";
      fail(job.error || "Job failed.");
      return;
    }
    if (status === "processing") msgEl.textContent = "Blender is running your script — usually 30s to a few minutes.";
    setTimeout(tick, BL_CONFIG.POLL_MS);
  };
  tick();
}
