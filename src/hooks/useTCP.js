import { useState, useEffect } from 'react';
import { useTCPContext } from '../contexts/TCPContext';
import { useRobot } from '../contexts/RobotContext';

export const useTCP = (robotId = null) => {
  const {
    availableTools,
    attachedTools,
    isLoading,
    error,
    isInitialized,
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getToolInfo,
    getCurrentEndEffectorPoint,
    getCurrentEndEffectorOrientation,
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    getRobotEndEffectorOrientation,
    hasToolAttached,
    clearError
  } = useTCPContext();
  
  const { activeRobotId } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Debug logging
  useEffect(() => {
    console.log('[useTCP] Robot ID state:', {
      providedRobotId: robotId,
      activeRobotId,
      targetRobotId,
      isInitialized,
      hasTools: availableTools.length
    });
  }, [robotId, activeRobotId, targetRobotId, isInitialized, availableTools]);
  
  // State for current end effector position and orientation
  const [currentEndEffectorPoint, setCurrentEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [currentEndEffectorOrientation, setCurrentEndEffectorOrientation] = useState({ 
    x: 0, y: 0, z: 0, w: 1 // quaternion
  });

  return {
    // Core state
    robotId: targetRobotId,
    currentTool: targetRobotId ? attachedTools.get(targetRobotId) : null,
    hasTool: targetRobotId ? hasToolAttached(targetRobotId) : false,
    isToolVisible: targetRobotId ? attachedTools.get(targetRobotId)?.visible : false,
    toolTransforms: targetRobotId ? attachedTools.get(targetRobotId)?.transforms : null,
    availableTools,
    isLoading,
    error,
    isInitialized,
    
    // End effector state
    currentEndEffectorPoint,
    currentEndEffectorOrientation,
    
    // Methods
    attachTool: (toolId) => attachTool(targetRobotId, toolId),
    removeTool: () => removeTool(targetRobotId),
    setToolTransform: (transforms) => setToolTransform(targetRobotId, transforms),
    setToolVisibility: (visible) => setToolVisibility(targetRobotId, visible),
    resetTransforms: () => setToolTransform(targetRobotId, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }),
    scaleUniform: (scale) => setToolTransform(targetRobotId, {
      ...attachedTools.get(targetRobotId)?.transforms,
      scale: { x: scale, y: scale, z: scale }
    }),
    refreshTools: loadAvailableTools,
    clearError,
    getToolById: (toolId) => availableTools.find(tool => tool.id === toolId),
    
    // End effector methods
    getCurrentEndEffectorPoint: () => getCurrentEndEffectorPoint(targetRobotId),
    getCurrentEndEffectorOrientation: () => getCurrentEndEffectorOrientation(targetRobotId),
    recalculateEndEffector: () => recalculateEndEffector(targetRobotId),
    getRobotEndEffectorPosition: () => getRobotEndEffectorPosition(targetRobotId),
    getRobotEndEffectorOrientation: () => getRobotEndEffectorOrientation(targetRobotId)
  };
}; 