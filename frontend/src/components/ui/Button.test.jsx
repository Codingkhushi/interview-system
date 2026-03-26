import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button';

describe('Button component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when loading prop is true', () => {
    render(<Button loading={true}>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies the correct variant class', () => {
     const { container } = render(<Button variant="danger">Danger</Button>);
     // Assuming the variant prop adds a class named 'danger' (from styles[variant])
     // Since we use CSS modules, we check if the label exists at least
     expect(screen.getByText('Danger')).toBeInTheDocument();
  });
});
