import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   RIJESH FINANCE v3.2 — Fully Responsive (Mobile + Tablet + Desktop)
   Bottom nav on mobile · Sidebar nav on ≥768px
═══════════════════════════════════════════════════════════════ */

// ─── Next.js: write key is the only public env var needed ───────────────────
// KV credentials stay server-side; all DB ops go through /api/kv
const WRITE_KEY = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_WRITE_KEY)
               || "rijesh2025";

// ─── DB helpers — proxy through Next.js API route ────────────────────────────
async function dbGet() {
  try {
    const r = await fetch("/api/kv", { method: "GET" });
    if (!r.ok) return null;
    const j = await r.json();
    return j.value || null;
  } catch { return null; }
}
async function dbSet(data) {
  try {
    await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data }),
    });
  } catch {}
}
async function dbDelete() {
  try {
    await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "del" }),
    });
  } catch {}
}

const mkDefault = () => ({
  transactions: [],
  upcomingExpenses: [],
  goals: [
    { id: "ioe",       name: "IOE Fund",       target: 100000, saved: 0, color: "#6366f1", icon: "🎓", deadline: "" },
    { id: "emergency", name: "Emergency Fund",  target: 50000,  saved: 0, color: "#f59e0b", icon: "🛡️", deadline: "" },
    { id: "laptop",    name: "Laptop Fund",     target: 60000,  saved: 0, color: "#10b981", icon: "💻", deadline: "" },
  ],
  monthlyIncome: 20000,
  monthlyGoal: 8000,
  lockedMoney: 0,
  walletBalance: 0,   // user's actual current cash/bank balance
  noSpendDays: [],
  settings: { writeKey: WRITE_KEY },
});

const today       = () => new Date().toISOString().split("T")[0];
const currentMonth= () => today().slice(0, 7);
const fmt  = (n) => `Rs. ${Math.round(n || 0).toLocaleString("en-IN")}`;
const fmtK = (n) => n >= 1000 ? `Rs. ${(n / 1000).toFixed(1)}K` : fmt(n);

function calcScore(data) {
  const month = currentMonth();
  const txns = data.transactions.filter(t => t.date.startsWith(month));
  const incTxns = data.transactions.filter(t => t.date.startsWith(month) && t.type === "income").reduce((s,t)=>s+t.amount,0);
  const inc = data.monthlyIncome + incTxns;
  const exp = txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const sav = txns.filter(t => t.type === "saving").reduce((s, t) => s + t.amount, 0);
  const regrets = txns.filter(t => t.regret).length;
  const noSpend = data.noSpendDays.filter(d => d.startsWith(month)).length;
  let score = 40;
  if (inc > 0) {
    const savRatio = sav / inc;
    const expRatio = exp / inc;
    score += Math.min(30, savRatio * 120);   // up to +30 for saving well
    score -= Math.min(25, expRatio * 50);    // up to -25 for overspending
  }
  score += Math.min(15, noSpend * 3);        // +3 per no-spend day
  score -= Math.min(20, regrets * 4);        // -4 per regret purchase
  if (sav >= data.monthlyGoal) score += 15;  // +15 bonus for hitting goal
  if (sav === 0 && exp > 0) score -= 15;     // heavy penalty for no savings
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getStreak(data) {
  const s = [...data.noSpendDays].sort().reverse();
  if (!s.length) return 0;
  let streak = 0, check = new Date();
  for (const d of s) {
    const diff = Math.round((check - new Date(d)) / 86400000);
    if (diff <= 1) { streak++; check = new Date(d); } else break;
  }
  return streak;
}

function project(data) {
  const month = currentMonth();
  const txns = data.transactions.filter(t => t.date.startsWith(month));
  const avgSave = txns.filter(t => t.type === "saving").reduce((s, t) => s + t.amount, 0) || 5000;
  let cum = data.transactions.filter(t => t.type === "saving").reduce((s, t) => s + t.amount, 0);
  return Array.from({ length: 18 }, (_, i) => { cum += avgSave; return { m: i + 1, v: cum }; });
}

/* ─── Hooks ─── */
function useBreakpoint() {
  const [bp, setBp] = useState(1200); // SSR-safe default
  useEffect(() => {
    setBp(window.innerWidth);
    const fn = () => setBp(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: bp < 768, isTablet: bp >= 768 && bp < 1100, isDesktop: bp >= 1100, w: bp };
}

/* ─── Animated counter ─── */
function AnimCounter({ target, duration = 900 }) {
  const [val, setVal] = useState(target); // start at target to avoid flash of 0
  const prevTarget = useRef(target);
  const raf = useRef(null);
  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * ease));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return <>{val.toLocaleString("en-IN")}</>;
}

/* ─── Score Ring ─── */
function ScoreRing({ score, size = 108 }) {
  const r = size * 0.42, circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "ELITE" : score >= 60 ? "SOLID" : score >= 40 ? "FAIR" : "GRIND";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.074}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.074}
          strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 6px ${color}80)`, transition:"stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}/>
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:size*0.2,fontWeight:700,color,lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:size*0.075,color:"rgba(255,255,255,0.3)",marginTop:2,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em" }}>{label}</div>
      </div>
    </div>
  );
}

/* ─── Progress Bar ─── */
function PBar({ value, max, color="#6366f1", height=8 }) {
  const pct = Math.min(100, max > 0 ? (value/max)*100 : 0);
  return (
    <div style={{ height, background:"rgba(255,255,255,0.06)", borderRadius:height, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${color}70,${color})`, borderRadius:height, boxShadow:`0 0 8px ${color}50`, transition:"width 0.9s cubic-bezier(.4,0,.2,1)" }}/>
    </div>
  );
}

/* ─── Toast ─── */
function Toast({ msg, type }) {
  return (
    <div style={{ position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,
      background:type==="err"?"#ef4444":"#10b981",color:"#fff",
      fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,
      padding:"10px 22px",borderRadius:40,whiteSpace:"nowrap",
      boxShadow:`0 4px 24px ${type==="err"?"rgba(239,68,68,0.5)":"rgba(16,185,129,0.5)"}`,
      animation:"toastIn .2s ease" }}>
      {msg}
    </div>
  );
}

