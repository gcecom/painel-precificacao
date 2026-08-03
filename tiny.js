'use strict';
// ---------- INVENTÁRIO TINY/OLIST (Estoque) ----------
// Segue exatamente o arquivo exportado pelo Tiny: aba "Inventário de Estoque" com as
// colunas Produto | Código (SKU) | Preço | UN | Localização | Estoque atual.
// Nesta versão só a QUANTIDADE é aplicada (via "Estoque atual"); Produto serve para
// conferência e Preço/UN/Localização NÃO tocam o cadastro central.
// Nada vai para o Supabase aqui: preenche a tela e quem grava é "Salvar estoque".
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const E=()=>window.PainelEstoque||null;
const esc=s=>S().esc?S().esc(s):String(s??'');

const ABA='Inventário de Estoque';
const COLS=['Produto','Código (SKU)','Preço','UN','Localização','Estoque atual'];

// Tolera maiúsculas/minúsculas, acentos e espaços extras nos cabeçalhos
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/\s+/g,' ').trim();
const normSku=s=>norm(s).replace(/\s/g,'');

// ---------- Modelo ----------
function baixarModelo(){
  const e=E();if(!e){alert('Abra a aba Estoque primeiro.');return}
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou. Recarregue a página.');return}
  const ativos=e.products().filter(p=>p.active!==false);
  if(!ativos.length){alert('Nenhum produto ativo cadastrado. Cadastre em Produtos.');return}
  const aoa=[COLS.slice()];
  ativos.forEach(p=>{
    const c=e.entry(p.id)||{};
    // mesma ordem/nomes do Tiny; Preço só informativo, quantidade em "Estoque atual"
    aoa.push([p.name||'',p.sku||'',(+p.default_price>0?+p.default_price:''),'UN','',(+c.qty>0?+c.qty:0)]);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:44},{wch:20},{wch:12},{wch:6},{wch:16},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,ABA);
  const d=new Date(),p2=n=>String(n).padStart(2,'0');
  XLSX.writeFile(wb,`inventario_${p2(d.getDate())}-${p2(d.getMonth()+1)}-${d.getFullYear()}.xls`,{bookType:'biff8'});
  fechaMenu();
}

// ---------- Leitura ----------
function lerArquivo(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));
    r.onload=()=>{
      try{
        const wb=XLSX.read(r.result,{type:'array'}); // .xls (BIFF) e .xlsx pelo mesmo caminho
        // procura a aba do Tiny; se não achar pelo nome, usa a primeira
        const nome=wb.SheetNames.find(n=>norm(n)===norm(ABA))||wb.SheetNames[0];
        const ws=wb.Sheets[nome];
        if(!ws)throw new Error('A planilha está vazia.');
        resolve({aba:nome,linhas:XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''})});
      }catch(e){reject(e)}
    };
    r.readAsArrayBuffer(file);
  });
}

function toNum(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v??'').trim();
  if(!s)return NaN;
  s=s.replace(/[R$\s]/gi,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  return Number(s);
}

// O Tiny costuma emitir linhas de título antes do cabeçalho: procura a linha que
// contenha "Código (SKU)" e "Estoque atual" (as duas colunas essenciais).
function acharCabecalho(linhas){
  for(let i=0;i<Math.min(linhas.length,15);i++){
    const H=(linhas[i]||[]).map(norm);
    const sku=H.findIndex(h=>h.includes('codigo')&&h.includes('sku'))>=0?H.findIndex(h=>h.includes('codigo')&&h.includes('sku')):H.findIndex(h=>h==='sku'||h==='codigo');
    const qty=H.findIndex(h=>h.includes('estoque atual')||h==='estoque');
    if(sku>=0&&qty>=0){
      return{linha:i,col:{
        nome:H.findIndex(h=>h==='produto'||h.includes('descricao')),
        sku, preco:H.findIndex(h=>h.includes('preco')),
        un:H.findIndex(h=>h==='un'||h.includes('unidade')),
        local:H.findIndex(h=>h.includes('localiza')),
        qty}};
    }
  }
  return null;
}

// ---------- Conferência ----------
function conferir(linhas){
  const e=E();
  const cab=acharCabecalho(linhas);
  if(!cab)throw new Error('Não encontrei as colunas obrigatórias "Código (SKU)" e "Estoque atual". Use o modelo do Tiny.');
  const{col}=cab;

  const porSku={},porId={};
  e.products().forEach(p=>{if(p.sku)porSku[normSku(p.sku)]=p;porId[String(p.id)]=p});

  const encontrados=[],naoEncontrados=[],semSku=[],duplicados=[],invalidos=[];
  const vistos={};
  for(let i=cab.linha+1;i<linhas.length;i++){
    const L=linhas[i]||[];
    const nLinha=i+1;
    const skuRaw=col.sku>=0?String(L[col.sku]??'').trim():'';
    const nomeRaw=col.nome>=0?String(L[col.nome]??'').trim():'';
    const qRaw=col.qty>=0?L[col.qty]:'';
    if(!skuRaw&&!nomeRaw&&String(qRaw).trim()==='')continue; // linha vazia

    // Produtos sem SKU viram PENDÊNCIA — nunca casamos só pelo nome
    if(!skuRaw){semSku.push({linha:nLinha,nome:nomeRaw||'(sem nome)'});continue}

    const p=porSku[normSku(skuRaw)]||porId[skuRaw];
    if(!p){naoEncontrados.push({linha:nLinha,sku:skuRaw,nome:nomeRaw});continue}

    const q=String(qRaw).trim()===''?0:toNum(qRaw);
    if(!Number.isFinite(q)||q<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:'quantidade inválida ("'+String(qRaw)+'") — use um número ≥ 0'});continue}

    if(vistos[p.id]){duplicados.push({linha:nLinha,sku:skuRaw});continue} // vale a 1ª
    vistos[p.id]=true;
    encontrados.push({product_id:p.id,sku:p.sku||'',nome:p.name||'',planilha:nomeRaw,qty:Math.round(q)});
  }
  // divergência de nome só para conferência (não bloqueia, não altera cadastro)
  const divergentes=encontrados.filter(r=>r.planilha&&norm(r.planilha)!==norm(r.nome));
  return{encontrados,naoEncontrados,semSku,duplicados,invalidos,divergentes,aba:cab.aba};
}

