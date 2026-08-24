'use strict';
// ---------- IMPORTAÇÃO EM MASSA DA PRECIFICAÇÃO ----------
// Bloco no topo da aba Precificação: Marketplace + Baixar modelo + Importar Excel.
// Atualiza SÓ a precificação ATUAL do marketplace escolhido (products.channels[mkt]) —
// não existe precificação por mês e nenhuma tabela nova é criada.
//
// Relação com o histórico de Vendas: a precificação é sempre o "estado de agora". Quando
// um mês é salvo/importado em Vendas, aquele fechamento congela um snapshot próprio
// (performance.js → buildSnapshot). Por isso, importar preços novos aqui NUNCA mexe em
// venda já salva; vale só para as que ainda forem salvas.
//
// Segurança: só percorre os produtos do próprio usuário (já filtrados por RLS na carga) e
// grava com updateProduct(id, {channels}) — o RLS barra qualquer id de outro login.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const esc=s=>S().esc?S().esc(s):String(s??'');
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const normSku=s=>norm(s).replace(/\s/g,'');
const m2=v=>(typeof money2==='function'?money2(v):Math.round((+v||0)*100)/100);

function plats(){try{return Object.keys(PLATFORMS)}catch(e){return[]}}
function platName(k){try{return PLATFORMS[k].name}catch(e){return k}}
function lista(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function alvo(){const s=el('priImpPlat');const v=s&&s.value;if(v&&plats().indexOf(v)>=0)return v;try{return platform}catch(e){return plats()[0]}}

// ---------- colunas do modelo ----------
// [rótulo, chave do canal, tipo]. tipo: money | pct | num | opt(lista)
// A ordem aqui é a ordem das colunas no Excel.
const COLS=[
  ['SKU',null,'id'],
  ['Produto',null,'id'],
  ['Preço de venda (R$)','price','money'],
  ['Desconto / cupom (%)','discount','pct'],
  ['Frete do vendedor (R$)','freight','money'],
  ['Embalagem / outros (R$)','packaging','money'],
  ['Reserva devoluções (%)','returns','pct'],
  ['Comissão (%)','commission','pct'],
  ['Tarifa fixa (R$)','fixedFee','money'],
  ['Taxa adicional (%)','service','pct'],
  ['Imposto (%)','tax','pct'],
  ['Base do imposto','taxBase','optBase'],
  ['Logística por unidade (R$)','unitFee','money'],
  ['Tipo de anúncio','mlAdType','optAd'],
  ['Ads — modo','adsMode','optAds'],
  ['Ads — valor','adsValue','num'],
  ['ROAS desejado','__roas','num'],
  ['Margem desejada (%)','targetMargin','pct']
];
const LABEL={};COLS.forEach(([r,k])=>{if(k)LABEL[k]=r});
LABEL.__roas='ROAS desejado';

// ---------- conversões ----------
// Aceita vírgula, ponto, "%" e "R$". Célula vazia devolve null = "preserva o valor atual".
function toNum(v){
  if(v==null)return null;
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v).trim();
  if(!s)return null;                                   // vazio = preserva
  s=s.replace(/[R$\s%]/gi,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  if(s==='')return null;
  const n=Number(s);
  return Number.isFinite(n)?n:NaN;                     // NaN = valor inválido
}
function toBase(v){
  const s=norm(v);if(!s)return null;
  if(s.startsWith('brut')||s==='gross')return'gross';
  if(s.startsWith('liq')||s==='net')return'net';
  return undefined;                                    // undefined = inválido
}
function toAdType(v){
  const s=norm(v);if(!s)return null;
  if(s.startsWith('class'))return'classic';
  if(s.startsWith('prem'))return'premium';
  return undefined;
}
function toAdsMode(v){
  const s=norm(v);if(!s)return null;
  if(s.startsWith('roas'))return'roas';
  if(s.startsWith('cpa'))return'cpa';
  if(s.startsWith('acos'))return'acos';
  return undefined;
}
const rotuloBase=v=>v==='net'?'Líquido':'Bruto';
const rotuloAd=v=>v==='premium'?'Premium':v==='classic'?'Clássico':'';
const rotuloAds=v=>v==='cpa'?'CPA':v==='acos'?'ACOS':v==='roas'?'ROAS':'';

// canal atual do produto no marketplace escolhido (com os padrões por baixo)
function canalDe(p,mkt){
  const d=(typeof channelDefaults==='function')?channelDefaults(mkt):{};
  return Object.assign({},d,(p.channels&&p.channels[mkt])||{});
}

// ---------- 1) modelo ----------
function baixarModelo(){
  if(typeof XLSX==='undefined'){alert('Biblioteca de planilha não carregou. Recarregue a página.');return}
  const mkt=alvo(),ativos=lista().filter(p=>p.active!==false);
  if(!ativos.length){alert('Nenhum produto ativo cadastrado. Cadastre em Produtos.');return}
  const aoa=[COLS.map(c=>c[0])];
  ativos.forEach(p=>{
    const c=canalDe(p,mkt);
    aoa.push(COLS.map(([rot,k,tipo])=>{
      if(rot==='SKU')return p.sku||'';
      if(rot==='Produto')return p.name||'';
      if(k==='__roas')return c.adsMode==='roas'?(+c.adsValue||0):'';
      if(tipo==='optBase')return rotuloBase(c.taxBase);
      if(tipo==='optAd')return rotuloAd(c.mlAdType);
      if(tipo==='optAds')return rotuloAds(c.adsMode);
      const v=+c[k];return Number.isFinite(v)?v:0;
    }));
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=COLS.map(([rot])=>({wch:rot==='Produto'?42:Math.max(14,rot.length+3)}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Precificação');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instrucoes(mkt)),'Instruções');
  XLSX.writeFile(wb,`precificacao_${norm(platName(mkt)).replace(/[^a-z0-9]/g,'')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function instrucoes(mkt){
  return[
    ['Importação em massa da Precificação'],
    [''],
    ['Marketplace deste arquivo',platName(mkt)],
    ['Gerado em',new Date().toLocaleString('pt-BR')],
    [''],
    ['COMO USAR'],
    ['1','Edite os valores na aba "Precificação". Não renomeie nem reordene as colunas.'],
    ['2','A coluna SKU identifica o produto e NÃO deve ser alterada. "Produto" é apenas informativo.'],
    ['3','Volte ao painel, escolha o mesmo marketplace e clique em "Importar Excel".'],
    ['4','Confira a prévia (mostra de/para campo a campo) e confirme para salvar.'],
    [''],
    ['REGRAS IMPORTANTES'],
    ['Célula vazia','PRESERVA o valor atual do painel. Para zerar um campo, escreva 0.'],
    ['Números','Aceita vírgula ou ponto (1.234,56 ou 1234.56) e o símbolo % ou R$.'],
    ['Percentuais','Informe o número, não a fração: 16 significa 16%.'],
    ['SKU não cadastrado','A linha é ignorada e aparece na prévia. Nenhum produto é criado.'],
    ['SKU repetido','Vale a primeira ocorrência; as demais são ignoradas.'],
    ['Reimportar','Atualiza os mesmos produtos, não duplica nada.'],
    [''],
    ['O QUE ESTA IMPORTAÇÃO NÃO FAZ'],
    ['','Não cria precificação por mês — atualiza apenas a precificação ATUAL do marketplace.'],
    ['','Não altera vendas nem meses já salvos: cada fechamento de Vendas congela as taxas'],
    ['','vigentes no momento em que foi salvo. Preços novos valem só para vendas ainda não salvas.'],
    ['','Não altera nome, SKU, categoria nem custo do produto (isso fica no módulo Produtos).'],
    [''],
    ['VALORES ACEITOS NAS COLUNAS DE LISTA'],
    ['Base do imposto','Bruto  ou  Líquido'],
    ['Tipo de anúncio','Clássico  ou  Premium   (usado pelo Mercado Livre)'],
    ['Ads — modo','ROAS, CPA ou ACOS'],
    ['ROAS desejado','Atalho: preenchido, define o modo como ROAS e usa este valor.'],
    [''],
    ['CAMPOS'],
    ...COLS.filter(c=>c[1]).map(([rot,k,tipo])=>[rot,
      tipo==='money'?'Valor em reais':tipo==='pct'?'Percentual (0 a 100)':
      tipo==='num'?'Número':'Lista — ver acima'])
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
        // usa a aba "Precificação" quando existir; senão a primeira que não seja Instruções
        const nome=wb.SheetNames.find(n=>norm(n).startsWith('precific'))
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
  const H=head.map(norm),idx={};
  COLS.forEach(([rot,k])=>{
    const chave=k||norm(rot);
    const alvoN=norm(rot);
    let i=H.indexOf(alvoN);
    if(i<0){                                   // tolera rótulo abreviado pelo usuário
      const base=alvoN.split('(')[0].trim();
      i=H.findIndex(h=>h===base||h.startsWith(base));
    }
    idx[chave]=i;
  });
  return idx;
}

// ---------- 3) conferência (prévia) ----------
// Devolve o que MUDA por produto, sem gravar nada.
function conferir(linhas,mkt){
  mkt=mkt||alvo();
  const head=linhas[0]||[];
  const col=acharColunas(head);
  if(col.sku==null||col.sku<0)throw new Error('Não encontrei a coluna "SKU". Baixe o modelo para começar.');

  const porSku={},porId={};
  lista().forEach(p=>{if(p.sku)porSku[normSku(p.sku)]=p;porId[String(p.id)]=p});

  const validas=[],naoEncontrados=[],duplicados=[],invalidos=[],semMudanca=[];
  const vistos={};
  for(let i=1;i<linhas.length;i++){
    const L=linhas[i]||[],nLinha=i+1;
    const skuRaw=String(L[col.sku]??'').trim();
    if(!skuRaw&&L.every(c=>String(c??'').trim()===''))continue;   // linha vazia
    const p=porSku[normSku(skuRaw)]||porId[skuRaw];
    if(!p){naoEncontrados.push({linha:nLinha,sku:skuRaw||'(vazio)'});continue}
    if(vistos[p.id]){duplicados.push({linha:nLinha,sku:skuRaw});continue}
    vistos[p.id]=true;

    const atual=canalDe(p,mkt),mudancas=[];
    let erro=false;
    const anota=(k,novo)=>{
      const antes=k==='taxBase'?atual.taxBase:k==='mlAdType'?atual.mlAdType:k==='adsMode'?atual.adsMode:+atual[k]||0;
      const igual=(typeof novo==='string')?(antes===novo):(m2(antes)===m2(novo));
      if(!igual)mudancas.push({campo:k,de:antes,para:novo});
    };
    COLS.forEach(([rot,k,tipo])=>{
      if(!k||erro)return;
      const ci=col[k];if(ci==null||ci<0)return;
      const raw=L[ci];
      if(tipo==='optBase'||tipo==='optAd'||tipo==='optAds'){
        const f=tipo==='optBase'?toBase:tipo==='optAd'?toAdType:toAdsMode;
        const v=f(raw);
        if(v===undefined){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: "${String(raw)}" não é um valor aceito`});erro=true;return}
        if(v===null)return;                                  // vazio = preserva
        anota(k,v);return;
      }
      const n=toNum(raw);
      if(n===null)return;                                    // vazio = preserva
      if(Number.isNaN(n)){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: "${String(raw)}" não é um número`});erro=true;return}
      if(n<0){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: não aceita valor negativo`});erro=true;return}
      if(tipo==='pct'&&n>100){invalidos.push({linha:nLinha,sku:skuRaw,motivo:`${rot}: ${n} está fora de 0 a 100`});erro=true;return}
      if(k==='__roas'){                                      // atalho: define modo ROAS
        anota('adsMode','roas');anota('adsValue',m2(n));return;
      }
      anota(k,m2(n));
    });
    if(erro)continue;
    const reg={product_id:p.id,nome:p.name,sku:p.sku||'',mudancas};
    if(mudancas.length)validas.push(reg);else semMudanca.push(reg);
  }
  return{validas,naoEncontrados,duplicados,invalidos,semMudanca,mkt};
}

