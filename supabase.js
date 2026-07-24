// Cliente Supabase — todas as requisições de dados usam o token do usuário logado,
// nunca só a chave pública. Isso é o que permite ao RLS isolar os dados por usuário.
const SUPABASE_URL = window.REACT_APP_SUPABASE_URL || 'https://novcfkmcliquuvmnqwoe.supabase.co';
const SUPABASE_ANON_KEY = window.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdmNma21jbGlxdXV2bW5xd29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjk1MjUsImV4cCI6MjEwMDQwNTUyNX0.wQYbOfomZcd_o1RNyQKue62gfJ5z9R4exfuFygNr6NU';

const supabaseClient = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  onAuthExpired: null, // app.js define este callback para voltar à tela de login

  getToken() { try { return localStorage.getItem('supabase_token') } catch { return null } },
  getRefreshToken() { try { return localStorage.getItem('supabase_refresh_token') } catch { return null } },
  setSession(session) {
    try {
      if (session?.access_token) localStorage.setItem('supabase_token', session.access_token);
      if (session?.refresh_token) localStorage.setItem('supabase_refresh_token', session.refresh_token);
    } catch {}
  },
  clearSession() {
    try { localStorage.removeItem('supabase_token'); localStorage.removeItem('supabase_refresh_token'); localStorage.removeItem('supabase_user'); } catch {}
  },

  async refreshSession() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const j = await r.json();
      if (j.access_token) { this.setSession(j); return true }
      return false;
    } catch { return false }
  },

  // Toda requisição autenticada usa o token do USUÁRIO (não a anon key) como Bearer.
  // Assim o Postgres sabe quem está pedindo e o RLS (auth.uid() = user_id) funciona.
  async request(endpoint, method = 'GET', body = null, extraHeaders = {}, _retried = false) {
    const token = this.getToken() || SUPABASE_ANON_KEY;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
      ...extraHeaders,
    };
    const config = { method, headers };
    if (body != null) config.body = JSON.stringify(body);

    const response = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, config);

    if (response.status === 401 && !_retried && this.getRefreshToken()) {
      const ok = await this.refreshSession();
      if (ok) return this.request(endpoint, method, body, extraHeaders, true);
      this.clearSession();
      if (typeof this.onAuthExpired === 'function') this.onAuthExpired();
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok) {
      let detail = response.statusText;
      try { const j = await response.json(); detail = j.message || j.error_description || detail } catch {}
      throw new Error(detail);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  // ---------- Auth ----------
  async signUp(email, password) {
    return fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());
  },

  async signIn(email, password) {
    const result = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());
    if (result.access_token) this.setSession(result);
    return result;
  },

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    });
    if (res.status === 401) {
      const ok = await this.refreshSession();
      if (!ok) { this.clearSession(); return null }
      return this.getCurrentUser();
    }
    const j = await res.json();
    return j && j.id ? j : null;
  },

  async signOut() { this.clearSession() },

  // ---------- Produtos (isolados por user_id via RLS + filtro no cliente) ----------
  async getProducts(userId) {
    try {
      return await this.request(`/products?user_id=eq.${userId}&order=created_at.desc`);
    } catch (e) { console.error('Erro ao carregar produtos:', e); return [] }
  },

  async getProduct(id, userId) {
    return this.request(`/products?id=eq.${id}&user_id=eq.${userId}`);
  },

  async createProduct(product) {
    return this.request('/products', 'POST', product);
  },

  async updateProduct(id, updates) {
    return this.request(`/products?id=eq.${id}`, 'PATCH', updates);
  },

  async deleteProduct(id) {
    return this.request(`/products?id=eq.${id}`, 'DELETE');
  },

  // ---------- Resultado mensal (por usuário + marketplace + produto) ----------
  async getMonthlySales(userId, platform) {
    try {
      return await this.request(`/monthly_sales?user_id=eq.${userId}&platform=eq.${platform}`);
    } catch (e) { console.error('Erro ao carregar resultado mensal:', e); return [] }
  },

  async upsertMonthlySale(row) {
    return this.request('/monthly_sales?on_conflict=user_id,platform,product_id', 'POST', row, {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    });
  },

  async deleteMonthlySales(userId, platform) {
    return this.request(`/monthly_sales?user_id=eq.${userId}&platform=eq.${platform}`, 'DELETE');
  },

  async getMonthlyMeta(userId, platform) {
    try {
      const rows = await this.request(`/monthly_meta?user_id=eq.${userId}&platform=eq.${platform}&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    } catch (e) { return null }
  },

  async upsertMonthlyMeta(row) {
    return this.request('/monthly_meta?on_conflict=user_id,platform', 'POST', row, {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    });
  },
};
