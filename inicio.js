'use strict';
// ---------- PÁGINA INICIAL ----------
// Tela de entrada: saudação, resumo do mês mais recente SALVO, atalhos e avisos curtos.
// Somente leitura — não cria tabela nem duplica o Dashboard: usa a mesma consolidação
// (PainelConsolida), os mesmos formatadores (PainelShared) e o snapshot do Estoque.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):v;
const monthLabel=m=>S().monthLabel?S().monthLabel(m):m;
const esc=s=>S().esc?S().esc(s):String(s??'');
const kpi=(l,v,s)=>S().kpi?S().kpi(l,v,s):'';

function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function allProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}

let loading=false,lastKey='';

// Atalhos -> mesmos módulos do menu lateral (navegação client-side, sem recarregar)
const ATALHOS=[
  ['dash','Dashboard Geral','▤','Visão completa do negócio'],
  ['produtos','Produtos','◳','Cadastro central'],
  ['estoque','Estoque','▦','Quantidades e mínimos'],
  ['vendas','Vendas','↗','Resultado mensal'],
  ['precificacao','Precificação','◈','Simular preço por canal'],
  ['anuncios','Anúncios','◎','Relatórios e ACOS'],
  ['financeiro','Financeiro','$','DRE simplificada'],
];

function saudacao(){
  const h=new Date().getHours();
  return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
}
function primeiroNome(){
  try{
    const e=(currentUser&&currentUser.email)||'';
    if(!e)return'';
    const n=e.split('@')[0].replace(/[._-]+/g,' ').trim();
    return n?n.charAt(0).toUpperCase()+n.slice(1):'';
  }catch(e){return''}
}

function renderAtalhos(){
  const box=el('inicioAtalhos');if(!box)return;
  box.innerHTML=ATALHOS.map(([mod,nome,ico,desc])=>
    `<button type="button" class="ini-shortcut" data-mod="${mod}">
       <span class="ini-sc-ico" aria-hidden="true">${ico}</span>
       <span class="ini-sc-txt"><b>${esc(nome)}</b><small>${esc(desc)}</small></span>
     </button>`).join('');
  box.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>{
    if(typeof window.navigateTo==='function')window.navigateTo(b.dataset.mod);
  });
}

// Avisos curtos e críticos — no máximo 3. Reaproveita o snapshot do Estoque.
function renderAlertas(a,st){
  const box=el('inicioAlertas'),stt=el('inicioAlertStatus');
  if(!box)return;
  const out=[];
  if(st&&st.rows){
    const sem=st.rows.filter(r=>r.status==='out'&&r.p.active!==false);
    const baixo=st.rows.filter(r=>r.status==='low');
    if(sem.length)out.push(['bad',`${sem.length} produto(s) sem estoque`,'Repor estoque','estoque']);
    if(baixo.length)out.push(['warn',`${baixo.length} produto(s) abaixo do mínimo`,'Repor estoque','estoque']);
  }
  if(a){
    if(a.total.rev>0&&a.liquido<0)out.push(['bad','Prejuízo no mês selecionado','Revisar margem','dash']);
    const tacos=a.tacos;
    if(Number.isFinite(tacos)&&tacos>0.2)out.push(['warn','Ads acima de 20% do faturamento','Revisar campanhas','anuncios']);
  }
  const top=out.slice(0,3); // no máximo 3
  if(stt){stt.className='status '+(top.length?(top[0][0]==='bad'?'bad':'warn'):'good');stt.textContent=top.length?top.length+' aviso(s)':'Tudo certo'}
  box.innerHTML=top.length
    ? top.map(([lvl,txt,acao,mod])=>
        `<button type="button" class="ini-alert ${lvl}" data-mod="${mod}">
           <span>${esc(txt)}</span><b>${esc(acao)}</b>
         </button>`).join('')
    : '<p class="help">Nenhum ponto crítico agora.</p>';
  box.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>{
    if(typeof window.navigateTo==='function')window.navigateTo(b.dataset.mod);
  });
}

