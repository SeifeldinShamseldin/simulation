// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';

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

const EnvironmentManager = ({ viewerRef, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editingObject, setEditingObject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state for editing
  const [editForm, setEditForm] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true
  });

  // Get unique categories
  const categories = ['all', ...new Set(OBJECT_LIBRARY.map(obj => obj.category))];

  // Filter objects by category
  const filteredObjects = selectedCategory === 'all' 
    ? OBJECT_LIBRARY 
    : OBJECT_LIBRARY.filter(obj => obj.category === selectedCategory);

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
        position: objectConfig.groundOffset ? {
          x: 0,
          y: objectConfig.groundOffset,
          z: 0
        } : undefined
      });
      
      const actualPosition = object3D.position;
      const actualRotation = object3D.rotation;
      
      setLoadedObjects(prev => [...prev, {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category,
        thumbnail: objectConfig.thumbnail,
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
        scale: { ...objectConfig.defaultScale },
        groundOffset: objectConfig.groundOffset,
        visible: true
      }]);
      
    } catch (err) {
      console.error('Failed to load object:', err);
      setError(`Failed to load ${objectConfig.name}`);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className={`controls-section ${compact ? 'controls-compact' : ''}`}>
      {/* Toggle Button */}
      <button 
        className="controls-btn controls-btn-info controls-btn-block"
        onClick={() => setIsOpen(!isOpen)}
        title="Environment Objects"
      >
        🏭 Environment Objects
        {loadedObjects.length > 0 && (
          <span className="controls-badge controls-badge-light controls-ml-2">
            {loadedObjects.length}
          </span>
        )}
      </button>

      {/* Manager Panel */}
      {isOpen && (
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '900px' }}>
            <div className="controls-modal-header">
              <h3 className="controls-h3 controls-mb-0">Environment Objects</h3>
              <button 
                className="controls-close"
                onClick={() => setIsOpen(false)}
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

              {/* Category Filter */}
              <div className="controls-pills controls-mb-3">
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`controls-pill ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>

              {/* Object Library */}
              <div className="controls-mb-4">
                <h4 className="controls-h4 controls-mb-3">Available Objects</h4>
                <div className="controls-grid controls-grid-cols-5">
                  {filteredObjects.map(obj => (
                    <div key={obj.id} className="controls-card">
                      <div className="controls-card-body">
                        <div 
                          className="controls-card-icon" 
                          role="img" 
                          aria-label={obj.name}
                        >
                          {obj.thumbnail}
                        </div>
                        <h5 className="controls-card-title">{obj.name}</h5>
                        <button 
                          className="controls-btn controls-btn-success controls-btn-sm controls-btn-block"
                          onClick={() => loadObject(obj)}
                          disabled={loading}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
                        <span 
                          className="controls-list-item-icon" 
                          role="img" 
                          aria-label={obj.name}
                        >
                          {obj.thumbnail}
                        </span>
                        <div className="controls-list-item-content">
                          <h5 className="controls-list-item-title">{obj.name}</h5>
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
                            {obj.visible ? 'Hide' : 'Show'}
                          </button>
                          <button 
                            className="controls-btn controls-btn-warning controls-btn-sm"
                            onClick={() => startEdit(obj)}
                            title="Edit Properties"
                          >
                            Edit
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
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingObject && (
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '500px' }}>
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