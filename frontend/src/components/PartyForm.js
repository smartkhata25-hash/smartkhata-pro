import React, { useEffect, useState } from 'react';
import { t } from '../i18n/i18n';

const PartyForm = ({ onSubmit, initialData = {}, onCancel }) => {
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
      if (e.key === 'Escape') onCancel && onCancel();
    };

    window.addEventListener('keydown', esc);

    return () => window.removeEventListener('keydown', esc);
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

    if (!formData.name.trim()) {
      alert('Party name required');
      return;
    }

    const finalOpening =
      formData.openingType === 'payable'
        ? -Math.abs(Number(formData.openingBalance || 0))
        : Math.abs(Number(formData.openingBalance || 0));

    onSubmit({
      ...formData,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      notes: formData.notes.trim(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 14 }}>
          {initialData?._id ? 'Edit Party' : 'Add Party'}
        </h2>

        <form onSubmit={handleSubmit} style={formStyle}>
          <input
            type="text"
            name="name"
            placeholder="Party Name"
            value={formData.name}
            onChange={handleChange}
            required
            style={input}
            autoFocus
          />

          <select name="role" value={formData.role} onChange={handleChange} style={input}>
            <option value="both">Customer + Supplier</option>
            <option value="customer">Customer Only</option>
            <option value="supplier">Supplier Only</option>
          </select>

          {!initialData?._id && (
            <div className="flex gap-2">
              <select
                name="openingType"
                value={formData.openingType}
                onChange={handleChange}
                style={{
                  ...input,
                  width: '42%',
                }}
              >
                <option value="receivable">Receivable</option>
                <option value="payable">Payable</option>
              </select>

              <input
                type="text"
                inputMode="decimal"
                name="openingBalance"
                placeholder="Opening Balance"
                value={formData.openingBalance}
                onChange={handleChange}
                style={{
                  ...input,
                  width: '58%',
                }}
              />
            </div>
          )}

          <input
            type="text"
            name="phone"
            placeholder="Phone"
            value={formData.phone}
            onChange={handleChange}
            style={input}
          />

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="address"
            placeholder="Address"
            value={formData.address}
            onChange={handleChange}
            style={input}
          />

          <textarea
            name="notes"
            placeholder="Notes"
            value={formData.notes}
            onChange={handleChange}
            style={{
              ...input,
              minHeight: 70,
              resize: 'vertical',
            }}
          />

          {initialData?._id && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
              />
              Active Party
            </label>
          )}

          <div className="flex gap-3 mt-4 justify-end">
            {!initialData?._id && (
              <button type="button" onClick={clearForm} style={buttonGray}>
                {t('clear') || 'Clear'}
              </button>
            )}

            <button type="button" onClick={onCancel} style={buttonGray}>
              {t('cancel') || 'Cancel'}
            </button>

            <button type="submit" style={button}>
              {t('save') || 'Save'}
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
  fontSize: 14,
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
