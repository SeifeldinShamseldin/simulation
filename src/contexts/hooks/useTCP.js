// src/contexts/hooks/useTCP.js - Enhanced with position and orientation
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useTCPContext } from '../TCPContext';
import { useRobotSelection } from './useRobotManager';
import EventBus from '../../utils/EventBus';

// Debug utility to reduce console pollution
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

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
    getEndEffectorLink: getEndEffectorLinkFromContext,
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    getRobotEndEffectorOrientation,
    hasToolAttached,
    clearError
  } = useTCPContext();
  
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Get current tool info for target robot
  const currentTool = targetRobotId ? attachedTools.get(targetRobotId) : null;
  
  // ========== DERIVED STATE FROM CONTEXT ==========
  
  // Derive end effector position from context instead of local state
  const currentEndEffectorPoint = useMemo(() => {
    if (!targetRobotId || !isInitialized) {
      return { x: 0, y: 0, z: 0 };
    }
    return getCurrentEndEffectorPoint(targetRobotId) || { x: 0, y: 0, z: 0 };
  }, [targetRobotId, isInitialized, getCurrentEndEffectorPoint]);
  
  // Derive end effector orientation from context instead of local state
  const currentEndEffectorOrientation = useMemo(() => {
    if (!targetRobotId || !isInitialized) {
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    return getCurrentEndEffectorOrientation(targetRobotId) || { x: 0, y: 0, z: 0, w: 1 };
  }, [targetRobotId, isInitialized, getCurrentEndEffectorOrientation]);
  
  // Listen for end effector updates (for event emission only)
  useEffect(() => {
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === targetRobotId) {
        log(`[TCP Hook] End effector update event received for ${targetRobotId}`);
        // No need to update local state - context will handle it
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate);
    return () => unsubscribe();
  }, [targetRobotId]);
  
  // ========== SIMPLIFIED EFFECT - ONLY FOR RECALCULATION ==========
  
  // Effect only handles recalculation when needed
  useEffect(() => {
    if (!targetRobotId || !isInitialized) return;
    
    log(`[TCP Hook] Recalculation effect - targetRobotId: ${targetRobotId}, hasTool: ${!!currentTool}`);
    
    // Force recalculation when tool changes
    try {
      recalculateEndEffector(targetRobotId);
      log(`[TCP Hook] Forced recalculation for ${targetRobotId}`);
    } catch (error) {
      console.error(`[TCP Hook] Error during recalculation:`, error);
    }
    
  }, [targetRobotId, isInitialized, currentTool, recalculateEndEffector]);
  
  // ========== OPTIMIZED SINGLE EFFECT ==========
  
  // Combined effect: Handle initialization, robot changes, tool changes, and method changes
  useEffect(() => {
    log(`[TCP Hook] Combined effect - targetRobotId: ${targetRobotId}, isInitialized: ${isInitialized}, hasTool: ${!!currentTool}`);
    
    if (!targetRobotId || !isInitialized) {
      log(`[TCP Hook] Reset end effector data - robotId: ${targetRobotId}, initialized: ${isInitialized}`);
      return;
    }
    
    // Single recalculation function
    const updateEndEffector = () => {
      try {
        log(`[TCP Hook] Recalculating end effector for ${targetRobotId}`);
        
        // Try combined method first
        const endEffectorState = recalculateEndEffector(targetRobotId);
        log(`[TCP Hook] recalculateEndEffector returned:`, endEffectorState);
        
        if (endEffectorState) {
          // Update position if available
          if (endEffectorState.position) {
            const extractedPoint = {
              x: endEffectorState.position.x || 0,
              y: endEffectorState.position.y || 0,
              z: endEffectorState.position.z || 0
            };
            log(`[TCP Hook] Set current end effector position:`, extractedPoint);
          }
          
          // Update orientation if available
          if (endEffectorState.orientation) {
            const extractedOrientation = {
              x: endEffectorState.orientation.x || 0,
              y: endEffectorState.orientation.y || 0,
              z: endEffectorState.orientation.z || 0,
              w: endEffectorState.orientation.w || 1
            };
            log(`[TCP Hook] Set current end effector orientation:`, extractedOrientation);
          }
        } else {
          // Fallback: try individual methods if combined call fails
          log(`[TCP Hook] Combined call failed, trying individual methods`);
          
          // Get position
          const currentPoint = getCurrentEndEffectorPoint(targetRobotId);
          log(`[TCP Hook] getCurrentEndEffectorPoint returned:`, currentPoint);
          
          if (currentPoint) {
            const extractedPoint = {
              x: currentPoint.x || 0,
              y: currentPoint.y || 0,
              z: currentPoint.z || 0
            };
            log(`[TCP Hook] Set current end effector position:`, extractedPoint);
          }
          
          // Get orientation
          const currentOrientation = getCurrentEndEffectorOrientation(targetRobotId);
          log(`[TCP Hook] getCurrentEndEffectorOrientation returned:`, currentOrientation);
          
          if (currentOrientation) {
            const extractedOrientation = {
              x: currentOrientation.x || 0,
              y: currentOrientation.y || 0,
              z: currentOrientation.z || 0,
              w: currentOrientation.w || 1
            };
            log(`[TCP Hook] Set current end effector orientation:`, extractedOrientation);
          }
        }
      } catch (error) {
        console.error(`[TCP Hook] Error updating end effector data:`, error);
        // Reset to default values on error
        return;
      }
    };
    
    // Execute the update
    updateEndEffector();
    
  }, [targetRobotId, isInitialized, currentTool, recalculateEndEffector, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation]); // ✅ All dependencies in one place
  
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
    
    // End effector state (position and orientation) - DERIVED FROM CONTEXT
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
    isToolAttached: (toolId) => currentTool?.toolId === toolId,
    
    // New method
    getEndEffectorLink: useCallback(() => {
      if (!targetRobotId) return null;
      return getEndEffectorLinkFromContext(targetRobotId);
    }, [targetRobotId, getEndEffectorLinkFromContext])
  };
};

export default useTCP;