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
// Além de unidades e preço, o modelo traz as colunas OPCIONAIS de custos reais. Preenchidas,
// elas têm PRIORIDADE sobre a configuração da Precificação e ficam congeladas no mês.
// Em branco, o painel congela a configuração atual do canal.
const COLS_MODELO=['SKU','Produto','Tipo de anúncio','Unidades vendidas','Preço médio',
  'Comissão (R$)','Comissão (%)','Tarifa fixa (R$)','Taxa adicional (%)','Frete (R$)',
  'Embalagem (R$)','Imposto (%)','Custo unitário (R$)'];
function baixarModelo(){
  const v=V();if(!v){alert('Abra a aba Vendas primeiro.');return}
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou. Recarregue a página.');return}
  const ativos=v.products().filter(p=>p.active!==false);
  if(!ativos.length){alert('Nenhum produto ativo cadastrado. Cadastre em Produtos.');return}
  const mes=v.month();
  const aoa=[COLS_MODELO.slice()];
  ativos.forEach(p=>{
    const e=v.entry(p.id)||{};
    aoa.push([p.sku||'',p.name||'','',(+e.units>0?+e.units:''),(+e.price>0?+e.price:''),
      '','','','','','','','']);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:18},{wch:42},{wch:16},{wch:18},{wch:14},
    {wch:14},{wch:13},{wch:15},{wch:17},{wch:12},{wch:15},{wch:12},{wch:18}];
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
  // "comissao (%)" e "comissao (r$)" começam igual: casa primeiro o mais específico.
  const idxPct=(...alvos)=>H.findIndex(h=>alvos.some(a=>h.includes(a))&&(h.includes('%')||h.includes('percent')||h.includes('aliquota')));
  const idxRs =(...alvos)=>H.findIndex(h=>alvos.some(a=>h.includes(a))&&(h.includes('r$')||h.includes('valor')||h.includes('reais')));
  return{
    sku:idx('sku','codigo','id do produto','product_id'),
    nome:idx('produto','nome','descricao'),
    variant:idx('tipo de anuncio','tipo do anuncio','modalidade','perfil','tipo de anúncio'),
    units:idx('unidade','unidades vendidas','qtd','quantidade'),
    price:idx('preco medio','preço médio','preco','preço','valor unitario'),
    // reais da planilha (todas OPCIONAIS)
    commissionRs:idxRs('comissao','comissão'),
    commissionPct:idxPct('comissao','comissão'),
    fixedFee:idx('tarifa fixa','taxa fixa','tarifa'),
    servicePct:idx('taxa adicional','adicional','servico','serviço'),
    freight:idx('frete','logistica','logística'),
    packaging:idx('embalagem','packaging'),
    // "das" só como palavra inteira: como SUBSTRING ele casaria com "unidades vendi(das)"
    // e o imposto acabaria lendo a coluna de unidades.
    taxPct:(()=>{const i=idx('imposto','aliquota','alíquota');return i>=0?i:H.findIndex(h=>/(^|[^a-z])das([^a-z]|$)/.test(h))})(),
    cost:idx('custo unitario','custo unitário','custo de compra','custo')
  };
}

