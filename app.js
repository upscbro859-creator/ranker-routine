/* =========================================================================
   THE RANKER ROUTINE — website (library-free build)
   Talks to Supabase directly with fetch(). No external library to load.
   Your keys are already filled in below.
   ========================================================================= */
const SUPABASE_URL = "https://jebuxabtlhejqezmgjpg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplYnV4YWJ0bGhlanFlem1nanBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzY1NzEsImV4cCI6MjA5Njc1MjU3MX0.wEI05WeRL8BKQggve0kvakEQvKzGl1nDrdNOD1RosJo";
/* ========================================================================= */

const $ = (id) => document.getElementById(id);
const app = $("app");
let profile = null;
const todayISO = () => new Date().toISOString().slice(0, 10);
const initials = (n) => (n || "A").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }

// ---------- Supabase via plain fetch (no library) ----------
const SB = {
  url: SUPABASE_URL, key: SUPABASE_ANON_KEY, token: null, refresh: null, user: null,
  load() { try { const t = JSON.parse(localStorage.getItem("sb_tok")); if (t) { this.token = t.a; this.refresh = t.r; } } catch (e) {} },
  save() { try { localStorage.setItem("sb_tok", JSON.stringify({ a: this.token, r: this.refresh })); } catch (e) {} },
  clear() { this.token = null; this.refresh = null; this.user = null; try { localStorage.removeItem("sb_tok"); } catch (e) {} },
  headers(json) { const h = { apikey: this.key }; if (json) h["Content-Type"] = "application/json"; if (this.token) h["Authorization"] = "Bearer " + this.token; return h; },
  async signUp(email, password, name) {
    const r = await fetch(this.url + "/auth/v1/signup", { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, data: { name } }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.msg || d.error_description || d.error || "Sign up failed");
    if (d.access_token) { this.token = d.access_token; this.refresh = d.refresh_token; this.user = d.user; this.save(); }
    return d;
  },
  async signIn(email, password) {
    const r = await fetch(this.url + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.msg || d.error_description || d.error || "Sign in failed");
    this.token = d.access_token; this.refresh = d.refresh_token; this.user = d.user; this.save(); return d;
  },
  async refreshSession() {
    if (!this.refresh) return false;
    const r = await fetch(this.url + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: this.refresh }) });
    if (!r.ok) { this.clear(); return false; }
    const d = await r.json(); this.token = d.access_token; this.refresh = d.refresh_token; this.user = d.user; this.save(); return true;
  },
  async getUser() {
    if (!this.token) return null;
    let r = await fetch(this.url + "/auth/v1/user", { headers: this.headers() });
    if (r.status === 401) { if (!(await this.refreshSession())) return null; r = await fetch(this.url + "/auth/v1/user", { headers: this.headers() }); }
    if (!r.ok) return null;
    const d = await r.json(); this.user = d; return d;
  },
  signOut() { this.clear(); },
  async rest(path, opts) {
    opts = opts || {}; opts.headers = Object.assign(this.headers(opts.json), opts.headers || {}); delete opts.json;
    let r = await fetch(this.url + "/rest/v1/" + path, opts);
    if (r.status === 401 && this.refresh) { if (await this.refreshSession()) { opts.headers = Object.assign(this.headers(true), opts.headers || {}); r = await fetch(this.url + "/rest/v1/" + path, opts); } }
    return r;
  },
};

// ---------- data ----------
async function getProfile(uid) { const r = await SB.rest("profiles?select=*&id=eq." + uid); const a = r.ok ? await r.json() : []; return a[0] || null; }
async function touchLastSeen(uid) { try { await SB.rest("profiles?id=eq." + uid, { method: "PATCH", json: true, headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen: todayISO() }) }); } catch (e) {} }
async function entriesFor(uid) { const r = await SB.rest("entries?select=*&user_id=eq." + uid + "&order=date.desc"); return r.ok ? await r.json() : []; }
async function todayEntry(uid) { const r = await SB.rest("entries?select=*&user_id=eq." + uid + "&date=eq." + todayISO()); const a = r.ok ? await r.json() : []; return a[0] || null; }
async function saveEntry(row) { return SB.rest("entries?on_conflict=user_id,date", { method: "POST", json: true, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) }); }
async function listStudents() { const r = await SB.rest("profiles?select=*&role=eq.student"); return r.ok ? await r.json() : []; }
async function allEntries() { const r = await SB.rest("entries?select=*"); return r.ok ? await r.json() : []; }

