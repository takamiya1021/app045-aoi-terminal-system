import { render, screen, fireEvent } from '@testing-library/react';
import TerminalComponent from '../Terminal'; // Assume Terminal.tsx exists

describe('TerminalComponent IME Handling', () => {
  const mockOnData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock xterm.js dependencies if needed, as per Terminal.test.tsx's setup
    // For IME tests, we primarily care about the component's event handling,
    // not xterm.js's internal rendering of IME.
  });

  it('should call onData with composed text on compositionend', () => {
    render(<TerminalComponent onData={mockOnData} />);
    const terminalElement = screen.getByTestId('xterm-terminal');

    // Simulate compositionstart
    fireEvent.compositionStart(terminalElement);
    expect(mockOnData).not.toHaveBeenCalled();

    // Simulate compositionupdate
    fireEvent.compositionUpdate(terminalElement, { data: 'にほん' });
    expect(mockOnData).not.toHaveBeenCalled();

    // Simulate compositionend
    fireEvent.compositionEnd(terminalElement, { data: 'にほんご' });
    
    // Expect onData to be called with the final composed text
    expect(mockOnData).toHaveBeenCalledTimes(1);
    expect(mockOnData).toHaveBeenCalledWith('にほんご');
  });

  it('should clear composing text on compositionstart', () => {
    render(<TerminalComponent onData={mockOnData} />);
    const terminalElement = screen.getByTestId('xterm-terminal');

    // Simulate a previous composition
    fireEvent.compositionUpdate(terminalElement, { data: 'temp' });
    fireEvent.compositionStart(terminalElement);

    // Expect that any previous composing state is cleared before new composition starts
    // (This is more about internal state, which might be hard to test directly here.
    // We can infer it by what gets sent on subsequent compositionend.)
    fireEvent.compositionEnd(terminalElement, { data: 'new_text' });
    expect(mockOnData).toHaveBeenCalledWith('new_text');
    expect(mockOnData).not.toHaveBeenCalledWith('temp');
  });
});