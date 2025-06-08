// src/contexts/WorkspaceContext.jsx - Manages workspace robots (saved/bookmarked robots)
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '../utils/EventBus';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  // === WORKSPACE STATE (Persistent - localStorage) ===
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // === UI STATE ===
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // === PREVENT MULTIPLE SIMULTANEOUS OPERATIONS ===
  const isOperatingRef = useRef(false);

  // ===============================
  // WORKSPACE LOGIC (Persistent Storage)
  // ===============================

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
    if (isOperatingRef.current) {
      console.log('[Workspace] Operation in progress, skipping add');
      return null;
    }

    try {
      isOperatingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSuccessMessage('');

      // Check if robot already exists
      if (workspaceRobots.some(r => r.robotId === robotData.id)) {
        setSuccessMessage(`${robotData.name} is already in your workspace`);
        return null;
      }

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
        console.log('[Workspace] Adding robot to workspace:', newRobot);
        return [...prev, newRobot];
      });
      
      setSuccessMessage(`${robotData.name} added to workspace!`);
      EventBus.emit('workspace:robot-added', { robot: newRobot });
      return newRobot;
    } catch (error) {
      console.error('[Workspace] Error adding robot:', error);
      setError('Failed to add robot to workspace');
      return null;
    } finally {
      setIsLoading(false);
      isOperatingRef.current = false;
    }
  }, [workspaceRobots]);

  // Remove robot from workspace
  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    if (isOperatingRef.current) {
      console.log('[Workspace] Operation in progress, skipping remove');
      return;
    }

    try {
      isOperatingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSuccessMessage('');

      setWorkspaceRobots(prev => {
        const robotToRemove = prev.find(r => r.id === workspaceRobotId);
        const updated = prev.filter(r => r.id !== workspaceRobotId);
        console.log('[Workspace] Removing robot from workspace:', workspaceRobotId);
        
        if (robotToRemove) {
          setSuccessMessage(`${robotToRemove.name} removed from workspace`);
          EventBus.emit('workspace:robot-removed', { robot: robotToRemove });
        }
        
        return updated;
      });
    } catch (error) {
      console.error('[Workspace] Error removing robot:', error);
      setError('Failed to remove robot from workspace');
    } finally {
      setIsLoading(false);
      isOperatingRef.current = false;
    }
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
    if (isOperatingRef.current) {
      console.log('[Workspace] Operation in progress, skipping clear');
      return;
    }

    try {
      isOperatingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSuccessMessage('');

      setWorkspaceRobots([]);
      console.log('[Workspace] Cleared all robots from workspace');
      setSuccessMessage('Workspace cleared successfully');
      EventBus.emit('workspace:cleared');
    } catch (error) {
      console.error('[Workspace] Error clearing workspace:', error);
      setError('Failed to clear workspace');
    } finally {
      setIsLoading(false);
      isOperatingRef.current = false;
    }
  }, []);

  // Import robots (from file)
  const importRobots = useCallback((robotsData) => {
    if (isOperatingRef.current) {
      console.log('[Workspace] Operation in progress, skipping import');
      return;
    }

    try {
      isOperatingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSuccessMessage('');

      setWorkspaceRobots(robotsData);
      console.log('[Workspace] Imported robots:', robotsData);
      setSuccessMessage(`Successfully imported ${robotsData.length} robots`);
      EventBus.emit('workspace:imported', { robots: robotsData });
    } catch (error) {
      console.error('[Workspace] Error importing robots:', error);
      setError('Failed to import robots');
    } finally {
      setIsLoading(false);
      isOperatingRef.current = false;
    }
  }, []);

  // Export robots (to file)
  const exportRobots = useCallback(() => {
    if (isOperatingRef.current) {
      console.log('[Workspace] Operation in progress, skipping export');
      return;
    }

    try {
      isOperatingRef.current = true;
      setIsLoading(true);
      setError(null);
      setSuccessMessage('');

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
      setSuccessMessage(`Successfully exported ${workspaceRobots.length} robots`);
      EventBus.emit('workspace:exported', { robots: workspaceRobots });
    } catch (error) {
      console.error('[Workspace] Error exporting robots:', error);
      setError('Failed to export robots');
    } finally {
      setIsLoading(false);
      isOperatingRef.current = false;
    }
  }, [workspaceRobots]);

  // Clear success message after a delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const value = {
    // === WORKSPACE DATA ===
    workspaceRobots,
    workspaceCount: workspaceRobots.length,
    
    // === UI STATE ===
    isLoading,
    error,
    successMessage,
    
    // === WORKSPACE METHODS ===
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    getWorkspaceRobot,
    isRobotInWorkspace,
    clearWorkspace,
    importRobots,
    exportRobots,
    
    // === UTILS ===
    clearError: useCallback(() => setError(null), []),
    clearSuccessMessage: useCallback(() => setSuccessMessage(''), []),
    
    // === COMPUTED DATA ===
    hasWorkspaceRobots: workspaceRobots.length > 0,
    isEmpty: workspaceRobots.length === 0
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