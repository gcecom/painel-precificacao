'use strict';
// ---------- TESTES DO CADASTRO EM MASSA DE PRODUTOS ----------
// Rodar com o painel aberto (index.html). No Console:
//   const s=document.createElement('script');s.src='tests/produtos-import.test.js?v=1';document.body.appendChild(s);
//
// Usa a função REAL PainelProdutosPlanilha.conferir(). A gravação (aplicar) não é
// chamada de verdade — replicamos a MESMA lógica de campo-a-campo em memória, sobre um
// catálogo de teste, para verificar o resultado sem tocar no Supabase.
(function(){
const R=[];
const ap=(a,b,t)=>Math.abs((+a||0)-(+b||0))<=(t==null?0.01:t);
function ok(n,c,d){R.push({nome:n,pass:!!c,detalhe:d||''})}
function eq(n,g,w,t){ok(n,ap(g,w,t),`obtido ${JSON.stringify(g)} · esperado ${JSON.stringify(w)}`)}

const P=window.PainelProdutosPlanilha;
if(!P){console.error('Abra o painel (index.html) antes de rodar os testes.');return}
const COLS=P.COLS(),CAB=COLS.map(c=>c[0]);
const col=rot=>CAB.indexOf(rot);
function linha(vals){
  const L=new Array(CAB.length).fill('');
  Object.keys(vals).forEach(rot=>{
    const i=col(rot);if(i<0)throw new Error('coluna inexistente no modelo: '+rot);
    L[i]=vals[rot];
  });
  return L;
}
// aplica em memória a mesma regra do módulo (criar/atualizar), sem rede
function aplicarEmMemoria(rel,prods){
  rel.criar.forEach(r=>{
    prods.push(Object.assign({id:'novo-'+r.sku,channels:{}},r.dados,
      {active:r.dados.active,ads:undefined}));
  });
  rel.atualizar.forEach(r=>{
    const p=prods.find(x=>x.id===r.product_id);if(!p)return;
    p.channels=p.channels||{};
    r.mudancas.forEach(c=>{
      if(c.campo.includes('.')){
        const[mkt,f]=c.campo.split('.');
        p.channels[mkt]=p.channels[mkt]||{};
        p.channels[mkt][f]=c.para;
      }else{p[c.campo]=c.para}
    });
  });
}

const backup=products;
try{

// ============================================================ catálogo inicial
const cat=()=>[
  {id:'p1',name:'Produto A',sku:'AAA-1',category:'Eletrônicos',cost:20,default_price:100,
   image_url:'https://img.exemplo.com/a.jpg',active:true,channels:{shopee:{ad_url:'',ad_id:''}}}
];
products=cat();

// ============================================================ 1) SKU novo cria produto
const relNovo=P.conferir([CAB,linha({SKU:'BBB-2',Nome:'Produto B',Categoria:'Casa',
  'Custo unitário (R$)':'15,50','Preço padrão (R$)':'39,90',Status:'Ativo'})]);
eq('1. SKU novo entra como criar',relNovo.criar.length,1);
eq('1. SKU existente não entra como criar',relNovo.criar.filter(r=>r.sku==='AAA-1').length,0);
const nb=relNovo.criar[0].dados;
eq('1. novo produto: nome',nb.name,'Produto B');
eq('1. novo produto: custo com vírgula (15,50)',nb.cost,15.5);
eq('1. novo produto: preço com vírgula (39,90)',nb.default_price,39.9);
eq('1. novo produto: status Ativo',nb.active,true);

// ============================================================ 2) SKU existente atualiza sem duplicar
products=cat();
const relUp=P.conferir([CAB,linha({SKU:'AAA-1','Custo unitário (R$)':'25'})]);
eq('2. SKU existente entra como atualizar',relUp.atualizar.length,1);
eq('2. SKU existente NÃO entra como criar',relUp.criar.length,0);
eq('2. só o custo muda',relUp.atualizar[0].mudancas.length,1);
ok('2. de/para do custo',relUp.atualizar[0].mudancas[0].campo==='cost'
   &&ap(relUp.atualizar[0].mudancas[0].de,20)&&ap(relUp.atualizar[0].mudancas[0].para,25));
const prodsUp=cat();aplicarEmMemoria(relUp,prodsUp);
eq('2. catálogo não duplicou (continua 1 produto)',prodsUp.length,1);
eq('2. custo aplicado',prodsUp[0].cost,25);

// ============================================================ 3) célula vazia preserva; zero zera
products=cat();
const relVazio=P.conferir([CAB,linha({SKU:'AAA-1',Nome:'Produto A renomeado'})]); // só nome
eq('3. só o nome consta como mudança',relVazio.atualizar[0].mudancas.length,1);
eq('3. campo mudado é "name"',relVazio.atualizar[0].mudancas[0].campo,'name');
const prodsVazio=cat();aplicarEmMemoria(relVazio,prodsVazio);
eq('3. custo preservado (célula vazia)',prodsVazio[0].cost,20);
eq('3. preço preservado (célula vazia)',prodsVazio[0].default_price,100);
eq('3. categoria preservada (célula vazia)',prodsVazio[0].category,'Eletrônicos');
eq('3. imagem preservada (célula vazia)',prodsVazio[0].image_url,'https://img.exemplo.com/a.jpg');
eq('3. nome atualizado',prodsVazio[0].name,'Produto A renomeado');
// zero EXPLÍCITO zera
const relZero=P.conferir([CAB,linha({SKU:'AAA-1','Custo unitário (R$)':0})]);
ok('3. zero explícito vira mudança',relZero.atualizar.length===1
   &&relZero.atualizar[0].mudancas.some(c=>c.campo==='cost'&&c.para===0));
const prodsZero=cat();aplicarEmMemoria(relZero,prodsZero);
eq('3. custo zerado por 0 explícito',prodsZero[0].cost,0);

// ============================================================ 4) vírgula e ponto aceitos
products=cat();
const relFmt=P.conferir([CAB,
  linha({SKU:'AAA-1','Custo unitário (R$)':'12,345.67'}) // en-US com milhar? não; usa pt-BR abaixo
]);
// pt-BR: milhar com ponto, decimal com vírgula
const relFmt2=P.conferir([CAB,linha({SKU:'AAA-1','Preço padrão (R$)':'1.234,56'})]);
eq('4. "1.234,56" (pt-BR) vira 1234.56',relFmt2.atualizar[0].mudancas[0].para,1234.56);
const relFmt3=P.conferir([CAB,linha({SKU:'AAA-1','Preço padrão (R$)':'199.90'})]);
eq('4. "199.90" (ponto decimal) vira 199.9',relFmt3.atualizar[0].mudancas[0].para,199.9);
const relFmt4=P.conferir([CAB,linha({SKU:'AAA-1','Preço padrão (R$)':'199,90'})]);
eq('4. "199,90" (vírgula decimal) vira 199.9',relFmt4.atualizar[0].mudancas[0].para,199.9);

// ============================================================ 5) validações
products=cat();
const relSemSku=P.conferir([CAB,linha({Nome:'Sem SKU'})]);
eq('5. linha sem SKU vira erro',relSemSku.invalidos.length,1);
ok('5. motivo do erro cita SKU obrigatório',/SKU é obrigatório/.test(relSemSku.invalidos[0].motivo));

const relDup=P.conferir([CAB,
  linha({SKU:'CCC-3',Nome:'Primeiro'}),
  linha({SKU:'CCC-3',Nome:'Segundo'})
]);
eq('5. SKU duplicado no arquivo é sinalizado',relDup.duplicados.length,1);
eq('5. vale a primeira ocorrência (só 1 criação)',relDup.criar.length,1);
eq('5. o criado é o Primeiro',relDup.criar[0].dados.name,'Primeiro');

const relUrl=P.conferir([CAB,linha({SKU:'AAA-1','URL da imagem':'nao-e-url'})]);
ok('5. URL inválida é sinalizada',relUrl.invalidos.some(x=>/http/.test(x.motivo)));
const relUrlOk=P.conferir([CAB,linha({SKU:'AAA-1','URL da imagem':'https://ok.com/x.png'})]);
eq('5. URL válida vira mudança',relUrlOk.atualizar.length,1);

const relStatus=P.conferir([CAB,linha({SKU:'AAA-1',Status:'talvez'})]);
ok('5. status inválido é sinalizado',relStatus.invalidos.some(x=>/Ativo\/Inativo/.test(x.motivo)));
const relStatusOk=P.conferir([CAB,linha({SKU:'AAA-1',Status:'Inativo'})]);
eq('5. status "Inativo" aplicado',relStatusOk.atualizar[0].mudancas[0].para,'Inativo');

const relNeg=P.conferir([CAB,linha({SKU:'AAA-1','Custo unitário (R$)':'-5'})]);
ok('5. valor negativo é sinalizado',relNeg.invalidos.some(x=>/negativo/.test(x.motivo)));

const relNum=P.conferir([CAB,linha({SKU:'AAA-1','Preço padrão (R$)':'abc'})]);
ok('5. valor não numérico é sinalizado',relNum.invalidos.some(x=>/não é um número/.test(x.motivo)));

const relNovoSemNome=P.conferir([CAB,linha({SKU:'DDD-4','Custo unitário (R$)':'10'})]);
ok('5. produto novo sem nome é erro',relNovoSemNome.invalidos.some(x=>/Nome é obrigatório/.test(x.motivo)));

// ============================================================ 6) prévia: novos/atualizados/ignorados/erros
products=cat();
const relPrev=P.conferir([CAB,
  linha({SKU:'AAA-1','Custo unitário (R$)':'30'}),          // atualizado
  linha({SKU:'AAA-1'}),                                      // ignorado: sem mudança real (mesmo SKU, sem campo)
  linha({SKU:'EEE-5',Nome:'Produto E'}),                     // novo
  linha({SKU:'FFF-6','Preço padrão (R$)':'x'})               // erro
]);
// a 2ª linha com SKU AAA-1 é duplicata do arquivo (mesmo SKU já visto na 1ª linha)
eq('6. novos = 1',relPrev.criar.length,1);
eq('6. atualizados = 1',relPrev.atualizar.length,1);
eq('6. ignorados (duplicado) = 1',relPrev.duplicados.length,1);
eq('6. erros = 1',relPrev.invalidos.length,1);

// "ignorado por falta de mudança" isolado (sem duplicata no meio)
const relSemMud=P.conferir([CAB,linha({SKU:'AAA-1'})]); // nenhum campo preenchido
eq('6. sem nenhum campo preenchido -> sem mudança',relSemMud.semMudanca.length,1);
eq('6. sem mudança não entra em atualizar',relSemMud.atualizar.length,0);

// ============================================================ 7) reimportação não duplica
products=cat();
const arq=[CAB,linha({SKU:'GGG-7',Nome:'Produto G','Custo unitário (R$)':'50'})];
const r1=P.conferir(arq);const prodsReimp=cat();aplicarEmMemoria(r1,prodsReimp);
const antesQtd=prodsReimp.length;
products=prodsReimp;                                 // catálogo já tem o produto G
const r2=P.conferir(arq);                                    // MESMO arquivo de novo
eq('7. reimportar reconhece SKU existente (não cria de novo)',r2.criar.length,0);
eq('7. reimportar não gera mudança (já está igual)',r2.atualizar.length,0);
eq('7. reimportar é "sem mudança"',r2.semMudanca.length,1);
aplicarEmMemoria(r2,prodsReimp);
eq('7. catálogo não duplicou',prodsReimp.length,antesQtd);

// ============================================================ 8) custo/preço não tocam vendas salvas
// Escopo do módulo é só Produtos: confirmamos que a mudança aplicada mexe apenas em
// products (cost/default_price), sem qualquer referência a mês, snapshot ou monthly_sales.
products=cat();
const relCusto=P.conferir([CAB,linha({SKU:'AAA-1','Custo unitário (R$)':'99'})]);
const camposMudados=relCusto.atualizar[0].mudancas.map(c=>c.campo);
ok('8. só campos do cadastro mudam (nunca mês/snapshot)',
   camposMudados.every(c=>!/month|mes|snapshot/i.test(c)),camposMudados.join(','));

// ============================================================ 9) RLS / isolamento por usuário
// A gravação real (fora do escopo deste teste) sempre passa por supabaseClient.createProduct
// /updateProduct, que já anexam o token do usuário logado (RLS no banco). Aqui confirmamos
// que o produto criado carrega os campos esperados para isso (sem id de outro usuário).
products=cat();
const relCriaRLS=P.conferir([CAB,linha({SKU:'HHH-8',Nome:'Produto H'})]);
ok('9. novo produto não inclui user_id fixo (é atribuído na gravação)',
   !('user_id' in relCriaRLS.criar[0].dados));

}catch(e){ok('erro inesperado na suíte',false,e.message+' | '+e.stack)}
finally{products=backup}

const pass=R.filter(r=>r.pass).length,fail=R.length-pass;
console.log('%c'+'='.repeat(64),'color:#888');
console.log('%cTESTES — cadastro em massa de Produtos','font-weight:bold;font-size:14px');
R.forEach(r=>console.log((r.pass?'%c  PASSOU  ':'%c  FALHOU  ')+'%c'+r.nome+(r.detalhe?'  ('+r.detalhe+')':''),
  r.pass?'color:#fff;background:#178a4b':'color:#fff;background:#c52c2c','color:inherit'));
console.log('%c'+'='.repeat(64),'color:#888');
console.log(`%c${pass} passaram · ${fail} falharam · ${R.length} no total`,
  fail?'color:#c52c2c;font-weight:bold':'color:#178a4b;font-weight:bold');
window.__testeProdutosImport={pass,fail,total:R.length,resultados:R};
return window.__testeProdutosImport;
})();
