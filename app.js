// =============================================================
// MORIFUT 公開ページ（index.html）の動作
// =============================================================
var events={},seats={},settings=Object.assign({},DEFAULT_SETTINGS),gallery=[];
var loaded={events:false,seats:false};
var curEvId=null,pCnt=1,pData=[],lastResvNo='',galShowAll=false,lbList=[],lbIdx=0,cupEntryType='individual',cupWaitlistMode=false;
var submitting=false;

function renderMailHelp(){
  const help=document.getElementById('bk-email-help');
  if(!help)return;
  help.textContent=safeUrl(settings.gasUrl)
    ?'メール通知用URLは設定されています。予約後に送信処理を依頼しますが、実際の到着は送信権限や通信状況により異なります。予約番号も必ず保存してください。'
    :'メール通知URLが未設定のため、現在はメールアドレスを入力しても確認メールは届きません。予約番号は画面に表示されるため、必ず保存してください。運営からの連絡をLINEやInstagramで受け取りたい方は、IDを入力してください。';
}

// ===== PAGE =====
function navToPage(id){
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('on');});
  document.getElementById(id).classList.add('on');
  window.scrollTo({top:0,behavior:'instant'});
}
function goHome(){navToPage('home');renderHomeGrid();}
function navTo(secId){
  if(!document.getElementById('home').classList.contains('on')){navToPage('home');renderHomeGrid();}
  setTimeout(function(){const el=document.getElementById(secId);if(el&&el.style.display!=='none')el.scrollIntoView({behavior:'smooth',block:'start'});},100);
}

// ===== イベント =====
function evList(){return objToList(events);}
function visibleEvents(){
  const t=todayStr();
  return evList().filter(function(e){return e.date>=t;})
    .sort(function(a,b){return (a.date+a.time).localeCompare(b.date+b.time);});
}
function findEv(id){return events[id]?Object.assign({id:id},events[id]):null;}
function isCupEvent(ev){return ev&&typeof ev.isCup==='boolean'?ev.isCup:String(ev&&ev.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'').includes('MORIFUTCUP');}
function cupTeamCount(ev){const seatMap=seats[ev&&ev.id]||{},groupCount=Object.keys(seatMap).filter(function(pub){return Number(seatMap[pub])>=2;}).length,soloPubs=Object.keys(seatMap).filter(function(pub){return Number(seatMap[pub])===1;}),individualPubs=Array.isArray(ev&&ev.cupIndividualTeamPubs)?ev.cupIndividualTeamPubs:[],hasIndividualTeam=soloPubs.length>=3||individualPubs.some(function(pub){return Number(seatMap[pub])===1;});return groupCount+(hasIndividualTeam?1:0);}
function cupTeamSlotsUsed(ev,seatMap){seatMap=seatMap||seats[ev&&ev.id]||{};const pubs=Object.keys(seatMap),teamCount=pubs.filter(function(pub){return Number(seatMap[pub])>=2;}).length,hasIndividualEntry=pubs.some(function(pub){return Number(seatMap[pub])===1;});return teamCount+(hasIndividualEntry?1:0);}
function cupTeamLimits(ev){const min=Math.max(1,Number(ev&&ev.cupMinPlayers)||1),max=Math.max(min,Number(ev&&ev.cupMaxPlayers)||10);return{min:min,max:max};}
function cupTeamCountLabel(ev){if(!isCupEvent(ev))return '';const n=cupTeamCount(ev),max=Number(ev.cupMaxTeams)||0,limits=cupTeamLimits(ev);return '<div class="cup-team-count"><span>参加チーム</span><b>'+n+(max?' / '+max:'')+'チーム</b><small>募集条件：1チーム '+limits.min+'〜'+limits.max+'名。チーム予約は1予約＝1チーム、個人参加は3名以上で自動的に1チームとして表示</small></div>';}
function evState(ev){
  const p=seatCount(seats,ev);
  if(isCupEvent(ev))return{cap:0,p:p,rem:0,ratio:0,full:false,closed:!!ev.closed};
  const cap=getCap(ev),rem=Math.max(0,cap-p),ratio=p/cap;
  return{cap:cap,p:p,rem:rem,ratio:ratio,full:p>=cap,closed:!!ev.closed};
}
function priceChips(ev){
  const pr=evPricing(ev,settings);
  if(isCupEvent(ev)&&pr.flatOn)return '<div class="ev-price-row"><span class="ev-price-chip">大会参加費 一律 <b>'+yen(pr.flat)+'</b> /人</span></div>';
  let h='<div class="ev-price-row"><span class="ev-price-chip">一般 <b>'+yen(pr.adult)+'</b></span><span class="ev-price-chip">学生 <b>'+yen(pr.student)+'</b></span>';
  if(pr.discOn&&pr.discAmt>0)h+='<span class="ev-disc-chip">'+pr.discMin+'名以上で'+pr.discAmt.toLocaleString()+'円OFF</span>';
  return h+'</div>';
}
function evCardHTML(ev){
  const cup=isCupEvent(ev),s=evState(ev);
  const fc=cup?'ok':s.rem<=3?'full':s.ratio>=.8?'warn':'ok';
  const rt=s.closed?'受付終了':cup?'チーム募集中':s.full?'満員':'残り'+s.rem+'枠';
  const canBook=!s.closed&&!s.full;
  const id=esc(ev.id);
  return '<div class="ev-card'+(cup?' ev-card-cup':'')+'" onclick="openDetail(\''+id+'\')">'+
    '<div class="ev-card-top"><span class="ev-sport-label">'+tLabel(ev.type)+'</span><span class="ev-date-pill">'+fmtDate(ev.date)+'</span></div>'+
    '<div class="ev-body">'+
      '<div class="ev-name">'+(cup?'<span class="ev-cup-badge">大会</span>':'')+esc(ev.name)+'</div>'+
      '<div class="ev-metas">'+
        '<div class="ev-meta"><div class="ev-meta-ico">🕐</div><span>'+esc(ev.time)+'</span></div>'+
        '<div class="ev-meta"><div class="ev-meta-ico">📍</div><span>'+esc(ev.venue)+'</span></div>'+
      '</div>'+
      (cup&&ev.cupPhoto?'<img class="cup-card-photo" src="'+esc(ev.cupPhoto)+'" alt="大会画像" loading="lazy">':(!cup&&ev.venuePhoto&&String(ev.venuePhoto).indexOf('data:image/')===0?'<img class="event-card-photo" src="'+esc(ev.venuePhoto)+'" alt="'+esc(ev.venue)+'の会場写真" loading="lazy">':''))+
      priceChips(ev)+cupTeamCountLabel(ev)+
      (cup?'':'<div class="cap-area"><div class="cap-top"><span>参加者数</span><strong>'+s.p+' / '+s.cap+'名</strong></div>'+
      '<div class="cap-track"><div class="cap-fill '+fc+'" style="width:'+Math.min(s.ratio*100,100)+'%"></div></div></div>')+
    '</div>'+
    '<div class="ev-foot"><span class="rem-txt '+(s.closed?'full':fc)+'">'+rt+'</span>'+
      '<div class="ev-foot-btns"><button class="ev-detail-btn" onclick="event.stopPropagation();openDetail(\''+id+'\')">詳細</button>'+
      (canBook?'<button class="ev-book-btn" onclick="event.stopPropagation();openBkForm(\''+id+'\')">予約する</button>':'')+
    '</div></div></div>';
}
function emptyHTML(){
  if(!loaded.events)return '<div class="ev-empty">イベント情報を読み込んでいます…</div>';
  return '<div class="ev-empty">現在、予約受付中のイベントはありません。<br>次回の開催はLINEやInstagramでお知らせします。</div>';
}
function renderHomeGrid(){
  const g=document.getElementById('home-ev-grid');if(!g)return;
  const l=visibleEvents().slice(0,4);
  g.innerHTML=l.length?l.map(evCardHTML).join(''):emptyHTML();
  renderHomeCalendar();
}
function renderHomeCalendar(){
  const box=document.getElementById('home-ev-cal');if(!box)return;
  if(!loaded.events){box.innerHTML='<div class="ev-empty">開催情報を読み込んでいます…</div>';return;}
  if(!calYM){const f=visibleEvents()[0];calYM=(f?f.date:todayStr()).slice(0,7);}
  renderCalendar('home-ev-cal');
}
function renderEvList(){
  const g=document.getElementById('ev-list-grid');if(!g)return;
  if(calMode){renderCalendar();return;}
  const l=visibleEvents();
  g.innerHTML=l.length?l.map(evCardHTML).join(''):emptyHTML();
}

