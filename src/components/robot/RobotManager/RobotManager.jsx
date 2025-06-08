import React, { useState } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import { useViewer } from '../../../contexts/ViewerContext';
import EventBus from '../../../utils/EventBus';

const RobotManager = ({ 
  isPanel = false, 
  onClose,
  setShowAddModal,
  onRobotSelected
}) => {
  const {
    workspaceRobots,
    workspaceCount,
    hasWorkspaceRobots,
    isLoading,
    error,
    loadRobot,
    removeRobotFromWorkspace,
    isRobotLoaded,
    getRobotStatus,
    clearError
  } = useRobot();
  const { viewerInstance } = useViewer();
  const [successMessage, setSuccessMessage] = useState('');

  const handleLoadRobot = async (robot) => {
    if (!viewerInstance) {
      setSuccessMessage('Viewer not ready');
      return;
    }
    
    try {
      clearError();
      
      const status = getRobotStatus(robot.id);
      
      if (status.isLoaded) {
        console.log('[RobotManager] Robot already loaded, selecting:', robot.id);
        if (onRobotSelected) {
          onRobotSelected(robot.id);
        }
        return;
      }
      
      console.log('[RobotManager] Loading robot:', robot);
      
      await loadRobot(robot.id, robot.urdfPath, {
        position: { x: 0, y: 0, z: 0 },
        makeActive: true,
        clearOthers: false
      });
      
      setSuccessMessage(`${robot.name} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      if (onRobotSelected) {
        onRobotSelected(robot.id);
      }
      
      EventBus.emit('robot:workspace-robot-loaded', {
        robotId: robot.id,
        name: robot.name
      });
      
    } catch (error) {
      console.error('[RobotManager] Error loading robot:', error);
      setSuccessMessage('Failed to load robot');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleRemoveRobot = (robotId) => {
    if (window.confirm('Remove this robot from your workspace?')) {
      removeRobotFromWorkspace(robotId);
      setSuccessMessage('Robot removed from workspace');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
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
          My Robots ({workspaceCount})
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
          {/* Workspace Robots */}
          {workspaceRobots.map(robot => {
            const status = getRobotStatus(robot.id);
            
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
                  
                  {/* Status Badge */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <span 
                      className={`controls-badge ${
                        status.isActive ? 'controls-badge-success' : 
                        status.isLoaded ? 'controls-badge-info' : 
                        'controls-badge-secondary'
                      }`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {status.isActive ? 'Active' : 
                       status.isLoaded ? 'Loaded' : 
                       'Click to Load'}
                    </span>
                  </div>
                </div>
                
                {/* Remove Button */}
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
        
        {/* Empty State */}
        {!hasWorkspaceRobots && (
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
      
      {/* Loading Overlay */}
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