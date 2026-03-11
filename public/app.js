// === Tobira Chat-Driven App ===

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let authToken = null;
let userName = '';
let currentEmail = '';
let chatHistory = []; // { role, content }
let collectedData = {};
let currentDraft = '';
let currentStructured = null;

// === Password Toggle ===
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.querySelector('.eye-open').style.display = isPassword ? 'none' : '';
  btn.querySelector('.eye-closed').style.display = isPassword ? '' : 'none';
}

// === Sections ===
const sections = {
  login: $('#login-section'),
  pw: $('#pw-section'),
  main: $('#main-section'),
};

function showSection(name) {
  Object.values(sections).forEach(s => s.classList.add('hidden'));
  sections[name].classList.remove('hidden');
}

// === Login ===
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value;
  const password = $('#password').value;
  $('#login-error').textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { $('#login-error').textContent = data.error; return; }

    authToken = data.token;
    userName = data.name;
    currentEmail = email;

    if (!data.passwordChanged) {
      showSection('pw');
      $('#greeting-msg').textContent = `こんにちは、${data.name}さん！`;
    } else {
      enterMainChat();
    }
  } catch {
    $('#login-error').textContent = '通信エラーが発生しました。';
  }
});

// === Password Change ===
$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cur = $('#cur-pw').value;
  const newPw = $('#new-pw').value;
  const confirm = $('#confirm-pw').value;
  $('#pw-error').textContent = '';

  if (newPw.length < 8) { $('#pw-error').textContent = 'パスワードは8文字以上で設定してください。'; return; }
  if (newPw !== confirm) { $('#pw-error').textContent = '新しいパスワードが一致しません。'; return; }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cur, newPassword: newPw, confirmPassword: confirm }),
    });
    const data = await res.json();
    if (!res.ok) { $('#pw-error').textContent = data.error; return; }
    enterMainChat();
  } catch {
    $('#pw-error').textContent = '通信エラーが発生しました。';
  }
});

// === Logout ===
$('#logout-btn').addEventListener('click', () => {
  authToken = null;
  // 履歴はlocalStorageに保存済みなのでクリアしない
  chatHistory = [];
  collectedData = {};
  $('#messages').innerHTML = '';
  showSection('login');
  $('#email').value = '';
  $('#password').value = '';
});

// === Chat History Persistence (localStorage) ===
function saveHistory() {
  if (!currentEmail) return;
  const data = {
    chatHistory,
    collectedData,
    userName,
  };
  try {
    localStorage.setItem('tobira_chat_' + currentEmail, JSON.stringify(data));
  } catch { /* localStorage full — ignore */ }
}

function loadHistory() {
  if (!currentEmail) return false;
  try {
    const raw = localStorage.getItem('tobira_chat_' + currentEmail);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.chatHistory && data.chatHistory.length > 0) {
      chatHistory = data.chatHistory;
      collectedData = data.collectedData || {};
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function restoreMessages() {
  const container = $('#messages');
  container.innerHTML = '';
  chatHistory.forEach(msg => {
    if (msg.role === 'user') {
      addMessage('user', msg.content, null, true);
    } else {
      const display = cleanDisplayText(msg.content);
      addMessage('ai', display, null, true);
    }
  });
  updateProgress();
  // COLLECTION_COMPLETEチェック
  const lastAssistant = [...chatHistory].reverse().find(m => m.role === 'assistant');
  if (lastAssistant && lastAssistant.content.includes('COLLECTION_COMPLETE')) {
    $('#generate-btn').disabled = false;
  }
}

// === Enter Main Chat ===
function enterMainChat() {
  showSection('main');
  $('#display-name').textContent = userName;

  // 既存の履歴があるか確認
  if (loadHistory()) {
    // 既存の会話を復元
    const banner = $('#welcome-banner');
    if (banner) banner.classList.add('hidden');
    restoreMessages();
  } else {
    // AIに初回メッセージを送って会話を開始
    chatHistory.push({ role: 'user', content: `こんにちは。私の名前は${userName}です。応募書類の作成をお願いします。` });
    sendToAI();
  }
}

// === Chat ===
let canSubmit = false;

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!canSubmit) return;
  canSubmit = false;

  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;

  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';

  sendToAI();
});

