// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import humanController from '../../../core/Human/HumanController';
import '../../../styles/ControlsTheme.css';

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

const EnvironmentManager = ({ viewerRef, isOpen, onClose }) => {
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editingObject, setEditingObject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [humanLoaded, setHumanLoaded] = useState(false);
  const [humanInfo, setHumanInfo] = useState(null);
  
  // Form state for editing
  const [editForm, setEditForm] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true
  });

  // Scan environment directory on mount and when refreshed
  useEffect(() => {
    if (isOpen) {
      scanEnvironment();
    }
  }, [isOpen]);

  // Listen for external object additions/removals
  useEffect(() => {
    const unsubscribeAdded = EventBus.on('scene:object-added', (data) => {
      if (data.type === 'environment' && !loadedObjects.find(obj => obj.instanceId === data.objectId)) {
        console.log('Environment object added externally:', data);
      }
    });
    
    const unsubscribeRemoved = EventBus.on('scene:object-removed', (data) => {
      if (data.type === 'environment') {
        setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== data.objectId));
      }
    });
    
    return () => {
      unsubscribeAdded();
      unsubscribeRemoved();
    };
  }, [loadedObjects]);

  // Add useEffect for human events
  useEffect(() => {
    const unsubscribeReady = EventBus.on('human:ready', () => {
      setHumanLoaded(true);
    });
    
    const unsubscribePosition = EventBus.on('human:position-update', (data) => {
      setHumanInfo(data);
    });
    
    return () => {
      unsubscribeReady();
      unsubscribePosition();
    };
  }, []);

  // Scan environment directory for available objects
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

  // Get filtered objects based on selected category
  const getFilteredObjects = () => {
    if (selectedCategory === 'all') {
      return categories.flatMap(cat => 
        cat.objects.map(obj => ({ ...obj, category: cat.id, categoryName: cat.name, icon: cat.icon }))
      );
    }
    
    const category = categories.find(cat => cat.id === selectedCategory);
    if (!category) return [];
    
    return category.objects.map(obj => ({ 
      ...obj, 
      category: category.id, 
      categoryName: category.name,
      icon: category.icon 
    }));
  };

  // Load object into scene
  const loadObject = async (objectConfig) => {
    if (!viewerRef?.current) return;
    
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
        receiveShadow: true,
        material: getMaterialForCategory(objectConfig.category)
      });
      
      const actualPosition = object3D.position;
      const actualRotation = object3D.rotation;
      
      setLoadedObjects(prev => [...prev, {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category,
        categoryName: objectConfig.categoryName,
        icon: objectConfig.icon,
        type: objectConfig.type,
        position: { 
          x: actualPosition.x, 
          y: actualPosition.y, 
          z: actualPosition.z 
        },
        rotation: { 
          x: actualRotation.x, 
          y: actualRotation.y, 
          z: actualRotation.z 
        },
        scale: { x: 1, y: 1, z: 1 },
        visible: true
      }]);
      
    } catch (err) {
      console.error('Failed to load object:', err);
      setError(`Failed to load ${objectConfig.name}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete object file from server
  const deleteObjectFile = async (objectConfig) => {
    if (!confirm(`Are you sure you want to permanently delete "${objectConfig.name}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      const response = await fetch('/api/environment/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: objectConfig.path })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || `Server error: ${response.status}`);
      }
      
      if (result.success) {
        // Refresh the environment scan
        await scanEnvironment();
        
        // Show success message
        setSuccessMessage(`Successfully deleted: ${objectConfig.name}`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.message || 'Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      setError(`Error deleting file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get material configuration based on category
  const getMaterialForCategory = (category) => {
    const materials = {
      furniture: {
        type: 'phong',
        color: 0x8b6f47,
        shininess: 30,
        specular: 0x222222
      },
      electricalhazard: {
        type: 'phong',
        color: 0xffff00,
        shininess: 100,
        emissive: 0x444400,
        emissiveIntensity: 0.3
      },
      mechanicalhazard: {
        type: 'standard',
        color: 0x666666,
        metalness: 0.8,
        roughness: 0.2
      },
      safetysign: {
        type: 'basic',
        color: 0xff0000
      }
    };
    
    return materials[category] || {
      type: 'phong',
      color: 0x888888,
      shininess: 50
    };
  };

  // Remove object from scene
  const removeObject = (instanceId) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    sceneSetup.removeEnvironmentObject(instanceId);
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
    
    if (editingObject?.instanceId === instanceId) {
      setEditingObject(null);
    }
  };

  // Update object properties
  const updateObject = () => {
    if (!viewerRef?.current || !editingObject) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    sceneSetup.updateEnvironmentObject(editingObject.instanceId, editForm);
    
    setLoadedObjects(prev => prev.map(obj => 
      obj.instanceId === editingObject.instanceId 
        ? { ...obj, ...editForm }
        : obj
    ));
    
    setEditingObject(null);
  };

  // Handle form input change
  const handleFormChange = (property, axis, value) => {
    setEditForm(prev => ({
      ...prev,
      [property]: {
        ...prev[property],
        [axis]: parseFloat(value) || 0
      }
    }));
  };

  // Start editing an object
  const startEdit = (object) => {
    setEditingObject(object);
    setEditForm({
      position: { ...object.position },
      rotation: { ...object.rotation },
      scale: { ...object.scale },
      visible: object.visible
    });
  };

  // Toggle visibility
  const toggleVisibility = (instanceId) => {
    const object = loadedObjects.find(obj => obj.instanceId === instanceId);
    if (!object || !viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    const newVisibility = !object.visible;
    
    sceneSetup.updateEnvironmentObject(instanceId, { visible: newVisibility });
    
    setLoadedObjects(prev => prev.map(obj => 
      obj.instanceId === instanceId 
        ? { ...obj, visible: newVisibility }
        : obj
    ));
  };

  // Clear all objects
  const clearAll = () => {
    if (!viewerRef?.current) return;
    
    if (confirm('Remove all environment objects?')) {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) return;
      
      sceneSetup.clearEnvironment();
      setLoadedObjects([]);
      setEditingObject(null);
    }
  };

  // Add spawnHuman function
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

  if (!isOpen) return null;

  const filteredObjects = getFilteredObjects();

  return (
    <div className="controls-modal-overlay" onClick={onClose}>
      <div className="controls-modal" style={{ maxWidth: '1200px' }} onClick={(e) => e.stopPropagation()}>
        <div className="controls-modal-header">
          <h3 className="controls-h3 controls-mb-0">Environment Manager</h3>
          <button 
            className="controls-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="controls-modal-body">
          {error && (
            <div className="controls-alert controls-alert-danger controls-mb-3">
              {error}
              <button 
                className="controls-close controls-float-right"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </div>
          )}

          {successMessage && (
            <div className="controls-alert controls-alert-success controls-mb-3">
              {successMessage}
              <button 
                className="controls-close controls-float-right"
                onClick={() => setSuccessMessage('')}
              >
                ×
              </button>
            </div>
          )}

          {/* Category Filter */}
          <div className="controls-pills controls-mb-3">
            <button
              className={`controls-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Categories
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`controls-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
            <button
              className="controls-pill controls-pill-refresh"
              onClick={scanEnvironment}
              disabled={isScanning}
              title="Rescan directory"
            >
              {isScanning ? '⏳' : '🔄'} Refresh
            </button>
          </div>

          {/* Object Library */}
          <div className="controls-mb-4">
            <h4 className="controls-h4 controls-mb-3">Available Objects ({filteredObjects.length})</h4>
            {filteredObjects.length === 0 ? (
              <div className="controls-text-center controls-p-4">
                <p className="controls-text-muted">No objects found in this category</p>
              </div>
            ) : (
              <div className="controls-grid controls-grid-cols-4" style={{ gap: '1rem' }}>
                {filteredObjects.map(obj => (
                  <div key={obj.id} className="controls-card">
                    <div className="controls-card-body">
                      <div className="controls-card-icon" style={{ fontSize: '2rem' }}>
                        {obj.icon}
                      </div>
                      <h5 className="controls-card-title">{obj.name}</h5>
                      <div className="controls-text-muted controls-text-sm">
                        <div>{obj.categoryName}</div>
                        <div>{obj.type.toUpperCase()} • {(obj.size / 1024).toFixed(1)}KB</div>
                      </div>
                      <div className="controls-card-actions" style={{ 
                        display: 'flex', 
                        gap: '0.5rem', 
                        marginTop: '0.5rem' 
                      }}>
                        <button 
                          className="controls-btn controls-btn-success controls-btn-sm"
                          onClick={() => loadObject(obj)}
                          disabled={loading}
                          style={{ flex: 1 }}
                        >
                          + Add to Scene
                        </button>
                        <button 
                          className="controls-btn controls-btn-danger controls-btn-sm"
                          onClick={() => deleteObjectFile(obj)}
                          disabled={loading}
                          title="Delete file permanently"
                          style={{ 
                            width: '40px',
                            padding: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Loaded Objects */}
          {loadedObjects.length > 0 && (
            <div className="controls-section">
              <div className="controls-section-header">
                <h4 className="controls-h4 controls-mb-0">
                  Scene Objects ({loadedObjects.length})
                </h4>
                <button 
                  className="controls-btn controls-btn-danger controls-btn-sm"
                  onClick={clearAll}
                >
                  Clear All
                </button>
              </div>
              
              <div className="controls-list">
                {loadedObjects.map(obj => (
                  <div key={obj.instanceId} className="controls-list-item">
                    <span className="controls-list-item-icon">
                      {obj.icon}
                    </span>
                    <div className="controls-list-item-content">
                      <h5 className="controls-list-item-title">{obj.name}</h5>
                      <div className="controls-text-muted controls-text-sm">
                        {obj.categoryName} • {obj.type.toUpperCase()}
                      </div>
                      <span className={`controls-badge ${obj.visible ? 'controls-badge-success' : 'controls-badge-secondary'}`}>
                        {obj.visible ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                    <div className="controls-list-item-actions">
                      <button 
                        className="controls-btn controls-btn-light controls-btn-sm"
                        onClick={() => toggleVisibility(obj.instanceId)}
                        title="Toggle Visibility"
                      >
                        {obj.visible ? '👁️' : '🚫'}
                      </button>
                      <button 
                        className="controls-btn controls-btn-warning controls-btn-sm"
                        onClick={() => startEdit(obj)}
                        title="Edit Properties"
                      >
                        ✏️
                      </button>
                      <button 
                        className="controls-btn controls-btn-danger controls-btn-sm"
                        onClick={() => removeObject(obj.instanceId)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!humanLoaded && (
            <div className="controls-alert controls-alert-info controls-mb-3">
              <button 
                className="controls-btn controls-btn-primary"
                onClick={spawnHuman}
                disabled={loading}
              >
                🚶 Spawn Human Character
              </button>
              <small className="controls-text-muted controls-ml-2">
                WASD to move, Shift to run
              </small>
            </div>
          )}

          {humanLoaded && humanInfo && (
            <div className="controls-card controls-mb-3">
              <div className="controls-card-body">
                <h5>👤 Human Character</h5>
                <div className="controls-text-sm">
                  Position: X: {humanInfo.position[0].toFixed(2)}, 
                  Y: {humanInfo.position[1].toFixed(2)}, 
                  Z: {humanInfo.position[2].toFixed(2)}
                </div>
                <div className="controls-text-sm">
                  Status: {humanInfo.isRunning ? '🏃 Running' : '🚶 Walking'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingObject && (
        <div className="controls-modal-overlay" onClick={() => setEditingObject(null)}>
          <div className="controls-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="controls-modal-header">
              <h3 className="controls-h3 controls-mb-0">Edit {editingObject.name}</h3>
              <button 
                className="controls-close"
                onClick={() => setEditingObject(null)}
              >
                ×
              </button>
            </div>

            <div className="controls-modal-body">
              {/* Position */}
              <div className="controls-form-group">
                <label className="controls-form-label">Position</label>
                <div className="controls-grid controls-grid-cols-3">
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.position.x}
                    onChange={(e) => handleFormChange('position', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.position.y}
                    onChange={(e) => handleFormChange('position', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.position.z}
                    onChange={(e) => handleFormChange('position', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>

              {/* Rotation */}
              <div className="controls-form-group">
                <label className="controls-form-label">Rotation (radians)</label>
                <div className="controls-grid controls-grid-cols-3">
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.rotation.x}
                    onChange={(e) => handleFormChange('rotation', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.rotation.y}
                    onChange={(e) => handleFormChange('rotation', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    value={editForm.rotation.z}
                    onChange={(e) => handleFormChange('rotation', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>

              {/* Scale */}
              <div className="controls-form-group">
                <label className="controls-form-label">Scale</label>
                <div className="controls-grid controls-grid-cols-3">
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.x}
                    onChange={(e) => handleFormChange('scale', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.y}
                    onChange={(e) => handleFormChange('scale', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.z}
                    onChange={(e) => handleFormChange('scale', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>
            </div>

            <div className="controls-modal-footer">
              <button 
                onClick={() => setEditingObject(null)}
                className="controls-btn controls-btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={updateObject}
                className="controls-btn controls-btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvironmentManager;