'use strict';
// ---------- TESTES DA IMPORTAÇÃO EM MASSA DA PRECIFICAÇÃO ----------
// Rodar com o painel aberto (index.html). No Console:
//   const s=document.createElement('script');s.src='tests/precificacao-import.test.js?v=1';document.body.appendChild(s);
//
// Usa as funções REAIS (PainelPrecPlanilha.conferir, PainelVendas.previewSnapshot,
// PainelShared.unitCosts). Nada é gravado no Supabase: a conferência só monta o "de/para"
// e a aplicação no catálogo é simulada em memória, sobre produtos de teste.
(function(){
const R=[];
const aprox=(a,b,tol)=>Math.abs((+a||0)-(+b||0))<=(tol==null?0.01:tol);
function ok(nome,cond,detalhe){R.push({nome,pass:!!cond,detalhe:detalhe||''})}
function eq(nome,got,want,tol){ok(nome,aprox(got,want,tol),`obtido ${(+got).toFixed(4)} · esperado ${(+want).toFixed(4)}`)}

const P=window.PainelPrecPlanilha,V=window.PainelVendas,S=window.PainelShared;
if(!P||!V||!S){console.error('Abra o painel (index.html) antes de rodar os testes.');return}
const unitCosts=S.unitCosts,PLAT='mercadolivre';

// aplica as mudanças da conferência no produto (mesma regra do aplicar(), sem rede)
function aplicarEmMemoria(rel,prods,mkt){
  rel.validas.forEach(r=>{
    const p=prods.find(x=>x.id===r.product_id);if(!p)return;
    p.channels=p.channels||{};
    const base=p.channels[mkt]||channelDefaults(mkt);
    const novo=Object.assign({},base);
    r.mudancas.forEach(c=>{novo[c.campo]=c.para});
    p.channels[mkt]=novo;
  });
}
const canal=o=>Object.assign({price:100,discount:0,packaging:0,freight:0,returns:0,
  feeMode:'manual',commission:11.5,fixedFee:0,service:0,tax:9.5,taxBase:'gross',unitFee:0,
  adsMode:'roas',adsValue:10,targetMargin:10,mlAdType:'classic'},o||{});
const novoCatalogo=()=>[
  {id:'x1',name:'Produto A',sku:'AAA-1',category:'Outros',cost:20,default_price:100,active:true,channels:{[PLAT]:canal()}},
  {id:'x2',name:'Produto B',sku:'BBB-2',category:'Outros',cost:10,default_price:50,active:true,channels:{[PLAT]:canal({price:50})}}
];
const CAB=P.COLS.map(c=>c[0]);
const col=rot=>CAB.indexOf(rot);
function linha(sku,vals){
  const L=new Array(CAB.length).fill('');
  L[col('SKU')]=sku;
  Object.keys(vals).forEach(rot=>{L[col(rot)]=vals[rot]});
  return L;
}

const backup=products;
try{

// ---------------------------------------------- 1) vendas salvas com comissão 11,5%
products=novoCatalogo();
const pA=products[0];
const snapJulho=V.previewSnapshot(pA,100,10,'',null);   // fechamento de julho
eq('1. venda salva congela comissão 11,5%',snapJulho.commissionPct,11.5);
const julhoAntes=unitCosts(pA,100,PLAT,snapJulho);
eq('1. julho: comissão = 11,50',julhoAntes.comm,11.5);

// ---------------------------------------------- 2) importar nova precificação com 16%
const linhas=[CAB,
  linha('AAA-1',{'Comissão (%)':'16'}),
  linha('BBB-2',{'Comissão (%)':'16,00'})            // vírgula
];
const rel=P.conferir(linhas,PLAT);
eq('2. importação: 2 produtos a atualizar',rel.validas.length,2);
eq('2. importação: nenhum inválido',rel.invalidos.length,0);
ok('2. prévia mostra de/para da comissão',
   rel.validas[0].mudancas.some(c=>c.campo==='commission'&&aprox(c.de,11.5)&&aprox(c.para,16)),
   JSON.stringify(rel.validas[0].mudancas));
aplicarEmMemoria(rel,products,PLAT);
eq('2. comissão salva no canal = 16',products[0].channels[PLAT].commission,16);
eq('2. vírgula decimal aceita (16,00)',products[1].channels[PLAT].commission,16);

// ---------------------------------------------- 3) vendas anteriores seguem 11,5%
const julhoDepois=unitCosts(products[0],100,PLAT,snapJulho);
eq('3. julho continua 11,5% após importar 16%',julhoDepois.comm,11.5);
eq('3. julho: lucro não se moveu',julhoDepois.profit,julhoAntes.profit);

// ---------------------------------------------- 4) novas vendas usam 16%
const snapAgosto=V.previewSnapshot(products[0],100,10,'',null);
eq('4. nova venda congela 16%',snapAgosto.commissionPct,16);
eq('4. nova venda: comissão = 16,00',unitCosts(products[0],100,PLAT,snapAgosto).comm,16);
ok('4. os dois meses coexistem',!aprox(julhoDepois.comm,16),`julho ${julhoDepois.comm} · novo 16`);

// ---------------------------------------------- 5) célula vazia NÃO zera
products=novoCatalogo();
products[0].channels[PLAT].freight=25;
products[0].channels[PLAT].packaging=3;
const relVazio=P.conferir([CAB,linha('AAA-1',{'Comissão (%)':'14'})],PLAT); // só comissão
const campos=(relVazio.validas[0]||{mudancas:[]}).mudancas.map(c=>c.campo);
ok('5. só a comissão entra como mudança',campos.length===1&&campos[0]==='commission',JSON.stringify(campos));
aplicarEmMemoria(relVazio,products,PLAT);
eq('5. frete preservado (célula vazia)',products[0].channels[PLAT].freight,25);
eq('5. embalagem preservada (célula vazia)',products[0].channels[PLAT].packaging,3);
eq('5. preço preservado (célula vazia)',products[0].channels[PLAT].price,100);
eq('5. comissão atualizada',products[0].channels[PLAT].commission,14);

// zero EXPLÍCITO zera
const relZero=P.conferir([CAB,linha('AAA-1',{'Frete do vendedor (R$)':0})],PLAT);
ok('5. zero explícito vira mudança',
   relZero.validas.length===1&&relZero.validas[0].mudancas.some(c=>c.campo==='freight'&&c.para===0),
   JSON.stringify((relZero.validas[0]||{}).mudancas));
aplicarEmMemoria(relZero,products,PLAT);
eq('5. frete zerado por 0 explícito',products[0].channels[PLAT].freight,0);

// ---------------------------------------------- 6) reimportação não duplica
products=novoCatalogo();
const arq=[CAB,linha('AAA-1',{'Comissão (%)':'16'})];
const r1=P.conferir(arq,PLAT);aplicarEmMemoria(r1,products,PLAT);
const antesQtd=products.length,antesCanais=Object.keys(products[0].channels).length;
const r2=P.conferir(arq,PLAT);                        // MESMO arquivo de novo
eq('6. reimportar não gera nova alteração',r2.validas.length,0);
eq('6. reimportar reconhece "sem mudança"',r2.semMudanca.length,1);
aplicarEmMemoria(r2,products,PLAT);
eq('6. catálogo não duplicou produto',products.length,antesQtd);
eq('6. canal não duplicou',Object.keys(products[0].channels).length,antesCanais);
eq('6. comissão continua 16 (idempotente)',products[0].channels[PLAT].commission,16);

// ---------------------------------------------- 7) validações
products=novoCatalogo();
// cada validação em uma conferência isolada, para o SKU repetido não se confundir
// com a linha inválida (três ocorrências do mesmo SKU seriam 2 duplicatas, não 1)
const relNE=P.conferir([CAB,linha('NAO-EXISTE',{'Comissão (%)':'10'})],PLAT);
eq('7. SKU não cadastrado é sinalizado',relNE.naoEncontrados.length,1);
eq('7. SKU não cadastrado não vira produto',relNE.validas.length,0);

const relNum=P.conferir([CAB,linha('AAA-1',{'Comissão (%)':'abc'})],PLAT);
ok('7. valor não numérico é sinalizado',relNum.invalidos.some(x=>/não é um número/.test(x.motivo)),JSON.stringify(relNum.invalidos));
eq('7. linha inválida não é aplicada',relNum.validas.length,0);

const relRange=P.conferir([CAB,linha('BBB-2',{'Imposto (%)':'150'})],PLAT);
ok('7. percentual fora de 0–100 é sinalizado',relRange.invalidos.some(x=>/fora de 0 a 100/.test(x.motivo)),JSON.stringify(relRange.invalidos));

const relNeg=P.conferir([CAB,linha('AAA-1',{'Frete do vendedor (R$)':'-5'})],PLAT);
ok('7. valor negativo é sinalizado',relNeg.invalidos.some(x=>/negativo/.test(x.motivo)),JSON.stringify(relNeg.invalidos));

const relDup=P.conferir([CAB,
  linha('AAA-1',{'Comissão (%)':'12'}),               // 1ª ocorrência vale
  linha('AAA-1',{'Comissão (%)':'13'})                // duplicada, ignorada
],PLAT);
eq('7. SKU duplicado é sinalizado',relDup.duplicados.length,1);
eq('7. duplicata não gera 2ª atualização',relDup.validas.length,1);
ok('7. vale a primeira ocorrência (12, não 13)',
   relDup.validas[0].mudancas.some(c=>c.campo==='commission'&&aprox(c.para,12)),
   JSON.stringify(relDup.validas[0].mudancas));

const relLista=P.conferir([CAB,linha('AAA-1',{'Base do imposto':'talvez'})],PLAT);
ok('7. valor de lista inválido é sinalizado',relLista.invalidos.some(x=>/não é um valor aceito/.test(x.motivo)),JSON.stringify(relLista.invalidos));

// ---------------------------------------------- 8) formatos e listas
products=novoCatalogo();
const relF=P.conferir([CAB,linha('AAA-1',{
  'Preço de venda (R$)':'R$ 1.234,56','Imposto (%)':'12%','Base do imposto':'Líquido',
  'Tipo de anúncio':'Premium','Ads — modo':'CPA','Ads — valor':'7.5','Margem desejada (%)':'20'
})],PLAT);
const mud={};(relF.validas[0]||{mudancas:[]}).mudancas.forEach(c=>{mud[c.campo]=c.para});
eq('8. "R$ 1.234,56" vira 1234.56',mud.price,1234.56);
eq('8. "12%" vira 12',mud.tax,12);
ok('8. "Líquido" vira net',mud.taxBase==='net',String(mud.taxBase));
ok('8. "Premium" vira premium',mud.mlAdType==='premium',String(mud.mlAdType));
ok('8. "CPA" vira cpa',mud.adsMode==='cpa',String(mud.adsMode));
eq('8. ponto decimal aceito (7.5)',mud.adsValue,7.5);
eq('8. margem desejada',mud.targetMargin,20);
// atalho ROAS: partindo de um canal em CPA, preencher "ROAS desejado" volta para ROAS
products=novoCatalogo();
products[0].channels[PLAT].adsMode='cpa';
products[0].channels[PLAT].adsValue=5;
const relRoas=P.conferir([CAB,linha('AAA-1',{'ROAS desejado':'8'})],PLAT);
const mr={};(relRoas.validas[0]||{mudancas:[]}).mudancas.forEach(c=>{mr[c.campo]=c.para});
ok('8. ROAS desejado define modo roas',mr.adsMode==='roas',String(mr.adsMode));
eq('8. ROAS desejado define o valor',mr.adsValue,8);
// e num canal que JÁ está em roas, o modo não conta como mudança (só o valor)
products=novoCatalogo();
const relRoas2=P.conferir([CAB,linha('AAA-1',{'ROAS desejado':'8'})],PLAT);
const campos2=relRoas2.validas[0].mudancas.map(c=>c.campo);
ok('8. modo já correto não vira mudança falsa',campos2.length===1&&campos2[0]==='adsValue',JSON.stringify(campos2));

// ---------------------------------------------- 9) não toca em cadastro nem em outro canal
products=novoCatalogo();
products[0].channels.shopee=canal({commission:20});
const relC=P.conferir([CAB,linha('AAA-1',{'Comissão (%)':'16'})],PLAT);
aplicarEmMemoria(relC,products,PLAT);
eq('9. outro marketplace intacto',products[0].channels.shopee.commission,20);
eq('9. custo do produto intacto',products[0].cost,20);
ok('9. nome e SKU intactos',products[0].name==='Produto A'&&products[0].sku==='AAA-1');
ok('9. nenhum campo de mês foi criado',
   Object.keys(products[0].channels[PLAT]).every(k=>!/month|mes/i.test(k)),
   Object.keys(products[0].channels[PLAT]).join(','));

}catch(e){ok('erro inesperado na suíte',false,e.message)}
finally{products=backup}

// ---------------------------------------------- relatório
const pass=R.filter(r=>r.pass).length,fail=R.length-pass;
console.log('%c'+'='.repeat(64),'color:#888');
console.log('%cTESTES — importação em massa da Precificação','font-weight:bold;font-size:14px');
R.forEach(r=>console.log((r.pass?'%c  PASSOU  ':'%c  FALHOU  ')+'%c'+r.nome+(r.detalhe?'  ('+r.detalhe+')':''),
  r.pass?'color:#fff;background:#178a4b':'color:#fff;background:#c52c2c','color:inherit'));
console.log('%c'+'='.repeat(64),'color:#888');
console.log(`%c${pass} passaram · ${fail} falharam · ${R.length} no total`,
  fail?'color:#c52c2c;font-weight:bold':'color:#178a4b;font-weight:bold');
window.__testePrecImport={pass,fail,total:R.length,resultados:R};
return window.__testePrecImport;
})();
