import React, { useState } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import EventBus from '../../../utils/EventBus';

const RobotManager = ({ 
  isPanel = false, 
  onClose,
  setShowAddModal,
  onRobotSelected
}) => {
  const { loadRobot, isLoading, isRobotLoaded } = useRobot();
  const { workspaceRobots, removeRobotFromWorkspace } = useWorkspace();
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleLoadRobot = async (robot) => {
    try {
      setError(null);
      
      // Check if robot is already loaded in the viewer
      if (isRobotLoaded(robot.id)) {
        console.log('[RobotManager] Robot already loaded, just selecting it:', robot.id);
        // Robot already loaded, just navigate to controls
        if (onRobotSelected) {
          onRobotSelected(robot.id);
        }
        return;
      }
      
      console.log('[RobotManager] Loading robot:', robot);
      
      // Load robot into the viewer
      await loadRobot(robot.id, robot.urdfPath, {
        position: { x: 0, y: 0, z: 0 },
        makeActive: true,
        clearOthers: false
      });
      
      setSuccessMessage(`${robot.name} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      // Navigate to robot controls
      if (onRobotSelected) {
        onRobotSelected(robot.id);
      }
      
      EventBus.emit('robot:workspace-robot-loaded', {
        robotId: robot.id,
        name: robot.name
      });
      
    } catch (error) {
      console.error('[RobotManager] Error loading robot:', error);
      setError('Failed to load robot: ' + error.message);
    }
  };

  const handleRemoveRobot = (robotId) => {
    if (window.confirm('Remove this robot from your workspace?')) {
      removeRobotFromWorkspace(robotId);
      setSuccessMessage('Robot removed from workspace');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const getRobotLoadStatus = (robot) => {
    const loaded = isRobotLoaded(robot.id);
    return {
      isLoaded: loaded,
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #dee2e6'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
          My Robots ({workspaceRobots.length})
        </h2>
        {isPanel && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.8rem',
              cursor: 'pointer',
              color: '#6c757d',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              lineHeight: 1
            }}
          >
            ×
          </button>
        )}
      </div>
      
      {/* Messages */}
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="controls-alert controls-alert-success controls-mb-3">
          {successMessage}
        </div>
      )}
      
      {/* Robot Grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="controls-grid controls-grid-cols-2 controls-gap-3">
          {/* Show workspace robots */}
          {workspaceRobots.map(robot => {
            const status = getRobotLoadStatus(robot);
            
            return (
              <div 
                key={robot.id}
                className="controls-card"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  borderColor: status.isLoaded ? '#00a99d' : undefined,
                  borderWidth: status.isLoaded ? '2px' : '1px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div 
                  className="controls-card-body controls-text-center controls-p-4"
                  onClick={() => handleLoadRobot(robot)}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{robot.icon}</div>
                  <h5 className="controls-h5 controls-mb-1">{robot.name}</h5>
                  <small className="controls-text-muted">{robot.manufacturer}</small>
                  
                  {/* Status badge */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <span 
                      className={`controls-badge ${status.isLoaded ? 'controls-badge-success' : 'controls-badge-secondary'}`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {status.statusText}
                    </span>
                  </div>
                </div>
                
                {/* Remove button */}
                <button
                  className="controls-btn controls-btn-danger controls-btn-sm"
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    opacity: 0,
                    transition: 'opacity 0.2s'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveRobot(robot.id);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0';
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          
          {/* Add New Robot Card */}
          <div
            className="controls-card"
            onClick={() => setShowAddModal(true)}
            style={{
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: '2px',
              borderColor: '#00a99d',
              background: '#fff',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#008077';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              e.currentTarget.style.background = '#f0fffe';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#00a99d';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.background = '#fff';
            }}
          >
            <div className="controls-card-body controls-text-center controls-p-4">
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem', color: '#00a99d' }}>+</div>
              <h5 className="controls-h5 controls-mb-1">Add New</h5>
              <small className="controls-text-muted">Robot</small>
            </div>
          </div>
        </div>
        
        {/* Empty state */}
        {workspaceRobots.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#6c757d'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🤖</div>
            <h3>No Robots Added Yet</h3>
            <p>Click "Add New Robot" to get started with your first robot.</p>
            <button
              className="controls-btn controls-btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              Add Your First Robot
            </button>
          </div>
        )}
      </div>
      
      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="controls-spinner-border" role="status">
            <span className="controls-sr-only">Loading robot...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RobotManager;