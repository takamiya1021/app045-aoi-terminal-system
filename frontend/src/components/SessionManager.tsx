'use client';

import React, { useState } from 'react';
import { TmuxWindow } from '@/lib/types'; // Import TmuxWindow type

interface SessionManagerProps {
  windows: TmuxWindow[];
  onSelectWindow: (windowId: string) => void;
  currentWindowId: string | null;
}

const SessionManager: React.FC<SessionManagerProps> = ({
  windows,
  onSelectWindow,
  currentWindowId,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const renderWindowButton = (window: TmuxWindow) => {
    const isActive = window.id === currentWindowId;
    return (
      <button
        key={window.id}
        className={`px-3 py-2 rounded-md text-sm font-mono flex items-center justify-between w-full
          ${isActive ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-700 text-gray-200 hover:bg-gray-600 active:bg-gray-500'}
          focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900
        `}
        onClick={() => !isActive && onSelectWindow(window.id)}
        disabled={isActive}
      >
        <span>
          {window.name} ({window.panes} panes)
        </span>
        {isActive && <span className="text-xs ml-2">[active]</span>}
      </button>
    );
  };

  return (
    <div className="p-2 bg-gray-800 border-t border-gray-700 flex flex-col gap-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 active:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-sm font-bold"
      >
        {isOpen ? 'Close Session Manager' : 'Open Session Manager'}
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 mt-2">
          {windows.length === 0 ? (
            <p className="text-gray-400 text-sm text-center">No tmux sessions found.</p>
          ) : (
            windows.map(renderWindowButton)
          )}
        </div>
      )}
    </div>
  );
};

export default SessionManager;