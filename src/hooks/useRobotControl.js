import { useEffect, useState, useCallback } from 'react';
import { useViewer } from '../ViewerContext';
import { useTCPContext } from '../TCPContext'; // Fixed import
import { useRobot } from '../RobotContext';
import EventBus from '../../utils/EventBus';

export const useRobotControl = () => {
  const { isViewerReady, getRobotManager } = useViewer();
  const { activeRobotId } = useRobot();
  const { 
    getCurrentEndEffectorPoint,
    hasToolAttached,
    getToolInfo
  } = useTCPContext(); // Fixed context usage

  const [robot, setRobot] = useState(null);
  const [robotManager, setRobotManager] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('[useRobotControl] State update:', {
      isViewerReady,
      activeRobotId,
      hasRobotManager: !!robotManager,
      hasRobot: !!robot,
      isReady
    });
  }, [isViewerReady, activeRobotId, robotManager, robot, isReady]);

  useEffect(() => {
    if (!isViewerReady || !activeRobotId) {
      setRobot(null);
      setRobotManager(null);
      setIsReady(false);
      return;
    }

    const manager = getRobotManager();
    if (!manager) return;

    setRobotManager(manager);

    // Get the specific robot
    const allRobots = manager.getAllRobots();
    const robotData = allRobots.get(activeRobotId);
    
    if (robotData && robotData.model) {
      setRobot(robotData.model);
      setIsReady(true);
    }

    // Listen for updates
    const handleUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        const updatedRobots = manager.getAllRobots();
        const updatedData = updatedRobots.get(activeRobotId);
        if (updatedData && updatedData.model) {
          setRobot(updatedData.model);
          setIsReady(true);
        }
      }
    };

    const unsubscribe = EventBus.on('robot:updated', handleUpdate);
    return () => unsubscribe();
  }, [isViewerReady, activeRobotId, getRobotManager]);

  const setJointValue = useCallback((jointName, value) => {
    if (!robotManager || !activeRobotId) return false;
    const success = robotManager.setJointValue(activeRobotId, jointName, value);
    
    if (success && hasToolAttached && hasToolAttached(activeRobotId)) {
      // Force TCP end effector recalculation after joint change
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robotManager, activeRobotId, hasToolAttached]);

  const setJointValues = useCallback((values) => {
    if (!robotManager || !activeRobotId) return false;
    const success = robotManager.setJointValues(activeRobotId, values);
    
    if (success && hasToolAttached && hasToolAttached(activeRobotId)) {
      // Force TCP end effector recalculation after joint changes
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robotManager, activeRobotId, hasToolAttached]);

  const resetJoints = useCallback(() => {
    if (!robotManager || !activeRobotId) return;
    robotManager.resetJoints(activeRobotId);
    
    if (hasToolAttached && hasToolAttached(activeRobotId)) {
      // Force TCP end effector recalculation after reset
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [robotManager, activeRobotId, hasToolAttached]);

  const getJointValues = useCallback(() => {
    if (!robotManager || !activeRobotId) return {};
    return robotManager.getJointValues(activeRobotId);
  }, [robotManager, activeRobotId]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotManager || !robotId) return null;
    const allRobots = robotManager.getAllRobots();
    const robotData = allRobots.get(robotId);
    return robotData?.model || null;
  }, [robotManager, activeRobotId]);

  // Get current end effector point (with TCP awareness)
  const currentEndEffectorPoint = getCurrentEndEffectorPoint && activeRobotId ? 
    getCurrentEndEffectorPoint(activeRobotId) : 
    { x: 0, y: 0, z: 0 };

  return {
    // Robot state
    activeRobotId,
    robot,
    robotManager,
    isReady,
    
    // TCP awareness
    currentEndEffectorPoint,
    hasValidEndEffector: !!(currentEndEffectorPoint.x !== 0 || currentEndEffectorPoint.y !== 0 || currentEndEffectorPoint.z !== 0),
    isUsingTCP: hasToolAttached ? hasToolAttached(activeRobotId) : false,
    isUsingRobotEndEffector: activeRobotId && (!hasToolAttached || !hasToolAttached(activeRobotId)),
    
    // Robot control methods
    setJointValue,
    setJointValues,
    resetJoints,
    getJointValues,
    getRobot,
    
    // TCP-specific methods
    getEndEffectorInfo: () => getToolInfo ? getToolInfo(activeRobotId) : null,
    getEndEffectorType: () => {
      if (!activeRobotId) return 'none';
      return (hasToolAttached && hasToolAttached(activeRobotId)) ? 'tcp' : 'robot';
    }
  };
}; 