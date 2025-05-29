import React from 'react';

const Navbar = ({ onToggleControls, isOpen }) => {
  return (
    <nav className="controls-navbar controls-navbar-dark controls-bg-primary" style={{
      position: 'relative',
      zIndex: 1000
    }}>
      <div className="controls-container-fluid">
        {/* Robot Management button with hamburger and text */}
        <button 
          className="controls-btn controls-btn-dark"
          onClick={onToggleControls}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            marginRight: '1rem'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          title="Robot Management"
        >
          {/* Hamburger icon */}
          <div style={{ width: '20px', height: '16px', position: 'relative' }}>
            <span style={{
              display: 'block',
              width: '100%',
              height: '2px',
              background: 'white',
              borderRadius: '1px',
              position: 'absolute',
              top: '0',
              transition: 'all 0.3s ease',
              transform: isOpen ? 'rotate(45deg) translateY(7px)' : 'none'
            }}></span>
            <span style={{
              display: 'block',
              width: '100%',
              height: '2px',
              background: 'white',
              borderRadius: '1px',
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              transition: 'all 0.3s ease',
              opacity: isOpen ? 0 : 1
            }}></span>
            <span style={{
              display: 'block',
              width: '100%',
              height: '2px',
              background: 'white',
              borderRadius: '1px',
              position: 'absolute',
              bottom: '0',
              transition: 'all 0.3s ease',
              transform: isOpen ? 'rotate(-45deg) translateY(-7px)' : 'none'
            }}></span>
          </div>
          
          {/* Robot text */}
          <span style={{
            fontSize: '1rem',
            fontWeight: '500',
            letterSpacing: '0.02em'
          }}>
            Robot
          </span>
        </button>

        <a className="controls-navbar-brand" href="#" style={{ 
          fontSize: '1.25rem',
          fontWeight: '600'
        }}>
          🤖 URDF Viewer
        </a>
        
        <div className="controls-navbar-nav controls-ms-auto">
          <a className="controls-nav-link active" href="#">Workspace</a>
          <a className="controls-nav-link" href="#">Simulation</a>
          <a className="controls-nav-link" href="#">Analytics</a>
          <a className="controls-nav-link" href="#">Documentation</a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 