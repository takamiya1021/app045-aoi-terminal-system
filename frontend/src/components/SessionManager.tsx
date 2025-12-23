'use client';

import React, { useState } from 'react';
import { TmuxWindow } from '@/lib/types'; // Import TmuxWindow type

interface SessionManagerProps {
  windows: TmuxWindow[];
  onSelectWindow: (windowId: string) => void;
  onRenameWindow?: (windowId: string, newName: string) => void;
  currentWindowId: string | null;
}

const SessionManager: React.FC<SessionManagerProps> = ({
  windows,
  onSelectWindow,
  onRenameWindow,
  currentWindowId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = (e: React.MouseEvent, window: TmuxWindow) => {
    e.stopPropagation();
    setEditingId(window.id);
    setEditValue(window.name);
  };

  const handleSaveEdit = (e: React.FormEvent, windowId: string) => {
    e.preventDefault();
    if (editValue.trim() && onRenameWindow) {
      onRenameWindow(windowId, editValue.trim());
    }
    setEditingId(null);
  };

  const renderWindowButton = (window: TmuxWindow) => {
    const isActive = window.id === currentWindowId;
    const isEditing = editingId === window.id;

    if (isEditing) {
      return (
        <form
          key={window.id}
          onSubmit={(e) => handleSaveEdit(e, window.id)}
          className="flex gap-2 w-full p-1"
        >
          <input
            autoFocus
            className="flex-grow bg-gray-950 border border-orange-500 text-white rounded px-2 py-1 text-sm font-mono outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => setEditingId(null)}
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs font-bold"
          >
            Save
          </button>
        </form>
      );
    }

    return (
      <button
        key={window.id}
        className={`px-3 py-2 rounded-md text-sm font-mono flex items-center justify-between group w-full
          ${isActive ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-700 text-gray-200 hover:bg-gray-600 active:bg-gray-500'}
          focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900
        `}
        onClick={() => !isActive && onSelectWindow(window.id)}
        disabled={isActive && !onRenameWindow}
      >
        <span className="flex items-center gap-2">
          <span className="truncate max-w-[150px]">{window.name}</span>
          <span className="text-[10px] opacity-70">({window.panes})</span>
        </span>
        <div className="flex items-center gap-2">
          {isActive && <span className="text-[10px] bg-white/20 px-1 rounded">active</span>}
          {onRenameWindow && (
            <span
              onClick={(e) => handleStartEdit(e, window)}
              className="p-1 hover:bg-white/20 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Rename Window"
            >
              ✎
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="p-2 bg-gray-800 border-t border-gray-700 flex flex-col gap-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between bg-slate-700 text-gray-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors text-xs font-bold"
      >
        <span>TMUX WINDOWS</span>
        <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1 mt-1 max-h-[200px] overflow-y-auto custom-scrollbar">
          {windows.length === 0 ? (
            <p className="text-gray-500 text-[10px] text-center py-2">No tmux windows found.</p>
          ) : (
            windows.map(renderWindowButton)
          )}
        </div>
      )}
    </div>
  );
};

export default SessionManager;