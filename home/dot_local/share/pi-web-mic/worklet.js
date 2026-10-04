/**
 * Forwards microphone frames to the page. The AudioContext is opened at 16 kHz,
 * so every frame is already the rate the dictation daemon expects.
 */
class PiMicTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice());
    return true;
  }
}

registerProcessor("pi-mic-tap", PiMicTap);
