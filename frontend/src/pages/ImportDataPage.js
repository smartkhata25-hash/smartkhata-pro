import React, { useState } from 'react';
import axios from 'axios';
import { t } from '../i18n/i18n';
const API = process.env.REACT_APP_API_BASE_URL;

const ImportDataPage = () => {
  const [file, setFile] = useState(null);
  const [type, setType] = useState('customers');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

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

      const res = await axios.post(`${API}/api/import/${type}?preview=true`, formData, {
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

      setFile(null);

      const res = await axios.post(
        `${API}/api/import/${type}`,
        { data: previewData },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      const jobId = res.data.jobId;

      const interval = setInterval(async () => {
        const progRes = await axios.get(`${API}/api/import/progress/${jobId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        setProgress(progRes.data.progress);

        if (progRes.data.progress >= 100) {
          clearInterval(interval);
          setStep('done');
        }
      }, 1000);

      setResult(res.data);
    } catch (err) {
      alert(err.response?.data?.message || t('import.importFailed'));
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
  // ✅ HANDLE EDIT FUNCTION
  const handleEdit = (index, field, value) => {
    const updated = [...previewData];
    updated[index][field] = value;
    setPreviewData(updated);
  };

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
            {previewData.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">
                  <input
                    className="border p-1 w-full"
                    value={row.category || ''}
                    onChange={(e) => handleEdit(i, 'category', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border p-1 w-full"
                    value={row.name}
                    onChange={(e) => handleEdit(i, 'name', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border p-1 w-full"
                    value={row.unitCost}
                    onChange={(e) => handleEdit(i, 'unitCost', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border p-1 w-full"
                    value={row.salePrice}
                    onChange={(e) => handleEdit(i, 'salePrice', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="border p-1 w-full"
                    value={row.stock}
                    onChange={(e) => handleEdit(i, 'stock', e.target.value)}
                  />
                </td>
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
          {previewData.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={row.name}
                  onChange={(e) => handleEdit(i, 'name', e.target.value)}
                />
              </td>
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={row.phone}
                  onChange={(e) => handleEdit(i, 'phone', e.target.value)}
                />
              </td>
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={row.openingBalance}
                  onChange={(e) => handleEdit(i, 'openingBalance', e.target.value)}
                />
              </td>
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
      {(step === 'preview' || (loading && !result)) && (
        <div className="space-y-4">
          {loading && (
            <div className="w-full bg-gray-200 rounded">
              <div
                className="bg-green-500 text-white text-center text-xs p-1"
                style={{ width: `${progress}%` }}
              >
                {progress}%
              </div>
            </div>
          )}
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
