// Listens for the keyboard shortcut and opens the popup.
chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-zara") {
    chrome.action.openPopup();
  }
});
