// ==================== FIXED BACKGROUND SERVICE WORKER ====================
let openRouterApiKey = '';
let model = 'ring-2.6-1t:free';
let continuousMode = true;

// Load settings
async function loadSettings() {
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model', 'continuousMode']);
    openRouterApiKey = result.zara_openrouter_key || '';
    model = result.zara_selected_model || 'ring-2.6-1t:free';
    continuousMode = result.continuousMode !== undefined ? result.continuousMode : true;
}
loadSettings();

// ---------- Speak using chrome.tts ----------
function speakText(text) {
    let cleanText = text.replace(/[^\w\s.,!?;:()-]/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;
    chrome.tts.speak(cleanText, { rate: 0.9, pitch: 1.0, lang: 'en-GB', voiceName: 'Google UK English Female' });
}

function cleanText(text) {
    return text.replace(/[^\w\s.,!?;:()-]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- Safe math evaluator ----------
function safeMathEvaluate(expr) {
    expr = expr.replace(/\s/g, '');
    if (!/^[0-9+\-*/().]+$/.test(expr)) return null;
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const applyOp = (op, a, b) => {
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/') return b !== 0 ? a / b : NaN;
        return NaN;
    };
    const tokens = [];
    let i = 0, len = expr.length;
    while (i < len) {
        const ch = expr[i];
        if (ch >= '0' && ch <= '9') {
            let num = '';
            while (i < len && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
                num += expr[i];
                i++;
            }
            tokens.push(parseFloat(num));
            continue;
        } else if ('+-*/()'.includes(ch)) {
            tokens.push(ch);
            i++;
        } else return null;
    }
    const output = [];
    const ops = [];
    for (const token of tokens) {
        if (typeof token === 'number') output.push(token);
        else if ('+-*/'.includes(token)) {
            while (ops.length && '+-*/'.includes(ops[ops.length-1]) && precedence[ops[ops.length-1]] >= precedence[token]) {
                output.push(ops.pop());
            }
            ops.push(token);
        } else if (token === '(') ops.push(token);
        else if (token === ')') {
            while (ops.length && ops[ops.length-1] !== '(') output.push(ops.pop());
            ops.pop();
        }
    }
    while (ops.length) output.push(ops.pop());
    const stack = [];
    for (const token of output) {
        if (typeof token === 'number') stack.push(token);
        else {
            const b = stack.pop();
            const a = stack.pop();
            if (a === undefined || b === undefined) return null;
            const res = applyOp(token, a, b);
            if (isNaN(res) || !isFinite(res)) return null;
            stack.push(res);
        }
    }
    const final = stack.pop();
    return (typeof final === 'number' && isFinite(final)) ? final : null;
}

// ---------- Summarise current page ----------
async function summariseCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return "No active tab found.";
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText?.substring(0, 3000) || ''
        });
        const pageText = result[0]?.result || '';
        if (!pageText) return "Could not read page content.";
        const summary = await askAI(`Summarise this page in 3 short sentences:\n${pageText}`);
        return summary;
    } catch (e) {
        return "Error reading page.";
    }
}

// ---------- Ask AI ----------
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

// ---------- Tab control ----------
async function handleTabCommand(command, param = '') {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab) return "No active tab.";
    switch (command) {
        case 'close': await chrome.tabs.remove(currentTab.id); return "Tab closed.";
        case 'duplicate': await chrome.tabs.duplicate(currentTab.id); return "Tab duplicated.";
        case 'mute': await chrome.tabs.update(currentTab.id, { muted: true }); return "Tab muted.";
        case 'unmute': await chrome.tabs.update(currentTab.id, { muted: false }); return "Tab unmuted.";
        case 'pin': await chrome.tabs.update(currentTab.id, { pinned: true }); return "Tab pinned.";
        case 'unpin': await chrome.tabs.update(currentTab.id, { pinned: false }); return "Tab unpinned.";
        case 'reload': await chrome.tabs.reload(currentTab.id); return "Tab reloaded.";
        case 'new': await chrome.tabs.create({ url: param || 'https://www.google.com' }); return `Opened new tab${param ? ` with ${param}` : ''}.`;
        default: return "Command not recognised.";
    }
}

