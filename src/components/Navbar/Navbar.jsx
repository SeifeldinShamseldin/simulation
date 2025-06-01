// src/components/Navbar/Navbar.jsx
import React, { useState } from 'react';

const Navbar = ({ onToggleControls, isOpen, onToggleEnvironment }) => {
  const [logoError, setLogoError] = useState(false);

  return (
    <nav className="controls-navbar controls-navbar-dark controls-bg-primary" style={{
      position: 'relative',
      zIndex: 1000
    }}>
      <div className="controls-container-fluid">
        {/* Logo */}
        <a className="controls-navbar-brand" href="#" style={{ 
          display: 'flex',
          alignItems: 'center',
          textDecoration: 'none'
        }}>
          {!logoError ? (
            <img 
              src="/logo/LOGO-Botfellows.webp" 
              alt="Botfellows Logo"
              style={{
                height: '36px',
                width: 'auto',
                objectFit: 'contain'
              }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <span style={{ 
              fontSize: '1.25rem',
              fontWeight: '600',
              color: 'white'
            }}>
              BOTFELLOWS
            </span>
          )}
        </a>
        
        {/* Navigation links */}
        <div className="controls-navbar-nav controls-ms-auto" style={{
          display: 'flex',
          gap: '1rem'
        }}>
          <a className="controls-nav-link active" href="#">Workspace</a>
          
          {/* Robot link - triggers menu toggle */}
          <a 
            className={`controls-nav-link ${isOpen ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onToggleControls();
            }}
            style={{
              cursor: 'pointer',
              color: isOpen ? '#fff' : 'rgba(255,255,255,0.7)',
              transition: 'color 0.3s ease'
            }}
          >
            Robot
          </a>
          
          {/* Environment link */}
          <a 
            className="controls-nav-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onToggleEnvironment();
            }}
            style={{
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)',
              transition: 'color 0.3s ease'
            }}
          >
            Environment
          </a>
          
          <a className="controls-nav-link" href="#">Simulation</a>
          <a className="controls-nav-link" href="#">Analytics</a>
          <a className="controls-nav-link" href="#">Documentation</a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;