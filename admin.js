// =============================================================
// MORIFUT 運営管理画面（admin.html）
// ログインは Firebase Authentication。データの読み書き権限は
// database.rules.json で「運営アカウントのみ」に制限しています。
// =============================================================
var auth=firebase.auth();
var events={},seats={},settings=Object.assign({},DEFAULT_SETTINGS),bookings={},gallery=[];
var editingId=null,showPast=false,listeners=[],venuePhotoData='';
var SEEN_KEY='morifut_adm_seen';

function navToPage(id){
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('on');});
  document.getElementById(id).classList.add('on');
}
function isAdminUser(u){return !!u&&(u.email||'').toLowerCase()===ADMIN_EMAIL&&u.emailVerified;}
function showErr(msg){const e=document.getElementById('l-err');e.textContent=msg;e.style.display=msg?'block':'none';}

// ===== ログイン =====
function authErrMsg(e){
  const c=(e&&e.code)||'';
  if(c.indexOf('too-many-requests')>=0)return 'ログインの試行回数が多すぎます。しばらく待ってから再度お試しください';
  if(c.indexOf('unauthorized-domain')>=0)return 'このドメインはログインが許可されていません（SETUP.md の手順1-5を確認してください）';
  if(c.indexOf('operation-not-allowed')>=0)return 'FirebaseのGoogleログインが有効になっていません（SETUP.md の手順1-4を確認してください）';
  if(c.indexOf('popup-blocked')>=0)return 'ポップアップがブロックされました。Safariでこのページを開き、ポップアップを許可して再試行してください';
  if(c.indexOf('popup-closed')>=0||c.indexOf('cancelled-popup')>=0)return '';
  if(c.indexOf('web-storage-unsupported')>=0||c.indexOf('disallowed-useragent')>=0)return 'アプリ内ブラウザではGoogleログインできない場合があります。Safariでページを開いてお試しください';
  if(c.indexOf('network-request-failed')>=0)return '通信に失敗しました。通信状態を確認してもう一度お試しください';
  return 'ログインできませんでした（'+c+'）';
}
function loginGoogle(){
  showErr('');
  const p=new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({login_hint:ADMIN_EMAIL});
  auth.signInWithPopup(p).catch(function(e){showErr(authErrMsg(e));});
}
function logout(){auth.signOut();}
function sendVerify(){
  auth.currentUser.sendEmailVerification().then(function(){alert('確認メールを送信しました。メール内のリンクを開いたあと、「確認が終わった」を押してください。');}).catch(function(e){alert('送信できませんでした：'+e.code);});
}
async function recheckVerify(){
  const u=auth.currentUser;if(!u)return;
  await u.reload();await u.getIdToken(true);
  onUser(auth.currentUser);
}

auth.onAuthStateChanged(onUser);
function onUser(u){
  detachAll();
  if(!u){
    document.getElementById('l-form').style.display='block';
    document.getElementById('l-noadmin').style.display='none';
    document.getElementById('l-desc').textContent='運営アカウントのGoogleでログインしてください';
    navToPage('adm-login');return;
  }
  if(!isAdminUser(u)){
    document.getElementById('l-form').style.display='none';
    const box=document.getElementById('l-noadmin');box.style.display='block';
    document.getElementById('l-desc').textContent='このアカウントには運営権限がありません';
    const em=(u.email||'').toLowerCase();
    if(em===ADMIN_EMAIL&&!u.emailVerified){
      box.innerHTML='<div class="warn-box"><strong>メールアドレスの確認が必要です。</strong><br>'+esc(u.email)+' に確認メールを送り、メール内のリンクを開いてください。</div>'+
        '<button class="btn-p" onclick="sendVerify()">確認メールを送る</button><button class="btn-s" style="margin-top:8px;" onclick="recheckVerify()">確認が終わった</button><button class="btn-s" style="margin-top:8px;" onclick="logout()">別のアカウントでログイン</button>';
    }else{
      box.innerHTML='<div class="warn-box">ログイン中：<strong>'+esc(u.email||'(メールなし)')+'</strong><br>運営として使えるのは '+esc(ADMIN_EMAIL)+' のみです。</div><button class="btn-s" onclick="logout()">別のアカウントでログイン</button>';
    }
    navToPage('adm-login');return;
  }
  navToPage('adm-panel');
  document.getElementById('acct-info').innerHTML=esc(u.email)+'<br>他の端末からも、このアカウントでログインすれば同じ内容を編集できます。';
  attachAll();
  if(new URLSearchParams(window.location.search).get('checkin')==='1'){window.location.replace('reception.html');return;}
}

// ===== データ受信 =====
function listen(path,cb){
  const r=db.ref(path);
  const fn=r.on('value',cb,function(e){console.error(path,e);setStatus('読み込みエラー：'+path+'（ルール設定を確認してください）',true);});
  listeners.push(function(){r.off('value',fn);});
}
function detachAll(){listeners.forEach(function(f){f();});listeners=[];}
function setStatus(t,err){const s=document.getElementById('sync-status');s.textContent=t;s.style.color=err?'#fca5a5':'';}
function attachAll(){
  setStatus('リアルタイム同期中 — 変更はすぐ公開ページに反映されます');
  listen('events',function(s){events=s.val()||{};if(!editingId)renderAdmEv();refreshBkFilter();renderAdmBk();});
  listen('seats',function(s){seats=s.val()||{};renderAdmEv();});
  listen('settings',function(s){settings=Object.assign({},DEFAULT_SETTINGS,s.val()||{});renderSettings();});
  listen('bookings',function(s){bookings=s.val()||{};renderAdmBk();renderAlert();renderAdmEv();});
  listen('teams',function(s){teamsData=s.val()||{};});
  listen('gallery',function(s){gallery=objToList(s.val()).sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.ts||0)-(a.ts||0);});renderAdmGal();});
  checkLegacy();
}

function switchTab(secId){
  document.querySelectorAll('.adm-tab').forEach(function(t){t.classList.toggle('on',t.dataset.sec===secId);});
  document.querySelectorAll('.adm-sec').forEach(function(s){s.classList.toggle('on',s.id===secId);});
  if(secId==='sec-bk'){renderAdmBk();markSeen();}
}

