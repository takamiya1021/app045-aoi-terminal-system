import { render, screen } from '@testing-library/react';
import App from '../src/App';

// Mock Terminal component to avoid canvas issues
jest.mock('../src/components/Terminal', () => {
  return function MockTerminal() {
    return <div data-testid="mock-terminal">Mock Terminal</div>;
  };
});

describe('App', () => {
  it('should render auth overlay within the layout', () => {
    render(<App />);

    // Check for Layout elements
    expect(screen.getByRole('banner')).toHaveTextContent('Aoi-Terminals');

    // 初期状態は未認証なので、トークン入力が見える
    expect(screen.getByTestId('auth-token-input')).toBeInTheDocument();
    expect(screen.getByTestId('auth-submit')).toBeInTheDocument();
  });
});
