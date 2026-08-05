'use strict';
// ---------- ASSISTENTE INTERNO — SOMENTE LEITURA, SEM API EXTERNA ----------
// Botão de chat flutuante em todas as páginas. Interpreta a pergunta localmente
// (palavras-chave, produto, marketplace e período) e responde usando a CONSOLIDAÇÃO
// OFICIAL do painel (PainelConsolida) sobre os dados do próprio usuário (RLS pelo JWT
// do Supabase). Nada de OpenAI, nada de /api/chat. Nunca escreve, nunca inventa número.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2));
const fmtPct=v=>S().fmtPct?S().fmtPct(v):((v*100||0).toFixed(2)+'%');
const fmtInt=v=>S().fmtInt?S().fmtInt(v):String(v||0);
const monthLabel=m=>S().monthLabel?S().monthLabel(m):m;
function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function allProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function platName(k){try{return PLATFORMS[k].name}catch(e){return k}}

let historico=[],ocupado=false;
const SUGESTOES=[
  'Produto mais rentável',
  'Itens mais vendidos nos últimos 3 meses',
  'Qual marketplace teve maior margem?',
  'Compare faturamento e lucro mensal'
];
const AJUDA=[
  'Produto mais rentável','Lucro de um produto por marketplace','Itens mais vendidos por período',
  'Marketplace com maior faturamento, lucro ou margem','Comparação mensal (faturamento e lucro)',
  'Ads, impostos e despesas do período','Valor e situação do estoque',
  'Produtos com prejuízo ou com estoque baixo'
];

// ---------- interpretação ----------
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const pad=n=>String(n).padStart(2,'0');
function mesesAte(n){const d=new Date(),out=[];for(let i=n-1;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);out.push(x.getFullYear()+'-'+pad(x.getMonth()+1))}return out}
function janelaDaPergunta(q){
  const s=norm(q);
  if(/\b3\s*mes|ultimos?\s*3\b|trimestre/.test(s))return mesesAte(3);
  if(/\b6\s*mes|ultimos?\s*6\b|semestre/.test(s))return mesesAte(6);
  if(/este ano|neste ano|ano atual|no ano/.test(s)){const y=new Date().getFullYear(),m=new Date().getMonth()+1,out=[];for(let i=1;i<=m;i++)out.push(y+'-'+pad(i));return out}
  return mesesAte(12);
}
function produtoDaPergunta(q){
  const s=norm(q);
  const p=allProducts().find(x=>x.name&&x.name.length>=4&&s.includes(norm(x.name)));
  return p?p.id:null;
}
function marketplaceDaPergunta(q){
  const s=norm(q);
  if(/mercado livre|\bml\b|meli/.test(s))return'mercadolivre';
  if(/shopee/.test(s))return'shopee';
  if(/amazon/.test(s))return'amazon';
  if(/magalu|magazine/.test(s))return'magalu';
  return null;
}
function detectar(s,prodId){
  if(/estoque\s*baix|repor|abaixo do min|sem estoque|falta.*estoque/.test(s))return'estoqueBaixo';
  if(/preju[ií]?zo|no vermelho|negativ|dando perda/.test(s))return'prejuizo';
  if(/estoque|invent[aá]?rio/.test(s))return'estoque';
  if(prodId&&/(lucro|rent|margem).*(marketplace|canal|mercado livre|shopee|amazon|magalu)|por marketplace/.test(s))return'lucroProdutoPorMkt';
  if(/mais rent[aá]?vel|mais lucrativ|maior lucro|melhor produto/.test(s))return'produtoRentavel';
  if(/mais vendid|itens? mais|ranking|unidades vendid|quantidade vendid|top.*vend/.test(s))return'maisVendidos';
  if(/(marketplace|canal).*(faturament|lucro|margem)|(faturament|lucro|margem).*(marketplace|canal)/.test(s))return'marketplaceMaior';
  if(/compar|faturamento e lucro|por m[eê]s|mensal|evolu/.test(s))return'comparacaoMensal';
  if(/\bads\b|an[uú]?ncio|tacos|acos|publicidade|investiment/.test(s))return'ads';
  if(/imposto|\bdas\b|tributo/.test(s))return'impostos';
  if(/despesa|gastos gerais|conta.*pagar|custo fixo/.test(s))return'despesas';
  if(prodId)return'produtoResumo';
  return'ajuda';
}

