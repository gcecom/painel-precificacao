'use strict';

const DEFAULT_TAX=9.5;
const PLATFORMS={shopee:{name:'Shopee',brand:'#ee4d2d',ink:'#fff',accent:'#ee4d2d',commission:14,fixed:0,feeMode:'manual',tax:DEFAULT_TAX},magalu:{name:'Magalu',brand:'#0086ff',ink:'#fff',accent:'#0086ff',commission:16,fixed:0,feeMode:'manual',tax:DEFAULT_TAX},mercadolivre:{name:'Mercado Livre',brand:'#ffe600',ink:'#24324a',accent:'#3483fa',commission:12.5,fixed:0,feeMode:'classic',tax:DEFAULT_TAX},amazon:{name:'Amazon',brand:'#131921',ink:'#fff',accent:'#ff9900',commission:15,fixed:0,feeMode:'manual',tax:DEFAULT_TAX}};
const THEME_STORAGE='painel_tema_2026';let platform='mercadolivre',selectedId='',products=[],currentUser=null;let scenarioRows=[];let autoSaveTimeout=null,isSaving=false;

const money=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v):'—';
const pct=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(v):'—';
const n=v=>Math.max(0,Number(v)||0);
const id=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());

function categoryOf(name){let s=name.toLowerCase();if(s.includes('eletr')||s.includes('cerca')||s.includes('voltimetro'))return'Eletrificadores e cerca';if(s.includes('esterilizador'))return'Esterilizadores de ar';if(s.includes('ionizador')||s.includes('ozônio'))return'Tratamento de piscina e ar';if(s.includes('purificador'))return'Purificadores de ar';if(s.includes('fio'))return'Fios para cerca';if(s.includes('suporte'))return'Suportes';if(s.includes('repelente'))return'Repelentes';return'Componentes e outros'}

function channelDefaults(key){let x=PLATFORMS[key];return{price:0,discount:0,packaging:0,freight:0,returns:0,feeMode:x.feeMode,commission:x.commission,fixedFee:x.fixed,service:0,tax:x.tax,taxBase:'gross',unitFee:0,adsMode:'roas',adsValue:10,roasBase:'gross',targetMargin:10,purchaseMode:'amount',investment:10000,quantity:100,monthlySales:0,adsShare:100,monthlyFixed:0}}

const $=x=>document.getElementById(x);
const fieldIds=['name','sku','category','price','discount','cost','packaging','freight','returns','feeMode','commission','fixedFee','service','tax','taxBase','unitFee','adsMode','adsValue','roasBase','targetMargin','purchaseMode','investment','quantity','monthlySales','adsShare','monthlyFixed'];

function current(){return products.find(x=>x.id===selectedId)}
function currentChannel(p=current()){if(!p)return channelDefaults(platform);let c=p.channels?.[platform];return c||(p.channels=p.channels||{},p.channels[platform]=channelDefaults(platform))}

function effectiveCommission(c){return c.feeMode==='premium'?c.commission+5:c.commission}
function platformFees(c,price,net){let commission=net*effectiveCommission(c)/100,autoUnit=0,rule='Taxas informadas manualmente.';if(platform==='mercadolivre'){if(price>0&&price<12.5){autoUnit=price*.5;rule='Mercado Livre: abaixo de R$ 12,50, custo automático de 50% do item.'}else if(price<79){rule='Mercado Livre: de R$ 12,50 a R$ 78,99, informe logística por peso/dimensão no custo adicional.'}else rule='Mercado Livre: a partir de R$ 79, sem custo por unidade; informe o frete subsidiado do vendedor.'}else rule=`${PLATFORMS[platform].name}: use as taxas exatas do contrato/simulador; o painel não inventa uma tabela automática.`;return{commission,unit:autoUnit+c.unitFee,rule}}

function ads(c,base){let mode=c.adsMode,v=n(c.adsValue);if(mode==='roas')return{cpa:v>0?base/v:0,roas:v>0?v:Infinity,acos:v>0?1/v:0};if(mode==='cpa')return{cpa:v,roas:v>0?base/v:Infinity,acos:base>0?v/base:0};return{cpa:base*v/100,roas:v>0?100/v:Infinity,acos:v/100}}

