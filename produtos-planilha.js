'use strict';
// ---------- CADASTRO EM MASSA DE PRODUTOS (Excel) ----------
// Bloco no topo da aba Produtos: Baixar modelo Excel + Importar Excel. Reusa o cadastro
// central (mesma tabela `products`, mesmo createProduct/updateProduct do formulário
// manual) — não cria tabela nem coluna nova, não altera outros módulos.
//
// SKU é a chave: normalizado (minúsculo, sem acento, sem espaço) para achar o produto.
// SKU já cadastrado -> atualiza esse produto (nunca cria outro). SKU novo -> cria.
// Célula vazia PRESERVA o valor atual; só um campo preenchido substitui. Em produto NOVO,
// campo vazio usa o mesmo padrão do botão "Novo produto" do formulário manual.
//
// Custo e preço mexem só na precificação DAQUI PRA FRENTE: monthly_sales já grava um
// snapshot congelado no fechamento do mês (ver performance.js), então esta importação
// nunca é lida por Vendas/Dashboard/Financeiro de um mês já salvo.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const esc=s=>S().esc?S().esc(s):String(s??'');
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const normSku=s=>norm(s).replace(/\s/g,'');
const m2=v=>(typeof money2==='function'?money2(v):Math.round((+v||0)*100)/100);
const URL_RE=/^https?:\/\/[^\s]+$/i;

function plats(){try{return Object.keys(PLATFORMS)}catch(e){return[]}}
function platName(k){try{return PLATFORMS[k].name}catch(e){return k}}
function lista(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function novoId(){return crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())}

// ---------- colunas do modelo (base + 2 por marketplace) ----------
const BASE_COLS=[
  ['SKU',null,'sku'],
  ['Nome',null,'text'],
  ['Categoria',null,'text'],
  ['Custo unitário (R$)',null,'money'],
  ['Preço padrão (R$)',null,'money'],
  ['URL da imagem',null,'url'],
  ['Status',null,'status']
];
function adCols(){
  const out=[];
  plats().forEach(k=>{
    out.push([`Link do anúncio — ${platName(k)}`,{ch:k,f:'ad_url'},'url']);
    out.push([`ID do anúncio — ${platName(k)}`,{ch:k,f:'ad_id'},'text']);
  });
  return out;
}
function COLS(){return BASE_COLS.concat(adCols())}
const LABEL={SKU:'SKU',Nome:'Nome',Categoria:'Categoria',
  'Custo unitário (R$)':'Custo unitário','Preço padrão (R$)':'Preço padrão',
  'URL da imagem':'URL da imagem',Status:'Status'};

// ---------- conversões ----------
// vazio => null ("preserva"); número inválido => NaN; aceita vírgula e ponto
function toNum(v){
  if(v==null)return null;
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v).trim();
  if(!s)return null;
  s=s.replace(/[R$\s]/gi,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  const n=Number(s);
  return Number.isFinite(n)?n:NaN;
}
function toText(v){const s=String(v??'').trim();return s===''?null:s}          // null = preserva
function toUrl(v){
  const s=String(v??'').trim();
  if(s==='')return null;                                    // preserva
  return URL_RE.test(s)?s:undefined;                         // undefined = inválida
}
function toStatus(v){
  const s=norm(v);if(!s)return null;                         // preserva
  if(['ativo','sim','1','true'].includes(s))return true;
  if(['inativo','nao','não','0','false'].includes(s))return false;
  return undefined;                                          // undefined = inválido
}
const rotuloStatus=b=>b?'Ativo':'Inativo';