// ---------- dados (consolidação oficial, só do usuário) ----------
async function rawDoPeriodo(meses){
  const u=uid();
  const[sales,ads,exp]=await Promise.all([
    supabaseClient.getMonthlySalesRange(u,meses),
    supabaseClient.getAdsSummaryRange(u,meses),
    supabaseClient.getMonthlyExpensesRange(u,meses)
  ]);
  return{sales:sales||[],ads:ads||[],exp:exp||[]};
}
function cons(raw,meses,opts){return window.PainelConsolida.consolidar(raw,allProducts(),meses,Object.assign({unitCosts:S().unitCosts},opts||{}))}
async function estoqueSnap(){
  try{if(typeof window.stockEnsureLoaded==='function'){await window.stockEnsureLoaded();
    if(typeof window.stockSnapshot==='function'){const s=window.stockSnapshot();if(s&&s.loaded)return s}}}catch(e){}
  return null;
}
async function despesasDoPeriodo(meses){
  try{
    const rows=await supabaseClient.getExpenses(uid());
    const de=meses[0],ate=meses[meses.length-1];
    return(rows||[]).filter(r=>{const m=String(r.due_date||'').slice(0,7);return m>=de&&m<=ate});
  }catch(e){return[]}
}

// ---------- markdown -> HTML (texto + tabelas) ----------
function tabela(head,rows){
  return'| '+head.join(' | ')+' |\n| '+head.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n');
}
function inline(t){return esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>')}
function mdToHtml(md){
  const linhas=String(md||'').replace(/\r/g,'').split('\n');let html='',i=0;
  while(i<linhas.length){
    const l=linhas[i];
    if(/\|/.test(l)&&i+1<linhas.length&&/-{2,}/.test(linhas[i+1])&&linhas[i+1].includes('|')){
      const cels=r=>r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head=cels(l);i+=2;const rows=[];
      while(i<linhas.length&&linhas[i].includes('|')){rows.push(cels(linhas[i]));i++}
      html+='<div class="ai-tablewrap"><table class="ai-table"><thead><tr>'+head.map(h=>`<th>${inline(h)}</th>`).join('')+'</tr></thead><tbody>'
        +rows.map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';
      continue;
    }
    if(l.trim()===''){i++;continue}
    let par=[l];i++;
    while(i<linhas.length&&linhas[i].trim()!==''&&!linhas[i].includes('|')){par.push(linhas[i]);i++}
    html+='<p>'+par.map(inline).join('<br>')+'</p>';
  }
  return html||'<p>—</p>';
}

// ---------- rodapé de transparência ----------
function rodape(meses,filtroTxt){
  const de=monthLabel(meses[0]),ate=monthLabel(meses[meses.length-1]);
  return`\n\n_Período: ${de} a ${ate} · Filtros: ${filtroTxt||'todos os marketplaces e produtos'} · Origem: dados salvos em Vendas — consolidação oficial do painel._`;
}
const semDados=(meses,f)=>`Não há dados salvos neste período.${rodape(meses,f)}`;

// ---------- resposta (interna) ----------
async function responder(q){
  const s=norm(q);
  const meses=janelaDaPergunta(q);
  const prodId=produtoDaPergunta(q);
  const plat=marketplaceDaPergunta(q);
  const intent=detectar(s,prodId);
  const filtroTxt=(plat?platName(plat):'todos os marketplaces')+(prodId?(' · produto: '+(allProducts().find(p=>p.id===prodId)||{}).name):'');

  // estoque não depende de período
  if(intent==='estoque'||intent==='estoqueBaixo'){
    const st=await estoqueSnap();
    if(!st)return'Não consegui ler o estoque agora. Abra a aba **Estoque** ao menos uma vez.';
    if(intent==='estoque'){
      return`**Estoque atual:**\n\n`+tabela(['Indicador','Valor'],[
        ['Valor em estoque (custo)',fmtMoney(st.total)],
        ['Potencial de venda',fmtMoney(st.potential)],
        ['Produtos sem estoque',fmtInt(st.out)],
        ['Produtos abaixo do mínimo',fmtInt(st.low)]
      ])+'\n\n_Origem: aba Estoque (custo × quantidade). Somente leitura._';
    }
    const baixos=(st.rows||[]).filter(r=>r.status==='out'||r.status==='low')
      .sort((a,b)=>(a.qty-b.qty)).slice(0,15);
    if(!baixos.length)return'Nenhum produto sem estoque ou abaixo do mínimo agora. 👍';
    return`**Produtos que precisam de reposição (${baixos.length}):**\n\n`+tabela(['Produto','Qtd','Mín.','Situação'],
      baixos.map(r=>[r.p.name,fmtInt(r.qty),fmtInt(r.min),r.status==='out'?'Sem estoque':'Abaixo do mínimo']))
      +'\n\n_Origem: aba Estoque. Somente leitura._';
  }

  const raw=await rawDoPeriodo(meses);
  const a=cons(raw,meses,plat?{fPlat:plat}:{});
  const vazio=a.total.rev===0&&Object.keys(a.byMonth).length===0;

  if(intent==='produtoRentavel'){
    if(vazio)return semDados(meses,filtroTxt);
    const list=Object.values(a.byProd).map(v=>({n:v.name,fat:v.rev,lucro:v.operational-v.ads,mg:v.rev>0?(v.operational-v.ads)/v.rev:NaN}))
      .sort((x,y)=>y.lucro-x.lucro).slice(0,8);
    const top=list[0];
    return`O produto mais rentável é **${top.n}**, com lucro (após Ads) de **${fmtMoney(top.lucro)}** e margem ${fmtPct(top.mg)}.\n\n`
      +tabela(['Produto','Faturamento','Lucro','Margem'],list.map(p=>[p.n,fmtMoney(p.fat),fmtMoney(p.lucro),fmtPct(p.mg)]))
      +rodape(meses,filtroTxt);
  }

  if(intent==='lucroProdutoPorMkt'){
    const af=cons(raw,meses,{fProd:prodId});
    const nome=(allProducts().find(p=>p.id===prodId)||{}).name;
    const rows=Object.entries(af.byPlat).map(([k,v])=>({m:platName(k),fat:v.rev,lucro:v.operational-v.ads,mg:v.rev>0?(v.operational-v.ads)/v.rev:NaN}))
      .sort((x,y)=>y.lucro-x.lucro);
    if(!rows.length)return`Não há vendas de **${nome}** neste período.${rodape(meses,'produto: '+nome)}`;
    return`**Lucro de ${nome} por marketplace:**\n\n`
      +tabela(['Marketplace','Faturamento','Lucro','Margem'],rows.map(r=>[r.m,fmtMoney(r.fat),fmtMoney(r.lucro),fmtPct(r.mg)]))
      +rodape(meses,'produto: '+nome);
  }

  if(intent==='maisVendidos'){
    if(vazio)return semDados(meses,filtroTxt);
    const list=Object.values(a.byProd).map(v=>({n:v.name,u:v.units,fat:v.rev})).sort((x,y)=>y.u-x.u).slice(0,8);
    return`**Itens mais vendidos:**\n\n`+tabela(['Produto','Unidades','Faturamento'],list.map(p=>[p.n,fmtInt(p.u),fmtMoney(p.fat)]))+rodape(meses,filtroTxt);
  }

  if(intent==='marketplaceMaior'){
    if(vazio)return semDados(meses,filtroTxt);
    let metrica='faturamento';if(/margem/.test(s))metrica='margem';else if(/lucro/.test(s))metrica='lucro';
    const rows=Object.entries(a.byPlat).map(([k,v])=>({m:platName(k),fat:v.rev,lucro:v.operational-v.ads,mg:v.rev>0?(v.operational-v.ads)/v.rev:NaN,u:v.units}));
    rows.sort((x,y)=>metrica==='margem'?(y.mg-x.mg):metrica==='lucro'?(y.lucro-x.lucro):(y.fat-x.fat));
    const top=rows[0];
    const val=metrica==='margem'?fmtPct(top.mg):metrica==='lucro'?fmtMoney(top.lucro):fmtMoney(top.fat);
    return`Maior ${metrica}: **${top.m}** (${val}).\n\n`
      +tabela(['Marketplace','Faturamento','Lucro','Margem','Unid.'],rows.map(r=>[r.m,fmtMoney(r.fat),fmtMoney(r.lucro),fmtPct(r.mg),fmtInt(r.u)]))
      +rodape(meses,filtroTxt);
  }

  if(intent==='comparacaoMensal'){
    if(vazio)return semDados(meses,filtroTxt);
    const rows=a.months.map(m=>{const b=a.byMonth[m],ger=a.expByMonth[m]||0;return[monthLabel(m),fmtMoney(b.rev),fmtMoney(b.operational-b.ads-ger),fmtInt(b.units)]});
    return`**Faturamento e lucro por mês:**\n\n`+tabela(['Mês','Faturamento','Lucro líquido','Unid.'],rows)
      +`\n\nTotal do período: faturamento ${fmtMoney(a.total.rev)}, lucro líquido ${fmtMoney(a.liquido)}.`+rodape(meses,filtroTxt);
  }

  if(intent==='ads'){
    if(vazio&&a.adsTotal===0)return semDados(meses,filtroTxt);
    const rows=Object.entries(a.byPlat).filter(([,v])=>v.ads>0||v.rev>0).map(([k,v])=>[platName(k),fmtMoney(v.ads),v.rev>0?fmtPct(v.ads/v.rev):'—']);
    return`**Ads no período:** total ${fmtMoney(a.adsTotal)} · TACOS ${fmtPct(a.tacos)} (Ads ÷ faturamento).\n\n`
      +tabela(['Marketplace','Ads','TACOS'],rows)+rodape(meses,filtroTxt);
  }

  if(intent==='impostos'){
    if(vazio)return semDados(meses,filtroTxt);
    const rows=Object.entries(a.byPlat).map(([k,v])=>[platName(k),fmtMoney(v.rev),fmtMoney(v.tax)]);
    return`**Imposto sobre vendas (calculado, faturamento × taxa):** total ${fmtMoney(a.dasCalc)}.\n\n`
      +tabela(['Marketplace','Faturamento','Imposto'],rows)
      +`\n\n_O imposto já está dentro do lucro operacional — exibido, não descontado de novo. DAS informado em Vendas no período: ${fmtMoney(a.dasOficial)}._`+rodape(meses,filtroTxt);
  }

  if(intent==='despesas'){
    const desp=await despesasDoPeriodo(meses);
    const totalDesp=desp.reduce((x,d)=>x+(+d.amount||0),0);
    const porCat={};desp.forEach(d=>{porCat[d.category]=(porCat[d.category]||0)+(+d.amount||0)});
    const cats=Object.entries(porCat).sort((x,y)=>y[1]-x[1]).slice(0,10);
    let md=`**Despesas no período:**\n- Gastos gerais (Vendas): **${fmtMoney(a.gerais)}** (descontados 1×/mês no Dashboard/Financeiro).\n- Despesas cadastradas (aba Despesas): **${fmtMoney(totalDesp)}** em ${desp.length} lançamento(s).`;
    if(cats.length)md+='\n\n'+tabela(['Categoria','Valor'],cats.map(([c,v])=>[c,fmtMoney(v)]));
    return md+rodape(meses,filtroTxt);
  }

  if(intent==='prejuizo'){
    if(vazio)return semDados(meses,filtroTxt);
    const list=Object.values(a.byProd).map(v=>({n:v.name,lucro:v.operational-v.ads,fat:v.rev})).filter(p=>p.lucro<0).sort((x,y)=>x.lucro-y.lucro);
    if(!list.length)return`Nenhum produto no prejuízo neste período. 👍${rodape(meses,filtroTxt)}`;
    return`**Produtos no prejuízo (${list.length}):**\n\n`+tabela(['Produto','Faturamento','Prejuízo'],list.slice(0,12).map(p=>[p.n,fmtMoney(p.fat),fmtMoney(p.lucro)]))+rodape(meses,filtroTxt);
  }

  if(intent==='produtoResumo'){
    const af=cons(raw,meses,{fProd:prodId});
    const nome=(allProducts().find(p=>p.id===prodId)||{}).name;
    if(af.total.rev===0)return`Não há vendas de **${nome}** neste período.${rodape(meses,'produto: '+nome)}`;
    return`**${nome}** no período:\n\n`+tabela(['Indicador','Valor'],[
      ['Faturamento',fmtMoney(af.total.rev)],['Unidades',fmtInt(af.total.units)],
      ['Imposto',fmtMoney(af.total.tax)],['Ads',fmtMoney(af.adsTotal)],
      ['Lucro após Ads',fmtMoney(af.total.operational-af.adsTotal)],
      ['Margem',fmtPct(af.total.rev>0?(af.total.operational-af.adsTotal)/af.total.rev:NaN)]
    ])+rodape(meses,'produto: '+nome);
  }

  // não entendeu
  return'Não entendi a pergunta. Posso responder sobre:\n\n'+AJUDA.map(x=>'• '+x).join('\n');
}

// ---------- UI (interface preservada) ----------
function bolha(role,htmlOuTexto,isHtml){
  const box=el('aiMsgs');if(!box)return;
  const d=document.createElement('div');
  d.className='ai-msg '+(role==='user'?'ai-user':'ai-bot');
  d.innerHTML=isHtml?htmlOuTexto:('<p>'+esc(htmlOuTexto)+'</p>');
  box.appendChild(d);box.scrollTop=box.scrollHeight;return d;
}
function abrir(){const p=el('aiPanel');if(!p)return;p.classList.remove('hidden');el('aiInput').focus();
  if(!historico.length&&!el('aiMsgs').children.length)bolha('bot','Olá! Sou o assistente do painel (somente leitura, sem enviar seus dados para fora). Pergunte sobre faturamento, lucro, margem, Ads, impostos, despesas, produtos, marketplaces ou estoque.');}
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
    const md=await responder(q);
    carregando.remove();
    bolha('bot',mdToHtml(md),true);
    historico.push({role:'assistant',content:md});
  }catch(e){
    carregando.remove();
    bolha('bot','Não consegui consultar seus dados: '+e.message);
  }finally{ocupado=false;el('aiSend').disabled=false;el('aiInput').focus()}
}

