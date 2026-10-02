import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isWelcomeSoundMuted, markWelcomeSeen, setWelcomeSoundMuted } from './welcomeStorage';
import { playStartPop, playWelcomeChime } from './welcomeSound';
import './WelcomeRedesign.css';

// Mensaje de bienvenida del rediseño para la administradora (una sola vez; ver WelcomeRedesignGate).
const LOGO_SRC = `${process.env.PUBLIC_URL || ''}/logo192.png?v=2`;

const MESSAGES = [
  {
    icon: 'auto_awesome',
    tone: 'primary',
    text: 'Le hicimos una cirugía estética a Vitalexa: más limpia, más rápida y con buscadores donde antes tocaba bajar y bajar hasta encontrar el producto.',
  },
  {
    icon: 'brush',
    tone: 'warning',
    text: '¿Que no te gusta el diseño? Perfecto: la diseñería queda abierta las 24 horas. Agarras el mouse y lo haces tú. Aquí te espero sentado. 😌',
  },
  {
    icon: 'emoji_events',
    tone: 'success',
    text: 'Ahora en serio: estás haciendo un trabajo increíble.',
  },
  {
    icon: 'volunteer_activism',
    tone: 'primary',
    text: 'Por favor, no odies a la señora Mercy.',
  },
  {
    icon: 'lunch_dining',
    tone: 'warning',
    text: 'Y cuidado: Amy anda haciendo sus choripapas en la plataforma. Si ves algo raro, ya sabes quién fue. 🤨',
  },
  {
    icon: 'construction',
    tone: 'success',
    text: 'Esto todavía no está terminado: faltan partes por rediseñar, así que ve guardando las quejas para la próxima.',
  },
];

// Partículas deterministas (sin Math.random: mismo resultado en cada render y en los tests)
const frac = (n) => n - Math.floor(n);
const PARTICLE_TONES = ['primary', 'success', 'gold', 'danger', 'warning'];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  x: frac(i * 0.618) * 100,
  delay: frac(i * 0.37) * 0.7,
  duration: 2.4 + frac(i * 0.29) * 1.6,
  rotate: Math.round(frac(i * 0.43) * 720 - 360),
  drift: Math.round((frac(i * 0.71) - 0.5) * 160),
  tone: PARTICLE_TONES[i % PARTICLE_TONES.length],
  shape: i % 3,
}));
const FLOATERS = Array.from({ length: 12 }, (_, i) => ({
  x: 4 + frac(i * 0.618) * 92,
  delay: frac(i * 0.53) * 6,
  duration: 7 + frac(i * 0.31) * 5,
  size: 14 + Math.round(frac(i * 0.77) * 14),
  icon: i % 3 === 0 ? 'favorite' : 'auto_awesome',
  tone: i % 3 === 0 ? 'danger' : PARTICLE_TONES[i % 2],
}));
const BURST = Array.from({ length: 12 }, (_, i) => ({ angle: i * 30, distance: 64 + (i % 3) * 20 }));

const prefersReducedMotion = () => {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (error) {
    return false;
  }
};

export default function WelcomeRedesign({ username, onClose }) {
  const [muted, setMuted] = useState(isWelcomeSoundMuted);
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const ctaRef = useRef(null);
  const cancelChimeRef = useRef(() => {});
  const startedMutedRef = useRef(muted);
  const closeTimerRef = useRef(null);

  // Melodía de apertura (si el navegador aún no deja sonar, suena en el primer toque)
  useEffect(() => {
    if (!startedMutedRef.current) cancelChimeRef.current = playWelcomeChime();
    return () => cancelChimeRef.current();
  }, []);

  // Foco en "Iniciar el trabajo" y sin scroll del fondo mientras está abierta
  useEffect(() => {
    if (ctaRef.current) ctaRef.current.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const finish = useCallback(() => {
    if (leaving) return;
    markWelcomeSeen(username);
    if (!muted) playStartPop();
    setLeaving(true);
    // Deja ver la explosión de corazones antes de cerrar
    closeTimerRef.current = setTimeout(() => onClose(), prefersReducedMotion() ? 0 : 700);
  }, [leaving, muted, onClose, username]);

  // Escape cierra; Tab no se sale del mensaje
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [finish]);

  const toggleMuted = () => {
    setMuted((current) => {
      const next = !current;
      setWelcomeSoundMuted(next);
      if (next) cancelChimeRef.current();
      return next;
    });
  };

  return (
    <div className={`wr-overlay${leaving ? ' is-leaving' : ''}`} role="presentation">
      <div className="wr-confetti" aria-hidden="true">
        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            className={`wr-confetti-piece wr-confetti-piece--${piece.shape} wr-tone-bg-${piece.tone}`}
            style={{
              '--x': `${piece.x}%`,
              '--delay': `${piece.delay}s`,
              '--duration': `${piece.duration}s`,
              '--rotate': `${piece.rotate}deg`,
              '--drift': `${piece.drift}px`,
            }}
          />
        ))}
      </div>

      <div className="wr-floaters" aria-hidden="true">
        {FLOATERS.map((floater, i) => (
          <span
            key={i}
            className={`wr-floater material-icons-round wr-tone-text-${floater.tone}`}
            style={{
              '--x': `${floater.x}%`,
              '--delay': `${floater.delay}s`,
              '--duration': `${floater.duration}s`,
              '--size': `${floater.size}px`,
            }}
          >
            {floater.icon}
          </span>
        ))}
      </div>

      <div
        ref={dialogRef}
        className="wr-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <button
          type="button"
          className="wr-mute ui-icon-btn"
          onClick={toggleMuted}
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          title={muted ? 'Activar sonido' : 'Silenciar'}
        >
          <span className="material-icons-round" aria-hidden="true">{muted ? 'volume_off' : 'volume_up'}</span>
        </button>

        <div className="wr-hero">
          <div className="wr-logo-wrap">
            <span className="wr-logo-ring" aria-hidden="true" />
            <img className="wr-logo" src={LOGO_SRC} width="72" height="72" alt="Vitalexa" />
          </div>
          <span className="wr-chip">
            <span className="material-icons-round" aria-hidden="true">auto_awesome</span>
            Nueva versión de Vitalexa
          </span>
          <h2 id={titleId} className="wr-title">¡Hola, Hilary!</h2>
          <p className="wr-subtitle">Un mensaje de José</p>
        </div>

        <ul id={descId} className="wr-messages">
          {MESSAGES.map((message, i) => (
            <li key={message.icon + i} className={`wr-message wr-tone-${message.tone}`} style={{ '--i': i }}>
              <span className="wr-message-icon material-icons-round" aria-hidden="true">{message.icon}</span>
              <p>{message.text}</p>
            </li>
          ))}
        </ul>

        <div className="wr-footer">
          <p className="wr-signature">
            Con cariño, José
            <span className="wr-heart material-icons-round" role="img" aria-label="corazón">favorite</span>
          </p>
          <div className="wr-cta-wrap">
            <button
              ref={ctaRef}
              type="button"
              className="ui-btn ui-btn--primary ui-btn--lg wr-cta"
              onClick={finish}
            >
              <span className="material-icons-round" aria-hidden="true">sentiment_very_satisfied</span>
              Iniciar el trabajo :)
            </button>
            {leaving && (
              <span className="wr-burst" aria-hidden="true">
                {BURST.map((particle, i) => (
                  <span
                    key={i}
                    className="wr-burst-heart material-icons-round"
                    style={{ '--a': `${particle.angle}deg`, '--d': `${particle.distance}px` }}
                  >
                    favorite
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
