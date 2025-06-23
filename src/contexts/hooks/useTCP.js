// src/contexts/hooks/useTCP.js
// Clean facade hook for TCP and End Effector functionality

import { useCallback, useState, useEffect, useMemo, useContext } from 'react';
import TCPContext from '../TCPContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import EventBus from '../../utils/EventBus';
import { EndEffectorEvents } from '../dataTransfer';

/**
 * Complete TCP and End Effector hook
 * Provides real-time end effector data that is always up to date
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete TCP and End Effector API
 */
export const useTCP = (robotIdOverride = null) => {
  // Get core TCP context
  const tcpContext = useContext(TCPContext);
  
  // Handle case where context is not available
  if (!tcpContext) {
    console.warn('[useTCP] TCPContext not available');
    return createEmptyState();
  }
  
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded } = useRobotManager();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Get robot instance and state
  const robot = robotId ? getRobot(robotId) : null;
  const isRobotReady = robotId ? isRobotLoaded(robotId) : false;
  
  // Local state for real-time end effector tracking
  const [endEffectorState, setEndEffectorState] = useState({
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    hasTCP: false,
    tcpOffset: null,
    toolDimensions: null,
    lastUpdate: null,
    source: null
  });
  
  // Listen for end effector updates
  useEffect(() => {
    if (!robotId) return;
    
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === robotId) {
        const newState = {
          position: data.position,
          orientation: data.orientation,
          hasTCP: data.hasTCP,
          tcpOffset: data.tcpOffset || null,
          toolDimensions: data.toolDimensions || null,
          lastUpdate: data.timestamp,
          source: data.source
        };
        
        setEndEffectorState(newState);
        
        // Always log end effector updates
        console.log(`[useTCP] End Effector Updated for ${robotId}:`, {
          position: `(${data.position.x.toFixed(3)}, ${data.position.y.toFixed(3)}, ${data.position.z.toFixed(3)})`,
          orientation: `(${data.orientation.x.toFixed(3)}, ${data.orientation.y.toFixed(3)}, ${data.orientation.z.toFixed(3)}, ${data.orientation.w.toFixed(3)})`,
          hasTCP: data.hasTCP,
          source: data.source
        });
      }
    };
    
    // Subscribe to end effector updates
    const unsubscribe = EventBus.on(EndEffectorEvents.UPDATED, handleEndEffectorUpdate);
    
    // Request initial state
    EventBus.emit(EndEffectorEvents.Commands.GET_STATE, {
      robotId,
      requestId: `init-${Date.now()}`
    });

    // Poll for latest end effector state every 100ms
    const interval = setInterval(() => {
      EventBus.emit(EndEffectorEvents.Commands.GET_STATE, {
        robotId,
        requestId: `poll-${Date.now()}`
      });
    }, 100);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [robotId]);
  
  // Listen for end effector link (via EventBus)
  useEffect(() => {
    if (!robotId) return;
    const handleLinkResponse = (data) => {
      if (data.robotId === robotId) {
        console.log(`[useTCP] End Effector Link for ${robotId}:`, data.link);
      }
    };
    const unsub = EventBus.on(EndEffectorEvents.Responses.LINK, handleLinkResponse);
    // Emit initial request to start broadcast
    const requestId = `get-link-${Date.now()}`;
    EventBus.emit(EndEffectorEvents.Commands.GET_LINK, { robotId, requestId });
    return () => unsub();
  }, [robotId]);
  
  // Get current tool info
  const currentTool = useMemo(() => {
    if (!robotId || !tcpContext.attachedTools) return null;
    return tcpContext.attachedTools.get(robotId);
  }, [robotId, tcpContext.attachedTools]);
  
  // Tool operations
  const attachTool = useCallback(async (toolId) => {
    if (!robotId) {
      throw new Error('No robot selected');
    }
    
    console.log(`[useTCP] Attaching tool ${toolId} to ${robotId}`);
    await tcpContext.attachTool(robotId, toolId);
  }, [robotId, tcpContext]);
  
  const removeTool = useCallback(async () => {
    if (!robotId || !currentTool) {
      console.warn('[useTCP] No tool to remove');
      return;
    }
    
    console.log(`[useTCP] Removing tool from ${robotId}`);
    await tcpContext.removeTool(robotId);
  }, [robotId, currentTool, tcpContext]);
  
  const setToolTransform = useCallback((transforms) => {
    if (!robotId || !currentTool) {
      console.warn('[useTCP] No tool to transform');
      return;
    }
    
    console.log(`[useTCP] Setting tool transform for ${robotId}:`, transforms);
    tcpContext.setToolTransform(robotId, transforms);
  }, [robotId, currentTool, tcpContext]);
  
  // Force recalculate end effector
  const recalculateEndEffector = useCallback(() => {
    if (!robotId) return;
    
    console.log(`[useTCP] Force recalculating end effector for ${robotId}`);
    EventBus.emit(EndEffectorEvents.Commands.RECALCULATE, { robotId });
  }, [robotId]);
  
  // Return complete API
  return {
    // Robot state
    robotId,
    robot,
    isReady: isRobotReady && tcpContext.isInitialized,
    
    // Tool state
    tool: {
      current: currentTool,
      hasTool: !!currentTool,
      isVisible: currentTool?.visible ?? false,
      transforms: currentTool?.transforms || {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    },
    
    // Available tools
    tools: {
      available: tcpContext.availableTools || [],
      isLoading: tcpContext.isLoading,
      refresh: tcpContext.scanAvailableTools
    },
    
    // Tool operations
    operations: {
      attach: attachTool,
      remove: removeTool,
      setTransform: setToolTransform,
      setVisibility: (visible) => robotId ? tcpContext.setToolVisibility(robotId, visible) : null,
      resetTransforms: () => setToolTransform({
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }),
      toggleVisibility: () => robotId && currentTool ? tcpContext.setToolVisibility(robotId, !currentTool.visible) : null,
      scaleUniform: (scale) => robotId && currentTool ? setToolTransform({
        ...currentTool.transforms,
        scale: { x: scale, y: scale, z: scale }
      }) : null,
      clearError: tcpContext.clearError || (() => {})
    },
    
    // System state for UI
    system: {
      isUpdating: tcpContext.isUpdating ?? false,
      isInitialized: tcpContext.isInitialized ?? false,
      isDisabled: tcpContext.isLoading || !tcpContext.isInitialized,
      lastUpdateTime: endEffectorState.lastUpdate,
    },
    
    // End effector state (ALWAYS UP TO DATE)
    endEffector: {
      ...endEffectorState,
      isValid: !!robotId,
      recalculate: recalculateEndEffector
    }
  };
};

// Helper to create empty state when context is not available
function createEmptyState() {
  return {
    robotId: null,
    robot: null,
    isReady: false,
    tool: {
      current: null,
      hasTool: false,
      isVisible: false,
      transforms: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
    },
    tools: {
      available: [],
      isLoading: false,
      refresh: async () => {}
    },
    operations: {
      attach: async () => {},
      remove: async () => {},
      setTransform: () => {},
      setVisibility: () => {},
      resetTransforms: () => {},
      toggleVisibility: () => {},
      scaleUniform: () => {},
      clearError: () => {}
    },
    system: {
      isUpdating: false,
      isInitialized: false,
      isDisabled: true,
      lastUpdateTime: null,
    },
    endEffector: {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      hasTCP: false,
      tcpOffset: null,
      toolDimensions: null,
      lastUpdate: null,
      source: null,
      isValid: false,
      recalculate: () => {}
    }
  };
}

// Export as default
export default useTCP;