function calcAt(p,c,price,roasOverride){let gross=n(price),net=gross*(1-n(c.discount)/100),fees=platformFees(c,gross,net),taxBase=c.taxBase==='net'?net:gross,tax=taxBase*n(c.tax)/100,service=net*n(c.service)/100,returns=net*n(c.returns)/100,base=c.roasBase==='net'?net:gross,a=roasOverride?{cpa:base/roasOverride,roas:roasOverride,acos:1/roasOverride}:ads(c,base),beforeAds=net-fees.commission-c.fixedFee-service-tax-fees.unit-p.cost-c.packaging-c.freight-returns,profit=beforeAds-a.cpa,margin=gross?profit/gross:NaN,roi=p.cost?profit/p.cost:NaN,cpaMax=beforeAds,roasMin=beforeAds>0?base/beforeAds:Infinity,acosMax=base>0?beforeAds/base:NaN;return{gross,net,...fees,tax,service,returns,base,...a,beforeAds,profit,margin,roi,cpaMax,roasMin,acosMax,platformTotal:fees.commission+c.fixedFee+service+fees.unit}}

function idealPrice(p,c,roas){if(p.cost<=0)return NaN;let lo=.01,hi=Math.max(c.price*2,p.cost*5,100);const target=Number(c.targetMargin)/100;for(let i=0;i<30&&calcAt(p,c,hi,roas).margin<target;i++)hi*=2;if(hi>1e7)return NaN;for(let i=0;i<80;i++){let mid=(lo+hi)/2;if(calcAt(p,c,mid,roas).margin>=target)hi=mid;else lo=mid}return Math.ceil(hi*100)/100}

// Precificação = simulação por canal. Nome/SKU/categoria/custo são do cadastro central
// (Produtos) e NÃO são reescritos aqui — só a precificação do canal (c[...]) é editada.
function readForm(){let p=current(),c=currentChannel(p);if(!p)return{p:null,c:null};for(let k of ['price','discount','packaging','freight','returns','commission','fixedFee','service','tax','unitFee','adsValue','targetMargin','investment','quantity','monthlySales','adsShare','monthlyFixed'])c[k]=n($(k).value);for(let k of ['feeMode','taxBase','adsMode','roasBase','purchaseMode'])c[k]=$(k).value;return{p,c}}

function writeForm(){let p=current(),c=currentChannel(p);if(!p){$('name').value='';return}$('name').value=p.name;$('sku').value=p.sku;$('category').value=p.category;$('cost').value=p.cost;
// Preço do canal já salvo tem prioridade; se ainda for 0, herda o "Preço de venda padrão" do cadastro (Produtos). Campo continua editável.
if(!(+c.price>0)&&+p.default_price>0)c.price=+p.default_price;
for(let k of ['price','discount','packaging','freight','returns','commission','fixedFee','service','tax','unitFee','adsValue','targetMargin','investment','quantity','monthlySales','adsShare','monthlyFixed'])$(k).value=c[k]??0;for(let k of ['feeMode','taxBase','adsMode','roasBase','purchaseMode'])$(k).value=c[k];syncLabels();renderAll()}

function syncLabels(){let mode=$('adsMode').value;$('adsValueLabel').textContent=mode==='roas'?'ROAS atual (x)':mode==='cpa'?'CPA atual (R$)':'ACOS atual (%)';let units=$('purchaseMode').value==='units';$('investmentField').classList.toggle('hidden',units);$('quantityField').classList.toggle('hidden',!units)}

function metric(label,value,sub=''){return`<article class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></article>`}

function diagnosis(p,c,r,ideal){if(r.gross<=0)return{level:'neutral',title:'Informe o preço de venda',text:'Cada plataforma precisa do seu próprio preço e das taxas reais.'};if(p.cost<=0)return{level:'warn',title:'Custo de compra pendente',text:'Corrija o custo antes de usar margem, ROI ou preço ideal.'};if(r.profit<0)return{level:'bad',title:'Venda no prejuízo',text:`Faltam ${money(Math.abs(r.profit))} por venda. O CPA máximo é ${money(r.cpaMax)}.`};if(r.margin<Number(c.targetMargin)/100)return{level:'warn',title:'Lucro abaixo da meta',text:`A venda lucra ${money(r.profit)}, mas a margem de ${pct(r.margin)} está abaixo da meta de ${Number(c.targetMargin).toLocaleString('pt-BR')}%.`};return{level:'good',title:'Meta de margem atingida',text:`A venda gera ${money(r.profit)} e supera a margem mínima definida.`}}

