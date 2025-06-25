// src/contexts/hooks/useRobotManager.js - MERGED & OPTIMIZED
import { useCallback, useMemo } from 'react';
import { useRobotContext } from '../RobotContext';
import EventBus from '../../utils/EventBus';
import * as DataTransfer from '../dataTransfer';

// Debug utility to reduce console pollution
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

// ========== MAIN HOOK (Merged from useRobot and useRobotManager) ==========
export const useRobotManager = () => {
  const context = useRobotContext();
  
  // ========== MEMOIZED COMPUTED PROPERTIES (Only expensive computations) ==========
  const computedProperties = useMemo(() => ({
    robotCount: context.robotCount,
    isEmpty: context.isEmpty,
    hasWorkspaceRobots: context.hasWorkspaceRobots,
    hasAvailableRobots: context.hasAvailableRobots,
    hasLoadedRobots: context.hasLoadedRobots,
    hasActiveRobot: context.hasActiveRobot,
    hasRobots: context.hasRobots,
    activeRobotCount: context.activeRobotCount,
    hasActiveRobots: context.activeRobots.size > 0,
  }), [
    context.robotCount,
    context.isEmpty,
    context.hasWorkspaceRobots,
    context.hasAvailableRobots,
    context.hasLoadedRobots,
    context.hasActiveRobot,
    context.hasRobots,
    context.activeRobotCount,
    context.activeRobots.size
  ]);
  
  // ========== MEMOIZED EXPENSIVE COMPUTATIONS ==========
  
  // Only memoize complex operations that are expensive
  const getRobotsByCategory = useCallback((categoryId) => {
    return context.availableRobots.filter(robot => robot.category === categoryId);
  }, [context.availableRobots]);
  
  const isRobotActive = useCallback((robotId) => {
    return context.activeRobotId === robotId;
  }, [context.activeRobotId]);
  
  const hasWorkspaceRobot = useCallback((robotId) => {
    return context.workspaceRobots.some(r => r.robotId === robotId);
  }, [context.workspaceRobots]);
  
  const isRobotLoadedCheck = useCallback((robotName) => {
    return context.isRobotLoaded(robotName);
  }, [context.isRobotLoaded]);
  
  const isRobotActiveCheck = useCallback((robotName) => {
    return context.activeRobots.has(robotName);
  }, [context.activeRobots]);
  
  const getRobotData = useCallback((robotName) => {
    return context.getRobot(robotName);
  }, [context.getRobot]);
  
  // ========== MEMOIZED RETURN OBJECT (Only for expensive operations) ==========
  return useMemo(() => ({
    // ========== STATE (merged) ==========
    availableRobots: context.availableRobots,
    categories: context.categories,
    availableTools: context.availableTools,
    workspaceRobots: context.workspaceRobots,
    activeRobotId: context.activeRobotId,
    activeRobot: context.activeRobot,
    activeRobots: context.activeRobots,
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    
    // ========== ROBOT DISCOVERY OPERATIONS (from useRobot) ==========
    discoverRobots: context.discoverRobots,
    refresh: context.refresh,
    
    // ========== WORKSPACE OPERATIONS (from useRobot) ==========
    addRobotToWorkspace: context.addRobotToWorkspace,
    removeRobot: context.removeRobot,
    isRobotInWorkspace: context.isRobotInWorkspace,
    getWorkspaceRobot: context.getWorkspaceRobot,
    clearWorkspace: context.clearWorkspace,
    importRobots: context.importRobots,
    exportRobots: context.exportRobots,
    
    // ========== ROBOT LOADING OPERATIONS (merged) ==========
    loadRobot: context.loadRobot,
    unloadRobot: context.unloadRobot,
    isRobotLoaded: context.isRobotLoaded,
    getRobot: context.getRobot,
    getAllRobots: context.getAllRobots,
    setActiveRobotId: context.setActiveRobotId,
    setActiveRobot: context.setActiveRobot,
    getRobotLoadStatus: context.getRobotLoadStatus,
    
    // ========== ROBOT MANAGEMENT METHODS (from useRobotManager) ==========
    setRobotActive: context.setRobotActive,
    removeRobot: context.removeRobot,
    clearAllRobots: context.clearWorkspace, // Map to clearWorkspace for compatibility
    getActiveRobots: context.getActiveRobots,
    
    // ========== JOINT CONTROL METHODS (from useRobotManager) ==========
    setJointValue: context.setJointValue,
    setJointValues: context.setJointValues,
    getJointValues: context.getJointValues,
    resetJoints: context.resetJoints,
    
    // ========== UTILITY METHODS (merged) ==========
    calculateRobotPositions: () => {}, // Deprecated method, return empty function
    getCurrentRobot: context.getCurrentRobot,
    getCurrentRobotName: context.getCurrentRobotName,
    
    // ========== COMPUTED PROPERTIES (memoized) ==========
    ...computedProperties,
    
    // ========== ERROR HANDLING (merged) ==========
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    // ========== SIMPLE GETTERS (No memoization needed) ==========
    getRobotById: (robotId) => context.availableRobots.find(robot => robot.id === robotId),
    getWorkspaceRobotById: (workspaceRobotId) => context.workspaceRobots.find(robot => robot.id === workspaceRobotId),
    getCategoryById: (categoryId) => context.categories.find(category => category.id === categoryId),
    
    // ========== COMPLEX OPERATIONS (Memoized) ==========
    getRobotsByCategory,
    isRobotActive,
    hasWorkspaceRobot,
    isRobotLoadedCheck,
    isRobotActiveCheck,
    getRobotData,
    // ========== MANUFACTURER HELPER ==========
    getManufacturer: context.getManufacturer,
    // Robot pose operations using events
    setRobotPose: (robotId, pose) => {
      if (!robotId) {
        console.warn('[useRobotManager] No robot ID for pose control');
        return false;
      }
      EventBus.emit(DataTransfer.RobotEvents.Commands.SET_POSE, { robotId, ...pose });
      return true;
    },
    getRobotPose: (robotId) => {
      if (!robotId) return Promise.resolve({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
      return new Promise((resolve) => {
        const requestId = `getpose_${Date.now()}`;
        const handleResponse = (data) => {
          if (data.requestId === requestId && data.robotId === robotId) {
            // EventBus.off(RobotPoseEvents.Responses.GET_POSE, handleResponse);
            resolve({
              position: data.position,
              rotation: data.rotation
            });
          }
        };
        // EventBus.on(RobotPoseEvents.Responses.GET_POSE, handleResponse);
        // EventBus.emit(RobotPoseEvents.Commands.GET_POSE, { robotId, requestId });
        setTimeout(() => {
          // EventBus.off(RobotPoseEvents.Responses.GET_POSE, handleResponse);
          resolve({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
        }, 1000);
      });
    },
    robotPoses: context.robotPoses || new Map()
  }), [
    // Context dependencies
    context.availableRobots,
    context.categories,
    context.workspaceRobots,
    context.activeRobotId,
    context.activeRobot,
    context.activeRobots,
    context.isLoading,
    context.error,
    context.successMessage,
    
    // Context methods (these should be stable from RobotContext)
    context.discoverRobots,
    context.refresh,
    context.addRobotToWorkspace,
    context.removeRobot,
    context.isRobotInWorkspace,
    context.getWorkspaceRobot,
    context.clearWorkspace,
    context.importRobots,
    context.exportRobots,
    context.loadRobot,
    context.unloadRobot,
    context.isRobotLoaded,
    context.getRobot,
    context.getAllRobots,
    context.setActiveRobotId,
    context.setActiveRobot,
    context.getRobotLoadStatus,
    context.setRobotActive,
    context.removeRobot,
    context.setJointValue,
    context.setJointValues,
    context.getJointValues,
    context.resetJoints,
    context.getCurrentRobot,
    context.getCurrentRobotName,
    context.clearError,
    context.clearSuccess,
    
    // Computed properties
    computedProperties,
    
    // Memoized complex operations
    getRobotsByCategory,
    isRobotActive,
    hasWorkspaceRobot,
    isRobotLoadedCheck,
    isRobotActiveCheck,
    getRobotData,
    // ========== MANUFACTURER HELPER ==========
    context.getManufacturer,
    // Robot pose dependencies
    context.setRobotPose,
    context.getRobotPose,
    context.robotPoses
  ]);
};

// ========== SPECIALIZED HOOKS (Merged & Optimized) ==========

export const useRobotWorkspace = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    // Workspace State
    robots: manager.workspaceRobots,
    count: manager.robotCount,
    isEmpty: manager.isEmpty,
    hasRobots: manager.hasWorkspaceRobots,
    
    // Workspace Operations
    addRobot: manager.addRobotToWorkspace,
    removeRobot: manager.removeRobot,
    isInWorkspace: manager.isRobotInWorkspace,
    getRobot: manager.getWorkspaceRobot,
    clear: manager.clearWorkspace,
    import: manager.importRobots,
    export: manager.exportRobots,
    
    // Helper Methods
    getById: manager.getWorkspaceRobotById,
    hasRobot: manager.hasWorkspaceRobot
  }), [
    manager.workspaceRobots,
    manager.robotCount,
    manager.isEmpty,
    manager.hasWorkspaceRobots,
    manager.addRobotToWorkspace,
    manager.removeRobot,
    manager.isRobotInWorkspace,
    manager.getWorkspaceRobot,
    manager.clearWorkspace,
    manager.importRobots,
    manager.exportRobots,
    manager.getWorkspaceRobotById,
    manager.hasWorkspaceRobot
  ]);
};