$('#send-btn').addEventListener('click', () => {
  canSubmit = true;
});

$('#chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.keyCode === 13) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey) {
      e.preventDefault();
      canSubmit = true;
      $('#chat-form').dispatchEvent(new Event('submit'));
    }
  }
});

// === Clean display text (remove JSON, tags) ===
function cleanDisplayText(text) {
  return text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```JSON[\s\S]*?```/g, '')
    .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
    .replace(/\[QUICK_REPLY:.*?\]/g, '')
    .replace(/\[DATE_PICKER\]/g, '')
    .replace(/\[POSTAL_INPUT\]/g, '')
    .replace(/COLLECTION_COMPLETE/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendToAI() {
  const banner = $('#welcome-banner');
  if (banner) banner.classList.add('hidden');

  const typing = $('#typing-indicator');
  const sendBtn = $('#send-btn');
  typing.classList.remove('hidden');
  sendBtn.disabled = true;
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const reply = data.reply;

    // JSONデータを抽出して進捗更新
    extractAndUpdateData(reply);

    // クイックリプライを抽出
    const quickReplies = extractQuickReplies(reply);

    // 特殊UIタグを検出
    const hasDatePicker = reply.includes('[DATE_PICKER]');
    const hasPostalInput = reply.includes('[POSTAL_INPUT]');

    // 表示用テキスト
    const displayText = cleanDisplayText(reply);

    chatHistory.push({ role: 'assistant', content: reply });
    addMessage('ai', displayText, quickReplies, false, { hasDatePicker, hasPostalInput });

    // COLLECTION_COMPLETEチェック
    if (reply.includes('COLLECTION_COMPLETE')) {
      $('#generate-btn').disabled = false;
    }

    // 履歴保存
    saveHistory();
  } catch (err) {
    addMessage('ai', 'エラーが発生しました: ' + err.message);
  } finally {
    typing.classList.add('hidden');
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

function extractQuickReplies(text) {
  const match = text.match(/\[QUICK_REPLY:\s*(.+?)\]/);
  if (!match) return [];
  return match[1].split('|').map(s => s.trim()).filter(Boolean);
}

function addMessage(type, text, quickReplies, isRestore, specialUI) {
  const container = $('#messages');
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = type === 'ai' ? 'T' : userName.charAt(0);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatMessage(text);

  div.appendChild(avatar);
  div.appendChild(bubble);

  // クイックリプライボタン（復元時は表示しない）
  if (!isRestore && type === 'ai' && quickReplies && quickReplies.length > 0) {
    const qrContainer = document.createElement('div');
    qrContainer.className = 'quick-replies';
    quickReplies.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'quick-reply-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        qrContainer.remove();
        addMessage('user', label);
        chatHistory.push({ role: 'user', content: label });
        sendToAI();
      });
      qrContainer.appendChild(btn);
    });
    div.appendChild(qrContainer);
  }

  // 特殊UI（日付ピッカー、郵便番号入力）
  if (!isRestore && specialUI) {
    if (specialUI.hasDatePicker) {
      const picker = createDatePicker();
      div.appendChild(picker);
    }
    if (specialUI.hasPostalInput) {
      const postal = createPostalInput();
      div.appendChild(postal);
    }
  }

  container.appendChild(div);
  if (!isRestore) scrollToBottom();
}

function formatMessage(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  const msgs = $('#messages');
  requestAnimationFrame(() => {
    msgs.scrollTop = msgs.scrollHeight;
  });
}

