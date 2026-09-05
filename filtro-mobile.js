'use strict';
// ---------- FILTROS EM PAINEL INFERIOR NO CELULAR (≤768px) ----------
// Componente visual genérico: em telas ≤768px, os campos de FILTRO de cada
// `.dash-filters` (Dashboard, Produtos, Estoque, Financeiro, Despesas) entram num
// painel inferior aberto pelo botão "Filtrar"; os valores ativos aparecem como chips.
//
// Os campos são MOVIDOS (não clonados) para dentro do painel — continuam sendo os
// MESMOS elementos que cada página já lê por id (document.getElementById funciona em
// qualquer lugar do documento). Nenhuma lógica de filtro de nenhuma página é tocada.
// Botões de AÇÃO (.dash-filter-actions: "Novo produto", "Salvar estoque", "Atualizar"…)
// não são movidos — continuam sempre visíveis, sem depender do painel de filtros.
(function(){
const mq=window.matchMedia('(max-width:768px)');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seq=0;

function labelOf(field){const l=field.querySelector('label');return l?l.textContent.trim():''}
function valueOf(field){
  const inp=field.querySelector('input,select');if(!inp)return'';
  if(inp.type==='hidden')return'';
  if(inp.tagName==='SELECT'){const o=inp.options[inp.selectedIndex];return o&&o.value?o.textContent.trim():''}
  return(inp.value||'').trim();
}

function setup(block){
  if(block._fm)return;
  const fields=[...block.children].filter(c=>c.classList.contains('field'));
  if(!fields.length)return;
  const id='fm'+(++seq);

  const trigger=document.createElement('div');
  trigger.className='fm-trigger hidden';
  trigger.innerHTML=`<button type="button" class="btn fm-btn">🔎 Filtrar</button><div class="fm-chips"></div>`;
  block.before(trigger);

  const sheet=document.createElement('div');
  sheet.className='fm-sheet hidden';
  sheet.innerHTML=`<div class="fm-scrim"></div><div class="fm-panel" role="dialog" aria-modal="true" aria-label="Filtros">
      <div class="fm-head"><b>Filtros</b><button type="button" class="fm-close" aria-label="Fechar">✕</button></div>
      <div class="fm-body" id="${id}-body"></div>
      <div class="fm-foot"><button type="button" class="btn primary fm-apply">Ver resultados</button></div>
    </div>`;
  document.body.appendChild(sheet);
  const body=sheet.querySelector('.fm-body');
  const actions=block.querySelector('.dash-filter-actions');
  fields.forEach(f=>body.appendChild(f)); // move — preserva os listeners de cada página

  function chips(){
    const box=trigger.querySelector('.fm-chips');
    const partes=fields.map(f=>({l:labelOf(f),v:valueOf(f)})).filter(x=>x.v);
    box.innerHTML=partes.map(x=>`<span class="chip fm-chip">${x.l?esc(x.l)+': ':''}${esc(x.v)}</span>`).join('');
    trigger.querySelector('.fm-btn').textContent=partes.length?`🔎 Filtrar (${partes.length})`:'🔎 Filtrar';
  }
  function abrir(){sheet.classList.remove('hidden');document.body.classList.add('fm-open')}
  function fechar(){sheet.classList.add('hidden');document.body.classList.remove('fm-open');chips()}
  trigger.querySelector('.fm-btn').onclick=abrir;
  sheet.querySelector('.fm-close').onclick=fechar;
  sheet.querySelector('.fm-scrim').onclick=fechar;
  sheet.querySelector('.fm-apply').onclick=fechar;
  body.addEventListener('input',chips);
  body.addEventListener('change',chips);
  chips();

  block._fm={trigger,sheet,fields,actions};
}

function sync(){
  const on=mq.matches;
  document.querySelectorAll('.dash-filters').forEach(block=>{
    setup(block);
    const r=block._fm;if(!r)return;
    if(on){
      r.trigger.classList.remove('hidden');
      block.classList.add('hidden');
    }else{
      // volta pro desktop: devolve os campos para a posição original (antes das ações),
      // exatamente como no HTML de origem — nunca depois, mesmo após ir e voltar do mobile.
      r.trigger.classList.add('hidden');
      r.sheet.classList.add('hidden');
      document.body.classList.remove('fm-open');
      block.classList.remove('hidden');
      r.fields.forEach(f=>r.actions?block.insertBefore(f,r.actions):block.appendChild(f));
    }
  });
}
if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
document.addEventListener('DOMContentLoaded',sync);
sync();
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.fm-sheet:not(.hidden)').forEach(s=>{s.classList.add('hidden');document.body.classList.remove('fm-open')})});
})();
