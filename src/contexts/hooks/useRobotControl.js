import { useEffect, useState, useCallback } from 'react';
import { useActiveRobot } from '../ActiveRobotContext';
import EventBus from '@/utils/EventBus';

export const useRobotControl = (viewerRef) => {
  const { activeRobotId } = useActiveRobot();
  const [robot, setRobot] = useState(null);
  const [robotManager, setRobotManager] = useState(null);

  useEffect(() => {
    if (!viewerRef?.current || !activeRobotId) {
      setRobot(null);
      setRobotManager(null);
      return;
    }

    const manager = viewerRef.current.robotManagerRef?.current;
    if (!manager) return;

    setRobotManager(manager);

    // Get the specific robot
    const allRobots = manager.getAllRobots();
    const robotData = allRobots.get(activeRobotId);
    
    if (robotData && robotData.model) {
      setRobot(robotData.model);
    }

    // Listen for updates
    const handleUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        const updatedRobots = manager.getAllRobots();
        const updatedData = updatedRobots.get(activeRobotId);
        if (updatedData && updatedData.model) {
          setRobot(updatedData.model);
        }
      }
    };

    const unsubscribe = EventBus.on('robot:updated', handleUpdate);
    return () => unsubscribe();
  }, [viewerRef, activeRobotId]);

  const setJointValue = useCallback((jointName, value) => {
    if (!robotManager || !activeRobotId) return false;
    return robotManager.setJointValue(activeRobotId, jointName, value);
  }, [robotManager, activeRobotId]);

  const setJointValues = useCallback((values) => {
    if (!robotManager || !activeRobotId) return false;
    return robotManager.setJointValues(activeRobotId, values);
  }, [robotManager, activeRobotId]);

  const resetJoints = useCallback(() => {
    if (!robotManager || !activeRobotId) return;
    robotManager.resetJoints(activeRobotId);
  }, [robotManager, activeRobotId]);

  const getJointValues = useCallback(() => {
    if (!robotManager || !activeRobotId) return {};
    return robotManager.getJointValues(activeRobotId);
  }, [robotManager, activeRobotId]);

  return {
    activeRobotId,
    robot,
    robotManager,
    setJointValue,
    setJointValues,
    resetJoints,
    getJointValues,
    isReady: !!robot && !!robotManager
  };
}; 