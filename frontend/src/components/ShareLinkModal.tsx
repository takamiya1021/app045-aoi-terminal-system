'use client';

import React from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  qrDataUrl: string | null;
  expiresAt: number | null;
  error: string | null;
  busy: boolean;
  onGenerate: () => void;
};

export default function ShareLinkModal({ isOpen, onClose, url, qrDataUrl, expiresAt, error, busy, onGenerate }: Props) {
  if (!isOpen) return null;

  const expiresText =
    expiresAt && Number.isFinite(expiresAt) ? new Date(expiresAt).toLocaleString() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-bold">共有リンク（QR）</div>
          <button
            className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-900"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="text-xs text-slate-300">
            ここで発行するトークンは <span className="font-bold">1回だけ</span> 使えて、期限切れもあるで。
            使われた後は URL に残ってても無効になる。
          </div>

          <button
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold rounded-md"
            onClick={onGenerate}
            disabled={busy}
          >
            {busy ? 'Generating…' : '新しいリンクを発行'}
          </button>

          {error ? <div className="text-xs text-red-300">{error}</div> : null}

          {qrDataUrl ? (
            <div className="flex justify-center">
              <img src={qrDataUrl} alt="QR code" className="rounded bg-white p-2" />
            </div>
          ) : null}

          {url ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">URL</div>
              <div className="break-all rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                {url}
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800"
                  onClick={() => navigator.clipboard.writeText(url)}
                >
                  Copy
                </button>
                <button className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : null}

          {expiresText ? <div className="text-xs text-slate-500">Expires: {expiresText}</div> : null}
        </div>
      </div>
    </div>
  );
}

