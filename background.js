let offscreenCreated = false;

// Ensure offscreen document exists for continuous listening
async function createOffscreen() {
  if (offscreenCreated) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Continuous speech recognition for wake word'
  });
  offscreenCreated = true;
}

// Close offscreen when not needed (optional)
async function closeOffscreen() {
  if (offscreenCreated) {
    await chrome.offscreen.closeDocument();
    offscreenCreated = false;
  }
}

// Listen for messages from offscreen (voice commands)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'wakeWordHeard') {
    // Optionally show a small notification or just handle
    console.log('Wake word "Zara" detected');
  } else if (message.type === 'voiceCommand') {
    // Forward command to the popup if open, or store for next popup opening
    chrome.storage.local.set({ pendingVoiceCommand: message.command });
    // Also try to open popup to show response
    chrome.action.openPopup();
  }
  return true;
});

// When popup opens, it can check for pending command
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    port.onMessage.addListener((msg) => {
      if (msg.type === 'getPendingCommand') {
        chrome.storage.local.get(['pendingVoiceCommand'], (result) => {
          port.postMessage({ command: result.pendingVoiceCommand || null });
          if (result.pendingVoiceCommand) {
            chrome.storage.local.remove('pendingVoiceCommand');
          }
        });
      }
    });
  }
});

// Command to toggle always-listening from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'setAlwaysListen') {
    const enabled = message.enabled;
    chrome.storage.local.set({ alwaysListen: enabled });
    if (enabled) {
      createOffscreen();
    } else {
      closeOffscreen();
    }
    sendResponse({ success: true });
  }
  return true;
});

// Keyboard shortcut opens popup normally
chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-zara") {
    chrome.action.openPopup();
  }
});

// On extension startup, check if always listen was enabled
chrome.storage.local.get(['alwaysListen'], (result) => {
  if (result.alwaysListen === true) {
    createOffscreen();
  }
});
