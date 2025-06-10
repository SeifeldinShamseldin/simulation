import { useCallback } from 'react';
import { useRobot } from './useRobot';
import EventBus from '../../utils/EventBus';

export const useRobotControl = () => {
  const {
    activeId: activeRobotId,
    setJointValue: contextSetJointValue,
    setJointValues: contextSetJointValues,
    getJointValues: contextGetJointValues,
    resetJoints: contextResetJoints,
    get3DRobot,
    isUsingTCP
  } = useRobot();

  const setJointValue = useCallback((jointName, value) => {
    if (!activeRobotId) return false;
    const success = contextSetJointValue(activeRobotId, jointName, value);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint change
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [activeRobotId, contextSetJointValue, isUsingTCP]);

  const setJointValues = useCallback((values) => {
    if (!activeRobotId) return false;
    const success = contextSetJointValues(activeRobotId, values);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint changes
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
    
    return success;
  }, [activeRobotId, contextSetJointValues, isUsingTCP]);

  const resetJoints = useCallback(() => {
    if (!activeRobotId) return;
    contextResetJoints(activeRobotId);
    
    if (isUsingTCP) {
      // Force TCP end effector recalculation after reset
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [activeRobotId, contextResetJoints, isUsingTCP]);

  const getJointValues = useCallback(() => {
    if (!activeRobotId) return {};
    return contextGetJointValues(activeRobotId);
  }, [activeRobotId, contextGetJointValues]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotId) return null;
    return get3DRobot(robotId);
  }, [activeRobotId, get3DRobot]);

  return {
    // Robot state
    activeRobotId,
    robot: getRobot(),
    isReady: !!activeRobotId,
    
    // TCP awareness
    isUsingTCP,
    
    // Robot control methods
    setJointValue,
    setJointValues,
    resetJoints,
    getJointValues,
    getRobot
  };
}; 