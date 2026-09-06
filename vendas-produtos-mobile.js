'use strict';
// ---------- "PRODUTOS VENDIDOS" EM CARTÕES, RECOLHIDO (≤768px) ----------
// Só apresentação. Lê a tabela que o performance.js já desenhou (thead + tbody) e monta
// cartões compactos ao lado — nenhum número é recalculado, nada é gravado e a tabela
// original continua intacta no DOM (só sai da tela no celular). Desktop não é tocado.
//
// A lista só é montada quando o bloco é ABERTO: fechado, nenhum cartão existe no DOM.
(function(){
const el=x=>document.getElementById(x);
const mq=window.matchMedia('(max-width:768px)');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let aberto=false;

// Colunas que vão no resumo do cartão; o resto entra em "Detalhes".
const RESUMO=['rev','profit'];               // faturamento e lucro (unidades vêm do input)
const ROTULO={adsUnit:'Ads por venda',rev:'Faturamento',comm:'Comissão + tarifas',
  frete:'Frete / outros',tax:'Imposto',cost:'Custo produtos',ads:'Ads total',
  profit:'Lucro líquido',margin:'% margem'};

function linhas(){
  const tb=el('monthlyTable'); if(!tb)return[];
  // só produtos COM lançamento no mês — numa tela de consulta, listar os zerados é ruído
  return [...tb.querySelectorAll('tbody tr[data-mid]')].filter(tr=>{
    const u=tr.querySelector('input[data-mo="units"]');
    return u&&(+u.value||0)>0;
  });
}
function contaTexto(n){return n===1?'1 produto':n+' produtos'}

function pintaCabecalho(){
  const h=el('moProdHead'),q=el('moProdQtd'); if(!h||!q)return;
  const n=linhas().length;
  q.textContent=contaTexto(n);
  h.setAttribute('aria-expanded',aberto?'true':'false');
  h.classList.toggle('on',aberto);
}

function montaCartoes(){
  const box=el('moProdCards'),tb=el('monthlyTable');
  if(!box||!tb)return;
  const heads=[...tb.querySelectorAll('thead th')].map(th=>th.textContent.replace(/[↓↑]/g,'').trim());
  const rows=linhas();
  if(!rows.length){
    box.innerHTML='<p class="help" style="padding:12px">Nenhum produto com venda lançada neste mês.</p>';
    return;
  }
  box.innerHTML=rows.map((tr,i)=>{
    const nome=(tr.querySelector('.mo-name')||{}).innerHTML||'';
    const un=tr.querySelector('input[data-mo="units"]');
    const unidades=un?(un.value||'0'):'0';
    const val=c=>{const td=tr.querySelector(`td[data-c="${c}"]`);return td?td.textContent.trim():'—'};
    const neg=(tr.querySelector('td[data-c="profit"]')||{}).className||'';
    const detalhes=['adsUnit','comm','frete','tax','cost','ads','margin']
      .map(c=>`<div class="mo-card-row"><span>${esc(ROTULO[c]||c)}</span><b>${esc(val(c))}</b></div>`).join('');
    return `<article class="mo-card">
      <div class="mo-card-top"><b class="mo-card-name">${nome}</b></div>
      <div class="mo-card-nums">
        <div><span>Unidades</span><b>${esc(unidades)}</b></div>
        <div><span>Faturamento</span><b>${esc(val('rev'))}</b></div>
        <div><span>Lucro</span><b class="${neg.includes('neg')?'neg':'pos'}">${esc(val('profit'))}</b></div>
      </div>
      <button type="button" class="mo-card-det" data-i="${i}">Detalhes</button>
      <div class="mo-card-body hidden" data-b="${i}">${detalhes}</div>
    </article>`;
  }).join('');
  box.querySelectorAll('.mo-card-det').forEach(b=>b.onclick=()=>{
    const alvo=box.querySelector(`[data-b="${b.dataset.i}"]`); if(!alvo)return;
    const abrir=alvo.classList.contains('hidden');
    alvo.classList.toggle('hidden',!abrir);
    b.textContent=abrir?'Ocultar detalhes':'Detalhes';
  });
}

function abre(v){
  aberto=!!v;
  const box=el('moProdCards');
  if(!box)return;
  if(aberto){montaCartoes();box.classList.remove('hidden')}
  else{box.classList.add('hidden');box.innerHTML=''}  // fechado = sem lista no DOM
  pintaCabecalho();
}
function recolhe(){if(aberto)abre(false);else{const b=el('moProdCards');if(b)b.innerHTML='';pintaCabecalho()}}

function sync(){
  const on=mq.matches;
  const h=el('moProdHead'),box=el('moProdCards');
  if(h)h.classList.toggle('hidden',!on);
  if(!on){aberto=false;if(box){box.classList.add('hidden');box.innerHTML=''}return}
  pintaCabecalho();
}

// eventos
const h=el('moProdHead');
if(h)h.onclick=()=>abre(!aberto);

// A tabela é redesenhada pelo performance.js a cada mudança: mantém o contador em dia
// e, se estiver aberto, refaz os cartões a partir do HTML novo.
const tb=el('monthlyTable');
// sync() (e não só pintaCabecalho) porque entrar em Vendas também redesenha a tabela:
// assim a visibilidade do cabeçalho é reavaliada sem depender do evento de resize.
if(tb)new MutationObserver(()=>{
  sync();
  if(mq.matches&&aberto)montaCartoes();
}).observe(tb,{childList:true,subtree:true});

// Trocar mês ou marketplace recolhe de novo (requisito): os dois já disparam eventos
// próprios que o performance.js escuta — aqui só reagimos, sem interferir neles.
const mm=el('monthlyMonth');
if(mm)mm.addEventListener('change',recolhe);
document.querySelectorAll('.platform-btn[data-platform]').forEach(b=>b.addEventListener('click',recolhe));
const ps=el('platformSelect');
if(ps)ps.addEventListener('change',recolhe);

if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
document.addEventListener('DOMContentLoaded',sync);
sync();
let rt=null;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(sync,150)});
})();