// ===== イベント管理 =====
function evArr(){return objToList(events).sort(function(a,b){return (a.date+a.time).localeCompare(b.date+b.time);});}
function bookingsOf(evId){return bkList().filter(function(b){return b.evId===evId;});}
function evBadges(ev){
  const pr=evPricing(ev,settings),d=evPricing({},settings);
  let h='';
  if(ev.date<todayStr())h+='<span class="badge-s past">終了</span>';
  else if(ev.closed)h+='<span class="badge-s closed">受付停止中</span>';
  if(pr.adult!==d.adult||pr.student!==d.student)h+='<span class="badge-s price">料金変更</span>';
  if(pr.discOn!==d.discOn||(pr.discOn&&(pr.discMin!==d.discMin||pr.discAmt!==d.discAmt)))h+='<span class="badge-s price">'+(pr.discOn?'割引変更':'割引なし')+'</span>';
  return h;
}
function evCard(ev){
  const cap=getCap(ev),p=seatCount(seats,ev),pr=evPricing(ev,settings);
  const webCnt=bookingsOf(ev.id).reduce(function(s,b){return s+(Number(b.cnt)||0);},0);
  const id=esc(ev.id);
  return '<div class="ev-adm-card"><div class="ev-adm-top" style="margin-bottom:0;flex-wrap:wrap;">'+
    '<div style="flex:1;min-width:220px;"><div class="ev-adm-nm">'+tLabel(ev.type)+' — '+esc(ev.name)+evBadges(ev)+'</div>'+
    '<div class="ev-adm-meta">'+fmtDate(ev.date)+' '+esc(ev.time)+'  |  '+esc(ev.venue)+'</div>'+
    '<div class="ev-adm-meta" style="margin-top:3px;">参加 <b style="color:var(--navy);">'+p+'/'+cap+'名</b>（Web '+webCnt+'名'+(Number(ev.extraP)?' + LINE等 '+Number(ev.extraP)+'名':'')+'）  |  一般'+yen(pr.adult)+' / 学生'+yen(pr.student)+(pr.discOn?'  |  '+pr.discMin+'名〜'+yen(pr.discAmt)+'引':'  |  割引なし')+'</div></div>'+
    '<div class="ev-adm-btns" style="flex-wrap:wrap;">'+
      '<button class="btn-ed" onclick="openEvForm(\''+id+'\')">編集</button>'+
      '<button class="btn-ed" onclick="dupEv(\''+id+'\')">複製</button>'+
      '<button class="btn-mini" onclick="toggleClosed(\''+id+'\')">'+(ev.closed?'受付再開':'受付停止')+'</button>'+
      '<button class="btn-dl" onclick="delEv(\''+id+'\')">削除</button>'+
    '</div></div></div>';
}
function renderAdmEv(){
  if(editingId)return;
  const t=todayStr(),all=evArr();
  const up=all.filter(function(e){return e.date>=t;}),past=all.filter(function(e){return e.date<t;}).reverse();
  let h=up.length?up.map(evCard).join(''):'<div class="adm-box" style="text-align:center;color:var(--text3);font-size:13px;">今後のイベントはありません。「新しいイベントを追加」から作成してください。</div>';
  if(past.length){
    h+='<button class="btn-mini" style="margin:10px 0;" onclick="showPast=!showPast;renderAdmEv()">'+(showPast?'▲ 過去のイベントを閉じる':'▼ 過去のイベント（'+past.length+'件）')+'</button>';
    if(showPast)h+=past.map(evCard).join('');
  }
  document.getElementById('ev-adm-list').innerHTML=h;
}
function val(id){return document.getElementById(id).value;}
function setVal(id,v){document.getElementById(id).value=(v==null?'':v);}
function renderVenuePhotoPreview(){
  const box=document.getElementById('f-venuePhotoPreview');if(!box)return;
  box.innerHTML=venuePhotoData?'<div class="venue-admin-preview"><img src="'+esc(venuePhotoData)+'" alt="会場写真プレビュー"><button type="button" class="btn-mini" onclick="clearVenuePhoto()">写真を削除</button></div>':'<div class="fi-hint">現在、写真は登録されていません。</div>';
}
async function setVenuePhoto(file){
  if(!file)return;
  if(!file.type||file.type.indexOf('image/')!==0){alert('画像ファイルを選択してください');return;}
  if(file.size>15*1024*1024){alert('15MB以下の画像を選んでください');return;}
  const previousPhoto=venuePhotoData;
  try{
    const img=await loadImg(file);venuePhotoData=resize(img,1280,.68);
    if(venuePhotoData.length>850000)venuePhotoData=resize(img,960,.58);
    if(venuePhotoData.length>850000){venuePhotoData='';throw new Error('画像が大きすぎます。別の画像を選んでください');}
    renderVenuePhotoPreview();
  }catch(e){venuePhotoData=previousPhoto;renderVenuePhotoPreview();console.error(e);alert(e.message||'画像を読み込めませんでした');}
}
function clearVenuePhoto(){venuePhotoData='';const input=document.getElementById('f-venuePhotoFile');if(input)input.value='';renderVenuePhotoPreview();}
function syncDiscInputs(){
  const on=document.getElementById('f-discOn').checked;
  document.getElementById('f-disc-wrap').style.opacity=on?1:.45;
  ['f-discMin','f-discAmt'].forEach(function(k){document.getElementById(k).disabled=!on;});
}
function fillDefaultPrice(){
  const d=evPricing({},settings);
  setVal('f-adult',d.adult);setVal('f-student',d.student);
  document.getElementById('f-discOn').checked=d.discOn;setVal('f-discMin',d.discMin);setVal('f-discAmt',d.discAmt);
  syncDiscInputs();
}
function onTypeChange(){if(!editingId||!val('f-cap'))setVal('f-cap',CAP[val('f-type')]);}
function openEvForm(id,copyFrom){
  editingId=id||null;
  const src=id?Object.assign({id:id},events[id]):(copyFrom?Object.assign({},events[copyFrom]):null);
  document.getElementById('ev-form-ttl').textContent=id?'イベント情報を編集':copyFrom?'イベントを複製して作成':'新規イベント作成';
  document.getElementById('ev-save-btn').textContent=id?'保存する':'作成する';
  venuePhotoData=src?(src.venuePhoto||''):'';
  const photoInput=document.getElementById('f-venuePhotoFile');if(photoInput)photoInput.value='';renderVenuePhotoPreview();
  if(src){
    const pr=evPricing(src,settings);
    setVal('f-name',src.name);setVal('f-type',src.type||'futsal');setVal('f-date',copyFrom?'':src.date);setVal('f-time',src.time);setVal('f-venue',src.venue);setVal('f-venueCost',copyFrom?0:(src.venueCost||0));
    setVal('f-cap',getCap(src));setVal('f-extra',copyFrom?0:(src.extraP||0));
    setVal('f-adult',pr.adult);setVal('f-student',pr.student);document.getElementById('f-discOn').checked=pr.discOn;setVal('f-discMin',pr.discMin);setVal('f-discAmt',pr.discAmt);
    setVal('f-detail',src.detail);setVal('f-map',src.mapUrl);document.getElementById('f-closed').checked=copyFrom?false:!!src.closed;
  }else{
    ['f-name','f-date','f-time','f-venue','f-detail','f-map'].forEach(function(k){setVal(k,'');});
    setVal('f-type','futsal');setVal('f-cap',CAP.futsal);setVal('f-extra',0);setVal('f-venueCost',0);document.getElementById('f-closed').checked=false;
    fillDefaultPrice();
  }
  syncDiscInputs();
  document.getElementById('ev-form').classList.add('open');
  document.getElementById('ev-add-trig').style.display='none';
  document.getElementById('ev-form').scrollIntoView({behavior:'smooth',block:'start'});
  if(copyFrom)setTimeout(function(){document.getElementById('f-date').focus();},400);
}
function closeEvForm(){
  editingId=null;
  document.getElementById('ev-form').classList.remove('open');
  document.getElementById('ev-add-trig').style.display='block';
  renderAdmEv();
}
function dupEv(id){openEvForm(null,id);}
function num(id,def){const v=val(id);return v===''?def:Number(v);}
async function saveEvForm(){
  const name=val('f-name').trim(),date=val('f-date'),time=val('f-time').trim(),venue=val('f-venue').trim();
  if(!name||!date||!time||!venue){alert('イベント名・日付・時間・会場は必須です');return;}
  const mapUrl=val('f-map').trim();
  if(mapUrl&&!safeUrl(mapUrl)){alert('地図のURLは https:// から始まるものを入力してください');return;}
  const d=evPricing({},settings);
  const ev={
    name:name,type:val('f-type'),date:date,time:time,venue:venue,
    cap:Math.max(1,num('f-cap',CAP[val('f-type')])),extraP:Math.max(0,num('f-extra',0)),venueCost:Math.max(0,num('f-venueCost',0)),
    priceAdult:Math.max(0,num('f-adult',d.adult)),priceStudent:Math.max(0,num('f-student',d.student)),
    discOn:document.getElementById('f-discOn').checked,discMin:Math.max(2,num('f-discMin',d.discMin)),discAmt:Math.max(0,num('f-discAmt',d.discAmt)),
    detail:val('f-detail').trim(),mapUrl:mapUrl,closed:document.getElementById('f-closed').checked,
    cancelBefore:dayStartJST(date),venuePhoto:venuePhotoData,updatedAt:Date.now()
  };
  try{
    if(editingId){
      const old=events[editingId]||{};
      ev.createdAt=old.createdAt||Date.now();
      await db.ref('events/'+editingId).set(ev);
      const n=bookingsOf(editingId).length;
      toast('イベントを更新しました'+(n&&old.date!==date?'（予約済み'+n+'件の日付表示は予約時のままです）':''));
    }else{
      ev.createdAt=Date.now();
      await db.ref('events').push(ev);
      toast('イベントを作成しました');
    }
    closeEvForm();
  }catch(e){console.error(e);toast('保存できませんでした：'+e.message,true);}
}
async function toggleClosed(id){
  try{await db.ref('events/'+id+'/closed').set(!events[id].closed);toast(events[id].closed?'受付を停止しました':'受付を再開しました');}
  catch(e){toast('変更できませんでした',true);}
}
async function delEv(id){
  const ev=events[id];if(!ev)return;
  const n=bookingsOf(id).length;
  if(!confirm('「'+ev.name+'（'+fmtDate(ev.date)+'）」を削除しますか？'+(n?'\n\nこのイベントにはWeb予約が'+n+'件あります。予約データは「予約一覧」に残ります。':'')))return;
  const up={};up['events/'+id]=null;up['seats/'+id]=null;
  try{await db.ref().update(up);toast('削除しました');}catch(e){toast('削除できませんでした',true);}
}

