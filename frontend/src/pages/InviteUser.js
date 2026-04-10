import { useState } from 'react';

export default function InviteUser() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!email) return alert('Please enter email');

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/invite/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
      } else {
        alert(data.msg || 'Error generating code');
      }
    } catch (err) {
      alert('Server error');
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eef2ff, #f8fafc)',
        padding: '20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Card */}
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '28px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '18px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '4px' }}>Invite User</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>
            Generate invite code and send to user
          </p>
        </div>

        {/* Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            User Email
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="email"
              placeholder="Enter user email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '35px',
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

        {/* Button */}
        <button
          onClick={handleGenerate}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: '600',
            fontSize: '15px',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate Code'}
        </button>

        {/* Result Box */}
        {result && (
          <div
            style={{
              marginTop: '18px',
              padding: '14px',
              borderRadius: '10px',
              background: '#ecfdf5',
              border: '1px solid #bbf7d0',
            }}
          >
            <p style={{ marginBottom: '6px', fontSize: '14px' }}>
              <strong>Email:</strong> {result.email}
            </p>

            <p style={{ color: '#16a34a', fontWeight: '600' }}>✅ Invite code sent successfully</p>
          </div>
        )}
      </div>
    </div>
  );
}
