/* =========================================================================
   THE RANKER ROUTINE — website (no build step)
   1) Fill in the two values below from Supabase → Project Settings → API
   ========================================================================= */
const SUPABASE_URL = "https://jebuxabtlhejqezmgjpg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplYnV4YWJ0bGhlanFlem1nanBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzY1NzEsImV4cCI6MjA5Njc1MjU3MX0.wEI05WeRL8BKQggve0kvakEQvKzGl1nDrdNOD1RosJo";
/* ========================================================================= */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const app = $("app");
let profile = null;

const todayISO = () => new Date().toISOString().slice(0, 10);
const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }

// ---- stats helpers ----
function chkPct(set, name) { const d = set.filter((e) => e.checklist && e.checklist[name] != null); return d.length ? Math.round((100 * d.filter((e) => e.checklist[name] === true).length) / d.length) : 0; }
function streakOf(all) { if (!all.length) return 0; const dates = new Set(all.map((e) => e.date)); let s = 0; const d = new Date(); for (let i = 0; i < 400; i++) { const iso = d.toISOString().slice(0, 10); if (dates.has(iso)) s++; else if (i !== 0) break; d.setDate(d.getDate() - 1); } return s; }
function computeStats(set) {
  const nums = set.filter((e) => e.hours != null);
  const avgHours = nums.length ? nums.reduce((s, e) => s + Number(e.hours), 0) / nums.length : 0;
  const totHours = nums.reduce((s, e) => s + Number(e.hours), 0);
  const effs = set.filter((e) => e.eff != null);
  const avgEff = effs.length ? effs.reduce((s, e) => s + e.eff, 0) / effs.length : 0;
  const pcts = set.filter((e) => e.pct != null);
  const avgPct = pcts.length ? Math.round(pcts.reduce((s, e) => s + e.pct, 0) / pcts.length) : 0;
  return { avgHours, totHours, avgEff, avgPct, days: set.length, streak: streakOf(set), chk: { revision: chkPct(set, "revision"), dna: chkPct(set, "dna"), topper: chkPct(set, "topper") } };
}
function inRange(all, range) { if (range === "all") return all; const days = { week: 7, month: 30, quarter: 90 }[range] ?? 9999; const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); return all.filter((e) => new Date(e.date + "T00:00") >= cutoff); }

// ---- boot ----
(async function () {
  if (SUPABASE_URL.includes("YOUR-PROJECT")) {
    app.innerHTML = `<div class="empty">⚙️ Almost there — open <b>app.js</b> and paste your Supabase URL and anon key at the top (see README).</div>`;
    return;
  }
  sb.auth.onAuthStateChange(() => loadSession());
  loadSession();
})();

async function loadSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { profile = null; renderAuth(); return; }
  await sb.from("profiles").update({ last_seen: todayISO() }).eq("id", data.session.user.id);
  const { data: p } = await sb.from("profiles").select("*").eq("id", data.session.user.id).maybeSingle();
  profile = p ? { ...p, uid: data.session.user.id } : { uid: data.session.user.id, name: "Aspirant", role: "student" };
  if (profile.role === "admin") renderAdmin(); else renderStudent("log");
}

