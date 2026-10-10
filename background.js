// PageMT — background service worker
// Orchestrates collection & translation, talks to LM Studio (OpenAI-compatible API).

import { DEFAULT_SETTINGS, SEP, buildPrompt, buildSinglePrompt } from "./lib/config.js";

const state = {
  translating: false,
  cancel: false,
};

async function getSettings() {
  const s = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
}

// ---- LM Studio client ----

async function chatComplete(settings, prompt, signal, timeoutMs = 120_000) {
  const url = settings.baseUrl.replace(/\/+$/, "") + "/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers["Authorization"] = "Bearer " + settings.apiKey;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuterAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onOuterAbort);
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: prompt }],
        temperature: settings.temperature,
        max_tokens: 4096,
        stream: false,
      }),
    });
  } catch (e) {
    if (ctrl.signal.aborted && (!signal || !signal.aborted)) {
      throw new Error(`连接超时（${Math.round(timeoutMs / 1000)}s）：检查 baseUrl 是否可达、LM Studio 是否已 Start Server`);
    }
    throw new Error(`无法连接 ${url}：${e.message}（检查 LM Studio 是否已启动、地址/端口是否正确）`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LM Studio ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) throw new Error("LM Studio 返回无内容");
  return String(content).trim();
}

async function testConnection(settings) {
  const out = await chatComplete(settings, buildSinglePrompt("Hello", "English", "Chinese (Simplified)"), null, 10_000);
  return { ok: true, sample: out.slice(0, 100) };
}

// ---- batch pipeline ----

// Split segments into batches: <= batchSize segments and <= maxSegChars chars total.
function makeBatches(segments, settings) {
  const batches = [];
  let cur = [], chars = 0;
  for (const seg of segments) {
    if (cur.length && (cur.length >= settings.batchSize || chars + seg.length > settings.maxSegChars)) {
      batches.push(cur); cur = []; chars = 0;
    }
    cur.push(seg); chars += seg.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// Clean model output: strip reasoning tags, code fences, and any leading instruction echo.
function cleanOutput(out) {
  let t = String(out);
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/^```[a-zA-Z]*\n?|```$/g, "");
  t = t.trim();
  return t;
}

async function translateBatch(settings, segments, signal) {
  const prompt = buildPrompt(segments, settings.sourceLang, settings.targetLang);
  const out = cleanOutput(await chatComplete(settings, prompt, signal));
  let parts = out.split(SEP).map((t) => t.trim());
  if (parts.length !== segments.length) {
    // Model dropped/messed delimiters — fall back to per-segment requests.
    console.warn(`PageMT: delimiter mismatch (${parts.length}/${segments.length}), falling back`);
    parts = await Promise.all(
      segments.map((s) => chatComplete(settings, buildSinglePrompt(s, settings.sourceLang, settings.targetLang), signal)
        .then(cleanOutput))
    );
  }
  // Never return empties: keep original on failure
  return segments.map((s, i) => parts[i] || s);
}

// Worker pool with cancellation
async function runPool(jobs, concurrency, shouldCancel) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (!shouldCancel()) {
      const i = idx++;
      if (i >= jobs.length) return;
      await jobs[i]();
    }
  });
  await Promise.all(workers);
}

async function translatePage(tabId) {
  if (state.translating) return { ok: false, error: "已有翻译任务进行中" };
  state.translating = true; state.cancel = false;
  const settings = await getSettings();
  const started = Date.now();
  try {
    // 1. collect text nodes
    const [{ result: collected }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectNodes,
    });
    if (!collected || !collected.nodes.length) return { ok: false, error: "页面上没有找到可翻译文本" };
    const total = collected.nodes.length;
    await chrome.tabs.sendMessage(tabId, { type: "MT_STATUS", done: 0, total, phase: "translating" });

    // 2. unique segments
    const uniq = [...new Set(collected.nodes.map((n) => n.text))];
    const transMap = new Map();
    const batches = makeBatches(uniq, settings);
    let done = 0;
    const jobs = batches.map((batch) => async () => {
      if (state.cancel) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const translated = await translateBatch(settings, batch, controller.signal);
        batch.forEach((s, i) => transMap.set(s, translated[i]));
        done += batch.length;
        await chrome.tabs.sendMessage(tabId, {
          type: "MT_STATUS",
          done: Math.min(done, total),
          total,
          phase: "translating",
        }).catch(() => {});
      } catch (e) {
        console.warn("PageMT batch failed:", e);
      } finally {
        clearTimeout(timer);
      }
    });
    await runPool(jobs, settings.concurrency, () => state.cancel);
    if (state.cancel) {
      await chrome.tabs.sendMessage(tabId, { type: "MT_STATUS", phase: "idle" }).catch(() => {});
      return { ok: false, error: "已取消" };
    }

    // 3. apply
    await chrome.tabs.sendMessage(tabId, { type: "MT_APPLY", map: [...transMap], showOriginal: settings.showOriginal });
    return { ok: true, total, seconds: ((Date.now() - started) / 1000).toFixed(1) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    state.translating = false;
    await chrome.tabs.sendMessage(tabId, { type: "MT_STATUS", phase: "idle" }).catch(() => {});
  }
}

// Runs in the page context (serialized) — returns text-bearing element info.
function collectNodes() {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "IFRAME", "CANVAS"]);
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const text = t.nodeValue.replace(/\s+/g, " ").trim();
    if (!text || text.length > 2000) continue;
    let el = t.parentElement;
    if (!el || SKIP.has(el.tagName)) continue;
    if (!el.offsetParent && el.tagName !== "BODY") continue; // not visible
    if (el.closest("[data-pagemt='1']")) continue;
    nodes.push({ nodeId: nodes.length, text });
  }
  return { nodes };
}

async function restorePage(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: "MT_RESTORE" }).catch(() => {});
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "MT_TEST") sendResponse(await testConnection(msg.settings));
      else if (msg.type === "MT_TRANSLATE") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        sendResponse(await translatePage(tab.id));
      } else if (msg.type === "MT_CANCEL") {
        state.cancel = true; sendResponse({ ok: true });
      } else if (msg.type === "MT_RESTORE") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        sendResponse(await restorePage(tab.id));
      } else if (msg.type === "MT_STATE") {
        sendResponse({ translating: state.translating });
      } else sendResponse({ ok: false, error: "unknown message" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true; // async response
});
