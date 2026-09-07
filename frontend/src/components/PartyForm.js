import React, { useEffect, useState } from 'react';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const PartyForm = ({ onSubmit, initialData = {}, onCancel }) => {
  const isEditMode = Boolean(initialData?._id);

  const canCreateParties = hasPermission('parties.create');
  const canEditParties = hasPermission('parties.edit');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    role: 'both',
    openingBalance: '',
    openingType: 'receivable',
    isActive: true,
  });

  useEffect(() => {
    if (initialData) {
      const opening = Number(initialData.openingBalance) || 0;

      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: initialData.address || '',
        notes: initialData.notes || '',
        role: initialData.role || 'both',
        openingBalance: Math.abs(opening),
        openingType: opening < 0 ? 'payable' : 'receivable',
        isActive: initialData.isActive !== false,
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

    window.addEventListener('quick-party-fill', handleQuickFill);

    return () => {
      window.removeEventListener('quick-party-fill', handleQuickFill);
    };
  }, []);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', esc);

    return () => {
      window.removeEventListener('keydown', esc);
    };
  }, [onCancel]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (isEditMode && !canEditParties) {
      alert('You do not have permission to edit parties');
      return;
    }

    if (!isEditMode && !canCreateParties) {
      alert('You do not have permission to create parties');
      return;
    }

    if (!formData.name.trim()) {
      alert('Party name required');
      return;
    }

    const finalOpening =
      formData.openingType === 'payable'
        ? -Math.abs(Number(formData.openingBalance) || 0)
        : Math.abs(Number(formData.openingBalance) || 0);

    onSubmit({
      ...formData,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      notes: formData.notes.trim(),
      moduleScope: 'trading',
      openingBalance: finalOpening,
    });
  };

  const clearForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      role: 'both',
      openingBalance: '',
      openingType: 'receivable',
      isActive: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-1.5 py-2 sm:p-4 overflow-hidden">
      <style>{`
        .party-form-modal,
        .party-form-modal *,
        .party-form-modal *::before,
        .party-form-modal *::after {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .party-form-modal {
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            max-height: calc(100dvh - 16px) !important;
            margin: 0 auto !important;
            padding: 14px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .party-form-inner {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .party-form-control {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 42px !important;
            min-height: 42px !important;
            padding: 7px 10px !important;
            font-size: 14px !important;
            line-height: 20px !important;
            color: #0f172a !important;
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 6px !important;
          }

          select.party-form-control {
            appearance: auto !important;
            -webkit-appearance: menulist !important;
            height: 42px !important;
            min-height: 42px !important;
            padding-top: 5px !important;
            padding-bottom: 5px !important;
          }

          textarea.party-form-control {
            height: auto !important;
            min-height: 72px !important;
            resize: vertical;
          }

          .party-opening-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr) !important;
            gap: 8px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .party-form-actions {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: 100% !important;
          }

          .party-form-actions button {
            min-height: 42px !important;
            padding: 8px 13px !important;
            font-size: 14px !important;
          }

          .party-form-title {
            font-size: 17px !important;
            margin-bottom: 12px !important;
          }
        }

        @media (max-width: 380px) {
          .party-form-modal {
            width: calc(100vw - 8px) !important;
            max-width: calc(100vw - 8px) !important;
            padding: 12px !important;
          }

          .party-opening-row {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          }

          .party-form-control {
            font-size: 13px !important;
          }

          .party-form-actions button {
            padding-left: 11px !important;
            padding-right: 11px !important;
          }
        }
      `}</style>

      <div className="party-form-modal bg-white rounded-lg shadow-lg w-full max-w-md overflow-y-auto relative">
        <h2
          className="party-form-title"
          style={{
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 14,
          }}
        >
          {isEditMode ? 'Edit Party' : 'Add Party'}
        </h2>

        <form onSubmit={handleSubmit} className="party-form-inner" style={formStyle}>
          <input
            type="text"
            name="name"
            className="party-form-control"
            placeholder="Party Name"
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
            autoFocus
          />

          <select
            name="role"
            className="party-form-control"
            value={formData.role}
            onChange={handleChange}
            style={input}
          >
            <option value="both">Customer + Supplier</option>
            <option value="customer">Customer Only</option>
            <option value="supplier">Supplier Only</option>
          </select>

          {!isEditMode && (
            <div className="party-opening-row">
              <select
                name="openingType"
                className="party-form-control"
                value={formData.openingType}
                onChange={handleChange}
                style={input}
              >
                <option value="receivable">Receivable</option>
                <option value="payable">Payable</option>
              </select>

              <input
                type="text"
                inputMode="decimal"
                name="openingBalance"
                className="party-form-control no-spinner"
                placeholder="Opening Balance"
                value={formData.openingBalance}
                onChange={handleChange}
                style={input}
              />
            </div>
          )}

          <input
            type="text"
            name="phone"
            className="party-form-control"
            placeholder="Phone"
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="email"
            name="email"
            className="party-form-control"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            className="party-form-control"
            placeholder="Address"
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <textarea
            name="notes"
            className="party-form-control"
            placeholder="Notes"
            value={formData.notes}
            onChange={handleChange}
            style={input}
          />

          <div className="party-form-actions mt-4">
            {!isEditMode && (
              <button type="button" onClick={clearForm} style={buttonGray}>
                {t('clear') || 'Clear'}
              </button>
            )}

            <button type="button" onClick={onCancel} style={buttonGray}>
              {t('cancel') || 'Cancel'}
            </button>

            {((isEditMode && canEditParties) || (!isEditMode && canCreateParties)) && (
              <button type="submit" style={button}>
                {t('save') || 'Save'}
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
  fontSize: 14,
  color: '#0f172a',
  backgroundColor: '#fff',
};

const button = {
  padding: '10px 15px',
  backgroundColor: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontWeight: 600,
};

const buttonGray = {
  ...button,
  backgroundColor: '#6b7280',
};

export default PartyForm;
