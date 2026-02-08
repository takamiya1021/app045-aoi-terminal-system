import { render, screen, fireEvent } from '@testing-library/react';
import ControlPanel from '../ControlPanel'; // Assume ControlPanel.tsx exists

describe('ControlPanel Component', () => {
  const mockOnSendKey = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render various control buttons', () => {
    render(<ControlPanel onSendKey={mockOnSendKey} />);

    // Check for common special keys (Ctrlはtmux操作と統合してTmuxPanelに移動済み)
    expect(screen.getByText('Alt')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('Tab')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    
    // Check for arrow keys (assuming symbols or specific text)
    expect(screen.getByLabelText('Arrow Up')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrow Down')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrow Left')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrow Right')).toBeInTheDocument();

    // Check for shortcuts
    expect(screen.getByText('^C')).toBeInTheDocument();
    expect(screen.getByText('^D')).toBeInTheDocument();
  });

  it('should call onSendKey with correct key for Alt button', () => {
    render(<ControlPanel onSendKey={mockOnSendKey} />);
    fireEvent.click(screen.getByText('Alt'));
    expect(mockOnSendKey).toHaveBeenCalledTimes(1);
    expect(mockOnSendKey).toHaveBeenCalledWith('\x1b');
  });

  it('should call onSendKey with correct key for Enter button', () => {
    render(<ControlPanel onSendKey={mockOnSendKey} />);
    fireEvent.click(screen.getByText('Enter'));
    expect(mockOnSendKey).toHaveBeenCalledTimes(1);
    expect(mockOnSendKey).toHaveBeenCalledWith('\r'); // Carriage Return
  });

  it('should call onSendKey with correct key for Arrow Up button', () => {
    render(<ControlPanel onSendKey={mockOnSendKey} />);
    fireEvent.click(screen.getByLabelText('Arrow Up'));
    expect(mockOnSendKey).toHaveBeenCalledTimes(1);
    expect(mockOnSendKey).toHaveBeenCalledWith('\x1b[A'); // ANSI escape code for Arrow Up
  });

  // Add more tests for other buttons as needed
});
