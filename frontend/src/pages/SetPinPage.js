import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SetPinPage() {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const navigate = useNavigate();

  const handleSave = () => {
    if (pin.length !== 4) {
      alert('4 digit PIN ڈالیں');
      return;
    }

    if (pin !== confirmPin) {
      alert('PIN match نہیں ہو رہا');
      return;
    }

    localStorage.setItem('appPin', pin);
    localStorage.setItem('lockEnabled', 'true');

    alert('PIN save ہو گیا ✅');
    navigate('/dashboard');
  };

  return (
    <div
      style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}
    >
      <div>
        <h2>🔐 PIN سیٹ کریں</h2>

        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
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

        <button onClick={handleSave}>Save PIN</button>
      </div>
    </div>
  );
}
