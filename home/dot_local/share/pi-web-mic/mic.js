/**
 * Injected into pi-web by the mic shim: a microphone button in the composer
 * that records 16 kHz mono, transcribes it on this machine and puts the text
 * where the caret is.
 *
 * The composer is a React-controlled textarea, so the text goes in through the
 * native value setter plus a bubbling `input` event — React's onChange then sees
 * a normal edit instead of a value it thinks it already knows.
 *
 * The icon follows pi-web's own conventions: inline SVG, 24 viewBox, 1.8 stroke.
 */
(() => {
  const RATE = 16000;
  const BUTTON_ATTR = "data-pi-mic";
  const MIC_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;

  let recording = false;
  let busy = false;
  let context;
  let stream;
  let node;
  let chunks = [];
  let frames = 0;
  let timer;
  let wakeLock;

  const composer = () => document.querySelector("textarea.chat-input-textarea");
  const controlsRow = () => document.querySelector(".chat-input-controls");

  function pulse(button, on) {
    // No stylesheet: writing a <style> into the document would touch head during
    // React's hydration and make it throw the client render away.
    if (typeof button.animate !== "function") return;
    if (on) {
      button._pulse ??= button.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
        duration: 1400,
        iterations: Infinity,
      });
    } else {
      button._pulse?.cancel();
      button._pulse = undefined;
    }
  }

  function setState(button, state, message) {
    button.dataset.state = state;
    button.disabled = state === "busy";
    button.style.color =
      state === "recording" ? "var(--accent, #89b4fa)" : "var(--text-muted, #9399b2)";
    button.style.opacity = state === "busy" ? "0.6" : "1";
    button.title = message ?? "Диктовка (whisper локально)";
    pulse(button, state === "recording");
  }

  function insertText(text) {
    const element = composer();
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) return false;
    const current = element.value;
    setter.call(element, current.trim() ? `${current.replace(/\s*$/, " ")}${text}` : text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.focus();
    return true;
  }

  function encodeWav(parts) {
    let total = 0;
    for (const part of parts) total += part.length;
    const view = new DataView(new ArrayBuffer(44 + total * 2));
    const ascii = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + total * 2, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, total * 2, true);
    let offset = 44;
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        const sample = Math.max(-1, Math.min(1, part[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([view.buffer], { type: "audio/wav" });
  }

  async function start(button) {
    if (recording || busy) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      setState(button, "idle", `немає доступу до мікрофона: ${error.message ?? error}`);
      return;
    }
    context = new AudioContext({ sampleRate: RATE });
    await context.audioWorklet.addModule("/__mic/worklet.js");
    node = new AudioWorkletNode(context, "pi-mic-tap");
    const collected = [];
    node.port.onmessage = (event) => {
      collected.push(event.data);
      frames += event.data.length;
    };
    chunks = collected;
    frames = 0;
    const source = context.createMediaStreamSource(stream);
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(node).connect(silent).connect(context.destination);
    recording = true;
    setState(button, "recording", "записую… натисни, щоб зупинити");
    timer = setInterval(() => {
      button.title = `записую… ${(frames / RATE).toFixed(1)} с`;
    }, 200);
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {}
  }

  async function stop(button) {
    if (!recording) return;
    recording = false;
    clearInterval(timer);
    timer = undefined;
    try {
      node?.port.close();
      await context?.close();
    } catch {}
    stream?.getTracks().forEach((track) => track.stop());
    context = undefined;
    stream = undefined;
    try {
      await wakeLock?.release();
    } catch {}
    wakeLock = undefined;

    if (frames < RATE / 4) {
      setState(button, "idle", "занадто коротко");
      chunks = [];
      return;
    }
    const blob = encodeWav(chunks);
    const seconds = frames / RATE;
    chunks = [];
    frames = 0;
    busy = true;
    setState(button, "busy", "розпізнаю…");
    try {
      const response = await fetch("/__mic/transcribe", {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      const text = (payload.text || "").trim();
      if (!text) throw new Error("нічого не розібрав");
      if (!insertText(text)) throw new Error("не знайшов поле введення");
      setState(button, "idle", `${seconds.toFixed(1)} с → ${(payload.ms / 1000).toFixed(1)} с`);
    } catch (error) {
      setState(button, "idle", String(error.message ?? error));
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function ensureButton() {
    // React replaces the controls row on layout changes, which can leave a
    // button in a detached tree: drop anything that is no longer in a live row.
    for (const stale of document.querySelectorAll(`[${BUTTON_ATTR}]`)) {
      if (!stale.closest(".chat-input-controls")) stale.remove();
    }
    const row = controlsRow();
    if (!row || row.querySelector(`[${BUTTON_ATTR}]`)) return;
    // The row is a two-column grid on a phone and a flex line on a desktop, so a
    // button added as its direct child takes a grid cell and pushes the attach
    // button and the model selector onto another row. The left group (attach +
    // model) is a flex box in both layouts, so the button belongs inside it.
    const first = row.firstElementChild;
    const host = first && first.tagName === "DIV" ? first : row;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(BUTTON_ATTR, "1");
    button.innerHTML = MIC_ICON;
    Object.assign(button.style, {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "32px",
      height: "32px",
      padding: "0",
      background: "none",
      border: "none",
      borderRadius: "9px",
      cursor: "pointer",
      transition: "background 0.12s, color 0.12s",
    });
    setState(button, "idle");
    button.addEventListener("mouseenter", () => {
      button.style.background = "var(--bg-hover)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "none";
    });
    button.addEventListener("click", () => (recording ? stop(button) : start(button)));
    // Inserted a moment after the row appears, never in the same task React used
    // to hydrate: a node added mid-hydration makes React 19 discard the whole
    // client render, which shows up as a blank page.
    host.prepend(button);
    button.dataset.piMicReady = "1";
  }

  let scheduled;
  const schedule = (delay) => {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      const row = controlsRow();
      // Skip while React is still building the row: we only ever touch a table
      // that is already there and still holds what we expect.
      if (row && !row.querySelector(`[${BUTTON_ATTR}]`)) {
        try {
          ensureButton();
        } catch {
          // Nothing to report to the page: a broken insert costs the button only.
        }
      }
    }, delay);
  };

  new MutationObserver(() => schedule(600)).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  schedule(1200);
})();
