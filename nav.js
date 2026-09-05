'use strict';
// ---------- NAVEGAÇÃO POR MÓDULOS ----------
// Menu lateral (recolhível no desktop, gaveta no celular) + seletor de canal no topo.
// Não substitui a lógica das telas: cada módulo aponta para uma view que já existe e
// o render continua sendo disparado por showView() (performance.js).
(function(){
const el=x=>document.getElementById(x);
const VIEWS=['inicioView','pricingView','performanceView','monthlyView','dashboardView','produtosView','estoqueView','financeiroView','despesasView','configView'];
// módulos que dependem de um canal específico (não aceitam "Todos")
const NEEDS_CHANNEL={vendas:1,precificacao:1,anuncios:1};
// módulos onde o seletor de canal não faz sentido (Dashboard sempre consolida tudo)
const NO_CHANNEL={inicio:1,dash:1,produtos:1,estoque:1,financeiro:1,despesas:1,config:1};
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
  // Barra inferior (celular): destaca o item direto OU "Mais" quando o módulo atual
  // está dentro do painel "Mais" (Precificação, Produtos, Anúncios, Financeiro, Despesas, Config).
  const BN_DIRECT={inicio:1,dash:1,vendas:1,estoque:1};
  document.querySelectorAll('.bn-item[data-bn]').forEach(b=>{
    const on=BN_DIRECT[mod]?b.dataset.bn===mod:b.dataset.bn==='mais';
    b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');
  });
  const t=el('pageTitle');
  if(t){
    const base=btn.dataset.title||btn.textContent.trim();
    const sel=el('platformSelect');
    const chan=(!NO_CHANNEL[mod]&&sel&&sel.value)?PLATFORMS[sel.value]&&PLATFORMS[sel.value].name:null;
    t.textContent=chan?base+' — '+chan:base;
  }
  syncChannelUI(mod);
  closeDrawer();
  closeMore();
  try{localStorage.setItem('painel_modulo',mod)}catch(e){}
  // dispara o render da tela correspondente
  const map={dashboardView:'dash',monthlyView:'monthly',pricingView:'pricing',performanceView:'perf'};
  if(map[view]&&typeof window.showViewExternal==='function')window.showViewExternal(map[view]);
  if(view==='produtosView'&&typeof window.renderProdutos==='function')window.renderProdutos();
  if(view==='estoqueView'&&typeof window.renderEstoque==='function')window.renderEstoque();
  if(view==='financeiroView'&&typeof window.renderFinanceiro==='function')window.renderFinanceiro();
  if(view==='inicioView'&&typeof window.renderInicio==='function')window.renderInicio();
  if(view==='despesasView'&&typeof window.renderDespesas==='function')window.renderDespesas();
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

// ---------- painel "Mais" (barra inferior, celular) ----------
// Abre os módulos que não cabem na barra inferior + tema/usuário/sair (movidos do
// cabeçalho no celular). Não duplica lógica: os botões de tema aqui usam o MESMO
// atributo data-theme-choice que o cabeçalho — app.js já sincroniza os dois.
function openMore(){
  const s=el('moreSheet');if(!s)return;
  s.classList.remove('hidden');
  document.body.classList.add('more-open');
  const btn=el('bnMore');if(btn)btn.setAttribute('aria-expanded','true');
}
function closeMore(){
  const s=el('moreSheet');if(!s)return;
  s.classList.add('hidden');
  document.body.classList.remove('more-open');
  const btn=el('bnMore');if(btn)btn.setAttribute('aria-expanded','false');
}

// ---------- eventos ----------
items().forEach(b=>b.onclick=()=>go(b.dataset.module));
if(el('navToggle'))el('navToggle').onclick=()=>setCollapsed(!document.body.classList.contains('nav-collapsed'));
if(el('navBurger'))el('navBurger').onclick=()=>document.body.classList.contains('nav-open')?closeDrawer():openDrawer();
if(el('navScrim'))el('navScrim').onclick=closeDrawer;
// Barra inferior: os 4 atalhos diretos navegam; "Mais" abre o painel com o resto dos
// módulos. O painel usa os MESMOS módulos/telas do menu lateral — nenhuma view nova.
document.querySelectorAll('.bn-item[data-bn]').forEach(b=>{
  b.onclick=()=>{if(b.dataset.bn==='mais')(el('moreSheet')&&el('moreSheet').classList.contains('hidden'))?openMore():closeMore();else go(b.dataset.bn)};
});
document.querySelectorAll('.more-item[data-module]').forEach(b=>b.onclick=()=>go(b.dataset.module));
if(el('moreScrim'))el('moreScrim').onclick=closeMore;
if(el('moreClose'))el('moreClose').onclick=closeMore;
// Sair do painel "Mais" aciona o mesmo botão do cabeçalho (mesmo padrão de proxy usado abaixo)
if(el('moreLogout')&&el('logoutBtn'))el('moreLogout').onclick=()=>el('logoutBtn').click();
// Raio do cabeçalho e da barra lateral levam ao Início (navegação client-side)
['sideBolt','topBolt'].forEach(idb=>{const b=el(idb);if(b)b.onclick=()=>go('inicio')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeMore()}});

if(el('platformSelect'))el('platformSelect').onchange=()=>{
  const v=el('platformSelect').value;
  if(v){lastChannel=v;applyPlatform(v)}
  // Módulos independentes de canal (Produtos, Estoque, Configurações) não recarregam:
  // trocar o canal não pode mexer na lista nem no item em edição.
  if(NO_CHANNEL[current])return;
  go(current,{silent:true});
  if(!v&&typeof window.renderDashboard==='function'&&current==='dash')window.renderDashboard();
};

// Configurações reaproveita os botões globais que saíram do cabeçalho
const proxy=(from,to)=>{const a=el(from),b=el(to);if(a&&b)a.onclick=()=>b.click()};
proxy('cfgExport','exportBtn');proxy('cfgImport','importBtn');proxy('cfgPrint','printBtn');

// mostra o e-mail do usuário no topo quando a sessão carrega
window.navSetUser=email=>{
  const u=el('topUser');if(u){u.textContent=email?email.split('@')[0]:'';u.title=email||''}
  const m=el('moreUser');if(m)m.textContent=email?('Conectado como '+email):'';
};

window.navigateTo=go;
window.navCurrentModule=()=>current;

// estado inicial
try{if(localStorage.getItem(COLLAPSE_KEY)==='1')setCollapsed(true)}catch(e){}
if(el('platformSelect'))el('platformSelect').value='mercadolivre';
let inicial='inicio';
try{const m=localStorage.getItem('painel_modulo');if(m&&itemOf(m))inicial=m}catch(e){}
go(inicial,{silent:true});

// ---------- acordeões da Precificação ----------
// No celular cada seção vira um acordeão (só a 1ª aberta). No desktop o cabeçalho some
// via CSS, então TODOS precisam ficar `open` — senão o conteúdo sumiria junto.
const accQuery=window.matchMedia('(min-width:901px)');
let accApplying=false; // ignora os toggles que o próprio código dispara
function syncAcc(){
  const desk=accQuery.matches;
  accApplying=true;
  document.querySelectorAll('#pricingView .acc').forEach((d,i)=>{
    // Desktop: SEMPRE aberto. O cabeçalho some no CSS, então um <details> fechado
    // esconderia a seção inteira em navegadores que respeitam isso (Safari/Firefox).
    if(desk)d.open=true;
    else if(!d.dataset.userSet)d.open=(i===0); // celular: só a 1ª aberta
  });
  accApplying=false;
}
document.querySelectorAll('#pricingView .acc').forEach(d=>{
  d.addEventListener('toggle',()=>{if(!accApplying&&!accQuery.matches)d.dataset.userSet='1'});
});
if(accQuery.addEventListener)accQuery.addEventListener('change',syncAcc);
else if(accQuery.addListener)accQuery.addListener(syncAcc);
// rede de segurança: nem todo ambiente dispara o change do matchMedia
let accT=null;
window.addEventListener('resize',()=>{clearTimeout(accT);accT=setTimeout(syncAcc,120)});
syncAcc();
})();
