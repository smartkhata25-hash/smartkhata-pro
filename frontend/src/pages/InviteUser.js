import { useState } from 'react';

export default function InviteUser() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert('Please enter email');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/invite/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
      } else {
        alert(data.error || data.msg || 'Unable to send invite code');
      }
    } catch (err) {
      alert('Server error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!result?.code) return;

    try {
      await navigator.clipboard.writeText(result.code);
      alert('Code copied');
    } catch (err) {
      alert('Unable to copy code');
    }
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
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '28px',
        }}
      >
        <div
          style={{
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <button
            type="button"
            onClick={() => {
              window.location.href = '/#/';
            }}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '4px 0',
              color: '#2563eb',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
        <div
          style={{
            marginBottom: '18px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '4px' }}>Invite User</h2>

          <p
            style={{
              fontSize: '13px',
              color: '#6b7280',
              margin: 0,
            }}
          >
            Send an invite code directly to the user's email
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '13px',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            User Email
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="email"
              placeholder="Enter user email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleGenerate();
                }
              }}
              disabled={loading}
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

        <button
          type="button"
          onClick={handleGenerate}
          className="btn btn-primary"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: '600',
            fontSize: '15px',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending Invite...' : 'Send Invite Code'}
        </button>

        {result && (
          <div
            style={{
              marginTop: '18px',
              padding: '16px',
              borderRadius: '10px',
              background: '#ecfdf5',
              border: '1px solid #bbf7d0',
            }}
          >
            <p
              style={{
                margin: '0 0 10px',
                color: '#16a34a',
                fontWeight: '600',
              }}
            >
              ✅ Invite code sent successfully
            </p>

            <p
              style={{
                margin: '0 0 8px',
                fontSize: '14px',
              }}
            >
              <strong>Email:</strong> {result.email}
            </p>

            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #d1fae5',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginBottom: '5px',
                }}
              >
                Invite Code
              </div>

              <div
                style={{
                  fontSize: '26px',
                  fontWeight: '700',
                  letterSpacing: '5px',
                  color: '#1d4ed8',
                }}
              >
                {result.code}
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                style={{
                  marginTop: '10px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: '#ffffff',
                }}
              >
                📋 Copy Code
              </button>
            </div>

            <p
              style={{
                margin: '12px 0 0',
                fontSize: '12px',
                color: '#6b7280',
                lineHeight: '1.5',
              }}
            >
              The invite code has also been sent to the user's email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
