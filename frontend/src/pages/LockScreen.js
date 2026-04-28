import { useState } from 'react';

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');

  const handleChange = (e) => {
    const value = e.target.value;
    if (value.length <= 4) {
      setPin(value);
    }
  };

  const handleSubmit = () => {
    const savedPin = localStorage.getItem('appPin');

    if (pin === savedPin) {
      localStorage.setItem('isUnlocked', 'true');
      onUnlock();
    } else {
      alert('غلط PIN ❌');
    }
  };

  return (
    <div
      style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}
    >
      <div>
        <h2>🔒 PIN ڈالیں</h2>
        <input
          type="password"
          value={pin}
          onChange={handleChange}
          style={{ fontSize: '20px', padding: '10px', textAlign: 'center' }}
        />
        <br />
        <br />
        <button onClick={handleSubmit}>Unlock</button>
      </div>
    </div>
  );
}
