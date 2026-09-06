'use strict';
// ---------- MODO CONSULTA NO CELULAR (≤768px) ----------
// Só interface. Nenhum cálculo, dado ou evento existente é alterado: os controles novos
// são PROXIES que manipulam os MESMOS elementos que as páginas já usam e disparam o
// MESMO evento 'change' que os handlers atuais escutam. Nada é duplicado — os chips são
// gerados a partir das opções do próprio <select id="platformSelect">, e o seletor de mês
// escreve no mesmo <input id="monthlyMonth"> que o performance.js já lê.
(function(){
const el=x=>document.getElementById(x);
const mq=window.matchMedia('(max-width:768px)');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- 1) chips de marketplace ----------
// Espelham o <select> do cabeçalho: clicar num chip é o mesmo que escolher no select.
function montaChips(){
  const box=el('cqChips'),sel=el('platformSelect');
  if(!box||!sel||box._pronto)return;
  box._pronto=true;
  box.innerHTML=[...sel.options].map(o=>
    `<button type="button" class="chip cq-chip" data-v="${esc(o.value)}"${o.disabled?' disabled':''}>${esc(o.textContent)}</button>`
  ).join('');
  box.querySelectorAll('.cq-chip').forEach(b=>b.onclick=()=>{
    if(b.disabled)return;
    sel.value=b.dataset.v;
    sel.dispatchEvent(new Event('change'));   // mesmo caminho do onchange já existente
    pintaChips();
  });
  sel.addEventListener('change',pintaChips);  // ouvinte ADICIONAL, não substitui o do nav.js
}
function pintaChips(){
  const box=el('cqChips'),sel=el('platformSelect');
  if(!box||!sel)return;
  box.querySelectorAll('.cq-chip').forEach(b=>{
    const opt=[...sel.options].find(o=>o.value===b.dataset.v);
    b.disabled=!!(opt&&opt.disabled);
    b.classList.toggle('on',b.dataset.v===sel.value);
  });
}
// Segue a mesma regra do seletor "Canal": se ele está oculto naquele módulo, os chips também.
function sincronizaChips(){
  const box=el('cqChips'),pick=el('chanPick');
  if(!box||!pick)return;
  box.classList.toggle('hidden',!mq.matches||pick.hidden);
  pintaChips();
}
window.cqSyncChips=sincronizaChips;   // nav.js chama após trocar de módulo

// ---------- 2) seletor compacto de mês  ‹ 01/2026 › ----------
// ‹ › andam um mês; tocar no rótulo abre o MESMO seletor já existente (.dp-btn).
const pad=n=>String(n).padStart(2,'0');
function desloca(mes,passo){
  if(!/^\d{4}-\d{2}$/.test(mes||''))return mes;
  let[y,m]=mes.split('-').map(Number);
  m+=passo;
  if(m<1){m=12;y--}else if(m>12){m=1;y++}
  return y+'-'+pad(m);
}
const rotulo=m=>/^\d{4}-\d{2}$/.test(m||'')?m.slice(5)+'/'+m.slice(0,4):'—';

function montaMes(bar){
  if(bar._pronto)return;
  const input=el(bar.dataset.input);
  if(!input)return;
  bar._pronto=true;
  const lab=bar.querySelector('.cq-mo-label');
  const pinta=()=>{lab.textContent=rotulo(input.value)};
  bar.querySelectorAll('.cq-mo-nav').forEach(b=>b.onclick=()=>{
    const novo=desloca(input.value,+b.dataset.step||0);
    if(!novo||novo===input.value)return;
    input.value=novo;
    input.dispatchEvent(new Event('change'));  // troca o mês sem recarregar a página
    pinta();
    // Volta ao topo. Instantâneo (o nav.js usa o mesmo motivo) + um reforço curto: o
    // re-render assíncrono do mês muda a altura da página e cancelaria um scroll suave.
    const topo=()=>window.scrollTo({top:0,behavior:'instant'});
    topo();setTimeout(topo,60);setTimeout(topo,300);
  });
  lab.onclick=()=>{
    // abre o seletor que a própria página já monta (daterange.js) — nada de picker novo
    const host=el(bar.dataset.picker);
    const btn=host&&host.querySelector('.dp-btn');
    if(btn){btn.click();return}
    if(typeof input.showPicker==='function'){try{input.showPicker();return}catch(e){}}
    input.click();
  };
  input.addEventListener('change',pinta); // ouvinte ADICIONAL
  pinta();
}
function sincronizaMes(){
  // Barras com data-mirror (período de 1 mês: de = até) são do dashboard-mobile.js.
  // Sem este recorte, os dois módulos disputavam a mesma barra e vencia quem montasse
  // primeiro — o Dashboard ficava sem atualizar o "de", virando um período de 2 meses.
  document.querySelectorAll('.cq-month:not([data-mirror])').forEach(bar=>{
    montaMes(bar);
    bar.classList.toggle('hidden',!mq.matches);
    const input=el(bar.dataset.input),lab=bar.querySelector('.cq-mo-label');
    if(input&&lab)lab.textContent=rotulo(input.value);
  });
}

// ---------- 3) "Editar dados" fechado no celular, transparente no desktop ----------
// `aplicando` ignora os toggles disparados pelo PRÓPRIO código: mudar .open emite o
// evento 'toggle' igual a um clique, e sem isso o primeiro fechamento automático já
// marcava o bloco como "aberto pelo usuário". Mesmo padrão do accApplying no nav.js.
let aplicando=false;
function sincronizaAcordeoes(){
  aplicando=true;
  document.querySelectorAll('.cq-acc').forEach(d=>{
    if(mq.matches){ if(!d._tocado)d.open=false }   // respeita quem já abriu na mão
    else d.open=true;                              // desktop: sempre aberto (igual ao .acc)
  });
  aplicando=false;
}
document.querySelectorAll('.cq-acc').forEach(d=>{
  d.addEventListener('toggle',()=>{if(!aplicando&&mq.matches)d._tocado=1});
});

function sync(){montaChips();sincronizaChips();sincronizaMes();sincronizaAcordeoes()}
if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
document.addEventListener('DOMContentLoaded',sync);
sync();
let rt=null;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(sync,150)});
})();
