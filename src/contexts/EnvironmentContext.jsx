// src/contexts/EnvironmentContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { useViewer } from './ViewerContext';
import { useRobotContext } from './RobotContext';
import humanManager from '../components/Environment/Human/HumanController';
import EventBus from '../utils/EventBus';
import useCamera from './hooks/useCamera';

const EnvironmentContext = createContext(null);

export const EnvironmentProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  const robotManager = useRobotContext();
  
  // State
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [humanPositions, setHumanPositions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Scene object registries (from useScene)
  const [sceneObjects, setSceneObjects] = useState(new Map());
  const [objectRegistries, setObjectRegistries] = useState({
    robots: new Map(),
    environment: new Map(),
    trajectories: new Map(),
    humans: new Map(),
    custom: new Map()
  });

  // Refs
  const sceneSetupRef = useRef(null);
  const robotManagerRef = useRef(null);

  // Initialize scene setup and robot manager references
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      robotManagerRef.current = robotManager;
    }
  }, [isViewerReady, getSceneSetup, robotManager]);

  // ========== MERGED SCENE FUNCTIONS FROM useScene.js ==========

  // Register object with scene context (from useScene)
  const registerObject = useCallback((type, id, object, metadata = {}) => {
    if (!sceneSetupRef.current || !object) return;
    
    try {
      // Store in registry
      setObjectRegistries(prev => {
        const newRegistries = { ...prev };
        if (!newRegistries[type]) {
          newRegistries[type] = new Map();
        }
        newRegistries[type].set(id, {
          object,
          metadata,
          timestamp: Date.now()
        });
        return newRegistries;
      });

      // Add to scene if it's a 3D object
      if (object && object.isObject3D && sceneSetupRef.current.scene) {
        sceneSetupRef.current.scene.add(object);
      }

      // Store metadata on the object
      object.userData = {
        ...object.userData,
        environmentId: id,
        type: type,
        ...metadata
      };
      
      EventBus.emit('scene:object-registered', { type, id, object, metadata });
      console.log(`Registered ${type} object: ${id}`);
    } catch (error) {
      console.error('Error registering object:', error);
    }
  }, []);

  // Unregister object (from useScene)
  const unregisterObject = useCallback((type, id) => {
    if (!sceneSetupRef.current) return;
    
    try {
      const registry = objectRegistries[type];
      if (!registry) return;
      
      const entry = registry.get(id);
      if (!entry) return;
      
      // Remove from scene
      if (entry.object && entry.object.isObject3D && sceneSetupRef.current.scene) {
        sceneSetupRef.current.scene.remove(entry.object);
      }
      
      // Dispose resources
      if (entry.object) {
        if (entry.object.geometry) entry.object.geometry.dispose();
        if (entry.object.material) {
          if (Array.isArray(entry.object.material)) {
            entry.object.material.forEach(m => m.dispose());
          } else {
            entry.object.material.dispose();
          }
        }
      }
      
      // Remove from registry
      setObjectRegistries(prev => {
        const newRegistries = { ...prev };
        newRegistries[type].delete(id);
        return newRegistries;
      });
      
      EventBus.emit('scene:object-unregistered', { type, id });
      console.log(`Unregistered ${type} object: ${id}`);
    } catch (error) {
      console.error('Error unregistering object:', error);
    }
  }, [objectRegistries]);

  // Get objects by type (from useScene)
  const getObjectsByType = useCallback((type) => {
    const registry = objectRegistries[type];
    if (!registry) return [];
    
    return Array.from(registry.entries()).map(([id, entry]) => ({
      id,
      ...entry
    }));
  }, [objectRegistries]);

  // Scene object management (from useSceneObject)
  const addObject = useCallback((type, id, obj, metadata = {}) => {
    if (!obj || !id) return;
    
    const cleanup = registerObject(type, id, obj, metadata);
    setSceneObjects(prev => new Map(prev).set(id, obj));
    
    return cleanup;
  }, [registerObject]);

  const removeObject = useCallback((instanceId) => {
    if (!sceneSetupRef.current) return;
    
    const human = humanManager.getHuman(instanceId);
    if (human) {
      if (human._unsubscribePosition) {
        human._unsubscribePosition();
      }
      
      humanManager.removeHuman(instanceId);
      setSpawnedHumans(prev => prev.filter(h => h.id !== instanceId));
      setSelectedHuman(null);
      
      setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
      
      setHumanPositions(prev => {
        const newPositions = { ...prev };
        delete newPositions[instanceId];
        return newPositions;
      });
      
      EventBus.emit('human:removed', { id: instanceId });
      return;
    }
    
    const sceneSetup = sceneSetupRef.current;
    if (!sceneSetup) return;
    
    // Remove from scene
    sceneSetup.removeEnvironmentObject(instanceId);
    
    // Remove from our state
    setLoadedObjects(prev => prev.filter(obj => obj.instanceId !== instanceId));
    setSceneObjects(prev => {
      const newMap = new Map(prev);
      newMap.delete(instanceId);
      return newMap;
    });
    
    // Unregister from all registries
    Object.keys(objectRegistries).forEach(type => {
      unregisterObject(type, instanceId);
    });
  }, [unregisterObject, objectRegistries]);

  const updateObject = useCallback((instanceId, updates) => {
    if (!sceneSetupRef.current) return;
    
    const sceneSetup = sceneSetupRef.current;
    
    const human = humanManager.getHuman(instanceId);
    if (human) {
      if (updates.position) {
        human.setPosition(
          updates.position.x,
          updates.position.y,
          updates.position.z
        );
      }
      return;
    }
    
    const object = sceneSetup.environmentObjects.get(instanceId);
    if (!object) {
      console.error('Object not found:', instanceId);
      return;
    }
    
    if (updates.position) {
      object.position.set(
        updates.position.x ?? object.position.x,
        updates.position.y ?? object.position.y,
        updates.position.z ?? object.position.z
      );
    }
    
    if (updates.rotation) {
      object.rotation.set(
        updates.rotation.x ?? object.rotation.x,
        updates.rotation.y ?? object.rotation.y,
        updates.rotation.z ?? object.rotation.z
      );
    }
    
    if (updates.scale) {
      object.scale.set(
        updates.scale.x ?? object.scale.x,
        updates.scale.y ?? object.scale.y,
        updates.scale.z ?? object.scale.z
      );
    }
    
    if (updates.visible !== undefined) {
      object.visible = updates.visible;
    }
    
    object.updateMatrix();
    object.updateMatrixWorld(true);
    
    sceneSetup.updateEnvironmentObject(instanceId, updates);
    
    EventBus.emit('scene:object-updated', { type: 'environment', id: instanceId, updates });
  }, []);

  // Smart placement calculation (from useSmartPlacement)
  const calculateSmartPosition = useCallback((category, basePosition = { x: 0, y: 0, z: 0 }) => {
    const sceneSetup = sceneSetupRef.current;
    const robotManager = robotManagerRef.current;
    
    if (!sceneSetup) {
      return {
        position: basePosition,
        rotation: { x: 0, y: 0, z: 0 }
      };
    }

    // Get robot information
    let robotCenter = new THREE.Vector3(basePosition.x, basePosition.y, basePosition.z);
    let robotRadius = 1;

    // Try to find robot from robot manager
    if (robotManager) {
      const allRobots = robotManager.getAllRobots();
      if (allRobots && allRobots.size > 0) {
        const firstRobot = Array.from(allRobots.values())[0];
        if (firstRobot && firstRobot.model) {
          try {
            const robotBox = new THREE.Box3().setFromObject(firstRobot.model);
            robotCenter = robotBox.getCenter(new THREE.Vector3());
            robotRadius = robotBox.getSize(new THREE.Vector3()).length() / 2;
          } catch (error) {
            console.warn('Could not calculate robot bounds, using defaults');
          }
        }
      }
    }

    // Fallback: try to find robot in scene
    if (!robotManager || robotRadius === 1) {
      try {
        const robotRoot = sceneSetup.robotRoot;
        if (robotRoot && robotRoot.children.length > 0) {
          const robot = robotRoot.children.find(child => child.isURDFRobot);
          if (robot) {
            const robotBox = new THREE.Box3().setFromObject(robot);
            robotCenter = robotBox.getCenter(new THREE.Vector3());
            robotRadius = robotBox.getSize(new THREE.Vector3()).length() / 2;
          }
        }
      } catch (error) {
        console.warn('Could not find robot in scene, using defaults');
      }
    }

    // Get existing environment objects
    const existingObjects = Array.from(sceneSetup.environmentObjects?.values() || []);

    // Smart placement rules by category
    const placements = {
      furniture: { distance: robotRadius + 1.5, angle: Math.PI },
      electricalhazard: { distance: robotRadius + 2, angle: Math.PI / 2 },
      mechanicalhazard: { distance: robotRadius + 2, angle: Math.PI / 3 },
      industrial: { distance: robotRadius + 2, angle: Math.PI / 2 },
      storage: { distance: robotRadius + 2.5, angle: -Math.PI / 2 },
      safety: { distance: robotRadius + 3, angle: 0 },
      safetysign: { distance: robotRadius + 3, angle: 0 },
      controls: { distance: robotRadius + 2, angle: Math.PI / 4 },
      machinery: { distance: robotRadius + 2.5, angle: Math.PI * 0.75 },
      tools: { distance: robotRadius + 1.8, angle: -Math.PI / 4 },
      vehicle: { distance: robotRadius + 4, angle: Math.PI * 1.5 },
      barrier: { distance: robotRadius + 2.8, angle: Math.PI / 6 }
    };

    const placement = placements[category] || { distance: robotRadius + 2, angle: 0 };

    // Find non-overlapping position
    let angle = placement.angle;
    let attempts = 0;
    let position = new THREE.Vector3();
    let foundValidPosition = false;

    while (attempts < 32 && !foundValidPosition) {
      position.set(
        robotCenter.x + Math.cos(angle) * placement.distance,
        0,
        robotCenter.z + Math.sin(angle) * placement.distance
      );

      // Check for overlaps with existing objects
      let hasOverlap = false;
      for (const obj of existingObjects) {
        if (!obj || !obj.position) continue;

        const distance2D = Math.sqrt(
          Math.pow(position.x - obj.position.x, 2) +
          Math.pow(position.z - obj.position.z, 2)
        );

        let minSpacing = 1.5;
        
        try {
          const objBox = new THREE.Box3().setFromObject(obj);
          const objSize = objBox.getSize(new THREE.Vector3());
          minSpacing = Math.max(objSize.x, objSize.z) / 2 + 1.0;
        } catch (error) {
          // Use default spacing
        }

        if (distance2D < minSpacing) {
          hasOverlap = true;
          break;
        }
      }

      // Check overlap with loaded objects from state
      if (!hasOverlap) {
        for (const obj of loadedObjects) {
          if (!obj.position) continue;

          const distance2D = Math.sqrt(
            Math.pow(position.x - obj.position.x, 2) +
            Math.pow(position.z - obj.position.z, 2)
          );

          if (distance2D < 1.5) {
            hasOverlap = true;
            break;
          }
        }
      }

      if (!hasOverlap) {
        foundValidPosition = true;
      } else {
        angle += Math.PI / 16;
        attempts++;

        if (attempts % 32 === 0) {
          placement.distance += 0.5;
        }
      }
    }

    // Align to grid for certain categories
    const alignToGrid = ['furniture', 'storage', 'controls', 'machinery'].includes(category);
    if (alignToGrid) {
      const gridSize = 0.25;
      position.x = Math.round(position.x / gridSize) * gridSize;
      position.z = Math.round(position.z / gridSize) * gridSize;
    }

    // Calculate rotation
    let lookAngle = Math.atan2(
      robotCenter.x - position.x,
      robotCenter.z - position.z
    );

    // Special rotation rules
    if (category === 'safety' || category === 'safetysign') {
      lookAngle += Math.PI;
    } else if (category === 'barrier') {
      lookAngle += Math.PI / 2;
    } else if (category === 'industrial' || category === 'machinery') {
      lookAngle += Math.PI / 4;
    }

    return {
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      rotation: { x: 0, y: lookAngle, z: 0 }
    };
  }, [loadedObjects]);

  // Camera controls (from useCameraControls)
  const { setCameraPosition, setCameraTarget, resetCamera, focusOn } = useCamera();

  // Check if object is in scene
  const isInScene = useCallback((objectId) => {
    return sceneObjects.has(objectId) && 
           sceneSetupRef.current?.scene?.children.includes(sceneObjects.get(objectId));
  }, [sceneObjects]);

  // ========== ORIGINAL ENVIRONMENT FUNCTIONS ==========

  // Listen for human events
  useEffect(() => {
    const unsubscribeSpawned = EventBus.on('human:spawned', (data) => {
      setSpawnedHumans(prev => [...prev, data]);
      if (data.isActive) {
        setSelectedHuman(data.id);
      }
    });
    
    const unsubscribeRemoved = EventBus.on('human:removed', (data) => {
      setSpawnedHumans(prev => prev.filter(h => h.id !== data.id));
      if (selectedHuman === data.id) {
        setSelectedHuman(null);
      }
    });
    
    const unsubscribeSelected = EventBus.on('human:selected', (data) => {
      setSelectedHuman(data.id);
    });

    const unsubscribePositions = [];
    const handlePositionUpdate = (humanId) => (data) => {
      if (data.position) {
        setHumanPositions(prev => ({
          ...prev,
          [humanId]: {
            x: data.position[0],
            y: data.position[1],
            z: data.position[2]
          }
        }));
      }
    };

    spawnedHumans.forEach(human => {
      const unsubscribe = EventBus.on(`human:position-update:${human.id}`, handlePositionUpdate(human.id));
      unsubscribePositions.push(unsubscribe);
    });
    
    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
      unsubscribeSelected();
      unsubscribePositions.forEach(unsubscribe => unsubscribe());
    };
  }, [selectedHuman, spawnedHumans]);

  // Listen for world fully loaded event
  useEffect(() => {
    const handleWorldFullyLoaded = (data) => {
      if (data.environment && data.environment.length > 0) {
        const newLoadedObjects = data.environment.map(obj => {
          const name = obj.path.split('/').pop().replace(/\.[^/.]+$/, '');
          return {
            instanceId: obj.id,
            objectId: obj.id,
            name: name,
            path: obj.path,
            category: obj.category,
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale
          };
        });
        setLoadedObjects(newLoadedObjects);
      }
    };
    
    const unsubscribe = EventBus.on('world:fully-loaded', handleWorldFullyLoaded);
    return () => unsubscribe();
  }, []);

  // Restore spawned objects on mount
  useEffect(() => {
    if (!sceneSetupRef.current) return;
    
    const sceneSetup = sceneSetupRef.current;
    
    // Restore environment objects
    const environmentObjects = Array.from(sceneSetup.environmentObjects || new Map());
    const restoredObjects = environmentObjects.map(([id, obj]) => ({
      instanceId: id,
      objectId: id,
      name: obj.userData?.name || 'Unknown Object',
      category: obj.userData?.category || 'uncategorized',
      path: obj.userData?.path || obj.userData?.modelPath || '',
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z
      },
      rotation: {
        x: obj.rotation.x,
        y: obj.rotation.y,
        z: obj.rotation.z
      },
      scale: {
        x: obj.scale.x,
        y: obj.scale.y,
        z: obj.scale.z
      }
    }));
    
    // Restore human objects
    const allHumans = humanManager.getAllHumans();
    const restoredHumans = allHumans.map(human => ({
      id: human.id,
      name: 'Soldier',
      isActive: human.movementEnabled
    }));
    
    // Add human entries to loaded objects
    const humanObjects = allHumans.map(human => ({
      instanceId: human.id,
      objectId: human.id,
      name: 'Soldier',
      category: 'human',
      path: '/hazard/human/Soldier.glb'
    }));
    
    setLoadedObjects([...restoredObjects, ...humanObjects]);
    setSpawnedHumans(restoredHumans);
    
    // Find active human
    const activeHuman = allHumans.find(h => h.movementEnabled);
    if (activeHuman) {
      setSelectedHuman(activeHuman.id);
    }
  }, [isViewerReady]);

  // Scan environment directory
  const scanEnvironment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/environment/scan');
      const result = await response.json();
      
      if (result.success) {
        setCategories(result.categories);
      } else {
        setError('Failed to scan environment directory');
      }
    } catch (err) {
      console.error('Error scanning environment:', err);
      setError('Error scanning environment directory');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load object
  const loadObject = useCallback(async (objectConfig) => {
    if (!sceneSetupRef.current) return;
    
    if (objectConfig.category === 'human' || objectConfig.path?.includes('/human/')) {
      const sceneSetup = sceneSetupRef.current;
      
      setIsLoading(true);
      try {
        const position = {
          x: (Math.random() - 0.5) * 4,
          y: 0,
          z: (Math.random() - 0.5) * 4
        };
        
        const result = await humanManager.spawnHuman(
          sceneSetup.scene, 
          sceneSetup.world,
          position
        );
        
        if (result) {
          const { id, human } = result;
          
          const unsubscribe = EventBus.on(`human:position-update:${id}`, (data) => {
            if (data.position) {
              setHumanPositions(prev => ({
                ...prev,
                [id]: {
                  x: data.position[0],
                  y: data.position[1],
                  z: data.position[2]
                }
              }));
            }
          });
          
          human._unsubscribePosition = unsubscribe;
          
          const humanInstance = {
            instanceId: id,
            objectId: objectConfig.id,
            name: objectConfig.name,
            category: 'human',
            path: objectConfig.path
          };
          
          setLoadedObjects(prev => [...prev, humanInstance]);
          
          setSpawnedHumans(prev => [...prev, {
            id: id,
            name: objectConfig.name,
            isActive: false
          }]);
          
          setSuccessMessage('Human spawned! Click "Move Human" to control.');
          setTimeout(() => setSuccessMessage(''), 5000);
          
          EventBus.emit('human:spawned', {
            id: id,
            name: objectConfig.name,
            isActive: false
          });
        }
      } catch (error) {
        setError('Failed to spawn human: ' + error.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const sceneSetup = sceneSetupRef.current;
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${objectConfig.id}_${Date.now()}`;
      
      // Use our smart placement calculation
      const placement = calculateSmartPosition(objectConfig.category);
      const updatedConfig = {
        ...objectConfig,
        ...placement,
        id: instanceId,
        castShadow: true
      };
      
      const object3D = await sceneSetup.loadEnvironmentObject(updatedConfig);
      
      registerObject('environment', instanceId, object3D, {
        category: objectConfig.category,
        name: objectConfig.name
      });
      
      const newObject = {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category,
        path: objectConfig.path,
        position: placement.position || { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: objectConfig.defaultScale || { x: 1, y: 1, z: 1 }
      };
      
      setLoadedObjects(prev => [...prev, newObject]);
      setSuccessMessage(`${objectConfig.name} added to scene!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error loading object:', error);
      setError('Failed to load object: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [calculateSmartPosition, registerObject]);

  // Human management
  const handleMoveHuman = useCallback((humanId) => {
    const human = humanManager.getHuman(humanId);
    if (!human) return;

    const newState = !human.movementEnabled;
    humanManager.setActiveHuman(newState ? humanId : null);
    setSelectedHuman(newState ? humanId : null);
    
    setSpawnedHumans(prev => prev.map(h => ({
      ...h,
      isActive: h.id === humanId && newState
    })));
    
    setSuccessMessage(newState ? 'Human movement enabled! Use WASD to move, Shift to run.' : 'Human movement disabled.');
    setTimeout(() => setSuccessMessage(''), 3000);
  }, []);

  // Delete operations
  const deleteObject = useCallback(async (objectPath, objectName) => {
    try {
      const response = await fetch('/api/environment/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: objectPath })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage(`${objectName} deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.message || 'Failed to delete object');
      }
    } catch (error) {
      setError('Error deleting object: ' + error.message);
    }
  }, []);

  const deleteCategory = useCallback(async (categoryId, categoryName) => {
    try {
      const response = await fetch(`/api/environment/category/${categoryId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage(`Category "${categoryName}" deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
        setCurrentView('categories');
        setSelectedCategory(null);
      } else {
        setError(result.message || 'Failed to delete category');
      }
    } catch (error) {
      setError('Error deleting category: ' + error.message);
    }
  }, []);

  // View management
  const selectCategory = useCallback((category) => {
    setSelectedCategory(category);
    setCurrentView('objects');
  }, []);

  const goBackToCategories = useCallback(() => {
    setCurrentView('categories');
    setSelectedCategory(null);
  }, []);

  // Clear all objects
  const clearAllObjects = useCallback(() => {
    loadedObjects.forEach(obj => removeObject(obj.instanceId));
  }, [loadedObjects, removeObject]);

  // Initialize on mount
  useEffect(() => {
    if (isViewerReady) {
      scanEnvironment();
    }
  }, [isViewerReady, scanEnvironment]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // ========== ENVIRONMENT STATE ==========
    categories,
    loadedObjects,
    selectedCategory,
    currentView,
    spawnedHumans,
    selectedHuman,
    humanPositions,
    isLoading,
    error,
    successMessage,
    
    // ========== SCENE STATE (from useScene) ==========
    sceneObjects,
    objectRegistries,
    
    // ========== ENVIRONMENT OPERATIONS ==========
    scanEnvironment,
    loadObject,
    updateObject,
    removeObject,
    clearAllObjects,
    
    // ========== HUMAN OPERATIONS ==========
    handleMoveHuman,
    
    // ========== DELETE OPERATIONS ==========
    deleteObject,
    deleteCategory,
    
    // ========== VIEW MANAGEMENT ==========
    selectCategory,
    goBackToCategories,
    setCurrentView,
    setSelectedCategory,
    
    // ========== SCENE MANAGEMENT (from useScene) ==========
    registerObject,
    unregisterObject,
    getObjectsByType,
    addObject,
    isInScene,
    
    // ========== SMART PLACEMENT (from useSmartPlacement) ==========
    calculateSmartPosition,
    
    // ========== CAMERA CONTROLS (from useCameraControls) ==========
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn,
    
    // ========== HUMAN PHYSICS ==========
    world: sceneSetupRef.current?.world,
    isPhysicsEnabled: !!sceneSetupRef.current?.world,
    
    // ========== STATE SETTERS ==========
    setCategories,
    setLoadedObjects,
    setSpawnedHumans,
    setSelectedHuman,
    setHumanPositions,
    setError,
    setSuccessMessage,
    
    // ========== UTILS ==========
    clearError: () => setError(null),
    clearSuccess: () => setSuccessMessage('')
  }), [
    categories,
    loadedObjects,
    selectedCategory,
    currentView,
    spawnedHumans,
    selectedHuman,
    humanPositions,
    isLoading,
    error,
    successMessage,
    sceneObjects,
    objectRegistries,
    scanEnvironment,
    loadObject,
    updateObject,
    removeObject,
    clearAllObjects,
    handleMoveHuman,
    deleteObject,
    deleteCategory,
    selectCategory,
    goBackToCategories,
    setCurrentView,
    setSelectedCategory,
    registerObject,
    unregisterObject,
    getObjectsByType,
    addObject,
    isInScene,
    calculateSmartPosition,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn,
    sceneSetupRef,
    setCategories,
    setLoadedObjects,
    setSpawnedHumans,
    setSelectedHuman,
    setHumanPositions,
    setError,
    setSuccessMessage
  ]);

  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  );
};

export const useEnvironmentContext = () => {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironmentContext must be used within EnvironmentProvider');
  }
  return context;
};

export default EnvironmentContext;