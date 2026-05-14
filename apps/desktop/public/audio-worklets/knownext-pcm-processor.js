class KnownextPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 24000;
    this.sourceRemainder = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelCount = input.length;
    const inputLength = input[0].length;
    const mono = new Float32Array(inputLength);
    for (let index = 0; index < inputLength; index += 1) {
      let sample = 0;
      for (let channel = 0; channel < channelCount; channel += 1) {
        sample += input[channel][index] || 0;
      }
      mono[index] = sample / channelCount;
    }

    const ratio = sampleRate / this.targetRate;
    const outputLength = Math.floor((inputLength - this.sourceRemainder) / ratio);
    if (outputLength <= 0) return true;

    const pcm = new Int16Array(outputLength);
    let sourceIndex = this.sourceRemainder;
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const leftIndex = Math.floor(sourceIndex);
      const rightIndex = Math.min(leftIndex + 1, inputLength - 1);
      const weight = sourceIndex - leftIndex;
      const sampleValue = mono[leftIndex] * (1 - weight) + mono[rightIndex] * weight;
      const clamped = Math.max(-1, Math.min(1, sampleValue));
      pcm[outputIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      sourceIndex += ratio;
    }

    this.sourceRemainder = sourceIndex - inputLength;
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("knownext-pcm-processor", KnownextPcmProcessor);
