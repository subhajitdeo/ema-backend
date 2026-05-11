// offscreen.js – holds microphone, runs speech recognition, sends to background

let recognition = null;
let isListening = false;

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => { isListening = true; };
    recognition.onend = () => {
        isListening = false;
        chrome.storage.local.get(['continuousMode'], (res) => {
            if (res.continuousMode !== false) {
                setTimeout(() => { if (recognition) recognition.start(); }, 500);
            }
        });
    };
    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length-1][0].transcript;
        chrome.runtime.sendMessage({ type: 'voiceCommand', text: transcript });
    };
    recognition.onerror = (e) => {
        console.error("Speech error:", e.error);
        isListening = false;
    };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'startListening') {
        if (!recognition) initSpeech();
        if (recognition && !isListening) recognition.start();
        sendResponse({ status: 'ok' });
    }
    if (msg.type === 'stopListening') {
        if (recognition && isListening) recognition.stop();
        sendResponse({ status: 'ok' });
    }
});

// Auto-start when offscreen loads
chrome.storage.local.get(['continuousMode', 'zara_openrouter_key'], (res) => {
    if (res.zara_openrouter_key && res.continuousMode !== false) {
        initSpeech();
        if (recognition) recognition.start();
    }
});
