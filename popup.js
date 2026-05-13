// -------------------- DOM elements --------------------
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const questionInput = document.getElementById('questionInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const conversationPanel = document.getElementById('conversationPanel');
const statusSpan = document.getElementById('statusMsg');

// -------------------- Global state --------------------
let conversationHistory = [];      // stores {role, content} for AI context (max 5 pairs)
let displayMessages = [];          // stores {role, text, timestamp} for UI

// Predefined app links (presaved)
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

// Helper: sanitize text for display/speech – no emojis, no JSON, no * @ # symbols
function sanitizeText(text) {
  if (!text) return '';
  // remove markdown code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  // remove JSON-like structures
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');
  // remove special symbols *, @, #, _, ~, `, |, >, <
  cleaned = cleaned.replace(/[*@#_~`|<>]/g, '');
  // remove emojis (Unicode emoji range)
  cleaned = cleaned.replace(/[\p{Emoji}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  // remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Text-to-speech (clear english, no code sounds)
function speakResponse(text) {
  const clean = sanitizeText(text);
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// Render conversation UI
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
  }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
    return '';
  });
}

// Add message to UI and memory (for AI context)
function addMessage(role, text, addToAIHistory = true) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
  displayMessages.push({ role, text, timestamp });
  if (displayMessages.length > 100) displayMessages.shift(); // UI limit
  renderUI();

  if (addToAIHistory && role === 'user') {
    conversationHistory.push({ role: 'user', content: text });
    // trim to last 5 exchanges (5 user msgs + 5 assistant = 10 total but we keep 5 pairs)
    while (conversationHistory.length > 10) conversationHistory.shift();
  } else if (addToAIHistory && role === 'assistant') {
    conversationHistory.push({ role: 'assistant', content: text });
    while (conversationHistory.length > 10) conversationHistory.shift();
  }
  // Save to chrome storage for persistence
  chrome.storage.local.set({ zara_history: conversationHistory, zara_display: displayMessages.slice(-50) });
}

// Load stored messages
async function loadMemory() {
  const data = await chrome.storage.local.get(['zara_history', 'zara_display']);
  if (data.zara_history && Array.isArray(data.zara_history)) conversationHistory = data.zara_history;
  if (data.zara_display && Array.isArray(data.zara_display)) {
    displayMessages = data.zara_display;
    renderUI();
  }
}

// Clear memory (last 5 msgs)
function clearMemory() {
  conversationHistory = [];
  displayMessages = [];
  chrome.storage.local.remove(['zara_history', 'zara_display']);
  renderUI();
  addMessage('assistant', 'Memory cleared. Our conversation starts fresh.', true);
}

// ---------- LOCAL COMMAND INTELLIGENCE (no token waste) ----------
function handleLocalCommand(commandText) {
  const lower = commandText.toLowerCase().trim();
  
  // Time & Date (no AI)
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

  // Open app command: "open youtube", "open gmail", "open github"
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

  // Search on YouTube: "search physics class 12 on youtube"
  const youtubeSearchMatch = lower.match(/search\s+(.+?)\s+on\s+youtube$/);
  if (youtubeSearchMatch) {
    const query = encodeURIComponent(youtubeSearchMatch[1].trim());
    chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${query}` });
    return `Searching YouTube for "${youtubeSearchMatch[1]}".`;
  }
  // also "play X on youtube" or "find X youtube"
  const altYt = lower.match(/(?:play|find|watch)\s+(.+?)\s+on\s+youtube$/);
  if (altYt) {
    const query = encodeURIComponent(altYt[1].trim());
    chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${query}` });
    return `Searching YouTube for "${altYt[1]}".`;
  }

  return null; // not handled locally -> use AI
}

// ---------- AI call via OpenRouter ----------
async function callOpenRouter(userQuery) {
  const apiKey = await chrome.storage.local.get(['openrouter_key']);
  if (!apiKey.openrouter_key) {
    return "⚠️ Please set your OpenRouter API key in the extension settings first.";
  }
  // Build messages with conversation history (last 5 exchanges)
  const systemMsg = {
    role: 'system',
    content: `You are Zara, a helpful voice assistant. Always answer concisely, clearly, in English. NEVER use emojis, never output JSON, never use symbols like *, @, #, or markdown. Provide high-quality natural answers. Do NOT mention code, brackets, or anything that looks like code.`
  };
  let messages = [systemMsg, ...conversationHistory.slice(-10), { role: 'user', content: userQuery }];
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.openrouter_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
        max_tokens: 300,
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      return `AI error: ${response.status} - ${errText.substring(0, 100)}`;
    }
    const data = await response.json();
    let rawReply = data.choices[0].message.content;
    rawReply = sanitizeText(rawReply);
    return rawReply || "I couldn't generate a proper answer.";
  } catch (err) {
    console.error(err);
    return "Network error. Please check your connection.";
  }
}

// Main processor: check local commands first, else AI
async function processQuery(queryText) {
  if (!queryText.trim()) return;
  // add user message to UI & history
  addMessage('user', queryText, true);
  
  // local command handling (no token)
  const localResponse = handleLocalCommand(queryText);
  if (localResponse) {
    addMessage('assistant', localResponse, true);
    speakResponse(localResponse);
    statusSpan.innerText = '✓ Local command executed.';
    return;
  }
  
  // else call AI
  statusSpan.innerText = '🤖 Zara is thinking (AI)...';
  const aiReply = await callOpenRouter(queryText);
  const cleanReply = sanitizeText(aiReply);
  addMessage('assistant', cleanReply, true);
  speakResponse(cleanReply);
  statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z';
}

// ---------- Voice recognition ----------
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

// ---------- Event listeners & initialization ----------
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

// load saved api key and memory
(async function init() {
  const saved = await chrome.storage.local.get(['openrouter_key']);
  if (saved.openrouter_key) apiKeyInput.value = saved.openrouter_key;
  await loadMemory();
})();