// ===== カレンダー =====
var calMode=false,calYM=null,calSel=null;
function setView(mode){
  calMode=mode==='cal';
  document.getElementById('vt-list').classList.toggle('on',!calMode);
  document.getElementById('vt-cal').classList.toggle('on',calMode);
  document.getElementById('ev-list-grid').style.display=calMode?'none':'';
  document.getElementById('ev-cal').style.display=calMode?'block':'none';
  if(calMode&&!calYM){const f=visibleEvents()[0];calYM=(f?f.date:todayStr()).slice(0,7);}
  renderEvList();
}
function ymAdd(ym,n){const y=+ym.slice(0,4),m=+ym.slice(5,7)-1+n;const d=new Date(y,m,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function calMove(n,targetId){calYM=ymAdd(calYM,n);calSel=null;renderCalendar(targetId);}
function calPick(ds,targetId){calSel=calSel===ds?null:ds;renderCalendar(targetId);if(calSel){const box=document.getElementById(targetId==='home-ev-cal'?'home-ev-cal':'ev-cal'),el=box&&box.querySelector('#cal-day');if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});}}
function renderCalendar(targetId){
  const target=targetId==='home-ev-cal'?'home-ev-cal':'ev-cal';
  const box=document.getElementById(target);if(!box)return;
  if(!calYM)calYM=todayStr().slice(0,7);
  const t=todayStr(),y=+calYM.slice(0,4),m=+calYM.slice(5,7)-1;
  const byDay={};visibleEvents().forEach(function(e){(byDay[e.date]=byDay[e.date]||[]).push(e);});
  const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
  const last=new Date(y,m+1,0),weeks=Math.ceil((first.getDay()+last.getDate())/7);
  const wd=['日','月','火','水','木','金','土'];
  let h='<div class="cal"><div class="cal-hd"><button class="cal-nav" onclick="calMove(-1,\''+target+'\')" '+(calYM<=t.slice(0,7)?'disabled':'')+' aria-label="前の月">‹</button><h3>'+y+'年 '+(m+1)+'月</h3><button class="cal-nav" onclick="calMove(1,\''+target+'\')" aria-label="次の月">›</button></div><div class="cal-grid">';
  h+=wd.map(function(w,i){return '<div class="cal-wd'+(i===0?' sun':i===6?' sat':'')+'">'+w+'</div>';}).join('');
  for(let i=0;i<weeks*7;i++){
    const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    const ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const out=d.getMonth()!==m,evs=out?[]:(byDay[ds]||[]);
    const cls='cal-cell'+(out?' out':'')+(ds<t?' past':'')+(evs.length?' has':'')+(calSel===ds?' sel':'');
    h+='<div class="'+cls+'"'+(evs.length?' onclick="calPick(\''+ds+'\',\''+target+'\')"':'')+'><span class="cal-d'+(ds===t?' today':d.getDay()===0?' sun':d.getDay()===6?' sat':'')+'">'+d.getDate()+'</span>';
    evs.slice(0,2).forEach(function(e){
      const st=evState(e),tm=String(e.time||'').split(/[〜~\-－ー]/)[0].trim();
      h+='<button class="cal-ev '+(e.type==='soccer'?'soccer':'')+(st.full||st.closed?' full':'')+(isCupEvent(e)?' cup':'')+'" onclick="event.stopPropagation();openDetail(\''+esc(e.id)+'\')" title="'+esc(e.name)+'"><span class="t">'+esc(tm)+'</span><span class="n">'+esc(e.name)+'</span></button>';
    });
    if(evs.length>2)h+='<div class="cal-more">+'+(evs.length-2)+'件</div>';
    h+='</div>';
  }
  h+='</div><div class="cal-legend"><span><i style="background:var(--mid)"></i>フットサル</span><span><i style="background:#0f766e"></i>サッカー</span><span><i style="background:#f59e0b"></i>MORIFUT CUP</span><span><i style="background:var(--bg2);border:1px solid var(--border2)"></i>満員・受付終了</span></div></div>';
  if(calSel&&byDay[calSel])h+='<div id="cal-day"><div class="cal-day-ttl">'+fmtDateLong(calSel)+'の開催</div><div class="ev-grid">'+byDay[calSel].map(evCardHTML).join('')+'</div></div>';
  else if(!visibleEvents().length)h+='<div class="ev-grid" style="margin-top:16px;">'+emptyHTML()+'</div>';
  else h+='<p style="font-size:12px;color:var(--text3);margin-top:12px;text-align:center;">開催日をタップすると、その日のイベントが表示されます</p>';
  box.innerHTML=h;
}

