'use strict';
(function(){
const el=x=>document.getElementById(x);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const fmtInt=v=>new Intl.NumberFormat('pt-BR').format(Math.round(v||0));
const fmtMoney=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v):'—';
const fmtPct=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(v):'—';
const toNum=v=>{if(typeof v==='number')return v;let s=String(v??'').trim();if(!s||s==='-')return 0;s=s.replace(/r\$|\s|%/gi,'');if(s.includes(',')&&s.includes('.'))s=s.replaceAll('.','').replace(',','.');else if(s.includes(','))s=/^\d{1,3}(,\d{3})+$/.test(s)?s.replaceAll(',',''):s.replace(',','.');else if(s.includes('.')&&/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replaceAll('.','');let n=parseFloat(s);return Number.isFinite(n)?n:0};

// Colunas de taxas/médias que nunca devem ser somadas
const EXCLUDE=['taxa','rate','ctr','roas','acos','medio','media','por conversao','por pedido','posicionamento','rejeicao','voucher'];

const ADS_MAP={impressions:['impress'],clicks:['clique','click'],spend:['despesa','gasto','investimento','custo'],conversions:['convers','pedidos','encomendas'],revenue:['gmv','receita','vendas']};
const PROD_MAP={impressions:['impress'],clicks:['clique','click'],visits:['visitant','visitas','acessos'],pageviews:['visualizac'],carts:['carrinho'],orders:['pedidos','encomendas','unidades'],revenue:['vendas (brl)','gmv','vendas','receita','faturamento']};

let adsData=null,prodData=null,adsMeta={},prodMeta={},simBase=null,simState=null;

// Reset de TODO estado efêmero da aba Performance (import de relatórios, meta, simulador).
// Chamado no logout/troca de sessão para não vazar dados do usuário A para o B no mesmo navegador.
function resetPerformanceState(){
  adsData=null;prodData=null;adsMeta={};prodMeta={};simBase=null;simState=null;
  const clear=id=>{const e=el(id);if(e)e.innerHTML=''};
  const setStatus=(id,text)=>{const e=el(id);if(e)e.innerHTML=text};
  setStatus('adsFileStatus','Aguardando arquivo (CSV ou XLSX)');
  setStatus('prodFileStatus','Aguardando arquivo (CSV ou XLSX)');
  const meta=el('perfMetaPanel');if(meta)meta.style.display='none';
  clear('perfMeta');
  const single=el('singleSalePanel');if(single)single.style.display='none';
  const sim=el('simPanel');if(sim)sim.style.display='none';
  const adsK=el('adsKpis');if(adsK)adsK.innerHTML='<article class="kpi"><div class="label">Aguardando relatório de Ads</div><div class="sub">Envie o arquivo para ver as métricas</div></article>';
  const prodK=el('prodKpis');if(prodK)prodK.innerHTML='<article class="kpi"><div class="label">Aguardando relatório do produto</div><div class="sub">Envie o arquivo para ver as métricas</div></article>';
  const diag=el('perfDiagnosis');if(diag)diag.innerHTML='<p class="help">Envie ao menos um arquivo para gerar diagnósticos automáticos (ex.: CTR baixo → melhorar o anúncio).</p>';
}
window.resetPerformanceState=resetPerformanceState;

// Rótulos que vêm como par "rótulo,valor" na mesma linha (metadados de cabeçalho)
const META_WANT={
  produto:['nome do produto / anuncio','nome do produto/anuncio','nome do produto','produto'],
  id:['id do produto','id do item','id do anuncio'],
  campanha:['nome da campanha','campanha','tipo de campanha'],
  loja:['nome da loja','loja'],
  idLoja:['id da loja'],
  periodo:['periodo'],
  data:['data de criacao do relatorio']
};

// Extrai identificação: pares rótulo/valor (Ads) e colunas Produto/ID/Lance (tabela)
function extractMeta(sheets,map){
  const meta={};
  for(const rows of sheets){
    for(const r of rows){
      if(!r)continue;
      const cells=r.map(c=>String(c).trim());
      const nn=cells.map(norm);
      // par rótulo/valor: só quando a linha tem poucas células preenchidas (não é cabeçalho de tabela)
      if(cells.filter(c=>c!=='').length>4)continue;
      for(const key in META_WANT){
        if(meta[key])continue;
        const i=nn.findIndex(c=>META_WANT[key].some(k=>c===k||c.startsWith(k+' ')||c===k.replace(/ /g,'')));
        if(i>=0){
          const val=cells.slice(i+1).find(c=>c!==''&&norm(c)!==nn[i]);
          if(val)meta[key]=val;
        }
      }
    }
    // Colunas da tabela: Produto / ID / Método de Lance → valor da 1ª linha de dados
    for(const sec of splitSections(rows,['produto','id do item','impress','metodo de lance','clique'])){
      const pi=sec.header.findIndex(h=>h.includes('produto')&&!h.includes('id'));
      const ii=sec.header.findIndex(h=>h.includes('id do item')||h.includes('id do produto'));
      const ci=sec.header.findIndex(h=>h.includes('metodo de lance'));
      const row=sec.data.find(r=>r&&r.some(c=>String(c).trim()!==''));
      if(row){
        if(!meta.produto&&pi>=0&&String(row[pi]||'').trim())meta.produto=String(row[pi]).trim();
        if(!meta.id&&ii>=0&&String(row[ii]||'').trim())meta.id=String(row[ii]).trim();
        if(!meta.campanha&&ci>=0&&String(row[ci]||'').trim())meta.campanha=String(row[ci]).trim();
      }
    }
  }
  return meta;
}

function mergedMeta(){return Object.assign({},prodMeta,adsMeta)}

function parseCSVText(text){
  const counts={';':(text.match(/;/g)||[]).length,',':(text.match(/,/g)||[]).length,'\t':(text.match(/\t/g)||[]).length};
  const delim=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  const rows=[];let row=[],cur='',inQ=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(inQ){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else inQ=false}else cur+=ch}
    else if(ch==='"')inQ=true;
    else if(ch===delim){row.push(cur);cur=''}
    else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur=''}
    else if(ch!=='\r')cur+=ch}
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  return rows;
}

// Retorna array de "abas" (cada aba = array de linhas)
async function readFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    if(typeof XLSX==='undefined')throw new Error('Biblioteca XLSX não carregou — verifique a conexão e recarregue.');
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf);
    return wb.SheetNames.map(n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}));
  }
  return [parseCSVText(await file.text())];
}

function isHeaderRow(r,kw){
  const cells=r.map(c=>norm(String(c))).filter(c=>c.trim()!=='');
  if(cells.length<3)return false;
  const hits=cells.filter(c=>kw.some(k=>c.includes(k))).length;
  if(hits<2)return false;
  const numeric=cells.filter(c=>/^[\d.,%\s\-r$]+$/.test(c)&&/\d/.test(c)).length;
  return numeric<=Math.floor(cells.length/3);
}

// Divide uma aba em seções (título opcional + cabeçalho + linhas de dados)
function splitSections(rows,kw){
  const sections=[];let cur=null,lastLabel='';
  for(const r of rows){
    if(!r||r.every(c=>String(c).trim()===''))continue;
    if(isHeaderRow(r,kw)){cur={title:lastLabel,header:r.map(c=>norm(String(c))),data:[]};sections.push(cur);lastLabel='';continue}
    if(cur)cur.data.push(r);
    const first=r.find(c=>String(c).trim()!=='');
    lastLabel=norm(String(first||'')).trim();
  }
  return sections;
}

function matchCol(headers,keywords){
  for(const k of keywords){
    const i=headers.findIndex(h=>h.includes(k)&&!EXCLUDE.some(x=>h.includes(x)));
    if(i>=0)return i;
  }
  return -1;
}

// Soma uma seção; se a 1ª linha for o total da seção (rótulo = título), usa só ela
function sumSection(sec,map){
  const idx={};let any=false;
  for(const key in map){idx[key]=matchCol(sec.header,map[key]);if(idx[key]>=0)any=true}
  if(!any)return null;
  let data=sec.data;
  if(data.length>1&&sec.title&&norm(String(data[0][0]||'')).trim()===sec.title)data=[data[0]];
  const out={};for(const k in map)out[k]=idx[k]>=0?data.reduce((s,r)=>s+toNum(r[idx[k]]),0):null;
  out._rows=data.length;
  return out;
}

