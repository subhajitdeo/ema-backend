// This runs inside the offscreen document
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
  recognition.interimResults = true;      // get partial results to detect wake word
  recognition.continuous = true;          // keep listening
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let lastTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim().toLowerCase();
      if (event.results[i].isFinal) {
        lastTranscript = transcript;
      } else {
        // interim results – check for wake word "zara"
        if (transcript.includes('zara')) {
          if (!wakeWordDetected) {
            wakeWordDetected = true;
            commandBuffer = '';
            // Notify background that wake word heard
            chrome.runtime.sendMessage({ type: 'wakeWordHeard' });
          }
          // Remove the wake word from the command buffer
          let afterWake = transcript.replace(/zara\s*/, '');
          if (afterWake.length > 0) {
            commandBuffer += afterWake + ' ';
          }
        } else if (wakeWordDetected) {
          commandBuffer += transcript + ' ';
        }
      }
    }
    // If we have a final result and wake word was detected, send command
    if (wakeWordDetected && event.results[event.results.length-1].isFinal) {
      const finalCommand = commandBuffer.trim();
      if (finalCommand.length > 0) {
        chrome.runtime.sendMessage({ type: 'voiceCommand', command: finalCommand });
      }
      wakeWordDetected = false;
      commandBuffer = '';
    }
  };

  recognition.onerror = (event) => {
    console.error('Recognition error', event.error);
    // Restart after a short delay
    setTimeout(() => {
      if (listeningActive) startRecognition();
    }, 1000);
  };

  recognition.onend = () => {
    if (listeningActive) {
      startRecognition();  // restart if still active
    }
  };

  recognition.start();
}

// Listen for messages from background to start/stop listening
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

// Auto-start if the setting was enabled (will be set from popup)
chrome.storage.local.get(['alwaysListen'], (result) => {
  if (result.alwaysListen === true) {
    listeningActive = true;
    startRecognition();
  }
});