// ===== 開催詳細 =====
function openDetail(id){
  const ev=findEv(id);
  if(!ev){toast('イベントが見つかりませんでした',true);return;}
  curEvId=id;
  const s=evState(ev),pr=evPricing(ev,settings),cup=isCupEvent(ev),limits=cupTeamLimits(ev);
  document.getElementById('dt-pill').textContent=ev.type==='soccer'?'SOCCER':'FUTSAL';
  document.getElementById('dt-title').textContent=ev.name;
  document.getElementById('dt-meta').textContent=fmtDateLong(ev.date)+'  '+ev.time;
  const map=safeUrl(ev.mapUrl)||('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(ev.venue||''));
  let discTxt='この開催はグループ割引の対象外です';
  if(pr.discOn&&pr.discAmt>0)discTxt=pr.discMin+'名以上の同時予約で、合計から'+pr.discAmt.toLocaleString()+'円OFF';
  const btn=s.closed?'<button class="btn-p" disabled style="opacity:.5;cursor:not-allowed;">受付は終了しました</button>':
    s.full?'<button class="btn-p" disabled style="opacity:.5;cursor:not-allowed;">満員のため受付を終了しました</button>':
    '<button class="btn-p" onclick="openBkForm(\''+esc(id)+'\')">'+(cup?'この大会にエントリーする':'この日程で予約する（残り'+s.rem+'枠）')+'</button>';
  document.getElementById('dt-body').innerHTML=
    '<div class="dt-card"><div class="dt-ttl">開催情報</div>'+
      '<div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDateLong(ev.date)+'<br>'+esc(ev.time)+'</span></div>'+
      '<div class="cf-row"><span class="cf-k">会場</span><span class="cf-v">'+esc(ev.venue)+'<br><a class="dt-map" href="'+esc(map)+'" target="_blank" rel="noopener">地図を開く</a></span></div>'+
      '<div class="cf-row"><span class="cf-k">種目</span><span class="cf-v">'+tLabel(ev.type)+'</span></div>'+
      '<div class="cf-row"><span class="cf-k">'+(cup?'募集条件':'参加状況')+'</span><span class="cf-v">'+(cup?'1チーム '+limits.min+'〜'+limits.max+'名'+(Number(ev.cupMaxTeams)?' ／ 募集上限 '+Number(ev.cupMaxTeams)+'チーム':''):'<span'+(!s.closed&&!s.full&&s.rem<=3?' style="color:#dc2626;font-weight:800;"':'')+'>'+s.p+' / '+s.cap+'名'+(s.closed?'（受付終了）':s.full?'（満員）':'（残り'+s.rem+'枠）')+'</span>')+'</span></div>'+
    '</div>'+
    (isCupEvent(ev)?(ev.cupPhoto?'<div class="dt-card cup-detail-card"><img class="cup-detail-photo" src="'+esc(ev.cupPhoto)+'" alt="大会画像" loading="lazy"><div class="dt-ttl">大会情報</div><div class="dt-text">'+richText(ev.cupDetail||'')+'</div>'+cupTeamCountLabel(ev)+'</div>':'<div class="dt-card cup-detail-card"><div class="dt-ttl">大会情報</div><div class="dt-text">'+richText(ev.cupDetail||'大会の詳細は順次お知らせします。')+'</div>'+cupTeamCountLabel(ev)+'</div>'):'')+
    (ev.venuePhoto&&String(ev.venuePhoto).indexOf('data:image/')===0?'<div class="dt-card venue-photo-card"><div class="dt-ttl">開催場所の写真</div><img class="venue-photo-img" src="'+esc(ev.venuePhoto)+'" alt="'+esc(ev.venue)+'の会場写真" loading="lazy"></div>':'')+
    '<div class="dt-card"><div class="dt-ttl">参加費（この開催）</div>'+
      (cup&&pr.flatOn?'<div class="dt-price-grid"><div class="dt-price"><div class="dt-price-l">大会参加費（一律）</div><div class="dt-price-v">'+yen(pr.flat)+'</div><div class="dt-price-u">税込 / 1人</div></div></div>':'<div class="dt-price-grid">'+
        '<div class="dt-price"><div class="dt-price-l">大人（一般）</div><div class="dt-price-v">'+yen(pr.adult)+'</div><div class="dt-price-u">税込 / 1回</div></div>'+
        '<div class="dt-price"><div class="dt-price-l">学生</div><div class="dt-price-v">'+yen(pr.student)+'</div><div class="dt-price-u">税込 / 1回（学生証提示）</div></div>'+
      '</div>')+
      '<div class="discount-box" style="margin:12px 0 0;padding:14px 18px;'+(pr.discOn&&pr.discAmt>0?'':'background:var(--bg);border-color:var(--border);')+'"><div class="disc-icon" style="font-size:18px;">'+(pr.discOn&&pr.discAmt>0?'★':'－')+'</div><div class="disc-h" style="margin:0;'+(pr.discOn&&pr.discAmt>0?'':'color:var(--text2);')+'">'+discTxt+'</div></div>'+
    '</div>'+
    (ev.detail?'<div class="dt-card"><div class="dt-ttl">開催内容・お知らせ</div><div class="dt-text">'+richText(ev.detail)+'</div></div>':'')+
    '<div class="cancel-box" style="margin-bottom:12px;"><h4>キャンセルについて</h4><p>当日のキャンセルはキャンセル料100%（参加費全額）を頂戴いたします。前日までは「予約確認・取消」ページから取り消しできます。</p></div>'+
    '<div class="dt-cta">'+btn+'</div><button class="btn-s" style="margin-top:4px;" onclick="copyEvLink(\''+esc(id)+'\')">この開催のリンクをコピー</button>';
  navToPage('ev-detail-pg');
}
function copyEvLink(id){
  const url=location.origin+location.pathname+'?ev='+encodeURIComponent(id);
  if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){toast('リンクをコピーしました');},function(){prompt('このリンクをコピーしてください',url);});}
  else prompt('このリンクをコピーしてください',url);
}

