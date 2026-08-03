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

let cache={},loadedFor=null,dirty=false,saving=false;

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
  const rows=await supabaseClient.getStock(u);
  cache={};
  (rows||[]).forEach(r=>{cache[r.product_id]={qty:+r.qty||0,min:+r.min_qty||0}});
  loadedFor=u;dirty=false;
  return true;
}

// ---------- cálculo (fonte única das métricas de estoque) ----------
function rowsData(){
  const rows=list().map(p=>{
    const s=cache[p.id]||{};
    const qty=+s.qty||0,min=+s.min||0;
    const cost=+p.cost||0,price=refPrice(p);
    const value=cost*qty;                 // valor em estoque
    const potential=price*qty;            // valor potencial de venda
    const gross=potential-value;          // lucro bruto potencial
    const status=qty<=0?'out':(qty<=min?'low':'ok');
    return{p,qty,min,cost,price,value,potential,gross,status};
  });
  const total=rows.reduce((a,r)=>a+r.value,0);
  rows.forEach(r=>{r.share=share(r.value,total)});
  return rows;
}
function totals(rows){
  return rows.reduce((a,r)=>({value:a.value+r.value,potential:a.potential+r.potential,gross:a.gross+r.gross,qty:a.qty+r.qty}),{value:0,potential:0,gross:0,qty:0});
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
  const t=totals(rows);
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
    kpi('Maior quantidade',topQty&&topQty.qty>0?fmtInt(topQty.qty):'—',topQty&&topQty.qty>0?topQty.p.name:'Sem dados');
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
  const head='<thead><tr><th>Produto</th><th>SKU</th><th>Custo un.</th><th>Preço venda</th><th>Qtd. disponível</th><th>Estoque mínimo</th><th>Valor em estoque</th><th>Valor potencial</th><th>Lucro bruto pot.</th><th>Participação</th><th>Status</th></tr></thead>';
  const body=vis.map(r=>{
    const cls=r.status==='out'?'bad':r.status==='low'?'warn':'good';
    const txt=r.status==='out'?'Sem estoque':r.status==='low'?'Estoque baixo':'Normal';
    return `<tr data-sid="${r.p.id}">
      <td class="mo-name">${esc(r.p.name)}</td>
      <td>${esc(r.p.sku||'—')}</td>
      <td>${fmtMoney(r.cost)}</td>
      <td>${fmtMoney(r.price)}</td>
      <td><input type="number" min="0" step="1" data-st="qty" data-id="${r.p.id}" value="${r.qty||''}" placeholder="0"></td>
      <td><input type="number" min="0" step="1" data-st="min" data-id="${r.p.id}" value="${r.min||''}" placeholder="0"></td>
      <td data-c="value">${fmtMoney(r.value)}</td>
      <td data-c="potential">${fmtMoney(r.potential)}</td>
      <td data-c="gross" class="${r.gross>=0?'pos':'neg'}">${fmtMoney(r.gross)}</td>
      <td data-c="share">${fmtShare(r.share)}</td>
      <td><span class="status ${cls}">${txt}</span></td>
    </tr>`;
  }).join('')||'<tr><td colspan="11" style="padding:14px">Nenhum produto com esses filtros.</td></tr>';
  const t=totals(vis);
  const foot=`<tfoot><tr class="mo-total"><td>TOTAL</td><td></td><td></td><td></td><td>${fmtInt(t.qty)}</td><td></td><td>${fmtMoney(t.value)}</td><td>${fmtMoney(t.potential)}</td><td class="${t.gross>=0?'pos':'neg'}">${fmtMoney(t.gross)}</td><td></td><td></td></tr></tfoot>`;
  el('stTable').innerHTML=head+'<tbody>'+body+'</tbody>'+foot;
  el('stTable').querySelectorAll('input[data-st]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const id=inp.dataset.id;
      cache[id]=cache[id]||{qty:0,min:0};
      cache[id][inp.dataset.st]=inp.value===''?0:Math.max(0,+inp.value);
      markDirty();
      redraw(); // recalcula valores/participação/status na hora
    });
  });
}

