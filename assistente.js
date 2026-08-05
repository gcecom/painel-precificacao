'use strict';
// ---------- ASSISTENTE IA (cliente) — SOMENTE LEITURA ----------
// Botão de chat flutuante em todas as páginas. Reúne SÓ os dados do próprio usuário
// (janela limitada pelo período pedido) usando os métodos já existentes — RLS pelo JWT —
// e roda a CONSOLIDAÇÃO OFICIAL (PainelConsolida). Envia esse resumo pronto + a pergunta
// para /api/chat, que valida o JWT e chama a IA. Nada é gravado; nenhuma fórmula nova.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function allProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function platName(k){try{return PLATFORMS[k].name}catch(e){return k}}

let historico=[],ocupado=false;

const SUGESTOES=[
  'Onde o produto que mais vende dá mais lucro?',
  'Itens mais vendidos nos últimos 3 meses.',
  'Qual marketplace teve maior margem?',
  'Compare faturamento e lucro mensal.'
];

// ---------- janela de meses (datas locais) ----------
const pad=n=>String(n).padStart(2,'0');
function mesesAte(n){const d=new Date(),out=[];for(let i=n-1;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);out.push(x.getFullYear()+'-'+pad(x.getMonth()+1))}return out}
function janelaDaPergunta(q){
  const s=(q||'').toLowerCase();
  if(/\b3\s*mes|últimos?\s*3\b|ultimos?\s*3\b/.test(s))return mesesAte(3);
  if(/\b6\s*mes|últimos?\s*6\b|ultimos?\s*6\b/.test(s))return mesesAte(6);
  if(/este ano|neste ano|ano atual/.test(s)){const y=new Date().getFullYear(),m=new Date().getMonth()+1,out=[];for(let i=1;i<=m;i++)out.push(y+'-'+pad(i));return out}
  return mesesAte(12); // padrão: últimos 12 meses (bounded)
}
function produtoDaPergunta(q){
  const s=(q||'').toLowerCase();
  const p=allProducts().find(x=>x.name&&x.name.length>=4&&s.includes(x.name.toLowerCase()));
  return p?p.id:null;
}

// ---------- coleta + consolidação OFICIAL ----------
const n2=v=>Math.round((+v||0)*100)/100;
async function coletarDados(pergunta){
  const u=uid();if(!u)return null;
  const meses=janelaDaPergunta(pergunta);
  const prodId=produtoDaPergunta(pergunta);
  const[sales,ads,exp]=await Promise.all([
    supabaseClient.getMonthlySalesRange(u,meses),
    supabaseClient.getAdsSummaryRange(u,meses),
    supabaseClient.getMonthlyExpensesRange(u,meses)
  ]);
  // consolidação oficial — mesma fórmula do Dashboard/Financeiro (sem duplicar nada)
  const a=window.PainelConsolida.consolidar({sales:sales||[],ads:ads||[],exp:exp||[]},
    allProducts(),meses,{unitCosts:S().unitCosts});
  const porMkt=Object.entries(a.byPlat).map(([k,v])=>({
    marketplace:platName(k),faturamento:n2(v.rev),unidades:v.units,ads:n2(v.ads),
    imposto:n2(v.tax),custo:n2(v.cost),lucroOperacional:n2(v.operational),
    lucroAposAds:n2(v.operational-v.ads),margem:v.rev>0?n2((v.operational-v.ads)/v.rev*100):null
  })).sort((x,y)=>y.faturamento-x.faturamento);
  const porMes=a.months.map(m=>{const b=a.byMonth[m],ger=a.expByMonth[m]||0;return{
    mes:m,faturamento:n2(b.rev),unidades:b.units,ads:n2(b.ads),imposto:n2(b.tax),
    lucroOperacional:n2(b.operational),lucroLiquido:n2(b.operational-b.ads-ger),gastosGerais:n2(ger)
  }});
  const porProduto=Object.entries(a.byProd).map(([id,v])=>({
    produto:v.name,sku:v.sku||'',faturamento:n2(v.rev),unidades:v.units,imposto:n2(v.tax),
    custo:n2(v.cost),lucroOperacional:n2(v.operational),lucroAposAds:n2(v.operational-v.ads),
    margem:v.rev>0?n2((v.operational-v.ads)/v.rev*100):null
  })).sort((x,y)=>y.faturamento-x.faturamento).slice(0,40); // limita tamanho
  const prodNome=prodId?(allProducts().find(p=>p.id===prodId)||{}).name:null;
  return{
    periodo:{de:meses[0],ate:meses[meses.length-1],meses:meses.length,mesesComDados:a.months.length},
    filtros:{marketplaces:'todos os marketplaces',produto:prodNome||'todos'},
    origem:'Dados salvos em Vendas (Resultado Mensal), consolidação oficial (mesma do Dashboard). Ads rateado e descontado 1x; gastos gerais 1x por mês; imposto pela taxa do canal.',
    totais:{
      faturamento:n2(a.total.rev),unidades:a.total.units,ads:n2(a.adsTotal),
      imposto:n2(a.dasCalc),gastosGerais:n2(a.gerais),lucroOperacional:n2(a.total.operational),
      lucroAposAds:n2(a.total.operational-a.adsTotal),lucroLiquido:n2(a.liquido),
      margemLiquida:a.total.rev>0?n2(a.liquido/a.total.rev*100):null
    },
    porMarketplace:porMkt,porMes,porProduto,
    vazio:a.total.rev===0&&a.months.length===0
  };
}

