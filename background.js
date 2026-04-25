// background.js — Service worker for Chrome extension
// Currently minimal: the extension runs entirely in the popup context.
// This file is required by manifest.json's "background" field.

chrome.runtime.onInstalled.addListener(() => {
    console.log('[File Compressor] Extension installed.');
});