function renderSaleAccount(p,c,r){let marketplace=r.commission+c.fixedFee+r.service+r.unit,taxes=r.tax,others=c.packaging+c.freight+r.returns,steps=[['Receita da venda',r.net,''],['Produto',p.cost,'−'],['Taxas + impostos',marketplace+taxes,'−'],['Outros custos',others,'−'],['Anúncio por venda',r.cpa,'−'],[r.profit>=0?'Lucro por venda':'Prejuízo por venda',Math.abs(r.profit),'=']];$('saleEquation').innerHTML=steps.map((x,i)=>`${i?`<span class="operator">${x[2]}</span>`:''}<div class="sale-step ${i===steps.length-1?(r.profit>=0?'profit':'loss'):''}"><small>${x[0]}</small><b>${money(x[1])}</b></div>`).join('');let segments=[['Produto',p.cost,'#55677f'],[PLATFORMS[platform].name,marketplace,'#7656a8'],['Impostos',taxes,'#a66a42'],['Outros',others,'#8c7355'],['Anúncios',r.cpa,'#d97706'],[r.profit>=0?'Lucro':'Prejuízo',Math.abs(r.profit),r.profit>=0?'#178a4b':'#c52c2c']],total=segments.reduce((s,x)=>s+x[1],0)||1;$('saleStack').innerHTML=segments.filter(x=>x[1]>0).map(x=>`<div class="sale-segment" title="${x[0]}: ${money(x[1])}" style="width:${x[1]/total*100}%;background:${x[2]}"><span>${x[0]}</span><b>${money(x[1])}</b></div>`).join('')}

function renderAll(){let p=current(),c=currentChannel(p);if(!p)return;let r=calcAt(p,c,c.price),ideal=idealPrice(p,c,r.roas),d=diagnosis(p,c,r,ideal);$('pageTitle').textContent=`Painel de Precificação — ${PLATFORMS[platform].name}`;$('platformRule').innerHTML=`<b>Regra atual:</b> ${r.rule}<br>Comissão efetiva: <b>${effectiveCommission(c).toLocaleString('pt-BR')}%</b>. Confirme taxas antes de publicar.`;$('kpis').innerHTML=metric('Lucro por venda via Ads',money(r.profit),`CPA ${money(r.cpa)} · ROAS ${Number.isFinite(r.roas)?r.roas.toFixed(2)+'x':'—'}`)+metric('Margem líquida',pct(r.margin),`Meta ${Number(c.targetMargin).toLocaleString('pt-BR')}%`)+metric('CPA máximo',money(r.cpaMax),'Limite antes do prejuízo')+metric('ROAS mínimo',Number.isFinite(r.roasMin)?r.roasMin.toFixed(2)+'x':'—','Ponto de equilíbrio')+metric('Preço ideal',money(ideal),`Ajuste ${money(ideal-c.price)}`)+metric('ACOS atual',pct(r.acos),`Máximo ${pct(r.acosMax)}`)+metric('ROI produto',pct(r.roi),'Lucro ÷ custo do produto')+metric('Taxas da plataforma',money(r.platformTotal),`${c.price?pct(r.platformTotal/c.price):'—'} do preço`)+metric('Sobra antes dos Ads',money(r.beforeAds),'CPA máximo unitário')+metric('Receita após desconto',money(r.net),`Desconto ${c.discount}%`);$('mainStatus').className='status '+d.level;$('mainStatus').textContent=d.level==='good'?'Meta atingida':d.level==='bad'?'Prejuízo':d.level==='warn'?'Atenção':'Aguardando';$('diagnosis').className='diag '+(d.level==='bad'?'badbox':d.level==='warn'?'warnbox':'');$('diagnosis').innerHTML=`<h3>${d.title}</h3><p>${d.text}</p><p><b>Preço ideal:</b> ${money(ideal)}</p><p><b>Ajuste no preço:</b> ${money(ideal-c.price)}</p>`;let rows=[['Preço bruto',r.gross,'#17803d'],['Desconto',r.gross-r.net,'#d32f2f'],['Comissão',r.commission,'#d32f2f'],['Taxa fixa + adicional',c.fixedFee+r.service+r.unit,'#d32f2f'],['Imposto',r.tax,'#d32f2f'],['Produto + embalagem + frete',p.cost+c.packaging+c.freight,'#d32f2f'],['Reserva devoluções',r.returns,'#d32f2f'],['Sobra antes dos Ads',r.beforeAds,'#d69e00'],['CPA / Ads',r.cpa,'#d32f2f'],['Lucro líquido',r.profit,r.profit>=0?'#17803d':'#c52c2c']],max=Math.max(...rows.map(x=>Math.abs(x[1])),1);$('waterfall').innerHTML=rows.map(x=>`<div class="water-row"><span>${x[0]}</span><div class="track"><div class="fill" style="width:${Math.max(2,Math.abs(x[1])/max*100)}%;background:${x[2]}"></div></div><b>${money(x[1])}</b></div>`).join('');renderSaleAccount(p,c,r);renderBusiness(p,c,r);renderScenarios(p,c);renderCatalog()}

