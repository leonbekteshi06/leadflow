"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

const TEAM = ["Leon", "Kent", "Lukas"];
const STAGES = [
  { id: "new", label: "New Lead", color: "#6C7A89" },
  { id: "outreach", label: "In Outreach", color: "#3B82F6" },
  { id: "responded", label: "Responded", color: "#8B5CF6" },
  { id: "booked", label: "Call Booked", color: "#F59E0B" },
  { id: "closed", label: "Closed Won", color: "#10B981" },
  { id: "lost", label: "Lost", color: "#EF4444" },
];

const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split("T")[0]; };
const daysDiff = (a, b) => { const d1 = new Date(a); d1.setHours(0,0,0,0); const d2 = new Date(b); d2.setHours(0,0,0,0); return Math.floor((d2-d1)/86400000); };
const fmtEU = (d) => { if(!d) return ""; const x = new Date(d); return `${String(x.getDate()).padStart(2,"0")}.${String(x.getMonth()+1).padStart(2,"0")}.${x.getFullYear()}`; };
const weekStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()+1); return d.toISOString().split("T")[0]; };
const monthStart = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d.toISOString().split("T")[0]; };
const fmtMoney = (v) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v||0);

const getSendDate = (c) => {
  if(!c.next_follow_up) return { text:"-", color:"#475569", bg:"transparent" };
  if(c.current_step===0) return { text:"ASAP", color:"#F59E0B", bg:"#F59E0B18" };
  const d = daysDiff(todayStr(), c.next_follow_up);
  if(d<0) return { text:`${Math.abs(d)}d overdue`, color:"#EF4444", bg:"#EF444418" };
  if(d===0) return { text:"Today", color:"#F59E0B", bg:"#F59E0B18" };
  if(d===1) return { text:"Tomorrow", color:"#3B82F6", bg:"#3B82F618" };
  return { text:fmtEU(c.next_follow_up), color:"#94A3B8", bg:"#1E293B" };
};

const getNurtureDate = (c) => {
  if(!c.next_nurture_date) return null;
  const d = daysDiff(todayStr(), c.next_nurture_date);
  if(d<0) return { text:`${Math.abs(d)}d overdue`, color:"#EF4444", bg:"#EF444418" };
  if(d===0) return { text:"Today", color:"#F59E0B", bg:"#F59E0B18" };
  if(d===1) return { text:"Tomorrow", color:"#8B5CF6", bg:"#8B5CF618" };
  return { text:fmtEU(c.next_nurture_date), color:"#94A3B8", bg:"#1E293B" };
};

const needsAction = (c) => {
  const fu = c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) : 999;
  const nu = c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) : 999;
  return fu <= 0 || nu <= 0;
};

const urgency = (c) => {
  const fu = c.next_follow_up ? daysDiff(todayStr(), c.next_follow_up) : 999;
  const nu = c.next_nurture_date ? daysDiff(todayStr(), c.next_nurture_date) : 999;
  return Math.min(fu, nu);
};

