'use strict';
// Rijesh Finance v4 — Plain HTML/CSS/JS + Vercel KV (no localStorage, no React)

document.addEventListener('DOMContentLoaded', () => {

// ── STATE ──────────────────────────────────────────────────────────────────
let DATA      = null;
let WRITE_KEY = '';
let READ_ONLY = true;
let GOAL_COLOR = '#6366f1';

// ── HELPERS ────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const el  = id => document.getElementById(id);
const setText = (id,v) => { const e=el(id); if(e) e.textContent=v; };
const show = id => { const e=el(id); if(e) e.classList.remove('hidden'); };
const hide = id => { const e=el(id); if(e) e.classList.add('hidden'); };
const todayStr  = () => new Date().toISOString().slice(0,10);
const monthStr  = () => todayStr().slice(0,7);
const fmtRs  = n => `Rs. ${Math.round(n||0).toLocaleString('en-IN')}`;
const fmtRsK = n => n>=1000 ? `Rs. ${(n/1000).toFixed(1)}K` : fmtRs(n);
const clamp  = (n,a,b) => Math.max(a,Math.min(b,n));

// ── API ────────────────────────────────────────────────────────────────────
const API = {
  async _call(path, opts={}) {
    const ctrl  = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 15000);
    try {
      const res  = await fetch(path,{ headers:{'Content-Type':'application/json'}, signal:ctrl.signal, ...opts });
      clearTimeout(timer);
      const json = await res.json();
      return { status:res.status, ...json };
    } catch(e) {
      clearTimeout(timer);
      if(e.name==='AbortError') throw new Error('Request timed out');
      throw e;
    }
  },
  load:   ()    => API._call('/api/load',   { cache:'no-store' }),
  verify: (key) => API._call('/api/verify', { method:'POST', body:JSON.stringify({_writeKey:key}) }),
  save:   (d)   => API._call('/api/save',   { method:'POST', body:JSON.stringify({...d,_writeKey:WRITE_KEY}) }),
  reset:  ()    => API._call('/api/reset',  { method:'POST', body:JSON.stringify({_writeKey:WRITE_KEY}) }),
};

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, isErr=false) {
  const t = el('toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className   = 'toast active' + (isErr?' err':'');
  toastTimer    = setTimeout(()=>t.classList.remove('active'),3000);
}

// ── SYNC STATUS ────────────────────────────────────────────────────────────
function setSyncState(state) {
  const dot = el('syncDot'), lbl = el('syncLabel');
  if(dot){ dot.className = 'sync-dot'+(state!=='synced'?` ${state}`:''); }
  if(lbl){ lbl.textContent = {syncing:'Saving…',error:'Error',offline:'Offline'}[state]??'Synced'; }
}

// ── PERSIST ────────────────────────────────────────────────────────────────
let saveTimer;
async function persist() {
  setSyncState('syncing');
  try {
    const res = await API.save(DATA);
    if(!res.ok) throw new Error(res.error||'Save failed');
    DATA = res.data;
    renderAll();
    setSyncState('synced');
    const st = el('lastSynced');
    if(st) st.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
  } catch(e) {
    setSyncState('error');
    toast('⚠ '+e.message, true);
    throw e;
  }
}

// debounced save
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

// ── MODAL ──────────────────────────────────────────────────────────────────
let modalResolve;
function confirm(title, msg) {
  setText('modalTitle', title);
  setText('modalMsg', msg);
  el('modal').classList.add('open');
  return new Promise(res => { modalResolve = res; });
}
el('modalConfirm').addEventListener('click', ()=>{ el('modal').classList.remove('open'); if(modalResolve){modalResolve(true); modalResolve=null;} });
el('modalCancel').addEventListener('click',  ()=>{ el('modal').classList.remove('open'); if(modalResolve){modalResolve(false);modalResolve=null;} });
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ el('modal').classList.remove('open'); if(modalResolve){modalResolve(false);modalResolve=null;} } });

// ── NAV ─────────────────────────────────────────────────────────────────────
const sidebar  = el('sidebar');
const overlay  = el('sidebarOverlay');
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const target = btn.dataset.section;
    if(!target) return;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active');
    const sec=el(target); if(sec) sec.classList.add('active');
    if(window.innerWidth<=768){ sidebar.classList.remove('open'); overlay.classList.remove('active'); }
    if(target==='stats') renderStats();
    if(target==='settings') renderSettingsReport();
  });
});
el('hamburger').addEventListener('click',()=>{ sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
overlay.addEventListener('click',()=>{ sidebar.classList.remove('open'); overlay.classList.remove('active'); });

// ── DATE ────────────────────────────────────────────────────────────────────
el('addDate').value = todayStr();
const now = new Date();
setText('todayDate', now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}));
el('statMonth').value = monthStr();
el('reportMonth').textContent = monthStr();