// Extrai métricas de todas as abas/seções: usa o primeiro valor > 0 de cada métrica
function extract(sheets,map){
  const out={};for(const k in map)out[k]=0;
  const found={};let rowsUsed=0;
  const kw=Object.values(map).flat();
  for(const rows of sheets){
    for(const sec of splitSections(rows,kw)){
      const vals=sumSection(sec,map);
      if(!vals)continue;
      let used=false;
      for(const k in map){
        if(!found[k]&&vals[k]!==null&&vals[k]>0){out[k]=vals[k];found[k]=true;used=true}
      }
      if(used)rowsUsed+=vals._rows;
    }
  }
  out._rows=rowsUsed;
  out._missing=Object.keys(map).filter(k=>!found[k]);
  return out;
}

const kpi=(label,value,sub)=>`<article class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub||''}</div></article>`;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function renderMeta(){
  const m=mergedMeta();
  const has=Object.keys(m).length>0;
  el('perfMetaPanel').style.display=has?'':'none';
  if(!has)return;
  const items=[];
  if(m.produto)items.push(['Produto',m.produto]);
  if(m.id)items.push(['ID do produto / anúncio',m.id]);
  if(m.campanha)items.push(['Campanha / lance',m.campanha]);
  if(m.loja)items.push(['Loja',m.loja+(m.idLoja?' · '+m.idLoja:'')]);
  if(m.periodo)items.push(['Período',m.periodo]);
  el('perfMeta').innerHTML=items.map(([k,v])=>`<div class="meta-item"><span class="meta-label">${esc(k)}</span><b class="meta-value">${esc(v)}</b></div>`).join('');
}

function renderAds(){
  if(!adsData)return;
  const a=adsData,ctr=a.impressions>0?a.clicks/a.impressions:NaN,cvr=a.clicks>0?a.conversions/a.clicks:NaN,
    roas=a.spend>0?a.revenue/a.spend:NaN,acos=a.revenue>0?a.spend/a.revenue:NaN,
    cpc=a.clicks>0?a.spend/a.clicks:NaN,cpa=a.conversions>0?a.spend/a.conversions:NaN,
    unit=a.conversions>0?a.revenue/a.conversions:NaN;
  el('adsKpis').innerHTML=
    kpi('Impressões',fmtInt(a.impressions),'')+
    kpi('Cliques',fmtInt(a.clicks),'')+
    kpi('CTR',fmtPct(ctr),'Cliques ÷ impressões')+
    kpi('Gasto em Ads',fmtMoney(a.spend),'')+
    kpi('Conversões (vendas)',fmtInt(a.conversions),'')+
    kpi('Conversão do anúncio',fmtPct(cvr),'Conversões ÷ cliques')+
    kpi('GMV (receita Ads)',fmtMoney(a.revenue),'')+
    kpi('Valor de venda por unidade',fmtMoney(unit),'GMV ÷ conversões')+
    kpi('ROAS',Number.isFinite(roas)?roas.toFixed(2)+'x':'—','Receita ÷ gasto')+
    kpi('ACOS',fmtPct(acos),'Gasto ÷ receita')+
    kpi('CPC / CPA',`${fmtMoney(cpc)} · ${fmtMoney(cpa)}`,'Custo por clique · por conversão');
}

function renderProd(){
  if(!prodData)return;
  const p=prodData,orgCtr=p.impressions>0?p.clicks/p.impressions:NaN,
    cartRate=p.visits>0?p.carts/p.visits:NaN,conv=p.visits>0?p.orders/p.visits:NaN,
    checkout=p.carts>0?p.orders/p.carts:NaN,ticket=p.orders>0?p.revenue/p.orders:NaN;
  el('prodKpis').innerHTML=
    kpi('Impressões',fmtInt(p.impressions),'Orgânico + geral')+
    kpi('Cliques',fmtInt(p.clicks),'')+
    kpi('CTR do produto',fmtPct(orgCtr),'Cliques ÷ impressões')+
    kpi('Visitas',fmtInt(p.visits),'')+
    kpi('Visualizações',fmtInt(p.pageviews),'')+
    kpi('Carrinhos',fmtInt(p.carts),'')+
    kpi('Taxa de carrinho',fmtPct(cartRate),'Carrinhos ÷ visitas')+
    kpi('Pedidos',fmtInt(p.orders),'')+
    kpi('Conversão do produto',fmtPct(conv),'Pedidos ÷ visitas')+
    kpi('Carrinho → pedido',fmtPct(checkout),'Fechamento do carrinho')+
    kpi('Vendas',fmtMoney(p.revenue),'')+
    kpi('Valor de venda por unidade (ticket)',fmtMoney(ticket),'Vendas ÷ pedidos');
}

// ---------- SIMULADOR DE CENÁRIOS (tabela comparativa) ----------
function buildSimBase(){
  const a=adsData,p=prodData;
  let impressions=0,clicks=0,spend=0,conversions=0,revenue=0,unitPrice=0;
  if(a){impressions=a.impressions;clicks=a.clicks;spend=a.spend;conversions=a.conversions;revenue=a.revenue}
  if(unitPrice<=0&&a&&a.conversions>0)unitPrice=a.revenue/a.conversions;
  if(unitPrice<=0&&p&&p.orders>0)unitPrice=p.revenue/p.orders;
  const ctr=impressions>0?clicks/impressions*100:0;
  const convRate=clicks>0?conversions/clicks*100:0;
  return{impressions,ctr:+ctr.toFixed(4),convRate:+convRate.toFixed(4),unitPrice:+unitPrice.toFixed(2),spend:+spend.toFixed(2),cost:0,commission:14,tax:0,others:0};
}

// Custos por unidade: do produto salvo (motor calcAt) OU dos campos manuais
function costBreakdown(s){
  const price=s.unitPrice||0,p=getChosenProduct();
  if(p&&typeof calcAt==='function'&&typeof currentChannel==='function'){
    const ch=currentChannel(p),r=calcAt(p,ch,price);
    return{product:p.cost||0,platform:r.commission+(ch.fixedFee||0)+r.service+(r.unit||0),tax:r.tax,others:(ch.packaging||0)+(ch.freight||0)+r.returns,fromProduct:true,name:p.name,cost:p.cost||0};
  }
  return{product:s.cost||0,platform:price*(s.commission||0)/100,tax:price*(s.tax||0)/100,others:s.others||0,fromProduct:false};
}

// Calcula TODAS as métricas a partir das variáveis primárias
function computeAll(s){
  const {impressions,ctr,convRate,unitPrice,spend}=s;
  const clicks=impressions*ctr/100;
  const conversions=clicks*convRate/100;
  const revenue=conversions*unitPrice;
  const roas=spend>0?revenue/spend:NaN;
  const acos=revenue>0?spend/revenue:NaN;
  const cpc=clicks>0?spend/clicks:NaN;
  const cpa=conversions>0?spend/conversions:NaN;
  const cb=costBreakdown(s);
  const nonAd=cb.product+cb.platform+cb.tax+cb.others;
  const profit=revenue-spend-nonAd*conversions;
  const margin=revenue>0?profit/revenue:NaN;
  return{impressions,ctr,convRate,unitPrice,spend,cost:s.cost,commission:s.commission,tax:s.tax,others:s.others,clicks,conversions,revenue,roas,acos,cpc,cpa,cb,profit,margin};
}
const simCompute=computeAll; // compat

// Formatadores para a tabela
const fPctNum=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
const fX=v=>Number.isFinite(v)?v.toFixed(2)+'x':'—';

