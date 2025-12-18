'use client';

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

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

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
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative p-5 border w-96 shadow-lg rounded-md bg-gray-800">
        <h3 className="text-lg leading-6 font-medium text-white mb-4" id="modal-title">
          入力
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mt-2">
            <input
              type="text"
              className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              role="textbox"
            />
          </div>
          <div className="items-center px-4 py-3">
            <button
              type="submit"
              className="px-4 py-2 bg-orange-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Submit
            </button>
            <button
              type="button"
              className="mt-3 px-4 py-2 bg-gray-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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
