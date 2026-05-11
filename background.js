// popup.js – settings + chat interface

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const modelSelect = document.getElementById('modelSelect');
    const continuousToggle = document.getElementById('continuousModeToggle');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');

    // ---------- Load saved settings ----------
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model', 'continuousMode']);
    if (result.zara_openrouter_key) apiKeyInput.value = result.zara_openrouter_key;
    if (result.zara_selected_model) modelSelect.value = result.zara_selected_model;
    if (result.continuousMode !== undefined) continuousToggle.checked = result.continuousMode;

    // ---------- Save settings and notify background ----------
    saveBtn.addEventListener('click', async () => {
        let newKey = apiKeyInput.value.trim();
        if (!newKey.startsWith('sk-or-')) {
            alert('Invalid OpenRouter key (must start with sk-or-)');
            return;
        }
        await chrome.storage.local.set({ zara_openrouter_key: newKey });
        alert('API key saved. Background will restart listening.');
        chrome.runtime.sendMessage({ type: 'updateSettings' });
    });

    modelSelect.addEventListener('change', async () => {
        await chrome.storage.local.set({ zara_selected_model: modelSelect.value });
        chrome.runtime.sendMessage({ type: 'updateSettings' });
    });

    continuousToggle.addEventListener('change', async () => {
        await chrome.storage.local.set({ continuousMode: continuousToggle.checked });
        chrome.runtime.sendMessage({ type: 'updateSettings' });
    });

    // ---------- Add message to chat UI ----------
    function addMessage(text, isUser = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
        msgDiv.textContent = text;
        chatMessages.appendChild(msgDiv);
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ---------- Send typed message to background (same as voice command) ----------
    async function sendTypedMessage(text) {
        if (!text.trim()) return;
        addMessage(text, true);
        userInput.value = '';

        // Show thinking indicator
        const thinkingMsg = document.createElement('div');
        thinkingMsg.className = 'message assistant thinking';
        thinkingMsg.textContent = 'Zara is thinking...';
        chatMessages.appendChild(thinkingMsg);
        thinkingMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Send to background as voiceCommand (background will process and speak)
        chrome.runtime.sendMessage({ type: 'voiceCommand', text: text }, (response) => {
            thinkingMsg.remove();
            // Response will come as speech, but we don't get text back directly.
            // We could listen for background responses, but for simplicity,
            // we rely on the background to speak. The user will hear the answer.
            // To also show the answer in chat, we'd need a separate message channel.
            // For now, we just show a generic "Response spoken" indicator.
            const spokenMsg = document.createElement('div');
            spokenMsg.className = 'message assistant';
            spokenMsg.textContent = 'Response spoken.';
            chatMessages.appendChild(spokenMsg);
            spokenMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => spokenMsg.remove(), 3000);
        });
    }

    sendBtn.addEventListener('click', () => sendTypedMessage(userInput.value));
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendTypedMessage(userInput.value);
    });

    // Optional: listen for responses from background if we want to show text
    // But background currently only speaks, doesn't send back. Can be added later.
});
