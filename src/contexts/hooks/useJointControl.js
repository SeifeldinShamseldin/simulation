// src/contexts/hooks/useJointControl.js
import { useState, useEffect } from 'react';
import { useRobot } from '../RobotContext';

const useJointControl = () => {
  const { viewerRef, currentRobot } = useRobot();
  const [jointInfo, setJointInfo] = useState([]);
  const [jointValues, setJointValues] = useState({});
  
  // Load joint info when current robot changes
  useEffect(() => {
    if (!viewerRef.current || !currentRobot) return;
    
    // Get joint info from the viewer
    const updateJointInfo = () => {
      try {
        const robot = viewerRef.current.getCurrentRobot();
        if (!robot) return;
        
        // Get joint information
        const robotInfo = viewerRef.current.getRobotInfo();
        if (robotInfo && robotInfo.joints) {
          setJointInfo(robotInfo.joints);
          
          // Get joint values
          const values = viewerRef.current.getJointValues();
          setJointValues(values || {});
        }
      } catch (error) {
        console.error("Error updating joint info:", error);
      }
    };
    
    // Initial update
    updateJointInfo();
    
    // Set up interval for updates
    const intervalId = setInterval(updateJointInfo, 1000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [viewerRef, currentRobot]);
  
  // Set a joint value
  const setJointValue = (jointName, value) => {
    if (!viewerRef.current) return false;
    
    try {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return false;
      
      // Update joint value
      const success = viewerRef.current.setJointValue(jointName, numValue);
      
      if (success) {
        // Update local state
        setJointValues(prev => ({
          ...prev,
          [jointName]: numValue
        }));
      }
      
      return success;
    } catch (error) {
      console.error(`Error setting joint ${jointName}:`, error);
      return false;
    }
  };
  
  // Reset all joints to zero
  const resetJoints = () => {
    if (!viewerRef.current) return;
    
    try {
      viewerRef.current.resetJoints();
      
      // Update joint values after reset
      const values = viewerRef.current.getJointValues();
      setJointValues(values || {});
    } catch (error) {
      console.error("Error resetting joints:", error);
    }
  };
  
  return {
    jointInfo,
    jointValues,
    setJointValue,
    resetJoints
  };
};

export default useJointControl; 