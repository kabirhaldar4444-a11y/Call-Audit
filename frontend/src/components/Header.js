import React from 'react';
import './Header.css';
import { FiUser, FiLogOut, FiMenu, FiSun, FiMoon } from 'react-icons/fi';

const Header = ({ user, onLogout, toggleSidebar, theme, toggleTheme }) => {
  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-toggle-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar">
          <FiMenu size={20} />
        </button>
        <h1>Call Audit System</h1>
      </div>

      <div className="header-right">
        <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle Dark/Light Mode">
          {theme === 'light' ? <FiMoon size={20} /> : <FiSun size={20} />}
        </button>
        <div className="user-info">
          <FiUser size={20} />
          <span>{user?.username}</span>
        </div>
        <button onClick={onLogout} className="logout-btn-header">
          <FiLogOut size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
