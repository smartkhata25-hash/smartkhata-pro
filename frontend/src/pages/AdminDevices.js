import { useEffect, useState } from 'react';

export default function AdminDevices() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loadingId, setLoadingId] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [sending, setSending] = useState(false);

  // 🔐 admin check
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user?.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  }, []);

  // 📥 load users
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/admin/users`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      alert('Failed to load users');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 🔴 block
  const blockUser = async (userId) => {
    if (!window.confirm('Are you sure you want to BLOCK this user?')) return;

    setLoadingId(userId);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/deactivate-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.msg || 'Error blocking user');
      } else {
        // ⚡ instant UI update (no reload)
        setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, isActive: false } : u)));
      }
    } catch (err) {
      alert('Server error');
    }

    setLoadingId(null);
  };

  // 🟢 unblock
  const unblockUser = async (userId) => {
    if (!window.confirm('Are you sure you want to UNBLOCK this user?')) return;

    setLoadingId(userId);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/activate-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.msg || 'Error unblocking user');
      } else {
        // ⚡ instant UI update
        setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, isActive: true } : u)));
      }
    } catch (err) {
      alert('Server error');
    }

    setLoadingId(null);
  };

  // 📤 send notification
  const sendNotification = async () => {
    if (!message.trim()) {
      alert('Message likhein');
      return;
    }

    setSending(true);

    try {
      const body = {
        message,
      };

      if (selectedUser !== 'all') {
        body.userId = selectedUser;
      }

      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.msg || 'Error sending');
      } else {
        alert('Message sent successfully ✅');
        setMessage('');
        setSelectedUser('all');
      }
    } catch (err) {
      alert('Server error');
    }

    setSending(false);
  };

  // 🔍 filter + search
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();

    const matchSearch = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);

    const matchFilter =
      filter === 'all' ||
      (filter === 'active' && u.isActive !== false) ||
      (filter === 'blocked' && u.isActive === false);

    return matchSearch && matchFilter;
  });

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={styles.title}>🔐 Admin Device Control</h2>

          <button style={styles.inviteBtn} onClick={() => (window.location.href = '/admin/invite')}>
            ➕ Invite User
          </button>
        </div>

        <div style={styles.controls}>
          <input
            placeholder="Search user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.input}
          />

          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={styles.select}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>
      {/* 📩 SEND MESSAGE BOX */}
      <div style={{ padding: '15px', background: '#fff', borderBottom: '1px solid #ddd' }}>
        <textarea
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{
            width: '100%',
            height: '70px',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            marginBottom: '10px',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px' }}
          >
            <option value="all">All Users</option>

            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>

          <button
            onClick={sendNotification}
            disabled={sending}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      {/* TABLE */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user._id} style={styles.row}>
                <td style={styles.td}>{user.name}</td>
                <td style={styles.td}>{user.email}</td>

                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.badge,
                      background: user.isActive === false ? '#fee2e2' : '#dcfce7',
                      color: user.isActive === false ? '#991b1b' : '#166534',
                    }}
                  >
                    {user.isActive === false ? 'Blocked' : 'Active'}
                  </span>
                </td>

                <td style={styles.td}>
                  {user.isActive === false ? (
                    <button
                      disabled={loadingId === user._id}
                      style={styles.unblockBtn}
                      onClick={() => unblockUser(user._id)}
                    >
                      {loadingId === user._id ? 'Processing...' : '🟢 Unblock'}
                    </button>
                  ) : (
                    <button
                      disabled={loadingId === user._id}
                      style={styles.blockBtn}
                      onClick={() => blockUser(user._id)}
                    >
                      {loadingId === user._id ? 'Processing...' : '🔴 Block'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 🎨 styles (slightly improved)
const styles = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#eef2f7',
  },

  header: {
    background: 'linear-gradient(135deg, #1d4ed8, #1e3a8a)',
    color: '#fff',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteBtn: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },

  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
  },

  controls: {
    display: 'flex',
    gap: '10px',
  },

  input: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
  },

  select: {
    padding: '8px',
    borderRadius: '6px',
    border: 'none',
    background: '#fff',
    color: '#000',
  },

  tableWrapper: {
    flex: 1,
    overflowY: 'auto',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
  },

  th: {
    position: 'sticky',
    top: 0,
    background: '#f1f5f9',
    padding: '12px',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
  },

  td: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
  },

  row: {
    transition: '0.2s',
  },

  badge: {
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  },

  blockBtn: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
  },

  unblockBtn: {
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
