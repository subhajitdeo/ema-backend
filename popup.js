// popup.js – manage API key, model, continuous mode

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const modelSelect = document.getElementById('modelSelect');
    const continuousToggle = document.getElementById('continuousModeToggle');

    // Load saved values
    const result = await chrome.storage.local.get(['zara_openrouter_key', 'zara_selected_model', 'zara_continuous_mode']);
    if (result.zara_openrouter_key) apiKeyInput.value = result.zara_openrouter_key;
    if (result.zara_selected_model) modelSelect.value = result.zara_selected_model;
    if (result.zara_continuous_mode !== undefined) continuousToggle.checked = result.zara_continuous_mode;

    saveBtn.addEventListener('click', async () => {
        const newKey = apiKeyInput.value.trim();
        if (!newKey.startsWith('sk-or-')) {
            alert('Invalid OpenRouter key (must start with sk-or-)');
            return;
        }
        await chrome.storage.local.set({ zara_openrouter_key: newKey });
        alert('API key saved. Background will start listening.');
        // Reload background to start listening
        chrome.runtime.reload();
    });

    modelSelect.addEventListener('change', async () => {
        await chrome.storage.local.set({ zara_selected_model: modelSelect.value });
    });

    continuousToggle.addEventListener('change', async () => {
        await chrome.storage.local.set({ zara_continuous_mode: continuousToggle.checked });
        // Notify background script
        chrome.runtime.sendMessage({ type: 'toggleContinuous', enabled: continuousToggle.checked });
    });
});
