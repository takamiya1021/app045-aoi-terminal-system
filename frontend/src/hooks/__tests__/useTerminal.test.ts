import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '../useTerminal'; 
import { Terminal } from 'xterm'; // Import actual Terminal type for mocking
import { FitAddon } from '@xterm/addon-fit'; // Import actual FitAddon type for mocking

// Mock xterm.js and FitAddon
const mockTerminalInstance = {
  open: jest.fn(),
  write: jest.fn(),
  onData: jest.fn(() => ({ dispose: jest.fn() })),
  onResize: jest.fn(() => ({ dispose: jest.fn() })),
  dispose: jest.fn(),
  focus: jest.fn(),
  blur: jest.fn(),
  proposeGeometry: jest.fn(() => ({ cols: 80, rows: 24 })),
  loadAddon: jest.fn(),
} as unknown as Terminal; // Cast to Terminal to satisfy type checking

const mockFitAddonInstance = {
  fit: jest.fn(),
} as unknown as FitAddon; // Cast to FitAddon to satisfy type checking

// Mock the constructors
jest.mock('xterm', () => ({
  Terminal: jest.fn(() => mockTerminalInstance),
}));

jest.mock('@xterm/addon-fit', () => ({
  FitAddon: jest.fn(() => mockFitAddonInstance),
}));


xdescribe('useTerminal hook', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should initialize terminal and fit addon when ref is attached', async () => {
    const { result } = renderHook(() => useTerminal());

    expect(result.current.terminal).toBeNull(); // Initially null
    expect(result.current.fitAddon).toBeNull(); // Initially null

    // Simulate the ref being attached to a DOM element by React
    await act(async () => {
      result.current.terminalRef(document.createElement('div'));
      await Promise.resolve(); // Allow component to re-render and useEffect to run
      await Promise.resolve(); // Ensure all microtasks are flushed
    });

    expect(Terminal).toHaveBeenCalledTimes(1);
    expect(FitAddon).toHaveBeenCalledTimes(1);
    expect(mockTerminalInstance.loadAddon).toHaveBeenCalledWith(mockFitAddonInstance);
    expect(mockTerminalInstance.open).toHaveBeenCalledWith(expect.any(HTMLDivElement)); // Expect it to be called with a div element
    expect(mockFitAddonInstance.fit).toHaveBeenCalled();
    expect(result.current.terminal).toBe(mockTerminalInstance);
    expect(result.current.fitAddon).toBe(mockFitAddonInstance);
  });

  it('should call onData callback when terminal receives data', async () => {
    const onDataMock = jest.fn();
    const { result } = renderHook(() => useTerminal({ onData: onDataMock }));

    await act(async () => {
      result.current.terminalRef(document.createElement('div'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const onDataHandler = mockTerminalInstance.onData.mock.calls[0][0];
    act(() => {
      onDataHandler('test data');
    });

    expect(onDataMock).toHaveBeenCalledWith('test data');
  });

  it('should call onResize callback when terminal resizes', async () => {
    const onResizeMock = jest.fn();
    const { result } = renderHook(() => useTerminal({ onResize: onResizeMock }));

    await act(async () => {
      result.current.terminalRef(document.createElement('div'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const onResizeHandler = mockTerminalInstance.onResize.mock.calls[0][0];
    act(() => {
      onResizeHandler({ cols: 100, rows: 30 });
    });

    expect(onResizeMock).toHaveBeenCalledWith(100, 30);
  });

  it('should dispose terminal on unmount', async () => {
    const { result, unmount } = renderHook(() => useTerminal());

    await act(async () => {
      result.current.terminalRef(document.createElement('div'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTerminalInstance.dispose).not.toHaveBeenCalled();
    unmount();
    expect(mockTerminalInstance.dispose).toHaveBeenCalledTimes(1);
  });
});