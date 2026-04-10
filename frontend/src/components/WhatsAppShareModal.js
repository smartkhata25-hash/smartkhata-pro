import React from 'react';
import { t } from '../i18n/i18n';

export default function WhatsAppShareModal({ open, onClose, onSelect }) {
  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ marginBottom: 10 }}>{t('whatsapp.send')}</h3>

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          {t('whatsapp.description')}
        </p>

        <button style={btnStyle} onClick={() => onSelect('whatsapp')}>
          🟢 WhatsApp
        </button>

        <button style={btnStyle} onClick={() => onSelect('business')}>
          🟢 WhatsApp Business
        </button>

        <button style={cancelStyle} onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// 🎨 Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 999,
};

const modalStyle = {
  background: '#fff',
  padding: 20,
  borderRadius: 12,
  width: 300,
  textAlign: 'center',
};

const btnStyle = {
  width: '100%',
  padding: '10px',
  marginBottom: 10,
  borderRadius: 8,
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#25D366',
  color: '#fff',
};

const cancelStyle = {
  width: '100%',
  padding: '8px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer',
};