function renderBusiness(p,c,r){let unitCost=p.cost,units=unitCost>0?(c.purchaseMode==='units'?Math.floor(c.quantity):Math.floor(c.investment/unitCost)):0,used=units*unitCost,balance=c.purchaseMode==='units'?0:Math.max(0,c.investment-used),adsShare=Math.min(1,c.adsShare/100),mixed=r.beforeAds-r.cpa*adsShare,months=c.monthlySales?units/c.monthlySales:NaN,lotFixed=Number.isFinite(months)?months*c.monthlyFixed:0,lotProfit=units*mixed-lotFixed,roi=used?lotProfit/used:NaN,capital=used+lotProfit,paybackUnits=mixed>0?Math.ceil(used/mixed):NaN;$('purchaseResults').innerHTML=`<div class="result"><span>Unidades compradas</span><b>${units.toLocaleString('pt-BR')}</b></div><div class="result"><span>Capital usado</span><b>${money(used)}</b></div><div class="result"><span>Saldo disponível</span><b>${money(balance)}</b></div><div class="result"><span>Faturamento potencial</span><b>${money(units*r.gross)}</b></div><div class="result"><span>Lucro líquido do lote</span><b>${money(lotProfit)}</b></div><div class="result"><span>ROI do lote</span><b>${pct(roi)}</b></div><div class="result"><span>Capital recuperado</span><b>${money(capital)}</b></div><div class="result"><span>Vendas para payback</span><b>${Number.isFinite(paybackUnits)?paybackUnits:'—'}</b></div>`;let sales=Math.floor(c.monthlySales),revenue=sales*r.gross,adsSpend=sales*r.cpa*adsShare,profitBefore=sales*r.beforeAds-adsSpend,profit=profitBefore-c.monthlyFixed,margin=revenue?profit/revenue:NaN,paybackMonths=profit>0?used/profit:NaN;$('monthlyResults').innerHTML=`<div class="result"><span>Faturamento bruto</span><b>${money(revenue)}</b></div><div class="result"><span>Investimento Ads</span><b>${money(adsSpend)}</b></div><div class="result"><span>Lucro antes dos fixos</span><b>${money(profitBefore)}</b></div><div class="result"><span>Lucro mensal final</span><b>${money(profit)}</b></div><div class="result"><span>Margem mensal</span><b>${pct(margin)}</b></div><div class="result"><span>Payback do estoque</span><b>${Number.isFinite(paybackMonths)?paybackMonths.toFixed(1)+' meses':'—'}</b></div>`}

function scenarioValues(){let start=Math.max(.1,n($('roasStart').value)),end=Math.max(start,n($('roasEnd').value)),step=Math.max(.1,n($('roasStep').value)),a=[];for(let x=start;x<=end+.0001&&a.length<100;x+=step)a.push(Number(x.toFixed(4)));[5,10,20,30].forEach(x=>{if(x>=start&&x<=end&&!a.includes(x))a.push(x)});return a.sort((a,b)=>a-b)}

