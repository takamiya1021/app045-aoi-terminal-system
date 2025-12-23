import { render, screen, fireEvent } from '@testing-library/react';
import SessionManager from '../SessionManager'; // Assume SessionManager.tsx exists
import { TmuxWindow } from '../../lib/types'; // Import TmuxWindow type

describe('SessionManager Component', () => {
  const mockOnSelectWindow = jest.fn();
  const mockWindows: TmuxWindow[] = [
    { id: '0', name: 'bash', active: true, panes: 1 },
    { id: '1', name: 'editor', active: false, panes: 2 },
    { id: '2', name: 'logs', active: false, panes: 1 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render a list of tmux windows after opening the panel', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );

    // Panel is initially closed
    expect(screen.queryByText('bash')).not.toBeInTheDocument();

    // Open the panel
    fireEvent.click(screen.getByText('TMUX WINDOWS'));

    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByText('logs')).toBeInTheDocument();
    // Check for pane counts
    expect(screen.getAllByText('(1)', { selector: 'span' })[0]).toBeInTheDocument();
    expect(screen.getByText('(2)', { selector: 'span' })).toBeInTheDocument();
  });

  it('should highlight the active window', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('TMUX WINDOWS')); // Open the panel

    const activeWindowElement = screen.getByText('bash').closest('button');
    expect(activeWindowElement).toHaveClass('bg-orange-600');
  });

  it('should call onSelectWindow when a non-active window button is clicked', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('TMUX WINDOWS')); // Open the panel

    fireEvent.click(screen.getByText('editor'));
    expect(mockOnSelectWindow).toHaveBeenCalledTimes(1);
    expect(mockOnSelectWindow).toHaveBeenCalledWith('1');
  });

  it('should not call onSelectWindow when the active window button is clicked', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('TMUX WINDOWS')); // Open the panel

    fireEvent.click(screen.getByText('bash'));
    expect(mockOnSelectWindow).not.toHaveBeenCalled();
  });

  it('should close the panel when the toggle button is clicked again', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('TMUX WINDOWS'));
    expect(screen.getByText('bash')).toBeInTheDocument();
    fireEvent.click(screen.getByText('TMUX WINDOWS'));
    expect(screen.queryByText('bash')).not.toBeInTheDocument();
  });
});
