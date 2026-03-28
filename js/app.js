// js/app.js — SpendLog SPA Application
// Runs when app is in standalone (installed PWA) mode.

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  user: null,
  currentTab: 'calendar',
  calendar: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, days: {} },
  transactions: { list: [], hasMore: false, offset: 0 },
  accounts: [],
  selectedDate: null,
  isLoading: false,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
async function bootApp() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  // Listen for logout events
  window.addEventListener('sl:logout', () => showAuth());

  // Handle URL params (e.g. ?view=calendar from shortcuts)
  const params = new URLSearchParams(location.search);
  const initialView = params.get('view') || 'calendar';

  if (TokenStore.isLoggedIn) {
    try {
      State.user = await Auth.me();
      showApp(initialView);
    } catch {
      showAuth();
    }
  } else {
    showAuth();
  }
}

// ── Mode switching ────────────────────────────────────────────────────────────
function showAuth() {
  document.getElementById('view-auth').classList.add('active');
  document.querySelector('.app-tabs').classList.add('hidden');
  ['view-calendar','view-activity','view-accounts','view-settings'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
}

function showApp(tab = 'calendar') {
  document.getElementById('view-auth').classList.remove('active');
  document.querySelector('.app-tabs').classList.remove('hidden');
  renderAvatar();
  switchTab(tab);
  requestPushPermission();
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function renderAvatar() {
  document.querySelectorAll('.app-avatar').forEach(el => {
    const initial = (State.user?.full_name || State.user?.email || 'S')[0].toUpperCase();
    el.textContent = initial;
  });
}

// ── Tab Navigation ────────────────────────────────────────────────────────────
function switchTab(tab) {
  State.currentTab = tab;
  document.querySelectorAll('.app-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${tab}`);
  });
  if (tab === 'calendar')  loadCalendar();
  if (tab === 'activity')  loadActivity();
  if (tab === 'accounts')  loadAccounts();
  if (tab === 'settings')  renderSettings();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function initAuth() {
  const loginPanel  = document.getElementById('auth-login');
  const signupPanel = document.getElementById('auth-signup');
  const tabs = document.querySelectorAll('.auth-tab-btn');

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const isLogin = btn.dataset.auth === 'login';
      loginPanel.classList.toggle('hidden', !isLogin);
      signupPanel.classList.toggle('hidden', isLogin);
      document.querySelector('.auth-error').classList.remove('show');
    });
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass  = document.getElementById('login-pass').value;
    const btn   = document.getElementById('login-btn');
    const err   = document.querySelector('.auth-error');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      State.user = await Auth.login(email, pass);
      showApp();
    } catch(ex) {
      err.textContent = ex.message; err.classList.add('show');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  // Register form
  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name  = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const pass  = document.getElementById('signup-pass').value;
    const btn   = document.getElementById('signup-btn');
    const err   = document.querySelector('.auth-error');
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      State.user = await Auth.register(email, pass, name || null);
      showApp();
    } catch(ex) {
      err.textContent = ex.message; err.classList.add('show');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function loadCalendar() {
  const { year, month } = State.calendar;
  const grid = document.getElementById('cal-grid');
  const monthLabel = document.getElementById('month-label');
  const totalEl = document.getElementById('month-total');
  const countEl = document.getElementById('month-count');

  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  monthLabel.textContent = monthName;
  grid.innerHTML = '<div class="spinner"></div>';

  try {
    const data = await Transactions.calendar(year, month);
    // Build lookup: date string → day data
    State.calendar.days = {};
    let totalSpent = 0, totalCount = 0;
    (data.days || []).forEach(d => {
      State.calendar.days[d.date] = d;
      totalSpent += parseFloat(d.total_spent || 0);
      totalCount += d.transaction_count || 0;
    });

    totalEl.textContent = formatCurrency(totalSpent);
    countEl.textContent = `${totalCount} transaction${totalCount === 1 ? '' : 's'}`;
    renderCalendarGrid(year, month);
  } catch(e) {
    grid.innerHTML = `<p style="color:var(--danger);font-size:.85rem;padding:16px">${e.message}</p>`;
  }
}

function renderCalendarGrid(year, month) {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Find max spend for intensity scaling
  const spends = Object.values(State.calendar.days).map(d => parseFloat(d.total_spent || 0));
  const maxSpend = Math.max(...spends, 1);

  // Empty cells before month starts
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = State.calendar.days[dateStr];
    const cell = document.createElement('div');

    let classes = 'cal-cell';
    if (dateStr === todayStr) classes += ' today';
    if (dayData) {
      const spend = parseFloat(dayData.total_spent || 0);
      const intensity = spend / maxSpend;
      if (intensity > 0.6) classes += ' spend-high';
      else if (intensity > 0.25) classes += ' spend-mid';
      else if (intensity > 0) classes += ' spend-low';
    }
    cell.className = classes;

    // Day number
    const dayNum = document.createElement('div');
    dayNum.className = 'cal-cell-day';
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    // Dots for transaction count
    if (dayData?.transaction_count > 0) {
      const dots = document.createElement('div');
      dots.className = 'cal-cell-dots';
      const count = Math.min(dayData.transaction_count, 3);
      for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot';
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => showDayDetail(dateStr, dayData));
    grid.appendChild(cell);
  }
}

