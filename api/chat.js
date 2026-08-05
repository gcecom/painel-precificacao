'use strict';
// ---------- Assistente IA — função serverless (Vercel) ----------
// SOMENTE LEITURA. Recebe a pergunta + um resumo JÁ CONSOLIDADO pelo cliente (fórmulas
// oficiais do painel, escopo do usuário via RLS) e devolve a resposta em texto/tabela.
// - Nunca escreve nada. Não usa service role. A OPENAI_API_KEY fica só na Vercel.
// - Valida o JWT do Supabase (o token do usuário logado) antes de gastar a IA.
// - Limita tamanho da pergunta, do histórico e do resumo (custo previsível).
// - A IA é instruída a usar SÓ os números recebidos — não pode inventar nem recalcular.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://novcfkmcliquuvmnqwoe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdmNma21jbGlxdXV2bW5xd29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjk1MjUsImV4cCI6MjEwMDQwNTUyNX0.wQYbOfomZcd_o1RNyQKue62gfJ5z9R4exfuFygNr6NU';

const LIMITES = { pergunta: 600, historico: 6, msgHist: 4000, resumo: 60000, saida: 900 };

const INSTRUCOES = [
  'Você é o Assistente do painel FULL Ecommerce. Você é SOMENTE LEITURA.',
  'Fonte da verdade: o objeto JSON "DADOS" enviado na mensagem. Ele já foi calculado pelas',
  'fórmulas oficiais do painel (mesma consolidação do Dashboard).',
  'Regras rígidas:',
  '- Use EXCLUSIVAMENTE os números que estão em DADOS. NUNCA invente, estime ou recalcule.',
  '- Se um número pedido não estiver em DADOS, diga claramente que não há esse dado no período/filtro.',
  '- Ao final de cada resposta, informe: Período analisado, Filtros aplicados e Origem',
  '  ("dados salvos em Vendas — mesma consolidação do Dashboard").',
  '- Dinheiro no formato brasileiro: R$ 1.234,56. Percentuais com 2 casas (ex.: 12,50%).',
  '- Responda em português, objetivo. Use TABELAS em markdown ao comparar produtos, meses ou marketplaces.',
  '- Você não pode criar, editar ou excluir nada. Se pedirem, explique que é somente leitura.'
].join('\n');

function textoDaResposta(j) {
  if (j && typeof j.output_text === 'string' && j.output_text) return j.output_text;
  try {
    return (j.output || [])
      .flatMap(o => o.content || [])
      .filter(c => c && (c.type === 'output_text' || typeof c.text === 'string'))
      .map(c => c.text).join('\n').trim();
  } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido.' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(500).json({ error: 'IA não configurada: falta OPENAI_API_KEY na Vercel.' }); return; }
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

  // 1) valida o JWT do usuário no Supabase (nunca service role)
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Faça login para usar o assistente.' }); return; }
  let user = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    });
    if (r.ok) user = await r.json();
  } catch (e) {}
  if (!user || !user.id) { res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' }); return; }

  // 2) corpo + limites
  let body = {};
  try { body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}'); } catch (e) {}
  const pergunta = String(body.question || '').slice(0, LIMITES.pergunta).trim();
  if (!pergunta) { res.status(400).json({ error: 'Pergunta vazia.' }); return; }

  const historico = Array.isArray(body.history) ? body.history.slice(-LIMITES.historico) : [];
  const dataset = body.dataset && typeof body.dataset === 'object' ? body.dataset : {};
  const resumo = JSON.stringify(dataset).slice(0, LIMITES.resumo);

  const input = historico
    .filter(m => m && m.content)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, LIMITES.msgHist) }));
  input.push({ role: 'user', content: `PERGUNTA: ${pergunta}\n\nDADOS (JSON — única fonte de números, use só isto):\n${resumo}` });

  // 3) chama a OpenAI Responses API
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, instructions: INSTRUCOES, input, max_output_tokens: LIMITES.saida })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(502).json({ error: (j.error && j.error.message) || 'Falha ao consultar a IA.' });
      return;
    }
    const answer = textoDaResposta(j);
    res.status(200).json({ answer: answer || 'Não consegui gerar uma resposta.', model, periodo: dataset.periodo || null });
  } catch (e) {
    res.status(502).json({ error: 'Não foi possível falar com a IA: ' + e.message });
  }
};
