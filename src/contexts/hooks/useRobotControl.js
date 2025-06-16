import { useEffect, useState, useCallback } from 'react';
import { useRobotContext } from '../RobotContext';
import { useViewer } from '../ViewerContext';
import { useTCP } from './useTCP';
import EventBus from '../../utils/EventBus';

export const useRobotControl = () => {
  const { activeRobotId, getRobot: getRobotFromContext, isLoaded, loadedRobots } = useRobotContext();
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
  const [robotManager, setRobotManager] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isViewerReady || !activeRobotId || !viewerInstance) {
      setRobot(null);
      setRobotManager(null);
      setIsReady(false);
      return;
    }

    console.log(`[useRobotControl] Setting up robot control for: ${activeRobotId}`);

    // Get robot manager first (needed by TCP and other systems)
    const manager = viewerInstance?.robotLoaderRef?.current;
    setRobotManager(manager);

    // Try to get robot from new RobotContext
    const robotFromContext = getRobotFromContext(activeRobotId);
    
    if (robotFromContext) {
      console.log(`[useRobotControl] Found robot in context: ${activeRobotId}`);
      setRobot(robotFromContext);
      setIsReady(true);

      // 🚨 CRITICAL FIX: Ensure robot is available everywhere it's needed
      if (manager) {
        console.log(`[useRobotControl] Syncing robot to all management systems: ${activeRobotId}`);
        
        try {
          // STEP 1: Add to robot manager's robots map
          if (!manager.robots) {
            manager.robots = new Map();
            console.log(`[useRobotControl] Created robots Map for manager`);
          }
          
          if (!manager.robots.has(activeRobotId)) {
            manager.robots.set(activeRobotId, {
              name: activeRobotId,
              robot: robotFromContext,
              isActive: true
            });
            console.log(`[useRobotControl] Added robot to manager.robots Map`);
          }
          
          // STEP 2: Create/enhance manager methods
          if (!manager.getRobot) {
            manager.getRobot = (robotId) => {
              if (manager.robots && manager.robots.has(robotId)) {
                return manager.robots.get(robotId).robot;
              }
              return null;
            };
            console.log(`[useRobotControl] Created getRobot method for manager`);
          }
          
          if (!manager.setJointValue) {
            manager.setJointValue = (robotId, jointName, value) => {
              const robot = manager.getRobot(robotId);
              if (robot) {
                if (robot.setJointValue) {
                  return robot.setJointValue(jointName, value);
                }
                // Fallback: direct joint manipulation
                if (robot.joints && robot.joints[jointName]) {
                  robot.joints[jointName].angle = value;
                  if (robot.joints[jointName].setPosition) {
                    robot.joints[jointName].setPosition(value);
                  }
                  return true;
                }
              }
              return false;
            };
            console.log(`[useRobotControl] Created setJointValue method for manager`);
          }
          
          if (!manager.setJointValues) {
            manager.setJointValues = (robotId, values) => {
              const robot = manager.getRobot(robotId);
              if (robot) {
                if (robot.setJointValues) {
                  return robot.setJointValues(values);
                }
                // Fallback: set individual joints
                let success = true;
                Object.entries(values).forEach(([jointName, value]) => {
                  if (!manager.setJointValue(robotId, jointName, value)) {
                    success = false;
                  }
                });
                return success;
              }
              return false;
            };
            console.log(`[useRobotControl] Created setJointValues method for manager`);
          }
          
          if (!manager.getJointValues) {
            manager.getJointValues = (robotId) => {
              const robot = manager.getRobot(robotId);
              if (robot && robot.joints) {
                const values = {};
                Object.values(robot.joints).forEach(joint => {
                  if (joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
                    values[joint.name] = joint.angle;
                  }
                });
                return values;
              }
              return {};
            };
            console.log(`[useRobotControl] Created getJointValues method for manager`);
          }
          
          if (!manager.resetJoints) {
            manager.resetJoints = (robotId) => {
              const robot = manager.getRobot(robotId);
              if (robot && robot.joints) {
                Object.values(robot.joints).forEach(joint => {
                  if (joint.jointType !== 'fixed') {
                    manager.setJointValue(robotId, joint.name, 0);
                  }
                });
              }
            };
            console.log(`[useRobotControl] Created resetJoints method for manager`);
          }
          
          // STEP 3: Also register with RobotManagerContext if it exists
          const robotManagerContext = window.robotManagerContext;
          if (robotManagerContext && robotManagerContext.addRobot) {
            robotManagerContext.addRobot(activeRobotId, robotFromContext);
            console.log(`[useRobotControl] Registered with RobotManagerContext`);
          }
          
          // STEP 4: Verify registration worked
          const testRobot = manager.getRobot(activeRobotId);
          if (testRobot) {
            console.log(`[useRobotControl] ✅ SUCCESS: Robot ${activeRobotId} is now accessible everywhere`);
            
            // Test joint control methods
            if (manager.getJointValues) {
              const testValues = manager.getJointValues(activeRobotId);
              console.log(`[useRobotControl] ✅ Joint values accessible:`, Object.keys(testValues).length, 'joints');
            }
          } else {
            console.error(`[useRobotControl] ❌ FAILED: Robot ${activeRobotId} still not accessible`);
          }
          
          // STEP 5: Emit comprehensive registration events
          EventBus.emit('robot:registered', { 
            robotId: activeRobotId, 
            robotName: activeRobotId,
            robot: robotFromContext 
          });
          
          EventBus.emit('robot:manager-synced', {
            robotId: activeRobotId,
            robotName: activeRobotId,
            robot: robotFromContext,
            manager: manager
          });
          
        } catch (syncError) {
          console.error(`[useRobotControl] Error syncing robot:`, syncError);
        }
      }
      
      return;
    }

    // Fallback to robot manager approach
    if (manager) {
      const robotModel = manager.getRobot ? manager.getRobot(activeRobotId) : null;
      
      if (robotModel) {
        console.log(`[useRobotControl] Found robot in manager: ${activeRobotId}`);
        setRobot(robotModel);
        setIsReady(true);
      } else {
        console.warn(`[useRobotControl] Robot ${activeRobotId} not found in either context or manager`);
      }
    }

    // Listen for robot updates
    const handleRobotUpdate = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        console.log(`[useRobotControl] Robot update received for: ${activeRobotId}`);
        
        // Try context first
        const updatedRobotFromContext = getRobotFromContext(activeRobotId);
        if (updatedRobotFromContext) {
          setRobot(updatedRobotFromContext);
          setIsReady(true);
        } else if (manager) {
          // Fallback to manager
          const updatedRobot = manager.getRobot ? manager.getRobot(activeRobotId) : null;
          if (updatedRobot) {
            setRobot(updatedRobot);
            setIsReady(true);
          }
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
  }, [isViewerReady, activeRobotId, viewerInstance, getRobotFromContext, loadedRobots]);

  const getJointValues = useCallback(() => {
    if (!activeRobotId) return {};

    // Try robot manager first
    if (robotManager?.getJointValues) {
      const values = robotManager.getJointValues(activeRobotId);
      if (values && Object.keys(values).length > 0) {
        return values;
      }
    }

    // Fallback to direct robot access
    if (robot?.joints) {
      const values = {};
      Object.values(robot.joints).forEach(joint => {
        if (joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          values[joint.name] = joint.angle;
        }
      });
      return values;
    }

    return {};
  }, [robotManager, robot, activeRobotId]);

  const setJointValue = useCallback((jointName, value) => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for joint control');
      return false;
    }

    console.log(`[useRobotControl] Setting joint ${jointName} = ${value} for robot ${activeRobotId}`);

    let success = false;

    // Try robot manager first (for immediate effect)
    if (robotManager?.setJointValue) {
      success = robotManager.setJointValue(activeRobotId, jointName, value);
      console.log(`[useRobotControl] Robot manager setJointValue result: ${success}`);
    }

    // Also try direct robot method
    if (robot?.setJointValue) {
      const directSuccess = robot.setJointValue(jointName, value);
      success = success || directSuccess;
      console.log(`[useRobotControl] Direct robot setJointValue result: ${directSuccess}`);
    }

    // Emit joint change event for other systems
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
  }, [robotManager, robot, activeRobotId, isUsingTCP, getJointValues]);

  const setJointValues = useCallback((values) => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for joint control');
      return false;
    }

    console.log(`[useRobotControl] Setting joint values for robot ${activeRobotId}:`, values);

    let success = false;

    // Try robot manager first
    if (robotManager?.setJointValues) {
      success = robotManager.setJointValues(activeRobotId, values);
      console.log(`[useRobotControl] Robot manager setJointValues result: ${success}`);
    }

    // Also try direct robot method
    if (robot?.setJointValues) {
      const directSuccess = robot.setJointValues(values);
      success = success || directSuccess;
      console.log(`[useRobotControl] Direct robot setJointValues result: ${directSuccess}`);
    }

    // Emit joint change events
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
  }, [robotManager, robot, activeRobotId, isUsingTCP, getJointValues]);

  const resetJoints = useCallback(() => {
    if (!activeRobotId) {
      console.warn('[useRobotControl] No active robot for reset');
      return;
    }

    console.log(`[useRobotControl] Resetting joints for robot ${activeRobotId}`);

    // Try robot manager first
    if (robotManager?.resetJoints) {
      robotManager.resetJoints(activeRobotId);
    }

    // Also try direct robot method
    if (robot) {
      // Reset all joints to 0
      if (robot.joints) {
        Object.values(robot.joints).forEach(joint => {
          if (joint.jointType !== 'fixed') {
            robot.setJointValue(joint.name, 0);
          }
        });
      }
    }

    // Emit reset event
    EventBus.emit('robot:joints-reset', { 
      robotId: activeRobotId,
      robotName: activeRobotId
    });

    // Force TCP recalculation if using TCP
    if (isUsingTCP) {
      EventBus.emit('tcp:force-recalculate', { robotId: activeRobotId });
    }
  }, [robotManager, robot, activeRobotId, isUsingTCP]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotId) return null;
    
    // Try context first
    const robotFromContext = getRobotFromContext(robotId);
    if (robotFromContext) return robotFromContext;
    
    // Fallback to manager
    if (robotManager?.getRobot) {
      return robotManager.getRobot(robotId);
    }
    
    return null;
  }, [getRobotFromContext, robotManager, activeRobotId]);

  // ========== TRAJECTORY STATE REQUEST HANDLER ==========
  useEffect(() => {
    if (!activeRobotId || !isReady) return;

    const handleStateRequest = (data) => {
      if (data.robotId !== activeRobotId) return;

      console.log(`[useRobotControl] State requested for ${activeRobotId}`);

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
    isReady: isReady && !!robot && !!activeRobotId,
    
    // TCP awareness
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    
    // Robot control methods (enhanced with proper sync)
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
      hasRobotManager: !!robotManager,
      hasRobotFromContext: !!getRobotFromContext(activeRobotId),
      robotManagerHasRobot: robotManager?.getRobot ? !!robotManager.getRobot(activeRobotId) : false
    }
  };
};