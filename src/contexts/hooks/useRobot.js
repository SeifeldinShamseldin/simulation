// src/contexts/hooks/useRobot.js - HOOK DISPATCHER (Same as Environment Pattern)
import { useCallback } from 'react';
import { useRobotContext } from '../RobotContext';

// ========== MAIN HOOK (Everything) ==========
export const useRobot = () => {
  const context = useRobotContext();
  
  return {
    // ========== ROBOT STATE ==========
    availableRobots: context.availableRobots,
    categories: context.categories,
    workspaceRobots: context.workspaceRobots,
    activeRobotId: context.activeRobotId,
    activeRobot: context.activeRobot,
    loadedRobots: context.loadedRobots,
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    
    // ========== ROBOT DISCOVERY OPERATIONS ==========
    discoverRobots: context.discoverRobots,
    refresh: context.refresh,
    
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
    
    // ========== CONVENIENCE METHODS ==========
    getLoadedRobots: context.getLoadedRobots,
    
    // ========== COMPUTED PROPERTIES ==========
    robotCount: context.robotCount,
    isEmpty: context.isEmpty,
    hasWorkspaceRobots: context.hasWorkspaceRobots,
    hasAvailableRobots: context.hasAvailableRobots,
    hasLoadedRobots: context.hasLoadedRobots,
    hasActiveRobot: context.hasActiveRobot,
    
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
    }, [context.workspaceRobots])
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
    getLoadedRobots
  } = useRobot();
  
  return {
    // Loading State
    loadedRobots,
    hasLoaded: hasLoadedRobots,
    
    // Loading Operations
    load: loadRobot,
    unload: unloadRobot,
    isLoaded: isRobotLoaded,
    getRobot,
    getStatus: getRobotLoadStatus,
    getAll: getLoadedRobots,
    
    // Computed Properties
    loadedCount: loadedRobots.size,
    hasRobots: loadedRobots.size > 0
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

export default useRobot;