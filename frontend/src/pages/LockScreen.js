import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LockScreen() {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    const value = e.target.value;
    if (value.length <= 4) {
      setPin(value);
    }
  };

  const handleSubmit = () => {
    const userId = localStorage.getItem('userId');
    const savedPin = localStorage.getItem(`appPin_${userId}`);

    if (pin === savedPin) {
      localStorage.setItem(`isUnlocked_${userId}`, 'true');
      console.log('UNLOCK SUCCESS');
      console.log('isUnlocked:', localStorage.getItem(`isUnlocked_${userId}`));

      const user = JSON.parse(localStorage.getItem('user'));

      // 🔥 smart navigation
      if (!user?.fullName || !user?.cnic || !user?.mobile || !user?.address) {
        navigate('/personal-info');
      } else if (!user?.businessName || !user?.businessType || !user?.currency) {
        navigate('/business-info');
      } else {
        navigate('/dashboard');
      }
    } else {
      alert('غلط PIN ❌');
      setPin('');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        padding: '20px',
      }}
    >
      <button
        onClick={() => {
          const userId = localStorage.getItem('userId');
          localStorage.setItem(`isUnlocked_${userId}`, 'false');
          navigate('/login');
        }}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'transparent',
          border: 'none',
          fontSize: '14px',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '30px',
          borderRadius: '16px',
          background: '#ffffff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔒</div>

        {/* Title */}
        <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>PIN داخل کریں</p>

        {/* Input */}
        <input
          type="password"
          value={pin}
          onChange={handleChange}
          placeholder="••••"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '22px',
            textAlign: 'center',
            letterSpacing: '8px',
            borderRadius: '10px',
            border: '1px solid #ddd',
            outline: 'none',
            marginBottom: '20px',
          }}
        />

        {/* Button */}
        <button
          onClick={handleSubmit}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
            color: '#fff',
            fontWeight: '600',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Unlock
        </button>

        {/* Forgot */}
        <div style={{ marginTop: '15px' }}>
          <button
            onClick={() => {
              const confirmReset = window.confirm('کیا آپ PIN reset کرنا چاہتے ہیں؟');

              if (confirmReset) {
                const userId = localStorage.getItem('userId');
                localStorage.removeItem(`appPin_${userId}`);

                localStorage.setItem(`lockEnabled_${userId}`, 'false');
                localStorage.setItem(`isUnlocked_${userId}`, 'true');
                navigate('/set-pin');
              }
            }}
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