export const useRobotDiscovery = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    // Discovery State
    robots: manager.availableRobots,
    categories: manager.categories,
    hasRobots: manager.hasAvailableRobots,
    
    // Discovery Operations
    discover: manager.discoverRobots,
    refresh: manager.refresh,
    
    // Helper Methods
    getRobotById: manager.getRobotById,
    getRobotsByCategory: manager.getRobotsByCategory,
    getCategoryById: manager.getCategoryById,
    
    // Computed Properties
    robotCount: manager.availableRobots.length,
    categoryCount: manager.categories.length,
    isEmpty: manager.availableRobots.length === 0
  }), [
    manager.availableRobots,
    manager.categories,
    manager.hasAvailableRobots,
    manager.discoverRobots,
    manager.refresh,
    manager.getRobotById,
    manager.getRobotsByCategory,
    manager.getCategoryById
  ]);
};

export const useRobotManagement = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    // Loading State
    hasLoaded: manager.hasLoadedRobots,
    
    // Loading Operations
    load: manager.loadRobot,
    unload: manager.unloadRobot,
    isLoaded: manager.isRobotLoaded,
    getRobot: manager.getRobot,
    getStatus: manager.getRobotLoadStatus,
    getAll: manager.getAllRobots,
    
    // Computed Properties
    hasRobots: manager.hasLoadedRobots
  }), [
    manager.hasLoadedRobots,
    manager.loadRobot,
    manager.unloadRobot,
    manager.isRobotLoaded,
    manager.getRobot,
    manager.getRobotLoadStatus,
    manager.getAllRobots
  ]);
};