// ---------- Process voice command ----------
async function processVoiceCommand(transcript) {
    const lower = transcript.toLowerCase().trim();

    if (lower.includes('time')) {
        speakText(`The time is ${new Date().toLocaleTimeString()}.`);
        return;
    }
    if (lower.includes('date')) {
        speakText(`Today is ${new Date().toLocaleDateString()}.`);
        return;
    }
    if (/^[\d+\-*/().\s]+$/.test(lower)) {
        const result = safeMathEvaluate(lower);
        if (result !== null) speakText(`${lower} equals ${result}`);
        return;
    }
    if (lower.includes('summarise') || lower.includes('summarize') || lower.includes('read this page')) {
        const summary = await summariseCurrentPage();
        speakText(cleanText(summary));
        return;
    }
    if (lower.includes('close tab')) { speakText(await handleTabCommand('close')); return; }
    if (lower.includes('duplicate tab')) { speakText(await handleTabCommand('duplicate')); return; }
    if (lower.includes('mute tab')) { speakText(await handleTabCommand('mute')); return; }
    if (lower.includes('unmute tab')) { speakText(await handleTabCommand('unmute')); return; }
    if (lower.includes('new tab')) {
        let url = '';
        const match = lower.match(/new tab (.*)/);
        if (match) url = match[1].trim();
        speakText(await handleTabCommand('new', url));
        return;
    }
    if (lower.startsWith('open ')) {
        const site = lower.slice(5).trim();
        const url = site.includes('.') ? `https://${site}` : `https://www.google.com/search?q=${encodeURIComponent(site)}`;
        await chrome.tabs.create({ url });
        speakText(`Opening ${site}.`);
        return;
    }

    const aiResponse = await askAI(`You are Zara. User: "${transcript}". Reply naturally, no emojis, short.`);
    speakText(cleanText(aiResponse));
}

// ---------- Offscreen document management (fixed) ----------
async function offscreenDocumentExists() {
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
}

async function createOffscreen() {
    const exists = await offscreenDocumentExists();
    if (exists) return;
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Continuous voice recognition'
    });
    // After creation, tell offscreen to start listening if conditions are met
    if (openRouterApiKey && continuousMode) {
        await sendToOffscreen({ type: 'startListening', continuousMode });
    }
}

async function closeOffscreen() {
    const exists = await offscreenDocumentExists();
    if (!exists) return;
    await chrome.offscreen.closeDocument();
}

async function sendToOffscreen(message) {
    const exists = await offscreenDocumentExists();
    if (!exists) return;
    chrome.runtime.sendMessage(message);
}

// ---------- Handle recognition end from offscreen ----------
async function onRecognitionEnded() {
    if (continuousMode && openRouterApiKey) {
        await sendToOffscreen({ type: 'startListening', continuousMode });
    }
}

// ---------- Message handling ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'voiceCommand') {
        processVoiceCommand(msg.text);
        sendResponse({ status: 'ok' });
    }
    else if (msg.type === 'recognitionEnded') {
        onRecognitionEnded();
        sendResponse({ status: 'ok' });
    }
    else if (msg.type === 'startListening') {
        if (openRouterApiKey && continuousMode) createOffscreen();
        sendResponse({ status: 'ok' });
    }
    else if (msg.type === 'stopListening') {
        closeOffscreen();
        sendResponse({ status: 'ok' });
    }
    else if (msg.type === 'updateSettings') {
        loadSettings().then(() => {
            if (continuousMode && openRouterApiKey) createOffscreen();
            else closeOffscreen();
        });
        sendResponse({ status: 'ok' });
    }
    return true;
});

// Auto-start on service worker load
chrome.storage.local.get(['zara_openrouter_key', 'continuousMode'], async (res) => {
    if (res.zara_openrouter_key && res.continuousMode !== false) {
        await createOffscreen();
    }
});

// Keep service worker alive
setInterval(() => console.log("Background alive"), 20000);
