// -------------------- DOM elements --------------------
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document document.getElementById('saveApiKeyBtn');
const questionInput = document.getElementById('questionInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const conversationPanel = document.getElementById('conversationPanel');
const statusSpan = document.getElementById('statusMsg');

// -------------------- SINGLE AI MODEL --------------------
// 👇 CHANGE THIS TO YOUR DESIRED FREE MODEL ID (e.g., "ring-2.6-1t:free" if available on OpenRouter)
// For now using the most powerful free model: Llama 3.3 70B
const AI_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// -------------------- Global state --------------------
let conversationHistory = [];
let displayMessages = [];

// Predefined app links
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

// ---------- SMART CLEAN FOR VOICE (no punctuation, numbers preserved, no emojis) ----------
function cleanForSpeech(text) {
  if (!text) return '';
  // Remove code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  // Remove JSON-like structures
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');
  // Remove symbols but keep letters, numbers, spaces, and apostrophe
  cleaned = cleaned.replace(/[^\w\s']/g, ' ');  // replaces punctuation with space
  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Remove any remaining emojis
  cleaned = cleaned.replace(/[\p{Emoji}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  return cleaned;
}

// Text-to-speech with ultra-clear number pronunciation
function speakResponse(text) {
  const clean = cleanForSpeech(text);
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;      // slightly slower for clarity
  utterance.pitch = 1.0;
  utterance.volume = 1;
  // Cancel any ongoing speech to avoid overlap
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// Also sanitize for display (no emojis, no symbols)
function sanitizeDisplay(text) {
  if (!text) return '';
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');
  cleaned = cleaned.replace(/[*@#_~`|<>]/g, '');
  cleaned = cleaned.replace(/[\p{Emoji}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function renderUI() {
  if (displayMessages.length === 0) {
    conversationPanel.innerHTML = `<div style="text-align:center; color:#6b7280; margin-top:30px;">✨ Ask me anything · open apps · search YouTube</div>`;
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

function addMessage(role, text, addToAIHistory = true) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  displayMessages.push({ role, text, timestamp });
  if (displayMessages.length > 100) displayMessages.shift();
  renderUI();

  if (addToAIHistory && role === 'user') {
    conversationHistory.push({ role: 'user', content: text });
    while (conversationHistory.length > 10) conversationHistory.shift();
  } else if (addToAIHistory && role === 'assistant') {
    conversationHistory.push({ role: 'assistant', content: text });
    while (conversationHistory.length > 10) conversationHistory.shift();
  }
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
  addMessage('assistant', 'Memory cleared. Our conversation starts fresh.', true);
}

// Local commands – NO AI TOKEN WASTE (time, date, open apps, search YouTube)
function handleLocalCommand(commandText) {
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

// Direct AI call with the SINGLE model (no fallback, no model switching)
async function callAI(userQuery) {
  const apiKey = await chrome.storage.local.get(['openrouter_key']);
  if (!apiKey.openrouter_key) {
    return "⚠️ Please set your OpenRouter API key in the extension settings first.";
  }

  const systemMsg = {
    role: 'system',
    content: `You are Zara, a helpful voice assistant. Always answer concisely, clearly, in English. NEVER use emojis, never output JSON, never use symbols like *, @, #, or markdown. Provide high-quality natural answers. Do NOT mention code, brackets, or anything that looks like code.`
  };
  const messages = [systemMsg, ...conversationHistory.slice(-10), { role: 'user', content: userQuery }];

  try {
    statusSpan.innerText = `🤖 Zara is thinking...`;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.openrouter_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: messages,
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        return "⚠️ The AI model is currently rate limited. Please wait a moment and try again.";
      }
      return `AI error (${response.status}). Please check your API key or try again later.`;
    }
    
    const data = await response.json();
    let rawReply = data.choices[0].message.content;
    rawReply = sanitizeDisplay(rawReply);
    return rawReply || "I couldn't generate a proper answer.";
  } catch (err) {
    console.error(err);
    return "Network error. Please check your internet connection.";
  }
}

async function processQuery(queryText) {
  if (!queryText.trim()) return;
  addMessage('user', queryText, true);
  
  // Local commands first (no tokens)
  const localResponse = handleLocalCommand(queryText);
  if (localResponse) {
    addMessage('assistant', localResponse, true);
    speakResponse(localResponse);
    statusSpan.innerText = '✓ Local command executed.';
    return;
  }
  
  // Otherwise use AI
  const aiReply = await callAI(queryText);
  const cleanReply = sanitizeDisplay(aiReply);
  addMessage('assistant', cleanReply, true);
  speakResponse(cleanReply);
  statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z';
}

// ---------- Voice input ----------
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
    processQuery(spoken);
  };
  recognition.onerror = (e) => {
    statusSpan.innerText = `🎤 Voice error: ${e.error}`;
  };
}

// ---------- Event listeners ----------
saveApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    await chrome.storage.local.set({ openrouter_key: key });
    statusSpan.innerText = '✅ API key saved!';
    setTimeout(() => { statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z'; }, 2000);
  } else {
    statusSpan.innerText = '❌ Please enter a valid key';
  }
});

sendBtn.addEventListener('click', () => {
  const q = questionInput.value.trim();
  if (!q) return;
  questionInput.value = '';
  processQuery(q);
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

// Load saved API key and conversation history
(async function init() {
  const saved = await chrome.storage.local.get(['openrouter_key']);
  if (saved.openrouter_key) apiKeyInput.value = saved.openrouter_key;
  await loadMemory();
})();
