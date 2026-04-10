import React from 'react';
import { t } from '../i18n/i18n';

const PrintPreviewModal = ({ children, onClose, onPrint }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
      <div className="bg-white p-4 relative print:max-h-none print:overflow-visible">
        <button onClick={onClose} className="absolute top-2 right-2 btn btn-danger">
          {t('close')}
        </button>

        <div className="mb-4 flex gap-2 no-print">
          <button onClick={onPrint} className="btn btn-primary">
            {t('printSavePDF')}
          </button>
        </div>

        {children}
      </div>
    </div>
  );
};

export default PrintPreviewModal;