// ── SCORE ──────────────────────────────────────────────────────────────────
function calcScore(d) {
  const month = monthStr();
  const mT  = d.transactions.filter(t=>t.date.startsWith(month));
  const incT = mT.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const inc  = d.monthlyIncome + incT;
  const exp  = mT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const sav  = mT.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);
  const regrets  = mT.filter(t=>t.regret).length;
  const noSpend  = d.noSpendDays.filter(dd=>dd.startsWith(month)).length;
  let score = 40;
  if(inc>0){
    score += Math.min(30, (sav/inc)*120);
    score -= Math.min(25, (exp/inc)*50);
  }
  score += Math.min(15, noSpend*3);
  score -= Math.min(20, regrets*4);
  if(sav>=d.monthlyGoal) score+=15;
  if(sav===0&&exp>0) score-=15;
  return clamp(Math.round(score),0,100);
}

function getStreak(d) {
  const s=[...d.noSpendDays].sort().reverse();
  if(!s.length) return 0;
  let streak=0, check=new Date();
  for(const day of s){
    const diff=Math.round((check-new Date(day))/86400000);
    if(diff<=1){streak++; check=new Date(day);}else break;
  }
  return streak;
}

function updateScoreRing(score) {
  const arc = el('scoreArc');
  const circ = 2*Math.PI*46; // r=46
  arc.setAttribute('stroke-dasharray', circ);
  arc.setAttribute('stroke-dashoffset', circ-(score/100)*circ);
  const color = score>=75?'#10b981':score>=50?'#f59e0b':'#ef4444';
  arc.setAttribute('stroke', color);
  const numEl=el('scoreNum'), lblEl=el('scoreLabel');
  if(numEl){ numEl.textContent=score; numEl.style.color=color; }
  if(lblEl){ lblEl.textContent=score>=80?'ELITE':score>=60?'SOLID':score>=40?'FAIR':'GRIND'; }
}

// ── RENDER ALL ─────────────────────────────────────────────────────────────
function renderAll() {
  if(!DATA) return;
  renderHome();
  renderLog();
  renderGoals();
  renderRoadmap();
  renderStats();
  renderSettingsReport();
}

// ── HOME ───────────────────────────────────────────────────────────────────
function renderHome() {
  const d = DATA;
  const month = monthStr(), today = todayStr();
  const txns = d.transactions;
  const mT   = txns.filter(t=>t.date.startsWith(month));
  const tT   = txns.filter(t=>t.date===today);

  const monthIncTxn = mT.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalInc    = d.monthlyIncome + monthIncTxn;
  const totalExp    = mT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const mSaved      = mT.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);

  const allExp = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const allSav = txns.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);
  const allInv = txns.filter(t=>t.type==='investment').reduce((s,t)=>s+t.amount,0);
  const spendable = Math.max(0, d.walletBalance - allExp - allSav - allInv - (d.lockedMoney||0));

  const totalSaved = txns.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);
  const totalInv   = txns.filter(t=>t.type==='investment').reduce((s,t)=>s+t.amount,0);

  const todaySpent = tT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const todaySav   = tT.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const wStr    = weekAgo.toISOString().slice(0,10);
  const wT      = txns.filter(t=>t.date>=wStr);
  const wSpent  = wT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const wSaved  = wT.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);

  const score  = calcScore(d);
  const streak = getStreak(d);
  const mNoSp  = d.noSpendDays.filter(dd=>dd.startsWith(month)).length;
  const regretAmt = mT.filter(t=>t.regret).reduce((s,t)=>s+t.amount,0);

  // Hero
  setText('heroBalance', fmtRs(d.walletBalance));
  if(d.lockedMoney>0){
    show('lockedBadge');
    setText('lockedAmt', fmtRs(d.lockedMoney));
  } else hide('lockedBadge');

  const goalPct = d.monthlyGoal>0 ? clamp((mSaved/d.monthlyGoal)*100,0,100) : 0;
  setText('goalProgress', `${fmtRs(mSaved)} / ${fmtRs(d.monthlyGoal)}`);
  const goalBar=el('goalBar'); if(goalBar) goalBar.style.width=goalPct+'%';

  updateScoreRing(score);

  // Strip
  setText('walletVal',   fmtRs(d.walletBalance));
  setText('spendableVal',fmtRs(spendable));

  // 4 stats
  setText('statTotalSaved',  fmtRsK(totalSaved));
  setText('statInvested',    fmtRsK(totalInv));
  setText('statMonthSpent',  fmtRsK(totalExp));
  setText('statMonthIncome', fmtRsK(totalInc));

  // Today
  setText('todaySpent', fmtRsK(todaySpent));
  setText('todaySaved', fmtRsK(todaySav));

  const nsBtnEl = el('noSpendBtn');
  if(nsBtnEl){
    const isNS = d.noSpendDays.includes(todayStr());
    nsBtnEl.textContent = isNS ? '✓ No-Spend Day Active' : 'Mark as No-Spend Day';
    nsBtnEl.className   = 'nospend-btn'+(isNS?' active':'');
  }

  setText('streakCount',  streak);
  setText('monthNoSpend', mNoSp);

  // Intel
  setText('weekSpent', fmtRsK(wSpent));
  setText('weekSaved',  fmtRsK(wSaved));
  setText('weekTxns',   wT.length);

  // Alerts
  const alerts=[];
  if(totalExp>totalInc*0.7)   alerts.push({t:'warn',msg:'Spending exceeds 70% of income!'});
  if(mSaved<d.monthlyGoal*0.3&&new Date().getDate()>20) alerts.push({t:'warn',msg:'Savings below target — few days left!'});
  if(score>=75)               alerts.push({t:'good',msg:'Excellent discipline! You\'re on track.'});
  if(regretAmt>0)             alerts.push({t:'info',msg:`Regret spending: ${fmtRs(regretAmt)}`});
  const up7=d.upcomingExpenses.filter(e=>{const dd=(new Date(e.date)-new Date())/86400000;return dd>=0&&dd<=7;});
  if(up7.length)              alerts.push({t:'warn',msg:`${up7.length} expense(s) due within 7 days!`});

  const alertsList=el('alertsList');
  const alertsCard=el('alertsCard');
  if(alertsList&&alertsCard){
    if(!alerts.length){ alertsCard.classList.add('hidden'); }
    else {
      alertsCard.classList.remove('hidden');
      alertsList.innerHTML = alerts.map(a=>`<div class="alert-item alert-${a.t}">${a.t==='warn'?'⚠':a.t==='good'?'✓':'ℹ'} ${esc(a.msg)}</div>`).join('');
    }
  }
}