// ---------- 1) modelo ----------
function baixarModelo(){
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou. Recarregue a página.');return}
  const cols=COLS();
  const aoa=[cols.map(c=>c[0])];
  lista().forEach(p=>{
    aoa.push(cols.map(([rot,k])=>{
      if(rot==='SKU')return p.sku||'';
      if(rot==='Nome')return p.name||'';
      if(rot==='Categoria')return p.category||'';
      if(rot==='Custo unitário (R$)')return +p.cost||0;
      if(rot==='Preço padrão (R$)')return +p.default_price||0;
      if(rot==='URL da imagem')return p.image_url||'';
      if(rot==='Status')return rotuloStatus(p.active!==false);
      const c=(p.channels&&p.channels[k.ch])||{};
      return c[k.f]||'';
    }));
  });
  // linhas em branco no fim para cadastrar produtos novos
  for(let i=0;i<8;i++)aoa.push(cols.map(()=>''));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=cols.map(([rot])=>({wch:rot==='Nome'?36:Math.max(14,rot.length+2)}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Produtos');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instrucoes()),'Instruções');
  XLSX.writeFile(wb,`produtos_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function instrucoes(){
  return[
    ['Cadastro em massa de Produtos'],
    [''],
    ['Gerado em',new Date().toLocaleString('pt-BR')],
    ['Produtos já cadastrados',String(lista().length)],
    [''],
    ['COMO USAR'],
    ['1','Edite a aba "Produtos". Não renomeie nem reordene as colunas.'],
    ['2','SKU identifica o produto: SKU já cadastrado ATUALIZA; SKU novo CRIA. Não deixe em branco.'],
    ['3','Há linhas em branco no fim da planilha — use-as para cadastrar produtos novos.'],
    ['4','Volte ao painel, clique em "Importar Excel", confira a prévia e confirme.'],
    [''],
    ['REGRAS IMPORTANTES'],
    ['Célula vazia','Em produto EXISTENTE, preserva o valor atual daquele campo.'],
    ['Custo e preço 0','Zero escrito de propósito É SALVO — só a célula vazia preserva.'],
    ['Números','Aceita vírgula ou ponto: 12,50 ou 12.50.'],
    ['Status','Escreva Ativo ou Inativo. Vazio preserva (produto novo nasce Ativo).'],
    ['URLs','Precisam começar com http:// ou https://. Vazia preserva/fica em branco.'],
    ['SKU repetido no arquivo','Vale a primeira ocorrência; as demais aparecem como ignoradas.'],
    ['Reimportar','Atualiza o mesmo produto pelo SKU — nunca duplica.'],
    [''],
    ['O QUE ESTA IMPORTAÇÃO NÃO FAZ'],
    ['','Não apaga produto nem histórico de vendas.'],
    ['','Custo e preço novos valem só para precificação e vendas FUTURAS — meses de Vendas'],
    ['','já salvos ficam congelados no snapshot do fechamento e não são recalculados.'],
    [''],
    ['CAMPOS'],
    ['SKU','Obrigatório. Identifica o produto.'],
    ['Nome','Obrigatório para produto novo.'],
    ['Categoria','Texto livre. Produto novo sem categoria vira "Outros".'],
    ['Custo unitário / Preço padrão','Valor em reais.'],
    ['URL da imagem','Opcional.'],
    ['Status','Ativo ou Inativo.'],
    ['Link/ID do anúncio por marketplace','Opcionais — mesmos campos da tela Produtos.']
  ];
}

// ---------- 2) leitura ----------
function lerArquivo(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));
    r.onload=()=>{
      try{
        const wb=XLSX.read(r.result,{type:'array'});
        const nome=wb.SheetNames.find(n=>norm(n).startsWith('produto'))
                 ||wb.SheetNames.find(n=>!norm(n).startsWith('instruc'))
                 ||wb.SheetNames[0];
        const ws=wb.Sheets[nome];
        if(!ws)throw new Error('A planilha está vazia.');
        resolve(XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}));
      }catch(e){reject(e)}
    };
    r.readAsArrayBuffer(file);
  });
}

function acharColunas(head){
  const H=head.map(norm),cols=COLS(),idx=[];
  cols.forEach(([rot],i)=>{
    const alvo=norm(rot);
    let p=H.indexOf(alvo);
    if(p<0){const base=alvo.split('(')[0].trim();p=H.findIndex(h=>h===base||h.startsWith(base))}
    idx[i]=p;
  });
  return idx;
}

// ---------- 3) conferência (prévia) ----------
function conferir(linhas){
  const cols=COLS();
  const head=linhas[0]||[];
  const col=acharColunas(head);
  const iSku=cols.findIndex(c=>c[2]==='sku');
  if(col[iSku]==null||col[iSku]<0)throw new Error('Não encontrei a coluna "SKU". Baixe o modelo para começar.');

  const porSku={};lista().forEach(p=>{if(p.sku)porSku[normSku(p.sku)]=p});

  const criar=[],atualizar=[],semMudanca=[],duplicados=[],invalidos=[];
  const vistos={};
  for(let i=1;i<linhas.length;i++){
    const L=linhas[i]||[],nLinha=i+1;
    if(L.every(c=>String(c??'').trim()===''))continue;              // linha vazia

    const iSkuCol=col[iSku];
    const skuRaw=String(L[iSkuCol]??'').trim();
    if(!skuRaw){invalidos.push({linha:nLinha,sku:'(vazio)',motivo:'SKU é obrigatório para importar em massa.'});continue}
    const chaveSku=normSku(skuRaw);
    if(vistos[chaveSku]){duplicados.push({linha:nLinha,sku:skuRaw});continue}
    vistos[chaveSku]=true;

    const existente=porSku[chaveSku]||null;
    let erro=false;
    const campos={};                                                  // valor final por campo lógico
    const mudPreview=[];                                               // para a prévia (rótulo, de, para)

    cols.forEach(([rot,k,tipo],ci)=>{
      if(erro||rot==='SKU')return;
      const ci2=col[ci];if(ci2==null||ci2<0)return;
      const raw=L[ci2];
      let val;
      if(tipo==='money'){
        val=toNum(raw);
        if(Number.isNaN(val)){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: "${String(raw)}" não é um número`});erro=true;return}
        if(val!=null&&val<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: não aceita valor negativo`});erro=true;return}
      }else if(tipo==='status'){
        val=toStatus(raw);
        if(val===undefined){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: "${String(raw)}" não é Ativo/Inativo`});erro=true;return}
      }else if(tipo==='url'){
        val=toUrl(raw);
        if(val===undefined){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: "${String(raw)}" precisa começar com http:// ou https://`});erro=true;return}
      }else{
        val=toText(raw);
      }
      if(val===null)return;                                          // vazio: nada a aplicar aqui
      const chave=k?(k.ch?`${k.ch}.${k.f}`:k):norm(rot);
      campos[chave]={tipo,k,val};
    });
    if(erro)continue;

    if(!existente){
      // produto NOVO: nome é obrigatório; demais campos usam o padrão do form manual
      const nome=(campos.nome&&campos.nome.val)||'';
      if(!nome){invalidos.push({linha:nLinha,sku:skuRaw,motivo:'Nome é obrigatório para cadastrar um produto novo.'});continue}
      const novo={
        sku:skuRaw,name:nome,
        category:(campos.categoria&&campos.categoria.val)||'Outros',
        cost:m2((campos['custo unitario (r$)']&&campos['custo unitario (r$)'].val)||0),
        default_price:m2((campos['preco padrao (r$)']&&campos['preco padrao (r$)'].val)||0),
        image_url:(campos['url da imagem']&&campos['url da imagem'].val)||null,
        active:(campos.status?campos.status.val:true),
        ads:{}
      };
      plats().forEach(pk=>{
        const url=campos[`${pk}.ad_url`],idc=campos[`${pk}.ad_id`];
        if(url||idc)novo.ads[pk]={ad_url:url?url.val:'',ad_id:idc?idc.val:''};
      });
      criar.push({sku:skuRaw,dados:novo});
    }else{
      // produto EXISTENTE: só os campos PREENCHIDOS entram como mudança
      const mud=[];
      const anota=(campo,rotulo,de,paraRaw,fmt)=>{
        if(paraRaw===undefined)return;
        const igualTxt=typeof paraRaw==='string';
        const igual=igualTxt?(String(de||'')===paraRaw):(m2(de)===m2(paraRaw));
        if(!igual)mud.push({campo,rotulo,de,para:paraRaw,fmt:fmt||'texto'});
      };
      if(campos.nome)anota('name','Nome',existente.name,campos.nome.val);
      if(campos.categoria)anota('category','Categoria',existente.category,campos.categoria.val);
      if(campos['custo unitario (r$)'])anota('cost','Custo unitário',existente.cost,campos['custo unitario (r$)'].val,'money');
      if(campos['preco padrao (r$)'])anota('default_price','Preço padrão',existente.default_price,campos['preco padrao (r$)'].val,'money');
      if(campos['url da imagem'])anota('image_url','URL da imagem',existente.image_url,campos['url da imagem'].val);
      if(campos.status)anota('active','Status',rotuloStatus(existente.active!==false),rotuloStatus(campos.status.val));
      plats().forEach(pk=>{
        const url=campos[`${pk}.ad_url`],idc=campos[`${pk}.ad_id`];
        const atualC=(existente.channels&&existente.channels[pk])||{};
        if(url)anota(`${pk}.ad_url`,`Link do anúncio — ${platName(pk)}`,atualC.ad_url||'',url.val);
        if(idc)anota(`${pk}.ad_id`,`ID do anúncio — ${platName(pk)}`,atualC.ad_id||'',idc.val);
      });
      const reg={sku:skuRaw,nome:existente.name,product_id:existente.id,mudancas:mud};
      if(mud.length)atualizar.push(reg);else semMudanca.push(reg);
    }
  }
  return{criar,atualizar,semMudanca,duplicados,invalidos};
}