// Linhas do anúncio (sempre editáveis; edit.set faz o "back-solve" das derivadas)
const ADS_ROWS=[
  {k:'impressions',label:'Impressões',fmt:fmtInt,get:m=>m.impressions,edit:{val:m=>m.impressions,set:(v,s)=>s.impressions=v}},
  {k:'ctr',label:'CTR',fmt:fPctNum,goodUp:true,get:m=>m.ctr,edit:{val:m=>m.ctr,set:(v,s)=>s.ctr=v}},
  {k:'clicks',label:'Cliques',fmt:fmtInt,goodUp:true,get:m=>m.clicks},
  {k:'convRate',label:'Taxa de conversão',fmt:fPctNum,goodUp:true,get:m=>m.convRate,edit:{val:m=>m.convRate,set:(v,s)=>s.convRate=v}},
  {k:'conversions',label:'Vendas (conversões)',fmt:fmtInt,goodUp:true,get:m=>m.conversions},
  {k:'unitPrice',label:'Preço de venda (R$)',fmt:fmtMoney,get:m=>m.unitPrice,edit:{val:m=>m.unitPrice,set:(v,s)=>s.unitPrice=v}},
  {k:'spend',label:'Gasto em Ads (R$)',fmt:fmtMoney,goodUp:false,get:m=>m.spend,edit:{val:m=>m.spend,set:(v,s)=>s.spend=v}},
  {k:'revenue',label:'Receita (GMV)',fmt:fmtMoney,goodUp:true,get:m=>m.revenue},
  {k:'roas',label:'ROAS',fmt:fX,goodUp:true,get:m=>m.roas,edit:{val:m=>m.roas,set:(v,s,m)=>{if(v>0)s.spend=m.revenue/v}}},
  {k:'acos',label:'ACOS',fmt:fmtPct,goodUp:false,get:m=>m.acos,edit:{val:m=>Number.isFinite(m.acos)?m.acos*100:0,set:(v,s,m)=>{s.spend=m.revenue*v/100}}},
  {k:'cpc',label:'CPC',fmt:fmtMoney,goodUp:false,get:m=>m.cpc,edit:{val:m=>m.cpc,set:(v,s,m)=>{s.spend=v*m.clicks}}},
  {k:'cpa',label:'CPA (por venda)',fmt:fmtMoney,goodUp:false,get:m=>m.cpa,edit:{val:m=>m.cpa,set:(v,s,m)=>{s.spend=v*m.conversions}}}
];
// Custos manuais — só quando NÃO há produto salvo selecionado
const COST_MANUAL_ROWS=[
  {k:'cost',label:'Custo do produto (R$)',fmt:fmtMoney,get:m=>m.cost,edit:{val:m=>m.cost,set:(v,s)=>s.cost=v}},
  {k:'commission',label:'Comissão (%)',fmt:fPctNum,get:m=>m.commission,edit:{val:m=>m.commission,set:(v,s)=>s.commission=v}},
  {k:'taxp',label:'Imposto (%)',fmt:fPctNum,get:m=>m.tax,edit:{val:m=>m.tax,set:(v,s)=>s.tax=v}},
  {k:'others',label:'Outros custos / venda (R$)',fmt:fmtMoney,get:m=>m.others,edit:{val:m=>m.others,set:(v,s)=>s.others=v}}
];
// Custos do produto salvo — somente leitura, por unidade, via calcAt
const COST_PRODUCT_ROWS=[
  {k:'pc_product',label:'Custo do produto',fmt:fmtMoney,goodUp:false,get:m=>m.cb.product},
  {k:'pc_platform',label:'Comissão + tarifas',fmt:fmtMoney,goodUp:false,get:m=>m.cb.platform},
  {k:'pc_tax',label:'Impostos',fmt:fmtMoney,goodUp:false,get:m=>m.cb.tax},
  {k:'pc_others',label:'Outros (embalagem, frete)',fmt:fmtMoney,goodUp:false,get:m=>m.cb.others}
];
const RESULT_ROWS=[
  {k:'profit',label:'Lucro total',fmt:fmtMoney,goodUp:true,strong:true,get:m=>m.profit},
  {k:'margin',label:'Margem',fmt:fmtPct,goodUp:true,strong:true,get:m=>m.margin}
];
function costRows(){return getChosenProduct()?COST_PRODUCT_ROWS:COST_MANUAL_ROWS}
function allRows(){return[{sec:'Métricas do anúncio'},...ADS_ROWS,{sec:'Custos do produto e resultado'},...costRows(),...RESULT_ROWS]}

function simRowsHTML(){
  const base=computeAll(simBase),cur=computeAll(simState);
  let html='<table class="sim-table"><thead><tr><th>Métrica</th><th>Atual (real)</th><th>Simulado</th><th>Variação</th></tr></thead><tbody>';
  for(const row of allRows()){
    if(row.sec){html+=`<tr class="sim-sec"><td colspan="4">${row.sec}</td></tr>`;continue}
    const bv=row.get(base),cv=row.get(cur);
    let sim;
    if(row.edit){const iv=row.edit.val(cur);sim=`<input type="number" step="any" inputmode="decimal" data-simrow="${row.k}" value="${Number.isFinite(iv)?+iv.toFixed(4):''}">`;}
    else sim=`<b data-simval="${row.k}">${row.fmt(cv)}</b>`;
    html+=`<tr class="${row.strong?'sim-strong':''}${row.edit?' sim-editable':''}"><td class="sim-mlabel">${row.label}</td><td class="sim-atual">${row.fmt(bv)}</td><td class="sim-simcell">${sim}</td><td data-simvar="${row.k}" class="sim-varcell">${varHTML(row,bv,cv)}</td></tr>`;
  }
  html+='</tbody></table>';
  const p=getChosenProduct();
  if(p)html+=`<p class="help" style="margin:8px 2px 0">Custos de <b>${esc(p.name)}</b> (aba Precificação).${(p.cost||0)<=0?' <b style="color:var(--warn)">Defina o custo de compra lá.</b>':''} Troque o produto no seletor acima.</p>`;
  return html;
}

function varHTML(row,bv,cv){
  if(!(Number.isFinite(bv)&&Number.isFinite(cv))||Math.abs(cv-bv)<=1e-9)return'';
  const up=cv>bv,good=row.goodUp==null?null:(up===row.goodUp),cls=good==null?'':(good?'pos':'neg');
  return`<span class="sim-delta ${cls}">${up?'▲':'▼'} ${row.fmt(Math.abs(cv-bv))}</span>`;
}

// Atualiza células sem recriar a tabela (mantém o foco no input editado)
function updateSimTable(focusedKey){
  const wrap=el('simTableWrap'),base=computeAll(simBase),cur=computeAll(simState);
  for(const row of allRows()){
    if(row.sec)continue;
    const cv=row.get(cur),bv=row.get(base);
    const b=wrap.querySelector(`[data-simval="${row.k}"]`);if(b)b.textContent=row.fmt(cv);
    if(row.edit&&row.k!==focusedKey){const inp=wrap.querySelector(`input[data-simrow="${row.k}"]`);if(inp){const iv=row.edit.val(cur);inp.value=Number.isFinite(iv)?+iv.toFixed(4):''}}
    const vt=wrap.querySelector(`[data-simvar="${row.k}"]`);if(vt)vt.innerHTML=varHTML(row,bv,cv);
  }
}

function renderSimTable(){
  const wrap=el('simTableWrap');
  wrap.innerHTML=simRowsHTML();
  wrap.querySelectorAll('input[data-simrow]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const row=allRows().find(r=>r.k===inp.dataset.simrow);
      row.edit.set(Number(inp.value)||0,simState,computeAll(simState));
      updateSimTable(row.k);renderSingleSale();
    });
  });
}

// Lista de produtos salvos vem do app.js (global). Retorna [] se ainda não carregou.
function savedProducts(){try{return Array.isArray(products)?products:[]}catch(e){return[]}}

function populatePerfProducts(){
  const sel=el('perfProductSelect');if(!sel)return;
  const list=savedProducts();
  const keep=sel.value;
  sel.innerHTML='<option value="">— selecione o produto salvo —</option>'+list.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if(keep&&list.some(p=>p.id===keep))sel.value=keep;
}

