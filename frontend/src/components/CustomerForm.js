import React, { useState, useEffect } from 'react';
import { t } from '../i18n/i18n';

const CustomerForm = ({ onSubmit, initialData = {}, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    type: 'regular',
    openingBalance: 0,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        type: initialData.type || 'regular',
        openingBalance: Number(initialData.openingBalance) || 0,
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
      alert(t('alerts.customerRequired'));
      return;
    }

    onSubmit(formData);
  };

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', esc);

    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <form onSubmit={handleSubmit} style={formStyle}>
          <input
            type="text"
            name="name"
            placeholder={t('customerName')}
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
          />

          <select name="type" value={formData.type} onChange={handleChange} style={input}>
            <option value="regular">{t('customer.regular')}</option>
            <option value="vip">{t('customer.vip')}</option>
            <option value="blocked">{t('customer.blocked')}</option>
          </select>

          <input
            type="number"
            name="openingBalance"
            placeholder={t('customer.openingBalance')}
            value={formData.openingBalance}
            onChange={handleChange}
            style={input}
          />

          <input
            type="email"
            name="email"
            placeholder={t('customer.emailOptional')}
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="phone"
            placeholder={t('customer.phoneOptional')}
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            placeholder={t('customer.addressOptional')}
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <div className="flex gap-3 mt-4 justify-end">
            <button
              type="button"
              onClick={() =>
                setFormData({
                  name: '',
                  email: '',
                  phone: '',
                  address: '',
                  type: 'regular',
                  openingBalance: 0,
                })
              }
              style={{
                padding: '10px 15px',
                backgroundColor: '#f1f5f9',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
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

// Basic inline styles (if no CSS module used)
const formStyle = {
  maxWidth: '400px',
  margin: '0 auto',
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

export default CustomerForm;
