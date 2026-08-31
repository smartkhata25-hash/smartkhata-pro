import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { updateStoredUser } from '../utils/permissionHelper';
import { FaBoxOpen, FaPlaneDeparture } from 'react-icons/fa';
import {
  DEFAULT_ENABLED_MODULES,
  MODULE_KEYS,
  normalizeDefaultModule,
  normalizeEnabledModules,
} from '../utils/moduleConfig';

export default function BusinessInfoForm() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    currency: '',
    taxNumber: '',
    enabledModules: { ...DEFAULT_ENABLED_MODULES },
    defaultModule: MODULE_KEYS.TRADING,
  });

  const [loading, setLoading] = useState(false);

  const businessTypes = ['Retail', 'Wholesale', 'Services', 'Manufacturing', 'Freelancing'];
  const currencies = ['PKR', 'USD', 'INR', 'SAR', 'AED'];
  const moduleOptions = [
    {
      key: MODULE_KEYS.TRADING,
      label: 'business.modules.trading',
      description: 'business.modules.tradingDescription',
      icon: FaBoxOpen,
    },
    {
      key: MODULE_KEYS.TRAVEL,
      label: 'business.modules.travel',
      description: 'business.modules.travelDescription',
      icon: FaPlaneDeparture,
    },
  ];

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'auto';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        const data = await res.json();
        const enabledModules = normalizeEnabledModules(data.enabledModules);

        setForm({
          businessName: data.businessName || '',
          businessType: data.businessType || '',
          currency: data.currency || '',
          taxNumber: data.taxNumber || '',
          enabledModules,
          defaultModule: normalizeDefaultModule(data.defaultModule, enabledModules),
        });
      } catch (err) {
        console.log(err);
      }
    };

    fetchProfile();
  }, []);

  const handleModuleToggle = (moduleKey) => {
    const nextEnabledModules = {
      ...form.enabledModules,
      [moduleKey]: !form.enabledModules[moduleKey],
    };

    if (!Object.values(nextEnabledModules).some(Boolean)) {
      alert(t('business.modules.requireOne'));
      return;
    }

    setForm({
      ...form,
      enabledModules: nextEnabledModules,
      defaultModule: normalizeDefaultModule(form.defaultModule, nextEnabledModules),
    });
  };

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

      if (!res.ok) {
        throw new Error(data.msg || 'business_save_failed');
      }

      const enabledModules = normalizeEnabledModules(data.enabledModules || form.enabledModules);

      updateStoredUser({
        businessName: data.businessName || form.businessName,
        businessType: data.businessType || form.businessType,
        currency: data.currency || form.currency,
        taxNumber: data.taxNumber || form.taxNumber,
        enabledModules,
        defaultModule: normalizeDefaultModule(data.defaultModule || form.defaultModule, enabledModules),
      });

      alert(t('business.saved'));
      navigate('/dashboard');
    } catch (error) {
      alert(t('alerts.businessSaveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background:
          'linear-gradient(135deg, #eef2ff 0%, #f8fafc 46%, #ecfeff 100%)',
        padding: '24px 14px 96px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {/* Card */}
      <div
        className="card business-info-card"
        style={{
          width: '100%',
          maxWidth: '580px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '5px' }}>{t('business.title')}</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>
            {t('business.setupDescription')}
          </p>
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

          <div style={moduleSectionStyle}>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>{t('business.modules.title')}</label>
              <p style={moduleHelpStyle}>{t('business.modules.description')}</p>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              {moduleOptions.map((moduleOption) => {
                const isEnabled = Boolean(form.enabledModules[moduleOption.key]);
                const ModuleIcon = moduleOption.icon;

                return (
                  <label
                    key={moduleOption.key}
                    className="business-module-card"
                    style={moduleCardStyle(isEnabled)}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleModuleToggle(moduleOption.key)}
                      className="sr-only"
                    />

                    <span style={moduleCardMainStyle}>
                      <span style={moduleIconStyle(isEnabled)}>
                        <ModuleIcon aria-hidden="true" />
                      </span>

                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={moduleTitleStyle}>{t(moduleOption.label)}</span>
                        <span style={moduleHelpStyle}>{t(moduleOption.description)}</span>
                      </span>
                    </span>

                    <span style={moduleMetaStyle}>
                      <span style={moduleStatusStyle(isEnabled)}>
                        {isEnabled ? t('business.modules.enabled') : t('business.modules.disabled')}
                      </span>
                      <span style={switchTrackStyle(isEnabled)}>
                        <span style={switchThumbStyle} />
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={labelStyle}>{t('business.modules.default')}</label>
              <select
                className="input"
                value={form.defaultModule}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultModule: normalizeDefaultModule(e.target.value, form.enabledModules),
                  })
                }
              >
                {moduleOptions
                  .filter((moduleOption) => form.enabledModules[moduleOption.key])
                  .map((moduleOption) => (
                    <option key={moduleOption.key} value={moduleOption.key}>
                      {t(moduleOption.label)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Buttons */}
          <div className="business-info-actions" style={actionRowStyle}>
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
              {loading ? t('common.saving') : t('common.saveChanges')}
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

const moduleSectionStyle = {
  marginBottom: '18px',
  padding: '14px',
  border: '1px solid #dbe4ef',
  borderRadius: '10px',
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const moduleCardStyle = (isEnabled) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px',
  border: `1px solid ${isEnabled ? '#93c5fd' : '#e5e7eb'}`,
  borderRadius: '10px',
  background: isEnabled
    ? 'linear-gradient(135deg, #eff6ff 0%, #ffffff 58%, #ecfeff 100%)'
    : '#ffffff',
  boxShadow: isEnabled
    ? '0 8px 20px rgba(37, 99, 235, 0.10)'
    : '0 1px 2px rgba(15, 23, 42, 0.04)',
  cursor: 'pointer',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
});

const moduleCardMainStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '11px',
  minWidth: 0,
};

const moduleIconStyle = (isEnabled) => ({
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: isEnabled ? '#1d4ed8' : '#64748b',
  background: isEnabled ? '#dbeafe' : '#f1f5f9',
  fontSize: '16px',
  flexShrink: 0,
});

const moduleTitleStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  fontSize: '14px',
  lineHeight: 1.25,
};

const moduleMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  flexShrink: 0,
};

const moduleStatusStyle = (isEnabled) => ({
  fontSize: '11px',
  fontWeight: 700,
  color: isEnabled ? '#1d4ed8' : '#64748b',
});

const switchTrackStyle = (isEnabled) => ({
  width: '38px',
  height: '22px',
  borderRadius: '999px',
  background: isEnabled ? '#2563eb' : '#cbd5e1',
  padding: '2px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: isEnabled ? 'flex-end' : 'flex-start',
  transition: 'background 0.18s ease',
});

const switchThumbStyle = {
  width: '18px',
  height: '18px',
  borderRadius: '999px',
  background: '#ffffff',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.22)',
};

const moduleHelpStyle = {
  margin: 0,
  fontSize: '12px',
  color: '#6b7280',
  lineHeight: 1.35,
};

const actionRowStyle = {
  display: 'flex',
  gap: '10px',
  paddingTop: '2px',
};