// ---------- Modal ----------
function fecharModal(){const m=el('tyModal');if(m)m.classList.add('hidden')}
function abrirConferencia(rel,nomeArquivo){
  const m=el('tyModal'),body=el('tyModalBody'),ok=el('tyConfirm');
  if(!m)return;
  const lista=(titulo,arr,fmt)=>arr.length
    ? `<details class="pl-det"><summary>${esc(titulo)} (${arr.length})</summary><ul>${arr.slice(0,20).map(fmt).join('')}</ul>${arr.length>20?`<p class="help">…e mais ${arr.length-20}.</p>`:''}</details>`
    : '';
  body.innerHTML=
    `<p class="help">${esc(nomeArquivo)} · aba “${esc(ABA)}”</p>
     <div class="pl-sum">
       <div class="pl-stat good"><b>${rel.encontrados.length}</b><span>produtos encontrados</span></div>
       <div class="pl-stat ${rel.naoEncontrados.length?'bad':''}"><b>${rel.naoEncontrados.length}</b><span>SKU não encontrado</span></div>
       <div class="pl-stat ${rel.semSku.length?'warn':''}"><b>${rel.semSku.length}</b><span>linhas sem SKU</span></div>
       <div class="pl-stat ${rel.duplicados.length?'warn':''}"><b>${rel.duplicados.length}</b><span>duplicidades</span></div>
       <div class="pl-stat ${rel.invalidos.length?'bad':''}"><b>${rel.invalidos.length}</b><span>quantidade inválida</span></div>
       <div class="pl-stat"><b>${rel.encontrados.length}</b><span>serão atualizados</span></div>
     </div>
     <p class="help">Apenas a quantidade (“Estoque atual”) é aplicada. Preço, UN e Localização não alteram o cadastro.</p>`
    +lista('Linhas sem SKU (pendência)',rel.semSku,x=>`<li>Linha ${x.linha}: <b>${esc(x.nome)}</b> — cadastre o SKU em Produtos para importar.</li>`)
    +lista('SKUs não encontrados',rel.naoEncontrados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b>${x.nome?' ('+esc(x.nome)+')':''} não está cadastrado — nenhum produto é criado automaticamente.</li>`)
    +lista('SKUs duplicados',rel.duplicados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> repetido — vale a primeira ocorrência.</li>`)
    +lista('Quantidades inválidas',rel.invalidos,x=>`<li>Linha ${x.linha} (${esc(x.sku)}): ${esc(x.motivo)}</li>`)
    +lista('Nome diferente do cadastro (só conferência)',rel.divergentes,x=>`<li>${esc(x.sku)}: planilha “${esc(x.planilha)}” · cadastro “${esc(x.nome)}”</li>`)
    +(rel.encontrados.length?'':'<p class="pl-warn">Nenhuma linha válida para importar.</p>');
  ok.disabled=!rel.encontrados.length;
  ok.textContent=rel.encontrados.length?`Atualizar ${rel.encontrados.length} produto(s)`:'Nada a importar';
  ok.onclick=()=>{
    E().applyQty(rel.encontrados);  // só memória + recálculo
    fecharModal();
  };
  m.classList.remove('hidden');
}

async function importar(file){
  try{
    if(typeof XLSX==='undefined')throw new Error('Biblioteca de planilha não carregou. Recarregue a página.');
    const{linhas}=await lerArquivo(file);
    if(!linhas||linhas.length<2)throw new Error('A planilha não tem linhas de dados.');
    abrirConferencia(conferir(linhas),file.name);
  }catch(e){
    alert('Não foi possível importar o inventário:\n\n'+e.message);
  }
}

// ---------- Menu ----------
function fechaMenu(){const m=el('tyMenu');if(m)m.classList.add('hidden');document.removeEventListener('mousedown',foraMenu,true)}
function foraMenu(e){const w=el('tyWrap');if(w&&!w.contains(e.target))fechaMenu()}
function alternaMenu(){
  const m=el('tyMenu');if(!m)return;
  if(m.classList.contains('hidden')){m.classList.remove('hidden');document.addEventListener('mousedown',foraMenu,true)}
  else fechaMenu();
}

function init(){
  const btn=el('tyBtn');if(!btn)return;
  btn.onclick=alternaMenu;
  if(el('tyModelo'))el('tyModelo').onclick=baixarModelo;
  if(el('tyImportar'))el('tyImportar').onclick=()=>{fechaMenu();el('tyFile').click()};
  if(el('tyFile'))el('tyFile').onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(f)importar(f);
    e.target.value='';
  };
  if(el('tyCancel'))el('tyCancel').onclick=fecharModal;
  if(el('tyModal'))el('tyModal').addEventListener('mousedown',e=>{if(e.target===el('tyModal'))fecharModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){fechaMenu();fecharModal()}});
}
init();
window.PainelTiny={conferir,acharCabecalho,COLS,ABA}; // exposto para teste
})();
