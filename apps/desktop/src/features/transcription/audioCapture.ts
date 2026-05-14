export type PcmAudioCapture = {
  stop: () => Promise<void>;
};

export async function startPcmAudioCapture(onChunk: (chunk: ArrayBuffer) => void): Promise<PcmAudioCapture> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("El navegador no permite capturar audio.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("/audio-worklets/knownext-pcm-processor.js");
  const source = audioContext.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(audioContext, "knownext-pcm-processor");
  processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (event.data.byteLength > 0) onChunk(event.data);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    async stop() {
      processor.port.onmessage = null;
      try {
        source.disconnect();
        processor.disconnect();
      } catch {
        // Already disconnected.
      }
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}
