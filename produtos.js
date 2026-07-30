'use strict';
// ---------- CADASTRO CENTRAL DE PRODUTOS (Etapa 2) ----------
// Fonte única de nome, SKU, categoria, custo e preço padrão. Grava na MESMA tabela
// products usada pela Precificação (sem cadastro paralelo) e sempre pelo id interno.
// Alterar aqui NÃO mexe em meses já salvos: o Resultado Mensal guarda o preço praticado
// em monthly_sales e só usa o preço do cadastro quando o mês ainda não tem valor.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const fmtMoney=v=>(S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2)));
const esc=s=>(S().esc?S().esc(s):String(s??''));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

let editingId='',dirty=false;

function list(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
function plats(){try{return Object.keys(PLATFORMS)}catch(e){return[]}}
function platName(k){try{return PLATFORMS[k].name}catch(e){return k}}
function isActive(p){return p.active!==false}
// canal habilitado: ausência da flag conta como habilitado (compatível com o que já existe)
function chanOn(p,k){const c=p.channels&&p.channels[k];return!c||c.enabled!==false}

function setStatus(kind,txt){const e=el('prodStatus');if(!e)return;e.className='status '+kind;e.textContent=txt}
function markDirty(){dirty=true;setStatus('warn','Alterações não salvas')}
function current(){return list().find(p=>p.id===editingId)||null}

// ---------- formulário ----------
function writeForm(){
  const p=current();
  el('prodFormTitle').textContent=p?('Editar: '+p.name):'Novo produto';
  const set=(id,v)=>{const e=el(id);if(e)e.value=v};
  set('pcName',p?p.name||'':'');
  set('pcSku',p?p.sku||'':'');
  set('pcCategory',p?p.category||'':'');
  set('pcCost',p?(p.cost||0):'');
  set('pcPrice',p?(p.default_price||0):'');
  set('pcImage',p?(p.image_url||''):'');
  el('pcActive').value=p?(isActive(p)?'1':'0'):'1';
  renderPlatChips(p);
  renderThumb(p?p.image_url:'');
  dirty=false;
  setStatus('neutral',p?'Editando produto':'Preencha e salve');
}

function renderPlatChips(p){
  const box=el('pcPlatforms');if(!box)return;
  box.innerHTML=plats().map(k=>{
    const on=p?chanOn(p,k):true;
    return `<button type="button" class="chip${on?' on':''}" data-plat="${k}" aria-pressed="${on}">${esc(platName(k))}</button>`;
  }).join('');
  box.querySelectorAll('[data-plat]').forEach(b=>b.onclick=()=>{
    const on=!b.classList.contains('on');
    b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
    markDirty();
  });
}

function renderThumb(url){
  const t=el('pcThumb');if(!t)return;
  t.innerHTML=url?`<img src="${esc(url)}" alt="">`:'<span class="help">sem imagem</span>';
}

function readForm(){
  return{
    name:(el('pcName').value||'').trim()||'Produto sem nome',
    sku:(el('pcSku').value||'').trim(),
    category:(el('pcCategory').value||'').trim()||'Outros',
    cost:Math.max(0,+el('pcCost').value||0),
    default_price:Math.max(0,+el('pcPrice').value||0),
    image_url:(el('pcImage').value||'').trim()||null,
    active:el('pcActive').value==='1',
    enabled:[...el('pcPlatforms').querySelectorAll('[data-plat]')].reduce((a,b)=>(a[b.dataset.plat]=b.classList.contains('on'),a),{})
  };
}

async function save(){
  let uid=null;try{uid=currentUser&&currentUser.id}catch(e){}
  if(!uid){alert('Faça login para salvar.');return}
  const f=readForm(),btn=el('pcSave');
  // SKU é identificador comercial: duplicidade avisa, mas não bloqueia
  if(f.sku&&list().some(p=>p.id!==editingId&&norm(p.sku)===norm(f.sku))){
    if(!confirm(`Já existe outro produto com o SKU "${f.sku}". Salvar assim mesmo?`))return;
  }
  btn.disabled=true;btn.classList.add('loading');setStatus('neutral','Salvando...');
  try{
    let p=current();
    if(!p){
      p={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())),user_id:uid,
         channels:Object.fromEntries(plats().map(k=>[k,channelDefaults(k)]))};
      Object.assign(p,{name:f.name,sku:f.sku,category:f.category,cost:f.cost,default_price:f.default_price,image_url:f.image_url,active:f.active});
      plats().forEach(k=>{p.channels[k].enabled=!!f.enabled[k]});
      await supabaseClient.createProduct(p);
      products.push(p);editingId=p.id;
    }else{
      Object.assign(p,{name:f.name,sku:f.sku,category:f.category,cost:f.cost,default_price:f.default_price,image_url:f.image_url,active:f.active});
      p.channels=p.channels||{};
      plats().forEach(k=>{p.channels[k]=p.channels[k]||channelDefaults(k);p.channels[k].enabled=!!f.enabled[k]});
      await supabaseClient.updateProduct(p.id,p);
    }
    dirty=false;setStatus('good','Produto salvo');
    render();
    // Precificação/Dashboard leem o mesmo array: refaz seletores e invalida agregação
    try{if(typeof renderSelectors==='function')renderSelectors()}catch(e){}
    try{if(typeof window.resetDashboard==='function')window.resetDashboard()}catch(e){}
    setTimeout(()=>{if(!dirty)setStatus('neutral','Editando produto')},2200);
  }catch(e){
    console.error('Erro ao salvar produto:',e);
    setStatus('bad','Não salvou');
    alert('Não foi possível salvar o produto:\n\n'+e.message);
  }finally{btn.disabled=false;btn.classList.remove('loading')}
}

