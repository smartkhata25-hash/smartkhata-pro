import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

export default function BusinessInfoForm() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    currency: '',
    taxNumber: '',
  });

  const [loading, setLoading] = useState(false);

  const businessTypes = ['Retail', 'Wholesale', 'Services', 'Manufacturing', 'Freelancing'];
  const currencies = ['PKR', 'USD', 'INR', 'SAR', 'AED'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/business-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      alert(data.msg);

      if (data.msg === 'Business Info saved successfully') {
        navigate('/dashboard');
      }
    } catch (error) {
      alert(t('alerts.businessSaveError'));
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eef2ff, #f8fafc)',
        padding: '20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Card */}
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '28px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '5px' }}>{t('business.title')}</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>Setup your business profile</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Business Name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t('business.name')}</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.businessName}
                placeholder={t('business.name')}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                required
                style={inputWithIcon}
              />
              <span style={iconStyle}>🏢</span>
            </div>
          </div>

          {/* Business Type */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t('business.selectType')}</label>
            <div style={{ position: 'relative' }}>
              <select
                className="input"
                value={form.businessType}
                onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                required
                style={inputWithIcon}
              >
                <option value="">{t('business.selectType')}</option>
                {businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <span style={iconStyle}>📊</span>
            </div>
          </div>

          {/* Currency */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t('business.selectCurrency')}</label>
            <div style={{ position: 'relative' }}>
              <select
                className="input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                required
                style={inputWithIcon}
              >
                <option value="">{t('business.selectCurrency')}</option>
                {currencies.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
              <span style={iconStyle}>💱</span>
            </div>
          </div>

          {/* Tax Number */}
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>{t('business.taxOptional')}</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.taxNumber}
                placeholder={t('business.taxOptional')}
                onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                style={inputWithIcon}
              />
              <span style={iconStyle}>🧾</span>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Back */}
            <button
              type="button"
              onClick={() => navigate('/personal-info')}
              className="btn"
              style={{
                flex: 1,
                background: '#e5e7eb',
                fontWeight: '600',
              }}
            >
              ⬅️ {t('common.back')}
            </button>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                flex: 1,
                fontWeight: '600',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              disabled={loading}
            >
              {loading ? 'Saving...' : `${t('common.next')} ➡️`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* 🔹 Styles */
const iconStyle = {
  position: 'absolute',
  left: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#9ca3af',
};

const labelStyle = {
  fontSize: '13px',
  marginBottom: '4px',
  display: 'block',
};

const inputWithIcon = {
  width: '100%',
  paddingLeft: '35px',
};
