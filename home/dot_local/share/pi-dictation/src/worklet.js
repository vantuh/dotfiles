/**
 * Forwards microphone frames to the page. The AudioContext is opened at 16 kHz,
 * so every frame is already the rate transcribe.cpp expects — no resampling and
 * no decoder anywhere in the path.
 */
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice());
    return true;
  }
}

registerProcessor("tap", Tap);
