import React from 'react';

const AttachmentViewerModal = ({ attachment, onClose }) => {
  if (!attachment) return null;

  const url = attachment.url || attachment.fullUrl || '';
  const type = attachment.type || '';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 border-b">
          <div className="text-sm font-semibold text-gray-700">📎 Attachment Preview</div>

          <button
            type="button"
            onClick={onClose}
            className="bg-red-500 text-white px-3 py-1 rounded text-sm"
          >
            ✖ Close
          </button>
        </div>

        <div className="p-3 flex items-center justify-center bg-gray-100 max-h-[80vh] overflow-auto">
          {type.includes('pdf') ? (
            <iframe
              src={url}
              title="Attachment PDF"
              className="w-full h-[75vh] bg-white border rounded"
            />
          ) : (
            <img
              src={url}
              alt="Attachment"
              className="max-w-full max-h-[75vh] object-contain rounded border bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AttachmentViewerModal;