// ---------- markdown mínimo -> HTML (texto + tabelas), sem lib externa ----------
function inline(t){return esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}
function mdToHtml(md){
  const linhas=String(md||'').replace(/\r/g,'').split('\n');
  let html='',i=0;
  while(i<linhas.length){
    const l=linhas[i];
    // tabela markdown: linha com | seguida de separador |---|
    if(/\|/.test(l)&&i+1<linhas.length&&/^\s*\|?\s*:?-{2,}/.test(linhas[i+1].replace(/[^\|\-\s:]/g,''))&&linhas[i+1].includes('-')){
      const cels=r=>r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head=cels(l);i+=2;
      const rows=[];
      while(i<linhas.length&&linhas[i].includes('|')){rows.push(cels(linhas[i]));i++}
      html+='<div class="ai-tablewrap"><table class="ai-table"><thead><tr>'+head.map(h=>`<th>${inline(h)}</th>`).join('')+'</tr></thead><tbody>'
        +rows.map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';
      continue;
    }
    if(l.trim()===''){i++;continue}
    // agrupa linhas de parágrafo
    let par=[l];i++;
    while(i<linhas.length&&linhas[i].trim()!==''&&!linhas[i].includes('|')){par.push(linhas[i]);i++}
    html+='<p>'+par.map(inline).join('<br>')+'</p>';
  }
  return html||'<p>—</p>';
}

// ---------- UI ----------
function bolha(role,htmlOuTexto,isHtml){
  const box=el('aiMsgs');if(!box)return;
  const d=document.createElement('div');
  d.className='ai-msg '+(role==='user'?'ai-user':'ai-bot');
  d.innerHTML=isHtml?htmlOuTexto:('<p>'+esc(htmlOuTexto)+'</p>');
  box.appendChild(d);box.scrollTop=box.scrollHeight;
  return d;
}
function abrir(){const p=el('aiPanel');if(!p)return;p.classList.remove('hidden');el('aiInput').focus();
  if(!historico.length&&!el('aiMsgs').children.length)bolha('bot','Olá! Sou o assistente do painel (somente leitura). Pergunte sobre faturamento, lucro, margem, Ads, impostos, despesas, produtos ou marketplaces.');
}
function fechar(){const p=el('aiPanel');if(p)p.classList.add('hidden')}

async function enviar(texto){
  const q=(texto||el('aiInput').value||'').trim();
  if(!q||ocupado)return;
  if(!uid()){bolha('bot','Faça login para usar o assistente.');return}
  el('aiInput').value='';
  historico.push({role:'user',content:q});
  bolha('user',q);
  ocupado=true;el('aiSend').disabled=true;
  const carregando=bolha('bot','<p class="ai-load">Consultando seus dados…</p>',true);
  try{
    const dataset=await coletarDados(q);
    const r=await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+(supabaseClient.getToken()||'')},
      body:JSON.stringify({question:q,history:historico.slice(-6),dataset})
    });
    let j=null;try{j=await r.json()}catch(e){}
    carregando.remove();
    if(!r.ok||!j){
      const semApi=r.status===404||r.status===501||r.status===405;
      bolha('bot',semApi
        ?'O assistente só funciona no site publicado (Vercel), com a função /api/chat e a OPENAI_API_KEY configurada.'
        :((j&&j.error)?j.error:'Não foi possível responder agora.'));
    }else{
      const html=mdToHtml(j.answer||'');
      const d=bolha('bot',html,true);
      historico.push({role:'assistant',content:j.answer||''});
    }
  }catch(e){
    carregando.remove();
    bolha('bot','Erro ao consultar: '+e.message);
  }finally{
    ocupado=false;el('aiSend').disabled=false;el('aiInput').focus();
  }
}

function montar(){
  if(el('aiFab'))return;
  const wrap=document.createElement('div');
  wrap.id='aiWidget';
  wrap.innerHTML=
    '<button id="aiFab" type="button" aria-label="Abrir assistente IA" title="Assistente IA">'
     +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'
    +'</button>'
    +'<section id="aiPanel" class="hidden" role="dialog" aria-label="Assistente IA">'
     +'<div class="ai-head"><b>Assistente IA</b><span class="ai-ro">somente leitura</span><button id="aiClose" type="button" aria-label="Fechar">✕</button></div>'
     +'<div id="aiMsgs" class="ai-msgs"></div>'
     +'<div id="aiSug" class="ai-sug">'+SUGESTOES.map(s=>`<button type="button" class="ai-chip">${esc(s)}</button>`).join('')+'</div>'
     +'<form id="aiForm" class="ai-form"><input id="aiInput" type="text" maxlength="600" placeholder="Pergunte sobre seus dados…" autocomplete="off"><button id="aiSend" type="submit" class="btn primary">Enviar</button></form>'
    +'</section>';
  document.body.appendChild(wrap);
  el('aiFab').onclick=()=>{const p=el('aiPanel');p.classList.contains('hidden')?abrir():fechar()};
  el('aiClose').onclick=fechar;
  el('aiForm').addEventListener('submit',e=>{e.preventDefault();enviar()});
  wrap.querySelectorAll('.ai-chip').forEach(b=>b.onclick=()=>enviar(b.textContent));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
window.PainelAssistente={coletarDados,mdToHtml,janelaDaPergunta}; // exposto para teste
})();
