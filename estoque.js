'use strict';
// ---------- ESTOQUE (Etapa 3) ----------
// Vinculado ao cadastro central: custo e preço vêm de products (nunca digitados aqui).
// O que é próprio do estoque — quantidade disponível e mínimo — fica na tabela stock
// (1 linha por usuário+produto, RLS por auth.uid()). Gravação em lote no botão Salvar.
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const G=()=>window.PainelCharts||{};
const fmtMoney=v=>(S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2)));
const fmtInt=v=>(S().fmtInt?S().fmtInt(v):String(Math.round(+v||0)));
const kpi=(a,b,c)=>(S().kpi?S().kpi(a,b,c):`<article class="kpi"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c||''}</div></article>`);
const esc=s=>(S().esc?S().esc(s):String(s??''));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
// percentual: denominador zero mostra 0% (nunca NaN/Infinity)
const share=(v,tot)=>tot>0?(v/tot):0;
const fmtShare=f=>(Math.max(0,f)*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';

// 4 locais de estoque. 'general' = físico; os demais = Full de cada marketplace.
const LOCS=[['general','Geral — físico','Geral'],['ml_full','Full Mercado Livre','Full ML'],
            ['amazon_full','Full Amazon','Full Amazon'],['magalu_full','Full Magalu','Full Magalu']];
const LOC_KEYS=LOCS.map(l=>l[0]);
const LOC_LABEL=k=>{const l=LOCS.find(x=>x[0]===k);return l?l[1]:k};
const blank=()=>({loc:{general:0,ml_full:0,amazon_full:0,magalu_full:0},min:0,updated:''});
const brDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||'');return m?`${m[3]}/${m[2]}/${m[1]}`:'—'};

// cache[product_id] = {loc:{general,ml_full,amazon_full,magalu_full}, min, updated}
let cache={},loadedFor=null,dirty=false,saving=false,currentLoc='general';

function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function list(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}
// preço de referência do produto: preço padrão do cadastro; se vazio, maior preço de canal
function refPrice(p){
  let v=+p.default_price||0;
  if(v>0)return v;
  const ch=p.channels||{};
  return Object.keys(ch).reduce((m,k)=>Math.max(m,+ch[k].price||0),0);
}

function msg(txt,kind){
  const e=el('stStatusMsg');if(!e)return;
  e.textContent=txt||' ';
  e.style.color=kind==='bad'?'var(--bad)':kind==='good'?'var(--good)':kind==='warn'?'var(--warn)':'';
}
function markDirty(){dirty=true;msg('Alterações não salvas — clique em "Salvar estoque"','warn');const b=el('stSave');if(b)b.textContent='Salvar estoque •'}

async function ensureLoaded(){
  const u=uid();if(!u)return false;
  if(loadedFor===u)return true;
  // quantidade POR LOCAL vem de stock_balances; min_qty continua em `stock` (preservado)
  const[bal,stk]=await Promise.all([supabaseClient.getStockBalances(u),supabaseClient.getStock(u)]);
  cache={};
  (bal||[]).forEach(r=>{
    const c=cache[r.product_id]=cache[r.product_id]||blank();
    if(LOC_KEYS.includes(r.location))c.loc[r.location]=+r.qty||0;
    if(r.updated_at&&r.updated_at>c.updated)c.updated=r.updated_at; // última atualização entre os locais
  });
  (stk||[]).forEach(r=>{const c=cache[r.product_id]=cache[r.product_id]||blank();c.min=+r.min_qty||0});
  loadedFor=u;dirty=false;
  return true;
}

