import React, { useState, useEffect } from 'react';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const SupplierForm = ({ onSubmit, initialData = {}, onCancel }) => {
  const isEditMode = Boolean(initialData?._id);

  const canCreateSuppliers = hasPermission('suppliers.create');
  const canEditSuppliers = hasPermission('suppliers.edit');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    supplierType: 'vendor',
    openingBalance: '',
    openingType: 'payable',
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      const opening = Number(initialData.openingBalance) || 0;

      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: initialData.address || '',
        supplierType: initialData.supplierType || 'vendor',
        openingBalance: Math.abs(opening),
        openingType: opening < 0 ? 'advance' : 'payable',
        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  useEffect(() => {
    const handleQuickFill = (e) => {
      if (!e.detail) return;

      setFormData((prev) => ({
        ...prev,
        ...e.detail,
      }));
    };

    window.addEventListener('quick-supplier-fill', handleQuickFill);

    return () => {
      window.removeEventListener('quick-supplier-fill', handleQuickFill);
    };
  }, []);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', esc);

    return () => {
      window.removeEventListener('keydown', esc);
    };
  }, [onCancel]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (isEditMode && !canEditSuppliers) {
      alert('You do not have permission to edit suppliers');
      return;
    }

    if (!isEditMode && !canCreateSuppliers) {
      alert('You do not have permission to create suppliers');
      return;
    }

    if (!formData.name.trim()) {
      alert(t('supplier.nameRequired'));
      return;
    }

    const finalOpening =
      formData.openingType === 'advance'
        ? -Math.abs(Number(formData.openingBalance) || 0)
        : Math.abs(Number(formData.openingBalance) || 0);

    onSubmit({
      ...formData,
      moduleScope: 'trading',
      openingBalance: finalOpening,
    });
  };

  const handleClear = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      supplierType: 'vendor',
      openingBalance: '',
      openingType: 'payable',
      notes: '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-1.5 py-2 sm:p-4 overflow-hidden">
      <style>{`
        .supplier-form-modal,
        .supplier-form-modal *,
        .supplier-form-modal *::before,
        .supplier-form-modal *::after {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .supplier-form-modal {
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            max-height: calc(100dvh - 16px) !important;
            margin: 0 auto !important;
            padding: 14px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .supplier-form-inner {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .supplier-form-control {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 42px !important;
            min-height: 42px !important;
            padding: 7px 10px !important;
            font-size: 14px !important;
            line-height: 20px !important;
            color: #0f172a !important;
            background: #fff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 6px !important;
          }

          select.supplier-form-control {
            appearance: auto !important;
            -webkit-appearance: menulist !important;
            height: 42px !important;
            min-height: 42px !important;
            padding-top: 5px !important;
            padding-bottom: 5px !important;
          }

          textarea.supplier-form-control {
            height: auto !important;
            min-height: 72px !important;
            resize: vertical;
          }

          .supplier-opening-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr) !important;
            gap: 8px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .supplier-form-actions {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: 100% !important;
          }

          .supplier-form-actions button {
            min-height: 42px !important;
            padding: 8px 13px !important;
            font-size: 14px !important;
          }
        }

        @media (max-width: 380px) {
          .supplier-form-modal {
            width: calc(100vw - 8px) !important;
            max-width: calc(100vw - 8px) !important;
            padding: 12px !important;
          }

          .supplier-opening-row {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          }

          .supplier-form-control {
            font-size: 13px !important;
          }

          .supplier-form-actions button {
            padding-left: 11px !important;
            padding-right: 11px !important;
          }
        }
      `}</style>

      <div className="supplier-form-modal bg-white rounded-lg shadow-lg w-full max-w-md overflow-y-auto relative">
        <form onSubmit={handleSubmit} className="supplier-form-inner" style={formStyle}>
          <input
            type="text"
            name="name"
            className="supplier-form-control"
            placeholder={t('supplier.name')}
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
          />

          <select
            name="supplierType"
            className="supplier-form-control"
            value={formData.supplierType}
            onChange={handleChange}
            style={input}
          >
            <option value="vendor">{t('supplier.vendor')}</option>
            <option value="blocked">{t('supplier.blocked')}</option>
            <option value="other">{t('supplier.other')}</option>
          </select>

          {!isEditMode && (
            <div className="supplier-opening-row">
              <select
                name="openingType"
                className="supplier-form-control"
                value={formData.openingType}
                onChange={handleChange}
                style={input}
              >
                <option value="payable">Payable</option>
                <option value="advance">Advance</option>
              </select>

              <input
                type="text"
                inputMode="decimal"
                name="openingBalance"
                className="supplier-form-control no-spinner"
                placeholder={t('supplier.openingBalance')}
                value={formData.openingBalance}
                onChange={handleChange}
                style={input}
              />
            </div>
          )}

          <input
            type="email"
            name="email"
            className="supplier-form-control"
            placeholder={t('email')}
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="phone"
            className="supplier-form-control"
            placeholder={t('phone')}
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            className="supplier-form-control"
            placeholder={t('address')}
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <textarea
            name="notes"
            className="supplier-form-control"
            value={formData.notes}
            onChange={handleChange}
            placeholder={t('description')}
            style={input}
          />

          <div className="supplier-form-actions mt-4">
            <button type="button" onClick={handleClear} style={buttonGray}>
              {t('clear')}
            </button>

            <button type="button" onClick={onCancel} style={buttonGray}>
              {t('cancel')}
            </button>

            {((isEditMode && canEditSuppliers) || (!isEditMode && canCreateSuppliers)) && (
              <button type="submit" style={button}>
                {t('save')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const formStyle = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const input = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '10px',
  borderRadius: '5px',
  border: '1px solid #ccc',
  color: '#0f172a',
  backgroundColor: '#fff',
};

const button = {
  padding: '10px 15px',
  backgroundColor: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
};

const buttonGray = {
  ...button,
  backgroundColor: '#6b7280',
};

export default SupplierForm;
