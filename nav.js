'use strict';
// ---------- NAVEGAÇÃO POR MÓDULOS ----------
// Menu lateral (recolhível no desktop, gaveta no celular) + seletor de canal no topo.
// Não substitui a lógica das telas: cada módulo aponta para uma view que já existe e
// o render continua sendo disparado por showView() (performance.js).
(function(){
const el=x=>document.getElementById(x);
const VIEWS=['pricingView','performanceView','monthlyView','dashboardView','produtosView','estoqueView','financeiroView','configView'];
// módulos que dependem de um canal específico (não aceitam "Todos")
const NEEDS_CHANNEL={vendas:1,precificacao:1,anuncios:1};
// módulos onde o seletor de canal não faz sentido
const NO_CHANNEL={produtos:1,estoque:1,config:1};
const COLLAPSE_KEY='painel_nav_collapsed';
let current='dash',lastChannel='mercadolivre';

function items(){return[...document.querySelectorAll('.side-item')]}
function itemOf(mod){return items().find(b=>b.dataset.module===mod)}

// Aciona o botão oculto de plataforma: preserva os handlers já existentes
// (app.js applyTheme + performance.js re-render por marketplace).
function applyPlatform(p){
  const btn=document.querySelector(`.platform-btn[data-platform="${p}"]`);
  if(btn)btn.click();
}

function syncChannelUI(mod){
  const pick=el('chanPick'),sel=el('platformSelect');
  if(!pick||!sel)return;
  pick.hidden=!!NO_CHANNEL[mod];
  const todos=sel.querySelector('option[value=""]');
  if(todos)todos.disabled=!!NEEDS_CHANNEL[mod];
  if(NEEDS_CHANNEL[mod]&&!sel.value){sel.value=lastChannel;applyPlatform(lastChannel)}
}

function go(mod,opts){
  const btn=itemOf(mod);if(!btn)return;
  current=mod;
  const view=btn.dataset.view;
  VIEWS.forEach(v=>{const e=el(v);if(e)e.classList.toggle('hidden',v!==view)});
  items().forEach(b=>{const on=b.dataset.module===mod;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false')});
  const t=el('pageTitle');
  if(t){
    const base=btn.dataset.title||btn.textContent.trim();
    const sel=el('platformSelect');
    const chan=(!NO_CHANNEL[mod]&&sel&&sel.value)?PLATFORMS[sel.value]&&PLATFORMS[sel.value].name:null;
    t.textContent=chan?base+' — '+chan:base;
  }
  syncChannelUI(mod);
  closeDrawer();
  try{localStorage.setItem('painel_modulo',mod)}catch(e){}
  // dispara o render da tela correspondente
  const map={dashboardView:'dash',monthlyView:'monthly',pricingView:'pricing',performanceView:'perf'};
  if(map[view]&&typeof window.showViewExternal==='function')window.showViewExternal(map[view]);
  if(view==='produtosView'&&typeof window.renderProdutos==='function')window.renderProdutos();
  if(view==='estoqueView'&&typeof window.renderEstoque==='function')window.renderEstoque();
  if(view==='configView'){const u=el('cfgUser');if(u){let e='';try{e=(currentUser&&currentUser.email)||''}catch(x){}u.textContent=e?('Conectado como '+e):'Faça login para ver os dados da conta.'}}
  if(!opts||!opts.silent)window.scrollTo({top:0,behavior:'instant'});
}

// ---------- recolher / gaveta ----------
function setCollapsed(on){
  document.body.classList.toggle('nav-collapsed',!!on);
  const b=el('navToggle');if(b){b.textContent=on?'›':'‹';b.setAttribute('aria-label',on?'Expandir menu':'Recolher menu')}
  try{localStorage.setItem(COLLAPSE_KEY,on?'1':'0')}catch(e){}
}
function openDrawer(){document.body.classList.add('nav-open');const s=el('navScrim');if(s)s.hidden=false}
function closeDrawer(){document.body.classList.remove('nav-open');const s=el('navScrim');if(s)s.hidden=true}

// ---------- eventos ----------
items().forEach(b=>b.onclick=()=>go(b.dataset.module));
if(el('navToggle'))el('navToggle').onclick=()=>setCollapsed(!document.body.classList.contains('nav-collapsed'));
if(el('navBurger'))el('navBurger').onclick=()=>document.body.classList.contains('nav-open')?closeDrawer():openDrawer();
if(el('navScrim'))el('navScrim').onclick=closeDrawer;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});

if(el('platformSelect'))el('platformSelect').onchange=()=>{
  const v=el('platformSelect').value;
  if(v){lastChannel=v;applyPlatform(v)}
  go(current,{silent:true});
  if(!v&&typeof window.renderDashboard==='function'&&current==='dash')window.renderDashboard();
};

// Configurações reaproveita os botões globais que saíram do cabeçalho
const proxy=(from,to)=>{const a=el(from),b=el(to);if(a&&b)a.onclick=()=>b.click()};
proxy('cfgExport','exportBtn');proxy('cfgImport','importBtn');proxy('cfgPrint','printBtn');

// mostra o e-mail do usuário no topo quando a sessão carrega
window.navSetUser=email=>{const u=el('topUser');if(u){u.textContent=email?email.split('@')[0]:'';u.title=email||''}};

window.navigateTo=go;
window.navCurrentModule=()=>current;

// estado inicial
try{if(localStorage.getItem(COLLAPSE_KEY)==='1')setCollapsed(true)}catch(e){}
if(el('platformSelect'))el('platformSelect').value='mercadolivre';
let inicial='dash';
try{const m=localStorage.getItem('painel_modulo');if(m&&itemOf(m))inicial=m}catch(e){}
go(inicial,{silent:true});
})();
