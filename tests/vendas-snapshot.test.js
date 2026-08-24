'use strict';
// ---------- TESTES DO HISTÓRICO CONGELADO DE VENDAS ----------
// Como rodar: abra o painel (index.html), abra o Console do navegador (F12) e cole:
//     const s=document.createElement('script');s.src='tests/vendas-snapshot.test.js?v=1';document.body.appendChild(s);
// Ou, servindo local:  python3 -m http.server 8080  →  http://localhost:8080/index.html
//
// Os testes usam as funções REAIS do painel (window.PainelShared.unitCosts,
// PainelVendas.previewSnapshot, PainelConsolida.consolidar). Nada é gravado no Supabase:
// tudo roda em memória, sobre produtos fabricados só para o teste.
(function(){
const R=[];
const aprox=(a,b,tol)=>Math.abs((+a||0)-(+b||0))<=(tol==null?0.01:tol);
function ok(nome,cond,detalhe){R.push({nome,pass:!!cond,detalhe:detalhe||''})}
function eq(nome,got,want,tol){ok(nome,aprox(got,want,tol),`obtido ${(+got).toFixed(4)} · esperado ${(+want).toFixed(4)}`)}

const S=window.PainelShared,V=window.PainelVendas,C=window.PainelConsolida;
if(!S||!V||!C){console.error('Abra o painel (index.html) antes de rodar os testes.');return}
const unitCosts=S.unitCosts;

// Produto de teste: custo 20, canal ML com comissão 11%, imposto 9,5%, sem tarifas.
const PLAT='mercadolivre';
const canal=pct=>({price:100,discount:0,packaging:0,freight:0,returns:0,feeMode:'manual',
  commission:pct,fixedFee:0,service:0,tax:9.5,taxBase:'gross',unitFee:0});
const prod=(pct,cost)=>({id:'p-teste',name:'Produto de teste',sku:'TESTE-1',category:'Outros',
  cost:cost==null?20:cost,default_price:100,channels:{[PLAT]:canal(pct)}});

// ---------------------------------------------------------------- 1) julho com 11%
// Fecha julho com a configuração de 11% e guarda o snapshot.
const pJulho=prod(11);
const snapJulho=V.previewSnapshot(pJulho,100,10,'',null);
eq('1. julho congela comissão 11%',snapJulho.commissionPct,11);
eq('1. julho congela comissão em R$ (11% de 100)',snapJulho.commissionRs,11);
eq('1. julho congela imposto 9,5%',snapJulho.taxPct,9.5);
eq('1. julho congela custo do produto',snapJulho.cost,20);
ok('1. snapshot marca versão 2',+snapJulho.v===2,'v='+snapJulho.v);
ok('1. snapshot guarda marketplace, mês e data',
   snapJulho.platform===PLAT&&!!snapJulho.month&&!!snapJulho.at,
   `${snapJulho.platform} · ${snapJulho.month} · ${snapJulho.at}`);
ok('1. snapshot guarda preço e quantidade',
   aprox(snapJulho.price,100)&&+snapJulho.units===10,
   `preço ${snapJulho.price} · unid ${snapJulho.units}`);
const julhoAntes=unitCosts(pJulho,100,PLAT,snapJulho);
eq('1. julho: comissão calculada = 11,00',julhoAntes.comm,11);

// -------------------------------------------- 2) mudar a Precificação para 16%
// O MESMO produto passa a ter 16% no cadastro (simula o usuário editando a Precificação).
const pAgora=prod(16);

// -------------------------------------------- 3) julho DEVE permanecer 11%
const julhoDepois=unitCosts(pAgora,100,PLAT,snapJulho); // cadastro 16%, snapshot 11%
eq('3. julho continua 11% após mudar p/ 16%',julhoDepois.comm,11);
eq('3. julho: lucro não se moveu',julhoDepois.profit,julhoAntes.profit);
ok('3. julho ignora o cadastro atual',aprox(julhoDepois.comm,julhoAntes.comm),
   `antes ${julhoAntes.comm} · depois ${julhoDepois.comm}`);

// -------------------------------------------- 4) agosto importado DEPOIS usa 16%
const snapAgosto=V.previewSnapshot(pAgora,100,10,'',null);
eq('4. agosto congela 16% (config nova)',snapAgosto.commissionPct,16);
const agosto=unitCosts(pAgora,100,PLAT,snapAgosto);
eq('4. agosto: comissão = 16,00',agosto.comm,16);
ok('4. julho e agosto coexistem com taxas diferentes',
   !aprox(julhoDepois.comm,agosto.comm),
   `julho ${julhoDepois.comm} · agosto ${agosto.comm}`);

// -------------------------------------------- 5) Clássico x Premium no mesmo SKU/mês
const snapClassico=V.previewSnapshot(prod(11),100,5,'classic',null);
const snapPremium =V.previewSnapshot(prod(17),100,3,'premium',null);
const cCla=unitCosts(pAgora,100,PLAT,snapClassico);
const cPre=unitCosts(pAgora,100,PLAT,snapPremium);
eq('5. Clássico usa 11%',cCla.comm,11);
eq('5. Premium usa 17%',cPre.comm,17);
ok('5. perfis calculam separadamente',!aprox(cCla.profit,cPre.profit),
   `clássico ${cCla.profit.toFixed(2)} · premium ${cPre.profit.toFixed(2)}`);
ok('5. rótulos dos perfis',V.variantLabel('classic')==='Clássico'&&V.variantLabel('premium')==='Premium'&&V.variantLabel('')==='Padrão');

// -------------------------------------------- 6) valores REAIS da planilha vencem
const real={commissionRs:7.5,freight:12.34,taxPct:4};
const snapReal=V.previewSnapshot(prod(11),100,2,'',real);
eq('6. comissão real da planilha vence',snapReal.commissionRs,7.5);
eq('6. comissão % derivada do valor real',snapReal.commissionPct,7.5);
eq('6. frete real da planilha vence',snapReal.freight,12.34);
eq('6. imposto real da planilha vence',snapReal.taxPct,4);
ok('6. origem por campo registrada',
   snapReal.fields.commission==='planilha'&&snapReal.fields.freight==='planilha'&&snapReal.fields.packaging==='config',
   JSON.stringify(snapReal.fields));
ok('6. source = planilha',snapReal.source==='planilha',snapReal.source);
// campo não informado na planilha continua vindo da configuração congelada
const snapMisto=V.previewSnapshot(prod(11),100,2,'',{freight:5});
eq('6. campo ausente cai na config (comissão 11%)',snapMisto.commissionPct,11);
eq('6. campo presente usa a planilha (frete 5)',snapMisto.freight,5);

// -------------------------------------------- 7) linha legada SEM snapshot = estimada
const legado=unitCosts(pAgora,100,PLAT,null); // sem snapshot → cadastro atual (16%)
eq('7. legado sem snapshot usa cadastro atual',legado.comm,16);
ok('7. legado não é marcado como congelado',!legado.frozen,'frozen='+String(legado.frozen));
ok('7. snapshot v2 é marcado como congelado',julhoDepois.frozen===true);

// -------------------------------------------- 8) alíquota congelada reaplicada a novo preço
const outroPreco=unitCosts(pAgora,200,PLAT,snapJulho); // preço mudou; taxa continua 11%
eq('8. preço novo mantém a alíquota congelada (11% de 200)',outroPreco.comm,22);
eq('8. imposto congelado reaplicado (9,5% de 200)',outroPreco.tax,19);

// -------------------------------------------- 9) consolidação separa perfis
const produtos=[pAgora];
const vendas=[
  {user_id:'u1',platform:PLAT,product_id:'p-teste',month:'2026-07',units:5,price:100,variant:'classic',snapshot:snapClassico},
  {user_id:'u1',platform:PLAT,product_id:'p-teste',month:'2026-07',units:3,price:100,variant:'premium',snapshot:snapPremium}
];
const cons=C.consolidar({sales:vendas,ads:[],exp:[]},produtos,['2026-07'],{unitCosts});
eq('9. consolida soma os dois perfis (8 unidades)',cons.total.units,8);
eq('9. consolida faturamento dos dois perfis',cons.total.rev,800);
// comissão total = 5x11 + 3x17 = 55 + 51 = 106
eq('9. consolida usa a taxa de cada perfil',cons.total.comm,106);

// duplicata real (mesmo perfil repetido) continua sendo ignorada
const consDup=C.consolidar({sales:vendas.concat([vendas[0]]),ads:[],exp:[]},produtos,['2026-07'],{unitCosts});
eq('9. duplicata do mesmo perfil não soma',consDup.total.units,8);

// -------------------------------------------- 10) consolidação respeita o congelado
const consSnap=C.consolidar({sales:[{user_id:'u1',platform:PLAT,product_id:'p-teste',month:'2026-07',units:10,price:100,variant:'',snapshot:snapJulho}],ads:[],exp:[]},
  produtos,['2026-07'],{unitCosts});
eq('10. julho consolidado mantém 11% (10x11)',consSnap.total.comm,110);
const consSem=C.consolidar({sales:[{user_id:'u1',platform:PLAT,product_id:'p-teste',month:'2026-08',units:10,price:100,variant:''}],ads:[],exp:[]},
  produtos,['2026-08'],{unitCosts});
eq('10. mês sem snapshot usa o cadastro atual (10x16)',consSem.total.comm,160);

// -------------------------------------------- 11) importação de planilha
// Usa o parser REAL (PainelPlanilha.conferir) com um catálogo de teste. `products` é um
// let global do app.js — a atribuição abaixo troca o catálogo em memória e o restaura no fim.
if(window.PainelPlanilha&&window.PainelPlanilha.conferir){
  const backup=products;
  try{
    products=[
      {id:'t1',name:'Voltímetro',sku:'VOL-TESTE',category:'Outros',cost:20,default_price:100,active:true,channels:{[PLAT]:canal(11)}},
      {id:'t2',name:'Suporte',sku:'SUP-TESTE',category:'Outros',cost:10,default_price:50,active:true,channels:{[PLAT]:canal(11)}}
    ];
    const linhas=[
      ['SKU','Produto','Tipo de anúncio','Unidades vendidas','Preço médio','Comissão (R$)','Comissão (%)','Tarifa fixa (R$)','Taxa adicional (%)','Frete (R$)','Embalagem (R$)','Imposto (%)','Custo unitário (R$)'],
      ['VOL-TESTE','Voltímetro','Clássico',31,'49,80','','','','','','','',''],
      ['VOL-TESTE','Voltímetro','Premium', 10,'59,90','',17,6.25,'',12.5,'','',''],
      ['SUP-TESTE','Suporte','',           60,'29,20',3.5,'','','',8.9,'',4,11.5],
      ['VOL-TESTE','Voltímetro','Clássico',99,'99,00','','','','','','','',''], // duplicata
      ['NAO-EXISTE','Fantasma','',          5,'10,00','','','','','','','','']  // sem cadastro
    ];
    const rel=window.PainelPlanilha.conferir(linhas);
    eq('11. importação: 3 linhas válidas',rel.validas.length,3);
    eq('11. importação: 1 duplicata (mesmo SKU+perfil)',rel.duplicados.length,1);
    eq('11. importação: 1 SKU não cadastrado',rel.naoEncontrados.length,1);
    eq('11. importação: nenhum campo inválido',rel.invalidos.length,0);
    ok('11. mesmo SKU em Clássico E Premium vira 2 linhas',
       rel.validas.filter(r=>r.sku==='VOL-TESTE').length===2,
       JSON.stringify(rel.validas.filter(r=>r.sku==='VOL-TESTE').map(r=>r.variant)));
    const sup=rel.validas.find(r=>r.sku==='SUP-TESTE');
    // "das" NÃO pode casar com "unidades vendi(das)" — senão o imposto lia as unidades
    eq('11. imposto lê a coluna certa (4%, não as 60 unidades)',sup.real.taxPct,4);
    eq('11. comissão real em R$ lida da planilha',sup.real.commissionRs,3.5);
    eq('11. custo real lido da planilha',sup.real.cost,11.5);
    const snapImp=V.previewSnapshot(products[1],sup.price,sup.units,sup.variant,sup.real);
    eq('11. snapshot da importação usa a comissão real',snapImp.commissionRs,3.5);
    eq('11. snapshot da importação usa o imposto real',snapImp.taxPct,4);
    ok('11. campos sem valor na planilha vêm da config',
       snapImp.fields.packaging==='config'&&snapImp.fields.fixedFee==='config',
       JSON.stringify(snapImp.fields));
    const cla=rel.validas.find(r=>r.variant==='classic');
    ok('11. linha sem custos reais fica 100% congelada da config',
       Object.keys(cla.real).length===0,JSON.stringify(cla.real));
  }catch(e){ok('11. importação de planilha',false,'erro: '+e.message)}
  finally{products=backup}
}

// ---------------------------------------------------------------- relatório
const pass=R.filter(r=>r.pass).length,fail=R.length-pass;
console.log('%c'+'='.repeat(64),'color:#888');
console.log('%cTESTES — histórico congelado de Vendas','font-weight:bold;font-size:14px');
R.forEach(r=>console.log((r.pass?'%c  PASSOU  ':'%c  FALHOU  ')+'%c'+r.nome+(r.detalhe?'  ('+r.detalhe+')':''),
  r.pass?'color:#fff;background:#178a4b':'color:#fff;background:#c52c2c','color:inherit'));
console.log('%c'+'='.repeat(64),'color:#888');
console.log(`%c${pass} passaram · ${fail} falharam · ${R.length} no total`,
  fail?'color:#c52c2c;font-weight:bold':'color:#178a4b;font-weight:bold');
window.__testeVendasSnapshot={pass,fail,total:R.length,resultados:R};
return window.__testeVendasSnapshot;
})();
