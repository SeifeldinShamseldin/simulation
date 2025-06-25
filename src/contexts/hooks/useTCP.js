// src/contexts/hooks/useTCP.js
// Consolidated hook that combines TCP and EndEffector functionality
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTCP as useTCPContext } from '../TCPContext';
import { useEndEffector } from '../EndEffectorContext';
import { useRobotSelection } from './useRobotManager';
import EventBus from '../../utils/EventBus';
import { EndEffectorEvents, TCPEvents } from '../dataTransfer';

const useTCP = (robotId = null) => {
  // Get contexts
  const tcpContext = useTCPContext();
  const endEffectorContext = useEndEffector();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Local state
  const [system, setSystem] = useState({
    isInitialized: false,
    isUpdating: false,
    isDisabled: false,
    lastUpdateTime: null
  });
  
  const [endEffector, setEndEffector] = useState({
    pose: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    baseLink: null,
    endEffectorLink: null
  });
  
  const [tools, setTools] = useState({
    available: [],
    error: null
  });
  
  // Track current tool state
  const [tool, setTool] = useState({
    hasTool: false,
    current: null,
    isVisible: true,
    transforms: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    info: null
  });
  
  // Initialize and load available tools
  useEffect(() => {
    const loadTools = async () => {
      try {
        setSystem(prev => ({ ...prev, isUpdating: true }));
        await tcpContext.scanAvailableTools();
        const availableTools = tcpContext.getAvailableTools() || [];
        setTools({ available: availableTools, error: null });
        setSystem(prev => ({ 
          ...prev, 
          isInitialized: true, 
          isUpdating: false,
          lastUpdateTime: new Date().toLocaleTimeString()
        }));
      } catch (err) {
        console.error('[useTCP] Error loading tools:', err);
        setTools(prev => ({ ...prev, error: err.message }));
        setSystem(prev => ({ ...prev, isUpdating: false }));
      }
    };
    
    loadTools();
  }, [tcpContext]);
  
  // Update tool state when robot changes
  useEffect(() => {
    if (!targetRobotId) {
      setTool({
        hasTool: false,
        current: null,
        isVisible: true,
        transforms: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        info: null
      });
      return;
    }
    
    const attachedTool = tcpContext.getAttachedTool(targetRobotId);
    if (attachedTool) {
      const tcpData = tcpContext.getTCP(targetRobotId);
      setTool({
        hasTool: true,
        current: attachedTool,
        isVisible: tcpData?.visible ?? true,
        transforms: {
          position: tcpData?.position || { x: 0, y: 0, z: 0 },
          rotation: tcpData?.rotation || { x: 0, y: 0, z: 0 },
          scale: tcpData?.scale || { x: 1, y: 1, z: 1 }
        },
        info: {
          name: attachedTool.toolName,
          type: attachedTool.toolType,
          id: attachedTool.toolId
        }
      });
    } else {
      setTool(prev => ({
        ...prev,
        hasTool: false,
        current: null
      }));
    }
  }, [targetRobotId, tcpContext]);
  
  // Listen for end effector updates
  useEffect(() => {
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === targetRobotId) {
        setEndEffector({
          pose: data.pose || { x: 0, y: 0, z: 0 },
          orientation: data.orientation || { x: 0, y: 0, z: 0, w: 1 },
          baseLink: data.baseLink,
          endEffectorLink: data.endEffector
        });
      }
    };
    
    const unsubscribe = EventBus.on(EndEffectorEvents.SET, handleEndEffectorUpdate);
    
    // Request initial data
    if (targetRobotId) {
      EventBus.emit(EndEffectorEvents.GET);
    }
    
    return () => unsubscribe();
  }, [targetRobotId]);
  
  // Operations
  const operations = {
    attach: useCallback(async (toolId) => {
      if (!targetRobotId) {
        throw new Error('No robot selected');
      }
      
      setSystem(prev => ({ ...prev, isUpdating: true, isDisabled: true }));
      
      try {
        await tcpContext.addTCPById(targetRobotId, toolId);
        setSystem(prev => ({ 
          ...prev, 
          isUpdating: false, 
          isDisabled: false,
          lastUpdateTime: new Date().toLocaleTimeString()
        }));
      } catch (err) {
        console.error('[useTCP] Error attaching tool:', err);
        setTools(prev => ({ ...prev, error: err.message }));
        setSystem(prev => ({ ...prev, isUpdating: false, isDisabled: false }));
        throw err;
      }
    }, [targetRobotId, tcpContext]),
    
    remove: useCallback(async () => {
      if (!targetRobotId) {
        throw new Error('No robot selected');
      }
      
      setSystem(prev => ({ ...prev, isUpdating: true, isDisabled: true }));
      
      try {
        await tcpContext.removeTCP(targetRobotId);
        setSystem(prev => ({ 
          ...prev, 
          isUpdating: false, 
          isDisabled: false,
          lastUpdateTime: new Date().toLocaleTimeString()
        }));
      } catch (err) {
        console.error('[useTCP] Error removing tool:', err);
        setTools(prev => ({ ...prev, error: err.message }));
        setSystem(prev => ({ ...prev, isUpdating: false, isDisabled: false }));
        throw err;
      }
    }, [targetRobotId, tcpContext]),
    
    toggleVisibility: useCallback(() => {
      if (!targetRobotId || !tool.hasTool) return;
      
      const newVisibility = !tool.isVisible;
      tcpContext.setTCPVisibility(targetRobotId, newVisibility);
      setTool(prev => ({ ...prev, isVisible: newVisibility }));
      
      setSystem(prev => ({ 
        ...prev, 
        lastUpdateTime: new Date().toLocaleTimeString()
      }));
    }, [targetRobotId, tool.hasTool, tool.isVisible, tcpContext]),
    
    setTransform: useCallback((transforms) => {
      if (!targetRobotId || !tool.hasTool) return;
      
      tcpContext.setTCPTransform(targetRobotId, transforms);
      setTool(prev => ({ ...prev, transforms }));
      
      setSystem(prev => ({ 
        ...prev, 
        lastUpdateTime: new Date().toLocaleTimeString()
      }));
    }, [targetRobotId, tool.hasTool, tcpContext]),
    
    resetTransforms: useCallback(() => {
      const defaultTransforms = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      };
      
      if (!targetRobotId || !tool.hasTool) return;
      
      tcpContext.setTCPTransform(targetRobotId, defaultTransforms);
      setTool(prev => ({ ...prev, transforms: defaultTransforms }));
      
      setSystem(prev => ({ 
        ...prev, 
        lastUpdateTime: new Date().toLocaleTimeString()
      }));
    }, [targetRobotId, tool.hasTool, tcpContext]),
    
    scaleUniform: useCallback((scale) => {
      if (!targetRobotId || !tool.hasTool) return;
      
      const newTransforms = {
        ...tool.transforms,
        scale: { x: scale, y: scale, z: scale }
      };
      
      tcpContext.setTCPTransform(targetRobotId, newTransforms);
      setTool(prev => ({ ...prev, transforms: newTransforms }));
      
      setSystem(prev => ({ 
        ...prev, 
        lastUpdateTime: new Date().toLocaleTimeString()
      }));
    }, [targetRobotId, tool.hasTool, tool.transforms, tcpContext]),
    
    refresh: useCallback(async () => {
      setSystem(prev => ({ ...prev, isUpdating: true }));
      
      try {
        await tcpContext.scanAvailableTools();
        const availableTools = tcpContext.getAvailableTools() || [];
        setTools({ available: availableTools, error: null });
        setSystem(prev => ({ 
          ...prev, 
          isUpdating: false,
          lastUpdateTime: new Date().toLocaleTimeString()
        }));
      } catch (err) {
        console.error('[useTCP] Error refreshing tools:', err);
        setTools(prev => ({ ...prev, error: err.message }));
        setSystem(prev => ({ ...prev, isUpdating: false }));
      }
    }, [tcpContext]),
    
    clearError: useCallback(() => {
      setTools(prev => ({ ...prev, error: null }));
    }, [])
  };
  
  // Return consolidated API
  return {
    // Robot info
    robotId: targetRobotId,
    isReady: !!targetRobotId && system.isInitialized,
    
    // Tool state
    tool,
    tools,
    
    // Operations
    operations,
    
    // System state
    system,
    
    // End effector data
    endEffector
  };
};

export default useTCP;