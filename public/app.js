// === Tobira Chat-Driven App (汎用版) ===

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let authToken = null;
let userName = '';
let currentEmail = '';
let chatHistory = [];
let collectedData = {};
let currentDraft = '';
let currentStructured = null;
let currentSessionId = null; // 現在のセッションID
let uploadedFiles = []; // セッション内にアップロードしたファイル記録 { name, addedAt }

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
    enterMainChat();
  } catch {
    $('#login-error').textContent = '通信エラーが発生しました。';
  }
});

// === Logout ===
$('#logout-btn').addEventListener('click', () => {
  authToken = null;
  chatHistory = [];
  collectedData = {};
  $('#messages').innerHTML = '';
  showSection('login');
  $('#email').value = '';
  $('#password').value = '';
});

// === Multi-Session Persistence ===
function getSessionsKey() { return 'tobira_sessions_' + currentEmail; }

function getAllSessions() {
  try {
    const raw = localStorage.getItem(getSessionsKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAllSessions(sessions) {
  try { localStorage.setItem(getSessionsKey(), JSON.stringify(sessions)); } catch { /* ignore */ }
}

function saveHistory() {
  if (!currentEmail || !currentSessionId) return;
  try {
    const sessions = getAllSessions();
    const idx = sessions.findIndex(s => s.id === currentSessionId);
    const firstAssistant = chatHistory.find(m => m.role === 'assistant');
    const label = getSessionLabel();
    const msgs = $('#messages');
    const sessionData = {
      id: currentSessionId,
      label,
      updatedAt: new Date().toISOString(),
      chatHistory, collectedData, userName,
      draft: currentDraft || null,
      structured: currentStructured || null,
      uploads: uploadedFiles,
      hasDraft: !!currentDraft,
      scrollTop: msgs ? msgs.scrollTop : 0,
    };
    if (idx >= 0) sessions[idx] = sessionData;
    else sessions.unshift(sessionData);
    saveAllSessions(sessions);
  } catch { /* ignore */ }
}

let savedScrollTop = 0; // セッション復元時のスクロール位置

function getSessionLabel() {
  // collectedDataから名前+応募先を組み立て
  const name = collectedData.fullname || '';
  const target = collectedData.targetCompany || collectedData.targetPosition || '';
  if (name && target) return `${name} - ${target}`;
  if (name) return name;
  // chatHistoryの最初のuserメッセージから推測
  const firstUser = chatHistory.find(m => m.role === 'user');
  if (firstUser) {
    const short = firstUser.content.replace(/【.*?】[\s\S]*$/g, '').slice(0, 40);
    return short || '新規作成';
  }
  return '新規作成';
}

function loadHistory() {
  if (!currentEmail) return false;
  try {
    const sessions = getAllSessions();
    // 旧形式からの移行
    const legacyRaw = localStorage.getItem('tobira_chat_' + currentEmail);
    if (legacyRaw && sessions.length === 0) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy.chatHistory && legacy.chatHistory.length > 0) {
        const sid = 'session_' + Date.now();
        sessions.push({
          id: sid, label: '移行されたセッション',
          updatedAt: new Date().toISOString(),
          chatHistory: legacy.chatHistory,
          collectedData: legacy.collectedData || {},
          userName: legacy.userName || userName,
        });
        saveAllSessions(sessions);
        localStorage.removeItem('tobira_chat_' + currentEmail);
      }
    }
    if (sessions.length === 0) return false;
    // 最新セッションを読み込み
    const latest = sessions[0];
    currentSessionId = latest.id;
    chatHistory = latest.chatHistory;
    collectedData = latest.collectedData || {};
    currentDraft = latest.draft || '';
    currentStructured = latest.structured || null;
    savedScrollTop = latest.scrollTop || 0;
    return true;
  } catch { /* ignore */ }
  return false;
}

function loadSession(sessionId) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  currentSessionId = session.id;
  chatHistory = session.chatHistory;
  collectedData = session.collectedData || {};
  currentDraft = session.draft || '';
  currentStructured = session.structured || null;
  userName = session.userName || userName;
  uploadedFiles = session.uploads || [];
  savedScrollTop = session.scrollTop || 0;
  // UI復元
  $('#messages').innerHTML = '';
  $('#welcome-banner').classList.add('hidden');
  $('#upload-zone').classList.add('hidden');
  restoreMessages();
  if (currentDraft) $('#generate-btn').disabled = false;
}

