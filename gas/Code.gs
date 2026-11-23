/**
 * MORIFUT 予約確認メール送信（Google Apps Script）
 *
 * 使い方は SETUP.md の「4. 予約確認メール」を参照してください。
 * このスクリプトは予約番号だけを受け取り、Firebaseに保存された予約内容を
 * 自分で読み直してからメールを送ります（なりすましメール送信の防止）。
 */

// ===== 設定（必要なら変更） =====
const DB_URL     = 'https://morifut-b033c-default-rtdb.asia-southeast1.firebasedatabase.app';
const SITE_URL   = 'https://morifut.github.io/MORIFUT.HOMEPAGE.-/';
const ADMIN_MAIL = 'morifut20252026@gmail.com';   // 予約が入ったら運営にも通知
const LINE_URL   = 'https://lin.ee/rH9oR1y';
const SENDER     = 'MORIFUT';

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const id = parseResvNo_(body.resvNo);
    if (!id) return json_({ ok: false, error: 'bad_resv' });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (body.type === 'cancel') return json_(handleCancel_(id));
      return json_(handleBooking_(id));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('MORIFUT mail endpoint is running.');
}

// ---- 予約完了メール ----
function handleBooking_(id) {
  const props = PropertiesService.getScriptProperties();
  const key = 'sent_' + id.no;
  if (props.getProperty(key)) return { ok: true, skipped: 'already_sent' };

  const b = fetchBooking_(id);
  if (!b) return { ok: false, error: 'not_found' };

  // 30分以上前の予約には送らない（古い予約番号を使った再送防止）
  if (b.createdAt && Date.now() - b.createdAt > 30 * 60 * 1000) return { ok: false, error: 'too_old' };

  const people = toList_(b.people);
  const lines = [];
  lines.push((people[0] && people[0].name ? people[0].name : '') + ' 様');
  lines.push('');
  lines.push('MORIFUTへのご予約ありがとうございます。');
  lines.push('以下の内容でご予約を承りました。');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push('予約番号：' + id.no);
  lines.push('イベント：' + b.evName);
  lines.push('日時　　：' + fmtDate_(b.evDate) + ' ' + (b.evTime || ''));
  lines.push('会場　　：' + (b.venue || ''));
  lines.push('参加人数：' + b.cnt + '名');
  people.forEach(function (p, i) {
    lines.push('　' + (i + 1) + '. ' + p.name + '（' + p.status + ' / RANK' + p.rank + '）');
  });
  if (b.disc) lines.push('割引　　：-' + yen_(b.disc));
  lines.push('合計金額：' + yen_(b.total) + '（当日お支払い）');
  if (b.note) lines.push('備考　　：' + b.note);
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('▼ 予約の確認・取り消し');
  lines.push(SITE_URL + '?r=' + encodeURIComponent(id.no));
  lines.push('');
  lines.push('【キャンセルについて】');
  lines.push('前日までは上のページから取り消しできます。');
  lines.push('当日のキャンセルはキャンセル料100%（参加費全額）を頂戴いたします。');
  lines.push('');
  lines.push('ご不明な点はLINEからお気軽にお問い合わせください。');
  lines.push(LINE_URL);
  lines.push('');
  lines.push('当日お会いできることを楽しみにしています！');
  lines.push('MORIFUT');

  if (b.email) {
    MailApp.sendEmail({
      to: b.email,
      name: SENDER,
      replyTo: ADMIN_MAIL,
      subject: '【MORIFUT】ご予約を承りました（' + fmtDate_(b.evDate) + ' ' + b.evName + '）',
      body: lines.join('\n')
    });
  }

  // 運営への通知
  const admin = [
    '新しい予約が入りました。', '',
    '予約番号：' + id.no,
    'イベント：' + b.evName + '（' + fmtDate_(b.evDate) + ' ' + (b.evTime || '') + '）',
    '人数　　：' + b.cnt + '名 / ' + yen_(b.total),
    '参加者　：' + people.map(function (p) { return p.name; }).join('、'),
    'メール　：' + (b.email || '-'),
    'LINE ID ：' + (b.lineId || '-'),
    'Instagram：' + (b.igId ? '@' + b.igId : '-'),
    '備考　　：' + (b.note || '-'), '',
    '管理画面：' + SITE_URL + 'admin.html'
  ];
  MailApp.sendEmail({ to: ADMIN_MAIL, name: SENDER, subject: '【予約通知】' + fmtDate_(b.evDate) + ' ' + b.evName + '（' + b.cnt + '名）', body: admin.join('\n') });

  // 取り消しメール用に最小限の情報だけ保存（60日で自動削除）
  props.setProperty(key, JSON.stringify({ t: Date.now(), email: b.email || '', evName: b.evName, evDate: b.evDate, evTime: b.evTime || '', cnt: b.cnt }));
  return { ok: true };
}

// ---- 取り消しメール（予約が本当に消えている場合のみ送信） ----
function handleCancel_(id) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sent_' + id.no);
  if (!raw) return { ok: false, error: 'unknown' };
  if (fetchBooking_(id)) return { ok: false, error: 'still_exists' };
  const info = JSON.parse(raw);
  props.deleteProperty('sent_' + id.no);

  if (info.email) {
    MailApp.sendEmail({
      to: info.email, name: SENDER, replyTo: ADMIN_MAIL,
      subject: '【MORIFUT】ご予約の取り消しを承りました',
      body: [
        'MORIFUTをご利用いただきありがとうございます。',
        '以下のご予約の取り消しが完了しました。', '',
        '予約番号：' + id.no,
        'イベント：' + info.evName,
        '日時　　：' + fmtDate_(info.evDate) + ' ' + info.evTime, '',
        'またのご参加をお待ちしております。',
        'MORIFUT'
      ].join('\n')
    });
  }
  MailApp.sendEmail({ to: ADMIN_MAIL, name: SENDER, subject: '【取消通知】' + fmtDate_(info.evDate) + ' ' + info.evName, body: '予約番号 ' + id.no + '（' + info.cnt + '名）が参加者により取り消されました。' });
  return { ok: true };
}

// 古い送信記録の掃除（トリガーで1日1回実行すると安心。設定しなくても動作します）
function cleanup() {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties(), limit = Date.now() - 60 * 24 * 3600 * 1000;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sent_') !== 0) return;
    try { if (JSON.parse(all[k]).t < limit) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

// 初回の権限許可・動作テスト用（エディタで選んで実行）
function testMail() {
  MailApp.sendEmail(ADMIN_MAIL, '【MORIFUT】メール送信テスト', 'このメールが届いていれば、送信の設定は完了です。');
}

// ===== 内部関数 =====
function fetchBooking_(id) {
  const res = UrlFetchApp.fetch(DB_URL + '/bookings/' + id.pub + '/' + id.sec + '.json', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}
function parseResvNo_(input) {
  let s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.indexOf('MF') === 0) s = s.slice(2);
  if (s.length < 12) return null;
  return { pub: s.slice(0, 4), sec: s.slice(4), no: 'MF-' + s.slice(0, 4) + '-' + s.slice(4) };
}
function toList_(o) { return Array.isArray(o) ? o.filter(Boolean) : Object.keys(o || {}).map(function (k) { return o[k]; }); }
function fmtDate_(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00+09:00'), w = ['日', '月', '火', '水', '木', '金', '土'];
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return (jst.getUTCMonth() + 1) + '/' + jst.getUTCDate() + '（' + w[jst.getUTCDay()] + '）';
}
function yen_(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
