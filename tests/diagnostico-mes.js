'use strict';
// ---------- DIAGNÓSTICO DE DERIVA DE UM MÊS FECHADO ----------
// Responde: "por que o total deste mês mudou?" — decompondo a diferença por componente
// (comissão, tarifa, frete, embalagem, imposto, devoluções, custo, Ads, despesa).
//
// Como usar: com o painel ABERTO e LOGADO, no Console:
//   const s=document.createElement('script');s.src='tests/diagnostico-mes.js?v=1';document.body.appendChild(s);
//   await diagnosticarMes('2026-01');            // todos os marketplaces
//   await diagnosticarMes('2026-01','mercadolivre');
//
// Somente leitura: nenhuma gravação, nenhum recálculo salvo. Usa os métodos do próprio
// painel, então o RLS continua valendo (só enxerga os dados do usuário logado).
(function(){
const S=()=>window.PainelShared||{};
const money=v=>S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2));
const m2=v=>Math.round(((+v||0)+Number.EPSILON)*100)/100;

// componentes por unidade que o snapshot congela
const COMP=[
  ['comissao','Comissão',    s=>s.commissionRs],
  ['tarifa',  'Tarifa fixa + adicional + logística', s=>(+s.fixedFee||0)+(+s.serviceRs||0)+(+s.unitFee||0)],
  ['frete',   'Frete',       s=>s.freight],
  ['embalagem','Embalagem',  s=>s.packaging],
  ['imposto', 'Imposto',     s=>s.taxRs],
  ['devolucoes','Devoluções',s=>s.returnsRs],
  ['custo',   'Custo do produto', s=>s.cost]
];