// ---------- cálculo (fonte única das métricas de estoque) ----------
function rowsData(){
  const rows=list().map(p=>{
    const c=cache[p.id]||blank();
    const byLoc={};let qty=0;
    LOC_KEYS.forEach(k=>{const q=+c.loc[k]||0;byLoc[k]=q;qty+=q}); // Total = soma dos 4 locais
    const min=+c.min||0,cost=+p.cost||0,price=refPrice(p);
    const value=cost*qty;                 // valor em estoque = custo central × quantidade total
    const potential=price*qty;            // valor potencial de venda
    const gross=potential-value;          // lucro bruto potencial
    const status=qty<=0?'out':(qty<=min?'low':'ok');
    return{p,byLoc,qty,min,cost,price,value,potential,gross,status,updated:c.updated};
  });
  const total=rows.reduce((a,r)=>a+r.value,0);
  rows.forEach(r=>{r.share=share(r.value,total)});
  return rows;
}
function totals(rows){
  return rows.reduce((a,r)=>({value:a.value+r.value,potential:a.potential+r.potential,gross:a.gross+r.gross,qty:a.qty+r.qty}),{value:0,potential:0,gross:0,qty:0});
}
// Resumo por local: unidades e valor (custo × qtd do local). Fonte única p/ Estoque e Dashboard.
function totalsByLoc(rows){
  const by={};LOC_KEYS.forEach(k=>{by[k]={qty:0,value:0}});
  rows.forEach(r=>LOC_KEYS.forEach(k=>{by[k].qty+=r.byLoc[k];by[k].value+=r.cost*r.byLoc[k]}));
  return by;
}

// ---------- filtros / ordenação ----------
function fillFilters(){
  const cats=[...new Set(list().map(p=>p.category).filter(Boolean))].sort();
  const sel=el('stCat'),cur=sel.value;
  sel.innerHTML='<option value="">Todas</option>'+cats.map(c=>`<option${c===cur?' selected':''}>${esc(c)}</option>`).join('');
}
function visible(rows){
  const q=norm(el('stSearch').value),cat=el('stCat').value,st=el('stStatus').value,sort=el('stSort').value;
  let out=rows.filter(r=>{
    if(q&&!norm(r.p.name+' '+(r.p.sku||'')).includes(q))return false;
    if(cat&&r.p.category!==cat)return false;
    if(st&&r.status!==st)return false;
    return true;
  });
  const by={value:(a,b)=>b.value-a.value,qtyDesc:(a,b)=>b.qty-a.qty,qtyAsc:(a,b)=>a.qty-b.qty,
            cost:(a,b)=>b.cost-a.cost,price:(a,b)=>b.price-a.price};
  return out.sort(by[sort]||by.value);
}

// ---------- render ----------
function renderKpis(rows){
  const t=totals(rows),byLoc=totalsByLoc(rows);
  const low=rows.filter(r=>r.status==='low').length,out=rows.filter(r=>r.status==='out').length;
  const ativos=rows.filter(r=>r.p.active!==false).length;
  const topValue=rows.slice().sort((a,b)=>b.value-a.value)[0];
  const topQty=rows.slice().sort((a,b)=>b.qty-a.qty)[0];
  el('stKpis').innerHTML=
    kpi('Valor do estoque (custo)',fmtMoney(t.value),`${fmtInt(rows.length)} SKU(s) no cadastro`)+
    kpi('Valor potencial de venda',fmtMoney(t.potential),'Preço de venda × quantidade')+
    kpi('Lucro bruto potencial',fmtMoney(t.gross),'Potencial − custo')+
    kpi('Total de unidades',fmtInt(t.qty),'Somatório das quantidades')+
    kpi('SKUs ativos',fmtInt(ativos),'Status ativo no cadastro')+
    kpi('Estoque baixo',fmtInt(low),out?`${fmtInt(out)} sem estoque`:'Nenhum sem estoque')+
    kpi('Maior valor em estoque',topValue&&topValue.value>0?fmtMoney(topValue.value):'—',topValue&&topValue.value>0?topValue.p.name:'Sem dados')+
    kpi('Maior quantidade',topQty&&topQty.qty>0?fmtInt(topQty.qty):'—',topQty&&topQty.qty>0?topQty.p.name:'Sem dados')+
    // Resumo por local (valor = custo × qtd; unidades no subtítulo)
    LOCS.map(([k,label])=>kpi(label,fmtMoney(byLoc[k].value),fmtInt(byLoc[k].qty)+' unidade(s)')).join('');
}