export default function CRM() {
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [nurtureM, setNurtureM] = useState([]);
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

  // Persist user selection
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("lf-user", user); }, [user]);

  // Load data from Supabase
  useEffect(() => {
    const load = async () => {
      const [cRes, mRes] = await Promise.all([
        supabase.from("contacts").select("*").order("created_at", { ascending: false }),
        supabase.from("message_templates").select("*").order("step"),
      ]);
      if (cRes.data) setContacts(cRes.data);
      if (mRes.data) {
        setMessages(mRes.data.filter(m => m.type === "outreach"));
        setNurtureM(mRes.data.filter(m => m.type === "nurture"));
      }
      setLoading(false);
    };
    load();

    // Real-time subscriptions
    const contactsSub = supabase.channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => {
        supabase.from("contacts").select("*").order("created_at", { ascending: false }).then(({ data }) => { if (data) setContacts(data); });
      }).subscribe();

    const msgSub = supabase.channel("messages-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () => {
        supabase.from("message_templates").select("*").order("step").then(({ data }) => {
          if (data) { setMessages(data.filter(m => m.type === "outreach")); setNurtureM(data.filter(m => m.type === "nurture")); }
        });
      }).subscribe();

    return () => { supabase.removeChannel(contactsSub); supabase.removeChannel(msgSub); };
  }, []);

  const flash = (m, t = "success") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };

  // CRUD Operations
  const addContact = async (d) => {
    const { error } = await supabase.from("contacts").insert({
      name: d.name, ig: d.ig || "", email: d.email || "", youtube: d.youtube || "", website: d.website || "",
      notes: d.notes || "", stage: "new", current_step: 0, nurture_step: 0, created_at: todayStr(),
      next_follow_up: todayStr(), pipeline_value: d.pipeline_value || 0, assigned_to: d.assigned_to || user,
      history: [], nurture_history: [],
    });
    if (!error) flash(`${d.name} added`);
    else flash("Error adding lead", "error");
  };

  const updateContact = async (id, data) => {
    await supabase.from("contacts").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id);
  };

  const deleteContact = async (id) => {
    const name = contacts.find(c => c.id === id)?.name;
    await supabase.from("contacts").delete().eq("id", id);
    setDelId(null);
    if (detailId === id) setDetailId(null);
    flash(`${name} removed`, "info");
  };

  const markSent = async (id) => {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    const ns = c.current_step + 1;
    const nm = messages.find(m => m.step === ns + 1);
    const cm = messages.find(m => m.step === ns);
    await updateContact(id, {
      current_step: ns,
      stage: ns > 0 && c.stage === "new" ? "outreach" : c.stage,
      last_contacted_at: todayStr(),
      next_follow_up: nm ? addDays(todayStr(), nm.delay_days) : null,
      history: [...(c.history || []), { step: ns, name: cm?.name || `Msg ${ns}`, at: todayStr() }],
    });
    flash("Marked sent!");
  };

  const markNurtureSent = async (id) => {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    const ns = (c.nurture_step || 0) + 1;
    const nm = nurtureM.find(m => m.step === ns + 1);
    const cm = nurtureM.find(m => m.step === ns);
    await updateContact(id, {
      nurture_step: ns,
      last_contacted_at: todayStr(),
      next_nurture_date: nm ? addDays(todayStr(), nm.delay_days) : addDays(todayStr(), 7),
      nurture_history: [...(c.nurture_history || []), { step: ns, name: cm?.name || `N ${ns}`, at: todayStr() }],
    });
    flash("Nurture sent!");
  };

  const moveStage = async (id, stage) => {
    const u = { stage };
    if (stage === "responded") { u.next_nurture_date = todayStr(); u.nurture_step = 0; u.next_follow_up = null; }
    if (["booked", "closed", "lost"].includes(stage)) { u.next_follow_up = null; u.next_nurture_date = null; }
    await updateContact(id, u);
    flash(`Moved to ${STAGES.find(s => s.id === stage)?.label}`);
  };

  const closeDeal = async (id, v) => {
    await updateContact(id, { stage: "closed", closed_value: v, closed_at: todayStr(), next_follow_up: null, next_nurture_date: null });
    flash(`Closed for ${fmtMoney(v)}!`);
    setCloseId(null);
  };

  // Message template CRUD
  const addMsg = async (d, type) => {
    const list = type === "outreach" ? messages : nurtureM;
    await supabase.from("message_templates").insert({ ...d, step: list.length + 1, type });
    flash("Added!");
  };

  const updateMsg = async (id, d) => {
    await supabase.from("message_templates").update(d).eq("id", id);
    flash("Updated!");
  };

  const deleteMsg = async (id, type) => {
    await supabase.from("message_templates").delete().eq("id", id);
    // Re-number steps
    const list = (type === "outreach" ? messages : nurtureM).filter(m => m.id !== id);
    for (let i = 0; i < list.length; i++) {
      await supabase.from("message_templates").update({ step: i + 1 }).eq("id", list[i].id);
    }
    flash("Removed", "info");
  };

  const getNext = (c) => { const m = messages.find(x => x.step === c.current_step + 1); return m ? { ...m, body: m.body.replace(/\{\{name\}\}/g, c.name.split(" ")[0]) } : null; };
  const getNextN = (c) => {
    let m = nurtureM.find(x => x.step === (c.nurture_step || 0) + 1);
    if (!m && nurtureM.length > 0) { const weekly = nurtureM.filter(x => x.step >= 7); if (weekly.length > 0) m = weekly[((c.nurture_step || 0) - 6) % weekly.length] || weekly[0]; else m = nurtureM[nurtureM.length - 1]; }
    return m ? { ...m, body: m.body.replace(/\{\{name\}\}/g, c.name.split(" ")[0]) } : null;
  };

  const copy = async (c, type) => {
    const msg = type === "nurture" ? getNextN(c) : getNext(c);
    if (!msg) return;
    try { await navigator.clipboard.writeText(msg.body); setCopied(c.id + type); setTimeout(() => setCopied(null), 2e3); flash("Copied!"); } catch { flash("Couldn't copy", "error"); }
  };

  const importCSV = async (text) => {
    const lines = text.trim().split("\n"); if (lines.length < 2) return flash("No data", "error");
    const hdr = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const mp = {};
    hdr.forEach((h, i) => { if (h.includes("name")) mp.name = i; else if (h.includes("ig") || h.includes("instagram")) mp.ig = i; else if (h.includes("email")) mp.email = i; else if (h.includes("youtube") || h.includes("yt")) mp.youtube = i; else if (h.includes("website") || h.includes("url") || h.includes("site")) mp.website = i; else if (h.includes("note")) mp.notes = i; else if (h.includes("value") || h.includes("deal")) mp.pv = i; else if (h.includes("assign") || h.includes("owner")) mp.assign = i; });
    if (mp.name === undefined) return flash("Need a 'Name' column", "error");
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const v = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(x => x.replace(/^"|"$/g, "").trim()) || lines[i].split(",").map(x => x.trim());
      const nm = v[mp.name]; if (!nm) continue;
      rows.push({ name: nm, ig: v[mp.ig] || "", email: v[mp.email] || "", youtube: v[mp.youtube] || "", website: v[mp.website] || "", notes: v[mp.notes] || "", stage: "new", current_step: 0, nurture_step: 0, created_at: todayStr(), next_follow_up: todayStr(), pipeline_value: parseFloat(v[mp.pv]) || 0, assigned_to: v[mp.assign] || user, history: [], nurture_history: [] });
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("contacts").insert(rows);
      if (!error) flash(`Imported ${rows.length} leads!`);
      else flash("Import error", "error");
    }
    setModal(null);
  };

  // Filtering & sorting
  const filtered = contacts.filter(c => filter === "all" || c.stage === filter).filter(c => { if (!search) return true; const s = search.toLowerCase(); return c.name.toLowerCase().includes(s) || c.ig?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.notes?.toLowerCase().includes(s); }).sort((a, b) => { let av, bv; if (sortBy === "next_follow_up") { av = a.next_follow_up || "9999"; bv = b.next_follow_up || "9999"; } else if (sortBy === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); } else if (sortBy === "stage") { av = STAGES.findIndex(s => s.id === a.stage); bv = STAGES.findIndex(s => s.id === b.stage); } else { av = a.created_at; bv = b.created_at; } return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1); });

  const wk = weekStart(), mo = monthStart();
  const stats = {
    contactedWeek: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= wk).length,
    contactedMonth: contacts.filter(c => c.last_contacted_at && c.last_contacted_at >= mo).length,
    pipeline: contacts.filter(c => !["closed", "lost"].includes(c.stage)).reduce((s, c) => s + (c.pipeline_value || 0), 0),
    closedTotal: contacts.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0),
    closedMonth: contacts.filter(c => c.stage === "closed" && c.closed_at && c.closed_at >= mo).reduce((s, c) => s + (c.closed_value || 0), 0),
    convRate: contacts.length ? Math.round((contacts.filter(c => c.stage === "closed").length / contacts.length) * 100) : 0,
  };
  const actionsDue = contacts.filter(needsAction);
  const myActionsDue = actionsDue.filter(c => c.assigned_to === user);

  if (loading) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0B1120" }}><div style={{ textAlign: "center" }}><div style={{ width: 32, height: 32, border: "3px solid #1E293B", borderTop: "3px solid #3B82F6", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} /><p style={{ color: "#94A3B8", marginTop: 16, fontFamily: "'DM Sans',sans-serif" }}>Loading LeadFlow...</p></div></div>);

  const NAV = [
    { id: "dashboard", label: "Dashboard", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
    { id: "myleads", label: "My Leads", d: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z", badge: myActionsDue.length || null },
    { id: "contacts", label: "All Leads", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { id: "messages", label: "Outreach", d: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    { id: "nurture", label: "Nurture", d: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
  ];

  const Row = ({ c, showWho }) => {
    const sd = getSendDate(c); const nd = getNurtureDate(c); const nm = getNext(c); const nn = getNextN(c); const stg = STAGES.find(s => s.id === c.stage);
    const isO = ["new", "outreach"].includes(c.stage); const isN = c.stage === "responded" && c.next_nurture_date;
    return (
      <tr style={S.tr} onClick={() => setDetailId(detailId === c.id ? null : c.id)}>
        <td style={S.td}><div style={{ fontWeight: 500, color: "#F1F5F9", fontSize: 13 }}>{c.name}</div>{showWho && <div style={{ fontSize: 10, color: "#64748B" }}>{c.assigned_to}</div>}{c.notes && <div style={{ fontSize: 10, color: "#475569", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes}</div>}</td>
        <td style={S.td}><select value={c.stage} onChange={e => { e.stopPropagation(); if (e.target.value === "closed") setCloseId(c.id); else moveStage(c.id, e.target.value); }} onClick={e => e.stopPropagation()} style={{ ...S.sel, color: stg.color, borderColor: stg.color + "40" }}>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
        <td style={S.td} onClick={e => e.stopPropagation()}>
          {isO && nm ? (<button style={S.copyBtn} onClick={() => copy(c, "outreach")}><span style={{ fontSize: 11, color: "#CBD5E1", fontWeight: 500 }}>{nm.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "outreach" ? "✓ Copied!" : nm.channel === "ig" ? "📱 Copy DM" : "📧 Copy Email"}</span></button>)
            : isN && nn ? (<button style={{ ...S.copyBtn, borderColor: "#8B5CF630" }} onClick={() => copy(c, "nurture")}><span style={{ fontSize: 11, color: "#C4B5FD", fontWeight: 500 }}>{nn.name}</span><span style={{ fontSize: 10, color: "#475569" }}>{copied === c.id + "nurture" ? "✓ Copied!" : "🔁 Copy Nurture"}</span></button>)
              : (<span style={{ fontSize: 11, color: "#475569" }}>{["closed", "booked"].includes(c.stage) ? "-" : "Done"}</span>)}
        </td>
        <td style={S.td}>
          {isO && c.next_follow_up ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: sd.bg, color: sd.color }}>{sd.text}</span>
            : isN && nd ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: nd.bg, color: nd.color }}>{nd.text}</span>
              : <span style={{ color: "#475569", fontSize: 11 }}>-</span>}
        </td>
        <td style={S.td}>{c.pipeline_value ? <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmtMoney(c.pipeline_value)}</span> : c.closed_value ? <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmtMoney(c.closed_value)}</span> : <span style={{ fontSize: 11, color: "#334155" }}>-</span>}</td>
        <td style={S.td} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 3 }}>
            {c.ig && <a href={c.ig.startsWith("http") ? c.ig : `https://instagram.com/${c.ig.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={S.link}>IG</a>}
            {c.email && <a href={`mailto:${c.email}`} style={S.link}>@</a>}
            {c.youtube && <a href={c.youtube.startsWith("http") ? c.youtube : `https://youtube.com/${c.youtube}`} target="_blank" rel="noopener noreferrer" style={S.link}>YT</a>}
            {c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={S.link}>🌐</a>}
          </div>
        </td>
        <td style={S.td} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 3 }}>
            {isO && nm && <button style={{ ...S.act, color: "#10B981" }} onClick={() => markSent(c.id)} title="Mark sent">✓</button>}
            {isN && <button style={{ ...S.act, color: "#8B5CF6" }} onClick={() => markNurtureSent(c.id)} title="Nurture sent">✓</button>}
            <button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "contact", data: c })} title="Edit">✎</button>
            <button style={{ ...S.act, color: "#EF4444" }} onClick={() => setDelId(c.id)} title="Delete">✕</button>
          </div>
        </td>
      </tr>
    );
  };

  const Table = ({ data, showWho = false }) => (
    <div style={S.tw}><table style={S.tbl}><thead><tr>
      {[{ k: "name", l: "Name" }, { k: "stage", l: "Stage" }, { k: null, l: "Next Message" }, { k: "next_follow_up", l: "Send Date" }, { k: null, l: "Value" }, { k: null, l: "Links" }, { k: null, l: "Actions" }].map((c, i) => (
        <th key={i} style={{ ...S.th, cursor: c.k ? "pointer" : "default" }} onClick={() => { if (!c.k) return; if (sortBy === c.k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(c.k); setSortDir("asc"); } }}>{c.l}{sortBy === c.k && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}</th>
      ))}
    </tr></thead><tbody>{data.map(c => <Row key={c.id} c={c} showWho={showWho} />)}</tbody></table></div>
  );

  const Detail = () => {
    const c = contacts.find(x => x.id === detailId); if (!c) return null;
    const nm = getNext(c); const nn = getNextN(c);
    return (
      <div style={S.detail}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h3 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 600, margin: 0 }}>{c.name}</h3><div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>Added {fmtEU(c.created_at)} · Assigned to <strong style={{ color: "#CBD5E1" }}>{c.assigned_to}</strong></div></div>
          <button style={S.x} onClick={() => setDetailId(null)}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {c.ig && <div style={S.df}><span style={S.dl}>Instagram</span><span style={S.dv}>{c.ig}</span></div>}
          {c.email && <div style={S.df}><span style={S.dl}>Email</span><span style={S.dv}>{c.email}</span></div>}
          {c.youtube && <div style={S.df}><span style={S.dl}>YouTube</span><span style={S.dv}>{c.youtube}</span></div>}
          {c.website && <div style={S.df}><span style={S.dl}>Website</span><span style={S.dv}>{c.website}</span></div>}
          {c.pipeline_value > 0 && <div style={S.df}><span style={S.dl}>Pipeline Value</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.pipeline_value)}</span></div>}
          {c.closed_value > 0 && <div style={S.df}><span style={S.dl}>Closed For</span><span style={{ ...S.dv, color: "#10B981" }}>{fmtMoney(c.closed_value)}</span></div>}
        </div>
        {c.notes && <div style={{ ...S.df, marginTop: 8 }}><span style={S.dl}>Notes</span><span style={{ ...S.dv, whiteSpace: "pre-wrap" }}>{c.notes}</span></div>}
        {nm && ["new", "outreach"].includes(c.stage) && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #1E293B" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>NEXT: {nm.name}</span><button style={S.sc} onClick={() => copy(c, "outreach")}>{copied === c.id + "outreach" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nm.body}</div></div>)}
        {nn && c.stage === "responded" && (<div style={{ marginTop: 12, padding: 10, background: "#0B1120", borderRadius: 8, border: "1px solid #8B5CF620" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><span style={{ color: "#C4B5FD", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>NURTURE: {nn.name}</span><button style={{ ...S.sc, borderColor: "#8B5CF640", color: "#C4B5FD" }} onClick={() => copy(c, "nurture")}>{copied === c.id + "nurture" ? "Copied!" : "Copy"}</button></div><div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{nn.body}</div></div>)}
        {((c.history || []).length > 0 || (c.nurture_history || []).length > 0) && (<div style={{ marginTop: 12 }}><span style={{ color: "#64748B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Activity</span><div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>{[...(c.history || []).map(h => ({ ...h, t: "out" })), ...(c.nurture_history || []).map(h => ({ ...h, t: "nur" }))].sort((a, b) => b.at > a.at ? 1 : -1).map((h, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1E293B" }}><span style={{ color: h.t === "nur" ? "#C4B5FD" : "#CBD5E1", fontSize: 11 }}>{h.t === "nur" ? "🔁 " : "📤 "}{h.name}</span><span style={{ color: "#64748B", fontSize: 10 }}>{fmtEU(h.at)}</span></div>))}</div></div>)}
      </div>
    );
  };

  const MsgView = ({ type }) => {
    const list = type === "outreach" ? messages : nurtureM;
    return (
      <div style={S.content}>
        <div style={S.header}><div><h1 style={S.h1}>{type === "outreach" ? "Outreach Sequence" : "Nurture Sequence"}</h1><p style={S.sub}>{type === "outreach" ? "Your cold outreach messages. Edit to match your offer." : "Follow-up messages for responded leads."}</p></div>
          <button style={S.pri} onClick={() => setModal({ type: "msg", data: null, msgType: type })}>+ Add</button></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {list.sort((a, b) => a.step - b.step).map((m, i) => (<div key={m.id}>
            <div style={{ background: "#0F172A", borderRadius: 10, border: `1px solid ${type === "nurture" ? "#8B5CF620" : "#1E293B"}`, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #1E293B" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: type === "nurture" ? "linear-gradient(135deg,#8B5CF6,#EC4899)" : "linear-gradient(135deg,#3B82F6,#6366F1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{m.step}</div>
                  <div><div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13 }}>{m.name}</div><div style={{ color: "#64748B", fontSize: 10 }}>{m.channel === "ig" ? "📱 IG DM" : "📧 Email"} · {m.delay_days === 0 ? "Immediately" : `${m.delay_days}d delay`}</div></div>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  <button style={{ ...S.act, color: "#94A3B8" }} onClick={() => setModal({ type: "msg", data: m, msgType: type })}>✎</button>
                  {list.length > 1 && <button style={{ ...S.act, color: "#EF4444" }} onClick={() => deleteMsg(m.id, type)}>✕</button>}
                </div>
              </div>
              <div style={{ padding: "10px 12px", fontSize: 12, lineHeight: 1.6, color: "#94A3B8", whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
            {i < list.length - 1 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px" }}><div style={{ flex: 1, height: 1, background: "#1E293B" }} /><span style={{ color: "#475569", fontSize: 9, fontWeight: 500 }}>{list[i + 1]?.delay_days === 0 ? "Immediately" : `Wait ${list[i + 1]?.delay_days}d`}</span><div style={{ flex: 1, height: 1, background: "#1E293B" }} /></div>}
          </div>))}
        </div>
      </div>
    );
  };

  return (
    <div style={S.app}>
      {toast && <div style={{ ...S.toast, background: toast.t === "error" ? "#EF4444" : toast.t === "info" ? "#3B82F6" : "#10B981" }}>{toast.m}</div>}

      {/* Sidebar */}
      <div style={S.side}>
        <div style={S.logo}><div style={S.logoI}>⬡</div><span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, color: "#F1F5F9" }}>LeadFlow</span></div>
        <div style={{ padding: "0 12px 10px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ fontSize: 9, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Logged in as</div>
          <select value={user} onChange={e => setUser(e.target.value)} style={{ width: "100%", background: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, padding: "7px 8px", color: "#F1F5F9", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer" }}>{TEAM.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px", flex: 1 }}>
          {NAV.map(n => (<button key={n.id} onClick={() => { setView(n.id); setDetailId(null); }} style={{ ...S.nav, ...(view === n.id ? S.navOn : {}) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg>
            <span>{n.label}</span>{n.badge && <span style={S.badge}>{n.badge}</span>}
          </button>))}
        </nav>
        <div style={{ padding: "10px 12px", borderTop: "1px solid #1E293B", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#F1F5F9", fontWeight: 700 }}>{contacts.length}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Pipeline</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.pipeline)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 700 }}>{fmtMoney(stats.closedTotal)}</span></div>
        </div>
      </div>

      <div style={S.main}>
        {/* DASHBOARD */}
        {view === "dashboard" && (<div style={S.content}>
          <div style={S.header}><div><h1 style={S.h1}>Dashboard</h1><p style={S.sub}>Welcome back, {user}</p></div>
            <button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginBottom: 20 }}>
            {[{ l: "Contacted This Week", v: stats.contactedWeek, c: "#3B82F6" }, { l: "Contacted This Month", v: stats.contactedMonth, c: "#6366F1" }, { l: "Pipeline Value", v: fmtMoney(stats.pipeline), c: "#10B981" }, { l: "Closed This Month", v: fmtMoney(stats.closedMonth), c: "#F59E0B" }, { l: "Total Revenue", v: fmtMoney(stats.closedTotal), c: "#10B981" }, { l: "Close Rate", v: `${stats.convRate}%`, c: "#8B5CF6" }].map((s, i) => (
              <div key={i} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", borderTop: `3px solid ${s.c}` }}><div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.l}</div><div style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700, fontFamily: "'Outfit',sans-serif", marginTop: 3 }}>{s.v}</div></div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6, marginBottom: 20 }}>
            {STAGES.map(s => { const cnt = contacts.filter(c => c.stage === s.id).length; return (<div key={s.id} style={{ padding: "12px 10px", background: "#0F172A", borderRadius: 8, border: "1px solid #1E293B", borderLeft: `3px solid ${s.color}`, cursor: "pointer" }} onClick={() => { setView("contacts"); setFilter(s.id); }}><div style={{ color: "#94A3B8", fontSize: 10, fontWeight: 600 }}>{s.label}</div><div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{cnt}</div></div>); })}
          </div>
          <h2 style={S.h2}>Today&apos;s Actions ({actionsDue.length})</h2>
          {actionsDue.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>Nothing due today!</p></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 20 }}>{actionsDue.sort((a, b) => urgency(a) - urgency(b)).map(c => { const isOver = urgency(c) < 0; const nm = getNext(c); const nn = getNextN(c); const isO = ["new", "outreach"].includes(c.stage); const msg = isO ? nm : nn; const mt = isO ? "outreach" : "nurture"; return (<div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0F172A", borderRadius: 8, border: `1px solid ${isOver ? "#EF444430" : "#1E293B"}` }}><div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: isOver ? "#EF4444" : "#F59E0B", boxShadow: `0 0 6px ${isOver ? "#EF444460" : "#F59E0B60"}`, flexShrink: 0 }} /><div><div style={{ color: "#F1F5F9", fontWeight: 500, fontSize: 13 }}>{c.name} <span style={{ color: "#64748B", fontWeight: 400, fontSize: 11 }}>({c.assigned_to})</span></div><div style={{ color: "#64748B", fontSize: 11 }}>{msg ? msg.name : "Action needed"}</div></div></div><div style={{ display: "flex", gap: 4, alignItems: "center" }}>{msg && <button style={S.sc} onClick={() => copy(c, mt)}>{copied === c.id + mt ? "Copied!" : "Copy"}</button>}</div></div>); })}</div>}
          <h2 style={S.h2}>Team</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>{TEAM.map(t => { const ml = contacts.filter(c => c.assigned_to === t); const ma = actionsDue.filter(c => c.assigned_to === t); const mc = ml.filter(c => c.stage === "closed").reduce((s, c) => s + (c.closed_value || 0), 0); return (<div key={t} style={{ padding: 12, background: "#0F172A", borderRadius: 10, border: `1px solid ${t === user ? "#3B82F640" : "#1E293B"}` }}><div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t}{t === user && <span style={{ color: "#3B82F6", fontSize: 10 }}> (you)</span>}</div><div style={{ display: "flex", flexDirection: "column", gap: 3 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Leads</span><span style={{ color: "#CBD5E1", fontWeight: 600 }}>{ml.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Due Today</span><span style={{ color: ma.length ? "#F59E0B" : "#CBD5E1", fontWeight: 600 }}>{ma.length}</span></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "#64748B" }}>Closed</span><span style={{ color: "#10B981", fontWeight: 600 }}>{fmtMoney(mc)}</span></div></div></div>); })}</div>
        </div>)}

        {/* MY LEADS */}
        {view === "myleads" && (() => {
          const my = contacts.filter(c => c.assigned_to === user);
          const over = my.filter(c => urgency(c) < 0).sort((a, b) => urgency(a) - urgency(b));
          const today2 = my.filter(c => urgency(c) === 0);
          const upcoming = my.filter(c => { const u2 = urgency(c); return u2 > 0 && u2 <= 7; }).sort((a, b) => urgency(a) - urgency(b));
          return (<div style={S.content}>
            <div style={S.header}><div><h1 style={S.h1}>My Leads</h1><p style={S.sub}>{user}&apos;s leads and daily actions</p></div>
              <button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button></div>
            {over.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#EF4444" }}>Overdue ({over.length})</h2><Table data={over} /></div>}
            {today2.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#F59E0B" }}>Due Today ({today2.length})</h2><Table data={today2} /></div>}
            {upcoming.length > 0 && <div style={{ marginBottom: 16 }}><h2 style={{ ...S.h2, color: "#3B82F6" }}>Upcoming This Week ({upcoming.length})</h2><Table data={upcoming} /></div>}
            {over.length === 0 && today2.length === 0 && upcoming.length === 0 && <div style={S.empty}><p style={{ color: "#64748B" }}>All caught up!</p></div>}
            {detailId && <Detail />}
          </div>);
        })()}

        {/* ALL CONTACTS */}
        {view === "contacts" && (<div style={S.content}>
          <div style={S.header}><div><h1 style={S.h1}>All Leads</h1><p style={S.sub}>{filtered.length} lead{filtered.length !== 1 ? "s" : ""}</p></div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={S.ghost} onClick={() => setModal({ type: "csv" })}>📤 Import CSV</button>
              <button style={S.pri} onClick={() => setModal({ type: "contact", data: null })}>+ Add Lead</button>
            </div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <div style={S.sBox}><input style={S.sInp} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <button style={{ ...S.pill, ...(filter === "all" ? S.pillOn : {}) }} onClick={() => setFilter("all")}>All</button>
              {STAGES.map(s => <button key={s.id} style={{ ...S.pill, ...(filter === s.id ? S.pillOn : {}) }} onClick={() => setFilter(s.id)}>{s.label} <span style={{ opacity: .5 }}>{contacts.filter(c => c.stage === s.id).length}</span></button>)}
            </div>
          </div>
          {filtered.length === 0 ? <div style={S.empty}><p style={{ color: "#64748B" }}>No leads found.</p></div> : <Table data={filtered} showWho />}
          {detailId && <Detail />}
        </div>)}

        {view === "messages" && <MsgView type="outreach" />}
        {view === "nurture" && <MsgView type="nurture" />}
      </div>

      {/* MODALS */}
      {modal?.type === "contact" && <ContactModal c={modal.data} team={TEAM} user={user} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateContact(modal.data.id, d); else await addContact(d); setModal(null); }} />}
      {modal?.type === "msg" && <MsgModal m={modal.data} total={(modal.msgType === "outreach" ? messages : nurtureM).length} type={modal.msgType} onClose={() => setModal(null)} onSave={async d => { if (modal.data) await updateMsg(modal.data.id, d); else await addMsg(d, modal.msgType); setModal(null); }} />}
      {modal?.type === "csv" && <CSVModal onClose={() => setModal(null)} onImport={importCSV} />}
      {closeId && <CloseModal c={contacts.find(x => x.id === closeId)} onClose={() => setCloseId(null)} onSave={v => closeDeal(closeId, v)} />}
      {delId && <div style={S.ov} onClick={() => setDelId(null)}><div style={S.cBox} onClick={e => e.stopPropagation()}><h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Delete this lead?</h3><p style={{ color: "#94A3B8", fontSize: 13, margin: "6px 0 14px" }}>This can&apos;t be undone.</p><div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button style={S.ghost} onClick={() => setDelId(null)}>Cancel</button><button style={S.danger} onClick={() => deleteContact(delId)}>Delete</button></div></div></div>}
    </div>
  );
}

function ContactModal({ c, team, user, onClose, onSave }) {
  const [f, setF] = useState({ name: c?.name || "", ig: c?.ig || "", email: c?.email || "", youtube: c?.youtube || "", website: c?.website || "", notes: c?.notes || "", pipeline_value: c?.pipeline_value || "", assigned_to: c?.assigned_to || user });
  const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []);
  const save = () => { if (!f.name.trim()) return; onSave({ ...f, pipeline_value: parseFloat(f.pipeline_value) || 0 }); };
  return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{c ? "Edit Lead" : "Add New Lead"}</h2><button style={S.x} onClick={onClose}>✕</button></div>
    <div style={S.fg2}>
      <div style={S.fi}><label style={S.lb}>Name *</label><input ref={ref} style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="John Smith" onKeyDown={e => e.key === "Enter" && save()} /></div>
      <div style={S.fi}><label style={S.lb}>Assigned To</label><select style={S.ip} value={f.assigned_to} onChange={e => setF({ ...f, assigned_to: e.target.value })}>{team.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
      <div style={S.fi}><label style={S.lb}>Instagram</label><input style={S.ip} value={f.ig} onChange={e => setF({ ...f, ig: e.target.value })} placeholder="@handle" /></div>
      <div style={S.fi}><label style={S.lb}>Email</label><input style={S.ip} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="john@email.com" /></div>
      <div style={S.fi}><label style={S.lb}>YouTube</label><input style={S.ip} value={f.youtube} onChange={e => setF({ ...f, youtube: e.target.value })} placeholder="Channel URL" /></div>
      <div style={S.fi}><label style={S.lb}>Website</label><input style={S.ip} value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="https://..." /></div>
      <div style={S.fi}><label style={S.lb}>Pipeline Value ($)</label><input style={S.ip} type="number" value={f.pipeline_value} onChange={e => setF({ ...f, pipeline_value: e.target.value })} placeholder="5000" /></div>
      <div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Notes</label><textarea style={{ ...S.ip, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Notes..." /></div>
    </div>
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: f.name.trim() ? 1 : .5 }} onClick={save} disabled={!f.name.trim()}>{c ? "Save" : "Add Lead"}</button></div>
  </div></div>);
}

function MsgModal({ m, total, type, onClose, onSave }) {
  const [f, setF] = useState({ name: m?.name || `${type === "nurture" ? "Nurture" : "Message"} ${total + 1}`, channel: m?.channel || "ig", delay_days: m?.delay_days ?? 3, body: m?.body || "" });
  return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>{m ? "Edit" : "Add"} Message</h2><button style={S.x} onClick={onClose}>✕</button></div>
    <div style={S.fg2}>
      <div style={S.fi}><label style={S.lb}>Name</label><input style={S.ip} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div style={S.fi}><label style={S.lb}>Channel</label><select style={S.ip} value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}><option value="ig">Instagram DM</option><option value="email">Email</option></select></div>
      <div style={S.fi}><label style={S.lb}>Delay (days)</label><input style={S.ip} type="number" min="0" value={f.delay_days} onChange={e => setF({ ...f, delay_days: parseInt(e.target.value) || 0 })} /></div>
      <div style={{ ...S.fi, gridColumn: "1/-1" }}><label style={S.lb}>Body</label><textarea style={{ ...S.ip, minHeight: 120, resize: "vertical" }} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder={'Use {{name}} for auto-fill'} /><p style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>{'{{name}}'} auto-fills with lead&apos;s first name</p></div>
    </div>
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 16 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={S.pri} onClick={() => onSave(f)}>{m ? "Save" : "Add"}</button></div>
  </div></div>);
}

function CSVModal({ onClose, onImport }) {
  const [text, setText] = useState(""); const ref = useRef(null);
  const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setText(ev.target.result); r.readAsText(f); };
  return (<div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 700, fontFamily: "'Outfit',sans-serif", margin: 0 }}>Import CSV</h2><button style={S.x} onClick={onClose}>✕</button></div>
    <p style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>Upload a CSV from Google Sheets. Needs a &quot;Name&quot; column.</p>
    <input type="file" accept=".csv,.txt" ref={ref} onChange={handleFile} style={{ display: "none" }} />
    <button style={{ ...S.ghost, width: "100%", padding: 12, marginBottom: 10, borderStyle: "dashed" }} onClick={() => ref.current?.click()}>{text ? "✓ File loaded!" : "📤 Choose CSV File"}</button>
    <div style={{ fontSize: 10, color: "#64748B", marginBottom: 6 }}>Or paste CSV:</div>
    <textarea style={{ ...S.ip, width: "100%", minHeight: 80, resize: "vertical", fontSize: 11, boxSizing: "border-box" }} value={text} onChange={e => setText(e.target.value)} placeholder={"name,instagram,email\nJohn,@john,john@email.com"} />
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, opacity: text.trim() ? 1 : .5 }} onClick={() => text.trim() && onImport(text)} disabled={!text.trim()}>Import</button></div>
  </div></div>);
}

function CloseModal({ c, onClose, onSave }) {
  const [v, setV] = useState(c?.pipeline_value || "");
  return (<div style={S.ov} onClick={onClose}><div style={{ ...S.cBox, width: 360 }} onClick={e => e.stopPropagation()}>
    <h3 style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 600, margin: 0 }}>Close {c?.name}</h3>
    <p style={{ color: "#94A3B8", fontSize: 12, margin: "6px 0 12px" }}>How much did you close for?</p>
    <div style={S.fi}><label style={S.lb}>Deal Value ($)</label><input style={S.ip} type="number" value={v} onChange={e => setV(e.target.value)} placeholder="5000" autoFocus onKeyDown={e => e.key === "Enter" && onSave(parseFloat(v) || 0)} /></div>
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}><button style={S.ghost} onClick={onClose}>Cancel</button><button style={{ ...S.pri, background: "linear-gradient(135deg,#10B981,#059669)" }} onClick={() => onSave(parseFloat(v) || 0)}>Close Deal</button></div>
  </div></div>);
}