// Casa o produto do relatório com um produto salvo (maior sobreposição de palavras)
function autoMatchProduct(){
  const sel=el('perfProductSelect');if(!sel||sel.value)return;
  const m=mergedMeta();const name=norm(m.produto||'');if(!name)return;
  const tokens=name.split(/[^a-z0-9]+/).filter(t=>t.length>2);
  let best=null,bestScore=0;
  for(const p of savedProducts()){
    const pn=norm(p.name);const pt=new Set(pn.split(/[^a-z0-9]+/).filter(t=>t.length>2));
    const score=tokens.filter(t=>pt.has(t)).length;
    if(score>bestScore){bestScore=score;best=p}
  }
  if(best&&bestScore>=2){sel.value=best.id;}
}

function getChosenProduct(){
  const sel=el('perfProductSelect');if(!sel||!sel.value)return null;
  return savedProducts().find(p=>p.id===sel.value)||null;
}

// Conta visual de UMA venda (por unidade), estilo painel de precificação
function renderSingleSale(){
  if(!simState){el('singleSalePanel').style.display='none';return}
  el('singleSalePanel').style.display='';
  const s=simState,c=computeAll(s),cb=c.cb;
  const price=s.unitPrice,ads=Number.isFinite(c.cpa)?c.cpa:0;
  const prod=cb.product,taxasImpostos=cb.platform+cb.tax,others=cb.others;
  const p=getChosenProduct();
  if(p)el('perfProductHint').innerHTML=`Custos de <b>${esc(p.name)}</b>`+((prod<=0)?' — <b style="color:var(--warn)">defina o custo de compra na aba Precificação</b>':'');
  else el('perfProductHint').innerHTML=savedProducts().length?'Sem produto selecionado — usando os campos manuais do Simulador de cenários abaixo.':'Faça login e cadastre produtos na aba Precificação para usar os custos reais.';
  const lucro=price-prod-taxasImpostos-others-ads,
    margin=price>0?lucro/price:NaN,roi=prod>0?lucro/prod:NaN;
  el('singleSaleKpis').innerHTML=
    kpi('Receita da venda',fmtMoney(price),'Valor de venda por unidade')+
    kpi(lucro>=0?'Lucro por venda':'Prejuízo por venda',fmtMoney(lucro),lucro>=0?'Resultado positivo':'Está no prejuízo')+
    kpi('Margem',fmtPct(margin),'Lucro ÷ receita')+
    kpi('ROI do produto',fmtPct(roi),'Lucro ÷ custo')+
    kpi('Anúncio por venda',fmtMoney(ads),'CPA = gasto ÷ vendas');
  const steps=[['Receita da venda',price,''],['Produto',prod,'−'],['Taxas + impostos',taxasImpostos,'−'],['Outros custos',others,'−'],['Anúncio por venda',ads,'−'],[lucro>=0?'Lucro por venda':'Prejuízo por venda',Math.abs(lucro),'=']];
  el('ssEquation').innerHTML=steps.map((x,i)=>`${i?`<span class="operator">${x[2]}</span>`:''}<div class="sale-step ${i===steps.length-1?(lucro>=0?'profit':'loss'):''}"><small>${x[0]}</small><b>${fmtMoney(x[1])}</b></div>`).join('');
  const segs=[['Produto',prod,'#55677f'],['Comissão + impostos',taxasImpostos,'#7656a8'],['Outros',others,'#8c7355'],['Anúncios',ads,'#d97706'],[lucro>=0?'Lucro':'Prejuízo',Math.abs(lucro),lucro>=0?'#178a4b':'#c52c2c']];
  const total=segs.reduce((a,b)=>a+b[1],0)||1;
  el('ssStack').innerHTML=segs.filter(x=>x[1]>0).map(x=>`<div class="sale-segment" title="${x[0]}: ${fmtMoney(x[1])}" style="width:${x[1]/total*100}%;background:${x[2]}"><span>${x[0]}</span><b>${fmtMoney(x[1])}</b></div>`).join('');
  el('ssCaption').textContent=`Com preço de ${fmtMoney(price)}, cada venda ${lucro>=0?'lucra':'perde'} ${fmtMoney(Math.abs(lucro))} (margem ${fmtPct(margin)}).`;
}

function buildSimulator(){
  if(!adsData&&!prodData){el('simPanel').style.display='none';return}
  el('simPanel').style.display='';
  simBase=buildSimBase();
  simState=Object.assign({},simBase);
  populatePerfProducts();autoMatchProduct();
  renderSimTable();renderSingleSale();
}

function diagnostics(){
  const d=[];
  if(adsData){
    const a=adsData,ctr=a.impressions>0?a.clicks/a.impressions:NaN,cvr=a.clicks>0?a.conversions/a.clicks:NaN,roas=a.spend>0?a.revenue/a.spend:NaN;
    if(a.impressions>0&&a.impressions<1000)d.push(['warn','Poucas impressões',`Apenas ${fmtInt(a.impressions)} impressões — aumente orçamento/lance ou melhore a relevância das palavras-chave para ganhar alcance.`]);
    if(Number.isFinite(ctr)){
      if(ctr<0.01)d.push(['bad','CTR baixo — precisa melhorar o anúncio',`CTR de ${fmtPct(ctr)} (abaixo de 1%). O anúncio aparece mas não atrai cliques: melhore a imagem principal, o título e o preço exibido.`]);
      else if(ctr<0.02)d.push(['warn','CTR razoável',`CTR de ${fmtPct(ctr)}. Dá para melhorar: teste outra imagem de capa e destaque benefício/preço no título.`]);
      else d.push(['good','CTR saudável',`CTR de ${fmtPct(ctr)} — o anúncio atrai cliques muito bem.`]);
    }
    if(Number.isFinite(cvr)){
      if(cvr<0.01)d.push(['bad','Cliques não viram vendas',`Conversão do anúncio de ${fmtPct(cvr)}. O clique chega mas não compra: revise preço, frete, fotos secundárias, descrição e avaliações.`]);
      else if(cvr<0.025)d.push(['warn','Conversão do anúncio mediana',`Conversão de ${fmtPct(cvr)}. Reforce provas sociais e ofertas para converter mais cliques.`]);
      else d.push(['good','Conversão do anúncio boa',`Conversão de ${fmtPct(cvr)} sobre os cliques.`]);
    }
    if(Number.isFinite(roas)){
      if(roas<5)d.push(['bad','ROAS baixo',`ROAS de ${roas.toFixed(2)}x. Compare com o ROAS mínimo do produto na aba Precificação — pode estar dando prejuízo.`]);
      else if(roas<8)d.push(['warn','ROAS de atenção',`ROAS de ${roas.toFixed(2)}x. Verifique se cobre a margem desejada.`]);
      else d.push(['good','ROAS saudável',`ROAS de ${roas.toFixed(2)}x.`]);
    }
    if(a._missing.length)d.push(['warn','Colunas não encontradas no arquivo de Ads',`Não localizei: ${a._missing.join(', ')}. Confira se o relatório tem essas colunas.`]);
  }
  if(prodData){
    const p=prodData,orgCtr=p.impressions>0?p.clicks/p.impressions:NaN,cartRate=p.visits>0?p.carts/p.visits:NaN,conv=p.visits>0?p.orders/p.visits:NaN,checkout=p.carts>0?p.orders/p.carts:NaN;
    if(Number.isFinite(orgCtr)){
      if(orgCtr<0.015)d.push(['warn','CTR do produto baixo',`CTR de ${fmtPct(orgCtr)} nas buscas/recomendações. Melhore a foto de capa e o título para atrair mais cliques orgânicos.`]);
      else d.push(['good','CTR do produto saudável',`CTR orgânico de ${fmtPct(orgCtr)}.`]);
    }
    if(Number.isFinite(cartRate)){
      if(cartRate<0.04)d.push(['bad','Poucos carrinhos por visita',`Taxa de carrinho de ${fmtPct(cartRate)}. A página não convence: melhore fotos, descrição, preço e variações disponíveis.`]);
      else if(cartRate<0.08)d.push(['warn','Taxa de carrinho mediana',`${fmtPct(cartRate)} das visitas adicionam ao carrinho. Há espaço para otimizar a página.`]);
      else d.push(['good','Página atrativa',`${fmtPct(cartRate)} das visitas adicionam ao carrinho.`]);
    }
    if(Number.isFinite(checkout)){
      if(checkout<0.3)d.push(['bad','Abandono de carrinho alto',`Só ${fmtPct(checkout)} dos carrinhos viram pedido. Revise frete, prazo de entrega e cupons.`]);
      else if(checkout<0.5)d.push(['warn','Fechamento de carrinho mediano',`${fmtPct(checkout)} dos carrinhos fecham. Teste cupom de fechamento e frete grátis.`]);
      else d.push(['good','Carrinho fecha bem',`${fmtPct(checkout)} dos carrinhos viram pedido.`]);
    }
    if(Number.isFinite(conv)){
      if(conv<0.01)d.push(['bad','Conversão do produto baixa',`Conversão geral de ${fmtPct(conv)}. Compare preço com concorrentes e reforce avaliações.`]);
      else if(conv<0.03)d.push(['warn','Conversão do produto mediana',`Conversão geral de ${fmtPct(conv)}.`]);
      else d.push(['good','Conversão do produto boa',`Conversão geral de ${fmtPct(conv)}.`]);
    }
    if(p._missing.length)d.push(['warn','Colunas não encontradas no arquivo do produto',`Não localizei: ${p._missing.join(', ')}. Confira se o relatório tem essas colunas.`]);
  }
  if(adsData&&prodData){
    const ctr=adsData.impressions>0?adsData.clicks/adsData.impressions:NaN;
    const conv=prodData.visits>0?prodData.orders/prodData.visits:NaN;
    const share=prodData.orders>0?adsData.conversions/prodData.orders:NaN;
    if(Number.isFinite(share)&&share>0.7)d.push(['warn','Dependência de Ads',`${fmtPct(Math.min(share,1))} dos pedidos vêm de anúncios. Fortaleça o orgânico: SEO do título, avaliações e participação em campanhas da plataforma.`]);
    if(Number.isFinite(ctr)&&Number.isFinite(conv)){
      if(ctr>=0.02&&conv<0.01)d.push(['bad','Gargalo é a página, não o anúncio',`O anúncio atrai cliques (CTR ${fmtPct(ctr)}), mas a página não converte (${fmtPct(conv)}). Foque na página do produto.`]);
      if(ctr<0.01&&conv>=0.03)d.push(['bad','Gargalo é o anúncio, não a página',`A página converte bem (${fmtPct(conv)}), mas o anúncio não atrai (CTR ${fmtPct(ctr)}). Foque no criativo e na segmentação.`]);
    }
  }
  return d;
}

