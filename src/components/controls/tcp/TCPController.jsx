// src/components/controls/tcp/TCPController.jsx
// Refactored to only import from useTCP hook with exact original UI

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useTCP from '../../../contexts/hooks/useTCP';

const TCPController = React.memo(({ viewerRef }) => {
  // Get all TCP functionality from single hook
  const tcp = useTCP();
  
  // Destructure what we need
  const {
    robotId,
    isReady,
    tool,
    tools,
    operations,
    system,
    endEffector
  } = tcp;
  
  // Local state for transform inputs
  const [localTransforms, setLocalTransforms] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });
  
  // Track if local transforms have been initialized
  const [transformsInitialized, setTransformsInitialized] = useState(false);
  
  // Transform timeout for debouncing
  const transformTimeoutRef = useRef(null);
  
  // Sync local transforms with actual tool transforms only once when tool changes
  useEffect(() => {
    if (tool.hasTool && tool.transforms && !transformsInitialized) {
      setLocalTransforms({
        position: { ...tool.transforms.position },
        rotation: { ...tool.transforms.rotation },
        scale: { ...tool.transforms.scale }
      });
      setTransformsInitialized(true);
    } else if (!tool.hasTool && transformsInitialized) {
      // Reset when tool is removed
      setLocalTransforms({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      });
      setTransformsInitialized(false);
    }
  }, [tool.hasTool, transformsInitialized]);
  
  // Reset transforms initialized flag when tool ID changes
  useEffect(() => {
    setTransformsInitialized(false);
  }, [tool.current?.toolId]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (transformTimeoutRef.current) {
        clearTimeout(transformTimeoutRef.current);
      }
    };
  }, []);
  
  // Event handlers
  const handleToolSelect = useCallback(async (toolId) => {
    try {
      await operations.attach(toolId);
    } catch (err) {
      console.error('Error attaching tool:', err);
    }
  }, [operations]);
  
  const handleRemoveTool = useCallback(async () => {
    try {
      await operations.remove();
    } catch (err) {
      console.error('Error removing tool:', err);
    }
  }, [operations]);
  
  const handleToggleVisibility = useCallback(() => {
    operations.toggleVisibility();
  }, [operations]);
  
  // Debounced transform change handler
  const handleTransformChange = useCallback((type, axis, value) => {
    const newTransforms = {
      ...localTransforms,
      [type]: {
        ...localTransforms[type],
        [axis]: parseFloat(value) || 0
      }
    };
    
    setLocalTransforms(newTransforms);
    
    // Debounce the actual transform application
    if (transformTimeoutRef.current) {
      clearTimeout(transformTimeoutRef.current);
    }
    
    transformTimeoutRef.current = setTimeout(() => {
      operations.setTransform(newTransforms);
    }, 100); // 100ms debounce for transform changes
  }, [localTransforms, operations]);
  
  const handleResetTransforms = useCallback(() => {
    operations.resetTransforms();
    // Also reset local transforms
    setLocalTransforms({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
  }, [operations]);
  
  const handleQuickScale = useCallback((scale) => {
    operations.scaleUniform(scale);
    // Also update local scale
    setLocalTransforms(prev => ({
      ...prev,
      scale: { x: scale, y: scale, z: scale }
    }));
  }, [operations]);
  
  if (!robotId || !isReady) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">TCP Tools</h3>
        <p className="controls-text-muted">No robot loaded</p>
      </div>
    );
  }
  
  return (
    <div className="controls-section">
      <h3 className="controls-section-title">
        TCP Tools - {robotId}
        {system.isUpdating && (
          <span className="controls-badge controls-badge-primary controls-ml-2">
            Updating...
          </span>
        )}
      </h3>
      
      {/* Update Status */}
      {system.lastUpdateTime && (
        <div className="controls-text-muted controls-small controls-mb-2">
          Last updated: {system.lastUpdateTime}
        </div>
      )}
      
      {/* Initialization Status */}
      {!system.isInitialized && (
        <div className="controls-alert controls-alert-warning controls-mb-3">
          TCP Manager initializing... Please wait.
        </div>
      )}
      
      {tools.error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {tools.error}
          <button 
            className="controls-btn controls-btn-sm controls-btn-outline-danger controls-mt-2"
            onClick={operations.clearError}
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Current Tool Status */}
      {tool.hasTool && tool.current && (
        <div className={`controls-card controls-mb-3 ${system.isUpdating ? 'controls-updating' : ''}`}>
          <div className="controls-card-body">
            <h5 className="controls-h5">Current Tool</h5>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <div>
                <strong>tcp</strong>
                {tool.info && (
                  <small className="controls-text-muted controls-ml-2">
                    (Original: {tool.info.name})
                  </small>
                )}
                <br />
                <small className="controls-text-muted">
                  Type: {tool.info?.type || 'Unknown'}
                  {tool.current.dimensions && (
                    <span className="controls-ml-2">
                      • X: {(tool.current.dimensions.x * 1000).toFixed(1)}mm, 
                      Y: {(tool.current.dimensions.y * 1000).toFixed(1)}mm, 
                      Z: {(tool.current.dimensions.z * 1000).toFixed(1)}mm
                    </span>
                  )}
                </small>
              </div>
              <div className="controls-btn-group">
                <button
                  className={`controls-btn controls-btn-sm ${tool.isVisible ? 'controls-btn-success' : 'controls-btn-secondary'}`}
                  onClick={handleToggleVisibility}
                  disabled={system.isDisabled}
                >
                  {tool.isVisible ? 'Hide' : 'Show'}
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-danger"
                  onClick={handleRemoveTool}
                  disabled={system.isDisabled}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Tool Transform Controls */}
      {tool.hasTool && (
        <div className={`controls-card controls-mb-3 ${system.isUpdating ? 'controls-updating' : ''}`}>
          <div className="controls-card-body">
            <h5 className="controls-h5">Tool Transform</h5>
            
            <button
              className="controls-btn controls-btn-sm controls-btn-secondary controls-mb-3"
              onClick={handleResetTransforms}
              disabled={system.isDisabled}
            >
              Reset All Transforms
            </button>
            
            {/* Position Controls */}
            <div className="controls-mb-3">
              <h6 className="controls-h6">Position (m)</h6>
              <div className="controls-grid controls-grid-cols-3 controls-gap-2">
                <div>
                  <label className="controls-form-label">X</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.position.x}
                    onChange={(e) => handleTransformChange('position', 'x', e.target.value)}
                    step="0.001"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Y</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.position.y}
                    onChange={(e) => handleTransformChange('position', 'y', e.target.value)}
                    step="0.001"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Z</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.position.z}
                    onChange={(e) => handleTransformChange('position', 'z', e.target.value)}
                    step="0.001"
                    disabled={system.isDisabled}
                  />
                </div>
              </div>
            </div>
            
            {/* Rotation Controls */}
            <div className="controls-mb-3">
              <h6 className="controls-h6">Rotation (deg)</h6>
              <div className="controls-grid controls-grid-cols-3 controls-gap-2">
                <div>
                  <label className="controls-form-label">X</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.rotation.x}
                    onChange={(e) => handleTransformChange('rotation', 'x', e.target.value)}
                    step="1"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Y</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.rotation.y}
                    onChange={(e) => handleTransformChange('rotation', 'y', e.target.value)}
                    step="1"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Z</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.rotation.z}
                    onChange={(e) => handleTransformChange('rotation', 'z', e.target.value)}
                    step="1"
                    disabled={system.isDisabled}
                  />
                </div>
              </div>
            </div>
            
            {/* Scale Controls */}
            <div className="controls-mb-3">
              <h6 className="controls-h6">Scale</h6>
              <div className="controls-grid controls-grid-cols-3 controls-gap-2">
                <div>
                  <label className="controls-form-label">X</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.scale.x}
                    onChange={(e) => handleTransformChange('scale', 'x', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Y</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.scale.y}
                    onChange={(e) => handleTransformChange('scale', 'y', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={system.isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Z</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.scale.z}
                    onChange={(e) => handleTransformChange('scale', 'z', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={system.isDisabled}
                  />
                </div>
              </div>
            </div>
            
            {/* Quick Scale Buttons */}
            <div className="controls-mb-2">
              <div className="controls-btn-group controls-btn-group-sm">
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => handleQuickScale(0.5)}
                  disabled={system.isDisabled}
                >
                  0.5x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => handleQuickScale(1)}
                  disabled={system.isDisabled}
                >
                  1x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => handleQuickScale(2)}
                  disabled={system.isDisabled}
                >
                  2x
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Tool Selection */}
      <div className="controls-form-group">
        <h4 className="controls-h6">Available Tools</h4>
        
        {tools.available.length === 0 ? (
          <div className="controls-text-center controls-p-3 controls-text-muted">
            No TCP tools found in /public/tcp/
            <br />
            <small>Place URDF or mesh files in the tcp directory</small>
          </div>
        ) : (
          <div className="controls-list">
            {tools.available.map(availableTool => (
              <div 
                key={availableTool.id}
                className={`controls-list-item ${tool.current?.toolId === availableTool.id ? 'controls-active' : ''}`}
              >
                <div className="controls-list-item-content">
                  <h6 className="controls-list-item-title">{availableTool.name}</h6>
                  <div className="controls-text-muted controls-small">
                    Type: {availableTool.type} | Files: {availableTool.fileCount}
                    <br />
                    Will be named "tcp" when attached
                  </div>
                  {availableTool.description && (
                    <div className="controls-text-muted controls-small">
                      {availableTool.description}
                    </div>
                  )}
                </div>
                <div className="controls-list-item-actions">
                  <button
                    className={`controls-btn controls-btn-sm ${tool.current?.toolId === availableTool.id ? 'controls-btn-success' : 'controls-btn-primary'}`}
                    onClick={() => tool.current?.toolId === availableTool.id ? null : handleToolSelect(availableTool.id)}
                    disabled={system.isDisabled || tool.current?.toolId === availableTool.id}
                  >
                    {tool.current?.toolId === availableTool.id ? 'Active' : 'Attach'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Refresh Button */}
      <button
        className="controls-btn controls-btn-secondary controls-btn-block"
        onClick={operations.refresh}
        disabled={system.isDisabled}
      >
        Refresh Tools
      </button>
      
      {/* Tool Info */}
      <div className="controls-mt-3">
        <small className="controls-text-muted">
          TCP tools are automatically attached to the robot's end effector and named "tcp".
          Tool dimensions are calculated from actual geometry for accurate positioning.
          Place tool files in <code>/public/tcp/</code> directory.
          {!system.isInitialized && <br />}
          {!system.isInitialized && <strong>Waiting for TCP Manager initialization...</strong>}
          {tool.hasTool && <br />}
          {tool.hasTool && <strong>Tool transforms update IK and end effector tracking in real-time with accurate dimensions.</strong>}
        </small>
      </div>
    </div>
  );
});

export default TCPController;