// ===== 予約一覧 =====
function bkList(){
  const l=[];
  Object.keys(bookings||{}).forEach(function(pub){
    const o=bookings[pub]||{};
    Object.keys(o).forEach(function(sec){const b=o[sec];if(b&&typeof b==='object')l.push(Object.assign({pub:pub,sec:sec,resvNo:'MF-'+pub+'-'+sec,people:objToList(b.people)},b,{people:objToList(b.people)}));});
  });
  return l.sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});
}
function getSeen(){try{return Number(localStorage.getItem(SEEN_KEY))||0;}catch(e){return 0;}}
function markSeen(){try{localStorage.setItem(SEEN_KEY,String(Date.now()));}catch(e){}renderAlert();}
function renderAlert(){
  const seen=getSeen(),nb=bkList().filter(function(b){return (b.createdAt||0)>seen;});
  const badge=document.getElementById('notif-n'),area=document.getElementById('alert-area');
  const onBk=document.getElementById('sec-bk').classList.contains('on');
  if(nb.length&&!onBk){
    badge.textContent=nb.length;badge.style.display='inline-flex';
    area.innerHTML='<div class="alert-row"><div class="alert-dot"></div><div><h4>新しい予約が'+nb.length+'件入っています</h4><p>'+nb.slice(-8).map(function(b){return esc((b.people[0]||{}).name||'')+(b.cnt>1?' 他'+(b.cnt-1)+'名':'')+'（'+esc(b.evName)+' '+fmtDate(b.evDate)+'）';}).join('、')+'</p></div></div>';
  }else{badge.style.display='none';area.innerHTML='';}
}
function refreshBkFilter(){
  const sel=document.getElementById('bk-filter'),cur=sel.value||'upcoming';
  const evs=evArr();
  let h='<option value="upcoming">今後の開催の予約</option><option value="all">すべての予約</option>';
  h+=evs.slice().reverse().map(function(e){return '<option value="'+esc(e.id)+'">'+fmtDate(e.date)+' '+esc(e.name)+'</option>';}).join('');
  sel.innerHTML=h;
  sel.value=Array.prototype.some.call(sel.options,function(o){return o.value===cur;})?cur:'upcoming';
}
function filteredBk(){
  const f=document.getElementById('bk-filter').value||'upcoming',t=todayStr();
  const q=(document.getElementById('bk-search')&&document.getElementById('bk-search').value||'').trim().toLowerCase();
  return bkList().filter(function(b){
    const eventMatch=f==='all'||(f==='upcoming'?(b.evDate||'')>=t:b.evId===f);
    const nameMatch=!q||b.people.some(function(p){return String(p.name||'').toLowerCase().indexOf(q)>=0;});
    return eventMatch&&nameMatch;
  });
}
function renderMonthlyProfit(){
  const input=document.getElementById('profit-month');if(!input)return;
  if(!input.value){const n=new Date();input.value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');}
  const month=input.value,all=bkList();
  const rev=all.filter(function(b){return (b.evDate||'').slice(0,7)===month;}).reduce(function(sum,b){return sum+(Number(b.total)||0);},0);
  const monthEvents=Object.keys(events).map(function(k){return Object.assign({id:k},events[k]);}).filter(function(e){return (e.date||'').slice(0,7)===month;}).sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
  const cost=monthEvents.reduce(function(sum,e){return sum+(Number(e.venueCost)||0);},0);
  const result=document.getElementById('monthly-profit-result');if(result)result.textContent='売上 '+yen(rev)+' − 会場費 '+yen(cost)+' ＝ 利益 '+yen(rev-cost);
  const area=document.getElementById('monthly-profit-breakdown');if(area)area.innerHTML=monthEvents.length?monthEvents.map(function(e){
    const bs=all.filter(function(b){return b.evId===e.id&&(b.evDate||'')===e.date;});
    const sales=bs.reduce(function(sum,b){return sum+(Number(b.total)||0);},0),expense=Number(e.venueCost)||0;
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;"><div><b>'+esc(e.name)+'</b><span style="color:var(--text3);font-size:12px;margin-left:8px;">'+fmtDate(e.date)+'</span></div><div style="font-size:12px;text-align:right;">売上 '+yen(sales)+' − 会場費 '+yen(expense)+' ＝ <b style="color:'+(sales-expense<0?'#dc2626':'var(--mid)')+';">'+yen(sales-expense)+'</b></div></div>';
  }).join(''):'<div class="fi-hint">選択した月の開催はありません。</div>';
}
async function adminSetPersonFee(pub,sec,index,current){
  const raw=prompt('この参加者の参加費を入力してください（0円も設定できます）',String(Number(current)||0));
  if(raw===null)return;const fee=Number(raw);
  if(!Number.isFinite(fee)||fee<0){alert('0円以上の金額を入力してください');return;}
  const b=bookings[pub]&&bookings[pub][sec];if(!b)return;
  const people=(b.people||[]).map(function(p){return Object.assign({},p);});if(!people[index])return;
  people[index].fee=Math.round(fee);const sub=people.reduce(function(a,p){return a+(Number(p.fee)||0);},0);
  const disc=Math.min(Number(b.disc)||0,sub);const total=Math.max(0,sub-disc);
  try{await db.ref('bookings/'+pub+'/'+sec).update({people:people,sub:sub,disc:disc,total:total});toast('個人参加費を更新しました');renderAdmBk();}
  catch(e){console.error(e);alert('参加費を保存できませんでした。通信状態をご確認ください。');}
}
function contactHTML(b){
  const l=[];
  if(b.email)l.push('<div class="contact-line"><b>メール</b><a href="mailto:'+esc(b.email)+'" style="color:var(--mid);">'+esc(b.email)+'</a></div>');
  if(b.lineId)l.push('<div class="contact-line"><b>LINE ID</b>'+esc(b.lineId)+'</div>');
  if(b.igId)l.push('<div class="contact-line"><b>Instagram</b><a href="https://www.instagram.com/'+encodeURIComponent(b.igId)+'/" target="_blank" rel="noopener" style="color:var(--mid);">@'+esc(b.igId)+'</a></div>');
  return l.length?'<div style="background:#fff;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-top:4px;">'+l.join('')+'</div>':'';
}
async function makeReceptionQrBlob(code){
  if(!window.QRCode)throw new Error('QR library is unavailable');
  const holder=document.createElement('div');holder.style.position='fixed';holder.style.left='-10000px';holder.style.top='0';holder.style.width='320px';document.body.appendChild(holder);
  try{
    new QRCode(holder,{text:code,width:320,height:320,colorDark:'#0b2442',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
    const canvas=holder.querySelector('canvas');
    if(canvas)return await new Promise(function(resolve,reject){canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error('QR image conversion failed'));},'image/png');});
    const img=holder.querySelector('img');if(!img)throw new Error('QR image was not generated');
    if(!img.complete)await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;});
    const response=await fetch(img.src);if(!response.ok)throw new Error('QR image could not be read');return await response.blob();
  }finally{holder.remove();}
}
async function copyReservationNumber(text){
  if(navigator.clipboard&&navigator.clipboard.writeText){try{return await navigator.clipboard.writeText(text);}catch(e){console.warn('Clipboard text write failed; trying the legacy copy method',e);}}
  const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy command failed');
}
function downloadReceptionQr(blob,resvNo){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=resvNo+'_QR.png';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function blobAsDataUrl(blob){
  return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsDataURL(blob);});
}
async function makeReceptionShareBlob(resvNo){
  const qrBlob=await makeReceptionQrBlob(resvNo),qrData=await blobAsDataUrl(qrBlob);
  const img=new Image();img.src=qrData;
  if(!img.complete)await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;});
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1120;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#0b2442';ctx.fillRect(0,0,canvas.width,170);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 44px sans-serif';ctx.fillText('MORIFUT セルフチェックイン',450,78);
  ctx.font='bold 31px sans-serif';ctx.fillText('当日は日程を選択してからQRを読み取ってください',450,132);
  ctx.drawImage(img,145,205,610,610);
  ctx.fillStyle='#0b2442';ctx.font='bold 27px sans-serif';ctx.fillText('予約番号',450,878);
  ctx.font='bold 46px monospace';ctx.fillText(resvNo,450,945);
  ctx.fillStyle='#334155';ctx.font='27px sans-serif';ctx.fillText('QRが読み取れない場合は、この番号を入力してください',450,1015);
  ctx.font='24px sans-serif';ctx.fillText('予約グループ全員分の受付になります',450,1070);
  return new Promise(function(resolve,reject){canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error('share image conversion failed'));},'image/png');});
}
async function adminCopyGroupReceptionInfo(pub,sec){
  const b=bookings[pub]&&bookings[pub][sec];if(!b)return;
  const resvNo='MF-'+pub+'-'+sec;
  const codeText='MORIFUT セルフチェックイン\n予約番号：'+resvNo+'\n当日は参加する日程を選択してから、こちらのQRコードを読み取ってください。\nQRが読み取れない場合は、予約番号を入力してください。';
  try{
    const shareBlob=await makeReceptionShareBlob(resvNo);
    if(navigator.clipboard&&navigator.clipboard.write&&window.ClipboardItem){
      try{
        const shareData=await blobAsDataUrl(shareBlob);
        const html='<div><p>'+esc(codeText).replace(/\n/g,'<br>')+'</p><img src="'+shareData+'" alt="QRコード・予約番号・受付案内" width="450"></div>';
        const item=new ClipboardItem({'image/png':shareBlob,'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([codeText],{type:'text/plain'})});
        await navigator.clipboard.write([item]);toast('QR・予約番号・案内を1枚の画像にしてコピーしました');
      }catch(clipboardError){
        console.warn('Rich clipboard write failed; copying the message and downloading the combined image instead',clipboardError);
        await copyReservationNumber(codeText);downloadReceptionQr(shareBlob,resvNo);
        toast('案内と予約番号をコピーし、QR・案内付き画像を保存しました');
      }
    }else{
      await copyReservationNumber(codeText);
      downloadReceptionQr(shareBlob,resvNo);toast('案内と予約番号をコピーし、QR・案内付き画像を保存しました');
    }
  }catch(e){console.error(e);alert('コピーできませんでした。ブラウザーのクリップボード許可をご確認ください。');}
}
function renderAdmBk(){
  if(!document.getElementById('bk-filter').options.length)refreshBkFilter();
  renderMonthlyProfit();
  const list=filteredBk(),seen=getSeen();
  const ppl=[];list.forEach(function(b){b.people.forEach(function(p){ppl.push(p);});});
  const cnt=function(f){return ppl.filter(f).length;};
  document.getElementById('adm-stats').innerHTML=
    '<div class="stat-cell"><div class="stat-n">'+list.length+'</div><div class="stat-l">予約件数</div></div>'+
    '<div class="stat-cell"><div class="stat-n">'+ppl.length+'</div><div class="stat-l">参加者</div></div>'+
    '<div class="stat-cell"><div class="stat-n">'+cnt(function(p){return p.status==='社会人';})+'</div><div class="stat-l">社会人</div></div>'+
    '<div class="stat-cell"><div class="stat-n">'+cnt(function(p){return p.status==='学生';})+'</div><div class="stat-l">学生</div></div>'+
    '<div class="stat-cell"><div class="stat-n">'+cnt(function(p){return p.gender==='女性';})+'</div><div class="stat-l">女性</div></div>'+
    '<div class="stat-cell"><div class="stat-n">'+yen(list.reduce(function(s,b){return s+(Number(b.total)||0);},0))+'</div><div class="stat-l">合計金額</div></div>';
  const area=document.getElementById('bk-detail-area');
  if(!list.length){area.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);background:var(--surface);border-radius:12px;border:1px solid var(--border);">該当する予約はありません</div>';return;}
  const map={};
  list.forEach(function(b){const k=b.evId+'_'+b.evDate;(map[k]=map[k]||{evId:b.evId,evName:b.evName,evDate:b.evDate,evTime:b.evTime,list:[]}).list.push(b);});
  area.innerHTML=Object.values(map).sort(function(a,b){return (a.evDate||'').localeCompare(b.evDate||'');}).map(function(g){
    const hasNew=g.list.some(function(b){return (b.createdAt||0)>seen;});
    const n=g.list.reduce(function(s,b){return s+b.cnt;},0),tot=g.list.reduce(function(s,b){return s+(Number(b.total)||0);},0);
    const blocks=g.list.map(function(b){
      const isNew=(b.createdAt||0)>seen;
      const dt=b.createdAt?new Date(b.createdAt):null;
      const ds=dt?(dt.getMonth()+1)+'/'+dt.getDate()+' '+dt.getHours()+':'+String(dt.getMinutes()).padStart(2,'0'):'';
      const cards=b.people.map(function(p,i){
        const checked=!!b.checkedIn;
        const checkLabel=checked?'☑ 受付済み':'☐ 未受付';
        const checkStyle=checked?'background:#d1fae5;color:#047857;border-color:#86efac;':'background:#f1f5f9;color:#64748b;border-color:#cbd5e1;';
        return '<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;"><div style="flex:1;min-width:160px;"><div style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--navy);font-size:14px;margin-bottom:5px;"><span aria-label="'+(checked?'受付済み':'未受付')+'" style="display:inline-block;border:1px solid;border-radius:6px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;'+checkStyle+'">'+checkLabel+'</span><span>'+esc(p.name)+'</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;">'+personTags(p)+'</div></div><div style="font-size:14px;font-weight:900;color:var(--mid);">'+yen(p.fee)+'</div><button class="btn-mini" onclick="adminSetPersonFee(\''+esc(b.pub)+'\',\''+esc(b.sec)+'\','+i+','+(Number(p.fee)||0)+')">参加費変更</button></div>';
      }).join('');
      return '<div style="background:'+(isNew?'#f0fdf4':'var(--bg)')+';border:1px solid '+(isNew?'#86efac':'var(--border)')+';border-radius:10px;padding:14px;margin-bottom:12px;">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
        '<span style="background:var(--navy);color:#fff;font-size:12px;font-weight:800;padding:4px 10px;border-radius:6px;font-family:\'Courier New\',monospace;letter-spacing:1px;">'+esc(b.resvNo)+'</span>'+(b.checkedIn?'<span style="background:#d1fae5;color:#047857;font-size:10px;font-weight:800;padding:4px 8px;border-radius:5px;">受付済み</span>':'')+(isNew?'<span class="new-tag">NEW</span>':'')+
        '<span style="font-size:11px;color:var(--text3);">'+b.cnt+'名 / '+yen(b.total)+(b.disc?'（割引'+yen(b.disc)+'）':'')+' / '+ds+(b.legacyNo?' / 旧番号 '+esc(b.legacyNo):'')+'</span></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-mini" onclick="adminCopyGroupReceptionInfo(\''+esc(b.pub)+'\',\''+esc(b.sec)+'\')">グループのQR・予約番号をコピー</button><button onclick="adminCancel(\''+esc(b.pub)+'\',\''+esc(b.sec)+'\')" style="background:#fff5f5;color:#dc2626;border:1px solid #fecaca;font-size:11px;font-weight:700;padding:6px 14px;border-radius:6px;cursor:pointer;">この予約をキャンセル</button></div></div>'+
        cards+contactHTML(b)+
        (b.note?'<div style="margin-top:6px;font-size:12px;color:var(--text2);background:#fff;border:1px dashed var(--border2);border-radius:6px;padding:8px 12px;line-height:1.6;white-space:pre-wrap;"><span style="font-weight:800;color:var(--mid);font-size:10px;letter-spacing:1px;">備考</span><br>'+esc(b.note)+'</div>':'')+
      '</div>';
    }).join('');
    return '<div style="background:var(--surface);border:1px solid '+(hasNew?'#86efac':'var(--border)')+';border-radius:12px;overflow:hidden;margin-bottom:16px;box-shadow:var(--shadow);">'+
      '<div style="background:linear-gradient(90deg,var(--navy),var(--blue));padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'+
      '<div><div style="font-size:15px;font-weight:800;color:#fff;">'+esc(g.evName)+'</div><div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:3px;">'+fmtDate(g.evDate)+' '+esc(g.evTime)+'</div></div>'+
      '<div style="display:flex;align-items:center;gap:12px;"><div style="text-align:right;"><div style="font-size:20px;font-weight:900;color:#60a5fa;">'+n+'名</div><div style="font-size:11px;color:rgba(255,255,255,.5);">合計 '+yen(tot)+'</div></div>'+
      (events[g.evId]?'<button onclick="openTeam(\''+esc(g.evId)+'\')" style="background:#fff;color:var(--mid);border:none;font-size:12px;font-weight:800;padding:8px 14px;border-radius:6px;cursor:pointer;">チーム分け</button>':'')+'</div></div>'+
      '<div style="padding:14px;">'+blocks+'</div></div>';
  }).join('');
}
async function adminCancel(pub,sec){
  const b=(bookings[pub]||{})[sec];if(!b)return;
  const names=objToList(b.people).map(function(p){return p.name;}).join('、');
  if(!confirm('予約番号 MF-'+pub+'-'+sec+'\n（'+names+' / '+b.cnt+'名）\nこの予約をキャンセルします。よろしいですか？\nこの操作は元に戻せません。'))return;
  const up={};up['bookings/'+pub]=null;up['seats/'+b.evId+'/'+pub]=null;
  try{await db.ref().update(up);toast('キャンセルしました');}catch(e){toast('キャンセルできませんでした',true);}
}
function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function exportCsv(){
  const rows=[['予約番号','開催日','時間','イベント','氏名','性別','区分','居住地','ランク','参加費','予約合計','割引','メール','LINE ID','Instagram','備考','予約日時']];
  filteredBk().forEach(function(b){
    const ds=b.createdAt?new Date(b.createdAt).toLocaleString('ja-JP'):'';
    b.people.forEach(function(p){rows.push([b.resvNo,b.evDate,b.evTime,b.evName,p.name,p.gender,p.status,p.area,p.rank,p.fee,b.total,b.disc||0,b.email||'',b.lineId||'',b.igId?'@'+b.igId:'',b.note||'',ds]);});
  });
  if(rows.length===1){alert('書き出す予約がありません');return;}
  const blob=new Blob(['﻿'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='morifut_bookings_'+todayStr()+'.csv';a.click();
}

// ===== ギャラリー =====
function renderAdmGal(){
  document.getElementById('g-count').textContent='（'+gallery.length+'枚）';
  document.getElementById('g-ev-list').innerHTML=Array.from(new Set(evArr().map(function(e){return e.name;}))).map(function(n){return '<option value="'+esc(n)+'">';}).join('');
  const el=document.getElementById('adm-gal');
  if(!gallery.length){el.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:10px;">まだ写真はありません。写真を追加すると、ホームに「Gallery」が表示されます。</div>';return;}
  el.innerHTML=gallery.map(function(g){
    return '<div class="adm-gal-item"><img src="'+esc(String(g.thumb||'').indexOf('data:image/')===0?g.thumb:'')+'" alt="">'+
      '<div class="cap">'+esc(g.caption||'（ひとことなし）')+'<br><span style="color:var(--text3);">'+(g.date?fmtDate(g.date):'')+' '+esc(g.evName||'')+'</span></div>'+
      '<div class="btns"><button class="btn-ed" onclick="editPhoto(\''+esc(g.id)+'\')">編集</button><button class="btn-dl" onclick="delPhoto(\''+esc(g.id)+'\')">削除</button></div></div>';
  }).join('');
}
function loadImg(file){
  return new Promise(function(res,rej){
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){URL.revokeObjectURL(url);res(img);};
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('画像を読み込めませんでした'));};
    img.src=url;
  });
}
function resize(img,max,q){
  const r=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*r);c.height=Math.round(img.naturalHeight*r);
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',q);
}
async function uploadPhotos(files){
  files=Array.from(files||[]);if(!files.length)return;
  const zone=document.getElementById('g-zone'),meta={date:val('g-date'),evName:val('g-ev').trim(),caption:val('g-cap').trim()};
  let ok=0;
  for(let i=0;i<files.length;i++){
    zone.textContent='アップロード中… '+(i+1)+' / '+files.length;
    try{
      const img=await loadImg(files[i]);
      const thumb=resize(img,640,.74),full=resize(img,1600,.82);
      const key=db.ref('gallery').push().key;
      const up={};
      up['gallery/'+key]=Object.assign({thumb:thumb,ts:Date.now()+i},meta);
      up['galleryFull/'+key]=full;
      await db.ref().update(up);ok++;
    }catch(e){console.error(e);toast((files[i].name||'写真')+' を追加できませんでした',true);}
  }
  zone.textContent='＋ 写真を選ぶ（複数選択できます）';
  document.getElementById('g-file').value='';
  if(ok)toast(ok+'枚の写真を追加しました');
}
async function editPhoto(id){
  const g=gallery.find(function(x){return x.id===id;});if(!g)return;
  const cap=prompt('ひとこと（空欄で削除）',g.caption||'');if(cap===null)return;
  const ev=prompt('開催名',g.evName||'');if(ev===null)return;
  const dt=prompt('撮影日（例：2026-11-20）',g.date||'');if(dt===null)return;
  if(dt&&!/^\d{4}-\d{2}-\d{2}$/.test(dt.trim())){alert('撮影日は 2026-11-20 の形式で入力してください');return;}
  try{await db.ref('gallery/'+id).update({caption:cap.trim().slice(0,60),evName:ev.trim(),date:dt.trim()});toast('更新しました');}catch(e){toast('更新できませんでした',true);}
}
async function delPhoto(id){
  if(!confirm('この写真を削除しますか？'))return;
  const up={};up['gallery/'+id]=null;up['galleryFull/'+id]=null;
  try{await db.ref().update(up);toast('削除しました');}catch(e){toast('削除できませんでした',true);}
}

// ===== 基本設定 =====
function renderSettings(){
  if(document.activeElement&&document.activeElement.id&&document.activeElement.id.indexOf('s-')===0)return;
  setVal('s-adult',settings.priceAdult);setVal('s-student',settings.priceStudent);
  document.getElementById('s-discOn').checked=!!settings.discOn;
  setVal('s-discMin',settings.discMin);setVal('s-discAmt',settings.discAmt);setVal('s-gas',settings.gasUrl);
}
async function saveSettings(){
  const gas=val('s-gas').trim();
  if(gas&&!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(gas)){if(!confirm('送信用URLの形式がGoogle Apps Scriptの「…/exec」ではないようです。このまま保存しますか？'))return;}
  const s={priceAdult:Math.max(0,num('s-adult',1000)),priceStudent:Math.max(0,num('s-student',500)),discOn:document.getElementById('s-discOn').checked,discMin:Math.max(2,num('s-discMin',3)),discAmt:Math.max(0,num('s-discAmt',500)),gasUrl:gas};
  try{await db.ref('settings').set(s);toast('設定を保存しました');}catch(e){toast('保存できませんでした：'+e.message,true);}
}

// ===== 旧データの移行 =====
var legacy=null;
async function checkLegacy(){
  try{legacy=(await db.ref('morifut_data').once('value')).val();}catch(e){legacy=null;}
  const box=document.getElementById('legacy-box');
  if(!legacy||(!legacy.events&&!legacy.bookings)){box.style.display='none';return;}
  const evN=objToList(legacy.events).length,bkN=objToList(legacy.bookings).length;
  box.style.display='block';
  box.innerHTML='<div class="adm-h" style="margin-top:0;">旧データの移行</div>'+
    '<div class="warn-box">以前の形式のデータ（イベント'+evN+'件・予約者'+bkN+'名分）が残っています。<br>「移行する」を押すと新しい形式にコピーします。移行後の予約には新しい予約番号が付きます（旧番号は予約一覧に併記されます）。</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-mini" onclick="downloadLegacy()">① 念のためバックアップを保存</button><button class="btn-ed" onclick="migrateLegacy()">② 新しい形式に移行する</button><button class="btn-dl" onclick="deleteLegacy()">③ 旧データを削除</button></div>';
}
function downloadLegacy(){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(legacy,null,2)],{type:'application/json'}));a.download='morifut_backup_'+todayStr()+'.json';a.click();
}
async function migrateLegacy(){
  if(!legacy)return;
  if(objToList(events).some(function(e){return e.legacyId;})&&!confirm('すでに移行済みのデータがあります。もう一度移行すると重複します。続けますか？'))return;
  if(!confirm('旧データを新しい形式に移行します。よろしいですか？'))return;
  try{
    const oldEv=objToList(legacy.events),oldBk=objToList(legacy.bookings);
    const evMap={},evUp={};
    oldEv.forEach(function(e){
      const key=db.ref('events').push().key;evMap[String(e.id)]=key;
      const d=evPricing({},settings);
      evUp['events/'+key]={name:e.name||'',type:e.type||'futsal',date:e.date||todayStr(),time:e.time||'',venue:e.venue||'',
        cap:Number(e.customCap)||CAP[e.type]||20,extraP:0,priceAdult:d.adult,priceStudent:d.student,discOn:d.discOn,discMin:d.discMin,discAmt:d.discAmt,
        detail:'',mapUrl:'',closed:false,cancelBefore:dayStartJST(e.date||todayStr()),createdAt:Date.now(),legacyId:String(e.id)};
    });
    if(Object.keys(evUp).length)await db.ref().update(evUp);
    const groups={};
    oldBk.forEach(function(b){const k=b.resvNo||('ID'+b.id);(groups[k]=groups[k]||[]).push(b);});
    const bkUp={},webCnt={};
    Object.keys(groups).forEach(function(k){
      const l=groups[k],f=l[0],evKey=evMap[String(f.evId)];
      if(!evKey)return;
      const pub=rid(4),sec=rid(8);
      const sub=l.reduce(function(s,b){return s+(Number(b.fee)||0);},0);
      const total=Number(f.groupTotal)||sub;
      bkUp['bookings/'+pub+'/'+sec]={evId:evKey,evName:f.evName||'',evDate:f.evDate||'',evTime:f.evTime||'',venue:'',cnt:Math.min(10,l.length),sub:sub,disc:Math.max(0,sub-total),total:total,
        people:l.map(function(b){return{name:b.name||'',gender:b.gender||'',status:b.status||'社会人',area:b.area||'',rank:Number(b.rank)||1,fee:Number(b.fee)||0};}),
        note:String(f.note||'').slice(0,500),cancelBefore:dayStartJST(f.evDate||todayStr()),createdAt:Number(f.id)||Date.now(),legacyNo:k.indexOf('ID')===0?'':k};
      bkUp['seats/'+evKey+'/'+pub]=Math.min(10,l.length);
      webCnt[evKey]=(webCnt[evKey]||0)+Math.min(10,l.length);
    });
    // 旧データの参加人数（手動分を含む）との差を「LINE等の予約」に入れて表示人数を保つ
    oldEv.forEach(function(e){const k=evMap[String(e.id)];const diff=(Number(e.p)||0)-(webCnt[k]||0);if(diff>0)bkUp['events/'+k+'/extraP']=diff;});
    if(Object.keys(bkUp).length)await db.ref().update(bkUp);
    toast('移行が完了しました');
    alert('移行が完了しました。\nイベントと予約一覧の内容を確認してから、「③ 旧データを削除」を押してください。');
  }catch(e){console.error(e);alert('移行中にエラーが発生しました：'+e.message);}
}
async function deleteLegacy(){
  if(!confirm('旧データを削除します。移行とバックアップは済んでいますか？\nこの操作は元に戻せません。'))return;
  try{await db.ref('morifut_data').remove();legacy=null;checkLegacy();toast('旧データを削除しました');}catch(e){toast('削除できませんでした',true);}
}