function renderMeses(meses,atual){
  const box=el('inicioMeses');if(!box)return;
  if(!meses||!meses.length){box.innerHTML='<p class="help">Nenhum mês salvo ainda. Lance o resultado em <b>Vendas</b>.</p>';return}
  box.innerHTML=meses.slice(0,6).map(m=>
    `<button type="button" class="chip${m===atual?' active':''}" data-mo="${m}">${esc(monthLabel(m))}</button>`).join('');
  // abre o mês escolhido direto em Vendas (sem duplicar a tela aqui)
  box.querySelectorAll('[data-mo]').forEach(b=>b.onclick=()=>{
    const inp=el('monthlyMonth');
    if(inp){inp.value=b.dataset.mo;inp.dispatchEvent(new Event('change',{bubbles:true}))}
    if(typeof window.navigateTo==='function')window.navigateTo('vendas');
  });
}

async function render(){
  const hello=el('inicioHello'),sub=el('inicioSub');
  const nome=primeiroNome();
  if(hello)hello.textContent=saudacao()+(nome?', '+nome:'')+'!';
  renderAtalhos();

  const u=uid();
  if(!u){
    if(sub)sub.textContent='Faça login para ver o resumo do mês.';
    if(el('inicioKpis'))el('inicioKpis').innerHTML='';
    renderAlertas(null,null);renderMeses([],'');
    return;
  }
  if(loading)return;
  loading=true;
  try{
    const meses=await supabaseClient.listMonthlyMonths(u);
    const mes=(meses&&meses.length)?meses[0]:(S().thisMonth?S().thisMonth():'');
    renderMeses(meses,mes);
    if(!mes){if(sub)sub.textContent='Nenhum mês salvo ainda — comece lançando em Vendas.';loading=false;return}

    // 3 consultas (mesmo padrão do Dashboard) só para o mês mais recente
    const[sales,ads,exp]=await Promise.all([
      supabaseClient.getMonthlySalesRange(u,[mes]),
      supabaseClient.getAdsSummaryRange(u,[mes]),
      supabaseClient.getMonthlyExpensesRange(u,[mes])
    ]);
    const raw={sales:sales||[],ads:ads||[],exp:exp||[]};
    const a=window.PainelConsolida.consolidar(raw,allProducts(),[mes],{unitCosts:S().unitCosts});

    // estoque: reaproveita o módulo Estoque (sem recalcular fórmula)
    let st=null;
    try{
      if(typeof window.stockEnsureLoaded==='function'){
        await window.stockEnsureLoaded();
        if(typeof window.stockSnapshot==='function'){const sn=window.stockSnapshot();if(sn&&sn.loaded)st=sn}
      }
    }catch(e){}

    if(sub)sub.textContent='Resumo de '+monthLabel(mes)+' · todos os marketplaces.';
    if(el('inicioKpis'))el('inicioKpis').innerHTML=
      kpi('Faturamento',fmtMoney(a.total.rev),monthLabel(mes))+
      kpi('Lucro líquido',fmtMoney(a.liquido),a.liquido>=0?'Após Ads e gastos gerais':'Prejuízo no mês')+
      kpi('Ads',fmtMoney(a.adsTotal),'Gasto real do mês')+
      kpi('DAS sobre as vendas',fmtMoney(a.dasCalc),'Faturamento × taxa')+
      kpi('Valor do estoque',st?fmtMoney(st.total):'—',st?'Custo × quantidade':'Abra Estoque');

    renderAlertas(a,st);
    lastKey=u+'|'+mes;
  }catch(e){
    console.error('Erro na página inicial:',e);
    if(sub)sub.textContent='Não foi possível carregar o resumo: '+e.message;
  }finally{loading=false}
}

window.renderInicio=render;
window.resetInicio=()=>{lastKey='';};
})();
