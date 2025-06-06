import React, { useState, useEffect, useRef } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import TCPManager from './TCPManager';

const TCPController = ({ viewerRef }) => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const tcpManagerRef = useRef(null);
  const [availableTools, setAvailableTools] = useState([]);
  const [currentTool, setCurrentTool] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toolVisible, setToolVisible] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Tool transformation states
  const [toolTransform, setToolTransform] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });

  // Initialize TCP manager when viewer is ready
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    
    const tryInitialize = () => {
      console.log(`TCPController: Initialization attempt ${retryCount + 1}/${maxRetries}`, { 
        hasViewerRef: !!viewerRef?.current, 
        hasRobot: !!robot, 
        isReady, 
        activeRobotId 
      });

      if (viewerRef?.current && robot && isReady && activeRobotId) {
        try {
          // Create new manager if needed
          if (!tcpManagerRef.current) {
            tcpManagerRef.current = new TCPManager();
          }

          const sceneSetup = viewerRef.current.getSceneSetup?.();
          const robotManager = viewerRef.current.robotLoaderRef?.current;
          
          console.log('TCPController: Checking components...', {
            hasSceneSetup: !!sceneSetup,
            hasRobotManager: !!robotManager,
            retryCount
          });

          if (sceneSetup && robotManager) {
            console.log('TCPController: Initializing TCP Manager...');
            tcpManagerRef.current.initialize(sceneSetup, robotManager);
            setIsInitialized(true);
            setError(null);
            loadAvailableTools();
            return; // Success, stop retrying
          } else {
            console.warn(`TCPController: Missing components (attempt ${retryCount + 1})`);
            
            // Retry after a short delay
            if (retryCount < maxRetries - 1) {
              retryCount++;
              setTimeout(tryInitialize, 500); // Wait 500ms before retry
            } else {
              setError('Scene setup or robot manager not available after retries');
              setIsInitialized(false);
            }
          }
        } catch (err) {
          console.error('TCPController: Initialization error:', err);
          setError(`Initialization failed: ${err.message}`);
          setIsInitialized(false);
        }
      } else {
        console.log('TCPController: Not ready for initialization');
        setIsInitialized(false);
      }
    };

    // Start the initialization process
    tryInitialize();
  }, [viewerRef, robot, isReady, activeRobotId]);

  // Clean up when robot changes
  useEffect(() => {
    return () => {
      if (tcpManagerRef.current && currentTool && activeRobotId) {
        tcpManagerRef.current.removeTool(activeRobotId).catch(console.error);
      }
    };
  }, [activeRobotId]);

  // Apply tool transforms when they change
  useEffect(() => {
    if (currentTool && activeRobotId && tcpManagerRef.current) {
      tcpManagerRef.current.setToolTransform(activeRobotId, toolTransform);
    }
  }, [toolTransform, currentTool, activeRobotId]);

  // Load available TCP tools
  const loadAvailableTools = async () => {
    if (!tcpManagerRef.current) {
      console.warn('TCPController: Cannot load tools - manager not initialized');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('TCPController: Loading available tools...');
      const tools = await tcpManagerRef.current.scanAvailableTools();
      console.log('TCPController: Loaded tools:', tools);
      setAvailableTools(tools);
    } catch (err) {
      const errorMsg = `Failed to load tools: ${err.message}`;
      setError(errorMsg);
      console.error('TCPController: Error loading TCP tools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle tool selection
  const handleToolSelect = async (toolId) => {
    if (!activeRobotId || !robot || !isInitialized || !tcpManagerRef.current) {
      setError('TCP Manager not ready. Please wait for initialization.');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('TCPController: Attaching tool:', toolId, 'to robot:', activeRobotId);
      
      // Remove current tool if exists
      if (currentTool) {
        await tcpManagerRef.current.removeTool(activeRobotId);
      }
      
      // Load and attach new tool
      const success = await tcpManagerRef.current.attachTool(activeRobotId, toolId);
      
      if (success) {
        setCurrentTool(toolId);
        // Reset transforms when new tool is attached
        setToolTransform({
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        });
        console.log('TCPController: Tool attached successfully');
      } else {
        setError('Failed to attach tool');
      }
    } catch (err) {
      const errorMsg = `Error attaching tool: ${err.message}`;
      setError(errorMsg);
      console.error('TCPController: Error attaching tool:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Remove current tool
  const handleRemoveTool = async () => {
    if (!activeRobotId || !currentTool || !tcpManagerRef.current) return;
    
    try {
      setIsLoading(true);
      await tcpManagerRef.current.removeTool(activeRobotId);
      setCurrentTool(null);
      // Reset transforms when tool is removed
      setToolTransform({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      });
      console.log('TCPController: Tool removed successfully');
    } catch (err) {
      setError(`Error removing tool: ${err.message}`);
      console.error('TCPController: Error removing tool:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle tool visibility
  const handleToggleVisibility = () => {
    if (currentTool && activeRobotId && tcpManagerRef.current) {
      const newVisibility = !toolVisible;
      tcpManagerRef.current.setToolVisibility(activeRobotId, newVisibility);
      setToolVisible(newVisibility);
    }
  };

  // Handle transform changes
  const handleTransformChange = (type, axis, value) => {
    setToolTransform(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [axis]: parseFloat(value) || 0
      }
    }));
  };

  // Reset transforms
  const resetTransforms = () => {
    setToolTransform({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
  };

  // Get tool info
  const getCurrentToolInfo = () => {
    if (!currentTool) return null;
    return availableTools.find(tool => tool.id === currentTool);
  };

  const currentToolInfo = getCurrentToolInfo();

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
      <h3 className="controls-section-title">TCP Tools - {activeRobotId}</h3>
      
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
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Tool Status */}
      {currentTool && (
        <div className="controls-card controls-mb-3">
          <div className="controls-card-body">
            <h5 className="controls-h5">Current Tool</h5>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <div>
                <strong>{currentToolInfo?.name || currentTool}</strong>
                <br />
                <small className="controls-text-muted">
                  Type: {currentToolInfo?.type || 'Unknown'}
                </small>
              </div>
              <div className="controls-btn-group">
                <button
                  className={`controls-btn controls-btn-sm ${toolVisible ? 'controls-btn-success' : 'controls-btn-secondary'}`}
                  onClick={handleToggleVisibility}
                  disabled={isLoading || !isInitialized}
                >
                  {toolVisible ? 'Hide' : 'Show'}
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-danger"
                  onClick={handleRemoveTool}
                  disabled={isLoading || !isInitialized}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool Transform Controls */}
      {currentTool && (
        <div className="controls-card controls-mb-3">
          <div className="controls-card-body">
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-3">
              <h5 className="controls-h5 controls-mb-0">Tool Transform</h5>
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={resetTransforms}
                disabled={isLoading || !isInitialized}
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
                    value={toolTransform.position.x}
                    onChange={(e) => handleTransformChange('position', 'x', e.target.value)}
                    step="0.001"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Y</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={toolTransform.position.y}
                    onChange={(e) => handleTransformChange('position', 'y', e.target.value)}
                    step="0.001"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Z</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={toolTransform.position.z}
                    onChange={(e) => handleTransformChange('position', 'z', e.target.value)}
                    step="0.001"
                    disabled={isLoading || !isInitialized}
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
                    value={(toolTransform.rotation.x * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'x', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Pitch (Y)</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={(toolTransform.rotation.y * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'y', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Yaw (Z)</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={(toolTransform.rotation.z * 180 / Math.PI).toFixed(1)}
                    onChange={(e) => handleTransformChange('rotation', 'z', parseFloat(e.target.value) * Math.PI / 180)}
                    step="1"
                    disabled={isLoading || !isInitialized}
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
                    value={toolTransform.scale.x}
                    onChange={(e) => handleTransformChange('scale', 'x', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Y</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={toolTransform.scale.y}
                    onChange={(e) => handleTransformChange('scale', 'y', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
                <div>
                  <label className="controls-form-label">Z</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    value={toolTransform.scale.z}
                    onChange={(e) => handleTransformChange('scale', 'z', e.target.value)}
                    step="0.1"
                    min="0.1"
                    disabled={isLoading || !isInitialized}
                  />
                </div>
              </div>
            </div>

            {/* Quick Scale Buttons */}
            <div className="controls-mb-2">
              <div className="controls-btn-group controls-btn-group-sm">
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => setToolTransform(prev => ({
                    ...prev,
                    scale: { x: prev.scale.x * 0.5, y: prev.scale.y * 0.5, z: prev.scale.z * 0.5 }
                  }))}
                  disabled={isLoading || !isInitialized}
                >
                  0.5x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => setToolTransform(prev => ({
                    ...prev,
                    scale: { x: 1, y: 1, z: 1 }
                  }))}
                  disabled={isLoading || !isInitialized}
                >
                  1x
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-secondary"
                  onClick={() => setToolTransform(prev => ({
                    ...prev,
                    scale: { x: prev.scale.x * 2, y: prev.scale.y * 2, z: prev.scale.z * 2 }
                  }))}
                  disabled={isLoading || !isInitialized}
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
                className={`controls-list-item ${currentTool === tool.id ? 'controls-active' : ''}`}
              >
                <div className="controls-list-item-content">
                  <h6 className="controls-list-item-title">{tool.name}</h6>
                  <div className="controls-text-muted controls-small">
                    Type: {tool.type} | Files: {tool.fileCount}
                  </div>
                  {tool.description && (
                    <div className="controls-text-muted controls-small">
                      {tool.description}
                    </div>
                  )}
                </div>
                <div className="controls-list-item-actions">
                  <button
                    className={`controls-btn controls-btn-sm ${currentTool === tool.id ? 'controls-btn-success' : 'controls-btn-primary'}`}
                    onClick={() => currentTool === tool.id ? null : handleToolSelect(tool.id)}
                    disabled={isLoading || currentTool === tool.id || !isInitialized}
                  >
                    {currentTool === tool.id ? 'Active' : 'Attach'}
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
        onClick={loadAvailableTools}
        disabled={isLoading || !isInitialized}
      >
        Refresh Tools
      </button>

      {/* Tool Info */}
      <div className="controls-mt-3">
        <small className="controls-text-muted">
          TCP tools are automatically attached to the robot's end effector.
          Place tool files in <code>/public/tcp/</code> directory.
          {!isInitialized && <br />}
          {!isInitialized && <strong>Waiting for TCP Manager initialization...</strong>}
        </small>
      </div>
    </div>
  );
};

export default TCPController; 