function renderScenarios(p,c){scenarioRows=scenarioValues().map(roas=>{let r=calcAt(p,c,c.price,roas),ideal=idealPrice(p,c,roas),d=diagnosis(p,c,r,ideal);return{roas,...r,ideal,adjust:ideal-c.price,d}});let current=calcAt(p,c,c.price).roas;$('scenarioBody').innerHTML=scenarioRows.map(x=>`<tr class="${Math.abs(x.roas-current)<.001?'highlight':''}"><td>ROAS ${x.roas.toLocaleString('pt-BR')}</td><td>${money(x.cpa)}</td><td>${pct(x.acos)}</td><td class="${x.profit>=0?'pos':'neg'}">${money(x.profit)}</td><td>${pct(x.margin)}</td><td>${pct(x.roi)}</td><td>${money(x.ideal)}</td><td>${money(x.adjust)}</td><td>${Number.isFinite(x.roasMin)?x.roasMin.toFixed(2)+'x':'—'}</td><td><span class="status ${x.d.level}">${x.d.title}</span></td></tr>`).join('')}

function renderSelectors(){let cats=[...new Set(products.map(x=>x.category))].sort();$('category').innerHTML=cats.map(x=>`<option>${x}</option>`).join('')+'<option>Outros</option>';$('catalogCategory').innerHTML='<option value="">Todas</option>'+cats.map(x=>`<option>${x}</option>`).join('');$('productSelect').innerHTML=products.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');$('productSelect').value=selectedId}

function renderCatalog(){let q=$('catalogSearch').value.toLowerCase(),cat=$('catalogCategory').value,list=products.filter(x=>(!q||(x.name+' '+x.sku).toLowerCase().includes(q))&&(!cat||x.category===cat));$('productCount').textContent=`${list.length} de ${products.length} produtos`;$('catalogBody').innerHTML=list.map(p=>{let c=currentChannel(p),r=calcAt(p,c,c.price);return`<tr><td>${p.name}</td><td>${p.sku||'<span class="status warn">Sem SKU</span>'}</td><td>${p.category}</td><td class="${p.cost>0?'':'neg'}">${p.cost>0?money(p.cost):'Pendente'}</td><td>${money(c.price)}</td><td class="${r.profit>=0?'pos':'neg'}">${money(r.profit)}</td><td>${pct(r.margin)}</td><td><button class="btn small" data-edit="${p.id}">Editar</button></td></tr>`}).join('');document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>selectProduct(b.dataset.edit))}

function selectProduct(v){selectedId=v;$('productSelect').value=v;writeForm()}

function setEditStatus(kind,text){$('editStatus').className='status '+kind;$('editStatus').textContent=text}

// manual=true (clique no botão Salvar) avisa em alerta se falhar; o auto-save só marca em vermelho.
async function save(manual){
  let{p}=readForm();
  if(!p)return false;
  if(!currentUser){if(manual)alert('Faça login para salvar.');return false}
  if(autoSaveTimeout){clearTimeout(autoSaveTimeout);autoSaveTimeout=null}
  // Defesa: sempre garantir que o user_id salvo é o do usuário logado (RLS bloquearia
  // qualquer outra coisa, mas assim erramos rápido em vez de dar 401 obscuro).
  p.user_id=currentUser.id;
  try{
    $('saveBtn').classList.add('loading');
    if(p.id.startsWith('new-')){p.id=id();await supabaseClient.createProduct(p)}
    else{await supabaseClient.updateProduct(p.id,p)}
    products=products.map(x=>x.id===p.id?p:x);
    renderSelectors();
    setEditStatus('good','Produto salvo ✓');
    setTimeout(()=>setEditStatus('neutral','Editando produto'),1500);
    return true;
  }catch(e){
    console.error('Erro ao salvar:',e);
    setEditStatus('bad','Não salvou — veja o erro');
    if(manual)alert('Não foi possível salvar o produto:\n\n'+e.message);
    return false;
  }finally{$('saveBtn').classList.remove('loading')}
}

