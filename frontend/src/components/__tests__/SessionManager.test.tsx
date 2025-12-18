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

    // Panel is initially closed, so buttons should not be in the document
    expect(screen.queryByText('bash (1 panes)')).not.toBeInTheDocument();

    // Open the panel
    fireEvent.click(screen.getByText('Open Session Manager'));

    expect(screen.getByText('bash (1 panes)')).toBeInTheDocument();
    expect(screen.getByText('editor (2 panes)')).toBeInTheDocument();
    expect(screen.getByText('logs (1 panes)')).toBeInTheDocument();
  });

  it('should highlight the active window', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('Open Session Manager')); // Open the panel

    // Assuming active window has a specific class or style
    const activeWindowElement = screen.getByText('bash (1 panes)').closest('button');
    expect(activeWindowElement).toHaveClass('bg-orange-600'); // Example class
  });

  it('should call onSelectWindow when a non-active window button is clicked', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('Open Session Manager')); // Open the panel

    fireEvent.click(screen.getByText('editor (2 panes)'));
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
    fireEvent.click(screen.getByText('Open Session Manager')); // Open the panel

    fireEvent.click(screen.getByText('bash (1 panes)'));
    expect(mockOnSelectWindow).not.toHaveBeenCalled();
  });

  it('should close the panel when "Close Session Manager" is clicked', () => {
    render(
      <SessionManager
        windows={mockWindows}
        onSelectWindow={mockOnSelectWindow}
        currentWindowId="0"
      />
    );
    fireEvent.click(screen.getByText('Open Session Manager'));
    expect(screen.getByText('bash (1 panes)')).toBeInTheDocument(); // Ensure it's open
    fireEvent.click(screen.getByText('Close Session Manager'));
    expect(screen.queryByText('bash (1 panes)')).not.toBeInTheDocument(); // Ensure it's closed
  });
});
