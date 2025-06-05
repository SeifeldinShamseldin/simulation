import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorld } from '../../contexts/WorldContext';
import { useRobot } from '../../contexts/RobotContext';
import { useScene } from '../../contexts/hooks/useScene';
import EventBus from '../../utils/EventBus';
import * as THREE from 'three';

const WorldManager = ({ viewerRef, isOpen, onClose }) => {
  const { 
    worlds, 
    currentWorldId, 
    isLoading, 
    error,
    saveWorld,
    loadWorld,
    deleteWorld,
    exportWorld,
    importWorld
  } = useWorld();
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [worldName, setWorldName] = useState('');
  const [saveError, setSaveError] = useState(null);
  
  const handleSaveWorld = async () => {
    if (!worldName.trim()) {
      setSaveError('Please enter a world name');
      return;
    }
    
    try {
      // Gather current scene data
      const sceneData = await gatherSceneData();
      await saveWorld(worldName, sceneData);
      
      setShowSaveModal(false);
      setWorldName('');
      setSaveError(null);
    } catch (error) {
      setSaveError(error.message);
    }
  };
  
  const gatherSceneData = async () => {
    if (!viewerRef?.current) {
      throw new Error('Viewer not initialized');
    }
    
    const viewer = viewerRef.current;
    const sceneSetup = viewer.getSceneSetup?.() || viewer.sceneRef?.current;
    const robotManager = viewer.robotManagerRef?.current;
    
    if (!sceneSetup) {
      throw new Error('Scene not properly initialized');
    }
    
    // Get camera data
    const camera = sceneSetup.camera ? {
      position: sceneSetup.camera.position.toArray(),
      rotation: sceneSetup.camera.rotation.toArray(),
      fov: sceneSetup.camera.fov || 60
    } : null;
    
    // Get robots data
    const robots = [];
    if (robotManager) {
      const allRobots = robotManager.getAllRobots();
      allRobots.forEach((robotData, robotId) => {
        if (robotData.model) {
          robots.push({
            id: robotId,
            name: robotData.name,
            urdfPath: robotData.urdfPath,
            position: robotData.container ? 
              robotData.container.position.toArray() : 
              [0, 0, 0],
            rotation: robotData.container ?
              robotData.container.rotation.toArray() :
              [0, 0, 0],
            jointValues: robotManager.getJointValues(robotId),
            isActive: robotData.isActive
          });
        }
      });
    }
    
    // Get environment objects
    const environment = [];
    if (sceneSetup.environmentObjects) {
      sceneSetup.environmentObjects.forEach((obj, id) => {
        environment.push({
          id: id,
          path: obj.userData?.path || '',
          category: obj.userData?.category || 'uncategorized',
          position: obj.position.toArray(),
          rotation: obj.rotation.toArray(),
          scale: obj.scale.toArray(),
          material: obj.userData?.material || {},
          visible: obj.visible
        });
      });
    }
    
    return {
      camera,
      scene: {
        camera,
        lighting: {
          ambientIntensity: 0.5,
          directionalIntensity: 0.8
        },
        background: sceneSetup.backgroundColor || '#f5f5f5',
        upAxis: '+Z'
      },
      robots,
      environment,
      humans: []
    };
  };
  
  const handleLoadWorld = async (worldId) => {
    if (!viewerRef?.current) return;
    
    const viewer = viewerRef.current;
    const sceneSetup = viewer.getSceneSetup?.() || viewer.sceneRef?.current;
    const robotManager = viewer.robotManagerRef?.current;
    
    if (!sceneSetup || !robotManager) {
      console.error('Scene or robot manager not initialized');
      return;
    }
    
    const callbacks = {
      clearScene: async () => {
        console.log('Clearing scene...');
        // Clear robots
        robotManager.clearAllRobots();
        
        // Clear environment
        sceneSetup.clearEnvironment();
        
        // Clear trajectories
        EventBus.emit('world:clearing');
      },
      
      loadRobot: async (robotId, urdfPath, options) => {
        console.log('Loading robot:', robotId, urdfPath, options);
        try {
          const robot = await robotManager.loadRobot(robotId, urdfPath, options);
          
          // Apply position after loading
          if (robot && options.position) {
            const container = robotManager.robots.get(robotId)?.container;
            if (container) {
              container.position.set(
                options.position[0],
                options.position[1],
                options.position[2]
              );
            }
          }
          
          return robot;
        } catch (error) {
          console.error('Error loading robot:', error);
          return null;
        }
      },
      
      loadEnvironmentObject: async (config) => {
        console.log('Loading environment object:', config);
        // Skip objects without valid paths
        if (!config.path || config.path.trim() === '') {
          console.warn('Skipping object without path');
          return null;
        }
        
        try {
          // Convert array positions back to objects
          const loadConfig = {
            ...config,
            position: {
              x: config.position[0],
              y: config.position[1],
              z: config.position[2]
            },
            rotation: {
              x: config.rotation[0],
              y: config.rotation[1],
              z: config.rotation[2]
            },
            scale: {
              x: config.scale[0],
              y: config.scale[1],
              z: config.scale[2]
            }
          };
          
          return await sceneSetup.loadEnvironmentObject(loadConfig);
        } catch (error) {
          console.error('Error loading environment object:', error);
          return null;
        }
      },
      
      loadHuman: async (humanData) => {
        console.log('Loading human:', humanData);
        // TODO: Implement human loading
      },
      
      setCamera: (cameraData) => {
        console.log('Setting camera:', cameraData);
        if (cameraData && cameraData.position && sceneSetup.camera) {
          sceneSetup.camera.position.fromArray(cameraData.position);
          if (cameraData.rotation) {
            sceneSetup.camera.rotation.fromArray(cameraData.rotation);
          }
          if (cameraData.fov) {
            sceneSetup.camera.fov = cameraData.fov;
            sceneSetup.camera.updateProjectionMatrix();
          }
          sceneSetup.controls.update();
        }
      },
      
      setSceneSettings: (settings) => {
        console.log('Setting scene settings:', settings);
        if (settings.background && sceneSetup.scene) {
          sceneSetup.scene.background = new THREE.Color(settings.background);
        }
        if (settings.upAxis && sceneSetup.setUpAxis) {
          sceneSetup.setUpAxis(settings.upAxis);
        }
      }
    };
    
    try {
      await loadWorld(worldId, callbacks);
      
      // Force a re-render of the scene
      if (sceneSetup.renderer && sceneSetup.scene && sceneSetup.camera) {
        sceneSetup.renderer.render(sceneSetup.scene, sceneSetup.camera);
      }
      
    } catch (error) {
      console.error('Error in handleLoadWorld:', error);
    }
  };
  
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      importWorld(file);
      e.target.value = '';
    }
  };
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>World Manager</h2>
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
        
        <div className="controls-modal-body" style={{ padding: '2rem' }}>
          {error && (
            <div className="controls-alert controls-alert-danger controls-mb-3">
              {error}
            </div>
          )}
          
          {/* Actions */}
          <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-4">
            <div className="controls-btn-group">
              <button 
                className="controls-btn controls-btn-success"
                onClick={() => setShowSaveModal(true)}
                disabled={isLoading}
              >
                + Save Current World
              </button>
              <label className="controls-btn controls-btn-primary" style={{ marginBottom: 0 }}>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                  disabled={isLoading}
                />
                Import World
              </label>
            </div>
            
            <div className="controls-text-muted">
              {worlds.length} world{worlds.length !== 1 ? 's' : ''} saved
            </div>
          </div>
          
          {/* Worlds List */}
          <div className="controls-list">
            {worlds.length === 0 ? (
              <div className="controls-text-center controls-p-5 controls-text-muted">
                No saved worlds yet. Save your current setup to get started!
              </div>
            ) : (
              worlds.map(world => (
                <div 
                  key={world.id}
                  className={`controls-list-item ${world.id === currentWorldId ? 'controls-active' : ''}`}
                >
                  <div className="controls-list-item-content">
                    <h5 className="controls-list-item-title">
                      {world.name}
                      {world.id === currentWorldId && (
                        <span className="controls-badge controls-badge-primary controls-ml-2">Current</span>
                      )}
                    </h5>
                    <div className="controls-text-muted">
                      Created: {new Date(world.createdAt).toLocaleDateString()}
                    </div>
                    <div className="controls-d-flex controls-gap-3 controls-mt-2">
                      <span className="controls-badge controls-badge-secondary">
                        {world.robotCount} Robot{world.robotCount !== 1 ? 's' : ''}
                      </span>
                      <span className="controls-badge controls-badge-secondary">
                        {world.objectCount} Object{world.objectCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  
                  <div className="controls-list-item-actions">
                    <button 
                      className="controls-btn controls-btn-primary controls-btn-sm"
                      onClick={() => handleLoadWorld(world.id)}
                      disabled={isLoading}
                    >
                      Load
                    </button>
                    <button 
                      className="controls-btn controls-btn-info controls-btn-sm"
                      onClick={() => exportWorld(world.id)}
                    >
                      Export
                    </button>
                    <button 
                      className="controls-btn controls-btn-danger controls-btn-sm"
                      onClick={() => deleteWorld(world.id)}
                      disabled={isLoading}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Save World Modal */}
      {showSaveModal && (
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '500px' }}>
            <div className="controls-modal-header">
              <h3 style={{ margin: 0 }}>Save World</h3>
              <button 
                className="controls-close"
                onClick={() => {
                  setShowSaveModal(false);
                  setWorldName('');
                  setSaveError(null);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="controls-modal-body" style={{ padding: '2rem' }}>
              {saveError && (
                <div className="controls-alert controls-alert-danger controls-mb-3">
                  {saveError}
                </div>
              )}
              
              <div className="controls-form-group">
                <label className="controls-form-label">World Name:</label>
                <input
                  type="text"
                  className="controls-form-control"
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  placeholder="Enter a name for this world"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="controls-modal-footer">
              <button 
                className="controls-btn controls-btn-secondary"
                onClick={() => {
                  setShowSaveModal(false);
                  setWorldName('');
                  setSaveError(null);
                }}
              >
                Cancel
              </button>
              <button 
                className="controls-btn controls-btn-primary"
                onClick={handleSaveWorld}
                disabled={isLoading || !worldName.trim()}
              >
                {isLoading ? 'Saving...' : 'Save World'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default WorldManager; 