/* ─── Goal Card ─── */
function GoalCard({ g, readOnly, onContribute, onDelete }) {
  const [amount, setAmount] = useState("");
  const pct = Math.min(100, g.target > 0 ? (g.saved/g.target)*100 : 0);
  const remaining = Math.max(0, g.target - g.saved);
  const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline)-new Date())/86400000) : null;
  return (
    <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${g.color}30`,borderRadius:18,padding:18,marginBottom:14,position:"relative",overflow:"hidden",animation:"fadeUp 0.4s ease" }}>
      <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${g.color},transparent)` }}/>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14 }}>
        <div>
          <div style={{ fontSize:24,marginBottom:5 }}>{g.icon}</div>
          <div style={{ fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:15,color:"#fff" }}>{g.name}</div>
          {daysLeft!==null && <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:daysLeft<30?"#f59e0b":"rgba(255,255,255,0.3)",marginTop:3 }}>{daysLeft>0?`${daysLeft} days left`:"Deadline passed"}</div>}
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:700,color:g.color,lineHeight:1 }}>{Math.round(pct)}%</div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:4 }}>{fmtK(g.saved)} / {fmtK(g.target)}</div>
        </div>
      </div>
      <PBar value={g.saved} max={g.target} color={g.color} height={10}/>
      <div style={{ display:"flex",justifyContent:"space-between",marginTop:6 }}>
        {[0.25,0.5,0.75,1].map(m => {
          const reached = pct >= m*100;
          return (
            <div key={m} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:reached?g.color:"rgba(255,255,255,0.1)",boxShadow:reached?`0 0 6px ${g.color}`:"none",transition:"all 0.5s" }}/>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:8,color:reached?g.color:"rgba(255,255,255,0.2)" }}>{m*100}%</div>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex",gap:8,marginTop:14 }}>
        <input type="number" placeholder={`Add (${fmtK(remaining)} left)`} value={amount} onChange={e=>setAmount(e.target.value)}
          style={{ flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${g.color}30`,borderRadius:10,padding:"9px 12px",color:"#fff",fontFamily:"'DM Mono',monospace",fontSize:13,outline:"none" }}/>
        <button onClick={()=>{onContribute(g.id,amount);setAmount("");}}
          style={{ background:g.color,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap" }}>+ Add</button>
        <button onClick={()=>onDelete(g.id)}
          style={{ background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,padding:"9px 12px",fontFamily:"'DM Mono',monospace",fontSize:11,cursor:"pointer" }}>Del</button>
      </div>
    </div>
  );
}

/* ─── Road Map ─── */
function RoadMap({ expenses }) {
  const todayStr = today();
  const sorted = [...expenses].sort((a,b)=>a.date>b.date?1:-1);
  if (!sorted.length) return <div style={{ textAlign:"center",padding:"30px 0",fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,0.2)" }}>No upcoming expenses planned</div>;
  return (
    <div style={{ position:"relative",paddingLeft:30,marginTop:8 }}>
      <div style={{ position:"absolute",left:10,top:0,bottom:0,width:2,background:"linear-gradient(180deg,#6366f1,#f59e0b,#10b981,rgba(255,255,255,0.04))" }}/>
      {sorted.map((e,i) => {
        const days = Math.ceil((new Date(e.date)-new Date(todayStr))/86400000);
        const overdue = days<0, urgent = days<=3&&!overdue;
        const color = overdue?"#ef4444":urgent?"#f59e0b":"#6366f1";
        return (
          <div key={e.id} style={{ position:"relative",marginBottom:i<sorted.length-1?`${Math.max(12,Math.min(days,30)*2)}px`:0,animation:`fadeUp ${0.2+i*0.07}s ease` }}>
            <div style={{ position:"absolute",left:-30,top:8,width:18,height:18,borderRadius:"50%",background:color,border:"3px solid #0b0d14",boxShadow:`0 0 10px ${color}80`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700 }}>
              {overdue?"!":i+1}
            </div>
            <div style={{ background:`${color}0d`,border:`1px solid ${color}25`,borderRadius:12,padding:"12px 14px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"'Sora',sans-serif",fontWeight:600,fontSize:14,color:"#fff" }}>{e.name}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2 }}>{e.date} · {fmtK(e.amount)}</div>
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color,textAlign:"right" }}>
                  {overdue?"OVERDUE":days===0?"TODAY":`${days}d`}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Projection Chart ─── */
function ProjectionChart({ data }) {
  const proj = project(data);
  const maxV = Math.max(...proj.map(p=>p.v),1);
  const milestones = [25000,50000,100000,150000,200000];
  return (
    <div>
      <div style={{ display:"flex",alignItems:"flex-end",gap:3,height:140,padding:"0 4px",marginBottom:16 }}>
        {proj.map((p,i) => {
          const h = Math.round((p.v/maxV)*100);
          const hue = Math.round((i/proj.length)*200+200);
          const d = new Date(); d.setMonth(d.getMonth()+p.m);
          return (
            <div key={i} title={fmtK(p.v)} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
              <div style={{ width:"100%",height:`${h}%`,background:`hsl(${hue},75%,58%)`,borderRadius:"4px 4px 0 0",boxShadow:`0 0 6px hsl(${hue},75%,58%,0.4)`,transition:`height ${0.3+i*0.04}s ease`,minHeight:4 }}/>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:7,color:"rgba(255,255,255,0.25)",textAlign:"center" }}>
                {d.toLocaleDateString("en-US",{month:"short"})}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14 }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,0.25)",marginBottom:10,letterSpacing:"0.1em" }}>SAVINGS MILESTONES</div>
        {milestones.map((ms,i) => {
          const reached = proj.find(p=>p.v>=ms);
          const c = ["#10b981","#6366f1","#f59e0b","#ec4899","#ef4444"][i];
          return (
            <div key={ms} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:8,height:8,borderRadius:"50%",background:reached?c:"rgba(255,255,255,0.1)",boxShadow:reached?`0 0 8px ${c}`:"none" }}/>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:reached?c:"rgba(255,255,255,0.3)" }}>{fmtK(ms)}</span>
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:reached?c:"rgba(255,255,255,0.2)" }}>{reached?`Month ${reached.m} ✓`:"Not reached yet"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Transaction row ─── */
function TxnItem({ t, typeColors, onDel, onRegret }) {
  const cls = { expense:"txn-exp",income:"txn-inc",saving:"txn-sav",investment:"txn-inv" };
  return (
    <div className={`txn-item ${cls[t.type]||""}`} style={{ background:t.regret?"rgba(239,68,68,0.04)":undefined }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:500,color:typeColors[t.type]||"#fff" }}>{fmt(t.amount)}</span>
            {t.regret&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#ef4444",background:"rgba(239,68,68,0.12)",padding:"2px 7px",borderRadius:4 }}>REGRET</span>}
            {t.worth&&t.worth!=="yes"&&<span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:t.worth==="no"?"#ef4444":"#f59e0b" }}>{t.worth==="no"?"Not worth it":"Maybe"}</span>}
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.05em" }}>{t.type} · {t.category} · {t.date}</div>
          {t.note&&<div style={{ fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4 }}>{t.note}</div>}
        </div>
        <div style={{ display:"flex",gap:5,alignItems:"center",marginLeft:10,flexShrink:0 }}>
          <button onClick={()=>onRegret(t.id)} className="btn-ghost" style={{ padding:"5px 9px",fontSize:10 }}>{t.regret?"R✓":"R?"}</button>
          <button onClick={()=>onDel(t.id)} className="btn-danger" style={{ padding:"5px 9px" }}>Del</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   GLOBAL CSS
════════════════════════════════════════ */
const CSS = `
/* Fonts loaded via <link> in _document.js */

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body,#root{height:100%;}
:root{
  --bg:#0b0d14;--surface:rgba(255,255,255,0.035);--surface2:rgba(255,255,255,0.055);
  --border:rgba(255,255,255,0.08);--text:rgba(255,255,255,0.9);--muted:rgba(255,255,255,0.35);
  --accent:#6366f1;--green:#10b981;--red:#ef4444;--amber:#f59e0b;
  --sidebar:220px;--hh:60px;
}

.rf-root{font-family:'Sora',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;}
.grain{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.018;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:200px;}
.orb{position:fixed;pointer-events:none;z-index:0;border-radius:50%;filter:blur(90px);}

/* ── Header ── */
.rf-header{
  position:fixed;top:0;z-index:200;height:var(--hh);
  background:rgba(11,13,20,0.92);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  padding:0 20px;display:flex;justify-content:space-between;align-items:center;
}

/* ── Logo ── */
.logo{font-family:'Sora',sans-serif;font-weight:700;font-size:17px;color:#fff;letter-spacing:-.02em;}
.logo-accent{color:var(--accent);}
.logo-sub{font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.2);margin-top:1px;letter-spacing:.08em;}

/* ── Lock badge ── */
.lock-badge{display:inline-flex;align-items:center;gap:5px;font-family:'DM Mono',monospace;font-size:10px;
  letter-spacing:.05em;padding:4px 11px;border-radius:20px;border:1px solid;white-space:nowrap;}
.locked{border-color:rgba(239,68,68,.3);color:#ef4444;background:rgba(239,68,68,.08);}
.unlocked{border-color:rgba(16,185,129,.4);color:#10b981;background:rgba(16,185,129,.08);}

/* ══════ MOBILE (default) ══════ */
.rf-header{left:0;right:0;}
.mobile-wrap{padding-top:var(--hh);padding-bottom:72px;}
.mobile-inner{padding:16px 14px 0;position:relative;z-index:1;}

.bottom-nav{
  position:fixed;bottom:0;left:0;right:0;z-index:200;
  background:rgba(11,13,20,.96);backdrop-filter:blur(20px);
  border-top:1px solid var(--border);display:flex;
}
.bnav-btn{flex:1;padding:9px 2px 7px;display:flex;flex-direction:column;align-items:center;gap:2px;
  cursor:pointer;background:transparent;border:none;color:var(--muted);transition:color .2s;
  font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.04em;}
.bnav-icon{display:flex;align-items:center;justify-content:center;transition:transform .2s;}
.bnav-btn.bna{color:var(--accent);}
.bnav-btn.bna .bnav-icon{transform:translateY(-2px);}

/* sidebar hidden on mobile */
.rf-sidebar{display:none;}
.desktop-wrap{display:none;}

/* ══════ TABLET + DESKTOP (≥768px) ══════ */
@media(min-width:768px){
  .mobile-wrap{display:none;}
  .bottom-nav{display:none;}

  .rf-sidebar{
    display:flex;flex-direction:column;
    position:fixed;top:0;left:0;bottom:0;width:var(--sidebar);z-index:300;
    background:rgba(11,13,20,.98);backdrop-filter:blur(20px);
    border-right:1px solid var(--border);
  }
  .sb-brand{padding:22px 20px 18px;border-bottom:1px solid var(--border);}
  .sb-logo{font-family:'Sora',sans-serif;font-weight:700;font-size:18px;color:#fff;letter-spacing:-.02em;}
  .sb-sub{font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.2);margin-top:3px;letter-spacing:.08em;}
  .sb-nav{flex:1;padding:12px 10px;overflow-y:auto;}
  .sb-nav::-webkit-scrollbar{width:0;}
  .sb-btn{width:100%;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;cursor:pointer;
    background:transparent;border:none;color:var(--muted);font-family:'Sora',sans-serif;font-size:13px;font-weight:500;
    transition:all .18s;text-align:left;margin-bottom:3px;}
  .sb-btn:hover{background:var(--surface2);color:#fff;}
  .sb-btn.sba{background:rgba(99,102,241,.12);color:#fff;}
  .sb-btn.sba .sb-icon{color:var(--accent);}
  .sb-icon{display:flex;align-items:center;justify-content:center;width:22px;transition:transform .2s;}
  .sb-btn.sba .sb-icon{transform:scale(1.1);}
  .sb-footer{padding:14px 16px;border-top:1px solid var(--border);}

  .rf-header{left:var(--sidebar);right:0;}
  .desktop-wrap{display:block;margin-left:var(--sidebar);padding-top:var(--hh);}
  .desktop-inner{padding:24px 28px;max-width:1400px;}
}

/* ── Cards ── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:20px;
  margin-bottom:16px;position:relative;overflow:hidden;animation:fadeUp .32s ease;}
.card-title{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--muted);
  margin-bottom:14px;text-transform:uppercase;}

/* ── Responsive grids ── */
.g2{display:grid;grid-template-columns:1fr;gap:16px;}
.g3{display:grid;grid-template-columns:1fr;gap:16px;}
.g4{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}

@media(min-width:768px){
  .g2{grid-template-columns:1fr 1fr;}
  .g3{grid-template-columns:1fr 1fr 1fr;}
  .g4{grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px;}
  .card{padding:22px;}
}

.stat-box{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;animation:fadeUp .3s ease;}

/* ── Inputs ── */
.inp{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;
  padding:11px 14px;color:#fff;font-family:'DM Mono',monospace;font-size:13px;outline:none;
  transition:border-color .2s,box-shadow .2s;}
.inp:focus{border-color:rgba(99,102,241,.5);box-shadow:0 0 0 3px rgba(99,102,241,.1);}
.inp::placeholder{color:rgba(255,255,255,.2);}
.sel{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;
  padding:11px 14px;color:#fff;font-family:'DM Mono',monospace;font-size:12px;outline:none;cursor:pointer;}
.sel option{background:#1a1d2e;}

/* ── Buttons ── */
.btn-p{background:var(--accent);color:#fff;border:none;border-radius:12px;padding:12px 22px;cursor:pointer;
  font-family:'Sora',sans-serif;font-weight:600;font-size:13px;transition:all .2s;
  box-shadow:0 0 20px rgba(99,102,241,.3);}
.btn-p:hover{transform:translateY(-1px);box-shadow:0 4px 24px rgba(99,102,241,.45);}
.btn-p:active{transform:none;}
.btn-g{background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:12px;
  padding:11px 16px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;transition:all .2s;}
.btn-g:hover{background:rgba(255,255,255,.05);color:#fff;}
.btn-d{background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);border-radius:12px;
  padding:11px 14px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;transition:all .2s;}
.btn-d:hover{background:rgba(239,68,68,.15);}
.btn-ghost{background:transparent;color:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.1);border-radius:8px;
  padding:5px 9px;cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;transition:all .18s;}
.btn-ghost:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);}
.btn-export-json{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  background:linear-gradient(135deg,#6366f1 0%,#818cf8 100%);
  color:#fff;border:none;border-radius:16px;padding:14px 20px;cursor:pointer;
  font-family:'Sora',sans-serif;font-size:12px;font-weight:700;letter-spacing:.03em;
  box-shadow:0 4px 24px rgba(99,102,241,.45),inset 0 1px 0 rgba(255,255,255,.15);
  transition:all .25s cubic-bezier(.4,0,.2,1);white-space:nowrap;position:relative;overflow:hidden;}
.btn-export-json::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent);opacity:0;transition:opacity .2s;}
.btn-export-json:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(99,102,241,.6),inset 0 1px 0 rgba(255,255,255,.2);}
.btn-export-json:hover::before{opacity:1;}
.btn-export-json:active{transform:translateY(0);box-shadow:0 2px 12px rgba(99,102,241,.4);}
.btn-export-csv{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  background:linear-gradient(135deg,#059669 0%,#10b981 50%,#34d399 100%);
  color:#fff;border:none;border-radius:16px;padding:14px 20px;cursor:pointer;
  font-family:'Sora',sans-serif;font-size:12px;font-weight:700;letter-spacing:.03em;
  box-shadow:0 4px 24px rgba(16,185,129,.45),inset 0 1px 0 rgba(255,255,255,.15);
  transition:all .25s cubic-bezier(.4,0,.2,1);white-space:nowrap;position:relative;overflow:hidden;}
.btn-export-csv::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent);opacity:0;transition:opacity .2s;}
.btn-export-csv:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(16,185,129,.6),inset 0 1px 0 rgba(255,255,255,.2);}
.btn-export-csv:hover::before{opacity:1;}
.btn-export-csv:active{transform:translateY(0);box-shadow:0 2px 12px rgba(16,185,129,.4);}
.btn-import-file{display:flex;align-items:center;gap:12px;width:100%;
  background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(99,102,241,.04));
  border:2px dashed rgba(99,102,241,.4);border-radius:16px;padding:16px 18px;cursor:pointer;
  font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:rgba(255,255,255,.5);letter-spacing:.06em;
  transition:all .25s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;}
