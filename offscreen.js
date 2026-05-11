// offscreen.js – microphone & speech recognition
// No direct chrome.storage access – all settings come from background.

let recognition = null;
let isListening = false;
let continuousMode = true; // will be set by background

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("Speech recognition not supported");
        return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        console.log("Listening started");
    };

    recognition.onend = () => {
        isListening = false;
        console.log("Listening ended");
        // Notify background so it can decide whether to restart
        chrome.runtime.sendMessage({ type: 'recognitionEnded' });
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        chrome.runtime.sendMessage({ type: 'voiceCommand', text: transcript });
    };

    recognition.onerror = (e) => {
        console.error("Speech error:", e.error);
        isListening = false;
        // Do not auto-restart here – background will decide
    };
}

function startListening(continuous) {
    continuousMode = continuous;
    if (!recognition) initSpeech();
    if (recognition && !isListening) {
        try {
            recognition.start();
        } catch (err) {
            console.error("Failed to start recognition:", err);
        }
    }
}

function stopListening() {
    if (recognition && isListening) {
        recognition.stop();
    }
}

// Listen for commands from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'startListening') {
        startListening(msg.continuousMode ?? true);
        sendResponse({ status: 'ok' });
    }
    else if (msg.type === 'stopListening') {
        stopListening();
        sendResponse({ status: 'ok' });
    }
    return true;
});

// No auto-start here – background will send 'startListening' after offscreen is ready.
// But we notify background that we are alive.
console.log("Offscreen document ready");
