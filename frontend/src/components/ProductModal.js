import React, { useState, useEffect } from 'react';
import ProductForm from './ProductForm';
import { t } from '../i18n/i18n';

const ProductModal = ({ open, onClose, onAdd, editProduct, onUpdate, clearEdit }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center"
      style={{
        background: 'rgba(0,0,0,0.45)',
        alignItems: isMobile ? 'flex-start' : 'center',
        paddingTop: isMobile ? 10 : 0,
      }}
    >
      {/* Modal Box */}
      <div
        className="bg-white shadow-2xl"
        style={{
          width: isMobile ? '95%' : '900px',
          borderRadius: isMobile ? 12 : 16,
          animation: 'fadeIn 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '10px 12px' : '16px 24px',
            background: 'linear-gradient(135deg,#16a34a,#166534)',
            color: '#fff',
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? 14 : 18,
              fontWeight: 600,
            }}
          >
            {editProduct ? t('inventory.editProduct') : t('inventory.addProduct')}
          </h2>

          <button
            onClick={onClose}
            style={{
              fontSize: isMobile ? 16 : 18,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: isMobile ? '10px' : '20px',
          }}
        >
          <ProductForm
            onAdd={onAdd}
            editProduct={editProduct}
            onUpdate={onUpdate}
            clearEdit={clearEdit}
            closeModal={onClose}
            isMobile={isMobile} // 👈 IMPORTANT
          />
        </div>
      </div>

      {/* Animation */}
      <style>
        {`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        `}
      </style>
    </div>
  );
};

export default ProductModal;
