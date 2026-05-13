let offscreenCreated = false;

async function createOffscreen() {
  if (offscreenCreated) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Continuous speech recognition for wake word'
  });
  offscreenCreated = true;
}

async function closeOffscreen() {
  if (offscreenCreated) {
    await chrome.offscreen.closeDocument();
    offscreenCreated = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'wakeWordHeard') {
    console.log('Wake word "Zara" detected');
  } else if (message.type === 'voiceCommand') {
    chrome.storage.local.set({ pendingVoiceCommand: message.command });
    chrome.action.openPopup();
  } else if (message.type === 'setAlwaysListen') {
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

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-zara") {
    chrome.action.openPopup();
  }
});

chrome.storage.local.get(['alwaysListen'], (result) => {
  if (result.alwaysListen === true) {
    createOffscreen();
  }
});
