import { useEffect, useState, useCallback } from 'react';
import { useRobotContext } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '../../utils/EventBus';

export const useRobotControl = () => {
  const { 
    activeRobotId, 
    getRobot: getRobotFromContext, 
    isLoaded, 
    loadedRobots,
    setJointValue: setJointValueFromContext,
    setJointValues: setJointValuesFromContext,
    getJointValues: getJointValuesFromContext,
    resetJoints: resetJointsFromContext
  } = useRobotContext();
  const { isViewerReady, viewerInstance } = useViewer();
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

    console.log(`[useRobotControl] Setting up robot control for: ${activeRobotId}`);

    // Get robot from unified context
    const robotFromContext = getRobotFromContext(activeRobotId);
    
    if (robotFromContext) {
      console.log(`[useRobotControl] Found robot in context: ${activeRobotId}`);
      setRobot(robotFromContext);
      setIsReady(true);
    }

    // Listen for robot updates
    const handleRobotUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        console.log(`[useRobotControl] Robot update received for: ${activeRobotId}`);
        
        const updatedRobotFromContext = getRobotFromContext(activeRobotId);
        if (updatedRobotFromContext) {
          setRobot(updatedRobotFromContext);
          setIsReady(true);
        }
      }
    };

    const handleRobotLoaded = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        console.log(`[useRobotControl] Robot loaded event for: ${activeRobotId}`);
        handleRobotUpdate(data);
      }
    };

    const unsubscribeUpdate = EventBus.on('robot:updated', handleRobotUpdate);
    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    
    return () => {
      unsubscribeUpdate();
      unsubscribeLoaded();
    };
  }, [isViewerReady, activeRobotId, getRobotFromContext, loadedRobots]);

  // Joint control methods
  const setJointValue = useCallback((jointName, value) => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for setJointValue');
      return false;
    }

    return setJointValueFromContext(activeRobotId, jointName, value);
  }, [activeRobotId, setJointValueFromContext]);

  const setJointValues = useCallback((values) => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for setJointValues');
      return false;
    }

    return setJointValuesFromContext(activeRobotId, values);
  }, [activeRobotId, setJointValuesFromContext]);

  const getJointValues = useCallback(() => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for getJointValues');
      return {};
    }

    return getJointValuesFromContext(activeRobotId);
  }, [activeRobotId, getJointValuesFromContext]);

  const resetJoints = useCallback(() => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for reset');
      return;
    }

    console.log(`[useRobotControl] Resetting joints for robot ${activeRobotId}`);
    resetJointsFromContext(activeRobotId);

    // Force TCP recalculation if using TCP
    if (isUsingTCP) {
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [activeRobotId, resetJointsFromContext, isUsingTCP]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotId) return null;
    return getRobotFromContext(robotId);
  }, [getRobotFromContext, activeRobotId]);

  return {
    // Robot state
    activeRobotId,
    robot,
    isReady: isReady && !!robot && !!activeRobotId,
    
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
    getEndEffectorType,
    
    // Debug info
    debug: {
      loadedRobots: loadedRobots?.size || 0,
      hasRobotFromContext: !!getRobotFromContext(activeRobotId)
    }
  };
};