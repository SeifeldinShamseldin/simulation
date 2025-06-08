import React, { useState, useEffect, useRef } from 'react';
import { useRobotControl } from '../hooks/useRobotControl';
import { useTCP } from '../hooks/useTCP';

const TCPController = ({ viewerRef }) => {
  const { activeRobotId, isReady } = useRobotControl();
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

  // Debug logging
  useEffect(() => {
    console.log('[TCPController] State:', {
      activeRobotId,
      isReady,
      robotId,
      isInitialized,
      hasTool,
      availableToolsCount: availableTools.length
    });
  }, [activeRobotId, isReady, robotId, isInitialized, hasTool, availableTools]);

  return (
    <div>
      {/* Rest of the component code */}
    </div>
  );
};

export default TCPController; 