import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as loginUser } from '../services/authService'; // ✅ aliasing applied

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await loginUser(form); // ✅ renamed alias used

      if (res.token && res.user) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userId', res.user._id);
        alert('Login successful!');

        const user = res.user;
        if (!user.fullName || !user.cnic || !user.mobile || !user.address) {
          navigate('/personal-info');
        } else if (!user.businessName || !user.businessType || !user.currency) {
          navigate('/business-info');
        } else {
          navigate('/dashboard');
        }
      } else {
        alert(res.msg || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Server error during login.');
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input
          placeholder="Password"
          type="password"
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button type="submit">Login</button>
      </form>
      <p>
        New user? <a href="/register">Register here</a>
      </p>
    </div>
  );
}
