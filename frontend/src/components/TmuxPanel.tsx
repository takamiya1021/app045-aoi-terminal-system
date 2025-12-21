'use client';

import React, { useState } from 'react';

interface TmuxPanelProps {
  onSendCommand: (command: string, args?: string[]) => void;
}

const TmuxPanel: React.FC<TmuxPanelProps> = ({ onSendCommand }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleCommandClick = (command: string, args?: string[]) => {
    onSendCommand(command, args);
  };

  const renderButton = (label: string, command: string, args?: string[], uniqueKey?: string) => (
    <button
      key={uniqueKey || command}
      className="px-3 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[44px] transition-colors"
      onClick={() => handleCommandClick(command, args)}
    >
      {label}
    </button>
  );

  return (
    <div className="p-2 md:p-3 bg-slate-800 border-t border-slate-700 flex flex-col gap-2 shadow-inner">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 active:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2"
      >
        <span>{isOpen ? 'Close tmux Panel' : 'Open tmux Panel'}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen ? (
        <div data-testid="tmux-panel-content" className="grid mt-2">
          <div className="flex flex-wrap gap-2 pb-1">
            {/* Window Management */}
            {renderButton('New Window (c)', 'new-window')}
            {renderButton('Next Window (n)', 'next-window')}
            {renderButton('Previous Window (p)', 'previous-window')}
            {renderButton('Detach (d)', 'detach')}

            {/* Pane Management */}
            {renderButton('Split Vertical (%)', 'split-window -v')}
            {renderButton('Split Horizontal (")', 'split-window -h')}
            {renderButton('Swap Pane (o)', 'select-pane -t:.+')}
            {renderButton('Toggle Zoom (z)', 'resize-pane -Z')}

            {/* Misc */}
            {renderButton('Scroll Mode ([)', 'copy-mode')}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TmuxPanel;
