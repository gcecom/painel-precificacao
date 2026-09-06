'use strict';
// ---------- DASHBOARD EM MODO CONSULTA NO CELULAR (≤768px) ----------
// Só apresentação. Não recalcula nada: o resumo é LIDO dos KPIs que o dashboard.js já
// desenhou, e o gráfico de 12 meses usa as MESMAS peças públicas do painel
// (supabaseClient + PainelConsolida.consolidar + PainelShared.unitCosts +
// PainelDespesas.aplicarCompetencia + PainelCharts.lineChart). Nenhuma fórmula nova.
// O desktop não é afetado: tudo aqui só liga em telas ≤768px.
(function(){
const el=x=>document.getElementById(x);
const mq=window.matchMedia('(max-width:768px)');
const S=()=>window.PainelShared||{};
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2));
const monthLabel=m=>/^\d{4}-\d{2}$/.test(m||'')?m.slice(5)+'/'+m.slice(0,4):'—';
// currentUser/products são `let` globais do app.js — acessíveis pelo nome, nunca por window.*
function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function catalogo(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
const pad=n=>String(n).padStart(2,'0');

// ---------- 1) seletor compacto de mês ----------
// Escreve nos MESMOS inputs do filtro de período (dashFrom/dashTo) e dispara o change
// que o dashboard.js já escuta — troca o mês sem recarregar a página.
function desloca(mes,passo){
  if(!/^\d{4}-\d{2}$/.test(mes||''))return mes;
  let[y,m]=mes.split('-').map(Number);
  m+=passo; if(m<1){m=12;y--}else if(m>12){m=1;y++}
  return y+'-'+pad(m);
}
function montaMes(){
  const bar=el('cqMonthDash'); if(!bar||bar._pronto)return;
  const alvo=el(bar.dataset.input),espelho=el(bar.dataset.mirror);
  if(!alvo||!espelho)return;
  bar._pronto=true;
  const lab=bar.querySelector('.cq-mo-label');
  const pinta=()=>{lab.textContent=monthLabel(alvo.value)};
  bar.querySelectorAll('.cq-mo-nav').forEach(b=>b.onclick=()=>{
    const novo=desloca(alvo.value,+b.dataset.step||0);
    if(!novo||novo===alvo.value)return;
    espelho.value=novo; alvo.value=novo;         // período de 1 mês: de = até
    alvo.dispatchEvent(new Event('change'));      // um único render, o que já existia
    pinta();
    const topo=()=>window.scrollTo({top:0,behavior:'instant'});
    topo();setTimeout(topo,60);setTimeout(topo,320);
  });
  lab.onclick=()=>{                               // abre o seletor que a página já monta
    const host=el(bar.dataset.picker),btn=host&&host.querySelector('.dp-btn');
    if(btn)btn.click();
  };
  alvo.addEventListener('change',pinta);          // ouvinte ADICIONAL
  pinta();
}

// ---------- 2) chips de marketplace ----------
// O Dashboard sempre consolidou TUDO. Aqui o padrão continua "Todos"; escolher um
// marketplace só passa o filtro que a consolidação (consolida.js) já aceita há tempo.
let platAtual='';
function montaPlats(){
  const box=el('cqDashPlats'); if(!box||box._pronto)return;
  box._pronto=true;
  const P=(typeof PLATFORMS!=='undefined')?PLATFORMS:{};
  const itens=[['','Todos']].concat(Object.keys(P).map(k=>[k,P[k].name]));
  box.innerHTML=itens.map(([v,n])=>`<button type="button" class="chip cq-chip${v===platAtual?' on':''}" data-v="${v}">${n}</button>`).join('');
  box.querySelectorAll('.cq-chip').forEach(b=>b.onclick=()=>{
    platAtual=b.dataset.v;
    box.querySelectorAll('.cq-chip').forEach(x=>x.classList.toggle('on',x.dataset.v===platAtual));
    if(typeof window.dashSetPlatform==='function')window.dashSetPlatform(platAtual);
  });
}

// ---------- 3) cartão "Resumo do mês" ----------
// Lê os KPIs que o dashboard.js já renderizou — nenhum número é recalculado aqui.
const fmtInt=v=>S().fmtInt?S().fmtInt(v):String(Math.round(v||0));
function montaResumo(){
  const box=el('cqDashResumo'); if(!box)return;
  // Números vindos prontos do dashboard.js (mesma agregação da tela) — nunca raspados do
  // card, que o olho deixa mascarado e devolveria "R$ ••••••" como se fosse o valor.
  const d=window.__dashResumo;
  if(!d){box.classList.add('hidden');return}
  const sub=d.periodo||'';
  box.innerHTML=
    `<article class="kpi"><div class="label">Faturamento</div><div class="value">${fmtMoney(d.rev)}</div><div class="sub">${sub}</div></article>`+
    `<article class="kpi"><div class="label">Lucro líquido</div><div class="value">${fmtMoney(d.liquido)}</div><div class="sub">${sub}</div></article>`+
    `<article class="kpi"><div class="label">Unidades vendidas</div><div class="value">${fmtInt(d.units)}</div><div class="sub">${sub}</div></article>`;
  box.classList.remove('hidden');
  // O MESMO olho do dashboard.js, com o MESMO estado compartilhado (não duplica lógica)
  try{if(typeof window.PainelOlhoLucro==='function')window.PainelOlhoLucro('cqDashResumo','Lucro líquido')}catch(e){}
  // Ao alternar o olho, o dashboard.js repinta o card original de #dashKpis. Só depois
  // disso o valor real existe no DOM — por isso relemos o resumo (e o gráfico) no tick
  // seguinte, em vez de copiar um texto que ainda está mascarado.
  const olho=box.querySelector('.kpi-eye');
  if(olho&&!olho._g12){olho._g12=1;olho.addEventListener('click',()=>setTimeout(()=>{montaResumo();pintaGrafico()},0))}
}

// ---------- 4) gráfico de 12 meses ----------
let serie=null,carregando12=false;
const olhoAberto=()=>{
  const b=document.querySelector('#cqDashResumo .kpi-eye');
  return b?b.getAttribute('aria-pressed')==='true':true;
};
function ultimos12(ate){
  const base=/^\d{4}-\d{2}$/.test(ate||'')?ate:null;
  const d=base?new Date(+base.slice(0,4),+base.slice(5,7)-1,1):new Date();
  const out=[];
  for(let i=11;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);out.push(x.getFullYear()+'-'+pad(x.getMonth()+1))}
  return out;
}
async function carrega12(){
  const u=uid(); if(!u||carregando12)return;
  const meses=ultimos12(el('dashTo')&&el('dashTo').value);
  if(serie&&serie.chave===meses.join(',')+'|'+platAtual)return;
  carregando12=true;
  const stt=el('cqDashChartStatus'); if(stt){stt.className='status neutral';stt.textContent='carregando…'}
  try{
    const[sales,ads,exp,ents]=await Promise.all([
      supabaseClient.getMonthlySalesRange(u,meses),
      supabaseClient.getAdsSummaryRange(u,meses),
      supabaseClient.getMonthlyExpensesRange(u,meses),
      supabaseClient.getExpenses(u).catch(()=>[])
    ]);
    const a=window.PainelConsolida.consolidar(
      {sales:sales||[],ads:ads||[],exp:exp||[]},
      catalogo(),meses,
      {fPlat:platAtual,unitCosts:S().unitCosts});
    const _PD=window.PainelDespesas;
    if(_PD&&_PD.aplicarCompetencia)_PD.aplicarCompetencia(a,ents||[],meses);
    serie={chave:meses.join(',')+'|'+platAtual,meses,
      fat:meses.map(m=>a.byMonth[m]?a.byMonth[m].rev:0),
      liq:meses.map(m=>{const b=a.byMonth[m],g=a.expByMonth[m]||0;return b?(b.operational-b.ads-g):-g}),
      comDados:meses.filter(m=>a.byMonth[m]).length};
    if(stt){stt.className='status '+(serie.comDados?'good':'neutral');
      stt.textContent=serie.comDados?serie.comDados+' mês(es) com dados':'sem dados'}
  }catch(e){
    serie=null;
    if(stt){stt.className='status bad';stt.textContent='erro'}
    const box=el('cqDashChartBox'); if(box)box.innerHTML='<p class="help">Não foi possível carregar o gráfico.</p>';
  }finally{carregando12=false;pintaGrafico()}
}
function pintaGrafico(){
  const box=el('cqDashChartBox'),C=window.PainelCharts;
  if(!box||!C||!C.lineChart||!serie)return;
  // O olho vale também aqui: fechado, a linha de lucro não é desenhada.
  const series=[{name:'Faturamento',data:serie.fat}];
  if(olhoAberto())series.push({name:'Lucro líquido',data:serie.liq,neg:true}); // prejuízo em vermelho
  box.innerHTML=C.lineChart(serie.meses.map(monthLabel),series);
}

