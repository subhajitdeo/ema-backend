// ==================== content.js ====================
// Extracts and cleans text from any webpage. Removes gibberish, scripts, styles.
// Listens for messages from the background to provide page content.

(function() {
    'use strict';

    // ---------- Helper: Clean text (remove special characters, multiple spaces) ----------
    function cleanText(text) {
        // Remove all special characters except letters, numbers, spaces, and basic punctuation
        let cleaned = text.replace(/[^\w\s.,!?;:()-]/g, ' ');
        // Collapse multiple spaces and trim
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    // ---------- Extract main page text ----------
    function getPageText() {
        // Clone body to avoid modifying live page
        const bodyClone = document.body.cloneNode(true);
        
        // Remove script and style elements
        const elementsToRemove = bodyClone.querySelectorAll('script, style, noscript, iframe, svg, meta, link, header, footer, nav, aside');
        elementsToRemove.forEach(el => el.remove());
        
        // Get visible text
        let rawText = bodyClone.innerText || bodyClone.textContent || '';
        
        // Clean it
        const cleaned = cleanText(rawText);
        
        // Return first 8000 characters (enough for summarisation)
        return cleaned.substring(0, 8000);
    }

    // ---------- Listen for messages from background ----------
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'getPageText') {
            const pageText = getPageText();
            sendResponse({ text: pageText });
        }
        return true; // Keep channel open for async response
    });

    console.log("Zara content script active – ready to extract page text.");
})();
