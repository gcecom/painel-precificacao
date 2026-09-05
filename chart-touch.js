'use strict';
// ---------- TOOLTIP POR TOQUE NOS GRÁFICOS SVG ----------
// Componente visual genérico: os gráficos do Dashboard (dashboard.js) marcam cada
// ponto com um <title> nativo do SVG — funciona com mouse (hover), mas no toque a
// maioria dos navegadores não mostra nada. Aqui só ADICIONAMOS um tooltip por toque,
// lendo o mesmo <title> que já existe; não recalcula nada, não muda dashboard.js/
// inicio.js (o gráfico de 12 meses do Início já tem tooltip próprio e não é afetado).
(function(){
let tip=null;
function garanteTip(){
  if(tip)return tip;
  tip=document.createElement('div');
  tip.className='ct-tip';tip.hidden=true;
  document.body.appendChild(tip);
  return tip;
}
function mostra(alvo,texto,x,y){
  const t=garanteTip();
  t.textContent=texto;t.hidden=false;
  const w=t.offsetWidth,h=t.offsetHeight;
  t.style.left=Math.max(6,Math.min(x-w/2,window.innerWidth-w-6))+'px';
  t.style.top=Math.max(6,y-h-12)+'px';
  clearTimeout(t._tCT);
  t._tCT=setTimeout(esconde,3200);
}
function esconde(){if(tip)tip.hidden=true}

// Delegação: qualquer <circle>/<rect>/<path> com <title> dentro de um gráfico do
// painel (.dash-svg) responde ao toque/clique. Não interfere em outros elementos.
document.addEventListener('click',e=>{
  const alvo=e.target.closest('.dash-svg [data-x], .dash-svg circle, .dash-svg rect, .dash-svg path');
  if(!alvo){esconde();return}
  const titleEl=alvo.querySelector('title');
  if(!titleEl){esconde();return}
  mostra(alvo,titleEl.textContent,e.clientX,e.clientY);
},true);
document.addEventListener('scroll',esconde,true);
window.addEventListener('resize',esconde);
})();
