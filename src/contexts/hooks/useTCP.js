// src/contexts/hooks/useTCP.js - Updated to work with TCP Provider
import { useState, useEffect } from 'react';
import { useRobot } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import { useRobotControl } from './useRobotControl';
import tcpProvider from '../../core/IK/TCP/TCPProvider';
import EventBus from '../../utils/EventBus';

const useTCP = () => {
  const { isViewerReady } = useViewer();
  const { robot, isReady } = useRobotControl();
  const [tcpPosition, setTcpPosition] = useState({ x: 0, y: 0, z: 0 });
  const [tcpSettings, setTcpSettings] = useState({
    visible: true,
    size: 0.03,
    color: '#ff0000',
    offset: { x: 0.0, y: 0, z: 0 }
  });
  
  useEffect(() => {
    if (robot && isReady) {
      tcpProvider.setRobot(robot);
    }

    // EventBus listeners
    const unsubscribePosition = EventBus.on('tcp:active-position-updated', (data) => {
      setTcpPosition(data.position);
    });
    
    const unsubscribeSettings = EventBus.on('tcp:active-settings-updated', (data) => {
      setTcpSettings(data.settings);
    });
    
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
  }, [robot, isReady]);
  
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
  
  const moveToPosition = async (targetPosition) => {
    try {
      const { robot } = useRobotControl();
      if (!robot) {
        throw new Error("No robot loaded");
      }
      
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
    tcpProvider,
  };
};

export default useTCP;