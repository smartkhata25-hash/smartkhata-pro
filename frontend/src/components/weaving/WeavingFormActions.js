import React from 'react';
import { FaBroom, FaCheck, FaPlus, FaTimes } from 'react-icons/fa';
import { t } from '../../i18n/i18n';

const Button = ({ children, icon: Icon, className = '', ...props }) => (
  <button type="button" className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`} {...props}>
    <Icon aria-hidden="true" />{children}
  </button>
);

const WeavingFormActions = ({ editing, saving, onSaveClose, onSaveNew, onClear, onCancel }) => {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
    <Button icon={FaBroom} onClick={onClear} disabled={saving} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">{t('weaving.operations.clear')}</Button>
    <Button icon={FaTimes} onClick={onCancel} disabled={saving} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">{t('weaving.operations.cancel')}</Button>
    <Button icon={FaPlus} onClick={onSaveNew} disabled={saving} className="bg-slate-700 text-white hover:bg-slate-800">{editing ? t('weaving.operations.updateNew') : t('weaving.operations.saveNew')}</Button>
    <Button icon={FaCheck} onClick={onSaveClose} disabled={saving} className="bg-teal-600 text-white hover:bg-teal-700">{editing ? t('weaving.operations.updateClose') : t('weaving.operations.saveClose')}</Button>
  </div>;
};
export default WeavingFormActions;