function deleteSession(sessionId) {
  let sessions = getAllSessions();
  sessions = sessions.filter(s => s.id !== sessionId);
  saveAllSessions(sessions);
}

function restoreMessages() {
  const container = $('#messages');
  container.innerHTML = '';
  chatHistory.forEach(msg => {
    if (msg.role === 'user') {
      addMessage('user', msg.content, null, true);
    } else {
      addMessage('ai', cleanDisplayText(msg.content), null, true);
    }
  });
  updateProgress();
  const lastAssistant = [...chatHistory].reverse().find(m => m.role === 'assistant');
  if (lastAssistant && lastAssistant.content.includes('COLLECTION_COMPLETE')) {
    $('#generate-btn').disabled = false;
  }
  // スクロール位置を復元（保存されていれば復元、なければ最下部へ）
  requestAnimationFrame(() => {
    if (savedScrollTop > 0) {
      container.scrollTop = savedScrollTop;
      savedScrollTop = 0;
    } else {
      container.scrollTop = container.scrollHeight;
    }
  });
}

// === Enter Main Chat ===
let pendingUploads = []; // アップロード待ちファイルのテキスト

function enterMainChat() {
  showSection('main');
  $('#display-name').textContent = userName;

  if (loadHistory()) {
    const banner = $('#welcome-banner');
    if (banner) banner.classList.add('hidden');
    restoreMessages();
  }
  // 履歴がない場合はウェルカムバナーの選択待ち
}

function resetToWelcome() {
  chatHistory = [];
  collectedData = {};
  currentDraft = '';
  currentStructured = null;
  currentSessionId = null;
  pendingUploads = [];
  uploadedFiles = [];
  $('#messages').innerHTML = '';
  $('#upload-zone').classList.add('hidden');
  $('#upload-file-list').innerHTML = '';
  $('#upload-text-input').value = '';
  $('#upload-start-btn').classList.add('hidden');
  $('#welcome-banner').classList.remove('hidden');
  $('#generate-btn').disabled = true;
  $('#progress-pct').textContent = '0%';
  const circle = $('#progress-circle');
  circle.style.strokeDashoffset = 2 * Math.PI * 42;
  $$('.field-list li').forEach(li => li.classList.remove('filled'));
}

// === Start Mode Selection ===
$('#start-scratch').addEventListener('click', () => {
  $('#welcome-banner').classList.add('hidden');
  currentSessionId = 'session_' + Date.now();
  chatHistory.push({ role: 'user', content: `こんにちは。私の名前は${userName}です。応募書類をゼロから作成したいです。` });
  sendToAI();
});

$('#start-upload').addEventListener('click', () => {
  $('#welcome-banner').classList.add('hidden');
  $('#upload-zone').classList.remove('hidden');
  currentSessionId = 'session_' + Date.now();
  pendingUploads = [];
});

// === Upload Zone: Back Button ===
$('#upload-back-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  resetToWelcome();
});

// === History Panel ===
$('#history-btn').addEventListener('click', () => {
  renderHistoryPanel();
  $('#history-panel').classList.remove('hidden');
});
$('#history-close-btn').addEventListener('click', () => {
  $('#history-panel').classList.add('hidden');
});
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('side-panel-overlay')) {
    $('#history-panel').classList.add('hidden');
  }
});

