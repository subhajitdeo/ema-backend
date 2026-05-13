let recognition = null;
let listeningActive = false;
let wakeWordDetected = false;
let commandBuffer = '';

function startRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim().toLowerCase();
      if (!event.results[i].isFinal) {
        if (transcript.includes('zara')) {
          if (!wakeWordDetected) {
            wakeWordDetected = true;
            commandBuffer = '';
            chrome.runtime.sendMessage({ type: 'wakeWordHeard' });
          }
          let afterWake = transcript.replace(/zara\s*/, '');
          if (afterWake.length > 0) {
            commandBuffer += afterWake + ' ';
          }
        } else if (wakeWordDetected) {
          commandBuffer += transcript + ' ';
        }
      } else {
        if (wakeWordDetected) {
          const finalCommand = commandBuffer.trim();
          if (finalCommand.length > 0) {
            chrome.runtime.sendMessage({ type: 'voiceCommand', command: finalCommand });
          }
          wakeWordDetected = false;
          commandBuffer = '';
        }
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Recognition error', event.error);
    setTimeout(() => {
      if (listeningActive) startRecognition();
    }, 1000);
  };

  recognition.onend = () => {
    if (listeningActive) startRecognition();
  };

  recognition.start();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'startListening') {
    if (!listeningActive) {
      listeningActive = true;
      startRecognition();
      sendResponse({ status: 'listening' });
    }
  } else if (message.type === 'stopListening') {
    listeningActive = false;
    if (recognition) {
      recognition.stop();
    }
    sendResponse({ status: 'stopped' });
  }
  return true;
});

chrome.storage.local.get(['alwaysListen'], (result) => {
  if (result.alwaysListen === true) {
    listeningActive = true;
    startRecognition();
  }
});
