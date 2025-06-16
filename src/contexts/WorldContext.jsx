// src/contexts/WorldContext.jsx - FIXED VIEWER SETTINGS RESTORATION
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useRobotContext } from './RobotContext';
import { useEnvironmentContext } from './EnvironmentContext';
import { useTrajectoryContext } from './TrajectoryContext';
import { useTCPContext } from './TCPContext';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const WorldContext = createContext(null);

// World state version for compatibility checking
const WORLD_VERSION = '1.0.0';

export const WorldProvider = ({ children }) => {
  // Access all other contexts
  const robotContext = useRobotContext();
  const environmentContext = useEnvironmentContext();
  const trajectoryContext = useTrajectoryContext();
  const tcpContext = useTCPContext();
  const viewerContext = useViewer();

  // ========== STATE ==========
  const [savedWorlds, setSavedWorlds] = useState(() => {
    // Load saved worlds from localStorage
    try {
      const saved = localStorage.getItem('saved_worlds');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('[WorldContext] Error loading saved worlds:', error);
      return {};
    }
  });

  const [currentWorldName, setCurrentWorldName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ========== REFS ==========
  const autoSaveIntervalRef = useRef(null);
  const lastSaveTimeRef = useRef(Date.now());

  // ========== WORLD STATE CAPTURE ==========
  
  const captureWorldState = useCallback(() => {
    console.log('[WorldContext] Capturing world state...');
    
    const worldState = {
      version: WORLD_VERSION,
      timestamp: new Date().toISOString(),
      name: currentWorldName || 'Untitled World',
      
      // ========== ROBOTS ==========
      robots: (() => {
        const robots = [];
        
        // Get loaded robots
        robotContext.loadedRobots.forEach((robotData, robotId) => {
          const robot = robotData.robot || robotData.model;
          const jointValues = robotContext.getJointValues(robotId);
          
          // Get robot container for transforms
          const container = robotData.container;
          
          robots.push({
            id: robotId,
            name: robotData.name,
            urdfPath: robotData.urdfPath,
            isActive: robotData.isActive,
            position: container ? {
              x: container.position.x,
              y: container.position.y,
              z: container.position.z
            } : { x: 0, y: 0, z: 0 },
            rotation: container ? {
              x: container.rotation.x,
              y: container.rotation.y,
              z: container.rotation.z
            } : { x: 0, y: 0, z: 0 },
            scale: container ? {
              x: container.scale.x,
              y: container.scale.y,
              z: container.scale.z
            } : { x: 1, y: 1, z: 1 },
            jointValues: jointValues || {},
            metadata: robotData.metadata || {}
          });
        });
        
        return robots;
      })(),
      
      // ========== ENVIRONMENT ==========
      environment: (() => {
        const objects = [];
        
        environmentContext.loadedObjects.forEach(obj => {
          // Skip humans - they're handled separately
          if (obj.category === 'human') return;
          
          objects.push({
            id: obj.instanceId,
            objectId: obj.objectId,
            name: obj.name,
            category: obj.category,
            path: obj.path,
            position: obj.position || { x: 0, y: 0, z: 0 },
            rotation: obj.rotation || { x: 0, y: 0, z: 0 },
            scale: obj.scale || { x: 1, y: 1, z: 1 },
            visible: obj.visible !== false,
            metadata: obj.metadata || {}
          });
        });
        
        return objects;
      })(),
      
      // ========== HUMANS ==========
      humans: (() => {
        const humans = [];
        
        environmentContext.spawnedHumans.forEach(human => {
          const position = environmentContext.humanPositions[human.id] || { x: 0, y: 0, z: 0 };
          
          humans.push({
            id: human.id,
            name: human.name,
            isActive: human.isActive,
            position: position,
            metadata: human.metadata || {}
          });
        });
        
        return humans;
      })(),
      
      // ========== TCP TOOLS ==========
      tcpTools: (() => {
        const tools = [];
        
        tcpContext.attachedTools.forEach((toolData, robotId) => {
          tools.push({
            robotId: robotId,
            toolId: toolData.toolId,
            toolName: toolData.tool?.name || '',
            visible: toolData.visible,
            transforms: toolData.transforms || {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 }
            }
          });
        });
        
        return tools;
      })(),
      
      // ========== TRAJECTORIES ==========
      trajectories: (() => {
        const allTrajectories = {};
        
        // Get trajectories for each robot
        robotContext.loadedRobots.forEach((robotData, robotId) => {
          const trajectoryNames = trajectoryContext.getTrajectoryNames(robotId);
          
          if (trajectoryNames.length > 0) {
            allTrajectories[robotId] = {};
            
            trajectoryNames.forEach(name => {
              const trajectory = trajectoryContext.getTrajectory(name, robotId);
              if (trajectory) {
                allTrajectories[robotId][name] = trajectory;
              }
            });
          }
        });
        
        return allTrajectories;
      })(),
      
      // ========== CAMERA ==========
      camera: (() => {
        const camera = viewerContext.getCamera();
        const controls = viewerContext.getControls();
        
        if (!camera || !controls) return null;
        
        return {
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
          },
          target: controls.target ? {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
          } : { x: 0, y: 0, z: 0 },
          fov: camera.fov,
          near: camera.near,
          far: camera.far
        };
      })(),
      
      // ========== VIEWER SETTINGS ==========
      viewerSettings: {
        backgroundColor: viewerContext.viewerConfig?.backgroundColor || '#f5f5f5',
        enableShadows: viewerContext.viewerConfig?.enableShadows !== false,
        ambientColor: viewerContext.viewerConfig?.ambientColor || '#8ea0a8',
        upAxis: viewerContext.viewerConfig?.upAxis || '+Z',
        highlightColor: viewerContext.viewerConfig?.highlightColor || '#ff0000',
        dragControlsEnabled: viewerContext.dragControlsEnabled || false,
        tableVisible: viewerContext.tableState?.visible || false
      },
      
      // ========== METADATA ==========
      metadata: {
        description: '',
        tags: [],
        author: '',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    };
    
    console.log('[WorldContext] Captured world state:', worldState);
    return worldState;
  }, [currentWorldName, robotContext, environmentContext, trajectoryContext, tcpContext, viewerContext]);

  // ========== WORLD STATE RESTORATION ==========
  
  const restoreWorldState = useCallback(async (worldState) => {
    if (!worldState || worldState.version !== WORLD_VERSION) {
      throw new Error('Invalid or incompatible world state version');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[WorldContext] Restoring world state:', worldState.name);
      
      // Clear current state first
      await clearWorld();
      
      // ========== RESTORE VIEWER SETTINGS - FIXED ==========
      if (worldState.viewerSettings) {
        try {
          const sceneSetup = viewerContext.getSceneSetup();
          
          // Only update settings that have proper methods
          if (sceneSetup && sceneSetup.scene) {
            // Background color
            if (worldState.viewerSettings.backgroundColor) {
              const color = new THREE.Color(worldState.viewerSettings.backgroundColor);
              if (sceneSetup.scene.background) {
                sceneSetup.scene.background = color;
              }
              if (sceneSetup.scene.fog) {
                sceneSetup.scene.fog.color = color;
              }
            }
            
            // Shadows
            if (sceneSetup.renderer && worldState.viewerSettings.enableShadows !== undefined) {
              sceneSetup.renderer.shadowMap.enabled = worldState.viewerSettings.enableShadows;
            }
            
            // Ambient light
            if (worldState.viewerSettings.ambientColor && sceneSetup.ambientLight) {
              sceneSetup.ambientLight.color = new THREE.Color(worldState.viewerSettings.ambientColor);
            }
          }
          
          // Update viewer config state (without calling non-existent methods)
          if (viewerContext.updateViewerConfig) {
            // Create a safe update object that won't cause errors
            const safeUpdates = {};
            
            // Only include properties that the ViewerContext can handle
            ['backgroundColor', 'enableShadows', 'ambientColor', 'upAxis', 'highlightColor'].forEach(prop => {
              if (worldState.viewerSettings[prop] !== undefined) {
                safeUpdates[prop] = worldState.viewerSettings[prop];
              }
            });
            
            // Try to update config, but catch any errors
            try {
              // Store the current config first
              const currentConfig = viewerContext.viewerConfig || {};
              
              // Manually update the viewer config state if updateViewerConfig fails
              viewerContext.setViewerConfig?.({ ...currentConfig, ...safeUpdates });
            } catch (configError) {
              console.warn('[WorldContext] Could not update viewer config:', configError);
            }
          }
          
          // Drag controls
          if (viewerContext.setDragControls && worldState.viewerSettings.dragControlsEnabled !== undefined) {
            viewerContext.setDragControls(worldState.viewerSettings.dragControlsEnabled);
          }
          
          // Table
          if (viewerContext.toggleTable && worldState.viewerSettings.tableVisible) {
            await viewerContext.loadTable();
            viewerContext.toggleTable(worldState.viewerSettings.tableVisible);
          }
        } catch (error) {
          console.warn('[WorldContext] Error restoring viewer settings:', error);
          // Continue with restoration even if viewer settings fail
        }
      }
      
      // ========== RESTORE ROBOTS ==========
      if (worldState.robots && worldState.robots.length > 0) {
        for (const robotData of worldState.robots) {
          try {
            // Load robot
            await robotContext.loadRobot(robotData.id, robotData.urdfPath, {
              position: robotData.position,
              makeActive: robotData.isActive,
              clearOthers: false
            });
            
            // Set joint values
            if (robotData.jointValues && Object.keys(robotData.jointValues).length > 0) {
              robotContext.setJointValues(robotData.id, robotData.jointValues);
            }
            
            // Apply transforms if needed
            // TODO: Add rotation/scale support in loadRobot
            
          } catch (error) {
            console.error(`[WorldContext] Failed to restore robot ${robotData.id}:`, error);
          }
        }
      }
      
      // ========== RESTORE ENVIRONMENT ==========
      if (worldState.environment && worldState.environment.length > 0) {
        for (const objData of worldState.environment) {
          try {
            await environmentContext.loadObject({
              id: objData.objectId,
              name: objData.name,
              category: objData.category,
              path: objData.path,
              position: objData.position,
              rotation: objData.rotation,
              scale: objData.scale,
              visible: objData.visible
            });
          } catch (error) {
            console.error(`[WorldContext] Failed to restore object ${objData.id}:`, error);
          }
        }
      }
      
      // ========== RESTORE HUMANS ==========
      if (worldState.humans && worldState.humans.length > 0) {
        for (const humanData of worldState.humans) {
          try {
            // Load human through environment context
            await environmentContext.loadObject({
              id: 'human',
              name: humanData.name,
              category: 'human',
              path: '/hazard/human/Soldier.glb',
              position: humanData.position
            });
            
            // Set active state if needed
            if (humanData.isActive) {
              environmentContext.handleMoveHuman(humanData.id);
            }
          } catch (error) {
            console.error(`[WorldContext] Failed to restore human ${humanData.id}:`, error);
          }
        }
      }
      
      // ========== RESTORE TCP TOOLS ==========
      if (worldState.tcpTools && worldState.tcpTools.length > 0) {
        for (const toolData of worldState.tcpTools) {
          try {
            await tcpContext.attachTool(toolData.robotId, toolData.toolId);
            
            if (toolData.transforms) {
              tcpContext.setToolTransform(toolData.robotId, toolData.transforms);
            }
            
            if (toolData.visible !== undefined) {
              tcpContext.setToolVisibility(toolData.robotId, toolData.visible);
            }
          } catch (error) {
            console.error(`[WorldContext] Failed to restore TCP tool for robot ${toolData.robotId}:`, error);
          }
        }
      }
      
      // ========== RESTORE TRAJECTORIES ==========
      if (worldState.trajectories) {
        Object.entries(worldState.trajectories).forEach(([robotId, trajectories]) => {
          Object.entries(trajectories).forEach(([name, trajectory]) => {
            try {
              // Import trajectory through context
              trajectoryContext.importTrajectory(JSON.stringify(trajectory), robotId);
            } catch (error) {
              console.error(`[WorldContext] Failed to restore trajectory ${name} for robot ${robotId}:`, error);
            }
          });
        });
      }
      
      // ========== RESTORE CAMERA ==========
      if (worldState.camera) {
        const camera = viewerContext.getCamera();
        const controls = viewerContext.getControls();
        
        if (camera && worldState.camera.position) {
          camera.position.set(
            worldState.camera.position.x,
            worldState.camera.position.y,
            worldState.camera.position.z
          );
        }
        
        if (controls && worldState.camera.target) {
          controls.target.set(
            worldState.camera.target.x,
            worldState.camera.target.y,
            worldState.camera.target.z
          );
          controls.update();
        }
        
        if (camera && worldState.camera.fov) {
          camera.fov = worldState.camera.fov;
          camera.updateProjectionMatrix();
        }
      }
      
      setCurrentWorldName(worldState.name);
      setIsDirty(false);
      setSuccessMessage(`World "${worldState.name}" loaded successfully!`);
      
      // Emit world loaded event
      EventBus.emit('world:loaded', {
        name: worldState.name,
        timestamp: worldState.timestamp
      });
      
      // Small delay to ensure everything is rendered
      setTimeout(() => {
        EventBus.emit('world:fully-loaded', worldState);
      }, 500);
      
    } catch (error) {
      console.error('[WorldContext] Error restoring world:', error);
      setError(`Failed to load world: ${error.message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [robotContext, environmentContext, trajectoryContext, tcpContext, viewerContext]);

  // ========== WORLD MANAGEMENT ==========
  
  const saveWorld = useCallback((name = currentWorldName || 'Untitled World') => {
    try {
      const worldState = captureWorldState();
      worldState.name = name;
      worldState.metadata.lastModified = new Date().toISOString();
      
      // Save to local storage
      const newSavedWorlds = { ...savedWorlds };
      newSavedWorlds[name] = worldState;
      setSavedWorlds(newSavedWorlds);
      
      // Persist to localStorage
      localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
      
      setCurrentWorldName(name);
      setIsDirty(false);
      lastSaveTimeRef.current = Date.now();
      
      setSuccessMessage(`World "${name}" saved successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      EventBus.emit('world:saved', { name, worldState });
      
      return worldState;
    } catch (error) {
      console.error('[WorldContext] Error saving world:', error);
      setError(`Failed to save world: ${error.message}`);
      return null;
    }
  }, [currentWorldName, savedWorlds, captureWorldState]);

  const loadWorld = useCallback(async (name) => {
    const worldState = savedWorlds[name];
    if (!worldState) {
      setError(`World "${name}" not found`);
      return false;
    }
    
    try {
      await restoreWorldState(worldState);
      return true;
    } catch (error) {
      return false;
    }
  }, [savedWorlds, restoreWorldState]);

  const deleteWorld = useCallback((name) => {
    if (!savedWorlds[name]) return false;
    
    const newSavedWorlds = { ...savedWorlds };
    delete newSavedWorlds[name];
    setSavedWorlds(newSavedWorlds);
    
    localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
    
    if (currentWorldName === name) {
      setCurrentWorldName('');
    }
    
    setSuccessMessage(`World "${name}" deleted`);
    setTimeout(() => setSuccessMessage(''), 3000);
    
    return true;
  }, [savedWorlds, currentWorldName]);

  const exportWorld = useCallback((name = currentWorldName) => {
    try {
      const worldState = name && savedWorlds[name] ? savedWorlds[name] : captureWorldState();
      worldState.name = name || 'Untitled World';
      
      const dataStr = JSON.stringify(worldState, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `world_${worldState.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      setSuccessMessage('World exported successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      
      return true;
    } catch (error) {
      console.error('[WorldContext] Error exporting world:', error);
      setError(`Failed to export world: ${error.message}`);
      return false;
    }
  }, [currentWorldName, savedWorlds, captureWorldState]);

  const importWorld = useCallback(async (jsonData) => {
    try {
      const worldState = JSON.parse(jsonData);
      
      if (!worldState || worldState.version !== WORLD_VERSION) {
        throw new Error('Invalid or incompatible world file');
      }
      
      // Check if world already exists
      if (savedWorlds[worldState.name]) {
        const overwrite = window.confirm(`World "${worldState.name}" already exists. Overwrite?`);
        if (!overwrite) {
          // Generate new name
          let newName = worldState.name;
          let counter = 1;
          while (savedWorlds[`${newName} (${counter})`]) {
            counter++;
          }
          worldState.name = `${newName} (${counter})`;
        }
      }
      
      // Save imported world
      const newSavedWorlds = { ...savedWorlds };
      newSavedWorlds[worldState.name] = worldState;
      setSavedWorlds(newSavedWorlds);
      localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
      
      // Load the imported world
      await restoreWorldState(worldState);
      
      return true;
    } catch (error) {
      console.error('[WorldContext] Error importing world:', error);
      setError(`Failed to import world: ${error.message}`);
      return false;
    }
  }, [savedWorlds, restoreWorldState]);

  const clearWorld = useCallback(async () => {
    console.log('[WorldContext] Clearing world...');
    
    // Clear all robots
    robotContext.loadedRobots.forEach((_, robotId) => {
      robotContext.unloadRobot(robotId);
    });
    
    // Clear environment objects
    environmentContext.clearAllObjects();
    
    // Clear TCP tools
    tcpContext.attachedTools.forEach((_, robotId) => {
      tcpContext.removeTool(robotId);
    });
    
    setCurrentWorldName('');
    setIsDirty(false);
    
    EventBus.emit('world:cleared');
  }, [robotContext, environmentContext, tcpContext]);

  // ========== AUTO-SAVE ==========
  
  useEffect(() => {
    if (autoSaveEnabled && currentWorldName) {
      autoSaveIntervalRef.current = setInterval(() => {
        if (isDirty && Date.now() - lastSaveTimeRef.current > 30000) { // 30 seconds
          console.log('[WorldContext] Auto-saving...');
          saveWorld(currentWorldName);
        }
      }, 10000); // Check every 10 seconds
      
      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
        }
      };
    }
  }, [autoSaveEnabled, currentWorldName, isDirty, saveWorld]);

  // ========== CHANGE DETECTION ==========
  
  useEffect(() => {
    const markDirty = () => setIsDirty(true);
    
    const events = [
      'robot:loaded',
      'robot:removed',
      'robot:joint-changed',
      'robot:joints-changed',
      'environment:object-added',
      'environment:object-removed',
      'environment:object-updated',
      'tcp:tool-attached',
      'tcp:tool-removed',
      'tcp:tool-transformed',
      'trajectory:recording-stopped',
      'human:spawned',
      'human:removed'
    ];
    
    const unsubscribes = events.map(event => 
      EventBus.on(event, markDirty)
    );
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  // ========== UTILS ==========
  
  const getWorldList = useCallback(() => {
    return Object.keys(savedWorlds).map(name => ({
      name,
      timestamp: savedWorlds[name].timestamp,
      metadata: savedWorlds[name].metadata
    }));
  }, [savedWorlds]);

  const hasUnsavedChanges = useCallback(() => {
    return isDirty;
  }, [isDirty]);

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccessMessage(''), []);

  // ========== CONTEXT VALUE ==========
  
  const value = {
    // State
    savedWorlds,
    currentWorldName,
    isLoading,
    error,
    successMessage,
    autoSaveEnabled,
    isDirty,
    
    // World management
    saveWorld,
    loadWorld,
    deleteWorld,
    exportWorld,
    importWorld,
    clearWorld,
    captureWorldState,
    restoreWorldState,
    
    // Getters
    getWorldList,
    hasUnsavedChanges,
    
    // Settings
    setAutoSaveEnabled,
    setCurrentWorldName,
    
    // Utils
    clearError,
    clearSuccess
  };

  return (
    <WorldContext.Provider value={value}>
      {children}
    </WorldContext.Provider>
  );
};

export const useWorldContext = () => {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorldContext must be used within WorldProvider');
  }
  return context;
};

export default WorldContext;