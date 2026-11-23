// MORIFUT 受付専用ページ。予約情報の表示・受付確定は運営アカウントに限定。
var rAuth=firebase.auth(),rEvents={},rBookings={},rScanner=null,rCurrent=null,rListeners=[];
function rShow(id){['r-login','r-denied','r-welcome','r-tools','r-done'].forEach(function(k){document.getElementById(k).classList.toggle('r-hidden',k!==id);});}
function receptionLogin(){
  var p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({login_hint:ADMIN_EMAIL});
  rAuth.signInWithPopup(p).catch(function(e){var m=document.getElementById('r-login-msg');m.textContent=e.code==='auth/popup-blocked'?'ポップアップがブロックされています。Safariで開き直して許可してください。':'ログインできませんでした。運営アカウントを確認してください。';m.classList.remove('r-hidden');});
}
function receptionLogout(){rAuth.signOut();}
function rAdmin(u){return !!u&&(u.email||'').toLowerCase()===ADMIN_EMAIL&&u.emailVerified;}
rAuth.onAuthStateChanged(function(u){
  rListeners.forEach(function(f){f();});rListeners=[];
  if(!u){rShow('r-login');return;}
  if(!rAdmin(u)){document.getElementById('r-denied-msg').textContent=(u.email||'このアカウント')+' は受付権限がありません。運営アカウント '+ADMIN_EMAIL+' でログインしてください。';rShow('r-denied');return;}
  rShow('r-welcome');
  var er=db.ref('events'),br=db.ref('bookings');
  var efn=er.on('value',function(s){rEvents=s.val()||{};rRenderEvents();},function(){rMessage('開催情報を取得できません。Firebaseのルールを確認してください。',true);});
  var bfn=br.on('value',function(s){rBookings=s.val()||{};if(rCurrent){var b=rBookings[rCurrent.pub]&&rBookings[rCurrent.pub][rCurrent.sec];if(b){rCurrent.booking=b;if(b.checkedIn)rRenderDone(b);else rRenderBooking(b);}}},function(){rMessage('予約情報を取得できません。Firebaseのルールを確認してください。',true);});
  rListeners.push(function(){er.off('value',efn);},function(){br.off('value',bfn);});
});
function rMessage(text,error){var el=document.getElementById('r-message');if(!el)return;el.innerHTML=text?'<div class="'+(error?'r-alert':'r-foot')+'">'+esc(text)+'</div>':'';}
function rRenderEvents(){
  var sel=document.getElementById('r-event');if(!sel)return;var old=sel.value;
  var items=Object.keys(rEvents).map(function(k){return Object.assign({id:k},rEvents[k]);}).filter(Boolean).sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
  sel.innerHTML='<option value="">すべての開催</option>'+items.map(function(e){return '<option value="'+esc(e.id)+'">'+fmtDate(e.date)+' '+esc(e.name||'')+'</option>';}).join('');
  if(old&&rEvents[old])sel.value=old;
}
function openReception(){rShow('r-tools');showMode('code');document.getElementById('r-code').focus();}
function showMode(mode){
  stopReceptionScanner();['qr','code','name'].forEach(function(k){document.getElementById('r-mode-'+k).classList.toggle('r-hidden',k!==mode);});
  clearReceptionResult();
  if(mode==='code')document.getElementById('r-code').focus();
  if(mode==='name')document.getElementById('r-name').focus();
}
function clearReceptionResult(){rCurrent=null;document.getElementById('r-message').innerHTML='';document.getElementById('r-result').innerHTML='';document.getElementById('r-done').innerHTML='';document.getElementById('r-done').classList.add('r-hidden');}
function lookupReservationCode(){
  document.getElementById('r-result').innerHTML='';document.getElementById('r-message').innerHTML='';
  var id=parseResvNo(document.getElementById('r-code').value);
  if(!id){rMessage('予約番号を確認してください。例：MF-ABCD-1234WXYZ',true);return;}
  var b=rBookings[id.pub]&&rBookings[id.pub][id.sec];
  if(!b){rMessage('予約が見つかりません。開催・入力内容をご確認ください。',true);return;}
  rSelectBooking(id.pub,id.sec);
}
function lookupReservationName(){
  document.getElementById('r-result').innerHTML='';document.getElementById('r-message').innerHTML='';
  var query=String(document.getElementById('r-name').value||'').trim().toLowerCase();
  if(!query){rMessage('参加者名を入力してください。',true);return;}
  var selected=document.getElementById('r-event').value,matches=[];
  Object.keys(rBookings).forEach(function(pub){Object.keys(rBookings[pub]||{}).forEach(function(sec){
    var b=rBookings[pub][sec];if(!b||typeof b!=='object'||(selected&&b.evId!==selected))return;
    var people=Array.isArray(b.people)?b.people.filter(Boolean):Object.keys(b.people||{}).map(function(k){return b.people[k];}).filter(Boolean);
    var found=people.filter(function(p){return String(p.name||'').trim().toLowerCase().indexOf(query)>=0;});
    if(found.length)matches.push({pub:pub,sec:sec,b:b,found:found});
  });});
  matches.sort(function(a,b){return (a.b.evDate||'').localeCompare(b.b.evDate||'')||(a.b.createdAt||0)-(b.b.createdAt||0);});
  if(!matches.length){rMessage('一致する予約が見つかりません。開催を変えるか、漢字・かなの表記をご確認ください。',true);return;}
  document.getElementById('r-message').innerHTML='<div class="r-alert">候補 '+matches.length+' 件。該当する予約を選んでください。</div>';
  document.getElementById('r-result').innerHTML=matches.slice(0,40).map(function(x){
    var names=x.found.map(function(p){return esc(p.name||'');}).join('、');
    return '<button class="r-candidate" type="button" data-pub="'+esc(x.pub)+'" data-sec="'+esc(x.sec)+'"><strong>'+names+' — '+yen(x.b.total)+'</strong><span>'+fmtDate(x.b.evDate)+' '+esc(x.b.evTime||'')+' / '+esc(x.b.evName||'')+' / '+Number(x.b.cnt||x.found.length)+'名'+(x.b.checkedIn?' / 受付済み':'')+'</span></button>';
  }).join('')+(matches.length>40?'<p class="r-foot">候補が40件を超えています。開催を選択して絞り込んでください。</p>':'');
  document.querySelectorAll('#r-result .r-candidate').forEach(function(btn){btn.addEventListener('click',function(){rSelectBooking(btn.dataset.pub,btn.dataset.sec);});});
}
function rSelectBooking(pub,sec){
  var b=rBookings[pub]&&rBookings[pub][sec];if(!b){rMessage('予約が見つかりません。',true);return;}
  var selected=document.getElementById('r-event').value;if(selected&&b.evId!==selected){rMessage('選択した開催と予約の開催が異なります。開催を変更してから検索してください。',true);return;}
  rCurrent={pub:pub,sec:sec,booking:b};document.getElementById('r-message').innerHTML='';document.getElementById('r-result').innerHTML='';
  if(b.checkedIn)rRenderDone(b);else{rShow('r-tools');rRenderBooking(b);}
}
function rPeople(b){return Array.isArray(b.people)?b.people.filter(Boolean):Object.keys(b.people||{}).map(function(k){return b.people[k];}).filter(Boolean);}
function rRenderBooking(b){
  if(!rCurrent)return;var people=rPeople(b);
  document.getElementById('r-result').innerHTML='<div class="r-card"><h2 class="r-title">予約内容の確認</h2><p class="r-sub">'+esc(b.evName||'')+'　'+fmtDate(b.evDate)+' '+esc(b.evTime||'')+'</p>'+people.map(function(p){return '<div class="r-person"><span class="r-name">'+esc(p.name||'（氏名なし）')+'</span><span class="r-fee">参加費 '+yen(p.fee)+'</span></div>';}).join('')+'<div class="r-total">合計 '+yen(b.total)+'</div><button class="r-btn r-btn-primary" style="width:100%;" type="button" onclick="confirmReception()">この予約の'+people.length+'名を受付する</button><p class="r-foot">受付を確定すると運営画面の予約一覧にも「受付済み」と表示されます。</p></div>';
}
async function confirmReception(){
  if(!rCurrent)return;var user=rAuth.currentUser;if(!rAdmin(user)){rMessage('運営アカウントでログインしてください。',true);return;}
  var pub=rCurrent.pub,sec=rCurrent.sec;
  try{
    var tx=await db.ref('bookings/'+pub+'/'+sec).transaction(function(old){
      if(!old||old.checkedIn)return;
      return Object.assign({},old,{checkedIn:true,checkedInAt:firebase.database.ServerValue.TIMESTAMP,checkedInBy:user.email});
    });
    var b=tx.snapshot&&tx.snapshot.val();
    if(!b){rMessage('予約を取得できませんでした。もう一度検索してください。',true);return;}
    rCurrent.booking=b;
    if(!tx.committed&&!b.checkedIn){rMessage('受付を保存できませんでした。Firebaseのルールを確認してください。',true);return;}
    rRenderDone(b);
  }catch(e){console.error(e);rMessage('受付を保存できませんでした。通信状態とFirebaseルールをご確認ください。',true);}
}
function rRenderDone(b){
  if(!rCurrent)return;stopReceptionScanner();var people=rPeople(b),at=Number(b.checkedInAt),when=Number.isFinite(at)&&at>0?new Date(at).toLocaleString('ja-JP'):'';
  document.getElementById('r-tools').classList.add('r-hidden');var done=document.getElementById('r-done');done.classList.remove('r-hidden');
  done.innerHTML='<div class="r-success"><div class="r-success-mark">✓</div><div class="r-success-title">受付完了</div><div style="margin-top:7px;font-size:14px;">'+(when?esc(when)+' に受付済み':(b.checkedIn?'すでに受付済みです':'受付を記録しました'))+'</div></div><h1 class="r-title">参加費をご確認ください</h1><p class="r-sub">'+esc(b.evName||'')+'　'+fmtDate(b.evDate)+' '+esc(b.evTime||'')+'</p>'+people.map(function(p){return '<div class="r-person"><span class="r-name">'+esc(p.name||'（氏名なし）')+'</span><span class="r-fee">'+yen(p.fee)+'</span></div>';}).join('')+'<div class="r-total">参加費合計 '+yen(b.total)+'</div><button class="r-btn r-btn-primary" style="width:100%;" type="button" onclick="nextReception()">次の方を受付</button>';
}
function nextReception(){stopReceptionScanner();rCurrent=null;document.getElementById('r-code').value='';document.getElementById('r-name').value='';document.getElementById('r-result').innerHTML='';document.getElementById('r-message').innerHTML='';document.getElementById('r-done').innerHTML='';document.getElementById('r-done').classList.add('r-hidden');rShow('r-welcome');}
function startReceptionScanner(){
  if(typeof Html5QrcodeScanner==='undefined'){rMessage('QR読取を読み込めません。予約番号か名前で検索してください。',true);return;}
  stopReceptionScanner();var root=document.getElementById('qr-reader');root.innerHTML='';
  rScanner=new Html5QrcodeScanner('qr-reader',{fps:10,qrbox:{width:260,height:260}},false);
  rScanner.render(function(text){document.getElementById('r-code').value=text;stopReceptionScanner();lookupReservationCode();},function(){});
}
function stopReceptionScanner(){if(rScanner){var scanner=rScanner;rScanner=null;try{var p=scanner.clear();if(p&&p.catch)p.catch(function(){});}catch(e){}}}