function renderCharts(rows){
  const box=el('stCharts');if(!box)return;
  const g=G();
  if(!g.chartCard){box.innerHTML='';return}
  const withValue=rows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  const top=withValue.slice(0,10).map(r=>({label:r.p.name,value:r.value}));
  const low=rows.filter(r=>r.status!=='ok').sort((a,b)=>a.qty-b.qty);
  const lowHTML=low.length
    ? '<div class="dash-bars">'+low.slice(0,12).map(r=>`<div class="dash-bar-row"><span class="dash-bar-label">${esc(r.p.name)}</span><span class="dash-bar-track"><span class="dash-bar-fill" style="width:${r.status==='out'?100:60}%;background:${r.status==='out'?'var(--bad)':'var(--warn)'}"></span></span><b class="dash-bar-val">${fmtInt(r.qty)} / min ${fmtInt(r.min)}</b></div>`).join('')+'</div>'
    : '<p class="help">Nenhum produto sem estoque ou abaixo do mínimo.</p>';
  box.innerHTML=
    g.chartCard('Valor em estoque por produto',g.barChart(top),top.length?'Top 10 por capital imobilizado.':'')+
    g.chartCard('Participação no valor total',g.doughnut(withValue.slice(0,8).map(r=>({label:r.p.name,value:r.value}))))+
    g.chartCard('Maior capital parado',g.barChart(withValue.slice(0,10).map(r=>({label:r.p.name+' · '+fmtInt(r.qty)+' un',value:r.value}))))+
    g.chartCard('Estoque baixo ou zerado',lowHTML);
}

function renderTable(rows){
  const vis=visible(rows);
  el('stCount').textContent=`${vis.length} de ${rows.length} produto(s)`;
  const hl=k=>k===currentLoc?' style="background:var(--highlight)"':''; // destaca a coluna da aba ativa
  const locTh=LOCS.map(([k,,short])=>`<th${hl(k)}>${esc(short)}</th>`).join('');
  const head=`<thead><tr><th>Produto</th><th>SKU</th><th>Custo un.</th>${locTh}<th>Total</th><th>Mín.</th><th>Valor</th><th>Atualizado</th><th>Status</th></tr></thead>`;
  const body=vis.map(r=>{
    const cls=r.status==='out'?'bad':r.status==='low'?'warn':'good';
    const txt=r.status==='out'?'Sem estoque':r.status==='low'?'Estoque baixo':'Normal';
    const locTd=LOCS.map(([k])=>`<td${hl(k)}><input type="number" min="0" step="1" data-loc="${k}" data-id="${r.p.id}" value="${r.byLoc[k]||''}" placeholder="0"></td>`).join('');
    return `<tr data-sid="${r.p.id}">
      <td class="mo-name">${esc(r.p.name)}</td>
      <td>${esc(r.p.sku||'—')}</td>
      <td>${fmtMoney(r.cost)}</td>
      ${locTd}
      <td data-c="total"><b>${fmtInt(r.qty)}</b></td>
      <td><input type="number" min="0" step="1" data-min="1" data-id="${r.p.id}" value="${r.min||''}" placeholder="0"></td>
      <td data-c="value">${fmtMoney(r.value)}</td>
      <td>${r.updated?brDate(r.updated):'—'}</td>
      <td><span class="status ${cls}">${txt}</span></td>
    </tr>`;
  }).join('')||`<tr><td colspan="${LOCS.length+7}" style="padding:14px">Nenhum produto com esses filtros.</td></tr>`;
  const t=totals(vis),byLoc=totalsByLoc(vis);
  const locFoot=LOCS.map(([k])=>`<td>${fmtInt(byLoc[k].qty)}</td>`).join('');
  const foot=`<tfoot><tr class="mo-total"><td>TOTAL</td><td></td><td></td>${locFoot}<td>${fmtInt(t.qty)}</td><td></td><td>${fmtMoney(t.value)}</td><td></td><td></td></tr></tfoot>`;
  el('stTable').innerHTML=head+'<tbody>'+body+'</tbody>'+foot;
  // edição manual por LOCAL (data-loc) e do mínimo (data-min)
  el('stTable').querySelectorAll('input[data-loc],input[data-min]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const id=inp.dataset.id,v=inp.value===''?0:Math.max(0,+inp.value);
      const c=cache[id]=cache[id]||blank();
      if(inp.dataset.min)c.min=v; else c.loc[inp.dataset.loc]=v;
      markDirty();
      redraw(); // recalcula Total/valor/status na hora
    });
  });
}

