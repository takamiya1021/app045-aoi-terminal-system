import { render, screen } from '@testing-library/react';
import Home from '../src/app/page';

// Mock Terminal component to avoid canvas issues
jest.mock('../src/components/Terminal', () => {
  return function MockTerminal() {
    return <div data-testid="mock-terminal">Mock Terminal</div>;
  };
});

describe('Home Page', () => {
  it('should render auth overlay within the layout', () => {
    render(<Home />);
    
    // Check for Layout elements
    expect(screen.getByRole('banner')).toHaveTextContent('Aoi-Terminals');
    
    // 初期状態は未認証なので、トークン入力が見える
    expect(screen.getByTestId('auth-token-input')).toBeInTheDocument();
    expect(screen.getByTestId('auth-submit')).toBeInTheDocument();
  });
});
