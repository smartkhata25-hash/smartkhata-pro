import React, { useEffect, useState, useCallback } from 'react';
import { getPrintSettings, updatePrintSettings } from '../services/printSettingService';
import { resetPrintSettings } from '../services/printSettingService';
import { t } from '../i18n/i18n';

const DOCUMENT_TYPES = [
  { label: 'Sales Invoice', value: 'sales' },
  { label: 'Sale Return', value: 'saleReturn' },
  { label: 'Purchase Invoice', value: 'purchase' },
  { label: 'Purchase Return', value: 'purchaseReturn' },
];

const PrintSettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('sales');
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await getPrintSettings();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = useCallback(async () => {
    try {
      if (!settings) return;

      const token = localStorage.getItem('token');

      const res = await fetch('/api/print/preview-settings-html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: selectedType,
          settings: {
            header: settings[selectedType].header,
            settings: settings[selectedType].settings,
            layout: settings[selectedType].layout,
          },
        }),
      });

      const html = await res.text();
      setPreviewHtml(html);
    } catch (err) {
      console.error(t('alerts.previewGenerateError'), err);
    }
  }, [settings, selectedType]);

  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  const currentDoc = settings?.[selectedType];

  /* ================= HEADER CHANGE ================= */
  const handleHeaderChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [selectedType]: {
        ...prev[selectedType],
        header: {
          ...prev[selectedType].header,
          [field]: value,
        },
      },
    }));
  };

  /* ================= CHECKBOX ================= */
  const handleCheckbox = (field) => {
    setSettings((prev) => ({
      ...prev,
      [selectedType]: {
        ...prev[selectedType],
        settings: {
          ...prev[selectedType].settings,
          [field]: !prev[selectedType].settings[field],
        },
      },
    }));
  };

  /* ================= LAYOUT CHANGE ================= */
  const handleLayoutChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [selectedType]: {
        ...prev[selectedType],
        layout: {
          ...prev[selectedType].layout,
          [field]: value,
        },
      },
    }));
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    try {
      await updatePrintSettings(selectedType, {
        header: settings[selectedType].header,
        settings: settings[selectedType].settings,
        layout: settings[selectedType].layout,
      });

      alert(t('alerts.printSettingsUpdated'));
    } catch (err) {
      alert(t('alerts.printSettingsUpdateFailed'));
    }
  };

  /* ================= RESET ================= */
  const handleReset = async () => {
    const confirmReset = window.confirm(t('alerts.printResetConfirm'));

    if (!confirmReset) return;

    try {
      const resetData = await resetPrintSettings(selectedType);

      setSettings((prev) => ({
        ...prev,
        [selectedType]: resetData,
      }));

      alert(t('alerts.printResetSuccess'));
    } catch (err) {
      alert(t('alerts.printResetFailed'));
    }
  };

  if (loading || !settings) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="flex gap-6 p-6">
      {/* ================= LEFT PANEL ================= */}
      <div className="w-1/2 space-y-6">
        <h2 className="text-xl font-semibold">{t('print.salesSettings')}</h2>

        {/* Document Selector */}
        <div className="card space-y-3">
          <label className="font-semibold">{t('print.selectDocument')}</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input w-full"
          >
            {DOCUMENT_TYPES.map((doc) => (
              <option key={doc.value} value={doc.value}>
                {doc.label}
              </option>
            ))}
          </select>
        </div>

        {/* Header Settings */}
        <div className="card space-y-3">
          <h3 className="font-semibold">{t('print.header')}</h3>

          <input
            className="input w-full"
            placeholder={t('print.companyName')}
            value={currentDoc.header.companyName}
            onChange={(e) => handleHeaderChange('companyName', e.target.value)}
          />

          <input
            className="input w-full"
            placeholder={t('print.companyAddress')}
            value={currentDoc.header.address}
            onChange={(e) => handleHeaderChange('address', e.target.value)}
          />

          <input
            className="input w-full"
            placeholder={t('print.companyPhone')}
            value={currentDoc.header.phone}
            onChange={(e) => handleHeaderChange('phone', e.target.value)}
          />

          <textarea
            className="input w-full"
            placeholder={t('print.footerMessage')}
            value={currentDoc.header.footerMessage}
            onChange={(e) => handleHeaderChange('footerMessage', e.target.value)}
          />
        </div>

        {/* Visibility */}
        <div className="card space-y-2">
          <h3 className="font-semibold">{t('print.columnVisibility')}</h3>

          {Object.keys(currentDoc.settings).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={currentDoc.settings[key]}
                onChange={() => handleCheckbox(key)}
              />
              {key}
            </label>
          ))}
        </div>

        {/* Layout */}
        <div className="card space-y-3">
          <h3 className="font-semibold">{t('print.layout')}</h3>

          <select
            value={currentDoc.layout.headerSize}
            onChange={(e) => handleLayoutChange('headerSize', e.target.value)}
            className="input w-full"
          >
            <option value="compact">{t('print.headerCompact')}</option>
            <option value="normal">{t('print.headerNormal')}</option>
            <option value="spacious">{t('print.headerSpacious')}</option>
          </select>

          <select
            value={currentDoc.layout.tableDensity}
            onChange={(e) => handleLayoutChange('tableDensity', e.target.value)}
            className="input w-full"
          >
            <option value="tight">{t('print.tableTight')}</option>
            <option value="standard">{t('print.tableStandard')}</option>
            <option value="relaxed">{t('print.tableRelaxed')}</option>
          </select>

          <select
            value={currentDoc.layout.rowHeight}
            onChange={(e) => handleLayoutChange('rowHeight', e.target.value)}
            className="input w-full"
          >
            <option value="small">{t('print.rowSmall')}</option>
            <option value="medium">{t('print.rowMedium')}</option>
            <option value="large">{t('print.rowLarge')}</option>
          </select>

          <select
            value={currentDoc.layout.footerSize}
            onChange={(e) => handleLayoutChange('footerSize', e.target.value)}
            className="input w-full"
          >
            <option value="compact">{t('print.footerCompact')}</option>
            <option value="normal">{t('print.footerNormal')}</option>
            <option value="spacious">{t('print.footerSpacious')}</option>
          </select>

          <select
            value={currentDoc.layout.pageWidth}
            onChange={(e) => handleLayoutChange('pageWidth', e.target.value)}
            className="input w-full"
          >
            <option value="narrow">{t('print.pageNarrow')}</option>
            <option value="standard">{t('print.pageStandard')}</option>
            <option value="wide">{t('print.pageWide')}</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>
          {t('print.saveSettings')}
        </button>
        <button className="btn bg-red-500 text-white" onClick={handleReset}>
          {t('reset')}
        </button>
      </div>

      {/* ================= RIGHT PANEL (LIVE PREVIEW) ================= */}
      <div className="w-1/2 bg-gray-100 p-4 overflow-auto">
        <div className="bg-white" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
};

export default PrintSettingsPage;
