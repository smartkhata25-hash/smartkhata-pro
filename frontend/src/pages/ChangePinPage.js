import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChangePinPage() {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const navigate = useNavigate();

  const savedPin = localStorage.getItem('appPin');

  const handleChangePin = () => {
    if (oldPin !== savedPin) {
      alert('پرانا PIN غلط ہے ❌');
      return;
    }

    if (newPin.length !== 4) {
      alert('نیا PIN 4 digit ہونا چاہیے');
      return;
    }

    if (newPin !== confirmPin) {
      alert('Confirm PIN match نہیں کر رہا');
      return;
    }

    localStorage.setItem('appPin', newPin);
    alert('PIN کامیابی سے بدل گیا ✅');
    localStorage.setItem('isUnlocked', 'true');
    navigate('/dashboard');
  };

  const handleForgotPin = () => {
    const confirmReset = window.confirm('کیا آپ واقعی PIN reset کرنا چاہتے ہیں؟');

    if (confirmReset) {
      localStorage.removeItem('appPin');
      localStorage.setItem('lockEnabled', 'false');
      localStorage.setItem('isUnlocked', 'true');

      alert('PIN reset ہو گیا، دوبارہ set کریں 🔑');
      navigate('/set-pin');
    }
  };

  return (
    <div
      style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}
    >
      <div>
        <h2>🔑 Change PIN</h2>

        <input
          type="password"
          placeholder="Old PIN"
          value={oldPin}
          onChange={(e) => setOldPin(e.target.value)}
        />
        <br />
        <br />

        <input
          type="password"
          placeholder="New PIN"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
        />
        <br />
        <br />

        <input
          type="password"
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
        />
        <br />
        <br />

        <button onClick={handleChangePin}>Change PIN</button>

        <br />
        <br />

        <button onClick={handleForgotPin} style={{ color: 'red' }}>
          Forgot PIN?
        </button>
      </div>
    </div>
  );
}
