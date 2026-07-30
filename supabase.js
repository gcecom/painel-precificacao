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

  // Envia email de recuperação de senha (fluxo "esqueci minha senha", sem precisar do Dashboard)
  async recover(email) {
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
    return fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email }),
    }).then(r => r.json());
  },

  // Define nova senha usando o access_token de recuperação (vem no link do email)
  async updateUserPassword(recoveryAccessToken, newPassword) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${recoveryAccessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'Erro ao atualizar senha');
    return j;
  },

  // ---------- Produtos (isolados por user_id via RLS + filtro no cliente) ----------
  // Propaga o erro de propósito: quem chama precisa saber que a leitura falhou,
  // senão o app confunde "falhou" com "não tem nenhum produto" e sobrescreve o catálogo.
  async getProducts(userId) {
    return this.request(`/products?user_id=eq.${userId}&order=created_at.desc`);
  },

  async getProduct(id, userId) {
    return this.request(`/products?id=eq.${id}&user_id=eq.${userId}`);
  },

  async createProduct(product) {
    const rows = await this.request('/products', 'POST', product, { 'Prefer': 'return=representation' });
    if (!rows || !rows.length) throw new Error('O produto não foi gravado no banco.');
    return rows[0];
  },

  // Confere se alguma linha foi mesmo alterada. Sem isso um PATCH que não acerta
  // nenhuma linha volta 204 e o painel diz "salvo" sem ter salvado nada.
  async updateProduct(id, updates) {
    const rows = await this.request(`/products?id=eq.${id}`, 'PATCH', updates, { 'Prefer': 'return=representation' });
    if (!rows || !rows.length) throw new Error('Nenhuma linha foi atualizada — o produto pode ter sido removido ou pertencer a outro login.');
    return rows[0];
  },

  async deleteProduct(id) {
    return this.request(`/products?id=eq.${id}`, 'DELETE');
  },

  // ---------- Resultado mensal (por usuário + marketplace + produto + mês) ----------
  async getMonthlySales(userId, platform, month) {
    return this.request(`/monthly_sales?user_id=eq.${userId}&platform=eq.${platform}&month=eq.${month}`);
  },

  async upsertMonthlySale(row) {
    return this.request('/monthly_sales?on_conflict=user_id,platform,product_id,month', 'POST', row, {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    });
  },

  async deleteMonthlySales(userId, platform, month) {
    return this.request(`/monthly_sales?user_id=eq.${userId}&platform=eq.${platform}&month=eq.${month}`, 'DELETE');
  },

  // Meses que já têm lançamento NESTE marketplace — alimenta "Meses salvos"
  async listMonthlyMonths(userId, platform) {
    try {
      const flt = platform ? `&platform=eq.${platform}` : '';
      const rows = await this.request(`/monthly_sales?user_id=eq.${userId}${flt}&select=month`);
      return [...new Set((rows || []).map(r => r.month).filter(Boolean))].sort().reverse();
    } catch (e) { return [] }
  },

  // ---------- Consultas consolidadas do Dashboard Geral ----------
  // Uma query por tipo de dado cobrindo TODO o período/marketplaces (nunca 1 por produto).
  async getMonthlySalesRange(userId, months) {
    if (!months || !months.length) return [];
    const list = months.map(m => `"${m}"`).join(',');
    return this.request(`/monthly_sales?user_id=eq.${userId}&month=in.(${list})`);
  },

  async getAdsSummaryRange(userId, months) {
    if (!months || !months.length) return [];
    const list = months.map(m => `"${m}"`).join(',');
    try { return await this.request(`/monthly_ads_summary?user_id=eq.${userId}&month=in.(${list})`) }
    catch (e) { return [] }
  },

  async getMonthlyExpensesRange(userId, months) {
    if (!months || !months.length) return [];
    const list = months.map(m => `"${m}"`).join(',');
    try { return await this.request(`/monthly_expenses?user_id=eq.${userId}&month=in.(${list})`) }
    catch (e) { return [] }
  },

  // ---------- Gastos gerais do mês (valor único do negócio, não por marketplace) ----------
  async getMonthlyExpenses(userId, month) {
    const rows = await this.request(`/monthly_expenses?user_id=eq.${userId}&month=eq.${month}&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  },

  async upsertMonthlyExpenses(row) {
    return this.request('/monthly_expenses?on_conflict=user_id,month', 'POST', row, {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    });
  },

  // ---------- Resumo de Ads por marketplace + mês (fonte única de ACOS/TACOS) ----------
  async getAdsSummary(userId, platform, month) {
    const rows = await this.request(`/monthly_ads_summary?user_id=eq.${userId}&platform=eq.${platform}&month=eq.${month}&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  },

  async upsertAdsSummary(row) {
    return this.request('/monthly_ads_summary?on_conflict=user_id,platform,month', 'POST', row, {
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    });
  },
};
