export function preferredRecorderMime(MediaRecorderClass = globalThis.MediaRecorder) {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  if (!MediaRecorderClass?.isTypeSupported) return '';
  return candidates.find((type) => MediaRecorderClass.isTypeSupported(type)) || '';
}

export function stopVoiceSession(session = {}) {
  const { recognition, recorder, stream, controller, audio } = session;
  try {
    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onstart = null;
      recognition.abort?.();
      recognition.stop?.();
    }
  } catch {}
  try {
    if (recorder && recorder.state && recorder.state !== 'inactive') recorder.stop();
  } catch {}
  try {
    stream?.getTracks?.().forEach((track) => {
      try { track.enabled = false; } catch {}
      try { track.stop?.(); } catch {}
    });
  } catch {}
  try { controller?.abort?.(); } catch {}
  try {
    if (audio) {
      audio.pause?.();
      audio.removeAttribute?.('src');
      audio.load?.();
    }
  } catch {}
}

export function voiceRateForAgent(agent = {}) {
  const seed = String(agent.avatarSeed || agent.id || agent.name || 'ripo')
    .split('')
    .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
  return 0.97 + (seed % 7) * 0.01;
}