// ── ADD ENTRY ──────────────────────────────────────────────────────────────
let addType='expense', addWorth='yes';

document.querySelectorAll('.type-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    addType=btn.dataset.type;
    document.querySelectorAll('.type-tab').forEach(b=>b.classList.remove('active','te','ti','ts','tv'));
    const cls={expense:'te',income:'ti',saving:'ts',investment:'tv'};
    btn.classList.add('active', cls[addType]||'');
    const lbl=el('addLabel'); if(lbl) lbl.textContent='NEW '+addType.toUpperCase();
    const ws=el('worthSection'); if(ws) ws.style.display=addType==='expense'?'':'none';
    // Change amount color
    const ai=el('addAmount');
    if(ai){ const c={expense:'#ef4444',income:'#10b981',saving:'#a78bfa',investment:'#f59e0b'}; ai.style.color=c[addType]||'#6366f1'; }
  });
});

document.querySelectorAll('.worth-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    addWorth=btn.dataset.worth;
    document.querySelectorAll('.worth-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});

el('addEntryBtn').addEventListener('click', async()=>{
  if(READ_ONLY){ toast('Unlock edit mode first',true); return; }
  const amount=parseFloat(el('addAmount').value);
  if(!isFinite(amount)||amount<=0||amount>1e9){ toast('Enter a valid amount',true); return; }
  const safeNote=String(el('addNote').value||'').replace(/<[^>]*>/g,'').slice(0,300);
  const txn={
    id:Date.now(), amount, type:addType,
    category:el('addCategory').value, note:safeNote,
    date:el('addDate').value||todayStr(),
    worth:addType==='expense'?addWorth:'yes',
    regret:addType==='expense'&&el('addRegret').checked,
    createdAt:new Date().toISOString(),
  };
  const prev=JSON.parse(JSON.stringify(DATA));
  DATA.transactions.unshift(txn);
  try {
    await persist();
    el('addAmount').value=''; el('addNote').value=''; el('addRegret').checked=false;
    toast('Entry logged ✓');
  } catch { DATA=prev; renderAll(); }
});

// ── LOG ────────────────────────────────────────────────────────────────────
function renderLog() {
  const typeF  = el('filterType').value;
  const catF   = el('filterCat').value;
  const monthF = el('filterMonth').value;
  const typeColors={expense:'var(--red)',income:'var(--green)',saving:'#a78bfa',investment:'var(--amber)'};
  const typeCls={expense:'exp',income:'inc',saving:'sav',investment:'inv'};

  const filtered=DATA.transactions.filter(t=>{
    if(typeF!=='all'&&t.type!==typeF) return false;
    if(catF!=='all'&&t.category!==catF) return false;
    if(monthF&&!t.date.startsWith(monthF)) return false;
    return true;
  });

  const mRegret=DATA.transactions.filter(t=>t.regret&&t.date.startsWith(monthStr())).reduce((s,t)=>s+t.amount,0);
  const rb=el('logRegretBar');
  if(rb){
    if(mRegret>0){ rb.classList.remove('hidden'); rb.textContent='📉 Regret this month: '+fmtRs(mRegret); }
    else rb.classList.add('hidden');
  }

  const list=el('txnList');
  if(!list) return;
  if(!filtered.length){ list.innerHTML='<div class="empty-msg" style="grid-column:1/-1">No entries found</div>'; return; }

  list.innerHTML=filtered.map(t=>{
    const c=typeColors[t.type]||'#fff';
    return `<div class="txn-item ${typeCls[t.type]||''}">
      <div class="txn-top">
        <div style="flex:1">
          <span class="txn-amount" style="color:${c}">${fmtRs(t.amount)}</span>${t.regret?'<span class="txn-badge">REGRET</span>':''}
          <div class="txn-meta">${esc(t.type)} · ${esc(t.category)} · ${esc(t.date)}</div>
          ${t.note?`<div class="txn-note">${esc(t.note)}</div>`:''}
        </div>
        <div class="txn-btns">
          <button class="btn-mini" data-regret="${t.id}">${t.regret?'R✓':'R?'}</button>
          <button class="btn-mini del" data-del="${t.id}">Del</button>
        </div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(READ_ONLY){toast('Unlock first',true);return;}
      const id=parseInt(btn.dataset.del);
      const prev=JSON.parse(JSON.stringify(DATA));
      DATA.transactions=DATA.transactions.filter(t=>t.id!==id);
      try{await persist();toast('Deleted');}catch{DATA=prev;renderAll();}
    });
  });
  list.querySelectorAll('[data-regret]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(READ_ONLY){toast('Unlock first',true);return;}
      const id=parseInt(btn.dataset.regret);
      const prev=JSON.parse(JSON.stringify(DATA));
      DATA.transactions=DATA.transactions.map(t=>t.id===id?{...t,regret:!t.regret}:t);
      try{await persist();}catch{DATA=prev;renderAll();}
    });
  });
}

['filterType','filterCat','filterMonth'].forEach(id=>el(id).addEventListener('change',renderLog));

// ── GOALS ──────────────────────────────────────────────────────────────────
function renderGoals() {
  const d=DATA, goals=d.goals||[];
  const totalTarget=goals.reduce((s,g)=>s+g.target,0);
  const totalSaved =goals.reduce((s,g)=>s+g.saved,0);
  const pct=totalTarget>0?clamp((totalSaved/totalTarget)*100,0,100):0;
  setText('goalsTotalSaved', fmtRsK(totalSaved));
  setText('goalsTotalOf',    `of ${fmtRsK(totalTarget)}`);
  setText('goalsTotalPct',   Math.round(pct)+'%');

  const left=el('goalsListLeft'), right=el('goalsListRight');
  if(!left||!right) return;
  left.innerHTML=''; right.innerHTML='';

  goals.forEach((g,i)=>{
    const gPct=g.target>0?clamp((g.saved/g.target)*100,0,100):0;
    const rem=Math.max(0,g.target-g.saved);
    const daysLeft=g.deadline?Math.ceil((new Date(g.deadline)-new Date())/86400000):null;
    const div=document.createElement('div');
    div.className='goal-card';
    div.style.borderColor=g.color+'30';
    div.innerHTML=`
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${esc(g.color)},transparent)"></div>
      <div class="goal-card-top">
        <div>
          <div style="font-size:24px;margin-bottom:4px">${esc(g.icon)}</div>
          <div style="font-weight:700;font-size:15px">${esc(g.name)}</div>
          ${daysLeft!==null?`<div style="font-family:var(--font-mono);font-size:10px;color:${daysLeft<30?'var(--amber)':'var(--muted)'};margin-top:3px">${daysLeft>0?daysLeft+' days left':'Deadline passed'}</div>`:''}
        </div>
        <div style="text-align:right">
          <div class="goal-pct" style="color:${esc(g.color)}">${Math.round(gPct)}%</div>
          <div class="goal-sub">${fmtRsK(g.saved)} / ${fmtRsK(g.target)}</div>
        </div>
      </div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${gPct}%;background:${esc(g.color)}"></div></div>
      <div class="goal-milestones">
        ${[25,50,75,100].map(m=>{const r=gPct>=m;return`<div class="goal-ms"><div class="goal-ms-dot" style="background:${r?esc(g.color):'rgba(255,255,255,.1)'};box-shadow:${r?`0 0 6px ${esc(g.color)}`:none}"></div><div class="goal-ms-lbl">${m}%</div></div>`;}).join('')}
      </div>
      <div class="goal-actions">
        <input type="number" class="goal-inp" placeholder="Add (${fmtRsK(rem)} left)" min="0" step="any" data-gid="${esc(g.id)}"/>
        <button class="goal-add-btn" style="background:${esc(g.color)}" data-gadd="${esc(g.id)}">+ Add</button>
        <button class="goal-del-btn" data-gdel="${esc(g.id)}">Del</button>
      </div>`;
    (i%2===0?left:right).appendChild(div);
  });

  // Wire goal buttons
  document.querySelectorAll('[data-gadd]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(READ_ONLY){toast('Unlock first',true);return;}
      const gid=btn.dataset.gadd;
      const inp=document.querySelector(`[data-gid="${gid}"]`);
      const amt=parseFloat(inp?.value);
      if(!isFinite(amt)||amt<=0){toast('Enter valid amount',true);return;}
      const prev=JSON.parse(JSON.stringify(DATA));
      DATA.goals=DATA.goals.map(g=>g.id===gid?{...g,saved:g.saved+amt}:g);
      try{await persist();if(inp)inp.value='';toast('Saved to goal ✓');}catch{DATA=prev;renderAll();}
    });
  });
  document.querySelectorAll('[data-gdel]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(READ_ONLY){toast('Unlock first',true);return;}
      if(!await confirm('Delete Goal','Delete this goal permanently?')) return;
      const gid=btn.dataset.gdel;
      const prev=JSON.parse(JSON.stringify(DATA));
      DATA.goals=DATA.goals.filter(g=>g.id!==gid);
      try{await persist();toast('Goal deleted');}catch{DATA=prev;renderAll();}
    });
  });
}

// Color swatches
document.querySelectorAll('#colorSwatches .swatch').forEach(sw=>{
  sw.addEventListener('click',()=>{
    GOAL_COLOR=sw.dataset.color;
    document.querySelectorAll('#colorSwatches .swatch').forEach(s=>s.classList.remove('active'));
    sw.classList.add('active');
  });
});

el('addGoalBtn').addEventListener('click',async()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  const name=el('goalName').value.trim();
  const target=parseFloat(el('goalTarget').value);
  if(!name){toast('Enter goal name',true);return;}
  if(!isFinite(target)||target<=0){toast('Enter valid target',true);return;}
  const newGoal={
    id:Date.now().toString(),name,target,saved:0,
    color:GOAL_COLOR, icon:el('goalIcon').value,
    deadline:el('goalDeadline').value||'',
  };
  const prev=JSON.parse(JSON.stringify(DATA));
  DATA.goals.push(newGoal);
  try{
    await persist();
    el('goalName').value=''; el('goalTarget').value=''; el('goalDeadline').value='';
    toast('Goal created ✓');
  }catch{DATA=prev;renderAll();}
});

// ── ROADMAP ────────────────────────────────────────────────────────────────
function renderRoadmap() {
  const d=DATA;
  const total=d.upcomingExpenses.reduce((s,e)=>s+e.amount,0);
  setText('roadmapTotal', fmtRs(total));
  setText('roadmapCount', d.upcomingExpenses.length+' upcoming expenses');

  const list=el('roadmapList');
  if(!list) return;
  const sorted=[...d.upcomingExpenses].sort((a,b)=>a.date>b.date?1:-1);
  if(!sorted.length){list.innerHTML='<div class="road-empty">No upcoming expenses planned</div>';return;}

  const today=todayStr();
  list.innerHTML='<div class="road-timeline"><div class="road-line"></div>'+
    sorted.map((e,i)=>{
      const days=Math.ceil((new Date(e.date)-new Date(today))/86400000);
      const overdue=days<0, urgent=days<=3&&!overdue;
      const color=overdue?'var(--red)':urgent?'var(--amber)':'#6366f1';
      const daysLbl=overdue?'OVERDUE':days===0?'TODAY':days+'d';
      return `<div class="road-item">
        <div class="road-dot" style="background:${color}">${overdue?'!':i+1}</div>
        <div class="road-card" style="background:${color}0d;border:1px solid ${color}25">
          <div>
            <div class="road-name">${esc(e.name)}</div>
            <div class="road-meta">${esc(e.date)} · ${fmtRsK(e.amount)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="road-days" style="color:${color}">${daysLbl}</span>
            <button class="road-del" data-rdel="${e.id}">✕</button>
          </div>
        </div>
      </div>`;
    }).join('')+'</div>';

  list.querySelectorAll('[data-rdel]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(READ_ONLY){toast('Unlock first',true);return;}
      const id=parseInt(btn.dataset.rdel);
      const prev=JSON.parse(JSON.stringify(DATA));
      DATA.upcomingExpenses=DATA.upcomingExpenses.filter(e=>e.id!==id);
      try{await persist();toast('Removed');}catch{DATA=prev;renderAll();}
    });
  });
}

el('addRoadBtn').addEventListener('click',async()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  const name=el('roadName').value.trim();
  const amount=parseFloat(el('roadAmount').value);
  const date=el('roadDate').value;
  if(!name||!isFinite(amount)||amount<=0||!date){toast('Fill all fields',true);return;}
  const prev=JSON.parse(JSON.stringify(DATA));
  DATA.upcomingExpenses.push({id:Date.now(),name,amount,date});
  DATA.upcomingExpenses.sort((a,b)=>a.date>b.date?1:-1);
  try{
    await persist();
    el('roadName').value=''; el('roadAmount').value=''; el('roadDate').value='';
    toast('Planned ✓');
  }catch{DATA=prev;renderAll();}
});

// ── STATS ──────────────────────────────────────────────────────────────────
function renderStats() {
  if(!DATA) return;
  const month=el('statMonth').value||monthStr();
  const txns=DATA.transactions.filter(t=>t.date.startsWith(month)&&t.type==='expense');
  const total=txns.reduce((s,t)=>s+t.amount,0);
  const regret=txns.filter(t=>t.regret).reduce((s,t)=>s+t.amount,0);
  const notWorth=txns.filter(t=>t.worth==='no').reduce((s,t)=>s+t.amount,0);
  setText('stTotalSpent',total?fmtRs(total):'Rs. 0');
  setText('stRegret',    regret?fmtRs(regret):'Rs. 0');
  setText('stNotWorth',  notWorth?fmtRs(notWorth):'Rs. 0');
  setText('stTxnCount',  txns.length);

  const COLORS=['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#a78bfa','#38bdf8'];
  const cats={};
  txns.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount;});
  const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const catEl=el('statsCats');
  if(catEl){
    catEl.innerHTML=sorted.length?sorted.map(([cat,amt],i)=>{
      const pct=total>0?clamp((amt/total)*100,0,100):0;
      const c=COLORS[i%COLORS.length];
      return `<div class="stat-cat-item">
        <div class="stat-cat-hdr"><span style="color:${c}">${esc(cat)}</span><span style="color:${c}">${fmtRs(amt)} (${Math.round(pct)}%)</span></div>
        <div class="pbar-track"><div class="pbar-fill" style="width:${pct}%;background:${c}"></div></div>
      </div>`;
    }).join(''):'<div class="empty-msg">No data for this period</div>';
  }

  const days={};
  txns.forEach(t=>{days[t.date]=(days[t.date]||0)+t.amount;});
  const dSorted=Object.entries(days).sort((a,b)=>a[0]>b[0]?1:-1);
  const maxDay=Math.max(...dSorted.map(([,v])=>v),1);
  const dayEl=el('statsDaily');
  if(dayEl){
    dayEl.innerHTML=dSorted.length?dSorted.map(([date,amt])=>{
      const pct=clamp((amt/maxDay)*100,0,100);
      return `<div class="stat-daily-item">
        <div class="stat-daily-hdr"><span class="stat-daily-date">${esc(date)}</span><span class="stat-daily-amt">${fmtRs(amt)}</span></div>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:#6366f1"></div></div>
      </div>`;
    }).join(''):'<div class="empty-msg">No data</div>';
  }
}
el('statMonth').addEventListener('change', renderStats);

// ── SETTINGS ───────────────────────────────────────────────────────────────
function renderSettingsReport() {
  if(!DATA) return;
  const month=monthStr();
  const mT=DATA.transactions.filter(t=>t.date.startsWith(month));
  const mInc=DATA.monthlyIncome+mT.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const mExp=mT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const mSav=mT.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);
  const score=calcScore(DATA);
  setText('rIncome',  fmtRs(mInc));
  setText('rExpenses',fmtRs(mExp));
  setText('rSaved',   fmtRs(mSav));
  setText('rScore',   score+'/100');
  const sc=el('rScore'); if(sc) sc.style.color=score>=70?'var(--green)':score>=40?'var(--amber)':'var(--red)';
  setText('reportMonth', month);

  // Sync config inputs with current data
  const cfgW=el('cfgWallet'), cfgI=el('cfgIncome'), cfgG=el('cfgGoal'), cfgL=el('cfgLocked');
  if(cfgW&&document.activeElement!==cfgW) cfgW.value=DATA.walletBalance||0;
  if(cfgI&&document.activeElement!==cfgI) cfgI.value=DATA.monthlyIncome||0;
  if(cfgG&&document.activeElement!==cfgG) cfgG.value=DATA.monthlyGoal||0;
  if(cfgL&&document.activeElement!==cfgL) cfgL.value=DATA.lockedMoney||0;
}

// ── UNLOCK / LOCK ──────────────────────────────────────────────────────────
function updateAuthUI() {
  const authStatus=el('authStatus'), lockBadge=el('lockBadge'), sbLock=el('sbLockBadge');
  const unlockArea=el('unlockArea'), lockBtn=el('lockBtn'), dangerZone=el('dangerZone');
  const configCard=el('configCard'), importLabel=el('importLabel');

  const cls=READ_ONLY?'locked':'unlocked';
  const txt=READ_ONLY?'🔒 Locked':'✏ Edit';
  [authStatus,lockBadge,sbLock].forEach(e=>{ if(e){e.className='lock-badge '+cls;e.textContent=READ_ONLY?'🔒 Locked':'✏ Edit Mode';} });
  if(authStatus) authStatus.textContent=READ_ONLY?'🔒 Locked':'✏ Edit Mode Active';

  if(unlockArea) unlockArea.style.display=READ_ONLY?'block':'none';
  if(lockBtn)    { lockBtn.classList.toggle('hidden',READ_ONLY); }
  if(dangerZone) { dangerZone.classList.toggle('hidden',READ_ONLY); }
  if(importLabel){ importLabel.classList.toggle('disabled',READ_ONLY); }

  // Disable write buttons
  ['addEntryBtn','addGoalBtn','addRoadBtn','saveConfigBtn','noSpendBtn'].forEach(id=>{
    const b=el(id); if(b){ b.disabled=READ_ONLY; b.title=READ_ONLY?'Unlock in Settings to edit':''; }
  });
}

el('unlockBtn').addEventListener('click', async()=>{
  const key=el('keyInput').value.trim();
  const errEl=el('keyError');
  if(!key){ toast('Enter your write key first',true); return; }
  if(key.length>256){ toast('Key too long',true); return; }
  el('unlockBtn').disabled=true; el('unlockBtn').textContent='Verifying…';
  if(errEl) errEl.classList.add('hidden');
  try {
    const res=await API.verify(key);
    if(res.ok){
      WRITE_KEY=key; READ_ONLY=false;
      el('keyInput').value='';
      updateAuthUI();
      toast('✓ Edit mode unlocked!');
    } else {
      const msg=res.error||'Incorrect key. Try again.';
      if(errEl){ errEl.textContent=msg; errEl.classList.remove('hidden'); }
      el('keyInput').value=''; el('keyInput').focus();
    }
  } catch(e){ if(errEl){ errEl.textContent='Network error: '+e.message; errEl.classList.remove('hidden'); } }
  finally{ el('unlockBtn').disabled=false; el('unlockBtn').textContent='Unlock'; }
});
el('keyInput').addEventListener('keydown',e=>{ if(e.key==='Enter') el('unlockBtn').click(); });

el('lockBtn').addEventListener('click',()=>{
  WRITE_KEY=''; READ_ONLY=true;
  updateAuthUI();
  toast('Locked — read-only mode');
});

// ── CONFIG SAVE ────────────────────────────────────────────────────────────
el('saveConfigBtn').addEventListener('click',async()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  const prev=JSON.parse(JSON.stringify(DATA));
  DATA.walletBalance=Math.max(0,Math.min(1e9,parseFloat(el('cfgWallet').value)||0));
  DATA.monthlyIncome=Math.max(0,Math.min(1e9,parseFloat(el('cfgIncome').value)||0));
  DATA.monthlyGoal  =Math.max(0,Math.min(1e9,parseFloat(el('cfgGoal').value)  ||0));
  DATA.lockedMoney  =Math.max(0,Math.min(1e9,parseFloat(el('cfgLocked').value) ||0));
  try{await persist();toast('Configuration saved ✓');}catch{DATA=prev;renderAll();}
});

// ── NO SPEND ───────────────────────────────────────────────────────────────
el('noSpendBtn').addEventListener('click',async()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  const today=todayStr();
  const prev=JSON.parse(JSON.stringify(DATA));
  const isNS=DATA.noSpendDays.includes(today);
  DATA.noSpendDays=isNS?DATA.noSpendDays.filter(d=>d!==today):[...DATA.noSpendDays,today];
  try{await persist();toast(DATA.noSpendDays.includes(today)?'No-spend day marked! 🎉':'No-spend day removed');}
  catch{DATA=prev;renderAll();}
});

// ── FORCE SYNC ─────────────────────────────────────────────────────────────
el('forceSyncBtn').addEventListener('click',async()=>{
  setSyncState('syncing');
  try{
    const res=await API.load();
    if(!res.ok) throw new Error(res.error);
    DATA=res.data; renderAll();
    setSyncState('synced');
    toast('Synced from cloud ✓');
  }catch(e){ setSyncState('error'); toast('Sync failed: '+e.message,true); }
});

// ── FACTORY RESET ──────────────────────────────────────────────────────────
el('resetBtn').addEventListener('click',async()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  if(!await confirm('Factory Reset','Permanently delete ALL data and restore zeros. This CANNOT be undone.')) return;
  if(!await confirm('Second Confirmation','Are you absolutely sure? All transactions, goals, and settings will be wiped.')) return;
  setSyncState('syncing');
  try{
    const res=await API.reset();
    if(!res.ok) throw new Error(res.error);
    DATA=res.data;   // server returns fresh zeros
    READ_ONLY=true; WRITE_KEY='';
    updateAuthUI();
    renderAll();
    setSyncState('synced');
    toast('Factory reset complete — everything zeroed ✓');
  }catch(e){ setSyncState('error'); toast('Reset failed: '+e.message,true); }
});

// ── EXPORT JSON ────────────────────────────────────────────────────────────
el('exportJsonBtn').addEventListener('click',()=>{
  if(!DATA){ toast('No data to export',true); return; }
  const payload={
    exportedAt:new Date().toISOString(), version:'4.0',
    walletBalance:DATA.walletBalance, monthlyIncome:DATA.monthlyIncome,
    monthlyGoal:DATA.monthlyGoal, lockedMoney:DATA.lockedMoney,
    transactions:DATA.transactions, goals:DATA.goals,
    upcomingExpenses:DATA.upcomingExpenses, noSpendDays:DATA.noSpendDays,
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`rijesh-finance-${todayStr()}.json`; a.rel='noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('JSON exported ✓');
});

// ── EXPORT CSV ─────────────────────────────────────────────────────────────
el('exportCsvBtn').addEventListener('click',()=>{
  if(!DATA){ toast('No data to export',true); return; }
  const q=v=>`"${String(v||'').replace(/"/g,'""')}"`;
  const lines=[];
  lines.push('=== CONFIG ===');
  lines.push('Field,Value');
  lines.push(`Wallet Balance,${DATA.walletBalance}`);
  lines.push(`Monthly Income,${DATA.monthlyIncome}`);
  lines.push(`Monthly Goal,${DATA.monthlyGoal}`);
  lines.push(`Locked Money,${DATA.lockedMoney}`);
  lines.push('');
  lines.push('=== TRANSACTIONS ===');
  lines.push('ID,Date,Type,Category,Amount,Note,Worth,Regret,CreatedAt');
  DATA.transactions.forEach(t=>lines.push([t.id,t.date,t.type,t.category,t.amount,q(t.note),t.worth,t.regret?'yes':'no',t.createdAt||''].join(',')));
  lines.push('');
  lines.push('=== GOALS ===');
  lines.push('ID,Name,Target,Saved,Color,Icon,Deadline');
  DATA.goals.forEach(g=>lines.push([g.id,q(g.name),g.target,g.saved,g.color,g.icon,g.deadline||''].join(',')));
  lines.push('');
  lines.push('=== UPCOMING EXPENSES ===');
  lines.push('ID,Name,Amount,Date');
  DATA.upcomingExpenses.forEach(e=>lines.push([e.id,q(e.name),e.amount,e.date].join(',')));
  lines.push('');
  lines.push('=== NO-SPEND DAYS ===');
  DATA.noSpendDays.forEach(d=>lines.push(d));

  const blob=new Blob([lines.join('\n')],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`rijesh-finance-${todayStr()}.csv`; a.rel='noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Full CSV exported ✓');
});

// ── IMPORT JSON ────────────────────────────────────────────────────────────
const importFileInput=el('importFileInput');
el('importLabel').addEventListener('click',()=>{
  if(READ_ONLY){toast('Unlock first',true);return;}
  importFileInput.click();
});
importFileInput.addEventListener('change',async e=>{
  const file=e.target.files[0]; e.target.value='';
  if(!file) return;
  if(READ_ONLY){toast('Unlock first',true);return;}
  if(file.size>5*1024*1024){toast('File too large (max 5 MB)',true);return;}
  let parsed;
  try{
    const text=await file.text();
    const raw=JSON.parse(text);
    parsed=raw?.data??raw; // support both old and new format
  }catch{toast('Invalid JSON file',true);return;}
  if(!parsed||!Array.isArray(parsed.transactions)){toast('File format not recognized',true);return;}
  if(!await confirm('Import Backup','Replace ALL current data with the imported file? Cannot be undone.')) return;
  const VDATE=/^\d{4}-\d{2}-\d{2}$/;
  const clean={
    walletBalance: Math.max(0,Math.min(1e9,parseFloat(parsed.walletBalance)||0)),
    monthlyIncome: Math.max(0,Math.min(1e9,parseFloat(parsed.monthlyIncome)||0)),
    monthlyGoal:   Math.max(0,Math.min(1e9,parseFloat(parsed.monthlyGoal)  ||0)),
    lockedMoney:   Math.max(0,Math.min(1e9,parseFloat(parsed.lockedMoney)  ||0)),
    transactions:  (parsed.transactions||[]).slice(0,5000).map(t=>({
      id:Number(t.id)||Date.now(), amount:Math.abs(parseFloat(t.amount)||0),
      type:['expense','income','saving','investment'].includes(t.type)?t.type:'expense',
      category:['Food','Study','Health','Tech','Entertainment','Transport','Other'].includes(t.category)?t.category:'Other',
      note:String(t.note||'').slice(0,300), date:VDATE.test(t.date)?t.date:todayStr(),
      worth:['yes','no','maybe'].includes(t.worth)?t.worth:'yes', regret:Boolean(t.regret),
      createdAt:String(t.createdAt||new Date().toISOString()).slice(0,30),
    })),
    goals:(parsed.goals||[]).slice(0,50).map(g=>({
      id:String(g.id||Date.now()).slice(0,40), name:String(g.name||'Goal').slice(0,100),
      target:Math.abs(parseFloat(g.target)||0), saved:Math.abs(parseFloat(g.saved)||0),
      color:/^#[0-9a-fA-F]{6}$/.test(g.color)?g.color:'#6366f1',
      icon:String(g.icon||'🎯').slice(0,8), deadline:VDATE.test(g.deadline)?g.deadline:'',
    })),
    upcomingExpenses:(parsed.upcomingExpenses||[]).slice(0,200).map(e=>({
      id:Number(e.id)||Date.now(), name:String(e.name||'').slice(0,100),
      amount:Math.abs(parseFloat(e.amount)||0), date:VDATE.test(e.date)?e.date:todayStr(),
    })),
    noSpendDays:(parsed.noSpendDays||[]).filter(d=>VDATE.test(d)).slice(0,3650),
  };
  const prev=JSON.parse(JSON.stringify(DATA));
  DATA=clean;
  try{await persist();toast('Data imported ✓');}catch{DATA=prev;renderAll();toast('Import failed',true);}
});

// ── BOOT ───────────────────────────────────────────────────────────────────
(async()=>{
  updateAuthUI();
  const loadingScreen=el('loadingScreen'), appContent=el('appContent');
  try{
    const res=await API.load();
    if(!res.ok) throw new Error(res.error||'Load failed');
    DATA=res.data;
    // Ensure all arrays exist
    if(!Array.isArray(DATA.transactions))     DATA.transactions=[];
    if(!Array.isArray(DATA.goals))            DATA.goals=[];
    if(!Array.isArray(DATA.upcomingExpenses)) DATA.upcomingExpenses=[];
    if(!Array.isArray(DATA.noSpendDays))      DATA.noSpendDays=[];
    setSyncState('synced');
  }catch(e){
    console.warn('Load failed:',e.message);
    DATA={walletBalance:0,monthlyIncome:0,monthlyGoal:0,lockedMoney:0,transactions:[],goals:[],upcomingExpenses:[],noSpendDays:[]};
    setSyncState('offline');
    toast('Could not load from cloud — offline mode',true);
  }
  if(loadingScreen) loadingScreen.style.display='none';
  if(appContent)    appContent.classList.remove('hidden');
  renderAll();
})();

}); // end DOMContentLoaded
