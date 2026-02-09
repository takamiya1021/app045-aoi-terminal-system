import React from 'react';

interface TmuxPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}

// tmuxプレフィックスキー（Ctrl+B）+ 操作キーをまとめて送信
// スマホではキーボードを開かずに1タップでtmux操作が完結する
const TMUX_PREFIX = '\x02';

const TmuxPanel: React.FC<TmuxPanelProps> = ({ isOpen, onToggle, onSendKey, onOpenTextInput }) => {
  const renderButton = (label: string, keys: string, uniqueKey: string, isWarning?: boolean) => (
    <button
      key={uniqueKey}
      className={`px-3 py-1 ${isWarning ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600'} text-slate-200 rounded-md active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[36px] transition-colors`}
      onClick={() => onSendKey(keys)}
    >
      {label}
    </button>
  );

  return (
    <div className="p-1.5 bg-slate-800 border-t border-slate-700 flex flex-col gap-1 shadow-inner">
      <button
        onClick={onToggle}
        className="w-full px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 active:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 min-h-[36px]"
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
        <div data-testid="tmux-panel-content" className="grid mt-1 gap-1">
          {/* tmux操作ボタン */}
          <div className="flex flex-wrap gap-1">
            {renderButton('New Window (c)', `${TMUX_PREFIX}c`, 'new-window')}
            {renderButton('Next Window (n)', `${TMUX_PREFIX}n`, 'next-window')}
            {renderButton('Prev Window (p)', `${TMUX_PREFIX}p`, 'prev-window')}
            {renderButton('Sessions (s)', `${TMUX_PREFIX}s`, 'sessions')}
            {renderButton('Detach (d)', `${TMUX_PREFIX}d`, 'detach', true)}
          </div>
          <div className="flex flex-wrap gap-1">
            {renderButton('Split V (%)', `${TMUX_PREFIX}%`, 'split-v')}
            {renderButton('Split H (")', `${TMUX_PREFIX}"`, 'split-h')}
            {renderButton('Swap Pane (o)', `${TMUX_PREFIX}o`, 'swap-pane')}
            {renderButton('Zoom (z)', `${TMUX_PREFIX}z`, 'zoom')}
            {renderButton('Scroll ([)', `${TMUX_PREFIX}[`, 'scroll-mode')}
          </div>

          {/* 必須キー（ControlPanelと同じ配列） */}
          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-700">
            {renderButton('Esc', '\x1b', 'esc')}
            {renderButton('Tab', '\t', 'tab')}
            {renderButton('Enter', '\r', 'enter')}
            {onOpenTextInput ? (
              <button
                key="ime"
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[36px] transition-colors"
                onClick={onOpenTextInput}
              >
                IME
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 flex-grow">
              {renderButton('^C', '\x03', 'ctrl-c')}
              {renderButton('^D', '\x04', 'ctrl-d')}
              {renderButton('^Z', '\x1a', 'ctrl-z')}
            </div>
            <div className="grid grid-cols-3 gap-1 w-32 shrink-0">
              <div className="col-start-2">{renderButton('▲', '\x1b[A', 'arrow-up')}</div>
              {renderButton('◀', '\x1b[D', 'arrow-left')}
              {renderButton('▼', '\x1b[B', 'arrow-down')}
              {renderButton('▶', '\x1b[C', 'arrow-right')}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TmuxPanel;
