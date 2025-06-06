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
  
  // State for real-time end effector tracking
  const [currentEndEffectorPoint, setCurrentEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [endEffectorDistance, setEndEffectorDistance] = useState(0);
  
  // Get current tool info for the target robot
  const currentTool = targetRobotId ? attachedTools.get(targetRobotId) : null;
  
  // Listen for end effector updates
  useEffect(() => {
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === targetRobotId && data.endEffectorPoint) {
        setCurrentEndEffectorPoint(data.endEffectorPoint);
        
        // Calculate distance from origin for reference
        const distance = Math.sqrt(
          data.endEffectorPoint.x ** 2 + 
          data.endEffectorPoint.y ** 2 + 
          data.endEffectorPoint.z ** 2
        );
        setEndEffectorDistance(distance);
        
        const source = data.hasTCP ? 'TCP' : 'Robot';
        console.log(`[TCP Hook] End effector updated for ${targetRobotId} (${source}):`, data.endEffectorPoint);
      }
    };
    
    const handleToolAttached = (data) => {
      if (data.robotId === targetRobotId && data.endEffectorPoint) {
        setCurrentEndEffectorPoint(data.endEffectorPoint);
        
        const distance = Math.sqrt(
          data.endEffectorPoint.x ** 2 + 
          data.endEffectorPoint.y ** 2 + 
          data.endEffectorPoint.z ** 2
        );
        setEndEffectorDistance(distance);
        
        console.log(`[TCP Hook] Tool attached for ${targetRobotId}, end effector:`, data.endEffectorPoint);
      }
    };
    
    const handleToolRemoved = (data) => {
      if (data.robotId === targetRobotId) {
        setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
        setEndEffectorDistance(0);
        console.log(`[TCP Hook] Tool removed for ${targetRobotId}`);
      }
    };
    
    const unsubscribeUpdate = EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate);
    const unsubscribeAttached = EventBus.on('tcp:tool-attached', handleToolAttached);
    const unsubscribeRemoved = EventBus.on('tcp:tool-removed', handleToolRemoved);
    
    return () => {
      unsubscribeUpdate();
      unsubscribeAttached();
      unsubscribeRemoved();
    };
  }, [targetRobotId]);
  
  // Initialize end effector point when robot changes or TCP state changes
  useEffect(() => {
    if (targetRobotId) {
      const point = getCurrentEndEffectorPoint(targetRobotId);
      if (point) {
        setCurrentEndEffectorPoint({ x: point.x, y: point.y, z: point.z });
        
        const distance = Math.sqrt(point.x ** 2 + point.y ** 2 + point.z ** 2);
        setEndEffectorDistance(distance);
      } else {
        // Fallback to robot end effector if available
        const robotEndEffectorPos = getRobotEndEffectorPosition(targetRobotId);
        if (robotEndEffectorPos) {
          setCurrentEndEffectorPoint(robotEndEffectorPos);
          
          const distance = Math.sqrt(
            robotEndEffectorPos.x ** 2 + 
            robotEndEffectorPos.y ** 2 + 
            robotEndEffectorPos.z ** 2
          );
          setEndEffectorDistance(distance);
        }
      }
    } else {
      setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
      setEndEffectorDistance(0);
    }
  }, [targetRobotId, currentTool, getCurrentEndEffectorPoint, getRobotEndEffectorPosition]);
  
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
  
  // Smart End Effector Methods
  const getEndEffectorPoint = useCallback(() => {
    if (!targetRobotId) return null;
    return getCurrentEndEffectorPoint(targetRobotId);
  }, [targetRobotId, getCurrentEndEffectorPoint]);
  
  const forceRecalculateEndEffector = useCallback(() => {
    if (!targetRobotId) return null;
    return recalculateEndEffector(targetRobotId);
  }, [targetRobotId, recalculateEndEffector]);
  
  // Convenience methods for common transform operations
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
  
  const moveToolRelative = useCallback((axis, amount) => {
    if (!targetRobotId || !currentTool) return;
    const currentTransforms = currentTool.transforms;
    setToolTransform(targetRobotId, {
      ...currentTransforms,
      position: {
        ...currentTransforms.position,
        [axis]: currentTransforms.position[axis] + amount
      }
    });
  }, [targetRobotId, currentTool, setToolTransform]);
  
  const rotateToolRelative = useCallback((axis, degrees) => {
    if (!targetRobotId || !currentTool) return;
    const currentTransforms = currentTool.transforms;
    const radians = degrees * Math.PI / 180;
    setToolTransform(targetRobotId, {
      ...currentTransforms,
      rotation: {
        ...currentTransforms.rotation,
        [axis]: currentTransforms.rotation[axis] + radians
      }
    });
  }, [targetRobotId, currentTool, setToolTransform]);
  
  // Advanced end effector methods
  const getEndEffectorDistance = useCallback(() => {
    return endEffectorDistance;
  }, [endEffectorDistance]);
  
  const getEndEffectorArray = useCallback(() => {
    return [currentEndEffectorPoint.x, currentEndEffectorPoint.y, currentEndEffectorPoint.z];
  }, [currentEndEffectorPoint]);
  
  const isEndEffectorAt = useCallback((targetPoint, tolerance = 0.001) => {
    if (!currentTool) return false;
    
    const distance = Math.sqrt(
      Math.pow(currentEndEffectorPoint.x - targetPoint.x, 2) +
      Math.pow(currentEndEffectorPoint.y - targetPoint.y, 2) +
      Math.pow(currentEndEffectorPoint.z - targetPoint.z, 2)
    );
    
    return distance <= tolerance;
  }, [currentEndEffectorPoint, currentTool]);

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
    
    // Smart End Effector State
    currentEndEffectorPoint,
    endEffectorDistance,
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
    
    // Smart End Effector Methods
    getEndEffectorPoint,
    forceRecalculateEndEffector,
    getEndEffectorDistance,
    getEndEffectorArray,
    isEndEffectorAt,
    getEndEffectorType,
    getEndEffectorInfo,
    
    // Convenience methods
    resetTransforms: resetToolTransforms,
    scaleUniform: scaleToolUniform,
    moveRelative: moveToolRelative,
    rotateRelative: rotateToolRelative,
    
    // Global methods
    refreshTools: loadAvailableTools,
    clearError,
    
    // Utils
    getToolById: (toolId) => availableTools.find(t => t.id === toolId),
    getAllAttachedTools: () => Array.from(attachedTools.entries()),
    isToolAttached: (toolId) => currentTool?.toolId === toolId
  };
};

export default useTCP;