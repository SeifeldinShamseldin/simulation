// src/components/robot/AddRobot/AddRobot.jsx - PURE UI COMPONENT with Robot Preview
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRobotWorkspace, useRobotDiscovery, useRobotLoading } from '../../../contexts/hooks/useRobot';
import { useCreateLogo } from '../../../contexts/hooks/useCreateLogo';

const RobotCard = ({ robot, manufacturer, inWorkspace, onSelect }) => {
  const {
    initializePreview,
    loadRobot: loadRobotPreview,
    cleanup
  } = useCreateLogo();
  
  const previewRef = useRef(null);
  
  useEffect(() => {
    if (previewRef.current) {
      initializePreview(previewRef.current);
      loadRobotPreview({
        ...robot,
        manufacturer
      });
    }
    
    return () => {
      cleanup();
    };
  }, [robot, manufacturer]);
  
  return (
    <div
      className="controls-card"
      onClick={() => !inWorkspace && onSelect()}
      style={{
        cursor: inWorkspace ? 'not-allowed' : 'pointer',
        opacity: inWorkspace ? 0.6 : 1,
        transition: 'all 0.2s',
        borderColor: inWorkspace ? '#6c757d' : undefined
      }}
    >
      <div className="controls-card-body">
        {/* Robot Preview */}
        <div 
          ref={previewRef}
          style={{
            width: '100%',
            height: '200px',
            marginBottom: '10px',
            borderRadius: '4px',
            overflow: 'hidden',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6'
          }}
        />
        
        <h5 className="controls-h5 controls-mb-2">{robot.name}</h5>
        <p className="controls-text-muted controls-small controls-mb-3">
          URDF • {inWorkspace ? 'Already in workspace' : 'Ready to add'}
        </p>
        <button 
          className={`controls-btn controls-btn-sm controls-btn-block ${
            inWorkspace ? 'controls-btn-secondary' : 'controls-btn-success'
          }`}
          disabled={inWorkspace}
        >
          {inWorkspace ? '✓ In Workspace' : '+ Add to Workspace'}
        </button>
      </div>
    </div>
  );
};

const AddRobot = ({ isOpen, onClose, onSuccess }) => {
  // ========== HOOK USAGE (Data Only) ==========
  const { 
    addRobot: addRobotToWorkspace, 
    isInWorkspace: isRobotInWorkspace 
  } = useRobotWorkspace();
  
  const { 
    robots: availableRobots,
    categories,
    discover: scanLocalRobots,
    hasRobots: hasAvailableRobots
  } = useRobotDiscovery();
  
  const { 
    isLoading, 
    error, 
    success: successMessage 
  } = useRobotLoading();

  // ========== UI-ONLY STATE ==========
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [localSuccess, setLocalSuccess] = useState('');

  // ========== UI EFFECTS ==========
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setSelectedCategory(null);
      setLocalError(null);
      setLocalSuccess('');
      scanLocalRobots();
    }
  }, [isOpen, scanLocalRobots]);

  // ========== UI EVENT HANDLERS ==========
  const handleSelectRobot = async (robot) => {
    try {
      // Check if robot is already in workspace
      if (isRobotInWorkspace(robot.id)) {
        setLocalError(`${robot.name} is already in your workspace`);
        return;
      }

      // Create robot data for workspace
      const robotData = {
        id: robot.id,
        name: robot.name,
        manufacturer: robot.manufacturer,
        urdfPath: robot.urdfPath
      };
      
      // Add to workspace
      const workspaceRobot = addRobotToWorkspace(robotData);
      
      setLocalSuccess(`${robot.name} added to workspace!`);
      
      // Call success callback
      if (onSuccess) {
        onSuccess(workspaceRobot);
      }
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 1000);
      
    } catch (error) {
      console.error('Error adding robot to workspace:', error);
      setLocalError('Failed to add robot to workspace');
    }
  };

  // ========== UI HELPER FUNCTIONS ==========
  const getIconForManufacturer = (name) => {
    const iconMap = {
      'kuka': '🤖',
      'ur': '🦾',
      'fanuc': '🏭',
      'abb': '⚙️',
      'yaskawa': '🔧'
    };
    return iconMap[name.toLowerCase()] || '🤖';
  };

  // ========== RENDER CONDITIONS ==========
  if (!isOpen) return null;

  // ========== PURE UI RENDER ==========
  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '800px', maxHeight: '600px' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            {selectedCategory ? `${selectedCategory.name} Robots` : 'Add Robot to Workspace'}
          </h2>
          <button 
            className="controls-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              color: '#999',
              padding: '0',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
          >
            ×
          </button>
        </div>
        
        <div className="controls-modal-body" style={{ padding: '2rem', overflowY: 'auto', maxHeight: '500px' }}>
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
          
          {isLoading && categories.length === 0 ? (
            <div className="controls-text-center controls-p-5">
              <div className="controls-spinner-border" role="status">
                <span className="controls-sr-only">Scanning robots...</span>
              </div>
              <p className="controls-mt-3">Scanning local robots...</p>
            </div>
          ) : !selectedCategory ? (
            // Show manufacturers
            <div>
              <h4 className="controls-h4 controls-mb-3">Available Manufacturers</h4>
              <div className="controls-grid controls-grid-cols-3 controls-gap-3">
                {categories.map(category => (
                  <div
                    key={category.id}
                    className="controls-card"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[AddRobot] Selecting category:', category.name);
                      setSelectedCategory(category);
                    }}
                    style={{
                      cursor: 'pointer',
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
                    <div className="controls-card-body controls-text-center controls-p-4">
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                        {getIconForManufacturer(category.name)}
                      </div>
                      <h5 className="controls-h5 controls-mb-1">{category.name}</h5>
                      <small className="controls-text-muted">{category.robots.length} robots</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Show robots from selected manufacturer
            <div>
              <button
                onClick={() => setSelectedCategory(null)}
                className="controls-btn controls-btn-link controls-p-0 controls-mb-3"
                style={{
                  textDecoration: 'none',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                ← Back to Manufacturers
              </button>
              
              <h4 className="controls-h4 controls-mb-3">
                {getIconForManufacturer(selectedCategory.name)} {selectedCategory.name} Robots
              </h4>
              
              <div className="controls-grid controls-grid-cols-2 controls-gap-3">
                {selectedCategory.robots.map(robot => (
                  <RobotCard
                    key={robot.id}
                    robot={robot}
                    manufacturer={selectedCategory.name}
                    inWorkspace={isRobotInWorkspace(robot.id)}
                    onSelect={() => handleSelectRobot({
                      ...robot,
                      manufacturer: selectedCategory.name
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddRobot;