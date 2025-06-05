import { useEffect, useState, useCallback } from 'react';
import { useRobot } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeRobotId } = useRobot();
  const { isViewerReady, getRobotManager } = useViewer();
  const [robot, setRobot] = useState(null);
  const [robotManager, setRobotManager] = useState(null);

  useEffect(() => {
    if (!isViewerReady || !activeRobotId) {
      setRobot(null);
      setRobotManager(null);
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
  }, [isViewerReady, activeRobotId, getRobotManager]);

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