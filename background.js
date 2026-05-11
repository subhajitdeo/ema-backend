// background.js – handles tab commands, AI, TTS, summarisation. No offscreen, no continuous listening.

let openRouterApiKey = '';
let model = 'ring-2.6-1t:free';

// Load settings
async function loadSettings() {
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model']);
    openRouterApiKey = result.zara_openrouter_key || '';
    model = result.zara_selected_model || 'ring-2.6-1t:free';
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

// ---------- Process command (called from popup) ----------
async function processCommand(transcript, sendResponseToPopup) {
    const lower = transcript.toLowerCase().trim();

    // Time
    if (lower.includes('time')) {
        const answer = `The time is ${new Date().toLocaleTimeString()}.`;
        speakText(answer);
        sendResponseToPopup(answer);
        return;
    }
    // Date
    if (lower.includes('date')) {
        const answer = `Today is ${new Date().toLocaleDateString()}.`;
        speakText(answer);
        sendResponseToPopup(answer);
        return;
    }
    // Math
    if (/^[\d+\-*/().\s]+$/.test(lower)) {
        const result = safeMathEvaluate(lower);
        if (result !== null) {
            const answer = `${lower} equals ${result}`;
            speakText(answer);
            sendResponseToPopup(answer);
            return;
        }
    }
    // Summarise
    if (lower.includes('summarise') || lower.includes('summarize') || lower.includes('read this page')) {
        const summary = await summariseCurrentPage();
        const clean = cleanText(summary);
        speakText(clean);
        sendResponseToPopup(clean);
        return;
    }
    // Tab commands
    if (lower.includes('close tab')) { const answer = await handleTabCommand('close'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('duplicate tab')) { const answer = await handleTabCommand('duplicate'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('mute tab')) { const answer = await handleTabCommand('mute'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('unmute tab')) { const answer = await handleTabCommand('unmute'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('pin tab')) { const answer = await handleTabCommand('pin'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('unpin tab')) { const answer = await handleTabCommand('unpin'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('reload tab')) { const answer = await handleTabCommand('reload'); speakText(answer); sendResponseToPopup(answer); return; }
    if (lower.includes('new tab')) {
        let url = '';
        const match = lower.match(/new tab (.*)/);
        if (match) url = match[1].trim();
        const answer = await handleTabCommand('new', url);
        speakText(answer);
        sendResponseToPopup(answer);
        return;
    }
    if (lower.startsWith('open ')) {
        const site = lower.slice(5).trim();
        const url = site.includes('.') ? `https://${site}` : `https://www.google.com/search?q=${encodeURIComponent(site)}`;
        await chrome.tabs.create({ url });
        const answer = `Opening ${site}.`;
        speakText(answer);
        sendResponseToPopup(answer);
        return;
    }

    // Fallback to AI
    const aiResponse = await askAI(`You are Zara. User: "${transcript}". Reply naturally, no emojis, short.`);
    const clean = cleanText(aiResponse);
    speakText(clean);
    sendResponseToPopup(clean);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'processCommand') {
        processCommand(msg.text, (answer) => {
            sendResponse({ answer: answer });
        });
        return true; // Keep channel open for async response
    }
    if (msg.type === 'updateSettings') {
        loadSettings().then(() => {
            sendResponse({ status: 'ok' });
        });
        return true;
    }
});

// Keep service worker alive
setInterval(() => console.log("Background alive"), 20000);
