// PageMT — popup logic
import { DEFAULT_SETTINGS, LANGS } from "../lib/config.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");

function setMsg(text, cls = "") {
  msg.textContent = text;
  msg.className = cls;
}

function fillSelect(sel, langs, value) {
  for (const l of langs) {
    const o = document.createElement("option");
    o.value = l;
    o.textContent = l === "auto" ? "自动检测" : l;
    sel.appendChild(o);
  }
  sel.value = value;
}

async function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...((await chrome.storage.local.get("settings")).settings || {}) };
  fillSelect($("sourceLang"), LANGS, s.sourceLang);
  fillSelect($("targetLang"), LANGS.filter((l) => l !== "auto"), s.targetLang);
  $("baseUrl").value = s.baseUrl;
  $("model").value = s.model;
  $("apiKey").value = s.apiKey;
  $("concurrency").value = s.concurrency;
  $("batchSize").value = s.batchSize;
  $("showOriginal").checked = s.showOriginal;
  return s;
}

async function saveSettings() {
  const s = {
    baseUrl: $("baseUrl").value.trim() || DEFAULT_SETTINGS.baseUrl,
    model: $("model").value.trim() || DEFAULT_SETTINGS.model,
    apiKey: $("apiKey").value.trim(),
    sourceLang: $("sourceLang").value,
    targetLang: $("targetLang").value,
    concurrency: Math.max(1, Math.min(16, +$("concurrency").value || 6)),
    batchSize: Math.max(1, Math.min(64, +$("batchSize").value || 24)),
    showOriginal: $("showOriginal").checked,
  };
  await chrome.storage.local.set({ settings: s });
  return s;
}

async function setBusy(busy) {
  $("translate").disabled = busy;
  $("cancel").style.display = busy ? "block" : "none";
}

$("translate").onclick = async () => {
  setMsg("");
  const s = await saveSettings();
  await setBusy(true);
  try {
    const res = await chrome.runtime.sendMessage({ type: "MT_TRANSLATE" });
    if (res.ok) setMsg(`完成：${res.total} 段 / ${res.seconds}s`, "ok");
    else setMsg(res.error || "失败", "err");
  } catch (e) {
    setMsg(String(e), "err");
  } finally {
    await setBusy(false);
  }
};

$("cancel").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "MT_CANCEL" });
};

$("restore").onclick = async () => {
  await saveSettings();
  await chrome.runtime.sendMessage({ type: "MT_RESTORE" });
};

$("test").onclick = async () => {
  const s = await saveSettings();
  setMsg("测试中…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "MT_TEST", settings: s });
    if (res.ok) setMsg(`连接成功，示例输出：${res.sample}`, "ok");
    else setMsg(String(res.sample || res.error || "失败"), "err");
  } catch (e) {
    setMsg(String(e), "err");
  }
};

loadSettings();
