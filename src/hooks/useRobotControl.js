import { useEffect, useState, useCallback } from 'react';
import { useRobotSelection } from './useRobot';
import { useViewer } from '../contexts/ViewerContext';
import { useRobotManager } from './useRobotManager'; // ← 🎯 USE ROBOT MANAGER CONTEXT
import { useTCP } from './useTCP';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeId: activeRobotId } = useRobotSelection();
  const { isViewerReady } = useViewer();
  const robotManager = useRobotManager(); // ← 🎯 USE CONTEXT INSTEAD OF REF
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isViewerReady || !activeRobotId || !robotManager) {
      setRobot(null);
      setIsReady(false);
      return;
    }

    // Get the specific robot using context
    const robotModel = robotManager.getRobot(activeRobotId);
    
    if (robotModel) {
      setRobot(robotModel);
      setIsReady(true);
    }

    // Listen for updates
    const handleUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        const updatedRobot = robotManager.getRobot(activeRobotId);
        if (updatedRobot) {
          setRobot(updatedRobot);
          setIsReady(true);
        }
      }
    };

    const unsubscribe = EventBus.on('robot:updated', handleUpdate);
    return () => unsubscribe();
  }, [isViewerReady, activeRobotId, robotManager]);

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
    return robotManager.getRobot(robotId);
  }, [robotManager, activeRobotId]);

  return {
    // Robot state
    activeRobotId,
    robot,
    robotManager, // ← 🎯 PROVIDE CONTEXT INSTEAD OF REF
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