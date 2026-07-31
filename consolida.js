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
  (raw.exp||[]).forEach(r=>{if(monthSet.has(r.month))expByMonth[r.month]=+r.amount||0});

  // 1) linhas de venda -> receita e custos por (produto, marketplace, mês)
  const seen={};const lines=[];
  (raw.sales||[]).forEach(r=>{
    if(!monthSet.has(r.month))return;
    const dedup=(r.user_id||'')+'|'+r.platform+'|'+r.product_id+'|'+r.month;
    if(seen[dedup])return; // nunca soma registro duplicado do mesmo user/mkt/produto/mês
    seen[dedup]=true;
    const p=byId[r.product_id];if(!p)return;
    const ch=(p.channels&&p.channels[r.platform])||{};
    const units=+r.units||0;
    const price=+r.price>0?+r.price:(ch.price||0);
    if(units<=0&&price<=0)return;
    const u=unitCosts(p,price,r.platform);
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
  const sel=lines.filter(l=>(!fPlat||l.plat===fPlat)&&inProd(l.p.id)&&inCat(l.p));

  const zero=()=>({rev:0,units:0,ads:0,comm:0,frete:0,tax:0,cost:0,operational:0});
  const add=(a,l)=>{a.rev+=l.rev;a.units+=l.units;a.ads+=l.ads;a.comm+=l.comm;a.frete+=l.frete;a.tax+=l.tax;a.cost+=l.cost;a.operational+=l.operational;return a};

  const total=sel.reduce((a,l)=>add(a,l),zero());
  const byPlat={},byProd={},byMonth={};
  sel.forEach(l=>{
    (byPlat[l.plat]=byPlat[l.plat]||zero(),add(byPlat[l.plat],l));
    (byProd[l.p.id]=byProd[l.p.id]||Object.assign(zero(),{name:l.p.name,sku:l.p.sku,cat:l.p.category}),add(byProd[l.p.id],l));
    (byMonth[l.month]=byMonth[l.month]||zero(),add(byMonth[l.month],l));
  });

  // Gastos gerais: 1x por mês, só nos meses com movimento selecionado
  const monthsWithData=Object.keys(byMonth).sort();
  const gerais=monthsWithData.reduce((a,m)=>a+(expByMonth[m]||0),0);
  const adsTotal=total.ads;            // Ads descontado UMA vez
  const liquido=total.operational-adsTotal-gerais;

  return{
    months:monthsWithData,total,byPlat,byProd,byMonth,expByMonth,adsByKey,
    gerais,adsTotal,liquido,
    margemLiquida:RATIO(liquido,total.rev),
    tacos:RATIO(adsTotal,total.rev),
    filtered:!!(fPlat||fProd||fCat)
  };
}

window.PainelConsolida={consolidar,RATIO};
})();
