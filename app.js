// app.js — SpendLog v2.0 — Teller bank integration

const API_BASE = 'https://spendlog-backend-production.up.railway.app/api/v1';
const VAPID_PUBLIC_KEY = 'BAUs-zv0LypcjWcqGip_uwmxZkDk_1eX5EGYUnOqBD1s9UZsKV6xvCfimC3v6Yef6QZdLjEz3tLwtuWan4wtTLQ';
const TELLER_APP_ID = 'app_pqf12skur572k1h1sm000';

const State = {
  currentTab: 'calendar',
  calendar: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, days: {} },
  transactions: { list: [], hasMore: false, offset: 0 },
  accounts: [],
};

function getDeviceId() {
  let id = localStorage.getItem('sl_device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('sl_device_id', id); }
  return id;
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Device-ID': getDeviceId(), ...options.headers };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ── INIT — called from index.html after script loads ─────────────────────────
function initApp() {
  // Wire up all event listeners
  document.querySelectorAll('.app-tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('cal-prev').addEventListener('click', calPrev);
  document.getElementById('cal-next').addEventListener('click', calNext);
  document.getElementById('detail-close').addEventListener('click', closeDayDetail);
  document.getElementById('txn-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('txn-modal')) document.getElementById('txn-modal').classList.remove('show');
  });
  document.getElementById('enable-notif-btn')?.addEventListener('click', async () => {
    if (await Notification.requestPermission() === 'granted') subscribeToPush();
  });
  document.getElementById('activity-scroll').addEventListener('scroll', e => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100 && State.transactions.hasMore) loadActivity(false);
  });

  // Boot
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.warn);
  requestPushPermission();
  switchTab('calendar');
}

// Also support DOMContentLoaded in case called before DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM already ready - initApp will be called by index.html onload
}

