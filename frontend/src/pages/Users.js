import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { AgGridReact } from 'ag-grid-react';
import './Users.css';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'admin'
  });

  const columnDefs = [
    { 
      field: "username", 
      headerName: "Username", 
      filter: 'agTextColumnFilter',
      sortable: true,
      cellRenderer: (params) => <strong className="bold">{params.value}</strong>
    },
    { 
      field: "email", 
      headerName: "Email", 
      filter: 'agTextColumnFilter',
      sortable: true 
    },
    { 
      field: "role", 
      headerName: "Role", 
      filter: 'agTextColumnFilter',
      sortable: true,
      cellRenderer: (params) => {
        const val = params.value || '';
        return (
          <span className={`role-badge ${val}`}>
            {val.toUpperCase()}
          </span>
        );
      }
    },
    { 
      field: "created_at", 
      headerName: "Date Added", 
      sortable: true,
      cellRenderer: (params) => {
        const val = params.value || params.data.createdAt;
        return val ? new Date(val).toLocaleDateString() : '';
      }
    },
    { 
      headerName: "Action", 
      sortable: false, 
      filter: false,
      cellRenderer: (params) => {
        const u = params.data;
        if (!u) return null;
        return (
          <button
            className="delete-user-btn"
            onClick={() => handleDelete(u._id)}
            title="Revoke access"
          >
            Revoke
          </button>
        );
      }
    }
  ];

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/users');
      setUsers(response.data.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setStatusMsg({ type: 'error', text: error.response?.data?.message || 'Error fetching users list' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { username, email, password, role } = formData;

    if (!username || !email || !password || !role) {
      setStatusMsg({ type: 'error', text: 'All fields are required!' });
      return;
    }

    try {
      setSubmitting(true);
      setStatusMsg({ type: 'info', text: 'Creating user...' });
      const response = await api.post('/auth/users', formData);
      
      setStatusMsg({ type: 'success', text: response.data.message || 'User created successfully!' });
      setFormData({ username: '', email: '', password: '', role: 'admin' });
      fetchUsers();
    } catch (error) {
      setStatusMsg({ type: 'error', text: error.response?.data?.message || 'Failed to create user' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      setStatusMsg({ type: 'info', text: 'Deleting user...' });
      await api.delete(`/auth/users/${id}`);
      setStatusMsg({ type: 'success', text: 'User deleted successfully!' });
      fetchUsers();
    } catch (error) {
      setStatusMsg({ type: 'error', text: error.response?.data?.message || 'Failed to delete user' });
    }
  };

  if (loading && users.length === 0) {
    return <div className="users-loading">Loading User Directory...</div>;
  }

  return (
    <div className="users-container">
      <div className="users-header">
        <div>
          <h2>User Directory</h2>
          <p>Superadmin console to provision and manage access rights</p>
        </div>
        {statusMsg && (
          <div className={`status-banner ${statusMsg.type}`}>
            {statusMsg.text}
            <button onClick={() => setStatusMsg(null)}>×</button>
          </div>
        )}
      </div>

      <div className="users-layout-grid">
        {/* User Creation Form */}
        <div className="form-card-container">
          <div className="form-card">
            <h3>🔑 Provision User</h3>
            <form onSubmit={handleSubmit} className="users-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Enter username"
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@callaudit.com"
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role Permission</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  disabled={submitting}
                  className="role-select"
                >
                  <option value="admin">Admin / Auditor</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              <button type="submit" className="create-user-btn" disabled={submitting}>
                {submitting ? 'Provisioning...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>

        {/* Users List Table */}
        <div className="table-card">
          <div className="table-card-header">
            <h3>👥 Active Credentials</h3>
            <span className="user-count">{users.length} active users</span>
          </div>

          <div className="table-wrapper">
            <div className="calls-table ag-theme-alpine" style={{ height: '400px', width: '100%' }}>
              <AgGridReact
                rowData={users}
                columnDefs={columnDefs}
                rowHeight={50}
                headerHeight={48}
                defaultColDef={{
                  resizable: true,
                  flex: 1,
                  minWidth: 100
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Users;