// === Date Picker (scroll-style) ===
function createDatePicker() {
  const wrapper = document.createElement('div');
  wrapper.className = 'date-picker-widget';
  wrapper.innerHTML = `
    <div class="date-picker-inner">
      <div class="date-col">
        <label>年</label>
        <select class="date-year"></select>
      </div>
      <div class="date-col">
        <label>月</label>
        <select class="date-month"></select>
      </div>
      <div class="date-col">
        <label>日</label>
        <select class="date-day"></select>
      </div>
    </div>
    <button class="btn-date-confirm">この日付で送信</button>
  `;

  const yearSel = wrapper.querySelector('.date-year');
  const monthSel = wrapper.querySelector('.date-month');
  const daySel = wrapper.querySelector('.date-day');

  // 年: 1940〜2010
  for (let y = 2010; y >= 1940; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年';
    if (y === 1993) opt.selected = true;
    yearSel.appendChild(opt);
  }
  // 月
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '月';
    monthSel.appendChild(opt);
  }
  // 日
  function updateDays() {
    const y = parseInt(yearSel.value);
    const m = parseInt(monthSel.value);
    const maxDay = new Date(y, m, 0).getDate();
    const curDay = parseInt(daySel.value) || 1;
    daySel.innerHTML = '';
    for (let d = 1; d <= maxDay; d++) {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d + '日';
      if (d === Math.min(curDay, maxDay)) opt.selected = true;
      daySel.appendChild(opt);
    }
  }
  yearSel.addEventListener('change', updateDays);
  monthSel.addEventListener('change', updateDays);
  updateDays();

  wrapper.querySelector('.btn-date-confirm').addEventListener('click', () => {
    const y = yearSel.value;
    const m = monthSel.value;
    const d = daySel.value;
    const dateStr = `${y}年${m}月${d}日`;
    wrapper.remove();
    addMessage('user', dateStr);
    chatHistory.push({ role: 'user', content: dateStr });
    sendToAI();
  });

  return wrapper;
}

// === Postal Code Input ===
function createPostalInput() {
  const wrapper = document.createElement('div');
  wrapper.className = 'postal-widget';
  wrapper.innerHTML = `
    <div class="postal-row">
      <span class="postal-prefix">〒</span>
      <input type="text" class="postal-input" maxlength="8" inputmode="numeric" placeholder="000-0000">
      <button class="btn-postal-search" disabled>検索</button>
    </div>
    <div class="postal-result hidden">
      <p class="postal-address-text"></p>
      <input type="text" class="postal-detail" placeholder="番地・建物名を入力">
      <button class="btn-postal-confirm">この住所で送信</button>
    </div>
  `;

  const input = wrapper.querySelector('.postal-input');
  const searchBtn = wrapper.querySelector('.btn-postal-search');
  const resultDiv = wrapper.querySelector('.postal-result');
  const addrText = wrapper.querySelector('.postal-address-text');
  const detailInput = wrapper.querySelector('.postal-detail');
  const confirmBtn = wrapper.querySelector('.btn-postal-confirm');

  let foundAddress = '';

  // 自動ハイフン挿入 + 7桁で自動検索
  input.addEventListener('input', () => {
    let v = input.value.replace(/[^0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 7);
    input.value = v;
    searchBtn.disabled = v.replace('-', '').length < 7;

    if (v.replace('-', '').length === 7) {
      lookupPostal(v.replace('-', ''));
    }
  });

  searchBtn.addEventListener('click', () => {
    const code = input.value.replace(/[^0-9]/g, '');
    if (code.length === 7) lookupPostal(code);
  });

  async function lookupPostal(code) {
    searchBtn.textContent = '検索中...';
    searchBtn.disabled = true;
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        foundAddress = r.address1 + r.address2 + r.address3;
        addrText.textContent = foundAddress;
        resultDiv.classList.remove('hidden');
        detailInput.focus();
      } else {
        addrText.textContent = '該当する住所が見つかりませんでした。';
        resultDiv.classList.remove('hidden');
      }
    } catch {
      addrText.textContent = '検索に失敗しました。';
      resultDiv.classList.remove('hidden');
    }
    searchBtn.textContent = '検索';
    searchBtn.disabled = false;
  }

  confirmBtn.addEventListener('click', () => {
    const postal = input.value;
    const detail = detailInput.value.trim();
    const fullAddress = foundAddress + (detail ? detail : '');
    const msg = `郵便番号: ${postal}\n住所: ${fullAddress}`;
    wrapper.remove();
    addMessage('user', msg);
    chatHistory.push({ role: 'user', content: msg });
    sendToAI();
  });

  return wrapper;
}

