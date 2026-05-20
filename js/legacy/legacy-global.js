// ============================================================
// FLOW Mega Apps — Legacy globals (consolidated from
// Sales_Support_Apps_-_Revamp.html v21)
//
// Provides all global functions used by the inline `onclick=...`
// handlers inside the legacy module HTML (Merger, Order Processing /
// Transaction, Daily Reconcile, Weekly Report Generator).
//
// NOTE on coexistence with the modular app:
//   - The modular app navigates via `data-menu` attributes and event
//     listeners in app.js — it does NOT depend on `showMenu` here.
//   - The `showMenu` / `showSub` helpers below are used by inline
//     onclick handlers inside the legacy section HTML. They safely
//     toggle `.menu` / `.sub` / `.tabs button` siblings within their
//     respective host.
//   - All state (mergedExcelRows, inventoryRows, etc.) is module-
//     global on `window` because the inline onclicks need it.
// ============================================================

let mergedExcelRows=[], inventoryRows=[], screeningRows=[], sellerRows=[], curahRows=[];
let masterItemRows=[], screeningMasterRows=[], screeningMasterAoa=[];
let dimensiMasterRows=[], dimensiInboundRows=[], dimensiResultRows=[], dimensiResultAoa=[], dimensiMasterMap={};
let inventoryStockMap={}, masterItemMap={};
const $=id=>document.getElementById(id);
function showMenu(id,btn){document.querySelectorAll('.menu').forEach(x=>x.classList.add('hidden'));$(id).classList.remove('hidden');document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}
function showSub(id,btn){document.querySelectorAll('.sub').forEach(x=>x.classList.add('hidden'));$(id).classList.remove('hidden');document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}
function showMergeChild(id,btn,parentId){
  const root=parentId?$(parentId):btn.closest('.sub'); if(!root) return;
  root.querySelectorAll('.mergeChild').forEach(x=>x.classList.add('hidden'));
  const panel=$(id); if(panel) panel.classList.remove('hidden');
  const group=btn.closest('.mergeChildTabs'); if(group){group.querySelectorAll('button').forEach(x=>x.classList.remove('active')); btn.classList.add('active');}
}
function showOrderMain(id,btn){
  const root=$('orderProcessing'); if(!root) return;
  root.querySelectorAll('.orderMain').forEach(x=>x.classList.add('hidden'));
  const panel=$(id); if(panel) panel.classList.remove('hidden');
  const tabs=btn.closest('.transactionMainTabs'); if(tabs){tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active')); btn.classList.add('active');}
  const firstChild=panel?.querySelector('.orderChild');
  if(firstChild){
    panel.querySelectorAll('.orderChild').forEach(x=>x.classList.add('hidden'));
    firstChild.classList.remove('hidden');
    const childTabs=panel.querySelector('.orderChildTabs');
    if(childTabs){childTabs.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===0));}
  }
}
function showOrderChild(id,btn,parentId){
  const root=parentId?$(parentId):btn.closest('.orderMain'); if(!root) return;
  root.querySelectorAll('.orderChild').forEach(x=>x.classList.add('hidden'));
  const panel=$(id); if(panel) panel.classList.remove('hidden');
  const tabs=btn.closest('.orderChildTabs'); if(tabs){tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active')); btn.classList.add('active');}
}
let orderBatches=[];
function mergeOrders(){
  let arr=$('ordersInput').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
  let unique=new Set(arr);
  orderBatches=[];
  for(let i=0;i<arr.length;i+=120){orderBatches.push(arr.slice(i,i+120));}
  $('ordersCount').textContent=arr.length;
  $('ordersBatchCount').textContent=orderBatches.length;
  $('ordersDuplicate').textContent=arr.length-unique.size;
  $('ordersStatus').textContent=arr.length?'Done':'Ready';
  if(!arr.length){$('ordersOutput').innerHTML='';return;}
  $('ordersOutput').innerHTML=orderBatches.map((batch,i)=>`
    <div class="batchBox">
      <div class="batchHead"><b>Batch ${i+1}</b><span>${batch.length} orders</span></div>
      <pre id="ordersBatch_${i}">${batch.join(';')}</pre>
      <button class="secondary smallBtn" onclick="copyBatch(${i})">Copy Batch ${i+1}</button>
    </div>
  `).join('');
}
// v3.8: event delegation so this works regardless of when the textarea
// is injected into the DOM by legacy-loader.js. Original revamp script
// did `$('ordersInput').addEventListener(...)` at top level, which crashed
// because the element doesn't exist yet at script-load time.
document.addEventListener('input', function(e){
  if(e.target && e.target.id === 'ordersInput') mergeOrders();
});
function clearOrders(){$('ordersInput').value='';orderBatches=[];mergeOrders()}
function fallbackCopy(text){
  const ta=document.createElement('textarea');
  ta.value=text; ta.setAttribute('readonly','');
  ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.top='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok=false;
  try{ok=document.execCommand('copy')}catch(e){ok=false}
  document.body.removeChild(ta);
  return ok;
}
async function safeCopy(text){
  text=String(text||'');
  if(navigator.clipboard && window.isSecureContext){
    try{await navigator.clipboard.writeText(text);return true}catch(e){}
  }
  return fallbackCopy(text);
}
async function copyBatch(i){
  const text=(orderBatches[i]||[]).join(getOrderSeparator());
  const ok=await safeCopy(text);
  alert(ok?'Batch '+(i+1)+' berhasil dicopy':'Copy gagal. Blok teks batch lalu tekan Ctrl+C.');
}
async function copyAllBatches(){
  let text=orderBatches.map((b,i)=>`Batch ${i+1}:\n${b.join(getOrderSeparator())}`).join('\n\n');
  const ok=await safeCopy(text||'');
  alert(ok?'Semua batch berhasil dicopy':'Copy gagal. Coba gunakan browser Chrome/Edge atau buka via localhost.');
}

function exportOrderBatches(){
  if(!orderBatches || !orderBatches.length){ alert('Generate batch dulu sebelum export.'); return; }
  const rows = orderBatches.map((batch,i)=>({
    'Batch': 'Batch '+(i+1),
    'Total Orders': batch.length,
    'Orders Code': batch.join(getOrderSeparator())
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Batch Summary');
  orderBatches.forEach((batch,i)=>{
    const ws = XLSX.utils.aoa_to_sheet([
      ['Batch','Total Orders','Orders Code'],
      ['Batch '+(i+1), batch.length, batch.join(getOrderSeparator())]
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Batch_'+String(i+1).padStart(3,'0'));
  });
  XLSX.writeFile(wb, 'Merge_Orders_Code_Batch_'+orderBatches.length+'_batch.xlsx');
}

async function copyText(id){const ok=await safeCopy($(id).textContent||'');alert(ok?'Hasil berhasil dicopy':'Copy gagal. Blok teks lalu tekan Ctrl+C.')}
function norm(s){return String(s||'').trim()}
function readFile(file){return new Promise((res,rej)=>{let r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsArrayBuffer(file)})}
async function readWorkbookRows(file){
  let data=await readFile(file); let wb=XLSX.read(data,{type:'array'}); let ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{defval:''});
}
function renderTable(rows,id,limit=300){
  if(!rows||!rows.length){$(id).innerHTML='<div class="output">Belum ada data.</div>';return}
  let headers=Object.keys(rows[0]);
  let html='<table><thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>';
  rows.slice(0,limit).forEach(r=>{html+='<tr>'+headers.map(h=>{let v=r[h]??'';let cls=v==='Bisa diupload'?'badge ok':v==='Tidak bisa diupload'?'badge bad':'';return `<td>${cls?`<span class="${cls}">${v}</span>`:v}</td>`}).join('')+'</tr>'});
  html+='</tbody></table>'; if(rows.length>limit) html+=`<div class="hint">Preview ${limit} dari ${rows.length} rows.</div>`;
  $(id).innerHTML=html;
}
function exportRows(rows,filename,sheet='Result'){
  if(!rows||!rows.length){alert('Belum ada data untuk export.');return}
  let ws=XLSX.utils.json_to_sheet(rows); let wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheet); XLSX.writeFile(wb,filename);
}
async function processMergeExcel(){
  let files=[...$('mergeExcelFiles').files]; if(!files.length) return alert('Upload file Excel dulu.');
  let all=[], header=null;
  for(const f of files){let rows=await readWorkbookRows(f); if(!rows.length) continue; if(!header) header=Object.keys(rows[0]); rows.forEach(r=>{let o={}; header.forEach(h=>o[h]=r[h]??''); all.push(o)})}
  mergedExcelRows=all; $('mergeExcelFileCount').textContent=files.length; $('mergeExcelRowCount').textContent=all.length; $('mergeExcelHeaderCount').textContent=header?header.length:0; $('mergeExcelStatus').textContent='Done'; renderTable(all,'mergeExcelPreview');
}
function qty(v){let n=Number(String(v).replace(',','.')); return isNaN(n)?0:n}
async function processInventoryStock(){
  let f=$('inventoryFile').files[0]; 
  if(!f) return alert('Upload file Item Inventory Stock dulu.');
  let rows=await readWorkbookRows(f);
  let map={}, cleaned=[], totalQty=0;
  rows.forEach(r=>{
    let sku=norm(r['Item SKU']||r['item_sku']||r['SKU']||r['sku']);
    let q=qty(r['Qty']||r['qty']||r['Stock']||r['Qty Stock']||r['stock']);
    if(!sku) return;
    map[sku]=(map[sku]||0)+q;
  });
  Object.keys(map).forEach(sku=>{
    cleaned.push({'Item SKU':sku,'Qty':map[sku]});
    totalQty+=map[sku];
  });
  inventoryStockMap=map;
  inventoryRows=cleaned;
  $('inventoryTotal').textContent=cleaned.length;
  $('inventoryQty').textContent=totalQty;
  $('inventoryStatus').textContent='Uploaded / Replaced';
  $('screeningStatus').textContent='Inventory Ready';
  renderTable(inventoryRows,'inventoryPreview');
}
async function processScreeningStock(){
  let f=$('screeningFile').files[0]; 
  if(!f) return alert('Upload file Screening Stock dulu.');
  if(!inventoryRows.length || !Object.keys(inventoryStockMap).length) return alert('Upload Item Inventory Stock terlebih dahulu. Inventory bersifat replacement untuk real stock.');

  let rows=await readWorkbookRows(f);
  let used={};
  let ok=0,bad=0;
  let groups=[];
  let groupMap={};

  // Order-level validation:
  // Jika 1 order berisi beberapa SKU dan salah satu SKU tidak cukup/kosong,
  // semua baris dalam nomor order tersebut wajib menjadi "Tidak bisa diupload".
  rows.forEach((r,idx)=>{
    let orderCode=norm(r['Orders Code']||r['Order Code']||r['orders code']||r['Nomor Pesanan']||r['No Pesanan']||r['Order ID']||r['order_id']||'');
    let waybill=norm(r['Waybill Numbers']||r['Waybill Number']||r['waybill numbers']||r['No Resi']||r['Resi']||'');
    let key=orderCode || waybill || ('ROW_'+idx);
    if(!groupMap[key]){ groupMap[key]=[]; groups.push({key, rows:groupMap[key]}); }
    groupMap[key].push({r,idx});
  });

  let results=new Array(rows.length);

  groups.forEach(g=>{
    let demand={};
    g.rows.forEach(({r})=>{
      let sku=norm(r['Item SKU']||r['item_sku']||r['SKU']);
      let orderQty=qty(r['Qty Orders']||r['qty orders']||r['Qty']||r['qty']||1);
      if(sku) demand[sku]=(demand[sku]||0)+orderQty;
    });

    let canOrder=true;
    Object.keys(demand).forEach(sku=>{
      let stock=qty(inventoryStockMap[sku]||0);
      if((used[sku]||0)+demand[sku] > stock) canOrder=false;
    });

    if(canOrder){
      Object.keys(demand).forEach(sku=>{ used[sku]=(used[sku]||0)+demand[sku]; });
    }

    g.rows.forEach(({r,idx})=>{
      let sku=norm(r['Item SKU']||r['item_sku']||r['SKU']);
      let stock=qty(inventoryStockMap[sku]||0);
      let cumulative = canOrder ? (used[sku]||0) : ((used[sku]||0)+(demand[sku]||0));
      if(canOrder) ok++; else bad++;
      results[idx]={...r,'Qty Stock':stock,'Cumulative Qty SKU':cumulative,Result:canOrder?'Bisa diupload':'Tidak bisa diupload'};
    });
  });

  screeningRows=results;
  $('screeningTotal').textContent=screeningRows.length; 
  $('screeningOk').textContent=ok; 
  $('screeningBad').textContent=bad; 
  $('screeningStatus').textContent='Done'; 
  renderTable(screeningRows,'screeningPreview');
}

function miNormalizeSku(v){
  let s=String(v||'').trim().toUpperCase();
  if(!s) return '';
  if(s.includes('__')) s=s.split('__').pop();
  return s.replace(/\s+/g,'');
}
function miNormalizeText(v){
  return String(v||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/\s*-\s*/g,' - ').trim();
}
function miBaseItemName(desc){
  return String(desc||'').replace(/\s*[-–—]?\s*isi\s*\d+\s*$/i,'').trim();
}
function miBuildItemName(desc,pieces){
  const base=miBaseItemName(desc);
  const pcs=String(pieces||'').trim();
  return pcs ? `${base} - isi ${pcs}` : base;
}
function miExtractIsi(text){
  const m=String(text||'').match(/(?:^|[\s\-–—])isi\s*(\d+)\s*$/i);
  return m ? String(Number(m[1])) : '';
}
function miItemNameAlreadyMatch(masterName, desiredName, pieces){
  const a=miNormalizeText(masterName), b=miNormalizeText(desiredName);
  if(a && b && a===b) return true;
  const masterBase=miNormalizeText(miBaseItemName(masterName));
  const desiredBase=miNormalizeText(miBaseItemName(desiredName));
  const masterIsi=miExtractIsi(masterName);
  const desiredIsi=String(pieces||'').trim()==='' ? '' : String(Number(pieces));
  return masterBase && desiredBase && masterBase===desiredBase && masterIsi===desiredIsi;
}
async function readSheetMatrix(file){
  const data=await readFile(file);
  const wb=XLSX.read(data,{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
}
function miFindHeaderIndex(headers,candidates){
  const lower=headers.map(h=>String(h||'').trim().toLowerCase());
  for(const c of candidates){
    const idx=lower.indexOf(String(c).trim().toLowerCase());
    if(idx>=0) return idx;
  }
  return -1;
}
function miFindAsnHeaderRow(aoa){
  return aoa.findIndex(row=>{
    const txt=row.map(x=>String(x||'').trim().toLowerCase());
    return txt.includes('item code') && txt.includes('item description') && txt.includes('pieces per carton');
  });
}
function miSetText(id,value){ const el=$(id); if(el) el.textContent=value; }
function miMasterKeysFromRow(r){
  const raw=[r['client_code_item'],r['code_upc_1'],r['code_upc_2'],r['code_item'],r['Item Code'],r['item_code'],r['SKU']];
  const out=[];
  raw.forEach(v=>{
    const s=String(v||'').trim();
    const k=miNormalizeSku(s);
    if(k) out.push(k);
    if(String(s).includes('__')) out.push(miNormalizeSku(String(s).split('__').pop()));
  });
  return [...new Set(out)];
}
function miPersistMaster(){
  try{ localStorage.setItem('flowgistik_master_item_metabase_v1',JSON.stringify({rows:masterItemRows,map:masterItemMap,ts:new Date().toISOString()})); }catch(e){ console.warn('Master item terlalu besar untuk localStorage, tetap aktif selama halaman belum direfresh.',e); }
}
function miLoadPersistedMaster(){
  try{
    const raw=localStorage.getItem('flowgistik_master_item_metabase_v1');
    if(!raw) return;
    const data=JSON.parse(raw);
    masterItemRows=data.rows||[]; masterItemMap=data.map||{};
    if(masterItemRows.length){ miSetText('miMasterTotal',masterItemRows.length); miSetText('miStatus','Master ready'); }
  }catch(e){}
}
async function processMasterItemMetabase(){
  const f=$('masterItemMetabaseFile')?.files?.[0];
  if(!f) return alert('Upload file Master item Metabase dulu.');
  const rows=await readWorkbookRows(f);
  const map={};
  rows.forEach(r=>{
    const itemDescr=norm(r['item_descr']||r['Item Description']||r['item description']||r['Item Name']||r['item_name']);
    const clientSku=norm(r['client_code_item']||r['Item Code']||r['item_code']||r['SKU']);
    miMasterKeysFromRow(r).forEach(k=>{ if(k) map[k]={...r,itemDescr,clientSku}; });
  });
  masterItemRows=rows;
  masterItemMap=map;
  miPersistMaster();
  miSetText('miMasterTotal',rows.length);
  miSetText('miLastMaster',f.name);
  miSetText('miStatus','Master ready');
  $('miStatusBox').textContent=`✅ Master item Metabase berhasil diimport: ${rows.length} rows, ${Object.keys(map).length} SKU key siap divalidasi.`;
}
function clearMasterItemMetabase(){
  masterItemRows=[]; masterItemMap={};
  try{ localStorage.removeItem('flowgistik_master_item_metabase_v1'); }catch(e){}
  miSetText('miMasterTotal','0'); miSetText('miStatus','Belum import'); miSetText('miLastMaster','-');
  $('miStatusBox').textContent='Master item Metabase sudah dibersihkan. Import ulang sebelum screening.';
}
async function processScreeningMasterItem(){
  const f=$('screeningMasterFile')?.files?.[0];
  if(!f) return alert('Upload file Template ASN / screening master item dulu.');
  if(!Object.keys(masterItemMap).length) return alert('Import Master item Metabase terlebih dahulu sebelum screening.');
  const aoa=await readSheetMatrix(f);
  const headerIdx=miFindAsnHeaderRow(aoa);
  if(headerIdx<0) return alert('Header ASN tidak ditemukan. Pastikan ada kolom Item Code, Item Description, dan Pieces per carton.');
  const headers=(aoa[headerIdx]||[]).slice(0,15);
  while(headers.length<15) headers.push('');
  headers[10]=headers[10]||'x';
  headers[11]='Screening master item';
  headers[12]='Item name master item Metabase';
  headers[13]='Upload new master item';
  headers[14]='Need update item name';
  const idxCode=miFindHeaderIndex(headers,['Item Code','item_code','SKU']);
  const idxDesc=miFindHeaderIndex(headers,['Item Description','Item Name','item_descr']);
  const idxPieces=miFindHeaderIndex(headers,['Pieces per carton','Pieces per cartoon','Pieces per Carton','Pcs per carton']);
  const outAoa=[];
  for(let i=0;i<aoa.length;i++){
    const row=(aoa[i]||[]).slice(0,15);
    while(row.length<15) row.push('');
    if(i===1) row[11]='Result of screening master item';
    if(i===headerIdx){ outAoa.push(headers); continue; }
    if(i<=headerIdx){ outAoa.push(row); continue; }
    const itemCode=norm(row[idxCode]);
    const itemDesc=norm(row[idxDesc]);
    const pieces=norm(row[idxPieces]);
    if(!itemCode && !itemDesc){ outAoa.push(row); continue; }
    const desiredName=miBuildItemName(itemDesc,pieces);
    const master=masterItemMap[miNormalizeSku(itemCode)];
    if(master){
      row[11]='Sudah ada';
      row[12]=master.itemDescr || '';
      row[13]='';
      row[14]=miItemNameAlreadyMatch(master.itemDescr,desiredName,pieces)
        ? 'Tidak perlu diubah karena item name di sistem dan template sudah sesuai'
        : desiredName;
    }else{
      row[11]='Belum ada';
      row[12]='';
      row[13]=desiredName;
      row[14]='';
    }
    outAoa.push(row);
  }
  screeningMasterAoa=outAoa;
  const body=outAoa.slice(headerIdx+1).filter(r=>norm(r[idxCode])||norm(r[idxDesc]));
  screeningMasterRows=body.map(r=>{
    const o={}; headers.forEach((h,i)=>o[h||`Column ${i+1}`]=r[i]??''); return o;
  });
  const sudah=screeningMasterRows.filter(r=>r['Screening master item']==='Sudah ada').length;
  const belum=screeningMasterRows.filter(r=>r['Screening master item']==='Belum ada').length;
  const update=screeningMasterRows.filter(r=>r['Need update item name'] && !String(r['Need update item name']).startsWith('Tidak perlu diubah')).length;
  miSetText('miScreenTotal',screeningMasterRows.length);
  miSetText('miSudahAda',sudah);
  miSetText('miBelumAda',belum);
  miSetText('miNeedUpdate',update);
  miSetText('miStatus','Done');
  miSetText('miLastScreen',f.name);
  $('miStatusBox').textContent=`✅ Screening selesai. Sudah ada: ${sudah}, Belum ada: ${belum}, Need update item name: ${update}.`;
  renderTable(screeningMasterRows,'screeningMasterPreview',300);
}
function exportScreeningMasterItem(){
  if(!screeningMasterAoa.length) return alert('Proses Screening Master Item dulu sebelum export.');
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(screeningMasterAoa);
  ws['!cols']=[
    {wch:34},{wch:16},{wch:18},{wch:18},{wch:18},{wch:20},{wch:55},{wch:18},{wch:18},{wch:14},{wch:8},{wch:22},{wch:55},{wch:55},{wch:65}
  ];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:1,c:11},e:{r:1,c:14}}];
  XLSX.utils.book_append_sheet(wb,ws,'Screening Master Item');
  XLSX.writeFile(wb,'Export_screening_master_item_result.xlsx');
}
function downloadScreeningMasterTemplate(){
  const rows=[
    ['ADVANCE SHIPPING NOTICE FORM','','','','','','','','','','','','','',''],
    ['WAREHOUSE DECA','','','','','','','','','','','Result of screening master item','','',''],
    ['ASN Number','Supplier Code','Supplier Name','Expected arrival date','Expected arrival time','Item Code','Item Description','Pieces per carton','Expected pieces','Expected Ctn','x','Screening master item','Item name master item Metabase','Upload new master item','Need update item name'],
    ['INBOUND-DECA-YYYYMMDD-SUPPLIER-001','','CMG','2026-05-08','14:30','SKU-CONTOH','Contoh Item Description',12,120,10,'','','','','']
  ];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:34},{wch:16},{wch:18},{wch:18},{wch:18},{wch:20},{wch:55},{wch:18},{wch:18},{wch:14},{wch:8},{wch:22},{wch:55},{wch:55},{wch:65}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:1,c:11},e:{r:1,c:14}}];
  XLSX.utils.book_append_sheet(wb,ws,'Screening Master Item');
  XLSX.writeFile(wb,'Template_Screening_Master_Item.xlsx');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',miLoadPersistedMaster); else miLoadPersistedMaster();


function dpSetText(id,value){ const el=$(id); if(el) el.textContent=value; }
function dpNormalizeSku(v){
  let s=String(v||'').trim().toUpperCase();
  if(!s) return '';
  if(s.includes('__')) s=s.split('__').pop();
  return s.replace(/\s+/g,'');
}
function dpNum(v){
  if(v===null || v===undefined || String(v).trim()==='') return '';
  let s=String(v).trim().replace(',','.');
  let n=Number(s);
  return isNaN(n) ? '' : n;
}
function dpSame(a,b){
  const x=dpNum(a), y=dpNum(b);
  if(x==='' && y==='') return true;
  if(x==='' || y==='') return false;
  return Math.abs(Number(x)-Number(y)) < 0.000001;
}
function dpGet(row,names){
  for(const n of names){
    if(row[n]!==undefined && row[n]!==null && String(row[n]).trim()!=='') return row[n];
  }
  const keys=Object.keys(row||{});
  const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const map={}; keys.forEach(k=>map[clean(k)]=k);
  for(const n of names){
    const k=map[clean(n)];
    if(k!==undefined && String(row[k]??'').trim()!=='') return row[k];
  }
  return '';
}
async function readWorkbookAllSheetRows(file){
  const data=await readFile(file);
  const wb=XLSX.read(data,{type:'array'});
  let all=[];
  wb.SheetNames.forEach(sheetName=>{
    const ws=wb.Sheets[sheetName];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(!aoa.length) return;
    let headerIdx=aoa.findIndex(row=>{
      const t=row.map(x=>String(x||'').trim().toLowerCase());
      const joined=t.join('|');
      return joined.includes('item sku') || joined.includes('original sku') || joined.includes('client_code_item') || (joined.includes('panjang') && joined.includes('tinggi'));
    });
    if(headerIdx<0) headerIdx=0;
    const headers=(aoa[headerIdx]||[]).map((h,i)=>String(h||'').trim() || `Column ${i+1}`);
    for(let r=headerIdx+1;r<aoa.length;r++){
      const row=aoa[r]||[];
      if(!row.some(v=>String(v||'').trim()!=='')) continue;
      const obj={__sheet:sheetName,__row:r+1};
      headers.forEach((h,i)=>obj[h]=row[i]??'');
      // fallback for files where SKU is in column B but header B is blank
      obj.__colA=row[0]??''; obj.__colB=row[1]??''; obj.__colC=row[2]??''; obj.__colD=row[3]??''; obj.__colE=row[4]??''; obj.__colF=row[5]??'';
      all.push(obj);
    }
  });
  return all;
}
function dpMasterKeysFromRow(r){
  const raw=[
    dpGet(r,['client_code_item','Item SKU','Item Code','item_code','SKU']),
    dpGet(r,['code_item']),
    dpGet(r,['code_upc_1']),
    dpGet(r,['code_upc_2'])
  ];
  const out=[];
  raw.forEach(v=>{
    const s=String(v||'').trim();
    const k=dpNormalizeSku(s);
    if(k) out.push(k);
    if(s.includes('__')) out.push(dpNormalizeSku(s.split('__').pop()));
  });
  return [...new Set(out)];
}
async function processDimensiMaster(){
  const f=$('dimensiMasterFile')?.files?.[0];
  if(!f) return alert('Upload file Master item Metabase dulu.');
  const rows=await readWorkbookRows(f);
  const map={};
  rows.forEach(r=>{
    const rec={
      sku: String(dpGet(r,['client_code_item','Item SKU','Item Code','SKU'])||'').trim(),
      panjang: dpNum(dpGet(r,['length_cm','Length CM','panjang','Panjang'])),
      lebar: dpNum(dpGet(r,['width_cm','Width CM','lebar','Lebar'])),
      tinggi: dpNum(dpGet(r,['height_cm','Height CM','tinggi','Tinggi'])),
      raw:r
    };
    dpMasterKeysFromRow(r).forEach(k=>{ if(k) map[k]=rec; });
  });
  dimensiMasterRows=rows;
  dimensiMasterMap=map;
  try{ localStorage.setItem('flowgistik_dimensi_master_v1',JSON.stringify({rows,map,ts:new Date().toISOString()})); }catch(e){ console.warn('Dimensi master terlalu besar untuk localStorage, tetap aktif selama halaman belum direfresh.',e); }
  dpSetText('dpMasterTotal',Object.keys(map).length);
  dpSetText('dpLastMaster',f.name);
  dpSetText('dpStatus','Master ready');
  $('dpStatusBox').textContent=`✅ Master dimensi berhasil diimport: ${rows.length} rows, ${Object.keys(map).length} SKU key siap compare.`;
}
function dpLoadPersistedMaster(){
  try{
    const raw=localStorage.getItem('flowgistik_dimensi_master_v1');
    if(!raw) return;
    const data=JSON.parse(raw);
    dimensiMasterRows=data.rows||[];
    dimensiMasterMap=data.map||{};
    if(Object.keys(dimensiMasterMap).length){
      dpSetText('dpMasterTotal',Object.keys(dimensiMasterMap).length);
      dpSetText('dpStatus','Master ready');
    }
  }catch(e){}
}
function clearDimensiProduct(){
  dimensiMasterRows=[]; dimensiInboundRows=[]; dimensiResultRows=[]; dimensiResultAoa=[]; dimensiMasterMap={};
  try{ localStorage.removeItem('flowgistik_dimensi_master_v1'); }catch(e){}
  ['dpMasterTotal','dpInboundTotal','dpNeedUpdate','dpNoUpdate','dpMissing'].forEach(id=>dpSetText(id,'0'));
  dpSetText('dpLastMaster','-'); dpSetText('dpLastInbound','-'); dpSetText('dpStatus','Belum import');
  $('dpStatusBox').textContent='Data screening dimensi sudah dibersihkan. Import ulang Master item Metabase dan Dimensi Inbound.';
  $('screeningDimensiPreview').innerHTML='<div class="output">Belum ada hasil screening dimensi product.</div>';
}
function dpInboundSku(r){
  return String(dpGet(r,['Item SKU','Original SKU','Item Code','SKU']) || r.__colB || r.__colA || '').trim();
}
function dpInboundPanjang(r){ return dpNum(dpGet(r,['PANJANG','Panjang','length','Length']) || r.__colD); }
function dpInboundLebar(r){ return dpNum(dpGet(r,['LEBAR','LEBAR ','Lebar','width','Width']) || r.__colE); }
function dpInboundTinggi(r){ return dpNum(dpGet(r,['TINGGI','Tinggi','height','Height']) || r.__colF); }
async function processScreeningDimensiProduct(){
  const f=$('dimensiInboundFile')?.files?.[0];
  if(!f) return alert('Upload file Dimensi Inbound dulu.');
  if(!Object.keys(dimensiMasterMap).length) return alert('Import Master item Metabase terlebih dahulu sebelum proses screening dimensi.');
  const rows=await readWorkbookAllSheetRows(f);
  const usable=rows.map(r=>({
    sheet:r.__sheet,
    row:r.__row,
    sku:dpInboundSku(r),
    panjangInbound:dpInboundPanjang(r),
    lebarInbound:dpInboundLebar(r),
    tinggiInbound:dpInboundTinggi(r)
  })).filter(r=>r.sku);
  dimensiInboundRows=usable;
  const results=[];
  usable.forEach(r=>{
    const master=dimensiMasterMap[dpNormalizeSku(r.sku)];
    let screening='SKU tidak ada di master item Metabase';
    let mP='',mL='',mT='';
    if(master){
      mP=master.panjang; mL=master.lebar; mT=master.tinggi;
      const same=dpSame(mP,r.panjangInbound) && dpSame(mL,r.lebarInbound) && dpSame(mT,r.tinggiInbound);
      screening=same ? 'Tidak perlu updates dimensi' : 'Perlu updates dimensi';
    }
    results.push({
      'Item SKU':r.sku,
      'Metabase Panjang':mP,
      'Metabase Lebar':mL,
      'Metabase Tinggi':mT,
      'Inbound Panjang':r.panjangInbound,
      'Inbound Lebar':r.lebarInbound,
      'Inbound Tinggi':r.tinggiInbound,
      'x':'',
      'Screening':screening,
      'Source Sheet':r.sheet,
      'Source Row':r.row
    });
  });
  dimensiResultRows=results;
  const need=results.filter(r=>r.Screening==='Perlu updates dimensi').length;
  const no=results.filter(r=>r.Screening==='Tidak perlu updates dimensi').length;
  const miss=results.filter(r=>r.Screening==='SKU tidak ada di master item Metabase').length;
  dpSetText('dpInboundTotal',results.length);
  dpSetText('dpNeedUpdate',need);
  dpSetText('dpNoUpdate',no);
  dpSetText('dpMissing',miss);
  dpSetText('dpStatus','Done');
  dpSetText('dpLastInbound',f.name);
  $('dpStatusBox').textContent=`✅ Screening dimensi selesai. Perlu updates: ${need}, Tidak perlu updates: ${no}, SKU tidak ada di Metabase: ${miss}.`;
  renderTable(results,'screeningDimensiPreview',300);
  dimensiResultAoa = buildDimensiProductAoa(results);
}
function buildDimensiProductAoa(rows){
  const aoa=[
    ['', '', '', '', '', '', '', '', '', ''],
    ['', '', 'Metabase', '', '', 'Inbound dimensity updates', '', '', '', ''],
    ['', 'Item SKU', 'Panjang', 'Lebar', 'Tinggi', 'Panjang', 'Lebar', 'Tinggi', 'x', 'Screening'],
    ['', '', '', '', '', '', '', '', '', 'Perlu updates dimensi / Tidak perlu updates dimensi']
  ];
  rows.forEach(r=>{
    aoa.push([
      '',
      r['Item SKU'],
      r['Metabase Panjang'],
      r['Metabase Lebar'],
      r['Metabase Tinggi'],
      r['Inbound Panjang'],
      r['Inbound Lebar'],
      r['Inbound Tinggi'],
      '',
      r['Screening']
    ]);
  });
  return aoa;
}
function exportScreeningDimensiProduct(){
  if(!dimensiResultRows.length) return alert('Proses Screening Dimensi Product dulu sebelum export.');
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(dimensiResultAoa.length ? dimensiResultAoa : buildDimensiProductAoa(dimensiResultRows));
  ws['!cols']=[{wch:4},{wch:24},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:8},{wch:36}];
  ws['!merges']=[{s:{r:1,c:2},e:{r:1,c:4}},{s:{r:1,c:5},e:{r:1,c:7}}];
  XLSX.utils.book_append_sheet(wb,ws,'Screening Dimensi Product');
  XLSX.writeFile(wb,'Export_screening_dimensi_product_result.xlsx');
}
function downloadDimensiProductTemplate(){
  const aoa=[
    ['', '', '', '', '', '', '', '', '', ''],
    ['', '', 'Metabase', '', '', 'Inbound dimensity updates', '', '', '', ''],
    ['', 'Item SKU', 'Panjang', 'Lebar', 'Tinggi', 'Panjang', 'Lebar', 'Tinggi', 'x', 'Screening'],
    ['', '', '', '', '', '', '', '', '', 'Perlu updates dimensi / Tidak perlu updates dimensi'],
    ['', 'SKU-CONTOH', 10, 20, 30, 10, 20, 30, '', 'Tidak perlu updates dimensi']
  ];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:4},{wch:24},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:8},{wch:36}];
  ws['!merges']=[{s:{r:1,c:2},e:{r:1,c:4}},{s:{r:1,c:5},e:{r:1,c:7}}];
  XLSX.utils.book_append_sheet(wb,ws,'Template Dimensi');
  XLSX.writeFile(wb,'Template_Screening_Dimensi_Product.xlsx');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',dpLoadPersistedMaster); else dpLoadPersistedMaster();

