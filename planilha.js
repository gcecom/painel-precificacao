'use strict';
// ---------- PLANILHA DE VENDAS (modelo + importação) ----------
// Botão único na aba Vendas com dois itens: baixar modelo e importar planilha.
// A planilha só carrega UNIDADES e PREÇO MÉDIO — custo, comissão, Ads, imposto e lucro
// continuam sendo calculados pelo sistema. Nada vai para o Supabase aqui: a importação
// preenche a tabela em memória e marca "Alterações não salvas"; quem grava é "Salvar mês".
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const V=()=>window.PainelVendas||null;
const esc=s=>S().esc?S().esc(s):String(s??'');
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):v;

// normaliza cabeçalho: sem acento, minúsculo, sem espaços extras
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const normSku=s=>norm(s).replace(/\s/g,'');

function slugPlat(){
  const n=V()?V().platformName():'';
  return norm(n).replace(/[^a-z0-9]/g,'')
    .replace(/^mercadolivre$/,'MercadoLivre').replace(/^shopee$/,'Shopee')
    .replace(/^amazon$/,'Amazon').replace(/^magalu$/,'Magalu')||'marketplace';
}

// ---------- 1) Modelo ----------
// Uma linha por produto ATIVO, já com SKU e nome preenchidos.
function baixarModelo(){
  const v=V();if(!v){alert('Abra a aba Vendas primeiro.');return}
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou. Recarregue a página.');return}
  const ativos=v.products().filter(p=>p.active!==false);
  if(!ativos.length){alert('Nenhum produto ativo cadastrado. Cadastre em Produtos.');return}
  const mes=v.month();
  const aoa=[['SKU','Produto','Unidades vendidas','Preço médio']];
  ativos.forEach(p=>{
    const e=v.entry(p.id)||{};
    aoa.push([p.sku||'',p.name||'',(+e.units>0?+e.units:''),(+e.price>0?+e.price:'')]);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:18},{wch:42},{wch:18},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Vendas');
  XLSX.writeFile(wb,`vendas_${slugPlat()}_${mes}.xlsx`);
  fechaMenu();
}

// ---------- 2) Leitura do arquivo ----------
function lerArquivo(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));
    r.onload=()=>{
      try{
        const wb=XLSX.read(r.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        if(!ws)throw new Error('A planilha está vazia.');
        resolve(XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}));
      }catch(e){reject(e)}
    };
    r.readAsArrayBuffer(file); // xlsx e csv passam pelo mesmo caminho do SheetJS
  });
}

// número em pt-BR ou en-US ("1.234,56" / "1234.56")
function toNum(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v??'').trim();
  if(!s)return NaN;
  s=s.replace(/[R$\s]/gi,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  return Number(s);
}

function acharColunas(head){
  const H=head.map(norm);
  const idx=(...alvos)=>H.findIndex(h=>alvos.some(a=>h.includes(a)));
  return{
    sku:idx('sku','codigo','id do produto','product_id'),
    nome:idx('produto','nome','descricao'),
    units:idx('unidade','unidades vendidas','qtd','quantidade'),
    price:idx('preco','preço','preco medio','valor')
  };
}

// ---------- 3) Conferência ----------
// Relaciona por SKU (ou product_id) — nunca só pelo nome.
function conferir(linhas){
  const v=V();
  const prods=v.products();
  const porSku={},porId={};
  prods.forEach(p=>{if(p.sku)porSku[normSku(p.sku)]=p;porId[String(p.id)]=p});

  const head=linhas[0]||[];
  const col=acharColunas(head);
  if(col.sku<0&&col.units<0)throw new Error('Não encontrei as colunas "SKU" e "Unidades vendidas". Use o modelo para começar.');

  const validas=[],naoEncontrados=[],duplicados=[],invalidos=[];
  const vistos={};
  for(let i=1;i<linhas.length;i++){
    const L=linhas[i]||[];
    const nLinha=i+1; // linha real na planilha (1 = cabeçalho)
    const skuRaw=col.sku>=0?String(L[col.sku]??'').trim():'';
    const uRaw=col.units>=0?L[col.units]:'';
    const pRaw=col.price>=0?L[col.price]:'';
    if(!skuRaw&&String(uRaw).trim()===''&&String(pRaw).trim()==='')continue; // linha vazia

    const p=porSku[normSku(skuRaw)]||porId[skuRaw];
    if(!p){naoEncontrados.push({linha:nLinha,sku:skuRaw||'(vazio)'});continue}

    const u=String(uRaw).trim()===''?0:toNum(uRaw);
    const pr=String(pRaw).trim()===''?0:toNum(pRaw);
    if(!Number.isFinite(u)||u<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:'unidades inválidas ("'+String(uRaw)+'") — use um número ≥ 0'});continue}
    if(!Number.isFinite(pr)||pr<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:'preço inválido ("'+String(pRaw)+'") — use um número ≥ 0'});continue}

    if(vistos[p.id]){duplicados.push({linha:nLinha,sku:skuRaw});continue} // fica o 1º
    vistos[p.id]=true;
    validas.push({product_id:p.id,nome:p.name,sku:p.sku||'',units:u,price:pr});
  }
  // quantos já têm valor preenchido no mês (serão substituídos)
  const sobrescreve=validas.filter(r=>{const e=v.entry(r.product_id);return e&&((+e.units>0)||(+e.price>0))});
  return{validas,naoEncontrados,duplicados,invalidos,sobrescreve};
}

