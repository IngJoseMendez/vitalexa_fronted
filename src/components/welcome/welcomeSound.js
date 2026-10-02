// Sonidos de la bienvenida generados con Web Audio (sin archivos que descargar).
// Los navegadores bloquean el audio hasta que la persona interactúa con la página: si el
// contexto sigue suspendido, la melodía de apertura se toca en el primer toque o tecla.

let sharedContext = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedContext) {
    try {
      sharedContext = new AudioCtor();
    } catch (error) {
      return null;
    }
  }
  return sharedContext;
};

// Nota con envolvente suave (ataque corto, caída exponencial): suena a campanita, no a pitido
const playNote = (ctx, frequency, startAt, { duration = 0.9, type = 'sine', volume = 0.07 } = {}) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
};

const whenRunning = (ctx, play) => {
  if (ctx.state === 'running') {
    play();
    return () => {};
  }
  let done = false;
  const tryPlay = () => {
    if (done) return;
    ctx.resume().then(() => {
      if (!done && ctx.state === 'running') {
        done = true;
        cleanup();
        play();
      }
    }).catch(() => {});
  };
  const cleanup = () => {
    window.removeEventListener('pointerdown', tryPlay, true);
    window.removeEventListener('keydown', tryPlay, true);
  };
  // Intento inmediato (después de iniciar sesión el navegador suele permitirlo) y, si no,
  // en la primera interacción
  tryPlay();
  window.addEventListener('pointerdown', tryPlay, true);
  window.addEventListener('keydown', tryPlay, true);
  return () => {
    done = true;
    cleanup();
  };
};

/** Arpegio suave de bienvenida (Do mayor). Devuelve una función para cancelar si aún no sonó. */
export const playWelcomeChime = () => {
  const ctx = getContext();
  if (!ctx) return () => {};
  return whenRunning(ctx, () => {
    const t = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
      playNote(ctx, frequency, t + i * 0.12, { duration: 1.1, type: 'sine', volume: 0.06 });
      playNote(ctx, frequency * 2, t + i * 0.12, { duration: 0.5, type: 'triangle', volume: 0.012 });
    });
  });
};

/** "Pop" alegre al iniciar el trabajo. */
export const playStartPop = () => {
  const ctx = getContext();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(520, t);
  oscillator.frequency.exponentialRampToValueAtTime(1180, t + 0.12);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(t);
  oscillator.stop(t + 0.25);
  playNote(ctx, 1318.51, t + 0.1, { duration: 0.45, type: 'sine', volume: 0.035 });
  playNote(ctx, 1567.98, t + 0.18, { duration: 0.5, type: 'sine', volume: 0.03 });
};
