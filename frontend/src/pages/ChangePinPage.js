import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChangePinPage() {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const savedPin = localStorage.getItem(`appPin_${userId}`);

  const handleChangePin = () => {
    if (loading) return;

    if (oldPin !== savedPin) {
      alert('پرانا PIN غلط ہے ❌');
      return;
    }

    if (newPin.length !== 4) {
      alert('نیا PIN صرف 4 digit ہونا چاہیے');
      return;
    }

    if (newPin !== confirmPin) {
      alert('Confirm PIN match نہیں کر رہا');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const userId = localStorage.getItem('userId');
      localStorage.setItem(`appPin_${userId}`, newPin);
      localStorage.setItem(`isUnlocked_${userId}`, 'true');

      alert('PIN کامیابی سے بدل گیا ✅');
      navigate('/dashboard');
    }, 500);
  };

  const handleForgotPin = () => {
    const confirmReset = window.confirm('کیا آپ واقعی PIN reset کرنا چاہتے ہیں؟');

    if (confirmReset) {
      const userId = localStorage.getItem('userId');
      localStorage.removeItem(`appPin_${userId}`);
      localStorage.setItem(`lockEnabled_${userId}`, 'false');
      localStorage.setItem(`isUnlocked_${userId}`, 'true');

      alert('PIN reset ہو گیا، دوبارہ set کریں 🔑');
      navigate('/set-pin');
    }
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
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'transparent',
          border: 'none',
          fontSize: '14px',
          cursor: 'pointer',
          color: '#fff',
        }}
      >
        ← Back
      </button>
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '30px',
          borderRadius: '16px',
          background: '#fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>

        <h2 style={{ marginBottom: '5px' }}>Change PIN</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>نیا PIN سیٹ کریں</p>

        {/* Old PIN */}
        <input
          type="password"
          placeholder="Old PIN"
          value={oldPin}
          onChange={(e) => setOldPin(e.target.value)}
          style={inputStyle}
        />

        {/* New PIN */}
        <input
          type="password"
          placeholder="New PIN"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          style={inputStyle}
        />

        {/* Confirm PIN */}
        <input
          type="password"
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          style={inputStyle}
        />

        {/* Button */}
        <button
          onClick={handleChangePin}
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
          {loading ? 'Updating...' : 'Change PIN'}
        </button>

        {/* Forgot */}
        <div style={{ marginTop: '15px' }}>
          <button
            onClick={handleForgotPin}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Forgot PIN?
          </button>
        </div>
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
  fontSize: '14px',
};
