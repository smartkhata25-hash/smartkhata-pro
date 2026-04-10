import React, { useState, useEffect } from 'react';
import { t } from '../i18n/i18n';

const SupplierForm = ({ onSubmit, initialData = {}, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    supplierType: 'vendor',
    openingBalance: 0,
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: initialData.address || '',
        supplierType: initialData.supplierType || 'vendor',
        openingBalance: Number(initialData.openingBalance) || 0,
        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'openingBalance' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert(t('supplier.nameRequired'));
      return;
    }

    onSubmit(formData);
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

          <input
            type="number"
            name="openingBalance"
            placeholder={t('supplier.openingBalance')}
            value={formData.openingBalance}
            onChange={handleChange}
            style={input}
          />

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
                  openingBalance: 0,
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

            <button type="submit" style={button}>
              {t('save')}
            </button>
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