function montar(){
  if(el('aiFab'))return;
  const wrap=document.createElement('div');wrap.id='aiWidget';
  wrap.innerHTML=
    '<button id="aiFab" type="button" aria-label="Abrir assistente" title="Assistente do painel">'
     +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'
    +'</button>'
    +'<section id="aiPanel" class="hidden" role="dialog" aria-label="Assistente do painel">'
     +'<div class="ai-head"><b>Assistente</b><span class="ai-ro">somente leitura</span><button id="aiClose" type="button" aria-label="Fechar">✕</button></div>'
     +'<div id="aiMsgs" class="ai-msgs"></div>'
     +'<div id="aiSug" class="ai-sug">'+SUGESTOES.map(x=>`<button type="button" class="ai-chip">${esc(x)}</button>`).join('')+'</div>'
     +'<form id="aiForm" class="ai-form"><input id="aiInput" type="text" maxlength="300" placeholder="Pergunte sobre seus dados…" autocomplete="off"><button id="aiSend" type="submit" class="btn primary">Enviar</button></form>'
    +'</section>';
  document.body.appendChild(wrap);
  el('aiFab').onclick=()=>{el('aiPanel').classList.contains('hidden')?abrir():fechar()};
  el('aiClose').onclick=fechar;
  el('aiForm').addEventListener('submit',e=>{e.preventDefault();enviar()});
  wrap.querySelectorAll('.ai-chip').forEach(b=>b.onclick=()=>enviar(b.textContent));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
window.PainelAssistente={responder,detectar,janelaDaPergunta,mdToHtml}; // exposto para teste
})();