function renderDiagnostics(){
  const d=diagnostics();
  if(!d.length){el('perfDiagnosis').innerHTML='<p class="help">Envie ao menos um arquivo para gerar diagnósticos automáticos.</p>';return}
  const order={bad:0,warn:1,good:2};
  d.sort((x,y)=>order[x[0]]-order[y[0]]);
  el('perfDiagnosis').innerHTML=d.map(([level,title,text])=>`<div class="diag ${level==='bad'?'badbox':level==='warn'?'warnbox':''}"><h3>${title}</h3><p>${text}</p></div>`).join('');
  const worst=d[0][0];
  el('perfStatus').className='status '+(worst==='bad'?'bad':worst==='warn'?'warn':'good');
  el('perfStatus').textContent=worst==='bad'?'Ação necessária':worst==='warn'?'Pontos de atenção':'Tudo saudável';
}

async function handleFile(input,statusEl,map,assign,which){
  const file=input.files[0];if(!file)return;
  statusEl.textContent='Lendo '+file.name+'...';
  try{
    const sheets=await readFile(file);
    const data=extract(sheets,map);
    if(data._missing.length===Object.keys(map).length)throw new Error('Nenhuma coluna reconhecida. Confira se é o relatório correto.');
    assign(data);
    const meta=extractMeta(sheets,map);
    if(which==='ads')adsMeta=meta;else prodMeta=meta;
    statusEl.innerHTML=`<span class="file-ok">✓ ${file.name}</span> — dados carregados`;
    renderMeta();renderAds();renderProd();buildSimulator();renderDiagnostics();
    // Sugere valores para o Resumo do mês (respeitando edições manuais anteriores)
    suggestAdsSummaryFromReports();
  }catch(e){statusEl.innerHTML=`<span style="color:var(--bad);font-weight:800">✗ ${e.message}</span>`}
  input.value='';
}

// Ads → ads_spend + revenue_ads; Produto → revenue_total (Vendas do relatório).
// NÃO sobrescreve valores que o usuário já editou à mão (AdsSummary.suggest cuida).
async function suggestAdsSummaryFromReports(){
  const uid=curUserId();if(!uid)return;
  await loadAdsSummaryForCurrent();
  const patch={};
  if(adsData){if(adsData.spend>0)patch.ads_spend=adsData.spend;if(adsData.revenue>0)patch.revenue_ads=adsData.revenue}
  if(prodData){if(prodData.revenue>0)patch.revenue_total=prodData.revenue}
  if(Object.keys(patch).length){
    AdsSummary.suggest(uid,curPlatform(),curMonth(),patch);
  }
}

el('adsFileBtn').onclick=()=>el('adsFile').click();
el('prodFileBtn').onclick=()=>el('prodFile').click();
el('adsFile').onchange=()=>handleFile(el('adsFile'),el('adsFileStatus'),ADS_MAP,d=>adsData=d,'ads');
el('prodFile').onchange=()=>handleFile(el('prodFile'),el('prodFileStatus'),PROD_MAP,d=>prodData=d,'prod');
el('simReset').onclick=()=>{if(simBase){simState=Object.assign({},simBase);renderSimTable();renderSingleSale()}};
el('perfProductSelect').onchange=()=>{if(simState){renderSimTable();renderSingleSale()}};

// ---------- RESULTADO MENSAL POR MARKETPLACE (Supabase, isolado por usuário) ----------
function curPlatform(){try{return platform}catch(e){return'mercadolivre'}}
function platformName(){try{return PLATFORMS[curPlatform()].name}catch(e){return''}}
function curUserId(){try{return currentUser&&currentUser.id}catch(e){return null}}

