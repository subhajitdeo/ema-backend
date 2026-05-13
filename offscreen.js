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

  recognition.onstart = () => {
    console.log('Recognition started');
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim().toLowerCase();
      if (!event.results[i].isFinal) {
        // Interim result – check for wake word
        if (transcript.includes('zara')) {
          if (!wakeWordDetected) {
            wakeWordDetected = true;
            commandBuffer = '';
            try {
              chrome.runtime.sendMessage({ type: 'wakeWordHeard' });
            } catch(e) { console.warn(e); }
          }
          let afterWake = transcript.replace(/zara\s*/, '');
          if (afterWake.length > 0) {
            commandBuffer += afterWake + ' ';
          }
        } else if (wakeWordDetected) {
          commandBuffer += transcript + ' ';
        }
      } else {
        // Final result
        if (wakeWordDetected) {
          const finalCommand = commandBuffer.trim();
          if (finalCommand.length > 0) {
            try {
              chrome.runtime.sendMessage({ type: 'voiceCommand', command: finalCommand });
            } catch(e) { console.warn(e); }
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
    console.log('Recognition ended, restarting if active');
    if (listeningActive) startRecognition();
  };

  try {
    recognition.start();
  } catch(e) {
    console.error('Failed to start recognition:', e);
  }
}

// Listen for start/stop commands from background
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
      try {
        recognition.stop();
      } catch(e) { console.warn(e); }
    }
    sendResponse({ status: 'stopped' });
  }
  return true;
});

// Notify background that we are alive
try {
  chrome.runtime.sendMessage({ type: 'offscreenReady' });
} catch(e) {
  console.warn('Failed to send offscreenReady:', e);
}