export const useRobotSelection = () => {
  const manager = useRobotManager();
  
  const clearActive = useCallback(() => {
    manager.setActiveRobotId(null);
  }, [manager.setActiveRobotId]);
  
  return useMemo(() => ({
    // Selection State
    activeId: manager.activeRobotId,
    activeRobot: manager.activeRobot,
    hasActive: manager.hasActiveRobot,
    
    // Selection Operations
    setActive: manager.setActiveRobotId,
    setActiveRobot: manager.setActiveRobot,
    clearActive,
    
    // Helper Methods
    isActive: manager.isRobotActive
  }), [
    manager.activeRobotId,
    manager.activeRobot,
    manager.hasActiveRobot,
    manager.setActiveRobotId,
    manager.setActiveRobot,
    clearActive,
    manager.isRobotActive
  ]);
};

export const useRobotLoading = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    // Loading State
    isLoading: manager.isLoading,
    error: manager.error,
    success: manager.successMessage,
    
    // Loading Operations
    clearError: manager.clearError,
    clearSuccess: manager.clearSuccess,
    
    // State Checks
    hasError: !!manager.error,
    hasSuccess: !!manager.successMessage,
    
    // Additional from useRobotManagerLoading
    loadRobot: manager.loadRobot
  }), [
    manager.isLoading,
    manager.error,
    manager.successMessage,
    manager.clearError,
    manager.clearSuccess,
    manager.loadRobot
  ]);
};

