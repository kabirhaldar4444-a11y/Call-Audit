import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calls from './pages/Calls';
import Audits from './pages/Audits';
import Users from './pages/Users';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import './App.css';

function App() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!user);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    setIsLoggedIn(!!user);
  }, [user]);

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setSidebarOpen(false);
    setSidebarCollapsed(false);
  };

  const handleSidebarToggle = () => {
    if (window.innerWidth <= 1200) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  return (
    <Router>
      <div className={`app-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar 
          isOpen={sidebarOpen} 
          toggleSidebar={handleSidebarToggle} 
          onLogout={handleLogout} 
          user={user} 
        />
        <Header 
          user={user} 
          onLogout={handleLogout} 
          toggleSidebar={handleSidebarToggle} 
          theme={theme} 
          toggleTheme={toggleTheme} 
        />
        
        <main className="main-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/audits" element={<Audits />} />
            <Route path="/users" element={user?.role === 'superadmin' ? <Users /> : <Navigate to="/dashboard" />} />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}


export default App;