async function diagnosticarMes(mes,plat){
  const uid=(window.currentUser||{}).id;
  if(!uid){console.error('Faça login antes de rodar o diagnóstico.');return}
  if(!/^\d{4}-\d{2}$/.test(mes||'')){console.error('Informe o mês como "AAAA-MM".');return}
  const prods=Array.isArray(window.products)?window.products:[];
  const byId={};prods.forEach(p=>{byId[p.id]=p});

  const [sales,ads,exp,ents]=await Promise.all([
    supabaseClient.getMonthlySalesRange(uid,[mes]),
    supabaseClient.getAdsSummaryRange(uid,[mes]),
    supabaseClient.getMonthlyExpensesRange(uid,[mes]),
    supabaseClient.getExpenses(uid).catch(()=>[])
  ]);
  const linhas=(sales||[]).filter(r=>!plat||r.platform===plat);
  if(!linhas.length){console.warn('Nenhuma venda salva em '+mes+(plat?' para '+plat:'')+'.');return}

  const delta={};COMP.forEach(([k])=>{delta[k]=0});
  let semSnap=0,comSnap=0,recFrozen=0,recAtual=0,operFrozen=0,operAtual=0;
  const detalhe=[];

  linhas.forEach(r=>{
    const p=byId[r.product_id]||{id:r.product_id,name:'(produto excluído)',sku:'',cost:0,channels:{}};
    const units=+r.units||0,price=+r.price||0;
    const snap=r.snapshot;
    const cong=snap&&+snap.v>=2;
    if(cong)comSnap++;else semSnap++;
    // CONGELADO (o que o mês deveria valer) x ATUAL (recalculado com a config de hoje)
    const uF=S().unitCosts(p,price,r.platform,snap);
    const uA=S().unitCosts(p,price,r.platform,null);          // ignora o snapshot de propósito
    recFrozen+=units*price;recAtual+=units*price;
    operFrozen+=uF.profit*units;operAtual+=uA.profit*units;
    if(cong){
      // componente a componente, só onde há snapshot para comparar
      const atualSnap=montarAtual(p,r.platform,price);
      COMP.forEach(([k,rot,get])=>{
        const d=(+get(atualSnap)||0)-(+get(snap)||0);
        if(Math.abs(d)>0.004){delta[k]+=d*units;
          detalhe.push({produto:p.name,sku:p.sku||'—',componente:rot,
            congelado:money(+get(snap)||0),atual:money(+get(atualSnap)||0),
            unidades:units,diferenca:money(d*units)});}
      });
    }
  });

  // ---- Ads: congelado na linha (v3) x rateio ao vivo
  const spendVivo={};(ads||[]).forEach(a=>{if(a.month===mes&&(!plat||a.platform===plat))spendVivo[a.platform]=+a.ads_spend||0});
  const adsVivo=Object.keys(spendVivo).reduce((a,k)=>a+spendVivo[k],0);
  const adsCongelado=linhas.reduce((a,r)=>a+((r.snapshot&&Number.isFinite(+r.snapshot.adsRs))?+r.snapshot.adsRs*0+(+r.snapshot.adsRs||0):0),0);
  const adsTemCongelado=linhas.some(r=>r.snapshot&&Number.isFinite(+r.snapshot.adsRs));

  // ---- Despesas do mês (competência) + gastos gerais
  const gerais=(exp||[]).filter(e=>e.month===mes).reduce((a,e)=>a+(+e.amount||0),0);
  const comp=window.PainelConsolida.despesasPorCompetencia(ents||[],[mes]);
  const desp=(ents||[]).filter(e=>{
    const ym=String(e.due_date||'').slice(0,7);
    return e.recurrence==='monthly'?(ym<=mes):(ym===mes);
  }).map(e=>({descricao:e.description,valor:money(e.amount),competencia:mes,
              vencimento:e.due_date,cadastrada_em:(e.created_at||'').slice(0,10),
              recorrente:e.recurrence==='monthly'?'sim':'não'}));

  const somaComp=Object.keys(delta).reduce((a,k)=>a+delta[k],0);
  const driftOper=m2(operAtual-operFrozen);

  console.log('%c'+'='.repeat(70),'color:#888');
  console.log('%cDIAGNÓSTICO — '+mes+(plat?' · '+plat:' · todos os marketplaces'),'font-weight:bold;font-size:14px');
  console.log(`linhas: ${linhas.length}  ·  com snapshot congelado: ${comSnap}  ·  SEM snapshot (histórico incompleto): ${semSnap}`);
  console.log('%cFaturamento (não muda: preço e unidades ficam na linha): '+money(recFrozen),'color:#178a4b');
  console.log('%cLucro operacional congelado: '+money(operFrozen)+'   |   recalculado hoje: '+money(operAtual)
    +'   |   DERIVA: '+money(driftOper),Math.abs(driftOper)>0.004?'color:#c52c2c;font-weight:bold':'color:#178a4b');

  const tabela=COMP.map(([k,rot])=>({componente:rot,diferenca_R$:m2(delta[k]),
    explica:m2(delta[k])!==0?((delta[k]/(driftOper||1))*100).toFixed(1)+'%':'—'}))
    .filter(x=>x.diferenca_R$!==0);
  if(tabela.length){console.log('%cCOMPONENTES QUE MUDARAM (linhas COM snapshot):','font-weight:bold');console.table(tabela)}
  else if(semSnap)console.log('%cNenhuma linha congelada divergiu. A deriva vem das '+semSnap+' linha(s) SEM snapshot, que recalculam pela configuração ATUAL de Produtos/Precificação.','color:#9a6700;font-weight:bold');
  else console.log('%cNenhum componente de venda mudou.','color:#178a4b');

  console.log('%cADS','font-weight:bold');
  console.log(adsTemCongelado
    ?`congelado nas linhas: ${money(adsCongelado)}  |  ao vivo (monthly_ads_summary): ${money(adsVivo)}  |  deriva: ${money(adsVivo-adsCongelado)}`
    :`NÃO congelado nas linhas — sempre lido ao vivo: ${money(adsVivo)}. Qualquer edição do gasto de Ads deste mês, ou uma linha de venda a mais/a menos, muda o rateio e o lucro após Ads.`);

  console.log('%cDESPESAS (afetam só o lucro LÍQUIDO, nunca o operacional)','font-weight:bold');
  console.log(`gastos gerais (monthly_expenses): ${money(gerais)}  ·  despesas por competência: ${money(comp.total)}`);
  if(desp.length)console.table(desp);
  const recorrentes=desp.filter(d=>d.recorrente==='sim');
  if(recorrentes.length)console.log('%c'+recorrentes.length+' despesa(s) RECORRENTE(S) alcançam este mês. Uma criada depois entra retroativamente no lucro líquido.','color:#9a6700');

  if(detalhe.length){console.log('%cDETALHE POR PRODUTO','font-weight:bold');console.table(detalhe.slice(0,40))}

  const res={mes,plat:plat||'todos',linhas:linhas.length,comSnapshot:comSnap,semSnapshot:semSnap,
    faturamento:m2(recFrozen),operacionalCongelado:m2(operFrozen),operacionalHoje:m2(operAtual),
    derivaOperacional:driftOper,porComponente:delta,somaComponentes:m2(somaComp),
    adsVivo:m2(adsVivo),adsCongelado:adsTemCongelado?m2(adsCongelado):null,
    gastosGerais:m2(gerais),despesasCompetencia:m2(comp.total),despesas:desp};
  window.__diagnostico=res;
  console.log('%cObjeto completo em window.__diagnostico','color:#888');
  return res;
}

// recalcula os componentes com a configuração de HOJE, no mesmo formato do snapshot
function montarAtual(p,plat,price){
  const P=m2(price);
  const defs=(typeof channelDefaults==='function')?channelDefaults(plat):{};
  const base=Object.assign({},defs,(p&&p.channels&&p.channels[plat])||{});
  const ch=Object.assign({},base,{discount:0,cost:0});
  const r=(typeof calcAt==='function')?calcAt(p,ch,P,undefined,plat):null;
  return{commissionRs:r?r.commission:0,fixedFee:r?r.fixed:(+ch.fixedFee||0),
    serviceRs:r?r.service:0,unitFee:r?r.unit:(+ch.unitFee||0),
    freight:+ch.freight||0,packaging:+ch.packaging||0,
    taxRs:r?r.tax:0,returnsRs:r?r.returns:0,cost:m2((p&&p.cost)||0)};
}

window.diagnosticarMes=diagnosticarMes;
console.log('%cDiagnóstico carregado. Rode:  await diagnosticarMes("2026-01")','color:#178a4b;font-weight:bold');
})();
