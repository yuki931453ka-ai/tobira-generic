// === Tobira Chat-Driven App ===

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
let authToken = null;
let userName = '';
let chatHistory = []; // { role, content }
let collectedData = {};
let currentDraft = '';

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
  chatHistory = [];
  collectedData = {};
  $('#messages').innerHTML = '';
  showSection('login');
  $('#email').value = '';
  $('#password').value = '';
});

// === Enter Main Chat ===
function enterMainChat() {
  showSection('main');
  $('#display-name').textContent = userName;
  // AIに初回メッセージを送って会話を開始
  chatHistory.push({ role: 'user', content: `こんにちは。私の名前は${userName}です。応募書類の作成をお願いします。` });
  sendToAI();
}

// === Chat ===
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;

  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';

  sendToAI();
});

// Auto-resize textarea
$('#chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Enter to send (Shift+Enter for newline)
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chat-form').dispatchEvent(new Event('submit'));
  }
});

async function sendToAI() {
  // ウェルカムバナーを非表示
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

    // 表示用テキスト（JSONブロックを除去）
    const displayText = reply.replace(/```json[\s\S]*?```/g, '').trim();

    chatHistory.push({ role: 'assistant', content: reply });
    addMessage('ai', displayText);

    // COLLECTION_COMPLETEチェック
    if (reply.includes('COLLECTION_COMPLETE')) {
      $('#generate-btn').disabled = false;
    }
  } catch (err) {
    addMessage('ai', 'エラーが発生しました: ' + err.message);
  } finally {
    typing.classList.add('hidden');
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

function addMessage(type, text) {
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
  container.appendChild(div);
  scrollToBottom();
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

  // SVG ring
  const circle = $('#progress-circle');
  const circumference = 2 * Math.PI * 42; // r=42
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
    $('#draft-content').innerHTML = markdownToHtml(data.draft);
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
    $('#draft-content').innerHTML = markdownToHtml(data.draft);
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

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeDraftModal();
  }
});

function markdownToHtml(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
