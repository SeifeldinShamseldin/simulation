import React, { useState } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';

const RobotManager = ({ 
  viewerRef, 
  isPanel = false, 
  onClose,
  workspaceRobots,
  setWorkspaceRobots,
  setShowAddModal,
  activeRobotId,
  setActiveRobotId,
  setShowRobotSelection
}) => {
  const { loadRobot, isLoading } = useRobot();
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleLoadRobot = async (robot) => {
    if (!viewerRef?.current) return;
    
    setError(null);
    try {
      await loadRobot(robot.id, robot.urdfPath);
      
      setActiveRobotId(robot.id);
      setShowRobotSelection(false);
      setSuccessMessage(`${robot.name} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      EventBus.emit('robot:loaded', {
        robotId: robot.id,
        name: robot.name
      });
      
    } catch (error) {
      console.error('Error loading robot:', error);
      setError('Failed to load robot: ' + error.message);
    }
  };

  const handleRemoveRobot = (robotId) => {
    setWorkspaceRobots(prev => prev.filter(r => r.id !== robotId));
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
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>My Robots</h2>
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
      
      {/* Robot Grid - Shows added robots + Add New button */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="controls-grid controls-grid-cols-2 controls-gap-3">
          {/* Show workspace robots */}
          {workspaceRobots.map(robot => (
            <div
              key={robot.id}
              className="controls-card"
              style={{
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s'
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
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveRobot(robot.id);
                }}
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  zIndex: 2
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#c82333'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#dc3545'}
              >
                ×
              </button>
              
              <div 
                className="controls-card-body controls-text-center controls-p-4"
                onClick={() => handleLoadRobot(robot)}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{robot.icon}</div>
                <h5 className="controls-h5 controls-mb-1">{robot.name}</h5>
                <small className="controls-text-muted">{robot.manufacturer}</small>
              </div>
            </div>
          ))}
          
          {/* Add New Robot Card - Always visible */}
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
      </div>
    </div>
  );
};

export default RobotManager; 