// src/contexts/hooks/useRobot.js - UNIFIED ROBOT HOOK (Discovery + Loading + Management)
import { useCallback } from 'react';
import { useRobotContext } from '../RobotContext';

// ========== MAIN HOOK (Everything) ==========
export const useRobot = () => {
  const context = useRobotContext();
  
  return {
    // ========== ROBOT STATE ==========
    // Robot Discovery
    availableRobots: context.availableRobots,
    categories: context.categories,
    
    // TCP Tool Discovery
    availableTools: context.availableTools,
    
    // Workspace Management
    workspaceRobots: context.workspaceRobots,
    
    // Robot Loading & Management
    robots: context.robots,
    activeRobots: context.activeRobots,
    
    // Active Robot Management
    activeRobotId: context.activeRobotId,
    activeRobot: context.activeRobot,
    loadedRobots: context.loadedRobots,
    
    // Loading & Error States
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    
    // ========== ROBOT DISCOVERY OPERATIONS ==========
    discoverRobots: context.discoverRobots,
    refresh: context.refresh,
    
    // ========== TCP TOOL OPERATIONS ==========
    loadAvailableTools: context.loadAvailableTools,
    
    // ========== WORKSPACE OPERATIONS ==========
    addRobotToWorkspace: context.addRobotToWorkspace,
    removeRobotFromWorkspace: context.removeRobotFromWorkspace,
    isRobotInWorkspace: context.isRobotInWorkspace,
    getWorkspaceRobot: context.getWorkspaceRobot,
    clearWorkspace: context.clearWorkspace,
    importRobots: context.importRobots,
    exportRobots: context.exportRobots,
    
    // ========== ROBOT LOADING OPERATIONS ==========
    loadRobot: context.loadRobot,
    unloadRobot: context.unloadRobot,
    isRobotLoaded: context.isRobotLoaded,
    getRobot: context.getRobot,
    setActiveRobotId: context.setActiveRobotId,
    setActiveRobot: context.setActiveRobot,
    getRobotLoadStatus: context.getRobotLoadStatus,
    
    // ========== ROBOT MANAGEMENT METHODS ==========
    getAllRobots: context.getAllRobots,
    setRobotActive: context.setRobotActive,
    removeRobot: context.removeRobot,
    getActiveRobots: context.getActiveRobots,
    
    // ========== JOINT CONTROL METHODS ==========
    setJointValue: context.setJointValue,
    setJointValues: context.setJointValues,
    getJointValues: context.getJointValues,
    resetJoints: context.resetJoints,
    
    // ========== UTILITY METHODS ==========
    getCurrentRobot: context.getCurrentRobot,
    getCurrentRobotName: context.getCurrentRobotName,
    
    // ========== CONVENIENCE METHODS ==========
    getLoadedRobots: context.getLoadedRobots,
    
    // ========== COMPUTED PROPERTIES ==========
    robotCount: context.robotCount,
    isEmpty: context.isEmpty,
    hasWorkspaceRobots: context.hasWorkspaceRobots,
    hasAvailableRobots: context.hasAvailableRobots,
    hasLoadedRobots: context.hasLoadedRobots,
    hasActiveRobot: context.hasActiveRobot,
    hasAvailableTools: context.hasAvailableTools,
    
    // Robot Manager computed properties
    hasRobots: context.hasRobots,
    activeRobotCount: context.activeRobotCount,
    
    // ========== ERROR HANDLING ==========
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    // ========== HELPER FUNCTIONS ==========
    getRobotById: useCallback((robotId) => {
      return context.availableRobots.find(robot => robot.id === robotId);
    }, [context.availableRobots]),
    
    getWorkspaceRobotById: useCallback((workspaceRobotId) => {
      return context.workspaceRobots.find(robot => robot.id === workspaceRobotId);
    }, [context.workspaceRobots]),
    
    getRobotsByCategory: useCallback((categoryId) => {
      return context.availableRobots.filter(robot => robot.category === categoryId);
    }, [context.availableRobots]),
    
    getCategoryById: useCallback((categoryId) => {
      return context.categories.find(category => category.id === categoryId);
    }, [context.categories]),
    
    // ========== STATE CHECKS ==========
    isRobotActive: useCallback((robotId) => {
      return context.activeRobotId === robotId;
    }, [context.activeRobotId]),
    
    hasWorkspaceRobot: useCallback((robotId) => {
      return context.workspaceRobots.some(r => r.robotId === robotId);
    }, [context.workspaceRobots]),
    
    // Robot Manager convenience methods
    isRobotActiveInManager: useCallback((robotName) => {
      return context.activeRobots.has(robotName);
    }, [context.activeRobots]),
    
    getRobotData: useCallback((robotName) => {
      return context.robots.get(robotName);
    }, [context.robots]),
    
    hasActiveRobots: context.activeRobots.size > 0,
    isManagerEmpty: context.robots.size === 0
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useRobotWorkspace = () => {
  const {
    workspaceRobots,
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    getWorkspaceRobot,
    clearWorkspace,
    importRobots,
    exportRobots,
    robotCount,
    isEmpty,
    hasWorkspaceRobots,
    getWorkspaceRobotById,
    hasWorkspaceRobot
  } = useRobot();
  
  return {
    // Workspace State
    robots: workspaceRobots,
    count: robotCount,
    isEmpty,
    hasRobots: hasWorkspaceRobots,
    
    // Workspace Operations
    addRobot: addRobotToWorkspace,
    removeRobot: removeRobotFromWorkspace,
    isInWorkspace: isRobotInWorkspace,
    getRobot: getWorkspaceRobot,
    clear: clearWorkspace,
    import: importRobots,
    export: exportRobots,
    
    // Helper Methods
    getById: getWorkspaceRobotById,
    hasRobot: hasWorkspaceRobot
  };
};

export const useRobotDiscovery = () => {
  const {
    availableRobots,
    categories,
    discoverRobots,
    refresh,
    hasAvailableRobots,
    getRobotById,
    getRobotsByCategory,
    getCategoryById
  } = useRobot();
  
  return {
    // Discovery State
    robots: availableRobots,
    categories,
    hasRobots: hasAvailableRobots,
    
    // Discovery Operations
    discover: discoverRobots,
    refresh,
    
    // Helper Methods
    getRobotById,
    getRobotsByCategory,
    getCategoryById,
    
    // Computed Properties
    robotCount: availableRobots.length,
    categoryCount: categories.length,
    isEmpty: availableRobots.length === 0
  };
};

export const useRobotManagement = () => {
  const {
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getRobot,
    getRobotLoadStatus,
    loadedRobots,
    hasLoadedRobots,
    getLoadedRobots,
    
    // Robot Manager methods
    robots,
    getAllRobots,
    setRobotActive,
    removeRobot,
    hasRobots,
    activeRobotCount,
    isManagerEmpty
  } = useRobot();
  
  return {
    // Loading State
    loadedRobots,
    hasLoaded: hasLoadedRobots,
    
    // Robot Manager State
    robots,
    hasRobots,
    isEmpty: isManagerEmpty,
    activeCount: activeRobotCount,
    
    // Loading Operations
    load: loadRobot,
    unload: unloadRobot,
    isLoaded: isRobotLoaded,
    getRobot,
    getStatus: getRobotLoadStatus,
    getAll: getLoadedRobots,
    
    // Management Operations
    getAllRobots,
    setRobotActive,
    remove: removeRobot,
    
    // Computed Properties
    loadedCount: loadedRobots.size,
    totalCount: robots.size
  };
};

export const useRobotSelection = () => {
  const {
    activeRobotId,
    activeRobot,
    setActiveRobotId,
    setActiveRobot,
    hasActiveRobot,
    isRobotActive
  } = useRobot();
  
  return {
    // Selection State
    activeId: activeRobotId,
    activeRobot,
    hasActive: hasActiveRobot,
    
    // Selection Operations
    setActive: setActiveRobotId,
    setActiveRobot,
    clearActive: () => setActiveRobotId(null),
    
    // Helper Methods
    isActive: isRobotActive
  };
};

export const useRobotLoading = () => {
  const {
    isLoading,
    error,
    successMessage,
    clearError,
    clearSuccess
  } = useRobot();
  
  return {
    // Loading State
    isLoading,
    error,
    success: successMessage,
    
    // Loading Operations
    clearError,
    clearSuccess,
    
    // State Checks
    hasError: !!error,
    hasSuccess: !!successMessage
  };
};

export const useRobotCategories = () => {
  const {
    categories,
    getRobotsByCategory,
    getCategoryById
  } = useRobot();
  
  return {
    // Category State
    categories,
    count: categories.length,
    isEmpty: categories.length === 0,
    
    // Category Operations
    getRobotsByCategory,
    getById: getCategoryById
  };
};

// ========== JOINT CONTROL HOOKS ==========

export const useRobotJointControl = (robotName = null) => {
  const { 
    setJointValue, 
    setJointValues, 
    getJointValues, 
    resetJoints,
    getCurrentRobotName 
  } = useRobot();
  
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
  } = useRobot();
  
  return {
    activeRobots,
    currentRobot: getCurrentRobot(),
    currentRobotName: getCurrentRobotName(),
    setRobotActive,
    hasActiveRobots,
    activeCount: activeRobots.size
  };
};

export const useRobotCollection = () => {
  const {
    robots,
    getAllRobots,
    getRobot,
    removeRobot,
    hasRobots,
    isManagerEmpty
  } = useRobot();
  
  return {
    robots,
    getAllRobots,
    getRobot,
    removeRobot,
    hasRobots,
    count: robots.size,
    isEmpty: isManagerEmpty,
    
    // Convenience methods
    getRobotNames: useCallback(() => {
      return Array.from(robots.keys());
    }, [robots]),
    
    getRobotModels: useCallback(() => {
      return Array.from(robots.values()).map(robotData => robotData.model);
    }, [robots])
  };
};

// ========== CONVENIENCE HOOKS ==========

export const useActiveRobot = () => {
  const { activeRobotId, activeRobot, hasActiveRobot } = useRobotSelection();
  
  return {
    id: activeRobotId,
    robot: activeRobot,
    hasActive: hasActiveRobot
  };
};

export const useWorkspaceRobotCount = () => {
  const { count } = useRobotWorkspace();
  return count;
};

export const useRobotErrors = () => {
  const { error, hasError, clearError } = useRobotLoading();
  
  return {
    error,
    hasError,
    clear: clearError
  };
};

// ========== BACKWARDS COMPATIBILITY ALIASES ==========

// Alias for useRobot (main hook)
export const useRobotManager = useRobot;

// Individual aliases for specialized functionality
export const useRobotManagerLoading = useRobotLoading;
export const useRobotManagerJointControl = useRobotJointControl;
export const useRobotManagerCollection = useRobotCollection;

export default useRobot;