// === Data Extraction & Progress ===
function extractAndUpdateData(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return;

  try {
    const data = JSON.parse(jsonMatch[1]);
    collectedData = { ...collectedData, ...data };
    updateProgress();
  } catch {
    // JSONパースエラーは無視
  }
}

const FIELD_MAP = {
  fullname: ['fullname', 'furigana'],
  birthDate: ['birthDate', 'age'],
  address: ['address', 'postalCode', 'phone'],
  education: ['education'],
  qualifications: ['qualifications'],
  careers: ['careers'],
  motivation: ['motivation'],
  personality: ['personality', 'hobbies', 'volunteer', 'interests'],
  essayValues: ['essayValues', 'essayExperience', 'essayVision'],
};

function updateProgress() {
  let filled = 0;
  const total = Object.keys(FIELD_MAP).length;

  Object.entries(FIELD_MAP).forEach(([field, keys]) => {
    const li = $(`[data-field="${field}"]`);
    const isFilled = keys.some(k => {
      const val = collectedData[k];
      if (Array.isArray(val)) return val.length > 0;
      return val && val.toString().trim() !== '';
    });

    if (isFilled) {
      li.classList.add('filled');
      filled++;
    } else {
      li.classList.remove('filled');
    }
  });

  const pct = Math.round((filled / total) * 100);
  $('#progress-pct').textContent = pct + '%';

  const circle = $('#progress-circle');
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - pct / 100);
  circle.style.strokeDashoffset = offset;
}

