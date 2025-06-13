// src/contexts/hooks/useRobotManager.js - Data Transfer Hook
import { useCallback } from 'react';
import { useRobotManagerContext } from '../RobotManagerContext';

export const useRobotManager = () => {
  const context = useRobotManagerContext();
  
  return {
    // ========== STATE ==========
    robots: context.robots,
    activeRobots: context.activeRobots,
    isLoading: context.isLoading,
    error: context.error,
    
    // ========== ROBOT MANAGEMENT METHODS ==========
    loadRobot: context.loadRobot,
    getAllRobots: context.getAllRobots,
    getRobot: context.getRobot,
    setRobotActive: context.setRobotActive,
    removeRobot: context.removeRobot,
    clearAllRobots: context.clearAllRobots,
    getActiveRobots: context.getActiveRobots,
    
    // ========== JOINT CONTROL METHODS ==========
    setJointValue: context.setJointValue,
    setJointValues: context.setJointValues,
    getJointValues: context.getJointValues,
    resetJoints: context.resetJoints,
    
    // ========== UTILITY METHODS ==========
    calculateRobotPositions: context.calculateRobotPositions,
    getCurrentRobot: context.getCurrentRobot,
    getCurrentRobotName: context.getCurrentRobotName,
    
    // ========== STATE CHECKS ==========
    hasRobots: context.hasRobots,
    robotCount: context.robotCount,
    activeRobotCount: context.activeRobotCount,
    
    // ========== ERROR HANDLING ==========
    clearError: context.clearError,
    
    // ========== CONVENIENCE METHODS ==========
    isRobotLoaded: useCallback((robotName) => {
      return context.robots.has(robotName);
    }, [context.robots]),
    
    isRobotActive: useCallback((robotName) => {
      return context.activeRobots.has(robotName);
    }, [context.activeRobots]),
    
    getRobotData: useCallback((robotName) => {
      return context.robots.get(robotName);
    }, [context.robots]),
    
    hasActiveRobots: context.activeRobots.size > 0,
    isEmpty: context.robots.size === 0
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useRobotManagerLoading = () => {
  const { loadRobot, isLoading, error, clearError } = useRobotManager();
  
  return {
    loadRobot,
    isLoading,
    error,
    clearError,
    hasError: !!error
  };
};

export const useRobotManagerJointControl = (robotName = null) => {
  const { 
    setJointValue, 
    setJointValues, 
    getJointValues, 
    resetJoints,
    getCurrentRobotName 
  } = useRobotManager();
  
  // Use provided robotName or fall back to current active robot
  const targetRobotName = robotName || getCurrentRobotName();
  
  return {
    robotName: targetRobotName,
    setJointValue: useCallback((jointName, value) => {
      if (!targetRobotName) return false;
      return setJointValue(targetRobotName, jointName, value);
    }, [targetRobotName, setJointValue]),
    
    setJointValues: useCallback((values) => {
      if (!targetRobotName) return false;
      return setJointValues(targetRobotName, values);
    }, [targetRobotName, setJointValues]),
    
    getJointValues: useCallback(() => {
      if (!targetRobotName) return {};
      return getJointValues(targetRobotName);
    }, [targetRobotName, getJointValues]),
    
    resetJoints: useCallback(() => {
      if (!targetRobotName) return;
      resetJoints(targetRobotName);
    }, [targetRobotName, resetJoints]),
    
    hasRobot: !!targetRobotName
  };
};

export const useActiveRobotManager = () => {
  const { 
    activeRobots, 
    getCurrentRobot, 
    getCurrentRobotName,
    setRobotActive,
    hasActiveRobots 
  } = useRobotManager();
  
  return {
    activeRobots,
    currentRobot: getCurrentRobot(),
    currentRobotName: getCurrentRobotName(),
    setRobotActive,
    hasActiveRobots,
    activeCount: activeRobots.size
  };
};

export const useRobotManagerCollection = () => {
  const {
    robots,
    getAllRobots,
    getRobot,
    removeRobot,
    clearAllRobots,
    hasRobots,
    robotCount,
    isEmpty
  } = useRobotManager();
  
  return {
    robots,
    getAllRobots,
    getRobot,
    removeRobot,
    clearAll: clearAllRobots,
    hasRobots,
    count: robotCount,
    isEmpty,
    
    // Convenience methods
    getRobotNames: useCallback(() => {
      return Array.from(robots.keys());
    }, [robots]),
    
    getRobotModels: useCallback(() => {
      return Array.from(robots.values()).map(robotData => robotData.model);
    }, [robots])
  };
};

export default useRobotManager;