let lastFocus=null;
function redraw(){
  const a=document.activeElement;
  lastFocus=a&&a.dataset&&a.dataset.st?{id:a.dataset.id,f:a.dataset.st,pos:a.selectionStart}:null;
  const rows=rowsData();
  renderKpis(rows);renderCharts(rows);renderTable(rows);
  if(lastFocus){
    const back=el('stTable').querySelector(`input[data-st="${lastFocus.f}"][data-id="${lastFocus.id}"]`);
    if(back){back.focus();try{back.setSelectionRange(lastFocus.pos,lastFocus.pos)}catch(e){}}
  }
}

async function save(){
  const u=uid();if(!u){alert('Faça login para salvar.');return}
  if(saving)return;
  const btn=el('stSave');saving=true;btn.disabled=true;btn.textContent='Salvando...';
  try{
    // 1 requisição em lote com todas as linhas que têm quantidade ou mínimo
    const rows=Object.keys(cache)
      .filter(id=>list().some(p=>p.id===id))
      .map(id=>({user_id:u,product_id:id,qty:+cache[id].qty||0,min_qty:+cache[id].min||0}));
    if(rows.length)await supabaseClient.upsertStock(rows);
    dirty=false;msg('Estoque salvo com sucesso','good');
    try{if(typeof window.resetDashboard==='function')window.resetDashboard()}catch(e){}
    setTimeout(()=>{if(!dirty)msg('')},2500);
  }catch(e){
    console.error('Erro ao salvar estoque:',e);
    msg('Não salvou: '+e.message,'bad');
    alert('Não foi possível salvar o estoque:\n\n'+e.message+
      (/stock/i.test(e.message)?'\n\nSe falar na tabela "stock", falta rodar sql/cadastro_central_e_estoque.sql no Supabase.':''));
  }finally{saving=false;btn.disabled=false;btn.textContent=dirty?'Salvar estoque •':'Salvar estoque'}
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
    el('stTable').innerHTML=`<tbody><tr><td style="padding:16px">Não foi possível carregar o estoque: ${esc(e.message)}<br><br>Se falar na tabela <b>stock</b>, falta rodar <code>sql/cadastro_central_e_estoque.sql</code> no Supabase.</td></tr></tbody>`;
    return;
  }
  fillFilters();
  const b=el('stSave');if(b){b.disabled=false;b.textContent=dirty?'Salvar estoque •':'Salvar estoque'}
  redraw();
};
// Dashboard consome o estoque já calculado (sem duplicar fórmula)
window.stockSnapshot=()=>{
  const rows=rowsData(),t=totals(rows);
  return{rows,total:t.value,potential:t.potential,gross:t.gross,qty:t.qty,
         low:rows.filter(r=>r.status==='low').length,out:rows.filter(r=>r.status==='out').length,
         loaded:loadedFor!==null};
};
window.stockEnsureLoaded=ensureLoaded;
window.resetStock=()=>{cache={};loadedFor=null;dirty=false};

// ---------- API usada pela importação do inventário Tiny (tiny.js) ----------
// Só escreve no cache em memória. NÃO grava no Supabase: quem confirma é "Salvar estoque".
window.PainelEstoque={
  products:()=>list(),
  entry:id=>cache[id]||null,
  isDirty:()=>dirty,
  // rows: [{product_id, qty}] — atualiza SÓ os produtos presentes na planilha;
  // os demais permanecem intactos (nada é apagado).
  applyQty(rows){
    (rows||[]).forEach(r=>{
      const cur=cache[r.product_id]||{qty:0,min:0};
      cache[r.product_id]=Object.assign({},cur,{qty:+r.qty||0});
    });
    markDirty();  // mostra "Alterações não salvas"
    redraw();     // recalcula cards, gráficos e valor do estoque
  }
};
})();