// ---------- 4) Modal de conferência ----------
function fecharModal(){const m=el('plModal');if(m)m.classList.add('hidden')}
function abrirConferencia(rel,nomeArquivo){
  const m=el('plModal'),body=el('plModalBody'),ok=el('plConfirm');
  if(!m)return;
  const lista=(titulo,arr,fmt)=>arr.length
    ? `<details class="pl-det"><summary>${esc(titulo)} (${arr.length})</summary><ul>${arr.slice(0,20).map(fmt).join('')}</ul>${arr.length>20?`<p class="help">…e mais ${arr.length-20}.</p>`:''}</details>`
    : '';
  body.innerHTML=
    `<p class="help">${esc(nomeArquivo)} · ${esc(V().platformName())} · ${esc(S().monthLabel?S().monthLabel(V().month()):V().month())}</p>
     <div class="pl-sum">
       <div class="pl-stat good"><b>${rel.validas.length}</b><span>linhas válidas</span></div>
       <div class="pl-stat ${rel.naoEncontrados.length?'bad':''}"><b>${rel.naoEncontrados.length}</b><span>SKU não encontrado</span></div>
       <div class="pl-stat ${rel.duplicados.length?'warn':''}"><b>${rel.duplicados.length}</b><span>SKU duplicado</span></div>
       <div class="pl-stat ${rel.invalidos.length?'bad':''}"><b>${rel.invalidos.length}</b><span>campo inválido</span></div>
       <div class="pl-stat"><b>${rel.validas.length}</b><span>produtos atualizados</span></div>
     </div>`
    +(rel.sobrescreve.length?`<p class="pl-warn">⚠️ ${rel.sobrescreve.length} produto(s) já tinham valores neste mês e serão <b>substituídos</b>.</p>`:'')
    +lista('SKUs não encontrados',rel.naoEncontrados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> não está cadastrado — nenhum produto é criado automaticamente.</li>`)
    +lista('SKUs duplicados',rel.duplicados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> repetido — vale a primeira ocorrência.</li>`)
    +lista('Campos inválidos',rel.invalidos,x=>`<li>Linha ${x.linha} (${esc(x.sku)}): ${esc(x.motivo)}</li>`)
    +(rel.validas.length?'':'<p class="pl-warn">Nenhuma linha válida para importar.</p>');
  ok.disabled=!rel.validas.length;
  ok.textContent=rel.validas.length?`Importar ${rel.validas.length} produto(s)`:'Nada a importar';
  ok.onclick=()=>{
    V().apply(rel.validas);         // só memória: marca "Alterações não salvas"
    fecharModal();
    const h=el('monthlyMonthHint');
    if(h){h.textContent=`${rel.validas.length} produto(s) importados — confira e clique em "Salvar mês".`;h.style.color='var(--warn)'}
  };
  m.classList.remove('hidden');
}

async function importar(file){
  try{
    if(typeof XLSX==='undefined')throw new Error('Biblioteca de planilha não carregou. Recarregue a página.');
    const linhas=await lerArquivo(file);
    if(!linhas||linhas.length<2)throw new Error('A planilha não tem linhas de dados.');
    abrirConferencia(conferir(linhas),file.name);
  }catch(e){
    alert('Não foi possível importar:\n\n'+e.message);
  }
}

// ---------- 5) Menu do botão ----------
function fechaMenu(){const m=el('plMenu');if(m)m.classList.add('hidden');document.removeEventListener('mousedown',foraMenu,true)}
function foraMenu(e){const w=el('plWrap');if(w&&!w.contains(e.target))fechaMenu()}
function alternaMenu(){
  const m=el('plMenu');if(!m)return;
  if(m.classList.contains('hidden')){m.classList.remove('hidden');document.addEventListener('mousedown',foraMenu,true)}
  else fechaMenu();
}

function init(){
  const btn=el('plBtn');if(!btn)return;
  btn.onclick=alternaMenu;
  if(el('plModelo'))el('plModelo').onclick=baixarModelo;
  if(el('plImportar'))el('plImportar').onclick=()=>{fechaMenu();el('plFile').click()};
  if(el('plFile'))el('plFile').onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(f)importar(f);
    e.target.value=''; // permite reimportar o mesmo arquivo
  };
  if(el('plCancel'))el('plCancel').onclick=fecharModal;
  if(el('plModal'))el('plModal').addEventListener('mousedown',e=>{if(e.target===el('plModal'))fecharModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){fechaMenu();fecharModal()}});
}
init();
window.PainelPlanilha={conferir,toNum}; // exposto para teste
})();