let lastFocus=null;
function redraw(){
  const a=document.activeElement,ds=a&&a.dataset;
  lastFocus=(ds&&(ds.loc||ds.min))?{id:ds.id,sel:ds.min?'[data-min]':`[data-loc="${ds.loc}"]`,pos:a.selectionStart}:null;
  const rows=rowsData();
  renderKpis(rows);renderCharts(rows);renderTable(rows);
  if(lastFocus){
    const back=el('stTable').querySelector(`input${lastFocus.sel}[data-id="${lastFocus.id}"]`);
    if(back){back.focus();try{back.setSelectionRange(lastFocus.pos,lastFocus.pos)}catch(e){}}
  }
}

async function save(){
  const u=uid();if(!u){alert('Faça login para salvar.');return}
  if(saving)return;
  const btn=el('stSave');saving=true;btn.disabled=true;btn.textContent='Salvando...';
  try{
    // Quantidade POR LOCAL -> stock_balances (1 linha por produto+local).
    // min_qty -> `stock` (preservado; envio SÓ min_qty, sem qty, para não mexer no legado).
    const ids=Object.keys(cache).filter(id=>list().some(p=>p.id===id));
    const balRows=[],minRows=[];
    ids.forEach(id=>{
      LOC_KEYS.forEach(k=>balRows.push({user_id:u,product_id:id,location:k,qty:+cache[id].loc[k]||0}));
      minRows.push({user_id:u,product_id:id,min_qty:+cache[id].min||0});
    });
    if(balRows.length)await supabaseClient.upsertStockBalances(balRows);
    if(minRows.length)await supabaseClient.upsertStock(minRows);
    const nowISO=new Date().toISOString();
    ids.forEach(id=>{if(cache[id])cache[id].updated=nowISO}); // "Atualizado" reflete o save
    dirty=false;msg('Estoque salvo com sucesso','good');
    redraw();
    try{if(typeof window.resetDashboard==='function')window.resetDashboard()}catch(e){}
    setTimeout(()=>{if(!dirty)msg('')},2500);
  }catch(e){
    console.error('Erro ao salvar estoque:',e);
    msg('Não salvou: '+e.message,'bad');
    alert('Não foi possível salvar o estoque:\n\n'+e.message+
      (/stock_balances/i.test(e.message)?'\n\nSe falar na tabela "stock_balances", falta rodar sql/estoque_locais.sql no Supabase.'
        :/stock/i.test(e.message)?'\n\nSe falar na tabela "stock", falta rodar sql/cadastro_central_e_estoque.sql no Supabase.':''));
  }finally{saving=false;btn.disabled=false;btn.textContent=dirty?'Salvar estoque •':'Salvar estoque'}
}

