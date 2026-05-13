// DOM elements
const questionInput = document.getElementById('questionInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const conversationPanel = document.getElementById('conversationPanel');
const statusSpan = document.getElementById('statusMsg');
const alwaysListenToggle = document.getElementById('alwaysListenToggle');

// Global state
let conversationHistory = [];
let displayMessages = [];

// App links
const APP_LINKS = {
  youtube: 'https://www.youtube.com',
  whatsapp: 'https://web.whatsapp.com',
  gmail: 'https://mail.google.com',
  github: 'https://github.com',
  gmap: 'https://maps.google.com',
  chatgpt: 'https://chat.openai.com',
  telegram: 'https://web.telegram.org',
  deepseek: 'https://chat.deepseek.com',
  googlephotos: 'https://photos.google.com',
  googledoc: 'https://docs.google.com',
  spotify: 'https://open.spotify.com',
  'pw.live': 'https://pw.live'
};

// Clean text for speech (no symbols, emojis, but keep numbers)
function cleanText(text) {
  if (!text) return '';
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');
  cleaned = cleaned.replace(/[^\w\s']/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/[\p{Emoji}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  return cleaned;
}

function speakResponse(text) {
  const clean = cleanText(text);
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function renderUI() {
  if (displayMessages.length === 0) {
    conversationPanel.innerHTML = `<div style="text-align:center; color:#6b7280; margin-top:30px;">✨ Ask me anything local: time, date, open apps, search YouTube</div>`;
    return;
  }
  let html = '';
  for (let msg of displayMessages) {
    const bubbleClass = msg.role === 'user' ? 'user-msg' : 'assistant-msg';
    const bubbleInner = msg.role === 'user' ? 'user-bubble' : 'assistant-bubble';
    html += `
      <div class="message ${bubbleClass}">
        <div class="${bubbleInner}">${escapeHtml(msg.text)}</div>
        <div class="timestamp">${msg.timestamp}</div>
      </div>
    `;
  }
  conversationPanel.innerHTML = html;
  conversationPanel.scrollTop = conversationPanel.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function addMessage(role, text) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  const cleanedText = cleanText(text);
  displayMessages.push({ role, text: cleanedText, timestamp });
  if (displayMessages.length > 100) displayMessages.shift();
  renderUI();

  conversationHistory.push({ role, content: cleanedText });
  while (conversationHistory.length > 10) conversationHistory.shift();
  chrome.storage.local.set({ zara_history: conversationHistory, zara_display: displayMessages.slice(-50) });
}

async function loadMemory() {
  const data = await chrome.storage.local.get(['zara_history', 'zara_display']);
  if (data.zara_history && Array.isArray(data.zara_history)) conversationHistory = data.zara_history;
  if (data.zara_display && Array.isArray(data.zara_display)) {
    displayMessages = data.zara_display;
    renderUI();
  }
}

function clearMemory() {
  conversationHistory = [];
  displayMessages = [];
  chrome.storage.local.remove(['zara_history', 'zara_display']);
  renderUI();
  addMessage('assistant', 'Memory cleared. Our conversation starts fresh.');
  speakResponse('Memory cleared. Our conversation starts fresh.');
}

// Local command processor
function processLocalCommand(commandText) {
  const lower = commandText.toLowerCase().trim();
  
  if (lower.includes('what time') || lower === 'time' || lower === 'current time') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
    return `The current time is ${timeStr}.`;
  }
  if (lower.includes('what date') || lower === 'date' || lower.includes("today's date")) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `Today is ${dateStr}.`;
  }

  const openMatch = lower.match(/^open\s+(\w+(?:\.\w+)?)$/);
  if (openMatch) {
    let appKey = openMatch[1];
    if (APP_LINKS[appKey]) {
      chrome.tabs.create({ url: APP_LINKS[appKey] });
      return `Opening ${appKey} for you.`;
    } else {
      return `Sorry, I don't have a saved link for "${appKey}". Available: ${Object.keys(APP_LINKS).join(', ')}`;
    }
  }

  const youtubeSearchMatch = lower.match(/search\s+(.+?)\s+on\s+youtube$/);
  if (youtubeSearchMatch) {
    const query = encodeURIComponent(youtubeSearchMatch[1].trim());
    chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${query}` });
    return `Searching YouTube for "${youtubeSearchMatch[1]}".`;
  }
  const altYt = lower.match(/(?:play|find|watch)\s+(.+?)\s+on\s+youtube$/);
  if (altYt) {
    const query = encodeURIComponent(altYt[1].trim());
    chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${query}` });
    return `Searching YouTube for "${altYt[1]}".`;
  }

  return null;
}

async function handleUserInput(inputText) {
  if (!inputText.trim()) return;
  addMessage('user', inputText);
  
  const response = processLocalCommand(inputText);
  if (response) {
    addMessage('assistant', response);
    speakResponse(response);
    statusSpan.innerText = '✓ Command executed.';
    return;
  }
  
  const unknownMsg = "Sorry, I can only tell time, date, open apps, or search YouTube. Try 'open youtube', 'what time is it?', or 'search cat videos on youtube'.";
  addMessage('assistant', unknownMsg);
  speakResponse(unknownMsg);
  statusSpan.innerText = '⚠️ Unknown command.';
}

// Voice input (manual mic)
let recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    questionInput.value = spoken;
    handleUserInput(spoken);
  };
  recognition.onerror = (e) => {
    statusSpan.innerText = `🎤 Voice error: ${e.error}`;
  };
}

// Toggle always-listen
alwaysListenToggle.addEventListener('change', async () => {
  const enabled = alwaysListenToggle.checked;
  await chrome.runtime.sendMessage({ type: 'setAlwaysListen', enabled });
  statusSpan.innerText = enabled ? 'Always listening (say "Zara...")' : 'Always listening off';
  setTimeout(() => { statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z'; }, 2000);
});

// Load toggle state
chrome.storage.local.get(['alwaysListen'], (result) => {
  alwaysListenToggle.checked = result.alwaysListen === true;
});

// Check for pending voice command from offscreen
const port = chrome.runtime.connect({ name: 'popup' });
port.postMessage({ type: 'getPendingCommand' });
port.onMessage.addListener((msg) => {
  if (msg.command) {
    questionInput.value = msg.command;
    handleUserInput(msg.command);
  }
});

// Event listeners
sendBtn.addEventListener('click', () => {
  const q = questionInput.value.trim();
  if (!q) return;
  questionInput.value = '';
  handleUserInput(q);
});

micBtn.addEventListener('click', () => {
  if (recognition) {
    recognition.start();
    statusSpan.innerText = '🎙️ Listening...';
  } else {
    statusSpan.innerText = 'Voice not supported in this browser.';
  }
});

clearMemoryBtn.addEventListener('click', clearMemory);

questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// Initialise
(async function init() {
  await loadMemory();
  statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z to open Zara';
})();