async function toggleActive(){
  const p=current();if(!p){alert('Selecione um produto.');return}
  el('pcActive').value=isActive(p)?'0':'1';
  await save();
}

async function del(){
  const p=current();if(!p){alert('Selecione um produto.');return}
  if(!confirm(`Excluir "${p.name}"?\n\nO histórico mensal já salvo não é apagado, mas o produto sai do cadastro.`))return;
  try{
    await supabaseClient.deleteProduct(p.id);
    products=list().filter(x=>x.id!==p.id);
    editingId='';writeForm();render();
    try{if(typeof renderSelectors==='function')renderSelectors()}catch(e){}
  }catch(e){alert('Erro ao excluir: '+e.message)}
}

// ---------- filtros + tabela ----------
function fillFilters(){
  const cats=[...new Set(list().map(p=>p.category).filter(Boolean))].sort();
  const cur=el('prodFilterCat').value;
  el('prodFilterCat').innerHTML='<option value="">Todas</option>'+cats.map(c=>`<option${c===cur?' selected':''}>${esc(c)}</option>`).join('');
  const dl=el('pcCatList');if(dl)dl.innerHTML=cats.map(c=>`<option value="${esc(c)}">`).join('');
  const pf=el('prodFilterPlat'),pcur=pf.value;
  pf.innerHTML='<option value="">Todos</option>'+plats().map(k=>`<option value="${k}"${k===pcur?' selected':''}>${esc(platName(k))}</option>`).join('');
}

function filtered(){
  const q=norm(el('prodSearch').value),cat=el('prodFilterCat').value,
        plat=el('prodFilterPlat').value,st=el('prodFilterStatus').value;
  return list().filter(p=>{
    if(q&&!norm(p.name+' '+(p.sku||'')).includes(q))return false;
    if(cat&&p.category!==cat)return false;
    if(plat&&!chanOn(p,plat))return false;
    if(st==='1'&&!isActive(p))return false;
    if(st==='0'&&isActive(p))return false;
    return true;
  });
}

function render(){
  fillFilters();
  const rows=filtered();
  el('prodCount').textContent=`${rows.length} de ${list().length} produto(s)`;
  const head='<thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Custo</th><th>Preço padrão</th><th>Marketplaces</th><th>Status</th><th>Ação</th></tr></thead>';
  const body=rows.map(p=>{
    const on=plats().filter(k=>chanOn(p,k)).map(k=>platName(k).split(' ')[0]).join(', ')||'—';
    return `<tr${p.id===editingId?' class="highlight"':''}>
      <td class="mo-name">${esc(p.name)}</td>
      <td>${esc(p.sku||'—')}</td>
      <td>${esc(p.category||'—')}</td>
      <td>${fmtMoney(p.cost||0)}</td>
      <td>${fmtMoney(p.default_price||0)}</td>
      <td style="text-align:left;white-space:normal">${esc(on)}</td>
      <td><span class="status ${isActive(p)?'good':'neutral'}">${isActive(p)?'Ativo':'Inativo'}</span></td>
      <td><button class="btn small" data-edit="${p.id}">Editar</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="8" style="padding:14px">Nenhum produto com esses filtros.</td></tr>';
  el('prodTable').innerHTML=head+'<tbody>'+body+'</tbody>';
  el('prodTable').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    if(dirty&&!confirm('Existem alterações não salvas. Deseja continuar?'))return;
    editingId=b.dataset.edit;writeForm();render();
  });
}

// ---------- eventos ----------
['prodSearch','prodFilterCat','prodFilterPlat','prodFilterStatus'].forEach(id=>{
  const e=el(id);if(!e)return;
  if(id==='prodSearch')e.oninput=render;else e.onchange=render;
});
['pcName','pcSku','pcCategory','pcCost','pcPrice','pcImage','pcActive'].forEach(id=>{
  const e=el(id);if(!e)return;
  e.addEventListener('input',()=>{markDirty();if(id==='pcImage')renderThumb(el('pcImage').value.trim())});
  e.addEventListener('change',markDirty);
});
if(el('prodNew'))el('prodNew').onclick=()=>{
  if(dirty&&!confirm('Existem alterações não salvas. Deseja continuar?'))return;
  editingId='';writeForm();render();el('pcName').focus();
};
if(el('pcSave'))el('pcSave').onclick=save;
if(el('pcToggle'))el('pcToggle').onclick=toggleActive;
if(el('pcDelete'))el('pcDelete').onclick=del;

window.renderProdutos=()=>{if(!editingId&&list().length)editingId=list()[0].id;writeForm();render()};
// preço padrão do cadastro — outras telas usam como valor inicial
window.productDefaultPrice=id=>{const p=list().find(x=>x.id===id);return p?(+p.default_price||0):0};
window.productIsActive=isActive;
window.productChannelOn=chanOn;
})();
