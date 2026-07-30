'use strict';
// ---------- DASHBOARD GERAL DO NEGÓCIO ----------
// Consolida os meses SALVOS do Resultado Mensal de todos os marketplaces.
// Regras anti-duplicidade centrais:
//   * Ads do mês vem de monthly_ads_summary (1 registro por marketplace+mês) e é
//     rateado por produto pelo faturamento — nunca somado duas vezes.
//   * Gastos gerais são de monthly_expenses (1 registro por usuário+mês) e entram
//     UMA vez por mês, independentemente de quantos marketplaces existam.
//   * O lucro por linha já é "antes dos Ads mensais": o Ads é subtraído só no consolidado.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):v;
const fmtPct=v=>S().fmtPct?S().fmtPct(v):v;
const fmtInt=v=>S().fmtInt?S().fmtInt(v):v;
const monthLabel=m=>S().monthLabel?S().monthLabel(m):m;
const esc=s=>S().esc?S().esc(s):String(s??'');
const kpi=(l,v,s)=>S().kpi?S().kpi(l,v,s):'';
const RATIO=(a,b)=>b>0?a/b:NaN; // NaN -> formatador mostra "—" (nunca NaN/Infinity na tela)

function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function allProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function platformList(){try{return Object.keys(PLATFORMS)}catch(e){return[]}}
function platformName(k){try{return PLATFORMS[k].name}catch(e){return k}}

// ---------- estado ----------
let raw=null;              // {sales,ads,exp,months} cru do banco
let agg=null;              // resultado da última agregação (não recalcula a cada render)
let showAllProducts=false;
let loading=false;

// ---------- período ----------
function monthsBetween(from,to){
  if(!/^\d{4}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}$/.test(to||''))return[];
  if(from>to){const t=from;from=to;to=t}
  const out=[];let[y,m]=from.split('-').map(Number);
  const[ey,em]=to.split('-').map(Number);
  for(let i=0;i<240;i++){
    const cur=y+'-'+String(m).padStart(2,'0');
    out.push(cur);
    if(y===ey&&m===em)break;
    m++;if(m>12){m=1;y++}
  }
  return out;
}

// ---------- agregação (fonte única) ----------
// Retorna totais globais + quebras por marketplace, produto e mês.
function aggregate(months,fPlat,fProd,fCat){
  const prods=allProducts(),byId={};prods.forEach(p=>{byId[p.id]=p});
  const inCat=p=>!fCat||(p&&p.category===fCat);
  const inProd=id=>!fProd||id===fProd;

  // Ads por (marketplace|mês) — 1 valor, sem duplicar
  const adsByKey={};
  (raw.ads||[]).forEach(r=>{if(months.includes(r.month))adsByKey[r.platform+'|'+r.month]=+r.ads_spend||0});
  // Gastos gerais por mês — 1 valor por mês
  const expByMonth={};
  (raw.exp||[]).forEach(r=>{if(months.includes(r.month))expByMonth[r.month]=+r.amount||0});

  // 1) linhas de venda -> receita e custos por (produto, marketplace, mês)
  const seen={};const lines=[];
  (raw.sales||[]).forEach(r=>{
    if(!months.includes(r.month))return;
    const dedup=r.user_id+'|'+r.platform+'|'+r.product_id+'|'+r.month;
    if(seen[dedup])return; // nunca soma registro duplicado do mesmo user/mkt/produto/mês
    seen[dedup]=true;
    const p=byId[r.product_id];if(!p)return;
    const ch=(p.channels&&p.channels[r.platform])||{};
    const units=+r.units||0;
    const price=+r.price>0?+r.price:(ch.price||0);
    if(units<=0&&price<=0)return;
    const u=S().unitCosts?S().unitCosts(p,price,r.platform):{comm:0,frete:0,tax:0,cost:p.cost||0,profit:0};
    lines.push({p,plat:r.platform,month:r.month,units,price,rev:units*price,
      comm:u.comm*units,frete:u.frete*units,tax:u.tax*units,cost:u.cost*units,
      operational:u.profit*units}); // lucro ANTES dos Ads mensais
  });

  // 2) rateio do Ads: pct real de cada (marketplace|mês) usando o faturamento TOTAL
  //    daquele marketplace/mês (denominador completo => pct verdadeiro do período)
  const revByKey={};
  lines.forEach(l=>{revByKey[l.plat+'|'+l.month]=(revByKey[l.plat+'|'+l.month]||0)+l.rev});
  lines.forEach(l=>{
    const key=l.plat+'|'+l.month;
    const spend=adsByKey[key]||0,revK=revByKey[key]||0;
    l.ads=revK>0?l.rev*(spend/revK):0;
  });

  // 3) aplica filtros DEPOIS do rateio (o pct não muda com o filtro)
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

  // Gastos gerais: UMA vez por mês. Só nos meses que têm movimento selecionado
  // (senão um período largo somaria despesa de mês sem venda nenhuma).
  const monthsWithData=Object.keys(byMonth).sort();
  const gerais=monthsWithData.reduce((a,m)=>a+(expByMonth[m]||0),0);
  // Sem filtro de produto/marketplace o rateio devolve exatamente o Ads informado
  const adsTotal=total.ads;
  const liquido=total.operational-adsTotal-gerais;

  return{
    months:monthsWithData,total,byPlat,byProd,byMonth,expByMonth,adsByKey,
    gerais,adsTotal,liquido,
    margemLiquida:RATIO(liquido,total.rev),
    tacos:RATIO(adsTotal,total.rev),
    filtered:!!(fPlat||fProd||fCat)
  };
}