function autoSave(){if(autoSaveTimeout)clearTimeout(autoSaveTimeout);if(isSaving)return;setEditStatus('neutral','Salvando...');autoSaveTimeout=setTimeout(async()=>{isSaving=true;try{await save(false)}catch(e){console.error('Auto-save error:',e)}finally{isSaving=false}},1500)}

// Atualiza TODOS os toggles na página (topbar + tela de login) via data-theme-choice,
// para o tema escolhido em um lugar refletir no outro sem duplicar lógica.
function setTheme(theme){theme=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem(THEME_STORAGE,theme)}catch{}document.querySelectorAll('[data-theme-choice]').forEach(b=>{let on=b.dataset.themeChoice===theme;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))})}

function applyTheme(){let x=PLATFORMS[platform];document.documentElement.dataset.platform=platform;document.documentElement.style.setProperty('--brand',x.brand);document.documentElement.style.setProperty('--brand-ink',x.ink);document.documentElement.style.setProperty('--accent',x.accent);document.querySelectorAll('.platform-btn').forEach(b=>b.classList.toggle('active',b.dataset.platform===platform));writeForm()}

// Se a leitura falhar (token expirado, rede, RLS), NÃO trate como "catálogo vazio":
// criar o produto inicial por cima nesse caso faria o painel parecer que perdeu tudo.
async function loadProducts(){
  if(!currentUser)return;
  let list;
  try{list=await supabaseClient.getProducts(currentUser.id)}
  catch(e){
    console.error('Erro ao carregar produtos:',e);
    $('editStatus').className='status bad';
    $('editStatus').textContent='Erro ao carregar';
    alert('Não foi possível carregar seus produtos:\n'+e.message+'\n\nNada foi apagado — recarregue a página para tentar de novo.');
    return;
  }
  products=list||[];
  if(products.length===0){
    products=[{id:id(),name:'Meu primeiro produto',sku:'',cost:0,category:'Outros',user_id:currentUser.id,channels:Object.fromEntries(Object.keys(PLATFORMS).map(k=>[k,channelDefaults(k)]))}];
    try{await supabaseClient.createProduct(products[0])}catch(e){console.error('Erro ao criar produto inicial:',e)}
  }
  selectedId=products[0]?.id||'';
  renderSelectors();
  writeForm();
}

function resetMonthlyState(){try{if(typeof window.resetMonthlyCache==='function')window.resetMonthlyCache()}catch(e){}}

async function initAuth(){let user=await supabaseClient.getCurrentUser();if(user){currentUser=user;if(typeof window.navSetUser==='function')window.navSetUser(user.email||'');$('loginModal').classList.add('hidden');resetMonthlyState();await loadProducts();$('logoutBtn').style.display='block'}else{currentUser=null;products=[];selectedId='';resetMonthlyState();if(typeof window.navSetUser==='function')window.navSetUser('');$('loginModal').classList.remove('hidden');$('logoutBtn').style.display='none'}}

// Se o token expirar/for revogado em qualquer requisição, volta pra tela de login em vez de continuar mostrando dados desatualizados
supabaseClient.onAuthExpired=()=>{currentUser=null;products=[];selectedId='';resetMonthlyState();$('loginModal').classList.remove('hidden');$('logoutBtn').style.display='none'};

// ---------- Recuperação de senha (sem depender do Dashboard do Supabase) ----------
function setAuthMsg(el,text,ok){el.textContent=text;el.style.display='block';el.style.background=ok?'var(--goodbg)':'var(--badbg)';el.style.color=ok?'var(--good)':'var(--bad)';el.style.borderLeftColor=ok?'var(--good)':'var(--bad)'}

function showRecoverForm(){$('loginForm').classList.add('hidden');$('loginFooterLinks').classList.add('hidden');$('recoverForm').classList.remove('hidden');$('recoverFooterLinks').classList.remove('hidden');$('recoverMsg').style.display='none'}
function showLoginForm(){$('recoverForm').classList.add('hidden');$('recoverFooterLinks').classList.add('hidden');$('loginForm').classList.remove('hidden');$('loginFooterLinks').classList.remove('hidden')}