// ---------- stats ----------
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

// ---------- boot ----------
(async function () {
  app.innerHTML = '<div class="empty">Loading…</div>';
  SB.load();
  await loadSession();
})();

async function loadSession() {
  try {
    const user = await Promise.race([
      SB.getUser(),
      new Promise((res) => setTimeout(() => res("__timeout"), 6000))
    ]);
    if (user === "__timeout") { profile = null; renderAuth(); return; }
    if (!user) { profile = null; renderAuth(); return; }
    touchLastSeen(user.id);
    let p = null; try { p = await getProfile(user.id); } catch (e) {}
    profile = p ? { ...p, uid: user.id } : { uid: user.id, name: (user.user_metadata && user.user_metadata.name) || "Aspirant", role: "student" };
    if (profile.role === "admin") renderAdmin(); else renderStudent("log");
  } catch (e) { profile = null; renderAuth(); }
}

// ---------- AUTH ----------
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
    ${authMode === "signup" ? `<label class="f">Your name</label><input type="text" id="aName" placeholder="e.g. Aarav Sharma" autocomplete="off">` : ""}
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
    const email = $("aEmail").value.trim(), pass = $("aPass").value, msg = $("aMsg");
    msg.textContent = ""; msg.style.color = "var(--navy)";
    $("aGo").disabled = true; $("aGo").textContent = "Please wait…";
    try {
      if (authMode === "signup") {
        const name = $("aName").value.trim(); if (!name) throw new Error("Please enter your name.");
        await SB.signUp(email, pass, name);
        if (SB.token) { await loadSession(); return; }
        msg.textContent = "Account created. If email confirmation is on, check your inbox, then sign in.";
        authMode = "signin"; setTimeout(renderAuth, 1800);
      } else {
        await SB.signIn(email, pass); await loadSession(); return;
      }
    } catch (e) { msg.style.color = "var(--bad)"; msg.textContent = e.message; }
    if ($("aGo")) { $("aGo").disabled = false; $("aGo").textContent = authMode === "signup" ? "Create account" : "Sign in"; }
  };
  $("aGo").onclick = go;
  $("aPass").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function topbar() { return `<div class="topbar"><div class="who"><b>${profile.name}</b><span class="badge ${profile.role === "admin" ? "admin" : ""}">${profile.role === "admin" ? "ADMIN" : "STUDENT"}</span></div><button class="signout" id="signout">Sign out</button></div>`; }
function wireTop() { $("signout").onclick = () => { SB.signOut(); profile = null; renderAuth(); }; }