function renderHistoryPanel() {
  const list = $('#history-list');
  const sessions = getAllSessions();
  if (sessions.length === 0) {
    list.innerHTML = '<p class="history-empty">履歴はまだありません</p>';
    return;
  }
  list.innerHTML = '';
  sessions.forEach(s => {
    const item = document.createElement('div');
    item.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
    const date = new Date(s.updatedAt);
    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
    const msgCount = s.chatHistory ? s.chatHistory.length : 0;
    const pct = calcProgressPct(s.collectedData || {});
    const uploadsHtml = (s.uploads && s.uploads.length > 0)
      ? `<div class="history-uploads">📎 ${escapeHtml(s.uploads.map(u => u.name).join(', '))}</div>` : '';
    const draftBadge = s.hasDraft ? ' <span class="history-draft-badge">ドラフト済</span>' : '';
    item.innerHTML = `
      <div class="history-item-main">
        <div class="history-label">${escapeHtml(s.label || '新規作成')}${draftBadge}</div>
        <div class="history-meta">${dateStr} / ${msgCount}メッセージ / 進捗${pct}%</div>
        ${uploadsHtml}
      </div>
      <div class="history-actions">
        <button class="history-load-btn" title="開く">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <button class="history-delete-btn" title="削除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;
    item.querySelector('.history-load-btn').addEventListener('click', () => {
      loadSession(s.id);
      $('#history-panel').classList.add('hidden');
    });
    item.querySelector('.history-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`「${s.label || '新規作成'}」を削除しますか？`)) {
        deleteSession(s.id);
        if (s.id === currentSessionId) resetToWelcome();
        renderHistoryPanel();
      }
    });
    list.appendChild(item);
  });
}

function calcProgressPct(data) {
  let filled = 0;
  const total = Object.keys(FIELD_MAP).length;
  Object.entries(FIELD_MAP).forEach(([, keys]) => {
    const isFilled = keys.some(k => {
      const val = data[k];
      if (Array.isArray(val)) return val.length > 0;
      return val && val.toString().trim() !== '';
    });
    if (isFilled) filled++;
  });
  return Math.round((filled / total) * 100);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// === New Document Button ===
$('#new-doc-btn').addEventListener('click', () => {
  if (chatHistory.length > 0) {
    saveHistory(); // 現在の進捗を保存
  }
  resetToWelcome();
});

// === Upload Zone (書類読み込みモード) ===
const uploadZone = document.getElementById('upload-zone');
const uploadZoneInput = document.getElementById('upload-zone-input');

if (uploadZone) {
  uploadZone.addEventListener('click', (e) => {
    if (e.target.closest('.upload-start-btn') || e.target.closest('.upload-file-item')) return;
    uploadZoneInput.click();
  });
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
  uploadZone.addEventListener('drop', async (e) => {
    e.preventDefault(); uploadZone.classList.remove('dragover');
    await processUploadFiles(e.dataTransfer.files);
  });
}

if (uploadZoneInput) {
  uploadZoneInput.addEventListener('change', async (e) => {
    await processUploadFiles(e.target.files);
    e.target.value = '';
  });
}

async function processUploadFiles(files) {
  const listEl = $('#upload-file-list');
  for (const file of files) {
    const text = await readFileAsText(file);
    if (text) {
      pendingUploads.push({ name: file.name, text });
      uploadedFiles.push({ name: file.name, addedAt: new Date().toISOString() });
      const item = document.createElement('div');
      item.className = 'upload-file-item';
      item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${file.name}</span>`;
      listEl.appendChild(item);
    }
  }
  if (pendingUploads.length > 0) {
    $('#upload-start-btn').classList.remove('hidden');
  }
}

