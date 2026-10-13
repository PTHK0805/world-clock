let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/**
 * A short two-note chime (C6 then G6), each a sine with two soft overtones and an
 * exponential decay — clean and bell-like rather than a system beep. Roughly 0.7s total.
 */
export function playReminderChime(): void {
  const audio = ensureContext();
  if (!audio) return;

  const start = audio.currentTime + 0.02;
  const master = audio.createGain();
  master.gain.value = 0.9;
  master.connect(audio.destination);

  const notes = [
    { frequency: 1046.5, at: 0, duration: 0.5 },
    { frequency: 1568.0, at: 0.11, duration: 0.62 },
  ];
  const partials = [
    { ratio: 1, level: 1 },
    { ratio: 2, level: 0.16 },
    { ratio: 3, level: 0.05 },
  ];

  for (const note of notes) {
    for (const partial of partials) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const noteStart = start + note.at;
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency * partial.ratio;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.11 * partial.level, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + note.duration + 0.05);
    }
  }
}