// "Clássico"/"Premium"/livre → chave estável do perfil. Vazio = padrão (comportamento atual).
function slugVariant(txt){
  const s=norm(txt);
  if(!s)return'';
  if(s.includes('class'))return'classic';
  if(s.includes('premium')||s.includes('prem'))return'premium';
  return s.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24);
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

    // Perfil do anúncio: o MESMO SKU pode aparecer como Clássico e Premium no mesmo mês.
    // Cada perfil vira uma linha independente (chave produto+perfil).
    const variant=col.variant>=0?slugVariant(L[col.variant]):'';

    // Valores REAIS da planilha (opcionais). Só entram se a célula tiver número válido —
    // célula vazia significa "não informado" e cai na configuração atual congelada.
    const real={};
    const captura=(campo,ci)=>{
      if(ci<0)return;
      const raw=L[ci];
      if(raw==null||String(raw).trim()==='')return;
      const n=toNum(raw);
      if(!Number.isFinite(n)||n<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:campo+' inválido ("'+String(raw)+'")'});return}
      real[campo]=n;
    };
    const antes=invalidos.length;
    captura('commissionRs',col.commissionRs);
    captura('commissionPct',col.commissionPct);
    captura('fixedFee',col.fixedFee);
    captura('servicePct',col.servicePct);
    captura('freight',col.freight);
    captura('packaging',col.packaging);
    captura('taxPct',col.taxPct);
    captura('cost',col.cost);
    if(invalidos.length>antes)continue; // alguma coluna real veio quebrada: não importa a linha

    const chave=p.id+'|'+variant;
    if(vistos[chave]){duplicados.push({linha:nLinha,sku:skuRaw,variant});continue} // fica o 1º
    vistos[chave]=true;
    validas.push({product_id:p.id,nome:p.name,sku:p.sku||'',units:u,price:pr,variant,real});
  }
  // quantos já têm valor preenchido no mês (serão substituídos — mesma chave produto+perfil)
  const sobrescreve=validas.filter(r=>{const e=v.entry(r.product_id,r.variant);return e&&((+e.units>0)||(+e.price>0))});
  const congeladas=validas.filter(r=>{const e=v.entry(r.product_id,r.variant);return e&&e.snapshot});
  const comReais=validas.filter(r=>Object.keys(r.real||{}).length>0);
  const perfis=[...new Set(validas.map(r=>r.variant))];
  return{validas,naoEncontrados,duplicados,invalidos,sobrescreve,congeladas,comReais,perfis};
}