// ---------------- AUTH ----------------
let authMode = "signin";
function renderAuth() {
  app.innerHTML = `
  <div class="login"><div class="sheet"><div class="sheet-inner">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    <div class="seg">
      <button class="${authMode === "signin" ? "on" : ""}" id="mSignin">Sign in</button>
      <button class="${authMode === "signup" ? "on" : ""}" id="mSignup">Create account</button>
    </div>
    <div class="seclabel" style="text-align:center;margin-top:0">${authMode === "signup" ? "Join the routine" : "Welcome back, future ranker"}</div>
    <p>${authMode === "signup" ? "Create your account to start logging. Only you can see your own targets." : "Sign in to fill your daily routine."}</p>
    ${authMode === "signup" ? `<label class="f">Your name</label><input type="text" id="aName" placeholder="e.g. Aarav Sharma">` : ""}
    <label class="f">Email</label><input type="email" id="aEmail" placeholder="you@example.com">
    <label class="f">Password</label><input type="password" id="aPass" placeholder="••••••••">
    <button class="btn orange" id="aGo">${authMode === "signup" ? "Create account" : "Sign in"}</button>
    <div class="hint" id="aMsg"></div>
  </div></div>
  <div class="joincta">
    <div class="joincta-text">Preparing for <b>UPSC</b> &amp; other <b>State PCS</b> exams?</div>
    <a class="joinbtn" href="https://www.upscresolve.com" target="_blank" rel="noopener">🚀 Join Now</a>
  </div></div>`;
  $("mSignin").onclick = () => { authMode = "signin"; renderAuth(); };
  $("mSignup").onclick = () => { authMode = "signup"; renderAuth(); };
  const go = async () => {
    const email = $("aEmail").value.trim(), pass = $("aPass").value;
    const msg = $("aMsg"); msg.textContent = ""; msg.style.color = "var(--navy)";
    $("aGo").disabled = true; $("aGo").textContent = "Please wait…";
    try {
      if (authMode === "signup") {
        const name = $("aName").value.trim();
        if (!name) throw new Error("Please enter your name.");
        const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
        if (error) throw error;
        msg.textContent = "Account created. If email confirmation is on, check your inbox, then sign in.";
        authMode = "signin"; setTimeout(renderAuth, 1800);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      }
    } catch (e) { msg.style.color = "var(--bad)"; msg.textContent = e.message; $("aGo").disabled = false; $("aGo").textContent = authMode === "signup" ? "Create account" : "Sign in"; }
  };
  $("aGo").onclick = go;
  $("aPass").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function topbar() {
  return `<div class="topbar">
    <div class="who"><b>${profile.name}</b><span class="badge ${profile.role === "admin" ? "admin" : ""}">${profile.role === "admin" ? "ADMIN" : "STUDENT"}</span></div>
    <button class="signout" id="signout">Sign out</button></div>`;
}
function wireTop() { $("signout").onclick = () => sb.auth.signOut(); }

// ---------------- STUDENT ----------------
function renderStudent(tab) {
  app.innerHTML = topbar() + `
  <div class="tabs">
    <button class="tab ${tab === "log" ? "active" : ""}" id="tLog">Today's Log</button>
    <button class="tab ${tab === "rep" ? "active" : ""}" id="tRep">My Reports</button>
  </div><div id="view"></div>`;
  wireTop();
  $("tLog").onclick = () => renderStudent("log");
  $("tRep").onclick = () => renderStudent("rep");
  if (tab === "log") studentLog(); else renderReport($("view"), profile.uid, profile.name, "student");
}

async function studentLog() {
  const date = todayISO();
  const { data: ex0 } = await sb.from("entries").select("*").eq("user_id", profile.uid).eq("date", date).maybeSingle();
  const ex = ex0 || {};
  const t = (ex.targets && ex.targets.length ? ex.targets : ["", "", "", "", ""]).slice(0, 5);
  while (t.length < 5) t.push("");
  const chk = { revision: null, dna: null, topper: null, ...(ex.checklist || {}) };
  $("view").innerHTML = `
  <div class="sheet"><div class="sheet-inner">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    <label class="f">Date</label><input type="date" id="date" value="${ex.date || date}">
    <div class="seclabel">Today's Targets &amp; Reflections</div>
    ${[0, 1, 2, 3, 4].map((i) => `<div class="target-row"><span class="dot"></span><input type="text" id="t${i}" value="${(t[i] || "").replace(/"/g, "&quot;")}" placeholder="Target / reflection ${i + 1}"></div>`).join("")}
    <div class="metrics" style="margin-top:18px">
      <div class="metric"><div class="k">% of Target Achieved</div><div class="rangeval"><span id="pctVal">${ex.pct ?? 70}</span>%</div><input type="range" id="pct" min="0" max="100" step="5" value="${ex.pct ?? 70}"></div>
      <div class="metric"><div class="k">Hours Studied</div><input type="number" id="hours" min="0" max="24" step="0.5" value="${ex.hours ?? ""}" placeholder="e.g. 8.5" style="font-family:'Fraunces';font-size:22px;font-weight:700;color:var(--orange)"></div>
    </div>
    <label class="f">Efficiency Rating (1–5)</label>
    <div class="pillrow" id="effRow">${[1, 2, 3, 4, 5].map((n) => `<button class="pill ${ex.eff === n ? "on" : ""}" data-eff="${n}">${n}</button>`).join("")}</div>
    <div class="seclabel">Targets for Tomorrow</div><textarea id="tmrw" placeholder="What does tomorrow look like?">${ex.tomorrow || ""}</textarea>
    <div class="seclabel">Daily Checklist</div>
    ${[["revision", "REVISION"], ["dna", "DNA"], ["topper", "Topper Copies"]].map(([k, l]) => `<div class="check ${chk[k] === true ? "yes" : chk[k] === false ? "no" : ""}" data-chk="${k}"><span class="name">${l}</span><span class="state">${chk[k] === true ? "✓" : chk[k] === false ? "✕" : "·"}</span></div>`).join("")}
    <div class="manifest"><div class="seclabel">✦ Manifestation ✦</div><textarea id="manifest" placeholder="Write it like it's already yours...">${ex.manifest || ""}</textarea></div>
    <button class="btn" id="saveBtn">Save today's routine</button>
  </div></div>`;
  const v = $("view");
  $("pct").addEventListener("input", (e) => ($("pctVal").textContent = e.target.value));
  v.querySelectorAll("[data-eff]").forEach((b) => (b.onclick = () => { v.querySelectorAll("[data-eff]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
  v.querySelectorAll("[data-chk]").forEach((c) => (c.onclick = () => { const yes = c.classList.contains("yes"), no = c.classList.contains("no"); c.classList.remove("yes", "no"); const st = c.querySelector(".state"); if (!yes && !no) { c.classList.add("yes"); st.textContent = "✓"; } else if (yes) { c.classList.add("no"); st.textContent = "✕"; } else { st.textContent = "·"; } }));
  $("saveBtn").onclick = async () => {
    const eb = v.querySelector("[data-eff].on");
    const rc = (n) => { const el = v.querySelector(`[data-chk="${n}"]`); return el.classList.contains("yes") ? true : el.classList.contains("no") ? false : null; };
    const row = { user_id: profile.uid, date: $("date").value || date, targets: [0, 1, 2, 3, 4].map((i) => $("t" + i).value.trim()), pct: +$("pct").value, hours: $("hours").value === "" ? null : +$("hours").value, eff: eb ? +eb.dataset.eff : null, tomorrow: $("tmrw").value.trim(), checklist: { revision: rc("revision"), dna: rc("dna"), topper: rc("topper") }, manifest: $("manifest").value.trim(), updated_at: new Date().toISOString() };
    const { error } = await sb.from("entries").upsert(row, { onConflict: "user_id,date" });
    toast(error ? "Save failed — try again" : "Saved ✓  Keep the streak alive!");
  };
}

// ---------------- ADMIN ----------------
async function renderAdmin() {
  app.innerHTML = topbar() + `<div id="view"></div>`; wireTop();
  const v = $("view");
  const { data: profiles } = await sb.from("profiles").select("*").eq("role", "student");
  const { data: entries } = await sb.from("entries").select("*");
  if (!profiles || profiles.length === 0) { v.innerHTML = `<div class="empty">No students yet. Ask a student to sign up and log a day.</div>`; return; }
  const byUser = {}; (entries || []).forEach((e) => (byUser[e.user_id] ||= []).push(e));
  const roster = profiles.map((p) => { const es = byUser[p.id] || []; return { ...p, stats: computeStats(es), count: es.length }; }).sort((a, b) => b.stats.totHours - a.stats.totHours);
  const isRecent = (iso) => iso && (Date.now() - new Date(iso + "T00:00")) / 864e5 <= 7;
  const totH = roster.reduce((s, r) => s + r.stats.totHours, 0);
  const withEff = roster.filter((r) => r.stats.avgEff > 0);
  const cohortEff = withEff.length ? withEff.reduce((s, r) => s + r.stats.avgEff, 0) / withEff.length : 0;
  const active = roster.filter((r) => isRecent(r.last_seen)).length;
  v.innerHTML = `
  <div class="cohort">
    <div class="c"><div class="n">${roster.length}</div><div class="l">Students</div></div>
    <div class="c"><div class="n">${active}</div><div class="l">Active (7d)</div></div>
    <div class="c"><div class="n">${totH.toFixed(0)}</div><div class="l">Total hours</div></div>
    <div class="c"><div class="n">${cohortEff.toFixed(1)}</div><div class="l">Avg efficiency</div></div>
  </div>
  <div class="seclabel" style="margin-top:4px">Students — by total hours</div>
  <div class="roster">${roster.map((r) => `
    <div class="srow" data-id="${r.id}" data-name="${(r.name || "").replace(/"/g, "&quot;")}">
      <div class="avatar">${initials(r.name || "A")}</div>
      <div class="info"><div class="nm">${r.name}<span class="pillsmall ${isRecent(r.last_seen) ? "live" : "idle"}">${isRecent(r.last_seen) ? "active" : "idle"}</span></div>
        <div class="meta">${r.count} ${r.count === 1 ? "day" : "days"} · ${r.stats.streak}d streak · ${r.stats.avgPct}% targets · eff ${r.stats.avgEff.toFixed(1)}/5</div></div>
      <div class="perf"><div class="h">${r.stats.totHours.toFixed(0)}h</div><div class="hl">${r.stats.avgHours.toFixed(1)}h/day</div></div>
    </div>`).join("")}</div>`;
  v.querySelectorAll("[data-id]").forEach((el) => (el.onclick = () => adminDetail(el.dataset.id, el.dataset.name)));
}

function adminDetail(uid, name) {
  app.innerHTML = topbar() + `<div id="view"></div>`; wireTop();
  const v = $("view");
  v.innerHTML = `<button class="back" id="back">← All students</button><div class="seclabel" style="margin-top:0">${name}</div><div id="rep"></div>`;
  $("back").onclick = renderAdmin;
  renderReport($("rep"), uid, name, "admin");
}

// ---------------- REPORTS (student + admin) ----------------
const rangeState = {};
async function renderReport(container, uid, name, role) {
  const { data: all } = await sb.from("entries").select("*").eq("user_id", uid).order("date", { ascending: false });
  if (!all || all.length === 0) { container.innerHTML = `<div class="empty">No entries yet for ${name}.</div>`; return; }
  const range = rangeState[uid] || "week";
  const set = inRange(all, range);
  const st = computeStats(set);
  const chrono = [...set].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
  const maxH = Math.max(8, ...chrono.map((e) => Number(e.hours) || 0));
  container.innerHTML = `
  <div class="rangepick">${[["week", "Week"], ["month", "Month"], ["quarter", "3 Mo"], ["all", "All"]].map(([k, l]) => `<button class="${range === k ? "on" : ""}" data-r="${k}">${l}</button>`).join("")}</div>
  <div class="stats">
    <div class="stat"><div class="big">${st.avgHours.toFixed(1)}<small>h</small></div><div class="lbl">Avg / day</div></div>
    <div class="stat"><div class="big">${st.totHours.toFixed(0)}<small>h</small></div><div class="lbl">Total hours</div></div>
    <div class="stat"><div class="big">${st.avgEff.toFixed(1)}<small>/5</small></div><div class="lbl">Efficiency</div></div>
    <div class="stat"><div class="big">${st.avgPct}<small>%</small></div><div class="lbl">Targets hit</div></div>
    <div class="stat"><div class="big">${st.streak}<small>d</small></div><div class="lbl">Streak 🔥</div></div>
    <div class="stat"><div class="big">${set.length}</div><div class="lbl">Days logged</div></div>
  </div>
  <div class="chartcard"><h3>Study hours</h3><div class="barwrap">${chrono.map((e) => `<div class="bar" style="height:${Math.round((100 * (Number(e.hours) || 0)) / maxH)}%" title="${e.date}: ${e.hours || 0}h"></div>`).join("")}</div><div class="barlbls">${chrono.map((e) => `<span>${e.date.slice(8)}</span>`).join("")}</div></div>
  <div class="chartcard"><h3>Efficiency (1–5)</h3><div class="barwrap">${chrono.map((e) => `<div class="bar eff" style="height:${Math.round((100 * (e.eff || 0)) / 5)}%" title="${e.date}: ${e.eff || "-"}/5"></div>`).join("")}</div><div class="barlbls">${chrono.map((e) => `<span>${e.date.slice(8)}</span>`).join("")}</div></div>
  <div class="chartcard"><h3>Checklist consistency</h3>${[["Revision", st.chk.revision], ["DNA", st.chk.dna], ["Topper copies", st.chk.topper]].map(([n, p]) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px"><span>${n}</span><span style="color:var(--orange)">${p}%</span></div><div style="height:8px;background:var(--line2);border-radius:6px;overflow:hidden"><div style="height:100%;width:${p}%;background:var(--orange)"></div></div></div>`).join("")}</div>
  <div class="aibox"><h3>✦ AI Coach Report</h3><div class="sub">${role === "admin" ? `Coaching read for ${name}` : "A personalised read of your performance, by Claude."}</div><div class="report" id="aiReport">Tap below to generate the report.</div><button class="btn orange" id="aiBtn" style="margin-top:16px">Generate report</button></div>`;
  container.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rangeState[uid] = b.dataset.r; renderReport(container, uid, name, role); }));
  $("aiBtn").onclick = async () => {
    const btn = $("aiBtn"), out = $("aiReport");
    btn.disabled = true; btn.textContent = "Analysing…";
    try {
      const { data, error } = await sb.functions.invoke("daily-report", { body: { userId: uid, range } });
      if (error) throw error;
      out.innerHTML = (data.report || "No report returned.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br/>");
      btn.style.display = "none";
    } catch (e) { out.textContent = "Couldn't generate — make sure the AI function is deployed (see README)."; btn.disabled = false; btn.textContent = "Try again"; }
  };
}
