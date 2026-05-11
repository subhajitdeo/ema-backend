// ==================== BACKGROUND SERVICE WORKER ====================
// Runs 24/7, listens for voice commands, manages tabs, summarises pages

let openRouterApiKey = '';
let model = 'ring-2.6-1t:free';
let isListening = false;
let recognition = null;
let synth = window.speechSynthesis;
let availableVoices = [];
let continuousMode = true;
let isSpeaking = false;
let zaraMemory = {};

// ---------- Load memory and API key ----------
async function loadMemory() {
    const result = await chrome.storage.local.get(['zara_memory', 'zara_openrouter_key', 'zara_selected_model']);
    openRouterApiKey = result.zara_openrouter_key || '';
    model = result.zara_selected_model || 'ring-2.6-1t:free';
    zaraMemory = result.zara_memory || { name: 'boss', interests: [], conversationCount: 0 };
    if (!zaraMemory.name) zaraMemory.name = 'boss';
}
loadMemory();

// ---------- Voice preparation ----------
function loadVoices() { availableVoices = speechSynthesis.getVoices(); }
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;

function speakText(text) {
    if (!synth) return;
    let cleanText = text.replace(/[^\w\s.,!?;:()-]/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;
    if (synth.speaking) synth.cancel();
    isSpeaking = true;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    const voices = availableVoices.length ? availableVoices : synth.getVoices();
    let selectedVoice = voices.find(v => v.name === "Google UK English Female");
    if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes("UK") && v.name.includes("Female"));
    if (!selectedVoice) selectedVoice = voices.find(v => v.name === "Microsoft Hazel");
    if (!selectedVoice) selectedVoice = voices.find(v => v.name === "Samantha");
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang === "en-US" && v.name.includes("Female"));
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith("en"));
    utterance.voice = selectedVoice || voices[0];
    utterance.onend = () => { isSpeaking = false; };
    setTimeout(() => synth.speak(utterance), 100);
}

// ---------- Clean text (remove gibberish) ----------
function cleanText(text) {
    return text.replace(/[^\w\s.,!?;:()-]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- Summarise current page (via content script) ----------
async function summariseCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return "No active tab found.";
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const bodyText = document.body.innerText || '';
                return bodyText.substring(0, 3000); // limit length
            }
        });
        const pageText = result[0]?.result || '';
        if (!pageText) return "Could not read page content.";
        // Call AI to summarise
        const summary = await askAI(`Summarise this page in 3 short sentences:\n${pageText}`);
        return summary;
    } catch (e) {
        return "Error reading page.";
    }
}

// ---------- Ask AI (tool‑aware) ----------
async function askAI(prompt) {
    if (!openRouterApiKey) return "API key missing.";
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openRouterApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 500
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No response.";
    } catch (e) {
        return "AI error.";
    }
}

// ---------- Tab control commands ----------
async function handleTabCommand(command, param = '') {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab) return "No active tab.";
    switch (command) {
        case 'close':
            await chrome.tabs.remove(currentTab.id);
            return "Tab closed.";
        case 'duplicate':
            await chrome.tabs.duplicate(currentTab.id);
            return "Tab duplicated.";
        case 'mute':
            await chrome.tabs.update(currentTab.id, { muted: true });
            return "Tab muted.";
        case 'unmute':
            await chrome.tabs.update(currentTab.id, { muted: false });
            return "Tab unmuted.";
        case 'pin':
            await chrome.tabs.update(currentTab.id, { pinned: true });
            return "Tab pinned.";
        case 'unpin':
            await chrome.tabs.update(currentTab.id, { pinned: false });
            return "Tab unpinned.";
        case 'reload':
            await chrome.tabs.reload(currentTab.id);
            return "Tab reloaded.";
        case 'new':
            await chrome.tabs.create({ url: param || 'https://www.google.com' });
            return `Opened new tab${param ? ` with ${param}` : ''}.`;
        default:
            return "Command not recognised.";
    }
}