// ---------- 4) Modal de conferência ----------
function fecharModal(){const m=el('plModal');if(m)m.classList.add('hidden')}
function abrirConferencia(rel,nomeArquivo){
  const m=el('plModal'),body=el('plModalBody'),ok=el('plConfirm');
  if(!m)return;
  const lista=(titulo,arr,fmt)=>arr.length
    ? `<details class="pl-det"><summary>${esc(titulo)} (${arr.length})</summary><ul>${arr.slice(0,20).map(fmt).join('')}</ul>${arr.length>20?`<p class="help">…e mais ${arr.length-20}.</p>`:''}</details>`
    : '';
  // Revisão do que será CONGELADO em cada linha: o que veio da planilha e o que veio da
  // configuração atual. Nada é gravado enquanto o usuário não confirmar.
  const vv=V();
  const rotulo={commission:'Comissão',fixedFee:'Tarifa fixa',servicePct:'Taxa adicional',
    unitFee:'Tarifa por unidade',freight:'Frete',packaging:'Embalagem',
    returnsPct:'Devoluções',taxPct:'Imposto',cost:'Custo'};
  const previa=rel.validas.slice(0,20).map(r=>{
    const p=vv.products().find(x=>x.id===r.product_id);
    let s=null;try{s=vv.previewSnapshot(p,r.price,r.units,r.variant,r.real)}catch(e){}
    if(!s)return`<tr><td>${esc(r.nome)}</td><td colspan="6" class="help">sem prévia</td></tr>`;
    const orig=k=>s.fields&&s.fields[k]==='planilha'
      ?'<span class="status good" title="Valor real informado na planilha">planilha</span>'
      :'<span class="status neutral" title="Congelado da configuração atual da Precificação">config</span>';
    return`<tr>
      <td class="mo-name">${esc(r.nome)}${r.variant?` <span class="status neutral">${esc(vv.variantLabel(r.variant))}</span>`:''}</td>
      <td>${esc(String(r.units))}</td>
      <td>${fmtMoney(s.price)}</td>
      <td>${fmtMoney(s.commissionRs)} <small class="help">${s.commissionPct}%</small><br>${orig('commission')}</td>
      <td>${fmtMoney(s.fixedFee)}<br>${orig('fixedFee')}</td>
      <td>${fmtMoney(s.freight)}<br>${orig('freight')}</td>
      <td>${s.taxPct}%<br>${orig('taxPct')}</td>
      <td>${fmtMoney(s.cost)}<br>${orig('cost')}</td>
    </tr>`;
  }).join('');

  body.innerHTML=
    `<p class="help">${esc(nomeArquivo)} · ${esc(V().platformName())} · ${esc(S().monthLabel?S().monthLabel(V().month()):V().month())}</p>
     <div class="pl-sum">
       <div class="pl-stat good"><b>${rel.validas.length}</b><span>linhas válidas</span></div>
       <div class="pl-stat ${rel.naoEncontrados.length?'bad':''}"><b>${rel.naoEncontrados.length}</b><span>SKU não encontrado</span></div>
       <div class="pl-stat ${rel.duplicados.length?'warn':''}"><b>${rel.duplicados.length}</b><span>SKU+perfil duplicado</span></div>
       <div class="pl-stat ${rel.invalidos.length?'bad':''}"><b>${rel.invalidos.length}</b><span>campo inválido</span></div>
       <div class="pl-stat"><b>${(rel.comReais||[]).length}</b><span>com custos reais</span></div>
     </div>
     <p class="help">Valores preenchidos na planilha têm <b>prioridade</b>; os vazios são congelados a partir da configuração atual da Precificação. Depois de salvo, este mês não muda mais.</p>`
    +(rel.sobrescreve.length?`<p class="pl-warn">⚠️ ${rel.sobrescreve.length} lançamento(s) já existiam neste mês e serão <b>atualizados</b> (mesmo produto + perfil — não duplica).</p>`:'')
    +((rel.congeladas||[]).length?`<p class="pl-warn">⚠️ ${rel.congeladas.length} já tinham taxas congeladas de um fechamento anterior; a importação grava um snapshot novo para eles.</p>`:'')
    +((rel.perfis||[]).filter(Boolean).length?`<p class="help">Perfis encontrados: ${rel.perfis.map(x=>esc(vv.variantLabel(x))).join(', ')} — cada um é calculado separadamente.</p>`:'')
    +(rel.validas.length?`<details class="pl-det" open><summary>Revisar o que será congelado (${Math.min(20,rel.validas.length)} de ${rel.validas.length})</summary>
        <div class="table-wrap"><table class="monthly-table"><thead><tr><th>Produto</th><th>Unid.</th><th>Preço</th><th>Comissão</th><th>Tarifa fixa</th><th>Frete</th><th>Imposto</th><th>Custo</th></tr></thead><tbody>${previa}</tbody></table></div>
      </details>`:'')
    +lista('SKUs não encontrados',rel.naoEncontrados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> não está cadastrado — nenhum produto é criado automaticamente.</li>`)
    +lista('SKU + perfil duplicados',rel.duplicados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b>${x.variant?' ('+esc(vv.variantLabel(x.variant))+')':''} repetido — vale a primeira ocorrência.</li>`)
    +lista('Campos inválidos',rel.invalidos,x=>`<li>Linha ${x.linha} (${esc(x.sku)}): ${esc(x.motivo)}</li>`)
    +(rel.validas.length?'':'<p class="pl-warn">Nenhuma linha válida para importar.</p>');
  ok.disabled=!rel.validas.length;
  ok.textContent=rel.validas.length?`Importar ${rel.validas.length} lançamento(s)`:'Nada a importar';
  ok.onclick=()=>{
    V().apply(rel.validas);         // só memória: marca "Alterações não salvas"
    fecharModal();
    const h=el('monthlyMonthHint');
    if(h){h.textContent=`${rel.validas.length} lançamento(s) importados — confira e clique em "Salvar mês".`;h.style.color='var(--warn)'}
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