// ---------- 5) "Ver detalhes" ----------
function montaMais(){
  const b=el('cqDashMore'); if(!b||b._pronto)return;
  b._pronto=true;
  b.onclick=()=>{
    const v=el('dashboardView'),aberto=v.classList.toggle('cq-open');
    b.textContent=aberto?'Ocultar detalhes':'Ver detalhes';
  };
}

// ---------- 6) sincronização ----------
function sync(){
  const on=mq.matches;
  ['cqDashBar','cqDashResumo','cqDashChart','cqDashMore'].forEach(id=>{
    const e=el(id); if(e&&id!=='cqDashResumo')e.classList.toggle('hidden',!on);
  });
  if(!on){
    const r=el('cqDashResumo'); if(r)r.classList.add('hidden');
    const v=el('dashboardView'); if(v)v.classList.remove('cq-open');
    const b=el('cqDashMore'); if(b)b.textContent='Ver detalhes';
    return;
  }
  montaMes();montaPlats();montaMais();montaResumo();
  const lab=el('cqMonthDash')&&el('cqMonthDash').querySelector('.cq-mo-label');
  const alvo=el('dashTo'); if(lab&&alvo)lab.textContent=monthLabel(alvo.value);
  carrega12();
}
// Os KPIs são redesenhados pelo dashboard.js a cada render — o observer mantém o
// resumo e o gráfico em dia sem precisar alterar aquele arquivo.
const alvoKpis=el('dashKpis');
if(alvoKpis){
  new MutationObserver(()=>{if(mq.matches){montaResumo();carrega12()}})
    .observe(alvoKpis,{childList:true});
}
if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
document.addEventListener('DOMContentLoaded',sync);
sync();
let rt=null;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(sync,150)});

// Assistente no painel "Mais" (proxy para o botão flutuante que já existe)
const mA=el('moreAssistente');
if(mA)mA.onclick=()=>{
  const fechar=el('moreClose'); if(fechar)fechar.click();   // fecha o painel "Mais"
  const f=el('aiFab'); if(f)f.click();                      // abre o assistente que já existe
};
})();
