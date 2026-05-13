// Get elements
const alwaysListenToggle = document.getElementById('alwaysListenToggle');

// Load toggle state
chrome.storage.local.get(['alwaysListen'], (result) => {
  alwaysListenToggle.checked = result.alwaysListen === true;
});

alwaysListenToggle.addEventListener('change', async () => {
  const enabled = alwaysListenToggle.checked;
  await chrome.runtime.sendMessage({ type: 'setAlwaysListen', enabled });
  statusSpan.innerText = enabled ? 'Always listening (say "Zara...")' : 'Always listening off';
  setTimeout(() => { statusSpan.innerText = '✓ Ready · Ctrl+Shift+Z'; }, 2000);
});

// Check for pending voice command from offscreen
const port = chrome.runtime.connect({ name: 'popup' });
port.postMessage({ type: 'getPendingCommand' });
port.onMessage.addListener((msg) => {
  if (msg.command) {
    // Auto-fill and process the command
    questionInput.value = msg.command;
    handleUserInput(msg.command);
  }
});