// ---------- gráficos em SVG (sem dependência externa; segue o estilo do painel) ----------
const CH=['#3483fa','#17803d','#d97706','#7656a8','#ee4d2d','#0086ff','#c52c2c','#0f766e','#a16207','#4b5563'];
function chartCard(title,body,note){
  return`<section class="panel dash-chart"><div class="panel-head"><h2>${esc(title)}</h2></div><div class="panel-body">${body}${note?`<p class="help">${esc(note)}</p>`:''}</div></section>`;
}
function emptyChart(msg){return`<p class="help">${esc(msg||'Sem dados no período.')}</p>`}

// Linha (uma ou duas séries) — viewBox fixo + width 100% = responsivo
function lineChart(labels,series){
  if(!labels.length)return emptyChart();
  const W=720,H=240,pad=44;
  const all=series.flatMap(s=>s.data);
  const max=Math.max(...all,0),min=Math.min(...all,0);
  const span=(max-min)||1;
  const x=i=>labels.length<2?W/2:pad+i*(W-pad-12)/(labels.length-1);
  const y=v=>H-28-((v-min)/span)*(H-28-12);
  let svg=`<svg class="dash-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">`;
  svg+=`<line x1="${pad}" y1="${y(0)}" x2="${W-12}" y2="${y(0)}" stroke="var(--line)" stroke-width="1"/>`;
  series.forEach((s,si)=>{
    const c=CH[si%CH.length];
    const pts=s.data.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
    svg+=`<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>`;
    s.data.forEach((v,i)=>{svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}"><title>${esc(labels[i])}: ${fmtMoney(v)}</title></circle>`});
  });
  labels.forEach((l,i)=>{svg+=`<text x="${x(i)}" y="${H-8}" font-size="11" fill="var(--muted)" text-anchor="middle">${esc(l)}</text>`});
  svg+=`<text x="4" y="${y(max)+4}" font-size="10" fill="var(--muted)">${esc(fmtMoney(max))}</text>`;
  svg+='</svg>';
  const leg=series.map((s,i)=>`<span class="dash-leg"><i style="background:${CH[i%CH.length]}"></i>${esc(s.name)}</span>`).join('');
  return svg+`<div class="dash-legend">${leg}</div>`;
}

// Barras horizontais (rankings e comparações) — cada linha com rótulo legível
function barChart(items,fmt){
  if(!items.length)return emptyChart();
  const max=Math.max(...items.map(i=>Math.abs(i.value)),1);
  return'<div class="dash-bars">'+items.map((it,i)=>`
    <div class="dash-bar-row" title="${esc(it.label)}: ${esc((fmt||fmtMoney)(it.value))}">
      <span class="dash-bar-label">${esc(it.label)}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${Math.max(1,Math.abs(it.value)/max*100)}%;background:${it.color||CH[i%CH.length]}"></span></span>
      <b class="dash-bar-val ${it.value<0?'neg':''}">${(fmt||fmtMoney)(it.value)}</b>
    </div>`).join('')+'</div>';
}

// Rosca (participação)
function doughnut(items){
  const tot=items.reduce((a,i)=>a+Math.max(0,i.value),0);
  if(tot<=0)return emptyChart();
  const R=60,C=2*Math.PI*R;let off=0;
  let svg=`<svg class="dash-svg dash-donut" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" role="img"><g transform="translate(80,80)">`;
  items.forEach((it,i)=>{
    const frac=Math.max(0,it.value)/tot;if(frac<=0)return;
    svg+=`<circle r="${R}" fill="none" stroke="${CH[i%CH.length]}" stroke-width="26" stroke-dasharray="${frac*C} ${C}" stroke-dashoffset="${-off*C}" transform="rotate(-90)"><title>${esc(it.label)}: ${fmtPct(frac)}</title></circle>`;
    off+=frac;
  });
  svg+='</g></svg>';
  const leg=items.filter(i=>i.value>0).map((it,i)=>`<span class="dash-leg"><i style="background:${CH[i%CH.length]}"></i>${esc(it.label)} · ${fmtPct(Math.max(0,it.value)/tot)}</span>`).join('');
  return svg+`<div class="dash-legend">${leg}</div>`;
}

function topN(obj,key,n){
  return Object.entries(obj).map(([id,v])=>({id,label:v.name||id,value:v[key]||0}))
    .sort((a,b)=>b.value-a.value).slice(0,n);
}

function renderCharts(a){
  const months=a.months;
  const revByMonth=months.map(m=>a.byMonth[m].rev);
  const liqByMonth=months.map(m=>{
    const b=a.byMonth[m];
    return b.operational-b.ads-(a.expByMonth[m]||0); // gastos gerais 1x no mês
  });
  const adsByMonth=months.map(m=>a.byMonth[m].ads);
  const labels=months.map(monthLabel);
  const plats=Object.entries(a.byPlat).map(([k,v])=>({label:platformName(k),value:v.rev}));
  const N=showAllProducts?999:10;

  el('dashCharts').innerHTML=
    chartCard('Faturamento por mês',lineChart(labels,[{name:'Faturamento',data:revByMonth}]))+
    chartCard('Lucro líquido por mês',lineChart(labels,[{name:'Lucro líquido',data:liqByMonth}]),'Já descontados Ads do mês e gastos gerais (uma vez por mês).')+
    chartCard('Ads x faturamento',lineChart(labels,[{name:'Faturamento',data:revByMonth},{name:'Ads',data:adsByMonth}]))+
    chartCard('Faturamento por marketplace',barChart(plats.sort((x,y)=>y.value-x.value)))+
    chartCard('Participação dos marketplaces',doughnut(plats))+
    chartCard('Produtos com maior faturamento',barChart(topN(a.byProd,'rev',N)))+
    chartCard('Produtos com maior lucro',barChart(topN(a.byProd,'operational',N),fmtMoney),'Lucro operacional (antes do Ads do mês).')+
    chartCard('Unidades vendidas por produto',barChart(topN(a.byProd,'units',N),fmtInt))+
    chartCard('Valor financeiro do estoque',emptyChart('Requer a aba Estoque (não existe ainda no sistema).'));
}

// ---------- insights por regras ----------
function renderInsights(a){
  const out=[];
  const push=(lvl,t,txt)=>out.push([lvl,t,txt]);
  const plats=Object.entries(a.byPlat);
  if(!plats.length){el('dashInsights').innerHTML='<p class="help">Sem dados salvos no período selecionado.</p>';return}

  const maxRev=plats.slice().sort((x,y)=>y[1].rev-x[1].rev)[0];
  const maxProf=plats.slice().sort((x,y)=>(y[1].operational-y[1].ads)-(x[1].operational-x[1].ads))[0];
  push('good','Marketplace com maior faturamento',`${platformName(maxRev[0])} faturou ${fmtMoney(maxRev[1].rev)} no período.`);
  push('good','Marketplace com maior lucro',`${platformName(maxProf[0])} entregou ${fmtMoney(maxProf[1].operational-maxProf[1].ads)} de lucro (após Ads).`);

  const margens=plats.map(([k,v])=>({k,m:RATIO(v.operational-v.ads,v.rev)})).filter(x=>Number.isFinite(x.m));
  if(margens.length>1){
    const pior=margens.sort((x,y)=>x.m-y.m)[0];
    push(pior.m<0?'bad':'warn','Marketplace com menor margem',`${platformName(pior.k)} está com ${fmtPct(pior.m)} de margem (antes dos gastos gerais).`);
  }

  const prods=Object.entries(a.byProd);
  if(prods.length){
    const pr=prods.slice().sort((x,y)=>y[1].rev-x[1].rev)[0];
    const pl=prods.slice().sort((x,y)=>(y[1].operational-y[1].ads)-(x[1].operational-x[1].ads))[0];
    push('good','Produto com maior faturamento',`${pr[1].name} — ${fmtMoney(pr[1].rev)}.`);
    push('good','Produto com maior lucro',`${pl[1].name} — ${fmtMoney(pl[1].operational-pl[1].ads)} após Ads rateado.`);
    const prejuizo=prods.filter(([,v])=>(v.operational-v.ads)<0);
    if(prejuizo.length)push('bad','Produtos no prejuízo',`${prejuizo.length} produto(s) com lucro negativo após Ads: ${prejuizo.slice(0,3).map(([,v])=>v.name).join(', ')}${prejuizo.length>3?'…':''}.`);
  }

  // variação mês a mês
  if(a.months.length>=2){
    const m0=a.months[a.months.length-2],m1=a.months[a.months.length-1];
    const r0=a.byMonth[m0].rev,r1=a.byMonth[m1].rev;
    const l0=a.byMonth[m0].operational-a.byMonth[m0].ads-(a.expByMonth[m0]||0);
    const l1=a.byMonth[m1].operational-a.byMonth[m1].ads-(a.expByMonth[m1]||0);
    if(r0>0){
      const d=(r1-r0)/r0;
      push(d>=0?'good':'warn',d>=0?'Faturamento em alta':'Faturamento em queda',`${monthLabel(m1)} vs ${monthLabel(m0)}: ${fmtPct(d)} (${fmtMoney(r1-r0)}).`);
    }
    const dl=l1-l0;
    push(dl>=0?'good':'warn',dl>=0?'Lucro em alta':'Lucro em queda',`${monthLabel(m1)} vs ${monthLabel(m0)}: ${fmtMoney(dl)}.`);
  }

  if(Number.isFinite(a.tacos)&&Number.isFinite(a.margemLiquida)&&a.tacos>a.margemLiquida)
    push('bad','TACOS acima da margem líquida',`TACOS de ${fmtPct(a.tacos)} contra margem de ${fmtPct(a.margemLiquida)} — o Ads está consumindo mais que a sobra do negócio.`);

  push('warn','Indicadores de estoque indisponíveis','Estoque atual, capital parado e estoque mínimo dependem da aba Estoque, que ainda não existe no sistema.');

  const order={bad:0,warn:1,good:2};
  out.sort((x,y)=>order[x[0]]-order[y[0]]);
  el('dashInsights').innerHTML=out.map(([lvl,t,txt])=>`<div class="diag ${lvl==='bad'?'badbox':lvl==='warn'?'warnbox':''}"><h3>${esc(t)}</h3><p>${esc(txt)}</p></div>`).join('');
  const worst=out[0][0];
  const st=el('dashInsightStatus');
  st.className='status '+(worst==='bad'?'bad':worst==='warn'?'warn':'good');
  st.textContent=worst==='bad'?'Ação necessária':worst==='warn'?'Pontos de atenção':'Tudo saudável';
}

// ---------- cards ----------
function renderKpis(a){
  const t=a.total;
  el('dashKpis').innerHTML=
    kpi('Faturamento total',fmtMoney(t.rev),`${a.months.length} mês(es) · ${Object.keys(a.byPlat).length} marketplace(s)`)+
    kpi('Lucro operacional',fmtMoney(t.operational),'Antes dos Ads e gastos gerais')+
    kpi('Lucro líquido final',fmtMoney(a.liquido),a.liquido>=0?'Operacional − Ads − gastos gerais':'Prejuízo no período')+
    kpi('Margem líquida',fmtPct(a.margemLiquida),'Lucro líquido ÷ faturamento')+
    kpi('Unidades vendidas',fmtInt(t.units),`${Object.keys(a.byProd).length} produto(s)`)+
    kpi('Gasto total com Ads',fmtMoney(a.adsTotal),a.filtered?'Rateado pelo filtro':'Soma dos marketplaces')+
    kpi('TACOS',fmtPct(a.tacos),'Ads ÷ faturamento total')+
    kpi('Gastos gerais',fmtMoney(a.gerais),'Uma vez por mês')+
    kpi('Custo dos produtos vendidos',fmtMoney(t.cost),'CMV do período')+
    kpi('Valor atual do estoque','—','Requer aba Estoque')+
    kpi('Valor potencial de venda','—','Requer aba Estoque')+
    kpi('Produtos com estoque baixo','—','Requer aba Estoque');
}

// ---------- tabelas ----------
function renderTables(a){
  const th=arr=>'<thead><tr>'+arr.map((h,i)=>`<th${i===0?'':''}>${esc(h)}</th>`).join('')+'</tr></thead>';
  const money=v=>fmtMoney(v),pc=v=>fmtPct(v);

  // 1) por marketplace
  const pl=Object.entries(a.byPlat).sort((x,y)=>y[1].rev-x[1].rev);
  el('dashTablePlatform').innerHTML=th(['Marketplace','Faturamento','Unidades','Ads','TACOS','Lucro','Margem'])+
    '<tbody>'+(pl.length?pl.map(([k,v])=>{
      const lucro=v.operational-v.ads;
      return`<tr><td class="mo-name">${esc(platformName(k))}</td><td>${money(v.rev)}</td><td>${fmtInt(v.units)}</td><td>${money(v.ads)}</td><td>${pc(RATIO(v.ads,v.rev))}</td><td class="${lucro>=0?'pos':'neg'}">${money(lucro)}</td><td>${pc(RATIO(lucro,v.rev))}</td></tr>`;
    }).join(''):'<tr><td style="padding:14px">Sem dados.</td></tr>')+'</tbody>';

  // 2) por produto
  const pr=Object.entries(a.byProd).sort((x,y)=>y[1].rev-x[1].rev);
  const lim=showAllProducts?pr:pr.slice(0,10);
  el('dashTableProduct').innerHTML=th(['Produto','Faturamento','Unidades','Custo','Ads rateado','Lucro','Margem','Estoque'])+
    '<tbody>'+(lim.length?lim.map(([,v])=>{
      const lucro=v.operational-v.ads;
      return`<tr><td class="mo-name">${esc(v.name)}</td><td>${money(v.rev)}</td><td>${fmtInt(v.units)}</td><td>${money(v.cost)}</td><td>${money(v.ads)}</td><td class="${lucro>=0?'pos':'neg'}">${money(lucro)}</td><td>${pc(RATIO(lucro,v.rev))}</td><td>—</td></tr>`;
    }).join(''):'<tr><td style="padding:14px">Sem dados.</td></tr>')+'</tbody>';
  el('dashToggleProducts').textContent=showAllProducts?'Ver top 10':`Ver todos (${pr.length})`;

  // 3) comparação mensal
  el('dashTableMonth').innerHTML=th(['Mês','Faturamento','Lucro','Margem','Ads','Unidades'])+
    '<tbody>'+(a.months.length?a.months.map(m=>{
      const b=a.byMonth[m],lucro=b.operational-b.ads-(a.expByMonth[m]||0);
      return`<tr><td class="mo-name">${esc(monthLabel(m))}</td><td>${money(b.rev)}</td><td class="${lucro>=0?'pos':'neg'}">${money(lucro)}</td><td>${pc(RATIO(lucro,b.rev))}</td><td>${money(b.ads)}</td><td>${fmtInt(b.units)}</td></tr>`;
    }).join(''):'<tr><td style="padding:14px">Sem dados.</td></tr>')+'</tbody>';
}

// ---------- filtros ----------
function fillFilters(){
  const sel=el('dashPlatform');
  if(sel.options.length<=1)platformList().forEach(k=>sel.add(new Option(platformName(k),k)));
  const cats=[...new Set(allProducts().map(p=>p.category).filter(Boolean))].sort();
  const c=el('dashCategory'),keepC=c.value;
  c.innerHTML='<option value="">Todas</option>'+cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(keepC)c.value=keepC;
  const p=el('dashProduct'),keepP=p.value;
  const list=allProducts().filter(x=>!c.value||x.category===c.value);
  p.innerHTML='<option value="">Todos</option>'+list.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if(keepP&&list.some(x=>x.id===keepP))p.value=keepP;
}

// ---------- carga + render ----------
async function loadRaw(months){
  const u=uid();if(!u)return false;
  const[sales,ads,exp]=await Promise.all([          // 3 queries no total (nunca 1 por produto)
    supabaseClient.getMonthlySalesRange(u,months),
    supabaseClient.getAdsSummaryRange(u,months),
    supabaseClient.getMonthlyExpensesRange(u,months)
  ]);
  raw={sales:sales||[],ads:ads||[],exp:exp||[]};
  return true;
}

async function renderDashboard(force){
  const u=uid();
  const st=el('dashStatus');
  if(!u){st.textContent='Faça login para ver o dashboard.';el('dashKpis').innerHTML='';el('dashCharts').innerHTML='';return}
  fillFilters();

  // período padrão: mês mais recente com dados salvos
  if(!el('dashFrom').value||!el('dashTo').value){
    let mm=[];
    try{mm=await supabaseClient.listMonthlyMonths(u)}catch(e){}
    const recent=(mm&&mm.length)?mm[0]:(S().thisMonth?S().thisMonth():'');
    el('dashTo').value=recent;el('dashFrom').value=recent;
  }
  const months=monthsBetween(el('dashFrom').value,el('dashTo').value);
  if(!months.length){st.textContent='Selecione um período válido.';return}
  if(months.length>36){st.textContent='Período muito longo — selecione até 36 meses.';return}

  if(loading)return;
  loading=true;st.textContent='Carregando…';
  try{
    if(force||!raw||raw._months!==months.join(','))
      { await loadRaw(months); raw._months=months.join(','); }
    agg=aggregate(months,el('dashPlatform').value,el('dashProduct').value,el('dashCategory').value);
    renderKpis(agg);renderCharts(agg);renderInsights(agg);renderTables(agg);
    st.textContent=agg.months.length
      ? `${agg.months.length} mês(es) salvos no período · atualizado agora`
      : 'Nenhum mês salvo neste período. Lance e salve dados na aba Resultado Mensal.';
  }catch(e){
    console.error('Erro no dashboard:',e);
    st.textContent='Erro ao carregar: '+e.message;
  }finally{loading=false}
}

// ---------- CSV (reaproveita download() do app.js) ----------
function exportCsv(){
  if(!agg){alert('Nada para exportar ainda.');return}
  const rows=[['Bloco','Chave','Faturamento','Unidades','Custo','Ads','Lucro','Margem %']];
  Object.entries(agg.byPlat).forEach(([k,v])=>{const l=v.operational-v.ads;rows.push(['Marketplace',platformName(k),v.rev,v.units,v.cost,v.ads,l,Number.isFinite(RATIO(l,v.rev))?RATIO(l,v.rev)*100:''])});
  Object.entries(agg.byProd).forEach(([,v])=>{const l=v.operational-v.ads;rows.push(['Produto',v.name,v.rev,v.units,v.cost,v.ads,l,Number.isFinite(RATIO(l,v.rev))?RATIO(l,v.rev)*100:''])});
  agg.months.forEach(m=>{const b=agg.byMonth[m],l=b.operational-b.ads-(agg.expByMonth[m]||0);rows.push(['Mês',m,b.rev,b.units,b.cost,b.ads,l,Number.isFinite(RATIO(l,b.rev))?RATIO(l,b.rev)*100:''])});
  rows.push(['Total','Consolidado',agg.total.rev,agg.total.units,agg.total.cost,agg.adsTotal,agg.liquido,Number.isFinite(agg.margemLiquida)?agg.margemLiquida*100:'']);
  rows.push(['Total','Gastos gerais (1x por mês)','','','','',agg.gerais,'']);
  const csv=rows.map(r=>r.map(v=>`"${String(typeof v==='number'?(Number.isFinite(v)?v:''):v).replaceAll('"','""')}"`).join(';')).join('\n');
  const name=`dashboard-${el('dashFrom').value}_a_${el('dashTo').value}.csv`;
  if(typeof download==='function')download(name,csv,'text/csv;charset=utf-8');
}

// ---------- eventos ----------
['dashFrom','dashTo'].forEach(id=>el(id)&&(el(id).onchange=()=>renderDashboard(true)));
['dashPlatform','dashProduct'].forEach(id=>el(id)&&(el(id).onchange=()=>renderDashboard(false)));
if(el('dashCategory'))el('dashCategory').onchange=()=>{el('dashProduct').value='';fillFilters();renderDashboard(false)};
if(el('dashReload'))el('dashReload').onclick=()=>renderDashboard(true);
if(el('dashExport'))el('dashExport').onclick=exportCsv;
if(el('dashToggleProducts'))el('dashToggleProducts').onclick=()=>{showAllProducts=!showAllProducts;if(agg){renderCharts(agg);renderTables(agg)}};

// Biblioteca de graficos compartilhada (reutilizada pelo modulo Estoque)
window.PainelCharts={chartCard,emptyChart,lineChart,barChart,doughnut,CH};
window.renderDashboard=()=>renderDashboard(false);
window.resetDashboard=()=>{raw=null;agg=null;showAllProducts=false;const f=el('dashFrom'),t=el('dashTo');if(f)f.value='';if(t)t.value=''};
})();