// ---------- Voice command processing (global) ----------
async function processVoiceCommand(transcript) {
    const lower = transcript.toLowerCase().trim();
    
    // Local commands (fast)
    if (lower.includes('time')) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        speakText(`The time is ${timeStr}.`);
        return;
    }
    if (lower.includes('date')) {
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        speakText(`Today is ${dateStr}.`);
        return;
    }
    if (lower.match(/^\d+[\+\-\*\/]\d+/)) {
        const result = safeMathEvaluate(lower);
        if (result !== null) speakText(`${lower} equals ${result}`);
        return;
    }
    if (lower.includes('summarise') || lower.includes('summarize') || lower.includes('read this page')) {
        const summary = await summariseCurrentPage();
        speakText(cleanText(summary));
        return;
    }
    if (lower.includes('close tab')) {
        const msg = await handleTabCommand('close');
        speakText(msg);
        return;
    }
    if (lower.includes('duplicate tab')) {
        const msg = await handleTabCommand('duplicate');
        speakText(msg);
        return;
    }
    if (lower.includes('mute tab')) {
        const msg = await handleTabCommand('mute');
        speakText(msg);
        return;
    }
    if (lower.includes('unmute tab')) {
        const msg = await handleTabCommand('unmute');
        speakText(msg);
        return;
    }
    if (lower.includes('new tab')) {
        let url = '';
        const match = lower.match(/new tab (.*)/);
        if (match) url = match[1].trim();
        const msg = await handleTabCommand('new', url);
        speakText(msg);
        return;
    }
    if (lower.startsWith('open ')) {
        const site = lower.slice(5).trim();
        let url;
        if (site.includes('.')) url = `https://${site}`;
        else url = `https://www.google.com/search?q=${encodeURIComponent(site)}`;
        await chrome.tabs.create({ url });
        speakText(`Opening ${site}.`);
        return;
    }
    
    // Fallback to AI for general conversation
    const aiResponse = await askAI(`You are Zara, a helpful assistant. The user said: "${transcript}". Respond naturally in plain English, short and friendly. No emojis. No special characters.`);
    speakText(cleanText(aiResponse));
}

// ---------- Math evaluator (safe) ----------
function safeMathEvaluate(expr) {
    expr = expr.replace(/\s/g, '');
    if (!/^[0-9+\-*/().]+$/.test(expr)) return null;
    try {
        const result = Function('"use strict"; return (' + expr + ')')();
        if (typeof result === 'number' && isFinite(result)) return result;
        return null;
    } catch { return null; }
}

// ---------- Speech recognition (global, continuous) ----------
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.log("Speech recognition not supported.");
        return null;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = 'en-US';

    recog.onstart = () => {
        isListening = true;
        console.log("Global listening started.");
    };
    recog.onend = () => {
        isListening = false;
        if (continuousMode && !isSpeaking) {
            setTimeout(() => { try { recog.start(); } catch(e) {} }, 500);
        }
    };
    recog.onresult = (event) => {
        const transcript = event.results[event.results.length-1][0].transcript;
        console.log("Heard:", transcript);
        processVoiceCommand(transcript);
    };
    recog.onerror = (e) => {
        console.log("Speech error:", e.error);
        isListening = false;
    };
    return recog;
}

function startGlobalListening() {
    if (!recognition) recognition = initSpeechRecognition();
    if (recognition && !isListening) recognition.start();
}

// Start listening when background loads (if API key exists)
chrome.storage.local.get(['zara_openrouter_key'], (result) => {
    if (result.zara_openrouter_key) {
        continuousMode = true;
        startGlobalListening();
    }
});

// Listen for storage changes to start listening when key added
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.zara_openrouter_key) {
        if (changes.zara_openrouter_key.newValue && !isListening) {
            startGlobalListening();
        }
    }
});

// Keep service worker alive (periodic ping)
setInterval(() => {
    console.log("Zara background alive");
}, 20000);
