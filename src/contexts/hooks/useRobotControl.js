import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRobotContext } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '../../utils/EventBus';

// Debug utility to replace console.log
const debug = (message, ...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[useRobotControl] ${message}`, ...args);
  }
};

export const useRobotControl = () => {
  const { activeRobotId, getRobot, loadedRobots } = useRobotContext();
  const { isViewerReady, viewerInstance } = useViewer();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  // Single source of truth for robot
  const robot = useMemo(() => {
    if (!activeRobotId) return null;
    return getRobot(activeRobotId);
  }, [activeRobotId, getRobot]);

  // Simplified ready state
  const isReady = useMemo(() => {
    return !!robot && !!activeRobotId && isViewerReady;
  }, [robot, activeRobotId, isViewerReady]);

  // Simplified robot manager access
  const robotManager = useMemo(() => {
    return viewerInstance?.robotLoaderRef?.current || null;
  }, [viewerInstance]);

  // ========== ROBOT SETUP EFFECT ==========
  useEffect(() => {
    if (!isReady || !robotManager) return;

    debug(`Setting up robot control for: ${activeRobotId}`);

    // Ensure robot is registered with manager for compatibility
    if (robot && robotManager && !robotManager.robots?.has(activeRobotId)) {
      try {
        if (!robotManager.robots) {
          robotManager.robots = new Map();
        }
        
        robotManager.robots.set(activeRobotId, {
          name: activeRobotId,
          robot: robot,
          isActive: true
        });

        debug(`Registered robot ${activeRobotId} with manager`);
        
        EventBus.emit('robot:registered', { 
          robotId: activeRobotId, 
          robotName: activeRobotId,
          robot: robot 
        });
      } catch (error) {
        console.error(`[useRobotControl] Error registering robot:`, error);
      }
    }
  }, [isReady, robotManager, robot, activeRobotId]);

  // ========== EVENT LISTENERS ==========
  useEffect(() => {
    if (!activeRobotId) return;

    const handleRobotUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        debug(`Robot update received for: ${activeRobotId}`);
        // Robot will be updated via useMemo dependency
      }
    };

    const handleRobotLoaded = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        debug(`Robot loaded event for: ${activeRobotId}`);
        // Robot will be updated via useMemo dependency
      }
    };

    const unsubscribeUpdate = EventBus.on('robot:updated', handleRobotUpdate);
    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    
    return () => {
      unsubscribeUpdate();
      unsubscribeLoaded();
    };
  }, [activeRobotId]);

  // ========== SIMPLIFIED ROBOT CONTROL METHODS ==========

  const getJointValues = useCallback(() => {
    if (!robot?.joints) return {};

    const values = {};
    Object.values(robot.joints).forEach(joint => {
      if (joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
        values[joint.name] = joint.angle;
      }
    });
    
    return values;
  }, [robot]);

  const setJointValue = useCallback((jointName, value) => {
    if (!robot?.setJointValue) {
      debug(`Robot ${activeRobotId} missing setJointValue method`);
      return false;
    }

    debug(`Setting joint ${jointName} = ${value} for robot ${activeRobotId}`);
    
    const success = robot.setJointValue(jointName, value);
    
    if (success) {
      EventBus.emit('robot:joint-changed', { 
        robotId: activeRobotId,
        robotName: activeRobotId,
        jointName, 
        value,
        allValues: getJointValues()
      });

      // Force TCP recalculation if using TCP
      if (isUsingTCP) {
        EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
      }
    }

    return success;
  }, [robot, activeRobotId, isUsingTCP, getJointValues]);

  const setJointValues = useCallback((values) => {
    if (!robot?.setJointValues) {
      debug(`Robot ${activeRobotId} missing setJointValues method`);
      return false;
    }

    debug(`Setting joint values for robot ${activeRobotId}:`, values);
    
    const success = robot.setJointValues(values);
    
    if (success) {
      EventBus.emit('robot:joints-changed', { 
        robotId: activeRobotId,
        robotName: activeRobotId,
        values,
        allValues: { ...getJointValues(), ...values }
      });

      // Force TCP recalculation if using TCP
      if (isUsingTCP) {
        EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
      }
    }

    return success;
  }, [robot, activeRobotId, isUsingTCP, getJointValues]);

  const resetJoints = useCallback(() => {
    if (!robot) {
      debug(`No robot available for reset`);
      return;
    }

    debug(`Resetting joints for robot ${activeRobotId}`);

    // Use robot's reset method if available
    if (robot.resetJoints) {
      robot.resetJoints();
    } else if (robot.joints) {
      // Fallback: reset all joints to 0
      Object.values(robot.joints).forEach(joint => {
        if (joint.jointType !== 'fixed' && robot.setJointValue) {
          robot.setJointValue(joint.name, 0);
        }
      });
    }

    EventBus.emit('robot:joints-reset', { 
      robotId: activeRobotId,
      robotName: activeRobotId
    });

    // Force TCP recalculation if using TCP
    if (isUsingTCP) {
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [robot, activeRobotId, isUsingTCP]);

  const getRobotById = useCallback((robotId = activeRobotId) => {
    if (!robotId) return null;
    return getRobot(robotId);
  }, [getRobot, activeRobotId]);

  // ========== TRAJECTORY STATE REQUEST HANDLER ==========
  useEffect(() => {
    if (!activeRobotId || !isReady) return;

    const handleStateRequest = (data) => {
      if (data.robotId !== activeRobotId) return;

      debug(`State requested for ${activeRobotId}`);

      // Emit current joint values
      const jointValues = getJointValues();
      if (Object.keys(jointValues).length > 0) {
        EventBus.emit('robot:joints-changed', {
          robotId: activeRobotId,
          robotName: activeRobotId,
          values: jointValues
        });
      }

      // Force TCP recalculation and emit
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    };

    const unsubscribe = EventBus.on('trajectory:request-state', handleStateRequest);
    return () => unsubscribe();
  }, [activeRobotId, isReady, getJointValues]);

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
    
    // Robot control methods (simplified, robust API)
    setJointValue,
    setJointValues,
    resetJoints,
    getJointValues,
    getRobot: getRobotById,
    
    // TCP-specific methods
    getEndEffectorInfo,
    getEndEffectorType,
    
    // Debug info (simplified)
    debug: {
      loadedRobots: loadedRobots?.size || 0,
      hasRobotManager: !!robotManager,
      hasRobot: !!robot,
      isReady
    }
  };
};