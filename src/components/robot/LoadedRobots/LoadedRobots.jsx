import React, { useState } from 'react';

const LoadedRobots = ({ 
  viewerRef, 
  workspaceRobots,
  activeRobotId,
  setActiveRobotId,
  setShowRobotSelection
}) => {
  const [imageError, setImageError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const activeRobot = workspaceRobots.find(r => r.id === activeRobotId);
  
  // Helper for consistent manufacturer letter icon
  const getLetterIcon = (name) => {
    const colorMap = {
      'kuka': '#007bff',
      'ur': '#28a745',
      'fanuc': '#ffc107',
      'abb': '#dc3545',
      'yaskawa': '#6f42c1',
      'default': '#6c757d'
    };
    const initial = name.charAt(0).toUpperCase();
    const color = colorMap[name.toLowerCase()] || colorMap.default;
    
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 'bold'
        }}
      >
        {initial}
      </div>
    );
  };

  // Add debugging
  console.log('[LoadedRobots] Active robot:', activeRobot);
  console.log('[LoadedRobots] Image path:', activeRobot?.imagePath);
  console.log('[LoadedRobots] Image error state:', imageError);

  const goBackToSelection = () => {
    // Don't clear the robot - just go back to selection
    setShowRobotSelection(true);
  };

  if (!activeRobot) return null;

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Active Robot</h3>
        <button
          onClick={goBackToSelection}
          className="controls-btn controls-btn-secondary controls-btn-sm"
        >
          ← Back to Robots
        </button>
      </div>
      
      <div className="controls-card-body">
        <div className="controls-card">
          <div className="controls-card-body">
            {/* Robot Preview - Image or Placeholder */}
            <div 
              style={{
                width: '100%',
                height: '180px',
                marginBottom: '1rem',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {activeRobot.imagePath && !imageError ? (
                <img
                  src={activeRobot.imagePath}
                  alt={activeRobot.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    console.error('[LoadedRobots] Image failed to load:', e.target.src);
                    setImageError(true);
                  }}
                  onLoad={() => console.log('[LoadedRobots] Image loaded successfully:', activeRobot.imagePath)}
                />
              ) : (
                <div style={{
                  width: '100px',
                  height: '100px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6c757d',
                  fontSize: '1rem',
                  fontWeight: 'bold'
                }}>
                  NO IMAGE
                </div>
              )}
            </div>
            
            <h5 className="controls-h5">{activeRobot.name}</h5>
            <p className="controls-text-muted controls-mb-2" style={{ display: 'flex', alignItems: 'center' }}>
              {activeRobot.manufacturerLogo && !logoError ? (
                <img
                  src={activeRobot.manufacturerLogo}
                  alt={`${activeRobot.manufacturer} Logo`}
                  style={{ width: '20px', height: '20px', marginRight: '5px', objectFit: 'contain' }}
                  onError={() => setLogoError(true)}
                />
              ) : (
                getLetterIcon(activeRobot.manufacturer)
              )}
              {activeRobot.manufacturer}
            </p>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <span className="controls-badge controls-badge-success">
                Active
              </span>
              <button
                onClick={() => {
                  if (viewerRef?.current?.focusOnRobot) {
                    viewerRef.current.focusOnRobot(activeRobotId, true); // true = force refocus
                  }
                }}
                className="controls-btn controls-btn-primary controls-btn-sm"
              >
                Center Camera
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadedRobots;