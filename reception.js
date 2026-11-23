// MORIFUT セルフ受付。公開状態でも予約番号の秘密コードが一致する予約だけを読み書きする。
var rEvents={},rSelectedEvent=null,rScanner=null,rHomeScanner=null,rPendingCode='',rCurrent=null,rLookupBusy=false,rDoneTimer=null,rScanGeneration=0;
var rScreens=['r-home','r-events','r-scan','r-confirm','r-done'];
function rShow(id){rScreens.forEach(function(k){var el=document.getElementById(k);if(el)el.classList.toggle('r-hidden',k!==id);});}
function rNotice(id,text,error){var el=document.getElementById(id);if(!el)return;el.innerHTML=text?'<div class="r-alert'+(error?' r-error':'')+'">'+esc(text)+'</div>':'';}
function rPeople(b){return Array.isArray(b.people)?b.people.filter(Boolean):Object.keys(b.people||{}).map(function(k){return b.people[k];}).filter(Boolean);}
function rClearTimer(){if(rDoneTimer){clearTimeout(rDoneTimer);rDoneTimer=null;}}
async function stopScanner(scannerRef){var scanner=scannerRef();if(!scanner)return;scannerRef(null);try{if(scanner.isScanning)await scanner.stop();}catch(e){}try{scanner.clear();}catch(e){}}
async function stopReceptionScanner(){rScanGeneration++;await stopScanner(function(v){if(arguments.length)rScanner=v;return rScanner;});}
async function stopHomeScanner(){await stopScanner(function(v){if(arguments.length)rHomeScanner=v;return rHomeScanner;});}
async function returnReceptionHome(){
  rClearTimer();await stopReceptionScanner();await stopHomeScanner();rSelectedEvent=null;rCurrent=null;rPendingCode='';
  document.getElementById('r-code').value='';document.getElementById('r-scan-message').innerHTML='';rShow('r-home');
}
async function showReceptionEvents(){
  rClearTimer();if(rHomeScanner)await stopHomeScanner();if(rScanner)await stopReceptionScanner();rSelectedEvent=null;rCurrent=null;
  rShow('r-events');rNotice('r-events-message','開催日を読み込んでいます…');document.getElementById('r-event-list').innerHTML='';
  try{var snap=await db.ref('events').once('value');rEvents=snap.val()||{};rRenderEvents();}
  catch(e){console.error(e);rNotice('r-events-message','開催日を読み込めませんでした。通信状態を確認して、もう一度お試しください。',true);}
}
function rRenderEvents(){
  var today=todayStr();
  var list=Object.keys(rEvents).map(function(id){return Object.assign({},rEvents[id]||{},{id:id});}).filter(function(ev){return ev.date&&ev.date>=today;}).sort(function(a,b){return (a.date||'').localeCompare(b.date||'')||(a.time||'').localeCompare(b.time||'');});
  var box=document.getElementById('r-event-list');
  if(!list.length){rNotice('r-events-message','受付できる日程はありません。スタッフにご確認ください。');box.innerHTML='';return;}
  rNotice('r-events-message','');
  box.innerHTML=list.map(function(ev){return '<button class="r-event-button" type="button" data-event-id="'+esc(ev.id)+'"><span class="r-event-date">'+fmtDateLong(ev.date)+'</span><span class="r-event-name">'+esc(ev.name||'開催')+'</span><span class="r-event-meta">'+esc(ev.time||'')+(ev.venue?'　|　'+esc(ev.venue):'')+'</span>'+(ev.closed?'<span class="r-event-closed">Web予約受付終了</span>':'')+'</button>';}).join('');
  box.querySelectorAll('[data-event-id]').forEach(function(btn){btn.addEventListener('click',function(){selectReceptionEvent(btn.dataset.eventId);});});
}
async function selectReceptionEvent(id){
  var ev=rEvents[id];if(!ev)return;
  await stopHomeScanner();
  rSelectedEvent=Object.assign({},ev,{id:id});rCurrent=null;rClearTimer();
  document.getElementById('r-code').value='';document.getElementById('r-scan-message').innerHTML='';
  document.getElementById('r-selected-event').textContent=(ev.name||'開催')+'　'+fmtDateLong(ev.date)+' '+(ev.time||'');
  document.getElementById('r-camera-status').textContent='カメラを準備しています…';
  document.getElementById('r-camera-retry').classList.add('r-hidden');
  rShow('r-scan');
  startReceptionScanner();
}
function rQrConfig(){return{fps:10,qrbox:function(w,h){var side=Math.max(150,Math.floor(Math.min(w,h)*.72));side=Math.min(side,360);return{width:side,height:side};},aspectRatio:1.0,disableFlip:false};}
async function startHomeScanner(){
  if(rHomeScanner)await stopHomeScanner();
  var status=document.getElementById('r-home-camera-status');
  if(rPendingCode){status.textContent='QRを読み取り済みです。「受付する」から日程を選んでください。';return;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent='カメラに対応していません。日程選択後に予約番号を入力できます。';return;}
  if(typeof Html5Qrcode==='undefined'){status.textContent='QR読取を読み込めません。日程選択後に予約番号を入力できます。';return;}
  var scanner=new Html5Qrcode('qr-reader-home');rHomeScanner=scanner;status.textContent='カメラを起動しています…';
  try{
    await scanner.start({facingMode:{exact:'user'}},rQrConfig(),function(text){if(rPendingCode)return;rPendingCode=text;status.textContent='QRを読み取りました。日程を選択してください。';stopHomeScanner();},function(){});
    if(rHomeScanner===scanner)status.textContent='前面カメラで読み取り中です。QRコードをかざすか、日程を選択してください。';
  }catch(e){console.warn('Front camera start failed',e);if(rHomeScanner===scanner)rHomeScanner=null;try{scanner.clear();}catch(ignore){}status.textContent='内カメラを起動できません。ブラウザーのカメラ許可を確認してください。予約番号は日程選択後に入力できます。';}
}
async function startReceptionScanner(){
  await stopReceptionScanner();
  var generation=rScanGeneration;
  var status=document.getElementById('r-camera-status'),retry=document.getElementById('r-camera-retry');
  retry.classList.add('r-hidden');
  if(!rSelectedEvent){status.textContent='先に日程を選択してください。';return;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent='このブラウザーではカメラを利用できません。予約番号を入力してください。';retry.classList.remove('r-hidden');return;}
  if(typeof Html5Qrcode==='undefined'){status.textContent='QR読取を読み込めません。予約番号を入力してください。';retry.classList.remove('r-hidden');return;}
  var root=document.getElementById('qr-reader');root.innerHTML='';
  var scanner=new Html5Qrcode('qr-reader');rScanner=scanner;status.textContent='カメラを起動しています…';
  try{
    await scanner.start({facingMode:{exact:'user'}},rQrConfig(),function(text){if(generation!==rScanGeneration||rLookupBusy)return;handleReceptionCode(text);},function(){});
    if(generation===rScanGeneration&&rScanner===scanner){status.textContent='読み取り中 — QRコードをカメラにかざしてください。';retry.classList.add('r-hidden');}
  }catch(e){console.error('Camera start failed',e);if(rScanner===scanner)rScanner=null;try{scanner.clear();}catch(ignore){}status.textContent='カメラを起動できません。ブラウザーのカメラ許可を確認するか、予約番号を入力してください。';retry.classList.remove('r-hidden');}
}
function lookupReservationCodeByInput(){handleReceptionCode(document.getElementById('r-code').value);}
function handleReceptionCode(raw){
  if(rLookupBusy)return;
  rLookupBusy=true;rNotice('r-scan-message','予約を確認しています…');
  stopReceptionScanner().then(function(){return rLookupReservation(raw);}).catch(function(e){console.error(e);rNotice('r-scan-message','予約を確認できませんでした。入力と通信状態をご確認ください。',true);}).finally(function(){rLookupBusy=false;});
}
async function rLookupReservation(raw){
  rNotice('r-scan-message','');
  if(!rSelectedEvent){rNotice('r-scan-message','先に開催日を選択してください。',true);return;}
  var id=parseResvNo(raw);
  if(!id||id.pub.length!==4||id.sec.length!==8){rNotice('r-scan-message','予約番号を確認してください。例：MF-ABCD-1234WXYZ',true);document.getElementById('r-camera-status').textContent='予約番号を入力するか、カメラを再起動してください。';document.getElementById('r-camera-retry').classList.remove('r-hidden');return;}
  try{
    var snap=await db.ref('bookings/'+id.pub+'/'+id.sec).once('value'),b=snap.val();
    if(!b||typeof b!=='object'){rNotice('r-scan-message','予約が見つかりません。日程と予約番号をご確認ください。',true);document.getElementById('r-camera-status').textContent='続けてQRを読む場合はカメラを再起動してください。';document.getElementById('r-camera-retry').classList.remove('r-hidden');return;}
    if(b.evId!==rSelectedEvent.id){rNotice('r-scan-message','この予約は選択した日程と異なります。予約の日程を選び直してください。',true);document.getElementById('r-camera-status').textContent='予約の日程を確認してください。';document.getElementById('r-camera-retry').classList.remove('r-hidden');return;}
    rCurrent={pub:id.pub,sec:id.sec,booking:b};
    if(b.checkedIn)rRenderDone(b,true);else await confirmSelfReception();
  }catch(e){console.error(e);rNotice('r-scan-message','予約情報を取得できませんでした。通信状態をご確認ください。',true);document.getElementById('r-camera-status').textContent='続けてQRを読む場合はカメラを再起動してください。';document.getElementById('r-camera-retry').classList.remove('r-hidden');}
}
function rRenderConfirmation(b){
  var people=rPeople(b),evTitle=esc(b.evName||rSelectedEvent.name||'開催'),date=fmtDate(b.evDate||rSelectedEvent.date),time=esc(b.evTime||rSelectedEvent.time||'');
  var html='<div class="r-page-head"><div><p class="r-kicker">STEP 3</p><h1 class="r-title">予約内容を確認</h1></div><button class="r-btn r-btn-secondary" type="button" onclick="showReceptionEvents()">日程選択へ</button></div>'+
    '<div class="r-card"><p class="r-sub">'+evTitle+'　'+date+' '+time+'</p>'+people.map(function(p){return '<div class="r-person"><span class="r-name">'+esc(p.name||'（氏名なし）')+'</span><span class="r-fee">参加費 '+yen(p.fee)+'</span></div>';}).join('')+
    '<div class="r-total">合計 '+yen(b.total)+'</div>'+(people.length>1?'<div class="r-warning">この予約は'+people.length+'名分をまとめて受付します。全員が到着していることを確認してください。</div>':'')+
    '<button id="r-confirm-btn" class="r-btn r-btn-primary" style="width:100%;min-height:72px;font-size:22px;" type="button" onclick="confirmSelfReception()">受付を確定する</button><div id="r-confirm-message" aria-live="polite"></div><p class="r-status-note">確定後はこの予約をもう一度受付できません。</p></div>';
  document.getElementById('r-confirm').innerHTML=html;rShow('r-confirm');
}
async function confirmSelfReception(){
  if(!rCurrent||!rCurrent.booking)return;
  var btn=document.getElementById('r-confirm-btn');if(btn){btn.disabled=true;btn.textContent='受付を記録しています…';}
  var path='bookings/'+rCurrent.pub+'/'+rCurrent.sec;
  try{
    await db.ref(path).update({checkedIn:true,checkedInAt:firebase.database.ServerValue.TIMESTAMP,checkedInBy:'self-service'});
    var b=(await db.ref(path).once('value')).val();
    if(!b||!b.checkedIn)throw new Error('check-in state was not confirmed');
    rCurrent.booking=b;rRenderDone(b,false);
  }catch(e){
    console.error(e);
    try{var latest=(await db.ref(path).once('value')).val();if(latest&&latest.checkedIn){rCurrent.booking=latest;rRenderDone(latest,true);return;}}catch(ignore){}
    if(btn){btn.disabled=false;btn.textContent='受付を確定する';}
    var message='受付を記録できませんでした。通信状態を確認して、もう一度QRを読み取ってください。';
    var box=document.getElementById('r-confirm-message');
    if(box)box.innerHTML='<div class="r-alert r-error">'+esc(message)+'</div>';
    else{rNotice('r-scan-message',message,true);document.getElementById('r-camera-status').textContent='受付記録に失敗しました。再試行するか、予約番号を入力してください。';document.getElementById('r-camera-retry').classList.remove('r-hidden');}
  }
}
function rRenderDone(b,already){
  stopReceptionScanner();rClearTimer();var people=rPeople(b),at=Number(b.checkedInAt),when=Number.isFinite(at)&&at>0?new Date(at).toLocaleString('ja-JP'):'';
  var html='<div class="r-card"><div class="r-success"><div class="r-success-mark">✓</div><div class="r-success-title">'+(already?'受付済みです':'受付完了')+'</div><div style="margin-top:7px;font-size:14px;">'+(when?esc(when)+' に記録':'受付状態を確認しました')+'</div></div>'+
    '<div style="background:#eef4fb;border:1px solid #c8d7e7;border-left:5px solid #315f91;border-radius:12px;padding:14px 16px;margin:0 0 18px;line-height:1.8;color:#132238;"><div style="font-size:18px;font-weight:900;color:#0b2442;margin-bottom:5px;">ご参加ありがとうございます！</div><div>参加費は運営スタッフにお支払いください。<br>人数が集まり次第始めます！<br>ボールは自由に使って大丈夫です！</div></div>'+
    '<h1 class="r-title">参加費をご確認ください</h1><p class="r-sub">'+esc(b.evName||'')+'　'+fmtDate(b.evDate||'')+' '+esc(b.evTime||'')+'</p>'+people.map(function(p){return '<div class="r-person"><span class="r-name">'+esc(p.name||'（氏名なし）')+'</span><span class="r-fee">'+yen(p.fee)+'</span></div>';}).join('')+
    '<div class="r-total">参加費合計 '+yen(b.total)+'</div><p class="r-status-note">この画面は10秒後に自動で受付トップへ戻ります。</p><button class="r-btn r-btn-primary" style="width:100%;min-height:68px;" type="button" onclick="nextSelfReception()">次の方の受付へ</button></div>';
  document.getElementById('r-done').innerHTML=html;rShow('r-done');
  rDoneTimer=setTimeout(returnReceptionHome,10000);
}
function nextSelfReception(){rClearTimer();showReceptionEvents();}
