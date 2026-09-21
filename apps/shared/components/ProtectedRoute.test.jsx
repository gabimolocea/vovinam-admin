import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

function renderProtected({ roles } = {}) {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/private"
          element={(
            <ProtectedRoute roles={roles}>
              <div>Secret content</div>
            </ProtectedRoute>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading spinner while auth state is still resolving', () => {
    useAuth.mockReturnValue({ loading: true, isAuthenticated: false, user: null });
    const { container } = renderProtected();

    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: false, user: null });
    renderProtected();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders the children when authenticated and no roles are required', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: true, user: { role: 'coach' } });
    renderProtected();

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('renders the children when authenticated and the user has an allowed role', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: true, user: { role: 'admin' } });
    renderProtected({ roles: ['admin'] });

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('shows an access-denied message when authenticated but lacking an allowed role', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: true, user: { role: 'athlete' } });
    renderProtected({ roles: ['admin'] });

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });
});
