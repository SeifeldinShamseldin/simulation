// src/contexts/hooks/useRobot.js - UNIFIED HOOKS
import { useCallback } from 'react';
import { useRobotContext } from '../RobotContext';

// ========== MAIN HOOK (Everything) ==========
export const useRobot = () => {
  const context = useRobotContext();
  
  return {
    // ========== DISCOVERY ==========
    availableRobots: context.availableRobots,
    categories: context.categories,
    availableTools: context.availableTools,
    discoverRobots: context.discoverRobots,
    refresh: context.discoverRobots, // Alias
    
    // ========== WORKSPACE ==========
    workspaceRobots: context.workspaceRobots,
    addRobotToWorkspace: context.addRobotToWorkspace,
    removeRobotFromWorkspace: context.removeRobotFromWorkspace,
    isRobotInWorkspace: context.isRobotInWorkspace,
    clearWorkspace: context.clearWorkspace,
    exportRobots: context.exportWorkspace,
    importRobots: context.importWorkspace,
    
    // ========== LOADED ROBOTS ==========
    loadedRobots: context.loadedRobots,
    activeRobotId: context.activeRobotId,
    activeRobot: context.activeRobot,
    loadRobot: context.loadRobot,
    unloadRobot: context.unloadRobot,
    getRobot: context.getRobot,
    isRobotLoaded: context.isRobotLoaded,
    setActiveRobotId: context.setActiveRobotId,
    setActiveRobot: context.setActiveRobotId, // Same function now
    
    // ========== STATE ==========
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    // ========== COMPUTED ==========
    robotCount: context.workspaceCount,
    isEmpty: context.workspaceCount === 0,
    hasWorkspaceRobots: context.hasWorkspaceRobots,
    hasAvailableRobots: context.availableRobots.length > 0,
    hasLoadedRobots: context.hasLoadedRobots,
    hasActiveRobot: context.hasActiveRobot,
    hasAvailableTools: context.availableTools.length > 0,
    
    // ========== HELPERS ==========
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
    
    isRobotActive: useCallback((robotId) => {
      return context.activeRobotId === robotId;
    }, [context.activeRobotId]),
    
    getWorkspaceRobot: useCallback((workspaceRobotId) => {
      return context.workspaceRobots.find(r => r.id === workspaceRobotId);
    }, [context.workspaceRobots]),
    
    getRobotLoadStatus: useCallback((robot) => {
      const loaded = context.isRobotLoaded(robot.id);
      return {
        isLoaded: loaded,
        statusText: loaded ? 'Loaded' : 'Click to Load'
      };
    }, [context.isRobotLoaded]),
    
    getLoadedRobots: () => context.loadedRobots
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useRobotWorkspace = () => {
  const context = useRobotContext();
  
  return {
    robots: context.workspaceRobots,
    count: context.workspaceCount,
    isEmpty: context.workspaceCount === 0,
    hasRobots: context.hasWorkspaceRobots,
    
    addRobot: context.addRobotToWorkspace,
    removeRobot: context.removeRobotFromWorkspace,
    isInWorkspace: context.isRobotInWorkspace,
    clear: context.clearWorkspace,
    import: context.importWorkspace,
    export: context.exportWorkspace,
    
    getById: useCallback((id) => {
      return context.workspaceRobots.find(r => r.id === id);
    }, [context.workspaceRobots]),
    
    getRobot: useCallback((id) => {
      return context.workspaceRobots.find(r => r.id === id);
    }, [context.workspaceRobots]),
    
    hasRobot: useCallback((robotId) => {
      return context.workspaceRobots.some(r => r.robotId === robotId);
    }, [context.workspaceRobots])
  };
};

export const useRobotDiscovery = () => {
  const context = useRobotContext();
  
  return {
    robots: context.availableRobots,
    categories: context.categories,
    hasRobots: context.availableRobots.length > 0,
    
    discover: context.discoverRobots,
    refresh: context.discoverRobots,
    
    getRobotById: useCallback((id) => {
      return context.availableRobots.find(r => r.id === id);
    }, [context.availableRobots]),
    
    getRobotsByCategory: useCallback((categoryId) => {
      return context.availableRobots.filter(r => r.category === categoryId);
    }, [context.availableRobots]),
    
    getCategoryById: useCallback((categoryId) => {
      return context.categories.find(c => c.id === categoryId);
    }, [context.categories]),
    
    robotCount: context.availableRobots.length,
    categoryCount: context.categories.length,
    isEmpty: context.availableRobots.length === 0
  };
};

export const useRobotManagement = () => {
  const context = useRobotContext();
  
  return {
    loadedRobots: context.loadedRobots,
    hasLoaded: context.hasLoadedRobots,
    
    load: context.loadRobot,
    unload: context.unloadRobot,
    isLoaded: context.isRobotLoaded,
    getRobot: context.getRobot,
    
    getStatus: useCallback((robot) => {
      const loaded = context.isRobotLoaded(robot.id);
      return {
        isLoaded: loaded,
        statusText: loaded ? 'Loaded' : 'Click to Load'
      };
    }, [context.isRobotLoaded]),
    
    getAll: () => context.loadedRobots,
    loadedCount: context.robotCount,
    hasRobots: context.robotCount > 0
  };
};

export const useRobotSelection = () => {
  const context = useRobotContext();
  
  return {
    activeId: context.activeRobotId,
    activeRobot: context.activeRobot,
    hasActive: context.hasActiveRobot,
    
    setActive: context.setActiveRobotId,
    setActiveRobot: context.setActiveRobotId,
    clearActive: () => context.setActiveRobotId(null),
    
    isActive: useCallback((robotId) => {
      return context.activeRobotId === robotId;
    }, [context.activeRobotId])
  };
};

export const useRobotLoading = () => {
  const context = useRobotContext();
  
  return {
    isLoading: context.isLoading,
    error: context.error,
    success: context.successMessage,
    
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    hasError: !!context.error,
    hasSuccess: !!context.successMessage
  };
};

export const useRobotCategories = () => {
  const context = useRobotContext();
  
  return {
    categories: context.categories,
    count: context.categories.length,
    isEmpty: context.categories.length === 0,
    
    getRobotsByCategory: useCallback((categoryId) => {
      return context.availableRobots.filter(r => r.category === categoryId);
    }, [context.availableRobots]),
    
    getById: useCallback((categoryId) => {
      return context.categories.find(c => c.id === categoryId);
    }, [context.categories])
  };
};

// ========== ROBOT MANAGER COMPATIBILITY HOOK ==========
export const useRobotManager = () => {
  const context = useRobotContext();
  
  return {
    // State
    robots: context.loadedRobots,
    activeRobots: new Set(context.activeRobotId ? [context.activeRobotId] : []),
    isLoading: context.isLoading,
    error: context.error,
    
    // Robot Management
    loadRobot: context.loadRobot,
    getAllRobots: () => context.loadedRobots,
    getRobot: context.getRobot,
    setRobotActive: (robotId, isActive) => {
      if (isActive) {
        context.setActiveRobotId(robotId);
      } else if (context.activeRobotId === robotId) {
        context.setActiveRobotId(null);
      }
      return true;
    },
    removeRobot: context.unloadRobot,
    clearAllRobots: () => {
      for (const [robotId] of context.loadedRobots) {
        context.unloadRobot(robotId);
      }
    },
    getActiveRobots: () => context.activeRobotId ? [context.activeRobotId] : [],
    
    // Joint Control
    setJointValue: context.setJointValue,
    setJointValues: context.setJointValues,
    getJointValues: context.getJointValues,
    resetJoints: context.resetJoints,
    
    // Utility
    calculateRobotPositions: () => {
      const positions = [];
      let index = 0;
      for (const [robotId] of context.loadedRobots) {
        positions.push({
          robotId,
          position: { x: index * 2, y: 0, z: 0 }
        });
        index++;
      }
      return positions;
    },
    getCurrentRobot: () => context.activeRobot,
    getCurrentRobotName: () => context.activeRobotId,
    
    // State checks
    hasRobots: context.hasLoadedRobots,
    robotCount: context.robotCount,
    activeRobotCount: context.activeRobotId ? 1 : 0,
    
    // Error handling
    clearError: context.clearError,
    
    // Additional compatibility methods
    isRobotLoaded: context.isRobotLoaded,
    isRobotActive: (robotId) => context.activeRobotId === robotId,
    getRobotData: (robotId) => context.loadedRobots.get(robotId),
    hasActiveRobots: context.hasActiveRobot,
    isEmpty: context.robotCount === 0
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