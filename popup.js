// popup.js – handles voice (auto-listen on open + button fallback), typed chat, one command then stop.

let recognition = null;
let isListening = false;
let apiKey = '';
let model = '';

// DOM elements
const voiceBtn = document.getElementById('voiceBtn');
const voiceStatus = document.getElementById('voiceStatus');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const modelSelect = document.getElementById('modelSelect');

// Load settings
async function loadSettings() {
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model']);
    apiKey = result.zara_openrouter_key || '';
    model = result.zara_selected_model || 'ring-2.6-1t:free';
    if (apiKey) apiKeyInput.value = apiKey;
    if (result.zara_selected_model) modelSelect.value = result.zara_selected_model;
}
loadSettings();

// Save API key
saveApiKeyBtn.addEventListener('click', async () => {
    let newKey = apiKeyInput.value.trim();
    if (!newKey.startsWith('sk-or-')) {
        alert('Invalid OpenRouter key (must start with sk-or-)');
        return;
    }
    await chrome.storage.local.set({ zara_openrouter_key: newKey });
    apiKey = newKey;
    alert('API key saved.');
    chrome.runtime.sendMessage({ type: 'updateSettings' });
});

// Save model
modelSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ zara_selected_model: modelSelect.value });
    model = modelSelect.value;
    chrome.runtime.sendMessage({ type: 'updateSettings' });
});

// Add message to chat (both user and assistant)
function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Process a command (send to background, get response, display and speak)
async function processCommand(commandText, isUserMessage = true) {
    if (isUserMessage) addMessage(commandText, 'user');
    
    // Show thinking indicator
    const thinkingDiv = document.createElement('div');
    thinkingDiv.classList.add('message', 'assistant', 'thinking');
    thinkingDiv.textContent = '🤔 Thinking...';
    chatMessages.appendChild(thinkingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'processCommand', text: commandText });
        const answer = response.answer;
        // Remove thinking indicator
        thinkingDiv.remove();
        addMessage(answer, 'assistant');
        // Voice is already spoken by background, but we could also speak here if needed
    } catch (err) {
        thinkingDiv.remove();
        addMessage('Error: ' + err.message, 'assistant');
    }
}

// Send typed message
sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';
    processCommand(text, true);
});
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

// ---------- Voice Recognition ----------
function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceStatus.textContent = '❌ Speech not supported';
        voiceBtn.disabled = true;
        return null;
    }
    const recog = new SpeechRecognition();
    recog.continuous = false;   // One command at a time
    recog.interimResults = false;
    recog.lang = 'en-US';
    return recog;
}

function startListening() {
    if (!recognition) {
        recognition = initSpeech();
        if (!recognition) return;
        
        recognition.onstart = () => {
            isListening = true;
            voiceStatus.innerHTML = '🎤 Listening...';
            voiceStatus.className = 'voice-status listening';
            voiceBtn.classList.add('listening');
        };
        
        recognition.onend = () => {
            isListening = false;
            voiceStatus.innerHTML = '⚪ Ready (click to speak)';
            voiceStatus.className = 'voice-status idle';
            voiceBtn.classList.remove('listening');
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            addMessage(transcript, 'user');
            processCommand(transcript, false); // Don't double-add user message
            // Stop listening automatically (already set continuous=false)
            if (recognition) recognition.stop();
        };
        
        recognition.onerror = (e) => {
            console.error('Speech error:', e.error);
            voiceStatus.innerHTML = `⚠️ Error: ${e.error}`;
            voiceStatus.className = 'voice-status error';
            isListening = false;
            if (recognition) recognition.stop();
            setTimeout(() => {
                if (voiceStatus.className !== 'listening') {
                    voiceStatus.innerHTML = '⚪ Ready (click to speak)';
                    voiceStatus.className = 'voice-status idle';
                }
            }, 2000);
        };
    }
    
    if (!isListening) {
        try {
            recognition.start();
        } catch (err) {
            console.error('Could not start recognition:', err);
            voiceStatus.innerHTML = '❌ Mic error. Click again.';
            voiceStatus.className = 'voice-status error';
        }
    }
}

// Manual button click
voiceBtn.addEventListener('click', () => {
    if (isListening) {
        recognition.stop();
    } else {
        startListening();
    }
});

// Auto-listen when popup opens (with small delay to ensure DOM ready)
setTimeout(() => {
    // Only auto-listen if no API key? No, always auto-listen (user can cancel by clicking)
    startListening();
}, 500);

// Keep service worker alive via keepalive ping (optional)
setInterval(() => {
    chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});
}, 25000);
