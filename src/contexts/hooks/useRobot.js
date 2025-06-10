// src/contexts/hooks/useRobot.js - UNIFIED ROBOT HOOK (Discovery + Workspace + 3D Operations)
import { useCallback, useContext } from 'react';
import { useRobotContext } from '../RobotContext';
import RobotContext from '../RobotContext';

// ========== MAIN HOOK (Everything) ==========
/**
 * Hook to use the robot context
 * @returns {Object} Robot context value
 * @throws {Error} If used outside of RobotProvider
 */
export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }
  return context;
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
    availableTools,
    discoverRobots,
    refresh,
    loadAvailableTools,
    hasAvailableRobots,
    hasAvailableTools,
    getRobotById,
    getRobotsByCategory,
    getCategoryById
  } = useRobot();
  
  return {
    // Discovery State
    robots: availableRobots,
    categories,
    tools: availableTools,
    hasRobots: hasAvailableRobots,
    hasTools: hasAvailableTools,
    
    // Discovery Operations
    discover: discoverRobots,
    refresh,
    refreshTools: loadAvailableTools,
    
    // Helper Methods
    getRobotById,
    getRobotsByCategory,
    getCategoryById,
    
    // Computed Properties
    robotCount: availableRobots.length,
    categoryCount: categories.length,
    toolCount: availableTools.length,
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
    get3DRobot,
    getAll3DRobots
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
    
    // 3D Model Access
    get3DModel: get3DRobot,
    getAll3DModels: getAll3DRobots,
    
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

// ========== NEW: 3D ROBOT CONTROL HOOKS ==========

export const useRobotControl = (robotId = null) => {
  const {
    activeRobotId,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    getRobot,
    hasJointControl,
    getJointNames,
    getJointCount,
    updateMultipleJoints,
    resetAllJoints,
    getCurrentJointState,
    getRobotModel
  } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  return {
    // Control State
    robotId: targetRobotId,
    hasControl: hasJointControl(targetRobotId),
    jointNames: getJointNames(targetRobotId),
    jointCount: getJointCount(targetRobotId),
    
    // Joint Control Operations
    setJoint: (jointName, value) => setJointValue(targetRobotId, jointName, value),
    setJoints: (values) => setJointValues(targetRobotId, values),
    getJoints: () => getJointValues(targetRobotId),
    resetJoints: () => resetJoints(targetRobotId),
    
    // Batch Operations
    updateMultiple: (jointUpdates) => updateMultipleJoints(targetRobotId, jointUpdates),
    resetAll: () => resetAllJoints(targetRobotId),
    
    // State Queries
    getCurrentState: () => getCurrentJointState(targetRobotId),
    getModel: () => getRobotModel(targetRobotId),
    getRobotObject: () => getRobot(targetRobotId),
    
    // Convenience Methods
    hasJoints: getJointCount(targetRobotId) > 0,
    isControlReady: !!targetRobotId && hasJointControl(targetRobotId)
  };
};

export const useRobotJoints = (robotId = null) => {
  const {
    activeRobotId,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    getJointNames,
    getJointCount,
    getCurrentJointState
  } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  return {
    // Joint State
    robotId: targetRobotId,
    jointNames: getJointNames(targetRobotId),
    jointCount: getJointCount(targetRobotId),
    currentValues: getCurrentJointState(targetRobotId),
    
    // Joint Operations
    setValue: (jointName, value) => setJointValue(targetRobotId, jointName, value),
    setValues: (values) => setJointValues(targetRobotId, values),
    getValues: () => getJointValues(targetRobotId),
    reset: () => resetJoints(targetRobotId),
    
    // State Checks
    hasJoints: getJointCount(targetRobotId) > 0,
    isReady: !!targetRobotId
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

export const useRobotTools = () => {
  const {
    availableTools,
    hasAvailableTools,
    loadAvailableTools
  } = useRobot();
  
  return {
    tools: availableTools,
    hasTools: hasAvailableTools,
    refresh: loadAvailableTools,
    count: availableTools.length
  };
};

export default useRobot;