import React, { useState } from 'react';

const Navbar = ({ onToggleControls, isOpen }) => {
  const [logoError, setLogoError] = useState(false);

  return (
    <nav className="controls-navbar controls-navbar-dark controls-bg-primary" style={{
      position: 'relative',
      zIndex: 1000
    }}>
      <div className="controls-container-fluid">
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
        
        <div className="controls-navbar-nav controls-ms-auto">
          <a className="controls-nav-link active" href="#">Workspace</a>
          
          {/* Robot button as a nav link */}
          <a 
            className={`controls-nav-link ${isOpen ? 'active' : ''}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onToggleControls();
            }}
            style={{
              cursor: 'pointer'
            }}
          >
            Robot
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