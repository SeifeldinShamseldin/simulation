import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRobotManager, useRobotSelection } from '../../../contexts/hooks/useRobotManager';
import { useTCP } from '../../../contexts/hooks/useTCP';
import EventBus from '../../../utils/EventBus';

const TCPController = React.memo(({ viewerRef }) => {
  // Get active robot ID
  const { activeId: activeRobotId } = useRobotSelection();
  // Get robot ready state
  const { isRobotLoaded } = useRobotManager();
  const isReady = isRobotLoaded(activeRobotId);
  const {
    robotId,
    currentTool,
    hasTool,
    isToolVisible,
    toolTransforms,
    availableTools,
    isLoading,
    error,
    isInitialized,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    resetTransforms,
    scaleUniform,
    refreshTools,
    clearError,
    getToolById
  } = useTCP();

  // Local state for transform inputs
  const [localTransforms, setLocalTransforms] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });

  // Real-time update state
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const updateTimeoutRef = useRef(null);
  const transformTimeoutRef = useRef(null);

  // Memoized values for performance
  const currentToolInfo = useMemo(() => 
    currentTool ? getToolById(currentTool.toolId) : null, 
    [currentTool, getToolById]
  );

  const isDisabled = useMemo(() => 
    isLoading || !isInitialized || isUpdating, 
    [isLoading, isInitialized, isUpdating]
  );

  // Sync local transforms with actual tool transforms
  useEffect(() => {
    if (toolTransforms) {
      setLocalTransforms(toolTransforms);
    } else {
      setLocalTransforms({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      });
    }
  }, [toolTransforms]);

  // Listen for TCP events to provide feedback
  useEffect(() => {
    const handleTCPEvent = (data) => {
      if (data.robotId === activeRobotId) {
        setLastUpdateTime(new Date().toLocaleTimeString());
        setIsUpdating(true);
        
        // Clear updating state after a brief moment
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
          setIsUpdating(false);
        }, 200);
      }
    };
    
    const unsubscribeTransform = EventBus.on('tcp:tool-transform-changed', handleTCPEvent);
    const unsubscribeAttached = EventBus.on('tcp:tool-attached', handleTCPEvent);
    const unsubscribeRemoved = EventBus.on('tcp:tool-removed', handleTCPEvent);
    
    return () => {
      unsubscribeTransform();
      unsubscribeAttached();
      unsubscribeRemoved();
      
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (transformTimeoutRef.current) {
        clearTimeout(transformTimeoutRef.current);
      }
    };
  }, [activeRobotId]);

  // Optimized event handlers with useCallback
  const handleToolSelect = useCallback(async (toolId) => {
    try {
      setIsUpdating(true);
      await attachTool(toolId);
    } catch (err) {
      console.error('Error attaching tool:', err);
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, [attachTool]);

  const handleRemoveTool = useCallback(async () => {
    try {
      setIsUpdating(true);
      await removeTool();
    } catch (err) {
      console.error('Error removing tool:', err);
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, [removeTool]);

  const handleToggleVisibility = useCallback(() => {
    setIsUpdating(true);
    setToolVisibility(!isToolVisible);
    setTimeout(() => setIsUpdating(false), 200);
  }, [setToolVisibility, isToolVisible]);

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
      setToolTransform(newTransforms);
    }, 100); // 100ms debounce for transform changes
  }, [localTransforms, setToolTransform]);

  const handleResetTransforms = useCallback(() => {
    setIsUpdating(true);
    resetTransforms();
    setTimeout(() => setIsUpdating(false), 200);
  }, [resetTransforms]);

  const handleQuickScale = useCallback((scale) => {
    setIsUpdating(true);
    scaleUniform(scale);
    setTimeout(() => setIsUpdating(false), 200);
  }, [scaleUniform]);

  if (!isReady) {
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
        TCP Tools - {activeRobotId}
        {isUpdating && (
          <span className="controls-badge controls-badge-primary controls-ml-2">
            Updating...
          </span>
        )}
      </h3>
      
      {/* Update Status */}
      {lastUpdateTime && (
        <div className="controls-text-muted controls-small controls-mb-2">
          Last updated: {lastUpdateTime}
        </div>
      )}
      
      {/* Initialization Status */}
      {!isInitialized && (
        <div className="controls-alert controls-alert-warning controls-mb-3">
          TCP Manager initializing... Please wait.
        </div>
      )}
      
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
          <button 
            className="controls-btn controls-btn-sm controls-btn-outline-danger controls-mt-2"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Tool Status */}
      {hasTool && currentTool && (
        <div className={`controls-card controls-mb-3 ${isUpdating ? 'controls-updating' : ''}`}>
          <div className="controls-card-body">
            <h5 className="controls-h5">Current Tool</h5>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <div>
                <strong>tcp</strong>
                {currentToolInfo && (
                  <small className="controls-text-muted controls-ml-2">
                    (Original: {currentToolInfo.name})
                  </small>
                )}
                <br />
                <small className="controls-text-muted">
                  Type: {currentToolInfo?.type || 'Unknown'}
                  {currentTool.dimensions && (
                    <span className="controls-ml-2">
                      • X: {(currentTool.dimensions.x * 1000).toFixed(1)}mm, 
                      Y: {(currentTool.dimensions.y * 1000).toFixed(1)}mm, 
                      Z: {(currentTool.dimensions.z * 1000).toFixed(1)}mm
                    </span>
                  )}
                </small>
              </div>
              <div className="controls-btn-group">
                <button
                  className={`controls-btn controls-btn-sm ${isToolVisible ? 'controls-btn-success' : 'controls-btn-secondary'}`}
                  onClick={handleToggleVisibility}
                  disabled={isDisabled}
                >
                  {isToolVisible ? 'Hide' : 'Show'}
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-danger"
                  onClick={handleRemoveTool}
                  disabled={isDisabled}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool Transform Controls */}
      {hasTool && (
        <div className={`controls-card controls-mb-3 ${isUpdating ? 'controls-updating' : ''}`}>
          <div className="controls-card-body">
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-3">
              <h5 className="controls-h5 controls-mb-0">Tool Transform</h5>
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={handleResetTransforms}
                disabled={isDisabled}
              >
                Reset
              </button>
            </div>

            {/* Position Controls */}
            <div className="controls-mb-3">
              <h6 className="controls-h6">Offset (Position)</h6>
              <div className="controls-grid controls-grid-cols-3 controls-gap-2">
                <div>
                  <label className="controls-form-label">X</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={localTransforms.position.x}
                    onChange={(e) => handleTransformChange('position', 'x', e.target.value)}
                    step="0.001"
                    disabled={isDisabled}
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
                    disabled={isDisabled}
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
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </div>

            {/* Rotation Controls */}
            <div className="controls-mb-3">
              <h6 className="controls-h6">Orientation (Degrees)</h6>
              <div className="controls-grid controls-grid-cols-3 controls-gap-2">
                <div>
                  <label className="controls-form-label">Roll (X)</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={(localTransforms.rotation.x * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'x', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Pitch (Y)</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={(localTransforms.rotation.y * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'y', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isDisabled}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Yaw (Z)</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={(localTransforms.rotation.z * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'z', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isDisabled}
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
                    disabled={isDisabled}
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
                    disabled={isDisabled}
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
                    disabled={isDisabled}
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
                  disabled={isDisabled}
                >
                  0.5x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => handleQuickScale(1)}
                  disabled={isDisabled}
                >
                  1x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => handleQuickScale(2)}
                  disabled={isDisabled}
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
        
        {isLoading ? (
          <div className="controls-text-center controls-p-3">
            <div className="controls-spinner-border controls-spinner-border-sm" role="status">
              <span className="controls-sr-only">Loading...</span>
            </div>
            <span className="controls-ml-2">Loading tools...</span>
          </div>
        ) : availableTools.length === 0 ? (
          <div className="controls-text-center controls-p-3 controls-text-muted">
            No TCP tools found in /public/tcp/
            <br />
            <small>Place URDF or mesh files in the tcp directory</small>
          </div>
        ) : (
          <div className="controls-list">
            {availableTools.map(tool => (
              <div 
                key={tool.id}
                className={`controls-list-item ${currentTool?.toolId === tool.id ? 'controls-active' : ''}`}
              >
                <div className="controls-list-item-content">
                  <h6 className="controls-list-item-title">{tool.name}</h6>
                  <div className="controls-text-muted controls-small">
                    Type: {tool.type} | Files: {tool.fileCount}
                    <br />
                    Will be named "tcp" when attached
                  </div>
                  {tool.description && (
                    <div className="controls-text-muted controls-small">
                      {tool.description}
                    </div>
                  )}
                </div>
                <div className="controls-list-item-actions">
                  <button
                    className={`controls-btn controls-btn-sm ${currentTool?.toolId === tool.id ? 'controls-btn-success' : 'controls-btn-primary'}`}
                    onClick={() => currentTool?.toolId === tool.id ? null : handleToolSelect(tool.id)}
                    disabled={isDisabled || currentTool?.toolId === tool.id}
                  >
                    {currentTool?.toolId === tool.id ? 'Active' : 'Attach'}
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
        onClick={refreshTools}
        disabled={isDisabled}
      >
        Refresh Tools
      </button>

      {/* Tool Info */}
      <div className="controls-mt-3">
        <small className="controls-text-muted">
          TCP tools are automatically attached to the robot's end effector and named "tcp".
          Tool dimensions are calculated from actual geometry for accurate positioning.
          Place tool files in <code>/public/tcp/</code> directory.
          {!isInitialized && <br />}
          {!isInitialized && <strong>Waiting for TCP Manager initialization...</strong>}
          {hasTool && <br />}
          {hasTool && <strong>Tool transforms update IK and end effector tracking in real-time with accurate dimensions.</strong>}
        </small>
      </div>
    </div>
  );
});

export default TCPController; 