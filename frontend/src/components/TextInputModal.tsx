import React, { useState, useEffect } from 'react';

interface TextInputModalProps {
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

const TextInputModal: React.FC<TextInputModalProps> = ({
  isOpen,
  initialValue,
  onClose,
  onSubmit,
}) => {
  const [value, setValue] = useState(initialValue);
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === 'undefined') return;

    const updateViewport = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setViewportTop(0);
        setViewportHeight(null);
        return;
      }
      setViewportTop(Math.max(0, Math.round(vv.offsetTop)));
      setViewportHeight(Math.max(0, Math.round(vv.height)));
    };

    updateViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 bg-gray-600 bg-opacity-50 z-50 flex justify-center items-center"
      style={viewportHeight ? { top: viewportTop, height: viewportHeight } : undefined}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative p-5 border w-[92vw] max-w-md shadow-lg rounded-md bg-gray-800">
        <h3 className="text-lg leading-6 font-medium text-white mb-4" id="modal-title">
          入力
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mt-2">
            <textarea
              rows={4}
              className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-orange-500 focus:border-orange-500 text-sm resize-none"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              role="textbox"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm font-bold rounded-md shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              Submit
            </button>
            <button
              type="button"
              className="flex-1 px-3 py-2 bg-gray-600 text-white text-sm font-bold rounded-md shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TextInputModal;
