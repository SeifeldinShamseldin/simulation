// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import humanManager from '../Human/HumanController';
import '../../../styles/ControlsTheme.css';
import fs from 'fs';
import path from 'path';

// Predefined object library
const OBJECT_LIBRARY = [
  {
    id: 'workshop_table',
    name: 'Workshop Table',
    path: '/objects/table/complete_table.dae',
    category: 'furniture',
    thumbnail: '🪑',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0,
    material: {
      type: 'phong',
      color: 0x8e9fa3,
      shininess: 100,
      specular: 0x222222
    }
  },
  {
    id: 'conveyor_belt',
    name: 'Conveyor Belt',
    path: '/objects/conveyor/conveyor.dae',
    category: 'industrial',
    thumbnail: '📦',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0.1
  },
  {
    id: 'tool_rack',
    name: 'Tool Rack',
    path: '/objects/tools/rack.dae',
    category: 'storage',
    thumbnail: '🔧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0
  },
  {
    id: 'safety_fence',
    name: 'Safety Fence',
    path: '/objects/safety/fence.dae',
    category: 'safety',
    thumbnail: '🚧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0
  },
  {
    id: 'control_panel',
    name: 'Control Panel',
    path: '/objects/controls/panel.dae',
    category: 'controls',
    thumbnail: '🎛️',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0.8
  }
];

