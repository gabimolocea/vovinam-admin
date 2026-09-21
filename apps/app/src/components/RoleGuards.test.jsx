import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin, RequireCoach, RequireCoachOrAdmin } from './RoleGuards.jsx';
import { useAuth } from '@shared';

vi.mock('@shared', () => ({
  useAuth: vi.fn(),
}));

function renderGuard(Guard) {
  return render(
    <MemoryRouter initialEntries={['/guarded']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/guarded" element={<Guard><div>Guarded content</div></Guard>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleGuards', () => {
  describe('RequireAdmin', () => {
    it('renders children for an admin', () => {
      useAuth.mockReturnValue({ isAdmin: true, isCoach: false });
      renderGuard(RequireAdmin);
      expect(screen.getByText('Guarded content')).toBeInTheDocument();
    });

    it('redirects a non-admin to /', () => {
      useAuth.mockReturnValue({ isAdmin: false, isCoach: true });
      renderGuard(RequireAdmin);
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.queryByText('Guarded content')).not.toBeInTheDocument();
    });
  });

  describe('RequireCoach', () => {
    it('renders children for a coach', () => {
      useAuth.mockReturnValue({ isAdmin: false, isCoach: true });
      renderGuard(RequireCoach);
      expect(screen.getByText('Guarded content')).toBeInTheDocument();
    });

    it('redirects an admin who is not also a coach to /', () => {
      useAuth.mockReturnValue({ isAdmin: true, isCoach: false });
      renderGuard(RequireCoach);
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  describe('RequireCoachOrAdmin', () => {
    it('renders children for a coach', () => {
      useAuth.mockReturnValue({ isAdmin: false, isCoach: true });
      renderGuard(RequireCoachOrAdmin);
      expect(screen.getByText('Guarded content')).toBeInTheDocument();
    });

    it('renders children for an admin', () => {
      useAuth.mockReturnValue({ isAdmin: true, isCoach: false });
      renderGuard(RequireCoachOrAdmin);
      expect(screen.getByText('Guarded content')).toBeInTheDocument();
    });

    it('redirects anyone who is neither a coach nor an admin to /', () => {
      useAuth.mockReturnValue({ isAdmin: false, isCoach: false });
      renderGuard(RequireCoachOrAdmin);
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });
});
