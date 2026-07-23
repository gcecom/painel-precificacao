// Importar Supabase Client
const SUPABASE_URL = window.REACT_APP_SUPABASE_URL || 'https://novcfkmcliquuvmnqwoe.supabase.co';
const SUPABASE_ANON_KEY = window.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdmNma21jbGlxdXV2bW5xd29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjk1MjUsImV4cCI6MjEwMDQwNTUyNX0.wQYbOfomZcd_o1RNyQKue62gfJ5z9R4exfuFygNr6NU';

// Supabase cliente (substitua pela CDN se necessário)
const supabaseClient = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,

  // Fazer requisições ao Supabase
  async request(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    };

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const response = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, config);
    if (!response.ok) throw new Error(`Supabase error: ${response.statusText}`);
    return response.json();
  },

  // Auth
  async signUp(email, password) {
    return fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());
  },

  async signIn(email, password) {
    return fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());
  },

  async getCurrentUser() {
    const token = localStorage.getItem('supabase_token');
    if (!token) return null;
    return fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    }).then(r => r.json());
  },

  async signOut() {
    localStorage.removeItem('supabase_token');
    localStorage.removeItem('supabase_user');
  },

  // Produtos
  async getProducts(userId) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/products?order=created_at.desc`;
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
        }
      });
      if (!response.ok) {
        console.error('Erro ao carregar:', response.status);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('Erro ao carregar produtos:', e);
      return [];
    }
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

  // Configurações de canal
  async getChannelConfigs(productId) {
    return this.request(`/product_channels?product_id=eq.${productId}`);
  },

  async upsertChannelConfig(config) {
    return this.request('/product_channels', 'POST', config);
  },
};