const EnvironmentManager = ({ viewerRef, isPanel = false, onClose }) => {
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories'); // 'categories' or 'objects'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [humanLoaded, setHumanLoaded] = useState(false);
  const [humanInfo, setHumanInfo] = useState(null);
  const [expandedObjects, setExpandedObjects] = useState(new Set());
  const [rotationAxis, setRotationAxis] = useState('y'); // default rotation axis
  const [humanMovementEnabled, setHumanMovementEnabled] = useState(false);
  const [inputValues, setInputValues] = useState({});
  const [humanPositions, setHumanPositions] = useState({});

  // Scan environment directory on mount
  useEffect(() => {
    scanEnvironment();
  }, []);

  // Listen for human events
  useEffect(() => {
    const unsubscribeSpawned = EventBus.on('human:spawned', (data) => {
      setSpawnedHumans(prev => [...prev, data]);
      if (data.isActive) {
        setSelectedHuman(data.id);
      }
    });
    
    const unsubscribeRemoved = EventBus.on('human:removed', (data) => {
      setSpawnedHumans(prev => prev.filter(h => h.id !== data.id));
      if (selectedHuman === data.id) {
        setSelectedHuman(null);
      }
    });
    
    const unsubscribeSelected = EventBus.on('human:selected', (data) => {
      setSelectedHuman(data.id);
    });

    // Listen for position updates from all humans
    const unsubscribePositions = [];
    const handlePositionUpdate = (humanId) => (data) => {
      if (data.position) {
        setHumanPositions(prev => ({
          ...prev,
          [humanId]: {
            x: data.position[0],
            y: data.position[1],
            z: data.position[2]
          }
        }));
      }
    };

    // Set up position listeners for existing humans
    spawnedHumans.forEach(human => {
      const unsubscribe = EventBus.on(`human:position-update:${human.id}`, handlePositionUpdate(human.id));
      unsubscribePositions.push(unsubscribe);
    });
    
    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
      unsubscribeSelected();
      unsubscribePositions.forEach(unsubscribe => unsubscribe());
    };
  }, [selectedHuman, spawnedHumans]);

  const scanEnvironment = async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const response = await fetch('/api/environment/scan');
      const result = await response.json();
      
      if (result.success) {
        setCategories(result.categories);
      } else {
        setError('Failed to scan environment directory');
      }
    } catch (err) {
      console.error('Error scanning environment:', err);
      setError('Error scanning environment directory');
    } finally {
      setIsScanning(false);
    }
  };

  const loadObject = async (objectConfig) => {
    if (!viewerRef?.current) return;
    
    // Special handling for human objects
    if (objectConfig.category === 'human' || objectConfig.path?.includes('/human/')) {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) return;
      
      setLoading(true);
      try {
        // Random spawn position
        const position = {
          x: (Math.random() - 0.5) * 4,
          y: 0,
          z: (Math.random() - 0.5) * 4
        };
        
        // Spawn a new human
        const result = await humanManager.spawnHuman(
          sceneSetup.scene, 
          sceneSetup.world,
          position
        );
        
        if (result) {
          const { id, human } = result;
          
          // Set up position listener for this human
          const unsubscribe = EventBus.on(`human:position-update:${id}`, (data) => {
            if (data.position) {
              setHumanPositions(prev => ({
                ...prev,
                [id]: {
                  x: data.position[0],
                  y: data.position[1],
                  z: data.position[2]
                }
              }));
            }
          });
          
          // Store unsubscribe function (you might want to manage this better)
          human._unsubscribePosition = unsubscribe;
          
          // Add to loaded objects list
          const humanInstance = {
            instanceId: id,
            objectId: objectConfig.id,
            name: objectConfig.name,
            category: 'human',
            path: objectConfig.path
          };
          
          setLoadedObjects(prev => [...prev, humanInstance]);
          
          // Add to spawned humans
          setSpawnedHumans(prev => [...prev, {
            id: id,
            name: objectConfig.name,
            isActive: false
          }]);
          
          setSuccessMessage('Human spawned! Click "Move Human" to control.');
          setTimeout(() => setSuccessMessage(''), 5000);
          
          EventBus.emit('human:spawned', {
            id: id,
            name: objectConfig.name,
            isActive: false
          });
        }
      } catch (error) {
        setError('Failed to spawn human: ' + error.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    
    // Original code for non-human objects
    setLoading(true);
    setError(null);
    
    try {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${objectConfig.id}_${Date.now()}`;
      
      const object3D = await sceneSetup.loadEnvironmentObject({
        ...objectConfig,
        id: instanceId,
        castShadow: true,
        receiveShadow: true
      });
      
      setLoadedObjects(prev => [...prev, {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category,
        path: objectConfig.path
      }]);
      
      setSuccessMessage(`Added ${objectConfig.name} to scene`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (err) {
      console.error('Failed to load object:', err);
      setError(`Failed to load ${objectConfig.name}`);
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    setCurrentView('objects'); // Always change to objects view
  };

  const goBack = () => {
    setCurrentView('categories');
    setSelectedCategory(null);
  };

  const toggleObjectExpanded = (instanceId) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
      } else {
        newSet.add(instanceId);
      }
      return newSet;
    });
  };

  const updateObject = (instanceId, updates) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    // Special handling for humans
    const human = humanManager.getHuman(instanceId);
    if (human) {
      if (updates.position) {
        human.setPosition(
          updates.position.x,
          updates.position.y,
          updates.position.z
        );
      }
      // For human, we don't update rotation/scale through normal means
      return;
    }
    
    // Get the actual object from the environment objects map
    const object = sceneSetup.environmentObjects.get(instanceId);
    if (!object) {
      console.error('Object not found:', instanceId);
      return;
    }
    
    // Apply updates directly to the Three.js object
    if (updates.position) {
      object.position.set(
        updates.position.x ?? object.position.x,
        updates.position.y ?? object.position.y,
        updates.position.z ?? object.position.z
      );
    }
    
    if (updates.rotation) {
      object.rotation.set(
        updates.rotation.x ?? object.rotation.x,
        updates.rotation.y ?? object.rotation.y,
        updates.rotation.z ?? object.rotation.z
      );
    }
    
    if (updates.scale) {
      object.scale.set(
        updates.scale.x ?? object.scale.x,
        updates.scale.y ?? object.scale.y,
        updates.scale.z ?? object.scale.z
      );
    }
    
    if (updates.visible !== undefined) {
      object.visible = updates.visible;
    }
    
    // Force update matrices
    object.updateMatrix();
    object.updateMatrixWorld(true);
    
    // Also update through sceneSetup for consistency
    sceneSetup.updateEnvironmentObject(instanceId, updates);
  };

  const rotateObject = (instanceId, degrees) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    const object = sceneSetup.environmentObjects.get(instanceId);
    if (!object) return;
    
    const radians = degrees * Math.PI / 180;
    const newRotation = { x: 0, y: 0, z: 0 };
    
    // Get current rotation
    newRotation.x = object.rotation.x;
    newRotation.y = object.rotation.y;
    newRotation.z = object.rotation.z;
    
    // Set the selected axis
    newRotation[rotationAxis] = radians;
    
    updateObject(instanceId, { rotation: newRotation });
  };

  const removeObject = (instanceId) => {
    if (!viewerRef?.current) return;
    
    // Check if it's a human
    const human = humanManager.getHuman(instanceId);
    if (human) {
      // Unsubscribe from position updates
      if (human._unsubscribePosition) {
        human._unsubscribePosition();
      }
      
      humanManager.removeHuman(instanceId);
      setSpawnedHumans(prev => prev.filter(h => h.id !== instanceId));
      setSelectedHuman(null);
      
      // Remove from loaded objects
      setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
      
      // Remove position tracking
      setHumanPositions(prev => {
        const newPositions = { ...prev };
        delete newPositions[instanceId];
        return newPositions;
      });
      
      EventBus.emit('human:removed', { id: instanceId });
      return;
    }
    
    // Original code for non-human objects
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    sceneSetup.removeEnvironmentObject(instanceId);
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
  };

  const handleMoveHuman = (humanId) => {
    // Set this human as active
    humanManager.setActiveHuman(humanId);
    setSelectedHuman(humanId);
    
    // Update spawned humans to reflect active state
    setSpawnedHumans(prev => prev.map(h => ({
      ...h,
      isActive: h.id === humanId
    })));
    
    setSuccessMessage('Human movement enabled! Use WASD to move, Shift to run.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Render category boxes
  const renderCategories = () => (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => selectCategory(cat)}
            style={{
              background: '#fff',
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              padding: '2rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'center',
              ':hover': {
                borderColor: '#007bff',
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#007bff';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e0e0e0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{cat.icon}</div>
            <div style={{ fontWeight: '600', color: '#333' }}>{cat.name}</div>
            <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
              {cat.objects.length} items
            </div>
          </button>
        ))}
      </div>
      
      {/* Human controls */}
      {humanLoaded && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Human Controls</h4>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
            {humanMovementEnabled ? 
              '🟢 Movement Enabled - Use WASD to move • Shift to run' : 
              '🔴 Movement Disabled - Click "Move Human" to enable'}
          </div>
          <button
            onClick={() => removeObject('human_controller')}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Remove Human
          </button>
        </div>
      )}
    </div>
  );

  // Render objects in selected category
  const renderObjects = () => {
    if (!selectedCategory) return null;
    
    return (
      <div>
        <button
          onClick={goBack}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.5rem 1rem',
            marginBottom: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#666',
            fontSize: '1rem',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#333'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
        >
          ← Back to Categories
        </button>
        
        <h4 style={{ marginBottom: '1rem' }}>
          {selectedCategory.icon} {selectedCategory.name}
        </h4>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem'
        }}>
          {selectedCategory.objects.map(obj => (
            <div
              key={obj.id}
              style={{
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1rem',
                transition: 'all 0.2s'
              }}
            >
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{obj.name}</h5>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                {obj.type.toUpperCase()} • {(obj.size / 1024).toFixed(1)}KB
              </div>
              <button
                onClick={() => loadObject(obj)} // Same handler for ALL objects
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: loading ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = '#45a049';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = '#4caf50';
                }}
              >
                {loading ? 'Loading...' : '+ Add to Scene'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSpawnedObjects = () => {
    if (loadedObjects.length === 0) return null;
    
    return (
      <div style={{ marginTop: '2rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h3 style={{ margin: 0 }}>Spawned Objects ({loadedObjects.length})</h3>
          <button
            onClick={() => {
              loadedObjects.forEach(obj => removeObject(obj.instanceId));
            }}
            className="controls-btn controls-btn-danger controls-btn-sm"
          >
            Clear All
          </button>
        </div>
        
        {loadedObjects.map(obj => {
          const isExpanded = expandedObjects.has(obj.instanceId);
          const objectData = viewerRef.current?.getSceneSetup()?.environmentObjects.get(obj.instanceId);
          
          // More comprehensive check for human
          const isHuman = obj.category === 'human' || 
                         obj.path?.toLowerCase()?.includes('/human/') ||
                         obj.name?.toLowerCase()?.includes('soldier') ||
                         obj.name?.toLowerCase()?.includes('human');
          
          console.log('Object check:', obj.name, 'Path:', obj.path, 'Is Human:', isHuman); // Debug log
          
          return (
            <div key={obj.instanceId} className="controls-card controls-mb-3">
              <div 
                className="controls-card-header"
                onClick={() => toggleObjectExpanded(obj.instanceId)}
                style={{ cursor: 'pointer' }}
              >
                <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
                  <div>
                    <strong>{obj.name}</strong>
                    <div className="controls-text-muted controls-small">
                      {isHuman ? 
                        (() => {
                          const pos = humanPositions[obj.instanceId] || { x: 0, y: 0, z: 0 };
                          return `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}`;
                        })() :
                        objectData ? `${objectData.position.x.toFixed(2)},${objectData.position.y.toFixed(2)},${objectData.position.z.toFixed(2)}` : 'Loading...'
                      }
                      {' • '}
                      {objectData ? `${(objectData.rotation.x * 180/Math.PI).toFixed(0)}°,${(objectData.rotation.y * 180/Math.PI).toFixed(0)}°,${(objectData.rotation.z * 180/Math.PI).toFixed(0)}°` : ''}
                      {' • '}
                      {objectData ? objectData.scale.x.toFixed(2) : '1.00'}
                    </div>
                  </div>
                  <div className="controls-d-flex controls-align-items-center controls-gap-2">
                    <label className="controls-form-check controls-mb-0">
                      <input
                        type="checkbox"
                        className="controls-form-check-input"
                        checked={objectData?.visible !== false}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateObject(obj.instanceId, { visible: e.target.checked });
                        }}
                      />
                      <span className="controls-form-check-label">👁️</span>
                    </label>
                    <span>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="controls-card-body">
                  {/* Position Controls */}
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Position</label>
                    <div className="controls-row">
                      {['x', 'y', 'z'].map(axis => (
                        <div key={axis} className="controls-col-4">
                          <div className="controls-input-group controls-input-group-sm">
                            <span className="controls-input-group-text">{axis.toUpperCase()}</span>
                            <input
                              key={`${obj.instanceId}_${axis}_${humanPositions[obj.instanceId]?.[axis] || 0}`}
                              type="number"
                              className="controls-form-control"
                              step="0.1"
                              defaultValue={(() => {
                                if (isHuman) {
                                  const pos = humanPositions[obj.instanceId] || { x: 0, y: 0, z: 0 };
                                  return pos[axis].toFixed(2);
                                }
                                const currentObj = viewerRef.current?.getSceneSetup()?.environmentObjects.get(obj.instanceId);
                                return currentObj ? currentObj.position[axis].toFixed(2) : 0;
                              })()}
                              onChange={(e) => {
                                const value = e.target.value;
                                const numValue = parseFloat(value);
                                
                                // Special handling for humans
                                if (isHuman) {
                                  // Get current position from state or humanManager
                                  const human = humanManager.getHuman(obj.instanceId);
                                  if (!human) return;
                                  
                                  const currentPos = human.getPosition();
                                  const pos = {
                                    x: currentPos.x,
                                    y: currentPos.y,
                                    z: currentPos.z
                                  };
                                  
                                  // Update the specific axis
                                  if (!isNaN(numValue)) {
                                    pos[axis] = numValue;
                                    updateObject(obj.instanceId, { position: pos });
                                  }
                                  return;
                                }
                                
                                // Normal object handling
                                const sceneSetup = viewerRef.current?.getSceneSetup();
                                if (!sceneSetup) return;
                                
                                const currentObj = sceneSetup.environmentObjects.get(obj.instanceId);
                                if (!currentObj) return;
                                
                                const pos = {
                                  x: currentObj.position.x,
                                  y: currentObj.position.y,
                                  z: currentObj.position.z
                                };
                                
                                if (!isNaN(numValue)) {
                                  pos[axis] = numValue;
                                  updateObject(obj.instanceId, { position: pos });
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Scale Controls */}
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Scale</label>
                    <div className="controls-row">
                      {['x', 'y', 'z'].map(axis => (
                        <div key={axis} className="controls-col-4">
                          <div className="controls-input-group controls-input-group-sm">
                            <span className="controls-input-group-text">{axis.toUpperCase()}</span>
                            <input
                              type="number"
                              className="controls-form-control"
                              step="0.1"
                              min="0.1"
                              defaultValue={objectData?.scale[axis] || 1}
                              onChange={(e) => {
                                const scale = { ...objectData.scale };
                                scale[axis] = parseFloat(e.target.value) || 1;
                                updateObject(obj.instanceId, { scale });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Rotation Controls */}
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Rotation</label>
                    <div className="controls-btn-group controls-btn-group-sm controls-mb-2">
                      {['x', 'y', 'z'].map(axis => (
                        <button
                          key={axis}
                          className={`controls-btn ${rotationAxis === axis ? 'controls-btn-primary' : 'controls-btn-outline-primary'}`}
                          onClick={() => setRotationAxis(axis)}
                        >
                          {axis.toUpperCase()} Axis
                        </button>
                      ))}
                    </div>
                    <div className="controls-btn-group controls-btn-group-sm controls-flex-wrap">
                      {[0, 45, 90, 135, 180, 225, 270, 315, 360].map(deg => (
                        <button
                          key={deg}
                          className="controls-btn controls-btn-outline-secondary"
                          onClick={() => rotateObject(obj.instanceId, deg)}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Move Human Button - Only for human category */}
                  {isHuman && (
                    <button
                      className={`controls-btn ${spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? 'controls-btn-danger' : 'controls-btn-success'} controls-btn-block controls-mb-3`}
                      onClick={() => handleMoveHuman(obj.instanceId)}
                    >
                      {spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? '🛑 Stop Human' : '🚶 Move Human'}
                    </button>
                  )}
                  
                  {/* Remove Button */}
                  <button
                    className="controls-btn controls-btn-danger controls-btn-sm controls-w-100"
                    onClick={() => removeObject(obj.instanceId)}
                  >
                    Remove Object
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const removeHuman = (humanId) => {
    // Remove using standard environment object removal
    removeObject(humanId);
    
    // Update spawned humans list
    setSpawnedHumans(prev => prev.filter(h => h.id !== humanId));
    
    // Clear selection if this was the selected human
    if (selectedHuman === humanId) {
      setSelectedHuman(null);
    }
    
    // Emit removal event
    EventBus.emit('human:removed', { id: humanId });
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
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Environment Objects</h2>
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
          onMouseEnter={(e) => {
            e.target.style.background = '#e9ecef';
            e.target.style.color = '#495057';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'none';
            e.target.style.color = '#6c757d';
          }}
        >
          ×
        </button>
      </div>
      
      {/* Messages */}
      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}
      
      {successMessage && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {successMessage}
        </div>
      )}
      
      {/* Human info */}
      {humanLoaded && humanInfo && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#e3f2fd',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          <strong>👤 Human:</strong> {humanInfo.isRunning ? '🏃 Running' : '🚶 Walking'} at 
          X: {humanInfo.position[0].toFixed(1)}, 
          Z: {humanInfo.position[2].toFixed(1)}
        </div>
      )}
      
      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {currentView === 'categories' ? renderCategories() : renderObjects()}
        {renderSpawnedObjects()}
      </div>
      
      {/* Refresh button */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e0e0e0'
      }}>
        <button
          onClick={scanEnvironment}
          disabled={isScanning}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: isScanning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!isScanning) {
              e.currentTarget.style.background = '#e0e0e0';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f5f5f5';
          }}
        >
          {isScanning ? '⏳' : '🔄'} Refresh Objects
        </button>
      </div>
    </div>
  );
};

export default EnvironmentManager;