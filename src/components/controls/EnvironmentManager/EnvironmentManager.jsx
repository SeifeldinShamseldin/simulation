// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import humanController from '../../../core/Human/HumanController';
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
    
    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
      unsubscribeSelected();
    };
  }, [selectedHuman]);

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
    
    // Original loadObject code for other objects
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
        category: objectConfig.category
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

  const spawnHuman = async () => {
    if (!viewerRef?.current || humanLoaded) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    setLoading(true);
    try {
      await humanController.initialize(sceneSetup.scene, sceneSetup.world);
      setSuccessMessage('Human character spawned! Use WASD to move, Shift to run.');
    } catch (error) {
      setError('Failed to spawn human: ' + error.message);
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
    
    sceneSetup.updateEnvironmentObject(instanceId, updates);
  };

  const removeObject = (instanceId) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    sceneSetup.removeEnvironmentObject(instanceId);
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
  };

  const rotateObject = (instanceId, degrees) => {
    const radians = degrees * Math.PI / 180;
    const rotation = { x: 0, y: 0, z: 0 };
    rotation[rotationAxis] = radians;
    updateObject(instanceId, { rotation });
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
      {spawnedHumans.length > 0 && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Spawned Humans ({spawnedHumans.length})</h4>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
            Use number keys 1-{Math.min(spawnedHumans.length, 9)} to select • WASD to move • Shift to run
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {spawnedHumans.map((human, index) => (
              <button
                key={human.id}
                onClick={() => humanController.selectHuman(human.id)}
                style={{
                  padding: '0.5rem 1rem',
                  background: selectedHuman === human.id ? '#007bff' : '#fff',
                  color: selectedHuman === human.id ? '#fff' : '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s'
                }}
              >
                Human {index + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (selectedHuman) {
                humanController.removeHuman(selectedHuman);
              }
            }}
            disabled={!selectedHuman}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: selectedHuman ? '#dc3545' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedHuman ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem'
            }}
          >
            Remove Selected Human
          </button>
        </div>
      )}
    </div>
  );

  // Render objects in selected category
  const renderObjects = () => {
    if (!selectedCategory) return null;
    
    // Special UI for human category
    if (selectedCategory.id === 'human') {
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
            👤 Human Characters
          </h4>
          
          <div style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚶‍♂️</div>
            <h5 style={{ marginBottom: '1rem' }}>Spawn Human Character</h5>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              Spawn a controllable human character that can walk around the environment
            </p>
            
            <button
              onClick={async () => {
                if (!viewerRef?.current) return;
                
                const sceneSetup = viewerRef.current.getSceneSetup();
                if (!sceneSetup) return;
                
                setLoading(true);
                try {
                  // Initialize human controller if not already done
                  if (!humanLoaded) {
                    const initialized = await humanController.initialize(sceneSetup.scene, sceneSetup.world);
                    if (!initialized) {
                      throw new Error('Human controller initialization failed.');
                    }
                    setHumanLoaded(true);
                    setSuccessMessage('Human character spawned! Use WASD to move, Shift to run.');
                    setTimeout(() => setSuccessMessage(''), 5000);
                  } else {
                    setSuccessMessage('Human character is already spawned.');
                    setTimeout(() => setSuccessMessage(''), 5000);
                  }
                  
                } catch (error) {
                  console.error('Failed to initialize human:', error);
                  setError('Failed to spawn human: ' + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || humanLoaded}
              style={{
                padding: '1rem 2rem',
                background: loading ? '#ccc' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1.1rem',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!loading) e.target.style.background = '#45a049';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.target.style.background = '#4caf50';
              }}
            >
              {loading ? 'Spawning...' : '+ Spawn Human'}
            </button>
            
            <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#666' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Controls:</strong>
              </div>
              <div>WASD - Move | Shift - Run | Mouse - Look Around</div>
            </div>
          </div>
          
          {/* Show spawned humans */}
          {spawnedHumans.length > 0 && (
            <div style={{
              marginTop: '2rem',
              padding: '1rem',
              background: '#f5f5f5',
              borderRadius: '8px'
            }}>
              <h5 style={{ margin: '0 0 1rem 0' }}>Active Humans ({spawnedHumans.length})</h5>
              {spawnedHumans.map((human, index) => (
                <div key={human.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem',
                  background: '#fff',
                  marginBottom: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}>
                  <span>Human {index + 1}</span>
                  <button
                    onClick={() => {
                      humanController.removeHuman(human.id);
                      setSpawnedHumans(prev => prev.filter(h => h.id !== human.id));
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    // Normal object rendering for other categories continues below...
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
                onClick={() => loadObject(obj)}
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
                      {objectData ? `${objectData.position.x.toFixed(2)},${objectData.position.y.toFixed(2)},${objectData.position.z.toFixed(2)}` : 'Loading...'}
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
                              type="number"
                              className="controls-form-control"
                              step="0.1"
                              defaultValue={objectData?.position[axis] || 0}
                              onChange={(e) => {
                                const pos = { ...objectData.position };
                                pos[axis] = parseFloat(e.target.value) || 0;
                                updateObject(obj.instanceId, { position: pos });
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