'use strict';
// ---------- TESTES DO CONGELAMENTO MENSAL (regra definitiva) ----------
// Rodar com o painel aberto (index.html). No Console:
//   const s=document.createElement('script');s.src='tests/congelamento-mensal.test.js?v=1';document.body.appendChild(s);
//
// Sequência exata pedida:
//   1) salvar janeiro com comissão 12%      2) alterar a comissão para 16%
//   3) janeiro continua idêntico            4) fevereiro salvo depois usa 16%
//   5) alterar custo, frete e imposto       6) janeiro E fevereiro seguem inalterados
//   7) só o próximo mês usa a configuração nova
//
// Usa as funções REAIS (PainelVendas.previewSnapshot, PainelShared.unitCosts,
// PainelConsolida.consolidar). Nada é gravado no Supabase.
(function(){
const R=[];
const ap=(a,b,t)=>Math.abs((+a||0)-(+b||0))<=(t==null?0.01:t);
function ok(n,c,d){R.push({nome:n,pass:!!c,detalhe:d||''})}
function eq(n,g,w,t){ok(n,ap(g,w,t),`obtido ${(+g).toFixed(2)} · esperado ${(+w).toFixed(2)}`)}

const V=window.PainelVendas,S=window.PainelShared,C=window.PainelConsolida;
if(!V||!S||!C){console.error('Abra o painel (index.html) antes de rodar os testes.');return}
const unitCosts=S.unitCosts,PLAT='mercadolivre';

// produto único, usado nos dois meses; o cadastro MUDA ao longo do teste
const prod={id:'p1',name:'Produto X',sku:'SKU-1',category:'Outros',cost:20,default_price:100,active:true,
  channels:{[PLAT]:{price:100,discount:0,packaging:0,freight:0,returns:0,feeMode:'manual',
    commission:12,fixedFee:0,service:0,tax:9.5,taxBase:'gross',unitFee:0,
    adsMode:'roas',adsValue:10,targetMargin:10}}};
const UNID=100,PRECO=100;
const bkp=window.products;window.products=[prod];

// linha de venda como o banco devolve
const linha=(mes,snap)=>({user_id:'u1',platform:PLAT,product_id:'p1',month:mes,
  units:UNID,price:PRECO,variant:'',snapshot:snap});
const consolidar=(linhas,meses,ads)=>C.consolidar(
  {sales:linhas,ads:ads||[],exp:[]},window.products,meses,{unitCosts});

try{
// ============================================================ 1) janeiro com 12%
const snapJan=V.previewSnapshot(prod,PRECO,UNID,'',null,{adsRs:300},'2026-01');
eq('1. janeiro congela comissão 12%',snapJan.commissionPct,12);
eq('1. janeiro congela receita',snapJan.revenue,10000);
eq('1. janeiro congela Ads distribuído',snapJan.adsRs,300);
eq('1. janeiro congela custo',snapJan.cost,20);
eq('1. janeiro congela imposto 9,5%',snapJan.taxPct,9.5);
// operacional = 100 - 12 - 9,5 - 20 = 58,50/un -> 5.850,00
eq('1. janeiro congela lucro operacional',snapJan.operational,5850);
eq('1. janeiro congela lucro após Ads',snapJan.afterAds,5550);
eq('1. janeiro congela margem',snapJan.margin,0.555,0.0001);
ok('1. snapshot é v3',+snapJan.v===3,'v='+snapJan.v);
ok('1. snapshot tem produto e marketplace',snapJan.sku==='SKU-1'&&snapJan.platform===PLAT&&snapJan.month==='2026-01');

const janSalvo=[linha('2026-01',snapJan)];
const cJan0=consolidar(janSalvo,['2026-01'],[{platform:PLAT,month:'2026-01',ads_spend:300}]);
const FAT_JAN=cJan0.total.rev,OPER_JAN=cJan0.total.operational,LIQ_JAN=cJan0.liquido;
eq('1. consolidação: faturamento de janeiro',FAT_JAN,10000);
eq('1. consolidação: operacional de janeiro',OPER_JAN,5850);

// ============================================================ 2) comissão -> 16%
prod.channels[PLAT].commission=16;

// ============================================================ 3) janeiro idêntico
const cJan1=consolidar(janSalvo,['2026-01'],[{platform:PLAT,month:'2026-01',ads_spend:300}]);
eq('3. janeiro: faturamento inalterado',cJan1.total.rev,FAT_JAN);
eq('3. janeiro: operacional inalterado',cJan1.total.operational,OPER_JAN);
eq('3. janeiro: líquido inalterado',cJan1.liquido,LIQ_JAN);
eq('3. janeiro: comissão ainda 12% em reais',unitCosts(prod,PRECO,PLAT,snapJan).comm,12);
eq('3. janeiro: Ads ainda 300',cJan1.adsTotal,300);
ok('3. janeiro não usa a comissão nova',!ap(unitCosts(prod,PRECO,PLAT,snapJan).comm,16),'comm='+unitCosts(prod,PRECO,PLAT,snapJan).comm);

// ============================================================ 4) fevereiro usa 16%
const snapFev=V.previewSnapshot(prod,PRECO,UNID,'',null,{adsRs:0},'2026-02');
eq('4. fevereiro congela comissão 16%',snapFev.commissionPct,16);
eq('4. fevereiro: comissão em reais',unitCosts(prod,PRECO,PLAT,snapFev).comm,16);
// operacional = 100 - 16 - 9,5 - 20 = 54,50/un -> 5.450,00
eq('4. fevereiro congela lucro operacional',snapFev.operational,5450);
const fevSalvo=[linha('2026-02',snapFev)];
const cFev0=consolidar(fevSalvo,['2026-02'],[]);
eq('4. consolidação: operacional de fevereiro',cFev0.total.operational,5450);
const OPER_FEV=cFev0.total.operational;
ok('4. os dois meses coexistem com taxas diferentes',!ap(OPER_JAN,OPER_FEV),`jan ${OPER_JAN} · fev ${OPER_FEV}`);

// ============================================================ 5) muda custo, frete e imposto
prod.cost=26;
prod.channels[PLAT].freight=8;
prod.channels[PLAT].tax=14;

// ============================================================ 6) jan e fev inalterados
const ambos=janSalvo.concat(fevSalvo);
const cAmbos=consolidar(ambos,['2026-01','2026-02'],[{platform:PLAT,month:'2026-01',ads_spend:300}]);
eq('6. janeiro: operacional segue igual',cAmbos.byMonth['2026-01'].operational,OPER_JAN);
eq('6. fevereiro: operacional segue igual',cAmbos.byMonth['2026-02'].operational,OPER_FEV);
eq('6. janeiro: custo congelado em 20',unitCosts(prod,PRECO,PLAT,snapJan).cost,20);
eq('6. fevereiro: custo congelado em 20',unitCosts(prod,PRECO,PLAT,snapFev).cost,20);
eq('6. janeiro: imposto congelado em 9,50',unitCosts(prod,PRECO,PLAT,snapJan).tax,9.5);
eq('6. fevereiro: imposto congelado em 9,50',unitCosts(prod,PRECO,PLAT,snapFev).tax,9.5);
eq('6. janeiro: frete congelado em 0',unitCosts(prod,PRECO,PLAT,snapJan).frete,0);
eq('6. fevereiro: frete congelado em 0',unitCosts(prod,PRECO,PLAT,snapFev).frete,0);
eq('6. faturamento total dos dois meses',cAmbos.total.rev,20000);

// ============================================================ 7) só o próximo mês muda
const snapMar=V.previewSnapshot(prod,PRECO,UNID,'',null,{adsRs:0},'2026-03');
eq('7. março usa a comissão nova (16%)',snapMar.commissionPct,16);
eq('7. março usa o custo novo (26)',snapMar.cost,26);
eq('7. março usa o frete novo (8)',snapMar.freight,8);
eq('7. março usa o imposto novo (14%)',snapMar.taxPct,14);
// operacional = 100 - 16 - 14 - 8 - 26 = 36,00/un -> 3.600,00
eq('7. março: lucro operacional com a config nova',snapMar.operational,3600);
const cTres=consolidar(ambos.concat([linha('2026-03',snapMar)]),['2026-01','2026-02','2026-03'],
  [{platform:PLAT,month:'2026-01',ads_spend:300}]);
eq('7. janeiro intacto com 3 meses salvos',cTres.byMonth['2026-01'].operational,OPER_JAN);
eq('7. fevereiro intacto com 3 meses salvos',cTres.byMonth['2026-02'].operational,OPER_FEV);
eq('7. março com a config nova',cTres.byMonth['2026-03'].operational,3600);
ok('7. três meses, três configurações distintas',
   !ap(OPER_JAN,OPER_FEV)&&!ap(OPER_FEV,3600),`${OPER_JAN} / ${OPER_FEV} / 3600`);

// ============================================================ extras exigidos
// importar março não pode mexer em janeiro/fevereiro
eq('extra. importar março: faturamento de janeiro idêntico',cTres.byMonth['2026-01'].rev,FAT_JAN);
eq('extra. importar março: operacional de janeiro idêntico',cTres.byMonth['2026-01'].operational,OPER_JAN);
// Ads congelado: mudar o gasto do mês não move o mês salvo
const cAdsMudou=consolidar(janSalvo,['2026-01'],[{platform:PLAT,month:'2026-01',ads_spend:9999}]);
eq('extra. Ads congelado: mês salvo não se move',cAdsMudou.total.ads,300);
eq('extra. Ads congelado: líquido não se move',cAdsMudou.liquido,LIQ_JAN);
// mês sem receita -> margem "—" (NaN/null), nunca 0 nem Infinity
const snapZero=V.previewSnapshot(prod,0,0,'',null,{adsRs:0},'2026-04');
ok('extra. mês sem receita: margem "—"',snapZero.margin===null||!Number.isFinite(snapZero.margin),String(snapZero.margin));
const cVazio=consolidar([linha('2026-04',snapZero)],['2026-04'],[]);
ok('extra. consolidação sem receita: margem não é número',!Number.isFinite(cVazio.margemLiquida),String(cVazio.margemLiquida));
// linha legada (sem snapshot) é sinalizada, não silenciosa
const cLegado=consolidar([linha('2026-05',null)],['2026-05'],[]);
eq('extra. linha sem snapshot é contada como incompleta',cLegado.incompletos,1);
eq('extra. linha congelada não é contada como incompleta',cJan1.incompletos,0);

}catch(e){ok('erro inesperado na suíte',false,e.message+' | '+e.stack)}
finally{window.products=bkp}

const pass=R.filter(r=>r.pass).length,fail=R.length-pass;
console.log('%c'+'='.repeat(66),'color:#888');
console.log('%cTESTES — congelamento mensal (regra definitiva)','font-weight:bold;font-size:14px');
R.forEach(r=>console.log((r.pass?'%c  PASSOU  ':'%c  FALHOU  ')+'%c'+r.nome+(r.detalhe?'  ('+r.detalhe+')':''),
  r.pass?'color:#fff;background:#178a4b':'color:#fff;background:#c52c2c','color:inherit'));
console.log('%c'+'='.repeat(66),'color:#888');
console.log(`%c${pass} passaram · ${fail} falharam · ${R.length} no total`,
  fail?'color:#c52c2c;font-weight:bold':'color:#178a4b;font-weight:bold');
window.__testeCongelamento={pass,fail,total:R.length,resultados:R};
return window.__testeCongelamento;
})();
