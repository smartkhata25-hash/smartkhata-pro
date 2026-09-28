import React, { useRef } from 'react';
import { FaDownload, FaPrint } from 'react-icons/fa';
import { hasPermission } from '../../utils/permissionHelper';
import { getCurrentLanguage } from '../../i18n/i18n';
import { parchiOutputUrl, salesInvoiceOutputUrl } from '../../services/weavingSalesService';

export const savedSaleOutputUrl = (record, format) => {
  const pakki = record.sourcePakkiId || record.pakkiId;
  return pakki
    ? parchiOutputUrl('pakki', pakki._id || pakki, format)
    : salesInvoiceOutputUrl(record._id, format);
};

export const useSaleSaveOutput = (save, outputUrl, saving) => {
  const pending = useRef(false);
  return async (mode) => {
    if (saving || pending.current) return;
    const output = mode === 'print' || mode === 'pdf';
    if (output && !hasPermission('weaving.sales.print')) return;
    pending.current = true;
    let tab;
    try {
      if (output) {
        tab = window.open('about:blank', '_blank');
        if (!tab) {
          window.alert('Allow popups for this site, then try Save & Print/PDF again. Nothing was saved.');
          return;
        }
        tab.opener = null;
      }
      const record = await save();
      if (record?._id && tab && !tab.closed) {
        tab.location.replace(outputUrl(record, mode));
        tab = null;
      }
      return record;
    } finally {
      if (tab && !tab.closed) tab.close();
      pending.current = false;
    }
  };
};

export default function WeavingSaleSaveOutput({ onSave, disabled }) {
  if (!hasPermission('weaving.sales.print')) return null;
  const urdu = getCurrentLanguage() === 'ur';
  return <>{[['pdf', FaDownload, urdu ? 'محفوظ کریں اور PDF' : 'Save & PDF'], ['print', FaPrint, urdu ? 'محفوظ کریں اور پرنٹ' : 'Save & Print']].map(([mode, Icon, label]) =>
    <button key={mode} type="button" disabled={disabled} onClick={() => onSave(mode)} className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Icon />{label}</button>
  )}</>;
}