// === Upload Text Input ===
$('#upload-text-add-btn').addEventListener('click', () => {
  const text = $('#upload-text-input').value.trim();
  if (!text) return;
  const label = 'テキスト入力 (' + text.slice(0, 20) + (text.length > 20 ? '...' : '') + ')';
  pendingUploads.push({ name: label, text });
  uploadedFiles.push({ name: label, addedAt: new Date().toISOString() });
  const item = document.createElement('div');
  item.className = 'upload-file-item';
  item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>${escapeHtml(label)}</span>`;
  $('#upload-file-list').appendChild(item);
  $('#upload-text-input').value = '';
  $('#upload-start-btn').classList.remove('hidden');
});

$('#upload-start-btn').addEventListener('click', () => {
  $('#upload-zone').classList.add('hidden');
  if (!currentSessionId) currentSessionId = 'session_' + Date.now();
  const fileNames = pendingUploads.map(f => f.name).join('、');
  let uploadMsg = `こんにちは。私の名前は${userName}です。以下の書類をアップロードしました。内容を読み取って、応募書類の作成をサポートしてください。\n\n`;
  pendingUploads.forEach(f => {
    uploadMsg += `【アップロードされた書類: ${f.name}】\n${f.text}\n\n`;
  });
  addMessage('user', `書類をアップロードしました: ${fileNames}`);
  chatHistory.push({ role: 'user', content: uploadMsg });
  pendingUploads = [];
  sendToAI();
});

// === Mid-chat File Upload (追加アップロード) ===
$('#attach-btn').addEventListener('click', () => { $('#file-input').click(); });

$('#file-input').addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  await handleMidChatUpload(e.target.files);
  e.target.value = '';
});

async function handleMidChatUpload(files) {
  const uploadedData = [];
  for (const file of files) {
    const text = await readFileAsText(file);
    if (text) {
      uploadedData.push({ name: file.name, text });
      uploadedFiles.push({ name: file.name, addedAt: new Date().toISOString() });
    }
  }
  if (uploadedData.length === 0) return;
  const fileNames = uploadedData.map(f => f.name).join('、');
  addMessage('user', `📎 書類を追加: ${fileNames}`);
  showUploadConfirmPrompt(uploadedData);
}

function showUploadConfirmPrompt(uploadedData) {
  const container = $('#messages');
  const div = document.createElement('div');
  div.className = 'msg msg-ai';
  div.innerHTML = `
    <div class="msg-avatar">T</div>
    <div class="msg-bubble">
      <p>書類を追加しました。この書類をどのように活用しますか？</p>
      <div class="upload-confirm-actions">
        <button class="btn-upload-restart">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.12"/></svg>
          このファイルを考慮して最初から作り直す
        </button>
        <button class="btn-upload-continue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          現在の続きに追加して作業を進める
        </button>
      </div>
    </div>
  `;
  div.querySelector('.btn-upload-restart').addEventListener('click', () => {
    div.remove();
    saveHistory();
    chatHistory = [];
    collectedData = {};
    currentDraft = '';
    currentStructured = null;
    currentSessionId = 'session_' + Date.now();
    uploadedFiles = uploadedData.map(f => ({ name: f.name, addedAt: new Date().toISOString() }));
    $('#messages').innerHTML = '';
    $('#generate-btn').disabled = true;
    let uploadMsg = `こんにちは。私の名前は${userName}です。以下の書類をアップロードしました。内容を読み取って、応募書類の作成をサポートしてください。\n\n`;
    uploadedData.forEach(f => { uploadMsg += `【アップロードされた書類: ${f.name}】\n${f.text}\n\n`; });
    addMessage('user', `書類をアップロードして最初から作成: ${uploadedData.map(f => f.name).join('、')}`);
    chatHistory.push({ role: 'user', content: uploadMsg });
    sendToAI();
  });
  div.querySelector('.btn-upload-continue').addEventListener('click', () => {
    div.remove();
    let uploadMsg = `以下の書類を追加でアップロードしました。この内容も考慮して作業を続けてください。\n\n`;
    uploadedData.forEach(f => { uploadMsg += `【追加書類: ${f.name}】\n${f.text}\n\n`; });
    chatHistory.push({ role: 'user', content: uploadMsg });
    sendToAI();
  });
  container.appendChild(div);
  scrollToBottom();
}

function readFileAsText(file) {
  return new Promise((resolve) => {
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.rtf')) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    } else {
      // PDF/Word/画像はファイル名のみ伝える
      resolve(`（${file.name} - ${file.type || '不明な形式'}、${(file.size / 1024).toFixed(1)}KB）\n※このファイルの内容をテキストで貼り付けていただくか、内容を教えてください。`);
    }
  });
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

$('#send-btn').addEventListener('click', () => { canSubmit = true; });

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

// === Clean display text ===
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
    extractAndUpdateData(reply);
    const quickReplies = extractQuickReplies(reply);
    const hasDatePicker = reply.includes('[DATE_PICKER]');
    const hasPostalInput = reply.includes('[POSTAL_INPUT]');
    const displayText = cleanDisplayText(reply);

    chatHistory.push({ role: 'assistant', content: reply });
    addMessage('ai', displayText, quickReplies, false, { hasDatePicker, hasPostalInput });

    if (reply.includes('COLLECTION_COMPLETE')) {
      $('#generate-btn').disabled = false;
    }
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

  if (!isRestore && specialUI) {
    if (specialUI.hasDatePicker) div.appendChild(createDatePicker());
    if (specialUI.hasPostalInput) div.appendChild(createPostalInput());
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
  requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
}

// === Date Picker ===
function createDatePicker() {
  const wrapper = document.createElement('div');
  wrapper.className = 'date-picker-widget';
  wrapper.innerHTML = `
    <div class="date-picker-inner">
      <div class="date-col"><label>年</label><select class="date-year"></select></div>
      <div class="date-col"><label>月</label><select class="date-month"></select></div>
      <div class="date-col"><label>日</label><select class="date-day"></select></div>
    </div>
    <button class="btn-date-confirm">この日付で送信</button>
  `;
  const yearSel = wrapper.querySelector('.date-year');
  const monthSel = wrapper.querySelector('.date-month');
  const daySel = wrapper.querySelector('.date-day');
  for (let y = 2010; y >= 1940; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年';
    if (y === 1993) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '月';
    monthSel.appendChild(opt);
  }
  function updateDays() {
    const y = parseInt(yearSel.value), m = parseInt(monthSel.value);
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
    const dateStr = `${yearSel.value}年${monthSel.value}月${daySel.value}日`;
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

  input.addEventListener('input', () => {
    let v = input.value.replace(/[^0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 7);
    input.value = v;
    searchBtn.disabled = v.replace('-', '').length < 7;
    if (v.replace('-', '').length === 7) lookupPostal(v.replace('-', ''));
  });
  searchBtn.addEventListener('click', () => {
    const code = input.value.replace(/[^0-9]/g, '');
    if (code.length === 7) lookupPostal(code);
  });

  async function lookupPostal(code) {
    searchBtn.textContent = '検索中...'; searchBtn.disabled = true;
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
    searchBtn.textContent = '検索'; searchBtn.disabled = false;
  }

  confirmBtn.addEventListener('click', () => {
    const postal = input.value;
    const detail = detailInput.value.trim();
    const msg = `郵便番号: ${postal}\n住所: ${foundAddress}${detail}`;
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
  } catch { /* ignore */ }
}

const FIELD_MAP = {
  fullname: ['fullname', 'furigana'],
  birthDate: ['birthDate', 'age'],
  address: ['address', 'postalCode', 'phone', 'contactEmail'],
  education: ['education'],
  qualifications: ['qualifications'],
  careers: ['careers'],
  motivation: ['motivation'],
  personality: ['personality', 'selfPR', 'hobbies', 'strengths'],
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
    if (isFilled) { li.classList.add('filled'); filled++; }
    else { li.classList.remove('filled'); }
  });
  const pct = Math.round((filled / total) * 100);
  $('#progress-pct').textContent = pct + '%';
  const circle = $('#progress-circle');
  const circumference = 2 * Math.PI * 42;
  circle.style.strokeDashoffset = circumference * (1 - pct / 100);
}

// === Generate Draft ===
$('#generate-btn').addEventListener('click', async () => {
  const btn = $('#generate-btn');
  btn.disabled = true; btn.textContent = '生成中...';
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
    if (currentStructured) renderApplicationForm(currentStructured);
    else $('#app-form-preview').innerHTML = markdownToHtml(data.draft);
    $('#draft-modal').classList.remove('hidden');
  } catch (err) {
    alert('ドラフト生成エラー: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> ドラフトを生成`;
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
    `<tr><td>${c.period || ''}</td><td>${c.company || ''}（${c.industry || ''}）</td><td>${c.position || ''} / ${c.type || ''}</td></tr>
     <tr><td colspan="3" class="career-detail">${c.detail || ''}</td></tr>`
  ).join('');

  const html = `
    <div class="form-page">
      <h2 class="form-title">履歴書</h2>
      <table class="form-table">
        <tr><th>氏名</th><td>${d.fullname || '【要記入】'}</td><th>ふりがな</th><td>${d.furigana || '【要記入】'}</td></tr>
        <tr><th>生年月日</th><td>${d.birthDate || '【要記入】'}</td><th>年齢</th><td>${d.age ? d.age + '歳' : '【要記入】'}</td></tr>
        <tr><th>郵便番号</th><td>${d.postalCode || '【要記入】'}</td><th>電話番号</th><td>${d.phone || '【要記入】'}</td></tr>
        <tr><th>住所</th><td colspan="3">${d.address || '【要記入】'}</td></tr>
        <tr><th>メール</th><td colspan="3">${d.contactEmail || '【要記入】'}</td></tr>
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
      <h3 class="form-section-title">自己PR</h3>
      <div class="form-text-box">${d.selfPR || '【要記入】'}</div>
      <div class="form-grid-2">
        <div><h3 class="form-section-title">趣味・特技</h3><div class="form-text-box-sm">${d.hobbies || '【要記入】'}</div></div>
        <div><h3 class="form-section-title">自覚している性格</h3><div class="form-text-box-sm">${d.personality || '【要記入】'}</div></div>
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
    ${d.additionalContent ? `<div class="form-page"><h2 class="form-title">追加書類</h2><div class="form-essay-body">${(d.additionalContent || '').replace(/\n/g, '<br>')}</div></div>` : ''}
  `;
  $('#app-form-preview').innerHTML = html;
}