// ---------- RESUMO DE ADS: fonte única de ACOS/TACOS, por (usuário+plataforma+mês) ----------
// Guardado em monthly_ads_summary. Alimenta os cards da aba "Avaliar Anúncio e Produto"
// (com os inputs manuais) e um card na aba "Resultado mensal", garantindo mesmo número
// nas duas telas.
const AdsSummary = (function(){
  // cache por chave "user|platform|month"; cada valor: {ads_spend,revenue_total,revenue_ads,_manual}
  const cache={};
  const timers={};
  const listeners=[];

  const monthOr=m=>/^\d{4}-\d{2}$/.test(m||'')?m:(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})();
  const keyOf=(uid,plat,mo)=>uid+'|'+plat+'|'+mo;

  function empty(){return{ads_spend:0,revenue_total:0,revenue_ads:0,_manual:{ads_spend:false,revenue_total:false,revenue_ads:false}}}

  async function load(uid,plat,mo){
    mo=monthOr(mo);
    const key=keyOf(uid,plat,mo);
    if(cache[key])return cache[key];
    let row=null;
    try{row=await supabaseClient.getAdsSummary(uid,plat,mo)}catch(e){console.error('Erro ao carregar resumo Ads:',e)}
    // qualquer valor > 0 vindo do banco conta como "definido pelo usuário" (protege contra sobrescrita)
    const rec=empty();
    if(row){
      rec.ads_spend=+row.ads_spend||0;
      rec.revenue_total=+row.revenue_total||0;
      rec.revenue_ads=+row.revenue_ads||0;
      rec._manual.ads_spend=rec.ads_spend>0;
      rec._manual.revenue_total=rec.revenue_total>0;
      rec._manual.revenue_ads=rec.revenue_ads>0;
    }
    cache[key]=rec;
    return rec;
  }

  function get(uid,plat,mo){return cache[keyOf(uid,plat,monthOr(mo))]||null}

  function set(uid,plat,mo,field,value,{manual=true}={}){
    mo=monthOr(mo);
    const key=keyOf(uid,plat,mo),rec=cache[key]||empty();
    rec[field]=+value||0;
    if(manual)rec._manual[field]=true;
    cache[key]=rec;
    scheduleSave(uid,plat,mo);
    notify(uid,plat,mo);
    return rec;
  }

  // Preenche automaticamente A PARTIR do relatório de Ads/Produto, sem sobrescrever
  // o que o usuário já editou à mão (nem valores previamente confirmados manuais).
  function suggest(uid,plat,mo,{ads_spend,revenue_total,revenue_ads}={}){
    mo=monthOr(mo);
    const key=keyOf(uid,plat,mo),rec=cache[key]||empty();
    let changed=false;
    for(const [f,v] of [['ads_spend',ads_spend],['revenue_total',revenue_total],['revenue_ads',revenue_ads]]){
      if(v==null||!(v>0))continue;
      if(rec._manual[f])continue; // usuário já ajustou: não mexer
      if(Math.abs(rec[f]-(+v))<1e-6)continue;
      rec[f]=+v;changed=true;
    }
    cache[key]=rec;
    if(changed){scheduleSave(uid,plat,mo);notify(uid,plat,mo)}
    return rec;
  }

  function clearManualFlag(uid,plat,mo,field){
    mo=monthOr(mo);const rec=cache[keyOf(uid,plat,mo)];
    if(rec&&rec._manual)rec._manual[field]=false;
  }

  function scheduleSave(uid,plat,mo){
    const key=keyOf(uid,plat,mo);
    clearTimeout(timers[key]);
    timers[key]=setTimeout(async()=>{
      const rec=cache[key];if(!rec)return;
      try{await supabaseClient.upsertAdsSummary({user_id:uid,platform:plat,month:mo,ads_spend:rec.ads_spend,revenue_total:rec.revenue_total,revenue_ads:rec.revenue_ads})}
      catch(e){console.error('Erro ao salvar resumo Ads:',e);notify(uid,plat,mo,e)}
    },700);
  }

  function subscribe(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}}
  function notify(uid,plat,mo,err){for(const fn of listeners){try{fn({uid,platform:plat,month:mo,rec:cache[keyOf(uid,plat,mo)],error:err})}catch(e){console.error(e)}}}

  function reset(){for(const k in cache)delete cache[k];for(const k in timers){clearTimeout(timers[k]);delete timers[k]}}

  return{load,get,set,suggest,clearManualFlag,subscribe,reset,empty};
})();

// helpers de cálculo compartilhados — retornam NaN em vez de Infinity para o formatador
// exibir "—" naturalmente (evita NaN/Infinity na tela)
function calcAcos(spend,revAds){return revAds>0?spend/revAds:NaN}
function calcTacos(spend,revTotal){return revTotal>0?spend/revTotal:NaN}

let monthlyCache={},monthlyExpenses=0,monthlyLoadedFor=null,monthlySaveTimers={},monthlyExpensesTimer=null,monthlyMonths=[];
// performance.js roda numa IIFE; expõe um hook para app.js limpar o cache ao trocar de sessão
window.resetMonthlyCache=()=>{monthlyCache={};monthlyExpenses=0;monthlyLoadedFor=null;monthlyMonths=[];AdsSummary.reset();resetPerformanceState();renderAdsSummary()};

const thisMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
// "2026-06" -> "06/2026", para exibição
const monthLabel=m=>/^\d{4}-\d{2}$/.test(m||'')?m.slice(5)+'/'+m.slice(0,4):'—';
function curMonth(){const v=el('monthlyMonth')&&el('monthlyMonth').value;return /^\d{4}-\d{2}$/.test(v)?v:thisMonth()}

// Um único "mês atual" para as duas abas — troca em uma reflete na outra.
function syncMonthInputs(v){
  const val=/^\d{4}-\d{2}$/.test(v||'')?v:thisMonth();
  const m=el('monthlyMonth'),a=el('adsSummaryMonth');
  if(m&&m.value!==val)m.value=val;
  if(a&&a.value!==val)a.value=val;
}

// ---------- Painel "ACOS e TACOS" na aba Avaliar Anúncio e Produto ----------
async function loadAdsSummaryForCurrent(){
  const uid=curUserId();if(!uid)return null;
  return AdsSummary.load(uid,curPlatform(),curMonth());
}

function paintAdsSummaryInputs(rec){
  const set=(id,v)=>{const e=el(id);if(!e)return;const wanted=v>0?String(v):'';if(document.activeElement!==e&&e.value!==wanted)e.value=wanted};
  const r=rec||AdsSummary.empty();
  set('adsSpendInput',r.ads_spend);
  set('revenueTotalInput',r.revenue_total);
  set('revenueAdsInput',r.revenue_ads);
}

function renderAdsSummaryKpis(rec){
  const r=rec||AdsSummary.empty();
  const acos=calcAcos(r.ads_spend,r.revenue_ads),tacos=calcTacos(r.ads_spend,r.revenue_total);
  const box=el('adsSummaryKpis');if(!box)return;
  box.innerHTML=
    kpi('Gasto com Ads',fmtMoney(r.ads_spend),platformName()+' · '+monthLabel(curMonth()))+
    kpi('Faturamento total',fmtMoney(r.revenue_total),'Orgânico + Ads')+
    kpi('Faturamento por Ads',fmtMoney(r.revenue_ads),r.revenue_total>0?fmtPct(r.revenue_ads/r.revenue_total)+' do total':'—')+
    kpi('ACOS',fmtPct(acos),'Gasto ÷ receita dos Ads')+
    kpi('TACOS',fmtPct(tacos),'Gasto ÷ faturamento total');
}

async function renderAdsSummary(){
  const title=el('adsSummaryTitle');if(title)title.textContent='Resumo do mês — ACOS e TACOS · '+platformName()+' · '+monthLabel(curMonth());
  syncMonthInputs(curMonth());
  const uid=curUserId();
  if(!uid){paintAdsSummaryInputs(null);renderAdsSummaryKpis(null);const st=el('adsSummaryStatus');if(st){st.className='status neutral';st.textContent='Faça login'}return}
  const rec=await loadAdsSummaryForCurrent();
  paintAdsSummaryInputs(rec);
  renderAdsSummaryKpis(rec);
  const st=el('adsSummaryStatus'),any=rec&&(rec.ads_spend>0||rec.revenue_total>0||rec.revenue_ads>0);
  if(st){st.className='status '+(any?'good':'neutral');st.textContent=any?'Salvo':'Preencha ou importe'}
  const hint=el('adsSummaryHint');if(hint)hint.textContent='Estes três valores também aparecem na aba Resultado mensal deste marketplace/mês.';
}

// Reagir a mudanças vindas do módulo (troca em uma tela reflete na outra)
AdsSummary.subscribe(({uid,platform:plat,month:mo,error})=>{
  const uidCur=curUserId(),curPlat=curPlatform(),curMo=curMonth();
  if(uid!==uidCur||plat!==curPlat||mo!==curMo)return;
  const rec=AdsSummary.get(uid,plat,mo);
  paintAdsSummaryInputs(rec);
  renderAdsSummaryKpis(rec);
  // Se o Resultado Mensal estiver aberto, atualiza o card TACOS por lá também
  if(el('monthlyView')&&!el('monthlyView').classList.contains('hidden')){
    try{renderMonthlyKpis(monthlyRowsData())}catch(e){}
  }
  const st=el('adsSummaryStatus');
  if(st){
    if(error){st.className='status bad';st.textContent='Não salvou: '+error.message}
    else if(rec&&(rec.ads_spend>0||rec.revenue_total>0||rec.revenue_ads>0)){st.className='status good';st.textContent='Salvo'}
  }
});