const S = {
  app: { display: "flex", height: "100vh", background: "#0B1120", fontFamily: "'DM Sans',sans-serif", color: "#CBD5E1", overflow: "hidden" },
  side: { width: 200, minWidth: 200, background: "#0F172A", borderRight: "1px solid #1E293B", display: "flex", flexDirection: "column", padding: "14px 0" },
  logo: { display: "flex", alignItems: "center", gap: 8, padding: "0 14px 12px", borderBottom: "1px solid #1E293B", marginBottom: 8 },
  logoI: { width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#3B82F6,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 },
  nav: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "#94A3B8", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textAlign: "left", position: "relative" },
  navOn: { background: "#1E293B", color: "#F1F5F9" },
  badge: { position: "absolute", right: 8, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10, minWidth: 14, textAlign: "center" },
  main: { flex: 1, overflow: "auto" },
  content: { padding: 22, maxWidth: 1100 },
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
  tr: { borderBottom: "1px solid #1E293B", cursor: "pointer" },
  td: { padding: "8px 10px", verticalAlign: "middle" },
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
  df: { display: "flex", flexDirection: "column", gap: 2 },
  dl: { color: "#64748B", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" },
  dv: { color: "#CBD5E1", fontSize: 12 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "#0F172A", borderRadius: 12, border: "1px solid #1E293B" },
  ov: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#0F172A", border: "1px solid #1E293B", borderRadius: 14, padding: 20, width: "92%", maxWidth: 500, maxHeight: "85vh", overflow: "auto" },
  cBox: { background: "#0F172A", border: "1px solid #1E293B", borderRadius: 14, padding: 20, width: 320 },
  fg2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  fi: { display: "flex", flexDirection: "column", gap: 3 },
  lb: { color: "#94A3B8", fontSize: 10, fontWeight: 600 },
  ip: { background: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, padding: "7px 10px", color: "#F1F5F9", fontSize: 12, outline: "none", fontFamily: "'DM Sans',sans-serif" },
  x: { background: "transparent", border: "none", color: "#64748B", fontSize: 16, cursor: "pointer", padding: 3 },
  toast: { position: "fixed", top: 14, right: 14, padding: "8px 14px", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", zIndex: 2000, boxShadow: "0 8px 30px rgba(0,0,0,.3)", animation: "slideIn .3s ease" },
};
