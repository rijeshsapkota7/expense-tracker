// api/_lib.js — shared helpers for Rijesh Finance v4
import { kv } from '@vercel/kv';

export { kv };

export const DATA_KEY = 'rijesh:finance:v4';

export function defaultData() {
  return {
    walletBalance:    0,
    monthlyIncome:    0,
    monthlyGoal:      0,
    lockedMoney:      0,
    transactions:     [],
    goals:            [],
    upcomingExpenses: [],
    noSpendDays:      [],
  };
}

export function checkWriteKey(key) {
  const serverKey = process.env.WRITE_KEY;
  if (!serverKey) throw new Error('WRITE_KEY not set in environment.');
  if (!key || typeof key !== 'string') return false;
  if (key.length !== serverKey.length) return false;
  let mismatch = 0;
  for (let i = 0; i < serverKey.length; i++) {
    mismatch |= key.charCodeAt(i) ^ serverKey.charCodeAt(i);
  }
  return mismatch === 0;
}

export function validateData(d) {
  if (!d || typeof d !== 'object')        return false;
  if (!Array.isArray(d.transactions))     return false;
  if (!Array.isArray(d.goals))            return false;
  if (!Array.isArray(d.upcomingExpenses)) return false;
  if (!Array.isArray(d.noSpendDays))      return false;
  return true;
}

export function sanitiseData(raw) {
  const VALID_TYPES  = ['expense','income','saving','investment'];
  const VALID_CATS   = ['Food','Study','Health','Tech','Entertainment','Transport','Other'];
  const VALID_WORTH  = ['yes','no','maybe'];
  const VALID_COLOR  = /^#[0-9a-fA-F]{6}$/;
  const VALID_DATE   = /^\d{4}-\d{2}-\d{2}$/;
  const today        = () => new Date().toISOString().slice(0,10);

  return {
    walletBalance: Math.max(0, Math.min(1e9, Number(raw.walletBalance)||0)),
    monthlyIncome: Math.max(0, Math.min(1e9, Number(raw.monthlyIncome)||0)),
    monthlyGoal:   Math.max(0, Math.min(1e9, Number(raw.monthlyGoal)  ||0)),
    lockedMoney:   Math.max(0, Math.min(1e9, Number(raw.lockedMoney)  ||0)),
    transactions: (raw.transactions||[]).slice(0,5000).map(t=>({
      id:        Number(t.id)||Date.now(),
      amount:    Math.max(0,Math.min(1e9,Number(t.amount)||0)),
      type:      VALID_TYPES.includes(t.type)?t.type:'expense',
      category:  VALID_CATS.includes(t.category)?t.category:'Other',
      note:      String(t.note||'').slice(0,300),
      date:      VALID_DATE.test(t.date)?t.date:today(),
      worth:     VALID_WORTH.includes(t.worth)?t.worth:'yes',
      regret:    Boolean(t.regret),
      createdAt: String(t.createdAt||new Date().toISOString()).slice(0,30),
    })),
    goals: (raw.goals||[]).slice(0,50).map(g=>({
      id:       String(g.id||Date.now()).slice(0,40),
      name:     String(g.name||'Goal').slice(0,100),
      target:   Math.max(0,Math.min(1e9,Number(g.target)||0)),
      saved:    Math.max(0,Math.min(1e9,Number(g.saved) ||0)),
      color:    VALID_COLOR.test(g.color)?g.color:'#6366f1',
      icon:     String(g.icon||'🎯').slice(0,8),
      deadline: VALID_DATE.test(g.deadline)?g.deadline:'',
    })),
    upcomingExpenses: (raw.upcomingExpenses||[]).slice(0,200).map(e=>({
      id:     Number(e.id)||Date.now(),
      name:   String(e.name||'').slice(0,100),
      amount: Math.max(0,Math.min(1e9,Number(e.amount)||0)),
      date:   VALID_DATE.test(e.date)?e.date:today(),
    })),
    noSpendDays: (raw.noSpendDays||[]).filter(d=>VALID_DATE.test(d)).slice(0,3650),
  };
}

export function json(res, status, body) {
  res.status(status).json(body);
}
