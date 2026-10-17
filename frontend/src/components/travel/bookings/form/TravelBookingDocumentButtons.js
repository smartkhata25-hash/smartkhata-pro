import React from 'react';
import { FaFilePdf, FaPrint } from 'react-icons/fa';

const baseClass =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:gap-2 sm:px-3 sm:py-2';

const TravelBookingDocumentButtons = ({ disabled = false, onPrint, onPdf }) => (
  <>
    <button
      type="button"
      title="Print Invoice"
      aria-label="Print Invoice"
      disabled={disabled}
      onClick={onPrint}
      className={`${baseClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 focus-visible:outline-cyan-500`}
    >
      <FaPrint aria-hidden="true" />
      <span>Print Invoice</span>
    </button>

    <button
      type="button"
      title="Download PDF"
      aria-label="Download Invoice PDF"
      disabled={disabled}
      onClick={onPdf}
      className={`${baseClass} border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 focus-visible:outline-violet-500`}
    >
      <FaFilePdf aria-hidden="true" />
      <span>Download PDF</span>
    </button>
  </>
);

export default TravelBookingDocumentButtons;
