import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContainer';

function Trigger({ type = 'success', message = 'Guardado', duration }) {
    const toast = useToast();
    return (
        <button type="button" onClick={() => toast[type](message, duration)}>
            Lanzar
        </button>
    );
}

const progressOf = (toastEl) => toastEl.querySelector('.toast-progress');

describe('ToastContainer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        act(() => { jest.runOnlyPendingTimers(); });
        jest.useRealTimers();
    });

    test('muestra el mensaje con su tipo y una barra con la duración por defecto (4 s)', () => {
        render(<ToastProvider><Trigger /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));

        const toastEl = screen.getByRole('status');
        expect(toastEl).toHaveClass('toast', 'toast-success');
        expect(toastEl).toHaveTextContent('Guardado');
        const bar = progressOf(toastEl);
        expect(bar).not.toBeNull();
        expect(bar).toHaveAttribute('aria-hidden', 'true');
        expect(bar.style.getPropertyValue('--toast-duration')).toBe('4000ms');
    });

    test('la barra usa la duración pedida y el toast se cierra al cumplirse', () => {
        render(<ToastProvider><Trigger type="warning" message="Revisa el stock" duration={2500} /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));

        const toastEl = screen.getByRole('status');
        expect(toastEl).toHaveClass('toast-warning');
        expect(progressOf(toastEl).style.getPropertyValue('--toast-duration')).toBe('2500ms');

        act(() => { jest.advanceTimersByTime(2499); });
        expect(screen.getByText('Revisa el stock')).toBeInTheDocument();
        act(() => { jest.advanceTimersByTime(1); });
        expect(screen.queryByText('Revisa el stock')).toBeNull();
    });

    test('error usa role="alert"; el botón Cerrar lo quita', () => {
        render(<ToastProvider><Trigger type="error" message="No se pudo guardar" /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));

        expect(screen.getByRole('alert')).toHaveClass('toast-error');
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.queryByText('No se pudo guardar')).toBeNull();
    });

    test('useToast fuera del proveedor lanza un error claro', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Trigger />)).toThrow('useToast must be used within ToastProvider');
        spy.mockRestore();
    });
});
