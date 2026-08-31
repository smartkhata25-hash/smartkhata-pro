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
    moduleScope: 'trading',
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
        moduleScope: initialData.moduleScope || 'trading',

        openingBalance: opening,

        openingType: opening < 0 ? 'advance' : 'payable',

        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  useEffect(() => {
    const handleQuickFill = (e) => {
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

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'openingBalance') {
      const numericValue = parseFloat(value) || 0;

      setFormData((prev) => ({
        ...prev,

        openingBalance: value,

        openingType: numericValue < 0 ? 'advance' : 'payable',
      }));

      return;
    }
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
        ? -Math.abs(formData.openingBalance || 0)
        : Math.abs(formData.openingBalance || 0);

    onSubmit({
      ...formData,
      openingBalance: finalOpening,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <form onSubmit={handleSubmit} style={formStyle}>
          <input
            type="text"
            name="name"
            placeholder={t('supplier.name')}
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
          />

          <select
            name="supplierType"
            value={formData.supplierType}
            onChange={handleChange}
            style={input}
          >
            <option value="vendor">{t('supplier.vendor')}</option>
            <option value="blocked">{t('supplier.blocked')}</option>
            <option value="other">{t('supplier.other')}</option>
          </select>

          <select name="moduleScope" value={formData.moduleScope} onChange={handleChange} style={input}>
            <option value="trading">{t('moduleScope.trading')}</option>
            <option value="both">{t('moduleScope.both')}</option>
          </select>

          {!initialData?._id && (
            <div className="flex gap-2">
              <select
                name="openingType"
                value={formData.openingType}
                onChange={handleChange}
                style={{
                  ...input,
                  width: '40%',
                }}
              >
                <option value="payable">Payable</option>
                <option value="advance">Advance</option>
              </select>

              <input
                type="text"
                inputMode="decimal"
                name="openingBalance"
                placeholder={t('supplier.openingBalance')}
                value={formData.openingBalance}
                onChange={handleChange}
                style={{
                  ...input,
                  width: '60%',
                }}
              />
            </div>
          )}

          <input
            type="email"
            name="email"
            placeholder={t('email')}
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="phone"
            placeholder={t('phone')}
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            placeholder={t('address')}
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder={t('description')}
            style={input}
          />

          <div className="flex gap-3 mt-4 justify-end">
            <button
              type="button"
              onClick={() =>
                setFormData({
                  name: '',
                  phone: '',
                  email: '',
                  address: '',
                  supplierType: 'vendor',
                  moduleScope: 'trading',
                  openingBalance: '',
                  openingType: 'payable',
                  notes: '',
                })
              }
              style={buttonGray}
            >
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
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const input = {
  padding: '10px',
  borderRadius: '5px',
  border: '1px solid #ccc',
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
