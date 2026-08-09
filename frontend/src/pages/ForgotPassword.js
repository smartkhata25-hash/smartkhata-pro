import { useState } from 'react';
import { t } from '../i18n/i18n';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!navigator.onLine) {
      alert(t('auth.internetRequired'));
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert(t('auth.enterEmail'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.setItem('resetPasswordEmail', cleanEmail);
        sessionStorage.removeItem('resetPasswordToken');

        alert(t('auth.otpSent'));

        window.location.href = '/#/reset-password';
      } else {
        alert(data.msg || t('common.error'));
      }
    } catch (err) {
      alert(t('common.serverError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #eef2ff, #f8fafc)',
        padding: '20px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>

          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('auth.forgotPassword')}</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '13px',
              marginBottom: '4px',
              display: 'block',
            }}
          >
            {t('auth.emailAddress')}
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="email"
              placeholder={t('auth.enterEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSubmit();
                }
              }}
              disabled={loading}
              style={{
                width: '100%',
                paddingLeft: '35px',
              }}
            />

            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            >
              📧
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: '600',
            fontSize: '15px',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? t('auth.sendingCode') : t('auth.continue')}
        </button>

        <div
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
          }}
        >
          <a href="/#/login" style={{ color: '#2563eb' }}>
            {t('auth.backToLogin')}
          </a>
        </div>
      </div>
    </div>
  );
}
