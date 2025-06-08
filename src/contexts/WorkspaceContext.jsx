// src/contexts/WorkspaceContext.jsx - Manages workspace robots (saved/bookmarked robots)
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load workspace robots from localStorage on mount
  useEffect(() => {
    try {
      const savedRobots = localStorage.getItem('workspaceRobots');
      if (savedRobots) {
        const robots = JSON.parse(savedRobots);
        setWorkspaceRobots(robots);
        console.log('[Workspace] Loaded robots from localStorage:', robots);
      }
    } catch (error) {
      console.error('[Workspace] Error loading saved robots:', error);
      setError('Failed to load saved robots');
    }
  }, []);

  // Save workspace robots to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
      console.log('[Workspace] Saved robots to localStorage:', workspaceRobots);
    } catch (error) {
      console.error('[Workspace] Error saving robots:', error);
      setError('Failed to save robots');
    }
  }, [workspaceRobots]);

  // Add robot to workspace
  const addRobotToWorkspace = useCallback((robotData) => {
    const newRobot = {
      id: `${robotData.id}_${Date.now()}`,
      robotId: robotData.id,
      name: robotData.name,
      manufacturer: robotData.manufacturer,
      urdfPath: robotData.urdfPath,
      icon: '🤖',
      addedAt: new Date().toISOString()
    };
    
    setWorkspaceRobots(prev => {
      // Check if robot already exists
      const exists = prev.some(r => r.robotId === robotData.id);
      if (exists) {
        console.log('[Workspace] Robot already in workspace:', robotData.name);
        return prev;
      }
      
      console.log('[Workspace] Adding robot to workspace:', newRobot);
      return [...prev, newRobot];
    });
    
    return newRobot;
  }, []);

  // Remove robot from workspace
  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    setWorkspaceRobots(prev => {
      const updated = prev.filter(r => r.id !== workspaceRobotId);
      console.log('[Workspace] Removing robot from workspace:', workspaceRobotId);
      return updated;
    });
  }, []);

  // Get robot by workspace ID
  const getWorkspaceRobot = useCallback((workspaceRobotId) => {
    return workspaceRobots.find(r => r.id === workspaceRobotId);
  }, [workspaceRobots]);

  // Check if robot is in workspace
  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);

  // Clear all robots from workspace
  const clearWorkspace = useCallback(() => {
    setWorkspaceRobots([]);
    console.log('[Workspace] Cleared all robots from workspace');
  }, []);

  // Import robots (from file)
  const importRobots = useCallback((robotsData) => {
    try {
      setWorkspaceRobots(robotsData);
      console.log('[Workspace] Imported robots:', robotsData);
    } catch (error) {
      console.error('[Workspace] Error importing robots:', error);
      setError('Failed to import robots');
    }
  }, []);

  // Export robots (to file)
  const exportRobots = useCallback(() => {
    try {
      const dataStr = JSON.stringify(workspaceRobots, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `workspace_robots_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      console.log('[Workspace] Exported robots to file');
    } catch (error) {
      console.error('[Workspace] Error exporting robots:', error);
      setError('Failed to export robots');
    }
  }, [workspaceRobots]);

  const value = {
    // State
    workspaceRobots,
    isLoading,
    error,
    
    // Methods
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    getWorkspaceRobot,
    isRobotInWorkspace,
    clearWorkspace,
    importRobots,
    exportRobots,
    
    // Utils
    robotCount: workspaceRobots.length,
    isEmpty: workspaceRobots.length === 0,
    
    // Error handling
    clearError: () => setError(null)
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext; 