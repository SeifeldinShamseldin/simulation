import { useEffect, useState, useCallback } from 'react';
import { useRobotSelection } from './useRobot';
import { useViewer } from '../ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeId: activeRobotId } = useRobotSelection();
  const { isViewerReady, getRobotManager } = useViewer();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  const [robot, setRobot] = useState(null);
  const [robotManager, setRobotManager] = useState(null);
  const [isReady, setIsReady] = useState(false);

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
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint change
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robotManager, activeRobotId, isUsingTCP]);

  const setJointValues = useCallback((values) => {
    if (!robotManager || !activeRobotId) return false;
    const success = robotManager.setJointValues(activeRobotId, values);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint changes
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robotManager, activeRobotId, isUsingTCP]);

  const resetJoints = useCallback(() => {
    if (!robotManager || !activeRobotId) return;
    robotManager.resetJoints(activeRobotId);
    
    if (isUsingTCP) {
      // Force TCP end effector recalculation after reset
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [robotManager, activeRobotId, isUsingTCP]);

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

  return {
    // Robot state
    activeRobotId,
    robot,
    robotManager,
    isReady,
    
    // TCP awareness
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    
    // Robot control methods
    setJointValue,
    setJointValues,
    resetJoints,
    getJointValues,
    getRobot,
    
    // TCP-specific methods
    getEndEffectorInfo,
    getEndEffectorType
  };
}; 