// src/contexts/hooks/useRobot.js - Data Transfer Layer (Pure Data Access)
import { useContext } from 'react';
import RobotContext from '../RobotContext';

/**
 * Pure data transfer hook - no logic, just data access patterns
 * All business logic lives in RobotContext
 */
export const useRobot = (robotId = null) => {
  const context = useContext(RobotContext);
  
  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || context.activeRobotId;
  
  // Get specific robot data if robotId provided
  const targetRobotData = targetRobotId ? context.getLoadedRobot(targetRobotId) : null;
  const isTargetRobotLoaded = targetRobotId ? context.isRobotLoaded(targetRobotId) : false;
  const targetWorkspaceRobot = targetRobotId ? 
    context.workspaceRobots.find(r => r.id === targetRobotId) : null;
  
  return {
    // ===============================
    // WORKSPACE DATA (Persistent)
    // ===============================
    workspaceRobots: context.workspaceRobots,
    workspaceCount: context.workspaceCount,
    hasWorkspaceRobots: context.hasWorkspaceRobots,
    
    // ===============================
    // AVAILABLE ROBOTS DATA (Server)
    // ===============================
    availableRobots: context.availableRobots,
    categories: context.categories,
    
    // ===============================
    // LOADED ROBOTS DATA (3D Viewer)
    // ===============================
    loadedRobots: context.loadedRobots,
    loadedRobotsMap: context.loadedRobotsMap,
    loadedRobotCount: context.loadedRobotCount,
    hasLoadedRobots: context.hasLoadedRobots,
    
    // ===============================
    // ACTIVE ROBOT DATA
    // ===============================
    activeRobotId: context.activeRobotId,
    activeRobot: context.activeRobot,
    hasActiveRobot: !!context.activeRobotId,
    
    // ===============================
    // TARGET ROBOT DATA (if robotId provided)
    // ===============================
    targetRobotId,
    targetRobot: targetRobotData,
    isTargetRobotLoaded,
    targetWorkspaceRobot,
    
    // ===============================
    // UI STATE
    // ===============================
    isLoading: context.isLoading,
    error: context.error,
    
    // ===============================
    // WORKSPACE METHODS (Direct Pass-through)
    // ===============================
    addRobotToWorkspace: context.addRobotToWorkspace,
    removeRobotFromWorkspace: context.removeRobotFromWorkspace,
    isRobotInWorkspace: context.isRobotInWorkspace,
    
    // ===============================
    // AVAILABLE ROBOTS METHODS
    // ===============================
    discoverRobots: context.discoverRobots,
    refreshRobots: context.refreshRobots,
    
    // ===============================
    // LOADED ROBOTS METHODS
    // ===============================
    loadRobot: context.loadRobot,
    unloadRobot: context.unloadRobot,
    isRobotLoaded: context.isRobotLoaded,
    getLoadedRobot: context.getLoadedRobot,
    getActiveRobot: context.getActiveRobot,
    setRobotActive: context.setRobotActive,
    
    // ===============================
    // SERVER METHODS
    // ===============================
    addNewRobot: context.addNewRobot,
    
    // ===============================
    // VIEWER MANAGEMENT
    // ===============================
    setViewer: context.setViewer,
    
    // ===============================
    // UTILS
    // ===============================
    clearError: context.clearError,
    
    // ===============================
    // CONVENIENCE METHODS (Data Patterns)
    // ===============================
    
    // Get robot by any ID (workspace, loaded, or active)
    getRobotById: (id) => {
      // Try loaded robots first
      const loaded = context.getLoadedRobot(id);
      if (loaded) return loaded;
      
      // Try workspace robots
      const workspace = context.workspaceRobots.find(r => r.id === id);
      return workspace || null;
    },
    
    // Check if robot exists anywhere
    robotExists: (id) => {
      return context.isRobotLoaded(id) || context.isRobotInWorkspace(id);
    },
    
    // Get robot status
    getRobotStatus: (id) => {
      const isLoaded = context.isRobotLoaded(id);
      const inWorkspace = context.isRobotInWorkspace(id);
      const isActive = context.activeRobotId === id;
      
      return {
        isLoaded,
        inWorkspace,
        isActive,
        status: isActive ? 'active' : isLoaded ? 'loaded' : inWorkspace ? 'workspace' : 'unknown'
      };
    },
    
    // Get workspace robot by loaded robot ID
    getWorkspaceRobotByLoadedId: (loadedId) => {
      const loadedData = context.loadedRobotsMap.get(loadedId);
      if (!loadedData) return null;
      
      return context.workspaceRobots.find(wr => 
        wr.urdfPath === loadedData.urdfPath || wr.robotId === loadedId
      );
    },
    
    // Filter methods
    getLoadedRobotIds: () => Array.from(context.loadedRobotsMap.keys()),
    getWorkspaceRobotIds: () => context.workspaceRobots.map(r => r.id),
    getAvailableRobotIds: () => context.availableRobots.map(r => r.id),
    
    // Search methods
    findRobotByName: (name) => {
      // Search in all robot collections
      const loaded = context.loadedRobots.find(r => r.robot?.name === name);
      if (loaded) return loaded;
      
      const workspace = context.workspaceRobots.find(r => r.name === name);
      if (workspace) return workspace;
      
      const available = context.availableRobots.find(r => r.name === name);
      return available || null;
    },
    
    findRobotsByManufacturer: (manufacturer) => {
      return {
        workspace: context.workspaceRobots.filter(r => r.manufacturer === manufacturer),
        available: context.availableRobots.filter(r => r.categoryName === manufacturer),
        loaded: context.loadedRobots.filter(r => 
          context.workspaceRobots.find(wr => 
            wr.id === r.id && wr.manufacturer === manufacturer
          )
        )
      };
    }
  };
};

export default useRobot; 