// src/components/Environment/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EventBus from '../../../utils/EventBus';
import humanManager from '../Human/HumanController';
import Grid from '../Grid/Grid';
import AddEnvironment from '../AddEnvironment/AddEnvironment';
import { useScene, useSceneObject, useSmartPlacement } from '../../../contexts/hooks/useScene';

const EnvironmentManager = ({ viewerRef, isPanel = false, onClose }) => {
  const { registerObject, unregisterObject } = useScene();
  const { calculateSmartPosition } = useSmartPlacement();
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [humanLoaded, setHumanLoaded] = useState(false);
  const [humanInfo, setHumanInfo] = useState(null);
  const [expandedObjects, setExpandedObjects] = useState(new Set());
  const [rotationAxis, setRotationAxis] = useState('y');
  const [humanMovementEnabled, setHumanMovementEnabled] = useState(false);
  const [inputValues, setInputValues] = useState({});
  const [humanPositions, setHumanPositions] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState({ items: [], callback: null });

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
    
    if (objectConfig.category === 'human' || objectConfig.path?.includes('/human/')) {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) return;
      
      setLoading(true);
      try {
        const position = {
          x: (Math.random() - 0.5) * 4,
          y: 0,
          z: (Math.random() - 0.5) * 4
        };
        
        const result = await humanManager.spawnHuman(
          sceneSetup.scene, 
          sceneSetup.world,
          position
        );
        
        if (result) {
          const { id, human } = result;
          
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
          
          human._unsubscribePosition = unsubscribe;
          
          const humanInstance = {
            instanceId: id,
            objectId: objectConfig.id,
            name: objectConfig.name,
            category: 'human',
            path: objectConfig.path
          };
          
          setLoadedObjects(prev => [...prev, humanInstance]);
          
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
    
    setLoading(true);
    setError(null);
    
    try {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${objectConfig.id}_${Date.now()}`;
      
      const placement = calculateSmartPosition(objectConfig.category);
      const updatedConfig = {
        ...objectConfig,
        ...placement,
        id: instanceId,
        castShadow: true
      };
      
      const object3D = await sceneSetup.loadEnvironmentObject(updatedConfig);
      
      registerObject('environment', instanceId, object3D, {
        category: objectConfig.category,
        name: objectConfig.name
      });
      
      const newObject = {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category,
        path: objectConfig.path,
        position: placement,
        rotation: { x: 0, y: 0, z: 0 },
        scale: objectConfig.defaultScale || { x: 1, y: 1, z: 1 }
      };
      
      setLoadedObjects(prev => [...prev, newObject]);
      setSuccessMessage(`${objectConfig.name} added to scene!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error loading object:', error);
      setError('Failed to load object: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    setCurrentView('objects');
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
    
    const human = humanManager.getHuman(instanceId);
    if (human) {
      if (updates.position) {
        human.setPosition(
          updates.position.x,
          updates.position.y,
          updates.position.z
        );
      }
      return;
    }
    
    const object = sceneSetup.environmentObjects.get(instanceId);
    if (!object) {
      console.error('Object not found:', instanceId);
      return;
    }
    
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
    
    object.updateMatrix();
    object.updateMatrixWorld(true);
    
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
    
    newRotation.x = object.rotation.x;
    newRotation.y = object.rotation.y;
    newRotation.z = object.rotation.z;
    
    newRotation[rotationAxis] = radians;
    
    updateObject(instanceId, { rotation: newRotation });
  };

  const removeObject = (instanceId) => {
    if (!viewerRef?.current) return;
    
    const human = humanManager.getHuman(instanceId);
    if (human) {
      if (human._unsubscribePosition) {
        human._unsubscribePosition();
      }
      
      humanManager.removeHuman(instanceId);
      setSpawnedHumans(prev => prev.filter(h => h.id !== instanceId));
      setSelectedHuman(null);
      
      setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
      
      setHumanPositions(prev => {
        const newPositions = { ...prev };
        delete newPositions[instanceId];
        return newPositions;
      });
      
      EventBus.emit('human:removed', { id: instanceId });
      return;
    }
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    sceneSetup.removeEnvironmentObject(instanceId);
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
  };

  const handleMoveHuman = (humanId) => {
    humanManager.setActiveHuman(humanId);
    setSelectedHuman(humanId);
    
    setSpawnedHumans(prev => prev.map(h => ({
      ...h,
      isActive: h.id === humanId
    })));
    
    setSuccessMessage('Human movement enabled! Use WASD to move, Shift to run.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const deleteObject = async (objectPath, objectName) => {
    try {
      const response = await fetch('/api/environment/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: objectPath })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage(`${objectName} deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.message || 'Failed to delete object');
      }
    } catch (error) {
      setError('Error deleting object: ' + error.message);
    }
  };

  const deleteCategory = async (categoryId, categoryName) => {
    const objectCount = categories.find(cat => cat.id === categoryId)?.objects.length || 0;
    
    try {
      const response = await fetch(`/api/environment/category/${categoryId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage(`Category "${categoryName}" deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
        setCurrentView('categories');
        setSelectedCategory(null);
      } else {
        setError(result.message || 'Failed to delete category');
      }
    } catch (error) {
      setError('Error deleting category: ' + error.message);
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems(new Set());
    setSelectedCategories(new Set());
  };

  const toggleItemSelection = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleCategorySelection = (categoryId) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
  };

  const deleteSelectedItems = async () => {
    const totalItems = selectedItems.size + selectedCategories.size;
    if (totalItems === 0) {
      setError('No items selected');
      return;
    }

    const itemsList = [];
    
    for (const itemPath of selectedItems) {
      const obj = selectedCategory.objects.find(o => o.path === itemPath);
      if (obj) {
        itemsList.push({ name: obj.name, type: 'object', path: obj.path });
      }
    }
    
    for (const categoryId of selectedCategories) {
      const cat = categories.find(c => c.id === categoryId);
      if (cat) {
        itemsList.push({ 
          name: cat.name, 
          type: 'category', 
          id: cat.id,
          count: cat.objects.length 
        });
      }
    }

    setDeleteConfirmData({
      items: itemsList,
      callback: async () => {
        try {
          for (const item of itemsList) {
            if (item.type === 'object') {
              await deleteObject(item.path, item.name);
            } else if (item.type === 'category') {
              await deleteCategory(item.id, item.name);
            }
          }

          setIsSelectionMode(false);
          setSelectedItems(new Set());
          setSelectedCategories(new Set());
          
          if (selectedItems.size > 0 && selectedCategory) {
            const updatedObjects = selectedCategory.objects.filter(
              obj => !itemsList.some(item => item.path === obj.path)
            );
            setSelectedCategory({ ...selectedCategory, objects: updatedObjects });
          }
          
          await scanEnvironment();
          
        } catch (error) {
          setError('Error deleting selected items: ' + error.message);
        }
      }
    });
    setShowDeleteConfirm(true);
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
          
          const isHuman = obj.category === 'human' || 
                         obj.path?.toLowerCase()?.includes('/human/') ||
                         obj.name?.toLowerCase()?.includes('soldier') ||
                         obj.name?.toLowerCase()?.includes('human');
          
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
                                
                                if (isHuman) {
                                  const human = humanManager.getHuman(obj.instanceId);
                                  if (!human) return;
                                  
                                  const currentPos = human.getPosition();
                                  const pos = {
                                    x: currentPos.x,
                                    y: currentPos.y,
                                    z: currentPos.z
                                  };
                                  
                                  if (!isNaN(numValue)) {
                                    pos[axis] = numValue;
                                    updateObject(obj.instanceId, { position: pos });
                                  }
                                  return;
                                }
                                
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
                  
                  {isHuman && (
                    <button
                      className={`controls-btn ${spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? 'controls-btn-danger' : 'controls-btn-success'} controls-btn-block controls-mb-3`}
                      onClick={() => handleMoveHuman(obj.instanceId)}
                    >
                      {spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? '🛑 Stop Human' : '🚶 Move Human'}
                    </button>
                  )}
                  
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

  const DeleteConfirmModal = () => {
    if (!showDeleteConfirm) return null;
    
    const itemCount = deleteConfirmData.items.length;
    const itemNames = deleteConfirmData.items.map(item => item.name).join(', ');
    
    return createPortal(
      <div className="controls-modal-overlay">
        <div className="controls-modal" style={{ maxWidth: '500px', minHeight: 'auto' }}>
          <div className="controls-modal-header">
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Confirm Delete</h2>
          </div>
          
          <div className="controls-modal-body" style={{ padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
              Are you sure you want to delete {itemCount} selected item{itemCount > 1 ? 's' : ''}?
            </p>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '1rem', 
              borderRadius: '4px',
              marginBottom: '1.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <strong>Items to delete:</strong>
              <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
                {deleteConfirmData.items.map((item, index) => (
                  <li key={index} style={{ marginBottom: '0.25rem' }}>
                    {item.name} {item.type === 'category' && `(${item.count} objects)`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="controls-modal-footer" style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
            padding: '1.5rem 2rem',
            borderTop: '1px solid #e0e0e0'
          }}>
            <button 
              className="controls-btn controls-btn-secondary"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmData({ items: [], callback: null });
              }}
            >
              No, Cancel
            </button>
            <button 
              className="controls-btn controls-btn-danger"
              onClick={() => {
                if (deleteConfirmData.callback) {
                  deleteConfirmData.callback();
                }
                setShowDeleteConfirm(false);
                setDeleteConfirmData({ items: [], callback: null });
              }}
            >
              Yes, Delete
            </button>
          </div>
        </div>
      </div>,
      document.body
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Environment Objects</h2>
          <button
            onClick={toggleSelectionMode}
            className="controls-btn controls-btn-sm controls-btn-outline-primary"
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.875rem'
            }}
          >
            {isSelectionMode ? 'Cancel' : 'Select'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isSelectionMode && (selectedItems.size > 0 || selectedCategories.size > 0) && (
            <button
              onClick={deleteSelectedItems}
              className="controls-btn controls-btn-danger controls-btn-sm"
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.875rem'
              }}
            >
              Delete ({selectedItems.size + selectedCategories.size})
            </button>
          )}
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
      
      {/* Main content - Use Grid component */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Grid
          categories={categories}
          selectedCategory={selectedCategory}
          isSelectionMode={isSelectionMode}
          selectedCategories={selectedCategories}
          onCategoryClick={selectCategory}
          onCategorySelect={toggleCategorySelection}
          onAddNew={() => setShowAddModal(true)}
          currentView={currentView}
          selectedItems={selectedItems}
          onItemClick={loadObject}
          onItemSelect={toggleItemSelection}
          onBackClick={goBack}
          isLoading={loading}
        />
        
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

      {/* Add Environment Modal */}
      <AddEnvironment
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(result) => {
          setShowAddModal(false);
          scanEnvironment();
          setSuccessMessage(`${result.object.name} added successfully!`);
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
        existingCategories={categories}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal />
    </div>
  );
};

export default EnvironmentManager;