import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WelcomeRedesignGate from './WelcomeRedesignGate';
import { hasSeenWelcome, markWelcomeSeen } from './welcomeStorage';
import { clearStorageKeepingSidebarPrefs } from '../../hooks/useSidebarCollapsed';

describe('Bienvenida del rediseño', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.style.overflow = '';
  });

  it('se muestra a quien no la ha visto, con el mensaje de José', async () => {
    render(<WelcomeRedesignGate username="hilary" />);
    const dialog = await screen.findByRole('dialog', { name: '¡Hola, Hilary!' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Un mensaje de José')).toBeInTheDocument();
    expect(screen.getByText(/diseñería/)).toBeInTheDocument();
    expect(screen.getByText(/no odies a la señora Mercy/)).toBeInTheDocument();
    expect(screen.getByText(/choripapas/)).toBeInTheDocument();
    expect(screen.getByText(/todavía no está terminado/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'corazón' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar el trabajo :\)/ })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('"Iniciar el trabajo :)" la cierra y no vuelve a salir', async () => {
    jest.useFakeTimers();
    try {
      const { unmount } = render(<WelcomeRedesignGate username="hilary" />);
      fireEvent.click(await screen.findByRole('button', { name: /Iniciar el trabajo :\)/ }));
      expect(hasSeenWelcome('hilary')).toBe(true);
      act(() => {
        jest.advanceTimersByTime(800);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
      unmount();

      render(<WelcomeRedesignGate username="hilary" />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('Escape también la cierra y la marca como vista', async () => {
    render(<WelcomeRedesignGate username="hilary" />);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hasSeenWelcome('hilary')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('no se muestra si ya la vio', () => {
    markWelcomeSeen('hilary');
    render(<WelcomeRedesignGate username="hilary" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el botón de sonido alterna y se recuerda', async () => {
    render(<WelcomeRedesignGate username="hilary" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Silenciar' }));
    expect(screen.getByRole('button', { name: 'Activar sonido' })).toBeInTheDocument();
    expect(localStorage.getItem('vx:pref:bienvenida:sonido')).toBe('off');
  });

  it('cerrar sesión conserva que ya la vio (no vuelve a salir al entrar de nuevo)', () => {
    markWelcomeSeen('hilary');
    localStorage.setItem('token', 'x');
    localStorage.setItem('role', 'ROLE_ADMIN');
    clearStorageKeepingSidebarPrefs();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(hasSeenWelcome('hilary')).toBe(true);
  });
});
