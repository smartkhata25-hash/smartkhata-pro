import React from 'react';

const BackupModal = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-4">{message}</p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1 bg-gray-200 rounded">
            Cancel
          </button>

          <button onClick={onConfirm} className="px-3 py-1 bg-blue-600 text-white rounded">
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupModal;
