'use strict';
// ---------- MÓDULO DESPESAS ----------
// Despesas operacionais detalhadas (expense_entries). Módulo INDEPENDENTE:
// não lê nem escreve em monthly_expenses, então não existe dupla contagem com o
// Financeiro/Dashboard nesta etapa. Ver sql/despesas_detalhadas.sql para o caminho
// de integração futura (escolher UMA fonte única de "gastos gerais").
(function(){
const el=x=>document.getElementById(x);
const S=()=>window.PainelShared||{};
const fmtMoney=v=>S().fmtMoney?S().fmtMoney(v):('R$ '+(+v||0).toFixed(2));
const esc=s=>S().esc?S().esc(s):String(s??'');
const kpi=(l,v,s)=>S().kpi?S().kpi(l,v,s):'';

// Categorias iniciais. Estrutura pronta para categorias personalizadas: basta
// concatenar as do usuário aqui (ex.: vindas de um cadastro próprio no futuro).
const CATEGORIAS=['Colaboradores','Água','Energia','Internet','Aluguel','Impostos',
                  'Fretes','Marketing','Ferramentas','Assinaturas','Serviços','Outras'];
function categorias(){
  const extras=lista().map(d=>d.category).filter(c=>c&&!CATEGORIAS.includes(c));
  return CATEGORIAS.concat([...new Set(extras)].sort());
}

let itens=[],carregado=false,carregando=false,salvando=false,editandoId='';

function uid(){try{return currentUser&&currentUser.id}catch(e){return null}}
function lista(){return Array.isArray(itens)?itens:[]}

// ---------- datas LOCAIS (sem parse UTC, que pula um dia) ----------
const pad=n=>String(n).padStart(2,'0');
const hojeISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const brData=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
// "Vencida" é DERIVADO (pendente + vencimento no passado) — não é status no banco
const vencida=d=>d.status==='pending'&&d.due_date<hojeISO();
const situacao=d=>d.status==='paid'?'paid':(vencida(d)?'overdue':'pending');
const ROTULO={paid:'Paga',pending:'Pendente',overdue:'Vencida'};
const CLASSE={paid:'good',pending:'warn',overdue:'bad'};

function msg(txt,kind){
  const e=el('dpMsg');if(!e)return;
  e.textContent=txt||' ';
  e.style.color=kind==='bad'?'var(--bad)':kind==='good'?'var(--good)':kind==='warn'?'var(--warn)':'';
}
function formStatus(kind,txt){const e=el('dpFormStatus');if(!e)return;e.className='status '+kind;e.textContent=txt}

// ---------- carga (1 consulta) ----------
async function ensureLoaded(force){
  const u=uid();if(!u)return false;
  if(carregado&&!force)return true;
  if(carregando)return carregado;
  carregando=true;
  try{
    // período amplo: filtramos no cliente (a lista de despesas é pequena)
    itens=await supabaseClient.getExpenses(u)||[];
    carregado=true;
    return true;
  }finally{carregando=false}
}

// ---------- filtros ----------
function filtros(){
  return{
    q:(el('dpSearch').value||'').toLowerCase().trim(),
    de:el('dpFrom').value||'',
    ate:el('dpTo').value||'',
    cat:el('dpFilterCat').value||'',
    st:el('dpFilterStatus').value||''
  };
}
function filtrar(){
  const f=filtros();
  return lista().filter(d=>{
    if(f.q&&!String(d.description||'').toLowerCase().includes(f.q))return false;
    if(f.de&&d.due_date<f.de)return false;      // período usa o VENCIMENTO
    if(f.ate&&d.due_date>f.ate)return false;
    if(f.cat&&d.category!==f.cat)return false;
    if(f.st&&situacao(d)!==f.st)return false;   // "overdue" é derivado
    return true;
  }).sort((a,b)=>b.due_date.localeCompare(a.due_date));
}

function preencherSelects(){
  const cats=categorias();
  const c=el('dpCat'),fc=el('dpFilterCat');
  if(c){const keep=c.value;c.innerHTML=cats.map(x=>`<option>${esc(x)}</option>`).join('');if(keep)c.value=keep}
  if(fc){const keep=fc.value;fc.innerHTML='<option value="">Todas</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join('');if(keep)fc.value=keep}
}

// ---------- cards (respeitam os filtros) ----------
function renderKpis(rows){
  const tot=rows.reduce((a,d)=>a+(+d.amount||0),0);
  const pago=rows.filter(d=>d.status==='paid').reduce((a,d)=>a+(+d.amount||0),0);
  const pend=rows.filter(d=>situacao(d)==='pending').reduce((a,d)=>a+(+d.amount||0),0);
  const venc=rows.filter(d=>situacao(d)==='overdue').reduce((a,d)=>a+(+d.amount||0),0);
  el('dpKpis').innerHTML=
    kpi('Total de despesas',fmtMoney(tot),'Filtros aplicados')+
    kpi('Total pago',fmtMoney(pago),rows.filter(d=>d.status==='paid').length+' lançamento(s)')+
    kpi('Total pendente',fmtMoney(pend),'Dentro do prazo')+
    kpi('Total vencido',fmtMoney(venc),venc>0?'Regularizar':'Nada vencido')+
    kpi('Quantidade',String(rows.length),'Despesas no filtro');
}

// ---------- listagem: tabela no desktop, cartões no celular ----------
function renderLista(rows){
  const cnt=el('dpCount');
  if(cnt){cnt.className='status neutral';cnt.textContent=rows.length?rows.length+' de '+lista().length:'Nenhuma despesa'}
  const tb=el('dpTable'),cards=el('dpCards');
  if(!rows.length){
    const vazio=lista().length?'Nenhuma despesa encontrada com estes filtros.':'Nenhuma despesa cadastrada ainda. Use o formulário acima.';
    tb.innerHTML=`<tbody><tr><td style="padding:16px">${vazio}</td></tr></tbody>`;
    cards.innerHTML=`<p class="help">${vazio}</p>`;
    return;
  }
  const rec=d=>d.recurrence==='monthly'?'Mensal':'Não recorrente';
  tb.innerHTML='<thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Recorrência</th><th>Ações</th></tr></thead><tbody>'
    +rows.map(d=>{const s=situacao(d);return`<tr>
      <td class="mo-name">${esc(d.description)}${d.notes?`<small class="dp-note">${esc(d.notes)}</small>`:''}</td>
      <td>${esc(d.category)}</td>
      <td>${fmtMoney(+d.amount||0)}</td>
      <td>${brData(d.due_date)}</td>
      <td><span class="status ${CLASSE[s]}">${ROTULO[s]}</span>${d.status==='paid'&&d.paid_at?`<small class="dp-note">em ${brData(d.paid_at)}</small>`:''}</td>
      <td>${rec(d)}</td>
      <td class="dp-acts"><button class="btn small" data-edit="${d.id}">Editar</button><button class="btn small danger" data-del="${d.id}">Excluir</button></td>
    </tr>`}).join('')+'</tbody>';
  cards.innerHTML=rows.map(d=>{const s=situacao(d);return`<article class="dp-card ${s}">
      <div class="dp-card-top"><b>${esc(d.description)}</b><span class="status ${CLASSE[s]}">${ROTULO[s]}</span></div>
      <div class="dp-card-val">${fmtMoney(+d.amount||0)}</div>
      <div class="dp-card-meta"><span>${esc(d.category)}</span><span>Vence ${brData(d.due_date)}</span><span>${rec(d)}</span></div>
      ${d.status==='paid'&&d.paid_at?`<div class="dp-card-meta"><span>Pago em ${brData(d.paid_at)}</span></div>`:''}
      ${d.notes?`<p class="help">${esc(d.notes)}</p>`:''}
      <div class="dp-acts"><button class="btn small" data-edit="${d.id}">Editar</button><button class="btn small danger" data-del="${d.id}">Excluir</button></div>
    </article>`}).join('');
  document.querySelectorAll('#despesasView [data-edit]').forEach(b=>b.onclick=()=>editar(b.dataset.edit));
  document.querySelectorAll('#despesasView [data-del]').forEach(b=>b.onclick=()=>excluir(b.dataset.del));
}

function redraw(){
  const rows=filtrar();
  renderKpis(rows);
  renderLista(rows);
}

// ---------- formulário ----------
function limparForm(){
  editandoId='';
  ['dpDesc','dpAmount','dpDue','dpPaid','dpNotes'].forEach(id=>{const e=el(id);if(e)e.value=''});
  el('dpCat').selectedIndex=0;
  el('dpStatus').value='pending';
  el('dpRec').value='none';
  el('dpFormTitle').textContent='Nova despesa';
  el('dpCancel').hidden=true;
  el('dpSave').textContent='Salvar despesa';
  togglePago();
  formStatus('neutral','Preencha e salve');
}
function togglePago(){
  const pago=el('dpStatus').value==='paid';
  el('dpPaidField').classList.toggle('hidden',!pago);
  if(pago&&!el('dpPaid').value)el('dpPaid').value=hojeISO();
}
function editar(id){
  const d=lista().find(x=>x.id===id);if(!d)return;
  editandoId=id;
  el('dpDesc').value=d.description||'';
  el('dpCat').value=d.category||CATEGORIAS[0];
  el('dpAmount').value=+d.amount||'';
  el('dpDue').value=d.due_date||'';
  el('dpStatus').value=d.status||'pending';
  el('dpPaid').value=d.paid_at||'';
  el('dpRec').value=d.recurrence||'none';
  el('dpNotes').value=d.notes||'';
  togglePago();
  el('dpFormTitle').textContent='Editar despesa';
  el('dpCancel').hidden=false;
  el('dpSave').textContent='Salvar alterações';
  formStatus('warn','Editando lançamento');
  el('despesasView').scrollIntoView({behavior:'smooth',block:'start'});
}

function lerForm(){
  const desc=(el('dpDesc').value||'').trim();
  const cat=(el('dpCat').value||'').trim();
  const amount=money2(el('dpAmount').value); // dinheiro sempre com 2 casas
  const due=el('dpDue').value||'';
  const status=el('dpStatus').value==='paid'?'paid':'pending';
  const paid=el('dpPaid').value||'';
  if(!desc)throw new Error('Informe a descrição da despesa.');
  if(!cat)throw new Error('Escolha uma categoria.');
  if(!Number.isFinite(amount)||amount<=0)throw new Error('O valor precisa ser maior que zero.');
  if(!due)throw new Error('Informe a data de vencimento.');
  if(status==='paid'&&!paid)throw new Error('Despesa paga precisa da data do pagamento.');
  return{description:desc,category:cat,amount,due_date:due,status,
         paid_at:status==='paid'?paid:null,
         recurrence:el('dpRec').value==='monthly'?'monthly':'none',
         notes:(el('dpNotes').value||'').trim()||null};
}

async function salvar(){
  const u=uid();if(!u){alert('Faça login para salvar.');return}
  if(salvando)return;
  let dados;
  try{dados=lerForm()}
  catch(e){formStatus('bad','Confira os campos');msg(e.message,'bad');return}
  const btn=el('dpSave');
  salvando=true;btn.disabled=true;btn.textContent='Salvando...';formStatus('neutral','Salvando…');msg('');
  try{
    if(editandoId){
      const novo=await supabaseClient.updateExpense(editandoId,u,dados);
      itens=lista().map(x=>x.id===editandoId?Object.assign({},x,novo||dados,{id:editandoId}):x);
      msg('Despesa atualizada.','good');
    }else{
      const novo=await supabaseClient.createExpense(Object.assign({user_id:u},dados));
      itens=[novo].concat(lista());
      msg('Despesa cadastrada.','good');
    }
    limparForm();
    preencherSelects();
    redraw();   // filtros continuam como estavam — não são resetados ao salvar
    formStatus('good','Salvo');
    setTimeout(()=>{if(!editandoId)formStatus('neutral','Preencha e salve')},2200);
  }catch(e){
    console.error('Erro ao salvar despesa:',e);
    formStatus('bad','Não salvou');
    msg('Não foi possível salvar: '+e.message,'bad');
  }finally{
    salvando=false;btn.disabled=false;
    btn.textContent=editandoId?'Salvar alterações':'Salvar despesa';
  }
}

async function excluir(id){
  const u=uid();if(!u)return;
  const d=lista().find(x=>x.id===id);if(!d)return;
  if(!confirm(`Excluir a despesa "${d.description}" (${fmtMoney(+d.amount||0)})?\n\nEsta ação não pode ser desfeita.`))return;
  msg('Excluindo…');
  try{
    await supabaseClient.deleteExpense(id,u);
    itens=lista().filter(x=>x.id!==id);
    if(editandoId===id)limparForm();
    redraw();
    msg('Despesa excluída.','good');
  }catch(e){
    console.error('Erro ao excluir despesa:',e);
    msg('Não foi possível excluir: '+e.message,'bad');
  }
}

// ---------- render principal ----------
async function render(){
  preencherSelects();
  if(!uid()){
    el('dpKpis').innerHTML='';
    el('dpTable').innerHTML='<tbody><tr><td style="padding:16px">Faça login para ver suas despesas.</td></tr></tbody>';
    el('dpCards').innerHTML='<p class="help">Faça login para ver suas despesas.</p>';
    return;
  }
  if(!carregado){
    msg('Carregando…');
    el('dpTable').innerHTML='<tbody><tr><td style="padding:16px">Carregando…</td></tr></tbody>';
    try{await ensureLoaded()}
    catch(e){
      console.error('Erro ao carregar despesas:',e);
      msg('Não foi possível carregar: '+e.message+' — se falar em tabela inexistente, rode sql/despesas_detalhadas.sql no Supabase.','bad');
      el('dpTable').innerHTML='<tbody><tr><td style="padding:16px">Erro ao carregar as despesas.</td></tr></tbody>';
      return;
    }
    msg('');
  }
  preencherSelects();
  redraw();
}

// ---------- eventos ----------
function mesAtual(){
  const d=new Date();
  const ini=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-01';
  const fim=new Date(d.getFullYear(),d.getMonth()+1,0);
  el('dpFrom').value=ini;
  el('dpTo').value=fim.getFullYear()+'-'+pad(fim.getMonth()+1)+'-'+pad(fim.getDate());
  redraw();
}
function limparFiltros(){
  ['dpSearch','dpFrom','dpTo'].forEach(id=>{const e=el(id);if(e)e.value=''});
  el('dpFilterCat').value='';el('dpFilterStatus').value='';
  redraw();
}

if(el('dpSave'))el('dpSave').onclick=salvar;
if(el('dpCancel'))el('dpCancel').onclick=()=>{limparForm();msg('')};
if(el('dpStatus'))el('dpStatus').onchange=togglePago;
['dpSearch','dpFrom','dpTo'].forEach(id=>{const e=el(id);if(e)e.addEventListener('input',redraw)});
['dpFilterCat','dpFilterStatus'].forEach(id=>{const e=el(id);if(e)e.addEventListener('change',redraw)});
if(el('dpThisMonth'))el('dpThisMonth').onclick=mesAtual;
if(el('dpClear'))el('dpClear').onclick=limparFiltros;

window.renderDespesas=render;
// logout limpa o estado em memória (mesmo padrão dos outros módulos)
window.resetDespesas=()=>{itens=[];carregado=false;editandoId='';};
// exposto para teste e para a futura integração com o Financeiro
window.PainelDespesas={itens:()=>lista(),filtrar,situacao,
  totalPorMes(){const m={};lista().forEach(d=>{const k=(d.due_date||'').slice(0,7);if(k)m[k]=(m[k]||0)+(+d.amount||0)});return m}};
})();
