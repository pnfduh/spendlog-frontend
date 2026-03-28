// js/api.js — SpendLog API Client
// Mirrors the FastAPI backend endpoints. Handles JWT storage + auto-refresh.

// ── REQUIRED: Set this to your Railway backend URL ──────────────────────────
// Found in Railway dashboard → your service → Settings → Domains
// Example: 'https://spendlog-backend-production-abc1.up.railway.app/api/v1'
const API_BASE = 'https://spendlog-backend-production.up.railway.app/api/v1';
// ────────────────────────────────────────────────────────────────────────────

const TokenStore = {
  get access()  { return localStorage.getItem('sl_access'); },
  get refresh() { return localStorage.getItem('sl_refresh'); },
  save(access, refresh) {
    localStorage.setItem('sl_access', access);
    localStorage.setItem('sl_refresh', refresh);
  },
  clear() {
    localStorage.removeItem('sl_access');
    localStorage.removeItem('sl_refresh');
  },
  get isLoggedIn() { return !!this.access && !!this.refresh; },
};

async function apiFetch(path, options = {}, retry = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(TokenStore.access ? { Authorization: `Bearer ${TokenStore.access}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && retry && TokenStore.refresh) {
    const refreshed = await refreshTokens();
    if (refreshed) return apiFetch(path, options, false);
    TokenStore.clear();
    window.dispatchEvent(new Event('sl:logout'));
    throw new Error('Session expired');
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

async function refreshTokens() {
  try {
    const data = await apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: TokenStore.refresh }),
    }, false);
    TokenStore.save(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const Auth = {
  async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    TokenStore.save(data.access_token, data.refresh_token);
    return Auth.me();
  },

  async register(email, password, fullName) {
    const body = { email, password };
    if (fullName) body.full_name = fullName;
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    TokenStore.save(data.access_token, data.refresh_token);
    return Auth.me();
  },

  async me() {
    return apiFetch('/auth/me');
  },

  logout() {
    TokenStore.clear();
    window.dispatchEvent(new Event('sl:logout'));
  },
};

// ── Plaid ─────────────────────────────────────────────────────────────────────
const Plaid = {
  async getLinkToken() {
    const data = await apiFetch('/plaid/link-token', { method: 'POST' });
    return data.link_token;
  },

  async exchangeToken(publicToken, meta = {}) {
    return apiFetch('/plaid/exchange-token', {
      method: 'POST',
      body: JSON.stringify({
        public_token: publicToken,
        institution_name: meta.institutionName,
        institution_id: meta.institutionId,
        account_name: meta.accountName,
      }),
    });
  },

  async getAccounts() {
    return apiFetch('/plaid/accounts');
  },

  async disconnectAccount(id) {
    return apiFetch(`/plaid/accounts/${id}`, { method: 'DELETE' });
  },
};

// ── Transactions ──────────────────────────────────────────────────────────────
const Transactions = {
  async list({ startDate, endDate, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (startDate) params.set('start_date', startDate);
    if (endDate)   params.set('end_date',   endDate);
    return apiFetch(`/transactions?${params}`);
  },

  async calendar(year, month) {
    return apiFetch(`/transactions/calendar?year=${year}&month=${month}`);
  },

  async get(id) {
    return apiFetch(`/transactions/${id}`);
  },
};

// ── Devices (Push) ────────────────────────────────────────────────────────────
const Devices = {
  async registerToken(token) {
    return apiFetch('/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        token,
        device_name: navigator.userAgent.slice(0, 100),
        app_version: '1.0.0',
      }),
    });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(parseFloat(amount));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(dateStr)) return 'Today';
  if (isYesterday(dateStr)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

function isYesterday(dateStr) {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return dateStr === d.toISOString().slice(0, 10);
}

function categoryEmoji(category) {
  if (!category) return '💳';
  const c = category.toLowerCase();
  if (c.includes('food') || c.includes('restaurant')) return '🍔';
  if (c.includes('travel') || c.includes('transport'))  return '✈️';
  if (c.includes('shop'))       return '🛍️';
  if (c.includes('health'))     return '💊';
  if (c.includes('entertain'))  return '🎬';
  if (c.includes('service'))    return '🔧';
  if (c.includes('transfer'))   return '↔️';
  if (c.includes('grocery'))    return '🛒';
  if (c.includes('coffee'))     return '☕';
  return '💳';
}

function categoryBg(category) {
  if (!category) return 'rgba(144,144,176,0.12)';
  const c = category.toLowerCase();
  if (c.includes('food') || c.includes('restaurant')) return 'rgba(249,115,22,0.15)';
  if (c.includes('travel'))   return 'rgba(59,130,246,0.15)';
  if (c.includes('shop'))     return 'rgba(168,85,247,0.15)';
  if (c.includes('health'))   return 'rgba(239,68,68,0.15)';
  if (c.includes('entertain'))return 'rgba(236,72,153,0.15)';
  return 'rgba(240,165,0,0.1)';
}
