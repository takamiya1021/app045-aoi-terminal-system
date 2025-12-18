import { render, screen } from '@testing-library/react';
import OfflineIndicator from '../OfflineIndicator'; // Assume component exists

describe('OfflineIndicator', () => {
  it('should not render when online', () => {
    // Mock navigator.onLine to true
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    
    render(<OfflineIndicator />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('should render when offline', () => {
    // Mock navigator.onLine to false
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    
    render(<OfflineIndicator />);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });
});
