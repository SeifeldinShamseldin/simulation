// src/contexts/hooks/useTCP.js
// Complete facade hook that aggregates all TCP-related functionality

import { useCallback, useState, useEffect, useMemo, useContext } from 'react';
import TCPContext from '../TCPContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useJoints } from './useJoints';
import EventBus from '../../utils/EventBus';

/**
 * Complete TCP hook that provides all functionality needed for TCP operations
 * Acts as a facade to aggregate data from multiple contexts
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete TCP API with all necessary data and functions
 */
export const useTCP = (robotIdOverride = null) => {
  // Get core TCP context
  const tcpContext = useContext(TCPContext);
  
  // Handle case where context is not available
  if (!tcpContext) {
    console.warn('[useTCP] TCPContext not available');
    return {
      robotId: null,
      robot: null,
      isReady: false,
      hasJoints: false,
      canOperate: false,
      tool: {
        current: null,
        info: null,
        hasTool: false,
        isVisible: false,
        transforms: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        offset: { x: 0, y: 0, z: 0 }
      },
      tools: {
        available: [],
        isLoading: false,
        error: null,
        getById: () => null
      },
      operations: {
        attach: async () => {},
        remove: async () => {},
        setTransform: () => {},
        toggleVisibility: () => {},
        resetTransforms: () => {},
        scaleUniform: () => {},
        refresh: async () => {},
        clearError: () => {}
      },
      endEffector: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        hasValid: false,
        isUsing: false,
        type: null,
        state: () => ({ position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, hasValid: false })
      },
      system: {
        isInitialized: false,
        isUpdating: false,
        lastUpdateTime: null,
        canAttach: false,
        canTransform: false,
        isDisabled: true
      },
      utils: {
        recalculateEndEffector: () => null,
        getCurrentEndEffectorPoint: () => ({ x: 0, y: 0, z: 0 }),
        getCurrentEndEffectorOrientation: () => ({ x: 0, y: 0, z: 0, w: 1 })
      }
    };
  }
  
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded } = useRobotManager();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Get robot instance and state
  const robot = robotId ? getRobot(robotId) : null;
  const isRobotReady = robotId ? isRobotLoaded(robotId) : false;
  const isReady = isRobotReady;
  
  // Get joint control functions
  const { getJointValues } = useJoints(robotId);
  
  // Local state for UI feedback
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Robot state helpers
  const hasJoints = robot && robot.joints && Object.keys(robot.joints).length > 0;
  const canOperate = isReady && hasJoints && robotId;
  
  // Get tool by ID helper
  const getToolById = useCallback((toolId) => {
    if (!toolId || !tcpContext.availableTools) return null;
    return tcpContext.availableTools.find(tool => tool.id === toolId) || null;
  }, [tcpContext.availableTools]);
  
  // Get current tool info
  const currentToolInfo = useMemo(() => {
    if (!robotId || !tcpContext.attachedTools) return null;
    const toolData = tcpContext.attachedTools.get(robotId);
    if (!toolData) return null;
    return getToolById(toolData.toolId);
  }, [robotId, tcpContext.attachedTools, getToolById]);
  
  // Get current tool data
  const currentTool = useMemo(() => {
    if (!robotId || !tcpContext.attachedTools) return null;
    return tcpContext.attachedTools.get(robotId);
  }, [robotId, tcpContext.attachedTools]);
  
  // Enhanced attach tool with validation
  const attachToolWithValidation = useCallback(async (toolId) => {
    if (!canOperate) {
      console.warn('[useTCP] Cannot attach tool - robot not ready');
      throw new Error('Robot not ready');
    }
    
    if (!robotId) {
      console.warn('[useTCP] Cannot attach tool - no robot ID');
      throw new Error('No robot selected');
    }
    
    setIsUpdating(true);
    
    try {
      EventBus.emit('tcp:attaching-tool', { robotId, toolId });
      await tcpContext.attachTool(robotId, toolId);
      
      setLastUpdateTime(new Date().toLocaleTimeString());
      EventBus.emit('tcp:tool-attached', { 
        robotId, 
        toolId
      });
      
      return true;
    } catch (error) {
      EventBus.emit('tcp:attach-error', { robotId, toolId, error });
      throw error;
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, [canOperate, robotId, tcpContext]);
  
  // Enhanced remove tool with validation
  const removeToolWithValidation = useCallback(async () => {
    if (!robotId || !currentTool) {
      console.warn('[useTCP] No tool to remove');
      return;
    }
    
    setIsUpdating(true);
    
    try {
      EventBus.emit('tcp:removing-tool', { robotId });
      await tcpContext.removeTool(robotId);
      
      setLastUpdateTime(new Date().toLocaleTimeString());
      EventBus.emit('tcp:tool-removed', { robotId });
    } catch (error) {
      EventBus.emit('tcp:remove-error', { robotId, error });
      throw error;
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, [robotId, currentTool, tcpContext]);
  
  // Enhanced set transform with validation
  const setToolTransformWithValidation = useCallback((transforms) => {
    if (!robotId || !currentTool) {
      console.warn('[useTCP] No tool to transform');
      return;
    }
    
    setIsUpdating(true);
    tcpContext.setToolTransform(robotId, transforms);
    setLastUpdateTime(new Date().toLocaleTimeString());
    
    EventBus.emit('tcp:tool-transform-changed', {
      robotId,
      transforms
    });
    
    setTimeout(() => setIsUpdating(false), 200);
  }, [robotId, currentTool, tcpContext]);
  
  // Toggle visibility with feedback
  const toggleToolVisibility = useCallback(() => {
    if (!robotId || !currentTool) return;
    
    setIsUpdating(true);
    const newVisibility = !currentTool.visible;
    tcpContext.setToolVisibility(robotId, newVisibility);
    
    EventBus.emit('tcp:visibility-changed', {
      robotId,
      visible: newVisibility
    });
    
    setTimeout(() => setIsUpdating(false), 200);
  }, [robotId, currentTool, tcpContext]);
  
  // Reset transforms with feedback
  const resetTransformsWithFeedback = useCallback(() => {
    if (!robotId || !currentTool) return;
    
    setIsUpdating(true);
    const defaultTransforms = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    tcpContext.setToolTransform(robotId, defaultTransforms);
    setLastUpdateTime(new Date().toLocaleTimeString());
    
    EventBus.emit('tcp:transforms-reset', { robotId });
    
    setTimeout(() => setIsUpdating(false), 200);
  }, [robotId, currentTool, tcpContext]);
  
  // Scale uniform with feedback
  const scaleUniformWithFeedback = useCallback((scale) => {
    if (!robotId || !currentTool) return;
    
    setIsUpdating(true);
    const newTransforms = {
      ...currentTool.transforms,
      scale: { x: scale, y: scale, z: scale }
    };
    tcpContext.setToolTransform(robotId, newTransforms);
    setLastUpdateTime(new Date().toLocaleTimeString());
    
    EventBus.emit('tcp:scale-applied', { robotId, scale });
    
    setTimeout(() => setIsUpdating(false), 200);
  }, [robotId, currentTool, tcpContext]);
  
  // Refresh tools with loading state
  const refreshToolsWithLoading = useCallback(async () => {
    setIsUpdating(true);
    
    try {
      await tcpContext.loadAvailableTools();
      setLastUpdateTime(new Date().toLocaleTimeString());
      EventBus.emit('tcp:tools-refreshed', { robotId });
    } catch (error) {
      EventBus.emit('tcp:refresh-error', { robotId, error });
      throw error;
    } finally {
      setTimeout(() => setIsUpdating(false), 500);
    }
  }, [tcpContext, robotId]);
  
  // Get end effector state
  const getEndEffectorState = useCallback(() => {
    if (!robotId) {
      return {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        hasValid: false
      };
    }
    
    return {
      position: tcpContext.getCurrentEndEffectorPoint?.(robotId) || { x: 0, y: 0, z: 0 },
      orientation: tcpContext.getCurrentEndEffectorOrientation?.(robotId) || { x: 0, y: 0, z: 0, w: 1 },
      hasValid: true
    };
  }, [robotId, tcpContext]);
  
  // Listen for TCP events
  useEffect(() => {
    if (!robotId) return;
    
    const handleTCPEvent = (data) => {
      if (data.robotId === robotId) {
        setLastUpdateTime(new Date().toLocaleTimeString());
      }
    };
    
    const unsubscribes = [
      EventBus.on('tcp:tool-attached', handleTCPEvent),
      EventBus.on('tcp:tool-removed', handleTCPEvent),
      EventBus.on('tcp:tool-transform-changed', handleTCPEvent)
    ];
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, [robotId]);
  
  // Return complete API
  return {
    // Robot state
    robotId,
    robot,
    isReady,
    hasJoints,
    canOperate,
    
    // Tool state
    tool: {
      current: currentTool,
      info: currentToolInfo,
      hasTool: !!currentTool,
      isVisible: currentTool?.visible ?? false,
      transforms: currentTool?.transforms || {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      offset: currentTool?.transforms?.position || { x: 0, y: 0, z: 0 }
    },
    
    // Available tools
    tools: {
      available: tcpContext.availableTools || [],
      isLoading: tcpContext.isLoading,
      error: tcpContext.error,
      getById: getToolById
    },
    
    // Tool operations
    operations: {
      attach: attachToolWithValidation,
      remove: removeToolWithValidation,
      setTransform: setToolTransformWithValidation,
      toggleVisibility: toggleToolVisibility,
      resetTransforms: resetTransformsWithFeedback,
      scaleUniform: scaleUniformWithFeedback,
      refresh: refreshToolsWithLoading,
      clearError: tcpContext.clearError
    },
    
    // End effector state
    endEffector: {
      position: tcpContext.getCurrentEndEffectorPoint?.(robotId) || { x: 0, y: 0, z: 0 },
      orientation: tcpContext.getCurrentEndEffectorOrientation?.(robotId) || { x: 0, y: 0, z: 0, w: 1 },
      hasValid: !!robotId,
      isUsing: !!currentTool,
      type: currentTool ? 'tcp' : 'robot',
      state: getEndEffectorState()
    },
    
    // System state
    system: {
      isInitialized: tcpContext.isInitialized,
      isUpdating,
      lastUpdateTime,
      canAttach: canOperate && !currentTool && !isUpdating,
      canTransform: !!currentTool && !isUpdating,
      isDisabled: tcpContext.isLoading || !tcpContext.isInitialized || isUpdating
    },
    
    // Utility functions
    utils: {
      recalculateEndEffector: () => robotId ? tcpContext.recalculateEndEffector?.(robotId) : null,
      getCurrentEndEffectorPoint: () => robotId ? tcpContext.getCurrentEndEffectorPoint?.(robotId) : { x: 0, y: 0, z: 0 },
      getCurrentEndEffectorOrientation: () => robotId ? tcpContext.getCurrentEndEffectorOrientation?.(robotId) : { x: 0, y: 0, z: 0, w: 1 }
    }
  };
};

// Export as default
export default useTCP;