// === Generate Draft ===
$('#generate-btn').addEventListener('click', async () => {
  const btn = $('#generate-btn');
  btn.disabled = true;
  btn.textContent = '生成中...';

  try {
    const res = await fetch('/api/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: collectedData }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentDraft = data.draft;
    currentStructured = data.structured;

    if (currentStructured) {
      renderApplicationForm(currentStructured);
    } else {
      $('#app-form-preview').innerHTML = markdownToHtml(data.draft);
    }
    $('#draft-modal').classList.remove('hidden');
  } catch (err) {
    alert('ドラフト生成エラー: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
      ドラフトを生成`;
  }
});

// === Application Form Preview ===
function renderApplicationForm(d) {
  const eduRows = (d.education || []).map(e =>
    `<tr><td>${e.period || ''}</td><td>${e.school || ''}</td><td>${e.status || ''}</td></tr>`
  ).join('');

  const qualRows = (d.qualifications || []).map(q =>
    `<tr><td>${q.date || ''}</td><td>${q.name || ''}</td><td>${q.status || ''}</td></tr>`
  ).join('');

  const careerRows = (d.careers || []).map(c =>
    `<tr>
      <td>${c.period || ''}</td>
      <td>${c.company || ''}（${c.industry || ''}）</td>
      <td>${c.position || ''} / ${c.type || ''}</td>
    </tr>
    <tr><td colspan="3" class="career-detail">${c.detail || ''}</td></tr>`
  ).join('');

  const html = `
    <div class="form-page">
      <h2 class="form-title">嘱託職員募集申込書</h2>
      <p class="form-subtitle">社会福祉法人 小平市社会福祉協議会</p>

      <table class="form-table">
        <tr><th>氏名</th><td>${d.fullname || '【要記入】'}</td><th>ふりがな</th><td>${d.furigana || '【要記入】'}</td></tr>
        <tr><th>生年月日</th><td>${d.birthDate || '【要記入】'}</td><th>年齢</th><td>${d.age ? d.age + '歳' : '【要記入】'}</td></tr>
        <tr><th>郵便番号</th><td>${d.postalCode || '【要記入】'}</td><th>電話番号</th><td>${d.phone || '【要記入】'}</td></tr>
        <tr><th>住所</th><td colspan="3">${d.address || '【要記入】'}</td></tr>
        <tr><th>昼間の連絡先</th><td colspan="3">${d.daytimePhone || '【要記入】'}</td></tr>
      </table>

      <h3 class="form-section-title">学歴</h3>
      <table class="form-table form-table-list">
        <thead><tr><th>期間</th><th>学校名</th><th>状態</th></tr></thead>
        <tbody>${eduRows || '<tr><td colspan="3">【要記入】</td></tr>'}</tbody>
      </table>

      <h3 class="form-section-title">資格</h3>
      <table class="form-table form-table-list">
        <thead><tr><th>取得年月</th><th>資格名</th><th>状態</th></tr></thead>
        <tbody>${qualRows || '<tr><td colspan="3">【要記入】</td></tr>'}</tbody>
      </table>

      <h3 class="form-section-title">志望の動機</h3>
      <div class="form-text-box">${d.motivation || '【要記入】'}</div>

      <div class="form-grid-2">
        <div>
          <h3 class="form-section-title">趣味・特技</h3>
          <div class="form-text-box-sm">${d.hobbies || '【要記入】'}</div>
        </div>
        <div>
          <h3 class="form-section-title">自覚している性格</h3>
          <div class="form-text-box-sm">${d.personality || '【要記入】'}</div>
        </div>
      </div>

      <div class="form-grid-2">
        <div>
          <h3 class="form-section-title">ボランティア等の経験</h3>
          <div class="form-text-box-sm">${d.volunteer || '【要記入】'}</div>
        </div>
        <div>
          <h3 class="form-section-title">興味関心</h3>
          <div class="form-text-box-sm">${d.interests || '【要記入】'}</div>
        </div>
      </div>

      <h3 class="form-section-title">本人希望記入欄</h3>
      <div class="form-text-box-sm">${d.requests || '【要記入】'}</div>
    </div>

    <div class="form-page">
      <h2 class="form-title">職務経歴書</h2>
      <table class="form-table form-table-list">
        <thead><tr><th>期間</th><th>勤務先</th><th>職種 / 雇用形態</th></tr></thead>
        <tbody>${careerRows || '<tr><td colspan="3">【要記入】</td></tr>'}</tbody>
      </table>
    </div>

    <div class="form-page">
      <h2 class="form-title">課題式作文</h2>
      <p class="form-essay-topic">題目：「障がい者・児の相談業務及び一般事務」に対する基本的な姿勢について</p>
      <div class="form-essay-body">${(d.essay || '【要記入】').replace(/\n/g, '<br>')}</div>
      <p class="form-char-count">${d.essay ? d.essay.length + '字' : ''}</p>
    </div>
  `;

  $('#app-form-preview').innerHTML = html;
}

// === Edit Draft ===
async function editDraft() {
  const editInput = $('#edit-input');
  const request = editInput.value.trim();
  if (!request) return;

  const btn = $('#edit-btn');
  btn.disabled = true;
  btn.textContent = '修正中...';

  try {
    const res = await fetch('/api/edit-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentDraft, editRequest: request }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentDraft = data.draft;
    // 修正後のテキストからJSONを再抽出
    const jsonMatch = data.draft.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        currentStructured = JSON.parse(jsonMatch[1]);
        renderApplicationForm(currentStructured);
      } catch {
        $('#app-form-preview').innerHTML = markdownToHtml(data.draft);
      }
    } else {
      $('#app-form-preview').innerHTML = markdownToHtml(data.draft);
    }
    editInput.value = '';
  } catch (err) {
    alert('修正エラー: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '修正';
  }
}

function closeDraftModal() {
  $('#draft-modal').classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeDraftModal();
  }
});

function markdownToHtml(text) {
  return text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```JSON[\s\S]*?```/g, '')
    .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// === Export Functions ===
function exportPDF() {
  const printArea = $('#app-form-preview').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>申込書 - 印刷用</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Noto Sans JP', sans-serif; padding: 20px; color: #1E293B; }
      .form-page { page-break-after: always; margin-bottom: 40px; }
      .form-page:last-child { page-break-after: auto; }
      .form-title { text-align: center; font-size: 1.4rem; margin-bottom: 4px; }
      .form-subtitle { text-align: center; font-size: 0.9rem; color: #475569; margin-bottom: 20px; }
      .form-section-title { font-size: 0.95rem; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #3B82F6; }
      .form-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      .form-table th, .form-table td { border: 1px solid #CBD5E1; padding: 8px 10px; font-size: 0.88rem; text-align: left; }
      .form-table th { background: #F1F5F9; font-weight: 600; width: 120px; white-space: nowrap; }
      .form-table-list th { background: #EFF6FF; text-align: center; }
      .form-table-list td { text-align: center; }
      .career-detail { text-align: left !important; font-size: 0.85rem; color: #475569; background: #F8FAFC; }
      .form-text-box, .form-text-box-sm { border: 1px solid #CBD5E1; padding: 12px; border-radius: 4px; font-size: 0.9rem; line-height: 1.8; }
      .form-text-box-sm { min-height: 48px; }
      .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .form-essay-topic { font-size: 0.9rem; color: #475569; margin-bottom: 12px; font-style: italic; }
      .form-essay-body { border: 1px solid #CBD5E1; padding: 16px; font-size: 0.92rem; line-height: 2; min-height: 400px; }
      .form-char-count { text-align: right; font-size: 0.8rem; color: #94A3B8; margin-top: 4px; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>${printArea}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function exportText() {
  let text = '';
  if (currentStructured) {
    const d = currentStructured;
    text += `嘱託職員募集申込書\n社会福祉法人 小平市社会福祉協議会\n\n`;
    text += `【基本情報】\n`;
    text += `氏名: ${d.fullname || ''}\nふりがな: ${d.furigana || ''}\n`;
    text += `生年月日: ${d.birthDate || ''}\n年齢: ${d.age || ''}歳\n`;
    text += `郵便番号: ${d.postalCode || ''}\n住所: ${d.address || ''}\n`;
    text += `電話番号: ${d.phone || ''}\n昼間の連絡先: ${d.daytimePhone || ''}\n\n`;

    text += `【学歴】\n`;
    (d.education || []).forEach(e => { text += `${e.period} ${e.school} ${e.status}\n`; });
    text += `\n【資格】\n`;
    (d.qualifications || []).forEach(q => { text += `${q.date} ${q.name} ${q.status}\n`; });
    text += `\n【職務経歴】\n`;
    (d.careers || []).forEach(c => {
      text += `${c.period} ${c.company}（${c.industry}）${c.position} / ${c.type}\n`;
      text += `  ${c.detail}\n`;
    });
    text += `\n【志望の動機】\n${d.motivation || ''}\n`;
    text += `\n【趣味・特技】\n${d.hobbies || ''}\n`;
    text += `\n【ボランティア等の経験】\n${d.volunteer || ''}\n`;
    text += `\n【興味関心】\n${d.interests || ''}\n`;
    text += `\n【自覚している性格】\n${d.personality || ''}\n`;
    text += `\n【本人希望記入欄】\n${d.requests || ''}\n`;
    text += `\n【課題式作文】\n題目：「障がい者・児の相談業務及び一般事務」に対する基本的な姿勢について\n\n`;
    text += d.essay || '';
  } else {
    text = currentDraft;
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '申込書ドラフト.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// togglePw is defined at top and used by onclick in HTML