function wireAdsSummaryInputs(){
  const bind=(id,field)=>{
    const e=el(id);if(!e)return;
    e.addEventListener('input',()=>{
      const uid=curUserId();if(!uid)return;
      const v=e.value===''?0:Number(e.value);
      if(e.value===''){AdsSummary.clearManualFlag(uid,curPlatform(),curMonth(),field)}
      AdsSummary.set(uid,curPlatform(),curMonth(),field,v,{manual:true});
    });
  };
  bind('adsSpendInput','ads_spend');
  bind('revenueTotalInput','revenue_total');
  bind('revenueAdsInput','revenue_ads');
  const m=el('adsSummaryMonth');
  if(m)m.addEventListener('change',()=>{
    syncMonthInputs(m.value);
    renderAdsSummary();
    // Se a aba mensal estiver ativa, também recarrega
    if(el('monthlyView')&&!el('monthlyView').classList.contains('hidden')){monthlyLoadedFor=null;renderMonthly()}
  });
}
wireAdsSummaryInputs();

// Busca os lançamentos DAQUELE mês + gastos gerais + resumo Ads (fonte única de ACOS/TACOS).
// A chave inclui o mês: trocar de mês recarrega em vez de mostrar dado do mês anterior.
async function ensureMonthlyLoaded(){
  const uid=curUserId(),plat=curPlatform(),mo=curMonth();
  if(!uid)return false;
  const key=uid+'|'+plat+'|'+mo;
  if(monthlyLoadedFor===key)return true;
  const[rows,exp,months]=await Promise.all([
    supabaseClient.getMonthlySales(uid,plat,mo),
    supabaseClient.getMonthlyExpenses(uid,mo),
    supabaseClient.listMonthlyMonths(uid),
    AdsSummary.load(uid,plat,mo) // popula o cache do resumo Ads (não bloqueia render se falhar dentro)
  ]);
  monthlyCache={};
  (rows||[]).forEach(r=>{monthlyCache[r.product_id]={units:r.units,price:r.price,ads:r.ads_unit}});
  monthlyExpenses=exp&&exp.amount!=null?+exp.amount:0;
  monthlyMonths=months||[];
  monthlyLoadedFor=key;
  return true;
}

// Custos por unidade de um produto no marketplace atual, ao preço informado
function monthlyUnit(p,price){
  const ch=(p.channels&&p.channels[curPlatform()])||(typeof channelDefaults==='function'?channelDefaults(curPlatform()):{});
  if(typeof calcAt==='function'){
    const r=calcAt(p,ch,price);
    return{comm:r.commission+(ch.fixedFee||0)+r.service+(r.unit||0),frete:(ch.freight||0)+(ch.packaging||0)+r.returns,tax:r.tax,cost:p.cost||0,profit:r.beforeAds,gross:r.gross};
  }
  return{comm:0,frete:0,tax:0,cost:p.cost||0,profit:price-(p.cost||0),gross:price};
}

// "ads" = quanto foi gasto de anúncio POR VENDA daquele produto no mês (preenchido à mão,
// porque nem toda venda vem do cenário simulado na aba Precificação).
function monthlyRowsData(){
  return savedProducts().map(p=>{
    const s=monthlyCache[p.id]||{};
    const ch=(p.channels&&p.channels[curPlatform()])||{};
    const units=+s.units||0;
    const price=s.price!=null&&s.price!==''?+s.price:(ch.price||0);
    const adsUnit=+s.ads||0;
    const u=monthlyUnit(p,price);
    const rev=units*price;
    const adsTotal=adsUnit*units;
    const profitUnit=u.profit-adsUnit;
    return{p,units,price,adsUnit,rev,comm:u.comm*units,frete:u.frete*units,tax:u.tax*units,cost:u.cost*units,ads:adsTotal,profit:profitUnit*units,margin:price>0?profitUnit/price:NaN};
  });
}

function monthlySaveError(e){
  console.error('Erro ao salvar resultado mensal:',e);
  const h=el('monthlyMonthHint');
  if(h){h.textContent='Não salvou: '+e.message;h.style.color='var(--bad)'}
}
function monthlySaveOk(){
  const h=el('monthlyMonthHint');
  if(h){h.textContent='Cada mês fica salvo separadamente';h.style.color=''}
}

// Salva com debounce (800ms de inatividade), como o auto-save da aba Precificação
function scheduleMonthlySave(productId){
  clearTimeout(monthlySaveTimers[productId]);
  const mo=curMonth();
  monthlySaveTimers[productId]=setTimeout(async()=>{
    const uid=curUserId();if(!uid)return;
    const s=monthlyCache[productId]||{units:0,price:0,ads:0};
    try{
      await supabaseClient.upsertMonthlySale({user_id:uid,platform:curPlatform(),product_id:productId,month:mo,units:+s.units||0,price:+s.price||0,ads_unit:+s.ads||0});
      monthlySaveOk();
      if(!monthlyMonths.includes(mo)){monthlyMonths.push(mo);monthlyMonths.sort().reverse();renderMonthList()}
    }
    catch(e){monthlySaveError(e)}
  },800);
}

// Gastos gerais: um valor por mês, do negócio inteiro (não por marketplace)
function scheduleExpensesSave(){
  clearTimeout(monthlyExpensesTimer);
  const mo=curMonth();
  monthlyExpensesTimer=setTimeout(async()=>{
    const uid=curUserId();if(!uid)return;
    try{await supabaseClient.upsertMonthlyExpenses({user_id:uid,month:mo,amount:+monthlyExpenses||0});monthlySaveOk()}
    catch(e){monthlySaveError(e)}
  },800);
}

// Meses que já têm lançamento viram atalhos clicáveis para consulta rápida
function renderMonthList(){
  const box=el('monthlyMonthList');
  if(!box)return;
  const cur=curMonth();
  box.innerHTML=monthlyMonths.length
    ?'<span class="mo-chips-label">Meses salvos:</span>'+monthlyMonths.map(m=>`<button type="button" class="chip${m===cur?' active':''}" data-mo="${m}">${monthLabel(m)}</button>`).join('')
    :'';
  box.querySelectorAll('[data-mo]').forEach(b=>b.onclick=()=>{
    el('monthlyMonth').value=b.dataset.mo;monthlyLoadedFor=null;renderMonthly();
  });
}

async function renderMonthly(){
  const tb=el('monthlyTable');
  if(!el('monthlyMonth').value)el('monthlyMonth').value=thisMonth();
  el('monthlyTitle').textContent='Resultado mensal — '+platformName()+' · '+monthLabel(curMonth());
  if(!curUserId()){tb.innerHTML='<tbody><tr><td style="padding:16px">Faça login para lançar o resultado mensal.</td></tr></tbody>';el('monthlyKpis').innerHTML='';return}
  tb.innerHTML='<tbody><tr><td style="padding:16px">Carregando...</td></tr></tbody>';
  try{await ensureMonthlyLoaded()}
  catch(e){
    console.error('Erro ao carregar resultado mensal:',e);
    tb.innerHTML=`<tbody><tr><td style="padding:16px">Não foi possível carregar este mês: ${esc(e.message)}<br><br>Se a mensagem falar em coluna <b>month</b> ou <b>ads_unit</b>, falta rodar o SQL <code>sql/resultado_mensal_por_mes.sql</code> no Supabase.</td></tr></tbody>`;
    el('monthlyKpis').innerHTML='';return;
  }
  renderMonthList();
  if(el('monthlyExpenses').value!==String(monthlyExpenses||''))el('monthlyExpenses').value=monthlyExpenses||'';
  const list=savedProducts();
  if(!list.length){tb.innerHTML='<tbody><tr><td style="padding:16px">Cadastre produtos na aba <b>Precificação</b> para lançar as vendas do mês.</td></tr></tbody>';el('monthlyKpis').innerHTML='';return}
  const head='<thead><tr><th>Produto</th><th>Custo compra</th><th>Unid. vendidas</th><th>Preço médio</th><th>Ads por venda</th><th>Receita bruta</th><th>Comissão + tarifas</th><th>Frete / outros</th><th>Imposto</th><th>Custo produtos</th><th>Ads total</th><th>Lucro líquido</th><th>% margem</th></tr></thead>';
  const rows=monthlyRowsData();
  let body='';
  for(const r of rows){
    body+=`<tr data-mid="${r.p.id}">
      <td class="mo-name">${esc(r.p.name)}</td>
      <td>${fmtMoney(r.p.cost||0)}</td>
      <td><input type="number" min="0" step="1" data-mo="units" data-id="${r.p.id}" value="${r.units||''}" placeholder="0"></td>
      <td><input type="number" min="0" step=".01" data-mo="price" data-id="${r.p.id}" value="${r.price||''}" placeholder="0,00"></td>
      <td><input type="number" min="0" step=".01" data-mo="ads" data-id="${r.p.id}" value="${r.adsUnit||''}" placeholder="0,00"></td>
      <td data-c="rev">${fmtMoney(r.rev)}</td>
      <td data-c="comm">${fmtMoney(r.comm)}</td>
      <td data-c="frete">${fmtMoney(r.frete)}</td>
      <td data-c="tax">${fmtMoney(r.tax)}</td>
      <td data-c="cost">${fmtMoney(r.cost)}</td>
      <td data-c="ads">${fmtMoney(r.ads)}</td>
      <td data-c="profit" class="${r.profit>=0?'pos':'neg'}">${fmtMoney(r.profit)}</td>
      <td data-c="margin">${fmtPct(r.margin)}</td>
    </tr>`;
  }
  tb.innerHTML=head+'<tbody>'+body+'</tbody><tfoot>'+monthlyFootHTML(rows)+'</tfoot>';
  tb.querySelectorAll('input[data-mo]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const id=inp.dataset.id;
      monthlyCache[id]=monthlyCache[id]||{};
      monthlyCache[id][inp.dataset.mo]=inp.value===''?0:+inp.value;
      updateMonthly();
      scheduleMonthlySave(id);
    });
  });
  renderMonthlyKpis(rows);
}

