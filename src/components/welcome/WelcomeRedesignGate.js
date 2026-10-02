import React, { Component, Suspense, useState } from 'react';
import { hasSeenWelcome } from './welcomeStorage';
import { lazyWithRetry } from '../LazyFallbacks';

// El mensaje (con su CSS y sus animaciones) solo se descarga si hace falta mostrarlo
const WelcomeRedesign = lazyWithRetry(() => import('./WelcomeRedesign'));

// Si no se pudo descargar, simplemente no se muestra: nunca debe estorbar el trabajo
class SilentBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Bienvenida del rediseño: una sola vez por usuario y navegador. */
export default function WelcomeRedesignGate({ username }) {
  const [open, setOpen] = useState(() => !hasSeenWelcome(username));
  if (!open) return null;
  return (
    <SilentBoundary>
      <Suspense fallback={null}>
        <WelcomeRedesign username={username} onClose={() => setOpen(false)} />
      </Suspense>
    </SilentBoundary>
  );
}
