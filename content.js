// PageMT — content script
// Applies translations to text nodes; keeps originals for restore.

let originals = []; // {node, text}
let statusEl = null;

function ensureStatusBar() {
  if (statusEl && document.body.contains(statusEl)) return;
  statusEl = document.createElement("div");
  statusEl.id = "pagemt-status";
  statusEl.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:2147483647;
    background:#1a1a2e;color:#fff;padding:8px 14px;border-radius:8px;font:13px/1.4 system-ui;
    box-shadow:0 2px 12px rgba(0,0,0,.3);display:none;max-width:320px`;
  document.body.appendChild(statusEl);
}

function showStatus(text) {
  ensureStatusBar();
  statusEl.textContent = text;
  statusEl.style.display = "block";
}

function hideStatus() {
  if (statusEl) statusEl.style.display = "none";
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MT_STATUS") {
    if (msg.phase === "translating") {
      showStatus(`PageMT 翻译中 ${msg.done}/${msg.total}`);
    } else hideStatus();
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === "MT_APPLY") {
    try {
      applyTranslations(new Map(msg.map), msg.showOriginal);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return;
  }
  if (msg.type === "MT_RESTORE") {
    restoreAll();
    sendResponse({ ok: true });
  }
});

function applyTranslations(map, showOriginal) {
  originals = [];
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "IFRAME", "CANVAS"]);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const text = t.nodeValue.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const el = t.parentElement;
    if (!el || SKIP.has(el.tagName)) continue;
    if (!el.offsetParent && el.tagName !== "BODY") continue;
    const translated = map.get(text);
    if (!translated || translated === text) continue;
    originals.push({ node: t, text: t.nodeValue });
    if (showOriginal) {
      el.setAttribute("title", t.nodeValue.trim());
      el.setAttribute("data-pagemt", "1");
    }
    t.nodeValue = translated;
  }
}

function restoreAll() {
  for (const { node, text } of originals) {
    if (node.isConnected) node.nodeValue = text;
  }
  originals = [];
  document.querySelectorAll("[data-pagemt='1']").forEach((el) => {
    el.removeAttribute("data-pagemt");
    el.removeAttribute("title");
  });
  hideStatus();
}