async function processSellerFeedback(){
  let f=$('sellerFile').files[0]; 
  if(!f) return alert('Upload file Merge SKU Seller Feedback dulu.');

  let rows=await readWorkbookRows(f);

  function cleanKey(x){
    return String(x||'')
      .toLowerCase()
      .replace(/[^a-z0-9]/g,'');
  }

  function getByCandidates(row, candidates){
    let keys=Object.keys(row);
    let normalized={};
    keys.forEach(k=>normalized[cleanKey(k)]=k);
    for(const c of candidates){
      let key=normalized[cleanKey(c)];
      if(key !== undefined && row[key] !== undefined && String(row[key]).trim() !== '') return norm(row[key]);
    }
    return '';
  }

  function getChild(row,i){
    return getByCandidates(row,[
      `child_${i}`,`Child_${i}`,`CHILD_${i}`,
      `child ${i}`,`Child ${i}`,`CHILD ${i}`,
      `sku child ${i}`,`SKU Child ${i}`,`Child SKU ${i}`,
      `item child ${i}`,`Item Child ${i}`
    ]);
  }

  function getReplace(row,i){
    return getByCandidates(row,[
      `replace_child_${i}`,`Replace_child_${i}`,`REPLACE_CHILD_${i}`,
      `replace child ${i}`,`Replace Child ${i}`,`REPLACE CHILD ${i}`,
      `replace child_${i}`,`Replace Child_${i}`,`REPLACE CHILD_${i}`,
      `replace_child ${i}`,`Replace_child ${i}`,
      `replacement child ${i}`,`Replacement Child ${i}`,
      `replace sku child ${i}`,`Replace SKU Child ${i}`
    ]);
  }

  sellerRows=rows.map(r=>{
    let parts=[];
    let audit={};
    for(let i=1;i<=6;i++){
      let child=getChild(r,i);
      let repl=getReplace(r,i);
      let used=repl || child;
      if(used) parts.push(used);
      audit[`Child ${i}`]=child;
      audit[`Replace Child ${i}`]=repl;
      audit[`Used SKU ${i}`]=used;
      audit[`Source ${i}`]=repl ? 'Replace Child' : (child ? 'Child' : '');
    }
    return {
      ...r,
      ...audit,
      'Master Replacement':parts.join(','),
      'Master Replace':parts.join(',')
    };
  });

  let generated=sellerRows.filter(r=>norm(r['Master Replacement'])).length;
  $('sellerTotal').textContent=sellerRows.length;
  $('sellerGenerated').textContent=generated;
  $('sellerEmpty').textContent=sellerRows.length-generated;
  $('sellerStatus').textContent='Done';
  renderTable(sellerRows,'sellerPreview');
}
async function processConvertCurah(){
  let f=$('curahFile').files[0]; if(!f) return alert('Upload file Convert Curah dulu.');
  let rows=await readWorkbookRows(f); let out=[];
  rows.forEach(r=>{
    let master=norm(r['Master Replacement']||r['Master Replace']||r['master replacement']||r['master_replace']);
    let parts=master.split(',').map(x=>x.trim()).filter(Boolean);
    if(!parts.length) parts=[norm(r['Item SKU']||r['item_sku']||r['SKU'])].filter(Boolean);
    parts.forEach(p=>out.push({
      ...r,
      'Orders Code':r['Orders Code']||r['orders code']||'',
      'Waybill Numbers':r['Waybill Numbers']||r['waybill numbers']||'',
      'Master Replacement':master,
      'Item SKU':p,
      'Qty Orders':r['Qty Orders']||r['qty orders']||r['Qty']||r['qty']||''
    }));
  });
  curahRows=out; $('curahInput').textContent=rows.length; $('curahOutput').textContent=out.length; $('curahSkuCount').textContent=out.length; $('curahStatus').textContent='Done'; renderTable(out,'curahPreview');
}
const ORIGINAL_TEMPLATE_B64 = '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';
function b64ToBytes(b64){
  const bin=atob(b64); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes;
}
function downloadMasterTemplate(){
  saveBlob(b64ToBytes(ORIGINAL_TEMPLATE_B64),'Master Template - Sales Support Mega Apps.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function safeWriteWorkbook(wb,filename){
  try{
    const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    saveBlob(bytes,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }catch(e){
    alert('Gagal download template. Pastikan koneksi internet aktif agar library Excel termuat, lalu refresh halaman.');
    console.error(e);
  }
}
function makeTemplate(rows,filename,sheet){
  if(!window.XLSX) return alert('Library Excel belum termuat. Pastikan internet aktif lalu refresh halaman.');
  let ws=XLSX.utils.json_to_sheet(rows);let wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheet);safeWriteWorkbook(wb,filename);
}

const TEMPLATE_FILES_B64 = {
  inventory: `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`,
  screening: `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`,
  seller: `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`,
  curah: `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`
};
const TEMPLATE_META = {
  inventory: { filename:'Template_Inventory_Stock.xlsx', mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  screening: { filename:'Template_Screening_Stock.xlsx', mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  seller: { filename:'Template_Merge_SKU_Seller_Feedback.xlsx', mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  curah: { filename:'Template_Convert_Merge_SKU_Menjadi_Curah.xlsx', mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
};
function downloadTemplate(type){
  const meta = TEMPLATE_META[type];
  const b64 = TEMPLATE_FILES_B64[type];
  if(!meta || !b64) return alert('Template tidak ditemukan.');
  try{
    saveBlob(b64ToBytes(b64), meta.filename, meta.mime);
  }catch(e){
    console.error(e);
    alert('Gagal download template. Coba refresh halaman lalu klik ulang.');
  }
}

function downloadAllTemplates(){
  if(!window.XLSX) return alert('Library Excel belum termuat. Pastikan internet aktif lalu refresh halaman.');
  let wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{'Orders Code':'583703741720790164','Waybill Numbers':'SPX001','Item SKU':'SKU-A','Qty Orders':1,'Qty Stock':8,'Result':''}]),'Screening Stock');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{'item_sku':'PACK-ABC-01','Master Replace':'ABC-01,ABC-04,ABC-03','child_1':'ABC-01','child_2':'ABC-02','child_3':'ABC-03','child_4':'','child_5':'','child_6':'','x':'','Replace Child 1':'','Replace Child 2':'ABC-04','Replace Child 3':'','Replace Child 4':'','Replace Child 5':''}]),'Merge SKU Seller Feedback');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{'Orders Code':'583703741720790164','Waybill Numbers':'SPX001','Master Replacement':'KOPI-ABC-01,KOPI-ABC-02,KOPI-ABC-03','Item SKU':'','Qty Orders':1}]),'Convert merge SKU menjadi curah');
  safeWriteWorkbook(wb,'Master Template - Sales Support Mega Apps.xlsx');
}
function parsePages(s,max){let pages=new Set();s.split(',').forEach(part=>{part=part.trim();if(!part)return;if(part.includes('-')){let[a,b]=part.split('-').map(x=>parseInt(x));for(let i=a;i<=b;i++)if(i>=1&&i<=max)pages.add(i-1)}else{let n=parseInt(part);if(n>=1&&n<=max)pages.add(n-1)}});return [...pages].sort((a,b)=>a-b)}
async function mergePDF(){
  let files=[...$('mergePdfFiles').files]; if(!files.length) return alert('Upload PDF dulu.');
  let out=await PDFLib.PDFDocument.create();
  for(const f of files){let bytes=await f.arrayBuffer();let pdf=await PDFLib.PDFDocument.load(bytes);let pages=await out.copyPages(pdf,pdf.getPageIndices());pages.forEach(p=>out.addPage(p))}
  let bytes=await out.save(); saveBlob(bytes,'Merged_PDF_FLOWGISTIK.pdf','application/pdf'); $('mergePdfFileCount').textContent=files.length; $('mergePdfStatus').textContent='Done'; $('mergePdfInfo').textContent=`Berhasil merge ${files.length} file PDF.`;
}
async function splitPDF(){
  let f=$('splitPdfFile').files[0]; if(!f) return alert('Upload satu PDF dulu.');
  let pdf=await PDFLib.PDFDocument.load(await f.arrayBuffer()); let idx=parsePages($('splitPages').value,pdf.getPageCount()); if(!idx.length) return alert('Isi halaman yang valid. Contoh: 1-3,5');
  let out=await PDFLib.PDFDocument.create(); let pages=await out.copyPages(pdf,idx); pages.forEach(p=>out.addPage(p));
  let bytes=await out.save(); saveBlob(bytes,'Split_PDF_FLOWGISTIK.pdf','application/pdf'); $('splitPdfPageCount').textContent=idx.length; $('splitPdfStatus').textContent='Done'; $('splitPdfInfo').textContent=`Berhasil split ${idx.length} halaman.`;
}
function saveBlob(bytes,name,type){let blob=new Blob([bytes],{type});let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

// === Projection Management v1 ===
const PM_TEMPLATE = {"timelineTasks": [{"stakeholder": "Sales", "task": "Agreement Signed", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Create business unit WMS & OMS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Pricing Approval Internal", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Reconcile & Upload master item", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Pengisian Client Information & Requirement", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Create & Share client access", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Aligned w/ Client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Training client portal", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "New Client Form dikirim dan diisi oleh client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Integration sistem", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Handover Form dikirim ke OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Shipping & Courrier Mapping", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Data Client & PIC", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Jadwal Inbound pertama confirmed", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Service Scope Lengkap", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Inbound Process & Data GR Released", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Forecast Volume disampaikkan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Test order", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Requirement Lengkap disampaikkan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Error Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Special Request Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Go Live Approval diberikan ke OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Aligned w/ OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "First Outbound", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Kick Off Meeting dilakukan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Timeline Onboarding disetujui", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA & Cut Off dijelaskan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Alur Komunikasi ditentukan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Checklist data client diterima", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Client Status Active", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Monitoring 1 Minggu", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Monitoring", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Check In week 1", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Review Proforma 1 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Volume Growth monitoring 3 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}], "flowPeople": [{"nama": "Bryan", "role": "Sales manager", "phone": "6281284849987"}, {"nama": "Dimas", "role": "Account manager", "phone": "6285771439820"}, {"nama": "Prayoga Pangestu", "role": "Leader Sales Support", "phone": "6285775447954"}, {"nama": "Asih", "role": "Sales Support", "phone": "628818025202"}, {"nama": "Faisal Fansuri", "role": "Warehouse manager", "phone": "6289687511835"}, {"nama": "Ahmad", "role": "Supervisor inbound", "phone": "6281293756908"}, {"nama": "Yuda", "role": "Supervisor outbound", "phone": "6285183199345"}], "clientPeople": [{"nama": "", "role": "", "phone": ""}, {"nama": "", "role": "", "phone": ""}, {"nama": "", "role": "", "phone": ""}], "clientFields": ["Client Name", "Brand Name", "Product Category", "Average order / Day", "Average order / Month", "Average product price", "Basket order size", "Product Size Dimenstion", "Product Handling", "Marketplace / Channel Information", "Live Streaming Studio", "Working Space", "Delivery - First Mile", "Delivery - Middle Mile", "Delivery - Lastmile"], "inboundFields": ["Inbound QC", "Repacking", "Product Dimenstion", "Hard Bundling", "Virtual Bundling", "Insertion", "Barcode Fisik", "SKU & Barcode berbeda", "Channel dengan master item terlengkap"], "outboundFields": ["Fulfilment by Flowgistik", "Inhouse location", "Others third party", "Packing Type"], "inventoryFields": ["Share / Dedicated Storage", "Type of storage ( Cool / Normal )"], "workingFields": ["Inbound URL Input file", "Outbound URL Input file"], "templateB64": "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"};
const PM_REGISTERED_PROJECTS = [{"id": "REG-FIELDIT-GOLF", "name": "Fieldit Golf", "clientName": "PT. Gaon Business Indonesia", "picSales": "Bryan", "picSalesSupport": "Farah", "openDate": "2026-04-24", "closedDate": "", "status": "Onboarding", "createdAt": "2026-04-26T00:00:00.000Z", "registeredFrom": "New Projection.xlsx", "tasks": [{"stakeholder": "Sales", "task": "Agreement Signed", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Pricing Approval Internal", "status": "Done", "targetDate": "2026-04-19", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Estimasi Volume Order Bulanan", "status": "Done", "targetDate": "", "actualDate": "", "notes": "3000 Pcs ( B2B & B2C)"}, {"stakeholder": "Sales", "task": "Total SKU", "status": "Done", "targetDate": "", "actualDate": "", "notes": "2 SKU"}, {"stakeholder": "Sales", "task": "Target Go-Live", "status": "Done", "targetDate": "2026-04-28", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Special Request Handling", "status": "Done", "targetDate": "", "actualDate": "", "notes": "Ripacking"}, {"stakeholder": "Sales", "task": "SLA Aligned w/ Client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "New Client Form dikirim dan diisi oleh client", "status": "Done", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Handover Form dikirim ke OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Data Client & PIC", "status": "Done", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Service Scope Lengkap", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Forecast Volume disampaikkan", "status": "Done", "targetDate": "", "actualDate": "", "notes": "3000 Pcs / Month"}, {"stakeholder": "Sales", "task": "Requierment Lengkap disampaikkan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Special Request Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Aligned w/ OPS", "status": "Done", "targetDate": "2026-04-23", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Kick Off Meeting dilakukan", "status": "Done", "targetDate": "2026-04-23", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Timeline Onboarding disetujui", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA & Cut Off dijelaskan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Alur Komunikasi ditentukan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Checklist data client diterima", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Account Client dibuat di sistem", "status": "Open", "targetDate": "2026-04-23", "actualDate": "2026-04-23", "notes": "Done"}, {"stakeholder": "Sales Support", "task": "SKU Master data lengkap", "status": "Open", "targetDate": "2026-04-24", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "User Access diberikan ke client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Integration Channel", "status": "Open", "targetDate": "2026-04-28", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Shipping & Courrier Mapping siap", "status": "Open", "targetDate": "2026-04-28", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Jadwal Inbound pertama confirmed", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Stock diterima & verifikasi", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Test order", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Error Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Go Live Approval diberikan ke OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Client Status Active", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Monitoring 1 Minggu", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA MONITORING", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Check In week 1", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Review Proforma 1 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Volume Growth monitoring 3 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}], "people": {"flowgistik": [{"nama": "Bryan", "role": "Sales manager", "phone": "6281284849987"}, {"nama": "Dimas", "role": "Account manager", "phone": "6285771439820"}, {"nama": "Prayoga Pangestu", "role": "Leader Sales Support", "phone": "6285775447954"}, {"nama": "Asih", "role": "Sales Support", "phone": "628818025202"}, {"nama": "Faisal Fansuri", "role": "Warehouse manager", "phone": "6289687511835"}, {"nama": "Ahmad", "role": "Supervisor inbound", "phone": "6281293756908"}, {"nama": "Yuda", "role": "Supervisor outbound", "phone": "6285183199345"}], "client": [{"nama": "Mita", "role": "", "phone": "0899-4442-082"}]}, "clientInfo": {"Client Name": "PT. Gaon Business Indonesia | Notes: Notes", "Brand Name": "Fieldit Golf", "Product Category": "Golf", "Average order / Day": "20 / Day | Notes: Ada B2B Juga dan hitunganya PCS, 1 bulan bisa 400 Pack keluar ( Dus 24 pack - 1 pack isi 15 bola )", "Average order / Month": "400 / Month", "Average product price": "", "Basket order size": "2026-02-01", "Product Handling": "Fifo", "Fulfilment": true, "Live Streaming Studio": false, "Working Space": false, "Delivery - First Mile": false, "Delivery - Middle Mile": false, "Delivery - Lastmile": true, "Service Operational": "Fulfilment, Delivery - Lastmile"}, "inbound": {"Total SKU": "Notes: Notes", "Inbound QC": "Visual QC | Notes: Inbound dalam bentuk Box- ( 1 Box isi 24 pack )", "Repacking": "Yes | Notes: Untuk barang yang dari china", "Product Dimenstion": "Small", "Hard Bundling": "No", "Virtual Bundling": "Yes", "Insertion": "No", "Barcode Fisik": "Yes | Notes: UPC", "SKU & Barcode berbeda": "Yes", "Channel dengan master item terlengkap": "TikTok | Notes: Shopee"}, "outbound": {"Warehouse location": "Notes: Notes", "Fulfilment by Flowgistik": "Yes", "Inhouse location": "No", "Others third party": "No", "Packing Type": "Standard Packing ( Bubble 2 Lapis + Poly mailer ) | Notes: Bubble 2 layer, Rapping, Awb"}, "inventory": {"Type": "Est Using Storage | Notes: Remarks"}, "workingInstruction": {}}, {"id": "REG-EASY-DAY", "name": "Easy Day", "clientName": "Easy Day", "picSales": "Bryan", "picSalesSupport": "Farah", "openDate": "2026-04-23", "closedDate": "", "status": "Onboarding", "createdAt": "2026-04-26T00:00:00.000Z", "registeredFrom": "New Projection.xlsx", "tasks": [{"stakeholder": "Sales", "task": "Agreement Signed", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Pricing Approval Internal", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Estimasi Volume Order Bulanan", "status": "Open", "targetDate": "", "actualDate": "", "notes": "7 SKU"}, {"stakeholder": "Sales", "task": "Total SKU", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Target Go-Live", "status": "Open", "targetDate": "2026-04-27", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Special Request Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Aligned w/ Client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "New Client Form dikirim dan diisi oleh client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Handover Form dikirim ke OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Data Client & PIC", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Service Scope Lengkap", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Forecast Volume disampaikkan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Requierment Lengkap disampaikkan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Special Request Handling", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA Aligned w/ OPS", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Kick Off Meeting dilakukan", "status": "Open", "targetDate": "2026-04-23", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Timeline Onboarding disetujui", "status": "Open", "targetDate": "2026-04-23", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA & Cut Off dijelaskan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Alur Komunikasi ditentukan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Checklist data client diterima", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Account Client dibuat di sistem", "status": "Open", "targetDate": "2026-04-23", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "SKU Master data lengkap", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Integration Channel", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Shipping & Courrier Mapping siap", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "User Access diberikan ke client", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Jadwal Inbound pertama confirmed", "status": "Open", "targetDate": "2026-04-28", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Stock diterima & verifikasi", "status": "Open", "targetDate": "2026-04-28", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Test order", "status": "Open", "targetDate": "2026-04-29", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Error Handling", "status": "Open", "targetDate": "2026-04-29", "actualDate": "", "notes": ""}, {"stakeholder": "Sales Support", "task": "Go Live Approval diberikan ke OPS", "status": "Open", "targetDate": "2026-04-30", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Client Status Active", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Monitoring 1 Minggu", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "SLA MONITORING", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Check In week 1", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Review Proforma 1 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}, {"stakeholder": "Sales", "task": "Volume Growth monitoring 3 bulan", "status": "Open", "targetDate": "", "actualDate": "", "notes": ""}], "people": {"flowgistik": [{"nama": "Bryan", "role": "Sales manager", "phone": "6281284849987"}, {"nama": "Dimas", "role": "Account manager", "phone": "6285771439820"}, {"nama": "Prayoga Pangestu", "role": "Leader Sales Support", "phone": "6285775447954"}, {"nama": "Farah", "role": "Sales Support", "phone": ""}, {"nama": "Faisal Fansuri", "role": "Warehouse manager", "phone": "6289687511835"}, {"nama": "Ahmad", "role": "Supervisor inbound", "phone": "6281293756908"}, {"nama": "Yuda", "role": "Supervisor outbound", "phone": "6285183199345"}], "client": []}, "clientInfo": {"Client Name": "Notes: Notes", "Brand Name": "Easy Day", "Product Category": "Pembalut", "Average order / Day": "700/ Day", "Average order / Month": "21000 / Month", "Average product price": "Rp36.000", "Basket order size": "2", "Product Handling": "Fefo | Notes: To be confirmed ( Dari Flow biasa menerima <1 Years )", "Fulfilment": true, "Live Streaming Studio": false, "Working Space": false, "Delivery - First Mile": false, "Delivery - Middle Mile": false, "Delivery - Lastmile": "True | Notes: Memakai SAP untuk daily order di Webstore", "Service Operational": "Fulfilment, Delivery - Lastmile (Memakai SAP untuk daily order di Webstore)"}, "inbound": {"Total SKU": "Notes: Notes", "Inbound QC": "Visual QC | Notes: Advance QC mengikuti kebutuhan", "Repacking": "Yes | Notes: Repacking mengikuti kebutuhan", "Product Dimenstion": "Small", "Hard Bundling": "No", "Virtual Bundling": "Yes", "Insertion": "No", "Barcode Fisik": "Yes", "SKU & Barcode berbeda": "No", "Channel dengan master item terlengkap": "TikTok"}, "outbound": {"Warehouse location": "Notes: Notes", "Fulfilment by Flowgistik": "Yes", "Inhouse location": "No", "Others third party": "No", "Packing Type": "Standard Packing ( Bubble 2 Lapis + Poly mailer )"}, "inventory": {"Type": "Est Using Storage | Notes: Remarks", "Sharing storage": "22.848 | Notes: 8000 Pcs"}, "workingInstruction": {}}];
let projectionProjects = [];
let activeProjectionId = null;

function pmUid(){ return 'PM-' + Date.now() + '-' + Math.random().toString(16).slice(2); }
function pmEsc(v){ return String(v??'').replace(/[&<>'"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function pmCleanProjectionFields(p){
  if(!p) return p;
  const removeClientKeys=['shopee','active channel','true'];
  if(p.clientInfo){
    Object.keys(p.clientInfo).forEach(k=>{
      if(removeClientKeys.includes(String(k).trim().toLowerCase())) delete p.clientInfo[k];
    });
  }
  if(p.inventory){
    const oldShareKeys=['Sharing storage','Sharing Storage','sharing storage'];
    const oldDedicatedKeys=['Dedicated storage','Dedicated Storage','dedicated storage'];
    const current = p.inventory['Share / Dedicated Storage'];
    const oldValues=[];
    [...oldShareKeys,...oldDedicatedKeys].forEach(k=>{
      if(p.inventory[k]!==undefined && String(p.inventory[k]).trim()!=='') oldValues.push(String(p.inventory[k]).trim());
      delete p.inventory[k];
    });
    Object.keys(p.inventory).forEach(k=>{ if(String(k).trim().toLowerCase()==='type') delete p.inventory[k]; });
    if(current!==undefined && String(current).trim()!=='') p.inventory['Share / Dedicated Storage']=current;
    else p.inventory['Share / Dedicated Storage']=oldValues.join(' / ');
  }
  return p;
}
function pmNormalizeProject(p){
  const base=pmDefaultProject(p?.name||'New Projection',p?.picSales||'',p?.picSalesSupport||'');
  const merged={...base,...p};
  merged.tasks=((p&&p.tasks&&p.tasks.length)?p.tasks:base.tasks).map(t=>({stakeholder:t.stakeholder||'Sales',task:t.task||'',status:t.status||'Open',targetDate:t.targetDate||'',actualDate:t.actualDate||'',notes:t.notes||''}));
  merged.people={flowgistik:(p.people&&p.people.flowgistik)||base.people.flowgistik,client:(p.people&&p.people.client)||base.people.client};
  ['clientInfo','inbound','outbound','inventory','workingInstruction'].forEach(k=>{merged[k]={...(base[k]||{}),...(p[k]||{})};});
  return pmCleanProjectionFields(merged);
}
function pmDefaultProject(name='New Projection', sales='', ss=''){
  const fieldsToObj = arr => Object.fromEntries(arr.map(k=>[k,'']));
  return {
    id: pmUid(),
    name: name || 'New Projection',
    picSales: sales || '',
    picSalesSupport: ss || '',
    openDate: '',
    closedDate: '',
    status: 'Open',
    createdAt: new Date().toISOString(),
    tasks: JSON.parse(JSON.stringify(PM_TEMPLATE.timelineTasks)),
    people: {
      flowgistik: JSON.parse(JSON.stringify(PM_TEMPLATE.flowPeople)),
      client: JSON.parse(JSON.stringify(PM_TEMPLATE.clientPeople))
    },
    clientInfo: fieldsToObj(PM_TEMPLATE.clientFields),
    inbound: fieldsToObj(PM_TEMPLATE.inboundFields),
    outbound: fieldsToObj(PM_TEMPLATE.outboundFields),
    inventory: fieldsToObj(PM_TEMPLATE.inventoryFields),
    workingInstruction: fieldsToObj(PM_TEMPLATE.workingFields)
  };
}
function pmLoad(){
  try{ projectionProjects = JSON.parse(localStorage.getItem('flowgistik_projection_management_v2')||localStorage.getItem('flowgistik_projection_management_v1')||'[]'); }catch(e){ projectionProjects=[]; }
  projectionProjects=(projectionProjects||[]).map(pmNormalizeProject);
  (PM_REGISTERED_PROJECTS||[]).forEach(r=>{
    const exists=projectionProjects.some(p=>String(p.name||'').toLowerCase()===String(r.name||'').toLowerCase() || String(p.id||'')===String(r.id||''));
    if(!exists) projectionProjects.push(pmNormalizeProject(r));
  });
  if(!projectionProjects.length){ projectionProjects = [pmDefaultProject('Sample Projection - New Client','','')]; }
  if(!activeProjectionId || !projectionProjects.some(p=>p.id===activeProjectionId)) activeProjectionId = projectionProjects[0]?.id || null;
  pmSaveAll(false);
  renderProjectionManagement();
}
function pmSaveAll(show=true){
  localStorage.setItem('flowgistik_projection_management_v2', JSON.stringify(projectionProjects));
  if(show) alert('Projection Management tersimpan.');
}
function pmCurrent(){ return projectionProjects.find(p=>p.id===activeProjectionId); }
function pmProgressCalc(p){
  let total = p?.tasks?.length || 0;
  let done = (p?.tasks||[]).filter(t=>String(t.status||'').toLowerCase()==='done').length;
  return {total,done,open:total-done,pct:total?Math.round(done/total*100):0};
}
function togglePmCreate(show){ const p=$('pmCreatePanel'); if(!p)return; p.classList.toggle('hidden', !show); if(show) setTimeout(()=>$('pmNewName')?.focus(),0); }
function showProjectionPage(step){
  const p1=$('pmPage1'), p2=$('pmPage2');
  if(!p1||!p2) return;
  p1.classList.toggle('hidden', step!==1);
  p2.classList.toggle('hidden', step!==2);
  if(step===2) window.scrollTo({top:0,behavior:'smooth'});
}
function backToProjectionStep1(){ showProjectionPage(1); renderProjectionCardsOnly(); pmRefreshStats(); }
function openSelectedProjectionFromDropdown(){
  const id=$('pmProjectSelect')?.value || activeProjectionId;
  if(!id || id==='Belum ada project') return alert('Pilih project dulu atau buat project baru.');
  selectProjectionProject(id);
}
function showPmDetailTab(id,btn){
  document.querySelectorAll('#pmPage2 .pmDetailTabPage').forEach(x=>x.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  document.querySelectorAll('#pmPage2 .pmDetailTabs button').forEach(x=>x.classList.remove('active'));
  btn?.classList.add('active');
}
function createProjectionProject(){
  let name = norm($('pmNewName').value);
  if(!name) return alert('Projection Name wajib diisi.');
  let p = pmDefaultProject(name, $('pmNewSales').value, $('pmNewSS').value);
  p.openDate = $('pmNewOpenDate')?.value || '';
  p.closedDate = $('pmNewClosedDate')?.value || '';
  p.status = $('pmNewStatus')?.value || 'Open';
  projectionProjects.unshift(p);
  activeProjectionId = p.id;
  ['pmNewName','pmNewSales','pmNewSS','pmNewOpenDate','pmNewClosedDate'].forEach(id=>{ if($(id)) $(id).value=''; });
  if($('pmNewStatus')) $('pmNewStatus').value='Open';
  togglePmCreate(false);
  pmSaveAll(false); renderProjectionManagement(); showProjectionPage(2);
}
function selectProjectionProject(id){ activeProjectionId=id; renderProjectionManagement(); showProjectionPage(2); }
function deleteProjectionProject(){
  let p=pmCurrent(); if(!p) return;
  if(!confirm('Delete project '+p.name+'?')) return;
  projectionProjects = projectionProjects.filter(x=>x.id!==p.id);
  activeProjectionId = projectionProjects[0]?.id || null;
  pmSaveAll(false); renderProjectionManagement(); if(!activeProjectionId) showProjectionPage(1);
}
function saveProjectionCurrent(){ pmSaveAll(true); renderProjectionManagement(); }
function resetProjectionDemo(){
  if(!confirm('Reset Projection Management ke data New Projection.xlsx? Data project yang tersimpan di browser akan diganti.')) return;
  projectionProjects=(PM_REGISTERED_PROJECTS&&PM_REGISTERED_PROJECTS.length?PM_REGISTERED_PROJECTS:[pmDefaultProject('Sample Projection - New Client','','')]).map(pmNormalizeProject);
  activeProjectionId=projectionProjects[0]?.id || null;
  pmSaveAll(false); renderProjectionManagement(); showProjectionPage(1);
}
function pmSetMeta(key,val){ let p=pmCurrent(); if(!p) return; p[key]=val; if(key==='name') renderProjectionCardsOnly(); pmRefreshStats(); }
function renderProjectionManagement(){
  renderProjectionCardsOnly();
  renderProjectionDetail();
  pmRefreshStats();
}
function renderProjectionCardsOnly(){
  const wrap=$('pmProjectList'); if(!wrap) return;
  const q=norm($('pmSearchProject')?.value||'').toLowerCase();
  const st=norm($('pmFilterStatus')?.value||'');
  const filtered=projectionProjects.filter(p=>(!q || String(p.name||'').toLowerCase().includes(q) || String(p.picSales||'').toLowerCase().includes(q) || String(p.picSalesSupport||'').toLowerCase().includes(q)) && (!st || p.status===st));
  const sel=$('pmProjectSelect');
  if(sel){
    sel.innerHTML=projectionProjects.length ? projectionProjects.map(p=>`<option value="${p.id}" ${p.id===activeProjectionId?'selected':''}>${p.name||'-'} • ${p.status||'Open'}</option>`).join('') : '<option>Belum ada project</option>';
    if(activeProjectionId) sel.value=activeProjectionId;
  }
  if(!projectionProjects.length){ wrap.innerHTML='<div class="pmEmpty">Belum ada project. Klik Create New Project untuk mulai.</div>'; return; }
  if(!filtered.length){ wrap.innerHTML='<div class="pmEmpty">Project tidak ditemukan. Ubah filter atau buat project baru.</div>'; return; }
  wrap.innerHTML=filtered.map(p=>{
    const pr=pmProgressCalc(p);
    return `<div class="pmProjectCard ${p.id===activeProjectionId?'active':''}" onclick="selectProjectionProject('${p.id}')">
      <b>${pmEsc(p.name||'-')}</b>
      <span>Sales: ${pmEsc(p.picSales||'-')} • SS: ${pmEsc(p.picSalesSupport||'-')}</span>
      <span>Status: ${pmEsc(p.status||'Open')} • ${pr.done}/${pr.total} task done</span>
      <div class="pmBar"><i style="width:${pr.pct}%"></i></div>
    </div>`;
  }).join('');
}
function pmRefreshStats(){
  if(!$('pmTotalProjects')) return;
  let p=pmCurrent(); let pr=pmProgressCalc(p);
  $('pmTotalProjects').textContent=projectionProjects.length;
  $('pmOpenTasks').textContent=pr.open;
  $('pmDoneTasks').textContent=pr.done;
  $('pmProgress').textContent=pr.pct+'%';
}
function renderProjectionDetail(){
  const detail=$('pmDetail'); if(!detail) return;
  let p=pmCurrent();
  if(!p){ detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  $('pmActiveTitle').textContent=p.name||'Project Detail';
  $('pmActiveSub').textContent=`PIC Sales: ${p.picSales||'-'} • PIC Sales Support: ${p.picSalesSupport||'-'}`;
  $('pmName').value=p.name||''; $('pmSales').value=p.picSales||''; $('pmSS').value=p.picSalesSupport||''; $('pmOpenDate').value=p.openDate||''; $('pmClosedDate').value=p.closedDate||''; $('pmStatus').value=p.status||'Open';
  renderPmTimeline(p); renderPmPeople(p); renderPmFields(p);
}
function renderPmTimeline(p){
  const stakeholders=['Sales','Sales Support','Operation','IT'];
  const board=$('pmTimelineBoard'); if(!board) return;
  board.innerHTML=stakeholders.map(st=>{
    const tasks=(p.tasks||[]).map((t,i)=>({...t,idx:i})).filter(t=>String(t.stakeholder||'')===st);
    return `<div class="pmTimelineGroup"><h3><span>${pmEsc(st)}</span><span class="small">${tasks.length} task</span></h3>` + (tasks.length?tasks.map((t,n)=>{
      const status=String(t.status||'Open');
      const cls=status==='Done'?'done':status==='On Progress'?'progress':status==='Hold'?'hold':'open';
      return `<div class="pmTaskCard">
        <div class="pmTaskCardTop"><span class="pmTaskNo">${n+1}</span><div style="flex:1"><b>${pmEsc(t.task)}</b><span class="pmStatusPill ${cls}">${pmEsc(status)}</span></div></div>
        <div class="pmTaskMeta">
          <label>Status</label>
          <select onchange="pmUpdateTask(${t.idx},'status',this.value)"><option ${status==='Open'?'selected':''}>Open</option><option ${status==='On Progress'?'selected':''}>On Progress</option><option ${status==='Hold'?'selected':''}>Hold</option><option ${status==='Done'?'selected':''}>Done</option></select>
          <label>Target / Submit Date</label>
          <input type="date" value="${pmEsc(t.targetDate||'')}" onchange="pmUpdateTask(${t.idx},'targetDate',this.value)">
          <label>Actual / Finished Date</label>
          <input type="date" value="${pmEsc(t.actualDate||'')}" onchange="pmUpdateTask(${t.idx},'actualDate',this.value)">
        </div>
        <textarea placeholder="Notes untuk ${pmEsc(t.task)}" onchange="pmUpdateTask(${t.idx},'notes',this.value)">${pmEsc(t.notes||'')}</textarea>
        <button class="secondary smallBtn" onclick="pmDeleteTask(${t.idx})">Delete Task</button>
      </div>`;
    }).join(''):'<div class="pmEmpty">Belum ada task untuk stakeholder ini.</div>') + `</div>`;
  }).join('');
}
function pmUpdateTask(idx,key,val){ let p=pmCurrent(); if(!p||!p.tasks[idx])return; p.tasks[idx][key]=val; pmSaveAll(false); renderPmTimeline(p); renderProjectionCardsOnly(); pmRefreshStats(); }
function pmDeleteTask(idx){ let p=pmCurrent(); if(!p)return; p.tasks.splice(idx,1); pmSaveAll(false); renderProjectionDetail(); renderProjectionCardsOnly(); pmRefreshStats(); }
function addProjectionTask(){
  let p=pmCurrent(); if(!p)return;
  let task=norm($('pmAddTaskText').value); if(!task) return alert('Isi task dulu.');
  p.tasks.push({stakeholder:$('pmAddStakeholder').value,task,status:'Open',targetDate:'',actualDate:'',notes:''});
  $('pmAddTaskText').value=''; pmSaveAll(false); renderProjectionDetail(); renderProjectionCardsOnly(); pmRefreshStats();
}
function renderPmPeople(p){
  function table(type){
    const rows=p.people[type]||[];
    return `<table><thead><tr><th>Nama</th><th>Role</th><th>Nomor Telfon</th><th></th></tr></thead><tbody>`+
    rows.map((r,i)=>`<tr>
      <td><input value="${r.nama||''}" onchange="pmSetPerson('${type}',${i},'nama',this.value)"></td>
      <td><input value="${r.role||''}" onchange="pmSetPerson('${type}',${i},'role',this.value)"></td>
      <td><input value="${r.phone||''}" onchange="pmSetPerson('${type}',${i},'phone',this.value)"></td>
      <td><button class="secondary smallBtn" onclick="deletePmPerson('${type}',${i})">Delete</button></td>
    </tr>`).join('')+`</tbody></table>`;
  }
  $('pmFlowPeople').innerHTML=table('flowgistik');
  $('pmClientPeople').innerHTML=table('client');
}
function addPmPerson(type){ let p=pmCurrent(); if(!p)return; if(!p.people[type])p.people[type]=[]; p.people[type].push({nama:'',role:'',phone:''}); pmSaveAll(false); renderPmPeople(p); }
function deletePmPerson(type,i){ let p=pmCurrent(); if(!p)return; p.people[type].splice(i,1); pmSaveAll(false); renderPmPeople(p); }
function pmSetPerson(type,i,key,val){ let p=pmCurrent(); if(!p)return; p.people[type][i][key]=val; pmSaveAll(false); }
function renderFieldGroup(obj,containerId,groupKey){
  const blockedClient=['shopee','active channel','true'];
  const blockedInventory=['type','sharing storage','dedicated storage'];
  const keys=Object.keys(obj||{}).filter(k=>{
    const key=String(k).trim().toLowerCase();
    if(groupKey==='clientInfo' && blockedClient.includes(key)) return false;
    if(groupKey==='inventory' && blockedInventory.includes(key)) return false;
    return true;
  });
  $(containerId).innerHTML=keys.map(k=>`<div class="pmInputRow"><label>${pmEsc(k)}</label><input value="${pmEsc(obj[k]||'')}" onchange="pmSetField('${groupKey}','${String(k).replace(/'/g,"\\'")}',this.value)"></div>`).join('');
}
function renderPmFields(p){
  pmCleanProjectionFields(p);
  renderFieldGroup(p.clientInfo,'pmClientInfo','clientInfo');
  renderFieldGroup(p.inbound,'pmInbound','inbound');
  renderFieldGroup(p.outbound,'pmOutbound','outbound');
  renderFieldGroup(p.inventory,'pmInventory','inventory');
  renderFieldGroup(p.workingInstruction,'pmWorkingInstruction','workingInstruction');
}
function pmSetField(group,key,val){ let p=pmCurrent(); if(!p)return; if(!p[group])p[group]={}; p[group][key]=val; pmSaveAll(false); }
function downloadProjectionTemplate(){ saveBlob(b64ToBytes(PM_TEMPLATE.templateB64),'Template projection checklist.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
function projectionWorkbook(projects,filename){
  if(!window.XLSX) return alert('Library Excel belum termuat. Pastikan internet aktif lalu refresh.');
  let wb=XLSX.utils.book_new();
  let projectRows=projects.map(p=>({'Projection Name':p.name,'PIC Sales':p.picSales,'PIC Sales Support':p.picSalesSupport,'Open Date':p.openDate,'Closed Date':p.closedDate,'Status':p.status,'Progress':pmProgressCalc(p).pct+'%'}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(projectRows),'Create New Project');
  let timeline=[];
  projects.forEach(p=>(p.tasks||[]).forEach(t=>timeline.push({'Projection Name':p.name,'Stakeholder':t.stakeholder,'Task':t.task,'Status':t.status,'Target Date':t.targetDate,'Actual Date':t.actualDate,'Notes':t.notes})));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(timeline),'Projection Timeline');
  let info=[];
  projects.forEach(p=>{
    pmCleanProjectionFields(p);
    Object.entries(p.clientInfo||{}).forEach(([k,v])=>info.push({'Projection Name':p.name,'Section':'Client Information & Volume','Field':k,'Value':v}));
    Object.entries(p.inbound||{}).forEach(([k,v])=>info.push({'Projection Name':p.name,'Section':'Inbound Requirement','Field':k,'Value':v}));
    Object.entries(p.outbound||{}).forEach(([k,v])=>info.push({'Projection Name':p.name,'Section':'Outbound Requirement','Field':k,'Value':v}));
    Object.entries(p.inventory||{}).forEach(([k,v])=>info.push({'Projection Name':p.name,'Section':'Inventory Requirement','Field':k,'Value':v}));
    Object.entries(p.workingInstruction||{}).forEach(([k,v])=>info.push({'Projection Name':p.name,'Section':'Working Instruction File','Field':k,'Value':v}));
    (p.people?.flowgistik||[]).forEach(x=>info.push({'Projection Name':p.name,'Section':'Matriks Komunikasi - Internal Flowgistik','Field':x.nama,'Value':`${x.role||''} | ${x.phone||''}`}));
    (p.people?.client||[]).forEach(x=>info.push({'Projection Name':p.name,'Section':'Matriks Komunikasi - Eksternal Client','Field':x.nama,'Value':`${x.role||''} | ${x.phone||''}`}));
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(info),'Client Information');
  XLSX.writeFile(wb,filename);
}
function exportProjectionProject(){ let p=pmCurrent(); if(!p)return alert('Pilih project dulu.'); projectionWorkbook([p],`Projection_Management_${(p.name||'Project').replace(/[^a-z0-9]/gi,'_')}.xlsx`); }
function exportAllProjectionProjects(){ if(!projectionProjects.length)return alert('Belum ada project.'); projectionWorkbook(projectionProjects,'Projection_Management_All_Projects.xlsx'); }

// Auto init projection after all scripts loaded
setTimeout(pmLoad,0);


/* Merge Splitter */
let splitterWB=null, splitterSheetName=null, splitterRawRows=[];
function resetSplitter(){
  splitterWB=null; splitterSheetName=null; splitterRawRows=[];
  if($('splitterFile')) $('splitterFile').value='';
  if($('splitterSourceSheet')) $('splitterSourceSheet').innerHTML='';
  if($('splitterTotalRows')) $('splitterTotalRows').textContent='0';
  if($('splitterSize')) $('splitterSize').textContent='0';
  if($('splitterSheets')) $('splitterSheets').textContent='0';
  if($('splitterStatus')) $('splitterStatus').textContent='Ready';
  if($('splitterInfo')) $('splitterInfo').textContent='Belum ada file diupload.';
  if($('splitterPreview')) $('splitterPreview').innerHTML='';
}
async function handleSplitterFile(e){
  const file=e.target.files[0];
  if(!file) return;
  try{
    const data=await readFile(file);
    splitterWB=XLSX.read(data,{type:'array',cellDates:true});
    splitterSheetName=splitterWB.SheetNames[0];
    $('splitterSourceSheet').innerHTML=splitterWB.SheetNames.map(s=>`<option>${s}</option>`).join('');
    loadSplitterRows();
    $('splitterStatus').textContent='Loaded';
    $('splitterInfo').innerHTML=`File berhasil dibaca: <b>${file.name}</b>`;
    previewSplitter();
  }catch(err){
    $('splitterStatus').textContent='Error';
    $('splitterInfo').textContent='Gagal membaca file: '+err.message;
  }
}
function selectSplitterSheet(){
  if(!splitterWB) return;
  splitterSheetName=$('splitterSourceSheet').value;
  loadSplitterRows();
  previewSplitter();
}
function loadSplitterRows(){
  const ws=splitterWB.Sheets[splitterSheetName];
  splitterRawRows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
}
function getSplitterData(){
  const hRow=Math.max(1,Number($('splitterHeaderRow').value||1));
  const headerIndex=hRow-1;
  const header=splitterRawRows[headerIndex]||[];
  const dataRows=splitterRawRows.slice(headerIndex+1).filter(r=>r.some(c=>String(c).trim()!==''));
  return {header,dataRows};
}
function previewSplitter(){
  if(!splitterWB || !splitterRawRows.length){
    if($('splitterInfo')) $('splitterInfo').textContent='Upload file dulu untuk preview.';
    return;
  }
  const split=Math.max(1,Number($('splitterRowSize').value||1000));
  const {dataRows}=getSplitterData();
  const total=dataRows.length;
  const sheets=Math.ceil(total/split);
  $('splitterTotalRows').textContent=total.toLocaleString('id-ID');
  $('splitterSize').textContent=split.toLocaleString('id-ID');
  $('splitterSheets').textContent=sheets.toLocaleString('id-ID');
  $('splitterStatus').textContent='Preview';
  let html='<table><thead><tr><th>Sheet Hasil</th><th>Row Mulai</th><th>Row Akhir</th><th>Total Row</th></tr></thead><tbody>';
  for(let i=0;i<sheets;i++){
    const start=i*split+1;
    const end=Math.min((i+1)*split,total);
    const count=end-start+1;
    html+=`<tr><td>${$('splitterPrefix').value||'Batch'}_${String(i+1).padStart(3,'0')}</td><td>${start}</td><td>${end}</td><td>${count}</td></tr>`;
  }
  html+='</tbody></table>';
  $('splitterPreview').innerHTML=html;
}
function safeSheetName(name){
  return String(name).replace(/[\\\/\?\*\[\]\:]/g,' ').slice(0,31);
}
function splitterDownload(){
  if(!splitterWB) return alert('Upload file dulu.');
  const split=Math.max(1,Number($('splitterRowSize').value||1000));
  const prefix=norm($('splitterPrefix').value)||'Batch';
  const {header,dataRows}=getSplitterData();
  if(!header.length) return alert('Header kosong. Cek setting header row.');
  if(!dataRows.length) return alert('Tidak ada data row untuk displit.');

  const newWB=XLSX.utils.book_new();
  let totalWritten=0;
  const totalSheets=Math.ceil(dataRows.length/split);

  for(let i=0;i<totalSheets;i++){
    const part=dataRows.slice(i*split,(i+1)*split);
    totalWritten+=part.length;
    const ws=XLSX.utils.aoa_to_sheet([header,...part]);
    XLSX.utils.book_append_sheet(newWB,ws,safeSheetName(`${prefix}_${String(i+1).padStart(3,'0')}`));
  }

  const summary=[
    ['Source Sheet',splitterSheetName],
    ['Header Row',Number($('splitterHeaderRow').value||1)],
    ['Total Source Data Row',dataRows.length],
    ['Total Written Row',totalWritten],
    ['Split Size',split],
    ['Total Output Sheet',totalSheets],
    ['Validation',dataRows.length===totalWritten?'MATCH - tidak ada row skip':'ERROR - row tidak match']
  ];
  XLSX.utils.book_append_sheet(newWB,XLSX.utils.aoa_to_sheet(summary),'Summary');

  if(dataRows.length!==totalWritten){
    $('splitterStatus').textContent='Error';
    $('splitterInfo').textContent='ERROR: total row source dan hasil split tidak match. File tidak didownload.';
    return;
  }

  XLSX.writeFile(newWB,`FLOWGISTIK_MERGE_SPLITTER_${dataRows.length}_rows_${split}_per_sheet.xlsx`);
  $('splitterStatus').textContent='Done';
  $('splitterInfo').innerHTML=`Sukses split <b>${dataRows.length.toLocaleString('id-ID')}</b> row menjadi <b>${totalSheets}</b> sheet. Validasi MATCH, tidak ada row skip.`;
}


/* Projection Management Final JS */
let pmProjects=[], pmCurrentId=null, pmDetailTab='timeline';
let pmSelectedTaskIds=[];
const PM_STORE='flowgistik_projection_management_v1';
const pmDepartments=['Sales','Sales Support','Operations','Technology'];
const pmDefaultTasks={
  'Sales':['Kickoff & confirm client PIC','Collect commercial agreement status','Confirm expectation first inbound/outbound'],
  'Sales Support':['Create projection checklist','Prepare master data/template request','Follow up missing client requirement'],
  'Operations':['Review inbound/outbound requirement','Confirm warehouse location & handling notes','Validate packing/storage needs'],
  'Technology':['Check integration/channel requirement','Prepare data mapping/import export','Validate URL attachment & working instruction']
};
const pmChannels=['Shopee','TikTok / Tokopedia','Lazada','BliBli','Bukalapak','Zalora','Akulaku','Shopify','Woocommerce','Own Development'];
const pmServices=['Fulfilment','Live Streaming Studio','Working Space','Delivery - First Mile','Delivery - Middle Mile','Delivery - Lastmile'];
const pmInboundReq=['Inbound QC','Repacking','Product Dimenstion','Hard Bundling','Virtual Bundling','Insertion','Barcode Fisik','SKU & Barcode berbeda','Channel dengan master item terlengkap'];
const pmOutboundReq=['Picking Special Notes','Packing Special Notes','Others Working Instruction'];
const pmInventoryReq=['Storage Location Type','Total Cbm Needs'];
const pmAttachmentReq=['Working Instruction Inbound','Working Instruction Return','Working Instruction Picking','Working Instruction Packing'];
function pmEsc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function pmId(){return 'PM'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function pmToday(){return new Date().toISOString().slice(0,10)}
function pmLoad(){try{pmProjects=JSON.parse(localStorage.getItem(PM_STORE)||'[]')}catch(e){pmProjects=[]}}
function pmSave(){localStorage.setItem(PM_STORE,JSON.stringify(pmProjects))}
function pmNewProjectBase(data){
  let tasks=[];
  pmDepartments.forEach(dep=>(pmDefaultTasks[dep]||[]).forEach(t=>tasks.push({id:pmId(),department:dep,activity:t,openDate:pmToday(),closedDate:'',status:'Open',notes:''})));
  return {
    id:pmId(), createdAt:new Date().toISOString(),
    clientName:data.clientName||'', brandName:data.brandName||'', salesPic:data.salesPic||'', ssPic:data.ssPic||'',
    firstInbound:data.firstInbound||'', firstOutbound:data.firstOutbound||'', estimatedRevenueMonth:data.estimatedRevenueMonth||'',
    tasks,
    clientInfo:{productCategory:'',warehouseLocation:'',avgOrderDay:'',avgOrderMonth:'',avgProductPrice:'',basketOrderSize:'',productSize:'',productHandling:''},
    channels:{}, services:{}, inbound:{}, outbound:{}, inventory:{}, attachments:{}, attachmentsFiles:{},
    matrix:{internal:[{name:'',phone:'',role:''}], external:[{name:'',phone:'',role:''}]}
  }
}
function pmInit(){
  pmLoad();
  if(!pmProjects.length){
    pmProjects.push(pmNewProjectBase({clientName:'Sample Project',brandName:'Sample Brand',salesPic:'Sales PIC',ssPic:'Sales Support PIC'}));
    pmSave();
  }
  pmRenderHome();
}
function pmStats(pr){
  const total=pr.tasks.length, closed=pr.tasks.filter(t=>t.status==='Closed').length, open=pr.tasks.filter(t=>t.status==='Open').length, progress=pr.tasks.filter(t=>t.status==='Progress').length, hold=pr.tasks.filter(t=>t.status==='Hold').length;
  return {total,closed,open,progress,hold,pct:total?Math.round(closed/total*100):0};
}
function pmRenderHome(){
  pmCurrentId=null;
  const root=$('pmRoot'); if(!root) return;
  const total=pmProjects.length, taskTotal=pmProjects.reduce((a,p)=>a+p.tasks.length,0), taskClosed=pmProjects.reduce((a,p)=>a+p.tasks.filter(t=>t.status==='Closed').length,0);
  root.innerHTML=`
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left">
          <span class="pmPill">Step 1 · Select / Create Project</span>
          <input id="pmSearch" placeholder="Cari project/client/brand/PIC..." oninput="pmRenderProjectList()" style="min-width:260px">
          <select id="pmStatusFilter" onchange="pmRenderProjectList()">
            <option value="">Semua progress</option><option value="open">Masih berjalan</option><option value="done">Selesai 100%</option>
          </select>
        </div>
        <div class="right">
          <button class="primary" onclick="pmToggleCreate()">+ Create New Project</button>
          <button class="secondary" onclick="pmExportAll()">Export All Excel</button>
          <button class="secondary" onclick="pmDownloadProjectTemplate()">Download Template</button>
          <input type="file" id="pmImportFile" accept=".xlsx,.xls,.csv" onchange="pmImportExcel(event)" style="max-width:230px">
        </div>
      </div>
      <div class="pmKpiSmall">
        <div><b>${total}</b><span>Total Project</span></div>
        <div><b>${taskTotal}</b><span>Total Task</span></div>
        <div><b>${taskClosed}</b><span>Task Closed</span></div>
        <div><b>${taskTotal-taskClosed}</b><span>Task Belum Closed</span></div>
        <div><b>${taskTotal?Math.round(taskClosed/taskTotal*100):0}%</b><span>Overall Progress</span></div>
      </div>
      <div id="pmCreateBox" class="pmCreateBox pmHidden">
        <h3 style="margin:0 0 12px;color:#4c1d95">Add New Projection</h3>
        <div class="pmFormGrid4">
          <div><label class="pmLabel">Client Name</label><input id="pmNewClient" placeholder="Nama client/project"></div>
          <div><label class="pmLabel">Brand Name</label><input id="pmNewBrand" placeholder="Nama brand"></div>
          <div><label class="pmLabel">Sales PIC</label><input id="pmNewSales" placeholder="Sales PIC"></div>
          <div><label class="pmLabel">Sales Support PIC</label><input id="pmNewSS" placeholder="Sales Support PIC"></div>
          <div><label class="pmLabel">Ekspetasi First Inbound</label><input type="date" id="pmNewInbound"></div>
          <div><label class="pmLabel">Ekspetasi First Outbound</label><input type="date" id="pmNewOutbound"></div>
          <div><label class="pmLabel">Estimasi Revenue / Month</label><input id="pmNewRevenue" placeholder="IDR 0"></div>
        </div>
        <div class="btns"><button class="primary" onclick="pmCreateProject()">Create Project</button><button class="secondary" onclick="pmToggleCreate()">Cancel</button></div>
      </div>
      <div id="pmProjectList" class="pmListGrid"></div>
    </div>`;
  pmRenderProjectList();
}
function pmToggleCreate(){ $('pmCreateBox').classList.toggle('pmHidden') }
function pmRenderProjectList(){
  const el=$('pmProjectList'); if(!el) return;
  const q=($('pmSearch')?.value||'').toLowerCase(), filter=$('pmStatusFilter')?.value||'';
  const list=pmProjects.filter(p=>{
    const st=pmStats(p); const txt=[p.clientName,p.brandName,p.salesPic,p.ssPic].join(' ').toLowerCase();
    return (!q || txt.includes(q)) && (!filter || (filter==='done'?st.pct===100:st.pct<100));
  });
  if(!list.length){el.innerHTML='<div class="pmEmpty">Belum ada project yang cocok.</div>';return}
  el.innerHTML=list.map(p=>{const st=pmStats(p);return `
    <div class="pmCardProject" onclick="pmOpenProject('${p.id}')">
      <h3>${pmEsc(p.clientName||'Untitled Project')}</h3>
      <p><b>Brand:</b> ${pmEsc(p.brandName||'-')}</p>
      <p><b>Sales:</b> ${pmEsc(p.salesPic||'-')} · <b>SS:</b> ${pmEsc(p.ssPic||'-')}</p>
      <p><b>Inbound:</b> ${pmEsc(p.firstInbound||'-')} · <b>Outbound:</b> ${pmEsc(p.firstOutbound||'-')} · <b>Revenue / Month:</b> ${pmEsc(p.estimatedRevenueMonth||'-')}</p>
      <div class="pmProgress"><i style="width:${st.pct}%"></i></div>
      <p><b>${st.pct}%</b> selesai · ${st.closed}/${st.total} task closed</p>
    </div>`}).join('');
}
function pmCreateProject(){
  const data={clientName:$('pmNewClient').value.trim(),brandName:$('pmNewBrand').value.trim(),salesPic:$('pmNewSales').value.trim(),ssPic:$('pmNewSS').value.trim(),firstInbound:$('pmNewInbound').value,firstOutbound:$('pmNewOutbound').value,estimatedRevenueMonth:($('pmNewRevenue')?.value||'').trim()};
  if(!data.clientName) return alert('Client Name wajib diisi.');
  const p=pmNewProjectBase(data); pmProjects.unshift(p); pmSave(); pmOpenProject(p.id);
}
function pmFind(id=pmCurrentId){return pmProjects.find(p=>p.id===id)}
function pmOpenProject(id){pmCurrentId=id; pmDetailTab='timeline'; pmSelectedTaskIds=[]; pmRenderDetail()}
function pmBackHome(){pmRenderHome()}
function pmRenderDetail(){
  const p=pmFind(); if(!p) return pmRenderHome();
  const st=pmStats(p);
  $('pmRoot').innerHTML=`
    <div class="card">
      <div class="pmDetailTop">
        <div>
          <span class="pmPill">Step 2 · Project Detail</span>
          <h2>${pmEsc(p.clientName||'Untitled Project')}</h2>
          <p>Brand: <b>${pmEsc(p.brandName||'-')}</b> · Sales PIC: <b>${pmEsc(p.salesPic||'-')}</b> · Sales Support PIC: <b>${pmEsc(p.ssPic||'-')}</b></p>
        </div>
        <div class="btns" style="margin:0">
          <button class="secondary" onclick="pmBackHome()">← Back to Project List</button>
          <button class="secondary" onclick="pmExportProject()">Export Project Excel</button>
          <button class="secondary" onclick="pmDuplicateProject()">Duplicate</button>
          <button class="secondary" onclick="pmDeleteProject()">Delete</button>
        </div>
      </div>
      <div class="pmKpiSmall">
        <div><b>${st.total}</b><span>Total Task</span></div>
        <div><b>${st.open}</b><span>Open</span></div>
        <div><b>${st.progress}</b><span>Progress</span></div>
        <div><b>${st.hold}</b><span>Hold</span></div>
        <div><b>${st.closed}</b><span>Closed</span></div>
      </div>
      <div class="pmChartRow">
        <div class="pmDonut" style="--pct:${st.pct*3.6}deg"><b>${st.pct}%</b></div>
        <div>
          <div class="pmProgress"><i style="width:${st.pct}%"></i></div>
          <p style="margin-top:10px">Monitoring progress: <b>${st.closed}</b> task selesai dan <b>${st.total-st.closed}</b> task belum selesai.</p>
        </div>
      </div>
      <div class="pmDetailTabs">
        <button class="${pmDetailTab==='timeline'?'active':''}" onclick="pmSwitchTab('timeline')">Projection Timeline</button>
        <button class="${pmDetailTab==='client'?'active':''}" onclick="pmSwitchTab('client')">Client Requirement</button>
      </div>
      <div id="pmDetailBody"></div>
    </div>`;
  pmRenderTab();
}
function pmSwitchTab(tab){pmDetailTab=tab; pmRenderDetail()}
function pmRenderTab(){pmDetailTab==='client'?pmRenderClient():pmRenderTimeline()}
function pmDepartmentStats(pr){
  return pmDepartments.map(dep=>{
    const tasks=(pr.tasks||[]).filter(t=>String(t.department||'')===dep);
    const closed=tasks.filter(t=>String(t.status||'')==='Closed').length;
    const pending=Math.max(tasks.length-closed,0);
    const pct=tasks.length?Math.round((closed/tasks.length)*100):0;
    return {department:dep,total:tasks.length,closed,pending,pct};
  });
}
function pmRenderTimeline(){
  const p=pmFind(), body=$('pmDetailBody');
  const overall=pmStats(p);
  const deptStats=pmDepartmentStats(p);
  body.innerHTML=`
    <div class="pmAnalyticsWrap">
      <div class="pmAnalyticsCard">
        <div class="pmOverallTitle">
          <div>
            <span class="pmPill">Project Completion</span>
            <h3>Overall Progress Project</h3>
            <div class="pmOverallMeta">Progress total project berdasarkan semua task yang sudah berstatus Closed.</div>
          </div>
          <div class="pmAnalyticsPct">${overall.pct}%</div>
        </div>
        <div class="pmOverallBar">
          <div class="pmStackBar">
            <span class="done" style="width:${overall.pct}%"></span>
            <span class="pending" style="width:${100-overall.pct}%"></span>
          </div>
        </div>
        <div class="pmLegend"><span><i class="doneDot"></i> Selesai</span><span><i class="pendingDot"></i> Belum selesai</span></div>
        <div class="pmAnalyticsNums">
          <div><b>${overall.closed}</b><span>Task Selesai</span></div>
          <div><b>${overall.total-overall.closed}</b><span>Task Belum Selesai</span></div>
          <div><b>${overall.total}</b><span>Total Task</span></div>
        </div>
      </div>
      <div class="pmAnalyticsGrid">
        ${deptStats.map(d=>`
          <div class="pmAnalyticsCard">
            <div class="pmAnalyticsHead">
              <h3>${pmEsc(d.department)}</h3>
              <div class="pmAnalyticsPct">${d.pct}%</div>
            </div>
            <div class="pmStackBar">
              <span class="done" style="width:${d.pct}%"></span>
              <span class="pending" style="width:${100-d.pct}%"></span>
            </div>
            <div class="pmLegend"><span><i class="doneDot"></i> ${d.closed} selesai</span><span><i class="pendingDot"></i> ${d.pending} belum selesai</span></div>
            <div class="pmAnalyticsNums">
              <div><b>${d.closed}</b><span>Selesai</span></div>
              <div><b>${d.pending}</b><span>Belum</span></div>
              <div><b>${d.total}</b><span>Total</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="pmHeaderActions pmTaskImportBar" style="margin-bottom:12px">
      <div class="left">
        <span class="pmPill">Timeline by Stakeholder</span>
        <span class="small">Upload template untuk menambah banyak task sekaligus.</span>
      </div>
      <div class="right">
        <select id="pmAddDept" title="Stakeholder untuk task manual opsional">${pmDepartments.map(d=>`<option>${d}</option>`).join('')}</select>
        <input id="pmAddActivity" placeholder="Task manual opsional">
        <button class="primary" onclick="pmAddTask()">Add Task</button>
        <button class="secondary" onclick="pmDownloadTaskTemplate()">Download Task Template</button>
        <label class="secondary pmFileLabel">Import Task Massal<input type="file" accept=".xlsx,.xls,.csv" onchange="pmImportTaskExcel(event)"></label>
        <button class="secondary" onclick="pmClearTaskSelection()">Clear Checklist</button>
        <button class="secondary pmBulkDeleteBtn" onclick="pmDeleteSelectedTasks()">Delete Checked (${pmSelectedTaskIds.length})</button>
      </div>
    </div>
    <div class="pmBoardFinal">${pmDepartments.map(dep=>pmLaneHtml(dep,p.tasks.filter(t=>t.department===dep))).join('')}</div>`;
}
function pmLaneHtml(dep,tasks){
  const allChecked = tasks.length && tasks.every(t=>pmSelectedTaskIds.includes(t.id));
  return `<div class="pmLaneFinal">
    <h3 class="pmLaneHead">
      <span>${dep}</span>
      <div class="pmLaneTools">
        <label class="pmCheckAll"><input type="checkbox" ${allChecked?'checked':''} onchange="pmToggleDepartmentSelection('${dep}',this.checked)"> Checklist all</label>
        <span>${tasks.length} task</span>
      </div>
    </h3>
    ${tasks.map(t=>pmTaskHtml(t)).join('')||'<div class="pmEmpty">Belum ada task.</div>'}
  </div>`;
}
function pmTaskHtml(t){
  const checked = pmSelectedTaskIds.includes(t.id);
  return `<div class="pmTaskFinal ${checked?'isSelected':''}">
    <div class="pmTaskToolbar"><label class="pmTaskCheck"><input type="checkbox" ${checked?'checked':''} onchange="pmToggleTaskSelection('${t.id}',this.checked)"> Checklist delete</label></div>
    <div class="taskTitle">${pmEsc(t.activity||'Untitled Task')}</div>
    <span class="pmStatus ${pmEsc(t.status)}">${pmEsc(t.status)}</span>
    <div class="meta">
      <div><label class="pmLabel">Open Date</label><input type="date" value="${pmEsc(t.openDate)}" onchange="pmUpdateTask('${t.id}','openDate',this.value)"></div>
      <div><label class="pmLabel">Closed Date</label><input type="date" value="${pmEsc(t.closedDate)}" onchange="pmUpdateTask('${t.id}','closedDate',this.value)"></div>
      <div><label class="pmLabel">Status</label><select onchange="pmUpdateTask('${t.id}','status',this.value)">${['Open','Progress','Closed','Hold'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <label class="pmLabel">Task Activity</label><textarea onchange="pmUpdateTask('${t.id}','activity',this.value)">${pmEsc(t.activity)}</textarea>
    <label class="pmLabel">Notes</label><textarea onchange="pmUpdateTask('${t.id}','notes',this.value)">${pmEsc(t.notes)}</textarea>
    <div class="btns"><button class="secondary smallBtn" onclick="pmDeleteTask('${t.id}')">Delete Task</button></div>
  </div>`;
}
function pmUpdateTask(id,key,value){
  const p=pmFind(); const t=p.tasks.find(x=>x.id===id); if(!t) return;
  t[key]=value; if(key==='status' && value==='Closed' && !t.closedDate) t.closedDate=pmToday();
  pmSave(); pmRenderDetail();
}
function pmAddTask(){
  const p=pmFind(), activity=$('pmAddActivity').value.trim(), dep=$('pmAddDept').value;
  if(!activity) return alert('Isi task/activity dulu.');
  p.tasks.push({id:pmId(),department:dep,activity,openDate:pmToday(),closedDate:'',status:'Open',notes:''});
  pmSave(); pmRenderDetail();
}
function pmToggleTaskSelection(id,checked){
  if(checked){ if(!pmSelectedTaskIds.includes(id)) pmSelectedTaskIds.push(id); }
  else{ pmSelectedTaskIds = pmSelectedTaskIds.filter(x=>x!==id); }
  pmRenderDetail();
}
function pmToggleDepartmentSelection(dep,checked){
  const p=pmFind(); const ids=(p?.tasks||[]).filter(t=>t.department===dep).map(t=>t.id);
  if(checked){ ids.forEach(id=>{ if(!pmSelectedTaskIds.includes(id)) pmSelectedTaskIds.push(id); }); }
  else{ pmSelectedTaskIds = pmSelectedTaskIds.filter(id=>!ids.includes(id)); }
  pmRenderDetail();
}
function pmClearTaskSelection(){ pmSelectedTaskIds=[]; pmRenderDetail(); }
function pmDeleteSelectedTasks(){
  const ids=[...pmSelectedTaskIds];
  if(!ids.length) return alert('Checklist task yang mau dihapus dulu.');
  if(!confirm('Hapus '+ids.length+' task terpilih?')) return;
  const p=pmFind(); p.tasks=p.tasks.filter(t=>!ids.includes(t.id)); pmSelectedTaskIds=[]; pmSave(); pmRenderDetail();
}
function pmDeleteTask(id){
  if(!confirm('Hapus task ini?')) return;
  const p=pmFind(); p.tasks=p.tasks.filter(t=>t.id!==id); pmSelectedTaskIds=pmSelectedTaskIds.filter(x=>x!==id); pmSave(); pmRenderDetail();
}
function pmSet(path,value,rerender=false){
  const p=pmFind(); const parts=path.split('.'); let o=p;
  for(let i=0;i<parts.length-1;i++){ if(!o[parts[i]]) o[parts[i]]={}; o=o[parts[i]]; }
  o[parts.at(-1)]=value; pmSave(); if(rerender) pmRenderDetail();
}
function pmGet(p,path){return path.split('.').reduce((o,k)=>o&&o[k],p)??''}
function pmInput(label,path,type='text',opts=''){
  const p=pmFind(), v=pmEsc(pmGet(p,path));
  if(opts) return `<div><label class="pmLabel">${label}</label><select onchange="pmSet('${path}',this.value)">${opts.split('|').map(o=>`<option ${String(pmGet(p,path))===o?'selected':''}>${o}</option>`).join('')}</select></div>`;
  return `<div><label class="pmLabel">${label}</label><input type="${type}" value="${v}" onchange="pmSet('${path}',this.value)"></div>`;
}
function pmRenderClient(){
  const p=pmFind(), body=$('pmDetailBody');
  body.innerHTML=`
    <div class="pmClientGrid">
      <div class="pmMiniSection pmFull">
        <h3>Basic Projection Information</h3>
        <div class="pmFormGrid4">
          ${pmInput('Client Name','clientName')}${pmInput('Brand Name','brandName')}${pmInput('Sales PIC','salesPic')}${pmInput('Sales Support PIC','ssPic')}
          ${pmInput('Ekspetasi First Inbound','firstInbound','date')}${pmInput('Ekspetasi First Outbound','firstOutbound','date')}<div><label class="pmLabel">Estimasi Revenue / Month</label><input type="text" placeholder="IDR 0" value="${pmEsc(p.estimatedRevenueMonth||'')}" onchange="pmSet('estimatedRevenueMonth',this.value)"></div>
        </div>
      </div>
      <div class="pmMiniSection pmFull">
        <h3>Communication Matrix</h3>
        <div class="pmMatrix">
          <div><h3 style="font-size:15px">Internal Flowgistik</h3><div id="pmInternalList">${pmPeopleHtml('internal')}</div><button class="secondary" onclick="pmAddPerson('internal')">+ Add Internal PIC</button></div>
          <div><h3 style="font-size:15px">Eksternal Client</h3><div id="pmExternalList">${pmPeopleHtml('external')}</div><button class="secondary" onclick="pmAddPerson('external')">+ Add Client PIC</button></div>
        </div>
      </div>
      <div class="pmMiniSection">
        <h3>Client Information</h3>
        <div class="pmFormGrid3">
          ${pmInput('Product Category','clientInfo.productCategory')}
          ${pmInput('Warehouse Location','clientInfo.warehouseLocation','text','Flowgistik TGR ( Aiport city )|Flowgistik Surabaya|Flowgistik Medan|Other')}
          ${pmInput('Average order / Day','clientInfo.avgOrderDay')}
          ${pmInput('Average order / Month','clientInfo.avgOrderMonth')}
          ${pmInput('Average product price','clientInfo.avgProductPrice')}
          ${pmInput('Basket order size','clientInfo.basketOrderSize')}
          ${pmInput('Product Size Dimenstion','clientInfo.productSize','text','Small|Medium|Large|All Sizing|Other')}
          ${pmInput('Product Handling','clientInfo.productHandling','text','FIFO|FEFO|LIFO|LEFO|Other')}
        </div>
      </div>
      <div class="pmMiniSection">
        <h3>Channel Active</h3>
        <div class="pmToggleGrid">${pmChannels.map(c=>pmToggle('channels',c)).join('')}</div>
      </div>
      <div class="pmMiniSection">
        <h3>Service yang akan digunakan</h3>
        <div class="pmToggleGrid">${pmServices.map(c=>pmToggle('services',c)).join('')}</div>
      </div>
      <div class="pmMiniSection">
        <h3>URL Attachment</h3>
        <div class="pmAttachRows">${pmAttachmentReq.map(x=>pmAttachmentRow(x)).join('')}</div>
      </div>
      <div class="pmMiniSection pmFull">
        <h3>Operation Requirement</h3>
        <div class="pmOpsWrap">
          ${pmOpsSection('Inbound Requirement','Inbound',pmInboundReq,'inbound')}
          ${pmOpsSection('Outbound Requirement','Outbound',pmOutboundReq,'outbound')}
          ${pmOpsSection('Inventory Requirement','Inventory',pmInventoryReq,'inventory')}
        </div>
      </div>
    </div>`;
}
function pmToggle(group,name){const p=pmFind(), checked=p[group]?.[name]?'checked':'';return `<label class="pmToggle"><input type="checkbox" ${checked} onchange="pmSet('${group}.${pmEsc(name)}',this.checked)"> ${pmEsc(name)}</label>`}
function pmReqRow(group,name){
  const p=pmFind(), item=p[group]?.[name]||{};
  return `<div class="pmReqRow"><b>${pmEsc(name)}</b><input placeholder="Answer" value="${pmEsc(item.answer||'')}" onchange="pmSet('${group}.${pmEsc(name)}.answer',this.value)"><input placeholder="Notes" value="${pmEsc(item.notes||'')}" onchange="pmSet('${group}.${pmEsc(name)}.notes',this.value)"></div>`;
}
function pmUrlRow(name){const p=pmFind(), v=p.attachments?.[name]||'';return `<div class="pmReqRow"><b>${pmEsc(name)}</b><input class="pmFull" placeholder="Paste URL attachment" value="${pmEsc(v)}" onchange="pmSet('attachments.${pmEsc(name)}',this.value)"></div>`}
function pmAttachmentRow(name){
  const p=pmFind();
  if(!p.attachmentsFiles) p.attachmentsFiles={};
  const files=p.attachmentsFiles[name]||[];
  return `<div class="pmAttachRow">
    <b>${pmEsc(name)}</b>
    <div class="pmAttachControl">
      <label class="pmAttachImport">Import file video / PDF
        <input type="file" multiple accept="video/*,.pdf,application/pdf" onchange="pmImportAttachmentFiles('${pmEsc(name)}',this)">
      </label>
      <div class="pmAttachHint">Bisa upload lebih dari 1 file. Video bisa langsung diputar, PDF dibuka di tab baru.</div>
      <div class="pmAttachList">
        ${files.length?files.map((f,i)=>`<div class="pmAttachItem">
          <div><div class="pmAttachName">${pmEsc(f.name)}</div><div class="pmAttachType">${pmEsc(f.type||'file')} · ${pmFormatBytes(f.size||0)}</div></div>
          <button class="pmAttachBtn" onclick="pmOpenAttachment('${pmEsc(name)}',${i})">${String(f.type||'').startsWith('video/')?'Play':'Open'}</button>
          <button class="pmAttachBtn" onclick="pmDeleteAttachment('${pmEsc(name)}',${i})">Delete</button>
        </div>`).join(''):'<div class="pmAttachHint">Belum ada file diimport.</div>'}
      </div>
    </div>
  </div>`;
}
function pmFormatBytes(bytes){
  bytes=Number(bytes||0);
  if(bytes<1024) return bytes+' B';
  if(bytes<1024*1024) return (bytes/1024).toFixed(1)+' KB';
  if(bytes<1024*1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
  return (bytes/1024/1024/1024).toFixed(1)+' GB';
}
function pmAttachmentDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('flowgistik_projection_attachment_db',1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function pmAttachmentPut(record){
  const db=await pmAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite');
    tx.objectStore('files').put(record);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function pmAttachmentGet(id){
  const db=await pmAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readonly');
    const req=tx.objectStore('files').get(id);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function pmAttachmentDel(id){
  const db=await pmAttachmentDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function pmImportAttachmentFiles(group,input){
  const p=pmFind();
  if(!p) return;
  const files=[...(input.files||[])];
  if(!files.length) return;
  if(!p.attachmentsFiles) p.attachmentsFiles={};
  if(!p.attachmentsFiles[group]) p.attachmentsFiles[group]=[];
  for(const file of files){
    const id=pmId()+'_'+Date.now();
    await pmAttachmentPut({id,projectId:p.id,group,name:file.name,type:file.type||'',size:file.size||0,blob:file,createdAt:new Date().toISOString()});
    p.attachmentsFiles[group].push({id,name:file.name,type:file.type||'',size:file.size||0,createdAt:new Date().toISOString()});
  }
  pmSave();
  input.value='';
  pmRenderDetail();
}
async function pmOpenAttachment(group,index){
  const p=pmFind();
  const meta=p?.attachmentsFiles?.[group]?.[index];
  if(!meta) return alert('File tidak ditemukan.');
  const rec=await pmAttachmentGet(meta.id);
  if(!rec || !rec.blob) return alert('File tidak ditemukan di browser ini. Silakan import ulang.');
  const url=URL.createObjectURL(rec.blob);
  if(String(meta.type||'').startsWith('video/')){
    pmShowVideo(url,meta.name);
  }else{
    window.open(url,'_blank');
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
}
async function pmDeleteAttachment(group,index){
  if(!confirm('Hapus attachment ini?')) return;
  const p=pmFind();
  const arr=p?.attachmentsFiles?.[group]||[];
  const meta=arr[index];
  if(meta?.id) await pmAttachmentDel(meta.id);
  arr.splice(index,1);
  pmSave();
  pmRenderDetail();
}
function pmShowVideo(url,name){
  let modal=document.getElementById('pmVideoModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='pmVideoModal';
    modal.className='pmVideoModal hidden';
    modal.innerHTML=`<div class="pmVideoBox">
      <div class="pmVideoHead"><b id="pmVideoTitle"></b><button class="secondary" onclick="pmCloseVideo()">Close</button></div>
      <video id="pmVideoPlayer" controls autoplay></video>
    </div>`;
    document.body.appendChild(modal);
  }
  const v=document.getElementById('pmVideoPlayer');
  document.getElementById('pmVideoTitle').textContent=name||'Video Preview';
  v.src=url;
  modal.classList.remove('hidden');
}
function pmCloseVideo(){
  const modal=document.getElementById('pmVideoModal');
  const v=document.getElementById('pmVideoPlayer');
  if(v){
    const old=v.src;
    v.pause(); v.removeAttribute('src'); v.load();
    if(old) URL.revokeObjectURL(old);
  }
  if(modal) modal.classList.add('hidden');
}
function pmOpsSection(titleShort,pill,items,group){
  return `<div class="pmOpsSection">
    <div class="pmOpsSectionHead">
      <h4>${pmEsc(titleShort)}</h4>
      <span class="pmOpsPill">${pmEsc(pill)}</span>
    </div>
    <div class="pmOpsRows">${items.map(x=>pmReqRow(group,x)).join('')}</div>
  </div>`;
}

function pmPeopleHtml(type){
  const p=pmFind(), arr=p.matrix?.[type]||[];
  return arr.map((x,i)=>`<div class="pmPerson">
    <input placeholder="Nama" value="${pmEsc(x.name)}" onchange="pmPersonSet('${type}',${i},'name',this.value)">
    <input placeholder="Phone Numbers" value="${pmEsc(x.phone)}" onchange="pmPersonSet('${type}',${i},'phone',this.value)">
    <input placeholder="Role" value="${pmEsc(x.role)}" onchange="pmPersonSet('${type}',${i},'role',this.value)">
    <button class="secondary" onclick="pmRemovePerson('${type}',${i})">×</button>
  </div>`).join('');
}
function pmPersonSet(type,i,key,value){const p=pmFind(); p.matrix[type][i][key]=value; pmSave()}
function pmAddPerson(type){const p=pmFind(); p.matrix[type].push({name:'',phone:'',role:''}); pmSave(); pmRenderDetail()}
function pmRemovePerson(type,i){const p=pmFind(); p.matrix[type].splice(i,1); if(!p.matrix[type].length)p.matrix[type].push({name:'',phone:'',role:''}); pmSave(); pmRenderDetail()}
function pmDeleteProject(){if(!confirm('Hapus project ini?'))return; pmProjects=pmProjects.filter(p=>p.id!==pmCurrentId); pmSave(); pmRenderHome()}
function pmDuplicateProject(){const p=JSON.parse(JSON.stringify(pmFind())); p.id=pmId(); p.clientName=p.clientName+' Copy'; p.createdAt=new Date().toISOString(); p.tasks.forEach(t=>t.id=pmId()); pmProjects.unshift(p); pmSave(); pmOpenProject(p.id)}
function pmProjectRows(projects=pmProjects){return projects.map(p=>({ProjectID:p.id,'Client Name':p.clientName,'Brand Name':p.brandName,'Sales PIC':p.salesPic,'Sales Support PIC':p.ssPic,'Ekspetasi First Inbound':p.firstInbound,'Ekspetasi First Outbound':p.firstOutbound,'Estimasi Revenue / Month':p.estimatedRevenueMonth||'','Created At':p.createdAt,'Progress %':pmStats(p).pct}))}
function pmTaskRows(projects=pmProjects){return projects.flatMap(p=>p.tasks.map(t=>({ProjectID:p.id,'Client Name':p.clientName,Department:t.department,'Task Activity':t.activity,'Open Date':t.openDate,'Closed Date':t.closedDate,Status:t.status,Notes:t.notes})))}
function pmFlatObj(prefix,obj){return Object.keys(obj||{}).map(k=>({Section:prefix,Description:k,Answer:(typeof obj[k]==='object'?obj[k].answer:obj[k])||'',Notes:(typeof obj[k]==='object'?obj[k].notes:'')||''}))}
function pmClientRows(p){return [
  {Section:'Client Information',Description:'Product Category',Answer:p.clientInfo.productCategory,Notes:''},
  {Section:'Client Information',Description:'Warehouse Location',Answer:p.clientInfo.warehouseLocation,Notes:''},
  {Section:'Client Information',Description:'Average order / Day',Answer:p.clientInfo.avgOrderDay,Notes:''},
  {Section:'Client Information',Description:'Average order / Month',Answer:p.clientInfo.avgOrderMonth,Notes:''},
  {Section:'Client Information',Description:'Average product price',Answer:p.clientInfo.avgProductPrice,Notes:''},
  {Section:'Client Information',Description:'Basket order size',Answer:p.clientInfo.basketOrderSize,Notes:''},
  {Section:'Client Information',Description:'Product Size Dimenstion',Answer:p.clientInfo.productSize,Notes:''},
  {Section:'Client Information',Description:'Product Handling',Answer:p.clientInfo.productHandling,Notes:''},
  ...pmFlatObj('Channel Active',p.channels).map(r=>({...r,Answer:r.Answer?'Yes':'No'})),
  ...pmFlatObj('Service',p.services).map(r=>({...r,Answer:r.Answer?'Yes':'No'})),
  ...pmFlatObj('Inbound Requirement',p.inbound),
  ...pmFlatObj('Outbound Requirement',p.outbound),
  ...pmFlatObj('Inventory Requirement',p.inventory),
  ...pmFlatObj('URL Attachment',p.attachments)
]}
function pmExportWorkbook(projects,filename){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pmProjectRows(projects)),'PM_Projects');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pmTaskRows(projects)),'PM_Tasks');
  if(projects.length===1){
    const p=projects[0];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pmClientRows(p)),'Client_Requirement');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((p.matrix.internal||[]).map(x=>({Type:'Internal Flowgistik',...x}))),'Internal_Matrix');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((p.matrix.external||[]).map(x=>({Type:'Eksternal Client',...x}))),'External_Matrix');
  }
  XLSX.writeFile(wb,filename);
}
function pmExportProject(){const p=pmFind(); pmExportWorkbook([p],`Projection_${(p.clientName||'Project').replace(/[^\w\-]+/g,'_')}.xlsx`)}
function pmExportAll(){pmExportWorkbook(pmProjects,'Projection_Management_All.xlsx')}
function pmDownloadProjectTemplate(){
  const rows=[{'Client Name':'Contoh Client','Brand Name':'Contoh Brand','Sales PIC':'Nama Sales','Sales Support PIC':'Nama SS','Ekspetasi First Inbound':'2026-05-01','Ekspetasi First Outbound':'2026-05-07','Estimasi Revenue / Month':'IDR 50.000.000'}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'PM_Import_Project');
  XLSX.writeFile(wb,'Template_Import_Project_Projection.xlsx');
}
function pmDownloadTaskTemplate(){
  const rows=pmDepartments.flatMap(d=>(pmDefaultTasks[d]||[]).map(a=>({Department:d,Stakeholder:d,'Task Activity':a,'Open Date':pmToday(),'Closed Date':'',Status:'Open',Notes:''})));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'PM_Task_Template');
  XLSX.writeFile(wb,'Template_Task_Activity_Projection.xlsx');
}

function pmNormalizeDepartmentName(value){
  const raw=String(value||'').trim();
  const key=raw.toLowerCase().replace(/\s+/g,' ');
  const map={
    'sales':'Sales',
    'sales support':'Sales Support',
    'ss':'Sales Support',
    'operation':'Operations',
    'operations':'Operations',
    'ops':'Operations',
    'technology':'Technology',
    'tech':'Technology',
    'it':'Technology'
  };
  return map[key] || (pmDepartments.includes(raw) ? raw : 'Sales');
}
async function pmImportTaskExcel(ev){
  const p=pmFind();
  if(!p) return alert('Pilih project terlebih dahulu.');
  const file=ev.target.files[0];
  if(!file) return;
  try{
    const data=await readFile(file);
    const wb=XLSX.read(data,{type:'array'});
    const sheet=wb.Sheets['PM_Task_Template']||wb.Sheets['PM_Tasks']||wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    if(!rows.length) return alert('Template task kosong.');
    let added=0;
    rows.forEach(r=>{
      const activity=String(r['Task Activity']||r['Task']||r['Activity']||r['Task Name']||'').trim();
      if(!activity) return;
      p.tasks.push({
        id:pmId(),
        department:pmNormalizeDepartmentName(r['Department']||r['Stakeholder']||r['PIC Department']||r['Dept']),
        activity,
        openDate:String(r['Open Date']||r['Start Date']||r['Tanggal Open']||pmToday()).slice(0,10),
        closedDate:String(r['Closed Date']||r['Close Date']||r['Tanggal Closed']||'').slice(0,10),
        status:String(r['Status']||'Open').trim() || 'Open',
        notes:String(r['Notes']||r['Note']||r['Catatan']||'')
      });
      added++;
    });
    pmSave();
    ev.target.value='';
    pmRenderDetail();
    alert(added+' task berhasil diimport ke project ini.');
  }catch(err){
    console.error(err);
    alert('Import task gagal. Pastikan file memakai template yang benar.');
  }
}

async function pmImportExcel(ev){
  const file=ev.target.files[0]; if(!file) return;
  const data=await readFile(file); const wb=XLSX.read(data,{type:'array'});
  const sheet=wb.Sheets['PM_Import_Project']||wb.Sheets['PM_Projects']||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
  if(!rows.length) return alert('Template import kosong.');
  rows.forEach(r=>{
    const p=pmNewProjectBase({clientName:r['Client Name']||r['Client']||'',brandName:r['Brand Name']||'',salesPic:r['Sales PIC']||'',ssPic:r['Sales Support PIC']||'',firstInbound:r['Ekspetasi First Inbound']||'',firstOutbound:r['Ekspetasi First Outbound']||'',estimatedRevenueMonth:r['Estimasi Revenue / Month']||r['Estimated Revenue / Month']||''});
    if(p.clientName) pmProjects.unshift(p);
  });
  pmSave(); ev.target.value=''; pmRenderHome(); alert('Import project selesai.');
}

/* Active Projection Task Import Override */
function pmNormalizeDepartmentName(value){
  const raw=String(value||'').trim();
  const key=raw.toLowerCase().replace(/\s+/g,' ');
  const map={'sales':'Sales','sales support':'Sales Support','ss':'Sales Support','operation':'Operations','operations':'Operations','ops':'Operations','technology':'Technology','tech':'Technology','it':'Technology'};
  return map[key] || (typeof pmDepartments!=='undefined' && pmDepartments.includes(raw) ? raw : 'Sales');
}
async function pmImportTaskExcel(ev){
  const p=pmFind();
  if(!p) return alert('Pilih project terlebih dahulu.');
  const file=ev.target.files[0];
  if(!file) return;
  try{
    const data=await readFile(file);
    const wb=XLSX.read(data,{type:'array'});
    const sheet=wb.Sheets['PM_Task_Template']||wb.Sheets['PM_Tasks']||wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    if(!rows.length) return alert('Template task kosong.');
    let added=0;
    rows.forEach(r=>{
      const activity=String(r['Task Activity']||r['Task']||r['Activity']||r['Task Name']||'').trim();
      if(!activity) return;
      p.tasks.push({id:pmId(),department:pmNormalizeDepartmentName(r['Department']||r['Stakeholder']||r['PIC Department']||r['Dept']),activity,openDate:String(r['Open Date']||r['Start Date']||r['Tanggal Open']||pmToday()).slice(0,10),closedDate:String(r['Closed Date']||r['Close Date']||r['Tanggal Closed']||'').slice(0,10),status:String(r['Status']||'Open').trim()||'Open',notes:String(r['Notes']||r['Note']||r['Catatan']||'')});
      added++;
    });
    pmSave(); ev.target.value=''; pmRenderDetail(); alert(added+' task berhasil diimport ke project ini.');
  }catch(err){console.error(err); alert('Import task gagal. Pastikan file memakai template yang benar.');}
}

// DISABLED — Firebase-backed initProjection() owns #pmRoot. The localStorage pm code is kept available but dormant.
// if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',pmInit)}else{pmInit()}


/* Daily reconcile orders client reguler */
let drSourceRows={metabase:[],ginee:[],desty:[]};
let drSourceFiles={metabase:[],ginee:[],desty:[]};
let drReconcileRows=[];
const drHeaders=['Client name','Client name WMS','Orders code','Waybill Numbers','Warehouse','Created date','Created WMS','Pending fulfill <15:00','Status OMS','Status WMS','Status FO Leading'];
function drCleanKey(v){return String(v||'').toLowerCase().replace(/[\s_\-\/\.\(\)\n\r]+/g,'').replace(/[^a-z0-9]/g,'')}
function drText(v){ if(v===undefined||v===null) return ''; return String(v).trim(); }
function drGet(row, names){
  const map={}; Object.keys(row||{}).forEach(k=>map[drCleanKey(k)]=k);
  for(const n of names){ const key=map[drCleanKey(n)]; if(key!==undefined && row[key]!==undefined && row[key]!==null && String(row[key]).trim()!=='') return drText(row[key]); }
  return '';
}
async function drReadRows(file){
  const data=await readFile(file);
  const wb=XLSX.read(data,{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
}
async function drImportSource(type,files){
  files=[...(files||[])]; if(!files.length) return;
  let all=[];
  for(const f of files){ const rows=await drReadRows(f); rows.forEach(r=>all.push(r)); }
  drSourceRows[type]=all; drSourceFiles[type]=files.map(f=>f.name);
  drUpdateInfo();
  $('drStatus').innerHTML=`Import ${type} selesai: <b>${all.length}</b> rows dari ${files.length} file.`;
}
function drUpdateInfo(){
  const set=(id,type,label)=>{ const el=$(id); if(el) el.innerHTML = drSourceRows[type].length?`✅ ${drSourceRows[type].length} rows · ${drSourceFiles[type].map(n=>`<span class="drSourcePill">${pmEsc?n=pmEsc(n):n}</span>`).join('')}`:'Belum import.'; };
  set('drMetabaseInfo','metabase'); set('drGineeInfo','ginee'); set('drDestyInfo','desty');
  if($('drMetaCount')) $('drMetaCount').textContent=drSourceRows.metabase.length;
  if($('drGineeCount')) $('drGineeCount').textContent=drSourceRows.ginee.length;
  if($('drDestyCount')) $('drDestyCount').textContent=drSourceRows.desty.length;
  if($('drReconCount')) $('drReconCount').textContent=drReconcileRows.length;
}
function drIndex(rows, names){
  const m=new Map();
  (rows||[]).forEach(r=>{
    const key=drGet(r,names);
    if(!key) return;
    if(!m.has(key)){
      m.set(key,{...r});
    }else{
      const current=m.get(key);
      Object.keys(r||{}).forEach(k=>{
        if((current[k]===undefined || current[k]===null || String(current[k]).trim()==='') && r[k]!==undefined && r[k]!==null && String(r[k]).trim()!==''){
          current[k]=r[k];
        }
      });
      m.set(key,current);
    }
  });
  return m;
}
function drProcessReconcile(){
  if(!drSourceRows.metabase.length || !drSourceRows.ginee.length || !drSourceRows.desty.length){
    return alert('Wajib import semua source dulu: Metabase, Ginee, dan Desty.');
  }
  const gineeIdx=drIndex(drSourceRows.ginee,['ID Pesanan','ID Order','Order ID']);
  const destyIdx=drIndex(drSourceRows.desty,['Nomor Pesanan\n(di Marketplace)','Nomor Pesanan (di Marketplace)','Nomor Pesanan di Marketplace','Nomor Pesanan Marketplace','Order Marketplace','Marketplace Order ID']);
  const metaIdx=drIndex(drSourceRows.metabase,['client_reference_id','Client Reference ID','client reference id']);
  const orderCodes=[]; const seen=new Set();
  drSourceRows.ginee.forEach(r=>{ const v=drGet(r,['ID Pesanan','ID Order','Order ID']); if(v && !seen.has(v)){seen.add(v); orderCodes.push(v);} });
  drSourceRows.desty.forEach(r=>{ const v=drGet(r,['Nomor Pesanan\n(di Marketplace)','Nomor Pesanan (di Marketplace)','Nomor Pesanan di Marketplace','Nomor Pesanan Marketplace','Order Marketplace','Marketplace Order ID']); if(v && !seen.has(v)){seen.add(v); orderCodes.push(v);} });
  drReconcileRows=orderCodes.map(code=>{
    const g=gineeIdx.get(code)||{}; const d=destyIdx.get(code)||{}; const m=metaIdx.get(code)||{};
    // Lookup rules mengikuti rumus template:
    // B = XLOOKUP Orders code ke Ginee ID Pesanan -> Nama Toko, fallback Desty Nomor Pesanan Marketplace -> Channel - Nama Toko
    // E = XLOOKUP Orders code ke Ginee ID Pesanan -> AWB/No. Tracking, fallback Desty -> Nomor AWB/Resi
    // F = XLOOKUP Orders code ke Ginee ID Pesanan -> Nama Gudang, fallback Desty -> Nama Gudang Marketplace
    // G = XLOOKUP Orders code ke Ginee ID Pesanan -> Tanggal Pembuatan, fallback Desty -> Tanggal Pesanan Dibuat
    // H / Created WMS = Metabase local_order_date
    const clientName = drGet(g,['Nama Toko','Store Name','Nama Seller']) || drGet(d,['Channel - Nama Toko','Channel Nama Toko','URL Toko']);
    const clientNameWms = drGet(m,['code_customer','code customer','customer','Client name WMS']);
    const waybill = drGet(g,['AWB/No. Tracking','AWB/No Tracking','AWB','No Tracking','Nomor Resi','Resi']) || drGet(d,['Nomor AWB/Resi','Nomor AWB Resi','AWB/Resi','AWB','Resi','Nomor Resi']);
    const warehouse = drGet(g,['Nama Gudang','Warehouse','Gudang']) || drGet(d,['Nama Gudang\nMarketplace','Nama Gudang Marketplace','Nama Gudang\nMaster','Nama Gudang Master','Warehouse','Gudang']);
    const createdDate = drGet(g,['Tanggal Pembuatan','Created Date','Tanggal Dibuat']) || drGet(d,['Tanggal Pesanan Dibuat','Created Date','Tanggal Dibuat']);
    const createdWms = drGet(m,['local_order_date']);
    const statusOms = drGet(g,['Status']) || drGet(d,['Status Pesanan']);
    const statusWms = drGet(m,['status_so','status so']) || 'Need Check';
    const statusFo = drGet(m,['status_fo_leading','status fo leading']) || 'Need Check';
    return {'Client name':clientName,'Client name WMS':clientNameWms,'Orders code':code,'Waybill Numbers':waybill,'Warehouse':warehouse,'Created date':createdDate,'Created WMS':createdWms,'Pending fulfill <15:00':(drNormStatus(statusWms)==='pendingfulfillment' && drCreatedBefore3PM(createdWms))?'YES':'','Status OMS':statusOms,'Status WMS':statusWms,'Status FO Leading':statusFo};
  });
  drUpdateInfo();
  renderTable(drReconcileRows,'drPreview',300);
  const blankClient=drReconcileRows.filter(r=>!r['Client name']).length;
  const blankWaybill=drReconcileRows.filter(r=>!r['Waybill Numbers']).length;
  const blankWarehouse=drReconcileRows.filter(r=>!r['Warehouse']).length;
  const blankCreated=drReconcileRows.filter(r=>!r['Created date']).length;
  const itCount=drBuildItIssues().length;
  const opsCount=drBuildOpsSla().length;
  $('drStatus').innerHTML=`✅ Reconcile selesai. Total unique marketplace order dari Ginee + Desty: <b>${drReconcileRows.length}</b> rows. Duplicate otomatis dihapus.<br><span class="small">Lookup kosong: Client ${blankClient}, Waybill ${blankWaybill}, Warehouse ${blankWarehouse}, Created date ${blankCreated}. Created WMS diambil dari Metabase kolom <b>local_order_date</b>.<br>Export tambahan: <b>${itCount}</b> rows IT Issue's dan <b>${opsCount}</b> rows OPS SLA. Rule OPS SLA: tanggal Created WMS paling baru tidak masuk; tanggal sebelum tanggal terbaru hanya masuk jika jam Created WMS di bawah 15:00. Rule OPS SLA: Tanggal Created WMS paling baru tidak masuk OPS SLA; tanggal sebelum tanggal terbaru hanya masuk jika jam Created WMS di bawah 15:00.</span>`;
}
function drRowsToAoa(rows,headers=drHeaders,blankFirstCol=true){
  const aoa=[];
  if(blankFirstCol){ aoa.push(new Array(headers.length+1).fill('')); aoa.push(['',...headers]); rows.forEach(r=>aoa.push(['',...headers.map(h=>r[h]??'')])); }
  else{ aoa.push(headers); rows.forEach(r=>aoa.push(headers.map(h=>r[h]??''))); }
  return aoa;
}
function drNormStatus(v){
  return String(v||'').toLowerCase().replace(/[\s_\-\/]+/g,'').replace(/[^a-z0-9]/g,'');
}
function drIsOmsActionable(status){
  const s=drNormStatus(status);
  if(!s) return false;
  // Exclude order yang sudah selesai/cancel/return/unpaid.
  // Penting: "unpaid" mengandung kata "paid", jadi unpaid wajib diexclude sebelum cek paid.
  if(s.includes('unpaid') || s.includes('belumbayar') || s.includes('menunggupembayaran') || s.includes('awaitingpayment')) return false;
  if(s.includes('cancel') || s.includes('batal') || s.includes('completed') || s.includes('complete') || s.includes('selesai') || s.includes('delivered') || s.includes('return')) return false;
  // Include status OMS yang masih perlu diproses sesuai request.
  return s.includes('perludiproses') || s.includes('toprocess') || s.includes('processing') || s.includes('processed') || s.includes('readytoship') || s==='paid' || s.endsWith('paid') || s.includes('neworders') || s.includes('neworder');
}
function drIsOmsUnpaid(status){
  const s=drNormStatus(status);
  return s.includes('unpaid') || s.includes('belumbayar') || s.includes('menunggupembayaran') || s.includes('awaitingpayment');
}
function drBuildItIssues(){
  return (drReconcileRows||[]).filter(r=>{
    const oms=r['Status OMS'];
    return drNormStatus(r['Status WMS'])==='needcheck' && drIsOmsActionable(oms) && !drIsOmsUnpaid(oms);
  });
}
function drParseDate(v){
  if(v===undefined || v===null || String(v).trim()==='') return null;
  if(v instanceof Date && !isNaN(v)) return v;
  if(typeof v==='number'){
    const d=new Date(Math.round((v-25569)*86400*1000));
    return isNaN(d)?null:d;
  }
  let s=String(v).trim();
  // Handle yyyy-mm-dd / yyyy-mm-dd hh:mm:ss
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if(m){
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
    return isNaN(d)?null:d;
  }
  // Handle dd-mm-yyyy / dd/mm/yyyy + time
  m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if(m){
    let y=Number(m[3]); if(y<100) y+=2000;
    const d=new Date(y,Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
    return isNaN(d)?null:d;
  }
  const d=new Date(s);
  return isNaN(d)?null:d;
}
function drAgingDays(createdWms){
  const d=drParseDate(createdWms);
  if(!d) return '';
  const today=new Date();
  const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const end=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.max(0,Math.floor((end-start)/86400000));
}
function drCreatedBefore3PM(createdWms){
  const d=drParseDate(createdWms);
  if(!d) return false;
  return d.getHours() < 15;
}
function drDateKey(createdWms){
  const d=drParseDate(createdWms);
  if(!d) return '';
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function drLatestCreatedWmsDateKey(rows){
  const keys=(rows||[])
    .map(r=>drDateKey(r['Created WMS']))
    .filter(Boolean)
    .sort();
  return keys.length ? keys[keys.length-1] : '';
}
function drIsOpsSlaPreviousDateRule(row,latestKey){
  const key=drDateKey(row['Created WMS']);
  if(!key || !latestKey) return false;

  // Rule OPS SLA final:
  // - Tanggal Created WMS paling baru dianggap "hari ini" dan TIDAK MASUK OPS SLA.
  // - OPS SLA hanya dari tanggal sebelum tanggal paling baru.
  // - Dari tanggal sebelum tanggal paling baru, hanya row dengan jam Created WMS di bawah 15:00 yang masuk.
  // Contoh: latest date = 07, maka 07 tidak masuk. Tanggal 06 masuk hanya jika Created WMS < 15:00.
  if(key >= latestKey) return false;
  return drCreatedBefore3PM(row['Created WMS']);
}
function drBuildOpsSla(){
  const base=(drReconcileRows||[]).filter(r=>{
    const s=drNormStatus(r['Status WMS']);
    return (s==='pendingfulfillment' || s==='fulfilled') && drIsOmsActionable(r['Status OMS']);
  });
  const latestKey=drLatestCreatedWmsDateKey(base);
  return base
    .filter(r=>drIsOpsSlaPreviousDateRule(r,latestKey))
    .map(r=>({
      'Aging Date':drAgingDays(r['Created WMS']),
      'OPS SLA Rule':'Before latest Created WMS date and < 15:00',
      ...r
    }));
}

function drIsJustmissClient(row){
  const clientText=[row?.['Client name'],row?.['Client name WMS']].join(' ').toLowerCase().replace(/[^a-z0-9]/g,'');
  return clientText.includes('justmiss');
}
function drCatchUpCutoffHour(row){
  return drIsJustmissClient(row) ? 16 : 15;
}
function drFormatCutoffLabel(hour){
  return String(hour).padStart(2,'0') + ':00';
}
function drCatchUpNotes(row){
  const cutoff=drCatchUpCutoffHour(row);
  const created=drParseDate(row?.['Created date']) || drParseDate(row?.['Created WMS']);
  if(!created) return 'Perlu cek manual - jam order kosong/tidak terbaca';
  return created.getHours() < cutoff ? 'Perlu live resi' : 'Bisa diproses besok';
}
function drBuildCatchUpSla(){
  return (drReconcileRows||[])
    .filter(r=>drIsOmsActionable(r['Status OMS']))
    .map(r=>{
      const cutoff=drCatchUpCutoffHour(r);
      const created=drParseDate(r['Created date']) || drParseDate(r['Created WMS']);
      return {
        'Catch Up Notes':drCatchUpNotes(r),
        'Cut Off SLA':drFormatCutoffLabel(cutoff),
        'Cut Off Rule':drIsJustmissClient(r) ? 'Justmiss cut off 16:00' : 'Reguler cut off 15:00',
        'Order Hour':created ? String(created.getHours()).padStart(2,'0') + ':' + String(created.getMinutes()).padStart(2,'0') : '',
        ...r
      };
    });
}
function drExportCatchUpSla(){
  if(!drReconcileRows.length) drProcessReconcile();
  if(!drReconcileRows.length) return;
  const rows=drBuildCatchUpSla();
  if(!rows.length){
    alert('Tidak ada pesanan yang masih perlu diproses untuk Catch up SLA.');
    return;
  }
  const headers=['Catch Up Notes','Cut Off SLA','Cut Off Rule','Order Hour',...drHeaders];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(h=>r[h]??''))]);
  ws['!cols']=headers.map(h=>({wch:Math.min(Math.max(String(h).length+4,14),36)}));
  ws['!freeze']={xSplit:0,ySplit:1};
  XLSX.utils.book_append_sheet(wb,ws,'Catch Up SLA');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(drSourceRows.metabase||[]),'Metabase');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(drSourceRows.ginee||[]),'Ginee');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(drSourceRows.desty||[]),'Desty');
  XLSX.writeFile(wb,'Daily_reconcile_catch_up_SLA.xlsx');
}
function drExportReconcile(){
  if(!drReconcileRows.length) drProcessReconcile();
  if(!drReconcileRows.length) return;
  const wb=XLSX.utils.book_new();
  const recWs=XLSX.utils.aoa_to_sheet(drRowsToAoa(drReconcileRows));
  recWs['!cols']=[{wch:4},{wch:24},{wch:26},{wch:24},{wch:24},{wch:22},{wch:20},{wch:20},{wch:20},{wch:18},{wch:18},{wch:20}];
  recWs['!freeze']={xSplit:0,ySplit:2};
  XLSX.utils.book_append_sheet(wb,recWs,'Reconcile');

  const itRows=drBuildItIssues();
  const opsRows=drBuildOpsSla();

  const addSheet=(name,rows,headers=null)=>{
    let ws;
    if(headers){
      ws=XLSX.utils.aoa_to_sheet([headers,...(rows||[]).map(r=>headers.map(h=>r[h]??''))]);
      ws['!cols']=headers.map(h=>({wch:Math.min(Math.max(String(h).length+4,14),34)}));
    }else{
      ws=XLSX.utils.json_to_sheet(rows||[]);
      ws['!cols']=Object.keys((rows||[])[0]||{}).map(k=>({wch:Math.min(Math.max(String(k).length+3,14),34)}));
    }
    XLSX.utils.book_append_sheet(wb,ws,name);
  };

  addSheet("IT Issue's",itRows,drHeaders);
  addSheet('OPS SLA',opsRows,['Aging Date','OPS SLA Rule',...drHeaders]);
  addSheet('Metabase',drSourceRows.metabase);
  addSheet('Ginee',drSourceRows.ginee);
  addSheet('Desty',drSourceRows.desty);
  XLSX.writeFile(wb,'Daily_reconcile_orders_client_reguler_result.xlsx');
}
function drDownloadTemplate(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(drRowsToAoa([],drHeaders,true)),'Reconcile');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([drHeaders]),"IT Issue's");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Aging Date','OPS SLA Rule',...drHeaders]]),'OPS SLA');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Upload export Metabase asli di menu HTML, sheet ini hanya panduan.']]),'Metabase');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Tanggal Pembuatan','Nama Toko','AWB/No. Tracking','Status','ID Pesanan','Nama Gudang']]),'Ginee');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Tanggal Pesanan Dibuat','Nomor Pesanan (di Marketplace)','Status Pesanan','Channel - Nama Toko','Nama Gudang Marketplace','Nomor AWB/Resi']]),'Desty');
  XLSX.writeFile(wb,'Template_Daily_reconcile_orders_client_reguler.xlsx');
}
function drReset(){
  drSourceRows={metabase:[],ginee:[],desty:[]}; drSourceFiles={metabase:[],ginee:[],desty:[]}; drReconcileRows=[];
  ['drMetabaseFiles','drGineeFiles','drDestyFiles'].forEach(id=>{if($(id)) $(id).value=''});
  drUpdateInfo();
  if($('drPreview')) $('drPreview').innerHTML='<div class="output">Belum ada hasil reconcile.</div>';
  if($('drStatus')) $('drStatus').textContent='Upload Metabase, Ginee, dan Desty terlebih dahulu.';
}


