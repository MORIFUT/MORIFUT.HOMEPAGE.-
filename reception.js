// MORIFUT セルフ受付。今日開催分だけを対象に、予約番号コードが一致する予約を受付する。
var rTodayEvents=[],rSelectedEvent=null,rScanner=null,rCurrent=null,rLookupBusy=false,rDoneTimer=null,rScanGeneration=0,rEventsReady=false,rQueuedCode='';
var rScreens=['r-home','r-scan','r-done'];
function rShow(id){rScreens.forEach(function(k){var el=document.getElementById(k);if(el)el.classList.toggle('r-hidden',k!==id);});}
function rNotice(id,text,error){var el=document.getElementById(id);if(!el)return;el.innerHTML=text?'<div class="r-alert'+(error?' r-error':'')+'">'+esc(text)+'</div>':'';}
function rPeople(b){return Array.isArray(b.people)?b.people.filter(Boolean):Object.keys(b.people||{}).map(function(k){return b.people[k];}).filter(Boolean);}
function rBibStyle(color){
  var styles={
    '黄色':{label:'黄色',swatch:'#facc15',text:'#713f12'},
    '赤':{label:'赤',swatch:'#dc2626',text:'#881337'},
    '青':{label:'青',swatch:'#2563eb',text:'#1e3a8a'},
    'ビブなし':{label:'ビブなし',swatch:'#f8fafc',text:'#334155'}
  };
  return styles[color]||{label:'未設定',swatch:'#cbd5e1',text:'#475569'};
}
function rClearTimer(){if(rDoneTimer){clearTimeout(rDoneTimer);rDoneTimer=null;}}
async function stopReceptionScanner(){
  rScanGeneration++;
  var scanner=rScanner;rScanner=null;
  if(!scanner)return;
  try{if(scanner.isScanning)await scanner.stop();}catch(e){}
  try{scanner.clear();}catch(e){}
}
async function returnReceptionHome(){
  rClearTimer();await stopReceptionScanner();rSelectedEvent=null;rCurrent=null;rTodayEvents=[];rEventsReady=false;rQueuedCode='';
  document.getElementById('r-code').value='';document.getElementById('r-scan-message').innerHTML='';
  document.getElementById('r-manual-form').classList.add('r-hidden');
  document.getElementById('r-manual-toggle').classList.remove('r-hidden');
  document.getElementById('r-home-message').innerHTML='';rShow('r-home');
}
async function showReceptionEvents(){
  rClearTimer();stopReceptionScanner();rSelectedEvent=null;rCurrent=null;rTodayEvents=[];rEventsReady=false;rQueuedCode='';
  var start=document.getElementById('r-start'),homeMessage=document.getElementById('r-home-message');
  start.disabled=true;start.textContent='準備中…';homeMessage.innerHTML='';
  document.getElementById('r-selected-event').textContent=fmtDateLong(todayStr())+'　当日開催分';
  document.getElementById('r-camera-status').textContent='カメラを準備しています…';
  document.getElementById('r-camera-retry').classList.add('r-hidden');
  document.getElementById('r-scan-message').innerHTML='';
  document.getElementById('r-code').value='';
  document.getElementById('r-manual-form').classList.add('r-hidden');
  document.getElementById('r-manual-toggle').classList.remove('r-hidden');
  rShow('r-scan');
  // Call start synchronously from the button gesture; do not await the network first (iOS camera permission).
  var cameraPromise=startReceptionScanner();
  try{
    var today=todayStr(),snap=await db.ref('events').once('value'),events=snap.val()||{};
    rTodayEvents=Object.keys(events).map(function(id){return Object.assign({},events[id]||{},{id:id});}).filter(function(ev){return ev.date===today;});
    rEventsReady=true;
    if(!rTodayEvents.length){
      rQueuedCode='';await stopReceptionScanner();rShow('r-home');
      homeMessage.innerHTML='<div class="r-alert r-error">本日の開催がありません。</div>';return;
    }
    await cameraPromise;
    if(rQueuedCode){var queued=rQueuedCode;rQueuedCode='';handleReceptionCode(queued);}
  }catch(e){
    console.error(e);rEventsReady=false;await stopReceptionScanner();rShow('r-home');
    homeMessage.innerHTML='<div class="r-alert r-error">開催情報を読み込めません。通信状態をご確認ください。</div>';
  }finally{start.disabled=false;start.textContent='受付する';}
}
function rQrConfig(){return{fps:10,qrbox:function(w,h){var side=Math.max(150,Math.floor(Math.min(w,h)*.72));side=Math.min(side,360);return{width:side,height:side};},aspectRatio:1.0,disableFlip:false};}
function startReceptionScanner(){
  if(rScanner)return Promise.resolve();
  var generation=++rScanGeneration,status=document.getElementById('r-camera-status'),retry=document.getElementById('r-camera-retry');
  retry.classList.add('r-hidden');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent='カメラを利用できません。';retry.classList.remove('r-hidden');return Promise.resolve();}
  if(typeof Html5Qrcode==='undefined'){status.textContent='QR読取を読み込めません。';retry.classList.remove('r-hidden');return Promise.resolve();}
  var root=document.getElementById('qr-reader');root.innerHTML='';
  var scanner=new Html5Qrcode('qr-reader');rScanner=scanner;status.textContent='カメラを起動しています…';
  // scanner.start is invoked before any await so mobile browsers see the user's button gesture.
  return scanner.start({facingMode:{exact:'environment'}},rQrConfig(),function(text){
    if(generation!==rScanGeneration||rLookupBusy)return;
    if(!rEventsReady){if(!rQueuedCode){rQueuedCode=text;status.textContent='開催情報を確認しています…';}return;}
    handleReceptionCode(text);
  },function(){}).then(function(){
    if(generation===rScanGeneration&&rScanner===scanner){status.textContent='読み取り中';retry.classList.add('r-hidden');}
  }).catch(function(e){
    console.error('Rear camera start failed',e);if(rScanner===scanner)rScanner=null;
    try{scanner.clear();}catch(ignore){}
    status.textContent='外カメラを起動できません。カメラの使用を許可してください。';retry.classList.remove('r-hidden');
  });
}
function toggleManualEntry(){
  var form=document.getElementById('r-manual-form'),toggle=document.getElementById('r-manual-toggle');
  var opening=form.classList.contains('r-hidden');form.classList.toggle('r-hidden',!opening);toggle.classList.toggle('r-hidden',opening);
  if(opening)document.getElementById('r-code').focus();
}
function lookupReservationCodeByInput(){handleReceptionCode(document.getElementById('r-code').value);}
function handleReceptionCode(raw){
  if(!rEventsReady){if(!rQueuedCode)rQueuedCode=raw;return;}
  if(rLookupBusy)return;
  rLookupBusy=true;rNotice('r-scan-message','予約を確認しています…');
  stopReceptionScanner().then(function(){return rLookupReservation(raw);}).catch(function(e){
    console.error(e);rNotice('r-scan-message','予約を確認できませんでした。通信状態をご確認ください。',true);
  }).finally(function(){rLookupBusy=false;});
}
async function rLookupReservation(raw){
  rNotice('r-scan-message','');
  if(!rTodayEvents.length){rNotice('r-scan-message','本日の開催情報がありません。',true);return;}
  var id=parseResvNo(raw);
  if(!id||id.pub.length!==4||id.sec.length!==8){
    rNotice('r-scan-message','予約番号を確認してください。',true);
    document.getElementById('r-camera-status').textContent='QRコードを読み取るか、予約番号を入力してください。';
    document.getElementById('r-camera-retry').classList.remove('r-hidden');return;
  }
  try{
    var snap=await db.ref('bookings/'+id.pub+'/'+id.sec).once('value'),b=snap.val();
    if(!b||typeof b!=='object'){
      rNotice('r-scan-message','予約が見つかりません。',true);
      document.getElementById('r-camera-status').textContent='QRコードを読み取るか、予約番号を入力してください。';
      document.getElementById('r-camera-retry').classList.remove('r-hidden');return;
    }
    var eventMatch=rTodayEvents.find(function(ev){return ev.id===b.evId;});
    if(!eventMatch||((b.evDate||eventMatch.date)!==todayStr())){
      rNotice('r-scan-message','この予約は本日の開催分ではありません。',true);
      document.getElementById('r-camera-status').textContent='本日の予約QRをご確認ください。';
      document.getElementById('r-camera-retry').classList.remove('r-hidden');return;
    }
    rSelectedEvent=eventMatch;rCurrent={pub:id.pub,sec:id.sec,booking:b};
    if(b.checkedIn)rRenderDone(b,true);else await confirmSelfReception();
  }catch(e){
    console.error(e);rNotice('r-scan-message','予約情報を取得できませんでした。',true);
    document.getElementById('r-camera-status').textContent='通信状態をご確認ください。';
    document.getElementById('r-camera-retry').classList.remove('r-hidden');
  }
}
async function confirmSelfReception(){
  if(!rCurrent||!rCurrent.booking)return;
  var path='bookings/'+rCurrent.pub+'/'+rCurrent.sec;
  try{
    await db.ref(path).update({checkedIn:true,checkedInAt:firebase.database.ServerValue.TIMESTAMP,checkedInBy:'self-service'});
    var b=(await db.ref(path).once('value')).val();
    if(!b||!b.checkedIn)throw new Error('check-in state was not confirmed');
    rCurrent.booking=b;rRenderDone(b,false);
  }catch(e){
    console.error(e);
    try{var latest=(await db.ref(path).once('value')).val();if(latest&&latest.checkedIn){rCurrent.booking=latest;rRenderDone(latest,true);return;}}catch(ignore){}
    rNotice('r-scan-message','受付を記録できませんでした。通信状態をご確認ください。',true);
    document.getElementById('r-camera-status').textContent='受付を記録できませんでした。';
    document.getElementById('r-camera-retry').classList.remove('r-hidden');rShow('r-scan');
  }
}
function rRenderDone(b,already){
  stopReceptionScanner();rClearTimer();
  var people=rPeople(b),eventTitle=b.evName||(rSelectedEvent&&rSelectedEvent.name)||'開催',eventDate=b.evDate||(rSelectedEvent&&rSelectedEvent.date)||todayStr(),eventTime=b.evTime||(rSelectedEvent&&rSelectedEvent.time)||'';
  var rows=people.map(function(p){
    var bib=rBibStyle(p.bibColor);
    return '<div class="r-person"><div class="r-person-name">'+esc(p.name||'（氏名なし）')+'</div><div class="r-person-meta"><span class="r-bib-chip" style="color:'+bib.text+'"><i class="r-bib-dot" style="background:'+bib.swatch+'"></i>ビブス '+esc(bib.label)+'</span><strong class="r-fee">'+yen(p.fee)+'</strong></div></div>';
  }).join('');
  var note=String(b.note||'').trim();
  var total=b.total!=null?yen(b.total):yen(people.reduce(function(sum,p){return sum+(Number(p.fee)||0);},0));
  var html='<div class="r-card r-done-card">'+
    '<div class="r-success"><div class="r-success-title">'+(already?'受付済み':'受付完了')+'</div><div class="r-success-meta">'+esc(fmtDateLong(eventDate))+'<br>'+esc(eventTime)+'</div></div>'+
    '<div class="r-result-event">'+esc(eventTitle)+'</div>'+
    '<div class="r-people-list">'+(rows||'<div class="r-person-name">参加者情報なし</div>')+'</div>'+
    '<div class="r-total"><span>参加費合計</span><strong>'+total+'</strong></div>'+
    '<div class="r-note"><span class="r-note-label">備考</span>'+esc(note||'なし')+'</div>'+
    '<div class="r-after-qr"><div class="r-after-qr-copy"><strong class="r-after-qr-title">LINEショップカード</strong><span>QRコードをスキャンしてスタンプを貯めよう</span></div><img src="assets/line-shopcard-qr.png?v=1" alt="LINE公式アカウントのショップカードQRコード"></div>'+
    '<button class="r-btn r-btn-primary r-next" type="button" onclick="nextSelfReception()">次の方を受付</button></div>';
  document.getElementById('r-done').innerHTML=html;rShow('r-done');
  rDoneTimer=setTimeout(returnReceptionHome,30000);
}
function nextSelfReception(){rClearTimer();showReceptionEvents();}
