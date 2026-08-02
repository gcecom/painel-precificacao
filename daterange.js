'use strict';
// ---------- Seletores de data compartilhados (Dashboard + Resultado Mensal) ----------
// Um único componente de "popover" (botão compacto + painel flutuante) reaproveitado
// por dois seletores: intervalo de período (Dashboard) e mês único (Resultado Mensal).
// Todas as datas são LOCAIS — nunca uso new Date("YYYY-MM-DD") (que parseia como UTC e
// pode pular um dia). Trabalho só com fatias de string e Date(ano, mes, dia) local.
(function(){
const el=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');

// Data local -> "YYYY-MM"
const ymOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
const thisMonth=()=>ymOf(new Date());
// soma n meses a um "YYYY-MM" (n pode ser negativo), sempre local
function addMonths(ym,n){const[y,m]=ym.split('-').map(Number);return ymOf(new Date(y,(m-1)+n,1))}
const thisYear=()=>String(new Date().getFullYear());

// Formatação BR
const fmtMonthBR=ym=>/^\d{4}-\d{2}$/.test(ym||'')?ym.slice(5)+'/'+ym.slice(0,4):'—';
const fmtRange=(f,t)=>f===t?fmtMonthBR(f):fmtMonthBR(f)+' – '+fmtMonthBR(t);
// Presets de período (só MENSAIS: a base salva é por mês, não existe dado diário —
// por isso não há "últimos 7/30 dias" aqui).
const RANGE_PRESETS=[
  {k:'mes',   label:'Mês atual',        range:()=>[thisMonth(),thisMonth()]},
  {k:'mesant',label:'Mês anterior',     range:()=>[addMonths(thisMonth(),-1),addMonths(thisMonth(),-1)]},
  {k:'3m',    label:'Últimos 3 meses',  range:()=>[addMonths(thisMonth(),-2),thisMonth()]},
  {k:'6m',    label:'Últimos 6 meses',  range:()=>[addMonths(thisMonth(),-5),thisMonth()]},
  {k:'ano',   label:'Este ano',         range:()=>[thisYear()+'-01',thisMonth()]},
  {k:'custom',label:'Personalizado',    custom:true},
];
const DEFAULT_KEY='3m'; // padrão: últimos 3 meses (janela mensal útil sem exigir escolha)

const registry={}; // id do input -> { refresh() } para atualizar o rótulo do botão

// ---------- shell reaproveitável do popover ----------
function makePopover(host){
  host.classList.add('dp');
  const btn=document.createElement('button');btn.type='button';btn.className='dp-btn';
  const pop=document.createElement('div');pop.className='dp-pop hidden';
  host.append(btn,pop);
  const isOpen=()=>!pop.classList.contains('hidden');
  const onDoc=e=>{if(!host.contains(e.target))close()};
  const onKey=e=>{if(e.key==='Escape')close()};
  function open(){pop.classList.remove('hidden');host.classList.add('dp-open');document.addEventListener('mousedown',onDoc,true);document.addEventListener('keydown',onKey,true)}
  function close(){pop.classList.add('hidden');host.classList.remove('dp-open');document.removeEventListener('mousedown',onDoc,true);document.removeEventListener('keydown',onKey,true)}
  btn.onclick=()=>isOpen()?close():open();
  return{btn,pop,open,close,isOpen};
}

// ---------- Dashboard: botão de período (intervalo de meses) ----------
function mountRange(hostId,fromId,toId,renderHook){
  const host=el(hostId);if(!host)return;
  const{btn,pop,close}=makePopover(host);

  // Guarda o preset escolhido explicitamente. Como os dados são mensais, vários presets
  // de "dias" caem no mesmo intervalo de meses no começo do mês; por isso o rótulo segue
  // a escolha do usuário, não uma inferência a partir do intervalo.
  let lastKey=DEFAULT_KEY,customDates=null;

  RANGE_PRESETS.forEach(p=>{
    const o=document.createElement('button');
    o.type='button';o.className='dp-opt';o.textContent=p.label;o.dataset.k=p.k;
    o.onclick=()=>{ if(p.custom){toggleCustom();return} const[f,t]=p.range();applyRange(f,t,{key:p.k}) };
    pop.appendChild(o);
  });
  // Personalizado = mês inicial e mês final (a base é mensal)
  const cust=document.createElement('div');cust.className='dp-custom';
  cust.innerHTML='<label>Mês inicial</label><input type="month" data-cf>'
               +'<label>Mês final</label><input type="month" data-ct>'
               +'<button type="button" class="dp-apply">Aplicar</button>';
  pop.appendChild(cust);
  const cf=cust.querySelector('[data-cf]'),ct=cust.querySelector('[data-ct]');
  function toggleCustom(){
    cust.classList.toggle('show');
    if(cust.classList.contains('show')){ // parte do período atual ao abrir
      if(!cf.value)cf.value=(el(fromId)&&el(fromId).value)||thisMonth();
      if(!ct.value)ct.value=(el(toId)&&el(toId).value)||thisMonth();
    }
  }
  cust.querySelector('.dp-apply').onclick=()=>{
    if(!/^\d{4}-\d{2}$/.test(cf.value)||!/^\d{4}-\d{2}$/.test(ct.value))return;
    const a=cf.value<=ct.value?cf.value:ct.value,b=cf.value<=ct.value?ct.value:cf.value; // ordena por string YYYY-MM
    applyRange(a,b,{key:'custom',a,b});
  };

  function matchPreset(f,t){for(const p of RANGE_PRESETS){if(p.custom)continue;const[pf,pt]=p.range();if(pf===f&&pt===t)return p}return null}
  function setLabel(){
    const f=el(fromId)&&el(fromId).value,t=el(toId)&&el(toId).value;
    let txt,activeK=lastKey;
    if(lastKey==='custom'&&customDates){txt=fmtRange(customDates.a,customDates.b)}
    else{
      const p=RANGE_PRESETS.find(x=>x.k===lastKey&&!x.custom);
      if(p)txt=p.label;
      else{const mp=matchPreset(f,t);if(mp){txt=mp.label;activeK=mp.k}else{txt=(f&&t)?fmtRange(f,t):'Selecionar período';activeK='custom'}}
    }
    btn.textContent=txt;
    pop.querySelectorAll('.dp-opt').forEach(o=>o.classList.toggle('active',o.dataset.k===activeK));
  }
  function applyRange(f,t,opt){
    opt=opt||{};
    lastKey=opt.key||'custom';
    customDates=(lastKey==='custom'&&opt.a&&opt.b)?{a:opt.a,b:opt.b}:null;
    if(el(fromId))el(fromId).value=f;
    if(el(toId))el(toId).value=t;
    setLabel();
    // mesma via do onchange já existente no dashboard.js → renderDashboard(true)
    if(el(fromId))el(fromId).dispatchEvent(new Event('change',{bubbles:true}));
    close();
  }
  function ensureDefault(){ // padrão quando não há período definido
    if(el(fromId)&&el(toId)&&(!el(fromId).value||!el(toId).value)){
      const[f,t]=RANGE_PRESETS.find(p=>p.k===DEFAULT_KEY).range();
      el(fromId).value=f;el(toId).value=t;lastKey=DEFAULT_KEY;customDates=null;
    }
  }
  ensureDefault();setLabel();
  registry[fromId]={refresh:()=>setLabel()};

  // Reaplica o padrão e mantém o rótulo em sincronia mesmo quando a tela limpa os campos
  // (ex.: resetDashboard). Não altera cálculo: só garante o período e o texto do botão.
  if(renderHook){
    const orig=window[renderHook];
    if(typeof orig==='function'){
      window[renderHook]=function(){ensureDefault();const r=orig.apply(this,arguments);setLabel();return r};
    }
  }
}

// ---------- Resultado Mensal: botão de mês único "MM/AAAA" ----------
function mountMonth(hostId,inputId){
  const host=el(hostId);if(!host)return;
  const{btn,pop,close}=makePopover(host);
  const cur=()=>{const v=el(inputId)&&el(inputId).value;return /^\d{4}-\d{2}$/.test(v)?v:thisMonth()};
  const mkOpt=(label,fn)=>{const o=document.createElement('button');o.type='button';o.className='dp-opt';o.textContent=label;o.onclick=fn;return o};

  const optAtual=mkOpt('Mês atual',()=>apply(thisMonth()));
  const optAnt=mkOpt('Mês anterior',()=>apply(addMonths(thisMonth(),-1)));
  pop.append(optAtual,optAnt);
  const cust=document.createElement('div');cust.className='dp-custom show';
  cust.innerHTML='<label>Escolher mês e ano</label><input type="month" data-m>'
               +'<button type="button" class="dp-apply">Aplicar</button>';
  pop.appendChild(cust);
  const minput=cust.querySelector('[data-m]');
  cust.querySelector('.dp-apply').onclick=()=>{if(/^\d{4}-\d{2}$/.test(minput.value))apply(minput.value)};

  function apply(ym){
    if(el(inputId)){el(inputId).value=ym;el(inputId).dispatchEvent(new Event('change',{bubbles:true}))}
    setLabel();close();
  }
  function setLabel(){
    const c=cur();btn.textContent=fmtMonthBR(c);minput.value=c;
    optAtual.classList.toggle('active',c===thisMonth());
    optAnt.classList.toggle('active',c===addMonths(thisMonth(),-1));
  }
  btn.addEventListener('click',()=>{minput.value=cur()}); // sincroniza o campo manual ao abrir
  setLabel();
  registry[inputId]={refresh:setLabel};
}

// API pública: performance.js chama refresh('monthlyMonth') quando o mês muda por outro caminho
window.PainelPeriod={thisMonth,addMonths,refresh(id){const a=registry[id];if(a&&a.refresh)try{a.refresh()}catch(e){}}};

// Monta os seletores (os elementos já existem no HTML estático)
mountRange('dashPeriod','dashFrom','dashTo','renderDashboard');
mountRange('finPeriod','finFrom','finTo','renderFinanceiro');
mountMonth('monthlyMonthPicker','monthlyMonth');
})();
