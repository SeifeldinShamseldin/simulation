import { useEffect, useState, useCallback } from 'react';
import { useRobot } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '@/utils/EventBus';

export const useRobotControl = () => {
  const { activeRobotId } = useRobot();
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
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isViewerReady || !activeRobotId) {
      setRobot(null);
      setRobotManager(null);
      setIsReady(false);
      setError(null);
      return;
    }

    try {
      const manager = getRobotManager();
      if (!manager) {
        setError('Robot manager not available');
        return;
      }

      setRobotManager(manager);
      setError(null);

      // Get the specific robot
      const allRobots = manager.getAllRobots();
      const robotData = allRobots.get(activeRobotId);
      
      if (robotData && robotData.model) {
        setRobot(robotData.model);
        setIsReady(true);
      } else {
        setError(`Robot ${activeRobotId} not found`);
        setIsReady(false);
      }

      // Listen for updates
      const handleUpdate = (data) => {
        if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
          const updatedRobots = manager.getAllRobots();
          const updatedData = updatedRobots.get(activeRobotId);
          if (updatedData && updatedData.model) {
            setRobot(updatedData.model);
            setIsReady(true);
            setError(null);
          } else {
            setError(`Robot ${activeRobotId} not found after update`);
            setIsReady(false);
          }
        }
      };

      const unsubscribe = EventBus.on('robot:updated', handleUpdate);
      return () => unsubscribe();
    } catch (err) {
      setError(`Error initializing robot control: ${err.message}`);
      setIsReady(false);
    }
  }, [isViewerReady, activeRobotId, getRobotManager]);

  const setJointValue = useCallback((jointName, value) => {
    if (!robotManager || !activeRobotId) {
      setError('Robot manager or active robot not available');
      return false;
    }

    try {
      const success = robotManager.setJointValue(activeRobotId, jointName, value);
      
      if (success) {
        // Force end effector recalculation (works for both TCP and robot end effector)
        EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
        setError(null);
      } else {
        setError(`Failed to set joint ${jointName}`);
      }
      
      return success;
    } catch (err) {
      setError(`Error setting joint value: ${err.message}`);
      return false;
    }
  }, [robotManager, activeRobotId]);

  const setJointValues = useCallback((values) => {
    if (!robotManager || !activeRobotId) {
      setError('Robot manager or active robot not available');
      return false;
    }

    try {
      const success = robotManager.setJointValues(activeRobotId, values);
      
      if (success) {
        // Force end effector recalculation (works for both TCP and robot end effector)
        EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
        setError(null);
      } else {
        setError('Failed to set joint values');
      }
      
      return success;
    } catch (err) {
      setError(`Error setting joint values: ${err.message}`);
      return false;
    }
  }, [robotManager, activeRobotId]);

  const resetJoints = useCallback(() => {
    if (!robotManager || !activeRobotId) {
      setError('Robot manager or active robot not available');
      return;
    }

    try {
      robotManager.resetJoints(activeRobotId);
      // Force end effector recalculation (works for both TCP and robot end effector)
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
      setError(null);
    } catch (err) {
      setError(`Error resetting joints: ${err.message}`);
    }
  }, [robotManager, activeRobotId]);

  const getJointValues = useCallback(() => {
    if (!robotManager || !activeRobotId) {
      setError('Robot manager or active robot not available');
      return {};
    }

    try {
      const values = robotManager.getJointValues(activeRobotId);
      setError(null);
      return values;
    } catch (err) {
      setError(`Error getting joint values: ${err.message}`);
      return {};
    }
  }, [robotManager, activeRobotId]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotManager || !robotId) {
      setError('Robot manager or robot ID not available');
      return null;
    }

    try {
      const allRobots = robotManager.getAllRobots();
      const robotData = allRobots.get(robotId);
      setError(null);
      return robotData?.model || null;
    } catch (err) {
      setError(`Error getting robot: ${err.message}`);
      return null;
    }
  }, [robotManager, activeRobotId]);

  return {
    // Robot state
    activeRobotId,
    robot,
    robotManager,
    isReady,
    error,
    
    // End effector state (simplified: always gets final position - robot + tcp)
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
    
    // End effector methods
    getEndEffectorInfo,
    getEndEffectorType
  };
}; 