import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import TCPManager from './TCPManager';

const TCPController = ({ viewerRef }) => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const [tcpManager] = useState(() => new TCPManager());
  const [availableTools, setAvailableTools] = useState([]);
  const [currentTool, setCurrentTool] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toolVisible, setToolVisible] = useState(true);

  // Initialize TCP manager when viewer is ready
  useEffect(() => {
    if (viewerRef?.current && robot && isReady) {
      const sceneSetup = viewerRef.current.getSceneSetup?.() || viewerRef.current.sceneRef?.current;
      const robotManager = viewerRef.current.robotManagerRef?.current;
      
      if (sceneSetup && robotManager) {
        tcpManager.initialize(sceneSetup, robotManager);
        loadAvailableTools();
      }
    }
  }, [viewerRef, robot, isReady, activeRobotId]);

  // Load available TCP tools
  const loadAvailableTools = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const tools = await tcpManager.scanAvailableTools();
      setAvailableTools(tools);
    } catch (err) {
      setError(`Failed to load tools: ${err.message}`);
      console.error('Error loading TCP tools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle tool selection
  const handleToolSelect = async (toolId) => {
    if (!activeRobotId || !robot) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Remove current tool if exists
      if (currentTool) {
        await tcpManager.removeTool(activeRobotId);
      }
      
      // Load and attach new tool
      const success = await tcpManager.attachTool(activeRobotId, toolId);
      
      if (success) {
        setCurrentTool(toolId);
      } else {
        setError('Failed to attach tool');
      }
    } catch (err) {
      setError(`Error attaching tool: ${err.message}`);
      console.error('Error attaching tool:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Remove current tool
  const handleRemoveTool = async () => {
    if (!activeRobotId || !currentTool) return;
    
    try {
      setIsLoading(true);
      await tcpManager.removeTool(activeRobotId);
      setCurrentTool(null);
    } catch (err) {
      setError(`Error removing tool: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle tool visibility
  const handleToggleVisibility = () => {
    if (currentTool && activeRobotId) {
      const newVisibility = !toolVisible;
      tcpManager.setToolVisibility(activeRobotId, newVisibility);
      setToolVisible(newVisibility);
    }
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
      
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
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
                  disabled={isLoading}
                >
                  {toolVisible ? 'Hide' : 'Show'}
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-danger"
                  onClick={handleRemoveTool}
                  disabled={isLoading}
                >
                  Remove
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
                    disabled={isLoading || currentTool === tool.id}
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
        disabled={isLoading}
      >
        Refresh Tools
      </button>

      {/* Tool Info */}
      <div className="controls-mt-3">
        <small className="controls-text-muted">
          TCP tools are automatically attached to the robot's end effector.
          Place tool files in <code>/public/tcp/</code> directory.
        </small>
      </div>
    </div>
  );
};

export default TCPController; 