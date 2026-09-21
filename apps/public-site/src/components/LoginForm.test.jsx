import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginForm from './LoginForm.jsx';
import { useAuth, authAPI } from '@shared';

vi.mock('@shared', () => ({
  useAuth: vi.fn(),
  authAPI: {
    requestPasswordReset: vi.fn(),
  },
}));

// LoginForm without onSuccess navigates to '/cont' on success, so it's
// rendered at a different path here and '/cont' is given a marker element -
// that way a real react-router navigation can be asserted, not just mocked.
function renderLoginForm(props) {
  return render(
    <MemoryRouter initialEntries={['/some-entry-page']}>
      <Routes>
        <Route path="/some-entry-page" element={<LoginForm {...props} />} />
        <Route path="/cont" element={<div>Ești autentificat</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls login() with the entered credentials and onSuccess when provided', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({});
    const onSuccess = vi.fn();
    useAuth.mockReturnValue({ login });

    renderLoginForm({ onSuccess });

    await user.type(screen.getByLabelText('Introdu adresa de email', { exact: false }), 'sportiv@example.com');
    await user.type(screen.getByLabelText('Parolă', { exact: false }), 'parola-secreta');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('sportiv@example.com', 'parola-secreta'));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows the server error message when login fails', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue({ response: { data: { detail: 'Email sau parolă incorectă.' } } });
    useAuth.mockReturnValue({ login });

    renderLoginForm();

    await user.type(screen.getByLabelText('Introdu adresa de email', { exact: false }), 'gresit@example.com');
    await user.type(screen.getByLabelText('Parolă', { exact: false }), 'gresita');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));

    expect(await screen.findByText('Email sau parolă incorectă.')).toBeInTheDocument();
  });

  it('falls back to a generic error message when the server sends none', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new Error('network error'));
    useAuth.mockReturnValue({ login });

    renderLoginForm();

    await user.type(screen.getByLabelText('Introdu adresa de email', { exact: false }), 'a@b.com');
    await user.type(screen.getByLabelText('Parolă', { exact: false }), 'x');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));

    expect(await screen.findByText('Autentificarea a eșuat. Verifică emailul și parola.')).toBeInTheDocument();
  });

  it('toggles to the forgot-password form and requests a reset email', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ login: vi.fn() });
    authAPI.requestPasswordReset.mockResolvedValue({});

    renderLoginForm();

    await user.click(screen.getByRole('button', { name: 'Ai uitat parola?' }));
    await user.type(screen.getByLabelText('Introdu adresa de email a contului tău', { exact: false }), 'reset@example.com');
    await user.click(screen.getByRole('button', { name: 'Trimite link de resetare' }));

    await waitFor(() => expect(authAPI.requestPasswordReset).toHaveBeenCalledWith('reset@example.com'));
    expect(await screen.findByText(/vei primi un email cu un link de resetare/)).toBeInTheDocument();
  });

  it('navigates to /cont on success when no onSuccess is given', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ login });

    renderLoginForm();

    await user.type(screen.getByLabelText('Introdu adresa de email', { exact: false }), 'a@b.com');
    await user.type(screen.getByLabelText('Parolă', { exact: false }), 'x');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));

    expect(await screen.findByText('Ești autentificat')).toBeInTheDocument();
  });
});