function showDayDetail(dateStr, dayData) {
  const panel = document.getElementById('day-detail');
  const dateEl = document.getElementById('detail-date');
  const totalEl = document.getElementById('detail-total');
  const listEl = document.getElementById('detail-list');

  dateEl.textContent = formatDate(dateStr);
  totalEl.textContent = dayData ? formatCurrency(dayData.total_spent) : '$0.00';

  if (!dayData || !dayData.transactions?.length) {
    listEl.innerHTML = '<div class="empty-state"><p>No transactions on this day</p></div>';
  } else {
    listEl.innerHTML = dayData.transactions.map(txn => renderTxnItem(txn)).join('');
  }

  // Deselect previous
  document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  // Select clicked day
  const cells = document.querySelectorAll('.cal-cell:not(.empty)');
  const dayNum = parseInt(dateStr.slice(-2));
  if (cells[dayNum - 1]) cells[dayNum - 1].classList.add('selected');

  panel.classList.add('show');
  State.selectedDate = dateStr;

  // Bind click handlers on txn items
  listEl.querySelectorAll('.txn-item').forEach((el, i) => {
    el.addEventListener('click', () => showTxnModal(dayData.transactions[i]));
  });
}

// ── Calendar month navigation ─────────────────────────────────────────────────
function calPrev() {
  let { year, month } = State.calendar;
  month--; if (month < 1) { month = 12; year--; }
  State.calendar = { ...State.calendar, year, month, days: {} };
  closeDayDetail();
  loadCalendar();
}
function calNext() {
  let { year, month } = State.calendar;
  month++; if (month > 12) { month = 1; year++; }
  State.calendar = { ...State.calendar, year, month, days: {} };
  closeDayDetail();
  loadCalendar();
}
function closeDayDetail() {
  document.getElementById('day-detail').classList.remove('show');
  document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIVITY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function loadActivity(reset = true) {
  const list = document.getElementById('activity-list');
  if (reset) {
    State.transactions = { list: [], hasMore: false, offset: 0 };
    list.innerHTML = '<div class="spinner"></div>';
  }

  try {
    const end = new Date().toISOString().slice(0,10);
    const start = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
    const data = await Transactions.list({ startDate: start, endDate: end, offset: State.transactions.offset });

    const txns = data.transactions || [];
    State.transactions.list.push(...txns);
    State.transactions.hasMore = data.has_more;
    State.transactions.offset += txns.length;

    if (State.transactions.list.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
        </svg>
        <p>No transactions yet</p>
        <p>Connect a bank to get started</p>
      </div>`;
      return;
    }

    // Group by date
    const groups = {};
    State.transactions.list.forEach(txn => {
      const d = txn.transaction_date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(txn);
    });

    const html = Object.entries(groups)
      .sort(([a],[b]) => b.localeCompare(a))
      .map(([date, txns]) => {
        const total = txns.reduce((s,t) => s + parseFloat(t.amount), 0);
        return `
          <div class="txn-group-header">
            <span>${formatDateShort(date)}</span>
            <span class="txn-group-total">${formatCurrency(total)}</span>
          </div>
          ${txns.map(t => renderTxnItem(t)).join('')}
        `;
      }).join('');

    list.innerHTML = html;

    // Bind click handlers
    list.querySelectorAll('.txn-item').forEach(el => {
      el.addEventListener('click', () => {
        const txn = State.transactions.list.find(t => t.id === el.dataset.id);
        if (txn) showTxnModal(txn);
      });
    });

  } catch(e) {
    list.innerHTML = `<p style="color:var(--danger);padding:20px;font-size:.85rem">${e.message}</p>`;
  }
}

// ── Transaction item HTML ─────────────────────────────────────────────────────
function renderTxnItem(txn) {
  const badges = [
    txn.is_apple_pay ? '<span class="txn-badge apple"> Pay</span>' : '',
    txn.pending      ? '<span class="txn-badge pending">Pending</span>' : '',
  ].filter(Boolean).join('');

  return `
    <div class="txn-item" data-id="${txn.id}">
      <div class="txn-icon" style="background:${categoryBg(txn.category)}">
        ${categoryEmoji(txn.category)}
      </div>
      <div class="txn-body">
        <div class="txn-name">
          ${txn.merchant_name || txn.name}
          ${badges ? `<span class="txn-badges">${badges}</span>` : ''}
        </div>
        <div class="txn-meta">${txn.category || 'Uncategorized'}</div>
      </div>
      <div class="txn-amount ${txn.pending ? 'pending' : ''}">
        ${formatCurrency(txn.amount)}
      </div>
    </div>
  `;
}

// ── Transaction Modal ─────────────────────────────────────────────────────────
function showTxnModal(txn) {
  const overlay = document.getElementById('txn-modal');
  const merchant = txn.merchant_name || txn.name;

  document.getElementById('modal-icon').style.background = categoryBg(txn.category);
  document.getElementById('modal-icon').textContent = categoryEmoji(txn.category);
  document.getElementById('modal-amount').textContent = formatCurrency(txn.amount);
  document.getElementById('modal-merchant').textContent = merchant;

  const details = [
    ['Date',    formatDate(txn.transaction_date)],
    ['Category', txn.category || 'Uncategorized'],
    txn.subcategory ? ['Subcategory', txn.subcategory] : null,
    ['Payment', txn.payment_channel || 'Card'],
    txn.is_apple_pay ? ['Wallet', ' Apple Pay'] : null,
    ['Status', txn.pending ? '⏳ Pending' : '✅ Posted'],
    ['Currency', txn.currency_code],
  ].filter(Boolean);

  document.getElementById('modal-details').innerHTML = details.map(([l,v]) => `
    <div class="modal-detail-row">
      <span class="modal-detail-label">${l}</span>
      <span class="modal-detail-value">${v}</span>
    </div>
  `).join('');

  overlay.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACCOUNTS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function loadAccounts() {
  const container = document.getElementById('accounts-list');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    State.accounts = await Plaid.getAccounts();
    renderAccounts();
  } catch(e) {
    container.innerHTML = `<p style="color:var(--danger);font-size:.85rem;padding:16px">${e.message}</p>`;
  }
}

function renderAccounts() {
  const container = document.getElementById('accounts-list');
  const iconMap = { credit: '💳', depository: '🏦', loan: '📋' };

  const accountsHtml = State.accounts.map(acc => `
    <div class="account-card">
      <div class="account-icon">${iconMap[acc.account_type] || '🏦'}</div>
      <div class="account-body">
        <div class="account-name">${acc.institution_name || 'Bank Account'}</div>
        <div class="account-sub">${acc.account_subtype || acc.account_type || 'Account'}</div>
        ${acc.mask ? `<div class="account-mask">•••• ${acc.mask}</div>` : ''}
      </div>
    </div>
  `).join('');

  const connectBtn = `
    <button class="connect-btn" id="connect-bank-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Connect a Bank
    </button>
    <div class="security-note">
      <span class="security-note-icon">🔒</span>
      <p>SpendLog never stores your bank credentials. All connections are secured by Plaid with 256-bit encryption.</p>
    </div>
  `;

  container.innerHTML = accountsHtml + connectBtn;
  document.getElementById('connect-bank-btn').addEventListener('click', startPlaidLink);
}

async function startPlaidLink() {
  const btn = document.getElementById('connect-bank-btn');
  btn.textContent = 'Loading…'; btn.disabled = true;

  try {
    const linkToken = await Plaid.getLinkToken();

    // Load Plaid Link SDK dynamically
    if (!window.Plaid) {
      await loadScript('https://cdn.plaid.com/link/v2/stable/link-initialize.js');
    }

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        btn.textContent = 'Connecting…';
        await Plaid.exchangeToken(publicToken, {
          institutionName: metadata.institution?.name,
          institutionId: metadata.institution?.id,
          accountName: metadata.accounts?.[0]?.name,
        });
        await loadAccounts();
        // Refresh calendar and activity
        State.calendar.days = {};
        if (State.currentTab === 'calendar') loadCalendar();
      },
      onExit: () => { btn.textContent = 'Connect a Bank'; btn.disabled = false; },
    });

    handler.open();
  } catch(e) {
    alert('Failed to initialize bank connection: ' + e.message);
    btn.textContent = 'Connect a Bank'; btn.disabled = false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function renderSettings() {
  const { user } = State;
  if (!user) return;

  document.getElementById('settings-name').textContent = user.full_name || 'SpendLog User';
  document.getElementById('settings-email').textContent = user.email;
  document.getElementById('settings-initial').textContent = (user.full_name || user.email || 'S')[0].toUpperCase();
  document.getElementById('settings-version').textContent = '1.0.0';
}

// ── Push Notifications ────────────────────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') {
    subscribeToPush();
  } else if (Notification.permission !== 'denied') {
    // Don't auto-prompt — let user trigger from settings
  }
}

async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;

    // ── IMPORTANT ──────────────────────────────────────────────────────────
    // Replace this with your actual VAPID public key from Railway env vars.
    // Generate it with: python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key)"
    const VAPID_PUBLIC_KEY = 'BAUs-zv0LypcjWcqGip_uwmxZkDk_1eX5EGYUnOqBD1s9UZsKV6xvCfimC3v6Yef6QZdLjEz3tLwtuWan4wtTLQ';
    // ───────────────────────────────────────────────────────────────────────

    // Check if already subscribed
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Re-register existing subscription in case user logged into new account
      await Devices.registerToken(JSON.stringify(existing));
      return;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Send the full subscription JSON object to the backend
    // Backend stores it and uses it to send Web Push notifications
    await Devices.registerToken(JSON.stringify(subscription));
    console.log('[Push] Subscription registered');
  } catch(e) {
    console.warn('[Push] Subscribe failed:', e.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  // Tab bar
  document.querySelectorAll('.app-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Calendar nav
  document.getElementById('cal-prev').addEventListener('click', calPrev);
  document.getElementById('cal-next').addEventListener('click', calNext);
  document.getElementById('detail-close').addEventListener('click', closeDayDetail);

  // Transaction modal
  document.getElementById('txn-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('txn-modal')) {
      document.getElementById('txn-modal').classList.remove('show');
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Sign out of SpendLog?')) Auth.logout();
  });

  // Enable notifications button in settings
  document.getElementById('enable-notif-btn')?.addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') subscribeToPush();
  });

  // Pull to refresh on activity
  document.getElementById('activity-scroll').addEventListener('scroll', e => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100 && State.transactions.hasMore) {
      loadActivity(false);
    }
  });

  bootApp();
});
