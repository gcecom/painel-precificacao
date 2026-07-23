'use strict';
(function(){
const el=x=>document.getElementById(x);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const fmtInt=v=>new Intl.NumberFormat('pt-BR').format(Math.round(v||0));
const fmtMoney=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v):'—';
const fmtPct=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(v):'—';
const toNum=v=>{if(typeof v==='number')return v;let s=String(v??'').trim();if(!s)return 0;s=s.replace(/r\$|\s|%/gi,'');if(s.includes(',')&&s.includes('.'))s=s.replaceAll('.','').replace(',','.');else if(s.includes(','))s=s.replace(',','.');let n=parseFloat(s);return Number.isFinite(n)?n:0};

const ADS_MAP={impressions:['impress'],clicks:['clique','click'],spend:['despesa','gasto','custo','investimento'],conversions:['convers','encomendas','pedidos'],revenue:['gmv','receita','valor de venda','vendas']};
const PROD_MAP={visits:['visitant','visitas','acessos'],pageviews:['visualizac'],carts:['carrinho'],orders:['pedidos','encomendas','unidades vendidas','compras'],revenue:['vendas','receita','gmv','faturamento']};

let adsData=null,prodData=null;

function parseCSVText(text){
  const firstLine=(text.slice(0,2000).split(/\r?\n/)[0])||'';
  const delim=((firstLine.match(/;/g)||[]).length>=(firstLine.match(/,/g)||[]).length)?';':',';
  const rows=[];let row=[],cur='',inQ=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(inQ){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else inQ=false}else cur+=ch}
    else if(ch==='"')inQ=true;
    else if(ch===delim){row.push(cur);cur=''}
    else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur=''}
    else if(ch!=='\r')cur+=ch}
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}

async function readFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    if(typeof XLSX==='undefined')throw new Error('Biblioteca XLSX não carregou — verifique a conexão e recarregue.');
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf);
    const ws=wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  }
  return parseCSVText(await file.text());
}

function findHeaderRow(rows,keywords){
  for(let i=0;i<Math.min(rows.length,12);i++){
    const h=rows[i].map(norm);
    const hits=h.filter(c=>keywords.some(k=>c.includes(k))).length;
    if(hits>=2)return i;
  }
  return 0;
}

function extract(rows,map){
  const hi=findHeaderRow(rows,Object.values(map).flat());
  const headers=(rows[hi]||[]).map(norm);
  const idx={};
  for(const key in map)idx[key]=headers.findIndex(h=>map[key].some(k=>h.includes(k)));
  const out={};for(const k in map)out[k]=0;
  let count=0;
  for(let i=hi+1;i<rows.length;i++){const r=rows[i];if(!r)continue;let used=false;
    for(const k in idx)if(idx[k]>=0){out[k]+=toNum(r[idx[k]]);used=true}
    if(used)count++}
  out._rows=count;
  out._missing=Object.keys(map).filter(k=>idx[k]<0);
  return out;
}

const kpi=(label,value,sub)=>`<article class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub||''}</div></article>`;

function renderAds(){
  if(!adsData)return;
  const a=adsData,ctr=a.impressions>0?a.clicks/a.impressions:NaN,cvr=a.clicks>0?a.conversions/a.clicks:NaN,
    roas=a.spend>0?a.revenue/a.spend:NaN,acos=a.revenue>0?a.spend/a.revenue:NaN,
    cpc=a.clicks>0?a.spend/a.clicks:NaN,cpa=a.conversions>0?a.spend/a.conversions:NaN;
  el('adsKpis').innerHTML=
    kpi('Impressões',fmtInt(a.impressions),`${a._rows} linhas lidas`)+
    kpi('Cliques',fmtInt(a.clicks),'')+
    kpi('CTR',fmtPct(ctr),'Cliques ÷ impressões')+
    kpi('Gasto em Ads',fmtMoney(a.spend),'')+
    kpi('Conversões',fmtInt(a.conversions),'')+
    kpi('Conversão do anúncio',fmtPct(cvr),'Conversões ÷ cliques')+
    kpi('GMV (receita Ads)',fmtMoney(a.revenue),'')+
    kpi('ROAS',Number.isFinite(roas)?roas.toFixed(2)+'x':'—','Receita ÷ gasto')+
    kpi('ACOS',fmtPct(acos),'Gasto ÷ receita')+
    kpi('CPC / CPA',`${fmtMoney(cpc)} · ${fmtMoney(cpa)}`,'Custo por clique · por conversão');
}

function renderProd(){
  if(!prodData)return;
  const p=prodData,cartRate=p.visits>0?p.carts/p.visits:NaN,conv=p.visits>0?p.orders/p.visits:NaN,
    checkout=p.carts>0?p.orders/p.carts:NaN,ticket=p.orders>0?p.revenue/p.orders:NaN;
  el('prodKpis').innerHTML=
    kpi('Visitas',fmtInt(p.visits),`${p._rows} linhas lidas`)+
    kpi('Visualizações',fmtInt(p.pageviews),'')+
    kpi('Carrinhos',fmtInt(p.carts),'')+
    kpi('Taxa de carrinho',fmtPct(cartRate),'Carrinhos ÷ visitas')+
    kpi('Pedidos',fmtInt(p.orders),'')+
    kpi('Conversão do produto',fmtPct(conv),'Pedidos ÷ visitas')+
    kpi('Carrinho → pedido',fmtPct(checkout),'Fechamento do carrinho')+
    kpi('Vendas',fmtMoney(p.revenue),'')+
    kpi('Ticket médio',fmtMoney(ticket),'Vendas ÷ pedidos');
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
    const p=prodData,cartRate=p.visits>0?p.carts/p.visits:NaN,conv=p.visits>0?p.orders/p.visits:NaN,checkout=p.carts>0?p.orders/p.carts:NaN;
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
    if(Number.isFinite(share)&&share>0.7)d.push(['warn','Dependência de Ads',`${fmtPct(share)} dos pedidos vêm de anúncios. Fortaleça o orgânico: SEO do título, avaliações e participação em campanhas da plataforma.`]);
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

async function handleFile(input,statusEl,map,assign){
  const file=input.files[0];if(!file)return;
  statusEl.textContent='Lendo '+file.name+'...';
  try{
    const rows=await readFile(file);
    const data=extract(rows,map);
    if(data._rows===0)throw new Error('Nenhuma linha de dados reconhecida. Confira o arquivo.');
    assign(data);
    statusEl.innerHTML=`<span class="file-ok">✓ ${file.name}</span> — ${data._rows} linhas processadas`;
    renderAds();renderProd();renderDiagnostics();
  }catch(e){statusEl.innerHTML=`<span style="color:var(--bad);font-weight:800">✗ ${e.message}</span>`}
  input.value='';
}

el('adsFileBtn').onclick=()=>el('adsFile').click();
el('prodFileBtn').onclick=()=>el('prodFile').click();
el('adsFile').onchange=()=>handleFile(el('adsFile'),el('adsFileStatus'),ADS_MAP,d=>adsData=d);
el('prodFile').onchange=()=>handleFile(el('prodFile'),el('prodFileStatus'),PROD_MAP,d=>prodData=d);

function showView(v){
  el('pricingView').classList.toggle('hidden',v!=='pricing');
  el('performanceView').classList.toggle('hidden',v!=='perf');
  el('tabPricing').classList.toggle('active',v==='pricing');
  el('tabPerformance').classList.toggle('active',v==='perf');
}
el('tabPricing').onclick=()=>showView('pricing');
el('tabPerformance').onclick=()=>showView('perf');
})();
