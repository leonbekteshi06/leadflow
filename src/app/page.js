"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const TEAM = ["Leon", "Kent", "Lukas"];
const STAGES = [
  { id: "new", label: "New Lead", color: "#6C7A89" },
  { id: "outreach", label: "In Outreach", color: "#3B82F6" },
  { id: "responded", label: "Responded", color: "#8B5CF6" },
  { id: "booked", label: "Call Booked", color: "#F59E0B" },
  { id: "closed", label: "Closed Won", color: "#10B981" },
  { id: "lost", label: "Lost", color: "#EF4444" },
  { id: "old", label: "Old Lead", color: "#F97316" },
];
const KPI_COLORS = { DMs: "#3B82F6", Looms: "#EC4899" };

const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split("T")[0]; };
const daysDiff = (a, b) => { const d1 = new Date(a); d1.setHours(0,0,0,0); const d2 = new Date(b); d2.setHours(0,0,0,0); return Math.floor((d2-d1)/86400000); };
const fmtEU = (d) => { if(!d) return ""; const x = new Date(d); return `${String(x.getDate()).padStart(2,"0")}.${String(x.getMonth()+1).padStart(2,"0")}.${x.getFullYear()}`; };
const weekStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()+1); return d.toISOString().split("T")[0]; };
const monthStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d.toISOString().split("T")[0]; };
const fmtMoney = (v) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v||0);
const getWeekDates = () => { const ws = weekStart(); return Array.from({length:7},(_,i)=>addDays(ws,i)); };
const timeAgo = (ts) => { const d = Math.floor((Date.now() - new Date(ts).getTime())/1000); if(d<60) return "just now"; if(d<3600) return `${Math.floor(d/60)}m ago`; if(d<86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`; };

const getSendDate = (c) => { if(!c.next_follow_up) return { text:"-", color:"#475569", bg:"transparent", isToday: false }; const d = daysDiff(todayStr(), c.next_follow_up); const isToday = d === 0; const isOverdue = d < 0; return { text: fmtEU(c.next_follow_up), color: isOverdue ? "#EF4444" : isToday ? "#F59E0B" : "#94A3B8", bg: isOverdue ? "#EF444418" : isToday ? "#F59E0B18" : "#1E293B", isToday, isOverdue }; };
const getNurtureDate = (c) => { if(!c.next_nurture_date) return null; const d = daysDiff(todayStr(), c.next_nurture_date); const isToday = d === 0; const isOverdue = d < 0; return { text: fmtEU(c.next_nurture_date), color: isOverdue ? "#EF4444" : isToday ? "#F59E0B" : "#94A3B8", bg: isOverdue ? "#EF444418" : isToday ? "#F59E0B18" : "#1E293B", isToday, isOverdue }; };
const needsAction = (c) => { if (["new", "outreach", "old"].includes(c.stage)) { return c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) <= 0 : false; } if (c.stage === "responded") { return c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) <= 0 : false; } return false; };
const urgency = (c) => { if (["new", "outreach", "old"].includes(c.stage)) { return c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) : 999; } if (c.stage === "responded") { return c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) : 999; } return 999; };

export default function CRM() {
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [nurtureM, setNurtureM] = useState([]);
  const [kpiTargets, setKpiTargets] = useState([]);
  const [kpiEntries, setKpiEntries] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [user, setUser] = useState(() => { if (typeof window !== "undefined") return localStorage.getItem("lf-user") || "Leon"; return "Leon"; });
  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [delId, setDelId] = useState(null);
  const [sortBy, setSortBy] = useState("next_follow_up");
  const [sortDir, setSortDir] = useState("asc");
  const [detailId, setDetailId] = useState(null);
  const [closeId, setCloseId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [activeOutreachSeq, setActiveOutreachSeq] = useState("Default");
  const [activeNurtureSeq, setActiveNurtureSeq] = useState("Default");

  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("lf-user", user); }, [user]);

  useEffect(() => {
    const load = async () => {
      const [cRes, mRes, ktRes, keRes, alRes] = await Promise.all([
        supabase.from("contacts").select("*").order("created_at", { ascending: false }),
        supabase.from("message_templates").select("*").order("step"),
        supabase.from("kpi_targets").select("*"),
        supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -30)),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (cRes.data) setContacts(cRes.data);
      if (mRes.data) { setMessages(mRes.data.filter(m => m.type === "outreach")); setNurtureM(mRes.data.filter(m => m.type === "nurture")); }
      if (ktRes.data) setKpiTargets(ktRes.data);
      if (keRes.data) setKpiEntries(keRes.data);
      if (alRes.data) setActivityLog(alRes.data);
      setLoading(false);
    };
    load();

    const subs = [
      supabase.channel("c-ch").on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => { supabase.from("contacts").select("*").order("created_at", { ascending: false }).then(({ data }) => { if (data) setContacts(data); }); }).subscribe(),
      supabase.channel("m-ch").on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () => { supabase.from("message_templates").select("*").order("step").then(({ data }) => { if (data) { setMessages(data.filter(m => m.type === "outreach")); setNurtureM(data.filter(m => m.type === "nurture")); } }); }).subscribe(),
      supabase.channel("kt-ch").on("postgres_changes", { event: "*", schema: "public", table: "kpi_targets" }, () => { supabase.from("kpi_targets").select("*").then(({ data }) => { if (data) setKpiTargets(data); }); }).subscribe(),
      supabase.channel("ke-ch").on("postgres_changes", { event: "*", schema: "public", table: "kpi_entries" }, () => { supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -30)).then(({ data }) => { if (data) setKpiEntries(data); }); }).subscribe(),
      supabase.channel("al-ch").on("postgres_changes", { event: "*", schema: "public", table: "activity_log" }, () => { supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => { if (data) setActivityLog(data); }); }).subscribe(),
    ];
    return () => subs.forEach(s => supabase.removeChannel(s));
  }, []);

  const flash = (m, t = "success") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };
  const logActivity = async (person, action, detail = "") => { await supabase.from("activity_log").insert({ person, action, detail }); };

  // Contact CRUD
  const addContact = async (d) => { const { error } = await supabase.from("contacts").insert({ name: d.name, company: d.company || "", ig: d.ig || "", email: d.email || "", youtube: d.youtube || "", website: d.website || "", linkedin: d.linkedin || "", notes: d.notes || "", stage: "new", current_step: 0, nurture_step: 0, created_at: todayStr(), next_follow_up: todayStr(), pipeline_value: d.pipeline_value || 0, assigned_to: d.assigned_to || user, outreach_sequence: d.outreach_sequence || "Default", nurture_sequence: d.nurture_sequence || "Default", history: [], nurture_history: [] }); if (!error) { flash(`${d.name} added`); logActivity(user, "added_lead", d.name); } else flash("Error", "error"); };
  const updateContact = async (id, data) => { await supabase.from("contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id); };
  const deleteContact = async (id) => { const name = contacts.find(c => c.id === id)?.name; await supabase.from("contacts").delete().eq("id", id); setDelId(null); if (detailId === id) setDetailId(null); flash(`${name} removed`, "info"); };
  const bulkDelete = async () => { if (selected.size === 0) return; const ids = Array.from(selected); await supabase.from("contacts").delete().in("id", ids); setSelected(new Set()); flash(`Deleted ${ids.length} leads`, "info"); };

  const markSent = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; const ns = (c.current_step || 0) + 1; const seq = c.outreach_sequence || "Default"; let seqMsgs = messages.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); const cm = seqMsgs[c.current_step || 0]; const nm = seqMsgs[ns]; const variant = c.last_variant || "A"; await updateContact(id, { current_step: ns, stage: ns > 0 && ["new", "old"].includes(c.stage) ? "outreach" : c.stage, last_contacted_at: todayStr(), next_follow_up: nm ? addDays(todayStr(), nm.delay_days) : null, history: [...(c.history || []), { step: ns, name: cm?.name || `Msg ${ns}`, variant, at: todayStr() }], last_variant: null, last_variant_msg: null }); if ((c.current_step || 0) === 0) { await logKpi(user, "DMs", 1); } logActivity(user, "sent_outreach", `${cm?.name} (v${variant}) to ${c.name}`); flash(`Marked sent! (Version ${variant})`); };
  const markNurtureSent = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; const ns = (c.nurture_step || 0) + 1; const seq = c.nurture_sequence || "Default"; let seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); const cm = seqMsgs[c.nurture_step || 0]; const nm = seqMsgs[ns]; await updateContact(id, { nurture_step: ns, last_contacted_at: todayStr(), next_nurture_date: nm ? addDays(todayStr(), nm.delay_days) : addDays(todayStr(), 7), nurture_history: [...(c.nurture_history || []), { step: ns, name: cm?.name || `N ${ns}`, at: todayStr() }] }); logActivity(user, "sent_nurture", `${cm?.name} to ${c.name}`); flash("Nurture sent!"); };
  const moveStage = async (id, stage) => { const c = contacts.find(x => x.id === id); const u = { stage }; if (stage === "responded") { u.next_nurture_date = todayStr(); u.nurture_step = 0; u.next_follow_up = null; } if (["booked", "closed", "lost"].includes(stage)) { u.next_follow_up = null; u.next_nurture_date = null; } if (stage === "old") { u.next_follow_up = addDays(todayStr(), 75); u.next_nurture_date = null; } await updateContact(id, u); logActivity(user, "moved_stage", `${c?.name} to ${STAGES.find(s => s.id === stage)?.label}`); flash(`Moved to ${STAGES.find(s => s.id === stage)?.label}`); };
  const resetProgress = async (id, step = 0) => { const c = contacts.find(x => x.id === id); if (!c) return; await updateContact(id, { current_step: step, nurture_step: 0, stage: step === 0 ? "new" : "outreach", next_follow_up: todayStr(), next_nurture_date: null, history: step === 0 ? [] : c.history }); flash(`${c.name} reset to step ${step}`); };
  const closeDeal = async (id, v) => { const c = contacts.find(x => x.id === id); await updateContact(id, { stage: "closed", closed_value: v, closed_at: todayStr(), next_follow_up: null, next_nurture_date: null }); logActivity(user, "closed_deal", `${c?.name} for ${fmtMoney(v)}`); flash(`Closed for ${fmtMoney(v)}!`); setCloseId(null); };

  // Message CRUD
  const addMsg = async (d, type) => { const list = (type === "outreach" ? messages : nurtureM).filter(m => (m.sequence_name || "Default") === (d.sequence_name || "Default")); await supabase.from("message_templates").insert({ ...d, step: list.length + 1, type }); flash("Added!"); };
  const updateMsg = async (id, d) => { await supabase.from("message_templates").update(d).eq("id", id); flash("Updated!"); };
  const deleteMsg = async (id, type) => { await supabase.from("message_templates").delete().eq("id", id); const list = (type === "outreach" ? messages : nurtureM).filter(m => m.id !== id); for (let i = 0; i < list.length; i++) { await supabase.from("message_templates").update({ step: i + 1 }).eq("id", list[i].id); } flash("Removed", "info"); };

  // KPI functions
  const getKpiEntry = (person, category, date) => kpiEntries.find(e => e.person === person && e.category === category && e.date === date);
  const getKpiTarget = (person, category) => kpiTargets.find(t => t.person === person && t.category === category);
  const getWeeklyCount = (person, category) => { const ws = weekStart(); return kpiEntries.filter(e => e.person === person && e.category === category && e.date >= ws).reduce((s, e) => s + (e.count || 0), 0); };

  const getStreak = (person, category) => {
    const target = getKpiTarget(person, category);
    if (!target || !target.active || target.daily_target <= 0) return 0;
    let streak = 0;
    let d = todayStr();
    const todayEntry = getKpiEntry(person, category, d);
    if (todayEntry && todayEntry.count >= target.daily_target) streak++;
    for (let i = 1; i < 60; i++) {
      d = addDays(todayStr(), -i);
      const entry = getKpiEntry(person, category, d);
      if (entry && entry.count >= target.daily_target) streak++;
      else break;
    }
    return streak;
  };

  const logKpi = async (person, category, delta) => {
    const date = todayStr();
    const existing = getKpiEntry(person, category, date);
    if (existing) {
      const nc = Math.max(0, (existing.count || 0) + delta);
      await supabase.from("kpi_entries").update({ count: nc, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else if (delta > 0) {
      await supabase.from("kpi_entries").insert({ person, category, count: delta, date });
    }
    if (delta > 0) logActivity(person, "logged_kpi", `+${delta} ${category}`);
  };

  const updateKpiTarget = async (id, data) => { await supabase.from("kpi_targets").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id); flash("Target updated!"); };

  const getSequences = (type) => { const list = type === "outreach" ? messages : nurtureM; return [...new Set(list.map(m => m.sequence_name || "Default"))]; };
  const getNext = (c) => { const seq = c.outreach_sequence || "Default"; let seqMsgs = messages.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.sort((a, b) => a.step - b.step); const idx = c.current_step || 0; const m = seqMsgs[idx]; if (!m) return null; const firstName = c.name.split(" ")[0]; const variants = [{ label: "A", body: m.body.replace(/\{\{name\}\}/g, firstName) }, ...((m.variants || []).map(v => ({ label: v.label, body: v.body.replace(/\{\{name\}\}/g, firstName) })))]; return { ...m, variants, body: variants[0].body }; };
  const getNextN = (c) => { const seq = c.nurture_sequence || "Default"; let seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.sort((a, b) => a.step - b.step); const idx = c.nurture_step || 0; const m = idx < seqMsgs.length ? seqMsgs[idx] : seqMsgs.length > 0 ? seqMsgs[idx % seqMsgs.length] : null; if (!m) return null; const firstName = c.name.split(" ")[0]; const variants = [{ label: "A", body: m.body.replace(/\{\{name\}\}/g, firstName) }, ...((m.variants || []).map(v => ({ label: v.label, body: v.body.replace(/\{\{name\}\}/g, firstName) })))]; return { ...m, variants, body: variants[0].body }; };
  const copy = async (c, type) => { const msg = type === "nurture" ? getNextN(c) : getNext(c); if (!msg) return; const vs = msg.variants || [{ label: "A", body: msg.body }]; const pick = vs[Math.floor(Math.random() * vs.length)]; try { await navigator.clipboard.writeText(pick.body); setCopied(c.id + type); setTimeout(() => setCopied(null), 2e3); await updateContact(c.id, { last_variant: pick.label, last_variant_msg: msg.name }); flash(`Copied Version ${pick.label}!`); } catch { flash("Couldn't copy", "error"); } };
  const importCSV = async (text, seq) => { const lines = text.trim().split("\n"); if (lines.length < 2) return flash("No data", "error"); const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, "")); const mp = {}; hdr.forEach((h, i) => { if (h === "first name") mp.firstName = i; else if (h === "last name") mp.lastName = i; else if (h === "name" || h === "full name") mp.name = i; else if (h === "company name" || h === "company") mp.company = i; else if (h === "title" || h === "job title" || h === "position") mp.title = i; else if (h === "email" || h === "email address") mp.email = i; else if (h === "person linkedin url" || h === "linkedin" || h === "linkedin url") mp.linkedin = i; else if (h.includes("instagram") || h === "ig") mp.ig = i; else if (h === "website" || h === "company website" || h === "url" || h === "site") mp.website = i; else if (h.includes("youtube") || h === "yt") mp.youtube = i; else if (h === "notes" || h === "note") mp.notes = i; else if (h.includes("value") || h.includes("deal") || h === "pipeline") mp.pv = i; else if (h === "assigned to" || h === "owner") mp.assign = i; }); const hasName = mp.name !== undefined || mp.firstName !== undefined; if (!hasName) return flash("Need a 'Name' or 'First Name' column", "error"); const rows = []; for (let i = 1; i < lines.length; i++) { const v = []; let inQ = false; let cur = ""; for (let j = 0; j < lines[i].length; j++) { const ch = lines[i][j]; if (ch === '"') { inQ = !inQ; } else if (ch === ',' && !inQ) { v.push(cur.trim()); cur = ""; } else { cur += ch; } } v.push(cur.trim()); let nm = ""; if (mp.firstName !== undefined) { nm = `${v[mp.firstName] || ""} ${v[mp.lastName] || ""}`.trim(); } else { nm = v[mp.name] || ""; } if (!nm) continue; const email = v[mp.email] || ""; const title = v[mp.title] || ""; const company = v[mp.company] || ""; const linkedin = v[mp.linkedin] || ""; const np = []; if (title) np.push(title); if (v[mp.notes]) np.push(v[mp.notes]); rows.push({ name: nm, company: company || "", ig: v[mp.ig] || "", email: email, youtube: v[mp.youtube] || "", website: v[mp.website] || "", linkedin: linkedin || "", notes: np.join(" ") || "", stage: "new", current_step: 0, nurture_step: 0, created_at: todayStr(), next_follow_up: todayStr(), pipeline_value: parseFloat(v[mp.pv]) || 0, assigned_to: user, outreach_sequence: seq || "Default", nurture_sequence: "Default", history: [], nurture_history: [] }); } if (rows.length > 0) { const { error } = await supabase.from("contacts").insert(rows); if (!error) { flash(`Imported ${rows.length} leads!`); logActivity(user, "imported_csv", `${rows.length} leads`); } else flash("Import error", "error"); } setModal(null); };

  // Leaderboard data
  const getLeaderboard = () => {
    return TEAM.map(person => {
      const weeklyDMs = getWeeklyCount(person, "DMs");
      const weeklyLooms = getWeeklyCount(person, "Looms");
      const todayDMs = getKpiEntry(person, "DMs", todayStr())?.count || 0;
      const todayLooms = getKpiEntry(person, "Looms", todayStr())?.count || 0;
      const dmTarget = getKpiTarget(person, "DMs");
      const loomTarget = getKpiTarget(person, "Looms");
      const dmStreak = getStreak(person, "DMs");
      const loomStreak = getStreak(person, "Looms");
      const totalWeekly = weeklyDMs + weeklyLooms;
      const myLeads = contacts.filter(c => c.assigned_to === person);
      const closedVal = myLeads.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0);
      return { person, weeklyDMs, weeklyLooms, todayDMs, todayLooms, dmTarget, loomTarget, dmStreak, loomStreak, totalWeekly, closedVal, leads: myLeads.length };
    }).sort((a, b) => b.totalWeekly - a.totalWeekly);
  };

  const filtered = contacts.filter(c => filter === "all" || c.stage === filter).filter(c => { if (!search) return true; const s = search.toLowerCase(); return c.name.toLowerCase().includes(s) || c.ig?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.notes?.toLowerCase().includes(s); }).sort((a, b) => { let av, bv; if (sortBy === "next_follow_up") { av = a.next_follow_up || "9999"; bv = b.next_follow_up || "9999"; } else if (sortBy === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); } else if (sortBy === "stage") { av = STAGES.findIndex(s => s.id === a.stage); bv = STAGES.findIndex(s => s.id === b.stage); } else { av = a.created_at; bv = b.created_at; } return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1); });

  const wk = weekStart(), mo = monthStart();
  const stats = { contactedWeek: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= wk).length, contactedMonth: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= mo).length, pipeline: contacts.filter(c => !["closed", "lost"].includes(c.stage)).reduce((s, c) => s + (c.pipeline_value || 0), 0), closedTotal: contacts.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0), closedMonth: contacts.filter(c => c.stage === "closed" && c.closed_at && c.closed_at >= mo).reduce((s, c) => s + (c.closed_value || 0), 0), convRate: contacts.length ? Math.round((contacts.filter(c => c.stage === "closed").length / contacts.length) * 100) : 0 };
  const actionsDue = contacts.filter(needsAction);
  const myActionsDue = actionsDue.filter(c => c.assigned_to === user);

  if (loading) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0B1120" }}><div style={{ textAlign: "center" }}><div style={{ width: 32, height: 32, border: "3px solid #1E293B", borderTop: "3px solid #3B82F6", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} /><p style={{ color: "#94A3B8", marginTop: 16, fontFamily: "'DM Sans',sans-serif" }}>Loading LeadFlow...</p></div></div>);

  const NAV = [
    { id: "dashboard", label: "Dashboard", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
    { id: "kpis", label: "KPIs", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { id: "finder", label: "Lead Finder", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
    { id: "myleads", label: "My Leads", d: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z", badge: myActionsDue.length || null },
    { id: "contacts", label: "All Leads", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { id: "messages", label: "Outreach", d: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    { id: "nurture", label: "Nurture", d: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
  ];

  // === SHARED COMPONENTS ===
  const ProgressBar = ({ value, max, color, h = 8 }) => { const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0; return (<div style={{ width: "100%", height: h, background: "#1E293B", borderRadius: h / 2, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#10B981" : color, borderRadius: h / 2, transition: "width 0.3s" }} /></div>); };

  const Row = ({ c, showWho }) => {
    const sd = getSendDate(c); const nd = getNurtureDate(c); const nm = getNext(c); const nn = getNextN(c); const stg = STAGES.find(s => s.id === c.stage);
    const isO = ["new", "outreach", "old"].includes(c.stage); const isN = c.stage === "responded" && c.next_nurture_date;
    return (<tr style={S.tr} onClick={() => setDetailId(detailId === c.id ? null : c.id)}>
      <td style={S.td} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => { const n = new Set(selected); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setSelected(n); }} style={{ cursor: "pointer", accentColor: "#3B82F6" }} /></td>
      <td style={S.td}><div style={{ fontWeight: 500, color: "#F1F5F9", fontSize: 13 }}>{c.name}</div>{c.company && <div style={{ fontSize: 10, color: "#3B82F6" }}>{c.company}</div>}{showWho && <div style={{ fontSize: 10, color: "#64748B" }}>{c.assigned_to}</div>}{c.notes && <div style={{ fontSize: 10, color: "#475569", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes}</div>}</td>
      <td style={S.td}><select value={c.stage} onChange={e => { e.stopPropagation(); if (e.target.value === "closed") setCloseId(c.id); else moveStage(c.id, e.target.value); }} onClick={e => e.stopPropagation()} style={{ ...S.sel, color: stg.color, borderColor: stg.color + "40" }}>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
      <td style={S.td} onClick={e => e.stopPropagation()}>{isO && nm ? (<button style={S.copyBtn} onClick={() => copy(c, "outreach")}><span style={{ fontSize: 11, color: "#CBD5E1", fontWeight: 500 }}>{nm.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "outreach" ? "✓ Copied!" : nm.channel === "ig" ? "📱 Copy DM" : "📧 Copy Email"}</span></button>) : isN && nn ? (<button style={{ ...S.copyBtn, borderColor: "#8B5CF630" }} onClick={() => copy(c, "nurture")}><span style={{ fontSize: 11, color: "#C4B5FD", fontWeight: 500 }}>{nn.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "nurture" ? "✓ Copied!" : "🔁 Copy"}</span></button>) : (<span style={{ fontSize: 11, color: "#475569" }}>{["closed", "booked"].includes(c.stage) ? "-" : "Done"}</span>)}</td>
      <td style={S.td}>{isO && c.next_follow_up ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: sd.bg, color: sd.color, display: "inline-flex", alignItems: "center", gap: 4 }}>{(sd.isToday || sd.isOverdue) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: sd.isOverdue ? "#EF4444" : "#F59E0B", flexShrink: 0 }} />}{sd.text}</span> : isN && nd ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: nd.bg, color: nd.color, display: "inline-flex", alignItems: "center", gap: 4 }}>{(nd.isToday || nd.isOverdue) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: nd.isOverdue ? "#EF4444" : "#F59E0B", flexShrink: 0 }} />}{nd.text}</span> : <span style={{ color: "#475569", fontSize: 11 }}>-</span>}</td>
      <td style={S.td}>{c.pipeline_value ? <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmtMoney(c.pipeline_value)}</span> : c.closed_value ? <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmtMoney(c.closed_value)}</span> : <span style={{ fontSize: 11, color: "#334155" }}>-</span>}</td>
      <td style={S.td} onClick={e => e.stopPropagation()}><div style={{ display: "flex", gap: 3 }}>{c.ig && <a href={c.ig.startsWith("http") ? c.ig : `https://instagram.com/${c.ig.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={S.link}>IG</a>}{c.email && <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`} target="_blank" rel="noopener noreferrer" style={S.link}>@</a>}{c.youtube && <a href={c.youtube.startsWith("http") ? c.youtube : `https://youtube.com/${c.youtube}`} target="_blank" rel="noopener noreferrer" style={S.link}>YT</a>}{c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={S.link}>🌐</a>}{c.linkedin && <a href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer" style={S.link}>in</a>}</div></td>
      <td style={S.td} onClick={e => e.stopPropagation()}><div style={{ display: "flex", gap: 3 }}>{isO && nm && <button style={{ ...S.act, color: "#10B981" }} onClick={() => markSent(c.id)}>✓</button>}{isN && <button style={{ ...S.act, color: "#8B5CF6" }} onClick={() => markNurtureSent(c.id)}>✓</button>}<button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "contact", data: c })}>✎</button><button style={{ ...S.act, color: "#EF4444" }} onClick={() => setDelId(c.id)}>✕</button></div></td>
    </tr>);
  };

  const Table = ({ data, showWho = false }) => { const allIds = data.map(c => c.id); const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id)); const toggleAll = () => { const n = new Set(selected); if (allSelected) allIds.forEach(id => n.delete(id)); else allIds.forEach(id => n.add(id)); setSelected(n); }; return (<div style={S.tw}><table style={S.tbl}><thead><tr><th style={{ ...S.th, width: 30 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer", accentColor: "#3B82F6" }} /></th>{[{ k: "name", l: "Name" }, { k: "stage", l: "Stage" }, { k: null, l: "Next Message" }, { k: "next_follow_up", l: "Send Date" }, { k: null, l: "Value" }, { k: null, l: "Links" }, { k: null, l: "Actions" }].map((c, i) => (<th key={i} style={{ ...S.th, cursor: c.k ? "pointer" : "default" }} onClick={() => { if (!c.k) return; if (sortBy === c.k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(c.k); setSortDir("asc"); } }}>{c.l}{sortBy === c.k && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}</th>))}</tr></thead><tbody>{data.map(c => <Row key={c.id} c={c} showWho={showWho} />)}</tbody></table></div>); };

  const Detail = () => { const c = contacts.find(x => x.id === detailId); if (!c) return null; const nm = getNext(c); const nn = getNextN(c); return (<div style={S.detail}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><h3 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 600, margin: 0 }}>{c.name}</h3>{c.company && <div style={{ color: "#3B82F6", fontSize: 12, marginTop: 2 }}>{c.company}</div>}<div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>Added {fmtEU(c.created_at)} · Assigned to <strong style={{ color: "#CBD5E1" }}>{c.assigned_to}</strong></div></div><button style={S.x} onClick={() => setDetailId(null)}>✕</button></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>{c.ig && <div style={S.df}><span style={S.dl}>Instagram</span><span style={S.dv}>{c.ig}</span></div>}{c.email && <div style={S.df}><span style={S.dl}>Email</span><span style={S.dv}>{c.email}</span></div>}{c.youtube && <div style={S.df}><span style={S.dl}>YouTube</span><span style={S.dv}>{c.youtube}</span></div>}{c.website && <div style={S.df}><span style={S.dl}>Website</span><span style={S.dv}>{c.website}</span></div>}{c.linkedin && <div style={S.df}><span style={S.dl}>LinkedIn</span><span style={S.dv}>{c.linkedin}</span></div>}{c.pipeline_value > 0 && <div style={S.df}><span style={S.dl}>Pipeline Value</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.pipeline_value)}</span></div>}{c.closed_value > 0 && <div style={S.df}><span style={S.dl}>Closed For</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.closed_value)}</span></div>}</div>{c.notes && <div style={{ ...S.df, marginTop: 8 }}><span style={S.dl}>Notes</span><span style={{ ...S.dv, whiteSpace: "pre-wrap" }}>{c.notes}</span></div>}{nm && ["new", "outreach", "old"].includes(c.stage) && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #1E293B" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>NEXT: {nm.name}</span><button style={S.sc} onClick={() => copy(c, "outreach")}>{copied === c.id + "outreach" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nm.body}</div></div>)}{nn && c.stage === "responded" && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #8B5CF620" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#C4B5FD", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>NURTURE: {nn.name}</span><button style={{ ...S.sc, borderColor: "#8B5CF640", color: "#C4B5FD" }} onClick={() => copy(c, "nurture")}>{copied === c.id + "nurture" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nn.body}</div></div>)}{((c.history || []).length > 0 || (c.nurture_history || []).length > 0) && (<div style={{ marginTop: 12 }}><span style={{ color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Activity</span><div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>{[...(c.history || []).map(h => ({ ...h, t: "out" })), ...(c.nurture_history || []).map(h => ({ ...h, t: "nur" }))].sort((a, b) => b.at > a.at ? 1 : -1).map((h, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1E293B" }}><span style={{ color: h.t === "nur" ? "#C4B5FD" : "#CBD5E1", fontSize: 11 }}>{h.t === "nur" ? "🔁 " : "📤 "}{h.name}</span><span style={{ color: "#64748B", fontSize: 10 }}>{fmtEU(h.at)}</span></div>))}</div></div>)}</div>); };

  const MsgView = ({ type }) => {
    const activeSeq = type === "outreach" ? activeOutreachSeq : activeNurtureSeq;
    const setActiveSeq = type === "outreach" ? setActiveOutreachSeq : setActiveNurtureSeq;
    const [newSeqName, setNewSeqName] = useState("");
    const [showNewSeq, setShowNewSeq] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const allList = type === "outreach" ? messages : nurtureM;
    const seqs = getSequences(type);
    const list = allList.filter(m => (m.sequence_name || "Default") === activeSeq).sort((a, b) => a.step - b.step);
    const createSeq = async () => { if (!newSeqName.trim()) return; await supabase.from("message_templates").insert({ name: "Message 1", channel: "ig", delay_days: 0, body: "Hey {{name}}, ", step: 1, type, sequence_name: newSeqName.trim() }); setActiveSeq(newSeqName.trim()); setNewSeqName(""); setShowNewSeq(false); flash(`Sequence "${newSeqName.trim()}" created!`); };
    const reorder = async (fromIdx, toIdx) => { if (fromIdx === toIdx) return; const reordered = [...list]; const [moved] = reordered.splice(fromIdx, 1); reordered.splice(toIdx, 0, moved); for (let i = 0; i < reordered.length; i++) { await supabase.from("message_templates").update({ step: i + 1 }).eq("id", reordered[i].id); } flash("Reordered!"); setDragIdx(null); setDragOverIdx(null); };
    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>{type === "outreach" ? "Outreach Sequences" : "Nurture Sequences"}</h1><p style={S.sub}>Drag messages to reorder. Top = first message sent.</p></div><div style={{ display: "flex", gap: 6 }}><button style={S.ghost} onClick={() => setShowNewSeq(!showNewSeq)}>+ New Sequence</button><button style={S.pri} onClick={() => setModal({ type: "msg", data: null, msgType: type, seqName: activeSeq })}>+ Add Message</button></div></div>
      {showNewSeq && <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "end" }}><div style={S.fi}><label style={S.lb}>Sequence Name</label><input style={S.ip} value={newSeqName} onChange={e => setNewSeqName(e.target.value)} placeholder="e.g. Software CEOs" onKeyDown={e => e.key === "Enter" && createSeq()} /></div><button style={S.pri} onClick={createSeq}>Create</button></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>{seqs.map(s => <button key={s} style={{ ...S.pill, ...(activeSeq === s ? S.pillOn : {}) }} onClick={() => setActiveSeq(s)}>{s} <span style={{ opacity: .5 }}>{allList.filter(m => (m.sequence_name || "Default") === s).length}</span></button>)}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>{list.map((m, i) => { const hasVariants = m.variants && m.variants.length > 0; const allLabels = ["A", ...(m.variants || []).map(v => v.label)]; const stats = allLabels.map(label => { const sent = contacts.filter(c => (c.history || []).some(h => h.name === m.name && (h.variant || "A") === label)).length; const replied = contacts.filter(c => ["responded", "booked", "closed"].includes(c.stage) && (c.history || []).some(h => h.name === m.name && (h.variant || "A") === label)).length; return { label, sent, replied, rate: sent > 0 ? Math.round((replied / sent) * 100) : 0 }; }); return (<div key={m.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }} onDragEnd={() => { if (dragIdx !== null && dragOverIdx !== null) reorder(dragIdx, dragOverIdx); setDragIdx(null); setDragOverIdx(null); }} onDrop={e => e.preventDefault()} style={{ opacity: dragIdx === i ? 0.4 : 1 }}>{dragOverIdx === i && dragIdx !== null && dragIdx !== i && <div style={{ height: 3, background: "#3B82F6", borderRadius: 2, margin: "2px 0" }} />}<div style={{ background: "#0F172A", borderRadius: 10, border: `1px solid ${type === "nurture" ? "#8B5CF620" : "#1E293B"}`, overflow: "hidden", cursor: "grab" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #1E293B" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ color: "#475569", fontSize: 14, cursor: "grab", padding: "0 4px", userSelect: "none" }}>⠿</div><div style={{ width: 24, height: 24, borderRadius: "50%", background: type === "nurture" ? "linear-gradient(135deg,#8B5CF6,#EC4899)" : "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{i + 1}</div><div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13 }}>{m.name}</span>{hasVariants && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }}>A/B</span>}</div><div style={{ color: "#64748B", fontSize: 10 }}>{m.channel === "ig" ? "📱 IG" : "📧 Email"} · {m.delay_days === 0 ? "Immediately" : `${m.delay_days}d`}</div></div></div><div style={{ display: "flex", gap: 3 }}><button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "msg", data: m, msgType: type, seqName: activeSeq })}>✎</button>{list.length > 1 && <button style={{ ...S.act, color: "#EF4444" }} onClick={() => deleteMsg(m.id, type)}>✕</button>}</div></div><div style={{ padding: "10px 12px", fontSize: 12, lineHeight: 1.6, color: "#94A3B8", whiteSpace: "pre-wrap" }}>{m.body}</div>{hasVariants && stats.some(s => s.sent > 0) && <div style={{ padding: "8px 12px", borderTop: "1px solid #1E293B", display: "flex", gap: 12, flexWrap: "wrap" }}>{stats.map(s => (<div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: s.label === "A" ? "#3B82F6" : "#F59E0B", width: 14 }}>{s.label}</span><span style={{ fontSize: 10, color: "#64748B" }}>{s.sent} sent</span><span style={{ fontSize: 10, color: "#64748B" }}>·</span><span style={{ fontSize: 10, color: s.rate > 0 ? "#10B981" : "#475569", fontWeight: 600 }}>{s.replied} replied ({s.rate}%)</span></div>))}</div>}</div>{i < list.length - 1 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px" }}><div style={{ flex: 1, height: 1, background: "#1E293B" }} /><span style={{ color: "#475569", fontSize: 9 }}>{list[i + 1]?.delay_days === 0 ? "Immediately" : `Wait ${list[i + 1]?.delay_days}d`}</span><div style={{ flex: 1, height: 1, background: "#1E293B" }} /></div>}</div>); })}{list.length === 0 && <div style={S.empty}><p style={{ color: "#64748B" }}>No messages in this sequence yet. Click &quot;+ Add Message&quot; to start.</p></div>}</div>
    </div>); };

  // === KPI VIEW ===
  const KpiView = () => {
    const lb = getLeaderboard();
    const weekDates = getWeekDates();
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const medals = ["🥇", "🥈", "🥉"];
    const ws = weekStart();
    const daysSoFar = Math.max(1, daysDiff(ws, todayStr()) + 1);
    const weekDaysSoFar = Array.from({ length: daysSoFar }, (_, i) => addDays(ws, i));
    const kpiRank = TEAM.map(p => {
      const activeTargets = kpiTargets.filter(t => t.person === p && t.active && t.daily_target > 0);
      if (activeTargets.length === 0) return { person: p, daysHit: 0 };
      let daysHit = 0;
      weekDaysSoFar.forEach(d => {
        const allHit = activeTargets.every(t => {
          const entry = getKpiEntry(p, t.category, d);
          return entry && entry.count >= t.daily_target;
        });
        if (allHit) daysHit++;
      });
      return { person: p, daysHit };
    }).sort((a, b) => b.daysHit - a.daysHit);
    const kingPerson = kpiRank[0]?.daysHit > 0 ? kpiRank[0].person : null;
    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>KPIs</h1><p style={S.sub}>Team performance and accountability</p></div><button style={S.ghost} onClick={() => setModal({ type: "kpi" })}>⚙ Edit Targets</button></div>

      {/* Leaderboard */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Leaderboard (This Week)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lb.map((p, i) => {
            const rank = kpiRank.find(r => r.person === p.person);
            const isKing = kingPerson && p.person === kingPerson;
            const isGay = kingPerson && p.person !== kingPerson;
            return (
            <div key={p.person} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0F172A", borderRadius: 10, border: `1px solid ${i === 0 ? "#F59E0B30" : "#1E293B"}`, borderLeft: i === 0 ? "3px solid #F59E0B" : i === 1 ? "3px solid #94A3B8" : i === 2 ? "3px solid #B45309" : "3px solid #1E293B" }}>
              <span style={{ fontSize: 20 }}>{medals[i] || `#${i + 1}`}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 15 }}>{p.person}</span>
                  {p.person === user && <span style={{ color: "#3B82F6", fontSize: 10 }}>(you)</span>}
                  {isKing && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }}>👑 KING</span>}
                  {isGay && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#EC489920", color: "#EC4899" }}>🏳️‍🌈 officially gay</span>}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                  {p.dmTarget?.active && <span style={{ fontSize: 11, color: "#3B82F6" }}>{p.weeklyDMs} DMs</span>}
                  {p.loomTarget?.active && <span style={{ fontSize: 11, color: "#EC4899" }}>{p.weeklyLooms} Looms</span>}
                  {p.dmStreak > 0 && <span style={{ fontSize: 11, color: "#F59E0B" }}>🔥 {p.dmStreak}d streak</span>}
                  <span style={{ fontSize: 11, color: rank?.daysHit > 0 ? "#10B981" : "#475569" }}>KPIs hit: {rank?.daysHit || 0}/{daysSoFar}d</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{p.totalWeekly}</div>
                <div style={{ color: "#64748B", fontSize: 10 }}>this week</div>
              </div>
            </div>
          ); })}
        </div>
      </div>

      {/* Your daily tracker */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Log Today&apos;s Activity</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {["DMs", "Looms"].map(cat => {
            const target = getKpiTarget(user, cat);
            if (!target || !target.active) return null;
            const todayCount = getKpiEntry(user, cat, todayStr())?.count || 0;
            const weeklyCount = getWeeklyCount(user, cat);
            const streak = getStreak(user, cat);
            const color = KPI_COLORS[cat];
            return (
              <div key={cat} style={{ padding: 14, background: "#0F172A", borderRadius: 10, border: `1px solid ${todayCount >= target.daily_target ? "#10B98140" : "#1E293B"}`, borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color }}>{cat}</div>{streak > 0 && <div style={{ fontSize: 10, color: "#F59E0B" }}>🔥 {streak} day streak</div>}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => logKpi(user, cat, -1)} style={{ ...S.kpiBtn, opacity: todayCount > 0 ? 1 : 0.3 }}>-</button>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", fontFamily: "'Outfit',sans-serif", minWidth: 34, textAlign: "center" }}>{todayCount}</span>
                    <button onClick={() => logKpi(user, cat, 1)} style={{ ...S.kpiBtn, background: color + "20", borderColor: color + "40", color }}>+</button>
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: "#64748B" }}>Today</span><span style={{ color: todayCount >= target.daily_target ? "#10B981" : "#94A3B8", fontWeight: 600 }}>{todayCount}/{target.daily_target}</span></div><ProgressBar value={todayCount} max={target.daily_target} color={color} /></div>
                <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: "#64748B" }}>Week</span><span style={{ color: weeklyCount >= target.weekly_target ? "#10B981" : "#94A3B8", fontWeight: 600 }}>{weeklyCount}/{target.weekly_target}</span></div><ProgressBar value={weeklyCount} max={target.weekly_target} color={color} h={6} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly heatmap */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Weekly Breakdown</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ ...S.th, padding: "6px 8px" }}></th>{weekDates.map((d, i) => <th key={d} style={{ ...S.th, padding: "6px 8px", color: d === todayStr() ? "#3B82F6" : "#64748B" }}>{dayNames[i]}<br /><span style={{ fontSize: 8, fontWeight: 400 }}>{d.slice(8)}.{d.slice(5, 7)}</span></th>)}<th style={{ ...S.th, padding: "6px 8px", color: "#10B981" }}>Total</th></tr></thead>
            <tbody>{TEAM.map(person => { const cats = ["DMs", "Looms"].filter(cat => { const t = getKpiTarget(person, cat); return t && t.active; }); return cats.map((cat, ci) => (<tr key={person + cat} style={{ borderBottom: "1px solid #1E293B" }}><td style={{ padding: "6px 8px", fontSize: 11, color: "#CBD5E1", whiteSpace: "nowrap" }}>{ci === 0 && <><span style={{ color: "#F1F5F9", fontWeight: 600 }}>{person}</span><br /></>}<span style={{ color: KPI_COLORS[cat], fontSize: 10 }}>{cat}</span></td>{weekDates.map(d => { const e = getKpiEntry(person, cat, d); const cnt = e?.count || 0; const t = getKpiTarget(person, cat); const hit = t && cnt >= t.daily_target && t.daily_target > 0; return <td key={d} style={{ padding: "6px 8px", textAlign: "center", fontSize: 13, fontWeight: 600, color: cnt === 0 ? "#334155" : hit ? "#10B981" : "#F1F5F9", fontFamily: "'Outfit',sans-serif" }}>{cnt || "·"}</td>; })}<td style={{ padding: "6px 8px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#F1F5F9", fontFamily: "'Outfit',sans-serif" }}>{getWeeklyCount(person, cat)}</td></tr>)); })}</tbody>
          </table>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h2 style={S.h2}>Activity Feed</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", maxHeight: 300, overflow: "auto" }}>
          {activityLog.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#475569", fontSize: 12 }}>No activity yet</div>
            : activityLog.map(a => {
              const icons = { added_lead: "➕", sent_outreach: "📤", sent_nurture: "🔁", moved_stage: "📋", closed_deal: "🎉", logged_kpi: "📊", imported_csv: "📥", found_leads: "🔍" };
              return (<div key={a.id} style={{ padding: "8px 12px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{icons[a.action] || "•"}</span>
                  <div><span style={{ color: "#F1F5F9", fontWeight: 500, fontSize: 12 }}>{a.person}</span><span style={{ color: "#64748B", fontSize: 12 }}> {a.action.replace(/_/g, " ")}</span>{a.detail && <span style={{ color: "#94A3B8", fontSize: 12 }}> · {a.detail}</span>}</div>
                </div>
                <span style={{ color: "#475569", fontSize: 10, whiteSpace: "nowrap" }}>{timeAgo(a.created_at)}</span>
              </div>);
            })}
        </div>
      </div>
    </div>);
  };

  // === LEAD FINDER ===
  const LeadFinder = () => {
    const [csvText, setCsvText] = useState("");
    const [importSeq, setImportSeq] = useState("Default");
    const [quickForm, setQuickForm] = useState({ name: "", email: "", ig: "", notes: "" });
    const fileRef = useRef(null);
    const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setCsvText(ev.target.result); r.readAsText(f); };
    const quickAdd = async () => { if (!quickForm.name.trim()) return; await addContact({ ...quickForm, pipeline_value: 0, assigned_to: user }); setQuickForm({ name: "", email: "", ig: "", notes: "" }); };
    const oSeqs = getSequences("outreach");

    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>Lead Finder</h1><p style={S.sub}>Find leads, import them, and start outreach</p></div></div>

      {/* Quick Add */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={S.h2}>Quick Add Lead</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div style={S.fi}><label style={S.lb}>Name</label><input style={S.ip} value={quickForm.name} onChange={e => setQuickForm({ ...quickForm, name: e.target.value })} placeholder="John Smith" onKeyDown={e => e.key === "Enter" && quickAdd()} /></div>
            <div style={S.fi}><label style={S.lb}>Email</label><input style={S.ip} value={quickForm.email} onChange={e => setQuickForm({ ...quickForm, email: e.target.value })} placeholder="john@company.com" /></div>
            <div style={S.fi}><label style={S.lb}>Instagram</label><input style={S.ip} value={quickForm.ig} onChange={e => setQuickForm({ ...quickForm, ig: e.target.value })} placeholder="@handle" /></div>
            <div style={S.fi}><label style={S.lb}>Notes</label><input style={S.ip} value={quickForm.notes} onChange={e => setQuickForm({ ...quickForm, notes: e.target.value })} placeholder="CEO at Acme" /></div>
            <button style={{ ...S.pri, height: 36 }} onClick={quickAdd}>+ Add</button>
          </div>
        </div>
      </div>

      {/* Where to find leads */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={S.h2}>Where to Find Leads</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            { name: "Apollo.io", desc: "Search 275M+ contacts by title, industry, location. Export as CSV and import below.", url: "https://app.apollo.io/", color: "#6366F1", free: "Free: ~100 credits/mo" },
            { name: "LinkedIn + ContactOut", desc: "Browse LinkedIn profiles. Use ContactOut extension to grab emails.", url: "https://www.linkedin.com/sales/", color: "#0A66C2", free: "ContactOut: 4 free/day" },
            { name: "Hunter.io", desc: "Enter any company domain and find all the emails at that company.", url: "https://hunter.io/search", color: "#F59E0B", free: "Free: 25 searches/mo" },
            { name: "Snov.io", desc: "Email finder + drip campaigns. Good for building cold email lists.", url: "https://app.snov.io/", color: "#10B981", free: "Free: 50 credits/mo" },
          ].map(s => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" style={{ padding: 14, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: `3px solid ${s.color}`, textDecoration: "none", cursor: "pointer", display: "block" }}>
              <div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.name}</div>
              <div style={{ color: "#94A3B8", fontSize: 11, lineHeight: 1.4, marginBottom: 6 }}>{s.desc}</div>
              <div style={{ color: s.color, fontSize: 10, fontWeight: 600 }}>{s.free}</div>
            </a>
          ))}
        </div>
      </div>

      {/* CSV Import */}
      <div>
        <h2 style={S.h2}>Import from CSV</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 14 }}>
          <p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>Export leads from Apollo, Hunter, or any tool as CSV. Then upload here. Auto-maps Name, Email, Instagram, Website, YouTube, Notes, Value, and Assigned To columns.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "end" }}>
            <div style={{ ...S.fi, flex: 1 }}><label style={S.lb}>Assign to Outreach Sequence</label><select style={S.ip} value={importSeq} onChange={e => setImportSeq(e.target.value)}>{oSeqs.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
          <button style={{ ...S.ghost, width: "100%", padding: 14, marginBottom: 10, borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => fileRef.current?.click()}>
            {csvText ? "✓ File loaded! Click Import below." : "📤 Choose CSV File"}
          </button>
          <textarea style={{ ...S.ip, width: "100%", minHeight: 80, resize: "vertical", fontSize: 11, boxSizing: "border-box", marginBottom: 10 }} value={csvText} onChange={e => setCsvText(e.target.value)} placeholder={"Or paste CSV data here:\nname,email,instagram\nJohn Smith,john@company.com,@john"} />
          <button style={{ ...S.pri, opacity: csvText.trim() ? 1 : 0.5 }} onClick={() => { if (csvText.trim()) { importCSV(csvText, importSeq); setCsvText(""); } }} disabled={!csvText.trim()}>Import Leads to CRM</button>
        </div>
      </div>
    </div>);
  };

  // === MAIN RENDER ===
  return (
    <div style={S.app}>
      {toast && <div style={{ ...S.toast, background: toast.t === "error" ? "#EF4444" : toast.t === "info" ? "#3B82F6" : "#10B981" }}>{toast.m}</div>}
      <div style={S.side}>
        <div style={S.logo}><div style={S.logoI}>⬡</div><span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, color: "#F1F5F9" }}>LeadFlow</span></div>
        <div style={{ padding: "0 12px 10px", borderBottom: "1px solid #1E293B" }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Logged in as</div><select value={user} onChange={e => setUser(e.target.value)} style={{ width: "100%", background: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, padding: "7px 8px", color: "#F1F5F9", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer" }}>{TEAM.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px", flex: 1 }}>{NAV.map(n => (<button key={n.id} onClick={() => { setView(n.id); setDetailId(null); }} style={{ ...S.nav, ...(view === n.id ? S.navOn : {}) }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg><span>{n.label}</span>{n.badge && <span style={S.badge}>{n.badge}</span>}</button>))}</nav>
        <div style={{ padding: "10px 12px", borderTop: "1px solid #1E293B", display: "flex", flexDirection: "column", gap: 4 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#F1F5F9", fontWeight: 700 }}>{contacts.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Pipeline</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.pipeline)}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.closedTotal)}</span></div></div>
      </div>

      <div style={S.main}>
        {view === "dashboard" && (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>Dashboard</h1><p style={S.sub}>Welcome back, {user}</p></div><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginBottom: 20 }}>{[{ l: "Contacted This Week", v: stats.contactedWeek, c: "#3B82F6" }, { l: "Contacted This Month", v: stats.contactedMonth, c: "#6366F1" }, { l: "Pipeline Value", v: fmtMoney(stats.pipeline), c: "#10B981" }, { l: "Closed This Month", v: fmtMoney(stats.closedMonth), c: "#F59E0B" }, { l: "Total Revenue", v: fmtMoney(stats.closedTotal), c: "#10B981" }, { l: "Close Rate", v: `${stats.convRate}%`, c: "#8B5CF6" }].map((s, i) => (<div key={i} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: `3px solid ${s.c}` }}><div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{s.l}</div><div style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{s.v}</div></div>))}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6, marginBottom: 20 }}>{STAGES.map(s => { const cnt = contacts.filter(c => c.stage === s.id).length; return (<div key={s.id} style={{ padding: "12px 10px", background: "#0F172A", borderRadius: 8, border: "1px solid #1E293B", borderLeft: `3px solid ${s.color}`, cursor: "pointer" }} onClick={() => { setView("contacts"); setFilter(s.id); }}><div style={{ color: "#94A3B8", fontSize: 10, fontWeight: 600 }}>{s.label}</div><div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{cnt}</div></div>); })}</div><h2 style={S.h2}>Today&apos;s Actions ({actionsDue.length})</h2>{actionsDue.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>Nothing due!</p></div> : <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>{actionsDue.sort((a, b) => urgency(a) - urgency(b)).map(c => { const isOver = urgency(c) < 0; const nm = getNext(c); const nn = getNextN(c); const isO = ["new", "outreach", "old"].includes(c.stage); const msg = isO ? nm : nn; const mt = isO ? "outreach" : "nurture"; return (<div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0F172A", borderRadius: 8, border: `1px solid ${isOver ? "#EF444430" : "#1E293B"}` }}><div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: isOver ? "#EF4444" : "#F59E0B", flexShrink: 0 }} /><div><div style={{ color: "#F1F5F9", fontWeight: 500, fontSize: 13 }}>{c.name} <span style={{ color: "#64748B", fontSize: 11 }}>({c.assigned_to})</span></div><div style={{ color: "#64748B", fontSize: 11 }}>{msg ? msg.name : "Action needed"}</div></div></div><div style={{ display: "flex", gap: 4 }}>{msg && <button style={S.sc} onClick={() => copy(c, mt)}>{copied === c.id + mt ? "Copied!" : "Copy"}</button>}</div></div>); })}</div>}<h2 style={S.h2}>Team</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>{TEAM.map(t => { const ml = contacts.filter(c => c.assigned_to === t); const ma = actionsDue.filter(c => c.assigned_to === t); const mc = ml.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0); return (<div key={t} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: `1px solid ${t === user ? "#3B82F640" : "#1E293B"}` }}><div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t}{t === user && <span style={{ color: "#3B82F6", fontSize: 10 }}> (you)</span>}</div><div style={{ display: "flex", flexDirection: "column", gap: 3 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#CBD5E1", fontWeight: 600 }}>{ml.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Due Today</span><span style={{ color: ma.length ? "#F59E0B" : "#CBD5E1", fontWeight: 600 }}>{ma.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 600 }}>{fmtMoney(mc)}</span></div></div></div>); })}</div></div>)}

        {view === "kpis" && <KpiView />}
        {view === "finder" && <LeadFinder />}
        {view === "myleads" && (() => { const my = contacts.filter(c => c.assigned_to === user); const over = my.filter(c => urgency(c) < 0).sort((a, b) => urgency(a) - urgency(b)); const today2 = my.filter(c => urgency(c) === 0); const upcoming = my.filter(c => { const u2 = urgency(c); return u2 > 0 && u2 <= 7; }).sort((a, b) => urgency(a) - urgency(b)); return (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>My Leads</h1><p style={S.sub}>{user}&apos;s leads and daily actions</p></div><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div>{over.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#EF4444" }}>Overdue ({over.length})</h2><Table data={over} /></div>}{today2.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#F59E0B" }}>Due Today ({today2.length})</h2><Table data={today2} /></div>}{upcoming.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#3B82F6" }}>Upcoming This Week ({upcoming.length})</h2><Table data={upcoming} /></div>}{over.length === 0 && today2.length === 0 && upcoming.length === 0 && <div style={S.empty}><p style={{ color: "#64748B" }}>All caught up!</p></div>}{detailId && <Detail />}</div>); })()}
        {view === "contacts" && (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>All Leads</h1><p style={S.sub}>{filtered.length} lead{filtered.length !== 1 ? "s" : ""}</p></div><div style={{ display: "flex", gap: 6 }}>{selected.size > 0 && <button style={S.danger} onClick={bulkDelete}>Delete {selected.size} Selected</button>}<button style={S.ghost} onClick={() => setModal({ type: "csv" })}>📤 Import CSV</button><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div></div><div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}><div style={S.sBox}><input style={S.sInp} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><button style={{ ...S.pill, ...(filter === "all" ? S.pillOn : {}) }} onClick={() => setFilter("all")}>All</button>{STAGES.map(s => <button key={s.id} style={{ ...S.pill, ...(filter === s.id ? S.pillOn : {}) }} onClick={() => setFilter(s.id)}>{s.label} <span style={{ opacity: .5 }}>{contacts.filter(c => c.stage === s.id).length}</span></button>)}</div></div>{filtered.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>No leads found.</p></div> : <Table data={filtered} showWho />}{detailId && <Detail />}</div>)}
        {view === "messages" && <MsgView type="outreach" />}
        {view === "nurture" && <MsgView type="nurture" />}
      </div>

      {modal?.type === "contact" && <ContactModal c={modal.data} team={TEAM} user={user} outreachSeqs={getSequences("outreach")} nurtureSeqs={getSequences("nurture")} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateContact(modal.data.id, d); else await addContact(d); setModal(null); }} />}
      {modal?.type === "msg" && <MsgModal m={modal.data} total={(modal.msgType === "outreach" ? messages : nurtureM).filter(m => (m.sequence_name || "Default") === (modal.seqName || "Default")).length} type={modal.msgType} seqName={modal.seqName || "Default"} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateMsg(modal.data.id, d); else await addMsg(d, modal.msgType); setModal(null); }} />}
      {modal?.type === "csv" && <CSVModal onClose={() => setModal(null)} onImport={importCSV} />}
      {modal?.type === "kpi" && <KpiSettingsModal targets={kpiTargets} onClose={() => setModal(null)} onSave={updateKpiTarget} />}
      {closeId && <CloseModal c={contacts.find(x => x.id === closeId)} onClose={() => setCloseId(null)} onSave={v => closeDeal(closeId, v)} />}
      {delId && <div style={S.ov} onClick={() => setDelId(null)}><div style={S.cBox} onClick={e => e.stopPropagation()}><h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Delete this lead?</h3><p style={{ color: "#94A3B8", fontSize: 13, margin: "6px 0 14px" }}>Can&apos;t be undone.</p><div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button style={S.ghost} onClick={() => setDelId(null)}>Cancel</button><button style={S.danger} onClick={() => deleteContact(delId)}>Delete</button></div></div></div>}
    </div>
  );
}

function ContactModal({ c, team, user, outreachSeqs, nurtureSeqs, onClose, onSave }) { const [f, setF] = useState({ name: c?.name || "", company: c?.company || "", ig: c?.ig || "", email: c?.email || "", youtube: c?.youtube || "", website: c?.website || "", linkedin: c?.linkedin || "", notes: c?.notes || "", pipeline_value: c?.pipeline_value || "", assigned_to: c?.assigned_to || user, outreach_sequence: c?.outreach_sequence || "Default", nurture_sequence: c?.nurture_sequence || "Default", current_step: c?.current_step || 0 }); const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []); const save = () => { if (!f.name.trim()) return; onSave({ ...f, pipeline_value: parseFloat(f.pipeline_value) || 0, current_step: parseInt(f.current_step) || 0 }); }; return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{c ? "Edit Lead" : "Add New Lead"}</h2><button style={S.x} onClick={onClose}>✕</button></div><div style={S.fg2}><div style={S.fi}><label style={S.lb}>Name *</label><input ref={ref} style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="John Smith" onKeyDown={e => e.key === "Enter" && save()} /></div><div style={S.fi}><label style={S.lb}>Company / Offer</label><input style={S.ip} value={f.company} onChange={e => setF({ ...f, company: e.target.value })} placeholder="Acme Inc." /></div><div style={S.fi}><label style={S.lb}>Assigned To</label><select style={S.ip} value={f.assigned_to} onChange={e => setF({ ...f, assigned_to: e.target.value })}>{team.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div style={S.fi}><label style={S.lb}>Instagram</label><input style={S.ip} value={f.ig} onChange={e => setF({ ...f, ig: e.target.value })} placeholder="@handle" /></div><div style={S.fi}><label style={S.lb}>Email</label><input style={S.ip} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="john@email.com" /></div><div style={S.fi}><label style={S.lb}>LinkedIn</label><input style={S.ip} value={f.linkedin} onChange={e => setF({ ...f, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." /></div><div style={S.fi}><label style={S.lb}>YouTube</label><input style={S.ip} value={f.youtube} onChange={e => setF({ ...f, youtube: e.target.value })} placeholder="Channel URL" /></div><div style={S.fi}><label style={S.lb}>Website</label><input style={S.ip} value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="https://..." /></div><div style={S.fi}><label style={S.lb}>Pipeline Value ($)</label><input style={S.ip} type="number" value={f.pipeline_value} onChange={e => setF({ ...f, pipeline_value: e.target.value })} placeholder="5000" /></div><div style={S.fi}><label style={S.lb}>Outreach Sequence</label><select style={S.ip} value={f.outreach_sequence} onChange={e => setF({ ...f, outreach_sequence: e.target.value })}>{(outreachSeqs || ["Default"]).map(s => <option key={s} value={s}>{s}</option>)}</select></div>{c && <div style={S.fi}><label style={S.lb}>Current Step (0 = reset)</label><input style={S.ip} type="number" min="0" value={f.current_step} onChange={e => setF({ ...f, current_step: e.target.value })} /></div>}<div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Notes</label><textarea style={{ ...S.ip, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Notes..." /></div></div><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: f.name.trim() ? 1 : .5 }} onClick={save} disabled={!f.name.trim()}>{c ? "Save" : "Add Lead"}</button></div></div></div>); }

function MsgModal({ m, total, type, seqName, onClose, onSave }) { const [f, setF] = useState({ name: m?.name || `${type === "nurture" ? "Nurture" : "Message"} ${total + 1}`, channel: m?.channel || "ig", delay_days: m?.delay_days ?? 3, body: m?.body || "", sequence_name: m?.sequence_name || seqName || "Default", variants: m?.variants || [] }); const addVariant = () => { const labels = "BCDEFGHIJ"; const next = labels[f.variants.length] || `V${f.variants.length + 2}`; setF({ ...f, variants: [...f.variants, { label: next, body: "" }] }); }; const updateVariant = (idx, body) => { const vs = [...f.variants]; vs[idx] = { ...vs[idx], body }; setF({ ...f, variants: vs }); }; const removeVariant = (idx) => { setF({ ...f, variants: f.variants.filter((_, i) => i !== idx) }); }; return (<div style={S.ov} onClick={onClose}><div style={{ ...S.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{m ? "Edit" : "Add"} Message</h2><button style={S.x} onClick={onClose}>\u2715</button></div><div style={S.fg2}><div style={S.fi}><label style={S.lb}>Name</label><input style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div><div style={S.fi}><label style={S.lb}>Channel</label><select style={S.ip} value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}><option value="ig">Instagram DM</option><option value="email">Email</option></select></div><div style={S.fi}><label style={S.lb}>Delay (days)</label><input style={S.ip} type="number" min="0" value={f.delay_days} onChange={e => setF({ ...f, delay_days: parseInt(e.target.value) || 0 })} /></div><div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Version A (default)</label><textarea style={{ ...S.ip, minHeight: 100, resize: "vertical" }} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder={'Use {{name}} for auto-fill'} /></div>{f.variants.map((v, i) => (<div key={i} style={{ ...S.fi, gridColumn: "1/-1" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><label style={{ ...S.lb, color: "#F59E0B" }}>Version {v.label}</label><button onClick={() => removeVariant(i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}>Remove</button></div><textarea style={{ ...S.ip, minHeight: 100, resize: "vertical", borderColor: "#F59E0B30" }} value={v.body} onChange={e => updateVariant(i, e.target.value)} placeholder={'Version ' + v.label + ' copy...'} /></div>))}<div style={{ gridColumn: "1/-1" }}><button style={{ ...S.ghost, width: "100%", borderStyle: "dashed" }} onClick={addVariant}>+ Add Variant for A/B Test</button></div></div><p style={{ color: "#475569", fontSize: 10, marginTop: 8 }}>{'{{name}}'} auto-fills with lead&apos;s first name. When copied, a random version is selected and tracked.</p><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={S.pri} onClick={() => onSave(f)}>{m ? "Save" : "Add"}</button></div></div></div>); }

function CSVModal({ onClose, onImport }) { const [text, setText] = useState(""); const ref = useRef(null); const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setText(ev.target.result); r.readAsText(f); }; return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>Import CSV</h2><button style={S.x} onClick={onClose}>✕</button></div><p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>Upload a CSV from Google Sheets. Needs a &quot;Name&quot; column.</p><input type="file" accept=".csv,.txt" ref={ref} onChange={handleFile} style={{ display: "none" }} /><button style={{ ...S.ghost, width: "100%", padding: 12, marginBottom: 10, borderStyle: "dashed" }} onClick={() => ref.current?.click()}>{text ? "✓ File loaded!" : "📤 Choose CSV"}</button><textarea style={{ ...S.ip, width: "100%", minHeight: 80, resize: "vertical", fontSize: 11, boxSizing: "border-box" }} value={text} onChange={e => setText(e.target.value)} placeholder={"name,instagram,email\nJohn,@john,john@email.com"} /><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: text.trim() ? 1 : .5 }} onClick={() => text.trim() && onImport(text)} disabled={!text.trim()}>Import</button></div></div></div>); }

function CloseModal({ c, onClose, onSave }) { const [v, setV] = useState(c?.pipeline_value || ""); return (<div style={S.ov} onClick={onClose}><div style={{ ...S.cBox, width: 360 }} onClick={e => e.stopPropagation()}><h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Close {c?.name}</h3><p style={{ color: "#94A3B8", fontSize: 12, margin: "6px 0 12px" }}>How much did you close for?</p><div style={S.fi}><label style={S.lb}>Deal Value ($)</label><input style={S.ip} type="number" value={v} onChange={e => setV(e.target.value)} placeholder="5000" autoFocus onKeyDown={e => e.key === "Enter" && onSave(parseFloat(v) || 0)} /></div><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, background: "linear-gradient(135deg,#10B981,#059669)" }} onClick={() => onSave(parseFloat(v) || 0)}>Close Deal</button></div></div></div>); }

function KpiSettingsModal({ targets, onClose, onSave }) { const [edits, setEdits] = useState(targets.map(t => ({ ...t }))); const upd = (id, f, v) => setEdits(p => p.map(t => t.id === id ? { ...t, [f]: v } : t)); return (<div style={S.ov} onClick={onClose}><div style={{ ...S.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>KPI Settings</h2><button style={S.x} onClick={onClose}>✕</button></div><p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 16 }}>Set targets and toggle categories for each person.</p>{TEAM.map(person => (<div key={person} style={{ marginBottom: 16 }}><div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{person}</div>{["DMs", "Looms"].map(cat => { const t = edits.find(x => x.person === person && x.category === cat); if (!t) return null; return (<div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", background: "#0B1120", borderRadius: 8, border: `1px solid ${t.active ? KPI_COLORS[cat] + "30" : "#1E293B"}` }}><button onClick={() => upd(t.id, "active", !t.active)} style={{ width: 32, height: 20, borderRadius: 10, border: "none", background: t.active ? KPI_COLORS[cat] : "#334155", cursor: "pointer", position: "relative", padding: 0 }}><div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: t.active ? 14 : 2, transition: "left 0.2s" }} /></button><span style={{ color: KPI_COLORS[cat], fontSize: 12, fontWeight: 600, width: 50 }}>{cat}</span><div style={{ display: "flex", alignItems: "center", gap: 4 }}><label style={{ color: "#64748B", fontSize: 10 }}>Daily:</label><input type="number" min="0" value={t.daily_target} onChange={e => upd(t.id, "daily_target", parseInt(e.target.value) || 0)} style={{ ...S.ip, width: 60, padding: "4px 6px", textAlign: "center" }} disabled={!t.active} /></div><div style={{ display: "flex", alignItems: "center", gap: 4 }}><label style={{ color: "#64748B", fontSize: 10 }}>Weekly:</label><input type="number" min="0" value={t.weekly_target} onChange={e => upd(t.id, "weekly_target", parseInt(e.target.value) || 0)} style={{ ...S.ip, width: 60, padding: "4px 6px", textAlign: "center" }} disabled={!t.active} /></div></div>); })}</div>))}<div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={S.pri} onClick={async () => { for (const t of edits) { await onSave(t.id, { daily_target: t.daily_target, weekly_target: t.weekly_target, active: t.active }); } onClose(); }}>Save All</button></div></div></div>); }

const S = {
  app: { display: "flex", height: "100vh", background: "#0B1120", fontFamily: "'DM Sans',sans-serif", color: "#CBD5E1", overflow: "hidden" },
  side: { width: 200, minWidth: 200, background: "#0F172A", borderRight: "1px solid #1E293B", display: "flex", flexDirection: "column", padding: "14px 0" },
  logo: { display: "flex", alignItems: "center", gap: 8, padding: "0 14px 12px", borderBottom: "1px solid #1E293B", marginBottom: 8 },
  logoI: { width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#3B82F6,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 },
  nav: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "#94A3B8", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textAlign: "left", position: "relative" },
  navOn: { background: "#1E293B", color: "#F1F5F9" },
  badge: { position: "absolute", right: 8, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10, minWidth: 14, textAlign: "center" },
  main: { flex: 1, overflow: "auto" }, content: { padding: 22, maxWidth: 1100 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 8 },
  h1: { fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color: "#F1F5F9", margin: 0 },
  h2: { fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600, color: "#E2E8F0", margin: "0 0 8px" },
  sub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  pri: { display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", background: "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  ghost: { padding: "8px 14px", background: "#1E293B", color: "#CBD5E1", border: "1px solid #334155", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  danger: { padding: "8px 14px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  tw: { overflowX: "auto", borderRadius: 10, border: "1px solid #1E293B", background: "#0F172A" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 10px", color: "#64748B", fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #1E293B", whiteSpace: "nowrap", userSelect: "none" },
  tr: { borderBottom: "1px solid #1E293B", cursor: "pointer" }, td: { padding: "8px 10px", verticalAlign: "middle" },
  sel: { background: "#0B1120", border: "1px solid", borderRadius: 6, padding: "3px 5px", fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", outline: "none" },
  copyBtn: { display: "flex", flexDirection: "column", gap: 1, padding: "4px 8px", background: "#0B1120", border: "1px solid #1E293B", borderRadius: 6, cursor: "pointer", textAlign: "left" },
  link: { padding: "3px 6px", borderRadius: 4, background: "#1E293B", border: "1px solid #334155", color: "#94A3B8", textDecoration: "none", fontSize: 10, fontWeight: 600 },
  act: { width: 24, height: 24, borderRadius: 6, background: "transparent", border: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 },
  sc: { padding: "3px 8px", background: "#1E293B", border: "1px solid #334155", borderRadius: 6, color: "#94A3B8", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  sBox: { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, maxWidth: 260 },
  sInp: { background: "transparent", border: "none", color: "#F1F5F9", fontSize: 12, outline: "none", flex: 1, fontFamily: "'DM Sans',sans-serif", width: "100%" },
  pill: { padding: "3px 9px", background: "#0F172A", color: "#94A3B8", border: "1px solid #1E293B", borderRadius: 20, fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  pillOn: { background: "#1E293B", color: "#F1F5F9", borderColor: "#3B82F6" },
  detail: { marginTop: 12, padding: 16, background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B" },
  df: { display: "flex", flexDirection: "column", gap: 2 }, dl: { color: "#64748B", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }, dv: { color: "#CBD5E1", fontSize: 12 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B" },
  ov: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#0F172A", border: "1px solid #1E293B", borderRadius: 14, padding: 20, width: "92%", maxWidth: 500, maxHeight: "85vh", overflow: "auto" },
  cBox: { background: "#0F172A", border: "1px solid #1E293B", borderRadius: 14, padding: 20, width: 320 },
  fg2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, fi: { display: "flex", flexDirection: "column", gap: 3 },
  lb: { color: "#94A3B8", fontSize: 10, fontWeight: 600 }, ip: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, padding: "7px 10px", color: "#F1F5F9", fontSize: 12, outline: "none", fontFamily: "'DM Sans',sans-serif" },
  x: { background: "transparent", border: "none", color: "#64748B", fontSize: 16, cursor: "pointer", padding: 3 },
  toast: { position: "fixed", top: 14, right: 14, padding: "8px 14px", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", zIndex: 2000, boxShadow: "0 8px 30px rgba(0,0,0,.3)", animation: "slideIn .3s ease" },
  kpiBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#1E293B", color: "#F1F5F9", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" },
};
