// =============================================================
// MORIFUT 共通設定・共通関数（index.html / admin.html の両方で使用）
// =============================================================

// ---- Firebase 設定（変更不要） ----
const firebaseConfig={
  apiKey:"AIzaSyBEhau49KFHUByqn21XGOvWun7_Wy96xMU",
  authDomain:"morifut-b033c.firebaseapp.com",
  databaseURL:"https://morifut-b033c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"morifut-b033c",
  storageBucket:"morifut-b033c.firebasestorage.app",
  messagingSenderId:"642722181993",
  appId:"1:642722181993:web:5a5003c5783ceac90c43f8"
};
// 運営アカウント（database.rules.json と同じアドレス）
const ADMIN_EMAIL='morifut20252026@gmail.com';

var db=null;
try{
  firebase.initializeApp(firebaseConfig);
  db=firebase.database();
}catch(e){console.error('Firebase init error',e);}

// ---- 定数 ----
const CAP={futsal:20,soccer:24};
const DEFAULT_SETTINGS={priceAdult:1000,priceStudent:500,discOn:true,discMin:3,discAmt:500,gasUrl:''};
const RANKS=[
  {r:5,name:'エリート',lbl:'上級者・競技志向',col:'#DC2626',bg:'rgba(220,38,38,.1)',stars:'★★★★★',b:['大会出場経験がある','強度の高いプレーができる','上級者向けのプレーを楽しみたい方']},
  {r:4,name:'アドバンス',lbl:'上級者・経験者',col:'#EA580C',bg:'rgba(234,88,12,.1)',stars:'★★★★☆',b:['サッカー/フットサル経験が長い','戦術理解があり安定したプレーができる','経験者向けのレベル']},
  {r:3,name:'レギュラー',lbl:'中級者・安定',col:'#CA8A04',bg:'rgba(202,138,4,.1)',stars:'★★★☆☆',b:['ある程度の経験がある','基本的な技術・戦術を理解している','普段から個サルに参加している方']},
  {r:2,name:'ビギナー',lbl:'初心者〜初級者',col:'#16A34A',bg:'rgba(22,163,74,.1)',stars:'★★☆☆☆',b:['フットサルを始めたばかり','経験は少ないが楽しみたい','初心者・女性も安心して参加できます']},
  {r:1,name:'エントリー',lbl:'超初心者',col:'#2563EB',bg:'rgba(37,99,235,.1)',stars:'★☆☆☆☆',b:['ほとんど経験がない','まずはボールに慣れたい','みんなで楽しくプレーしたい方']},
];

// ---- 文字のエスケープ（入力内容をそのまま表示しても安全にする） ----
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
// 改行を<br>に、URLをリンクに
function richText(v){
  return esc(v).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" style="color:var(--mid);text-decoration:underline;word-break:break-all;">$1</a>').replace(/\n/g,'<br>');
}
function safeUrl(u){u=String(u||'').trim();return /^https?:\/\//i.test(u)?u:'';}
function yen(n){return '¥'+Number(n||0).toLocaleString();}

// ---- 日付 ----
function fmtDate(s){const d=new Date(s+'T00:00:00'),w=['日','月','火','水','木','金','土'];return`${d.getMonth()+1}/${d.getDate()}（${w[d.getDay()]}）`;}
function fmtDateLong(s){const d=new Date(s+'T00:00:00'),w=['日','月','火','水','木','金','土'];return`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${w[d.getDay()]}）`;}
function todayStr(){const d=new Date(Date.now()+9*3600e3);return d.toISOString().slice(0,10);} // 日本時間の今日
// 開催日の0:00（日本時間）= この時刻より前ならWebから取り消し可能
function dayStartJST(dateStr){return Date.parse(dateStr+'T00:00:00+09:00');}

function tLabel(t){return t==='soccer'?'サッカー':'フットサル';}
function getCap(ev){return Number(ev.cap)||CAP[ev.type]||20;}

// ---- 料金（イベントごとの設定を優先、なければ基本設定） ----
function evPricing(ev,settings){
  const s=Object.assign({},DEFAULT_SETTINGS,settings||{});
  const has=function(k){return ev&&ev[k]!==undefined&&ev[k]!==null&&ev[k]!=='';};
  return{
    adult:has('priceAdult')?Number(ev.priceAdult):Number(s.priceAdult),
    student:has('priceStudent')?Number(ev.priceStudent):Number(s.priceStudent),
    discOn:has('discOn')?!!ev.discOn:!!s.discOn,
    discMin:has('discMin')?Number(ev.discMin):Number(s.discMin),
    discAmt:has('discAmt')?Number(ev.discAmt):Number(s.discAmt)
  };
}
function feeFor(pr,status){return status==='学生'?pr.student:pr.adult;}
function calcPrice(pr,people){
  let sub=0;people.forEach(function(p){sub+=feeFor(pr,p.status||'社会人');});
  const disc=(pr.discOn&&people.length>=pr.discMin)?Math.min(pr.discAmt,sub):0;
  return{sub:sub,disc:disc,total:sub-disc};
}

// ---- 予約番号 ----
// 形式: MF-XXXX-XXXXXXXX （前半4桁=公開ID、後半8桁=本人だけが知る鍵）
const RID_CHARS='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function rid(n){
  const a=new Uint8Array(n);crypto.getRandomValues(a);
  let s='';for(let i=0;i<n;i++)s+=RID_CHARS[a[i]%32];return s;
}
function parseResvNo(input){
  let s=String(input||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
  if(s.indexOf('MF')===0)s=s.slice(2);
  if(s.length<12)return null;
  return{pub:s.slice(0,4),sec:s.slice(4),no:'MF-'+s.slice(0,4)+'-'+s.slice(4)};
}

function objToList(o){
  if(!o)return[];
  return Object.keys(o).map(function(k){const v=o[k];if(v&&typeof v==='object'&&!v.id)v.id=k;return v;}).filter(Boolean);
}
function seatCount(seats,ev){
  let n=Number(ev.extraP)||0;
  const s=seats&&seats[ev.id];
  if(s)Object.keys(s).forEach(function(k){n+=Number(s[k])||0;});
  return n;
}

function toast(msg,isErr){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:'+(isErr?'#dc2626':'var(--mid)')+';color:#fff;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:700;box-shadow:0 6px 20px rgba(26,86,219,.35);z-index:9999;max-width:90vw;text-align:center;';
  document.body.appendChild(t);
  setTimeout(function(){t.remove();},isErr?4500:2500);
}
function rankOf(r){return RANKS.find(function(rk){return rk.r===Number(r);})||RANKS[RANKS.length-1];}
function tagHTML(txt,bg,col){return '<span style="background:'+(bg||'var(--blue-light)')+';color:'+(col||'var(--mid)')+';font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;">'+esc(txt)+'</span>';}
function personTags(p){
  const ri=rankOf(p.rank);
  return tagHTML(p.gender)+tagHTML(p.status)+tagHTML(p.area)+tagHTML('RANK'+p.rank+' '+ri.name,ri.bg,ri.col);
}
