// src/contexts/hooks/useTCP.js - Updated to work with TCP Provider
import { useState, useEffect } from 'react';
import { useRobot } from '../RobotContext';
import tcpProvider from '../../core/IK/TCP/TCPProvider';
import EventBus from '../../utils/EventBus';

const useTCP = () => {
  const { viewerRef } = useRobot();
  const [tcpPosition, setTcpPosition] = useState({ x: 0, y: 0, z: 0 });
  const [tcpSettings, setTcpSettings] = useState({
    visible: true,
    size: 0.03,
    color: '#ff0000',
    offset: { x: 0.0, y: 0, z: 0 }
  });
  
  // Subscribe to EventBus instead of direct TCP provider
  useEffect(() => {
    // Set up robot connection
    if (viewerRef?.current) {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        tcpProvider.setRobot(robot);
      }
    }

    // LISTEN TO EVENTBUS for position updates
    const unsubscribePosition = EventBus.on('tcp:active-position-updated', (data) => {
      setTcpPosition(data.position);
    });
    
    // LISTEN TO EVENTBUS for settings updates
    const unsubscribeSettings = EventBus.on('tcp:active-settings-updated', (data) => {
      setTcpSettings(data.settings);
    });
    
    // LISTEN TO EVENTBUS for TCP activation
    const unsubscribeActivated = EventBus.on('tcp:activated', (data) => {
      if (data.tcp) {
        setTcpPosition(data.tcp.position);
        setTcpSettings(data.tcp.settings);
      }
    });
    
    // Load initial data
    const activeTcp = tcpProvider.getActiveTCP();
    if (activeTcp) {
      setTcpPosition(activeTcp.position);
      setTcpSettings(activeTcp.settings);
    }
    
    return () => {
      unsubscribePosition();
      unsubscribeSettings();
      unsubscribeActivated();
    };
  }, [viewerRef]);
  
  // Monitor robot changes and update TCP Provider
  useEffect(() => {
    if (!viewerRef?.current) return;

    const checkRobot = () => {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        tcpProvider.setRobot(robot);
      }
    };

    checkRobot();
    const interval = setInterval(checkRobot, 1000);

    return () => clearInterval(interval);
  }, [viewerRef]);
  
  // Handle TCP setting changes (delegates to TCP Provider)
  const handleTcpChange = (name, value) => {
    const activeTcp = tcpProvider.getActiveTCP();
    if (!activeTcp) return;
    
    if (name.startsWith('offset.')) {
      const offsetKey = name.split('.')[1];
      const normalizedValue = parseFloat(value);
      
      const newOffset = {
        ...activeTcp.settings.offset,
        [offsetKey]: isNaN(normalizedValue) ? 0 : normalizedValue
      };
      
      tcpProvider.updateTCPSettings(activeTcp.id, { offset: newOffset });
    } else if (name === 'size') {
      const normalizedValue = parseFloat(value);
      tcpProvider.updateTCPSettings(activeTcp.id, { 
        size: isNaN(normalizedValue) ? activeTcp.settings.size : normalizedValue 
      });
    } else {
      tcpProvider.updateTCPSettings(activeTcp.id, { [name]: value });
    }
  };
  
  // Move TCP to a target position using IK
  const moveToPosition = async (targetPosition) => {
    try {
      if (!viewerRef.current) {
        throw new Error("Viewer not initialized");
      }
      
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) {
        throw new Error("No robot loaded");
      }
      
      // Use the updated IKAPI which now integrates with TCP Provider
      const ikAPI = await import('../../core/IK/API/IKAPI');
      return await ikAPI.default.executeIK(robot, targetPosition, {
        animate: true,
      });
    } catch (error) {
      console.error("Error moving to position:", error);
      return false;
    }
  };
  
  return {
    tcpPosition,
    tcpSettings,
    handleTcpChange,
    moveToPosition,
    // Additional TCP management functions
    tcpProvider, // Expose provider for advanced usage
  };
};

export default useTCP; 