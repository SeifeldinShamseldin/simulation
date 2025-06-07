import { useCallback, useState, useEffect } from 'react';
import { useTCPContext } from '../TCPContext';
import { useRobot } from '../RobotContext';
import EventBus from '../../utils/EventBus';

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
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    hasToolAttached,
    clearError
  } = useTCPContext();
  
  const { activeRobotId } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // State for current end effector position
  const [currentEndEffectorPoint, setCurrentEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  
  // Get current tool info for target robot
  const currentTool = targetRobotId ? attachedTools.get(targetRobotId) : null;
  
  // Listen for end effector updates
  useEffect(() => {
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === targetRobotId && data.endEffectorPoint) {
        console.log(`[TCP Hook] End effector updated for ${targetRobotId}:`, {
          x: data.endEffectorPoint.x,
          y: data.endEffectorPoint.y, 
          z: data.endEffectorPoint.z
        });
        
        setCurrentEndEffectorPoint({
          x: data.endEffectorPoint.x,
          y: data.endEffectorPoint.y,
          z: data.endEffectorPoint.z
        });
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate);
    return () => unsubscribe();
  }, [targetRobotId]);
  
  // Initialize end effector position when robot or TCP state changes
  useEffect(() => {
    console.log(`[TCP Hook] Effect triggered - targetRobotId: ${targetRobotId}, isInitialized: ${isInitialized}, currentTool: ${!!currentTool}`);
    
    if (targetRobotId && isInitialized) {
      console.log(`[TCP Hook] Getting current end effector for ${targetRobotId}`);
      console.log(`[TCP Hook] getCurrentEndEffectorPoint function:`, getCurrentEndEffectorPoint);
      
      const currentPoint = getCurrentEndEffectorPoint(targetRobotId);
      console.log(`[TCP Hook] getCurrentEndEffectorPoint returned:`, currentPoint);
      
      if (currentPoint) {
        // Ensure we extract the actual coordinates
        const extractedPoint = {
          x: currentPoint.x || 0,
          y: currentPoint.y || 0,
          z: currentPoint.z || 0
        };
        
        setCurrentEndEffectorPoint(extractedPoint);
        console.log(`[TCP Hook] Set current end effector:`, extractedPoint);
      } else {
        console.warn(`[TCP Hook] getCurrentEndEffectorPoint returned null/undefined`);
        setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
      }
    } else {
      console.log(`[TCP Hook] Reset end effector position - robotId: ${targetRobotId}, initialized: ${isInitialized}`);
      setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
    }
  }, [targetRobotId, currentTool, isInitialized, getCurrentEndEffectorPoint]);
  
  // Robot-specific methods
  const attachToolToRobot = useCallback(async (toolId) => {
    if (!targetRobotId) {
      throw new Error('No robot ID provided');
    }
    return await attachTool(targetRobotId, toolId);
  }, [targetRobotId, attachTool]);
  
  const removeToolFromRobot = useCallback(async () => {
    if (!targetRobotId) return;
    return await removeTool(targetRobotId);
  }, [targetRobotId, removeTool]);
  
  const setRobotToolTransform = useCallback((transforms) => {
    if (!targetRobotId) return;
    setToolTransform(targetRobotId, transforms);
  }, [targetRobotId, setToolTransform]);
  
  const setRobotToolVisibility = useCallback((visible) => {
    if (!targetRobotId) return;
    setToolVisibility(targetRobotId, visible);
  }, [targetRobotId, setToolVisibility]);
  
  // Convenience methods
  const resetToolTransforms = useCallback(() => {
    if (!targetRobotId) return;
    setToolTransform(targetRobotId, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
  }, [targetRobotId, setToolTransform]);
  
  const scaleToolUniform = useCallback((scale) => {
    if (!targetRobotId || !currentTool) return;
    const currentTransforms = currentTool.transforms;
    setToolTransform(targetRobotId, {
      ...currentTransforms,
      scale: { x: scale, y: scale, z: scale }
    });
  }, [targetRobotId, currentTool, setToolTransform]);
  
  // Get end effector info
  const getEndEffectorType = useCallback(() => {
    if (!targetRobotId) return 'none';
    return currentTool ? 'tcp' : 'robot';
  }, [targetRobotId, currentTool]);
  
  const getEndEffectorInfo = useCallback(() => {
    if (!targetRobotId) return null;
    return {
      position: currentEndEffectorPoint,
      type: getEndEffectorType(),
      toolName: currentTool?.tool?.name || null,
      hasValidPosition: !!(currentEndEffectorPoint.x !== 0 || currentEndEffectorPoint.y !== 0 || currentEndEffectorPoint.z !== 0)
    };
  }, [targetRobotId, currentEndEffectorPoint, getEndEffectorType, currentTool]);
  
  return {
    // State (robot-specific)
    robotId: targetRobotId,
    currentTool,
    hasTool: !!currentTool,
    isToolVisible: currentTool?.visible ?? false,
    toolTransforms: currentTool?.transforms ?? null,
    
    // End effector state (simplified: robot + tcp)
    currentEndEffectorPoint,
    hasValidEndEffector: !!(currentEndEffectorPoint.x !== 0 || currentEndEffectorPoint.y !== 0 || currentEndEffectorPoint.z !== 0),
    isUsingTCP: !!currentTool,
    isUsingRobotEndEffector: !currentTool && targetRobotId,
    
    // Global state
    availableTools,
    isLoading,
    error,
    isInitialized,
    
    // Robot-specific methods
    attachTool: attachToolToRobot,
    removeTool: removeToolFromRobot,
    setToolTransform: setRobotToolTransform,
    setToolVisibility: setRobotToolVisibility,
    
    // Convenience methods
    resetTransforms: resetToolTransforms,
    scaleUniform: scaleToolUniform,
    
    // End effector methods
    getEndEffectorInfo,
    getEndEffectorType,
    
    // Global methods
    refreshTools: loadAvailableTools,
    clearError,
    
    // Utils
    getToolById: (toolId) => availableTools.find(t => t.id === toolId),
    isToolAttached: (toolId) => currentTool?.toolId === toolId
  };
};

export default useTCP;