/* Weekly Report Generator - Inbound Volume */
let wrInboundRows=[];
let wrInboundByClientRows=[];
let wrInboundW2WRows=[];
let wrInboundSourceFile='';
const wrInboundHeaders=['Week Num','Week','id','order_id','order_date','client_order_id','client_order_date','exp_arrival_date','subtotal','taxtotal','total','status_po','status_receive','created_by','created_at','updated_by','updated_at','closed_by','closed_at','code_client','code_warehouse','code_supplier','is_pickup','canceled_by','canceled_at','client_reference_id','client_pos_id','doc_type','code_supplier_name','fjb_location','fjb_location_to','fjb_vendor_reference_id','item_brand','code_item','client_code_item','code_upc_1','code_upc_2','quantity','quantity_receive','quantity_open','rate','amount','tax_rate','tax_amount','gross_amount','line','uom'];
function wrCleanKey(v){return String(v||'').toLowerCase().replace(/[\s_\-\/\.\(\)\n\r]+/g,'').replace(/[^a-z0-9]/g,'')}

function wrCellRawValue(ws,r,c){
  if(!ws) return '';
  let cell;
  // SheetJS dense mode: worksheet bisa berupa array-of-arrays dengan property !ref.
  // Pakai !== undefined, bukan truthy, supaya cell bernilai 0 / false tetap terbaca.
  if(Array.isArray(ws) && ws[r] && ws[r][c] !== undefined) cell=ws[r][c];
  if(cell===undefined){
    const data=ws['!data'];
    if(data && data[r] && data[r][c] !== undefined) cell=data[r][c];
  }
  if(cell===undefined){
    const addr=XLSX.utils.encode_cell({r:r,c:c});
    cell=ws[addr];
  }
  if(cell===undefined || cell===null) return '';
  if(typeof cell==='object'){
    if(cell.v!==undefined && cell.v!==null) return cell.v;
    if(cell.w!==undefined && cell.w!==null) return cell.w;
    return '';
  }
  return cell;
}
function wrSheetRowsAuto(ws, candidates){
  // Parser kuat untuk sheet kecil/besar, dense/sparse, header row 1 ataupun row bawah.
  if(!ws || !ws['!ref']) return [];
  const range=XLSX.utils.decode_range(ws['!ref']);
  const cand=(candidates||[]).map(wrCleanKey).filter(Boolean);
  let bestIdx=range.s.r,bestScore=-1,bestMatch=0;
  const maxScan=Math.min(range.e.r,range.s.r+80);
  const maxCols=Math.min(range.e.c,range.s.c+220);
  for(let r=range.s.r;r<=maxScan;r++){
    const row=[];
    let filled=0;
    for(let c=range.s.c;c<=maxCols;c++){
      const clean=wrCleanKey(wrCellRawValue(ws,r,c));
      row.push(clean);
      if(clean) filled++;
    }
    const match=cand.reduce((a,c)=>a+(row.includes(c)?1:0),0);
    const finalScore=match*1000 + Math.min(filled,50);
    if(finalScore>bestScore){bestScore=finalScore;bestIdx=r;bestMatch=match;}
  }
  if(bestMatch===0 && cand.length){
    bestIdx=range.s.r;
  }
  const headers=[];
  const seen={};
  for(let c=range.s.c;c<=range.e.c;c++){
    const raw=wrText(wrCellRawValue(ws,bestIdx,c)) || `Column ${c-range.s.c+1}`;
    const key=wrCleanKey(raw)||`col${c-range.s.c+1}`;
    seen[key]=(seen[key]||0)+1;
    headers.push(seen[key]>1 ? `${raw}_${seen[key]}` : raw);
  }
  const rows=[];
  for(let r=bestIdx+1;r<=range.e.r;r++){
    const obj={};
    let hasValue=false;
    for(let c=range.s.c;c<=range.e.c;c++){
      const v=wrCellRawValue(ws,r,c);
      if(v!==undefined && v!==null && wrText(v)!=='') hasValue=true;
      obj[headers[c-range.s.c]]=v??'';
    }
    if(hasValue) rows.push(obj);
  }
  return rows;
}
function wrGet(row,names){
  const map={}; Object.keys(row||{}).forEach(k=>map[wrCleanKey(k)]=k);
  for(const n of names){ const k=map[wrCleanKey(n)]; if(k!==undefined && row[k]!==undefined && row[k]!==null && String(row[k]).trim()!=='') return row[k]; }
  return '';
}
function wrText(v){return String(v??'').trim()}
function wrNum(v){
  if(v===undefined||v===null||String(v).trim()==='') return 0;
  if(typeof v==='number') return isNaN(v)?0:v;
  let s=String(v).trim().replace(/,/g,'').replace(/\s/g,'');
  let n=Number(s);
  if(isNaN(n)) n=Number(String(v).replace(',','.'));
  return isNaN(n)?0:n;
}
function wrParseDate(v){
  if(v===undefined||v===null||String(v).trim()==='') return null;
  if(v instanceof Date && !isNaN(v)) return v;
  if(typeof v==='number'){
    const d=new Date(Math.round((v-25569)*86400*1000));
    return isNaN(d)?null:d;
  }
  let s=String(v).trim();
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if(m){ const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0)); return isNaN(d)?null:d; }
  m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if(m){ let y=Number(m[3]); if(y<100) y+=2000; const d=new Date(y,Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0)); return isNaN(d)?null:d; }
  const d=new Date(s);
  return isNaN(d)?null:d;
}
function wrWeekNum(dateValue){
  const d=wrParseDate(dateValue);
  if(!d) return '';
  const start=new Date(d.getFullYear(),0,1);
  const dayOfYear=Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate())-start)/86400000)+1;
  return Math.ceil((dayOfYear + start.getDay())/7);
}
function wrWeekValue(row){
  const raw=wrGet(row,['Week Num','WeekNum','week_num']);
  const n=Number(String(raw||'').replace(/[^0-9.-]/g,''));
  if(raw!=='' && !String(raw).includes('=') && !isNaN(n) && n>0) return n;
  return wrWeekNum(wrGet(row,['Week','Tanggal','Date','order_date','created_at'])) || wrWeekNum(wrGet(row,['order_date','created_at','client_order_date']));
}
async function wrImportInbound(ev){
  const file=ev?.target?.files?.[0];
  if(!file) return;
  wrInboundSourceFile=file.name;
  const data=await readFile(file);
  const wb=XLSX.read(data,{type:'array',cellDates:false});
  const sheetName=wb.Sheets['Data']?'Data':wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  wrInboundRows=wrSheetRowsAuto(ws,['Week Num','Week','order_id','code_client','quantity','quantity_receive','quantity_open']);
  wrInboundRows=wrInboundRows.filter(r=>Object.values(r).some(v=>String(v??'').trim()!==''));
  wrInboundByClientRows=[]; wrInboundW2WRows=[];
  if($('wrInboundRowsCount')) $('wrInboundRowsCount').textContent=wrInboundRows.length;
  if($('wrInboundLatestWeek')) $('wrInboundLatestWeek').textContent='-';
  if($('wrInboundClientCount')) $('wrInboundClientCount').textContent='0';
  if($('wrInboundW2WCount')) $('wrInboundW2WCount').textContent='0';
  if($('wrInboundPreview')) $('wrInboundPreview').innerHTML='<div class="output">Data sudah diimport. Sistem akan generate report otomatis.</div>';
  const safeName = (typeof pmEsc==='function') ? pmEsc(file.name) : String(file.name).replace(/[&<>\"']/g,'');
  if($('wrInboundStatus')) $('wrInboundStatus').innerHTML=`✅ Import selesai dari sheet <b>${sheetName}</b>: <b>${wrInboundRows.length}</b> rows. File: <span class="drSourcePill">${safeName}</span>`;
  wrGenerateInboundReport();
}
function wrGenerateInboundReport(){
  if(!wrInboundRows.length) return alert('Upload file inbound yang berisi sheet Data terlebih dahulu.');
  const enriched=wrInboundRows.map(r=>({...r,'__wrWeek':wrWeekValue(r)})).filter(r=>r.__wrWeek!=='' && !isNaN(Number(r.__wrWeek)));
  if(!enriched.length) return alert('Week Num / Week tidak terbaca. Pastikan Data punya kolom Week atau Week Num.');
  const latestWeek=Math.max(...enriched.map(r=>Number(r.__wrWeek)));
  const byClient=new Map();
  enriched.filter(r=>Number(r.__wrWeek)===latestWeek).forEach(r=>{
    const client=wrText(wrGet(r,['code_client','Client Name','client','code customer'])) || '(Blank Client)';
    if(!byClient.has(client)) byClient.set(client,{client,po:0,qty:0,received:0,open:0});
    const a=byClient.get(client);
    a.po += 1;
    a.qty += wrNum(wrGet(r,['quantity','Qty','qty']));
    a.received += wrNum(wrGet(r,['quantity_receive','Qty Received','quantity received','qty_receive']));
    a.open += wrNum(wrGet(r,['quantity_open','Qty Open','quantity open','qty_open']));
  });
  wrInboundByClientRows=[...byClient.values()].sort((a,b)=>a.client.localeCompare(b.client)).map(a=>({'Client Name':a.client,'PO':a.po,'Qty':a.qty,'Qty Received':a.received,'Qty Open':a.open}));
  const byWeek=new Map();
  enriched.forEach(r=>{
    const wk=Number(r.__wrWeek);
    if(!byWeek.has(wk)) byWeek.set(wk,{week:wk,qty:0,received:0,open:0});
    const a=byWeek.get(wk);
    a.qty += wrNum(wrGet(r,['quantity','Qty','qty']));
    a.received += wrNum(wrGet(r,['quantity_receive','Qty Received','quantity received','qty_receive']));
    a.open += wrNum(wrGet(r,['quantity_open','Qty Open','quantity open','qty_open']));
  });
  wrInboundW2WRows=[...byWeek.values()].sort((a,b)=>a.week-b.week).map(a=>({'Week Num':a.week,'Qty':a.qty,'Qty Received':a.received,'Qty Open':a.open}));
  if($('wrInboundRowsCount')) $('wrInboundRowsCount').textContent=wrInboundRows.length;
  if($('wrInboundLatestWeek')) $('wrInboundLatestWeek').textContent=latestWeek;
  if($('wrInboundClientCount')) $('wrInboundClientCount').textContent=wrInboundByClientRows.length;
  if($('wrInboundW2WCount')) $('wrInboundW2WCount').textContent=wrInboundW2WRows.length;
  wrRenderInboundPreview();
  const totalQty=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty']),0);
  const totalReceived=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty Received']),0);
  const totalOpen=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty Open']),0);
  if($('wrInboundStatus')) $('wrInboundStatus').innerHTML=`✅ Inbound report berhasil digenerate lengkap. Latest week: <b>${latestWeek}</b>. Client: <b>${wrInboundByClientRows.length}</b>. Total Qty week terbaru: <b>${totalQty.toLocaleString('en-US')}</b>, Received: <b>${totalReceived.toLocaleString('en-US')}</b>, Open: <b>${totalOpen.toLocaleString('en-US')}</b>.`;
}
function wrFormatNumber(v){return Number(v||0).toLocaleString('en-US')}
function wrInboundSummary(){
  const totalPo=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['PO']),0);
  const qtyPo=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty']),0);
  const qtyReceived=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty Received']),0);
  const qtyOpen=wrInboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty Open']),0);
  const pct=qtyPo?qtyReceived/qtyPo:0;
  const sorted=[...wrInboundByClientRows].filter(r=>wrNum(r['Qty'])>0).sort((a,b)=>wrNum(b['Qty'])-wrNum(a['Qty']));
  const high=sorted[0]||{};
  const low=sorted[sorted.length-1]||{};
  return [
    {Description:'Total PO', Qty:totalPo, 'Client Name':''},
    {Description:'Qty PO', Qty:qtyPo, 'Client Name':''},
    {Description:'Qty Open', Qty:qtyOpen, 'Client Name':''},
    {Description:'Qty Received', Qty:qtyReceived, 'Client Name':''},
    {Description:'Percentage progress', Qty:pct, 'Client Name':''},
    {Description:'Highest volume', Qty:wrNum(high['Qty']), 'Client Name':high['Client Name']||''},
    {Description:'Lowest Volume', Qty:wrNum(low['Qty']), 'Client Name':low['Client Name']||''}
  ];
}
function wrSummaryHtml(){
  const rows=wrInboundSummary();
  return `<div class="wrMiniTable"><table><thead><tr><th>Description</th><th>Qty</th><th>Client Name</th></tr></thead><tbody>${rows.map(r=>{
    const qty=r.Description==='Percentage progress' ? (wrNum(r.Qty)*100).toFixed(2)+'%' : wrFormatNumber(r.Qty);
    return `<tr><td>${r.Description}</td><td style="text-align:center">${qty}</td><td>${r['Client Name']||''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function wrTableHtml(rows){
  if(!rows||!rows.length) return '<div class="output">Belum ada data.</div>';
  const headers=Object.keys(rows[0]);
  return '<div class="tableWrap"><table><thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+rows.slice(0,300).map(r=>'<tr>'+headers.map(h=>`<td>${typeof r[h]==='number'?wrFormatNumber(r[h]):(r[h]??'')}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';
}
function wrRenderInboundPreview(){
  const topHtml=`<div class="wrPreviewLayout">
    <div class="wrSummaryGrid">
      <div><h3 style="margin:0 0 8px;color:#43207f">Summary Inbound Volume by Client</h3>${wrSummaryHtml()}</div>
      <div class="wrChartPanel"><h3 style="margin:0 0 8px;color:#43207f">Inbound W2W Chart</h3><canvas id="wrW2WCanvas" width="1400" height="520"></canvas></div>
    </div>
  </div>`;
  if($('wrInboundTopPreview')) $('wrInboundTopPreview').innerHTML=topHtml;
  if($('wrInboundPreview')) $('wrInboundPreview').innerHTML=wrTableHtml(wrInboundByClientRows);
  setTimeout(()=>{const c=$('wrW2WCanvas'); if(c) wrDrawW2WChart(c,wrInboundW2WRows);},0);
}
function wrDrawW2WChart(canvas,rows){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const m={l:78,r:22,t:34,b:78};
  const plotW=W-m.l-m.r, plotH=H-m.t-m.b;
  const maxVal=Math.max(1,...rows.flatMap(r=>[wrNum(r['Qty']),wrNum(r['Qty Received']),wrNum(r['Qty Open'])]));
  const step=Math.ceil(maxVal/9/1000)*1000 || 1000;
  const yMax=Math.ceil(maxVal/step)*step;
  ctx.strokeStyle='#d9d9d9';ctx.lineWidth=1;ctx.fillStyle='#000';ctx.font='16px Arial';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let v=0;v<=yMax;v+=step){
    const y=m.t+plotH-(v/yMax)*plotH;
    ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(W-m.r,y);ctx.stroke();
    ctx.fillText(v.toLocaleString('en-US'),m.l-10,y);
  }
  const n=rows.length; const groupW=plotW/Math.max(n,1); const barW=Math.min(38,groupW/5.2);
  const colors={qty:'#9183a2',received:'#dcefd5',open:'#d8bdbd'};
  rows.forEach((r,i)=>{
    const cx=m.l+i*groupW+groupW/2;
    const vals=[['Qty',wrNum(r['Qty']),colors.qty],['Qty Received',wrNum(r['Qty Received']),colors.received],['Qty Open',wrNum(r['Qty Open']),colors.open]];
    vals.forEach((it,j)=>{
      const x=cx-(barW*1.7)+(j*barW*1.25);
      const h=(it[1]/yMax)*plotH; const y=m.t+plotH-h;
      ctx.fillStyle=it[2];ctx.fillRect(x,y,barW,h);
      ctx.fillStyle='#000';ctx.font='15px Arial';ctx.textAlign='center';ctx.textBaseline='bottom';
      if(it[1]>0) ctx.fillText(it[1].toLocaleString('en-US'),x+barW/2,Math.max(y-6,m.t+12));
    });
    ctx.fillStyle='#000';ctx.font='15px Arial';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(String(r['Week Num']),cx,m.t+plotH+18);
  });
  const lx=W/2-120, ly=H-28;
  [['Qty',colors.qty],['Qty Received',colors.received],['Qty Open',colors.open]].forEach((it,i)=>{
    const x=lx+i*130; ctx.fillStyle=it[1];ctx.fillRect(x,ly-10,14,14);ctx.fillStyle='#333';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText(it[0],x+20,ly-3);
  });
}
function wrInboundDataForExport(){
  return (wrInboundRows||[]).map(r=>{
    const o={};
    const keys=[...new Set([...wrInboundHeaders,...Object.keys(r||{})])];
    keys.forEach(k=>o[k]=(k==='Week Num' && (!r[k] || String(r[k]).includes('='))) ? wrWeekValue(r) : (r[k]??''));
    return o;
  });
}
function wrAoaByClient(){
  const aoa=[new Array(6).fill(''),['','Client Name','PO','Qty','Qty Received','Qty Open']];
  wrInboundByClientRows.forEach(r=>aoa.push(['',r['Client Name'],r['PO'],r['Qty'],r['Qty Received'],r['Qty Open']]));
  const start=Math.max(13,aoa.length+2);
  while(aoa.length<start-1) aoa.push(new Array(6).fill(''));
  aoa.push(['','Description','Qty','Client Name','','']);
  wrInboundSummary().forEach(r=>aoa.push(['',r.Description,r.Qty,r['Client Name'],'','']));
  return aoa;
}
function wrAoaW2W(){
  const aoa=[new Array(7).fill(''),['','Week Num','Qty','Qty Received','Qty Open','','Chart Preview']];
  wrInboundW2WRows.forEach(r=>aoa.push(['',r['Week Num'],r['Qty'],r['Qty Received'],r['Qty Open'],'',wrTextBar(r)]));
  return aoa;
}
function wrTextBar(r){
  const max=Math.max(1,...wrInboundW2WRows.map(x=>wrNum(x['Qty'])));
  const len=Math.max(1,Math.round((wrNum(r['Qty'])/max)*34));
  return 'Qty ' + '█'.repeat(len) + ' ' + wrFormatNumber(r['Qty']);
}
async function wrExportInboundReport(){
  if(!wrInboundRows.length) return alert('Upload Data terlebih dahulu.');
  if(!wrInboundByClientRows.length || !wrInboundW2WRows.length) wrGenerateInboundReport();
  if(!wrInboundByClientRows.length) return;
  if(window.ExcelJS){
    try{
      await wrExportInboundReportExcelJS();
      return;
    }catch(err){
      console.error(err);
      alert('Export visual chart gagal, sistem pakai export fallback tanpa gambar chart.');
    }
  }
  const wb=XLSX.utils.book_new();
  const dataWs=XLSX.utils.json_to_sheet(wrInboundDataForExport());
  dataWs['!cols']=wrInboundHeaders.map(h=>({wch:Math.min(Math.max(String(h).length+3,12),28)}));
  XLSX.utils.book_append_sheet(wb,dataWs,'Data');
  const clientWs=XLSX.utils.aoa_to_sheet(wrAoaByClient());
  clientWs['!cols']=[{wch:4},{wch:32},{wch:12},{wch:16},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,clientWs,'Inbound volume by client');
  const w2wWs=XLSX.utils.aoa_to_sheet(wrAoaW2W());
  w2wWs['!cols']=[{wch:4},{wch:12},{wch:16},{wch:16},{wch:16},{wch:48}];
  XLSX.utils.book_append_sheet(wb,w2wWs,'Inbound W2W');
  XLSX.writeFile(wb,'Weekly_Report_Inbound_Volume_Generator.xlsx');
}
async function wrExportInboundReportExcelJS(){
  const wb=new ExcelJS.Workbook();
  wb.creator='FLOWGISTIK Sales Support Mega Apps';
  wb.created=new Date();
  const thin={style:'thin',color:{argb:'FF000000'}};
  const headerFill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8D7D9B'}};
  const headerFont={color:{argb:'FFFFFFFF'},bold:true};
  function styleHeader(cell){cell.fill=headerFill;cell.font=headerFont;cell.alignment={horizontal:'center',vertical:'middle'};cell.border={top:thin,left:thin,bottom:thin,right:thin};}
  function styleCell(cell,fmt){cell.border={top:thin,left:thin,bottom:thin,right:thin};cell.alignment={vertical:'middle'};if(fmt) cell.numFmt=fmt;}
  function addRows(ws,startRow,startCol,aoa,formats={}){
    aoa.forEach((row,ri)=>row.forEach((v,ci)=>{
      const c=ws.getCell(startRow+ri,startCol+ci); c.value=v;
      if(ri===0) styleHeader(c); else styleCell(c,formats[ci]);
    }));
  }
  const dataRows=wrInboundDataForExport();
  const dataWs=wb.addWorksheet('Data');
  const keys=[...new Set([...wrInboundHeaders,...Object.keys(dataRows[0]||{})])];
  dataWs.addRow(keys);
  dataRows.forEach(r=>dataWs.addRow(keys.map(k=>r[k]??'')));
  dataWs.getRow(1).eachCell(styleHeader);
  dataWs.views=[{state:'frozen',ySplit:1}];
  keys.forEach((k,i)=>dataWs.getColumn(i+1).width=Math.min(Math.max(String(k).length+3,12),28));
  const clientWs=wb.addWorksheet('Inbound volume by client');
  addRows(clientWs,2,2,[['Client Name','PO','Qty','Qty Received','Qty Open'],...wrInboundByClientRows.map(r=>[r['Client Name'],r['PO'],r['Qty'],r['Qty Received'],r['Qty Open']])],{1:'#,##0',2:'#,##0',3:'#,##0',4:'#,##0'});
  addRows(clientWs,13,2,[['Description','Qty','Client Name'],...wrInboundSummary().map(r=>[r.Description,r.Qty,r['Client Name']])],{1:'#,##0'});
  clientWs.getCell('C18').numFmt='0.00%';
  clientWs.columns=[{width:4},{width:32},{width:14},{width:32},{width:16},{width:16}];
  const w2wWs=wb.addWorksheet('Inbound W2W');
  addRows(w2wWs,2,2,[['Week Num','Qty','Qty Received','Qty Open'],...wrInboundW2WRows.map(r=>[r['Week Num'],r['Qty'],r['Qty Received'],r['Qty Open']])],{1:'#,##0',2:'#,##0',3:'#,##0'});
  w2wWs.columns=[{width:4},{width:12},{width:16},{width:16},{width:16},{width:4},{width:90}];
  try{
    const canvas=document.createElement('canvas'); canvas.width=1400; canvas.height=520; wrDrawW2WChart(canvas,wrInboundW2WRows);
    const imageId=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});
    w2wWs.addImage(imageId,{tl:{col:1,row:10},ext:{width:1350,height:500}});
  }catch(e){
    w2wWs.getCell('B12').value='Chart Preview';
    wrInboundW2WRows.forEach((r,i)=>{w2wWs.getCell(13+i,2).value=wrTextBar(r);});
  }
  const buffer=await wb.xlsx.writeBuffer();
  saveBlob(buffer,'Weekly_Report_Inbound_Volume_Generator.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function wrDownloadInboundTemplate(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([wrInboundHeaders]),'Data');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(wrAoaByClient()),'Inbound volume by client');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(wrAoaW2W()),'Inbound W2W');
  XLSX.writeFile(wb,'Template_Weekly_Report_Inbound_Generator.xlsx');
}
function wrResetInbound(){
  wrInboundRows=[]; wrInboundByClientRows=[]; wrInboundW2WRows=[]; wrInboundSourceFile='';
  if($('wrInboundFile')) $('wrInboundFile').value='';
  ['wrInboundRowsCount','wrInboundClientCount','wrInboundW2WCount'].forEach(id=>{if($(id)) $(id).textContent='0'});
  if($('wrInboundLatestWeek')) $('wrInboundLatestWeek').textContent='-';
  if($('wrInboundPreview')) $('wrInboundPreview').innerHTML='<div class="output">Belum ada hasil inbound.</div>';
  if($('wrInboundTopPreview')) $('wrInboundTopPreview').innerHTML='<div class="output">Belum ada summary. Upload Data terlebih dahulu.</div>';
  if($('wrInboundStatus')) $('wrInboundStatus').textContent='Upload sheet Data terlebih dahulu.';
}