// ===== 予約フォーム =====
function openBkForm(id){
  const ev=findEv(id);if(!ev)return;
  const s=evState(ev);
  if(s.closed||s.full){openDetail(id);return;}
  curEvId=id;pCnt=1;pData=[];
  cupEntryType='individual';
  cupWaitlistMode=false;
  document.getElementById('cnt-v').textContent='1';
  document.getElementById('bf-title').textContent=ev.name;
  document.getElementById('bf-meta').textContent=fmtDate(ev.date)+' '+ev.time+'  |  '+ev.venue;
  const cupBox=document.getElementById('bk-cup-info');if(cupBox){if(isCupEvent(ev)){cupBox.innerHTML=(ev.cupPhoto?'<img class="cup-detail-photo" src="'+esc(ev.cupPhoto)+'" alt="大会画像" loading="lazy">':'')+'<div class="dt-ttl">大会情報</div><div class="dt-text">'+richText(ev.cupDetail||'大会の詳細は順次お知らせします。')+'</div>'+cupTeamCountLabel(ev);cupBox.style.display='block';}else{cupBox.innerHTML='';cupBox.style.display='none';}}
  const cupChoice=document.getElementById('cup-entry-choice');if(cupChoice)cupChoice.style.display=isCupEvent(ev)?'block':'none';
  setCupEntryType('individual');
  const photoBox=document.getElementById('bk-venue-photo');
  if(ev.venuePhoto&&String(ev.venuePhoto).indexOf('data:image/')===0){photoBox.innerHTML='<figure class="booking-venue-figure"><img src="'+esc(ev.venuePhoto)+'" alt="'+esc(ev.venue)+'の会場写真" loading="lazy"><figcaption>開催場所：'+esc(ev.venue)+'</figcaption></figure>';photoBox.style.display='block';}else{photoBox.innerHTML='';photoBox.style.display='none';}
  ['bk-note','bk-email','bk-line','bk-ig','cup-team-name'].forEach(function(k){const el=document.getElementById(k);if(el)el.value='';});
  navToPage('bk-form-pg');
  goStep1();
}
function chgCnt(d){
  const ev=findEv(curEvId),cup=isCupEvent(ev),limits=cup?cupTeamLimits(ev):null;
  if(cup&&cupEntryType!=='team')return;
  const min=cup?Math.max(2,limits.min):1,max=cup?limits.max:10;
  pCnt=Math.max(min,Math.min(max,pCnt+d));
  document.getElementById('cnt-v').textContent=pCnt;
  renderPRows();updPP();
}
function setCupEntryType(type){
  const ev=findEv(curEvId),choice=document.getElementById('cup-entry-choice');
  if(!choice)return;
  if(!isCupEvent(ev)){choice.style.display='none';const teamNameWrap=document.getElementById('cup-team-name-wrap');if(teamNameWrap)teamNameWrap.style.display='none';cupEntryType='individual';const stepper=document.getElementById('cup-count-stepper'),hint=document.getElementById('cup-count-hint'),label=document.getElementById('cup-count-label');if(stepper)stepper.style.display='flex';if(hint)hint.style.display='none';if(label)label.innerHTML='何人で参加しますか？<span class="req">*</span>';return;}
  const limits=cupTeamLimits(ev),teamMin=Math.max(2,limits.min),teamBtn=document.getElementById('cup-entry-team'),maxTeams=Number(ev.cupMaxTeams)||0,teamSlotsFull=maxTeams>0&&cupTeamSlotsUsed(ev)>=maxTeams;
  teamBtn.disabled=limits.max<teamMin;
  teamBtn.textContent=teamSlotsFull?'チームでキャンセル待ち':'チームで参加';
  if(type==='team'&&limits.max<teamMin){alert('この大会はチーム参加の人数条件を満たせません。運営にお問い合わせください。');return;}
  cupEntryType=type==='team'?'team':'individual';
  cupWaitlistMode=cupEntryType==='team'&&teamSlotsFull;
  document.getElementById('cup-entry-individual').classList.toggle('on',cupEntryType==='individual');
  teamBtn.classList.toggle('on',cupEntryType==='team');
  const stepper=document.getElementById('cup-count-stepper');
  if(stepper)stepper.style.display=cupEntryType==='team'?'flex':'none';
  const countLabel=document.getElementById('cup-count-label'),countHint=document.getElementById('cup-count-hint');
  if(countLabel)countLabel.innerHTML=cupEntryType==='team'?'チームの参加人数<span class="req">*</span>':'参加人数';
  if(countHint){countHint.textContent=cupEntryType==='team'?(cupWaitlistMode?'チーム枠は満員です。キャンセル待ちとして受付し、空きが出た場合は運営からご連絡します。':'1チーム '+teamMin+'〜'+limits.max+'名で申し込んでください。'):'個人参加は1名です。3名以上集まると個人参加チーム1チームとして自動計上されます。';countHint.style.display='block';}
  const hint=document.getElementById('cup-entry-hint');
  const teamNameWrap=document.getElementById('cup-team-name-wrap');if(teamNameWrap)teamNameWrap.style.display=cupEntryType==='team'?'block':'none';
  if(cupEntryType==='individual'){
    pCnt=1;hint.textContent='1名で申し込みます。個人参加が3名以上集まると、個人参加チーム1チームとして自動計上されます。';
  }else{
    pCnt=Math.max(teamMin,Math.min(limits.max,pCnt));hint.textContent='チーム参加は1予約で1チームです。'+limits.min+'〜'+limits.max+'名でお申し込みください。';
  }
  document.getElementById('cnt-v').textContent=pCnt;
  renderPRows();updPP();
}
function renderPRows(){
  let h='';
  for(let i=0;i<pCnt;i++){
    const d=pData[i]||{};
    h+='<div class="prow"><div class="prow-lbl">参加者'+(pCnt>1?' '+(i+1):'')+'</div><div class="prow-grid">'+
      '<div class="fg" style="margin:0;"><label class="fl">お名前（フルネーム）<span class="req">*</span></label><input class="fi" id="pn-'+i+'" placeholder="山田 太郎" maxlength="40" value="'+esc(d.name||'')+'" oninput="savePD('+i+')"></div>'+
      '<div class="fg" style="margin:0;"><label class="fl">性別<span class="req">*</span></label><div class="tg-grp" id="gen-'+i+'">'+
        '<button class="tg-btn '+(d.gender==='女性'?'':'on')+'" onclick="tgSel(this,\'gen-'+i+'\');savePD('+i+')" data-v="男性">男性</button>'+
        '<button class="tg-btn '+(d.gender==='女性'?'on':'')+'" onclick="tgSel(this,\'gen-'+i+'\');savePD('+i+')" data-v="女性">女性</button></div></div>'+
      '<div class="fg" style="margin:0;"><label class="fl">区分<span class="req">*</span></label><div class="tg-grp" id="st-'+i+'">'+
        '<button class="tg-btn '+(d.status==='学生'?'':'on')+'" onclick="tgSel(this,\'st-'+i+'\');savePD('+i+');updPP()" data-v="社会人">社会人</button>'+
        '<button class="tg-btn '+(d.status==='学生'?'on':'')+'" onclick="tgSel(this,\'st-'+i+'\');savePD('+i+');updPP()" data-v="学生">学生</button></div></div>'+
      '<div class="fg" style="margin:0;"><label class="fl">居住地<span class="req">*</span></label><div class="tg-grp" id="area-'+i+'">'+
        '<button class="tg-btn '+(d.area==='盛岡市外'?'':'on')+'" onclick="tgSel(this,\'area-'+i+'\');savePD('+i+')" data-v="盛岡市内">盛岡市内</button>'+
        '<button class="tg-btn '+(d.area==='盛岡市外'?'on':'')+'" onclick="tgSel(this,\'area-'+i+'\');savePD('+i+')" data-v="盛岡市外">盛岡市外</button></div></div>'+
      '</div><div class="fg" style="margin-top:14px;margin-bottom:0;"><label class="fl">ランク<span class="req">*</span></label><div class="rk-list">'+
      RANKS.map(function(rk){
        return '<div class="rk-row '+(d.rank===rk.r?'on':'')+'" onclick="selRank('+i+','+rk.r+')" id="rk-'+i+'-'+rk.r+'">'+
          '<div class="rk-badge" style="background:'+rk.bg+';border:1px solid '+rk.col+';"><span class="rk-rl" style="color:'+rk.col+';">RANK</span><span class="rk-rn" style="color:'+rk.col+';">'+rk.r+'</span></div>'+
          '<div class="rk-info"><div class="rk-nm" style="color:'+rk.col+';">'+rk.name+'</div><div class="rk-lb">'+rk.lbl+'</div><div class="rk-st" style="color:'+rk.col+';">'+rk.stars+'</div><div class="rk-dc">'+rk.b[0]+'</div></div>'+
          '<div class="rk-chk">✓</div></div>';
      }).join('')+'</div></div></div>';
  }
  document.getElementById('prows').innerHTML=h;
}
function savePD(i){
  if(!pData[i])pData[i]={};
  const n=document.getElementById('pn-'+i);if(n)pData[i].name=n.value;
  ['gen-'+i,'st-'+i,'area-'+i].forEach(function(gid){
    const b=document.querySelector('#'+gid+' .tg-btn.on');
    if(b){
      if(gid.indexOf('gen')===0)pData[i].gender=b.dataset.v;
      else if(gid.indexOf('st')===0)pData[i].status=b.dataset.v;
      else pData[i].area=b.dataset.v;
    }
  });
}
function selRank(i,r){
  if(!pData[i])pData[i]={};
  pData[i].rank=r;
  RANKS.forEach(function(rk){const el=document.getElementById('rk-'+i+'-'+rk.r);if(el)el.classList.toggle('on',rk.r===r);});
}
function tgSel(btn,gid){document.querySelectorAll('#'+gid+' .tg-btn').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');}
function curPeople(){const a=[];for(let i=0;i<pCnt;i++)a.push(pData[i]||{status:'社会人'});return a;}
function curPricing(){return evPricing(findEv(curEvId),settings);}
function updPP(){
  for(let i=0;i<pCnt;i++)savePD(i);
  const pr=curPricing(),c=calcPrice(pr,curPeople());
  let h='';
  for(let i=0;i<pCnt;i++){const st=(pData[i]||{}).status||'社会人';h+='<div class="pp-row"><span class="pp-k">'+(pCnt>1?'参加者'+(i+1):'参加者')+(pr.flatOn?'（一律）':'（'+st+'）')+'</span><span class="pp-v">'+yen(feeFor(pr,st))+'</span></div>';}
  if(c.disc>0)h+='<div class="pp-row"><span class="pp-disc">'+pr.discMin+'名以上割引</span><span class="pp-v" style="color:#d97706;">－'+yen(c.disc)+'</span></div>';
  else if(pr.discOn&&pr.discAmt>0&&pCnt<pr.discMin)h+='<div class="pp-row"><span class="pp-k" style="font-size:11px;">あと'+(pr.discMin-pCnt)+'名で'+pr.discAmt.toLocaleString()+'円OFF</span><span class="pp-v"></span></div>';
  if(cupWaitlistMode)h='<div class="fi-hint">キャンセル待ちは参加確定ではなく、参加費は発生しません。繰り上げ時に運営からご案内します。</div>';
  else h+='<div class="pp-row tot"><span class="pp-k">合計</span><span class="pp-v">'+yen(c.total)+'</span></div>';
  document.getElementById('pp-box').innerHTML='<div class="pp-card">'+h+'</div>';
}
function showStep(n){
  [1,2,3].forEach(function(k){document.getElementById('step'+k).style.display=k===n?'block':'none';});
  [1,2,3].forEach(function(k){
    const d=document.getElementById('sd'+k);
    d.className='sdot'+(k<n?' dn':k===n?' on':'');
    d.textContent=k<n?'✓':k;
    if(k<3)document.getElementById('sl'+k).className='s-line'+(k<n?' dn':'');
  });
}
function goStep1(){showStep(1);renderPRows();updPP();}
function contactVals(){
  const g=function(id){const el=document.getElementById(id);return el?el.value.trim():'';};
  return{lineId:g('bk-line'),igId:g('bk-ig').replace(/^@+/,''),note:g('bk-note')};
}
function goStep2(){
  const cupEv=findEv(curEvId);
  if(isCupEvent(cupEv)&&cupEntryType==='team'){const maxTeams=Number(cupEv.cupMaxTeams)||0;cupWaitlistMode=maxTeams>0&&cupTeamSlotsUsed(cupEv)>=maxTeams;const teamBtn=document.getElementById('cup-entry-team');if(teamBtn)teamBtn.textContent=cupWaitlistMode?'チームでキャンセル待ち':'チームで参加';updPP();}
  if(isCupEvent(cupEv)){const limits=cupTeamLimits(cupEv),teamMin=Math.max(2,limits.min);if(cupEntryType==='individual'&&pCnt!==1){alert('個人参加は1名でお申し込みください。');return;}if(cupEntryType==='team'&&(pCnt<teamMin||pCnt>limits.max)){alert('チーム参加は1予約あたり'+teamMin+'〜'+limits.max+'名で申し込んでください。');return;}}
  for(let i=0;i<pCnt;i++){
    savePD(i);const d=pData[i]||{};
    if(!d.name||!d.name.trim()){alert('参加者'+(i+1)+'のお名前を入力してください');return;}
    if(!d.rank){alert('参加者'+(i+1)+'のランクを選択してください');return;}
    if(!d.status)pData[i].status='社会人';
    if(!d.gender)pData[i].gender='男性';
    if(!d.area)pData[i].area='盛岡市内';
  }
  const ct=contactVals();
  const ev=findEv(curEvId),pr=curPricing(),c=calcPrice(pr,curPeople());
  const cupTeamNameEl=document.getElementById('cup-team-name'),cupTeamName=cupEntryType==='team'&&cupTeamNameEl?cupTeamNameEl.value.trim().slice(0,40):'';
  let h='<div class="cf-row"><span class="cf-k">イベント</span><span class="cf-v">'+esc(ev.name)+'</span></div>'+
    '<div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDate(ev.date)+' '+esc(ev.time)+'</span></div>'+
    '<div class="cf-row"><span class="cf-k">会場</span><span class="cf-v">'+esc(ev.venue)+'</span></div>'+
    (isCupEvent(ev)?'<div class="cf-row"><span class="cf-k">参加方法</span><span class="cf-v">'+(cupEntryType==='team'?(cupWaitlistMode?'チーム参加（キャンセル待ち）':'チーム参加（1チーム）'):'個人参加（個人参加チームに合流）')+'</span></div>':'')+
    (cupTeamName?'<div class="cf-row"><span class="cf-k">チーム名</span><span class="cf-v">'+esc(cupTeamName)+'</span></div>':'')+
    '<div class="cf-row"><span class="cf-k">参加人数</span><span class="cf-v">'+pCnt+'名</span></div>';
  for(let i=0;i<pCnt;i++){
    const d=pData[i],ri=rankOf(d.rank);
    h+='<div class="cf-row"><span class="cf-k">'+(pCnt>1?'参加者'+(i+1):'参加者')+'</span><span class="cf-v">'+esc(d.name)+'<br><span style="font-size:12px;color:var(--text2);">'+d.gender+' / '+d.status+' / '+d.area+'</span><br><span style="font-size:11px;color:'+ri.col+';font-weight:800;">RANK '+d.rank+' '+ri.name+'</span></span></div>';
  }
  const ctList=[];
  if(ct.lineId)ctList.push('LINE：'+esc(ct.lineId));
  if(ct.igId)ctList.push('Instagram：@'+esc(ct.igId));
  h+='<div class="cf-row"><span class="cf-k">連絡先</span><span class="cf-v" style="font-weight:500;">'+(ctList.length?ctList.join('<br>'):'未入力')+'</span></div>';
  if(c.disc>0)h+='<div class="cf-row"><span class="cf-k">割引</span><span class="cf-v" style="color:#d97706;">－'+yen(c.disc)+'</span></div>';
  if(ct.note)h+='<div class="cf-row"><span class="cf-k">備考</span><span class="cf-v" style="font-weight:500;white-space:pre-wrap;">'+esc(ct.note)+'</span></div>';
  if(cupWaitlistMode)h+='<div class="fi-hint" style="margin-top:10px;">キャンセル待ちはまだ参加確定ではありません。参加費は繰り上げのご案内時に確認します。</div>';
  else h+='<div class="cf-row"><span class="cf-k" style="font-weight:800;color:var(--navy);">合計金額</span><span class="cf-v" style="font-size:20px;color:var(--mid);">'+yen(c.total)+'</span></div>';
  document.getElementById('cf-rows').innerHTML=h;
  const submitBtn=document.getElementById('submit-btn');if(submitBtn)submitBtn.textContent=cupWaitlistMode?'キャンセル待ちに登録':'予約を確定する';
  showStep(2);window.scrollTo({top:0,behavior:'instant'});
}

async function doSubmit(){
  if(submitting)return;
  const ev=findEv(curEvId);if(!ev)return;
  const btn=document.getElementById('submit-btn');
  submitting=true;btn.disabled=true;btn.textContent='送信中…';
  try{
    // 最新の参加人数で残り枠を確認
    const snap=await db.ref('seats/'+ev.id).once('value');
    const tmp={};tmp[ev.id]=snap.val()||{};
    const currentSeats=tmp[ev.id]||{};
    let isCupWaitlist=false;
    if(isCupEvent(ev)){
      const limits=cupTeamLimits(ev),maxTeams=Number(ev.cupMaxTeams)||0,teamSlotsUsed=cupTeamSlotsUsed(ev,currentSeats),soloCount=Object.keys(currentSeats).filter(function(pub){return Number(currentSeats[pub])===1;}).length;
      let error='';
      if(cupEntryType==='team'&&(pCnt<Math.max(2,limits.min)||pCnt>limits.max))error='チーム参加は1予約あたり'+Math.max(2,limits.min)+'〜'+limits.max+'名でお申し込みください。';
      else if(cupEntryType==='individual'&&(pCnt!==1||soloCount+1>limits.max))error='個人参加チームは1名ずつ予約でき、最大'+limits.max+'名まで募集しています。';
      else if(cupEntryType==='team'&&maxTeams&&teamSlotsUsed>=maxTeams)isCupWaitlist=true;
      if(error){alert(error);return;}
    }else{
      const cap=getCap(ev),now=seatCount(tmp,ev);
      if(now+pCnt>cap){alert('申し訳ありません。残り枠が'+Math.max(0,cap-now)+'名のため、この人数では予約できません。');return;}
    }

    const pr=evPricing(ev,settings),people=curPeople(),c=calcPrice(pr,people),ct=contactVals();
    const cupTeamNameEl=document.getElementById('cup-team-name'),cupTeamName=cupEntryType==='team'&&cupTeamNameEl?cupTeamNameEl.value.trim().slice(0,40):'';
    const rec={
      evId:ev.id,evName:ev.name,evDate:ev.date,evTime:ev.time,venue:ev.venue,
      cnt:pCnt,sub:isCupWaitlist?0:c.sub,disc:isCupWaitlist?0:c.disc,total:isCupWaitlist?0:c.total,
      people:people.map(function(d){return{name:d.name.trim(),gender:d.gender,status:d.status,area:d.area,rank:d.rank,fee:isCupWaitlist?0:feeFor(pr,d.status)};}),
      cancelBefore:isCupWaitlist?8640000000000000:dayStartJST(ev.date),createdAt:firebase.database.ServerValue.TIMESTAMP
    };
    if(isCupEvent(ev))rec.cupEntryType=cupEntryType;
    if(isCupWaitlist)rec.cupWaitlist=true;
    if(cupTeamName)rec.cupTeamName=cupTeamName;
    if(ct.note)rec.note=ct.note.slice(0,500);
    if(ct.lineId)rec.lineId=ct.lineId.slice(0,60);
    if(ct.igId)rec.igId=ct.igId.slice(0,60);

    // 予約番号を発行して保存（まれに番号が重複したら作り直す）
    let ok=false,pub,sec;
    for(let t=0;t<4&&!ok;t++){
      pub=rid(4);sec=rid(8);
      const up={};up['bookings/'+pub+'/'+sec]=rec;if(!isCupWaitlist)up['seats/'+ev.id+'/'+pub]=pCnt;
      try{await db.ref().update(up);ok=true;}catch(e){if(t===3)throw e;}
    }
    lastResvNo='MF-'+pub+'-'+sec;

    // GAS URLがあれば、予約者メールの有無にかかわらず運営通知を要求する
    // メールアドレスは収集せず、設定済みGASがあれば運営通知のみ依頼する。
    const gasUrl=safeUrl(settings.gasUrl)?settings.gasUrl:'';
    if(gasUrl&&!isCupWaitlist){
      fetch(gasUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({type:'booking',resvNo:lastResvNo})}).catch(function(){});
    }
    if(isCupWaitlist)showCupWaitlistSuccess(ev,rec);else showSuccess(ev,rec);
  }catch(e){
    console.error(e);
    alert('予約を保存できませんでした。通信状況をご確認のうえ、もう一度お試しください。\n解決しない場合はLINEからご連絡ください。');
  }finally{
    submitting=false;btn.disabled=false;btn.textContent=cupWaitlistMode?'キャンセル待ちに登録':'予約を確定する';
  }
}
function showSuccess(ev,rec){
  document.getElementById('suc-tag').textContent='予約完了';document.getElementById('suc-title').textContent='ご予約ありがとうございます';document.getElementById('suc-message').innerHTML='当日お会いできることを楽しみにしております！<br>ご不明な点はLINEよりお気軽にお問い合わせください。';
  document.getElementById('suc-number-label').textContent='予約番号';document.getElementById('suc-number-hint').textContent='予約の確認・取消と当日の受付に必要です。QRコードまたは予約番号を保存してください。';
  document.getElementById('suc-qr-wrap').style.display='block';document.querySelector('#step3 .suc-note').style.display='block';document.getElementById('suc-check-btn').style.display='block';document.getElementById('suc-check-btn').textContent='予約確認・取消';
  document.getElementById('suc-resv-no').textContent=lastResvNo;
  const qrNumber=document.getElementById('suc-qr-number');if(qrNumber)qrNumber.textContent=lastResvNo;
  const qr=document.getElementById('suc-qr'),qrError=document.getElementById('suc-qr-error');
  if(qr){qr.innerHTML='';if(window.QRCode){new QRCode(qr,{text:lastResvNo,width:240,height:240,colorDark:'#0b2442',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});if(qrError)qrError.style.display='none';}else if(qrError)qrError.style.display='block';}
  const ppl=rec.people.map(function(d){
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;"><div style="font-weight:800;color:var(--navy);font-size:14px;margin-bottom:6px;">'+esc(d.name)+'</div><div style="display:flex;gap:6px;flex-wrap:wrap;">'+personTags(d)+'</div></div>';
  }).join('');
  document.getElementById('suc-det').innerHTML=
    '<div class="cf-row"><span class="cf-k">イベント</span><span class="cf-v">'+esc(ev.name)+'</span></div>'+
    '<div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDate(ev.date)+' '+esc(ev.time)+'</span></div>'+
    '<div class="cf-row"><span class="cf-k">会場</span><span class="cf-v">'+esc(ev.venue)+'</span></div>'+
    '<div class="cf-row"><span class="cf-k">参加人数</span><span class="cf-v">'+rec.cnt+'名</span></div>'+
    '<div class="cf-row"><span class="cf-k">合計金額</span><span class="cf-v" style="color:var(--mid);font-size:18px;font-weight:900;">'+yen(rec.total)+'</span></div>'+
    (rec.note?'<div class="cf-row"><span class="cf-k">備考</span><span class="cf-v" style="font-weight:500;white-space:pre-wrap;">'+esc(rec.note)+'</span></div>':'')+
    '<div style="margin-top:14px;"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:var(--mid);margin-bottom:8px;text-transform:uppercase;">参加者</div>'+ppl+'</div>';
  showStep(3);window.scrollTo({top:0,behavior:'instant'});
}
function showCupWaitlistSuccess(ev,rec){
  document.getElementById('suc-tag').textContent='キャンセル待ち受付';document.getElementById('suc-title').textContent='キャンセル待ちを受け付けました';
  document.getElementById('suc-message').textContent='現時点では参加確定ではありません。空きが出た場合、運営からご連絡します。';
  document.getElementById('suc-number-label').textContent='キャンセル待ち受付番号';document.getElementById('suc-number-hint').textContent='受付内容の確認・取り消しに使います。参加確定の予約番号や会場受付用QRではありません。';
  document.getElementById('suc-resv-no').textContent=lastResvNo;document.getElementById('suc-qr-wrap').style.display='none';
  document.querySelector('#step3 .suc-note').style.display='none';document.getElementById('suc-check-btn').style.display='block';document.getElementById('suc-check-btn').textContent='キャンセル待ち確認・取消';
  const people=rec.people.map(function(p){return '<div class="cc-person"><div class="cc-person-name">'+esc(p.name)+'</div></div>';}).join('');
  document.getElementById('suc-det').innerHTML='<div class="cf-row"><span class="cf-k">イベント</span><span class="cf-v">'+esc(ev.name)+'</span></div><div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDate(ev.date)+' '+esc(ev.time)+'</span></div><div class="cf-row"><span class="cf-k">参加方法</span><span class="cf-v">チーム参加・キャンセル待ち</span></div>'+(rec.cupTeamName?'<div class="cf-row"><span class="cf-k">チーム名</span><span class="cf-v">'+esc(rec.cupTeamName)+'</span></div>':'')+'<div class="cf-row"><span class="cf-k">人数</span><span class="cf-v">'+rec.cnt+'名</span></div><div style="margin-top:14px;">'+people+'</div>';
  showStep(3);window.scrollTo({top:0,behavior:'instant'});
}
function showScreenshotInstructions(){
  alert('QRコードと予約番号が同じ枠に入るよう画面を調整し、その枠全体をスクリーンショットしてください。\n\niPhone（Face ID）：サイドボタンと音量を上げるボタンを同時に押します。\niPhone（ホームボタンあり）：サイドボタン（または上部ボタン）とホームボタンを同時に押します。\nAndroid：電源ボタンと音量を下げるボタンを同時に押します。');
}

