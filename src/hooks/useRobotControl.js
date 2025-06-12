import { useEffect, useState, useCallback } from 'react';
import { useRobot } from '../contexts/hooks/useRobot';
import { useViewer } from '../contexts/ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeRobotId, getRobot } = useRobot();
  const { isViewerReady } = useViewer();
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
    if (!isViewerReady || !activeRobotId) {
      setRobot(null);
      setIsReady(false);
      return;
    }

    // Get the specific robot using context
    const robotModel = getRobot(activeRobotId);
    
    if (robotModel) {
      setRobot(robotModel);
      setIsReady(true);
    }

    // Listen for updates
    const handleUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        const updatedRobot = getRobot(activeRobotId);
        if (updatedRobot) {
          setRobot(updatedRobot);
          setIsReady(true);
        }
      }
    };

    const unsubscribe = EventBus.on('robot:updated', handleUpdate);
    return () => unsubscribe();
  }, [isViewerReady, activeRobotId, getRobot]);

  const setJointValue = useCallback((jointName, value) => {
    if (!robot || !activeRobotId) return false;
    const success = robot.setJointValue(activeRobotId, jointName, value);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint change
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robot, activeRobotId, isUsingTCP]);

  const setJointValues = useCallback((values) => {
    if (!robot || !activeRobotId) return false;
    const success = robot.setJointValues(activeRobotId, values);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint changes
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [robot, activeRobotId, isUsingTCP]);

  const resetJoints = useCallback(() => {
    if (!robot || !activeRobotId) return;
    robot.resetJoints(activeRobotId);
    
    if (isUsingTCP) {
      // Force TCP end effector recalculation after reset
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [robot, activeRobotId, isUsingTCP]);

  const getJointValues = useCallback(() => {
    if (!robot || !activeRobotId) return {};
    return robot.getJointValues(activeRobotId);
  }, [robot, activeRobotId]);

  return {
    // Robot state
    activeRobotId,
    robot,
    
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
    
    // TCP-specific methods
    getEndEffectorInfo,
    getEndEffectorType
  };
}; 