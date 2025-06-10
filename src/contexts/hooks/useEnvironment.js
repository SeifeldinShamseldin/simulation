// src/contexts/hooks/useEnvironment.js
import { useCallback } from 'react';
import { useEnvironmentContext } from '../EnvironmentContext';

export const useEnvironment = () => {
  const context = useEnvironmentContext();
  
  return {
    // ========== ENVIRONMENT STATE ==========
    categories: context.categories,
    loadedObjects: context.loadedObjects,
    selectedCategory: context.selectedCategory,
    currentView: context.currentView,
    spawnedHumans: context.spawnedHumans,
    selectedHuman: context.selectedHuman,
    humanPositions: context.humanPositions,
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    
    // ========== SCENE STATE ==========
    sceneObjects: context.sceneObjects,
    objectRegistries: context.objectRegistries,
    
    // ========== ENVIRONMENT OPERATIONS ==========
    scanEnvironment: context.scanEnvironment,
    loadObject: context.loadObject,
    updateObject: context.updateObject,
    removeObject: context.removeObject,
    clearAllObjects: context.clearAllObjects,
    
    // ========== HUMAN OPERATIONS ==========
    handleMoveHuman: context.handleMoveHuman,
    
    // ========== DELETE OPERATIONS ==========
    deleteObject: context.deleteObject,
    deleteCategory: context.deleteCategory,
    
    // ========== VIEW MANAGEMENT ==========
    selectCategory: context.selectCategory,
    goBackToCategories: context.goBackToCategories,
    setCurrentView: context.setCurrentView,
    setSelectedCategory: context.setSelectedCategory,
    
    // ========== SCENE MANAGEMENT ==========
    registerObject: context.registerObject,
    unregisterObject: context.unregisterObject,
    getObjectsByType: context.getObjectsByType,
    addObject: context.addObject,
    isInScene: context.isInScene,
    
    // ========== SMART PLACEMENT ==========
    calculateSmartPosition: context.calculateSmartPosition,
    
    // ========== CAMERA CONTROLS ==========
    setCameraPosition: context.setCameraPosition,
    setCameraTarget: context.setCameraTarget,
    resetCamera: context.resetCamera,
    focusOnObject: context.focusOnObject,
    
    // ========== PHYSICS ==========
    createPhysicsBody: context.createPhysicsBody,
    removePhysicsBody: context.removePhysicsBody,
    syncWithObject: context.syncWithObject,
    world: context.world,
    isPhysicsEnabled: context.isPhysicsEnabled,
    
    // ========== STATE SETTERS ==========
    setCategories: context.setCategories,
    setLoadedObjects: context.setLoadedObjects,
    setSpawnedHumans: context.setSpawnedHumans,
    setSelectedHuman: context.setSelectedHuman,
    setHumanPositions: context.setHumanPositions,
    setError: context.setError,
    setSuccessMessage: context.setSuccessMessage,
    
    // ========== UTILS ==========
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    // ========== CONVENIENCE GETTERS ==========
    hasLoadedObjects: context.loadedObjects.length > 0,
    hasCategories: context.categories.length > 0,
    hasSpawnedHumans: context.spawnedHumans.length > 0,
    isInObjectsView: context.currentView === 'objects',
    isCategoriesView: context.currentView === 'categories',
    
    // ========== OBJECT MANAGEMENT HELPERS ==========
    getObjectById: useCallback((instanceId) => {
      return context.loadedObjects.find(obj => obj.instanceId === instanceId);
    }, [context.loadedObjects]),
    
    getObjectsByCategory: useCallback((category) => {
      return context.loadedObjects.filter(obj => obj.category === category);
    }, [context.loadedObjects]),
    
    // ========== HUMAN MANAGEMENT HELPERS ==========
    getHumanById: useCallback((humanId) => {
      return context.spawnedHumans.find(h => h.id === humanId);
    }, [context.spawnedHumans]),
    
    getActiveHuman: useCallback(() => {
      return context.spawnedHumans.find(h => h.isActive);
    }, [context.spawnedHumans]),
    
    getHumanPosition: useCallback((humanId) => {
      return context.humanPositions[humanId] || { x: 0, y: 0, z: 0 };
    }, [context.humanPositions]),
    
    // ========== CATEGORY HELPERS ==========
    getCategoryById: useCallback((categoryId) => {
      return context.categories.find(cat => cat.id === categoryId);
    }, [context.categories]),
    
    // ========== STATE CHECKS ==========
    isObjectLoaded: useCallback((objectId) => {
      return context.loadedObjects.some(obj => obj.objectId === objectId);
    }, [context.loadedObjects]),
    
    isHumanSpawned: useCallback((humanId) => {
      return context.spawnedHumans.some(h => h.id === humanId);
    }, [context.spawnedHumans]),
    
    // ========== SCENE OBJECT HELPERS ==========
    getSceneObjectById: useCallback((objectId) => {
      return context.sceneObjects.get(objectId);
    }, [context.sceneObjects]),
    
    getAllSceneObjects: useCallback(() => {
      return Array.from(context.sceneObjects.values());
    }, [context.sceneObjects]),
    
    // ========== PHYSICS HELPERS ==========
    hasPhysicsBody: useCallback((objectId) => {
      return context.world && context.sceneObjects.has(objectId);
    }, [context.world, context.sceneObjects])
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useEnvironmentObjects = () => {
  const {
    loadedObjects,
    loadObject,
    updateObject,
    removeObject,
    clearAllObjects,
    getObjectById,
    getObjectsByCategory,
    isObjectLoaded
  } = useEnvironment();
  
  return {
    objects: loadedObjects,
    loadObject,
    updateObject,
    removeObject,
    clearAll: clearAllObjects,
    getById: getObjectById,
    getByCategory: getObjectsByCategory,
    isLoaded: isObjectLoaded,
    count: loadedObjects.length,
    isEmpty: loadedObjects.length === 0
  };
};

export const useEnvironmentHumans = () => {
  const {
    spawnedHumans,
    selectedHuman,
    humanPositions,
    handleMoveHuman,
    getHumanById,
    getActiveHuman,
    getHumanPosition,
    isHumanSpawned
  } = useEnvironment();
  
  return {
    humans: spawnedHumans,
    selectedHuman,
    positions: humanPositions,
    moveHuman: handleMoveHuman,
    getHuman: getHumanById,
    getActive: getActiveHuman,
    getPosition: getHumanPosition,
    isSpawned: isHumanSpawned,
    count: spawnedHumans.length,
    hasActive: spawnedHumans.some(h => h.isActive),
    isEmpty: spawnedHumans.length === 0
  };
};

export const useEnvironmentCategories = () => {
  const {
    categories,
    selectedCategory,
    selectCategory,
    deleteCategory,
    getCategoryById
  } = useEnvironment();
  
  return {
    categories,
    selected: selectedCategory,
    select: selectCategory,
    delete: deleteCategory,
    getById: getCategoryById,
    count: categories.length,
    isEmpty: categories.length === 0
  };
};

export const useEnvironmentView = () => {
  const {
    currentView,
    selectedCategory,
    selectCategory,
    goBackToCategories,
    setCurrentView,
    isCategoriesView,
    isInObjectsView
  } = useEnvironment();
  
  return {
    currentView,
    selectedCategory,
    selectCategory,
    goBack: goBackToCategories,
    setView: setCurrentView,
    isCategoriesView,
    isObjectsView: isInObjectsView
  };
};

export const useEnvironmentScene = () => {
  const {
    sceneObjects,
    objectRegistries,
    registerObject,
    unregisterObject,
    getObjectsByType,
    addObject,
    isInScene,
    getSceneObjectById,
    getAllSceneObjects
  } = useEnvironment();
  
  return {
    objects: sceneObjects,
    registries: objectRegistries,
    registerObject,
    unregisterObject,
    getByType: getObjectsByType,
    addObject,
    isInScene,
    getById: getSceneObjectById,
    getAll: getAllSceneObjects,
    count: sceneObjects.size
  };
};

export const useEnvironmentCamera = () => {
  const {
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOnObject
  } = useEnvironment();
  
  return {
    setPosition: setCameraPosition,
    setTarget: setCameraTarget,
    reset: resetCamera,
    focusOn: focusOnObject
  };
};

export const useEnvironmentPhysics = () => {
  const {
    world,
    isPhysicsEnabled,
    createPhysicsBody,
    removePhysicsBody,
    syncWithObject,
    hasPhysicsBody
  } = useEnvironment();
  
  return {
    world,
    isEnabled: isPhysicsEnabled,
    createBody: createPhysicsBody,
    removeBody: removePhysicsBody,
    syncWith: syncWithObject,
    hasBody: hasPhysicsBody
  };
};

export const useEnvironmentPlacement = () => {
  const { calculateSmartPosition } = useEnvironment();
  
  return {
    calculatePosition: calculateSmartPosition
  };
};

export default useEnvironment;