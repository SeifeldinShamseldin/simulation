// src/contexts/hooks/useTCP.js - Enhanced with position and orientation
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
    getCurrentEndEffectorOrientation, // New method from TCPContext
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    getRobotEndEffectorOrientation, // New method from TCPContext
    hasToolAttached,
    clearError
  } = useTCPContext();
  
  const { activeRobotId } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // State for current end effector position and orientation
  const [currentEndEffectorPoint, setCurrentEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [currentEndEffectorOrientation, setCurrentEndEffectorOrientation] = useState({ 
    x: 0, y: 0, z: 0, w: 1 // quaternion
  });
  
  // Get current tool info for target robot
  const currentTool = targetRobotId ? attachedTools.get(targetRobotId) : null;
  
  // Listen for end effector updates (position and orientation)
  useEffect(() => {
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === targetRobotId) {
        // Update position
        if (data.endEffectorPoint) {
          console.log(`[TCP Hook] End effector position updated for ${targetRobotId}:`, {
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
        
        // Update orientation if provided
        if (data.endEffectorOrientation) {
          console.log(`[TCP Hook] End effector orientation updated for ${targetRobotId}:`, data.endEffectorOrientation);
          
          setCurrentEndEffectorOrientation({
            x: data.endEffectorOrientation.x || 0,
            y: data.endEffectorOrientation.y || 0,
            z: data.endEffectorOrientation.z || 0,
            w: data.endEffectorOrientation.w || 1
          });
        }
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate);
    return () => unsubscribe();
  }, [targetRobotId]);
  
  // Initialize end effector position and orientation when robot or TCP state changes
  useEffect(() => {
    console.log(`[TCP Hook] Effect triggered - targetRobotId: ${targetRobotId}, isInitialized: ${isInitialized}, currentTool: ${!!currentTool}`);
    
    if (targetRobotId && isInitialized) {
      console.log(`[TCP Hook] Getting current end effector data for ${targetRobotId}`);
      
      try {
        // Get position and orientation in one call
        const endEffectorState = recalculateEndEffector(targetRobotId);
        console.log(`[TCP Hook] recalculateEndEffector returned:`, endEffectorState);
        
        if (endEffectorState) {
          // Extract and set position
          const extractedPoint = {
            x: endEffectorState.position?.x || 0,
            y: endEffectorState.position?.y || 0,
            z: endEffectorState.position?.z || 0
          };
          setCurrentEndEffectorPoint(extractedPoint);
          console.log(`[TCP Hook] Set current end effector position:`, extractedPoint);
          
          // Extract and set orientation
          const extractedOrientation = {
            x: endEffectorState.orientation?.x || 0,
            y: endEffectorState.orientation?.y || 0,
            z: endEffectorState.orientation?.z || 0,
            w: endEffectorState.orientation?.w || 1
          };
          setCurrentEndEffectorOrientation(extractedOrientation);
          console.log(`[TCP Hook] Set current end effector orientation:`, extractedOrientation);
        } else {
          // Fallback: try individual methods if combined call fails
          console.log(`[TCP Hook] Combined call failed, trying individual methods`);
          
          // Get position
          const currentPoint = getCurrentEndEffectorPoint(targetRobotId);
          console.log(`[TCP Hook] getCurrentEndEffectorPoint returned:`, currentPoint);
          
          if (currentPoint) {
            const extractedPoint = {
              x: currentPoint.x || 0,
              y: currentPoint.y || 0,
              z: currentPoint.z || 0
            };
            setCurrentEndEffectorPoint(extractedPoint);
            console.log(`[TCP Hook] Set current end effector position:`, extractedPoint);
          }
          
          // Get orientation
          const currentOrientation = getCurrentEndEffectorOrientation(targetRobotId);
          console.log(`[TCP Hook] getCurrentEndEffectorOrientation returned:`, currentOrientation);
          
          if (currentOrientation) {
            const extractedOrientation = {
              x: currentOrientation.x || 0,
              y: currentOrientation.y || 0,
              z: currentOrientation.z || 0,
              w: currentOrientation.w || 1
            };
            setCurrentEndEffectorOrientation(extractedOrientation);
            console.log(`[TCP Hook] Set current end effector orientation:`, extractedOrientation);
          }
        }
      } catch (error) {
        console.error(`[TCP Hook] Error getting end effector data:`, error);
        // Reset to default values on error
        setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
        setCurrentEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });
      }
    } else {
      console.log(`[TCP Hook] Reset end effector data - robotId: ${targetRobotId}, initialized: ${isInitialized}`);
      setCurrentEndEffectorPoint({ x: 0, y: 0, z: 0 });
      setCurrentEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });
    }
  }, [targetRobotId, currentTool, isInitialized, recalculateEndEffector, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation]);
  
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
  
  // Get end effector type
  const getEndEffectorType = useCallback(() => {
    if (!targetRobotId) return 'none';
    return currentTool ? 'tcp' : 'robot';
  }, [targetRobotId, currentTool]);
  
  // Get comprehensive end effector info
  const getEndEffectorInfo = useCallback(() => {
    if (!targetRobotId) return null;
    
    return {
      position: currentEndEffectorPoint,
      orientation: currentEndEffectorOrientation,
      type: getEndEffectorType(),
      toolName: currentTool?.tool?.name || null,
      hasValidPosition: !!(currentEndEffectorPoint.x !== 0 || currentEndEffectorPoint.y !== 0 || currentEndEffectorPoint.z !== 0),
      hasValidOrientation: !!(currentEndEffectorOrientation.w !== 1 || currentEndEffectorOrientation.x !== 0 || currentEndEffectorOrientation.y !== 0 || currentEndEffectorOrientation.z !== 0)
    };
  }, [targetRobotId, currentEndEffectorPoint, currentEndEffectorOrientation, getEndEffectorType, currentTool]);
  
  // Utility methods for orientation
  const getEndEffectorEulerAngles = useCallback(() => {
    // Convert quaternion to euler angles (in radians)
    const { x, y, z, w } = currentEndEffectorOrientation;
    
    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);
    
    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * Math.PI / 2; // Use 90 degrees if out of range
    } else {
      pitch = Math.asin(sinp);
    }
    
    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);
    
    return { roll, pitch, yaw };
  }, [currentEndEffectorOrientation]);
  
  return {
    // State (robot-specific)
    robotId: targetRobotId,
    currentTool,
    hasTool: !!currentTool,
    isToolVisible: currentTool?.visible ?? false,
    toolTransforms: currentTool?.transforms ?? null,
    
    // End effector state (position and orientation)
    currentEndEffectorPoint,
    currentEndEffectorOrientation,
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
    getEndEffectorEulerAngles,
    
    // Global methods
    refreshTools: loadAvailableTools,
    clearError,
    
    // Utils
    getToolById: (toolId) => availableTools.find(t => t.id === toolId),
    isToolAttached: (toolId) => currentTool?.toolId === toolId
  };
};

export default useTCP;