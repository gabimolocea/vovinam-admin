import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavListItem from '../components/navbar/NavListItem';

const item = { link: '/dashboard', title: 'Dashboard', icon: null };

test('renders NavListItem and link', () => {
  render(
    <MemoryRouter>
      <NavListItem item={item} active={false} />
    </MemoryRouter>
  );
  const link = screen.getByRole('button', { name: /dashboard/i });
  expect(link).toBeInTheDocument();
});
