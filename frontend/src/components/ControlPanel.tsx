import React from 'react';

interface ControlPanelProps {
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onSendKey, onOpenTextInput }) => {
  // ボタンタップ時にぽわーんグローアニメーションを発火
  const triggerGlow = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    btn.classList.remove('btn-glow');
    void btn.offsetWidth; // リフローで再発火
    btn.classList.add('btn-glow');
  };

  const handleButtonClick = (key: string) => {
    onSendKey(key);
  };

  const renderActionButton = (label: string, onClick: () => void, uniqueKey: string, ariaLabel?: string) => (
    <button
      key={uniqueKey}
      className="px-3 py-1 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none text-sm font-mono flex-grow min-h-[36px] flex items-center justify-center transition-colors"
      onClick={(e) => { triggerGlow(e); onClick(); }}
      onAnimationEnd={(e) => e.currentTarget.classList.remove('btn-glow')}
      aria-label={ariaLabel || label}
      type="button"
    >
      {label}
    </button>
  );

  const renderButton = (label: string, keyToSend: string, uniqueKey: string, ariaLabel?: string) => (
    <button
      key={uniqueKey}
      className="px-3 py-1 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 active:bg-slate-500 focus:outline-none text-sm font-mono flex-grow min-h-[36px] flex items-center justify-center transition-colors"
      onClick={(e) => { triggerGlow(e); handleButtonClick(keyToSend); }}
      onAnimationEnd={(e) => e.currentTarget.classList.remove('btn-glow')}
      aria-label={ariaLabel || label}
    >
      {label}
    </button>
  );

  return (
    <div className="p-1.5 bg-slate-800 border-t border-slate-700 flex flex-col gap-1 shadow-inner">
      {/* 操作キー + 矢印キー（TmuxPanel開時と同じ配列） */}
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 flex-grow min-w-0">
          <div className="flex gap-1">
            {renderButton('Esc', '\x1b', 'EscKey')}
            {renderButton('Tab', '\t', 'TabKey')}
            <button
              key="EnterKey"
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md active:bg-blue-400 focus:outline-none text-sm font-mono flex-grow min-h-[36px] flex items-center justify-center transition-colors"
              onClick={(e) => { triggerGlow(e); handleButtonClick('\r'); }}
              onAnimationEnd={(e) => e.currentTarget.classList.remove('btn-glow')}
              aria-label="Enter"
            >
              Enter
            </button>
            {onOpenTextInput ? renderActionButton('IME', onOpenTextInput, 'ImeButton', 'Open IME Input') : null}
          </div>
          <div className="flex gap-1">
            {renderButton('^C', '\x03', 'CtrlCKey')}
            {renderButton('^D', '\x04', 'CtrlDKey')}
            {renderButton('^Z', '\x1a', 'CtrlZKey')}
          </div>
        </div>
        {/* 矢印キー（右角・逆T字） */}
        <div className="grid grid-cols-3 gap-1 shrink-0 w-[138px]">
          <div />
          {renderButton('▲', '\x1b[A', 'ArrowUpKey', 'Arrow Up')}
          <div />
          {renderButton('◀', '\x1b[D', 'ArrowLeftKey', 'Arrow Left')}
          {renderButton('▼', '\x1b[B', 'ArrowDownKey', 'Arrow Down')}
          {renderButton('▶', '\x1b[C', 'ArrowRightKey', 'Arrow Right')}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