// ===== ランク =====
function renderRankPage(){
  document.getElementById('rank-display').innerHTML=RANKS.map(function(rk){return '<div class="rk-card"><div class="rk-card-hd">'+
    '<div class="rk-card-badge" style="background:'+rk.bg+';border:1px solid '+rk.col+';"><span style="font-size:8px;font-weight:800;letter-spacing:1px;color:'+rk.col+';">RANK</span><span style="font-size:20px;font-weight:900;line-height:1.1;color:'+rk.col+';">'+rk.r+'</span></div>'+
    '<div><div class="rk-card-nm" style="color:'+rk.col+';">'+rk.name+'</div><div class="rk-card-sl">'+rk.lbl+'</div><div class="rk-card-st" style="color:'+rk.col+';">'+rk.stars+'</div></div></div>'+
    '<div class="rk-card-bd"><ul class="rk-card-ul">'+rk.b.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div></div>';}).join('');
}

// ===== 料金（基本設定） =====
function renderPriceSec(){
  const pr=evPricing({},settings);
  document.getElementById('pr-adult').textContent=yen(pr.adult);
  document.getElementById('pr-student').textContent=yen(pr.student);
  const box=document.getElementById('pr-disc-box');
  if(pr.discOn&&pr.discAmt>0){box.style.display='flex';document.getElementById('pr-disc-h').textContent=pr.discMin+'名以上の同時予約で合計から'+pr.discAmt.toLocaleString()+'円OFF';}
  else box.style.display='none';
}

// ===== ギャラリー =====
const GAL_INIT=8;
function renderGallery(){
  const sec=document.getElementById('gallery-sec');
  if(!gallery.length){sec.style.display='none';return;}
  sec.style.display='block';
  const list=galShowAll?gallery:gallery.slice(0,GAL_INIT);
  lbList=gallery;
  document.getElementById('gal-grid').innerHTML=list.map(function(g,i){
    const sub=[g.date?fmtDate(g.date):'',g.evName||''].filter(Boolean).join(' ');
    return '<div class="gal-item" onclick="openLb('+i+')"><img src="'+esc(String(g.thumb||'').indexOf('data:image/')===0?g.thumb:'')+'" alt="'+esc(g.caption||'開催の様子')+'" loading="lazy">'+
      ((g.caption||sub)?'<div class="gal-cap">'+esc(g.caption||'')+(sub?'<span>'+esc(sub)+'</span>':'')+'</div>':'')+'</div>';
  }).join('');
  document.getElementById('gal-more').style.display=(!galShowAll&&gallery.length>GAL_INIT)?'block':'none';
}
function openLb(i){lbIdx=i;showLb();document.getElementById('lb').classList.add('on');}
function closeLb(){document.getElementById('lb').classList.remove('on');}
function lbMove(d){lbIdx=(lbIdx+d+lbList.length)%lbList.length;showLb();}
function showLb(){
  const g=lbList[lbIdx];if(!g)return;
  const img=document.getElementById('lb-img');
  img.src=g.thumb;
  document.getElementById('lb-cap').textContent=[g.caption,g.date?fmtDate(g.date):'',g.evName].filter(Boolean).join('  ');
  db.ref('galleryFull/'+g.id).once('value').then(function(s){
    const v=s.val();if(v&&String(v).indexOf('data:image/')===0&&lbList[lbIdx]===g)img.src=v;
  }).catch(function(){});
}
document.addEventListener('keydown',function(e){
  if(!document.getElementById('lb').classList.contains('on'))return;
  if(e.key==='Escape')closeLb();if(e.key==='ArrowLeft')lbMove(-1);if(e.key==='ArrowRight')lbMove(1);
});

// ===== 予約確認・取消 =====
function renderCheckStart(){
  document.getElementById('check-input').value='';
  document.getElementById('check-result').innerHTML='';
}
function goCheckWith(no){
  navToPage('check-pg');
  document.getElementById('check-input').value=no||'';
  if(no)doCheck();
}
var checked=null;
async function doCheck(){
  const res=document.getElementById('check-result');
  const raw=document.getElementById('check-input').value;
  if(!raw.trim()){alert('予約番号を入力してください');return;}
  const id=parseResvNo(raw);
  const notFound='<div class="check-empty">該当する予約が見つかりませんでした。<br>予約番号をご確認のうえ、再度お試しください。<br><br>お分かりにならない場合はDMまたはLINEまでお問い合わせください。</div>';
  if(!id){res.innerHTML=notFound;return;}
  res.innerHTML='<div class="check-empty">検索しています…</div>';
  let b=null;
  try{b=(await db.ref('bookings/'+id.pub+'/'+id.sec).once('value')).val();}catch(e){b=null;}
  if(!b){res.innerHTML=notFound;return;}
  checked={id:id,b:b};
  if(b.cupWaitlist){
    const waitPeople=objToList(b.people).map(function(p){return '<div class="cc-person"><div class="cc-person-name">'+esc(p.name)+'</div></div>';}).join('');
    res.innerHTML='<div class="check-result"><div class="check-card"><div class="check-card-top"><div class="cc-event">キャンセル待ち受付中</div><div class="cc-date">受付番号 '+esc(id.no)+'</div></div><div class="check-card-body"><div class="cf-row"><span class="cf-k">イベント</span><span class="cf-v">'+esc(b.evName)+'</span></div><div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDate(b.evDate)+' '+esc(b.evTime)+'</span></div>'+(b.cupTeamName?'<div class="cf-row"><span class="cf-k">チーム名</span><span class="cf-v">'+esc(b.cupTeamName)+'</span></div>':'')+'<div class="cf-row"><span class="cf-k">人数</span><span class="cf-v">'+b.cnt+'名</span></div><p class="fi-hint">まだ参加は確定していません。空きが出た場合は運営からご連絡します。</p><div style="margin-top:14px;">'+waitPeople+'</div>'+(Date.now()<b.cancelBefore?'<button class="btn-cancel" onclick="cancelReservation()">キャンセル待ちを取り消す</button>':'<div class="cancel-warn">開催当日以降はここから取り消しできません。変更は運営までご連絡ください。</div>')+'</div></div></div>';
    return;
  }
  const cancelable=Date.now()<b.cancelBefore;
  const people=objToList(b.people).map(function(p){
    return '<div class="cc-person"><div class="cc-person-name">'+esc(p.name)+'</div><div style="display:flex;gap:6px;flex-wrap:wrap;">'+personTags(p)+'</div></div>';
  }).join('');
  const cancelArea=cancelable?
    '<button class="btn-cancel" onclick="cancelReservation()">この予約を取り消す</button><p style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center;line-height:1.6;">取り消すと元に戻せません。<br>前日まで取り消し可能です。</p>':
    '<div class="cancel-warn"><strong>取り消しについて</strong>開催当日・終了後はこちらから取り消しできません。<br>当日のキャンセルや変更は、DMまたはLINEからお願いいたします。</div><button class="btn-cancel" disabled>当日・当日以降は取り消しできません</button>';
  res.innerHTML='<div class="check-result"><div class="check-card">'+
    '<div class="check-card-top"><div class="cc-event">'+esc(b.evName)+'</div><div class="cc-date">予約番号 '+esc(id.no)+'</div></div>'+
    '<div class="check-card-body">'+
      '<div class="cf-row"><span class="cf-k">日時</span><span class="cf-v">'+fmtDate(b.evDate)+' '+esc(b.evTime)+'</span></div>'+
      '<div class="cf-row"><span class="cf-k">会場</span><span class="cf-v">'+esc(b.venue||'')+'</span></div>'+
      '<div class="cf-row"><span class="cf-k">参加人数</span><span class="cf-v">'+b.cnt+'名</span></div>'+
      '<div class="cf-row"><span class="cf-k">合計金額</span><span class="cf-v" style="color:var(--mid);font-size:16px;font-weight:900;">'+yen(b.total)+'</span></div>'+
      (b.note?'<div class="cf-row"><span class="cf-k">備考</span><span class="cf-v" style="font-weight:500;white-space:pre-wrap;">'+esc(b.note)+'</span></div>':'')+
      '<div style="margin-top:14px;"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:var(--mid);margin-bottom:8px;text-transform:uppercase;">参加者</div>'+people+'</div>'+
      cancelArea+
    '</div></div></div>';
}
async function cancelReservation(){
  if(!checked)return;
  const id=checked.id,b=checked.b;
  if(Date.now()>=b.cancelBefore){alert('開催当日・終了後はこちらから取り消しできません。DMまたはLINEからお願いいたします。');return;}
  if(!confirm((b.cupWaitlist?'キャンセル待ち受付番号 ':'予約番号 ')+id.no+(b.cupWaitlist?' の受付を取り消します。よろしいですか？':' の予約を取り消します。よろしいですか？')+'\nこの操作は元に戻せません。'))return;
  const up={};up['bookings/'+id.pub+'/'+id.sec]=null;if(!b.cupWaitlist)up['seats/'+b.evId+'/'+id.pub]=null;
  try{
    await db.ref().update(up);
  }
  catch(e){console.error(e);alert('取り消しできませんでした。お手数ですがLINEからご連絡ください。');return;}
  if(!b.cupWaitlist&&safeUrl(settings.gasUrl)){
    fetch(settings.gasUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({type:'cancel',resvNo:id.no})}).catch(function(){});
  }
  checked=null;
  document.getElementById('check-result').innerHTML='<div class="check-empty" style="border-color:#86efac;background:#f0fdf4;color:#15803d;"><div style="font-size:30px;margin-bottom:10px;">✓</div><div style="font-weight:800;font-size:16px;margin-bottom:6px;">'+(b.cupWaitlist?'キャンセル待ちを取り消しました':'予約を取り消しました')+'</div>'+(b.cupWaitlist?'キャンセル待ち受付を取り消しました。':'ご予約の取り消しが完了しました。')+'<br>またのご参加をお待ちしております。</div>';
  document.getElementById('check-input').value='';
}

// ===== データ受信（リアルタイム） =====
function refreshAll(){
  renderHomeGrid();renderEvList();
  if(document.getElementById('ev-detail-pg').classList.contains('on')&&curEvId&&events[curEvId])openDetailSilently();
  if(document.getElementById('bk-form-pg').classList.contains('on')&&document.getElementById('step1').style.display!=='none')updPP();
}
function openDetailSilently(){const y=window.scrollY;openDetail(curEvId);window.scrollTo({top:y,behavior:'instant'});}

var deepLinkDone=false;
function handleDeepLink(){
  if(deepLinkDone||!loaded.events)return;
  deepLinkDone=true;
  const q=new URLSearchParams(location.search);
  if(q.get('r'))goCheckWith(q.get('r'));
  else if(q.get('ev')&&events[q.get('ev')])openDetail(q.get('ev'));
}

renderRankPage();renderHomeGrid();renderMailHelp();
if(db){
  db.ref('events').on('value',function(s){events=s.val()||{};loaded.events=true;refreshAll();handleDeepLink();},function(e){console.error(e);loaded.events=true;refreshAll();});
  db.ref('seats').on('value',function(s){seats=s.val()||{};loaded.seats=true;refreshAll();});
  db.ref('settings').on('value',function(s){settings=Object.assign({},DEFAULT_SETTINGS,s.val()||{});renderPriceSec();renderMailHelp();refreshAll();});
  db.ref('gallery').on('value',function(s){
    gallery=objToList(s.val()).sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.ts||0)-(a.ts||0);});
    renderGallery();
  });
}