function switchTab(tab) {
  State.currentTab = tab;
  document.querySelectorAll('.app-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));
  if (tab === 'calendar') loadCalendar();
  if (tab === 'activity') loadActivity();
  if (tab === 'accounts') loadAccounts();
  if (tab === 'settings') renderSettings();
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
async function loadCalendar() {
  const { year, month } = State.calendar;
  const grid = document.getElementById('cal-grid');
  const monthName = new Date(year, month-1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
  document.getElementById('month-label').textContent = monthName;
  grid.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await apiFetch(`/transactions/calendar?year=${year}&month=${month}`);
    State.calendar.days = {};
    let totalSpent = 0, totalCount = 0;
    (data.days || []).forEach(d => {
      State.calendar.days[d.date] = d;
      totalSpent += parseFloat(d.total_spent || 0);
      totalCount += d.transaction_count || 0;
    });
    document.getElementById('month-total').textContent = formatCurrency(totalSpent);
    document.getElementById('month-count').textContent = `${totalCount} transaction${totalCount===1?'':'s'}`;
    renderCalendarGrid(year, month);
  } catch(e) {
    grid.innerHTML = `<p style="color:var(--danger);font-size:.85rem;padding:16px">${e.message}</p>`;
  }
}

function renderCalendarGrid(year, month) {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const firstDay = new Date(year, month-1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const spends = Object.values(State.calendar.days).map(d => parseFloat(d.total_spent||0));
  const maxSpend = Math.max(...spends, 1);

  for (let i=0; i<firstDay; i++) {
    const cell = document.createElement('div'); cell.className = 'cal-cell empty'; grid.appendChild(cell);
  }
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = State.calendar.days[dateStr];
    const cell = document.createElement('div');
    let cls = 'cal-cell';
    if (dateStr===todayStr) cls += ' today';
    if (dayData) {
      const intensity = parseFloat(dayData.total_spent||0)/maxSpend;
      if (intensity>0.6) cls += ' spend-high';
      else if (intensity>0.25) cls += ' spend-mid';
      else if (intensity>0) cls += ' spend-low';
    }
    cell.className = cls;
    const dayNum = document.createElement('div'); dayNum.className = 'cal-cell-day'; dayNum.textContent = d; cell.appendChild(dayNum);
    if (dayData?.transaction_count > 0) {
      const dots = document.createElement('div'); dots.className = 'cal-cell-dots';
      for (let i=0; i<Math.min(dayData.transaction_count,3); i++) {
        const dot = document.createElement('div'); dot.className='cal-dot'; dots.appendChild(dot);
      }
      cell.appendChild(dots);
    }
    cell.addEventListener('click', () => showDayDetail(dateStr, dayData));
    grid.appendChild(cell);
  }
}

function showDayDetail(dateStr, dayData) {
  document.getElementById('detail-date').textContent = formatDate(dateStr);
  document.getElementById('detail-total').textContent = dayData ? formatCurrency(dayData.total_spent) : '$0.00';
  const listEl = document.getElementById('detail-list');
  if (!dayData?.transactions?.length) {
    listEl.innerHTML = '<div class="empty-state"><p>No transactions on this day</p></div>';
  } else {
    listEl.innerHTML = dayData.transactions.map(t => renderTxnItem(t)).join('');
    listEl.querySelectorAll('.txn-item').forEach((el,i) => el.addEventListener('click', () => showTxnModal(dayData.transactions[i])));
  }
  document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  const cells = document.querySelectorAll('.cal-cell:not(.empty)');
  if (cells[parseInt(dateStr.slice(-2))-1]) cells[parseInt(dateStr.slice(-2))-1].classList.add('selected');
  document.getElementById('day-detail').classList.add('show');
}

function calPrev() {
  let {year,month} = State.calendar; month--; if (month<1) {month=12;year--;}
  State.calendar = {...State.calendar,year,month,days:{}}; closeDayDetail(); loadCalendar();
}
function calNext() {
  let {year,month} = State.calendar; month++; if (month>12) {month=1;year++;}
  State.calendar = {...State.calendar,year,month,days:{}}; closeDayDetail(); loadCalendar();
}
function closeDayDetail() {
  document.getElementById('day-detail').classList.remove('show');
  document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
}

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
async function loadActivity(reset=true) {
  const list = document.getElementById('activity-list');
  if (reset) { State.transactions={list:[],hasMore:false,offset:0}; list.innerHTML='<div class="spinner"></div>'; }
  try {
    const end = new Date().toISOString().slice(0,10);
    const start = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
    const data = await apiFetch(`/transactions?start_date=${start}&end_date=${end}&limit=50&offset=${State.transactions.offset}`);
    const txns = data.transactions||[];
    State.transactions.list.push(...txns);
    State.transactions.hasMore = data.has_more;
    State.transactions.offset += txns.length;
    if (!State.transactions.list.length) {
      list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg><p>No transactions yet</p><p>Connect a bank in the Banks tab</p></div>';
      return;
    }
    const groups = {};
    State.transactions.list.forEach(t => { if(!groups[t.transaction_date]) groups[t.transaction_date]=[]; groups[t.transaction_date].push(t); });
    list.innerHTML = Object.entries(groups).sort(([a],[b])=>b.localeCompare(a)).map(([date,txns]) => {
      const total = txns.reduce((s,t)=>s+parseFloat(t.amount),0);
      return `<div class="txn-group-header"><span>${formatDateShort(date)}</span><span class="txn-group-total">${formatCurrency(total)}</span></div>${txns.map(t=>renderTxnItem(t)).join('')}`;
    }).join('');
    list.querySelectorAll('.txn-item').forEach(el => {
      el.addEventListener('click', () => { const t=State.transactions.list.find(t=>t.id===el.dataset.id); if(t) showTxnModal(t); });
    });
  } catch(e) {
    list.innerHTML = `<p style="color:var(--danger);padding:20px;font-size:.85rem">${e.message}</p>`;
  }
}

function renderTxnItem(txn) {
  const badges = [txn.is_apple_pay?'<span class="txn-badge apple"> Pay</span>':'',txn.pending?'<span class="txn-badge pending">Pending</span>':''].filter(Boolean).join('');
  return `<div class="txn-item" data-id="${txn.id}">
    <div class="txn-icon" style="background:${categoryBg(txn.category)}">${categoryEmoji(txn.category)}</div>
    <div class="txn-body">
      <div class="txn-name">${txn.merchant_name||txn.name}${badges?`<span class="txn-badges">${badges}</span>`:''}</div>
      <div class="txn-meta">${txn.category||'Uncategorized'}</div>
    </div>
    <div class="txn-amount ${txn.pending?'pending':''}">${formatCurrency(txn.amount)}</div>
  </div>`;
}

function showTxnModal(txn) {
  document.getElementById('modal-icon').style.background = categoryBg(txn.category);
  document.getElementById('modal-icon').textContent = categoryEmoji(txn.category);
  document.getElementById('modal-amount').textContent = formatCurrency(txn.amount);
  document.getElementById('modal-merchant').textContent = txn.merchant_name||txn.name;
  const details = [
    ['Date',formatDate(txn.transaction_date)],
    ['Category',txn.category||'Uncategorized'],
    txn.subcategory?['Subcategory',txn.subcategory]:null,
    ['Description',txn.description||txn.name],
    txn.is_apple_pay?['Wallet',' Apple Pay']:null,
    ['Status',txn.pending?'⏳ Pending':'✅ Posted'],
  ].filter(Boolean);
  document.getElementById('modal-details').innerHTML = details.map(([l,v])=>`<div class="modal-detail-row"><span class="modal-detail-label">${l}</span><span class="modal-detail-value">${v}</span></div>`).join('');
  document.getElementById('txn-modal').classList.add('show');
}

// ── ACCOUNTS — Teller Connect ─────────────────────────────────────────────────
async function loadAccounts() {
  const container = document.getElementById('accounts-list');
  container.innerHTML = '<div class="spinner"></div>';
  try { State.accounts = await apiFetch('/teller/accounts'); } catch(e) { State.accounts = []; }
  renderAccounts();
}

function renderAccounts() {
  const container = document.getElementById('accounts-list');
  const iconMap = {credit:'💳',depository:'🏦',loan:'📋'};
  container.innerHTML = State.accounts.map(acc=>`
    <div class="account-card">
      <div class="account-icon">${iconMap[acc.account_type]||'🏦'}</div>
      <div class="account-body">
        <div class="account-name">${acc.institution_name||'Bank Account'}</div>
        <div class="account-sub">${acc.account_subtype||acc.account_type||'Account'}</div>
        ${acc.mask?`<div class="account-mask">•••• ${acc.mask}</div>`:''}
      </div>
    </div>`).join('') + `
    <button class="connect-btn" id="connect-bank-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Connect a Bank
    </button>
    <div class="security-note">
      <span class="security-note-icon">🔒</span>
      <p>SpendLog never stores your credentials. Secured by Teller with bank-grade encryption.</p>
    </div>`;
  document.getElementById('connect-bank-btn').addEventListener('click', startTellerConnect);
}

async function startTellerConnect() {
  const btn = document.getElementById('connect-bank-btn');
  btn.textContent = 'Loading…'; btn.disabled = true;
  try {
    if (!window.TellerConnect) await loadScript('https://cdn.teller.io/connect/connect.js');
    const teller = TellerConnect.setup({
      applicationId: TELLER_APP_ID,
      environment: 'sandbox',
      onSuccess: async (enrollment) => {
        btn.textContent = 'Connecting…';
        try {
          await apiFetch('/teller/enroll', {
            method: 'POST',
            body: JSON.stringify({ access_token: enrollment.accessToken, enrollment_id: enrollment.id, institution_name: enrollment.institution?.name }),
          });
          await loadAccounts();
          State.calendar.days = {};
          if (State.currentTab === 'calendar') loadCalendar();
          if (State.currentTab === 'activity') loadActivity();
        } catch(e) {
          alert('Failed to save bank: ' + e.message);
          btn.textContent = 'Connect a Bank'; btn.disabled = false;
        }
      },
      onExit: () => { btn.textContent='Connect a Bank'; btn.disabled=false; },
      onFailure: () => { btn.textContent='Connect a Bank'; btn.disabled=false; },
    });
    teller.open();
  } catch(e) {
    alert('Failed to load Teller: ' + e.message);
    btn.textContent = 'Connect a Bank'; btn.disabled = false;
  }
}

function loadScript(src) {
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('settings-name').textContent = 'SpendLog';
  document.getElementById('settings-email').textContent = 'Personal Finance Tracker';
  document.getElementById('settings-initial').textContent = 'S';
  document.getElementById('settings-version').textContent = '2.0.0';
}

// ── PUSH ──────────────────────────────────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') subscribeToPush();
}
async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await apiFetch('/devices/register', { method:'POST', body:JSON.stringify({ token:JSON.stringify(sub) }) });
  } catch(e) { console.warn('[Push]',e.message); }
}
function urlBase64ToUint8Array(b) {
  const padding = '='.repeat((4-b.length%4)%4);
  const base64 = (b+padding).replace(/-/g,'+').replace(/_/g,'/');
  return new Uint8Array([...atob(base64)].map(c=>c.charCodeAt(0)));
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatCurrency(amount) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(parseFloat(amount)); }
function formatDate(dateStr) { return new Date(dateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}); }
function formatDateShort(dateStr) {
  if (isToday(dateStr)) return 'Today';
  if (isYesterday(dateStr)) return 'Yesterday';
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}
function isToday(d) { return d===new Date().toISOString().slice(0,10); }
function isYesterday(d) { const x=new Date(); x.setDate(x.getDate()-1); return d===x.toISOString().slice(0,10); }
function categoryEmoji(c) {
  if (!c) return '💳'; const l=c.toLowerCase();
  if (l.includes('food')||l.includes('restaurant')||l.includes('dining')) return '🍔';
  if (l.includes('travel')) return '✈️'; if (l.includes('shop')) return '🛍️';
  if (l.includes('health')) return '💊'; if (l.includes('entertain')) return '🎬';
  if (l.includes('service')) return '🔧'; if (l.includes('transfer')) return '↔️';
  if (l.includes('grocery')) return '🛒'; if (l.includes('coffee')) return '☕';
  if (l.includes('gas')) return '⛽'; return '💳';
}
function categoryBg(c) {
  if (!c) return 'rgba(144,144,176,0.12)'; const l=c.toLowerCase();
  if (l.includes('food')||l.includes('restaurant')) return 'rgba(249,115,22,0.15)';
  if (l.includes('travel')) return 'rgba(59,130,246,0.15)';
  if (l.includes('shop')) return 'rgba(168,85,247,0.15)';
  if (l.includes('health')) return 'rgba(239,68,68,0.15)';
  if (l.includes('entertain')) return 'rgba(236,72,153,0.15)';
  return 'rgba(240,165,0,0.1)';
}
