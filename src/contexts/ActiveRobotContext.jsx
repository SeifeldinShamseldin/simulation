import React, { createContext, useContext, useState, useEffect } from 'react';
import EventBus from '../utils/EventBus';

const ActiveRobotContext = createContext(null);

export const ActiveRobotProvider = ({ children }) => {
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Listen for robot events
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      if (data.robotId) {
        setActiveRobotId(data.robotId);
      }
    };

    const handleRobotUnloaded = () => {
      setActiveRobotId(null);
      setActiveRobot(null);
    };

    const handleRobotRemoved = (data) => {
      if (data.robotName === activeRobotId) {
        setActiveRobotId(null);
        setActiveRobot(null);
      }
    };

    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    const unsubscribeUnloaded = EventBus.on('robot:unloaded', handleRobotUnloaded);
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);

    return () => {
      unsubscribeLoaded();
      unsubscribeUnloaded();
      unsubscribeRemoved();
    };
  }, [activeRobotId]);

  const value = {
    activeRobotId,
    activeRobot,
    setActiveRobotId,
    setActiveRobot,
    isLoading,
    setIsLoading
  };

  return (
    <ActiveRobotContext.Provider value={value}>
      {children}
    </ActiveRobotContext.Provider>
  );
};

export const useActiveRobot = () => {
  const context = useContext(ActiveRobotContext);
  if (!context) {
    throw new Error('useActiveRobot must be used within ActiveRobotProvider');
  }
  return context;
}; 