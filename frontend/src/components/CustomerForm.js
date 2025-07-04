import React, { useState, useEffect } from 'react';

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
      alert('Customer name is required');
      return;
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <input
        type="text"
        name="name"
        placeholder="Customer Name"
        value={formData.name}
        onChange={handleChange}
        required
        style={input}
      />

      <select name="type" value={formData.type} onChange={handleChange} style={input}>
        <option value="regular">Regular</option>
        <option value="vip">VIP</option>
        <option value="blocked">Blocked</option>
      </select>

      <input
        type="number"
        name="openingBalance"
        placeholder="Opening Balance (can be negative)"
        value={formData.openingBalance}
        onChange={handleChange}
        step="0.01"
        style={input}
      />

      <input
        type="email"
        name="email"
        placeholder="Email (optional)"
        value={formData.email}
        onChange={handleChange}
        style={input}
      />

      <input
        type="text"
        name="phone"
        placeholder="Phone (optional)"
        value={formData.phone}
        onChange={handleChange}
        style={input}
      />

      <input
        type="text"
        name="address"
        placeholder="Address (optional)"
        value={formData.address}
        onChange={handleChange}
        style={input}
      />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" style={button}>
          Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={buttonGray}>
            Cancel
          </button>
        )}
      </div>
    </form>
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
