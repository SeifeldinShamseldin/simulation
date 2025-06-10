// src/contexts/EnvironmentContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const EnvironmentContext = createContext(null);

/**
 * Provider component for environment management
 * ✅ Updated: Focuses only on environment management
 * ❌ Removed: Robot-specific functionality (now handled by RobotContext)
 */
export const EnvironmentProvider = ({ children }) => {
  const { getSceneSetup } = useViewer();
  
  // Environment state
  const [environment, setEnvironment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Object state
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [sceneObjects] = useState(new Map());
  const [objectRegistries] = useState(new Map());
  
  // Human state
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [humanPositions, setHumanPositions] = useState({});
  
  // Category state
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  
  // Load environment
  const loadEnvironment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const sceneSetup = getSceneSetup();
      if (!sceneSetup) {
        throw new Error('Scene setup not available');
      }
      
      // Load environment logic here
      setEnvironment(sceneSetup);
    } catch (err) {
      setError(err.message);
      console.error('[EnvironmentContext] Failed to load environment:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getSceneSetup]);
  
  // Object management
  const loadObject = useCallback((object) => {
    setLoadedObjects(prev => [...prev, object]);
  }, []);
  
  const updateObject = useCallback((objectId, updates) => {
    setLoadedObjects(prev => prev.map(obj => 
      obj.id === objectId ? { ...obj, ...updates } : obj
    ));
  }, []);
  
  const removeObject = useCallback((objectId) => {
    setLoadedObjects(prev => prev.filter(obj => obj.id !== objectId));
  }, []);
  
  const clearAllObjects = useCallback(() => {
    setLoadedObjects([]);
  }, []);
  
  // Human management
  const handleMoveHuman = useCallback((humanId, position) => {
    setHumanPositions(prev => ({
      ...prev,
      [humanId]: position
    }));
  }, []);
  
  // Category management
  const selectCategory = useCallback((category) => {
    setSelectedCategory(category);
    setCurrentView('objects');
  }, []);
  
  const deleteCategory = useCallback((categoryId) => {
    setCategories(prev => prev.filter(cat => cat.id !== categoryId));
    if (selectedCategory?.id === categoryId) {
      setSelectedCategory(null);
    }
  }, [selectedCategory]);
  
  // View management
  const goBackToCategories = useCallback(() => {
    setCurrentView('categories');
    setSelectedCategory(null);
  }, []);
  
  // Scene object management
  const registerObject = useCallback((objectId, object) => {
    sceneObjects.set(objectId, object);
  }, [sceneObjects]);
  
  const unregisterObject = useCallback((objectId) => {
    sceneObjects.delete(objectId);
  }, [sceneObjects]);
  
  const getObjectsByType = useCallback((type) => {
    return Array.from(sceneObjects.values()).filter(obj => obj.type === type);
  }, [sceneObjects]);
  
  const addObject = useCallback((object) => {
    sceneObjects.set(object.id, object);
  }, [sceneObjects]);
  
  // Camera management
  const setCameraPosition = useCallback((position) => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup?.camera) {
      sceneSetup.camera.position.set(position.x, position.y, position.z);
    }
  }, [getSceneSetup]);
  
  const setCameraTarget = useCallback((target) => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup?.controls) {
      sceneSetup.controls.target.set(target.x, target.y, target.z);
      sceneSetup.controls.update();
    }
  }, [getSceneSetup]);
  
  const resetCamera = useCallback(() => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup?.resetCamera) {
      sceneSetup.resetCamera();
    }
  }, [getSceneSetup]);
  
  const focusOnObject = useCallback((object) => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup?.focusOnObject) {
      sceneSetup.focusOnObject(object);
    }
  }, [getSceneSetup]);
  
  // Getter methods
  const getObjectById = useCallback((objectId) => {
    return loadedObjects.find(obj => obj.id === objectId);
  }, [loadedObjects]);
  
  const getObjectsByCategory = useCallback((category) => {
    return loadedObjects.filter(obj => obj.category === category);
  }, [loadedObjects]);
  
  const getHumanById = useCallback((humanId) => {
    return spawnedHumans.find(h => h.id === humanId);
  }, [spawnedHumans]);
  
  const getActiveHuman = useCallback(() => {
    return spawnedHumans.find(h => h.isActive);
  }, [spawnedHumans]);
  
  const getHumanPosition = useCallback((humanId) => {
    return humanPositions[humanId] || { x: 0, y: 0, z: 0 };
  }, [humanPositions]);
  
  const getCategoryById = useCallback((categoryId) => {
    return categories.find(cat => cat.id === categoryId);
  }, [categories]);
  
  const getSceneObjectById = useCallback((objectId) => {
    return sceneObjects.get(objectId);
  }, [sceneObjects]);
  
  const getAllSceneObjects = useCallback(() => {
    return Array.from(sceneObjects.values());
  }, [sceneObjects]);
  
  // State checks
  const isObjectLoaded = useCallback((objectId) => {
    return loadedObjects.some(obj => obj.id === objectId);
  }, [loadedObjects]);
  
  const isHumanSpawned = useCallback((humanId) => {
    return spawnedHumans.some(h => h.id === humanId);
  }, [spawnedHumans]);
  
  const isInScene = useCallback((objectId) => {
    return sceneObjects.has(objectId);
  }, [sceneObjects]);
  
  const isCategoriesView = currentView === 'categories';
  const isInObjectsView = currentView === 'objects';
  
  const value = {
    // Environment state
    environment,
    isLoading,
    error,
    
    // Object state
    loadedObjects,
    sceneObjects,
    objectRegistries,
    
    // Human state
    spawnedHumans,
    selectedHuman,
    humanPositions,
    
    // Category state
    categories,
    selectedCategory,
    currentView,
    
    // Environment operations
    loadEnvironment,
    
    // Object management
    loadObject,
    updateObject,
    removeObject,
    clearAllObjects,
    
    // Human management
    handleMoveHuman,
    
    // Category management
    selectCategory,
    deleteCategory,
    
    // View management
    goBackToCategories,
    setCurrentView,
    setSelectedCategory,
    
    // Scene object management
    registerObject,
    unregisterObject,
    getObjectsByType,
    addObject,
    
    // Camera management
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOnObject,
    
    // Getter methods
    getObjectById,
    getObjectsByCategory,
    getHumanById,
    getActiveHuman,
    getHumanPosition,
    getCategoryById,
    getSceneObjectById,
    getAllSceneObjects,
    
    // State checks
    isObjectLoaded,
    isHumanSpawned,
    isInScene,
    isCategoriesView,
    isInObjectsView
  };
  
  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  );
};

/**
 * Hook to use the environment context
 * @returns {Object} Environment context
 * @throws {Error} If used outside of EnvironmentProvider
 */
export const useEnvironment = () => {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within EnvironmentProvider');
  }
  return context;
};

export default EnvironmentContext;