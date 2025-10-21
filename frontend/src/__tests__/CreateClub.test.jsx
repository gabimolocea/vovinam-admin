import React from 'react';
import { render, screen } from '@testing-library/react';
import CreateClub from '../components/CreateClub';

test('renders CreateClub form and submit button', () => {
  render(<CreateClub />);
  const button = screen.getByRole('button', { name: /submit the data/i });
  expect(button).toBeInTheDocument();
});