// ===== チーム分け =====
var teamsData={},tm=null;
const TM_COLORS=['#facc15','#dc2626','#2563eb','#64748b'];
const TM_NAMES='ABCDEFGH';
const TM_BIBS=['黄色','赤','青','ビブなし'];
function tmColor(i){return TM_COLORS[i%TM_COLORS.length];}
function tmColorText(i){return i%TM_COLORS.length===0?'#713f12':'#fff';}
function tmParseExtra(text){
  const out=[];
  String(text||'').split('\n').forEach(function(line,li){
    line=line.trim();if(!line)return;
    const ppl=line.split(/[\/／]/).map(function(x){
      x=x.trim();if(!x)return null;
      const m=x.match(/^(.*?)[\s,、　]*([1-5])$/);
      const name=(m?m[1]:x).replace(/[,、\s　]+$/,'').trim()||x;
      return{name:name,rank:m?Number(m[2]):3,gender:'',status:''};
    }).filter(Boolean);
    if(ppl.length)out.push({key:'x'+li+'_'+ppl.map(function(p){return p.name;}).join('_'),people:ppl,src:'追加'});
  });
  return out;
}
function tmGroups(){
  const web=bookingsOf(tm.evId).map(function(b){return{key:b.pub,refs:[{pub:b.pub,sec:b.sec}],people:b.people.map(function(p){return{name:p.name,rank:Number(p.rank)||3,gender:p.gender,status:p.status};}),src:'Web'};});
  let g=web;if(document.getElementById('tm-bundle-solo').checked){const singles=web.filter(function(x){return x.people.length===1;}),others=web.filter(function(x){return x.people.length!==1;}),bundles=[];for(let i=0;i<singles.length;i+=2){const pair=singles.slice(i,i+2);bundles.push({key:'solo_'+pair.map(function(x){return x.key;}).join('_'),refs:pair.reduce(function(a,x){return a.concat(x.refs);},[]),people:pair.reduce(function(a,x){return a.concat(x.people);},[]),src:'個人参加まとめ'});}g=others.concat(bundles);}
  return g.concat(tmParseExtra(document.getElementById('tm-extra').value)).map(function(x){
    x.size=x.people.length;x.sum=x.people.reduce(function(s,p){return s+p.rank;},0);x.women=x.people.filter(function(p){return p.gender==='女性';}).length;return x;
  });
}
function openTeam(evId){
  const ev=events[evId];if(!ev)return;
  const saved=teamsData[evId]||{};
  tm={evId:evId,sizes:saved.sizes?objToList(saved.sizes).map(Number):null,assign:saved.assign||null};
  document.getElementById('tm-title').textContent=fmtDate(ev.date)+' '+ev.name+' のチーム分け';
  document.getElementById('tm-extra').value=saved.extra||'';document.getElementById('tm-bundle-solo').checked=!!saved.bundleSolo;
  switchTab('sec-team');
  tmRefresh(true);
  window.scrollTo({top:0,behavior:'instant'});
}
function tmSoloToggle(){if(tm)tm.assign=null;tmRefresh(false);}
function tmRefresh(init){
  const gs=tmGroups(),N=gs.reduce(function(s,g){return s+g.size;},0);
  tm.groups=gs;tm.N=N;
  const multi=gs.filter(function(g){return g.size>1;}).length;
  document.getElementById('tm-info').innerHTML='参加者 <b style="color:var(--navy);">'+N+'名</b>（Web予約 '+bookingsOf(tm.evId).reduce(function(s,b){return s+b.cnt;},0)+'名'+(gs.some(function(g){return g.src==='追加';})?' ＋ 追加 '+gs.filter(function(g){return g.src==='追加';}).reduce(function(s,g){return s+g.size;},0)+'名':'')+'）／ 同時予約グループ '+multi+'組';
  const sel=document.getElementById('tm-n'),cur=tm.sizes?tm.sizes.length:(N>=21?3:2);
  let o='';for(let k=2;k<=8;k++)o+='<option value="'+k+'">'+k+'チーム</option>';
  sel.innerHTML=o;sel.value=String(Math.min(8,Math.max(2,cur)));
  // 参加人数が変わったときだけ人数配分を自動で作り直す（手で変えた 6-6-7 などは保持）
  const sizeSum=tm.sizes?tm.sizes.reduce(function(a,b){return a+b;},0):-1;
  if(!tm.sizes||(!init&&tm.prevN!==undefined&&tm.prevN!==N&&sizeSum!==N))tmAutoSizes();
  tm.prevN=N;
  tmRenderSizes();
  tmRenderResult();
}
var tmExtraTimer=null;
function tmExtraChanged(){clearTimeout(tmExtraTimer);tmExtraTimer=setTimeout(function(){tmRefresh(false);},400);}
function tmAutoSizes(){
  const k=Number(document.getElementById('tm-n').value)||2,N=tm.N||0,base=Math.floor(N/k),r=N%k;
  tm.sizes=[];for(let i=0;i<k;i++)tm.sizes.push(base+(i<r?1:0));
}
function tmRenderSizes(){
  const total=tm.sizes.reduce(function(a,b){return a+b;},0);
  document.getElementById('tm-sizes').innerHTML=tm.sizes.map(function(n,i){
    return '<span style="font-size:12px;font-weight:800;color:'+tmColor(i)+';background:'+tmColor(i)+'22;padding:3px 6px;border-radius:5px;">'+TM_NAMES[i]+'</span><input type="number" class="fi tm-size" min="1" max="30" value="'+n+'" onchange="tmSetSize('+i+',this.value)">';
  }).join('')+'<span class="tm-sum '+(total===tm.N?'ok':'ng')+'">合計 '+total+' / '+tm.N+'名'+(total===tm.N?' ✓':'（人数が合っていません）')+'</span>';
}
function tmSetSize(i,v){tm.sizes[i]=Math.max(1,Number(v)||1);tmRenderSizes();}

