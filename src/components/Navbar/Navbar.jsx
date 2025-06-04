// src/components/Navbar/Navbar.jsx
import React, { useState } from 'react';

const Navbar = ({ children }) => {
  const [logoError, setLogoError] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // null, 'robot', or 'environment'

  const togglePanel = (panel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  return (
    <>
      <nav className="controls-navbar controls-navbar-dark controls-bg-primary">
        <div className="controls-container-fluid">
          {/* Logo */}
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
          
          {/* Navigation links */}
          <div className="controls-navbar-nav controls-ms-auto">
            <a 
              className={`controls-nav-link ${activePanel === 'robot' ? 'active' : ''}`}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                togglePanel('robot');
              }}
            >
              Robot
            </a>
            
            <a 
              className={`controls-nav-link ${activePanel === 'environment' ? 'active' : ''}`}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                togglePanel('environment');
              }}
            >
              Environment
            </a>
          </div>
        </div>
      </nav>
      
      {/* Render children with activePanel prop */}
      {React.cloneElement(children, { activePanel, setActivePanel })}
    </>
  );
};

export default Navbar;