function monthlyTotals(rows){
  return rows.reduce((a,r)=>({units:a.units+r.units,rev:a.rev+r.rev,comm:a.comm+r.comm,frete:a.frete+r.frete,tax:a.tax+r.tax,cost:a.cost+r.cost,ads:a.ads+r.ads,profit:a.profit+r.profit}),{units:0,rev:0,comm:0,frete:0,tax:0,cost:0,ads:0,profit:0});
}

function monthlyFootHTML(rows){
  const t=monthlyTotals(rows);
  const margin=t.rev>0?t.profit/t.rev:NaN;
  return`<tr class="mo-total"><td>TOTAL</td><td></td><td data-t="units">${fmtInt(t.units)}</td><td></td><td></td><td data-t="rev">${fmtMoney(t.rev)}</td><td data-t="comm">${fmtMoney(t.comm)}</td><td data-t="frete">${fmtMoney(t.frete)}</td><td data-t="tax">${fmtMoney(t.tax)}</td><td data-t="cost">${fmtMoney(t.cost)}</td><td data-t="ads">${fmtMoney(t.ads)}</td><td data-t="profit" class="${t.profit>=0?'pos':'neg'}">${fmtMoney(t.profit)}</td><td data-t="margin">${fmtPct(margin)}</td></tr>`;
}

function updateMonthly(){
  const tb=el('monthlyTable'),rows=monthlyRowsData();
  for(const r of rows){
    const tr=tb.querySelector(`tr[data-mid="${r.p.id}"]`);if(!tr)continue;
    const set=(c,v)=>{const td=tr.querySelector(`td[data-c="${c}"]`);if(td)td.textContent=v};
    set('rev',fmtMoney(r.rev));set('comm',fmtMoney(r.comm));set('frete',fmtMoney(r.frete));set('tax',fmtMoney(r.tax));set('cost',fmtMoney(r.cost));set('ads',fmtMoney(r.ads));
    const pt=tr.querySelector('td[data-c="profit"]');if(pt){pt.textContent=fmtMoney(r.profit);pt.className=r.profit>=0?'pos':'neg'}
    set('margin',fmtPct(r.margin));
  }
  const foot=tb.querySelector('tfoot');if(foot)foot.innerHTML=monthlyFootHTML(rows);
  renderMonthlyKpis(rows);
}

function renderMonthlyKpis(rows){
  const t=monthlyTotals(rows);
  const sku=rows.filter(r=>r.units>0).length,margin=t.rev>0?t.profit/t.rev:NaN;
  const gerais=+monthlyExpenses||0,liquido=t.profit-gerais;
  // ACOS/TACOS vêm do resumo consolidado (mesmos números da aba Performance)
  const uid=curUserId(),summary=uid?AdsSummary.get(uid,curPlatform(),curMonth()):null;
  const spend=summary?summary.ads_spend:0,revTotal=summary?summary.revenue_total:0,revAds=summary?summary.revenue_ads:0;
  const acos=calcAcos(spend,revAds),tacos=calcTacos(spend,revTotal);
  el('monthlyKpis').innerHTML=
    kpi('Faturamento do mês',fmtMoney(t.rev),platformName()+' · '+monthLabel(curMonth()))+
    kpi('Gasto com Ads (por venda)',fmtMoney(t.ads),t.rev>0?fmtPct(t.ads/t.rev)+' do faturamento':'Somatório da coluna')+
    kpi('Lucro do marketplace',fmtMoney(t.profit),'Depois das taxas e dos Ads')+
    kpi('Gastos gerais do mês',fmtMoney(gerais),'Valor único do negócio')+
    kpi('Lucro líquido final',fmtMoney(liquido),liquido>=0?'Marketplace − gastos gerais':'Prejuízo no mês')+
    kpi('Margem do marketplace',fmtPct(margin),'Lucro ÷ faturamento')+
    kpi('Unidades vendidas',fmtInt(t.units),`${sku} produto(s) com venda`)+
    kpi('ACOS',fmtPct(acos),spend>0||revAds>0?'Gasto ÷ receita dos Ads':'Preencha na aba Avaliar Anúncio')+
    kpi('TACOS',fmtPct(tacos),spend>0||revTotal>0?'Gasto ÷ faturamento total':'Preencha na aba Avaliar Anúncio');
}

function showView(v){
  el('pricingView').classList.toggle('hidden',v!=='pricing');
  el('performanceView').classList.toggle('hidden',v!=='perf');
  el('monthlyView').classList.toggle('hidden',v!=='monthly');
  el('tabPricing').classList.toggle('active',v==='pricing');
  el('tabPerformance').classList.toggle('active',v==='perf');
  el('tabMonthly').classList.toggle('active',v==='monthly');
  if(v==='perf'){if(simState){populatePerfProducts();renderSimTable();renderSingleSale()}renderAdsSummary()}
  if(v==='monthly')renderMonthly();
}
el('tabPricing').onclick=()=>showView('pricing');
el('tabPerformance').onclick=()=>showView('perf');
el('tabMonthly').onclick=()=>showView('monthly');
// Trocar o mês recarrega os lançamentos daquele mês (os outros meses continuam salvos)
el('monthlyMonth').onchange=()=>{syncMonthInputs(el('monthlyMonth').value);monthlyLoadedFor=null;renderMonthly();renderAdsSummary()};
el('monthlyExpenses').oninput=()=>{
  monthlyExpenses=el('monthlyExpenses').value===''?0:+el('monthlyExpenses').value;
  const rows=monthlyRowsData();renderMonthlyKpis(rows);
  scheduleExpensesSave();
};
el('monthlyClear').onclick=async()=>{
  const uid=curUserId();if(!uid)return;
  const mo=curMonth();
  if(!confirm(`Zerar as vendas lançadas de ${platformName()} em ${monthLabel(mo)}?\n\nOs outros meses e marketplaces não são afetados.`))return;
  try{await supabaseClient.deleteMonthlySales(uid,curPlatform(),mo);monthlyCache={};monthlyLoadedFor=null;await renderMonthly()}
  catch(e){alert('Erro ao zerar: '+e.message)}
};
el('monthlyPrint').onclick=()=>window.print();
// Trocar de plataforma recalcula a venda, o fechamento mensal e o resumo Ads (todos por marketplace)
document.querySelectorAll('.platform-btn[data-platform]').forEach(b=>b.addEventListener('click',()=>{
  if(simState){renderSimTable();renderSingleSale()}
  if(!el('monthlyView').classList.contains('hidden')){monthlyLoadedFor=null;renderMonthly()}
  if(!el('performanceView').classList.contains('hidden'))renderAdsSummary();
}));
})();