let recoveryAccessToken=null;
function detectRecoveryLink(){
  let hash=window.location.hash.startsWith('#')?window.location.hash.slice(1):'';
  let params=new URLSearchParams(hash);
  if(params.get('type')==='recovery'&&params.get('access_token')){
    recoveryAccessToken=params.get('access_token');
    history.replaceState(null,'',window.location.pathname+window.location.search);
    $('loginModal').classList.remove('hidden');
    $('loginForm').classList.add('hidden');$('loginFooterLinks').classList.add('hidden');
    $('recoverForm').classList.add('hidden');$('recoverFooterLinks').classList.add('hidden');
    $('newPasswordForm').classList.remove('hidden');
    return true;
  }
  return false;
}

$('showRecover').onclick=()=>{$('recoverEmail').value=$('loginEmail').value;showRecoverForm()};
$('backToLogin').onclick=showLoginForm;

$('recoverBtn').onclick=async()=>{
  let email=$('recoverEmail').value,msg=$('recoverMsg');
  msg.style.display='none';
  if(!email){setAuthMsg(msg,'⚠️  Digite seu email',false);return}
  try{
    $('recoverBtn').classList.add('loading');
    await supabaseClient.recover(email);
    setAuthMsg(msg,'✅ Se o email existir, enviamos um link de recuperação. Confira sua caixa de entrada.',true);
  }catch(e){
    setAuthMsg(msg,'❌ '+e.message,false);
  }finally{
    $('recoverBtn').classList.remove('loading');
  }
};

$('newPasswordBtn').onclick=async()=>{
  let p1=$('newPassword1').value,p2=$('newPassword2').value,msg=$('newPasswordMsg');
  msg.style.display='none';
  if(!p1||p1.length<6){setAuthMsg(msg,'⚠️  A senha precisa ter ao menos 6 caracteres',false);return}
  if(p1!==p2){setAuthMsg(msg,'⚠️  As senhas não coincidem',false);return}
  if(!recoveryAccessToken){setAuthMsg(msg,'❌ Link de recuperação inválido ou expirado. Peça um novo.',false);return}
  try{
    $('newPasswordBtn').classList.add('loading');
    await supabaseClient.updateUserPassword(recoveryAccessToken,p1);
    setAuthMsg(msg,'✅ Senha alterada! Faça login com a nova senha.',true);
    recoveryAccessToken=null;
    setTimeout(()=>{$('newPasswordForm').classList.add('hidden');showLoginForm();$('newPassword1').value='';$('newPassword2').value=''},1600);
  }catch(e){
    setAuthMsg(msg,'❌ '+e.message,false);
  }finally{
    $('newPasswordBtn').classList.remove('loading');
  }
};

$('loginBtn').onclick=async()=>{let email=$('loginEmail').value,pass=$('loginPassword').value,errEl=$('loginError');errEl.style.display='none';errEl.textContent='';if(!email){errEl.textContent='⚠️  Por favor, digite seu email';errEl.style.display='block';return}if(!pass){errEl.textContent='⚠️  Por favor, digite sua senha';errEl.style.display='block';return}try{$('loginBtn').classList.add('loading');let result=await supabaseClient.signIn(email,pass);if(result.error){errEl.textContent='❌ '+result.error.message;errEl.style.display='block';return}if(result.access_token){currentUser=result.user;await initAuth()}else{errEl.textContent='❌ Senha errada ou email não cadastrado';errEl.style.display='block'}}catch(e){let msg=e.message.toLowerCase();if(msg.includes('invalid')||msg.includes('incorrect'))errEl.textContent='❌ Senha errada! Verifique e tente novamente';else if(msg.includes('user')||msg.includes('not found'))errEl.textContent='❌ Email não encontrado. Crie uma conta primeiro';else errEl.textContent='❌ '+e.message;errEl.style.display='block'}finally{$('loginBtn').classList.remove('loading')}};

$('logoutBtn').onclick=async()=>{await supabaseClient.signOut();currentUser=null;products=[];selectedId='';await initAuth()};

document.querySelectorAll('[data-theme-choice="light"]').forEach(b=>b.onclick=()=>setTheme('light'));
document.querySelectorAll('[data-theme-choice="dark"]').forEach(b=>b.onclick=()=>setTheme('dark'));
setTheme(document.documentElement.dataset.theme);

