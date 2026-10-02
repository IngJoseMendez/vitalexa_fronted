import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';
import client from '../api/client';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../api/client', () => ({ __esModule: true, default: { post: jest.fn() } }));

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('el ojito muestra y oculta la contraseña', () => {
    render(<Login />);
    const password = screen.getByLabelText('Contraseña');
    fireEvent.change(password, { target: { value: 'secreto' } });
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('el ojito no envía el formulario', () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(client.post).not.toHaveBeenCalled();
  });

  it('avisa cuando Bloq Mayús está activado', () => {
    render(<Login />);
    const password = screen.getByLabelText('Contraseña');
    // jsdom no sabe del estado de Bloq Mayús: el evento nativo responde como un teclado con la
    // tecla activada (React lee nativeEvent.getModifierState)
    const event = new KeyboardEvent('keyup', { key: 'A', bubbles: true });
    Object.defineProperty(event, 'getModifierState', { value: (key) => key === 'CapsLock' });
    act(() => {
      password.dispatchEvent(event);
    });
    expect(screen.getByText('Bloq Mayús está activado')).toBeInTheDocument();
    fireEvent.blur(password);
    expect(screen.queryByText('Bloq Mayús está activado')).not.toBeInTheDocument();
  });

  it('inicia sesión igual que antes (misma llamada, guarda la sesión y redirige)', async () => {
    // token con rol ADMIN en el payload (getRoleFromToken lo lee de ahí)
    const payload = btoa(JSON.stringify({ sub: 'hilary', roles: ['ROLE_ADMIN'], role: 'ROLE_ADMIN', authorities: [{ authority: 'ROLE_ADMIN' }] }));
    client.post.mockResolvedValue({ data: { token: `x.${payload}.y` } });
    render(<Login />);
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'hilary' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto' } });
    fireEvent.click(screen.getByRole('button', { name: /Ingresar/ }));
    await waitFor(() => expect(client.post).toHaveBeenCalledWith('/auth/login', { username: 'hilary', password: 'secreto' }));
    await waitFor(() => expect(localStorage.getItem('username')).toBe('hilary'));
  });

  it('muestra el error del servidor', async () => {
    client.post.mockRejectedValue({ response: { data: { message: 'Credenciales inválidas' } } });
    render(<Login />);
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /Ingresar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });
});
