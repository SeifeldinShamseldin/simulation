// src/components/robot/RobotManager/RobotManager.jsx - PURE UI COMPONENT
import React, { useState, useEffect, useRef } from 'react';
import { useRobotWorkspace, useRobotManagement, useRobotLoading } from '../../../contexts/hooks/useRobot';
import { useCreateLogo } from '../../../contexts/hooks/useCreateLogo';
import EventBus from '../../../utils/EventBus';

const RobotCard = ({ robot, isLoaded, onLoad, onRemove }) => {
  const {
    initializePreview,
    loadRobot: loadRobotPreview,
    cleanup
  } = useCreateLogo();
  
  const previewRef = useRef(null);
  
  useEffect(() => {
    if (previewRef.current) {
      initializePreview(previewRef.current);
      loadRobotPreview(robot);
    }
    
    return () => {
      cleanup();
    };
  }, [robot]);
  
  return (
    <div 
      className="controls-card"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        borderColor: isLoaded ? '#00a99d' : undefined,
        borderWidth: isLoaded ? '2px' : '1px'
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
        onClick={onLoad}
      >
        {/* Robot Preview */}
        <div 
          ref={previewRef}
          style={{
            width: '100%',
            height: '180px',
            marginBottom: '0.5rem',
            borderRadius: '4px',
            overflow: 'hidden',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6'
          }}
        />
        
        <h5 className="controls-h5 controls-mb-1">{robot.name}</h5>
        <small className="controls-text-muted">{robot.manufacturer}</small>
        
        {/* Status badge */}
        <div style={{ marginTop: '0.5rem' }}>
          <span 
            className={`controls-badge ${isLoaded ? 'controls-badge-success' : 'controls-badge-secondary'}`}
            style={{ fontSize: '0.7rem' }}
          >
            {isLoaded ? 'Loaded' : 'Click to Load'}
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
          onRemove();
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
};

const RobotManager = ({ 
  isPanel = false, 
  onClose,
  setShowAddModal,
  onRobotSelected
}) => {
  // ========== HOOK USAGE (Data Only) ==========
  const { 
    robots: workspaceRobots, 
    removeRobot: removeRobotFromWorkspace 
  } = useRobotWorkspace();
  
  const { 
    load: loadRobot, 
    isLoaded: isRobotLoaded,
    getRobot,
    getStatus: getRobotLoadStatus 
  } = useRobotManagement();
  
  const { 
    isLoading, 
    error, 
    success: successMessage,
    clearError 
  } = useRobotLoading();

  // ========== UI-ONLY STATE ==========
  const [localError, setLocalError] = useState(null);
  const [localSuccess, setLocalSuccess] = useState('');

  // ========== UI EVENT HANDLERS ==========
  const handleLoadRobot = async (robot) => {
    try {
      setLocalError(null);
      
      // Check if robot is already loaded in the viewer
      if (isRobotLoaded(robot.id)) {
        console.log('[RobotManager] Robot already loaded, just selecting it:', robot.id);
        
        // Navigate to controls
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
      
      setLocalSuccess(`${robot.name} loaded successfully!`);
      setTimeout(() => setLocalSuccess(''), 3000);
      
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
      setLocalError('Failed to load robot: ' + error.message);
    }
  };

  const handleRemoveRobot = (robotId) => {
    if (window.confirm('Remove this robot from your workspace?')) {
      removeRobotFromWorkspace(robotId);
      setLocalSuccess('Robot removed from workspace');
      setTimeout(() => setLocalSuccess(''), 3000);
    }
  };

  const getDisplayRobotLoadStatus = (robot) => {
    const loaded = isRobotLoaded(robot.id);
    return {
      isLoaded: loaded,
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  };

  // ========== PURE UI RENDER ==========
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
      {(error || localError) && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error || localError}
        </div>
      )}
      
      {(successMessage || localSuccess) && (
        <div className="controls-alert controls-alert-success controls-mb-3">
          {successMessage || localSuccess}
        </div>
      )}
      
      {/* Robot Grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="controls-grid controls-grid-cols-2 controls-gap-3">
          {/* Show workspace robots */}
          {workspaceRobots.map(robot => {
            const status = getDisplayRobotLoadStatus(robot);
            
            return (
              <RobotCard
                key={robot.id}
                robot={robot}
                isLoaded={status.isLoaded}
                onLoad={() => handleLoadRobot(robot)}
                onRemove={() => handleRemoveRobot(robot.id)}
              />
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