"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const TEAM = ["Leon", "Kent", "Lukas"];
const STAGES = [
  { id: "new", label: "New Lead", color: "#6C7A89" },
  { id: "outreach", label: "In Outreach", color: "#3B82F6" },
  { id: "responded", label: "Responded", color: "#8B5CF6" },
  { id: "interested", label: "Interested", color: "#14B8A6" },
  { id: "not_interested", label: "Not Interested", color: "#94A3B8" },
  { id: "booked", label: "Call Booked", color: "#F59E0B" },
  { id: "closed", label: "Closed Won", color: "#10B981" },
  { id: "lost", label: "Lost", color: "#EF4444" },
  { id: "old", label: "Old Lead", color: "#F97316" },
];
const KPI_COLORS = { DMs: "#3B82F6", Looms: "#EC4899" };

const todayStr = () => new Date().toISOString().split("T")[0];
const yesterdayStr = () => addDays(todayStr(), -1);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split("T")[0]; };
const daysDiff = (a, b) => { const d1 = new Date(a); d1.setHours(0,0,0,0); const d2 = new Date(b); d2.setHours(0,0,0,0); return Math.floor((d2-d1)/86400000); };
const fmtEU = (d) => { if(!d) return ""; const x = new Date(d); return `${String(x.getDate()).padStart(2,"0")}.${String(x.getMonth()+1).padStart(2,"0")}.${x.getFullYear()}`; };
const fmtDayName = (d) => { const x = new Date(d); return x.toLocaleDateString("en-US", { weekday: "long" }); };
const weekStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()+1); return d.toISOString().split("T")[0]; };
const weekStartOf = (date) => { const d = new Date(date); d.setHours(0,0,0,0); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); return d.toISOString().split("T")[0]; };
const fmtWeekRange = (ws) => { const end = addDays(ws, 6); const s = new Date(ws); const e = new Date(end); return `${String(s.getDate()).padStart(2,"0")}.${String(s.getMonth()+1).padStart(2,"0")} - ${String(e.getDate()).padStart(2,"0")}.${String(e.getMonth()+1).padStart(2,"0")}.${e.getFullYear()}`; };
const monthStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d.toISOString().split("T")[0]; };
const fmtMoney = (v) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v||0);
const getWeekDates = () => { const ws = weekStart(); return Array.from({length:7},(_,i)=>addDays(ws,i)); };
const timeAgo = (ts) => { const d = Math.floor((Date.now() - new Date(ts).getTime())/1000); if(d<60) return "just now"; if(d<3600) return `${Math.floor(d/60)}m ago`; if(d<86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`; };

const getSendDate = (c) => { if(!c.next_follow_up) return { text:"-", color:"#475569", bg:"transparent", isToday: false }; if (c.stage === "new" && (c.current_step || 0) === 0) return { text: "ASAP", color: "#F59E0B", bg: "#F59E0B18", isToday: false, isOverdue: false }; const d = daysDiff(todayStr(), c.next_follow_up); const isToday = d === 0; const isOverdue = d < 0; return { text: fmtEU(c.next_follow_up), color: isOverdue ? "#EF4444" : isToday ? "#F59E0B" : "#94A3B8", bg: isOverdue ? "#EF444418" : isToday ? "#F59E0B18" : "#1E293B", isToday, isOverdue }; };
const getNurtureDate = (c) => { if(!c.next_nurture_date) return null; const d = daysDiff(todayStr(), c.next_nurture_date); const isToday = d === 0; const isOverdue = d < 0; return { text: fmtEU(c.next_nurture_date), color: isOverdue ? "#EF4444" : isToday ? "#F59E0B" : "#94A3B8", bg: isOverdue ? "#EF444418" : isToday ? "#F59E0B18" : "#1E293B", isToday, isOverdue }; };
const needsAction = (c) => { if (c.stage === "responded" && c.loom_pending) return true; if (["new", "outreach", "old", "interested"].includes(c.stage)) { return c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) <= 0 : false; } if (c.stage === "responded") { return c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) <= 0 : false; } return false; };
const urgency = (c) => { if (c.stage === "responded" && c.loom_pending) return -1; if (["new", "outreach", "old", "interested"].includes(c.stage)) { return c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) : 999; } if (c.stage === "responded") { return c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) : 999; } return 999; };

function CRM({ auth }) {
  const user = auth.user;
  const activeWs = auth.workspaceId;
  const TEAM = (auth.members && auth.members.length) ? auth.members : [auth.user];
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [nurtureM, setNurtureM] = useState([]);
  const [kpiTargets, setKpiTargets] = useState([]);
  const [kpiCategories, setKpiCategories] = useState([]);
  const [kpiEntries, setKpiEntries] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [allKpiEntries, setAllKpiEntries] = useState([]);
  const [allActivityLog, setAllActivityLog] = useState([]);
  const [victories, setVictories] = useState([]);
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

  useEffect(() => {
    const load = async () => {
      const [cRes, mRes, ktRes, keRes, alRes, allKeRes, allAlRes, vRes, kcRes] = await Promise.all([
        supabase.from("contacts").select("*").order("created_at", { ascending: false }),
        supabase.from("message_templates").select("*").order("step"),
        supabase.from("kpi_targets").select("*"),
        supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -30)),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -400)),
        supabase.from("activity_log").select("*").gte("created_at", addDays(todayStr(), -400)).order("created_at", { ascending: false }),
        supabase.from("weekly_victories").select("*").order("week_start", { ascending: false }),
        supabase.from("kpi_categories").select("*").order("sort_order"),
      ]);
      if (cRes.data) setContacts(cRes.data);
      if (mRes.data) { setMessages(mRes.data.filter(m => m.type === "outreach")); setNurtureM(mRes.data.filter(m => m.type === "nurture")); }
      if (ktRes.data) setKpiTargets(ktRes.data);
      if (kcRes.data) setKpiCategories(kcRes.data);
      if (keRes.data) setKpiEntries(keRes.data);
      if (alRes.data) setActivityLog(alRes.data);
      if (allKeRes.data) setAllKpiEntries(allKeRes.data);
      if (allAlRes.data) setAllActivityLog(allAlRes.data);
      if (vRes.data) setVictories(vRes.data);
      setLoading(false);
    };
    load();

    const subs = [
      supabase.channel("c-ch").on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => { supabase.from("contacts").select("*").order("created_at", { ascending: false }).then(({ data }) => { if (data) setContacts(data); }); }).subscribe(),
      supabase.channel("m-ch").on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () => { supabase.from("message_templates").select("*").order("step").then(({ data }) => { if (data) { setMessages(data.filter(m => m.type === "outreach")); setNurtureM(data.filter(m => m.type === "nurture")); } }); }).subscribe(),
      supabase.channel("kt-ch").on("postgres_changes", { event: "*", schema: "public", table: "kpi_targets" }, () => { supabase.from("kpi_targets").select("*").then(({ data }) => { if (data) setKpiTargets(data); }); }).subscribe(),
      supabase.channel("kc-ch").on("postgres_changes", { event: "*", schema: "public", table: "kpi_categories" }, () => { supabase.from("kpi_categories").select("*").order("sort_order").then(({ data }) => { if (data) setKpiCategories(data); }); }).subscribe(),
      supabase.channel("ke-ch").on("postgres_changes", { event: "*", schema: "public", table: "kpi_entries" }, () => {
        supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -30)).then(({ data }) => { if (data) setKpiEntries(data); });
        supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -400)).then(({ data }) => { if (data) setAllKpiEntries(data); });
      }).subscribe(),
      supabase.channel("al-ch").on("postgres_changes", { event: "*", schema: "public", table: "activity_log" }, () => {
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => { if (data) setActivityLog(data); });
        supabase.from("activity_log").select("*").gte("created_at", addDays(todayStr(), -400)).order("created_at", { ascending: false }).then(({ data }) => { if (data) setAllActivityLog(data); });
      }).subscribe(),
      supabase.channel("v-ch").on("postgres_changes", { event: "*", schema: "public", table: "weekly_victories" }, () => { supabase.from("weekly_victories").select("*").order("week_start", { ascending: false }).then(({ data }) => { if (data) setVictories(data); }); }).subscribe(),
    ];
    return () => subs.forEach(s => supabase.removeChannel(s));
  }, []);

  const flash = (m, t = "success") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };
  const logActivity = async (person, action, detail = "") => { await supabase.from("activity_log").insert({ person, action, detail, workspace_id: activeWs }); };

  // Contact CRUD
  // Normalize an Instagram URL/handle for comparison
  // Handles: "@dave", "dave", "instagram.com/dave", "https://www.instagram.com/dave/", "https://instagram.com/dave?hl=en"
  // All become: "dave"
  const normIG = (s) => {
    if (!s) return "";
    return s.toString()
      .toLowerCase()
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/^instagram\.com\//, "")
      .replace(/\?.*$/, "") // strip query strings BEFORE trailing slash
      .replace(/\/$/, "")
      .replace(/\/.*$/, ""); // strip anything after the username (paths like /reels, /tagged)
  };

  // ONLY checks Instagram. Same IG = same person. Different IG (or no IG) = different person.
  const findDuplicate = (d, pool = null) => {
    const checkAgainst = pool || contacts;
    const i = normIG(d.ig);
    if (!i) return null; // No IG to check against = not a duplicate
    return checkAgainst.find(c => {
      const cIG = normIG(c.ig);
      return cIG && cIG === i;
    });
  };
  const addContact = async (d) => { const dup = findDuplicate(d); if (dup) { flash(`⚠️ ${dup.name} already exists with that Instagram (${dup.assigned_to || "unassigned"})`, "error"); return false; } const { error } = await supabase.from("contacts").insert({ name: d.name, company: d.company || "", ig: d.ig || "", email: d.email || "", youtube: d.youtube || "", website: d.website || "", linkedin: d.linkedin || "", notes: d.notes || "", stage: "new", current_step: 0, nurture_step: 0, created_at: todayStr(), next_follow_up: todayStr(), pipeline_value: d.pipeline_value || 0, assigned_to: "", outreach_sequence: d.outreach_sequence || "Default", nurture_sequence: d.nurture_sequence || "Default", history: [], nurture_history: [], workspace_id: activeWs }); if (!error) { flash(`${d.name} added`); logActivity(user, "added_lead", d.name); return true; } else { flash("Error: " + error.message, "error"); return false; } };
  const updateContact = async (id, data) => { await supabase.from("contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id); };
  const deleteContact = async (id) => { const name = contacts.find(c => c.id === id)?.name; await supabase.from("contacts").delete().eq("id", id); setDelId(null); if (detailId === id) setDetailId(null); flash(`${name} removed`, "info"); };
  const bulkDelete = async () => { if (selected.size === 0) return; const ids = Array.from(selected); await supabase.from("contacts").delete().in("id", ids); setSelected(new Set()); flash(`Deleted ${ids.length} leads`, "info"); };

  // Delete every lead currently showing in the All Leads view (respects active filter + search).
  // Chunks the deletes so big pipelines don't choke a single request.
  const deleteAllFiltered = async () => {
    const ids = filtered.map(c => c.id);
    if (ids.length === 0) { setModal(null); return; }
    const chunk = 200;
    let done = 0, failed = false;
    for (let i = 0; i < ids.length; i += chunk) {
      const { error } = await supabase.from("contacts").delete().in("id", ids.slice(i, i + chunk));
      if (error) { failed = true; break; }
      done += Math.min(chunk, ids.length - i);
    }
    setSelected(new Set());
    setDetailId(null);
    setModal(null);
    if (failed) flash(`Deleted ${done}, then something broke. Try again.`, "error");
    else { flash(`Deleted ${done} lead${done !== 1 ? "s" : ""}`, "info"); logActivity(user, "bulk_deleted", `${done} leads`); }
  };

  const markSent = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; const ns = (c.current_step || 0) + 1; const seq = c.outreach_sequence || "Default"; let seqMsgs = messages.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); const cm = seqMsgs[c.current_step || 0]; const nm = seqMsgs[ns]; const pv = pendingVariants[id]; const variant = pv?.label || "A"; const isFirst = (c.current_step || 0) === 0; const isLoomSeq = seq.toLowerCase().includes("loom"); const kpiCat = isLoomSeq ? "Looms" : "DMs"; const kpiCatExists = kpiCategories.some(k => k.name === kpiCat); if (isFirst && kpiCatExists) { await logKpi(user, kpiCat, 1); } const upd = { current_step: ns, stage: ns > 0 && ["new", "old"].includes(c.stage) ? "outreach" : c.stage, last_contacted_at: todayStr(), next_follow_up: nm ? addDays(todayStr(), nm.delay_days) : null, history: [...(c.history || []), { step: ns, name: cm?.name || `Msg ${ns}`, variant, at: todayStr() }] }; if (isFirst || !c.assigned_to) upd.assigned_to = user; if (isFirst && !c.original_owner) { upd.original_owner = user; if (!c.cycle) upd.cycle = 1; } await updateContact(id, upd); setPendingVariants(p => { const n = { ...p }; delete n[id]; return n; }); logActivity(user, "sent_outreach", `${cm?.name} (v${variant}) to ${c.name}${c.cycle > 1 ? ` (cycle ${c.cycle})` : ""}`); flash(isFirst && kpiCatExists ? `Marked sent! (+1 ${kpiCat})` : "Marked sent!"); };
  const markNurtureSent = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; const ns = (c.nurture_step || 0) + 1; const seq = c.nurture_sequence || "Default"; let seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); const cm = seqMsgs[c.nurture_step || 0]; const nm = seqMsgs[ns]; await updateContact(id, { nurture_step: ns, last_contacted_at: todayStr(), next_nurture_date: nm ? addDays(todayStr(), nm.delay_days) : addDays(todayStr(), 7), nurture_history: [...(c.nurture_history || []), { step: ns, name: cm?.name || `N ${ns}`, at: todayStr() }] }); logActivity(user, "sent_nurture", `${cm?.name} to ${c.name}`); flash("Nurture sent!"); };
  const moveStage = async (id, stage) => {
    const c = contacts.find(x => x.id === id);
    if (!c) return;

    // Special case: "Not Interested" triggers a handoff to another teammate (same flow as auto-recycle)
    if (stage === "not_interested") {
      const currentCycle = c.cycle || 1;
      const originalOwner = c.original_owner || c.assigned_to || user;

      if (currentCycle >= 3) {
        // Already on cycle 3 → kick to old, return to original owner, NO auto-message
        await updateContact(id, {
          assigned_to: originalOwner,
          original_owner: originalOwner,
          stage: "old",
          next_follow_up: null,
          next_nurture_date: null,
          loom_pending: false,
        });
        logActivity(user, "marked_not_interested", `${c.name} → returned to ${originalOwner} as old lead (already cycle 3)`);
        flash(`${c.name} returned to ${originalOwner} as old lead`);
      } else {
        // Hand off to teammate with fewest active leads
        const nextPerson = findNextAssignee(c.assigned_to || user);
        await updateContact(id, {
          assigned_to: nextPerson,
          original_owner: originalOwner,
          stage: "new",
          current_step: 0,
          cycle: currentCycle + 1,
          next_follow_up: todayStr(),
          last_contacted_at: null,
          loom_pending: false,
          next_nurture_date: null,
        });
        logActivity(user, "marked_not_interested", `${c.name} → handed to ${nextPerson} (cycle ${currentCycle + 1})`);
        flash(`${c.name} handed off to ${nextPerson}`);
      }
      return;
    }

    // Normal stage moves
    const u = { stage };
    if (stage === "responded") { u.loom_pending = true; u.next_follow_up = todayStr(); u.next_nurture_date = null; u.nurture_step = 0; }
    if (stage === "interested") { u.next_follow_up = addDays(todayStr(), 3); u.next_nurture_date = null; u.loom_pending = false; }
    if (["booked", "closed", "lost"].includes(stage)) { u.next_follow_up = null; u.next_nurture_date = null; u.loom_pending = false; }
    if (stage === "old") { u.next_follow_up = addDays(todayStr(), 75); u.next_nurture_date = null; u.loom_pending = false; }
    await updateContact(id, u);
    logActivity(user, "moved_stage", `${c?.name} to ${STAGES.find(s => s.id === stage)?.label}`);
    flash(`Moved to ${STAGES.find(s => s.id === stage)?.label}`);
  };
  const pingLead = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; await updateContact(id, { next_follow_up: addDays(todayStr(), 3), last_contacted_at: todayStr() }); logActivity(user, "pinged_lead", c.name); flash(`Pinged! Check in again in 3 days.`); };
  const confirmLoom = async (id) => { const c = contacts.find(x => x.id === id); if (!c) return; const seq = c.nurture_sequence || "Default"; let seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); const firstMsg = seqMsgs[0]; const delay = firstMsg ? firstMsg.delay_days : 2; const loomExists = kpiCategories.some(k => k.name === "Looms"); if (loomExists) await logKpi(user, "Looms", 1); await updateContact(id, { loom_pending: false, next_follow_up: null, next_nurture_date: addDays(todayStr(), delay), last_contacted_at: todayStr() }); logActivity(user, "sent_loom", c.name); flash(`Loom sent!${loomExists ? " (+1 Looms)" : ""} Nurture in ${delay}d.`); };
  const resetProgress = async (id, step = 0) => { const c = contacts.find(x => x.id === id); if (!c) return; await updateContact(id, { current_step: step, nurture_step: 0, stage: step === 0 ? "new" : "outreach", next_follow_up: todayStr(), next_nurture_date: null, history: step === 0 ? [] : c.history }); flash(`${c.name} reset to step ${step}`); };
  const closeDeal = async (id, v) => { const c = contacts.find(x => x.id === id); await updateContact(id, { stage: "closed", closed_value: v, closed_at: todayStr(), next_follow_up: null, next_nurture_date: null }); logActivity(user, "closed_deal", `${c?.name} for ${fmtMoney(v)}`); flash(`Closed for ${fmtMoney(v)}!`); setCloseId(null); };

  // Message CRUD
  const addMsg = async (d, type) => { const list = (type === "outreach" ? messages : nurtureM).filter(m => (m.sequence_name || "Default") === (d.sequence_name || "Default")); await supabase.from("message_templates").insert({ ...d, step: list.length + 1, type, workspace_id: activeWs }); flash("Added!"); };
  const updateMsg = async (id, d) => { await supabase.from("message_templates").update(d).eq("id", id); flash("Updated!"); };
  const deleteMsg = async (id, type) => { await supabase.from("message_templates").delete().eq("id", id); const list = (type === "outreach" ? messages : nurtureM).filter(m => m.id !== id); for (let i = 0; i < list.length; i++) { await supabase.from("message_templates").update({ step: i + 1 }).eq("id", list[i].id); } flash("Removed", "info"); };
  const deleteSequence = async (name, type) => {
    if (name === "Default") { flash("The Default sequence can't be deleted", "error"); return; }
    const list = (type === "outreach" ? messages : nurtureM).filter(m => (m.sequence_name || "Default") === name);
    if (!confirm(`Delete the "${name}" sequence and its ${list.length} message${list.length !== 1 ? "s" : ""}? Any leads using it will fall back to your Default sequence.`)) return;
    for (const m of list) { await supabase.from("message_templates").delete().eq("id", m.id); }
    flash(`Deleted "${name}" sequence`, "info");
  };

  // KPI functions (editable categories)
  // Active categories, split by how they're tracked
  const activeCats = [...kpiCategories].filter(c => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const dailyCats = activeCats.filter(c => (c.cadence || "daily") === "daily");
  const weeklyCats = activeCats.filter(c => c.cadence === "weekly");
  const catColor = (name) => kpiCategories.find(c => c.name === name)?.color || KPI_COLORS[name] || "#3B82F6";
  // The team-wide target for a category, by how it's tracked
  const catTarget = (cat) => (cat.cadence === "weekly" ? (cat.weekly_target || 0) : (cat.daily_target || 0));

  const getKpiEntry = (person, category, date) => kpiEntries.find(e => e.person === person && e.category === category && e.date === date);
  const getDayCount = (person, category, date) => getKpiEntry(person, category, date)?.count || 0;
  const getWeeklyCount = (person, category) => { const ws = weekStart(); return kpiEntries.filter(e => e.person === person && e.category === category && e.date >= ws).reduce((s, e) => s + (e.count || 0), 0); };
  // Sum a category for the week containing a given week-start, from the long history
  const weekCountOf = (person, category, ws) => allKpiEntries.filter(e => e.person === person && e.category === category && e.date >= ws && e.date <= addDays(ws, 6)).reduce((s, e) => s + (e.count || 0), 0);

  // Streak takes a category OBJECT. Daily cats count consecutive days hitting the daily target. Weekly cats count consecutive weeks hitting the weekly target.
  const getStreak = (person, cat) => {
    if (!cat) return 0;
    if (cat.cadence === "weekly") {
      const tgt = cat.weekly_target || 0;
      if (tgt <= 0) return 0;
      let streak = 0;
      const ws = weekStart();
      if (weekCountOf(person, cat.name, ws) >= tgt) streak++;
      for (let i = 1; i < 52; i++) { if (weekCountOf(person, cat.name, addDays(ws, -7 * i)) >= tgt) streak++; else break; }
      return streak;
    }
    const tgt = cat.daily_target || 0;
    if (tgt <= 0) return 0;
    let streak = 0;
    if (getDayCount(person, cat.name, todayStr()) >= tgt) streak++;
    for (let i = 1; i < 60; i++) { if (getDayCount(person, cat.name, addDays(todayStr(), -i)) >= tgt) streak++; else break; }
    return streak;
  };

  const logKpi = async (person, category, delta) => {
    const date = todayStr();
    const existing = getKpiEntry(person, category, date);
    if (existing) {
      const nc = Math.max(0, (existing.count || 0) + delta);
      await supabase.from("kpi_entries").update({ count: nc, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else if (delta > 0) {
      await supabase.from("kpi_entries").insert({ person, category, count: delta, date, workspace_id: activeWs });
    }
    const { data: fresh } = await supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -30));
    if (fresh) setKpiEntries(fresh);
    const { data: freshAll } = await supabase.from("kpi_entries").select("*").gte("date", addDays(todayStr(), -400));
    if (freshAll) setAllKpiEntries(freshAll);
    if (delta > 0) logActivity(person, "logged_kpi", `+${delta} ${category}`);
  };

  const updateKpiTarget = async (id, data) => { await supabase.from("kpi_targets").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id); flash("Target updated!"); };

  // Category CRUD (the editable non-negotiables)
  const addCategory = async (d) => {
    if (!d.name?.trim()) return;
    if (kpiCategories.some(c => c.name.toLowerCase() === d.name.trim().toLowerCase())) { flash("That name already exists", "error"); return; }
    const maxOrder = kpiCategories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    const { error } = await supabase.from("kpi_categories").insert({ name: d.name.trim(), color: d.color || "#3B82F6", cadence: d.cadence || "daily", daily_target: d.daily_target ?? 1, weekly_target: d.weekly_target ?? 1, sort_order: maxOrder + 1, active: true, workspace_id: activeWs });
    if (error) flash("Error: " + error.message, "error"); else flash(`Added "${d.name.trim()}"`);
  };
  const updateCategory = async (id, d) => { await supabase.from("kpi_categories").update(d).eq("id", id); };
  const deleteCategory = async (id) => { const c = kpiCategories.find(x => x.id === id); await supabase.from("kpi_categories").delete().eq("id", id); flash(`Removed "${c?.name}"`, "info"); };
  // Renaming also moves the logged history over so streaks/totals stay intact
  const renameCategory = async (id, oldName, newName) => {
    if (oldName !== newName) await supabase.from("kpi_entries").update({ category: newName }).eq("category", oldName);
    await supabase.from("kpi_categories").update({ name: newName }).eq("id", id);
  };

  const getSequences = (type) => { const list = type === "outreach" ? messages : nurtureM; return [...new Set(list.map(m => m.sequence_name || "Default"))]; };
  const getNext = (c) => { const seq = c.outreach_sequence || "Default"; let seqMsgs = messages.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = messages.sort((a, b) => a.step - b.step); const idx = c.current_step || 0; const m = seqMsgs[idx]; if (!m) return null; const firstName = c.name.split(" ")[0]; const variants = [{ label: "A", body: m.body.replace(/\{\{name\}\}/g, firstName) }, ...((m.variants || []).map(v => ({ label: v.label, body: v.body.replace(/\{\{name\}\}/g, firstName) })))]; return { ...m, variants, body: variants[0].body }; };
  const getNextN = (c) => { const seq = c.nurture_sequence || "Default"; let seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === seq).sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.filter(m => (m.sequence_name || "Default") === "Default").sort((a, b) => a.step - b.step); if (seqMsgs.length === 0) seqMsgs = nurtureM.sort((a, b) => a.step - b.step); const idx = c.nurture_step || 0; const m = idx < seqMsgs.length ? seqMsgs[idx] : seqMsgs.length > 0 ? seqMsgs[idx % seqMsgs.length] : null; if (!m) return null; const firstName = c.name.split(" ")[0]; const variants = [{ label: "A", body: m.body.replace(/\{\{name\}\}/g, firstName) }, ...((m.variants || []).map(v => ({ label: v.label, body: v.body.replace(/\{\{name\}\}/g, firstName) })))]; return { ...m, variants, body: variants[0].body }; };
  const [pendingVariants, setPendingVariants] = useState({});
  const copy = async (c, type) => { const msg = type === "nurture" ? getNextN(c) : getNext(c); if (!msg) return; const vs = msg.variants || [{ label: "A", body: msg.body }]; const pick = vs[Math.floor(Math.random() * vs.length)]; try { await navigator.clipboard.writeText(pick.body); setCopied(c.id + type); setTimeout(() => setCopied(null), 2e3); setPendingVariants(p => ({ ...p, [c.id]: { label: pick.label, msg: msg.name } })); flash(`Copied Version ${pick.label}!`); } catch { flash("Couldn't copy", "error"); } };
  const importCSV = async (text, seq) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return flash("No data", "error");
    const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const mp = {};
    hdr.forEach((h, i) => {
      if (h === "first name") mp.firstName = i;
      else if (h === "last name") mp.lastName = i;
      else if (h === "name" || h === "full name") mp.name = i;
      else if (h === "company name" || h === "company") mp.company = i;
      else if (h === "title" || h === "job title" || h === "position") mp.title = i;
      else if (h === "email" || h === "email address") mp.email = i;
      else if (h === "person linkedin url" || h === "linkedin" || h === "linkedin url") mp.linkedin = i;
      else if (h.includes("instagram") || h === "ig") mp.ig = i;
      else if (h === "website" || h === "company website" || h === "url" || h === "site") mp.website = i;
      else if (h.includes("youtube") || h === "yt") mp.youtube = i;
      else if (h === "notes" || h === "note") mp.notes = i;
      else if (h.includes("value") || h.includes("deal") || h === "pipeline") mp.pv = i;
      else if (h === "assigned to" || h === "owner") mp.assign = i;
    });
    const hasName = mp.name !== undefined || mp.firstName !== undefined;
    if (!hasName) return flash("Need a 'Name' or 'First Name' column", "error");

    const rows = [];
    let skippedExisting = 0;
    let skippedInBatch = 0;

    for (let i = 1; i < lines.length; i++) {
      const v = []; let inQ = false; let cur = "";
      for (let j = 0; j < lines[i].length; j++) {
        const ch = lines[i][j];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { v.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      v.push(cur.trim());

      let nm = "";
      if (mp.firstName !== undefined) { nm = `${v[mp.firstName] || ""} ${v[mp.lastName] || ""}`.trim(); }
      else { nm = v[mp.name] || ""; }
      if (!nm) continue;

      const email = v[mp.email] || "";
      const title = v[mp.title] || "";
      const company = v[mp.company] || "";
      const linkedin = v[mp.linkedin] || "";
      const ig = v[mp.ig] || "";
      const youtube = v[mp.youtube] || "";
      const website = v[mp.website] || "";

      const candidate = { name: nm, company, email, ig, linkedin, youtube, website };

      // Check 1: against existing contacts in DB
      const dupExisting = findDuplicate(candidate);
      if (dupExisting) { skippedExisting++; continue; }

      // Check 2: against rows already queued in THIS batch
      const dupInBatch = findDuplicate(candidate, rows);
      if (dupInBatch) { skippedInBatch++; continue; }

      const np = []; if (title) np.push(title); if (v[mp.notes]) np.push(v[mp.notes]);
      rows.push({
        name: nm, company: company || "", ig, email, youtube, website,
        linkedin: linkedin || "", notes: np.join(" ") || "",
        stage: "new", current_step: 0, nurture_step: 0,
        created_at: todayStr(), next_follow_up: todayStr(),
        pipeline_value: parseFloat(v[mp.pv]) || 0,
        assigned_to: "", outreach_sequence: seq || "Default",
        nurture_sequence: "Default", history: [], nurture_history: []
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("contacts").insert(rows.map(r => ({ ...r, workspace_id: activeWs })));
      if (!error) {
        const skipMsg = (skippedExisting + skippedInBatch) > 0
          ? ` (${skippedExisting} already in CRM${skippedInBatch > 0 ? `, ${skippedInBatch} duplicates within file` : ""} skipped)`
          : "";
        flash(`Imported ${rows.length} leads${skipMsg}!`);
        logActivity(user, "imported_csv", `${rows.length} leads (${skippedExisting + skippedInBatch} dups skipped)`);
      } else {
        flash("Import error: " + error.message, "error");
      }
    } else {
      const totalSkipped = skippedExisting + skippedInBatch;
      if (totalSkipped > 0) flash(`All ${totalSkipped} leads were duplicates. Nothing imported.`, "error");
      else flash("No valid leads found in CSV", "error");
    }
    setModal(null);
  };

  // === VICTORY ROYALE SYSTEM ===
  // Calculate winners for a specific week (using all KPI entries data)
  const calcWeekWinners = (weekStartDate) => {
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
    const dailyTargets = dailyCats.filter(c => (c.daily_target || 0) > 0);
    const results = TEAM.map(person => {
      let daysHit = 0;
      let totalActivity = 0;
      if (dailyTargets.length > 0) {
        weekDays.forEach(d => {
          const allHit = dailyTargets.every(c => {
            const entry = allKpiEntries.find(e => e.person === person && e.category === c.name && e.date === d);
            return entry && entry.count >= c.daily_target;
          });
          if (allHit) daysHit++;
        });
      }
      // Total activity across ALL active categories for the tiebreaker
      activeCats.forEach(c => {
        weekDays.forEach(d => {
          const entry = allKpiEntries.find(e => e.person === person && e.category === c.name && e.date === d);
          totalActivity += entry?.count || 0;
        });
      });
      return { person, daysHit, totalActivity };
    });
    // Sort: most days hit, then most activity (tiebreaker)
    results.sort((a, b) => b.daysHit - a.daysHit || b.totalActivity - a.totalActivity);
    // Only award if at least one person hit at least 1 day (no fake winners on dead weeks)
    if (results[0].daysHit === 0) return null;
    return {
      first: results[0].person,
      second: results[1].person,
      third: results[2].person,
      details: results,
    };
  };

  // Get total wins per person per title
  const getWinCount = (person, title) => victories.filter(v => v[title] === person).length;

  // Auto-award past weeks that haven't been recorded yet
  const autoAwardPastWeeks = async () => {
    const currentWeek = weekStart();
    const awardedWeeks = new Set(victories.map(v => v.week_start));

    // Find earliest KPI entry date to know how far back to go
    if (allKpiEntries.length === 0) return;
    const earliestDate = allKpiEntries.reduce((min, e) => e.date < min ? e.date : min, todayStr());
    const earliestWeek = weekStartOf(earliestDate);

    // Walk backward from current week (exclusive) to earliest week
    const weeksToAward = [];
    let w = addDays(currentWeek, -7);
    while (w >= earliestWeek) {
      if (!awardedWeeks.has(w)) weeksToAward.push(w);
      w = addDays(w, -7);
    }

    if (weeksToAward.length === 0) return;

    const inserts = [];
    for (const ws of weeksToAward) {
      const winners = calcWeekWinners(ws);
      if (winners) {
        inserts.push({
          week_start: ws,
          top_g: winners.first,
          bottom_g: winners.second,
          gayboy: winners.third,
          workspace_id: activeWs,
        });
      }
    }
    if (inserts.length > 0) {
      await supabase.from("weekly_victories").insert(inserts);
      console.log(`Awarded ${inserts.length} past weeks`);
    }
  };

  // Run auto-award once data is loaded
  useEffect(() => {
    if (!loading && allKpiEntries.length > 0 && kpiCategories.length > 0) {
      autoAwardPastWeeks();
    }
  }, [loading, allKpiEntries.length, kpiCategories.length, victories.length]);

  // === LEAD RECYCLING SYSTEM ===
  // Find the teammate with the fewest active leads (excluding excluded persons)
  const findNextAssignee = (excludePerson) => {
    const counts = TEAM.filter(t => t !== excludePerson).map(person => ({
      person,
      count: contacts.filter(c => c.assigned_to === person && !["closed", "lost", "old", "not_interested"].includes(c.stage)).length,
    }));
    counts.sort((a, b) => a.count - b.count);
    return counts[0]?.person || TEAM[0];
  };

  // Check if a lead's outreach sequence is complete
  const isSequenceComplete = (c) => {
    const seq = c.outreach_sequence || "Default";
    let seqMsgs = messages.filter(m => (m.sequence_name || "Default") === seq);
    if (seqMsgs.length === 0) seqMsgs = messages.filter(m => (m.sequence_name || "Default") === "Default");
    return (c.current_step || 0) >= seqMsgs.length && seqMsgs.length > 0;
  };

  // Auto-handoff: scan for leads ready to be recycled
  const autoRecycleLeads = async () => {
    if (messages.length === 0 || contacts.length === 0) return;

    const today = todayStr();
    const updates = [];

    for (const c of contacts) {
      // Only recycle leads in active outreach with an assignee
      if (c.stage !== "outreach" || !c.assigned_to) continue;
      // Must have completed the sequence
      if (!isSequenceComplete(c)) continue;
      // Must have a last_contacted_at to measure cooldown from
      if (!c.last_contacted_at) continue;
      // 3-day cooldown after last message
      if (daysDiff(c.last_contacted_at, today) < 3) continue;

      const currentCycle = c.cycle || 1;
      const originalOwner = c.original_owner || c.assigned_to;

      if (currentCycle >= 3) {
        // End of round 3 → kick to old, return to original owner, NO auto-message
        updates.push({
          id: c.id,
          assigned_to: originalOwner,
          original_owner: originalOwner,
          stage: "old",
          next_follow_up: null,
          next_nurture_date: null,
          loom_pending: false,
        });
      } else {
        // Hand off to next person (least busy, excluding current owner)
        const nextPerson = findNextAssignee(c.assigned_to);
        updates.push({
          id: c.id,
          assigned_to: nextPerson,
          original_owner: originalOwner,
          stage: "new",
          current_step: 0,
          cycle: currentCycle + 1,
          next_follow_up: today,
          last_contacted_at: null,
          history: c.history || [],
        });
      }
    }

    if (updates.length === 0) return;

    // Apply updates one by one (Supabase doesn't bulk-update easily)
    for (const u of updates) {
      const { id, ...data } = u;
      await supabase.from("contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id);
      const c = contacts.find(x => x.id === id);
      if (c) {
        if (data.stage === "old") {
          await logActivity("System", "recycled_to_old", `${c.name} returned to ${data.assigned_to} as old lead after 3 cycles`);
        } else {
          await logActivity("System", "recycled_lead", `${c.name} handed from ${c.assigned_to} to ${data.assigned_to} (cycle ${data.cycle})`);
        }
      }
    }
    if (updates.length > 0) {
      console.log(`Recycled ${updates.length} leads`);
    }
  };

  // Run recycle check once data is loaded (and again on contacts/messages changes, but throttled)
  const recycleRunRef = useRef(0);
  useEffect(() => {
    if (!loading && contacts.length > 0 && messages.length > 0) {
      const now = Date.now();
      if (now - recycleRunRef.current > 60000) { // throttle to once per minute
        recycleRunRef.current = now;
        autoRecycleLeads();
      }
    }
  }, [loading, contacts.length, messages.length]);

  // === DUPLICATE FINDER ===
  // Group contacts by their potential duplicate-match keys, return groups with 2+ members
  const findDuplicateGroups = () => {
    const groups = new Map();
    const addToGroup = (key, contact) => {
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(contact);
    };
    contacts.forEach(c => {
      const i = normIG(c.ig); if (i) addToGroup(`ig:${i}`, c);
    });
    // Filter to only groups with 2+ contacts, dedupe contacts that appear in multiple groups
    const seen = new Set();
    const result = [];
    for (const [key, list] of groups.entries()) {
      if (list.length < 2) continue;
      // Only show if this contact group hasn't been shown yet (use the smallest ID combo as fingerprint)
      const ids = list.map(c => c.id).sort().join(",");
      if (seen.has(ids)) continue;
      seen.add(ids);
      result.push({ key, matchedOn: key.split(":")[0], contacts: list });
    }
    return result;
  };

  // === STANDUP FEED DATA (Yesterday's recap) ===
  const getYesterdayRecap = () => {
    const y = yesterdayStr();
    return TEAM.map(person => {
      // One row per active DAILY non-negotiable
      const cats = dailyCats.map(c => {
        const count = allKpiEntries.find(e => e.person === person && e.category === c.name && e.date === y)?.count || 0;
        const target = c.daily_target || 0;
        const hit = target > 0 ? count >= target : null;
        return { name: c.name, color: catColor(c.name), count, target, hit };
      });

      // Activity from log
      const yLog = allActivityLog.filter(a => a.person === person && a.created_at.split("T")[0] === y);
      const closes = yLog.filter(a => a.action === "closed_deal");
      const closedCount = closes.length;
      const closedValue = closes.reduce((sum, a) => { const m = a.detail?.match(/\$([0-9,]+)/); return sum + (m ? parseInt(m[1].replace(/,/g, "")) : 0); }, 0);
      const booked = yLog.filter(a => a.action === "moved_stage" && a.detail?.includes("Call Booked")).length;
      const movedToResponded = yLog.filter(a => a.action === "moved_stage" && a.detail?.includes("Responded")).length;

      const catTotal = cats.reduce((s, c) => s + c.count, 0);
      const totalActivity = catTotal + closedCount + booked + movedToResponded;

      return { person, cats, responses: movedToResponded, closedCount, closedValue, booked, totalActivity };
    });
  };

  // === CALENDAR DATA ===
  const getCalendarData = (year, person, metric) => {
    // metric: "all" | "closed" | a category name
    const data = {};
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    if (metric === "all") {
      allKpiEntries
        .filter(e => e.date >= start && e.date <= end && (person === "all" || e.person === person))
        .forEach(e => { data[e.date] = (data[e.date] || 0) + (e.count || 0); });
    } else if (metric === "closed") {
      contacts
        .filter(c => c.stage === "closed" && c.closed_at && c.closed_at >= start && c.closed_at <= end && (person === "all" || c.assigned_to === person))
        .forEach(c => { data[c.closed_at] = (data[c.closed_at] || 0) + 1; });
    } else {
      // metric is a category name
      allKpiEntries
        .filter(e => e.date >= start && e.date <= end && e.category === metric && (person === "all" || e.person === person))
        .forEach(e => { data[e.date] = (data[e.date] || 0) + (e.count || 0); });
    }
    return data;
  };

  // Leaderboard data
  const getLeaderboard = () => {
    const ws = weekStart();
    const daysSoFar = Math.max(1, daysDiff(ws, todayStr()) + 1);
    const weekDaysSoFar = Array.from({ length: daysSoFar }, (_, i) => addDays(ws, i));
    const dailyTargets = dailyCats.filter(c => (c.daily_target || 0) > 0);
    return TEAM.map(person => {
      // weekly count + streak for every active category
      const cats = activeCats.map(c => ({
        name: c.name,
        color: catColor(c.name),
        cadence: c.cadence || "daily",
        weekly: getWeeklyCount(person, c.name),
        streak: getStreak(person, c),
      }));
      const totalWeekly = cats.reduce((s, c) => s + c.weekly, 0);
      const topStreak = cats.reduce((m, c) => Math.max(m, c.streak), 0);
      const myLeads = contacts.filter(c => c.assigned_to === person);
      const closedVal = myLeads.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0);
      let daysHit = 0;
      if (dailyTargets.length > 0) { weekDaysSoFar.forEach(d => { const allHit = dailyTargets.every(c => { const cnt = getDayCount(person, c.name, d); return cnt >= c.daily_target; }); if (allHit) daysHit++; }); }
      return { person, cats, topStreak, totalWeekly, closedVal, leads: myLeads.length, daysHit, daysSoFar };
    }).sort((a, b) => b.daysHit - a.daysHit || b.totalWeekly - a.totalWeekly);
  };

  const filtered = contacts.filter(c => filter === "all" || c.stage === filter).filter(c => { if (!search) return true; const s = search.toLowerCase(); return c.name.toLowerCase().includes(s) || c.ig?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.notes?.toLowerCase().includes(s); }).sort((a, b) => { let av, bv; if (sortBy === "next_follow_up") { av = a.next_follow_up || "9999"; bv = b.next_follow_up || "9999"; } else if (sortBy === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); } else if (sortBy === "stage") { av = STAGES.findIndex(s => s.id === a.stage); bv = STAGES.findIndex(s => s.id === b.stage); } else { av = a.created_at; bv = b.created_at; } return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1); });

  const wk = weekStart(), mo = monthStart();
  const stats = { contactedWeek: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= wk).length, contactedMonth: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= mo).length, pipeline: contacts.filter(c => !["closed", "lost"].includes(c.stage)).reduce((s, c) => s + (c.pipeline_value || 0), 0), closedTotal: contacts.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0), closedMonth: contacts.filter(c => c.stage === "closed" && c.closed_at && c.closed_at >= mo).reduce((s, c) => s + (c.closed_value || 0), 0), convRate: contacts.length ? Math.round((contacts.filter(c => c.stage === "closed").length / contacts.length) * 100) : 0 };
  const actionsDue = contacts.filter(needsAction);
  const myActionsDue = actionsDue.filter(c => c.assigned_to === user || !c.assigned_to);

  if (loading) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0B1120" }}><div style={{ textAlign: "center" }}><div style={{ width: 32, height: 32, border: "3px solid #1E293B", borderTop: "3px solid #3B82F6", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} /><p style={{ color: "#94A3B8", marginTop: 16, fontFamily: "'DM Sans',sans-serif" }}>Loading LeadFlow...</p></div></div>);

  const NAV = [
    { id: "dashboard", label: "Dashboard", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
    { id: "kpis", label: "KPIs", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { id: "activity", label: "Activity", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { id: "finder", label: "Lead Finder", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
    { id: "myleads", label: "My Leads", d: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z", badge: myActionsDue.length || null },
    { id: "contacts", label: "All Leads", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { id: "messages", label: "Outreach", d: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    { id: "nurture", label: "Nurture", d: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
  ];

  // === SHARED COMPONENTS ===
  const ProgressBar = ({ value, max, color, h = 8 }) => { const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0; return (<div style={{ width: "100%", height: h, background: "#1E293B", borderRadius: h / 2, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#10B981" : color, borderRadius: h / 2, transition: "width 0.3s" }} /></div>); };

  // === STANDUP FEED ===
  const StandupFeed = () => {
    const recap = getYesterdayRecap();
    const yDate = yesterdayStr();
    const dayName = fmtDayName(yDate);
    const catTotalOf = (r) => r.cats.reduce((s, c) => s + c.count, 0);
    const teamActivity = recap.reduce((s, r) => s + catTotalOf(r), 0);
    const totalClosed = recap.reduce((s, r) => s + r.closedValue, 0);
    const totalBooked = recap.reduce((s, r) => s + r.booked, 0);
    const noActivity = teamActivity + totalClosed + totalBooked === 0;
    const maxCatTotal = Math.max(0, ...recap.map(catTotalOf));

    return (
      <div style={{ marginBottom: 20, background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)", borderRadius: 12, border: "1px solid #3B82F640", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 18 }}>☀️</span>
              <h2 style={{ ...S.h2, margin: 0, color: "#F1F5F9" }}>Yesterday&apos;s Standup</h2>
            </div>
            <div style={{ color: "#94A3B8", fontSize: 11 }}>{dayName}, {fmtEU(yDate)}</div>
          </div>
          {!noActivity && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>Team Activity</div><div style={{ fontSize: 18, fontWeight: 700, color: "#3B82F6", fontFamily: "'Outfit',sans-serif" }}>{teamActivity}</div></div>
              {totalBooked > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>Booked</div><div style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B", fontFamily: "'Outfit',sans-serif" }}>{totalBooked}</div></div>}
              {totalClosed > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 700, textTransform: "uppercase" }}>Closed</div><div style={{ fontSize: 18, fontWeight: 700, color: "#10B981", fontFamily: "'Outfit',sans-serif" }}>{fmtMoney(totalClosed)}</div></div>}
            </div>
          )}
        </div>

        {noActivity ? (
          <div style={{ padding: 16, background: "#0B112080", borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>😴</div>
            <div style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>No activity logged yesterday</div>
            <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>Time to change that today.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {recap.map(r => {
              const catTotal = catTotalOf(r);
              const hasActivity = catTotal + r.closedCount + r.booked + r.responses > 0;
              const missedTargets = r.cats.some(c => c.hit === false);
              const isMVP = r.closedValue > 0 || (catTotal === maxCatTotal && catTotal > 0);

              return (
                <div key={r.person} style={{
                  padding: 12,
                  background: "#0B1120",
                  borderRadius: 10,
                  border: `1px solid ${isMVP ? "#10B98140" : missedTargets ? "#EF444430" : "#1E293B"}`,
                  borderTop: `3px solid ${isMVP ? "#10B981" : missedTargets ? "#EF4444" : !hasActivity ? "#EF4444" : "#3B82F6"}`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 14 }}>{r.person}</span>
                      {r.person === user && <span style={{ color: "#3B82F6", fontSize: 9 }}>(you)</span>}
                    </div>
                    {isMVP && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#10B98120", color: "#10B981" }}>⭐ MVP</span>}
                    {!hasActivity && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#EF444420", color: "#EF4444" }}>💤 Quiet</span>}
                    {missedTargets && hasActivity && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }}>⚠ Below KPI</span>}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {r.cats.map(c => (
                      <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#94A3B8" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: "#F1F5F9", fontWeight: 600 }}>{c.count}</span>
                          {c.target > 0 && <span style={{ color: "#475569", fontSize: 10 }}>/{c.target}</span>}
                          {c.hit === true && <span style={{ color: "#10B981" }}>✓</span>}
                          {c.hit === false && <span style={{ color: "#EF4444" }}>✕</span>}
                        </span>
                      </div>
                    ))}
                    {r.responses > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "#94A3B8" }}>💬 Replies</span>
                        <span style={{ color: "#8B5CF6", fontWeight: 600 }}>{r.responses}</span>
                      </div>
                    )}
                    {r.booked > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "#94A3B8" }}>📞 Booked</span>
                        <span style={{ color: "#F59E0B", fontWeight: 600 }}>{r.booked}</span>
                      </div>
                    )}
                    {r.closedCount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", background: "#10B98115", borderRadius: 6, marginTop: 2 }}>
                        <span style={{ color: "#10B981", fontWeight: 600 }}>🎉 Closed</span>
                        <span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(r.closedValue)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // === ACTIVITY CALENDAR (GitHub-style heatmap) ===
  const ActivityView = () => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [selPerson, setSelPerson] = useState("all");
    const [metric, setMetric] = useState("all");
    const [hovered, setHovered] = useState(null);

    const data = getCalendarData(year, selPerson, metric);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    // Find max for color scaling
    const values = Object.values(data);
    const maxVal = values.length > 0 ? Math.max(...values) : 0;

    // Build grid: 53 weeks x 7 days
    const firstDay = new Date(yearStart);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay()); // Start on Sunday
    const weeks = [];
    let current = new Date(firstDay);
    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = current.toISOString().split("T")[0];
        const inYear = current >= yearStart && current <= yearEnd;
        week.push({ date: dateStr, value: data[dateStr] || 0, inYear, isToday: dateStr === todayStr() });
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }

    const hexToRgb = (hex) => {
      const h = (hex || "#3B82F6").replace("#", "");
      const n = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
      return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
    };
    const getColor = (val, inYear) => {
      if (!inYear) return "transparent";
      if (val === 0) return "#1E293B";
      const baseColor = metric === "all" ? [59, 130, 246] : metric === "closed" ? [16, 185, 129] : hexToRgb(catColor(metric));
      const intensity = maxVal > 0 ? val / maxVal : 0;
      const tier = intensity < 0.25 ? 0.25 : intensity < 0.5 ? 0.5 : intensity < 0.75 ? 0.75 : 1;
      return `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${tier})`;
    };

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Calculate month positions
    const monthPositions = months.map((m, i) => {
      const firstOfMonth = new Date(year, i, 1);
      let weekIdx = 0;
      for (let w = 0; w < weeks.length; w++) {
        if (weeks[w].some(d => d.date === firstOfMonth.toISOString().split("T")[0])) { weekIdx = w; break; }
      }
      return { name: m, weekIdx };
    });

    // Stats
    const totalForYear = values.reduce((s, v) => s + v, 0);
    const activeDays = values.filter(v => v > 0).length;
    const bestDay = values.length > 0 ? Math.max(...values) : 0;
    const bestDayDate = Object.entries(data).find(([d, v]) => v === bestDay)?.[0];

    // Monthly breakdown
    const monthlyTotals = months.map((m, i) => {
      const monthStartStr = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      const nextMonth = i === 11 ? `${year + 1}-01-01` : `${year}-${String(i + 2).padStart(2, "0")}-01`;
      const total = Object.entries(data).filter(([d]) => d >= monthStartStr && d < nextMonth).reduce((s, [, v]) => s + v, 0);
      return { name: m, total };
    });

    const metricLabels = { all: "All Activity", closed: "Deals Closed" };
    activeCats.forEach(c => { metricLabels[c.name] = c.name; });
    const years = [];
    const cy = new Date().getFullYear();
    for (let y = cy; y >= cy - 3; y--) years.push(y);

    return (
      <div style={S.content}>
        <div style={S.header}>
          <div>
            <h1 style={S.h1}>Activity Calendar</h1>
            <p style={S.sub}>See your team&apos;s output across the year</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16, padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B" }}>
          <div>
            <div style={{ ...S.lb, marginBottom: 5 }}>Person</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ ...S.pill, ...(selPerson === "all" ? S.pillOn : {}) }} onClick={() => setSelPerson("all")}>Whole Team</button>
              {TEAM.map(p => <button key={p} style={{ ...S.pill, ...(selPerson === p ? S.pillOn : {}) }} onClick={() => setSelPerson(p)}>{p}</button>)}
            </div>
          </div>
          <div>
            <div style={{ ...S.lb, marginBottom: 5 }}>Metric</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button style={{ ...S.pill, ...(metric === "all" ? S.pillOn : {}) }} onClick={() => setMetric("all")}>All Activity</button>
              {activeCats.map(c => <button key={c.id} style={{ ...S.pill, ...(metric === c.name ? S.pillOn : {}) }} onClick={() => setMetric(c.name)}>{c.name}</button>)}
              <button style={{ ...S.pill, ...(metric === "closed" ? S.pillOn : {}) }} onClick={() => setMetric("closed")}>🎉 Closed</button>
            </div>
          </div>
          <div>
            <div style={{ ...S.lb, marginBottom: 5 }}>Year</div>
            <div style={{ display: "flex", gap: 4 }}>
              {years.map(y => <button key={y} style={{ ...S.pill, ...(year === y ? S.pillOn : {}) }} onClick={() => setYear(y)}>{y}</button>)}
            </div>
          </div>
        </div>

        {/* Year stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: "3px solid #3B82F6" }}>
            <div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{metricLabels[metric]} ({year})</div>
            <div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{totalForYear.toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: "3px solid #10B981" }}>
            <div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Active Days</div>
            <div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{activeDays}</div>
          </div>
          <div style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: "3px solid #F59E0B" }}>
            <div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Best Day</div>
            <div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{bestDay}</div>
            {bestDayDate && <div style={{ color: "#64748B", fontSize: 10 }}>{fmtEU(bestDayDate)}</div>}
          </div>
          <div style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: "3px solid #8B5CF6" }}>
            <div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Daily Average</div>
            <div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{activeDays > 0 ? Math.round(totalForYear / activeDays) : 0}</div>
            <div style={{ color: "#64748B", fontSize: 10 }}>per active day</div>
          </div>
        </div>

        {/* Heatmap */}
        <div style={{ background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B", padding: 16, marginBottom: 16, overflowX: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 750 }}>
            {/* Month labels */}
            <div style={{ display: "flex", marginLeft: 30, marginBottom: 4, position: "relative", height: 14 }}>
              {monthPositions.map(({ name, weekIdx }) => (
                <div key={name} style={{ position: "absolute", left: weekIdx * 14, color: "#64748B", fontSize: 10, fontWeight: 600 }}>{name}</div>
              ))}
            </div>

            {/* Grid */}
            <div style={{ display: "flex" }}>
              {/* Day labels */}
              <div style={{ display: "flex", flexDirection: "column", marginRight: 4, gap: 2 }}>
                {dayLabels.map((d, i) => (
                  <div key={d} style={{ height: 12, fontSize: 9, color: "#64748B", display: "flex", alignItems: "center", visibility: i % 2 === 1 ? "visible" : "hidden" }}>{d}</div>
                ))}
              </div>

              {/* Weeks */}
              <div style={{ display: "flex", gap: 2 }}>
                {weeks.map((week, wi) => (
                  <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {week.map((day, di) => (
                      <div
                        key={day.date}
                        onMouseEnter={() => day.inYear && setHovered(day)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: 12, height: 12, borderRadius: 2,
                          background: getColor(day.value, day.inYear),
                          border: day.isToday ? "1px solid #F59E0B" : "1px solid transparent",
                          cursor: day.inYear ? "pointer" : "default",
                          transition: "transform 0.1s",
                          transform: hovered?.date === day.date ? "scale(1.3)" : "scale(1)"
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
              <span style={{ color: "#64748B", fontSize: 10 }}>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((tier, i) => {
                const baseColor = metric === "all" ? [59, 130, 246] : metric === "closed" ? [16, 185, 129] : hexToRgb(catColor(metric));
                return <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: tier === 0 ? "#1E293B" : `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${tier})` }} />;
              })}
              <span style={{ color: "#64748B", fontSize: 10 }}>More</span>
            </div>
          </div>

          {/* Hover tooltip */}
          {hovered && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#0B1120", borderRadius: 8, border: "1px solid #334155", display: "inline-block" }}>
              <span style={{ color: "#F1F5F9", fontSize: 12, fontWeight: 600 }}>{hovered.value}</span>
              <span style={{ color: "#94A3B8", fontSize: 12 }}> on {fmtDayName(hovered.date)}, {fmtEU(hovered.date)}</span>
            </div>
          )}
        </div>

        {/* Monthly breakdown */}
        <h2 style={S.h2}>Monthly Breakdown</h2>
        <div style={{ background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B", padding: 14 }}>
          {(() => {
            const maxMonth = Math.max(...monthlyTotals.map(m => m.total), 1);
            return monthlyTotals.map(m => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, width: 30 }}>{m.name}</span>
                <div style={{ flex: 1, height: 18, background: "#0B1120", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${(m.total / maxMonth) * 100}%`, height: "100%", background: metric === "all" ? "linear-gradient(90deg, #3B82F660, #3B82F6)" : metric === "closed" ? "linear-gradient(90deg, #10B98160, #10B981)" : `linear-gradient(90deg, ${catColor(metric)}60, ${catColor(metric)})`, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <span style={{ color: "#F1F5F9", fontSize: 12, fontWeight: 700, fontFamily: "'Outfit',sans-serif", width: 50, textAlign: "right" }}>{m.total.toLocaleString()}</span>
              </div>
            ));
          })()}
        </div>
      </div>
    );
  };

  const Row = ({ c, showWho }) => {
    const sd = getSendDate(c); const nd = getNurtureDate(c); const nm = getNext(c); const nn = getNextN(c); const stg = STAGES.find(s => s.id === c.stage);
    const isO = ["new", "outreach", "old"].includes(c.stage); const isLoom = c.stage === "responded" && c.loom_pending; const isN = c.stage === "responded" && !c.loom_pending && c.next_nurture_date; const isInt = c.stage === "interested";
    return (<tr style={S.tr} onClick={() => setDetailId(detailId === c.id ? null : c.id)}>
      <td style={S.td} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => { const n = new Set(selected); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setSelected(n); }} style={{ cursor: "pointer", accentColor: "#3B82F6" }} /></td>
      <td style={S.td}><div style={{ fontWeight: 500, color: "#F1F5F9", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>{c.name}{(c.cycle || 1) > 1 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }} title={`Cycle ${c.cycle} of 3 — recycled from ${c.original_owner}`}>R{c.cycle}</span>}</div>{c.company && <div style={{ fontSize: 10, color: "#3B82F6" }}>{c.company}</div>}{showWho && <div style={{ fontSize: 10, color: c.assigned_to ? "#64748B" : "#F59E0B" }}>{c.assigned_to || "Unassigned"}</div>}{c.notes && <div style={{ fontSize: 10, color: "#475569", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes}</div>}</td>
      <td style={S.td}><select value={c.stage} onChange={e => { e.stopPropagation(); if (e.target.value === "closed") setCloseId(c.id); else moveStage(c.id, e.target.value); }} onClick={e => e.stopPropagation()} style={{ ...S.sel, color: stg.color, borderColor: stg.color + "40" }}>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
      <td style={S.td} onClick={e => e.stopPropagation()}>{isO && nm ? (<button style={S.copyBtn} onClick={() => copy(c, "outreach")}><span style={{ fontSize: 11, color: "#CBD5E1", fontWeight: 500 }}>{nm.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "outreach" ? "✓ Copied!" : nm.channel === "ig" ? "📱 Copy DM" : "📧 Copy Email"}</span></button>) : isLoom ? (<button style={{ ...S.copyBtn, borderColor: "#F59E0B30", background: "#F59E0B08" }}><span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>🎥 Send Loom</span><span style={{ fontSize: 10, color: "#475569" }}>Record & send personalized video</span></button>) : isInt ? (<span style={{ fontSize: 11, color: "#06B6D4", fontWeight: 500 }}>💬 Check in if quiet</span>) : isN && nn ? (<button style={{ ...S.copyBtn, borderColor: "#8B5CF630" }} onClick={() => copy(c, "nurture")}><span style={{ fontSize: 11, color: "#C4B5FD", fontWeight: 500 }}>{nn.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "nurture" ? "✓ Copied!" : "🔁 Copy"}</span></button>) : (<span style={{ fontSize: 11, color: "#475569" }}>{["closed", "booked", "not_interested"].includes(c.stage) ? "✅" : "Done"}</span>)}</td>
      <td style={S.td}>{(isO || isInt) && c.next_follow_up ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: sd.bg, color: sd.color, display: "inline-flex", alignItems: "center", gap: 4 }}>{(sd.isToday || sd.isOverdue) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: sd.isOverdue ? "#EF4444" : "#F59E0B", flexShrink: 0 }} />}{sd.text}</span> : isLoom ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "#F59E0B18", color: "#F59E0B", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />ASAP</span> : isN && nd ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: nd.bg, color: nd.color, display: "inline-flex", alignItems: "center", gap: 4 }}>{(nd.isToday || nd.isOverdue) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: nd.isOverdue ? "#EF4444" : "#F59E0B", flexShrink: 0 }} />}{nd.text}</span> : <span style={{ color: "#475569", fontSize: 11 }}>-</span>}</td>
      <td style={S.td}>{c.pipeline_value ? <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmtMoney(c.pipeline_value)}</span> : c.closed_value ? <span style={{ fontSize: 12, color: c.stage === "closed" ? "#10B981" : "#EF4444", fontWeight: 600 }}>{fmtMoney(c.closed_value)}</span> : <span style={{ fontSize: 11, color: "#334155" }}>-</span>}</td>
      <td style={S.td} onClick={e => e.stopPropagation()}><div style={{ display: "flex", gap: 3 }}>{c.ig && <a href={c.ig.startsWith("http") ? c.ig : `https://instagram.com/${c.ig.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={S.link}>IG</a>}{c.email && <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`} target="_blank" rel="noopener noreferrer" style={S.link}>@</a>}{c.youtube && <a href={c.youtube.startsWith("http") ? c.youtube : `https://youtube.com/${c.youtube}`} target="_blank" rel="noopener noreferrer" style={S.link}>YT</a>}{c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={S.link}>🌐</a>}{c.linkedin && <a href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer" style={S.link}>in</a>}</div></td>
      <td style={S.td} onClick={e => e.stopPropagation()}><div style={{ display: "flex", gap: 3 }}>{isO && nm && <button style={{ ...S.act, color: "#10B981" }} onClick={() => markSent(c.id)}>✓</button>}{isLoom && <button style={{ ...S.act, color: "#F59E0B", borderColor: "#F59E0B40" }} onClick={() => confirmLoom(c.id)}>✓</button>}{isInt && <button style={{ ...S.act, color: "#06B6D4", borderColor: "#06B6D440" }} onClick={() => pingLead(c.id)} title="Pinged - reset 3 day timer">📌</button>}{isN && <button style={{ ...S.act, color: "#8B5CF6" }} onClick={() => markNurtureSent(c.id)}>✓</button>}<button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "contact", data: c })}>✎</button><button style={{ ...S.act, color: "#EF4444" }} onClick={() => setDelId(c.id)}>✕</button></div></td>
    </tr>);
  };

  const Table = ({ data, showWho = false }) => { const allIds = data.map(c => c.id); const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id)); const toggleAll = () => { const n = new Set(selected); if (allSelected) allIds.forEach(id => n.delete(id)); else allIds.forEach(id => n.add(id)); setSelected(n); }; return (<div style={S.tw}><table style={S.tbl}><thead><tr><th style={{ ...S.th, width: 30 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer", accentColor: "#3B82F6" }} /></th>{[{ k: "name", l: "Name" }, { k: "stage", l: "Stage" }, { k: null, l: "Next Message" }, { k: "next_follow_up", l: "Send Date" }, { k: null, l: "Value" }, { k: null, l: "Links" }, { k: null, l: "Actions" }].map((c, i) => (<th key={i} style={{ ...S.th, cursor: c.k ? "pointer" : "default" }} onClick={() => { if (!c.k) return; if (sortBy === c.k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(c.k); setSortDir("asc"); } }}>{c.l}{sortBy === c.k && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}</th>))}</tr></thead><tbody>{data.map(c => <Row key={c.id} c={c} showWho={showWho} />)}</tbody></table></div>); };

  const Detail = () => { const c = contacts.find(x => x.id === detailId); if (!c) return null; const nm = getNext(c); const nn = getNextN(c); return (<div style={S.detail}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><h3 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>{c.name}{(c.cycle || 1) > 1 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#F59E0B20", color: "#F59E0B" }}>Cycle {c.cycle}/3</span>}</h3>{c.company && <div style={{ color: "#3B82F6", fontSize: 12, marginTop: 2 }}>{c.company}</div>}<div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>Added {fmtEU(c.created_at)} · Assigned to <strong style={{ color: "#CBD5E1" }}>{c.assigned_to}</strong>{c.original_owner && c.original_owner !== c.assigned_to && <span> · Originally <strong style={{ color: "#94A3B8" }}>{c.original_owner}</strong></span>}</div></div><button style={S.x} onClick={() => setDetailId(null)}>✕</button></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>{c.ig && <div style={S.df}><span style={S.dl}>Instagram</span><span style={S.dv}>{c.ig}</span></div>}{c.email && <div style={S.df}><span style={S.dl}>Email</span><span style={S.dv}>{c.email}</span></div>}{c.youtube && <div style={S.df}><span style={S.dl}>YouTube</span><span style={S.dv}>{c.youtube}</span></div>}{c.website && <div style={S.df}><span style={S.dl}>Website</span><span style={S.dv}>{c.website}</span></div>}{c.linkedin && <div style={S.df}><span style={S.dl}>LinkedIn</span><span style={S.dv}>{c.linkedin}</span></div>}{c.pipeline_value > 0 && <div style={S.df}><span style={S.dl}>Pipeline Value</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.pipeline_value)}</span></div>}{c.closed_value > 0 && <div style={S.df}><span style={S.dl}>Closed For</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.closed_value)}</span></div>}</div>{c.notes && <div style={{ ...S.df, marginTop: 8 }}><span style={S.dl}>Notes</span><span style={{ ...S.dv, whiteSpace: "pre-wrap" }}>{c.notes}</span></div>}{nm && ["new", "outreach", "old"].includes(c.stage) && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #1E293B" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>NEXT: {nm.name}</span><button style={S.sc} onClick={() => copy(c, "outreach")}>{copied === c.id + "outreach" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nm.body}</div></div>)}{nn && c.stage === "responded" && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #8B5CF620" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#C4B5FD", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>NURTURE: {nn.name}</span><button style={{ ...S.sc, borderColor: "#8B5CF640", color: "#C4B5FD" }} onClick={() => copy(c, "nurture")}>{copied === c.id + "nurture" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nn.body}</div></div>)}{((c.history || []).length > 0 || (c.nurture_history || []).length > 0) && (<div style={{ marginTop: 12 }}><span style={{ color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Activity</span><div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>{[...(c.history || []).map(h => ({ ...h, t: "out" })), ...(c.nurture_history || []).map(h => ({ ...h, t: "nur" }))].sort((a, b) => b.at > a.at ? 1 : -1).map((h, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1E293B" }}><span style={{ color: h.t === "nur" ? "#C4B5FD" : "#CBD5E1", fontSize: 11 }}>{h.t === "nur" ? "🔁 " : "📤 "}{h.name}</span><span style={{ color: "#64748B", fontSize: 10 }}>{fmtEU(h.at)}</span></div>))}</div></div>)}</div>); };

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
    const createSeq = async () => { if (!newSeqName.trim()) return; await supabase.from("message_templates").insert({ name: "Message 1", channel: "ig", delay_days: 0, body: "Hey {{name}}, ", step: 1, type, sequence_name: newSeqName.trim(), workspace_id: activeWs }); setActiveSeq(newSeqName.trim()); setNewSeqName(""); setShowNewSeq(false); flash(`Sequence "${newSeqName.trim()}" created!`); };
    const reorder = async (fromIdx, toIdx) => { if (fromIdx === toIdx) return; const reordered = [...list]; const [moved] = reordered.splice(fromIdx, 1); reordered.splice(toIdx, 0, moved); for (let i = 0; i < reordered.length; i++) { await supabase.from("message_templates").update({ step: i + 1 }).eq("id", reordered[i].id); } flash("Reordered!"); setDragIdx(null); setDragOverIdx(null); };
    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>{type === "outreach" ? "Outreach Sequences" : "Nurture Sequences"}</h1><p style={S.sub}>Drag messages to reorder. Top = first message sent.</p></div><div style={{ display: "flex", gap: 6 }}><button style={S.ghost} onClick={() => setShowNewSeq(!showNewSeq)}>+ New Sequence</button><button style={S.pri} onClick={() => setModal({ type: "msg", data: null, msgType: type, seqName: activeSeq })}>+ Add Message</button></div></div>
      {showNewSeq && <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "end" }}><div style={S.fi}><label style={S.lb}>Sequence Name</label><input style={S.ip} value={newSeqName} onChange={e => setNewSeqName(e.target.value)} placeholder="e.g. Software CEOs" onKeyDown={e => e.key === "Enter" && createSeq()} /></div><button style={S.pri} onClick={createSeq}>Create</button></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16, alignItems: "center" }}>{seqs.map(s => <button key={s} style={{ ...S.pill, ...(activeSeq === s ? S.pillOn : {}) }} onClick={() => setActiveSeq(s)}>{s} <span style={{ opacity: .5 }}>{allList.filter(m => (m.sequence_name || "Default") === s).length}</span></button>)}{activeSeq !== "Default" && <button style={{ ...S.pill, color: "#EF4444", borderColor: "#EF444440", marginLeft: 4 }} onClick={async () => { await deleteSequence(activeSeq, type); setActiveSeq("Default"); }}>🗑 Delete &quot;{activeSeq}&quot;</button>}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>{list.map((m, i) => { const hasVariants = m.variants && m.variants.length > 0; const allLabels = ["A", ...(m.variants || []).map(v => v.label)]; const stats = allLabels.map(label => { const sent = contacts.filter(c => (c.history || []).some(h => h.name === m.name && (h.variant || "A") === label)).length; const replied = contacts.filter(c => ["responded", "booked", "closed"].includes(c.stage) && (c.history || []).some(h => h.name === m.name && (h.variant || "A") === label)).length; return { label, sent, replied, rate: sent > 0 ? Math.round((replied / sent) * 100) : 0 }; }); return (<div key={m.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }} onDragEnd={() => { if (dragIdx !== null && dragOverIdx !== null) reorder(dragIdx, dragOverIdx); setDragIdx(null); setDragOverIdx(null); }} onDrop={e => e.preventDefault()} style={{ opacity: dragIdx === i ? 0.4 : 1 }}>{dragOverIdx === i && dragIdx !== null && dragIdx !== i && <div style={{ height: 3, background: "#3B82F6", borderRadius: 2, margin: "2px 0" }} />}<div style={{ background: "#0F172A", borderRadius: 10, border: `1px solid ${type === "nurture" ? "#8B5CF620" : "#1E293B"}`, overflow: "hidden", cursor: "grab" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #1E293B" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ color: "#475569", fontSize: 14, cursor: "grab", padding: "0 4px", userSelect: "none" }}>⠿</div><div style={{ width: 24, height: 24, borderRadius: "50%", background: type === "nurture" ? "linear-gradient(135deg,#8B5CF6,#EC4899)" : "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{i + 1}</div><div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13 }}>{m.name}</span>{hasVariants && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }}>A/B</span>}</div><div style={{ color: "#64748B", fontSize: 10 }}>{m.channel === "ig" ? "📱 IG" : "📧 Email"} · {m.delay_days === 0 ? "Immediately" : `${m.delay_days}d`}</div></div></div><div style={{ display: "flex", gap: 3 }}><button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "msg", data: m, msgType: type, seqName: activeSeq })}>✎</button>{list.length > 1 && <button style={{ ...S.act, color: "#EF4444" }} onClick={() => deleteMsg(m.id, type)}>✕</button>}</div></div><div style={{ padding: "10px 12px", fontSize: 12, lineHeight: 1.6, color: "#94A3B8", whiteSpace: "pre-wrap" }}>{m.body}</div>{hasVariants && stats.some(s => s.sent > 0) && <div style={{ padding: "8px 12px", borderTop: "1px solid #1E293B", display: "flex", gap: 12, flexWrap: "wrap" }}>{stats.map(s => (<div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: s.label === "A" ? "#3B82F6" : "#F59E0B", width: 14 }}>{s.label}</span><span style={{ fontSize: 10, color: "#64748B" }}>{s.sent} sent</span><span style={{ fontSize: 10, color: "#64748B" }}>·</span><span style={{ fontSize: 10, color: s.rate > 0 ? "#10B981" : "#475569", fontWeight: 600 }}>{s.replied} replied ({s.rate}%)</span></div>))}</div>}</div>{i < list.length - 1 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px" }}><div style={{ flex: 1, height: 1, background: "#1E293B" }} /><span style={{ color: "#475569", fontSize: 9 }}>{list[i + 1]?.delay_days === 0 ? "Immediately" : `Wait ${list[i + 1]?.delay_days}d`}</span><div style={{ flex: 1, height: 1, background: "#1E293B" }} /></div>}</div>); })}{list.length === 0 && <div style={S.empty}><p style={{ color: "#64748B" }}>No messages in this sequence yet. Click &quot;+ Add Message&quot; to start.</p></div>}</div>
    </div>); };

  // === KPI VIEW ===
  const KpiView = () => {
    const lb = getLeaderboard();
    const weekDates = getWeekDates();
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const medals = ["🥇", "🥈", "🥉"];
    const kingPerson = lb[0]?.daysHit > 0 ? lb[0].person : null;
    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>KPIs</h1><p style={S.sub}>Team performance and accountability</p></div><button style={S.ghost} onClick={() => setModal({ type: "kpi" })}>⚙ Edit KPIs</button></div>

      {/* Hall of Champions */}
      {victories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={S.h2}>🏆 Hall of Champions</h2>
          <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)", borderRadius: 12, border: "1px solid #F59E0B30", padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
              {TEAM.map(person => {
                const topG = getWinCount(person, "top_g");
                const bottomG = getWinCount(person, "bottom_g");
                const gayboy = getWinCount(person, "gayboy");
                return (
                  <div key={person} style={{ padding: 10, background: "#0B1120", borderRadius: 10, border: "1px solid #1E293B", textAlign: "center" }}>
                    <div style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                      {person}
                      {person === user && <span style={{ color: "#3B82F6", fontSize: 10, marginLeft: 4 }}>(you)</span>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, lineHeight: 1 }} title="The Top G wins">👑</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#F59E0B", fontFamily: "'Outfit',sans-serif", marginTop: 2 }}>{topG}</div>
                        <div style={{ fontSize: 8, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>Top G</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, lineHeight: 1 }} title="Bottom G weeks">🥈</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#94A3B8", fontFamily: "'Outfit',sans-serif", marginTop: 2 }}>{bottomG}</div>
                        <div style={{ fontSize: 8, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>Bottom G</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, lineHeight: 1 }} title="Certified Homosexual Gayboy">🏳️‍🌈</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#EC4899", fontFamily: "'Outfit',sans-serif", marginTop: 2 }}>{gayboy}</div>
                        <div style={{ fontSize: 8, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>Gayboy</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Past weeks ledger */}
            <div style={{ borderTop: "1px solid #1E293B", paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Past Weeks ({victories.length})</div>
              <div style={{ maxHeight: 180, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {victories.slice(0, 20).map(v => (
                  <div key={v.week_start} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "#0B1120", borderRadius: 6, fontSize: 11 }}>
                    <span style={{ color: "#64748B", fontWeight: 600, minWidth: 110 }}>{fmtWeekRange(v.week_start)}</span>
                    <div style={{ display: "flex", gap: 10, flex: 1, justifyContent: "flex-end" }}>
                      <span style={{ color: "#F59E0B" }}>👑 {v.top_g}</span>
                      <span style={{ color: "#94A3B8" }}>🥈 {v.bottom_g}</span>
                      <span style={{ color: "#EC4899" }}>🏳️‍🌈 {v.gayboy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Leaderboard (This Week)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lb.map((p, i) => {
            const isKing = kingPerson && p.person === kingPerson;
            const isGay = kingPerson && p.person !== kingPerson;
            const topGCount = getWinCount(p.person, "top_g");
            return (
            <div key={p.person} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0F172A", borderRadius: 10, border: `1px solid ${i === 0 ? "#F59E0B30" : "#1E293B"}`, borderLeft: i === 0 ? "3px solid #F59E0B" : i === 1 ? "3px solid #94A3B8" : i === 2 ? "3px solid #B45309" : "3px solid #1E293B" }}>
              <span style={{ fontSize: 20 }}>{medals[i] || `#${i + 1}`}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 15 }}>{p.person}</span>
                  {p.person === user && <span style={{ color: "#3B82F6", fontSize: 10 }}>(you)</span>}
                  {topGCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#F59E0B15", color: "#F59E0B", display: "inline-flex", alignItems: "center", gap: 3 }} title={`${topGCount} weekly Top G wins`}>👑 {topGCount}</span>}
                  {isKing && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B" }}>👑 KING</span>}
                  {isGay && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#EC489920", color: "#EC4899" }}>🏳️‍🌈 officially gay</span>}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                  {p.cats.map(c => <span key={c.name} style={{ fontSize: 11, color: c.color }}>{c.weekly} {c.name}</span>)}
                  {p.topStreak > 0 && <span style={{ fontSize: 11, color: "#F59E0B" }}>🔥 {p.topStreak} streak</span>}
                  <span style={{ fontSize: 11, color: p.daysHit > 0 ? "#10B981" : "#475569" }}>KPIs hit: {p.daysHit || 0}/{p.daysSoFar}d</span>
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
        <h2 style={S.h2}>Log Today&apos;s Non-Negotiables</h2>
        {dailyCats.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>No daily non-negotiables yet. Hit &quot;Edit KPIs&quot; up top to add some.</p></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {dailyCats.map(cat => {
            const dt = cat.daily_target || 0;
            const wt = dt * 7;
            const todayCount = getDayCount(user, cat.name, todayStr());
            const weeklyCount = getWeeklyCount(user, cat.name);
            const streak = getStreak(user, cat);
            const color = catColor(cat.name);
            return (
              <div key={cat.id} style={{ padding: 14, background: "#0F172A", borderRadius: 10, border: `1px solid ${dt > 0 && todayCount >= dt ? "#10B98140" : "#1E293B"}`, borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color }}>{cat.name}</div>{streak > 0 && <div style={{ fontSize: 10, color: "#F59E0B" }}>🔥 {streak} day streak</div>}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => logKpi(user, cat.name, -1)} style={{ ...S.kpiBtn, opacity: todayCount > 0 ? 1 : 0.3 }}>-</button>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", fontFamily: "'Outfit',sans-serif", minWidth: 34, textAlign: "center" }}>{todayCount}</span>
                    <button onClick={() => logKpi(user, cat.name, 1)} style={{ ...S.kpiBtn, background: color + "20", borderColor: color + "40", color }}>+</button>
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: "#64748B" }}>Today</span><span style={{ color: dt > 0 && todayCount >= dt ? "#10B981" : "#94A3B8", fontWeight: 600 }}>{todayCount}{dt > 0 ? `/${dt}` : ""}</span></div><ProgressBar value={todayCount} max={dt} color={color} /></div>
                <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: "#64748B" }}>Week</span><span style={{ color: wt > 0 && weeklyCount >= wt ? "#10B981" : "#94A3B8", fontWeight: 600 }}>{weeklyCount}{wt > 0 ? `/${wt}` : ""}</span></div><ProgressBar value={weeklyCount} max={wt} color={color} h={6} /></div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Weekly non-negotiables */}
      {weeklyCats.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={S.h2}>This Week&apos;s Non-Negotiables</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {weeklyCats.map(cat => {
              const wt = cat.weekly_target || 0;
              const weeklyCount = getWeeklyCount(user, cat.name);
              const streak = getStreak(user, cat);
              const color = catColor(cat.name);
              return (
                <div key={cat.id} style={{ padding: 14, background: "#0F172A", borderRadius: 10, border: `1px solid ${wt > 0 && weeklyCount >= wt ? "#10B98140" : "#1E293B"}`, borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div><div style={{ fontSize: 13, fontWeight: 600, color }}>{cat.name}</div><div style={{ fontSize: 10, color: "#64748B" }}>per week{streak > 0 && <span style={{ color: "#F59E0B" }}> · 🔥 {streak} wk streak</span>}</div></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => logKpi(user, cat.name, -1)} style={{ ...S.kpiBtn, opacity: weeklyCount > 0 ? 1 : 0.3 }}>-</button>
                      <span style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", fontFamily: "'Outfit',sans-serif", minWidth: 34, textAlign: "center" }}>{weeklyCount}</span>
                      <button onClick={() => logKpi(user, cat.name, 1)} style={{ ...S.kpiBtn, background: color + "20", borderColor: color + "40", color }}>+</button>
                    </div>
                  </div>
                  <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}><span style={{ color: "#64748B" }}>This week</span><span style={{ color: wt > 0 && weeklyCount >= wt ? "#10B981" : "#94A3B8", fontWeight: 600 }}>{weeklyCount}{wt > 0 ? `/${wt}` : ""}</span></div><ProgressBar value={weeklyCount} max={wt} color={color} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly heatmap */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Weekly Breakdown</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ ...S.th, padding: "6px 8px" }}></th>{weekDates.map((d, i) => <th key={d} style={{ ...S.th, padding: "6px 8px", color: d === todayStr() ? "#3B82F6" : "#64748B" }}>{dayNames[i]}<br /><span style={{ fontSize: 8, fontWeight: 400 }}>{d.slice(8)}.{d.slice(5, 7)}</span></th>)}<th style={{ ...S.th, padding: "6px 8px", color: "#10B981" }}>Total</th></tr></thead>
            <tbody>{TEAM.map(person => { return activeCats.map((cat, ci) => { const tgt = cat.cadence === "weekly" ? 0 : (cat.daily_target || 0); return (<tr key={person + cat.name} style={{ borderBottom: "1px solid #1E293B" }}><td style={{ padding: "6px 8px", fontSize: 11, color: "#CBD5E1", whiteSpace: "nowrap" }}>{ci === 0 && <><span style={{ color: "#F1F5F9", fontWeight: 600 }}>{person}</span><br /></>}<span style={{ color: catColor(cat.name), fontSize: 10 }}>{cat.name}{cat.cadence === "weekly" ? " (wk)" : ""}</span></td>{weekDates.map(d => { const cnt = getDayCount(person, cat.name, d); const hit = tgt > 0 && cnt >= tgt; return <td key={d} style={{ padding: "6px 8px", textAlign: "center", fontSize: 13, fontWeight: 600, color: cnt === 0 ? "#334155" : hit ? "#10B981" : "#F1F5F9", fontFamily: "'Outfit',sans-serif" }}>{cnt || "·"}</td>; })}<td style={{ padding: "6px 8px", textAlign: "center", fontSize: 13, fontWeight: 700, color: cat.cadence === "weekly" && (cat.weekly_target || 0) > 0 && getWeeklyCount(person, cat.name) >= cat.weekly_target ? "#10B981" : "#F1F5F9", fontFamily: "'Outfit',sans-serif" }}>{getWeeklyCount(person, cat.name)}</td></tr>); }); })}</tbody>
          </table>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h2 style={S.h2}>Activity Feed</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", maxHeight: 300, overflow: "auto" }}>
          {activityLog.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#475569", fontSize: 12 }}>No activity yet</div>
            : activityLog.map(a => {
              const icons = { added_lead: "➕", sent_outreach: "📤", sent_nurture: "🔁", sent_loom: "🎥", pinged_lead: "📌", moved_stage: "📋", closed_deal: "🎉", logged_kpi: "📊", imported_csv: "📥", found_leads: "🔍", bulk_deleted: "🗑" };
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
    const quickAdd = async () => { if (!quickForm.name.trim()) return; await addContact({ ...quickForm, pipeline_value: 0 }); setQuickForm({ name: "", email: "", ig: "", notes: "" }); };
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

  // === ADMIN: MENTEES (approve + overview) ===
  const AdminView = () => {
    const [wsList, setWsList] = useState([]);
    const [allowed, setAllowed] = useState([]);
    const [emailInput, setEmailInput] = useState("");
    const [loadingA, setLoadingA] = useState(true);
    const [busy, setBusy] = useState(false);

    const loadAdmin = async () => {
      const [wsRes, memRes, profRes, keRes, cRes, aeRes] = await Promise.all([
        supabase.from("workspaces").select("*").order("created_at"),
        supabase.from("workspace_members").select("workspace_id, user_id"),
        supabase.from("profiles").select("id, display_name"),
        supabase.from("kpi_entries").select("workspace_id, count, date").gte("date", addDays(todayStr(), -30)),
        supabase.from("contacts").select("workspace_id, last_contacted_at, created_at, stage"),
        supabase.from("allowed_emails").select("*").order("created_at", { ascending: false }),
      ]);
      const profMap = {}; (profRes.data || []).forEach(p => profMap[p.id] = p.display_name);
      const ws = (wsRes.data || []).filter(w => w.id !== auth.ownWorkspaceId).map(w => {
        const memberNames = (memRes.data || []).filter(m => m.workspace_id === w.id).map(m => profMap[m.user_id]).filter(Boolean);
        const ke = (keRes.data || []).filter(e => e.workspace_id === w.id);
        const weekAct = ke.filter(e => e.date >= weekStart()).reduce((s, e) => s + (e.count || 0), 0);
        const monthAct = ke.reduce((s, e) => s + (e.count || 0), 0);
        const cs = (cRes.data || []).filter(c => c.workspace_id === w.id);
        const leadCount = cs.length;
        const dates = [...ke.map(e => e.date), ...cs.map(c => c.last_contacted_at), ...cs.map(c => c.created_at)].filter(Boolean);
        const lastActive = dates.length ? dates.sort().slice(-1)[0] : null;
        const status = weekAct > 0 ? "green" : monthAct > 0 ? "amber" : "red";
        return { ...w, memberNames, weekAct, leadCount, lastActive, status };
      });
      setWsList(ws);
      setAllowed(aeRes.data || []);
      setLoadingA(false);
    };
    useEffect(() => { loadAdmin(); }, []);

    const addEmails = async () => {
      const emails = emailInput.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes("@"));
      if (!emails.length) { flash("Enter at least one valid email", "error"); return; }
      setBusy(true);
      const { error } = await supabase.from("allowed_emails").upsert(emails.map(e => ({ email: e, status: "pending" })), { onConflict: "email", ignoreDuplicates: true });
      setBusy(false);
      if (error) flash("Error: " + error.message, "error"); else { flash(`Approved ${emails.length} email${emails.length !== 1 ? "s" : ""}`); setEmailInput(""); loadAdmin(); }
    };
    const removeEmail = async (id, email) => { if (!confirm(`Remove ${email} from the approved list? If they haven't signed up yet, they won't be able to.`)) return; await supabase.from("allowed_emails").delete().eq("id", id); loadAdmin(); };

    const statusColor = { green: "#10B981", amber: "#F59E0B", red: "#EF4444" };
    const statusLabel = { green: "Active this week", amber: "Quiet this week", red: "No activity yet" };

    return (<div style={S.content}>
      <div style={S.header}><div><h1 style={S.h1}>Mentees</h1><p style={S.sub}>Approve access and track everyone&apos;s progress</p></div></div>

      {/* Approve access */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={S.h2}>Approve a mentee</h2>
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 14 }}>
          <p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 10 }}>Paste one or more emails (one per line). They&apos;ll be able to sign up and get their own empty workspace. Only emails on this list can get in.</p>
          <textarea value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder={"mentee1@email.com\nmentee2@email.com"} style={{ ...S.ip, width: "100%", minHeight: 70, resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
          <button style={{ ...S.pri, opacity: busy ? 0.6 : 1 }} onClick={addEmails} disabled={busy}>{busy ? "Adding..." : "Approve access"}</button>

          {allowed.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Approved ({allowed.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflow: "auto" }}>
                {allowed.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#0B1120", borderRadius: 6 }}>
                    <span style={{ color: "#CBD5E1", fontSize: 12 }}>{a.email}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: a.status === "redeemed" ? "#10B98120" : "#F59E0B20", color: a.status === "redeemed" ? "#10B981" : "#F59E0B" }}>{a.status === "redeemed" ? "JOINED" : "INVITED"}</span>
                      <button onClick={() => removeEmail(a.id, a.email)} style={{ ...S.act, color: "#EF4444", padding: "3px 7px" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overview scoreboard */}
      <h2 style={S.h2}>Progress</h2>
      {loadingA ? <div style={S.empty}><p style={{ color: "#64748B" }}>Loading...</p></div>
        : wsList.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>No mentees yet. Approve an email above, and once they sign up they&apos;ll show here.</p></div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {wsList.map(w => (
              <div key={w.id} onClick={() => auth.onEnterWorkspace(w.id, w.workspaceName || w.name)} style={{ padding: 14, background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B", borderTop: `3px solid ${statusColor[w.status]}`, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.memberNames[0] || w.name}</div>
                    <div style={{ color: "#64748B", fontSize: 10 }}>{w.name}</div>
                  </div>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor[w.status], flexShrink: 0, marginTop: 4 }} title={statusLabel[w.status]} />
                </div>
                <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                  <div><div style={{ color: "#F1F5F9", fontSize: 18, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{w.weekAct}</div><div style={{ color: "#64748B", fontSize: 9, fontWeight: 600, textTransform: "uppercase" }}>This week</div></div>
                  <div><div style={{ color: "#F1F5F9", fontSize: 18, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{w.leadCount}</div><div style={{ color: "#64748B", fontSize: 9, fontWeight: 600, textTransform: "uppercase" }}>Leads</div></div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: statusColor[w.status], fontSize: 10, fontWeight: 600 }}>{statusLabel[w.status]}</span>
                  <span style={{ color: "#64748B", fontSize: 10 }}>{w.lastActive ? `last ${fmtEU(w.lastActive)}` : "never"}</span>
                </div>
                <button style={{ ...S.ghost, width: "100%", marginTop: 10, padding: "6px", fontSize: 12 }}>Open workspace →</button>
              </div>
            ))}
          </div>
        )}
    </div>);
  };

  if (auth.isAdmin) NAV.push({ id: "admin", label: "Mentees", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" });

  return (
    <div style={S.app}>
      {toast && <div style={{ ...S.toast, background: toast.t === "error" ? "#EF4444" : toast.t === "info" ? "#3B82F6" : "#10B981" }}>{toast.m}</div>}
      <div style={S.side}>
        <div style={S.logo}><div style={S.logoI}>⬡</div><span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, color: "#F1F5F9" }}>LeadFlow</span></div>
        <div style={{ padding: "0 12px 10px", borderBottom: "1px solid #1E293B" }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Signed in as</div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}><div style={{ minWidth: 0 }}><div style={{ color: "#F1F5F9", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user}{auth.isAdmin && <span style={{ color: "#C99A3B", fontSize: 9, marginLeft: 5 }}>ADMIN</span>}</div><div style={{ color: "#64748B", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{auth.workspaceName}</div></div><button onClick={auth.onLogout} title="Log out" style={{ flexShrink: 0, background: "transparent", border: "1px solid #334155", borderRadius: 7, color: "#94A3B8", fontSize: 10, fontWeight: 600, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>Log out</button></div></div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px", flex: 1 }}>{NAV.map(n => (<button key={n.id} onClick={() => { setView(n.id); setDetailId(null); }} style={{ ...S.nav, ...(view === n.id ? S.navOn : {}) }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg><span>{n.label}</span>{n.badge && <span style={S.badge}>{n.badge}</span>}</button>))}</nav>
        <div style={{ padding: "10px 12px", borderTop: "1px solid #1E293B", display: "flex", flexDirection: "column", gap: 4 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#F1F5F9", fontWeight: 700 }}>{contacts.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Pipeline</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.pipeline)}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.closedTotal)}</span></div></div>
      </div>

      <div style={S.main}>
        {auth.viewingMentee && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 16px", background: "#C99A3B18", borderBottom: "1px solid #C99A3B40" }}><span style={{ color: "#E9C877", fontSize: 13, fontWeight: 600 }}>👁 Viewing {auth.viewingMentee}&apos;s workspace · anything you change affects their account</span><button onClick={() => { auth.onExitWorkspace(); setView("admin"); }} style={{ flexShrink: 0, background: "#C99A3B", border: "none", borderRadius: 7, color: "#1C3D2A", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>← Back to my view</button></div>}
        {view === "admin" && auth.isAdmin && <AdminView />}
        {view === "dashboard" && (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>Dashboard</h1><p style={S.sub}>Welcome back, {user}</p></div><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div><StandupFeed /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginBottom: 20 }}>{[{ l: "Contacted This Week", v: stats.contactedWeek, c: "#3B82F6" }, { l: "Contacted This Month", v: stats.contactedMonth, c: "#6366F1" }, { l: "Pipeline Value", v: fmtMoney(stats.pipeline), c: "#10B981" }, { l: "Closed This Month", v: fmtMoney(stats.closedMonth), c: "#F59E0B" }, { l: "Total Revenue", v: fmtMoney(stats.closedTotal), c: "#10B981" }, { l: "Close Rate", v: `${stats.convRate}%`, c: "#8B5CF6" }].map((s, i) => (<div key={i} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: `3px solid ${s.c}` }}><div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{s.l}</div><div style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{s.v}</div></div>))}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6, marginBottom: 20 }}>{STAGES.map(s => { const cnt = contacts.filter(c => c.stage === s.id).length; return (<div key={s.id} style={{ padding: "12px 10px", background: "#0F172A", borderRadius: 8, border: "1px solid #1E293B", borderLeft: `3px solid ${s.color}`, cursor: "pointer" }} onClick={() => { setView("contacts"); setFilter(s.id); }}><div style={{ color: "#94A3B8", fontSize: 10, fontWeight: 600 }}>{s.label}</div><div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{cnt}</div></div>); })}</div><h2 style={S.h2}>Today&apos;s Actions ({actionsDue.length})</h2>{actionsDue.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>Nothing due!</p></div> : <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>{actionsDue.sort((a, b) => urgency(a) - urgency(b)).map(c => { const isOver = urgency(c) < 0; const nm = getNext(c); const nn = getNextN(c); const isO = ["new", "outreach", "old"].includes(c.stage); const isLm = c.stage === "responded" && c.loom_pending; const msg = isLm ? null : isO ? nm : nn; const mt = isO ? "outreach" : "nurture"; return (<div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0F172A", borderRadius: 8, border: `1px solid ${isOver ? "#EF444430" : "#1E293B"}` }}><div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: isOver ? "#EF4444" : "#F59E0B", flexShrink: 0 }} /><div><div style={{ color: "#F1F5F9", fontWeight: 500, fontSize: 13 }}>{c.name} <span style={{ color: "#64748B", fontSize: 11 }}>({c.assigned_to})</span></div><div style={{ color: "#64748B", fontSize: 11 }}>{isLm ? "🎥 Send Loom" : c.stage === "interested" ? "💬 Check in" : msg ? msg.name : "Action needed"}</div></div></div><div style={{ display: "flex", gap: 4 }}>{msg && <button style={S.sc} onClick={() => copy(c, mt)}>{copied === c.id + mt ? "Copied!" : "Copy"}</button>}</div></div>); })}</div>}<h2 style={S.h2}>Team</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>{TEAM.map(t => { const ml = contacts.filter(c => c.assigned_to === t); const ma = actionsDue.filter(c => c.assigned_to === t); const mc = ml.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0); return (<div key={t} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: `1px solid ${t === user ? "#3B82F640" : "#1E293B"}` }}><div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t}{t === user && <span style={{ color: "#3B82F6", fontSize: 10 }}> (you)</span>}</div><div style={{ display: "flex", flexDirection: "column", gap: 3 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#CBD5E1", fontWeight: 600 }}>{ml.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Due Today</span><span style={{ color: ma.length ? "#F59E0B" : "#CBD5E1", fontWeight: 600 }}>{ma.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 600 }}>{fmtMoney(mc)}</span></div></div></div>); })}</div></div>)}

        {view === "kpis" && <KpiView />}
        {view === "activity" && <ActivityView />}
        {view === "finder" && <LeadFinder />}
        {view === "myleads" && (() => { const my = contacts.filter(c => c.assigned_to === user); const unassigned = contacts.filter(c => !c.assigned_to && c.stage === "new"); const over = my.filter(c => urgency(c) < 0 && !["booked", "closed", "lost"].includes(c.stage)).sort((a, b) => urgency(a) - urgency(b)); const today2 = my.filter(c => urgency(c) === 0 && !["booked", "closed", "lost"].includes(c.stage)); const upcoming = my.filter(c => { const u2 = urgency(c); return u2 > 0 && u2 <= 7 && !["booked", "closed", "lost"].includes(c.stage); }).sort((a, b) => urgency(a) - urgency(b)); const interested = my.filter(c => c.stage === "interested"); const booked = my.filter(c => c.stage === "booked"); const closed = my.filter(c => c.stage === "closed"); const lost = my.filter(c => c.stage === "lost"); return (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>My Leads</h1><p style={S.sub}>{user}&apos;s leads and daily actions</p></div><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div>{over.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#EF4444" }}>Overdue ({over.length})</h2><Table data={over} /></div>}{today2.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#F59E0B" }}>Due Today ({today2.length})</h2><Table data={today2} /></div>}{upcoming.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#3B82F6" }}>Upcoming This Week ({upcoming.length})</h2><Table data={upcoming} /></div>}{interested.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#06B6D4" }}>💬 Interested ({interested.length})</h2><Table data={interested} /></div>}{booked.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#F59E0B" }}>📞 Calls Booked ({booked.length})</h2><Table data={booked} /></div>}{closed.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#10B981" }}>🎉 Closed Won ({closed.length})</h2><Table data={closed} /></div>}{lost.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#EF4444" }}>Lost ({lost.length})</h2><Table data={lost} /></div>}{unassigned.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#6C7A89" }}>Unassigned ({unassigned.length})</h2><p style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>Send the first message to claim these leads</p><Table data={unassigned} showWho /></div>}{over.length === 0 && today2.length === 0 && upcoming.length === 0 && interested.length === 0 && booked.length === 0 && closed.length === 0 && unassigned.length === 0 && <div style={S.empty}><p style={{ color: "#64748B" }}>All caught up!</p></div>}{detailId && <Detail />}</div>); })()}
        {view === "contacts" && (<div style={S.content}><div style={S.header}><div><h1 style={S.h1}>All Leads</h1><p style={S.sub}>{filtered.length} lead{filtered.length !== 1 ? "s" : ""}</p></div><div style={{ display: "flex", gap: 6 }}>{selected.size > 0 && <button style={S.danger} onClick={bulkDelete}>Delete {selected.size} Selected</button>}{filtered.length > 0 && <button style={{ ...S.ghost, color: "#EF4444", borderColor: "#EF444440" }} onClick={() => setModal({ type: "deleteAll" })}>🗑 Delete All ({filtered.length})</button>}<button style={S.ghost} onClick={() => setModal({ type: "dupes" })}>🔍 Find Duplicates</button><button style={S.ghost} onClick={() => setModal({ type: "csv" })}>📤 Import CSV</button><button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div></div><div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}><div style={S.sBox}><input style={S.sInp} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><button style={{ ...S.pill, ...(filter === "all" ? S.pillOn : {}) }} onClick={() => setFilter("all")}>All</button>{STAGES.map(s => <button key={s.id} style={{ ...S.pill, ...(filter === s.id ? S.pillOn : {}) }} onClick={() => setFilter(s.id)}>{s.label} <span style={{ opacity: .5 }}>{contacts.filter(c => c.stage === s.id).length}</span></button>)}</div></div>{filtered.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>No leads found.</p></div> : <Table data={filtered} showWho />}{detailId && <Detail />}</div>)}
        {view === "messages" && <MsgView type="outreach" />}
        {view === "nurture" && <MsgView type="nurture" />}
      </div>

      {modal?.type === "contact" && <ContactModal c={modal.data} team={TEAM} user={user} outreachSeqs={getSequences("outreach")} nurtureSeqs={getSequences("nurture")} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateContact(modal.data.id, d); else await addContact(d); setModal(null); }} />}
      {modal?.type === "msg" && <MsgModal m={modal.data} total={(modal.msgType === "outreach" ? messages : nurtureM).filter(m => (m.sequence_name || "Default") === (modal.seqName || "Default")).length} type={modal.msgType} seqName={modal.seqName || "Default"} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateMsg(modal.data.id, d); else await addMsg(d, modal.msgType); setModal(null); }} />}
      {modal?.type === "csv" && <CSVModal onClose={() => setModal(null)} onImport={importCSV} />}
      {modal?.type === "dupes" && <DupesModal groups={findDuplicateGroups()} onClose={() => setModal(null)} onDelete={async (ids) => { await supabase.from("contacts").delete().in("id", ids); flash(`Deleted ${ids.length} duplicate(s)`, "info"); }} fmtEU={fmtEU} />}
      {modal?.type === "deleteAll" && <DeleteAllModal count={filtered.length} nuke={filter === "all" && !search} onClose={() => setModal(null)} onConfirm={deleteAllFiltered} />}
      {modal?.type === "kpi" && <KpiManagerModal categories={[...kpiCategories].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))} onClose={() => setModal(null)} onAdd={addCategory} onUpdate={updateCategory} onRename={renameCategory} onDelete={deleteCategory} />}
      {closeId && <CloseModal c={contacts.find(x => x.id === closeId)} onClose={() => setCloseId(null)} onSave={v => closeDeal(closeId, v)} />}
      {delId && <div style={S.ov} onClick={() => setDelId(null)}><div style={S.cBox} onClick={e => e.stopPropagation()}><h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Delete this lead?</h3><p style={{ color: "#94A3B8", fontSize: 13, margin: "6px 0 14px" }}>Can&apos;t be undone.</p><div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button style={S.ghost} onClick={() => setDelId(null)}>Cancel</button><button style={S.danger} onClick={() => deleteContact(delId)}>Delete</button></div></div></div>}
    </div>
  );
}

function ContactModal({ c, team, user, outreachSeqs, nurtureSeqs, onClose, onSave }) { const [f, setF] = useState({ name: c?.name || "", company: c?.company || "", ig: c?.ig || "", email: c?.email || "", youtube: c?.youtube || "", website: c?.website || "", linkedin: c?.linkedin || "", notes: c?.notes || "", pipeline_value: c?.pipeline_value || "", assigned_to: c?.assigned_to || "", outreach_sequence: c?.outreach_sequence || "Default", nurture_sequence: c?.nurture_sequence || "Default", current_step: c?.current_step || 0 }); const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []); const save = () => { if (!f.name.trim()) return; onSave({ ...f, pipeline_value: parseFloat(f.pipeline_value) || 0, current_step: parseInt(f.current_step) || 0 }); }; return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{c ? "Edit Lead" : "Add New Lead"}</h2><button style={S.x} onClick={onClose}>✕</button></div><div style={S.fg2}><div style={S.fi}><label style={S.lb}>Name *</label><input ref={ref} style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="John Smith" onKeyDown={e => e.key === "Enter" && save()} /></div><div style={S.fi}><label style={S.lb}>Company / Offer</label><input style={S.ip} value={f.company} onChange={e => setF({ ...f, company: e.target.value })} placeholder="Acme Inc." /></div>{c && <div style={S.fi}><label style={S.lb}>Assigned To</label><select style={S.ip} value={f.assigned_to} onChange={e => setF({ ...f, assigned_to: e.target.value })}><option value="">Unassigned</option>{team.map(t => <option key={t} value={t}>{t}</option>)}</select></div>}<div style={S.fi}><label style={S.lb}>Instagram</label><input style={S.ip} value={f.ig} onChange={e => setF({ ...f, ig: e.target.value })} placeholder="@handle" /></div><div style={S.fi}><label style={S.lb}>Email</label><input style={S.ip} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="john@email.com" /></div><div style={S.fi}><label style={S.lb}>LinkedIn</label><input style={S.ip} value={f.linkedin} onChange={e => setF({ ...f, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." /></div><div style={S.fi}><label style={S.lb}>YouTube</label><input style={S.ip} value={f.youtube} onChange={e => setF({ ...f, youtube: e.target.value })} placeholder="Channel URL" /></div><div style={S.fi}><label style={S.lb}>Website</label><input style={S.ip} value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="https://..." /></div><div style={S.fi}><label style={S.lb}>Pipeline Value ($)</label><input style={S.ip} type="number" value={f.pipeline_value} onChange={e => setF({ ...f, pipeline_value: e.target.value })} placeholder="5000" /></div><div style={S.fi}><label style={S.lb}>Outreach Sequence</label><select style={S.ip} value={f.outreach_sequence} onChange={e => setF({ ...f, outreach_sequence: e.target.value })}>{(outreachSeqs || ["Default"]).map(s => <option key={s} value={s}>{s}</option>)}</select></div>{c && <div style={S.fi}><label style={S.lb}>Current Step (0 = reset)</label><input style={S.ip} type="number" min="0" value={f.current_step} onChange={e => setF({ ...f, current_step: e.target.value })} /></div>}<div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Notes</label><textarea style={{ ...S.ip, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Notes..." /></div></div><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: f.name.trim() ? 1 : .5 }} onClick={save} disabled={!f.name.trim()}>{c ? "Save" : "Add Lead"}</button></div></div></div>); }

function MsgModal({ m, total, type, seqName, onClose, onSave }) { const [f, setF] = useState({ name: m?.name || `${type === "nurture" ? "Nurture" : "Message"} ${total + 1}`, channel: m?.channel || "ig", delay_days: m?.delay_days ?? 3, body: m?.body || "", sequence_name: m?.sequence_name || seqName || "Default", variants: m?.variants || [] }); const addVariant = () => { const labels = "BCDEFGHIJ"; const next = labels[f.variants.length] || `V${f.variants.length + 2}`; setF({ ...f, variants: [...f.variants, { label: next, body: "" }] }); }; const updateVariant = (idx, body) => { const vs = [...f.variants]; vs[idx] = { ...vs[idx], body }; setF({ ...f, variants: vs }); }; const removeVariant = (idx) => { setF({ ...f, variants: f.variants.filter((_, i) => i !== idx) }); }; return (<div style={S.ov} onClick={onClose}><div style={{ ...S.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{m ? "Edit" : "Add"} Message</h2><button style={S.x} onClick={onClose}>✕</button></div><div style={S.fg2}><div style={S.fi}><label style={S.lb}>Name</label><input style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div><div style={S.fi}><label style={S.lb}>Channel</label><select style={S.ip} value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}><option value="ig">Instagram DM</option><option value="email">Email</option></select></div><div style={S.fi}><label style={S.lb}>Delay (days)</label><input style={S.ip} type="number" min="0" value={f.delay_days} onChange={e => setF({ ...f, delay_days: parseInt(e.target.value) || 0 })} /></div><div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Version A (default)</label><textarea style={{ ...S.ip, minHeight: 100, resize: "vertical" }} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder={'Use {{name}} for auto-fill'} /></div>{f.variants.map((v, i) => (<div key={i} style={{ ...S.fi, gridColumn: "1/-1" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><label style={{ ...S.lb, color: "#F59E0B" }}>Version {v.label}</label><button onClick={() => removeVariant(i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}>Remove</button></div><textarea style={{ ...S.ip, minHeight: 100, resize: "vertical", borderColor: "#F59E0B30" }} value={v.body} onChange={e => updateVariant(i, e.target.value)} placeholder={'Version ' + v.label + ' copy...'} /></div>))}<div style={{ gridColumn: "1/-1" }}><button style={{ ...S.ghost, width: "100%", borderStyle: "dashed" }} onClick={addVariant}>+ Add Variant for A/B Test</button></div></div><p style={{ color: "#475569", fontSize: 10, marginTop: 8 }}>{'{{name}}'} auto-fills with lead&apos;s first name. When copied, a random version is selected and tracked.</p><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={S.pri} onClick={() => onSave(f)}>{m ? "Save" : "Add"}</button></div></div></div>); }

function DeleteAllModal({ count, nuke, onClose, onConfirm }) {
  const [txt, setTxt] = useState("");
  const [working, setWorking] = useState(false);
  const ok = !nuke || txt.trim().toUpperCase() === "DELETE";
  const go = async () => { if (!ok || working) return; setWorking(true); await onConfirm(); };
  return (
    <div style={S.ov} onClick={onClose}>
      <div style={{ ...S.cBox, width: 380 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: "#F1F5F9", fontSize: 16, fontWeight: 700, margin: 0, fontFamily: "'Outfit',sans-serif" }}>Delete {count} lead{count !== 1 ? "s" : ""}?</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "8px 0 14px", lineHeight: 1.5 }}>{nuke ? "This wipes every lead in the CRM for the whole team." : "This deletes every lead currently showing in this view."} It can&apos;t be undone.</p>
        {nuke && (
          <div style={{ ...S.fi, marginBottom: 14 }}>
            <label style={S.lb}>Type DELETE to confirm</label>
            <input style={{ ...S.ip, borderColor: ok ? "#10B98140" : "#EF444440" }} value={txt} onChange={e => setTxt(e.target.value)} placeholder="DELETE" autoFocus onKeyDown={e => e.key === "Enter" && ok && go()} />
          </div>
        )}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button style={S.ghost} onClick={onClose} disabled={working}>Cancel</button>
          <button style={{ ...S.danger, opacity: ok && !working ? 1 : 0.4, cursor: ok && !working ? "pointer" : "not-allowed" }} disabled={!ok || working} onClick={go}>{working ? "Deleting..." : `Delete ${count}`}</button>
        </div>
      </div>
    </div>
  );
}

function DupesModal({ groups, onClose, onDelete, fmtEU }) {
  const [keepers, setKeepers] = useState({}); // groupKey -> id of contact to keep

  const matchLabels = {
    email: "📧 Same email",
    ig: "📱 Same Instagram",
    linkedin: "💼 Same LinkedIn",
    youtube: "📺 Same YouTube",
    website: "🌐 Same website",
    name: "👤 Same name",
  };

  const setKeeper = (groupKey, id) => setKeepers(p => ({ ...p, [groupKey]: id }));

  const deleteOthers = async (group) => {
    const keeperId = keepers[group.key] || group.contacts[0].id;
    const toDelete = group.contacts.filter(c => c.id !== keeperId).map(c => c.id);
    if (toDelete.length === 0) return;
    await onDelete(toDelete);
  };

  const deleteAllExtras = async () => {
    const allToDelete = [];
    groups.forEach(group => {
      const keeperId = keepers[group.key] || group.contacts[0].id;
      group.contacts.forEach(c => { if (c.id !== keeperId) allToDelete.push(c.id); });
    });
    if (allToDelete.length === 0) return;
    if (!confirm(`Delete ${allToDelete.length} duplicate leads? The "kept" lead in each group stays. This can't be undone.`)) return;
    await onDelete(allToDelete);
    onClose();
  };

  return (
    <div style={S.ov} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>🔍 Duplicate Leads</h2>
          <button style={S.x} onClick={onClose}>✕</button>
        </div>
        {groups.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
            <p style={{ color: "#10B981", fontSize: 14, fontWeight: 600, margin: 0 }}>No duplicates found!</p>
            <p style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>Your CRM is clean.</p>
          </div>
        ) : (
          <>
            <p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 14 }}>
              Found <strong style={{ color: "#F59E0B" }}>{groups.length}</strong> group{groups.length !== 1 ? "s" : ""} of duplicate leads. Pick which one to keep in each group, then delete the rest.
            </p>
            <div style={{ maxHeight: "55vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {groups.map(group => {
                const keeperId = keepers[group.key] || group.contacts[0].id;
                return (
                  <div key={group.key} style={{ padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #1E293B" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase" }}>{matchLabels[group.matchedOn] || group.matchedOn}</span>
                      <button onClick={() => deleteOthers(group)} style={{ ...S.danger, padding: "4px 10px", fontSize: 10 }}>Delete {group.contacts.length - 1} extras</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {group.contacts.map(c => (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: keeperId === c.id ? "#10B98115" : "#0F172A", borderRadius: 6, border: keeperId === c.id ? "1px solid #10B98140" : "1px solid #1E293B", cursor: "pointer" }}>
                          <input type="radio" name={group.key} checked={keeperId === c.id} onChange={() => setKeeper(group.key, c.id)} style={{ accentColor: "#10B981" }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 12 }}>{c.name}</span>
                              {keeperId === c.id && <span style={{ fontSize: 9, fontWeight: 700, color: "#10B981" }}>KEEP</span>}
                              {c.assigned_to && <span style={{ fontSize: 10, color: "#64748B" }}>· {c.assigned_to}</span>}
                              {c.stage && <span style={{ fontSize: 10, color: "#64748B" }}>· {c.stage}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: "#64748B" }}>
                              {c.company && <span>{c.company} · </span>}
                              {c.email && <span>{c.email} · </span>}
                              {c.ig && <span>{c.ig} · </span>}
                              Added {fmtEU(c.created_at)}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid #1E293B" }}>
              <button style={S.ghost} onClick={onClose}>Close</button>
              <button style={S.danger} onClick={deleteAllExtras}>Delete ALL Extras (keep selected from each group)</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CSVModal({ onClose, onImport }) { const [text, setText] = useState(""); const ref = useRef(null); const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setText(ev.target.result); r.readAsText(f); }; return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>Import CSV</h2><button style={S.x} onClick={onClose}>✕</button></div><p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>Upload a CSV from Google Sheets. Needs a &quot;Name&quot; column.</p><input type="file" accept=".csv,.txt" ref={ref} onChange={handleFile} style={{ display: "none" }} /><button style={{ ...S.ghost, width: "100%", padding: 12, marginBottom: 10, borderStyle: "dashed" }} onClick={() => ref.current?.click()}>{text ? "✓ File loaded!" : "📤 Choose CSV"}</button><textarea style={{ ...S.ip, width: "100%", minHeight: 80, resize: "vertical", fontSize: 11, boxSizing: "border-box" }} value={text} onChange={e => setText(e.target.value)} placeholder={"name,instagram,email\nJohn,@john,john@email.com"} /><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: text.trim() ? 1 : .5 }} onClick={() => text.trim() && onImport(text)} disabled={!text.trim()}>Import</button></div></div></div>); }

function CloseModal({ c, onClose, onSave }) { const [v, setV] = useState(c?.pipeline_value || ""); return (<div style={S.ov} onClick={onClose}><div style={{ ...S.cBox, width: 360 }} onClick={e => e.stopPropagation()}><h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Close {c?.name}</h3><p style={{ color: "#94A3B8", fontSize: 12, margin: "6px 0 12px" }}>How much did you close for?</p><div style={S.fi}><label style={S.lb}>Deal Value ($)</label><input style={S.ip} type="number" value={v} onChange={e => setV(e.target.value)} placeholder="5000" autoFocus onKeyDown={e => e.key === "Enter" && onSave(parseFloat(v) || 0)} /></div><div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, background: "linear-gradient(135deg,#10B981,#059669)" }} onClick={() => onSave(parseFloat(v) || 0)}>Close Deal</button></div></div></div>); }

function KpiManagerModal({ categories, onClose, onAdd, onUpdate, onRename, onDelete }) {
  const PRESET = ["#3B82F6", "#EC4899", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444", "#06B6D4", "#F97316"];
  const [rows, setRows] = useState(categories.map(c => ({ ...c })));
  const [nc, setNc] = useState({ name: "", cadence: "daily", target: 1, color: "#3B82F6" });
  // Keep the editor in sync when categories change (add/delete/another teammate edits)
  useEffect(() => { setRows(categories.map(c => ({ ...c }))); }, [categories]);
  const setRow = (id, patch) => setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r));

  const saveName = (r) => { const orig = categories.find(c => c.id === r.id); if (orig && r.name.trim() && r.name.trim() !== orig.name) onRename(r.id, orig.name, r.name.trim()); };
  const saveTarget = (r) => { const v = parseInt(r._target) || 0; if (r.cadence === "weekly") onUpdate(r.id, { weekly_target: v }); else onUpdate(r.id, { daily_target: v, weekly_target: v * 7 }); };
  const toggleActive = (r) => { setRow(r.id, { active: !r.active }); onUpdate(r.id, { active: !r.active }); };
  const setColor = (r, color) => { setRow(r.id, { color }); onUpdate(r.id, { color }); };
  const setCadence = (r, cadence) => { setRow(r.id, { cadence }); onUpdate(r.id, { cadence }); };
  const remove = (r) => { if (confirm(`Delete "${r.name}"? Past logs stay, but it disappears from tracking.`)) onDelete(r.id); };

  const add = async () => { if (!nc.name.trim()) return; const t = parseInt(nc.target) || 0; const payload = nc.cadence === "weekly" ? { name: nc.name, color: nc.color, cadence: "weekly", weekly_target: t, daily_target: 0 } : { name: nc.name, color: nc.color, cadence: "daily", daily_target: t, weekly_target: t * 7 }; await onAdd(payload); setNc({ name: "", cadence: "daily", target: 1, color: "#3B82F6" }); };

  return (
    <div style={S.ov} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>Edit Non-Negotiables</h2>
          <button style={S.x} onClick={onClose}>✕</button>
        </div>
        <p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 14 }}>Add anything you want the team to track. Set the target everyone is held to. Changes save on their own.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {rows.map(r => (
            <div key={r.id} style={{ padding: "10px 12px", background: "#0B1120", borderRadius: 10, border: `1px solid ${r.active ? r.color + "30" : "#1E293B"}`, opacity: r.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => toggleActive(r)} title={r.active ? "On" : "Off"} style={{ width: 32, height: 20, borderRadius: 10, border: "none", background: r.active ? r.color : "#334155", cursor: "pointer", position: "relative", padding: 0, flexShrink: 0 }}><div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: r.active ? 14 : 2, transition: "left 0.2s" }} /></button>
                <input value={r.name} onChange={e => setRow(r.id, { name: e.target.value })} onBlur={() => saveName(r)} style={{ ...S.ip, flex: 1, minWidth: 110, padding: "6px 8px", fontWeight: 600 }} />
                <select value={r.cadence || "daily"} onChange={e => setCadence(r, e.target.value)} style={{ ...S.ip, width: 90, padding: "6px 8px" }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <label style={{ color: "#64748B", fontSize: 10 }}>{r.cadence === "weekly" ? "/wk" : "/day"}</label>
                  <input type="number" min="0" defaultValue={r.cadence === "weekly" ? (r.weekly_target || 0) : (r.daily_target || 0)} onChange={e => r._target = e.target.value} onBlur={() => saveTarget(r)} style={{ ...S.ip, width: 56, padding: "6px 6px", textAlign: "center" }} />
                </div>
                <button onClick={() => remove(r)} style={{ ...S.act, color: "#EF4444" }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                {PRESET.map(col => <button key={col} onClick={() => setColor(r, col)} style={{ width: 18, height: 18, borderRadius: "50%", background: col, border: r.color === col ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px dashed #334155" }}>
          <div style={{ color: "#94A3B8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Add a new one</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} placeholder="e.g. Instagram, X, Email, YouTube" style={{ ...S.ip, flex: 1, minWidth: 140, padding: "6px 8px" }} onKeyDown={e => e.key === "Enter" && add()} />
            <select value={nc.cadence} onChange={e => setNc({ ...nc, cadence: e.target.value })} style={{ ...S.ip, width: 90, padding: "6px 8px" }}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <label style={{ color: "#64748B", fontSize: 10 }}>{nc.cadence === "weekly" ? "/wk" : "/day"}</label>
              <input type="number" min="0" value={nc.target} onChange={e => setNc({ ...nc, target: e.target.value })} style={{ ...S.ip, width: 56, padding: "6px 6px", textAlign: "center" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {PRESET.map(col => <button key={col} onClick={() => setNc({ ...nc, color: col })} style={{ width: 18, height: 18, borderRadius: "50%", background: col, border: nc.color === col ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />)}
            </div>
            <button style={{ ...S.pri, opacity: nc.name.trim() ? 1 : 0.5 }} onClick={add} disabled={!nc.name.trim()}>+ Add</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}>
          <button style={S.pri} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  app: { display: "flex", minHeight: "100vh", background: "#0B1120", fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#CBD5E1" },
  side: { width: 220, background: "#0F172A", borderRight: "1px solid #1E293B", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 },
  logo: { display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 12px", borderBottom: "1px solid #1E293B" },
  logoI: { width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#3B82F6,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff", flexShrink: 0 },
  nav: { display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, border: "none", background: "transparent", color: "#94A3B8", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit", transition: "background 0.15s,color 0.15s" },
  navOn: { background: "#1E293B", color: "#F1F5F9" },
  badge: { marginLeft: "auto", background: "#3B82F6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 },
  main: { flex: 1, minWidth: 0, overflowX: "hidden" },
  content: { padding: "24px 28px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12, flexWrap: "wrap" },
  h1: { color: "#F1F5F9", fontSize: 24, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 },
  h2: { color: "#F1F5F9", fontSize: 15, fontWeight: 600, fontFamily: "'Outfit',sans-serif", margin: "0 0 10px" },
  sub: { color: "#64748B", fontSize: 13, margin: "3px 0 0" },
  pri: { padding: "9px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  ghost: { padding: "9px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#CBD5E1", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  danger: { padding: "9px 14px", borderRadius: 8, border: "1px solid #EF444440", background: "#EF444415", color: "#EF4444", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  pill: { padding: "5px 11px", borderRadius: 20, border: "1px solid #1E293B", background: "#0F172A", color: "#94A3B8", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  pillOn: { background: "#3B82F6", borderColor: "#3B82F6", color: "#fff" },
  sBox: { position: "relative" },
  sInp: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #1E293B", background: "#0F172A", color: "#F1F5F9", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  tw: { overflowX: "auto", border: "1px solid #1E293B", borderRadius: 10, background: "#0F172A" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #1E293B", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #1E293B", cursor: "pointer" },
  td: { padding: "10px 12px", color: "#CBD5E1", verticalAlign: "middle" },
  sel: { padding: "4px 8px", borderRadius: 6, border: "1px solid #1E293B", background: "#0B1120", color: "#CBD5E1", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none" },
  sc: { padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#CBD5E1", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  link: { color: "#3B82F6", textDecoration: "none", fontSize: 12 },
  copyBtn: { padding: "5px 12px", borderRadius: 6, border: "1px solid #3B82F630", background: "#3B82F615", color: "#3B82F6", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  detail: { marginTop: 16, padding: 18, background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B" },
  df: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: "#0B1120", borderRadius: 8, border: "1px solid #1E293B" },
  dl: { color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 },
  dv: { color: "#CBD5E1", fontSize: 13, wordBreak: "break-word" },
  fg2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  fi: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 },
  lb: { color: "#94A3B8", fontSize: 11, fontWeight: 600 },
  ip: { padding: "9px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#0B1120", color: "#F1F5F9", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  kpiBtn: { padding: "7px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#0F172A", color: "#CBD5E1", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  act: { padding: "5px 10px", borderRadius: 6, border: "1px solid #1E293B", background: "transparent", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  empty: { padding: "40px 20px", textAlign: "center", background: "#0F172A", borderRadius: 10, border: "1px dashed #1E293B" },
  toast: { position: "fixed", bottom: 20, right: 20, padding: "12px 18px", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 1000, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  ov: { position: "fixed", inset: 0, background: "rgba(2,6,23,0.7)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900, padding: 16 },
  modal: { width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", background: "#0F172A", borderRadius: 14, border: "1px solid #1E293B", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  cBox: { background: "#0F172A", borderRadius: 14, border: "1px solid #1E293B", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  x: { background: "transparent", border: "none", color: "#64748B", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 },
};

// ============ AUTH LAYER ============
function AuthScreen({ onDone }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { display_name: name.trim() || email.split("@")[0] } } });
        if (error) { setErr(error.message); setBusy(false); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) { setErr(error.message); setBusy(false); return; }
      }
      onDone();
    } catch (e) { setErr(e.message || "Something went wrong"); setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#3B82F6,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>⬡</div>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 22, color: "#F1F5F9" }}>LeadFlow</span>
        </div>
        <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 14, padding: 22 }}>
          <h1 style={{ color: "#F1F5F9", fontSize: 18, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: "0 0 4px" }}>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "0 0 18px" }}>{mode === "login" ? "Sign in to your workspace." : "Use the email your access was granted to."}</p>
          {mode === "signup" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 5 }}>Your name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#0B1120", color: "#F1F5F9", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 5 }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#0B1120", color: "#F1F5F9", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 5 }}>Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} onKeyDown={e => e.key === "Enter" && submit()} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#0B1120", color: "#F1F5F9", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>
          {err && <div style={{ background: "#EF444415", border: "1px solid #EF444440", color: "#FCA5A5", fontSize: 12, padding: "8px 10px", borderRadius: 8, marginBottom: 12 }}>{err}</div>}
          <button onClick={submit} disabled={busy || !email || !pw} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy || !email || !pw ? 0.6 : 1 }}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => { setErr(""); setMode(mode === "login" ? "signup" : "login"); }} style={{ background: "none", border: "none", color: "#3B82F6", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {mode === "login" ? "Got access? Create your account" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterMessage({ title, body, action, onAction }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',sans-serif" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <h1 style={{ color: "#F1F5F9", fontSize: 18, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{title}</h1>
        <p style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>{body}</p>
        {action && <button onClick={onAction} style={{ marginTop: 16, padding: "9px 16px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#CBD5E1", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{action}</button>}
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [ctx, setCtx] = useState(null); // { user, workspaceId, workspaceName, members, isAdmin }
  const authedRef = useRef(false);

  const loadMembers = async (wsId) => {
    const { data: mem } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", wsId);
    const ids = (mem || []).map(m => m.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    return (profs || []).map(p => p.display_name).filter(Boolean);
  };

  const resolve = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuthed(false); setBooting(false); return; }
    const uid = session.user.id;
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    let { data: mem } = await supabase.from("workspace_members").select("workspace_id, role").eq("user_id", uid);
    if (!mem || mem.length === 0) {
      // approved-but-new: claim a fresh empty workspace via the secure function
      const { data: claimedId, error } = await supabase.rpc("claim_workspace");
      if (error || !claimedId) { setNoAccess(true); setBooting(false); return; }
      mem = [{ workspace_id: claimedId, role: "owner" }];
    }
    const wsId = mem[0].workspace_id;
    const { data: ws } = await supabase.from("workspaces").select("name").eq("id", wsId).maybeSingle();
    const members = await loadMembers(wsId);
    const myName = prof?.display_name || session.user.email.split("@")[0];
    setCtx({ user: myName, workspaceId: wsId, workspaceName: ws?.name || "My Workspace", members: members.length ? members : [myName], isAdmin: !!prof?.is_super_admin });
    authedRef.current = true;
    setAuthed(true);
    setNoAccess(false);
    setBooting(false);
  };

  useEffect(() => {
    resolve();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { authedRef.current = false; setAuthed(false); setCtx(null); setNoAccess(false); }
      // Only resolve on a genuine new sign-in. Tab focus re-fires SIGNED_IN, and re-resolving there
      // would unmount the app and bounce you to the dashboard. Skip it if already signed in.
      else if (event === "SIGNED_IN" && !authedRef.current) { resolve(); }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const [viewing, setViewing] = useState(null); // { workspaceId, workspaceName, members } when admin is inside a mentee space

  const enterWorkspace = async (wsId, wsName) => {
    const members = await loadMembers(wsId);
    setViewing({ workspaceId: wsId, workspaceName: wsName, members: members.length ? members : ["(empty)"] });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const exitWorkspace = () => setViewing(null);

  const logout = async () => { authedRef.current = false; await supabase.auth.signOut(); setAuthed(false); setCtx(null); setViewing(null); };

  if (booting) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0B1120" }}><div style={{ width: 32, height: 32, border: "3px solid #1E293B", borderTop: "3px solid #3B82F6", borderRadius: "50%", animation: "spin .8s linear infinite" }} /></div>);

  if (noAccess) return (<CenterMessage title="No access yet" body="This email hasn't been approved. If you're a mentee, message Leon to get added, then sign in again." action="Back to sign in" onAction={logout} />);

  if (!authed || !ctx) return <AuthScreen onDone={resolve} />;

  // Build the context the CRM runs in: the admin's own space, or a mentee's space they're viewing
  const active = viewing
    ? { user: ctx.user, workspaceId: viewing.workspaceId, workspaceName: viewing.workspaceName, members: viewing.members, isAdmin: ctx.isAdmin }
    : ctx;
  const auth = { ...active, onLogout: logout, onEnterWorkspace: enterWorkspace, onExitWorkspace: exitWorkspace, viewingMentee: viewing ? viewing.workspaceName : null, ownWorkspaceId: ctx.workspaceId };

  return <CRM key={active.workspaceId} auth={auth} />;
}
