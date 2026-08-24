'use strict';
// ---------- CONSOLIDAÇÃO ÚNICA DOS RESULTADOS MENSAIS ----------
// Fonte oficial = o que foi salvo na aba Vendas / Resultado Mensal (monthly_sales +
// monthly_ads_summary + monthly_expenses). Dashboard e Financeiro usam ESTA função —
// nenhum recalcula fórmula por conta própria. Regras garantidas aqui, num lugar só:
//  - período respeitado exatamente (só os meses passados em `months`);
//  - sem registro duplicado por user|marketplace|produto|mês;
//  - Ads: 1 valor por marketplace|mês, rateado e descontado UMA vez;
//  - gastos gerais: 1 valor por mês (nunca multiplicado por marketplace);
//  - custos/imposto vêm do MESMO motor unitCosts usado no fechamento mensal.
(function(){
const RATIO=(a,b)=>b>0?a/b:NaN; // NaN -> formatadores mostram "—" (nunca Infinity)

// raw = {sales:[], ads:[], exp:[]} cru do banco (ranges já filtrados por usuário no cliente)
// products = catálogo do usuário; months = lista "YYYY-MM"; opts = {fPlat,fProd,fCat,unitCosts}
function consolidar(raw, products, months, opts){
  raw=raw||{};opts=opts||{};
  const fPlat=opts.fPlat||'',fProd=opts.fProd||'',fCat=opts.fCat||'';
  const unitCosts=typeof opts.unitCosts==='function'?opts.unitCosts
    :(p,price)=>({comm:0,frete:0,tax:0,cost:p.cost||0,profit:0});
  const monthSet=new Set(months||[]);
  const byId={};(products||[]).forEach(p=>{byId[p.id]=p});
  const inCat=p=>!fCat||(p&&p.category===fCat);
  const inProd=id=>!fProd||id===fProd;

  // Ads por (marketplace|mês) — 1 valor, sem duplicar
  const adsByKey={};
  (raw.ads||[]).forEach(r=>{if(monthSet.has(r.month))adsByKey[r.platform+'|'+r.month]=+r.ads_spend||0});
  // Gastos gerais por mês — 1 valor por mês
  const expByMonth={};
  // DAS pago no mês (oficial, informado) — 1 valor por mês, nunca por marketplace
  const dasByMonth={};
  (raw.exp||[]).forEach(r=>{if(monthSet.has(r.month)){expByMonth[r.month]=+r.amount||0;dasByMonth[r.month]=+r.das||0}});

  // 1) linhas de venda -> receita e custos por (produto, marketplace, mês)
  const seen={};const lines=[];
  (raw.sales||[]).forEach(r=>{
    if(!monthSet.has(r.month))return;
    // A chave inclui o PERFIL do anúncio (variant): Clássico e Premium do mesmo SKU no
    // mesmo mês são lançamentos distintos e devem somar — sem isso um deles sumiria.
    const dedup=(r.user_id||'')+'|'+r.platform+'|'+r.product_id+'|'+r.month+'|'+(r.variant||'');
    if(seen[dedup])return; // nunca soma registro duplicado do mesmo user/mkt/produto/perfil/mês
    seen[dedup]=true;
    // #2 — produto excluído do cadastro NÃO pode apagar a venda antiga. Com snapshot,
    // o histórico continua exato; sem ele (linha legada), a venda é preservada com o
    // que está gravado (unidades e preço) e sinalizada como produto removido.
    const p=byId[r.product_id]||{id:r.product_id,name:'Produto removido',sku:'',category:'',cost:0,channels:{},_removido:true};
    const ch=(p.channels&&p.channels[r.platform])||{};
    const units=+r.units||0;
    // MESMA cascata da aba Vendas (monthlyRowsData): preço salvo do mês -> preço do
    // canal -> preço padrão do cadastro. Sem o último degrau, uma linha salva com
    // price=0 rendia receita/imposto na tela de Vendas e ZERO no Dashboard/Financeiro.
    const price=+r.price>0?+r.price:(+ch.price>0?+ch.price:(+p.default_price||0));
    if(units<=0&&price<=0)return;
    const u=unitCosts(p,price,r.platform,r.snapshot); // #1 — snapshot manda quando existe
    lines.push({p,plat:r.platform,month:r.month,units,price,rev:units*price,
      comm:u.comm*units,frete:u.frete*units,tax:u.tax*units,cost:u.cost*units,
      operational:u.profit*units}); // lucro ANTES dos Ads mensais
  });

  // 2) rateio do Ads: pct real de cada (marketplace|mês) pelo faturamento TOTAL daquele mkt/mês
  const revByKey={};
  lines.forEach(l=>{revByKey[l.plat+'|'+l.month]=(revByKey[l.plat+'|'+l.month]||0)+l.rev});
  lines.forEach(l=>{
    const key=l.plat+'|'+l.month;
    const spend=adsByKey[key]||0,revK=revByKey[key]||0;
    l.ads=revK>0?l.rev*(spend/revK):0;
  });

  // 3) filtros DEPOIS do rateio (o pct não muda com o filtro)
  const sel=lines.filter(l=>(!fPlat||l.plat===fPlat)&&inProd(l.p.id)&&(l.p._removido?!fCat:inCat(l.p)));

  const zero=()=>({rev:0,units:0,ads:0,comm:0,frete:0,tax:0,cost:0,operational:0});
  const add=(a,l)=>{a.rev+=l.rev;a.units+=l.units;a.ads+=l.ads;a.comm+=l.comm;a.frete+=l.frete;a.tax+=l.tax;a.cost+=l.cost;a.operational+=l.operational;return a};

  const total=sel.reduce((a,l)=>add(a,l),zero());
  const byPlat={},byProd={},byMonth={};
  sel.forEach(l=>{
    (byPlat[l.plat]=byPlat[l.plat]||zero(),add(byPlat[l.plat],l));
    (byProd[l.p.id]=byProd[l.p.id]||Object.assign(zero(),{name:l.p.name,sku:l.p.sku,cat:l.p.category}),add(byProd[l.p.id],l));
    (byMonth[l.month]=byMonth[l.month]||zero(),add(byMonth[l.month],l));
  });

  // Gastos gerais e DAS: 1x por mês, só nos meses com movimento selecionado
  const monthsWithData=Object.keys(byMonth).sort();
  // #5 — gastos gerais e DAS somam sobre TODOS os meses pedidos, não só os que tiveram
  // venda: um mês só com despesa (sem faturamento) precisa aparecer no período.
  const mesesPedidos=[...monthSet].sort();
  const gerais=mesesPedidos.reduce((a,m)=>a+(expByMonth[m]||0),0);
  const dasOficial=mesesPedidos.reduce((a,m)=>a+(dasByMonth[m]||0),0);
  // DAS CALCULADO sobre as vendas = faturamento x taxa do canal, somado por venda.
  // Vem do mesmo unitCosts (total.tax), então já está agregado sem duplicar por produto,
  // marketplace ou mês: por marketplace = byPlat[k].tax, por mês = byMonth[m].tax.
  // Como o imposto JÁ está dentro do lucro operacional, aqui ele é só EXIBIDO —
  // nunca descontado de novo (evita dupla contagem).
  const dasCalc=total.tax;
  const adsTotal=total.ads;            // Ads descontado UMA vez
  // Lucro operacional JÁ inclui o imposto sobre vendas (total.tax embutido em operational).
  // O DAS informado é o valor real pago — NÃO é descontado de novo aqui (evita dupla contagem).
  // #6 — gastos gerais são do NEGÓCIO inteiro. Com filtro de marketplace, produto ou
  // categoria, descontá-los do recorte distorceria o lucro daquele subconjunto: eles
  // continuam sendo exibidos (gerais), mas não entram no líquido filtrado.
  const filtrado=!!(fPlat||fProd||fCat);
  const geraisAplicado=filtrado?0:gerais;
  const liquido=total.operational-adsTotal-geraisAplicado;

  return{
    months:monthsWithData,total,byPlat,byProd,byMonth,expByMonth,dasByMonth,adsByKey,
    gerais,geraisAplicado,dasOficial,dasCalc,adsTotal,liquido,
    margemLiquida:RATIO(liquido,total.rev),
    tacos:RATIO(adsTotal,total.rev),
    filtered:!!(fPlat||fProd||fCat),
    removidos:sel.filter(l=>l.p._removido).length
  };
}

// ---------- Despesas por COMPETÊNCIA (regime de competência) ----------
// Fonte: expense_entries (cada despesa individual). NÃO usa monthly_expenses.
//  - única  (recurrence !== 'monthly'): entra só no mês do vencimento (due_date);
//  - mensal (recurrence === 'monthly'):  entra no mês do 1º vencimento e em TODOS os
//    meses seguintes, uma vez por competência;
//  - inclui qualquer status (paga, pendente ou vencida — "vencida" é derivada de pending);
//  - respeita término/cancelamento SE existir no registro (end_date / ends_at /
//    canceled_at / cancelled_at → última competência em que a despesa conta);
//  - não cria registros futuros: soma apenas dentro dos `months` pedidos.
// Retorna { total, byMonth:{'YYYY-MM':valor}, months:[...] }.
function despesasPorCompetencia(entries, months){
  const ym=d=>(typeof d==='string'&&/^\d{4}-\d{2}/.test(d))?d.slice(0,7):'';
  const list=(months||[]).filter(m=>/^\d{4}-\d{2}$/.test(m)).slice().sort();
  const byMonth={};list.forEach(m=>{byMonth[m]=0});
  (entries||[]).forEach(e=>{
    if(!e)return;
    const amount=+e.amount||0;if(!(amount>0))return;
    const start=ym(e.due_date);if(!/^\d{4}-\d{2}$/.test(start))return;
    const monthly=e.recurrence==='monthly';
    const end=ym(e.end_date||e.ends_at||e.canceled_at||e.cancelled_at||''); // '' quando não existe
    list.forEach(m=>{
      if(monthly){
        if(m<start)return;      // antes do início
        if(end&&m>end)return;   // depois do término/cancelamento
        byMonth[m]+=amount;     // uma vez por competência
      }else if(m===start){      // única: só na competência do vencimento
        byMonth[m]+=amount;
      }
    });
  });
  let total=0;list.forEach(m=>{total+=byMonth[m]});
  return{total,byMonth,months:list};
}

window.PainelConsolida={consolidar,RATIO,despesasPorCompetencia};
})();