export const useRobotCategories = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    // Category State
    categories: manager.categories,
    count: manager.categories.length,
    isEmpty: manager.categories.length === 0,
    
    // Category Operations
    getRobotsByCategory: manager.getRobotsByCategory,
    getById: manager.getCategoryById
  }), [
    manager.categories,
    manager.getRobotsByCategory,
    manager.getCategoryById
  ]);
};

export const useRobotManagerJointControl = (robotName = null) => {
  const manager = useRobotManager();
  
  // Use provided robotName or fall back to current active robot
  const targetRobotName = robotName || manager.getCurrentRobotName();
  
  const setJointValue = useCallback((jointName, value) => {
    if (!targetRobotName) return false;
    return manager.setJointValue(targetRobotName, jointName, value);
  }, [targetRobotName, manager.setJointValue]);
  
  const setJointValues = useCallback((values) => {
    if (!targetRobotName) return false;
    return manager.setJointValues(targetRobotName, values);
  }, [targetRobotName, manager.setJointValues]);
  
  const getJointValues = useCallback(() => {
    if (!targetRobotName) return {};
    return manager.getJointValues(targetRobotName);
  }, [targetRobotName, manager.getJointValues]);
  
  const resetJoints = useCallback(() => {
    if (!targetRobotName) return;
    manager.resetJoints(targetRobotName);
  }, [targetRobotName, manager.resetJoints]);
  
  return useMemo(() => ({
    robotName: targetRobotName,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    hasRobot: !!targetRobotName
  }), [
    targetRobotName,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints
  ]);
};

export const useActiveRobotManager = () => {
  const manager = useRobotManager();
  
  return useMemo(() => ({
    activeRobots: manager.activeRobots,
    currentRobot: manager.getCurrentRobot(),
    currentRobotName: manager.getCurrentRobotName(),
    setRobotActive: manager.setRobotActive,
    hasActiveRobots: manager.hasActiveRobots,
    activeCount: manager.activeRobots.size
  }), [
    manager.activeRobots,
    manager.getCurrentRobot,
    manager.getCurrentRobotName,
    manager.setRobotActive,
    manager.hasActiveRobots
  ]);
};

export const useRobotManagerCollection = () => {
  const manager = useRobotManager();
  
  const getRobotNames = useCallback(() => {
    return manager.getAllRobots().map(robot => robot.id || robot.name);
  }, [manager.getAllRobots]);
  
  const getRobotModels = useCallback(() => {
    return manager.getAllRobots().map(robotData => robotData.model || robotData.robot);
  }, [manager.getAllRobots]);
  
  return useMemo(() => ({
    getAllRobots: manager.getAllRobots,
    getRobot: manager.getRobot,
    removeRobot: manager.removeRobot,
    clearAll: manager.clearAllRobots,
    hasRobots: manager.hasRobots,
    count: manager.robotCount,
    isEmpty: manager.isEmpty,
    
    // Convenience methods
    getRobotNames,
    getRobotModels
  }), [
    manager.getAllRobots,
    manager.getRobot,
    manager.removeRobot,
    manager.clearAllRobots,
    manager.hasRobots,
    manager.robotCount,
    manager.isEmpty,
    getRobotNames,
    getRobotModels
  ]);
};

// ========== CONVENIENCE HOOKS (Additional) ==========

export const useActiveRobot = () => {
  const { activeId, activeRobot, hasActive } = useRobotSelection();
  
  return useMemo(() => ({
    id: activeId,
    robot: activeRobot,
    hasActive
  }), [activeId, activeRobot, hasActive]);
};

export const useWorkspaceRobotCount = () => {
  const { count } = useRobotWorkspace();
  return count;
};

export const useRobotErrors = () => {
  const { error, hasError, clearError } = useRobotLoading();
  
  return useMemo(() => ({
    error,
    hasError,
    clear: clearError
  }), [error, hasError, clearError]);
};

// ========== BACKWARD COMPATIBILITY EXPORTS ==========
// These maintain compatibility with code using old useRobot hook
export const useRobot = useRobotManager;

export default useRobotManager;