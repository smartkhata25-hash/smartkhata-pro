import React, { useState, useEffect } from 'react';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const CustomerForm = ({ onSubmit, initialData = {}, onCancel }) => {
  const isEditMode = Boolean(initialData?._id);

  const canCreateCustomers = hasPermission('customers.create');
  const canEditCustomers = hasPermission('customers.edit');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    type: 'regular',
    openingBalance: '',
    openingType: 'receivable',
  });

  useEffect(() => {
    if (initialData) {
      const opening = Number(initialData.openingBalance) || 0;

      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        type: initialData.type || 'regular',
        openingBalance: Math.abs(opening),
        openingType: opening < 0 ? 'payable' : 'receivable',
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

    window.addEventListener('quick-customer-fill', handleQuickFill);

    return () => {
      window.removeEventListener('quick-customer-fill', handleQuickFill);
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

    if (isEditMode && !canEditCustomers) {
      alert('You do not have permission to edit customers');
      return;
    }

    if (!isEditMode && !canCreateCustomers) {
      alert('You do not have permission to create customers');
      return;
    }

    if (!formData.name.trim()) {
      alert(t('alerts.customerRequired'));
      return;
    }

    const finalOpening =
      formData.openingType === 'payable'
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
      email: '',
      phone: '',
      address: '',
      type: 'regular',
      openingBalance: '',
      openingType: 'receivable',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-1.5 py-2 sm:p-4 overflow-hidden">
      <style>{`
        .customer-form-modal,
        .customer-form-modal *,
        .customer-form-modal *::before,
        .customer-form-modal *::after {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .customer-form-modal {
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            max-height: calc(100dvh - 16px) !important;
            margin: 0 auto !important;
            padding: 14px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .customer-form-inner {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .customer-form-control {
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

          select.customer-form-control {
            appearance: auto !important;
            -webkit-appearance: menulist !important;
            height: 42px !important;
            min-height: 42px !important;
            padding-top: 5px !important;
            padding-bottom: 5px !important;
          }

          .customer-opening-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr) !important;
            gap: 8px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .customer-form-actions {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: 100% !important;
          }

          .customer-form-actions button {
            min-height: 42px !important;
            padding: 8px 13px !important;
            font-size: 14px !important;
          }
        }

        @media (max-width: 380px) {
          .customer-form-modal {
            width: calc(100vw - 8px) !important;
            max-width: calc(100vw - 8px) !important;
            padding: 12px !important;
          }

          .customer-opening-row {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          }

          .customer-form-control {
            font-size: 13px !important;
          }

          .customer-form-actions button {
            padding-left: 11px !important;
            padding-right: 11px !important;
          }
        }
      `}</style>

      <div className="customer-form-modal bg-white rounded-lg shadow-lg w-full max-w-md overflow-y-auto relative">
        <form onSubmit={handleSubmit} className="customer-form-inner" style={formStyle}>
          <input
            type="text"
            name="name"
            className="customer-form-control"
            placeholder={t('customerName')}
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
          />

          <select
            name="type"
            className="customer-form-control"
            value={formData.type}
            onChange={handleChange}
            style={input}
          >
            <option value="regular">{t('customer.regular')}</option>
            <option value="vip">{t('customer.vip')}</option>
            <option value="blocked">{t('customer.blocked')}</option>
          </select>

          {!isEditMode && (
            <div className="customer-opening-row">
              <select
                name="openingType"
                className="customer-form-control"
                value={formData.openingType}
                onChange={handleChange}
                style={input}
              >
                <option value="receivable">Receivable</option>
                <option value="payable">Advance / Payable</option>
              </select>

              <input
                type="text"
                inputMode="decimal"
                name="openingBalance"
                className="customer-form-control no-spinner"
                placeholder={t('customer.openingBalance')}
                value={formData.openingBalance}
                onChange={handleChange}
                style={input}
              />
            </div>
          )}

          <input
            type="email"
            name="email"
            className="customer-form-control"
            placeholder={t('customer.emailOptional')}
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="phone"
            className="customer-form-control"
            placeholder={t('customer.phoneOptional')}
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            className="customer-form-control"
            placeholder={t('customer.addressOptional')}
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <div className="customer-form-actions mt-4">
            <button type="button" onClick={handleClear} style={buttonClear}>
              {t('clear')}
            </button>

            <button type="button" onClick={onCancel} style={buttonGray}>
              {t('cancel')}
            </button>

            {((isEditMode && canEditCustomers) || (!isEditMode && canCreateCustomers)) && (
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
  margin: '0 auto',
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
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
};

const buttonGray = {
  ...button,
  backgroundColor: '#6c757d',
};

const buttonClear = {
  padding: '10px 15px',
  backgroundColor: '#f1f5f9',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  borderRadius: '5px',
  cursor: 'pointer',
};

export default CustomerForm;
