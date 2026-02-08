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
      className={`px-3 py-2 ${isWarning ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600'} text-slate-200 rounded-md active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[44px] transition-colors`}
      onClick={() => onSendKey(keys)}
    >
      {label}
    </button>
  );

  return (
    <div className="p-2 md:p-3 bg-slate-800 border-t border-slate-700 flex flex-col gap-2 shadow-inner">
      <button
        onClick={onToggle}
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
        <div data-testid="tmux-panel-content" className="grid mt-2 gap-2">
          {/* tmux操作ボタン */}
          <div className="flex flex-wrap gap-2">
            {renderButton('New Window (c)', `${TMUX_PREFIX}c`, 'new-window')}
            {renderButton('Next Window (n)', `${TMUX_PREFIX}n`, 'next-window')}
            {renderButton('Prev Window (p)', `${TMUX_PREFIX}p`, 'prev-window')}
            {renderButton('Sessions (s)', `${TMUX_PREFIX}s`, 'sessions')}
            {renderButton('Detach (d)', `${TMUX_PREFIX}d`, 'detach', true)}
          </div>
          <div className="flex flex-wrap gap-2">
            {renderButton('Split V (%)', `${TMUX_PREFIX}%`, 'split-v')}
            {renderButton('Split H (")', `${TMUX_PREFIX}"`, 'split-h')}
            {renderButton('Swap Pane (o)', `${TMUX_PREFIX}o`, 'swap-pane')}
            {renderButton('Zoom (z)', `${TMUX_PREFIX}z`, 'zoom')}
            {renderButton('Scroll ([)', `${TMUX_PREFIX}[`, 'scroll-mode')}
          </div>

          {/* 必須キー（TmuxPanel開時もターミナル操作に必要） */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
            <div className="grid grid-cols-3 gap-1 w-32 shrink-0">
              <div className="col-start-2">{renderButton('▲', '\x1b[A', 'arrow-up')}</div>
              {renderButton('◀', '\x1b[D', 'arrow-left')}
              {renderButton('▼', '\x1b[B', 'arrow-down')}
              {renderButton('▶', '\x1b[C', 'arrow-right')}
            </div>
            <div className="flex flex-wrap gap-2 flex-grow">
              {onOpenTextInput ? (
                <button
                  key="ime"
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md active:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm font-mono flex-grow min-h-[44px] transition-colors"
                  onClick={onOpenTextInput}
                >
                  IME
                </button>
              ) : null}
              {renderButton('Tab', '\t', 'tab')}
              {renderButton('^C', '\x03', 'ctrl-c')}
              {renderButton('Enter', '\r', 'enter')}
              {renderButton('Esc', '\x1b', 'esc')}
              {renderButton('q (終了)', 'q', 'quit')}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TmuxPanel;
