'use client';

import React from 'react';

interface ControlPanelProps {
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onSendKey, onOpenTextInput }) => {
  const handleButtonClick = (key: string) => {
    onSendKey(key);
  };

  const renderActionButton = (label: string, onClick: () => void, uniqueKey: string, ariaLabel?: string) => (
    <button
      key={uniqueKey}
      className="px-3 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[44px] flex items-center justify-center transition-colors"
      onClick={onClick}
      aria-label={ariaLabel || label}
      type="button"
    >
      {label}
    </button>
  );

  const renderButton = (label: string, keyToSend: string, uniqueKey: string, ariaLabel?: string) => (
    <button
      key={uniqueKey}
      className="px-3 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[44px] flex items-center justify-center transition-colors"
      onClick={() => handleButtonClick(keyToSend)}
      aria-label={ariaLabel || label}
    >
      {label}
    </button>
  );

  return (
    <div className="p-2 md:p-3 bg-slate-800 border-t border-slate-700 flex flex-col gap-2 shadow-inner">
      {/* Special Keys */}
      <div className="flex flex-wrap gap-2">
        {renderButton('Ctrl', '\x02', 'CtrlKey')}
        {renderButton('Alt', '\x1b', 'AltKey')}
        {renderButton('Esc', '\x1b', 'EscKey')}
        {renderButton('Tab', '\t', 'TabKey')}
        {renderButton('Enter', '\r', 'EnterKey')}
        {onOpenTextInput ? renderActionButton('IME', onOpenTextInput, 'ImeButton', 'Open IME Input') : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Shortcuts */}
        <div className="flex flex-wrap gap-2 flex-grow">
          {renderButton('^C', '\x03', 'CtrlCKey')}
          {renderButton('^D', '\x04', 'CtrlDKey')}
          {renderButton('^Z', '\x1a', 'CtrlZKey')}
        </div>

        {/* Arrow Keys */}
        <div className="grid grid-cols-3 gap-1 w-32 shrink-0">
          <div className="col-start-2">{renderButton('▲', '\x1b[A', 'ArrowUpKey', 'Arrow Up')}</div>
          {renderButton('◀', '\x1b[D', 'ArrowLeftKey', 'Arrow Left')}
          {renderButton('▼', '\x1b[B', 'ArrowDownKey', 'Arrow Down')}
          {renderButton('▶', '\x1b[C', 'ArrowRightKey', 'Arrow Right')}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
