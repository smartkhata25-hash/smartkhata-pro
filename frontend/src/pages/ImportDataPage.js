import React, { useState } from 'react';
import axios from 'axios';
import { t } from '../i18n/i18n';

const ImportDataPage = () => {
  const [file, setFile] = useState(null);
  const [type, setType] = useState('customers');
  const [loading, setLoading] = useState(false);

  const [previewData, setPreviewData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState('upload');

  /* ================= PREVIEW ================= */

  const handlePreview = async () => {
    if (!file) {
      alert(t('import.selectFile'));
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`/api/import/${type}?preview=true`, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      setPreviewData(res.data.valid || []);
      setErrors(res.data.errors || []);
      setStep('preview');
    } catch (err) {
      alert(err.response?.data?.message || t('import.previewFailed'));
    } finally {
      setLoading(false);
    }
  };

  /* ================= IMPORT ================= */

  const handleImport = async () => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`/api/import/${type}`, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      setResult(res.data);
      setStep('done');
    } catch (err) {
      alert(err.response?.data?.message || t('import.importFailed'));
    } finally {
      setLoading(false);
    }
  };

  /* ================= TEMPLATE ================= */

  const downloadTemplate = () => {
    let content = '';

    if (type === 'customers' || type === 'suppliers') {
      content = 'Name,Phone,YoullGet,YoullGive\nAli,0300,50000,20000';
    } else {
      content = 'Name,Cost,SalePrice,Stock\nProduct A,100,150,20';
    }

    const blob = new Blob([content], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${type}-template.csv`);
    document.body.appendChild(link);
    link.click();
  };

  /* ================= RESET ================= */

  const reset = () => {
    setFile(null);
    setPreviewData([]);
    setErrors([]);
    setResult(null);
    setStep('upload');
  };

  /* ================= RENDER TABLE ================= */

  const renderTable = () => {
    if (type === 'products') {
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">{t('inventory.category')}</th>
              <th className="p-2">{t('common.name')}</th>
              <th className="p-2">{t('inventory.cost')}</th>
              <th className="p-2">{t('inventory.salePrice')}</th>
              <th className="p-2">{t('inventory.stock')}</th>
            </tr>
          </thead>
          <tbody>
            {previewData.slice(0, 20).map((row, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{row.category || '-'}</td>
                <td className="p-2">{row.name}</td>
                <td className="p-2">{row.unitCost}</td>
                <td className="p-2">{row.salePrice}</td>
                <td className="p-2">{row.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2">{t('common.name')}</th>
            <th className="p-2">{t('phone')}</th>
            <th className="p-2">{t('openingBalance')}</th>
          </tr>
        </thead>
        <tbody>
          {previewData.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{row.name}</td>
              <td className="p-2">{row.phone}</td>
              <td className="p-2">{row.openingBalance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="page p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">📥 {t('import.title')}</h2>

      {/* UPLOAD */}
      {step === 'upload' && (
        <div className="card space-y-4">
          <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="customers">{t('customers')}</option>
            <option value="suppliers">{t('suppliers')}</option>
            <option value="products">{t('menu.products')}</option>
          </select>

          <button className="btn btn-secondary" onClick={downloadTemplate}>
            ⬇ {t('import.downloadTemplate')}
          </button>

          <input
            type="file"
            className="input w-full"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button className="btn btn-primary w-full" onClick={handlePreview} disabled={loading}>
            {loading ? t('import.processing') : t('import.preview')}
          </button>
        </div>
      )}

      {/* PREVIEW */}
      {step === 'preview' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            🔍 {t('import.preview')} ({previewData.length} {t('import.rows')})
          </h3>

          <div className="overflow-auto border rounded">{renderTable()}</div>

          {errors.length > 0 && (
            <div className="bg-red-100 p-3 rounded">
              <h4 className="font-bold text-red-700">
                ⚠ {t('import.errors')} ({errors.length})
              </h4>
              {errors.slice(0, 10).map((e, i) => (
                <div key={i} className="text-sm text-red-600">
                  Row {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn" onClick={reset}>
              {t('cancel')}
            </button>

            <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? t('import.importing') : t('import.confirm')}
            </button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {step === 'done' && result && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">✅ {t('import.result')}</h3>

          <p>
            {t('import.success')}: {result.success}
          </p>
          <p>
            {t('import.failed')}: {result.failed}
          </p>

          {result.errors?.length > 0 && (
            <div className="text-red-500">
              {result.errors.slice(0, 10).map((e, i) => (
                <div key={i}>
                  Row {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" onClick={reset}>
            {t('import.again')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ImportDataPage;
