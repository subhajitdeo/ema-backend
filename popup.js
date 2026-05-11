// popup.js – manages settings and notifies background

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const modelSelect = document.getElementById('modelSelect');
    const continuousToggle = document.getElementById('continuousModeToggle');

    // Load saved values
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model', 'continuousMode']);
    if (result.zara_openrouter_key) apiKeyInput.value = result.zara_openrouter_key;
    if (result.zara_selected_model) modelSelect.value = result.zara_selected_model;
    if (result.continuousMode !== undefined) continuousToggle.checked = result.continuousMode;

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
});
