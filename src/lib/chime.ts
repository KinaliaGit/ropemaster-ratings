// Campanita de dos notas generada en el navegador (sin archivo de audio). Solo cliente.
// Los navegadores no dejan sonar nada hasta que la persona toca o teclea algo en la página: por eso se «desbloquea» en el primer gesto.

let ctx: AudioContext | null = null;

export function unlockSound() {
  const unlock = () => { ctx ??= new AudioContext(); if (ctx.state === "suspended") ctx.resume(); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
}

/** false si el navegador todavía no permite sonar en esta pestaña. */
export function playChime(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const start = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const at = start + i * 0.14;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(at);
    osc.stop(at + 0.55);
  });
  return true;
}