// ---------- 4) modal de prévia ----------
function fecharModal(){const m=el('priImpModal');if(m)m.classList.add('hidden')}
function valorTxt(campo,v){
  if(campo==='taxBase')return rotuloBase(v);
  if(campo==='mlAdType')return rotuloAd(v)||'—';
  if(campo==='adsMode')return rotuloAds(v)||'—';
  const f=S().fmtMoney;
  const money=['price','freight','packaging','fixedFee','unitFee'].indexOf(campo)>=0;
  if(money)return f?f(+v||0):('R$ '+(+v||0).toFixed(2));
  const pct=['discount','returns','commission','service','tax','targetMargin'].indexOf(campo)>=0;
  return (+v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+(pct?'%':'');
}
function abrirPrevia(rel,nomeArquivo){
  const m=el('priImpModal'),body=el('priImpBody'),ok=el('priImpConfirm');
  if(!m)return;
  const bloco=(titulo,arr,fmt)=>arr.length
    ?`<details class="pl-det"><summary>${esc(titulo)} (${arr.length})</summary><ul>${arr.slice(0,20).map(fmt).join('')}</ul>${arr.length>20?`<p class="help">…e mais ${arr.length-20}.</p>`:''}</details>`:'';
  const totalCampos=rel.validas.reduce((a,r)=>a+r.mudancas.length,0);
  const linhas=rel.validas.slice(0,25).map(r=>`<tr>
      <td class="mo-name">${esc(r.nome)}<br><span class="help">${esc(r.sku||'sem SKU')}</span></td>
      <td>${r.mudancas.map(c=>esc(LABEL[c.campo]||c.campo)).join('<br>')}</td>
      <td>${r.mudancas.map(c=>esc(valorTxt(c.campo,c.de))).join('<br>')}</td>
      <td>${r.mudancas.map(c=>`<b>${esc(valorTxt(c.campo,c.para))}</b>`).join('<br>')}</td>
    </tr>`).join('');
  body.innerHTML=
    `<p class="help">${esc(nomeArquivo)} · ${esc(platName(rel.mkt))}</p>
     <div class="pl-sum">
       <div class="pl-stat good"><b>${rel.validas.length}</b><span>produtos a atualizar</span></div>
       <div class="pl-stat"><b>${totalCampos}</b><span>campos alterados</span></div>
       <div class="pl-stat"><b>${rel.semMudanca.length}</b><span>sem mudança</span></div>
       <div class="pl-stat ${rel.naoEncontrados.length?'bad':''}"><b>${rel.naoEncontrados.length}</b><span>SKU não encontrado</span></div>
       <div class="pl-stat ${rel.invalidos.length?'bad':''}"><b>${rel.invalidos.length}</b><span>valor inválido</span></div>
     </div>
     <p class="help">Célula vazia preserva o valor atual. Atualiza só a precificação de
       <b>${esc(platName(rel.mkt))}</b> — vendas e meses já salvos não são afetados.</p>`
    +(rel.validas.length?`<details class="pl-det" open><summary>Prévia (${Math.min(25,rel.validas.length)} de ${rel.validas.length})</summary>
        <div class="table-wrap"><table class="monthly-table"><thead><tr><th>Produto</th><th>Campo</th><th>Atual</th><th>Novo</th></tr></thead><tbody>${linhas}</tbody></table></div></details>`:'')
    +bloco('SKUs não encontrados',rel.naoEncontrados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> não está cadastrado.</li>`)
    +bloco('SKUs duplicados',rel.duplicados,x=>`<li>Linha ${x.linha}: <b>${esc(x.sku)}</b> repetido — vale a primeira.</li>`)
    +bloco('Valores inválidos',rel.invalidos,x=>`<li>Linha ${x.linha} (${esc(x.sku)}): ${esc(x.motivo)}</li>`)
    +(rel.validas.length?'':'<p class="pl-warn">Nada a atualizar: nenhuma linha traz valor diferente do atual.</p>');
  ok.disabled=!rel.validas.length;
  ok.textContent=rel.validas.length?`Salvar ${rel.validas.length} produto(s)`:'Nada a salvar';
  ok.onclick=()=>aplicar(rel);
  m.classList.remove('hidden');
}

// ---------- 5) gravação ----------
// 1 update por produto alterado, só o JSONB channels. Reimportar reescreve o MESMO
// produto (chave = id), então nunca duplica.
async function aplicar(rel){
  if(!uid()){alert('Faça login para importar.');return}
  const ok=el('priImpConfirm'),st=el('priImpStatus'),mkt=rel.mkt;
  ok.disabled=true;ok.classList.add('loading');
  let feitos=0,falhas=[];
  try{
    for(const r of rel.validas){
      const p=lista().find(x=>x.id===r.product_id);
      if(!p)continue;
      p.channels=p.channels||{};
      const base=p.channels[mkt]||((typeof channelDefaults==='function')?channelDefaults(mkt):{});
      const novo=Object.assign({},base);
      r.mudancas.forEach(c=>{novo[c.campo]=c.para});
      p.channels[mkt]=novo;
      try{await supabaseClient.updateProduct(p.id,{channels:p.channels});feitos++}
      catch(e){falhas.push(r.nome+': '+e.message);p.channels[mkt]=base}
    }
    fecharModal();
    if(st){
      st.className='status '+(falhas.length?'warn':'good');
      st.textContent=falhas.length?`${feitos} salvo(s), ${falhas.length} com erro`:`${feitos} produto(s) atualizado(s)`;
    }
    if(falhas.length)alert('Alguns produtos não foram salvos:\n\n'+falhas.slice(0,8).join('\n'));
    // repinta a Precificação com os valores novos (mesmo array de produtos)
    try{if(typeof renderSelectors==='function')renderSelectors()}catch(e){}
    try{if(typeof writeForm==='function')writeForm()}catch(e){}
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
    abrirPrevia(conferir(linhas,alvo()),file.name);
  }catch(e){alert('Não foi possível importar:\n\n'+e.message)}
}

// ---------- 6) ligação com a tela ----------
function init(){
  const sel=el('priImpPlat');if(!sel)return;
  sel.innerHTML=plats().map(k=>`<option value="${k}">${esc(platName(k))}</option>`).join('');
  try{sel.value=platform}catch(e){}
  // acompanha o seletor de Canal do topo enquanto o usuário não escolher outro aqui
  document.querySelectorAll('.platform-btn[data-platform]').forEach(b=>b.addEventListener('click',()=>{
    if(!sel._tocado){try{sel.value=platform}catch(e){}}
  }));
  sel.addEventListener('change',()=>{sel._tocado=1;const st=el('priImpStatus');if(st){st.className='status neutral';st.textContent='Pronto'}});
  if(el('priImpModelo'))el('priImpModelo').onclick=baixarModelo;
  if(el('priImpBtn'))el('priImpBtn').onclick=()=>el('priImpFile').click();
  if(el('priImpFile'))el('priImpFile').onchange=e=>{
    const f=e.target.files&&e.target.files[0];
    if(f)importar(f);
    e.target.value='';                    // permite reimportar o mesmo arquivo
  };
  if(el('priImpCancel'))el('priImpCancel').onclick=fecharModal;
  if(el('priImpModal'))el('priImpModal').addEventListener('mousedown',e=>{if(e.target===el('priImpModal'))fecharModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharModal()});
}
init();

window.PainelPrecPlanilha={conferir,toNum,toBase,toAdType,toAdsMode,COLS,canalDe}; // exposto para teste
})();
