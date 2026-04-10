import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

export default function PersonalInfoForm() {
  const [form, setForm] = useState({
    fullName: '',
    cnic: '',
    mobile: '',
    address: '',
  });

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/personal-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      alert(t('alerts.personalInfoSaved'));

      if (data.msg === 'Personal Info saved successfully') {
        navigate('/business-info');
      }
    } catch (error) {
      alert(t('alerts.somethingWrong'));
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
          <h2 style={{ marginBottom: '5px' }}>{t('auth.personalInfo')}</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>Please enter your personal details</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
              {t('auth.fullName')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.fullName}
                placeholder={t('auth.fullName')}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                style={{ width: '100%', paddingLeft: '35px' }}
              />
              <span style={iconStyle}>👤</span>
            </div>
          </div>

          {/* CNIC */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
              {t('auth.cnic')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.cnic}
                placeholder={t('auth.cnic')}
                onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                required
                style={{ width: '100%', paddingLeft: '35px' }}
              />
              <span style={iconStyle}>🪪</span>
            </div>
          </div>

          {/* Mobile */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
              {t('auth.mobile')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.mobile}
                placeholder={t('auth.mobile')}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                required
                style={{ width: '100%', paddingLeft: '35px' }}
              />
              <span style={iconStyle}>📱</span>
            </div>
          </div>

          {/* Address */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
              {t('auth.address')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                value={form.address}
                placeholder={t('auth.address')}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
                style={{ width: '100%', paddingLeft: '35px' }}
              />
              <span style={iconStyle}>📍</span>
            </div>
          </div>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            {/* Back */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn"
              style={{
                flex: 1,
                background: '#e5e7eb',
                fontWeight: '600',
              }}
            >
              ⬅️ {t('common.back')}
            </button>

            {/* Next */}
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

/* 🔹 Reusable Icon Style */
const iconStyle = {
  position: 'absolute',
  left: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#9ca3af',
};
