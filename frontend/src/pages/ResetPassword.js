import { useState } from 'react';
import { t } from '../i18n/i18n';

export default function ResetPassword() {
  const savedEmail = sessionStorage.getItem('resetPasswordEmail') || '';

  const [form, setForm] = useState({
    email: savedEmail,
    newPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!navigator.onLine) {
      alert(t('auth.internetRequired'));
      return;
    }

    if (!form.email || !form.newPassword) {
      alert('Email اور نیا password درج کریں');
      return;
    }

    if (form.newPassword.length < 6) {
      alert('Password کم از کم 6 حروف کا ہونا چاہیے');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          newPassword: form.newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.removeItem('resetPasswordEmail');

        alert(t('auth.resetSuccess'));

        window.location.href = '/#/login';
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
        alignItems: 'center',
        justifyContent: 'center',
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

          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('auth.resetPassword')}</p>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              fontSize: '13px',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            {t('email')}
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="email"
              value={form.email}
              readOnly
              style={{
                width: '100%',
                paddingLeft: '35px',
                backgroundColor: '#f3f4f6',
                cursor: 'not-allowed',
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

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '13px',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            نیا Password
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="نیا Password درج کریں"
              value={form.newPassword}
              onChange={(e) =>
                setForm({
                  ...form,
                  newPassword: e.target.value,
                })
              }
              style={{
                width: '100%',
                paddingLeft: '35px',
                paddingRight: '40px',
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
              🔒
            </span>

            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              {showPassword ? '🙈' : '👁'}
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
          {loading ? 'Password تبدیل ہو رہا ہے...' : t('auth.resetPassword')}
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