function valorTxt(fmt,v){
  if(fmt==='money'){const f=S().fmtMoney;return f?f(+v||0):('R$ '+(+v||0).toFixed(2))}
  return v==null||v===''?'—':String(v);
}

// ---------- 4) modal de prévia ----------
function fecharModal(){const m=el('pcImpModal');if(m)m.classList.add('hidden')}
function abrirPrevia(rel,nomeArquivo){
  const m=el('pcImpModal'),body=el('pcImpBody'),ok=el('pcImpConfirm'),errBtn=el('pcImpErros');
  if(!m)return;
  ultimoRelatorio=rel;
  const bloco=(titulo,arr,fmt)=>arr.length
    ?`<details class="pl-det"><summary>${esc(titulo)} (${arr.length})</summary><ul>${arr.slice(0,20).map(fmt).join('')}</ul>${arr.length>20?`<p class="help">…e mais ${arr.length-20}.</p>`:''}</details>`:'';
  const linhasNovos=rel.criar.slice(0,20).map(r=>`<tr>
      <td class="mo-name">${esc(r.dados.name)}<br><span class="help">${esc(r.sku)}</span></td>
      <td>${esc(r.dados.category)}</td><td>${valorTxt('money',r.dados.cost)}</td>
      <td>${valorTxt('money',r.dados.default_price)}</td><td>${rotuloStatus(r.dados.active)}</td>
    </tr>`).join('');
  const linhasAtual=rel.atualizar.slice(0,20).map(r=>`<tr>
      <td class="mo-name">${esc(r.nome)}<br><span class="help">${esc(r.sku)}</span></td>
      <td>${r.mudancas.map(c=>esc(c.rotulo)).join('<br>')}</td>
      <td>${r.mudancas.map(c=>esc(valorTxt(c.fmt,c.de))).join('<br>')}</td>
      <td>${r.mudancas.map(c=>`<b>${esc(valorTxt(c.fmt,c.para))}</b>`).join('<br>')}</td>
    </tr>`).join('');
  const ignorados=rel.duplicados.length+rel.semMudanca.length;
  body.innerHTML=
    `<p class="help">${esc(nomeArquivo)}</p>
     <div class="pl-sum">
       <div class="pl-stat good"><b>${rel.criar.length}</b><span>novos</span></div>
       <div class="pl-stat good"><b>${rel.atualizar.length}</b><span>atualizados</span></div>
       <div class="pl-stat"><b>${ignorados}</b><span>ignorados</span></div>
       <div class="pl-stat ${rel.invalidos.length?'bad':''}"><b>${rel.invalidos.length}</b><span>erros</span></div>
     </div>
     <p class="help">Célula vazia preserva o valor atual. Custo e preço valem só para precificação e vendas <b>futuras</b> — meses de Vendas já salvos não são afetados.</p>`
    +(rel.criar.length?`<details class="pl-det" open><summary>Novos produtos (${Math.min(20,rel.criar.length)} de ${rel.criar.length})</summary>
        <div class="table-wrap"><table class="monthly-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Custo</th><th>Preço</th><th>Status</th></tr></thead><tbody>${linhasNovos}</tbody></table></div></details>`:'')
    +(rel.atualizar.length?`<details class="pl-det" open><summary>Atualizados (${Math.min(20,rel.atualizar.length)} de ${rel.atualizar.length})</summary>
        <div class="table-wrap"><table class="monthly-table"><thead><tr><th>Produto</th><th>Campo</th><th>Atual</th><th>Novo</th></tr></thead><tbody>${linhasAtual}</tbody></table></div></details>`:'')
    +bloco('Ignorados — sem alteração',rel.semMudanca,x=>`<li>${esc(x.nome)} (${esc(x.sku)}): nenhum campo preenchido difere do atual.</li>`)
    +bloco('Ignorados — SKU duplicado no arquivo',rel.duplicados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> repetido — vale a primeira ocorrência.</li>`)
    +bloco('Erros',rel.invalidos,x=>`<li>Linha ${x.linha} (${esc(x.sku)}): ${esc(x.motivo)}</li>`)
    +((rel.criar.length+rel.atualizar.length)?'':'<p class="pl-warn">Nada a importar: nenhuma linha válida traz produto novo ou alteração.</p>');
  const total=rel.criar.length+rel.atualizar.length;
  ok.disabled=!total;
  ok.textContent=total?`Salvar ${total} produto(s)`:'Nada a salvar';
  ok.onclick=()=>aplicar(rel);
  if(errBtn)errBtn.classList.toggle('hidden',!rel.invalidos.length);
  m.classList.remove('hidden');
}

// ---------- 5) relatório de erros ----------
let ultimoRelatorio=null;
function baixarErros(){
  const rel=ultimoRelatorio;if(!rel||!rel.invalidos.length)return;
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou.');return}
  const aoa=[['Linha','SKU','Motivo'],...rel.invalidos.map(x=>[x.linha,x.sku,x.motivo])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:8},{wch:20},{wch:70}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Erros');
  XLSX.writeFile(wb,`produtos_erros_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ---------- 6) gravação (só após confirmação) ----------
async function aplicar(rel){
  if(!uid()){alert('Faça login para importar.');return}
  const ok=el('pcImpConfirm'),st=el('pcImpStatus');
  ok.disabled=true;ok.classList.add('loading');
  let feitos=0;const falhas=[];
  try{
    for(const r of rel.criar){
      const p={id:novoId(),user_id:uid(),name:r.dados.name,sku:r.dados.sku,
        category:r.dados.category,cost:r.dados.cost,default_price:r.dados.default_price,
        image_url:r.dados.image_url,active:r.dados.active,
        channels:Object.fromEntries(plats().map(k=>[k,(typeof channelDefaults==='function')?channelDefaults(k):{}]))};
      Object.keys(r.dados.ads||{}).forEach(pk=>{
        p.channels[pk]=p.channels[pk]||{};
        if(r.dados.ads[pk].ad_url)p.channels[pk].ad_url=r.dados.ads[pk].ad_url;
        if(r.dados.ads[pk].ad_id)p.channels[pk].ad_id=r.dados.ads[pk].ad_id;
      });
      try{await supabaseClient.createProduct(p);products.push(p);feitos++}
      catch(e){falhas.push(r.dados.name+' ('+r.sku+'): '+e.message)}
    }
    for(const r of rel.atualizar){
      const p=lista().find(x=>x.id===r.product_id);if(!p)continue;
      p.channels=p.channels||{};
      r.mudancas.forEach(c=>{
        if(c.campo.includes('.')){
          const[mkt,f]=c.campo.split('.');
          p.channels[mkt]=p.channels[mkt]||((typeof channelDefaults==='function')?channelDefaults(mkt):{});
          p.channels[mkt][f]=c.para;
        }else{
          p[c.campo]=c.para;
        }
      });
      try{await supabaseClient.updateProduct(p.id,p);feitos++}
      catch(e){falhas.push(p.name+' ('+r.sku+'): '+e.message)}
    }
    fecharModal();
    if(st){st.className='status '+(falhas.length?'warn':'good');
      st.textContent=falhas.length?`${feitos} salvo(s), ${falhas.length} com erro`:`${feitos} produto(s) salvo(s)`}
    if(falhas.length)alert('Alguns produtos não foram salvos:\n\n'+falhas.slice(0,8).join('\n'));
    try{if(typeof window.renderProdutos==='function')window.renderProdutos()}catch(e){}
    try{if(typeof renderSelectors==='function')renderSelectors()}catch(e){}
    try{if(typeof window.resetDashboard==='function')window.resetDashboard()}catch(e){}
  }catch(e){
    if(st){st.className='status bad';st.textContent='Erro ao salvar'}
    alert('Não foi possível concluir a importação:\n\n'+e.message);
  }finally{ok.disabled=false;ok.classList.remove('loading')}
}

async function importar(file){
  try{
    if(typeof XLSX==='undefined')throw new Error('Biblioteca de planilha não carregou. Recarregue a página.');
    const linhas=await lerArquivo(file);
    if(!linhas||linhas.length<2)throw new Error('A planilha não tem linhas de dados.');
    abrirPrevia(conferir(linhas),file.name);
  }catch(e){alert('Não foi possível importar:\n\n'+e.message)}
}

// ---------- 7) ligação com a tela ----------
function init(){
  if(!el('pcImpModelo'))return;
  el('pcImpModelo').onclick=baixarModelo;
  if(el('pcImpBtn'))el('pcImpBtn').onclick=()=>el('pcImpFile').click();
  if(el('pcImpFile'))el('pcImpFile').onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(f)importar(f);
    e.target.value='';                       // permite reimportar o mesmo arquivo
  };
  if(el('pcImpCancel'))el('pcImpCancel').onclick=fecharModal;
  if(el('pcImpErros'))el('pcImpErros').onclick=baixarErros;
  if(el('pcImpModal'))el('pcImpModal').addEventListener('mousedown',e=>{if(e.target===el('pcImpModal'))fecharModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharModal()});
}
init();

window.PainelProdutosPlanilha={conferir,toNum,toUrl,toStatus,COLS}; // exposto para teste
})();
