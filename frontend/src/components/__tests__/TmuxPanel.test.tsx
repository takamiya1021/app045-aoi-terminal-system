import { render, screen, fireEvent } from '@testing-library/react';
import TmuxPanel from '../TmuxPanel'; // Assume TmuxPanel.tsx exists

describe('TmuxPanel Component', () => {
  const mockOnSendCommand = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render various tmux command buttons after opening the panel', () => {
    render(<TmuxPanel onSendCommand={mockOnSendCommand} />);

    // Panel is initially closed, so buttons should not be in the document
    expect(screen.queryByText('New Window (c)')).not.toBeInTheDocument();

    // Open the panel
    fireEvent.click(screen.getByText('Open tmux Panel'));

    // Check for common tmux commands
    expect(screen.getByText('New Window (c)')).toBeInTheDocument();
    expect(screen.getByText('Next Window (n)')).toBeInTheDocument();
    expect(screen.getByText('Previous Window (p)')).toBeInTheDocument();
    expect(screen.getByText('Detach (d)')).toBeInTheDocument();
    expect(screen.getByText('Split Vertical (%)')).toBeInTheDocument();
    expect(screen.getByText('Split Horizontal (")')).toBeInTheDocument();
  });

  it('should call onSendCommand with correct command for New Window button', () => {
    render(<TmuxPanel onSendCommand={mockOnSendCommand} />);
    fireEvent.click(screen.getByText('Open tmux Panel')); // Open the panel
    fireEvent.click(screen.getByText('New Window (c)'));
    expect(mockOnSendCommand).toHaveBeenCalledTimes(1);
    expect(mockOnSendCommand).toHaveBeenCalledWith('new-window', undefined);
  });

  it('should call onSendCommand with correct command for Split Vertical button', () => {
    render(<TmuxPanel onSendCommand={mockOnSendCommand} />);
    fireEvent.click(screen.getByText('Open tmux Panel')); // Open the panel
    fireEvent.click(screen.getByText('Split Vertical (%)'));
    expect(mockOnSendCommand).toHaveBeenCalledTimes(1);
    expect(mockOnSendCommand).toHaveBeenCalledWith('split-window -v', undefined);
  });

  it('should close the panel when "Close tmux Panel" is clicked', () => {
    render(<TmuxPanel onSendCommand={mockOnSendCommand} />);
    fireEvent.click(screen.getByText('Open tmux Panel'));
    expect(screen.getByText('New Window (c)')).toBeInTheDocument(); // Ensure it's open
    fireEvent.click(screen.getByText('Close tmux Panel'));
    expect(screen.queryByText('New Window (c)')).not.toBeInTheDocument(); // Ensure it's closed
  });

  // Add more tests for other buttons as needed
});
