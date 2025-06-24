// ContextTemplate.jsx - Template for ALL new contexts that need robot access
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRobotContext } from './RobotContext';
import EventBus from '../utils/EventBus';
import { RobotEvents } from './dataTransfer';

const YourNewContext = createContext(null);

export const YourNewProvider = ({ children }) => {
  // ========== ROBOT ACCESS (THE ONE WAY) ==========
  const { getRobot, unloadRobot } = useRobotContext();
  
  // ========== STATE ==========
  const [yourCache] = useState(new Map()); // robotId -> your data
  
  // ========== ROBOT ACCESS HELPER ==========
  const accessRobot = useCallback((robotId) => {
    const robot = getRobot(robotId);
    if (!robot) {
      console.warn(`[YourContext] Robot ${robotId} not found`);
      return null;
    }
    return robot;
  }, [getRobot]);
  
  // ========== YOUR METHODS ==========
  const doSomething = useCallback((robotId) => {
    const robot = accessRobot(robotId);
    if (!robot) return false;
    
    // Your logic here
    console.log('Working with robot:', robotId);
    
    // Store result in cache
    yourCache.set(robotId, { processed: true });
    
    return true;
  }, [accessRobot, yourCache]);
  
  // ========== CLEANUP ON ROBOT REMOVAL ==========
  useEffect(() => {
    const handleRobotUnloaded = ({ robotId }) => {
      // Clean up when robot is removed
      yourCache.delete(robotId);
      console.log(`[YourContext] Cleaned up data for ${robotId}`);
    };
    
    const unsubscribe = EventBus.on(RobotEvents.UNLOADED, handleRobotUnloaded);
    return () => unsubscribe();
  }, [yourCache]);
  
  // ========== PUBLIC API ==========
  const value = {
    doSomething,
    getData: (robotId) => yourCache.get(robotId),
    clearData: (robotId) => yourCache.delete(robotId)
  };
  
  return (
    <YourNewContext.Provider value={value}>
      {children}
    </YourNewContext.Provider>
  );
};

export const useYourContext = () => {
  const context = useContext(YourNewContext);
  if (!context) {
    throw new Error('useYourContext must be used within YourNewProvider');
  }
  return context;
};

// ========== USAGE EXAMPLES ==========

/*
// ✅ CORRECT USAGE PATTERNS:

// 1. Always use getRobot from useRobotContext
const { getRobot } = useRobotContext();
const robot = getRobot(robotId);

// 2. Always check if robot exists
if (!robot) {
  console.warn(`Robot ${robotId} not found`);
  return;
}

// 3. Always use unloadRobot to remove
const { unloadRobot } = useRobotContext();
unloadRobot(robotId);

// 4. Create a helper function for consistent access
const accessRobot = useCallback((robotId) => {
  const robot = getRobot(robotId);
  if (!robot) {
    console.warn(`[YourContext] Robot ${robotId} not found`);
    return null;
  }
  return robot;
}, [getRobot]);

// 5. Use the helper in all your methods
const yourMethod = useCallback((robotId) => {
  const robot = accessRobot(robotId);
  if (!robot) return false;
  
  // Now work with robot safely
  robot.traverse((child) => {
    // Do something
  });
  
  return true;
}, [accessRobot]);

// 6. Clean up on robot removal
useEffect(() => {
  const handleRobotUnloaded = ({ robotId }) => {
    yourCache.delete(robotId);
  };
  
  const unsubscribe = EventBus.on(RobotEvents.UNLOADED, handleRobotUnloaded);
  return () => unsubscribe();
}, [yourCache]);

// ❌ NEVER DO THESE:

// 1. Don't use getRobotGlobal in contexts
import { getRobotGlobal } from './RobotContext';
const robot = getRobotGlobal(robotId); // ❌ BAD

// 2. Don't access loadedRobots Map directly
const { loadedRobots } = useRobotContext();
const robot = loadedRobots.get(robotId); // ❌ BAD

// 3. Don't pass robot as parameter
doSomething(robotId, robot); // ❌ BAD PATTERN

// 4. Don't assume robot exists without checking
const robot = getRobot(robotId);
robot.traverse(...); // ❌ BAD - no null check
*/ 