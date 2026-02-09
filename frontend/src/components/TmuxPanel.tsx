import React, { useState, useRef, useEffect } from 'react';

interface TmuxPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}

// tmuxプレフィックスキー（Ctrl+B）+ 操作キーをまとめて送信
// スマホではキーボードを開かずに1タップでtmux操作が完結する
const TMUX_PREFIX = '\x02';

// tmux操作後に「次に押すべきキー」のヒントを表示するマッピング
// Sessions→右矢印（ツリー展開）＋上下矢印（選択移動）
const HINT_MAP: Record<string, string[]> = {
  'sessions': ['arrow-right', 'arrow-up', 'arrow-down'],
};

const TmuxPanel: React.FC<TmuxPanelProps> = ({ isOpen, onToggle, onSendKey, onOpenTextInput }) => {
  const [hintKeys, setHintKeys] = useState<string[]>([]);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ヒント表示（3秒後に自動消去）
  const showHint = (keys: string[]) => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintKeys(keys);
    hintTimerRef.current = setTimeout(() => setHintKeys([]), 3000);
  };

  const clearHint = () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintKeys([]);
  };

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  // ボタンタップ時にぽわーんグローアニメーションを発火
  const triggerGlow = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    btn.classList.remove('btn-glow');
    void btn.offsetWidth; // リフローで再発火
    btn.classList.add('btn-glow');
  };

  const renderButton = (label: string, keys: string, uniqueKey: string, style?: 'warning' | 'accent') => {
    const isHinted = hintKeys.includes(uniqueKey);
    return (
      <button
        key={uniqueKey}
        className={`px-3 py-1 ${
          isHinted ? 'bg-orange-500 text-white font-bold btn-hint' :
          style === 'warning' ? 'border border-red-500 bg-transparent text-red-400 hover:bg-red-500/20' :
          style === 'accent' ? 'bg-blue-600 hover:bg-blue-500 text-white font-bold' :
          'bg-slate-700 hover:bg-slate-600 text-slate-200'
        } rounded-md active:bg-slate-500 focus:outline-none text-sm font-mono flex-grow min-h-[36px] transition-colors`}
        onClick={(e) => {
          triggerGlow(e);
          clearHint();
          onSendKey(keys);
          // このボタンに紐づくヒントがあれば表示
          const hints = HINT_MAP[uniqueKey];
          if (hints) showHint(hints);
        }}
        onAnimationEnd={(e) => e.currentTarget.classList.remove('btn-glow')}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="p-1.5 bg-slate-800 border-t border-slate-700 flex flex-col gap-1 shadow-inner">
      <button
        onClick={onToggle}
        className="w-full px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 active:bg-orange-800 focus:outline-none text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 min-h-[36px]"
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
          {/* tmux操作: セッション維持に必要な最小限のみ */}
          <div className="flex gap-1">
            {renderButton('Sessions (s)', `${TMUX_PREFIX}s`, 'sessions')}
            {renderButton('Detach (d)', `${TMUX_PREFIX}d`, 'detach', 'warning')}
          </div>

          {/* 操作キー + 矢印キー */}
          <div className="flex gap-1 pt-1 border-t border-slate-700">
            <div className="flex flex-col gap-1 flex-grow min-w-0">
              <div className="flex gap-1">
                {renderButton('Esc', '\x1b', 'esc')}
                {renderButton('Tab', '\t', 'tab')}
                {renderButton('Enter', '\r', 'enter', 'accent')}
                {onOpenTextInput ? (
                  <button
                    key="ime"
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md active:bg-slate-500 focus:outline-none text-sm font-mono flex-grow min-h-[36px] transition-colors"
                    onClick={(e) => { triggerGlow(e); onOpenTextInput!(); }}
                    onAnimationEnd={(e) => e.currentTarget.classList.remove('btn-glow')}
                  >
                    IME
                  </button>
                ) : null}
              </div>
              <div className="flex gap-1">
                {renderButton('^C', '\x03', 'ctrl-c')}
                {renderButton('^D', '\x04', 'ctrl-d')}
                {renderButton('^Z', '\x1a', 'ctrl-z')}
              </div>
            </div>
            {/* 矢印キー（右角・逆T字） */}
            <div className="grid grid-cols-3 gap-1 shrink-0 w-[138px]">
              <div />
              {renderButton('▲', '\x1b[A', 'arrow-up')}
              <div />
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