// 割り当てアルゴリズム：同時予約はまとめて1つの塊として扱い、
// ランダム順の貪欲法＋入れ替えによる改善を何度も試して最も均等なものを採用
function tmCost(teams){
  const sums=teams.map(function(t){return t.sum;}),avg=sums.reduce(function(a,b){return a+b;},0)/teams.length;
  const range=Math.max.apply(null,sums)-Math.min.apply(null,sums);
  const sq=sums.reduce(function(s,x){return s+(x-avg)*(x-avg);},0);
  const w=teams.map(function(t){return t.women;});
  return range*1000+sq*10+(Math.max.apply(null,w)-Math.min.apply(null,w))*30;
}
function tmSolve(groups,sizes,tries,seedShift){
  let best=null;
  for(let t=0;t<tries;t++){
    const order=groups.slice();
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const x=order[i];order[i]=order[j];order[j]=x;}
    order.sort(function(a,b){return b.size-a.size||(t%2?0:b.sum-a.sum);});
    const teams=sizes.map(function(c){return{cap:c,n:0,sum:0,women:0,items:[]};});
    let ok=true;
    for(const g of order){
      let pick=null;
      teams.forEach(function(tt){if(tt.cap-tt.n>=g.size&&(!pick||tt.sum<pick.sum||(tt.sum===pick.sum&&tt.cap-tt.n>pick.cap-pick.n)))pick=tt;});
      if(!pick){ok=false;break;}
      pick.items.push(g);pick.n+=g.size;pick.sum+=g.sum;pick.women+=g.women;
    }
    if(!ok)continue;
    // 同じ人数の塊どうしを入れ替えて改善
    let improved=true,guard=0;
    while(improved&&guard++<200){
      improved=false;const c0=tmCost(teams);
      outer:
      for(let a=0;a<teams.length;a++)for(let b=a+1;b<teams.length;b++){
        const A=teams[a],B=teams[b];
        for(let i=0;i<A.items.length;i++)for(let j=0;j<B.items.length;j++){
          const x=A.items[i],y=B.items[j];
          if(x.size!==y.size||(x.sum===y.sum&&x.women===y.women))continue;
          A.sum+=y.sum-x.sum;B.sum+=x.sum-y.sum;A.women+=y.women-x.women;B.women+=x.women-y.women;
          if(tmCost(teams)<c0){A.items[i]=y;B.items[j]=x;improved=true;break outer;}
          A.sum-=y.sum-x.sum;B.sum-=x.sum-y.sum;A.women-=y.women-x.women;B.women-=x.women-y.women;
        }
      }
    }
    const c=tmCost(teams);
    if(!best||c<best.cost||(seedShift&&c===best.cost&&Math.random()<.5))best={cost:c,teams:teams};
  }
  return best;
}
function tmRun(shuffle){
  tmRefresh(false);
  const gs=tm.groups,total=tm.sizes.reduce(function(a,b){return a+b;},0);
  if(!gs.length){alert('参加者がいません');return;}
  if(total!==tm.N){alert('各チームの人数の合計（'+total+'名）が参加者数（'+tm.N+'名）と合っていません');return;}
  const maxG=Math.max.apply(null,gs.map(function(g){return g.size;})),maxC=Math.max.apply(null,tm.sizes);
  if(maxG>maxC){alert(maxG+'名の同時予約があるため、どのチームにも入りきりません。チームの人数を増やしてください。');return;}
  const r=tmSolve(gs,tm.sizes,shuffle?300:600,!!shuffle);
  if(!r){alert('同時予約の人数の組み合わせの都合で、この人数配分では分けられませんでした。人数配分を変えてお試しください。');return;}
  tm.assign={};
  r.teams.forEach(function(t,i){t.items.forEach(function(g){tm.assign[g.key]=i;});});
  tmRenderResult();
  toast('チーム分けしました（まだ保存されていません）');
}
function tmMove(key,idx){tm.assign[key]=Number(idx);tmRenderResult();}
function tmBuild(){
  const teams=tm.sizes.map(function(c){return{cap:c,n:0,sum:0,women:0,items:[]};}),un=[];
  tm.groups.forEach(function(g){
    const i=tm.assign?tm.assign[g.key]:undefined;
    if(i===undefined||i===null||!teams[i])un.push(g);
    else{const t=teams[i];t.items.push(g);t.n+=g.size;t.sum+=g.sum;t.women+=g.women;}
  });
  return{teams:teams,un:un};
}
function tmGrpHTML(g,cur){
  const opts=tm.sizes.map(function(_,i){return '<option value="'+i+'"'+(i===cur?' selected':'')+'>'+TM_NAMES[i]+'へ</option>';}).join('');
  return '<div class="tm-grp'+(g.size>1?' multi':'')+'"><div class="tm-ppl">'+(g.size>1?'<div class="tm-tag">同時予約 '+g.size+'名</div>':'')+
    g.people.map(function(p){const ri=rankOf(p.rank);return '<div class="tm-p">'+esc(p.name)+'<small style="background:'+ri.bg+';color:'+ri.col+';">R'+p.rank+'</small>'+(p.gender==='女性'?'<small style="background:#fdf2f8;color:#db2777;">女</small>':'')+(g.src==='追加'?'<small style="background:var(--bg2);color:var(--text3);">追加</small>':g.src==='個人参加まとめ'?'<small style="background:#e0f2fe;color:#0369a1;">個人まとめ</small>':'')+'</div>';}).join('')+
    '</div><select class="tm-mv" onchange="tmMove(\''+esc(g.key)+'\',this.value)">'+(cur===-1?'<option value="">未割当</option>':'')+opts+'</select></div>';
}
function tmRenderResult(){
  const area=document.getElementById('tm-result');
  if(!tm.assign){area.innerHTML='';return;}
  const r=tmBuild(),sums=r.teams.map(function(t){return t.sum;});
  const range=r.teams.length?Math.max.apply(null,sums)-Math.min.apply(null,sums):0;
  let h='<div class="adm-box" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">'+
    '<div style="font-size:13px;color:var(--text2);">ランク合計の差：<b style="color:'+(range<=1?'#16a34a':range<=3?'#d97706':'#dc2626')+';font-size:16px;">'+range+'</b>'+(range<=1?'（ほぼ均等）':'')+'</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-mini" onclick="tmCopy()">LINE用にコピー</button><button class="btn-sv" onclick="tmSave()">チームを確定する</button></div></div>';
  if(r.un.length)h+='<div class="warn-box"><strong>まだチームに入っていない参加者がいます（予約の追加など）。</strong>「自動でチーム分け」をやり直すか、下で振り分けてください。</div><div class="tm-card" style="margin-bottom:12px;">'+r.un.map(function(g){return tmGrpHTML(g,-1);}).join('')+'</div>';
  h+='<div class="tm-grid">'+r.teams.map(function(t,i){
    const avg=t.n?(t.sum/t.n).toFixed(1):'-';
    const bib=TM_BIBS[i%TM_BIBS.length];
    return '<div class="tm-card"><div class="tm-hd" style="background:'+tmColor(i)+';color:'+tmColorText(i)+';"><b>'+TM_NAMES[i]+'チーム</b><span>'+t.n+'名'+(t.n!==t.cap?'（設定'+t.cap+'名）':'')+(t.women?'・女性'+t.women+'名':'')+'<br>ビブス：<b style="font-size:14px;">'+bib+'</b><br>ランク合計 <b style="font-size:13px;">'+t.sum+'</b>（平均'+avg+'）</span></div>'+
      (t.items.length?t.items.slice().sort(function(a,b){return b.size-a.size||b.sum-a.sum;}).map(function(g){return tmGrpHTML(g,i);}).join(''):'<div style="padding:14px;font-size:12px;color:var(--text3);">メンバーなし</div>')+'</div>';
  }).join('')+'</div>';
  h+='<div class="adm-box" style="margin-top:14px;"><div class="adm-h" style="margin-top:0;">総当り対戦表</div><div class="fi-hint" style="margin:0 0 10px;">各チームと1回ずつ対戦する組み合わせです。同じラウンド内の試合は同時進行できます。</div>'+
    tmRoundRobin(r.teams.length).map(function(round,ri){
      return '<div style="margin:12px 0 6px;font-weight:900;color:var(--navy);">第'+(ri+1)+'ラウンド</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">'+round.map(function(pair){
        function badge(i){return '<span style="display:inline-block;background:'+tmColor(i)+';color:'+tmColorText(i)+';padding:6px 10px;border-radius:7px;font-weight:900;">'+TM_NAMES[i]+'チーム · '+TM_BIBS[i%TM_BIBS.length]+'</span>';}
        return '<div style="display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;padding:10px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;">'+badge(pair[0])+'<b style="color:var(--text3);">VS</b>'+badge(pair[1])+'</div>';
      }).join('')+'</div>';
    }).join('')+'</div>';
  area.innerHTML=h;
}
function tmRoundRobin(teamCount){
  const rotation=Array.from({length:teamCount},function(_,i){return i;});
  if(rotation.length%2)rotation.push(-1);
  const rounds=[];
  for(let r=0;r<rotation.length-1;r++){
    const games=[];
    for(let i=0;i<rotation.length/2;i++){
      const a=rotation[i],b=rotation[rotation.length-1-i];if(a>=0&&b>=0)games.push([a,b]);
    }
    rounds.push(games);
    const tail=rotation.pop();rotation.splice(1,0,tail);
  }
  return rounds;
}
async function tmSave(){
  const result=tmBuild();
  if(result.un.length){alert('未割当の参加者がいます。全員をチームに割り当ててから確定してください。');return;}
  const bibByTeam=tm.sizes.map(function(_,i){return TM_BIBS[i%TM_BIBS.length];});
  const data={sizes:tm.sizes,assign:tm.assign||{},bibByTeam:bibByTeam,extra:document.getElementById('tm-extra').value,bundleSolo:document.getElementById('tm-bundle-solo').checked,savedAt:Date.now()};
  const updates={};updates['teams/'+tm.evId]=data;
  tm.groups.forEach(function(g){
    const teamIndex=tm.assign&&tm.assign[g.key];if(teamIndex===undefined||teamIndex===null)return;
    const bib=TM_BIBS[Number(teamIndex)%TM_BIBS.length];
    (g.refs||[]).forEach(function(ref){
      const booking=bookings[ref.pub]&&bookings[ref.pub][ref.sec];if(!booking)return;
      objToList(booking.people).forEach(function(_,i){updates['bookings/'+ref.pub+'/'+ref.sec+'/people/'+i+'/bibColor']=bib;});
    });
  });
  try{await db.ref().update(updates);toast('チームを確定しました。セルフ受付後にビブス色を表示します');}catch(e){toast('保存できませんでした：'+e.message,true);}
}
function tmCopy(){
  const ev=events[tm.evId]||{},r=tmBuild();
  let t='【'+fmtDate(ev.date)+' '+(ev.name||'')+' チーム分け】\n';
  r.teams.forEach(function(tt,i){
    t+='\n■ '+TM_NAMES[i]+'チーム（'+tt.n+'名／ビブス：'+TM_BIBS[i%TM_BIBS.length]+'）\n';
    tt.items.forEach(function(g){g.people.forEach(function(p){t+='・'+p.name+'\n';});});
  });
  t+='\n【総当り対戦表】\n';
  tmRoundRobin(r.teams.length).forEach(function(round,ri){
    t+='第'+(ri+1)+'ラウンド：'+round.map(function(pair){return TM_NAMES[pair[0]]+'チーム vs '+TM_NAMES[pair[1]]+'チーム';}).join(' ／ ')+'\n';
  });
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){toast('コピーしました（ランクは含みません）');},function(){prompt('コピーしてください',t);});
  else prompt('コピーしてください',t);
}