// ---------- abas por local ----------
// A aba selecionada define o DESTINO da importação e destaca a coluna correspondente.
function updateImportLabel(){
  const b=el('tyImportar');if(b)b.textContent='Importar para '+LOC_LABEL(currentLoc);
  const t=el('tyBtn');if(t)t.title='Importar planilha para '+LOC_LABEL(currentLoc);
}
function renderTabs(){
  const box=el('stTabs');if(!box)return;
  // reutiliza .btn/.primary já estilizados; a aba ativa fica destacada (primary)
  box.innerHTML=LOCS.map(([k,label])=>`<button type="button" class="btn small${k===currentLoc?' primary':''}" data-loc="${k}">${esc(label)}</button>`).join('');
  box.querySelectorAll('[data-loc]').forEach(b=>b.onclick=()=>{currentLoc=b.dataset.loc;renderTabs();redraw()});
  updateImportLabel();
}

// ---------- eventos ----------
['stSearch','stCat','stStatus','stSort'].forEach(id=>{
  const e=el(id);if(!e)return;
  if(id==='stSearch')e.oninput=()=>renderTable(rowsData());else e.onchange=()=>redraw();
});
if(el('stSave'))el('stSave').onclick=save;

window.renderEstoque=async()=>{
  if(!uid()){el('stKpis').innerHTML='';el('stTable').innerHTML='<tbody><tr><td style="padding:16px">Faça login para lançar o estoque.</td></tr></tbody>';return}
  el('stTable').innerHTML='<tbody><tr><td style="padding:16px">Carregando...</td></tr></tbody>';
  try{await ensureLoaded()}
  catch(e){
    const dica=/stock_balances/i.test(e.message)
      ?'Falta rodar <code>sql/estoque_locais.sql</code> no Supabase (tabela <b>stock_balances</b>).'
      :'Se falar na tabela <b>stock</b>, falta rodar <code>sql/cadastro_central_e_estoque.sql</code> no Supabase.';
    el('stTable').innerHTML=`<tbody><tr><td style="padding:16px">Não foi possível carregar o estoque: ${esc(e.message)}<br><br>${dica}</td></tr></tbody>`;
    return;
  }
  fillFilters();renderTabs();
  const b=el('stSave');if(b){b.disabled=false;b.textContent=dirty?'Salvar estoque •':'Salvar estoque'}
  redraw();
};
// Dashboard consome o estoque já calculado (sem duplicar fórmula): total = soma dos 4 locais,
// valor = custo central × quantidade total; byLocation traz o resumo por local (unidades+valor).
window.stockSnapshot=()=>{
  const rows=rowsData(),t=totals(rows),byLoc=totalsByLoc(rows);
  return{rows,total:t.value,potential:t.potential,gross:t.gross,qty:t.qty,
         low:rows.filter(r=>r.status==='low').length,out:rows.filter(r=>r.status==='out').length,
         byLocation:byLoc,loaded:loadedFor!==null};
};
window.stockEnsureLoaded=ensureLoaded;
window.resetStock=()=>{cache={};loadedFor=null;dirty=false};

// ---------- API usada pela importação do inventário Tiny (tiny.js) ----------
// Só escreve no cache em memória. NÃO grava no Supabase: quem confirma é "Salvar estoque".
window.PainelEstoque={
  products:()=>list(),
  entry:id=>cache[id]||null,
  isDirty:()=>dirty,
  currentLocation:()=>currentLoc,               // aba/local ativo (destino da importação)
  currentLocationLabel:()=>LOC_LABEL(currentLoc),
  qtyOf:(id,loc)=>{const c=cache[id];return c?(+c.loc[LOC_KEYS.includes(loc)?loc:currentLoc]||0):0},
  // rows: [{product_id, qty}] — atualiza SÓ o LOCAL alvo dos produtos presentes na planilha;
  // os demais produtos E os demais locais permanecem intactos (nada é apagado/zerado).
  applyQty(rows,location){
    const loc=LOC_KEYS.includes(location)?location:currentLoc;
    (rows||[]).forEach(r=>{
      const c=cache[r.product_id]=cache[r.product_id]||blank();
      c.loc[loc]=+r.qty||0;
    });
    markDirty();  // mostra "Alterações não salvas"
    redraw();     // recalcula cards, gráficos, Total e valor do estoque
  }
};
})();