.btn-import-file::after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(99,102,241,.12),transparent);opacity:0;transition:opacity .2s;}
.btn-import-file:hover{border-color:rgba(99,102,241,.8);background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(99,102,241,.06));color:#a78bfa;transform:translateY(-2px);box-shadow:0 6px 24px rgba(99,102,241,.2);}
.btn-import-file:hover::after{opacity:1;}
.btn-import-file input[type=file]{display:none;}
.btn-factory-reset{
  display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
  background:rgba(239,68,68,.06);color:#ef4444;
  border:1px solid rgba(239,68,68,.3);border-radius:12px;
  padding:13px 18px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;
  letter-spacing:.06em;transition:all .22s;margin-top:8px;}
.btn-factory-reset:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.5);box-shadow:0 0 18px rgba(239,68,68,.2);}
.type-btn{flex:1;padding:9px 4px;font-family:'DM Mono',monospace;font-size:10px;border-radius:10px;cursor:pointer;
  transition:all .2s;border:1px solid var(--border);background:transparent;color:var(--muted);letter-spacing:.05em;}
.te{border-color:rgba(239,68,68,.5);color:#ef4444;background:rgba(239,68,68,.1);}
.ti{border-color:rgba(16,185,129,.5);color:#10b981;background:rgba(16,185,129,.1);}
.ts{border-color:rgba(99,102,241,.5);color:#a78bfa;background:rgba(99,102,241,.1);}
.tv{border-color:rgba(245,158,11,.5);color:#f59e0b;background:rgba(245,158,11,.1);}

/* ── Transactions ── */
.txn-item{background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:14px;
  padding:12px 14px;margin-bottom:8px;border-left:3px solid transparent;animation:fadeUp .25s ease;}
.txn-exp{border-left-color:#ef4444;}.txn-inc{border-left-color:#10b981;}
.txn-sav{border-left-color:#6366f1;}.txn-inv{border-left-color:#f59e0b;}

/* ── Misc ── */
.streak-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(245,158,11,.1);
  border:1px solid rgba(245,158,11,.25);border-radius:20px;padding:5px 12px;
  font-family:'DM Mono',monospace;font-size:11px;color:#f59e0b;}
.alert-box{border-radius:12px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:8px;font-size:13px;}
.a-warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#f59e0b;}
.a-good{background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);color:#10b981;}
.a-info{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);color:#a78bfa;}
.nospend-btn{width:100%;padding:13px;font-family:'Sora',sans-serif;font-weight:600;font-size:13px;
  border-radius:14px;cursor:pointer;transition:all .3s;border:1px solid;}
.nospend-on{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.4);color:#10b981;box-shadow:0 0 20px rgba(16,185,129,.15);}
.nospend-off{background:transparent;border-color:var(--border);color:var(--muted);}
.divider{height:1px;background:var(--border);margin:14px 0;}
.dot-pulse{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 1s infinite;}

/* ── Keyframes ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes shimmer{0%{background-position:-200%}100%{background-position:200%}}
.loading-bar{height:2px;background:linear-gradient(90deg,transparent,#6366f1,transparent);background-size:200%;animation:shimmer 1.5s infinite;}

::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}
`;

// SVG icon components — sharp, modern, consistent
const IC = {
  Home: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Add:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  Log:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Goals:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Road: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
  Stats:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Forecast:()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Settings:()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
};

const TABS = [
  { id:"Home",     Icon:IC.Home,     label:"Home"     },
  { id:"Add",      Icon:IC.Add,      label:"Add"      },
  { id:"Log",      Icon:IC.Log,      label:"Log"      },
  { id:"Goals",    Icon:IC.Goals,    label:"Goals"    },
  { id:"Road",     Icon:IC.Road,     label:"Roadmap"  },
  { id:"Stats",    Icon:IC.Stats,    label:"Stats"    },
  { id:"Forecast", Icon:IC.Forecast, label:"Forecast" },
  { id:"Settings", Icon:IC.Settings, label:"Settings" },
];

export default function App() {
  const [data, setData]       = useState(mkDefault());
  const [tab, setTab]         = useState("Home");
  const [readOnly, setReadOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [toast, setToast]     = useState(null);
  const { isMobile }          = useBreakpoint();

  const showToast = useCallback((msg, type="ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    (async () => {
      let loaded = null;
      // 1. Load localStorage immediately for instant render
      try { const l = localStorage.getItem("rijesh_finance_v3"); if (l) loaded = JSON.parse(l); } catch {}
      if (loaded) {
        setData({ ...mkDefault(), ...loaded, settings: { ...mkDefault().settings, ...(loaded.settings||{}) } });
      }
      setLoading(false);
      // 2. Then fetch cloud — cloud always overrides local (most authoritative)
      try {
        const c = await dbGet();
        if (c) {
          const merged = { ...mkDefault(), ...c, settings: { ...mkDefault().settings, ...(c.settings||{}) } };
          setData(merged);
          try { localStorage.setItem("rijesh_finance_v3", JSON.stringify(merged)); } catch {}
        }
      } catch {}
    })();
  }, []);

  // Poll cloud every 30s to pick up changes from other devices
  // Only sync if in read-only mode to avoid overwriting active edits
  const readOnlyRef = useRef(true);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!readOnlyRef.current) return; // skip if user is actively editing
      try {
        const c = await dbGet();
        if (c) {
          const merged = { ...mkDefault(), ...c, settings: { ...mkDefault().settings, ...(c.settings||{}) } };
          setData(merged);
          try { localStorage.setItem("rijesh_finance_v3", JSON.stringify(merged)); } catch {}
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const syncTimerRef = useRef(null);

  const save = useCallback((nd) => {
    // 1. Instant local update — UI never waits
    setData(nd);
    try { localStorage.setItem("rijesh_finance_v3", JSON.stringify(nd)); } catch {}
    // 2. Debounced cloud sync — fires 400ms after last change (batches rapid edits)
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setSyncing(true);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await dbSet(nd);
        setLastSynced(new Date());
      } catch {}
      setSyncing(false);
    }, 400);
  }, []);

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0b0d14",gap:20 }}>
        <div style={{ fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:24,color:"#fff",letterSpacing:"-.02em" }}>Rijesh<span style={{ color:"#6366f1" }}>.</span>Finance</div>
        <div style={{ width:180 }}><div className="loading-bar"/></div>
      </div>
    </>
  );

  const panels = { Home, Add:AddEntry, Log:History, Goals, Road:UpcomingRoadmap, Stats:Analysis, Forecast:Projection, Settings };
  const Panel = panels[tab];
  const forceSync = async () => {
    setSyncing(true);
    try { await dbSet(data); setLastSynced(new Date()); } catch {}
    setSyncing(false);
  };
  const props = { data, save, readOnly, setReadOnly, showToast, syncing, lastSynced, forceSync };

  const currentTab = TABS.find(t => t.id === tab);
  const statusLine = syncing
    ? <><span className="dot-pulse" style={{ marginRight:5 }}/>Syncing to cloud...</>
    : <><span style={{ color:"#10b981",marginRight:4 }}>●</span>Live · All devices</>;

  const headerRight = (
    <div style={{ display:"flex",alignItems:"center",gap:12 }}>
      <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.2)",textAlign:"right" }}>
        <div>{new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div>
        <div style={{ marginTop:1 }}>{statusLine}</div>
      </div>
      <span className={`lock-badge ${readOnly?"locked":"unlocked"}`}>{readOnly?"🔒 Locked":"✏ Edit"}</span>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="rf-root">
        <div className="grain"/>
        <div className="orb" style={{ width:420,height:420,background:"rgba(99,102,241,.06)",top:-160,right:-80 }}/>
        <div className="orb" style={{ width:320,height:320,background:"rgba(16,185,129,.04)",bottom:80,left:-80 }}/>

        {toast && <Toast msg={toast.msg} type={toast.type}/>}

        {/* ══ MOBILE layout ══ */}
        <div className="mobile-wrap">
          <div className="rf-header">
            <div>
              <div className="logo">Rijesh<span className="logo-accent">.</span>Finance</div>
              <div className="logo-sub">{statusLine}</div>
            </div>
            {headerRight}
          </div>
          <div className="mobile-inner" key={tab} style={{ animation:"fadeUp .28s ease" }}>
            <Panel {...props}/>
          </div>
          <div className="bottom-nav">
            {TABS.map(t => {
              const NavIcon = t.Icon;
              return (
                <button key={t.id} className={`bnav-btn${tab===t.id?" bna":""}`} onClick={()=>setTab(t.id)}>
                  <span className="bnav-icon"><NavIcon/></span>{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══ DESKTOP layout ══ */}
        <div className="rf-sidebar">
          <div className="sb-brand">
            <div className="sb-logo">Rijesh<span style={{ color:"#6366f1" }}>.</span>Finance</div>
            <div className="sb-sub">Personal Finance Tracker</div>
          </div>
          <div className="sb-nav">
            {TABS.map(t => {
              const SbIcon = t.Icon;
              return (
                <button key={t.id} className={`sb-btn${tab===t.id?" sba":""}`} onClick={()=>setTab(t.id)}>
                  <span className="sb-icon"><SbIcon/></span>{t.label}
                </button>
              );
            })}
          </div>
          <div className="sb-footer">
            <span className={`lock-badge ${readOnly?"locked":"unlocked"}`} style={{ width:"100%",justifyContent:"center" }}>
              {readOnly?"🔒 Locked":"✏ Edit Mode"}
            </span>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.15)",marginTop:10,textAlign:"center",letterSpacing:".1em" }}>
              v3.2 · BUILT FOR DISCIPLINE
            </div>
          </div>
        </div>

        <div className="desktop-wrap">
          <div className="rf-header">
            <div>
              <div className="logo" style={{ fontSize:15,display:"flex",alignItems:"center",gap:8 }}>
                {currentTab && (() => { const Hi = currentTab.Icon; return <Hi/>; })()}
                {currentTab?.label}
              </div>
              <div className="logo-sub">{statusLine}</div>
            </div>
            {headerRight}
          </div>
          <div className="desktop-inner" key={tab} style={{ animation:"fadeUp .28s ease" }}>
            <Panel {...props}/>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════
   PANELS
═══════════════════════════ */

/* ── HOME ── */
function Home({ data, save, showToast }) {
  const month=currentMonth(), todayStr=today();
  const txns=data.transactions;
  const mT=txns.filter(t=>t.date.startsWith(month));
  const tT=txns.filter(t=>t.date===todayStr);
  const totalInc=data.monthlyIncome+mT.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExp=mT.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalSaved=txns.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);   // ALL TIME savings
  const totalInv=txns.filter(t=>t.type==="investment").reduce((s,t)=>s+t.amount,0); // ALL TIME investments
  const mSaved=mT.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);         // this month savings
  const mInv=mT.filter(t=>t.type==="investment").reduce((s,t)=>s+t.amount,0);        // this month investments
  // walletBalance = user's real current bank/cash balance (set in Settings)
  // Available Balance = walletBalance minus locked money
  // Spendable Now     = walletBalance - all expenses logged - all savings logged - lockedMoney
  const walletBase  = data.walletBalance || 0;
  const allExp      = txns.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const allSav      = txns.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);
  const allInv      = txns.filter(t=>t.type==="investment").reduce((s,t)=>s+t.amount,0);
  const balance     = Math.max(0, walletBase - allExp - allSav - allInv - (data.lockedMoney||0));
  const spendable   = balance; // alias for clarity in JSX
  const todaySpend=tT.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const todaySave=tT.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);
  const score=calcScore(data);
  const streak=getStreak(data);
  const mNoSpend=data.noSpendDays.filter(d=>d.startsWith(month)).length;
  const regretAmt=mT.filter(t=>t.regret).reduce((s,t)=>s+t.amount,0);
  const weekAgo=new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const wT=txns.filter(t=>t.date>=weekAgo.toISOString().split("T")[0]);
  const wSpent=wT.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const wSaved=wT.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);

  const alerts=[];
  if(totalExp>totalInc*0.7) alerts.push({t:"warn",msg:"Spending exceeds 70% of income!"});
  if(mSaved<data.monthlyGoal*0.3&&new Date().getDate()>20) alerts.push({t:"warn",msg:"Savings below target — few days left!"});
  if(score>=75) alerts.push({t:"good",msg:"Excellent discipline! You're on track."});
  if(regretAmt>0) alerts.push({t:"info",msg:`Regret spending: ${fmt(regretAmt)}`});
  const up7=data.upcomingExpenses.filter(e=>{const d=(new Date(e.date)-new Date())/86400000;return d>=0&&d<=7;});
  if(up7.length) alerts.push({t:"warn",msg:`${up7.length} expense(s) due within 7 days!`});

  const toggleNoSpend=()=>{
    const ns=data.noSpendDays.includes(todayStr)?data.noSpendDays.filter(d=>d!==todayStr):[...data.noSpendDays,todayStr];
    save({...data,noSpendDays:ns});
    showToast(ns.includes(todayStr)?"No-spend day marked! 🎉":"No-spend day removed");
  };

  return (
    <div>
      {/* Hero: balance + score */}
      <div className="card" style={{ background:"linear-gradient(135deg,rgba(99,102,241,.12),rgba(16,185,129,.06))",borderColor:"rgba(99,102,241,.2)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div className="card-title">Available Balance</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(26px,4vw,42px)",fontWeight:500,color:"#fff",lineHeight:1.1 }}>
              Rs. <AnimCounter target={Math.max(0,Math.round(walletBase))}/>
            </div>
            {data.lockedMoney>0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#f59e0b",marginTop:6 }}>🔒 {fmt(data.lockedMoney)} locked</div>}
            <div style={{ marginTop:16 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.4)" }}>Monthly Saving Goal</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#6366f1" }}>{fmt(mSaved)} / {fmt(data.monthlyGoal)}</span>
              </div>
              <PBar value={mSaved} max={data.monthlyGoal} color="#6366f1" height={6}/>
            </div>
          </div>
          <ScoreRing score={score} size={110}/>
        </div>
      </div>

      {/* Wallet balance quick-view strip */}
      <div style={{ display:"flex",gap:10,marginBottom:14,flexWrap:"wrap" }}>
        <div style={{ flex:1,minWidth:140,background:"rgba(16,185,129,.07)",border:"1px solid rgba(16,185,129,.18)",borderRadius:16,padding:"14px 18px",display:"flex",flexDirection:"column",gap:4 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#10b981",letterSpacing:".12em" }}>WALLET / BANK</div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:600,color:"#10b981" }}>{fmt(data.walletBalance||0)}</div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.25)" }}>Set in Settings → Config</div>
        </div>
        <div style={{ flex:1,minWidth:140,background:"rgba(99,102,241,.07)",border:"1px solid rgba(99,102,241,.18)",borderRadius:16,padding:"14px 18px",display:"flex",flexDirection:"column",gap:4 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#a78bfa",letterSpacing:".12em" }}>SPENDABLE NOW</div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:600,color:"#a78bfa" }}>{fmt(spendable)}</div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.25)" }}>After expenses + savings</div>
        </div>
      </div>

      {/* 4-stat grid */}
      <div className="g4">
        {[
          {label:"Total Saved",  val:fmtK(totalSaved), color:"#6366f1"},
          {label:"Invested",     val:fmtK(totalInv),   color:"#f59e0b"},
          {label:"Month Spent",  val:fmtK(totalExp),   color:"#ef4444"},
          {label:"Month Income", val:fmtK(totalInc),   color:"#10b981"},
        ].map(s=>(
          <div key={s.label} className="stat-box">
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em",textTransform:"uppercase" }}>{s.label}</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(14px,2vw,20px)",fontWeight:500,color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* 2-col section */}
      <div className="g2">
        <div>
          <div className="card">
            <div className="card-title">Today's Activity</div>
            <div style={{ display:"flex",gap:10,marginBottom:14 }}>
              {[{label:"Spent",val:fmtK(todaySpend),color:"#ef4444",bg:"rgba(239,68,68,.08)"},{label:"Saved",val:fmtK(todaySave),color:"#6366f1",bg:"rgba(99,102,241,.08)"}].map(s=>(
                <div key={s.label} style={{ flex:1,textAlign:"center",background:s.bg,borderRadius:12,padding:"12px 8px",border:`1px solid ${s.color}25` }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:s.color,marginBottom:5,letterSpacing:".1em" }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(16px,2.5vw,22px)",fontWeight:500,color:s.color }}>{s.val}</div>
                </div>
              ))}
            </div>
            <button className={`nospend-btn ${data.noSpendDays.includes(todayStr)?"nospend-on":"nospend-off"}`} onClick={toggleNoSpend}>
              {data.noSpendDays.includes(todayStr)?"✓ No-Spend Day Active":"Mark as No-Spend Day"}
            </button>
          </div>

          <div className="card">
            <div className="card-title">Discipline Streaks</div>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              <span className="streak-pill">🔥 Streak: {streak} days</span>
              <span className="streak-pill">📅 This month: {mNoSpend} days</span>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Weekly Intel</div>
            <div style={{ display:"flex",gap:24,flexWrap:"wrap" }}>
              {[{l:"Spent",v:fmtK(wSpent),c:"#ef4444"},{l:"Saved",v:fmtK(wSaved),c:"#10b981"},{l:"Txns",v:wT.length,c:"#a78bfa"}].map(s=>(
                <div key={s.l}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>{s.l.toUpperCase()}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(16px,2vw,22px)",fontWeight:500,color:s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          {alerts.length>0&&(
            <div className="card">
              <div className="card-title">Alerts</div>
              {alerts.map((a,i)=>(
                <div key={i} className={`alert-box ${a.t==="warn"?"a-warn":a.t==="good"?"a-good":"a-info"}`}>
                  <span>{a.t==="warn"?"⚠":a.t==="good"?"✓":"ℹ"}</span><span>{a.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ADD ENTRY ── */
function AddEntry({ data, save, readOnly, showToast }) {
  const [form,setForm]=useState({amount:"",type:"expense",category:"Food",note:"",date:today(),worth:"yes",regret:false});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const typeColors={expense:"#ef4444",income:"#10b981",saving:"#6366f1",investment:"#f59e0b"};
  const color=typeColors[form.type];

  const add=()=>{
    if(readOnly){showToast("Unlock edit mode first","err");return;}
    const amount=parseFloat(form.amount);
    if(!amount||amount<=0||amount>1e9){showToast("Enter a valid amount","err");return;}
    // Sanitize free-text note — strip any HTML tags
    const safeNote=String(form.note||"").replace(/<[^>]*>/g,"").slice(0,300);
    save({...data,transactions:[{id:Date.now(),...form,amount,note:safeNote,createdAt:new Date().toISOString()},...data.transactions]});
    setForm(f=>({...f,amount:"",note:""}));
    showToast("Entry logged ✓");
  };

  return (
    <div className="g2" style={{ alignItems:"start" }}>
      <div className="card" style={{ borderColor:`${color}30` }}>
        <div className="card-title" style={{ color }}>
          New {form.type.charAt(0).toUpperCase()+form.type.slice(1)} {readOnly&&<span style={{ color:"#ef4444" }}>— Locked</span>}
        </div>
        <div style={{ textAlign:"center",marginBottom:22 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:10,letterSpacing:".1em" }}>AMOUNT (RS.)</div>
          <input type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)}
            style={{ width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${color}50`,color,fontFamily:"'DM Mono',monospace",fontSize:"clamp(36px,6vw,56px)",fontWeight:500,textAlign:"center",outline:"none",padding:"6px 0" }}/>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em" }}>TYPE</div>
          <div style={{ display:"flex",gap:6 }}>
            {[["expense","te","Expense"],["income","ti","Income"],["saving","ts","Saving"],["investment","tv","Invest"]].map(([t,cls,lbl])=>(
              <button key={t} className={`type-btn${form.type===t?" "+cls:""}`} onClick={()=>set("type",t)}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex",gap:10,marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>CATEGORY</div>
            <select className="sel" value={form.category} onChange={e=>set("category",e.target.value)}>
              {["Food","Study","Health","Tech","Entertainment","Transport","Other"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>DATE</div>
            <input type="date" className="inp" value={form.date} onChange={e=>set("date",e.target.value)} style={{ colorScheme:"dark" }}/>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>NOTE</div>
          <input type="text" className="inp" placeholder="What was this for?" value={form.note} onChange={e=>set("note",e.target.value)}/>
        </div>
        {form.type==="expense"&&(
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em" }}>WORTH IT?</div>
              <div style={{ display:"flex",gap:8 }}>
                {[["yes","#10b981","✓ Yes"],["no","#ef4444","✗ No"],["maybe","#f59e0b","? Maybe"]].map(([w,c,lbl])=>(
                  <button key={w} onClick={()=>set("worth",w)}
                    style={{ flex:1,padding:"8px 0",borderRadius:10,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:11,transition:"all .2s",border:`1px solid ${form.worth===w?c:"rgba(255,255,255,.08)"}`,color:form.worth===w?c:"rgba(255,255,255,.3)",background:form.worth===w?`${c}15`:"transparent" }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 14px",background:"rgba(239,68,68,.05)",borderRadius:12,border:"1px solid rgba(239,68,68,.15)" }}>
              <input type="checkbox" id="rgt" checked={form.regret} onChange={e=>set("regret",e.target.checked)} style={{ accentColor:"#ef4444",width:16,height:16,cursor:"pointer" }}/>
              <label htmlFor="rgt" style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"#ef4444",cursor:"pointer",letterSpacing:".05em" }}>Mark as regret spending</label>
            </div>
          </>
        )}
        <button className="btn-p" onClick={add} style={{ width:"100%" }}>Log Entry</button>
      </div>

      <div className="card" style={{ borderColor:"rgba(99,102,241,.15)",background:"rgba(99,102,241,.03)" }}>
        <div className="card-title">Quick Tips</div>
        {[
          {icon:"💡",tip:"Log every transaction — even small ones add up over time."},
          {icon:"🎯",tip:"Mark regret expenses to spot bad spending habits monthly."},
          {icon:"🔒",tip:"Lock the system after logging to prevent accidental edits."},
          {icon:"📅",tip:"No-spend days build your streak and savings discipline."},
          {icon:"📊",tip:"Check Stats monthly to see where your money actually goes."},
        ].map((t,i)=>(
          <div key={i} style={{ display:"flex",gap:12,padding:"10px 0",borderBottom:i<4?"1px solid rgba(255,255,255,.04)":"none" }}>
            <span style={{ fontSize:18,flexShrink:0 }}>{t.icon}</span>
            <span style={{ fontFamily:"'Sora',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.5 }}>{t.tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── HISTORY ── */
function History({ data, save, readOnly, showToast }) {
  const [filter,setFilter]=useState({type:"all",category:"all",date:""});
  const typeColors={expense:"#ef4444",income:"#10b981",saving:"#6366f1",investment:"#f59e0b"};
  const filtered=data.transactions.filter(t=>{
    if(filter.type!=="all"&&t.type!==filter.type)return false;
    if(filter.category!=="all"&&t.category!==filter.category)return false;
    if(filter.date&&!t.date.startsWith(filter.date))return false;
    return true;
  });
  const del=(id)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    if(!window.confirm("Delete this entry?"))return;
    save({...data,transactions:data.transactions.filter(t=>t.id!==id)});
    showToast("Deleted");
  };
  const toggleRegret=(id)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    save({...data,transactions:data.transactions.map(t=>t.id===id?{...t,regret:!t.regret}:t)});
  };
  const mRegret=data.transactions.filter(t=>t.regret&&t.date.startsWith(currentMonth())).reduce((s,t)=>s+t.amount,0);
  const half=Math.ceil(filtered.length/2);

  return (
    <div>
      {mRegret>0&&<div className="card" style={{ borderColor:"rgba(239,68,68,.25)",background:"rgba(239,68,68,.04)",marginBottom:14 }}>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:13,color:"#ef4444" }}>📉 Regret this month: <strong>{fmt(mRegret)}</strong></div>
      </div>}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-title">Filters</div>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
          <select className="sel" style={{ flex:"1 1 130px" }} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}>
            <option value="all">All Types</option>
            {["expense","income","saving","investment"].map(t=><option key={t}>{t}</option>)}
          </select>
          <select className="sel" style={{ flex:"1 1 130px" }} value={filter.category} onChange={e=>setFilter(f=>({...f,category:e.target.value}))}>
            <option value="all">All Categories</option>
            {["Food","Study","Health","Tech","Entertainment","Transport","Other"].map(c=><option key={c}>{c}</option>)}
          </select>
          <input type="month" className="inp" style={{ flex:"1 1 130px",colorScheme:"dark" }} value={filter.date} onChange={e=>setFilter(f=>({...f,date:e.target.value}))}/>
        </div>
      </div>
      {filtered.length===0&&<div style={{ textAlign:"center",padding:40,fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.2)" }}>No entries found</div>}
      <div className="g2" style={{ alignItems:"start" }}>
        <div>{filtered.slice(0,half).map(t=><TxnItem key={t.id} t={t} typeColors={typeColors} onDel={del} onRegret={toggleRegret}/>)}</div>
        <div>{filtered.slice(half).map(t=><TxnItem key={t.id} t={t} typeColors={typeColors} onDel={del} onRegret={toggleRegret}/>)}</div>
      </div>
    </div>
  );
}

/* ── GOALS ── */
function Goals({ data, save, readOnly, showToast }) {
  const [newGoal,setNewGoal]=useState({name:"",target:"",color:"#6366f1",icon:"🎯",deadline:""});

  const contribute=(id,amount)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    const amt=parseFloat(amount);
    if(!amt||amt<=0){showToast("Enter valid amount","err");return;}
    save({...data,goals:data.goals.map(g=>g.id===id?{...g,saved:g.saved+amt}:g)});
    showToast("Saved to goal ✓");
  };
  const delGoal=(id)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    if(!window.confirm("Delete this goal?"))return;
    save({...data,goals:data.goals.filter(g=>g.id!==id)});
    showToast("Goal deleted");
  };
  const addGoal=()=>{
    if(readOnly){showToast("Unlock first","err");return;}
    if(!newGoal.name||!newGoal.target){showToast("Fill name and target","err");return;}
    save({...data,goals:[...data.goals,{id:Date.now().toString(),name:newGoal.name,target:parseFloat(newGoal.target),saved:0,color:newGoal.color,icon:newGoal.icon,deadline:newGoal.deadline}]});
    setNewGoal({name:"",target:"",color:"#6366f1",icon:"🎯",deadline:""});
    showToast("Goal created ✓");
  };
  const totalGoals=data.goals.reduce((s,g)=>s+g.target,0);
  const totalSavedGoals=data.goals.reduce((s,g)=>s+g.saved,0);

  return (
    <div>
      <div className="card" style={{ background:"linear-gradient(135deg,rgba(99,102,241,.1),rgba(16,185,129,.05))",borderColor:"rgba(99,102,241,.2)",marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
          <div>
            <div className="card-title">Total Goal Progress</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(20px,3vw,30px)",color:"#6366f1" }}>{fmtK(totalSavedGoals)}</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:4 }}>of {fmtK(totalGoals)}</div>
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(28px,5vw,48px)",fontWeight:500,color:"#10b981" }}>
            {Math.round(totalGoals>0?(totalSavedGoals/totalGoals)*100:0)}%
          </div>
        </div>
        <PBar value={totalSavedGoals} max={totalGoals} color="#6366f1" height={8}/>
      </div>
      <div className="g2" style={{ alignItems:"start" }}>
        <div>
          {data.goals.filter((_,i)=>i%2===0).map(g=>(
            <GoalCard key={g.id} g={g} readOnly={readOnly} onContribute={contribute} onDelete={delGoal}/>
          ))}
        </div>
        <div>
          {data.goals.filter((_,i)=>i%2===1).map(g=>(
            <GoalCard key={g.id} g={g} readOnly={readOnly} onContribute={contribute} onDelete={delGoal}/>
          ))}
          <div className="card" style={{ borderColor:"rgba(99,102,241,.2)" }}>
            <div className="card-title">Create New Goal</div>
            <input className="inp" placeholder="Goal name" value={newGoal.name} onChange={e=>setNewGoal(g=>({...g,name:e.target.value}))} style={{ marginBottom:10 }}/>
            <input type="number" className="inp" placeholder="Target amount (Rs.)" value={newGoal.target} onChange={e=>setNewGoal(g=>({...g,target:e.target.value}))} style={{ marginBottom:10 }}/>
            <div style={{ display:"flex",gap:8,marginBottom:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>DEADLINE</div>
                <input type="date" className="inp" value={newGoal.deadline} onChange={e=>setNewGoal(g=>({...g,deadline:e.target.value}))} style={{ colorScheme:"dark" }}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".1em" }}>ICON</div>
                <select className="sel" value={newGoal.icon} onChange={e=>setNewGoal(g=>({...g,icon:e.target.value}))}>
                  {["🎯","🎓","💻","🛡️","✈️","📱","🏥","📚","🏠","💎","🚗","🎮"].map(i=><option key={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em" }}>COLOR</div>
              <div style={{ display:"flex",gap:10 }}>
                {["#6366f1","#10b981","#f59e0b","#ef4444","#ec4899","#a78bfa"].map(c=>(
                  <div key={c} onClick={()=>setNewGoal(g=>({...g,color:c}))}
                    style={{ width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:newGoal.color===c?"3px solid #fff":"3px solid transparent",transition:"all .2s",boxShadow:newGoal.color===c?`0 0 10px ${c}`:"none" }}/>
                ))}
              </div>
            </div>
            <button className="btn-p" onClick={addGoal} style={{ width:"100%" }}>Create Goal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ROADMAP ── */
function UpcomingRoadmap({ data, save, readOnly, showToast }) {
  const [form,setForm]=useState({name:"",amount:"",date:""});
  const add=()=>{
    if(readOnly){showToast("Unlock first","err");return;}
    if(!form.name||!form.amount||!form.date){showToast("Fill all fields","err");return;}
    save({...data,upcomingExpenses:[...data.upcomingExpenses,{id:Date.now(),name:form.name,amount:parseFloat(form.amount),date:form.date}].sort((a,b)=>a.date>b.date?1:-1)});
    setForm({name:"",amount:"",date:""});
    showToast("Planned ✓");
  };
  const del=(id)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    save({...data,upcomingExpenses:data.upcomingExpenses.filter(e=>e.id!==id)});
    showToast("Removed");
  };
  const total=data.upcomingExpenses.reduce((s,e)=>s+e.amount,0);

  return (
    <div>
      <div className="card" style={{ background:"linear-gradient(135deg,rgba(245,158,11,.1),rgba(239,68,68,.05))",borderColor:"rgba(245,158,11,.2)" }}>
        <div className="card-title">Expense Roadmap</div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(22px,4vw,36px)",color:"#f59e0b" }}>{fmt(total)}</div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginTop:4 }}>{data.upcomingExpenses.length} upcoming expenses</div>
      </div>
      <div className="g2" style={{ alignItems:"start" }}>
        <div className="card">
          <div className="card-title">Timeline</div>
          <RoadMap expenses={data.upcomingExpenses} onDelete={del}/>
        </div>
        <div className="card" style={{ borderColor:"rgba(245,158,11,.2)" }}>
          <div className="card-title">Plan New Expense</div>
          <input className="inp" placeholder="Name (e.g. Phone Repair)" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{ marginBottom:10 }}/>
          <input type="number" className="inp" placeholder="Amount (Rs.)" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{ marginBottom:10 }}/>
          <input type="date" className="inp" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ marginBottom:14,colorScheme:"dark" }}/>
          <button className="btn-p" onClick={add} style={{ width:"100%",background:"#f59e0b",boxShadow:"0 0 20px rgba(245,158,11,.3)" }}>Add to Roadmap</button>
        </div>
      </div>
    </div>
  );
}

/* ── ANALYSIS ── */
function Analysis({ data }) {
  const [month,setMonth]=useState(currentMonth());
  const txns=data.transactions.filter(t=>t.date.startsWith(month)&&t.type==="expense");
  const total=txns.reduce((s,t)=>s+t.amount,0);
  const cats={};
  txns.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount;});
  const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const regret=txns.filter(t=>t.regret).reduce((s,t)=>s+t.amount,0);
  const worthNo=txns.filter(t=>t.worth==="no").reduce((s,t)=>s+t.amount,0);
  const days={};
  txns.forEach(t=>{days[t.date]=(days[t.date]||0)+t.amount;});
  const daysSorted=Object.entries(days).sort((a,b)=>a[0]>b[0]?1:-1);
  const maxDay=Math.max(...daysSorted.map(([,v])=>v),1);
  const COLORS=["#6366f1","#10b981","#f59e0b","#ef4444","#ec4899","#a78bfa","#38bdf8"];

  return (
    <div>
      <div className="card">
        <div className="card-title">Select Period</div>
        <input type="month" className="inp" value={month} onChange={e=>setMonth(e.target.value)} style={{ colorScheme:"dark",maxWidth:220 }}/>
      </div>
      <div className="g4">
        {[{l:"Total Spent",v:fmtK(total),c:"#6366f1"},{l:"Regret",v:fmtK(regret),c:"#ef4444"},{l:"Not Worth It",v:fmtK(worthNo),c:"#f59e0b"},{l:"Transactions",v:txns.length,c:"#10b981"}].map((s,i)=>(
          <div key={i} className="stat-box">
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em",textTransform:"uppercase" }}>{s.l}</div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:"clamp(14px,2vw,20px)",fontWeight:500,color:s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="g2" style={{ alignItems:"start" }}>
        <div className="card">
          <div className="card-title">Category Breakdown</div>
          {sorted.length===0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.2)",textAlign:"center",padding:20 }}>No data for this period</div>}
          {sorted.map(([cat,amt],i)=>(
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:COLORS[i%COLORS.length] }}>{cat}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:COLORS[i%COLORS.length] }}>{fmt(amt)} ({total>0?Math.round(amt/total*100):0}%)</span>
              </div>
              <PBar value={amt} max={total} color={COLORS[i%COLORS.length]} height={6}/>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Daily Spending</div>
          {daysSorted.length===0&&<div style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"rgba(255,255,255,.2)",textAlign:"center",padding:20 }}>No data</div>}
          {daysSorted.map(([d,amt])=>(
            <div key={d} style={{ marginBottom:10 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.35)" }}>{d}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#6366f1" }}>{fmt(amt)}</span>
              </div>
              <PBar value={amt} max={maxDay} color="#6366f1" height={18}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── PROJECTION ── */
function Projection({ data }) {
  return (
    <div>
      <div className="card">
        <div className="card-title">18-Month Savings Forecast</div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.25)",marginBottom:16,letterSpacing:".05em" }}>Based on your current saving behaviour</div>
        <ProjectionChart data={data}/>
      </div>
    </div>
  );
}

/* ── SETTINGS ── */
function Settings({ data, save, readOnly, setReadOnly, showToast, syncing, lastSynced, forceSync }) {
  const [key,setKey]=useState("");
  const [wallet,setWallet]=useState(String(data.walletBalance||0));
  const [income,setIncome]=useState(String(data.monthlyIncome));
  const [goal,setGoal]=useState(String(data.monthlyGoal));
  const [locked,setLocked]=useState(String(data.lockedMoney));
  // Keep input fields in sync when cloud data loads/updates
  useEffect(() => { setWallet(String(data.walletBalance||0)); }, [data.walletBalance]);
  useEffect(() => { setIncome(String(data.monthlyIncome)); }, [data.monthlyIncome]);
  useEffect(() => { setGoal(String(data.monthlyGoal)); }, [data.monthlyGoal]);
  useEffect(() => { setLocked(String(data.lockedMoney)); }, [data.lockedMoney]);
  const [unlockAttempts, setUnlockAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  const unlock=()=>{
    const now=Date.now();
    if(now<lockoutUntil){
      const secs=Math.ceil((lockoutUntil-now)/1000);
      showToast(`Too many attempts — wait ${secs}s`,"err");
      return;
    }
    // Constant-time-ish comparison by comparing lengths first then XOR-style char check
    const expected=data.settings?.writeKey||WRITE_KEY;
    let match=key.length===expected.length;
    let diff=0;
    for(let i=0;i<Math.max(key.length,expected.length);i++){
      diff|=(key.charCodeAt(i)||0)^(expected.charCodeAt(i)||0);
    }
    if(match&&diff===0){
      setReadOnly(false);
      setUnlockAttempts(0);
      showToast("Edit mode unlocked ✓");
    } else {
      const attempts=unlockAttempts+1;
      setUnlockAttempts(attempts);
      if(attempts>=5){setLockoutUntil(Date.now()+30000);setUnlockAttempts(0);showToast("5 failed attempts — locked 30s","err");}
      else{showToast(`Wrong key — ${5-attempts} attempt(s) left`,"err");}
    }
    setKey("");
  };
  const lock=()=>{setReadOnly(true);showToast("System locked");};
  const saveSettings=()=>{
    if(readOnly){showToast("Unlock first","err");return;}
    save({
      ...data,
      walletBalance:Math.max(0,Math.min(1e9,parseFloat(wallet)||0)),
      monthlyIncome:Math.max(0,Math.min(1e9,parseFloat(income)||20000)),
      monthlyGoal:Math.max(0,Math.min(1e9,parseFloat(goal)||8000)),
      lockedMoney:Math.max(0,Math.min(1e9,parseFloat(locked)||0)),
      settings:{
        ...data.settings,
      },
    });
    showToast("Settings saved ✓");
  };
  const exportJSON=()=>{
    // Export FULL data — every field including goals, upcomingExpenses, settings, balances
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "3.2",
      walletBalance: data.walletBalance || 0,
      monthlyIncome: data.monthlyIncome || 0,
      monthlyGoal: data.monthlyGoal || 0,
      lockedMoney: data.lockedMoney || 0,
      transactions: data.transactions || [],
      goals: data.goals || [],
      upcomingExpenses: data.upcomingExpenses || [],
      noSpendDays: data.noSpendDays || [],
      // Note: settings/writeKey not exported for security
    };
    const blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`rijesh_finance_${today()}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast("Full data exported ✓");
  };
  const exportCSV=()=>{
    const esc=(v)=>`"${String(v||"").replace(/"/g,'""')}"`;
    const lines=[];
    // Section 1: Config
    lines.push("=== CONFIG ===");
    lines.push("Field,Value");
    lines.push(`Wallet Balance,${data.walletBalance||0}`);
    lines.push(`Monthly Income,${data.monthlyIncome||0}`);
    lines.push(`Monthly Goal,${data.monthlyGoal||0}`);
    lines.push(`Locked Money,${data.lockedMoney||0}`);
    lines.push("");
    // Section 2: Transactions
    lines.push("=== TRANSACTIONS ===");
    lines.push("ID,Date,Type,Category,Amount,Note,Worth,Regret,CreatedAt");
    data.transactions.forEach(t=>lines.push([t.id,t.date,t.type,t.category,t.amount,esc(t.note||""),t.worth||"",t.regret?"yes":"no",t.createdAt||""].join(",")));
    lines.push("");
    // Section 3: Goals
    lines.push("=== GOALS ===");
    lines.push("ID,Name,Target,Saved,Color,Icon,Deadline");
    data.goals.forEach(g=>lines.push([g.id,esc(g.name),g.target,g.saved,g.color,g.icon,g.deadline||""].join(",")));
    lines.push("");
    // Section 4: Upcoming expenses
    lines.push("=== UPCOMING EXPENSES ===");
    lines.push("ID,Name,Amount,Date");
    data.upcomingExpenses.forEach(e=>lines.push([e.id,esc(e.name),e.amount,e.date].join(",")));
    lines.push("");
    // Section 5: No-spend days
    lines.push("=== NO-SPEND DAYS ===");
    data.noSpendDays.forEach(d=>lines.push(d));
    const blob=new Blob([lines.join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`rijesh_finance_${today()}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast("Full CSV exported ✓");
  };
  const factoryReset=async()=>{
    if(readOnly){showToast("Unlock first","err");return;}
    if(!window.confirm("⚠️  FACTORY RESET: This will permanently delete ALL your data from local storage AND the cloud database. This cannot be undone.\n\nAre you absolutely sure?"))return;
    if(!window.confirm("Second confirmation: type OK in your mind and press OK to wipe everything."))return;
    // Full factory reset: zeros out every field, clears DB, clears localStorage
    const fresh = mkDefault();
    const resetData = {
      ...fresh,
      // Explicitly zero out all money fields
      walletBalance: 0,
      monthlyIncome: 0,
      monthlyGoal: 0,
      lockedMoney: 0,
      transactions: [],
      goals: [],
      upcomingExpenses: [],
      noSpendDays: [],
      settings: fresh.settings, // reset to default write key too
    };
    // 1. Clear localStorage first
    try { localStorage.removeItem("rijesh_finance_v3"); } catch {}
    // 2. Wipe cloud DB record
    await dbDelete();
    // 3. Write fresh zeros to cloud DB (ensures it's not just deleted but set to clean state)
    try { await dbSet(resetData); } catch {}
    // 4. Update localStorage with fresh zeros
    try { localStorage.setItem("rijesh_finance_v3", JSON.stringify(resetData)); } catch {}
    // 5. Update UI state
    setReadOnly(true); // re-lock after reset
    save(resetData);
    showToast("Factory reset complete — everything zeroed ✓");
  };
  const importJSON=(e)=>{
    if(readOnly){showToast("Unlock first","err");return;}
    const file=e.target.files[0];if(!file)return;
    // Enforce 5 MB limit to prevent DoS via huge file
    if(file.size>5*1024*1024){showToast("File too large (max 5 MB)","err");e.target.value="";return;}
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const parsed=JSON.parse(ev.target.result);
        // Structural validation
        if(typeof parsed!=="object"||Array.isArray(parsed)||parsed===null) throw new Error("bad shape");
        if(!Array.isArray(parsed.transactions)) throw new Error("missing transactions");
        // Sanitize: strip unknown keys and coerce types to prevent prototype pollution / XSS
        const clean = {
          ...mkDefault(),
          transactions: (parsed.transactions||[]).slice(0,5000).map(t=>({
            id: Number(t.id)||Date.now(),
            amount: Math.abs(parseFloat(t.amount)||0),
            type: ["expense","income","saving","investment"].includes(t.type)?t.type:"expense",
            category: String(t.category||"Other").slice(0,50),
            note: String(t.note||"").slice(0,300),
            date: /^\d{4}-\d{2}-\d{2}$/.test(t.date)?t.date:today(),
            worth: ["yes","no","maybe"].includes(t.worth)?t.worth:"yes",
            regret: Boolean(t.regret),
            createdAt: String(t.createdAt||new Date().toISOString()).slice(0,30),
          })),
          goals: (parsed.goals||[]).slice(0,50).map(g=>({
            id: String(g.id||Date.now()),
            name: String(g.name||"Goal").slice(0,100),
            target: Math.abs(parseFloat(g.target)||0),
            saved: Math.abs(parseFloat(g.saved)||0),
            color: /^#[0-9a-fA-F]{6}$/.test(g.color)?g.color:"#6366f1",
            icon: String(g.icon||"🎯").slice(0,8),
            deadline: /^\d{4}-\d{2}-\d{2}$/.test(g.deadline)?g.deadline:"",
          })),
          upcomingExpenses: (parsed.upcomingExpenses||[]).slice(0,200).map(e=>({
            id: Number(e.id)||Date.now(),
            name: String(e.name||"").slice(0,100),
            amount: Math.abs(parseFloat(e.amount)||0),
            date: /^\d{4}-\d{2}-\d{2}$/.test(e.date)?e.date:today(),
          })),
          walletBalance: Math.abs(parseFloat(parsed.walletBalance)||0),
          monthlyIncome: Math.abs(parseFloat(parsed.monthlyIncome)||20000),
          monthlyGoal: Math.abs(parseFloat(parsed.monthlyGoal)||8000),
          lockedMoney: Math.abs(parseFloat(parsed.lockedMoney)||0),
          noSpendDays: (parsed.noSpendDays||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0,3650),
          // Never import settings — prevents write key hijack
          settings: data.settings,
        };
        if(!window.confirm("Replace ALL data with the imported file?"))return;
        save(clean);showToast("Data imported ✓");
      }catch{showToast("Invalid or corrupt file","err");}
      e.target.value=""; // reset so same file can be re-imported
    };
    reader.readAsText(file);
  };

  const score=calcScore(data),month=currentMonth();
  const mT=data.transactions.filter(t=>t.date.startsWith(month));
  const mInc=data.monthlyIncome+mT.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const mExp=mT.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const mSav=mT.filter(t=>t.type==="saving").reduce((s,t)=>s+t.amount,0);

  return (
    <div>
      <div className="g2" style={{ alignItems:"start" }}>
        <div>
          <div className="card" style={{ borderColor:readOnly?"rgba(239,68,68,.25)":"rgba(16,185,129,.25)" }}>
            <div className="card-title" style={{ color:readOnly?"#ef4444":"#10b981" }}>
              {readOnly?"🔒 Database Locked":"✏ Edit Mode Active"}
            </div>
            {readOnly?(
              <div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:8,letterSpacing:".1em" }}>ENTER WRITE KEY TO UNLOCK DB</div>
                <div style={{ display:"flex",gap:8 }}>
                  <input type="password" className="inp" placeholder="Write key..." value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==="Enter"&&unlock()} style={{ flex:1 }}/>
                  <button className="btn-p" onClick={unlock}>Unlock</button>
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.2)",marginTop:12,lineHeight:1.7 }}>
                  All database writes require the write key. Read-only viewing is always available.
                </div>
              </div>
            ):(
              <button className="btn-d" onClick={lock} style={{ width:"100%",padding:12,fontSize:13 }}>🔒 Lock System</button>
            )}
          </div>

          <div className="card">
            <div className="card-title">Monthly Report — {month}</div>
            {[{l:"Income",v:fmt(mInc),c:"#10b981"},{l:"Expenses",v:fmt(mExp),c:"#ef4444"},{l:"Saved",v:fmt(mSav),c:"#6366f1"},{l:"Score",v:`${score}/100`,c:score>=70?"#10b981":score>=40?"#f59e0b":"#ef4444"}].map(s=>(
              <div key={s.l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"rgba(255,255,255,.025)",borderRadius:10,marginBottom:6 }}>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(255,255,255,.4)",letterSpacing:".05em" }}>{s.l}</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:500,color:s.c }}>{s.v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Data Management</div>
            <div style={{ display:"flex",gap:12,marginBottom:16 }}>
              <button className="btn-export-json" onClick={exportJSON} style={{ flex:1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export JSON
              </button>
              <button className="btn-export-csv" onClick={exportCSV} style={{ flex:1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            </div>
            <label className="btn-import-file" style={{ opacity:readOnly?0.45:1,pointerEvents:readOnly?"none":"auto" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {readOnly ? "IMPORT JSON — UNLOCK FIRST" : "IMPORT JSON — CLICK TO CHOOSE FILE"}
              <input type="file" accept=".json" onChange={importJSON} disabled={readOnly} style={{ display:"none" }}/>
            </label>
            {!readOnly&&(
              <div style={{ marginTop:20,paddingTop:16,borderTop:"1px solid rgba(239,68,68,.12)" }}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(239,68,68,.5)",marginBottom:8,letterSpacing:".1em" }}>DANGER ZONE</div>
                <button className="btn-factory-reset" onClick={factoryReset}>
                  <span>💥</span> FACTORY RESET — Wipe All Data
                </button>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.15)",marginTop:8,lineHeight:1.6 }}>
                  Permanently deletes all transactions, goals, and cloud data. Requires write key unlock. Cannot be undone.
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {!readOnly&&(
            <div className="card">
              <div className="card-title">Financial Config</div>
              {[{l:"Current Wallet / Bank Balance (Rs.)",v:wallet,s:setWallet},{l:"Monthly Income (Rs.)",v:income,s:setIncome},{l:"Monthly Saving Goal (Rs.)",v:goal,s:setGoal},{l:"Locked Money (Rs.)",v:locked,s:setLocked}].map(f=>(
                <div key={f.l} style={{ marginBottom:12 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:6,letterSpacing:".08em" }}>{f.l.toUpperCase()}</div>
                  <input type="number" className="inp" value={f.v} onChange={e=>f.s(e.target.value)}/>
                </div>
              ))}
              <div className="divider"/>
              <div style={{ marginBottom:10,padding:"12px 14px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.15)",borderRadius:12 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"#10b981",letterSpacing:".08em" }}>
                    {syncing ? "⟳ SYNCING..." : "☁ CLOUD SYNCED"}
                  </div>
                  <button onClick={forceSync} disabled={syncing}
                    style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#10b981",background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.3)",borderRadius:8,padding:"3px 10px",cursor:"pointer",opacity:syncing?0.5:1 }}>
                    Sync Now
                  </button>
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.25)",lineHeight:1.7 }}>
                  {lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : "Auto-syncs on every change · reads from cloud every 30s"}
                </div>
              </div>
              <button className="btn-p" onClick={saveSettings} style={{ width:"100%" }}>Save Configuration</button>
            </div>
          )}

          <div className="card" style={{ borderColor:"rgba(99,102,241,.15)",background:"rgba(99,102,241,.03)" }}>
            <div className="card-title">About</div>
            <div style={{ fontFamily:"'Sora',sans-serif",fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.8 }}>
              <p style={{ marginBottom:10 }}>Rijesh Finance is your personal finance tracker built for discipline and consistency.</p>
              <p style={{ marginBottom:10 }}>Unlock with your write key to edit income targets, configure the database, or change any settings.</p>
              <p>All data is stored locally and synced to Upstash Redis (configured via Vercel) for cloud backup across devices.</p>
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(255,255,255,.15)",marginTop:20,letterSpacing:".15em" }}>
              RIJESH.FINANCE · v3.2 · BUILT FOR DISCIPLINE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
