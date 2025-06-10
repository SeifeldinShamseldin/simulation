import { useEffect, useState, useCallback } from 'react';
import { useRobotSelection } from './useRobot';
import { useViewer } from '../ViewerContext';
import { useRobotManager } from './useRobotManager'; // ← 🎯 USE ROBOT MANAGER CONTEXT DIRECTLY
import { useTCP } from './useTCP';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeId: activeRobotId } = useRobotSelection();
  const { isViewerReady } = useViewer();
  const robotManager = useRobotManager(); // ← 🎯 USE CONTEXT DIRECTLY
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

    // 🎯 CRITICAL FIX: Extract actual robot name from workspace robot ID
    // Workspace robot ID: "crx10ial_1749533150114"
    // Robot manager expects: "crx10ial"
    const actualRobotName = activeRobotId.includes('_') ? activeRobotId.split('_')[0] : activeRobotId;
    
    console.log(`[useRobotControl] Active robot ID: ${activeRobotId}`);
    console.log(`[useRobotControl] Actual robot name for robot manager: ${actualRobotName}`);
    console.log(`[useRobotControl] Available robots in manager:`, Array.from(robotManager.robots.keys()));

    // Get the specific robot using the actual robot name
    const robotModel = robotManager.getRobot(actualRobotName);
    
    if (robotModel) {
      setRobot(robotModel);
      setIsReady(true);
      console.log(`[useRobotControl] Robot ${actualRobotName} found and ready`);
    } else {
      console.warn(`[useRobotControl] Robot ${actualRobotName} not found in robotManager`);
      console.log(`[useRobotControl] Available robots:`, Array.from(robotManager.robots.keys()));
    }

    // Listen for updates
    const handleUpdate = (data) => {
      const dataRobotName = data.robotId || data.robotName;
      if (dataRobotName === activeRobotId || dataRobotName === actualRobotName) {
        const updatedRobot = robotManager.getRobot(actualRobotName);
        if (updatedRobot) {
          setRobot(updatedRobot);
          setIsReady(true);
        }
      }
    };

    const unsubscribe = EventBus.on('robot:updated', handleUpdate);
    return () => unsubscribe();
  }, [isViewerReady, activeRobotId, robotManager]);

  // Helper function to get actual robot name
  const getActualRobotName = useCallback(() => {
    return activeRobotId ? (activeRobotId.includes('_') ? activeRobotId.split('_')[0] : activeRobotId) : null;
  }, [activeRobotId]);

  const setJointValue = useCallback((jointName, value) => {
    const actualRobotName = getActualRobotName();
    if (!robotManager || !actualRobotName) {
      console.warn(`[useRobotControl] Cannot set joint - robotManager: ${!!robotManager}, actualRobotName: ${actualRobotName}`);
      return false;
    }
    
    const success = robotManager.setJointValue(actualRobotName, jointName, value);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint change
      EventBus.emit('tcp:force-recalculate', { robotId: actualRobotName });
    }
    
    return success;
  }, [robotManager, getActualRobotName, isUsingTCP]);

  const setJointValues = useCallback((values) => {
    const actualRobotName = getActualRobotName();
    if (!robotManager || !actualRobotName) {
      console.warn(`[useRobotControl] Cannot set joints - robotManager: ${!!robotManager}, actualRobotName: ${actualRobotName}`);
      return false;
    }
    
    const success = robotManager.setJointValues(actualRobotName, values);
    
    if (success && isUsingTCP) {
      // Force TCP end effector recalculation after joint changes
      EventBus.emit('tcp:force-recalculate', { robotId: actualRobotName });
    }
    
    return success;
  }, [robotManager, getActualRobotName, isUsingTCP]);

  const resetJoints = useCallback(() => {
    const actualRobotName = getActualRobotName();
    if (!robotManager || !actualRobotName) {
      console.warn(`[useRobotControl] Cannot reset joints - robotManager: ${!!robotManager}, actualRobotName: ${actualRobotName}`);
      return;
    }
    
    robotManager.resetJoints(actualRobotName);
    
    if (isUsingTCP) {
      // Force TCP end effector recalculation after reset
      EventBus.emit('tcp:force-recalculate', { robotId: actualRobotName });
    }
  }, [robotManager, getActualRobotName, isUsingTCP]);

  const getJointValues = useCallback(() => {
    const actualRobotName = getActualRobotName();
    if (!robotManager || !actualRobotName) {
      console.warn(`[useRobotControl] Cannot get joints - robotManager: ${!!robotManager}, actualRobotName: ${actualRobotName}`);
      return {};
    }
    
    return robotManager.getJointValues(actualRobotName);
  }, [robotManager, getActualRobotName]);

  const getRobot = useCallback((robotId = null) => {
    const targetRobotName = robotId || getActualRobotName();
    if (!robotManager || !targetRobotName) return null;
    
    // Extract actual robot name if workspace ID is provided
    const actualName = targetRobotName.includes('_') ? targetRobotName.split('_')[0] : targetRobotName;
    return robotManager.getRobot(actualName);
  }, [robotManager, getActualRobotName]);

  return {
    // Robot state
    activeRobotId,
    robot,
    robotManager, // ← 🎯 PROVIDE CONTEXT DIRECTLY
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