fieldIds.forEach(k=>{let e=$(k);if(e)e.addEventListener('input',()=>{readForm();syncLabels();renderAll();autoSave()})});

$('productSelect').onchange=e=>selectProduct(e.target.value);
$('saveBtn').onclick=()=>save(true);
$('newBtn').onclick=()=>{let p={id:'new-'+id(),name:'Novo produto',sku:'',cost:0,category:'Outros',user_id:currentUser?.id,channels:Object.fromEntries(Object.keys(PLATFORMS).map(k=>[k,channelDefaults(k)]))};products.unshift(p);selectedId=p.id;renderSelectors();writeForm()};

$('duplicateBtn').onclick=()=>{let p=structuredClone(current());p.id='new-'+id();p.name+=' (cópia)';products.unshift(p);selectedId=p.id;renderSelectors();writeForm()};

$('deleteBtn').onclick=()=>{if(products.length<=1)return alert('Mantenha ao menos um produto.');if(confirm('Excluir este produto?')){supabaseClient.deleteProduct(selectedId);products=products.filter(x=>x.id!==selectedId);selectedId=products[0].id;renderSelectors();writeForm()}};

$('printBtn').onclick=()=>window.print();
$('updateScenarios').onclick=()=>renderAll();
document.querySelectorAll('[data-roas]').forEach(b=>b.onclick=()=>{$('adsMode').value='roas';$('adsValue').value=b.dataset.roas;readForm();syncLabels();renderAll()});
document.querySelectorAll('.platform-btn').forEach(b=>b.onclick=()=>{platform=b.dataset.platform;applyTheme()});
$('catalogSearch').oninput=renderCatalog;
$('catalogCategory').onchange=renderCatalog;

$('exportBtn').onclick=()=>download(`painel-precificacao-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),products},null,2),'application/json');

$('importBtn').onclick=()=>$('importFile').click();
// Importa produtos de um JSON de backup. IMPORTANTE: reatribui user_id ao usuário logado
// e força id novo (com prefixo new-) para o próximo save gravar no banco como registro dele.
// Isso protege contra tentar importar um backup de outra conta e vazar dados/gravar em nome alheio.
$('importFile').onchange=async e=>{
  if(!currentUser){alert('Faça login antes de importar.');return}
  try{
    let j=JSON.parse(await e.target.files[0].text());
    if(!Array.isArray(j.products)||!j.products.length)throw 0;
    products=j.products.map(p=>Object.assign({},p,{id:'new-'+id(),user_id:currentUser.id}));
    selectedId=products[0].id;
    renderSelectors();writeForm();
    alert(`${products.length} produto(s) importado(s) para a sua conta. Clique em Salvar em cada um para gravar no banco.`);
  }catch{alert('Arquivo de dados inválido.')}
};

$('exportRoas').onclick=()=>{let rows=[['Cenário','CPA','ACOS %','Lucro por venda','Margem %','ROI produto %','Preço ideal','Ajuste no preço','ROAS mínimo'],...scenarioRows.map(x=>[x.roas,x.cpa,x.acos*100,x.profit,x.margin*100,x.roi*100,x.ideal,x.adjust,x.roasMin])];download(`cenarios-roas-${platform}.csv`,rows.map(r=>r.map(v=>`"${String(typeof v==='number'?(Number.isFinite(v)?v:''):v).replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8')};

function download(name,data,type){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

// Toggle de senha
let passwordToggle=$('passwordToggle');if(passwordToggle){passwordToggle.onclick=e=>{e.preventDefault();let input=$('loginPassword'),isPassword=input.type==='password';input.type=isPassword?'text':'password';let eye=passwordToggle.querySelector('.eye-icon'),eyeClosed=passwordToggle.querySelector('.eye-closed-icon');if(eye&&eyeClosed){eye.style.display=isPassword?'none':'block';eyeClosed.style.display=isPassword?'block':'none'}}}

// Enter para fazer login
$('loginPassword').onkeypress=e=>{if(e.key==='Enter')$('loginBtn').click()};
$('loginEmail').onkeypress=e=>{if(e.key==='Enter')$('loginPassword').focus()};

if(!detectRecoveryLink())initAuth();
