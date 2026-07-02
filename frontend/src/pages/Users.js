import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { AgGridReact } from 'ag-grid-react';
import './Users.css';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editUserId, setEditUserId] = useState(null);

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
      headerName: "Actions", 
      sortable: false, 
      filter: false,
      width: 180,
      cellRenderer: (params) => {
        const u = params.data;
        if (!u) return null;
        return (
          <div className="action-buttons-cell">
            <button
              className="edit-user-btn"
              onClick={() => handleStartEdit(u)}
              title="Edit user credentials"
            >
              Edit
            </button>
            <button
              className="delete-user-btn"
              onClick={() => handleDelete(u._id)}
              title="Delete user credentials"
            >
              Delete
            </button>
          </div>
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

  const handleStartEdit = (user) => {
    setIsEditing(true);
    setEditUserId(user._id || user.id);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Blank by default, optional update
      role: user.role || 'admin'
    });
    setStatusMsg(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditUserId(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'admin'
    });
    setStatusMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { username, email, password, role } = formData;

    if (isEditing) {
      if (!username || !email || !role) {
        setStatusMsg({ type: 'error', text: 'Username, Email and Role are required!' });
        return;
      }
    } else {
      if (!username || !email || !password || !role) {
        setStatusMsg({ type: 'error', text: 'All fields are required!' });
        return;
      }
    }

    try {
      setSubmitting(true);
      setStatusMsg({ type: 'info', text: isEditing ? 'Updating user...' : 'Creating user...' });
      
      let response;
      if (isEditing) {
        const payload = { username, email, role };
        if (password.trim() !== '') {
          payload.password = password;
        }
        response = await api.put(`/auth/users/${editUserId}`, payload);
      } else {
        response = await api.post('/auth/users', formData);
      }
      
      setStatusMsg({ type: 'success', text: response.data.message || (isEditing ? 'User updated successfully!' : 'User created successfully!') });
      
      // Reset editing states
      setIsEditing(false);
      setEditUserId(null);
      setFormData({ username: '', email: '', password: '', role: 'admin' });
      fetchUsers();
    } catch (error) {
      setStatusMsg({ type: 'error', text: error.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} user` });
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
      
      // If we are currently editing the deleted user, cancel the edit mode
      if (isEditing && editUserId === id) {
        handleCancelEdit();
      }
      
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
        {/* User Creation / Editing Form */}
        <div className="form-card-container">
          <div className="form-card">
            <h3>{isEditing ? '✏️ Edit User' : '🔑 Provision User'}</h3>
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
                <label htmlFor="password">
                  Password {isEditing && <span className="optional-lbl">(Leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={isEditing ? "Optional: Enter new password" : "••••••••"}
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

              <div className="form-buttons-group">
                <button type="submit" className="create-user-btn" disabled={submitting}>
                  {submitting ? (isEditing ? 'Updating...' : 'Provisioning...') : (isEditing ? 'Update Account' : 'Create Account')}
                </button>
                
                {isEditing && (
                  <button 
                    type="button" 
                    className="cancel-edit-btn" 
                    onClick={handleCancelEdit}
                    disabled={submitting}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
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
