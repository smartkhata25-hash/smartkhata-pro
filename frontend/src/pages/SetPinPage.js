import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SetPinPage() {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSave = () => {
    if (loading) return;

    if (pin.length !== 4) {
      alert('4 digit PIN ڈالیں');
      return;
    }

    if (pin !== confirmPin) {
      alert('PIN match نہیں ہو رہا');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const userId = localStorage.getItem('userId');

      localStorage.setItem(`appPin_${userId}`, pin);
      localStorage.setItem(`lockEnabled_${userId}`, 'true');
      localStorage.setItem(`isUnlocked_${userId}`, 'true');
      alert('PIN save ہو گیا ✅');
      navigate('/dashboard');
    }, 500);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #4f46e5, #9333ea)',
        padding: '20px',
      }}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '30px',
          borderRadius: '18px',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 15px 40px rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔐</div>

        {/* Title */}
        <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
          اپنا PIN سیٹ کریں
        </p>

        {/* PIN Input */}
        <input
          type="password"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={inputStyle}
        />

        {/* Confirm PIN */}
        <input
          type="password"
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={inputStyle}
        />

        {/* Button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            fontWeight: '600',
            fontSize: '15px',
            cursor: 'pointer',
            marginTop: '10px',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Saving...' : 'Save PIN'}
        </button>
      </div>
    </div>
  );
}

/* 🔥 reusable input style */
const inputStyle = {
  width: '100%',
  padding: '12px',
  marginBottom: '12px',
  borderRadius: '10px',
  border: '1px solid #ddd',
  outline: 'none',
  fontSize: '18px',
  textAlign: 'center',
  letterSpacing: '8px',
};
