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

const META_WANT={
  produto:['nome do produto / anuncio','nome do produto/anuncio','nome do produto','produto'],
  id:['id do produto','id do item','id do anuncio'],
  campanha:['metodo de lance','nome da campanha','campanha','tipo de campanha'],
  loja:['nome da loja','loja'],
  idLoja:['id da loja'],
  periodo:['periodo'],
  data:['data de criacao do relatorio']
};

// Extrai identificação: pares rótulo/valor (Ads) e colunas Produto/ID (produto)
function extractMeta(sheets,map){
  const meta={};
  for(const rows of sheets){
    for(const r of rows){
      if(!r)continue;
      const cells=r.map(c=>String(c).trim());
      const nn=cells.map(norm);
      for(const key in META_WANT){
        if(meta[key])continue;
        const i=nn.findIndex(c=>META_WANT[key].some(k=>c===k||c.startsWith(k+' ')||c===k.replace(/ /g,'')));
        if(i>=0){
          const val=cells.slice(i+1).find(c=>c!==''&&norm(c)!==nn[i]);
          if(val)meta[key]=val;
        }
      }
    }
    // Colunas Produto / ID (relatório do produto)
    for(const sec of splitSections(rows,['produto','id do item','impress'])){
      const pi=sec.header.findIndex(h=>h.includes('produto')&&!h.includes('id'));
      const ii=sec.header.findIndex(h=>h.includes('id do item')||h.includes('id do produto'));
      const row=sec.data.find(r=>r&&r.some(c=>String(c).trim()!==''));
      if(row){
        if(!meta.produto&&pi>=0&&String(row[pi]||'').trim())meta.produto=String(row[pi]).trim();
        if(!meta.id&&ii>=0&&String(row[ii]||'').trim())meta.id=String(row[ii]).trim();
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

// ---------- SIMULADOR DE CENÁRIOS ----------
const SIM_FIELDS=[
  {k:'impressions',label:'Impressões',step:'1',hint:'Quantas vezes o anúncio apareceu'},
  {k:'ctr',label:'CTR (%)',step:'.01',hint:'Cliques ÷ impressões'},
  {k:'convRate',label:'Taxa de conversão (%)',step:'.01',hint:'Vendas ÷ cliques'},
  {k:'unitPrice',label:'Preço de venda unitário (R$)',step:'.01',hint:'Valor de cada venda'},
  {k:'spend',label:'Gasto em Ads (R$)',step:'.01',hint:'Investimento em anúncios'},
  {k:'cost',label:'Custo do produto (R$)',step:'.01',hint:'Custo de compra por unidade (opcional)'}
];

function buildSimBase(){
  const a=adsData,p=prodData;
  let impressions=0,clicks=0,spend=0,conversions=0,revenue=0,unitPrice=0;
  if(a){impressions=a.impressions;clicks=a.clicks;spend=a.spend;conversions=a.conversions;revenue=a.revenue}
  if(unitPrice<=0&&a&&a.conversions>0)unitPrice=a.revenue/a.conversions;
  if(unitPrice<=0&&p&&p.orders>0)unitPrice=p.revenue/p.orders;
  const ctr=impressions>0?clicks/impressions*100:0;
  const convRate=clicks>0?conversions/clicks*100:0;
  return{impressions,ctr:+ctr.toFixed(2),convRate:+convRate.toFixed(2),unitPrice:+unitPrice.toFixed(2),spend:+spend.toFixed(2),cost:0};
}

function simCompute(s){
  const clicks=s.impressions*s.ctr/100;
  const conversions=clicks*s.convRate/100;
  const revenue=conversions*s.unitPrice;
  const roas=s.spend>0?revenue/s.spend:NaN;
  const acos=revenue>0?s.spend/revenue:NaN;
  const cpc=clicks>0?s.spend/clicks:NaN;
  const cpa=conversions>0?s.spend/conversions:NaN;
  const profit=revenue-s.spend-s.cost*conversions;
  const margin=revenue>0?profit/revenue:NaN;
  return{clicks,conversions,revenue,roas,acos,cpc,cpa,profit,margin};
}

function renderSimInputs(){
  el('simInputs').innerHTML=SIM_FIELDS.map(f=>`<div class="field"><label>${f.label}</label><input type="number" min="0" step="${f.step}" data-sim="${f.k}" value="${simState[f.k]}"><div class="help">${f.hint}</div></div>`).join('');
  el('simInputs').querySelectorAll('input[data-sim]').forEach(inp=>{
    inp.addEventListener('input',()=>{simState[inp.dataset.sim]=Number(inp.value)||0;renderSimOutputs()});
  });
}

const simResult=(label,val,base,fmt,goodUp)=>{
  let delta='';
  if(base!==undefined&&Number.isFinite(val)&&Number.isFinite(base)){
    const diff=val-base;
    if(Math.abs(diff)>1e-9){
      const up=diff>0,good=goodUp===undefined?null:(up===goodUp);
      const cls=good===null?'':(good?'pos':'neg');
      delta=`<span class="sim-delta ${cls}">${up?'▲':'▼'} ${fmt(Math.abs(diff))}</span>`;
    }
  }
  return`<div class="result"><span>${label}</span><b>${Number.isFinite(val)?fmt(val):'—'}</b>${delta}</div>`;
};

function renderSimOutputs(){
  const cur=simCompute(simState),base=simCompute(simBase);
  const roasFmt=v=>v.toFixed(2)+'x';
  el('simOutputs').innerHTML=
    simResult('Cliques',cur.clicks,base.clicks,fmtInt,true)+
    simResult('Vendas (conversões)',cur.conversions,base.conversions,fmtInt,true)+
    simResult('Receita (GMV)',cur.revenue,base.revenue,fmtMoney,true)+
    simResult('ROAS',cur.roas,base.roas,roasFmt,true)+
    simResult('ACOS',cur.acos,base.acos,fmtPct,false)+
    simResult('CPC',cur.cpc,base.cpc,fmtMoney,false)+
    simResult('CPA',cur.cpa,base.cpa,fmtMoney,false)+
    simResult('Lucro estimado',cur.profit,base.profit,fmtMoney,true)+
    simResult('Margem',cur.margin,base.margin,fmtPct,true);
}

function buildSimulator(){
  if(!adsData&&!prodData){el('simPanel').style.display='none';return}
  el('simPanel').style.display='';
  simBase=buildSimBase();
  simState=Object.assign({},simBase);
  renderSimInputs();renderSimOutputs();
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
  }catch(e){statusEl.innerHTML=`<span style="color:var(--bad);font-weight:800">✗ ${e.message}</span>`}
  input.value='';
}

el('adsFileBtn').onclick=()=>el('adsFile').click();
el('prodFileBtn').onclick=()=>el('prodFile').click();
el('adsFile').onchange=()=>handleFile(el('adsFile'),el('adsFileStatus'),ADS_MAP,d=>adsData=d,'ads');
el('prodFile').onchange=()=>handleFile(el('prodFile'),el('prodFileStatus'),PROD_MAP,d=>prodData=d,'prod');
el('simReset').onclick=()=>{if(simBase){simState=Object.assign({},simBase);renderSimInputs();renderSimOutputs()}};

function showView(v){
  el('pricingView').classList.toggle('hidden',v!=='pricing');
  el('performanceView').classList.toggle('hidden',v!=='perf');
  el('tabPricing').classList.toggle('active',v==='pricing');
  el('tabPerformance').classList.toggle('active',v==='perf');
}
el('tabPricing').onclick=()=>showView('pricing');
el('tabPerformance').onclick=()=>showView('perf');
})();
