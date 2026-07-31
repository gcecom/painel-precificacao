'use strict';
// ---------- FINANCEIRO — DRE SIMPLIFICADA ----------
// Reutiliza a MESMA consolidação do Dashboard (window.PainelConsolida): não recalcula
// fórmula nenhuma, só apresenta o consolidado do período como um demonstrativo.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const fmtMoney=v=>(S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2)));
const fmtPct=v=>(S().fmtPct?S().fmtPct(v):(Number.isFinite(v)?(v*100).toFixed(2)+'%':'—'));
const esc=s=>(S().esc?S().esc(s):String(s??''));
const RATIO=(a,b)=>b>0?a/b:NaN;

function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function allProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function thisMonth(){return S().thisMonth?S().thisMonth():new Date().toISOString().slice(0,7)}
function monthsBetween(from,to){
  if(!/^\d{4}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}$/.test(to||''))return[];
  if(from>to){const t=from;from=to;to=t}
  const out=[];let[y,m]=from.split('-').map(Number);const[ey,em]=to.split('-').map(Number);
  for(let i=0;i<240;i++){out.push(y+'-'+String(m).padStart(2,'0'));if(y===ey&&m===em)break;m++;if(m>12){m=1;y++}}
  return out;
}

async function render(){
  const st=el('finStatus'),tb=el('finDre');
  if(!uid()){if(st)st.textContent='Faça login para ver o Financeiro.';if(tb)tb.innerHTML='';return}
  if(!el('finTo').value||!el('finFrom').value){
    let mm=[];try{mm=await supabaseClient.listMonthlyMonths(uid())}catch(e){}
    const recent=(mm&&mm.length)?mm[0]:thisMonth();
    el('finTo').value=recent;el('finFrom').value=recent;
  }
  const months=monthsBetween(el('finFrom').value,el('finTo').value);
  if(!months.length){st.textContent='Selecione um período válido.';return}
  st.textContent='Carregando…';
  let raw;
  try{
    const[sales,ads,exp]=await Promise.all([
      supabaseClient.getMonthlySalesRange(uid(),months),
      supabaseClient.getAdsSummaryRange(uid(),months),
      supabaseClient.getMonthlyExpensesRange(uid(),months)
    ]);
    raw={sales:sales||[],ads:ads||[],exp:exp||[]};
  }catch(e){st.textContent='Erro ao carregar: '+e.message;return}

  const a=window.PainelConsolida.consolidar(raw,allProducts(),months,{unitCosts:S().unitCosts});
  const t=a.total;
  // DRE: da receita bruta ao lucro líquido, com os mesmos números do Dashboard
  const linhas=[
    ['Receita bruta',t.rev,'',true],
    ['(−) Comissões + tarifas',-t.comm,'neg'],
    ['(−) Fretes / outros',-t.frete,'neg'],
    ['(−) Imposto sobre vendas',-t.tax,'neg'],
    ['(−) Custo dos produtos',-t.cost,'neg'],
    ['(=) Lucro operacional',t.operational,t.operational>=0?'pos':'neg',true],
    ['(−) Ads do período',-a.adsTotal,'neg'],
    ['(−) Gastos gerais',-a.gerais,'neg'],
    ['(=) Lucro líquido',a.liquido,a.liquido>=0?'pos':'neg',true],
    // Memorando: DAS oficial informado. Já refletido acima via imposto sobre vendas;
    // não entra de novo no lucro (evita dupla contagem).
    ['DAS pago no mês (informado) *',a.dasOficial,'']
  ];
  const body=linhas.map(([label,val,cls,strong])=>
    `<tr${strong?' class="mo-total"':''}><td class="mo-name">${esc(label)}</td><td class="${cls||''}">${fmtMoney(val)}</td></tr>`).join('');
  tb.innerHTML='<thead><tr><th>Demonstrativo</th><th>'+esc(months.length>1?months[0]+' a '+months[months.length-1]:months[0])+'</th></tr></thead>'
    +'<tbody>'+body+'</tbody>'
    +`<tfoot><tr class="mo-total"><td>Margem líquida</td><td class="${a.liquido>=0?'pos':'neg'}">${fmtPct(a.margemLiquida)}</td></tr></tfoot>`;
  const nota=el('finNota');if(nota)nota.innerHTML='* O <b>imposto sobre vendas</b> já está dentro do lucro operacional. O <b>DAS pago no mês</b> é o valor oficial informado em Vendas, exibido para conferência — não é descontado novamente do lucro.';
  st.textContent=a.months.length?`${a.months.length} mês(es) salvos no período · consolidação única (mesma do Dashboard).`:'Nenhum mês salvo neste período.';
}

['finFrom','finTo'].forEach(id=>el(id)&&(el(id).onchange=render));
if(el('finReload'))el('finReload').onclick=render;
window.renderFinanceiro=render;
})();
