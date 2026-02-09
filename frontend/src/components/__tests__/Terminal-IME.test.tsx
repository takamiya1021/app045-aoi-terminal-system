import { render, screen, fireEvent } from '@testing-library/react';
import TerminalComponent from '../Terminal'; // Assume Terminal.tsx exists

describe('TerminalComponent IME Handling', () => {
  const mockOnData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call onData with composed text on compositionend', () => {
    render(<TerminalComponent onData={mockOnData} />);
    const terminalElement = screen.getByTestId('xterm-terminal');

    // compositionStartが先に発火する必要がある（isComposingフラグ管理）
    fireEvent.compositionStart(terminalElement);
    expect(mockOnData).not.toHaveBeenCalled();

    // compositionupdate（中間状態）
    fireEvent.compositionUpdate(terminalElement, { data: 'にほん' });
    expect(mockOnData).not.toHaveBeenCalled();

    // compositionend（確定）
    // React SyntheticEventではdataはnativeEventから取得する
    const compositionEndEvent = new Event('compositionend', { bubbles: true });
    Object.defineProperty(compositionEndEvent, 'data', { value: 'にほんご' });
    terminalElement.dispatchEvent(compositionEndEvent);

    expect(mockOnData).toHaveBeenCalledTimes(1);
    expect(mockOnData).toHaveBeenCalledWith('にほんご');
  });

  it('should clear composing state on new compositionstart', () => {
    render(<TerminalComponent onData={mockOnData} />);
    const terminalElement = screen.getByTestId('xterm-terminal');

    // 1回目のcomposition
    fireEvent.compositionStart(terminalElement);
    const endEvent1 = new Event('compositionend', { bubbles: true });
    Object.defineProperty(endEvent1, 'data', { value: 'first' });
    terminalElement.dispatchEvent(endEvent1);
    expect(mockOnData).toHaveBeenCalledWith('first');

    // 2回目のcomposition
    fireEvent.compositionStart(terminalElement);
    const endEvent2 = new Event('compositionend', { bubbles: true });
    Object.defineProperty(endEvent2, 'data', { value: 'second' });
    terminalElement.dispatchEvent(endEvent2);
    expect(mockOnData).toHaveBeenCalledWith('second');
    expect(mockOnData).toHaveBeenCalledTimes(2);
  });
});