// === Edit Draft ===
async function editDraft() {
  const editInput = $('#edit-input');
  const request = editInput.value.trim();
  if (!request) return;
  const btn = $('#edit-btn');
  btn.disabled = true; btn.textContent = '修正中...';
  try {
    const res = await fetch('/api/edit-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentDraft, editRequest: request }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentDraft = data.draft;
    const jsonMatch = data.draft.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try { currentStructured = JSON.parse(jsonMatch[1]); renderApplicationForm(currentStructured); }
      catch { $('#app-form-preview').innerHTML = markdownToHtml(data.draft); }
    } else { $('#app-form-preview').innerHTML = markdownToHtml(data.draft); }
    editInput.value = '';
  } catch (err) { alert('修正エラー: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = '修正'; }
}

function closeDraftModal() { $('#draft-modal').classList.add('hidden'); }
document.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) closeDraftModal(); });

function markdownToHtml(text) {
  return text
    .replace(/```json[\s\S]*?```/g, '').replace(/```JSON[\s\S]*?```/g, '').replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}

// === Export ===
function exportPDF() {
  const printArea = $('#app-form-preview').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>応募書類</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Noto Sans JP',sans-serif;padding:20px;color:#1E293B}
      .form-page{page-break-after:always;margin-bottom:40px}.form-page:last-child{page-break-after:auto}
      .form-title{text-align:center;font-size:1.4rem;margin-bottom:20px}
      .form-section-title{font-size:.95rem;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #06B6D4}
      .form-table{width:100%;border-collapse:collapse;margin-bottom:16px}
      .form-table th,.form-table td{border:1px solid #CBD5E1;padding:8px 10px;font-size:.88rem;text-align:left}
      .form-table th{background:#F1F5F9;font-weight:600;width:120px;white-space:nowrap}
      .form-table-list th{background:#ECFEFF;text-align:center}.form-table-list td{text-align:center}
      .career-detail{text-align:left!important;font-size:.85rem;color:#475569;background:#F8FAFC}
      .form-text-box,.form-text-box-sm{border:1px solid #CBD5E1;padding:12px;border-radius:4px;font-size:.9rem;line-height:1.8}
      .form-text-box-sm{min-height:48px}.form-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .form-essay-body{border:1px solid #CBD5E1;padding:16px;font-size:.92rem;line-height:2;min-height:300px}
      @media print{body{padding:0}}
    </style></head><body>${printArea}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function exportText() {
  let text = '';
  if (currentStructured) {
    const d = currentStructured;
    text += `履歴書\n\n【基本情報】\n氏名: ${d.fullname||''}\nふりがな: ${d.furigana||''}\n`;
    text += `生年月日: ${d.birthDate||''}\n年齢: ${d.age||''}歳\n郵便番号: ${d.postalCode||''}\n住所: ${d.address||''}\n`;
    text += `電話番号: ${d.phone||''}\nメール: ${d.contactEmail||''}\n\n`;
    text += `【学歴】\n`;
    (d.education||[]).forEach(e=>{text+=`${e.period} ${e.school} ${e.status}\n`});
    text += `\n【資格】\n`;
    (d.qualifications||[]).forEach(q=>{text+=`${q.date} ${q.name} ${q.status}\n`});
    text += `\n【職務経歴】\n`;
    (d.careers||[]).forEach(c=>{text+=`${c.period} ${c.company}（${c.industry}）${c.position}/${c.type}\n  ${c.detail}\n`});
    text += `\n【志望の動機】\n${d.motivation||''}\n\n【自己PR】\n${d.selfPR||''}\n`;
    text += `\n【趣味・特技】\n${d.hobbies||''}\n\n【性格】\n${d.personality||''}\n`;
    text += `\n【本人希望】\n${d.requests||''}\n`;
    if (d.additionalContent) text += `\n【追加書類】\n${d.additionalContent}\n`;
  } else { text = currentDraft; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '応募書類ドラフト.txt'; a.click();
  URL.revokeObjectURL(url);
}
