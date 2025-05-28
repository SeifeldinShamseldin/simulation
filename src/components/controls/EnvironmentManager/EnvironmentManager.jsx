// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import './EnvironmentManager.css';

// Predefined object library
const OBJECT_LIBRARY = [
  {
    id: 'workshop_table',
    name: 'Workshop Table',
    path: '/objects/table/complete_table.dae',
    category: 'furniture',
    thumbnail: '🪑',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0, // Object sits on ground
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
    groundOffset: 0.1 // Slightly elevated for belt clearance
  },
  {
    id: 'tool_rack',
    name: 'Tool Rack',
    path: '/objects/tools/rack.dae',
    category: 'storage',
    thumbnail: '🔧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0 // Sits on ground
  },
  {
    id: 'safety_fence',
    name: 'Safety Fence',
    path: '/objects/safety/fence.dae',
    category: 'safety',
    thumbnail: '🚧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0 // Sits on ground
  },
  {
    id: 'control_panel',
    name: 'Control Panel',
    path: '/objects/controls/panel.dae',
    category: 'controls',
    thumbnail: '🎛️',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0.8 // Elevated for standing height
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

  // Load object into scene
  const loadObject = async (objectConfig) => {
    if (!viewerRef?.current) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${objectConfig.id}_${Date.now()}`;
      
      // Load with smart placement - don't specify position
      const object3D = await sceneSetup.loadEnvironmentObject({
        ...objectConfig,
        id: instanceId,
        // Let smart placement handle position/rotation
        castShadow: true,
        receiveShadow: true,
        // Add ground offset to initial position
        position: objectConfig.groundOffset ? {
          x: 0,
          y: objectConfig.groundOffset,
          z: 0
        } : undefined
      });
      
      // Get actual position after smart placement
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
    
    // Remove from scene
    sceneSetup.removeEnvironmentObject(instanceId);
    
    // Remove from state
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
    
    // Close edit form if editing this object
    if (editingObject?.instanceId === instanceId) {
      setEditingObject(null);
    }
  };

  // Update object properties
  const updateObject = () => {
    if (!viewerRef?.current || !editingObject) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    // Update in scene
    sceneSetup.updateEnvironmentObject(editingObject.instanceId, editForm);
    
    // Update in state
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
    
    // Update in scene
    sceneSetup.updateEnvironmentObject(instanceId, { visible: newVisibility });
    
    // Update in state
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
    <div className={`env-manager ${compact ? 'env-manager--compact' : ''}`}>
      {/* Toggle Button */}
      <button 
        className="env-manager__toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Environment Objects"
      >
        🏭 {loadedObjects.length > 0 && <span className="env-manager__count">{loadedObjects.length}</span>}
      </button>

      {/* Manager Panel */}
      {isOpen && (
        <div className="env-manager__panel">
          <div className="env-manager__header">
            <h3>Environment Objects</h3>
            <button 
              className="env-manager__close"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          {error && (
            <div className="env-manager__error">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Category Filter */}
          <div className="env-manager__categories">
            {categories.map(cat => (
              <button
                key={cat}
                className={`env-manager__category ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Object Library */}
          <div className="env-manager__library">
            <h4>Available Objects</h4>
            <div className="env-manager__grid">
              {filteredObjects.map(obj => (
                <div key={obj.id} className="env-manager__item">
                  <div className="env-manager__thumbnail" role="img" aria-label={obj.name}>
                    {obj.thumbnail}
                  </div>
                  <div className="env-manager__name">{obj.name}</div>
                  <button 
                    className="env-manager__add"
                    onClick={() => loadObject(obj)}
                    disabled={loading}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Loaded Objects */}
          {loadedObjects.length > 0 && (
            <div className="env-manager__loaded">
              <div className="env-manager__loaded-header">
                <h4>Scene Objects ({loadedObjects.length})</h4>
                <button 
                  className="env-manager__clear"
                  onClick={clearAll}
                >
                  Clear All
                </button>
              </div>
              
              <div className="env-manager__list">
                {loadedObjects.map(obj => (
                  <div key={obj.instanceId} className="env-manager__object">
                    <div className="env-manager__object-info">
                      <span className="env-manager__object-thumb" role="img" aria-label={obj.name}>
                        {obj.thumbnail}
                      </span>
                      <span className="env-manager__object-name">{obj.name}</span>
                      <span className={`env-manager__visibility ${obj.visible ? 'visible' : 'hidden'}`}>
                        {obj.visible ? '👁️' : '👁️‍🗨️'}
                      </span>
                    </div>
                    
                    <div className="env-manager__object-actions">
                      <button 
                        onClick={() => toggleVisibility(obj.instanceId)}
                        title="Toggle Visibility"
                      >
                        {obj.visible ? 'Hide' : 'Show'}
                      </button>
                      <button 
                        onClick={() => startEdit(obj)}
                        title="Edit Properties"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => removeObject(obj.instanceId)}
                        className="env-manager__remove"
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
      )}

      {/* Edit Modal */}
      {editingObject && (
        <div className="env-manager__modal-overlay">
          <div className="env-manager__modal">
            <div className="env-manager__modal-header">
              <h3>Edit {editingObject.name}</h3>
              <button 
                className="env-manager__modal-close"
                onClick={() => setEditingObject(null)}
              >
                ×
              </button>
            </div>

            <div className="env-manager__modal-content">
              {/* Position */}
              <div className="env-manager__form-group">
                <label>Position</label>
                <div className="env-manager__form-row">
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.position.x}
                    onChange={(e) => handleFormChange('position', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.position.y}
                    onChange={(e) => handleFormChange('position', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.position.z}
                    onChange={(e) => handleFormChange('position', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>

              {/* Rotation */}
              <div className="env-manager__form-group">
                <label>Rotation (radians)</label>
                <div className="env-manager__form-row">
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.rotation.x}
                    onChange={(e) => handleFormChange('rotation', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.rotation.y}
                    onChange={(e) => handleFormChange('rotation', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.rotation.z}
                    onChange={(e) => handleFormChange('rotation', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>

              {/* Scale */}
              <div className="env-manager__form-group">
                <label>Scale</label>
                <div className="env-manager__form-row">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.x}
                    onChange={(e) => handleFormChange('scale', 'x', e.target.value)}
                    placeholder="X"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.y}
                    onChange={(e) => handleFormChange('scale', 'y', e.target.value)}
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={editForm.scale.z}
                    onChange={(e) => handleFormChange('scale', 'z', e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>
            </div>

            <div className="env-manager__modal-actions">
              <button 
                onClick={() => setEditingObject(null)}
                className="env-manager__btn--cancel"
              >
                Cancel
              </button>
              <button 
                onClick={updateObject}
                className="env-manager__btn--save"
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