/* Merge Orders Code by Koma - same logic as Merge Orders Code, separator comma */
let commaOrderBatches=[];
function mergeOrdersComma(){
  const input=$('commaOrdersInput');
  if(!input) return;
  let arr=input.value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
  let unique=new Set(arr);
  commaOrderBatches=[];
  for(let i=0;i<arr.length;i+=120){ commaOrderBatches.push(arr.slice(i,i+120)); }
  $('commaOrdersCount').textContent=arr.length;
  $('commaBatchCount').textContent=commaOrderBatches.length;
  $('commaDuplicateCount').textContent=arr.length-unique.size;
  $('commaStatus').textContent=arr.length?'Done':'Ready';
  if(!arr.length){ $('commaOrdersOutput').innerHTML=''; return; }
  $('commaOrdersOutput').innerHTML=commaOrderBatches.map((batch,i)=>`
    <div class="batchBox">
      <div class="batchHead"><b>Batch ${i+1}</b><span>${batch.length} orders</span></div>
      <pre id="commaBatch_${i}">${batch.join(',')}</pre>
      <button class="secondary smallBtn" onclick="copyCommaBatch(${i})">Copy Batch ${i+1}</button>
    </div>
  `).join('');
}
function clearCommaOrders(){
  const input=$('commaOrdersInput');
  if(input) input.value='';
  commaOrderBatches=[];
  mergeOrdersComma();
}
async function copyCommaBatch(i){
  const text=(commaOrderBatches[i]||[]).join(',');
  const ok=await safeCopy(text);
  alert(ok?'Batch '+(i+1)+' berhasil dicopy':'Copy gagal. Blok teks batch lalu tekan Ctrl+C.');
}
async function copyCommaAll(){
  let text=commaOrderBatches.map((b,i)=>`Batch ${i+1}:\n${b.join(',')}`).join('\n\n');
  const ok=await safeCopy(text||'');
  alert(ok?'Semua batch berhasil dicopy':'Copy gagal. Coba gunakan browser Chrome/Edge atau buka via localhost.');
}
function exportCommaBatches(){
  if(!commaOrderBatches || !commaOrderBatches.length){ alert('Generate batch dulu sebelum export.'); return; }
  const rows=commaOrderBatches.map((batch,i)=>({
    'Batch':'Batch '+(i+1),
    'Total Orders':batch.length,
    'Orders Code Comma':batch.join(',')
  }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Batch Summary');
  commaOrderBatches.forEach((batch,i)=>{
    const ws=XLSX.utils.aoa_to_sheet([
      ['Batch','Total Orders','Orders Code Comma'],
      ['Batch '+(i+1),batch.length,batch.join(',')]
    ]);
    XLSX.utils.book_append_sheet(wb,ws,'Batch_'+String(i+1).padStart(3,'0'));
  });
  XLSX.writeFile(wb,'Merge_Orders_Code_By_Koma_'+commaOrderBatches.length+'_batch.xlsx');
}
document.addEventListener('input',function(e){
  if(e.target && e.target.id==='commaOrdersInput') mergeOrdersComma();
});


/* Weekly Report Generator - Outbound Volume */
let wrOutboundRows=[];
let wrOutboundByClientRows=[];
let wrOutboundDetailRows=[];
let wrOutboundW2WRows=[];
let wrOutboundLatestWeek='';
let wrOutboundSourceFile='';
let wrOutboundImporting=false;
let wrOutboundStatusColumns=['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
const wrOutboundHeaders=['Week Num','Month','Date','order_id','local_order_date','client_order_id','client_reference_id','local_client_order_date','payment_type','shipping_type','code_client','code_customer','code_warehouse','subtotal','taxtotal','total','cod_amount','status_so','status_fo_leading','channel_sla','fulfillment_sla','delivery_sla','status_sho','sho_shipping_id','sho_lastmile_provider_awb','awb_external_updated_at','shipment_addressee','shipment_address1','shipment_address2','shipment_phone','shipment_email','shipment_geotag','shipment_country','shipment_province','shipment_city','shipment_district','shipment_subdistrict','shipment_postalcode','shipment_insurance','shipment_provider','shipment_provider_awb','sender_addressee','sender_address1','sender_address2','sender_phone','sender_email','sender_country','sender_province','sender_city','sender_district','sender_subdistrict','sender_postalcode','memo','channel_code','channel_name','channel_sub_channel','channel_courier','local_channel_created_at','local_channel_paid_at','local_channel_ship_before_at','created_by','local_created_at','canceled_by','local_canceled_at','cancel_reason_code','is_backorder','local_release_at','return_by','local_return_at','return_reason','use_promotion','promotion_code','code_item','client_code_item','code_upc_1','code_upc_2','item_descr','quantity','quantity_allocated','quantity_backorder','quantity_fulfill','rate','amount','item_cod_amount','discount_rate','tax_rate','tax_amount','gross_amount','line','item_type','uom','item_brand','product_code','client_product_code','product_descr','product_type','product_quantity','so_item_id'];
function wrOutboundBaseDate(row){
  // Source date utama outbound ada di local_order_date. Kolom Week Num, Month, Date boleh kosong di template,
  // sistem akan mengisinya otomatis dari local_order_date.
  return wrParseDate(wrGet(row,['local_order_date','Date','local_created_at','local_client_order_date','created_at']));
}
function wrDateYmd(d){
  if(!d || isNaN(d)) return '';
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function wrMonthName(d){
  if(!d || isNaN(d)) return '';
  return d.toLocaleString('en-US',{month:'long'});
}
function wrOutboundWeekValue(row){
  const raw=wrGet(row,['WeekNum','Week Num','Week','week_num']);
  const n=Number(String(raw||'').replace(/[^0-9.-]/g,''));
  if(raw!=='' && !String(raw).includes('=') && !isNaN(n) && n>0) return n;
  const d=wrOutboundBaseDate(row);
  return wrWeekNum(d) || wrWeekNum(wrGet(row,['Date','local_order_date','local_created_at']));
}
function wrOutboundDateValue(row){
  const d=wrOutboundBaseDate(row);
  if(d) return wrDateYmd(d);
  const raw=wrGet(row,['Date']);
  const parsed=wrParseDate(raw);
  return parsed ? wrDateYmd(parsed) : wrText(raw).slice(0,10);
}
function wrOutboundMonthValue(row){
  const raw=wrText(wrGet(row,['Month']));
  if(raw && !String(raw).includes('=')) return raw;
  const d=wrOutboundBaseDate(row);
  return d ? wrMonthName(d) : '';
}
function wrFillOutboundDateColumns(){
  wrOutboundRows=(wrOutboundRows||[]).map(r=>{
    const row={...r};
    const wk=wrOutboundWeekValue(row);
    const month=wrOutboundMonthValue(row);
    const date=wrOutboundDateValue(row);
    row['Week Num']=wk;
    if(Object.prototype.hasOwnProperty.call(row,'WeekNum')) row['WeekNum']=wk;
    row['Month']=month;
    row['Date']=date;
    return row;
  });
}
function wrOutboundStatus(row){
  return (wrText(wrGet(row,['status_so','Status SO','status'])) || 'BLANK').toUpperCase();
}
function wrOutboundClient(row){
  return wrText(wrGet(row,['code_client','Client Name','client','code customer'])) || '(Blank Client)';
}
function wrOutboundOrderId(row,idx){
  return wrText(wrGet(row,['order_id','Order ID','client_order_id'])) || ('ROW_'+idx);
}
function wrOutboundQty(row){ return wrNum(wrGet(row,['quantity','Qty','qty'])); }
function wrOutboundQtyFulfill(row){ return wrNum(wrGet(row,['quantity_fulfill','Qty Fulfilled','qty_fulfill','quantity fulfilled'])); }
async function wrImportOutbound(ev){
  const file=ev?.target?.files?.[0];
  if(!file) return;
  wrOutboundImporting=true;
  wrOutboundSourceFile=file.name;
  wrOutboundRows=[]; wrOutboundByClientRows=[]; wrOutboundDetailRows=[]; wrOutboundW2WRows=[]; wrOutboundLatestWeek='';
  const safeName0=String(file.name).replace(/[&<>"']/g,'');
  if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML=`⏳ Sedang membaca file <b>${safeName0}</b>. Tunggu sampai muncul <b>Import selesai</b>, report akan auto-generate.`;
  if($('wrOutboundRowsCount')) $('wrOutboundRowsCount').textContent='Reading...';
  if($('wrOutboundLatestWeek')) $('wrOutboundLatestWeek').textContent='-';
  if($('wrOutboundClientCount')) $('wrOutboundClientCount').textContent='0';
  if($('wrOutboundW2WCount')) $('wrOutboundW2WCount').textContent='0';
  await new Promise(resolve=>setTimeout(resolve,20));
  try{
    const data=await readFile(file);
    let wb=XLSX.read(data,{type:'array',cellDates:false,dense:false});
    if(!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error('Workbook tidak punya sheet yang bisa dibaca.');
    const outboundCandidates=['order_id','local_order_date','code_client','status_so','client_code_item','quantity','quantity_fulfill','Week Num','Date'];
    const preferredNames=['Data','data','DATA','Sheet1','sheet1','SHEET1'];
    let sheetName=preferredNames.find(n=>wb.Sheets && wb.Sheets[n]);
    if(!sheetName){
      let best={name:wb.SheetNames[0],score:-1};
      wb.SheetNames.forEach(n=>{
        const ws=wb.Sheets[n];
        if(!ws || !ws['!ref']) return;
        const range=XLSX.utils.decode_range(ws['!ref']);
        const maxScan=Math.min(range.e.r,range.s.r+80), maxCols=Math.min(range.e.c,range.s.c+80);
        let score=0;
        for(let r=range.s.r;r<=maxScan;r++){
          const row=[];
          for(let c=range.s.c;c<=maxCols;c++) row.push(wrCleanKey(wrCellRawValue(ws,r,c)));
          const s=outboundCandidates.map(wrCleanKey).reduce((a,c)=>a+(row.includes(c)?1:0),0);
          if(s>score) score=s;
        }
        if(score>best.score) best={name:n,score};
      });
      sheetName=best.name;
    }
    const ws=wb.Sheets[sheetName];
    if(!ws) throw new Error('Sheet source outbound tidak ditemukan.');
    wrOutboundRows=wrSheetRowsAuto(ws,outboundCandidates);
    wrOutboundRows=wrOutboundRows.filter((r,idx)=>{
      const vals=Object.values(r||{}).map(v=>String(v??'').trim());
      if(!vals.some(Boolean)) return false;
      const oid=wrText(wrGet(r,['order_id','Order ID','client_order_id']));
      const date=wrOutboundBaseDate(r) || wrParseDate(wrGet(r,['Date','local_order_date']));
      const client=wrText(wrGet(r,['code_client','Client Name','client','code customer']));
      const qty=wrOutboundQty(r);
      const fulfilled=wrOutboundQtyFulfill(r);
      const st=wrText(wrGet(r,['status_so','Status SO','status']));
      return Boolean(oid || date || client || qty || fulfilled || st);
    });
    wrFillOutboundDateColumns();
    if(!wrOutboundRows.length){
      if($('wrOutboundRowsCount')) $('wrOutboundRowsCount').textContent='0';
      if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML=`❌ Sheet <b>${sheetName}</b> terbaca, tapi row data outbound masih 0. Header yang dicari: <b>order_id, local_order_date, code_client, status_so, quantity, quantity_fulfill</b>. Coba cek apakah file tersimpan sebagai XLSX asli.`;
      return;
    }
    if($('wrOutboundRowsCount')) $('wrOutboundRowsCount').textContent=wrOutboundRows.length.toLocaleString('en-US');
    const safeName=(typeof pmEsc==='function')?pmEsc(file.name):String(file.name).replace(/[&<>"']/g,'');
    if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML=`✅ Import selesai dari sheet <b>${sheetName}</b>: <b>${wrOutboundRows.length.toLocaleString('en-US')}</b> rows. File: <span class="drSourcePill">${safeName}</span>. Week Num, Month, dan Date sudah otomatis diisi. Sedang generate report...`;
    await new Promise(resolve=>setTimeout(resolve,20));
    wrGenerateOutboundReport();
  }catch(err){
    console.error(err);
    wrOutboundRows=[];
    if($('wrOutboundRowsCount')) $('wrOutboundRowsCount').textContent='0';
    if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML=`❌ Import outbound gagal: ${String(err.message||err).replace(/[&<>"']/g,'')}. Coba save ulang file sebagai .xlsx lalu import lagi.`;
  }finally{
    wrOutboundImporting=false;
  }
}
function wrGenerateOutboundReport(){
  if(wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu status berubah menjadi Import selesai.');
  if(!wrOutboundRows.length) return alert('Upload file outbound/source data terlebih dahulu.');
  const enriched=wrOutboundRows.map((r,i)=>({
    ...r,
    '__wrWeek':wrOutboundWeekValue(r),
    '__wrDate':wrOutboundDateValue(r),
    '__wrOrderId':wrOutboundOrderId(r,i),
    '__wrClient':wrOutboundClient(r),
    '__wrStatus':wrOutboundStatus(r)
  })).filter(r=>r.__wrWeek!=='' && !isNaN(Number(r.__wrWeek)));
  if(!enriched.length) return alert('Week Num / Date tidak terbaca. Pastikan Data punya local_order_date atau Date.');
  const latestWeek=Math.max(...enriched.map(r=>Number(r.__wrWeek)));
  wrOutboundLatestWeek=latestWeek;
  const latestRows=enriched.filter(r=>Number(r.__wrWeek)===latestWeek);
  const coreStatuses=['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  const foundStatuses=[...new Set(latestRows.map(r=>r.__wrStatus).filter(Boolean))];
  wrOutboundStatusColumns=[...coreStatuses, ...foundStatuses.filter(s=>!coreStatuses.includes(s)).sort((a,b)=>a.localeCompare(b))];
  const byClient=new Map();
  latestRows.forEach(r=>{
    const client=r.__wrClient;
    if(!byClient.has(client)){
      const statusSets={}; wrOutboundStatusColumns.forEach(s=>statusSets[s]=new Set());
      byClient.set(client,{client,orders:new Set(),statusSets,qty:0,fulfilled:0});
    }
    const a=byClient.get(client);
    a.orders.add(r.__wrOrderId);
    if(!a.statusSets[r.__wrStatus]) a.statusSets[r.__wrStatus]=new Set();
    a.statusSets[r.__wrStatus].add(r.__wrOrderId);
    a.qty += wrOutboundQty(r);
    a.fulfilled += wrOutboundQtyFulfill(r);
  });
  wrOutboundByClientRows=[...byClient.values()].sort((a,b)=>b.orders.size-a.orders.size || a.client.localeCompare(b.client)).map(a=>{
    const row={'Client Name':a.client};
    wrOutboundStatusColumns.forEach(st=>row[st]=(a.statusSets[st]||new Set()).size);
    row['Total Orders']=a.orders.size;
    row['Qty']=a.qty;
    row['Qty Fulfilled']=a.fulfilled;
    row['Basket Size']=a.orders.size ? a.qty/a.orders.size : 0;
    row['Qty vs Qty Fulfilled']=a.qty ? a.fulfilled/a.qty : 0;
    return row;
  });
  const detailStatuses=wrOutboundStatusColumns.filter(st=>st!=='NONE_ALLOCATED' || latestRows.some(r=>r.__wrStatus==='NONE_ALLOCATED'));
  const dates=[...new Set(latestRows.map(r=>r.__wrDate).filter(Boolean))].sort();
  const clients=[...new Set(latestRows.map(r=>r.__wrClient))].sort((a,b)=>a.localeCompare(b));
  const detailMap=new Map();
  latestRows.forEach(r=>{
    const key=r.__wrClient+'||'+r.__wrDate+'||'+r.__wrStatus;
    if(!detailMap.has(key)) detailMap.set(key,new Set());
    detailMap.get(key).add(r.__wrOrderId);
  });
  wrOutboundDetailRows=clients.map(client=>{
    const row={'Client Name':client};
    dates.forEach(date=>detailStatuses.forEach(st=>{
      row[`${date} ${st}`]=(detailMap.get(client+'||'+date+'||'+st)||new Set()).size;
    }));
    return row;
  });
  const byWeek=new Map();
  enriched.forEach(r=>{
    const wk=Number(r.__wrWeek);
    if(!byWeek.has(wk)) byWeek.set(wk,{week:wk,orders:new Set(),qty:0,fulfilled:0});
    const a=byWeek.get(wk);
    a.orders.add(r.__wrOrderId);
    a.qty += wrOutboundQty(r);
    a.fulfilled += wrOutboundQtyFulfill(r);
  });
  wrOutboundW2WRows=[...byWeek.values()].sort((a,b)=>a.week-b.week).map(a=>({'Week':a.week,'Orders':a.orders.size,'Qty':a.qty,'Qty Fulfilled':a.fulfilled}));
  if($('wrOutboundRowsCount')) $('wrOutboundRowsCount').textContent=wrOutboundRows.length.toLocaleString('en-US');
  if($('wrOutboundLatestWeek')) $('wrOutboundLatestWeek').textContent=latestWeek;
  if($('wrOutboundClientCount')) $('wrOutboundClientCount').textContent=wrOutboundByClientRows.length;
  if($('wrOutboundW2WCount')) $('wrOutboundW2WCount').textContent=wrOutboundW2WRows.length;
  wrRenderOutboundPreview();
  const totalOrders=wrOutboundByClientRows.reduce((a,r)=>a+wrNum(r['Total Orders']),0);
  const totalQty=wrOutboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty']),0);
  const totalFulfilled=wrOutboundByClientRows.reduce((a,r)=>a+wrNum(r['Qty Fulfilled']),0);
  if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML=`✅ Outbound report berhasil digenerate lengkap. Latest week: <b>${latestWeek}</b>. Client: <b>${wrOutboundByClientRows.length}</b>. Orders: <b>${totalOrders.toLocaleString('en-US')}</b>, Qty: <b>${totalQty.toLocaleString('en-US')}</b>, Qty Fulfilled: <b>${totalFulfilled.toLocaleString('en-US')}</b>. Status terbaca: <b>${wrOutboundStatusColumns.join(', ')}</b>.`;
}
function wrRenderOutboundPreview(){
  const topHtml=`<div class="wrPreviewLayout">
    <div class="wrChartPanel"><h3 style="margin:0 0 8px;color:#43207f">Outbound W2W Chart</h3><canvas id="wrOutboundW2WCanvas" width="1400" height="520"></canvas></div>
  </div>`;
  if($('wrOutboundTopPreview')) $('wrOutboundTopPreview').innerHTML=topHtml;
  if($('wrOutboundClientPreview')) $('wrOutboundClientPreview').innerHTML=wrTableHtml(wrOutboundByClientRows);
  if($('wrOutboundDetailPreview')) $('wrOutboundDetailPreview').innerHTML=wrTableHtml(wrOutboundDetailRows);
  setTimeout(()=>{const c=$('wrOutboundW2WCanvas'); if(c) wrDrawOutboundW2WChart(c,wrOutboundW2WRows);},0);
}
function wrDrawOutboundW2WChart(canvas,rows){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const m={l:78,r:22,t:34,b:78};
  const plotW=W-m.l-m.r, plotH=H-m.t-m.b;
  const maxVal=Math.max(1,...rows.flatMap(r=>[wrNum(r['Orders']),wrNum(r['Qty']),wrNum(r['Qty Fulfilled'])]));
  const step=Math.ceil(maxVal/9/1000)*1000 || 1000;
  const yMax=Math.ceil(maxVal/step)*step;
  ctx.strokeStyle='#d9d9d9';ctx.lineWidth=1;ctx.fillStyle='#000';ctx.font='16px Arial';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let v=0;v<=yMax;v+=step){
    const y=m.t+plotH-(v/yMax)*plotH;
    ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(W-m.r,y);ctx.stroke();
    ctx.fillText(v.toLocaleString('en-US'),m.l-10,y);
  }
  const n=rows.length; const groupW=plotW/Math.max(n,1); const barW=Math.min(48,groupW/5.2);
  const colors={orders:'#9183a2',qty:'#dcefd5',fulfilled:'#d8bdbd'};
  rows.forEach((r,i)=>{
    const cx=m.l+i*groupW+groupW/2;
    const vals=[['Orders',wrNum(r['Orders']),colors.orders],['Qty',wrNum(r['Qty']),colors.qty],['Qty Fulfilled',wrNum(r['Qty Fulfilled']),colors.fulfilled]];
    vals.forEach((it,j)=>{
      const x=cx-(barW*1.7)+(j*barW*1.25);
      const h=(it[1]/yMax)*plotH; const y=m.t+plotH-h;
      ctx.fillStyle=it[2];ctx.fillRect(x,y,barW,h);
      ctx.fillStyle='#000';ctx.font='15px Arial';ctx.textAlign='center';ctx.textBaseline='bottom';
      if(it[1]>0) ctx.fillText(it[1].toLocaleString('en-US'),x+barW/2,Math.max(y-6,m.t+12));
    });
    ctx.fillStyle='#000';ctx.font='15px Arial';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(String(r['Week']),cx,m.t+plotH+18);
  });
  const lx=W/2-150, ly=H-28;
  [['Orders',colors.orders],['Qty',colors.qty],['Qty Fulfilled',colors.fulfilled]].forEach((it,i)=>{
    const x=lx+i*145; ctx.fillStyle=it[1];ctx.fillRect(x,ly-10,14,14);ctx.fillStyle='#333';ctx.font='14px Arial';ctx.textAlign='left';ctx.fillText(it[0],x+20,ly-3);
  });
}
function wrOutboundDataKeysForExport(){
  // Jangan paksa 100+ kolom template saat source cuma compact 7 kolom.
  // Bug export sebelumnya terjadi karena 349k rows x 100+ kolom kosong = workbook terlalu berat.
  const seen={}; const keys=[];
  function add(k){
    if(k===undefined || k===null) return;
    k=String(k);
    if(!k || k.startsWith('__wr')) return;
    const clean=wrCleanKey(k);
    if(!clean || seen[clean]) return;
    seen[clean]=true; keys.push(k);
  }
  ['Week Num','Month','Date'].forEach(add);
  const scanLimit=Math.min((wrOutboundRows||[]).length,1000);
  for(let i=0;i<scanLimit;i++) Object.keys(wrOutboundRows[i]||{}).forEach(add);
  // Kalau file full punya kolom tambahan setelah 1000 rows, tetap ambil dari row pertama dan headers asli yang benar-benar ada.
  Object.keys((wrOutboundRows||[])[0]||{}).forEach(add);
  // Pastikan kolom core ada walaupun source tidak urut.
  ['order_id','local_order_date','code_client','status_so','client_code_item','quantity','quantity_fulfill'].forEach(add);
  return keys;
}
function wrOutboundDataForExport(){
  const keys=wrOutboundDataKeysForExport();
  return (wrOutboundRows||[]).map(r=>{
    const o={};
    keys.forEach(k=>{
      const ck=wrCleanKey(k);
      if(ck==='weeknum') o[k]=wrOutboundWeekValue(r);
      else if(ck==='month') o[k]=wrOutboundMonthValue(r);
      else if(ck==='date') o[k]=wrOutboundDateValue(r);
      else o[k]=r[k]??'';
    });
    return o;
  });
}
function wrSheetFromRowsFast(rows,keys){
  const ws={};
  const encode=XLSX.utils.encode_cell;
  keys.forEach((h,c)=>{ws[encode({r:0,c})]={t:'s',v:h};});
  for(let r=0;r<rows.length;r++){
    const row=rows[r]||{};
    for(let c=0;c<keys.length;c++){
      const v=row[keys[c]];
      if(v===undefined || v===null || v==='') continue;
      const cell={v:v};
      if(typeof v==='number' && isFinite(v)) cell.t='n';
      else cell.t='s';
      ws[encode({r:r+1,c})]=cell;
    }
  }
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(rows.length,0),c:Math.max(keys.length-1,0)}});
  ws['!cols']=keys.map(k=>({wch:Math.min(Math.max(String(k).length+2,12),28)}));
  return ws;
}
function wrAoaSheetFast(aoa){
  const ws=XLSX.utils.aoa_to_sheet(aoa||[]);
  if(aoa && aoa.length){
    const maxCols=Math.max(...aoa.map(r=>(r||[]).length));
    ws['!cols']=Array.from({length:maxCols},(_,i)=>({wch:i===1?32:14}));
  }
  return ws;
}
function wrExportOutboundReportXLSXFast(){
  if(!wrOutboundRows.length) return alert('Upload Data terlebih dahulu.');
  if(!wrOutboundByClientRows.length || !wrOutboundW2WRows.length) wrGenerateOutboundReport();
  if(!wrOutboundByClientRows.length) return;
  if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML='⏳ Sedang menyiapkan export outbound mode cepat. Jangan tutup halaman.';
  const wb=XLSX.utils.book_new();
  const dataRows=wrOutboundDataForExport();
  const dataKeys=wrOutboundDataKeysForExport();
  XLSX.utils.book_append_sheet(wb,wrSheetFromRowsFast(dataRows,dataKeys),'Data');
  const statusCols=wrOutboundStatusColumns && wrOutboundStatusColumns.length ? wrOutboundStatusColumns : ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  const clientKeys=['Client Name',...statusCols,'Total Orders','Qty','Qty Fulfilled','Basket Size','Qty vs Qty Fulfilled'];
  const clientRows=wrOutboundByClientRows.map(r=>{
    const o={}; clientKeys.forEach(k=>o[k]=r[k]??0); o['Client Name']=r['Client Name']; return o;
  });
  XLSX.utils.book_append_sheet(wb,wrSheetFromRowsFast(clientRows,clientKeys),'Outbound volume by Client');
  XLSX.utils.book_append_sheet(wb,wrAoaSheetFast(wrOutboundDetailAoa()),'Outbound volume by Detail');
  const w2wKeys=['Week','Orders','Qty','Qty Fulfilled'];
  XLSX.utils.book_append_sheet(wb,wrSheetFromRowsFast(wrOutboundW2WRows,w2wKeys),'Outbound volume W2W');
  XLSX.writeFile(wb,'Weekly_Report_Outbound_Volume_Generator.xlsx',{compression:true});
  if($('wrOutboundStatus')) $('wrOutboundStatus').innerHTML='✅ Export outbound selesai. File sudah terdownload.';
}
function wrOutboundDetailAoa(){
  if(!wrOutboundDetailRows.length) return [[],[]];
  const dates=[];
  const statusByDate={};
  Object.keys(wrOutboundDetailRows[0]).forEach(k=>{
    const m=String(k).match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    if(m){
      if(!dates.includes(m[1])) dates.push(m[1]);
      if(!statusByDate[m[1]]) statusByDate[m[1]]=[];
      if(!statusByDate[m[1]].includes(m[2])) statusByDate[m[1]].push(m[2]);
    }
  });
  dates.sort();
  const row1=['',''];
  const row2=['','Client Name'];
  dates.forEach(d=>{
    const sts=statusByDate[d]||[];
    sts.forEach(()=>row1.push(d));
    sts.forEach(st=>row2.push(st));
  });
  const aoa=[new Array(row2.length).fill(''),row1,row2];
  wrOutboundDetailRows.forEach(r=>{
    const arr=['',r['Client Name']];
    dates.forEach(d=>(statusByDate[d]||[]).forEach(st=>arr.push(r[`${d} ${st}`]||0)));
    aoa.push(arr);
  });
  return aoa;
}
async function wrExportOutboundReport(){
  if(wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu status berubah menjadi Import selesai.');
  if(!wrOutboundRows.length) return alert('Upload Data terlebih dahulu.');
  if(!wrOutboundByClientRows.length || !wrOutboundW2WRows.length) wrGenerateOutboundReport();
  if(!wrOutboundByClientRows.length) return;
  // Untuk file besar seperti Outbound Testing.xlsx, pakai mode cepat SheetJS.
  // Ini menghindari gagal export karena ExcelJS terlalu berat saat Data mencapai ratusan ribu rows.
  if((wrOutboundRows||[]).length>50000){
    setTimeout(()=>wrExportOutboundReportXLSXFast(),50);
    return;
  }
  if(window.ExcelJS){
    try{
      await wrExportOutboundReportExcelJS();
      return;
    }catch(err){
      console.error(err);
      alert('Export visual chart gagal, sistem pakai export mode cepat.');
    }
  }
  wrExportOutboundReportXLSXFast();
}
async function wrExportOutboundReportExcelJS(){
  const wb=new ExcelJS.Workbook();
  wb.creator='FLOWGISTIK Sales Support Mega Apps';
  wb.created=new Date();
  const thin={style:'thin',color:{argb:'FF000000'}};
  const headerFill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8D7D9B'}};
  const subFill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDDEDD6'}};
  const headerFont={color:{argb:'FFFFFFFF'},bold:true};
  function styleHeader(cell,fill=headerFill){cell.fill=fill;cell.font=fill===headerFill?headerFont:{bold:true};cell.alignment={horizontal:'center',vertical:'middle'};cell.border={top:thin,left:thin,bottom:thin,right:thin};}
  function styleCell(cell,fmt){cell.border={top:thin,left:thin,bottom:thin,right:thin};cell.alignment={vertical:'middle'};if(fmt) cell.numFmt=fmt;}
  const dataRows=wrOutboundDataForExport();
  const dataWs=wb.addWorksheet('Data');
  const keys=wrOutboundDataKeysForExport();
  dataWs.addRow(keys); dataRows.forEach(r=>dataWs.addRow(keys.map(k=>r[k]??'')));
  dataWs.getRow(1).eachCell(c=>styleHeader(c));
  dataWs.views=[{state:'frozen',ySplit:1}];
  keys.forEach((k,i)=>dataWs.getColumn(i+1).width=Math.min(Math.max(String(k).length+3,12),28));
  const clientWs=wb.addWorksheet('Outbound volume by Client');
  const statusCols=wrOutboundStatusColumns && wrOutboundStatusColumns.length ? wrOutboundStatusColumns : ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  const clientHeader=['Client Name',...statusCols,'Total Orders','Qty','Qty Fulfilled','','Basket Size','Qty vs Qty Fulfilled'];
  clientWs.addRow([]); clientWs.addRow(['',...clientHeader]);
  wrOutboundByClientRows.forEach(r=>clientWs.addRow(['',r['Client Name'],...statusCols.map(st=>r[st]||0),r['Total Orders'],r['Qty'],r['Qty Fulfilled'],'',r['Basket Size'],r['Qty vs Qty Fulfilled']]));
  clientWs.getRow(2).eachCell(c=>styleHeader(c));
  const basketCol=2+clientHeader.indexOf('Basket Size');
  const pctCol=2+clientHeader.indexOf('Qty vs Qty Fulfilled');
  for(let r=3;r<=clientWs.rowCount;r++){
    for(let c=2;c<=clientHeader.length+1;c++) styleCell(clientWs.getCell(r,c), c===basketCol?'0.00':c===pctCol?'0.00%':'#,##0');
  }
  clientWs.columns=[{width:4},{width:32},...clientHeader.slice(1).map(h=>({width:Math.min(Math.max(String(h).length+4,12),22)}))];
  const detailWs=wb.addWorksheet('Outbound volume by Detail');
  const aoa=wrOutboundDetailAoa();
  aoa.forEach(row=>detailWs.addRow(row));
  detailWs.getRow(2).eachCell(c=>styleHeader(c,subFill));
  detailWs.getRow(3).eachCell(c=>styleHeader(c));
  detailWs.getColumn(2).width=32;
  for(let c=3;c<=detailWs.columnCount;c++) detailWs.getColumn(c).width=12;
  for(let r=4;r<=detailWs.rowCount;r++) for(let c=2;c<=detailWs.columnCount;c++) styleCell(detailWs.getCell(r,c), c===2?undefined:'#,##0');
  // Merge repeated date headers dynamically based on repeated date cells in row 2
  let col=3;
  while(col<=detailWs.columnCount){
    const dateVal=detailWs.getCell(2,col).value;
    let end=col;
    while(end+1<=detailWs.columnCount && detailWs.getCell(2,end+1).value===dateVal) end++;
    if(dateVal && end>col) detailWs.mergeCells(2,col,2,end);
    col=end+1;
  }
  const w2wWs=wb.addWorksheet('Outbound volume W2W');
  w2wWs.addRow([]); w2wWs.addRow(['','Week','Orders','Qty','Qty Fulfilled']);
  wrOutboundW2WRows.forEach(r=>w2wWs.addRow(['',r['Week'],r['Orders'],r['Qty'],r['Qty Fulfilled']]));
  w2wWs.getRow(2).eachCell(c=>styleHeader(c));
  for(let r=3;r<=w2wWs.rowCount;r++) for(let c=2;c<=5;c++) styleCell(w2wWs.getCell(r,c),'#,##0');
  w2wWs.columns=[{width:4},{width:12},{width:16},{width:16},{width:18},{width:4},{width:90}];
  try{
    const canvas=document.createElement('canvas'); canvas.width=1400; canvas.height=520; wrDrawOutboundW2WChart(canvas,wrOutboundW2WRows);
    const imageId=wb.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});
    w2wWs.addImage(imageId,{tl:{col:1,row:8},ext:{width:1350,height:500}});
  }catch(e){
    w2wWs.getCell('B10').value='Chart Preview';
  }
  const buffer=await wb.xlsx.writeBuffer();
  saveBlob(buffer,'Weekly_Report_Outbound_Volume_Generator.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function wrDownloadOutboundTemplate(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([wrOutboundHeaders]),'Data');
  XLSX.writeFile(wb,'Template_Weekly_Report_Outbound_Generator.xlsx');
}
function wrResetOutbound(){
  wrOutboundRows=[]; wrOutboundByClientRows=[]; wrOutboundDetailRows=[]; wrOutboundW2WRows=[]; wrOutboundLatestWeek=''; wrOutboundSourceFile=''; wrOutboundImporting=false;
  if($('wrOutboundFile')) $('wrOutboundFile').value='';
  ['wrOutboundRowsCount','wrOutboundClientCount','wrOutboundW2WCount'].forEach(id=>{if($(id)) $(id).textContent='0'});
  if($('wrOutboundLatestWeek')) $('wrOutboundLatestWeek').textContent='-';
  if($('wrOutboundTopPreview')) $('wrOutboundTopPreview').innerHTML='<div class="output">Belum ada W2W. Upload Data terlebih dahulu.</div>';
  if($('wrOutboundClientPreview')) $('wrOutboundClientPreview').innerHTML='<div class="output">Belum ada hasil outbound by client.</div>';
  if($('wrOutboundDetailPreview')) $('wrOutboundDetailPreview').innerHTML='<div class="output">Belum ada hasil outbound detail.</div>';
  if($('wrOutboundStatus')) $('wrOutboundStatus').textContent='Upload sheet Data terlebih dahulu.';
}



/* ===== v13 FIX: Outbound Compact Template Engine =====
   Source template: order_id, local_order_date, code_client, status_so, client_code_item, quantity, quantity_fulfill.
   This override intentionally replaces the old outbound import/generate/export functions only.
*/
(function(){
  const CORE_STATUSES = ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  const CORE_HEADERS = ['order_id','local_order_date','code_client','status_so','client_code_item','quantity','quantity_fulfill'];
  const DATA_EXPORT_HEADERS = ['WeekNum','Month','Date','order_id','local_order_date','code_client','status_so','client_code_item','quantity','quantity_fulfill'];

  function el(id){ return document.getElementById(id); }
  function cleanKey(v){ return String(v ?? '').toLowerCase().replace(/[\s_\-\/\.\(\)\n\r]+/g,'').replace(/[^a-z0-9]/g,''); }
  function text(v){ return String(v ?? '').trim(); }
  function num(v){
    if(v === undefined || v === null || String(v).trim()==='') return 0;
    if(typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/,/g,'').replace(/\s/g,'');
    let n = Number(s);
    if(!isNaN(n)) return n;
    n = Number(String(v).replace(',','.'));
    return isNaN(n) ? 0 : n;
  }
  function parseDate(v){
    if(v === undefined || v === null || String(v).trim()==='') return null;
    if(v instanceof Date && !isNaN(v)) return v;
    if(typeof v === 'number'){
      const utc = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(utc);
      return isNaN(d) ? null : d;
    }
    let s = String(v).trim();
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if(m){ const d = new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0)); return isNaN(d) ? null : d; }
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if(m){ let y=+m[3]; if(y<100) y+=2000; const d = new Date(y, +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0)); return isNaN(d) ? null : d; }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function ymd(d){
    if(!d || isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function monthName(d){ return d && !isNaN(d) ? d.toLocaleString('en-US',{month:'long'}) : ''; }
  function weekNum(v){
    const d = parseDate(v);
    if(!d) return '';
    const start = new Date(d.getFullYear(),0,1);
    const day = Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate()) - start) / 86400000) + 1;
    return Math.ceil((day + start.getDay()) / 7);
  }
  function get(row, names){
    const map = {};
    Object.keys(row || {}).forEach(k => map[cleanKey(k)] = k);
    for(const n of names){
      const k = map[cleanKey(n)];
      if(k !== undefined && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
    }
    return '';
  }
  function fmtDateTime(v){
    const d = parseDate(v);
    if(!d) return text(v);
    return ymd(d) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
  }
  function normalizeRow(raw, idx){
    const local = get(raw,['local_order_date','Date','local_created_at','created_at']);
    const d = parseDate(local);
    const status = (text(get(raw,['status_so','status','Status SO'])) || 'BLANK').toUpperCase();
    return {
      WeekNum: weekNum(d || local),
      Month: monthName(d),
      Date: ymd(d),
      order_id: text(get(raw,['order_id','Order ID','client_order_id'])) || ('ROW_'+idx),
      local_order_date: fmtDateTime(local),
      code_client: text(get(raw,['code_client','Client Name','client','code customer'])) || '(Blank Client)',
      status_so: status,
      client_code_item: text(get(raw,['client_code_item','code_item','Item SKU','SKU'])),
      quantity: num(get(raw,['quantity','Qty','qty'])),
      quantity_fulfill: num(get(raw,['quantity_fulfill','Qty Fulfilled','qty_fulfill','quantity fulfilled']))
    };
  }
  function cellValue(ws, r, c){
    let cell;
    if(Array.isArray(ws) && ws[r] && ws[r][c] !== undefined) cell = ws[r][c];
    if(cell === undefined && ws['!data'] && ws['!data'][r] && ws['!data'][r][c] !== undefined) cell = ws['!data'][r][c];
    if(cell === undefined) cell = ws[XLSX.utils.encode_cell({r,c})];
    if(cell === undefined || cell === null) return '';
    if(typeof cell === 'object') return cell.v !== undefined ? cell.v : (cell.w !== undefined ? cell.w : '');
    return cell;
  }
  function sheetToObjects(ws){
    if(!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const candidates = CORE_HEADERS.map(cleanKey);
    let bestR = range.s.r, bestScore = -1;
    const maxR = Math.min(range.e.r, range.s.r + 80);
    const maxC = Math.min(range.e.c, range.s.c + 80);
    for(let r=range.s.r; r<=maxR; r++){
      let row = [], filled = 0;
      for(let c=range.s.c; c<=maxC; c++){
        const ck = cleanKey(cellValue(ws,r,c));
        row.push(ck); if(ck) filled++;
      }
      const matches = candidates.reduce((a,k)=> a + (row.includes(k) ? 1 : 0), 0);
      const score = matches * 1000 + filled;
      if(score > bestScore){ bestScore = score; bestR = r; }
    }
    const headers = [];
    const seen = {};
    for(let c=range.s.c; c<=range.e.c; c++){
      let h = text(cellValue(ws,bestR,c)) || ('Column ' + (c-range.s.c+1));
      const ck = cleanKey(h) || ('col'+c);
      seen[ck] = (seen[ck] || 0) + 1;
      if(seen[ck] > 1) h += '_' + seen[ck];
      headers.push(h);
    }
    const out = [];
    for(let r=bestR+1; r<=range.e.r; r++){
      const obj = {}; let any = false;
      for(let c=range.s.c; c<=range.e.c; c++){
        const v = cellValue(ws,r,c);
        if(v !== undefined && v !== null && text(v) !== '') any = true;
        obj[headers[c-range.s.c]] = v ?? '';
      }
      if(any) out.push(obj);
    }
    return out;
  }
  function pickOutboundSheet(wb){
    const preferred = ['Data','data','DATA','Sheet1','sheet1','SHEET1'];
    for(const n of preferred){ if(wb.Sheets[n]) return n; }
    let best = wb.SheetNames[0], bestScore = -1;
    for(const name of wb.SheetNames){
      const ws = wb.Sheets[name]; if(!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      let score = 0;
      const maxR = Math.min(range.e.r, range.s.r + 30);
      const maxC = Math.min(range.e.c, range.s.c + 30);
      for(let r=range.s.r; r<=maxR; r++){
        const row = [];
        for(let c=range.s.c; c<=maxC; c++) row.push(cleanKey(cellValue(ws,r,c)));
        score = Math.max(score, CORE_HEADERS.map(cleanKey).reduce((a,k)=>a+(row.includes(k)?1:0),0));
      }
      if(score > bestScore){ bestScore = score; best = name; }
    }
    return best;
  }
  function tableHtml(rows, limit=300){
    if(!rows || !rows.length) return '<div class="output">Belum ada data.</div>';
    const headers = Object.keys(rows[0]);
    let html = '<table><thead><tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';
    rows.slice(0,limit).forEach(r => { html += '<tr>' + headers.map(h=>`<td>${r[h] ?? ''}</td>`).join('') + '</tr>'; });
    html += '</tbody></table>';
    if(rows.length > limit) html += `<div class="hint">Preview ${limit} dari ${rows.length} rows. Export tetap berisi semua data.</div>`;
    return html;
  }
  function setStatus(msg){ if(el('wrOutboundStatus')) el('wrOutboundStatus').innerHTML = msg; }
  function setText(id, v){ if(el(id)) el(id).textContent = v; }

  window.wrImportOutbound = async function(ev){
    const file = ev?.target?.files?.[0];
    if(!file) return;
    window.wrOutboundImporting = true;
    window.wrOutboundSourceFile = file.name;
    window.wrOutboundRows = [];
    window.wrOutboundByClientRows = [];
    window.wrOutboundDetailRows = [];
    window.wrOutboundW2WRows = [];
    window.wrOutboundLatestWeek = '';
    setStatus(`⏳ Sedang import <b>${file.name.replace(/[&<>"']/g,'')}</b>. Tunggu sampai selesai, jangan klik export dulu.`);
    setText('wrOutboundRowsCount','Reading...'); setText('wrOutboundLatestWeek','-'); setText('wrOutboundClientCount','0'); setText('wrOutboundW2WCount','0');
    await new Promise(r=>setTimeout(r,30));
    try{
      const data = await readFile(file);
      const wb = XLSX.read(data,{type:'array',cellDates:true,dense:false});
      const sheetName = pickOutboundSheet(wb);
      const rawRows = sheetToObjects(wb.Sheets[sheetName]);
      const rows = rawRows.map(normalizeRow).filter(r => r.order_id && r.code_client && r.status_so && r.Date);
      if(!rows.length) throw new Error('Tidak ada row valid. Wajib ada kolom order_id, local_order_date, code_client, status_so, client_code_item, quantity, quantity_fulfill.');
      window.wrOutboundRows = rows;
      setStatus(`✅ Import selesai dari sheet <b>${sheetName}</b>. Terbaca <b>${rows.length.toLocaleString('en-US')}</b> rows. Report sudah auto-generate.`);
      wrGenerateOutboundReport();
    }catch(err){
      console.error(err);
      setStatus('❌ Import outbound gagal: ' + (err.message || err));
      alert('Import outbound gagal: ' + (err.message || err));
    }finally{
      window.wrOutboundImporting = false;
    }
  };

  window.wrGenerateOutboundReport = function(){
    const rows = window.wrOutboundRows || [];
    if(!rows.length){ setStatus('Upload file outbound template compact terlebih dahulu.'); return; }
    const weekNums = [...new Set(rows.map(r=>Number(r.WeekNum)).filter(Boolean))].sort((a,b)=>a-b);
    const latestWeek = weekNums[weekNums.length-1];
    window.wrOutboundLatestWeek = latestWeek || '';
    const statusFound = [...new Set(rows.map(r=>r.status_so).filter(Boolean))].sort();
    const statusCols = [...CORE_STATUSES, ...statusFound.filter(s=>!CORE_STATUSES.includes(s))];
    window.wrOutboundStatusColumns = statusCols;

    function aggregateClient(sourceRows){
      const map = new Map();
      sourceRows.forEach(r=>{
        const key = r.code_client || '(Blank Client)';
        if(!map.has(key)) map.set(key,{client:key, orders:new Set(), qty:0, qf:0, statusOrders:{}});
        const g = map.get(key);
        g.orders.add(r.order_id);
        g.qty += num(r.quantity); g.qf += num(r.quantity_fulfill);
        if(!g.statusOrders[r.status_so]) g.statusOrders[r.status_so] = new Set();
        g.statusOrders[r.status_so].add(r.order_id);
      });
      return [...map.values()].map(g=>{
        const total = g.orders.size;
        const o = {'Client Name':g.client};
        statusCols.forEach(st=>o[st] = (g.statusOrders[st] ? g.statusOrders[st].size : 0));
        o['Total Orders'] = total;
        o['Qty'] = g.qty;
        o['Qty Fulfilled'] = g.qf;
        o['Basket Size'] = total ? g.qty / total : 0;
        o['Qty vs Qty Fulfilled'] = g.qty ? g.qf / g.qty : 0;
        o['% Canceled'] = total ? (o['CANCEL'] || 0) / total : 0;
        return o;
      }).sort((a,b)=>(b['Total Orders']||0)-(a['Total Orders']||0));
    }

    const latestRows = latestWeek ? rows.filter(r=>Number(r.WeekNum)===Number(latestWeek)) : rows;
    window.wrOutboundByClientRows = aggregateClient(latestRows);

    const weeks = new Map();
    rows.forEach(r=>{
      const w = Number(r.WeekNum) || 0; if(!w) return;
      if(!weeks.has(w)) weeks.set(w,{Week:w, _orders:new Set(), Qty:0, 'Qty Fulfilled':0});
      const g=weeks.get(w); g._orders.add(r.order_id); g.Qty += num(r.quantity); g['Qty Fulfilled'] += num(r.quantity_fulfill);
    });
    window.wrOutboundW2WRows = [...weeks.values()].sort((a,b)=>a.Week-b.Week).map(g=>({Week:g.Week, Orders:g._orders.size, Qty:g.Qty, 'Qty Fulfilled':g['Qty Fulfilled']}));

    const detailMap = new Map();
    const dates = [...new Set(latestRows.map(r=>r.Date).filter(Boolean))].sort();
    latestRows.forEach(r=>{
      const client = r.code_client || '(Blank Client)';
      if(!detailMap.has(client)) detailMap.set(client, {'Client Name':client});
      const obj = detailMap.get(client);
      const key = `${r.Date} ${r.status_so}`;
      if(!obj[key]) obj[key] = new Set();
      obj[key].add(r.order_id);
    });
    window.wrOutboundDetailRows = [...detailMap.values()].map(obj=>{
      const out = {'Client Name':obj['Client Name']};
      dates.forEach(d=>statusCols.forEach(st=>{ const k=`${d} ${st}`; out[k] = obj[k] ? obj[k].size : 0; }));
      return out;
    }).sort((a,b)=>String(a['Client Name']).localeCompare(String(b['Client Name'])));

    setText('wrOutboundRowsCount', rows.length.toLocaleString('en-US'));
    setText('wrOutboundLatestWeek', latestWeek ? 'W' + latestWeek : '-');
    setText('wrOutboundClientCount', window.wrOutboundByClientRows.length);
    setText('wrOutboundW2WCount', window.wrOutboundW2WRows.length);
    setStatus(`✅ Generate outbound selesai. Latest week: <b>W${latestWeek}</b>. Status terbaca: <b>${statusCols.join(', ')}</b>.`);
    if(el('wrOutboundClientPreview')) el('wrOutboundClientPreview').innerHTML = tableHtml(window.wrOutboundByClientRows);
    if(el('wrOutboundDetailPreview')) el('wrOutboundDetailPreview').innerHTML = tableHtml(window.wrOutboundDetailRows,80);
    if(el('wrOutboundTopPreview')){
      el('wrOutboundTopPreview').innerHTML = `<div class="tableWrap">${tableHtml(window.wrOutboundW2WRows,200)}</div>`;
    }
  };

  function sheetFromAoa(aoa){
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if(aoa && aoa.length){
      const maxCols = Math.max(...aoa.map(r=>(r||[]).length));
      ws['!cols'] = Array.from({length:maxCols}, (_,i)=>({wch: i===1?30:15}));
    }
    return ws;
  }
  function rowsToSheet(rows, headers){
    const aoa = [headers, ...rows.map(r=>headers.map(h=>r[h] ?? ''))];
    return sheetFromAoa(aoa);
  }
  function detailAoa(){
    const rows = window.wrOutboundDetailRows || [];
    if(!rows.length) return [[],[]];
    const keys = Object.keys(rows[0]).filter(k=>k !== 'Client Name');
    const dates = [...new Set(keys.map(k=>k.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)?.[1]).filter(Boolean))].sort();
    const stsByDate = {};
    dates.forEach(d=>{ stsByDate[d] = keys.filter(k=>k.startsWith(d+' ')).map(k=>k.slice(d.length+1)); });
    const row1 = ['', ''];
    const row2 = ['', 'Client Name'];
    dates.forEach(d=>{ stsByDate[d].forEach(()=>row1.push(d)); stsByDate[d].forEach(st=>row2.push(st)); });
    const aoa = [new Array(row2.length).fill(''), row1, row2];
    rows.forEach(r=>{
      const arr = ['', r['Client Name']];
      dates.forEach(d=>stsByDate[d].forEach(st=>arr.push(r[`${d} ${st}`] || 0)));
      aoa.push(arr);
    });
    return aoa;
  }

  window.wrExportOutboundReport = function(){
    if(window.wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu sampai status Import selesai.');
    const rows = window.wrOutboundRows || [];
    if(!rows.length) return alert('Upload file outbound template compact terlebih dahulu.');
    if(!(window.wrOutboundByClientRows||[]).length || !(window.wrOutboundW2WRows||[]).length) wrGenerateOutboundReport();
    setStatus('⏳ Sedang export outbound. Untuk file 300 ribu+ rows, tunggu sampai download muncul.');
    setTimeout(()=>{
      try{
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, rowsToSheet(rows, DATA_EXPORT_HEADERS), 'Data');
        const statusCols = window.wrOutboundStatusColumns || CORE_STATUSES;
        const clientHeaders = ['Client Name', ...statusCols, 'Total Orders', 'Qty', 'Qty Fulfilled', 'Basket Size', 'Qty vs Qty Fulfilled', '% Canceled'];
        const clientAoa = [[], ['', ...clientHeaders], ...(window.wrOutboundByClientRows||[]).map(r=>['', ...clientHeaders.map(h=>r[h] ?? 0)])];
        XLSX.utils.book_append_sheet(wb, sheetFromAoa(clientAoa), 'Outbound volume by Client');
        XLSX.utils.book_append_sheet(wb, sheetFromAoa(detailAoa()), 'Outbound volume by Detail');
        const w2wAoa = [[], ['', 'Week','Orders','Qty','Qty Fulfilled'], ...(window.wrOutboundW2WRows||[]).map(r=>['', r.Week, r.Orders, r.Qty, r['Qty Fulfilled']])];
        XLSX.utils.book_append_sheet(wb, sheetFromAoa(w2wAoa), 'Outbound volume W2W');
        XLSX.writeFile(wb, 'Weekly_Report_Outbound_Volume_Generator.xlsx', {compression:true});
        setStatus('✅ Export outbound selesai. File sudah terdownload.');
      }catch(err){
        console.error(err);
        setStatus('❌ Export outbound gagal: ' + (err.message || err));
        alert('Export outbound gagal: ' + (err.message || err));
      }
    },50);
  };

  window.wrDownloadOutboundTemplate = function(){
    const wb = XLSX.utils.book_new();
    const sample = [CORE_HEADERS, ['ORDER-001','2026-04-01 00:00:00','PERO','FULFILLED','SKU-001',1,1]];
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(sample), 'Sheet1');
    XLSX.writeFile(wb, 'Template_Outbound_Compact_Data.xlsx');
  };

  window.wrResetOutbound = function(){
    window.wrOutboundRows=[]; window.wrOutboundByClientRows=[]; window.wrOutboundDetailRows=[]; window.wrOutboundW2WRows=[]; window.wrOutboundLatestWeek=''; window.wrOutboundImporting=false;
    if(el('wrOutboundFile')) el('wrOutboundFile').value='';
    setText('wrOutboundRowsCount','0'); setText('wrOutboundLatestWeek','-'); setText('wrOutboundClientCount','0'); setText('wrOutboundW2WCount','0');
    if(el('wrOutboundTopPreview')) el('wrOutboundTopPreview').innerHTML='<div class="output">Belum ada W2W. Upload Data terlebih dahulu.</div>';
    if(el('wrOutboundClientPreview')) el('wrOutboundClientPreview').innerHTML='<div class="output">Belum ada hasil outbound by client.</div>';
    if(el('wrOutboundDetailPreview')) el('wrOutboundDetailPreview').innerHTML='<div class="output">Belum ada hasil outbound detail.</div>';
    setStatus('Upload file outbound template compact terlebih dahulu.');
  };
})();


/* v14 FIX: outbound export besar tanpa Maximum call stack size exceeded.
   Penyebab v13: SheetJS membentuk AOA raksasa + writeFile untuk 349k rows, lalu stack overflow.
   Fix: export pakai ExcelJS chunked, tanpa styling berat, tanpa spread/map raksasa sekaligus. */
(function(){
  function wrV14El(id){ return document.getElementById(id); }
  function wrV14Status(msg){ const el=wrV14El('wrOutboundStatus'); if(el) el.innerHTML=msg; }
  function wrV14Num(v){
    if(v===null || v===undefined || v==='') return 0;
    const n=Number(String(v).replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  }
  function wrV14Safe(v){ return v===null || v===undefined ? '' : v; }
  function wrV14DownloadBlob(blob, filename){
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url; a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function wrV14SheetColumns(headers){
    return headers.map(h=>({ header:h, key:h, width: Math.min(Math.max(String(h).length+3, 12), 26) }));
  }
  async function wrV14Yield(){ return new Promise(resolve=>setTimeout(resolve,0)); }
  async function wrV14AddRowsChunked(ws, rows, headers, transform, chunkSize, progressPrefix){
    chunkSize = chunkSize || 4000;
    const total = rows.length || 0;
    for(let i=0;i<total;i+=chunkSize){
      const part = rows.slice(i, i+chunkSize).map(r => headers.map(h => transform ? transform(r,h) : wrV14Safe(r[h])));
      ws.addRows(part);
      if(i===0 || i + chunkSize < total){
        wrV14Status(`⏳ ${progressPrefix} ${Math.min(i+chunkSize,total).toLocaleString('en-US')} / ${total.toLocaleString('en-US')} rows... Jangan tutup halaman.`);
        await wrV14Yield();
      }
    }
  }
  function wrV14StyleHeader(ws){
    const row=ws.getRow(1);
    row.font={bold:true,color:{argb:'FFFFFFFF'}};
    row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8D7D9B'}};
    row.alignment={horizontal:'center',vertical:'middle'};
    row.eachCell(cell=>{ cell.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
  }
  function wrV14DetailAoa(){
    const rows = window.wrOutboundDetailRows || [];
    if(!rows.length) return [['Client Name']];
    const keys = Object.keys(rows[0]).filter(k=>k !== 'Client Name');
    const dates = [...new Set(keys.map(k=>String(k).match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)?.[1]).filter(Boolean))].sort();
    const stsByDate = {};
    dates.forEach(d=>{ stsByDate[d] = keys.filter(k=>String(k).startsWith(d+' ')).map(k=>String(k).slice(d.length+1)); });
    const row1 = ['', ''];
    const row2 = ['', 'Client Name'];
    dates.forEach(d=>{ (stsByDate[d]||[]).forEach(()=>row1.push(d)); (stsByDate[d]||[]).forEach(st=>row2.push(st)); });
    const aoa=[new Array(row2.length).fill(''), row1, row2];
    rows.forEach(r=>{
      const arr=['', r['Client Name'] || ''];
      dates.forEach(d=>(stsByDate[d]||[]).forEach(st=>arr.push(r[`${d} ${st}`] || 0)));
      aoa.push(arr);
    });
    return aoa;
  }
  async function wrV14ExportWithExcelJS(){
    const rows = window.wrOutboundRows || [];
    if(!rows.length) return alert('Upload file outbound template compact terlebih dahulu.');
    if(!(window.wrOutboundByClientRows||[]).length || !(window.wrOutboundW2WRows||[]).length){
      if(typeof window.wrGenerateOutboundReport === 'function') window.wrGenerateOutboundReport();
    }
    if(!window.ExcelJS) throw new Error('ExcelJS belum aktif. Refresh halaman lalu coba lagi.');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FLOWGISTIK Sales Support Mega Apps';
    wb.created = new Date();

    // DATA compact sesuai template yang user kirim. Tidak lagi membentuk array raksasa sekaligus.
    const dataHeaders = ['WeekNum','Month','Date','order_id','local_order_date','code_client','status_so','client_code_item','quantity','quantity_fulfill'];
    const dataWs = wb.addWorksheet('Data', {views:[{state:'frozen', ySplit:1}]});
    dataWs.columns = wrV14SheetColumns(dataHeaders);
    dataWs.addRow(dataHeaders);
    wrV14StyleHeader(dataWs);
    await wrV14AddRowsChunked(dataWs, rows, dataHeaders, (r,h)=>{
      if(h==='quantity' || h==='quantity_fulfill') return wrV14Num(r[h]);
      return wrV14Safe(r[h]);
    }, 3000, 'Menulis sheet Data');

    // BY CLIENT
    const statusCols = (window.wrOutboundStatusColumns && window.wrOutboundStatusColumns.length) ? window.wrOutboundStatusColumns : ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
    const clientHeaders = ['Client Name', ...statusCols, 'Total Orders', 'Qty', 'Qty Fulfilled', 'Basket Size', 'Qty vs Qty Fulfilled', '% Canceled'];
    const clientWs = wb.addWorksheet('Outbound volume by Client', {views:[{state:'frozen', ySplit:1}]});
    clientWs.columns = wrV14SheetColumns(clientHeaders);
    clientWs.addRow(clientHeaders);
    wrV14StyleHeader(clientWs);
    const clientRows = window.wrOutboundByClientRows || [];
    await wrV14AddRowsChunked(clientWs, clientRows, clientHeaders, (r,h)=>wrV14Safe(r[h] ?? 0), 2000, 'Menulis sheet Outbound volume by Client');
    ['Basket Size','Qty vs Qty Fulfilled','% Canceled'].forEach(h=>{
      const idx=clientHeaders.indexOf(h)+1;
      if(idx>0) clientWs.getColumn(idx).numFmt = h==='Basket Size' ? '0.00' : '0.00%';
    });

    // BY DETAIL
    const detailWs = wb.addWorksheet('Outbound volume by Detail');
    const detail = wrV14DetailAoa();
    for(let i=0;i<detail.length;i+=500){
      detailWs.addRows(detail.slice(i,i+500));
      if(i%2000===0){ wrV14Status(`⏳ Menulis sheet Outbound volume by Detail ${Math.min(i+500,detail.length)} / ${detail.length} rows...`); await wrV14Yield(); }
    }
    detailWs.getRow(2).font={bold:true};
    detailWs.getRow(3).font={bold:true};
    detailWs.getColumn(2).width=32;

    // W2W
    const w2wHeaders = ['Week','Orders','Qty','Qty Fulfilled'];
    const w2wWs = wb.addWorksheet('Outbound volume W2W', {views:[{state:'frozen', ySplit:1}]});
    w2wWs.columns = wrV14SheetColumns(w2wHeaders);
    w2wWs.addRow(w2wHeaders);
    wrV14StyleHeader(w2wWs);
    (window.wrOutboundW2WRows || []).forEach(r=>w2wWs.addRow([r.Week, r.Orders, r.Qty, r['Qty Fulfilled']]));

    wrV14Status('⏳ Membuat file Excel final. Untuk data 300 ribu+ rows, proses ini bisa beberapa menit. Jangan tutup halaman.');
    await wrV14Yield();
    const buffer = await wb.xlsx.writeBuffer({useSharedStrings:false});
    wrV14DownloadBlob(new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'Weekly_Report_Outbound_Volume_Generator.xlsx');
    wrV14Status('✅ Export outbound selesai. File sudah terdownload.');
  }

  window.wrExportOutboundReport = async function(){
    if(window.wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu sampai status Import selesai.');
    try{
      await wrV14ExportWithExcelJS();
    }catch(err){
      console.error(err);
      wrV14Status('❌ Export outbound gagal: ' + (err.message || err));
      alert('Export outbound gagal: ' + (err.message || err));
    }
  };
})();


/* v15 FIX: Export outbound mengikuti file "Export outbound example.xlsx".
   Hasil export: 3 sheet report saja, layout mulai kolom B, tanpa sheet Data besar,
   plus chart W2W berupa image di sheet Outbound volume W2W agar tidak stack overflow. */
(function(){
  const CORE_STATUSES = ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  function el(id){ return document.getElementById(id); }
  function status(msg){ const x=el('wrOutboundStatus'); if(x) x.innerHTML=msg; }
  function safe(v){ return v===null || v===undefined ? '' : v; }
  function num(v){
    if(v===null || v===undefined || v==='') return 0;
    const n=Number(String(v).replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  }
  function downloadBlob(blob, filename){
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url; a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1500);
  }
  function yieldUI(){ return new Promise(resolve=>setTimeout(resolve,0)); }
  function sanitizeSheetName(name){ return String(name||'Sheet').replace(/[\\/*?:\[\]]/g,' ').slice(0,31); }
  function setCell(ws, r, c, v){ ws.getCell(r,c).value = v; return ws.getCell(r,c); }
  function styleTableCell(cell, opts={}){
    cell.border={top:{style:'thin',color:{argb:'FF222222'}},left:{style:'thin',color:{argb:'FF222222'}},bottom:{style:'thin',color:{argb:'FF222222'}},right:{style:'thin',color:{argb:'FF222222'}}};
    cell.alignment={vertical:'middle',horizontal:opts.align||'center'};
    if(opts.header){
      cell.font={bold:false,color:{argb:'FFFFFFFF'}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8D7D9B'}};
    }
  }
  function styleReportSheet(ws){
    ws.views=[{showGridLines:false}];
    ws.getColumn(1).width=3;
  }
  function makeW2WChartBase64(rows){
    const canvas=document.createElement('canvas');
    canvas.width=1200; canvas.height=420;
    const ctx=canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
    const left=70, right=30, top=30, bottom=70;
    const pw=W-left-right, ph=H-top-bottom;
    const maxVal=Math.max(1, ...rows.flatMap(r=>[num(r.Orders),num(r.Qty),num(r['Qty Fulfilled'])]));
    const niceMax=Math.ceil(maxVal/10000)*10000 || maxVal;
    ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1;
    ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='right';
    for(let i=0;i<=5;i++){
      const y=top+ph-(ph*i/5);
      ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(left+pw,y); ctx.stroke();
      const label=Math.round(niceMax*i/5).toLocaleString('en-US');
      ctx.fillText(label,left-10,y+5);
    }
    const colors={Orders:'#8d7d9b', Qty:'#dcefd5', 'Qty Fulfilled':'#dbc0c0'};
    const series=['Orders','Qty','Qty Fulfilled'];
    const groupW=pw/Math.max(rows.length,1);
    const barW=Math.min(28, groupW/5);
    rows.forEach((r,i)=>{
      const center=left+groupW*i+groupW/2;
      series.forEach((s,j)=>{
        const v=num(r[s]);
        const h=(v/niceMax)*ph;
        const x=center + (j-1)*barW*1.2 - barW/2;
        const y=top+ph-h;
        ctx.fillStyle=colors[s]; ctx.fillRect(x,y,barW,h);
        ctx.fillStyle='#111827'; ctx.font='13px Arial'; ctx.textAlign='center';
        if(v>0) ctx.fillText(v.toLocaleString('en-US'), x+barW/2, y-6);
      });
      ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='center';
      ctx.fillText(String(r.Week), center, H-35);
    });
    // legend
    const legendY=H-18; let lx=W/2-170;
    series.forEach(s=>{
      ctx.fillStyle=colors[s]; ctx.fillRect(lx,legendY-10,12,12);
      ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='left'; ctx.fillText(s,lx+18,legendY);
      lx+=115;
    });
    return canvas.toDataURL('image/png');
  }
  function detailAoaExample(){
    const rows=window.wrOutboundDetailRows || [];
    if(!rows.length) return [[], ['', 'Client Name']];
    const keys=Object.keys(rows[0]).filter(k=>k !== 'Client Name');
    const dates=[...new Set(keys.map(k=>String(k).match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)?.[1]).filter(Boolean))].sort();
    const stsByDate={};
    dates.forEach(d=>{
      // Ikuti contoh: status yang muncul per tanggal, urut core status.
      const found=[...new Set(keys.filter(k=>String(k).startsWith(d+' ')).map(k=>String(k).slice(d.length+1)))];
      stsByDate[d]=CORE_STATUSES.filter(s=>found.includes(s));
      found.filter(s=>!stsByDate[d].includes(s)).sort().forEach(s=>stsByDate[d].push(s));
    });
    const row1=['',''];
    const row2=['','Client Name'];
    dates.forEach(d=>{ (stsByDate[d]||[]).forEach(()=>row1.push(d)); (stsByDate[d]||[]).forEach(st=>row2.push(st)); });
    const aoa=[new Array(row2.length).fill(''), row1, row2];
    rows.forEach(r=>{
      const arr=['', r['Client Name']||''];
      dates.forEach(d=>(stsByDate[d]||[]).forEach(st=>arr.push(r[`${d} ${st}`] || 0)));
      aoa.push(arr);
    });
    return aoa;
  }
  async function exportExampleWorkbook(){
    const rows=window.wrOutboundRows || [];
    if(window.wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu sampai status Import selesai.');
    if(!rows.length) return alert('Upload file outbound terlebih dahulu.');
    if(!(window.wrOutboundByClientRows||[]).length || !(window.wrOutboundW2WRows||[]).length){
      if(typeof window.wrGenerateOutboundReport === 'function') window.wrGenerateOutboundReport();
    }
    if(!window.ExcelJS) throw new Error('ExcelJS belum aktif. Refresh halaman lalu coba lagi.');
    const wb=new ExcelJS.Workbook();
    wb.creator='FLOWGISTIK Sales Support Mega Apps';
    wb.created=new Date();
    wb.calcProperties.fullCalcOnLoad=true;

    // Sheet 1: Outbound volume by Client
    status('⏳ Membuat sheet Outbound volume by Client sesuai export example...');
    const clientWs=wb.addWorksheet('Outbound volume by Client');
    styleReportSheet(clientWs);
    const clientHeaders=['Client Name', ...CORE_STATUSES, 'Total Orders', 'Qty', 'Qty Fulfilled', '', 'Basket Size', 'Qty vs Qty Fulfilled'];
    clientHeaders.forEach((h,i)=>setCell(clientWs,2,i+2,h));
    for(let c=2;c<=13;c++) styleTableCell(clientWs.getCell(2,c),{header:true});
    const clientRows=window.wrOutboundByClientRows || [];
    clientRows.forEach((r,idx)=>{
      const rr=idx+3;
      const vals=[r['Client Name'], ...CORE_STATUSES.map(s=>r[s]||0), r['Total Orders']||0, r['Qty']||0, r['Qty Fulfilled']||0, '', r['Basket Size']||0, r['Qty vs Qty Fulfilled']||0];
      vals.forEach((v,i)=>{
        const cell=setCell(clientWs,rr,i+2,v);
        styleTableCell(cell,{align:i===0?'left':'center'});
        if(i>=1 && i<=7 && i!==8) cell.numFmt='#,##0';
        if(i===9 || i===10) cell.numFmt='0.00%';
        if(i===8) cell.border={};
      });
    });
    clientWs.getColumn(2).width=34;
    [3,4,5,6,7,8,9].forEach(c=>clientWs.getColumn(c).width=15);
    clientWs.getColumn(10).width=4;
    clientWs.getColumn(11).width=16;
    clientWs.getColumn(12).width=20;

    await yieldUI();
    // Sheet 2: Outbound volume by Detail
    status('⏳ Membuat sheet Outbound volume by Detail sesuai export example...');
    const detailWs=wb.addWorksheet('Outbound volume by Detail');
    styleReportSheet(detailWs);
    const detail=detailAoaExample();
    detail.forEach((row,ridx)=>{
      const excelRow=detailWs.getRow(ridx+1);
      row.forEach((v,cidx)=>{ excelRow.getCell(cidx+1).value=v; });
    });
    const detailMaxRow=detail.length;
    const detailMaxCol=detail.reduce((a,r)=>Math.max(a,r.length),0);
    for(let r=2;r<=detailMaxRow;r++){
      for(let c=2;c<=detailMaxCol;c++){
        const cell=detailWs.getCell(r,c);
        styleTableCell(cell,{header:r<=3,align:c===2?'left':'center'});
        if(r>3 && c>2) cell.numFmt='#,##0';
      }
    }
    detailWs.getColumn(2).width=34;
    for(let c=3;c<=detailMaxCol;c++) detailWs.getColumn(c).width=13;

    await yieldUI();
    // Sheet 3: Outbound volume W2W
    status('⏳ Membuat sheet Outbound volume W2W + chart...');
    const w2wWs=wb.addWorksheet('Outbound volume W2W');
    styleReportSheet(w2wWs);
    const w2wRows=window.wrOutboundW2WRows || [];
    const w2wHeaders=['Week','Orders','Qty','Qty Fulfilled'];
    w2wHeaders.forEach((h,i)=>setCell(w2wWs,2,i+2,h));
    for(let c=2;c<=5;c++) styleTableCell(w2wWs.getCell(2,c),{header:true});
    w2wRows.forEach((r,idx)=>{
      const rr=idx+3;
      const vals=[r.Week, r.Orders, r.Qty, r['Qty Fulfilled']];
      vals.forEach((v,i)=>{
        const cell=setCell(w2wWs,rr,i+2,v);
        styleTableCell(cell,{align:'center'});
        cell.numFmt='#,##0';
      });
    });
    [2,3,4,5].forEach(c=>w2wWs.getColumn(c).width=16);
    try{
      const base64=makeW2WChartBase64(w2wRows);
      const imgId=wb.addImage({base64, extension:'png'});
      w2wWs.addImage(imgId,{tl:{col:6.2,row:1.0}, ext:{width:900,height:315}});
    }catch(chartErr){
      console.warn('Chart image gagal dibuat, export tetap jalan:', chartErr);
      setCell(w2wWs,2,7,'Chart preview gagal dibuat di browser ini. Data W2W tetap tersedia.');
    }

    status('⏳ Menyiapkan file Excel final. Tunggu sampai download muncul...');
    await yieldUI();
    const buffer=await wb.xlsx.writeBuffer({useSharedStrings:false});
    downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Weekly_Report_Outbound_Example_Format.xlsx');
    status('✅ Export outbound selesai. Format sudah mengikuti Export outbound example: by Client, by Detail, W2W + chart.');
  }
  window.wrExportOutboundReport = function(){
    exportExampleWorkbook().catch(err=>{
      console.error(err);
      status('❌ Export outbound gagal: '+String(err.message||err));
      alert('Export outbound gagal: '+String(err.message||err));
    });
  };
})();


/* v16 FIX: Auto add missing outbound report blocks in export.
   Adds % Canceled column, Grand Total row, and bottom summary table:
   1st highest orders, qty, basket size, percentage cancellation, percentage return. */
(function(){
  const CORE_STATUSES = ['CANCEL','FULFILLED','NONE_ALLOCATED','RETURN'];
  function el(id){ return document.getElementById(id); }
  function status(msg){ const x=el('wrOutboundStatus'); if(x) x.innerHTML=msg; }
  function safe(v){ return v===null || v===undefined ? '' : v; }
  function num(v){
    if(v===null || v===undefined || v==='') return 0;
    const n=Number(String(v).replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  }
  function pct(a,b){ return b ? a/b : 0; }
  function downloadBlob(blob, filename){
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url; a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1500);
  }
  function yieldUI(){ return new Promise(resolve=>setTimeout(resolve,0)); }
  function setCell(ws, r, c, v){ ws.getCell(r,c).value=v; return ws.getCell(r,c); }
  function styleReportSheet(ws){ ws.views=[{showGridLines:false}]; ws.getColumn(1).width=3; }
  function styleTableCell(cell, opts={}){
    cell.border={top:{style:'thin',color:{argb:'FF222222'}},left:{style:'thin',color:{argb:'FF222222'}},bottom:{style:'thin',color:{argb:'FF222222'}},right:{style:'thin',color:{argb:'FF222222'}}};
    cell.alignment={vertical:'middle',horizontal:opts.align||'center'};
    if(opts.header){
      cell.font={bold:false,color:{argb:'FFFFFFFF'}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8D7D9B'}};
    }
    if(opts.total){
      cell.font={bold:true,color:{argb:'FF000000'}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};
    }
  }
  function makeW2WChartBase64(rows){
    const canvas=document.createElement('canvas');
    canvas.width=1200; canvas.height=420;
    const ctx=canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
    const left=70, right=30, top=30, bottom=70;
    const pw=W-left-right, ph=H-top-bottom;
    const maxVal=Math.max(1, ...rows.flatMap(r=>[num(r.Orders),num(r.Qty),num(r['Qty Fulfilled'])]));
    const niceMax=Math.ceil(maxVal/10000)*10000 || maxVal;
    ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1;
    ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='right';
    for(let i=0;i<=5;i++){
      const y=top+ph-(ph*i/5);
      ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(left+pw,y); ctx.stroke();
      const label=Math.round(niceMax*i/5).toLocaleString('en-US');
      ctx.fillText(label,left-10,y+5);
    }
    const colors={Orders:'#8d7d9b', Qty:'#dcefd5', 'Qty Fulfilled':'#dbc0c0'};
    const series=['Orders','Qty','Qty Fulfilled'];
    const groupW=pw/Math.max(rows.length,1);
    const barW=Math.min(28, groupW/5);
    rows.forEach((r,i)=>{
      const center=left+groupW*i+groupW/2;
      series.forEach((s,j)=>{
        const v=num(r[s]); const h=(v/niceMax)*ph;
        const x=center + (j-1)*barW*1.2 - barW/2; const y=top+ph-h;
        ctx.fillStyle=colors[s]; ctx.fillRect(x,y,barW,h);
        ctx.fillStyle='#111827'; ctx.font='13px Arial'; ctx.textAlign='center';
        if(v>0) ctx.fillText(v.toLocaleString('en-US'), x+barW/2, y-6);
      });
      ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='center'; ctx.fillText(String(r.Week), center, H-35);
    });
    const legendY=H-18; let lx=W/2-170;
    series.forEach(s=>{ ctx.fillStyle=colors[s]; ctx.fillRect(lx,legendY-10,12,12); ctx.fillStyle='#111827'; ctx.font='14px Arial'; ctx.textAlign='left'; ctx.fillText(s,lx+18,legendY); lx+=115; });
    return canvas.toDataURL('image/png');
  }
  function detailAoaExample(){
    const rows=window.wrOutboundDetailRows || [];
    if(!rows.length) return [[], ['', 'Client Name']];
    const keys=Object.keys(rows[0]).filter(k=>k !== 'Client Name');
    const allDates=[...new Set(keys.map(k=>String(k).match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)?.[1]).filter(Boolean))].sort();
    const stsByDate={};
    const dates=[];
    allDates.forEach(d=>{
      const found=[...new Set(keys.filter(k=>String(k).startsWith(d+' ')).map(k=>String(k).slice(d.length+1)))];
      const ordered=CORE_STATUSES.filter(s=>found.includes(s));
      found.filter(s=>!ordered.includes(s)).sort().forEach(s=>ordered.push(s));
      // Clean detail: hanya tampilkan status per tanggal yang total qty-nya > 0.
      // Contoh: 2026-05-10 NONE_ALLOCATED total 0 => disembunyikan,
      // tetapi 2026-05-11 NONE_ALLOCATED total 1 => tetap muncul.
      stsByDate[d]=ordered.filter(st=>rows.reduce((sum,r)=>sum+num(r[`${d} ${st}`]),0)>0);
      if(stsByDate[d].length) dates.push(d);
    });
    const row1=['','']; const row2=['','Client Name'];
    dates.forEach(d=>{ (stsByDate[d]||[]).forEach(()=>row1.push(d)); (stsByDate[d]||[]).forEach(st=>row2.push(st)); });
    const aoa=[new Array(row2.length).fill(''), row1, row2];
    rows.forEach(r=>{
      const arr=['', r['Client Name']||''];
      dates.forEach(d=>(stsByDate[d]||[]).forEach(st=>arr.push(r[`${d} ${st}`] || 0)));
      aoa.push(arr);
    });
    return aoa;
  }
  function buildClientSummary(clientRows, grand){
    const highestOrders=[...clientRows].sort((a,b)=>num(b['Total Orders'])-num(a['Total Orders']))[0] || {};
    const highestQty=[...clientRows].sort((a,b)=>num(b['Qty'])-num(a['Qty']))[0] || {};
    const highestBasket=[...clientRows].sort((a,b)=>num(b['Basket Size'])-num(a['Basket Size']))[0] || {};
    return [
      ['Description','Qty','Client Name'],
      ['1St Highest orders', num(highestOrders['Total Orders']), safe(highestOrders['Client Name'])],
      ['1St Highest qty', num(highestQty['Qty']), safe(highestQty['Client Name'])],
      ['1St Highest basket size', num(highestBasket['Basket Size']), safe(highestBasket['Client Name'])],
      ['Percentage cancellation', pct(num(grand.CANCEL), num(grand['Total Orders'])), ''],
      ['Percentage return', pct(num(grand.RETURN), num(grand['Total Orders'])), '']
    ];
  }
  async function exportWorkbook(){
    const rows=window.wrOutboundRows || [];
    if(window.wrOutboundImporting) return alert('File outbound masih dibaca. Tunggu sampai status Import selesai.');
    if(!rows.length) return alert('Upload file outbound terlebih dahulu.');
    if(!(window.wrOutboundByClientRows||[]).length || !(window.wrOutboundW2WRows||[]).length){
      if(typeof window.wrGenerateOutboundReport === 'function') window.wrGenerateOutboundReport();
    }
    if(!window.ExcelJS) throw new Error('ExcelJS belum aktif. Refresh halaman lalu coba lagi.');
    const wb=new ExcelJS.Workbook();
    wb.creator='FLOWGISTIK Sales Support Mega Apps'; wb.created=new Date(); wb.calcProperties.fullCalcOnLoad=true;

    status('⏳ Membuat sheet Outbound volume by Client lengkap dengan summary...');
    const clientWs=wb.addWorksheet('Outbound volume by Client');
    styleReportSheet(clientWs);
    const statusCols=(window.wrOutboundStatusColumns && window.wrOutboundStatusColumns.length) ? window.wrOutboundStatusColumns : CORE_STATUSES;
    CORE_STATUSES.forEach(s=>{ if(!statusCols.includes(s)) statusCols.push(s); });
    const clientHeaders=['Client Name', ...statusCols, 'Total Orders', 'Qty', 'Qty Fulfilled', 'Basket Size', 'Qty vs Qty Fulfilled', '% Canceled'];
    clientHeaders.forEach((h,i)=>setCell(clientWs,2,i+2,h));
    for(let c=2;c<2+clientHeaders.length;c++) styleTableCell(clientWs.getCell(2,c),{header:true});

    const clientRows=(window.wrOutboundByClientRows || []).map(r=>({
      ...r,
      '% Canceled': num(r['Total Orders']) ? num(r['CANCEL']) / num(r['Total Orders']) : 0
    }));
    const grand={}; statusCols.forEach(s=>grand[s]=clientRows.reduce((a,r)=>a+num(r[s]),0));
    grand['Client Name']='Grand Total';
    grand['Total Orders']=clientRows.reduce((a,r)=>a+num(r['Total Orders']),0);
    grand['Qty']=clientRows.reduce((a,r)=>a+num(r['Qty']),0);
    grand['Qty Fulfilled']=clientRows.reduce((a,r)=>a+num(r['Qty Fulfilled']),0);
    grand['Basket Size']=grand['Total Orders'] ? grand['Qty']/grand['Total Orders'] : 0;
    grand['Qty vs Qty Fulfilled']=grand['Qty'] ? grand['Qty Fulfilled']/grand['Qty'] : 0;
    grand['% Canceled']=grand['Total Orders'] ? num(grand.CANCEL)/grand['Total Orders'] : 0;

    [...clientRows, grand].forEach((r,idx)=>{
      const rr=idx+3; const isTotal=idx===clientRows.length;
      clientHeaders.forEach((h,i)=>{
        const cell=setCell(clientWs,rr,i+2, safe(r[h] ?? 0));
        styleTableCell(cell,{align:i===0?'left':'center', total:isTotal});
        if(h==='Basket Size') cell.numFmt='0.00';
        else if(h==='Qty vs Qty Fulfilled' || h==='% Canceled') cell.numFmt='0.00%';
        else if(i>0) cell.numFmt='#,##0';
      });
    });
    clientWs.getColumn(2).width=34;
    clientHeaders.forEach((h,i)=>clientWs.getColumn(i+2).width = i===0 ? 34 : Math.min(Math.max(String(h).length+3,12),22));

    const summaryStart=clientRows.length+6;
    const summary=buildClientSummary(clientRows, grand);
    summary.forEach((row,ri)=>{
      row.forEach((v,ci)=>{
        const cell=setCell(clientWs,summaryStart+ri,ci+2,v);
        styleTableCell(cell,{header:ri===0, align:ci===0?'left':'center'});
        if(ri>0 && ci===1){
          if(row[0].includes('Percentage')) cell.numFmt='0.00%';
          else if(row[0].includes('basket')) cell.numFmt='0.00';
          else cell.numFmt='#,##0';
        }
      });
    });
    clientWs.getColumn(2).width=36; clientWs.getColumn(3).width=16; clientWs.getColumn(4).width=32;

    await yieldUI();
    status('⏳ Membuat sheet Outbound volume by Detail...');
    const detailWs=wb.addWorksheet('Outbound volume by Detail');
    styleReportSheet(detailWs);
    const detail=detailAoaExample();
    detail.forEach((row,ridx)=>{ const excelRow=detailWs.getRow(ridx+1); row.forEach((v,cidx)=>{ excelRow.getCell(cidx+1).value=v; }); });
    const detailMaxRow=detail.length; const detailMaxCol=detail.reduce((a,r)=>Math.max(a,r.length),0);
    for(let r=2;r<=detailMaxRow;r++){
      for(let c=2;c<=detailMaxCol;c++){
        const cell=detailWs.getCell(r,c); styleTableCell(cell,{header:r<=3, align:c===2?'left':'center'}); if(r>3 && c>2) cell.numFmt='#,##0';
      }
    }
    detailWs.getColumn(2).width=34; for(let c=3;c<=detailMaxCol;c++) detailWs.getColumn(c).width=13;

    await yieldUI();
    status('⏳ Membuat sheet Outbound volume W2W + chart...');
    const w2wWs=wb.addWorksheet('Outbound volume W2W');
    styleReportSheet(w2wWs);
    const w2wRows=window.wrOutboundW2WRows || [];
    const w2wHeaders=['Week','Orders','Qty','Qty Fulfilled'];
    w2wHeaders.forEach((h,i)=>setCell(w2wWs,2,i+2,h));
    for(let c=2;c<=5;c++) styleTableCell(w2wWs.getCell(2,c),{header:true});
    w2wRows.forEach((r,idx)=>{
      const rr=idx+3; [r.Week, r.Orders, r.Qty, r['Qty Fulfilled']].forEach((v,i)=>{ const cell=setCell(w2wWs,rr,i+2,v); styleTableCell(cell,{align:'center'}); cell.numFmt='#,##0'; });
    });
    [2,3,4,5].forEach(c=>w2wWs.getColumn(c).width=16);
    try{
      const imgId=wb.addImage({base64:makeW2WChartBase64(w2wRows), extension:'png'});
      w2wWs.addImage(imgId,{tl:{col:6.2,row:1.0}, ext:{width:900,height:315}});
    }catch(chartErr){ console.warn(chartErr); setCell(w2wWs,2,7,'Chart preview gagal dibuat. Data W2W tetap tersedia.'); }

    status('⏳ Menyiapkan file Excel final. Tunggu sampai download muncul...');
    await yieldUI();
    const buffer=await wb.xlsx.writeBuffer({useSharedStrings:false});
    downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Weekly_Report_Outbound_Complete_Summary.xlsx');
    status('✅ Export outbound selesai. % Canceled, Grand Total, dan Summary bawah sudah otomatis masuk.');
  }
  window.wrExportOutboundReport=function(){
    exportWorkbook().catch(err=>{ console.error(err); status('❌ Export outbound gagal: '+String(err.message||err)); alert('Export outbound gagal: '+String(err.message||err)); });
  };
})();



/* Import Order Generator - TikTok/Shopee Raw Data to WMS Upload */
(function(){
  const IOG_WMS_HEADERS = ['orderid','orderdate','warehouse','customer','providername','providerawb','providerawblabel','shippingtype','paymenttype','codamount','insurance','gift_minimum_purchase','itemid','itemupc','batchnumber','qty','itemcodamount','unitretailprice','unitsellingprice','sender_addressee','sender_address1','sender_address2','sender_province','sender_city','sender_district','sender_subdistrict','sender_postalcode','sender_country','sender_phone','sender_email','addressee','address1','address2','province','city','district','subdistrict','postalcode','country','phone','email','order_note'];
  const IOG_CRITICAL = ['orderid','providerawb','itemid','qty','addressee','address1','phone','postalcode'];
  const IOG_FIXED_SENDER = {sender_addressee:'CS Flowgistik',sender_address1:'Flowgistik Indonesia',sender_province:'Banten',sender_city:'Tangerang',sender_district:'Tangerang',sender_subdistrict:'Teluk Naga',sender_postalcode:'11111',sender_country:'Indonesia',sender_phone:'6282188889206'};
  window.iogTikTokRows = [];
  window.iogSourceRows = [];
  window.iogWmsRows = [];
  window.iogSourceFile = '';
  window.iogDetectedSource = '';

  function el(id){ return document.getElementById(id); }
  function text(v){ return v===undefined || v===null ? '' : String(v).trim(); }
  function cleanKey(v){ return String(v||'').toLowerCase().replace(/[\x00-\x1f]/g,'').replace(/[\s_\-/#().]+/g,'').replace(/[^a-z0-9]/g,''); }
  function setText(id,v){ const x=el(id); if(x) x.textContent=v; }
  function status(msg){ const x=el('iogStatus'); if(x) x.innerHTML=msg; }
  function htmlEsc(v){ return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function get(row, candidates){
    const map = {};
    Object.keys(row||{}).forEach(k=>{ map[cleanKey(k)] = k; });
    for(const c of candidates){ const k = map[cleanKey(c)]; if(k !== undefined && row[k] !== undefined && row[k] !== null) return text(row[k]); }
    return '';
  }
  function hasRealOrderId(v){ const s=text(v); return /^\d{8,}$/.test(s) || /^[A-Za-z0-9_-]{8,}$/.test(s); }
  async function readAsArrayBuffer(file){
    if(typeof readFile === 'function') return await readFile(file);
    return await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=e=>resolve(e.target.result); r.onerror=reject; r.readAsArrayBuffer(file); });
  }
  function findHeaderIndex(aoa, sourceType){
    return aoa.findIndex(row=>{
      const keys=(row||[]).map(cleanKey);
      if(sourceType==='tiktok') return keys.includes('orderid') && (keys.includes('sellersku') || keys.includes('skuid')) && (keys.includes('trackingid') || keys.includes('providerawb'));
      if(sourceType==='shopee') return keys.includes('nopesanan') && keys.includes('nomorreferensisku') && keys.includes('jumlah') && keys.includes('namapenerima');
      return false;
    });
  }
  async function readMarketplaceRows(file, preferredSource){
    const data=await readAsArrayBuffer(file);
    const wb=XLSX.read(data,{type:'array',cellDates:false});
    const candidateSources = preferredSource && preferredSource!=='auto' ? [preferredSource] : ['tiktok','shopee'];
    let found=null;
    for(const sourceType of candidateSources){
      for(const name of wb.SheetNames){
        const ws=wb.Sheets[name];
        const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
        const headerIdx=findHeaderIndex(aoa, sourceType);
        if(headerIdx>=0){ found={ws, sheetName:name, sourceType, headerIdx}; break; }
      }
      if(found) break;
    }
    if(!found) throw new Error('Header marketplace tidak ditemukan. TikTok wajib memiliki Order ID/Seller SKU/Tracking ID. Shopee wajib memiliki No. Pesanan/Nomor Referensi SKU/Jumlah/Nama Penerima.');
    let rows=XLSX.utils.sheet_to_json(found.ws,{defval:'',raw:false,range:found.headerIdx});
    if(found.sourceType==='tiktok') rows=rows.filter(r=>hasRealOrderId(get(r,['Order ID','orderid','Nomor pesanan'])));
    else rows=rows.filter(r=>hasRealOrderId(get(r,['No. Pesanan','No Pesanan','Nomor Pesanan','orderid'])));
    return {rows, sheetName:found.sheetName, sourceType:found.sourceType};
  }
  function extractPostalFromAddress(address){
    const s=text(address); if(!s) return '';
    const matches=[...s.matchAll(/(?:^|\D)(\d{5})(?=\D|$)/g)].map(m=>m[1]);
    return matches.length ? matches[matches.length-1] : '';
  }
  function makeWmsRow(src, shippingtype, providername, sourceType){
    const out={}; IOG_WMS_HEADERS.forEach(h=>out[h]=''); Object.assign(out, IOG_FIXED_SENDER);
    out.warehouse='TGR-01'; out.providername=providername; out.providerawblabel='Temporary Value'; out.shippingtype=shippingtype; out.paymenttype='NON-COD';
    // Default recipient administrative fields are fixed by request for both TikTok and Shopee.
    // Do not lookup/parse Province/City/District/Subdistrict/Postal Code from marketplace address.
    out.province='None'; out.city='None'; out.district='None'; out.subdistrict='None'; out.postalcode='11111'; out.country='Indonesia';
    if(sourceType==='shopee'){
      const address=get(src,['Alamat Pengiriman','address1','Alamat customer','Alamat Penerima']);
      out.orderid=get(src,['No. Pesanan','No Pesanan','Nomor Pesanan','orderid']);
      out.providerawb=get(src,['No. Resi','Nomor Resi','providerawb','AWB','Resi']);
      out.itemid=get(src,['Nomor Referensi SKU','Item SKU','Seller SKU','SKU','client_code_item']);
      out.qty=get(src,['Jumlah','Quantity','Qty','qty']);
      out.addressee=get(src,['Nama Penerima','Recipient','addressee','Nama pemesan']);
      out.address1=address;
      out.phone=get(src,['No. Telepon','Nomor Telepon','Phone #','phone','Phone']);
    }else{
      out.orderid=get(src,['Order ID','orderid','Nomor pesanan']);
      out.providerawb=get(src,['Tracking ID','providerawb','Nomor resi','AWB','Resi']);
      out.itemid=get(src,['Seller SKU','Item SKU','client_code_item','SKU','SKU ID']);
      out.qty=get(src,['Quantity','Qty','qty']);
      out.addressee=get(src,['Recipient','addressee','Nama pemesan','Nama Penerima']);
      out.address1=get(src,['Detail Address','address1','Alamat customer','Alamat Penerima']);
      out.phone=get(src,['Phone #','phone','Nomor telfon customer','Nomor Telepon','Phone']);
    }
    // Re-apply fixed default after mapping to prevent source data from overwriting request defaults.
    out.province='None'; out.city='None'; out.district='None'; out.subdistrict='None'; out.postalcode='11111'; out.country='Indonesia';
    return out;
  }
  function missingFields(row){ return IOG_CRITICAL.filter(k=>!text(row[k])); }
  function renderPreview(rows){
    const target=el('iogPreview'); if(!target) return;
    if(!rows.length){ target.innerHTML='<div class="output">Belum ada hasil generate.</div>'; return; }
    const previewHeaders=IOG_WMS_HEADERS;
    let html='<table><thead><tr>'+previewHeaders.map(h=>`<th>${htmlEsc(h)}</th>`).join('')+'</tr></thead><tbody>';
    rows.slice(0,300).forEach(r=>{ html+='<tr>'+previewHeaders.map(h=>`<td>${htmlEsc(r[h] ?? '')}</td>`).join('')+'</tr>'; });
    html+='</tbody></table>'; if(rows.length>300) html+=`<div class="hint">Preview 300 dari ${rows.length} rows.</div>`;
    target.innerHTML=html;
  }
  function updateStats(){
    const out=window.iogWmsRows||[]; setText('iogSourceRows',(window.iogSourceRows||window.iogTikTokRows||[]).length); setText('iogOutputRows',out.length); setText('iogOrderCount',new Set(out.map(r=>text(r.orderid)).filter(Boolean)).size); setText('iogMissingCount',out.filter(r=>missingFields(r).length).length);
  }
  function requireSettings(){
    const shippingtype=text(el('iogShippingType')?.value), providername=text(el('iogProviderName')?.value);
    if(!shippingtype || !providername){ alert('Pilih Shipping Type dan Provider Name terlebih dahulu sebelum import/generate.'); return null; }
    return {shippingtype, providername, sourceType:text(el('iogSourceType')?.value)||'auto'};
  }
  window.iogImportRaw = async function(ev){
    const settings=requireSettings(); if(!settings){ ev.target.value=''; return; }
    const file=ev.target.files && ev.target.files[0]; if(!file) return;
    try{
      window.iogSourceFile=file.name; window.iogSourceRows=[]; window.iogTikTokRows=[]; window.iogWmsRows=[]; updateStats(); renderPreview([]);
      status(`⏳ Sedang membaca file <b>${htmlEsc(file.name)}</b>...`);
      const result=await readMarketplaceRows(file, settings.sourceType);
      window.iogDetectedSource=result.sourceType; window.iogSourceRows=result.rows; window.iogTikTokRows=result.rows;
      window.iogWmsRows=result.rows.map(r=>makeWmsRow(r, settings.shippingtype, settings.providername, result.sourceType));
      updateStats(); renderPreview(window.iogWmsRows);
      const miss=(window.iogWmsRows||[]).filter(r=>missingFields(r).length);
      const warning=miss.length ? `<br>⚠️ Ada <b>${miss.length}</b> row yang masih kosong di field critical. Cek preview sebelum export.` : '';
      const sourceLabel=result.sourceType==='shopee'?'Shopee':'TikTok';
      status(`✅ Import ${sourceLabel} selesai dari sheet <b>${htmlEsc(result.sheetName)}</b>. Rows WMS tergenerate: <b>${window.iogWmsRows.length}</b>.${warning}`);
    }catch(err){ console.error(err); status('❌ Import marketplace gagal: '+htmlEsc(err.message||err)); alert('Import marketplace gagal: '+String(err.message||err)); }
  };
  window.iogImportTikTok = window.iogImportRaw;
  window.iogGenerateFromCurrent = function(){
    const settings=requireSettings(); if(!settings) return; if(!(window.iogSourceRows||[]).length) return alert('Upload file TikTok/Shopee terlebih dahulu.');
    const detected=window.iogDetectedSource || (settings.sourceType==='shopee'?'shopee':'tiktok');
    window.iogWmsRows=window.iogSourceRows.map(r=>makeWmsRow(r, settings.shippingtype, settings.providername, detected));
    updateStats(); renderPreview(window.iogWmsRows); const miss=(window.iogWmsRows||[]).filter(r=>missingFields(r).length);
    status(`✅ Generate selesai. Rows WMS: <b>${window.iogWmsRows.length}</b>${miss.length?`<br>⚠️ Ada <b>${miss.length}</b> row missing critical field. Cek data sebelum export.`:''}`);
  };
  window.iogExportWms = function(){
    const rows=window.iogWmsRows||[]; if(!rows.length) return alert('Belum ada hasil generate untuk export.');
    const miss=rows.filter(r=>missingFields(r).length); if(miss.length){ const ok=confirm(`Ada ${miss.length} row yang masih kosong di field critical (orderid/resi/SKU/qty/nama/alamat/phone/postalcode). Tetap export?`); if(!ok) return; }
    const aoa=[IOG_WMS_HEADERS, ...rows.map(r=>IOG_WMS_HEADERS.map(h=>r[h]??''))]; const ws=XLSX.utils.aoa_to_sheet(aoa);
    const textCols=['orderid','providerawb','itemid','qty','sender_postalcode','sender_phone','addressee','address1','province','city','district','subdistrict','postalcode','phone'];
    const colIndex={}; IOG_WMS_HEADERS.forEach((h,i)=>colIndex[h]=i);
    for(let r=1;r<aoa.length;r++){ textCols.forEach(h=>{ const c=colIndex[h]; if(c===undefined) return; const addr=XLSX.utils.encode_cell({r,c}); if(ws[addr]){ ws[addr].t='s'; ws[addr].v=String(ws[addr].v ?? ''); } }); }
    ws['!cols']=IOG_WMS_HEADERS.map(h=>({wch:h==='address1'?42:h==='orderid'?22:h==='providerawb'?18:h==='addressee'?24:h.length+4}));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
    const sourceName=(window.iogDetectedSource||'Marketplace').replace(/^./,c=>c.toUpperCase()); const filename=`File_upload_WMS_from_${sourceName}.xlsx`;
    XLSX.writeFile(wb,filename); status(`✅ Export berhasil: <b>${filename}</b> dengan ${rows.length} rows.`);
  };
  window.iogDownloadTemplate = function(){ const ws=XLSX.utils.aoa_to_sheet([IOG_WMS_HEADERS]); ws['!cols']=IOG_WMS_HEADERS.map(h=>({wch:h==='address1'?42:Math.max(12,h.length+3)})); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sheet1'); XLSX.writeFile(wb,'Template_File_upload_WMS.xlsx'); };
  window.iogReset = function(){ window.iogSourceRows=[]; window.iogTikTokRows=[]; window.iogWmsRows=[]; window.iogSourceFile=''; window.iogDetectedSource=''; const f=el('iogRawFile') || el('iogTikTokFile'); if(f) f.value=''; updateStats(); renderPreview([]); status('Pilih shippingtype/providername, lalu upload raw data TikTok atau Shopee.'); };
})();



// ============================================================
// BUG FIX (v3.9.8): getOrderSeparator was called 4 times in
// the Merger module above but never defined, silently breaking
// the separator-select dropdown. Ported from Sales Support
// Mega Apps v21 (Revamp).
// ============================================================
function getOrderSeparator(){
  const el=$('orderSeparator');
  const val=el ? el.value : ';';
  return [';', ',', '/'].includes(val) ? val : ';';
}

// ============================================================
// FORECAST ORDERS GENERATOR (v3.9.8) — new module ported from
// Sales Support Mega Apps v21 (Revamp). Reads outbound forecast
// Excel, summarizes volume by client × date, renders chart +
// tables, exports Excel summary.
// ============================================================
/* Forecast Orders Generator */
let foRows = [], foClientSummary = [], foDateSummary = [], foRawHeaders = [];

function foNormKey(v){
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
}
function foPickKey(row, candidates){
  const keys = Object.keys(row || {});
  const normalized = keys.map(k => ({k, n: foNormKey(k)}));
  for(const c of candidates){
    const cn = foNormKey(c);
    const exact = normalized.find(x => x.n === cn);
    if(exact) return exact.k;
  }
  for(const c of candidates){
    const cn = foNormKey(c);
    const partial = normalized.find(x => x.n.includes(cn) || cn.includes(x.n));
    if(partial) return partial.k;
  }
  return '';
}
function foNum(v){
  if(v === null || v === undefined || v === '') return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if(!s) return 0;
  s = s.replace(/\s/g,'').replace(/[^0-9,.;\-]/g,'');

  // Smart parser:
  // 2,596 / 246,096 / 1.250 = ribuan
  // 1,5 / 1.25 = desimal
  const commaCount = (s.match(/,/g)||[]).length;
  const dotCount = (s.match(/\./g)||[]).length;

  if(commaCount && dotCount){
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if(lastComma > lastDot){
      // Format ID/EU: 1.234,56
      s = s.replace(/\./g,'').replace(',', '.');
    }else{
      // Format US: 1,234.56
      s = s.replace(/,/g,'');
    }
  }else if(commaCount){
    const parts = s.split(',');
    const last = parts[parts.length-1];
    if(commaCount > 1 || last.length === 3){
      s = parts.join('');
    }else{
      s = parts.join('.');
    }
  }else if(dotCount){
    const parts = s.split('.');
    const last = parts[parts.length-1];
    if(dotCount > 1 || last.length === 3){
      s = parts.join('');
    }
  }

  const n = Number(s.replace(/;/g,''));
  return isFinite(n) ? n : 0;
}
function foExcelDateToISO(v){
  if(v === null || v === undefined || v === '') return '';
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if(typeof v === 'number' && v > 20000 && v < 80000){
    const d = XLSX.SSF.parse_date_code(v);
    if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const raw = String(v).trim();
  if(!raw) return '';
  const direct = new Date(raw);
  if(!isNaN(direct)) return direct.toISOString().slice(0,10);
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){
    let y = Number(m[3]); if(y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  return raw;
}
function foFmt(n){
  return Number(n || 0).toLocaleString('id-ID');
}
function foSetText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}
async function foImportForecast(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  try{
    const data = await readFile(file);
    const wb = XLSX.read(data,{type:'array', cellDates:true});
    const sheet = wb.Sheets['Data'] || wb.Sheets['Forecast'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet,{defval:'', raw:false});
    foRows = rows;
    foRawHeaders = rows.length ? Object.keys(rows[0]) : [];
    foSetText('foStatus', `${rows.length} rows berhasil dibaca dari ${file.name}.`);
    foGenerateReport();
  }catch(err){
    console.error(err);
    foSetText('foStatus','Import gagal. Pastikan file berbentuk Excel/CSV dan kolomnya sesuai.');
  }
}
function foGenerateReport(){
  if(!foRows.length){
    foSetText('foStatus','Belum ada data. Upload file forecast outbound terlebih dahulu.');
    return;
  }
  const sample = foRows[0] || {};
  const clientKey = foPickKey(sample, ['Brand name','Brand Name','Brand','Nama Brand','Client name','Client','Client Name','Nama Client','Customer','Seller']);
  const dateKey = foPickKey(sample, ['Date','Tanggal','Forecast Date','Outbound Date','Delivery Date','Order Date']);
  const volumeKey = foPickKey(sample, ['Forecast Total','Forecast','Total Forecast','Volume','Total Volume','Total Orders','Orders','Qty','Quantity']);
  if(!clientKey || !dateKey){
    foSetText('foStatus',`Kolom wajib belum ketemu. Header yang terbaca: ${foRawHeaders.join(', ')}`);
    return;
  }
  const dateMap = new Map();
  const dateClientMap = new Map();
  const uniqueClients = new Set();
  let total = 0;
  foRows.forEach(r=>{
    const client = String(r[clientKey] || 'Unknown Brand').trim() || 'Unknown Brand';
    const date = foExcelDateToISO(r[dateKey]) || 'Unknown Date';
    const volume = volumeKey ? foNum(r[volumeKey]) : 1;
    total += volume;
    uniqueClients.add(client);
    dateMap.set(date,(dateMap.get(date)||0)+volume);
    if(!dateClientMap.has(date)) dateClientMap.set(date,new Map());
    const perClient = dateClientMap.get(date);
    perClient.set(client,(perClient.get(client)||0)+volume);
  });
  foDateSummary = [...dateMap.entries()]
    .map(([date,volume])=>({Date:date,'Total Volume':volume}))
    .sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));
  foClientSummary = [];
  [...dateClientMap.entries()]
    .sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
    .forEach(([date, cmap])=>{
      [...cmap.entries()]
        .map(([client,volume])=>({Date:date, Brand:client, 'Total Volume':volume}))
        .sort((a,b)=>b['Total Volume']-a['Total Volume'] || String(a.Brand).localeCompare(String(b.Brand)))
        .forEach(row=>foClientSummary.push(row));
    });
  const topDate = [...foDateSummary].sort((a,b)=>b['Total Volume']-a['Total Volume'])[0];
  foSetText('foTotalVolume', foFmt(total));
  foSetText('foClientCount', foFmt(uniqueClients.size));
  foSetText('foDateCount', foFmt(foDateSummary.length));
  foSetText('foTopClient', topDate ? topDate.Date : '-');
  foSetText('foInsight', topDate ? `Total forecast ${foFmt(total)} orders dari ${foFmt(uniqueClients.size)} brand dan ${foFmt(foDateSummary.length)} tanggal. Tanggal tertinggi adalah ${topDate.Date} dengan ${foFmt(topDate['Total Volume'])} orders. Volume by brand digroup per tanggal dan diurutkan dari volume tertinggi ke terendah.` : 'Belum ada summary.');
  foSetText('foStatus', `Summary berhasil dibuat. Mapping kolom: Brand = ${clientKey}, Date = ${dateKey}, Volume = ${volumeKey || 'Count row'}.`);
  foRenderTables();
  foDrawBarChart('foDateChart', foDateSummary.map(x=>({label:x.Date, value:x['Total Volume']})), 'Total Volume by Date');
}
function foRenderTables(){
  const clientEl = $('foClientTable');
  const dateEl = $('foDateTable');
  if(clientEl) clientEl.innerHTML = foGroupedClientTable(foClientSummary);
  if(dateEl) dateEl.innerHTML = foSimpleTable(foDateSummary);
}
function foGroupedClientTable(rows){
  if(!rows || !rows.length) return '<div class="output">Belum ada data.</div>';
  const groups = new Map();
  rows.forEach(r=>{
    if(!groups.has(r.Date)) groups.set(r.Date, []);
    groups.get(r.Date).push(r);
  });
  return `<div class="foDateClientGrid">${[...groups.entries()].map(([date, items])=>{
    const total = items.reduce((a,x)=>a+(Number(x['Total Volume'])||0),0);
    return `<div class="foDateClientCard">
      <div class="foDateClientHead"><b>${date}</b><span>${foFmt(total)} orders</span></div>
      <div class="foDateClientBody">
        <table><thead><tr><th>Brand</th><th>Total Volume</th></tr></thead><tbody>
          ${[...items].sort((a,b)=>(Number(b['Total Volume'])||0)-(Number(a['Total Volume'])||0) || String(a.Brand).localeCompare(String(b.Brand))).map(x=>`<tr><td>${String(x.Brand ?? '')}</td><td>${foFmt(x['Total Volume'])}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  }).join('')}</div>`;
}
function foSimpleTable(rows){
  if(!rows || !rows.length) return '<div class="output">Belum ada data.</div>';
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>{
    const v = r[h];
    return `<td>${typeof v === 'number' ? foFmt(v) : String(v ?? '')}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}
function foDrawBarChart(canvasId, data, title){
  const canvas = $(canvasId);
  if(!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max((wrap ? wrap.clientWidth : 900), 760);
  const height = Number(canvas.getAttribute('height') || 360);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);

  const bg = ctx.createLinearGradient(0,0,0,height);
  bg.addColorStop(0,'#fcfbff');
  bg.addColorStop(1,'#f4f0ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,width,height);

  if(!data.length){
    ctx.fillStyle = '#766891';
    ctx.font = '14px Segoe UI, Arial';
    ctx.fillText('Belum ada data chart.', 24, 48);
    return;
  }

  const padL = 74, padR = 24, padT = 62, padB = 102;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...data.map(x=>Number(x.value)||0),1);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.strokeStyle = 'rgba(135,92,255,.12)';
  ctx.lineWidth = 1;
  foRoundRect(ctx, 14, 14, width-28, height-28, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#24153f';
  ctx.font = '700 16px Segoe UI, Arial';
  ctx.fillText(title, padL, 30);

  ctx.strokeStyle = 'rgba(107,70,255,.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i=0;i<=4;i++){
    const y = padT + chartH - (chartH*i/4);
    ctx.moveTo(padL,y);
    ctx.lineTo(width-padR,y);
    ctx.fillStyle = '#73688c';
    ctx.font = '11px Segoe UI, Arial';
    ctx.fillText(foFmt(Math.round(max*i/4)), 10, y+4);
  }
  ctx.stroke();

  const gap = Math.max(10, Math.min(20, chartW / Math.max(data.length,1) * .2));
  const rawBarW = (chartW - gap*(data.length-1)) / Math.max(data.length,1);
  const barW = Math.max(12, rawBarW);

  data.forEach((item,i)=>{
    const val = Number(item.value)||0;
    const x = padL + i*(barW+gap);
    const h = (val/max)*chartH;
    const y = padT + chartH - h;

    ctx.save();
    ctx.shadowColor = 'rgba(109,40,217,.22)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    const grad = ctx.createLinearGradient(0,y,0,padT+chartH);
    grad.addColorStop(0,'#6d28d9');
    grad.addColorStop(.55,'#b832e1');
    grad.addColorStop(1,'#49c1ff');
    ctx.fillStyle = grad;
    foRoundRect(ctx,x,y,barW,h,12);
    ctx.fill();
    ctx.restore();

    const valueText = foFmt(val);
    ctx.font = '700 11px Segoe UI, Arial';
    const textW = ctx.measureText(valueText).width;
    const pillW = textW + 16;
    const pillH = 22;
    const pillX = x + (barW - pillW)/2;
    const pillY = Math.max(36, y - 28);

    ctx.save();
    ctx.shadowColor = 'rgba(36,21,63,.14)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    foRoundRect(ctx,pillX,pillY,pillW,pillH,11);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#4b1fa8';
    ctx.font = '700 11px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueText, pillX + pillW/2, pillY + pillH/2 + .5);

    ctx.save();
    ctx.translate(x+barW/2, padT+chartH+16);
    ctx.rotate(-Math.PI/4.35);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5c5278';
    ctx.font = '11px Segoe UI, Arial';
    const label = String(item.label || '');
    ctx.fillText(label.length > 22 ? label.slice(0,22)+'…' : label, 0, 0);
    ctx.restore();
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
function foRoundRect(ctx,x,y,w,h,r){
  if(h < 2){ctx.rect(x,y,w,Math.max(h,1));return;}
  r = Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
function foExportSummary(){
  if(!foClientSummary.length && !foDateSummary.length){
    alert('Generate summary dulu sebelum export.');
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(foRows), 'Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(foClientSummary), 'Brand per Date');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(foDateSummary), 'Volume by Date');
  XLSX.writeFile(wb, 'Forecast_Orders_Generator_Summary.xlsx');
}
const FO_TEMPLATE_B64 = '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';
function foDownloadTemplate(){
  const binary = atob(FO_TEMPLATE_B64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Forecast outbound.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function foDownloadTemplateOldUnused(){
  const rows = [
    {'Brand name':'Brand A','Date':'2026-05-20','Forecast Total':1200},
    {'Brand name':'Brand B','Date':'2026-05-20','Forecast Total':850},
    {'Brand name':'Brand A','Date':'2026-05-21','Forecast Total':1400}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Data');
  XLSX.writeFile(wb, 'Template_Forecast_Orders_Generator.xlsx');
}
function foReset(){
  foRows = []; foClientSummary = []; foDateSummary = []; foRawHeaders = [];
  const file = $('foFile'); if(file) file.value = '';
  foSetText('foTotalVolume','0'); foSetText('foClientCount','0'); foSetText('foDateCount','0'); foSetText('foTopClient','-');
  foSetText('foInsight','Belum ada data forecast.');
  foSetText('foStatus','Upload file forecast outbound terlebih dahulu.');
  const cTable = $('foClientTable'); if(cTable) cTable.innerHTML = '<div class="output">Belum ada volume brand per tanggal.</div>';
  const dTable = $('foDateTable'); if(dTable) dTable.innerHTML = '<div class="output">Belum ada summary by date.</div>';
  foDrawBarChart('foDateChart', [], 'Total Volume by Date');
}
window.addEventListener('resize', function(){
  if(foDateSummary.length) foDrawBarChart('foDateChart', foDateSummary.map(x=>({label:x.Date, value:x['Total Volume']})), 'Total Volume by Date');
});
document.addEventListener('DOMContentLoaded', function(){
  foDrawBarChart('foDateChart', [], 'Total Volume by Date');
});
