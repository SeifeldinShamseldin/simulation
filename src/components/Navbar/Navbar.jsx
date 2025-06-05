// src/components/Navbar/Navbar.jsx - NO ControlsTheme.css import
import React, { useState } from 'react';
// NO import for ControlsTheme.css here!

const Navbar = ({ activePanel, onPanelToggle }) => {
  const [logoError, setLogoError] = useState(false);

  const handlePanelToggle = (panel) => {
    onPanelToggle(activePanel === panel ? null : panel);
  };

  return (
    <nav className="controls-navbar controls-navbar-dark controls-bg-primary">
      <div className="controls-container-fluid">
        <a className="controls-navbar-brand" href="#">
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
        
        <div className="controls-navbar-nav controls-ms-auto">
          <a 
            className={`controls-nav-link ${activePanel === 'robot' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePanelToggle('robot');
            }}
          >
            Robot
          </a>
          
          <a 
            className={`controls-nav-link ${activePanel === 'environment' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePanelToggle('environment');
            }}
          >
            Environment
          </a>

          <a 
            className={`controls-nav-link ${activePanel === 'world' ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePanelToggle('world');
            }}
            style={{
              color: activePanel === 'world' ? '#ff9900' : '#fff'
            }}
          >
            World
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;