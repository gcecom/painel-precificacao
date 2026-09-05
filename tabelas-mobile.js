'use strict';
// ---------- TABELAS EM CARTÃO NO CELULAR (≤768px) ----------
// Componente visual genérico, só para tabelas de LEITURA (sem campo editável):
// resumos do Dashboard e a lista de Produtos. NÃO toca em Vendas/Estoque — essas
// têm inputs por linha (unidades, preço, quantidade); mexer nelas aqui arriscaria
// quebrar o "Salvar". Nessas, a resposta mobile é só a coluna fixa + rolagem (CSS).
//
// Não recalcula nada: lê o HTML já pronto que a própria página desenhou (thead+tbody)
// e monta cartões ao lado. Um MutationObserver mantém os cartões sincronizados sempre
// que a página redesenha a tabela — sem exigir nenhuma mudança em dashboard.js/produtos.js.
(function(){
const IDS=['dashTablePlatform','dashTableProduct','dashTableMonth','prodTable'];
const mq=window.matchMedia('(max-width:768px)');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function hostFor(wrap){
  let host=wrap.nextElementSibling;
  if(!host||!host.classList||!host.classList.contains('mc-cards')){
    host=document.createElement('div');
    host.className='mc-cards hidden';
    wrap.after(host);
  }
  return host;
}

function buildCards(table){
  const wrap=table.closest('.table-wrap');if(!wrap)return;
  // Mover o botão de ação (ex.: "Editar") para dentro do cartão MEXE na própria tabela
  // observada (o <td> de origem perde um filho). Sem pausar, isso disparava o próprio
  // MutationObserver de novo e a 2ª passada destruía o botão já movido. Pausa e retoma
  // no fim, só para as mutações QUE ESTA FUNÇÃO faz — mudanças reais da página (a
  // próxima vez que produtos.js/dashboard.js redesenham a tabela) continuam detectadas.
  if(table._mcObs)table._mcObs.disconnect();
  const host=hostFor(wrap);
  const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  const rows=[...table.querySelectorAll('tbody tr')];
  const linhasDeDado=rows.filter(tr=>tr.children.length>=2);
  if(!heads.length||!linhasDeDado.length){
    // tabela vazia ou só com mensagem ("Carregando…", "Faça login…"): nada para converter,
    // devolve a tabela original (senão a mensagem sumiria sem nenhum cartão no lugar).
    host.innerHTML='';host.classList.add('hidden');wrap.classList.remove('hidden');
    if(table._mcObs)table._mcObs.observe(table,{childList:true,subtree:true});
    return;
  }
  host.innerHTML='';
  table._mcMoved=[]; // [td,btn] — para devolver o botão ao lugar se voltar pro desktop
  linhasDeDado.forEach(tr=>{
    const tds=[...tr.children];
    const first=tds[0],rest=tds.slice(1);
    const card=document.createElement('div');
    card.className='mc-card'+(tr.className?(' '+tr.className):'');
    const detId='mc-'+Math.random().toString(36).slice(2,9);
    card.innerHTML=`<div class="mc-card-top"><b class="mc-card-name">${first.innerHTML}</b>
      <button type="button" class="mc-toggle" data-target="${detId}">Ver detalhes</button></div>
      <div class="mc-card-body hidden" id="${detId}"></div>`;
    const body=card.querySelector('.mc-card-body');
    rest.forEach((td,i)=>{
      const row=document.createElement('div');
      row.className='mc-row';
      const btn=td.querySelector('button,a.btn');
      if(btn){
        // Ação com botão real (ex.: "Editar" em Produtos): MOVE o próprio botão (não
        // copia o HTML) — assim o clique continua ligado ao mesmo handler da página.
        table._mcMoved.push([td,btn]);
        const lbl=document.createElement('span');lbl.textContent=heads[i+1]||'';
        row.appendChild(lbl);row.appendChild(btn);
      }else{
        row.innerHTML=`<span>${esc(heads[i+1]||'')}</span><b>${td.innerHTML}</b>`;
      }
      body.appendChild(row);
    });
    host.appendChild(card);
  });
  host.querySelectorAll('.mc-toggle').forEach(b=>b.onclick=()=>{
    const t=document.getElementById(b.dataset.target);if(!t)return;
    const abrir=t.classList.contains('hidden');
    t.classList.toggle('hidden',!abrir);
    b.textContent=abrir?'Ocultar detalhes':'Ver detalhes';
  });
  host.classList.remove('hidden');
  wrap.classList.add('hidden');
  if(table._mcObs)table._mcObs.observe(table,{childList:true,subtree:true});
}

function attach(id){
  const table=document.getElementById(id);if(!table||table._mcObserved)return;
  table._mcObserved=true;
  const obs=new MutationObserver(()=>{if(mq.matches)buildCards(table)});
  table._mcObs=obs;
  obs.observe(table,{childList:true,subtree:true});
}

function sync(){
  const on=mq.matches;
  IDS.forEach(id=>{
    const table=document.getElementById(id);if(!table)return;
    attach(id);
    if(on){buildCards(table)}
    else{
      // volta pro desktop: tabela original de volta, cartões ocultos (não removidos —
      // o próximo redesenho da página os atualiza via observer)
      const wrap=table.closest('.table-wrap');if(wrap)wrap.classList.remove('hidden');
      const host=wrap&&wrap.nextElementSibling;
      if(host&&host.classList&&host.classList.contains('mc-cards'))host.classList.add('hidden');
      // devolve qualquer botão que tenha sido movido para dentro de um cartão — senão a
      // tabela do desktop ficaria com a coluna de ação vazia após um resize mobile->desktop
      if(table._mcMoved){table._mcMoved.forEach(([td,btn])=>td.appendChild(btn));table._mcMoved=[]}
    }
  });
}
if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
document.addEventListener('DOMContentLoaded',sync);
sync();
let rt=null;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(sync,150)});
})();