// ---------- STUDENT ----------
function renderStudent(tab) {
  app.innerHTML = topbar() + `<div class="tabs"><button class="tab ${tab === "log" ? "active" : ""}" id="tLog">Today's Log</button><button class="tab ${tab === "rep" ? "active" : ""}" id="tRep">My Reports</button></div><div id="view"></div>`;
  wireTop(); $("tLog").onclick = () => renderStudent("log"); $("tRep").onclick = () => renderStudent("rep");
  if (tab === "log") studentLog(); else renderReport($("view"), profile.uid, profile.name, "student");
}
async function studentLog() {
  $("view").innerHTML = '<div class="empty">Loading…</div>';
  const date = todayISO(); const ex = (await todayEntry(profile.uid)) || {};
  const t = (ex.targets && ex.targets.length ? ex.targets : ["", "", "", "", ""]).slice(0, 5); while (t.length < 5) t.push("");
  const chk = { revision: null, dna: null, topper: null, ...(ex.checklist || {}) };
  $("view").innerHTML = `<div class="sheet"><div class="sheet-inner">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    <label class="f">Date</label><input type="date" id="date" value="${ex.date || date}">
    <div class="seclabel">Today's Targets &amp; Reflections</div>
    ${[0,1,2,3,4].map((i) => `<div class="target-row"><span class="dot"></span><input type="text" id="t${i}" value="${(t[i]||"").replace(/"/g,"&quot;")}" placeholder="Target / reflection ${i+1}"></div>`).join("")}
    <div class="metrics" style="margin-top:18px"><div class="metric"><div class="k">% of Target Achieved</div><div class="rangeval"><span id="pctVal">${ex.pct ?? 70}</span>%</div><input type="range" id="pct" min="0" max="100" step="5" value="${ex.pct ?? 70}"></div>
    <div class="metric"><div class="k">Hours Studied</div><input type="number" id="hours" min="0" max="24" step="0.5" value="${ex.hours ?? ""}" placeholder="e.g. 8.5" style="font-family:Fraunces;font-size:22px;font-weight:700;color:var(--orange)"></div></div>
    <label class="f">Efficiency Rating (1–5)</label><div class="pillrow" id="effRow">${[1,2,3,4,5].map((n) => `<button class="pill ${ex.eff===n?"on":""}" data-eff="${n}">${n}</button>`).join("")}</div>
    <div class="seclabel">Targets for Tomorrow</div><textarea id="tmrw" placeholder="What does tomorrow look like?">${ex.tomorrow || ""}</textarea>
    <div class="seclabel">Daily Checklist</div>
    ${[["revision","REVISION"],["dna","DNA"],["topper","Topper Copies"]].map((p) => `<div class="check ${chk[p[0]]===true?"yes":chk[p[0]]===false?"no":""}" data-chk="${p[0]}"><span class="name">${p[1]}</span><span class="state">${chk[p[0]]===true?"✓":chk[p[0]]===false?"✕":"·"}</span></div>`).join("")}
    <div class="manifest"><div class="seclabel">✦ Manifestation ✦</div><textarea id="manifest" placeholder="Write it like it's already yours...">${ex.manifest || ""}</textarea></div>
    <button class="btn" id="saveBtn">Save today's routine</button></div></div>`;
  const v = $("view");
  $("pct").addEventListener("input", (e) => ($("pctVal").textContent = e.target.value));
  v.querySelectorAll("[data-eff]").forEach((b) => (b.onclick = () => { v.querySelectorAll("[data-eff]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
  v.querySelectorAll("[data-chk]").forEach((c) => (c.onclick = () => { const yes = c.classList.contains("yes"), no = c.classList.contains("no"); c.classList.remove("yes", "no"); const st = c.querySelector(".state"); if (!yes && !no) { c.classList.add("yes"); st.textContent = "✓"; } else if (yes) { c.classList.add("no"); st.textContent = "✕"; } else { st.textContent = "·"; } }));
  $("saveBtn").onclick = async () => {
    const eb = v.querySelector("[data-eff].on");
    const rc = (n) => { const el = v.querySelector(`[data-chk="${n}"]`); return el.classList.contains("yes") ? true : el.classList.contains("no") ? false : null; };
    const row = { user_id: profile.uid, date: $("date").value || date, targets: [0,1,2,3,4].map((i) => $("t"+i).value.trim()), pct: +$("pct").value, hours: $("hours").value === "" ? null : +$("hours").value, eff: eb ? +eb.dataset.eff : null, tomorrow: $("tmrw").value.trim(), checklist: { revision: rc("revision"), dna: rc("dna"), topper: rc("topper") }, manifest: $("manifest").value.trim() };
    $("saveBtn").disabled = true; $("saveBtn").textContent = "Saving…";
    const r = await saveEntry(row);
    $("saveBtn").disabled = false; $("saveBtn").textContent = "Save today's routine";
    toast(r && r.ok ? "Saved ✓  Keep the streak alive!" : "Save failed — try again");
  };
}

// ---------- ADMIN ----------
async function renderAdmin() {
  app.innerHTML = topbar() + '<div id="view"></div>'; wireTop();
  const v = $("view"); v.innerHTML = '<div class="empty">Loading…</div>';
  const profiles = await listStudents(); const entries = await allEntries();
  if (!profiles.length) { v.innerHTML = '<div class="empty">No students yet. Ask a student to sign up and log a day.</div>'; return; }
  const byUser = {}; entries.forEach((e) => { (byUser[e.user_id] = byUser[e.user_id] || []).push(e); });
  const roster = profiles.map((p) => { const es = byUser[p.id] || []; return { name: p.name, id: p.id, last_seen: p.last_seen, stats: computeStats(es), count: es.length }; }).sort((a, b) => b.stats.totHours - a.stats.totHours);
  const isRecent = (iso) => iso && (Date.now() - new Date(iso + "T00:00")) / 864e5 <= 7;
  const totH = roster.reduce((s, r) => s + r.stats.totHours, 0);
  const we = roster.filter((r) => r.stats.avgEff > 0); const cohortEff = we.length ? we.reduce((s, r) => s + r.stats.avgEff, 0) / we.length : 0;
  const active = roster.filter((r) => isRecent(r.last_seen)).length;
  v.innerHTML = `<div class="cohort"><div class="c"><div class="n">${roster.length}</div><div class="l">Students</div></div><div class="c"><div class="n">${active}</div><div class="l">Active (7d)</div></div><div class="c"><div class="n">${totH.toFixed(0)}</div><div class="l">Total hours</div></div><div class="c"><div class="n">${cohortEff.toFixed(1)}</div><div class="l">Avg efficiency</div></div></div>
    <div class="seclabel" style="margin-top:4px">Students — by total hours</div><div class="roster">${roster.map((r) => `<div class="srow" data-id="${r.id}" data-name="${(r.name||"").replace(/"/g,"&quot;")}"><div class="avatar">${initials(r.name)}</div><div class="info"><div class="nm">${r.name}<span class="pillsmall ${isRecent(r.last_seen)?"live":"idle"}">${isRecent(r.last_seen)?"active":"idle"}</span></div><div class="meta">${r.count} ${r.count===1?"day":"days"} · ${r.stats.streak}d streak · ${r.stats.avgPct}% targets · eff ${r.stats.avgEff.toFixed(1)}/5</div></div><div class="perf"><div class="h">${r.stats.totHours.toFixed(0)}h</div><div class="hl">${r.stats.avgHours.toFixed(1)}h/day</div></div></div>`).join("")}</div>`;
  v.querySelectorAll("[data-id]").forEach((el) => (el.onclick = () => adminDetail(el.getAttribute("data-id"), el.getAttribute("data-name"))));
}
function adminDetail(uid, name) {
  app.innerHTML = topbar() + '<div id="view"></div>'; wireTop();
  const v = $("view"); v.innerHTML = `<button class="back" id="back">← All students</button><div class="seclabel" style="margin-top:0">${name}</div><div id="rep"></div>`;
  $("back").onclick = renderAdmin; renderReport($("rep"), uid, name, "admin");
}

// ---------- REPORTS ----------
const rangeState = {};
function escH(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtDay(iso) { try { return new Date(iso + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }); } catch (e) { return iso; } }
function dayTick(v) { return v === true ? '<b style="color:var(--good)">✓</b>' : v === false ? '<b style="color:var(--bad)">✕</b>' : '<span style="color:#bbb">·</span>'; }
function dayCardHTML(e) {
  const c = e.checklist || {};
  const targets = (e.targets || []).filter(Boolean).map(escH);
  return `<div class="daycard">
    <div class="dayhead"><span class="dd">${fmtDay(e.date)}</span><span class="dm">${e.hours != null ? e.hours + "h" : "—"} · eff ${e.eff || "-"}/5 · ${e.pct != null ? e.pct + "%" : "—"}</span></div>
    <div class="daychk">Revision ${dayTick(c.revision)} &nbsp;·&nbsp; DNA ${dayTick(c.dna)} &nbsp;·&nbsp; Topper ${dayTick(c.topper)}</div>
    ${targets.length ? `<div class="dayrow"><b>Targets:</b> ${targets.join(" • ")}</div>` : ""}
    ${e.tomorrow ? `<div class="dayrow"><b>Tomorrow:</b> ${escH(e.tomorrow)}</div>` : ""}
    ${e.manifest ? `<div class="dayrow"><b>Manifestation:</b> ${escH(e.manifest)}</div>` : ""}
  </div>`;
}
async function renderReport(container, uid, name, role) {
  container.innerHTML = '<div class="empty">Loading…</div>';
  const all = await entriesFor(uid);
  if (!all.length) { container.innerHTML = `<div class="empty">No entries yet for ${name}.</div>`; return; }
  const range = rangeState[uid] || "week";
  const rbtns = [["day", "Daily"], ["week", "Week"], ["month", "Month"], ["quarter", "3 Mo"], ["all", "All"]];
  const pick = `<div class="rangepick">${rbtns.map((p) => `<button class="${range === p[0] ? "on" : ""}" data-r="${p[0]}">${p[1]}</button>`).join("")}</div>`;
  if (range === "day") {
    const days = all.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    container.innerHTML = pick + `<div class="seclabel" style="margin-top:4px">Daily records${role === "admin" ? " — " + name : ""}</div><div class="daywrap">${days.map((e) => dayCardHTML(e)).join("")}</div>`;
    container.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rangeState[uid] = b.getAttribute("data-r"); renderReport(container, uid, name, role); }));
    return;
  }
  const set = inRange(all, range); const st = computeStats(set);
  const inset = inRange(all, range).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
  const maxH = Math.max(8, ...inset.map((e) => Number(e.hours) || 0));
  container.innerHTML = pick + `
    <div class="stats"><div class="stat"><div class="big">${st.avgHours.toFixed(1)}<small>h</small></div><div class="lbl">Avg / day</div></div><div class="stat"><div class="big">${st.totHours.toFixed(0)}<small>h</small></div><div class="lbl">Total hours</div></div><div class="stat"><div class="big">${st.avgEff.toFixed(1)}<small>/5</small></div><div class="lbl">Efficiency</div></div><div class="stat"><div class="big">${st.avgPct}<small>%</small></div><div class="lbl">Targets hit</div></div><div class="stat"><div class="big">${st.streak}<small>d</small></div><div class="lbl">Streak 🔥</div></div><div class="stat"><div class="big">${set.length}</div><div class="lbl">Days logged</div></div></div>
    <div class="chartcard"><h3>Study hours</h3><div class="barwrap">${inset.map((e) => `<div class="bar" style="height:${Math.round((100*(Number(e.hours)||0))/maxH)}%" title="${e.date}: ${e.hours||0}h"></div>`).join("")}</div><div class="barlbls">${inset.map((e) => `<span>${e.date.slice(8)}</span>`).join("")}</div></div>
    <div class="chartcard"><h3>Efficiency (1–5)</h3><div class="barwrap">${inset.map((e) => `<div class="bar eff" style="height:${Math.round((100*(e.eff||0))/5)}%" title="${e.date}: ${e.eff||"-"}/5"></div>`).join("")}</div><div class="barlbls">${inset.map((e) => `<span>${e.date.slice(8)}</span>`).join("")}</div></div>
    <div class="chartcard"><h3>Checklist consistency</h3>${[["Revision",st.chk.revision],["DNA",st.chk.dna],["Topper copies",st.chk.topper]].map((p) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px"><span>${p[0]}</span><span style="color:var(--orange)">${p[1]}%</span></div><div style="height:8px;background:var(--line2);border-radius:6px;overflow:hidden"><div style="height:100%;width:${p[1]}%;background:var(--orange)"></div></div></div>`).join("")}</div>
    <div class="aibox"><h3>✦ AI Coach Report</h3><div class="sub">${role === "admin" ? "Coaching read for " + name : "A personalised read of your performance, by Claude."}</div><div class="report" id="aiReport">Tap below to generate the report.</div><button class="btn orange" id="aiBtn" style="margin-top:16px">Generate report</button></div>`;
  container.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rangeState[uid] = b.getAttribute("data-r"); renderReport(container, uid, name, role); }));
  $("aiBtn").onclick = async () => {
    const btn = $("aiBtn"), out = $("aiReport"); btn.disabled = true; btn.textContent = "Analysing…";
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/daily-report", { method: "POST", headers: SB.headers(true), body: JSON.stringify({ userId: uid, range }) });
      const d = await r.json(); if (!r.ok) throw new Error("fn");
      out.innerHTML = (d.report || "No report returned.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br/>"); btn.style.display = "none";
    } catch (e) { out.textContent = "Couldn't generate — make sure the AI function is deployed (optional step in the README)."; btn.disabled = false; btn.textContent = "Try again"; }
  };
}
