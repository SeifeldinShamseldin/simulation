// src/contexts/hooks/useEnvironment.js
import { useCallback, useMemo } from 'react';
import { useEnvironmentContext } from '../EnvironmentContext';

export const useEnvironment = () => {
  const context = useEnvironmentContext();
  
  // ========== MEMOIZED COMPUTED PROPERTIES ==========
  const computedProperties = useMemo(() => ({
    hasLoadedObjects: context.loadedObjects.length > 0,
    hasCategories: context.categories.length > 0,
    hasSpawnedHumans: context.spawnedHumans.length > 0,
    isInObjectsView: context.currentView === 'objects',
    isCategoriesView: context.currentView === 'categories',
  }), [
    context.loadedObjects.length,
    context.categories.length,
    context.spawnedHumans.length,
    context.currentView
  ]);
  
  // ========== MEMOIZED HELPER METHODS ==========
  
  // Object Management Helpers
  const getObjectById = useCallback((instanceId) => {
    return context.loadedObjects.find(obj => obj.instanceId === instanceId);
  }, [context.loadedObjects]);
  
  const getObjectsByCategory = useCallback((category) => {
    return context.loadedObjects.filter(obj => obj.category === category);
  }, [context.loadedObjects]);
  
  // Human Management Helpers
  const getHumanById = useCallback((humanId) => {
    return context.spawnedHumans.find(h => h.id === humanId);
  }, [context.spawnedHumans]);
  
  const getActiveHuman = useCallback(() => {
    return context.spawnedHumans.find(h => h.isActive);
  }, [context.spawnedHumans]);
  
  const getHumanPosition = useCallback((humanId) => {
    return context.humanPositions[humanId] || { x: 0, y: 0, z: 0 };
  }, [context.humanPositions]);
  
  // Category Helpers
  const getCategoryById = useCallback((categoryId) => {
    return context.categories.find(cat => cat.id === categoryId);
  }, [context.categories]);
  
  // State Checks
  const isObjectLoaded = useCallback((objectId) => {
    return context.loadedObjects.some(obj => obj.objectId === objectId);
  }, [context.loadedObjects]);
  
  const isHumanSpawned = useCallback((humanId) => {
    return context.spawnedHumans.some(h => h.id === humanId);
  }, [context.spawnedHumans]);
  
  // Scene Object Helpers
  const getSceneObjectById = useCallback((objectId) => {
    return context.sceneObjects.get(objectId);
  }, [context.sceneObjects]);
  
  const getAllSceneObjects = useCallback(() => {
    return Array.from(context.sceneObjects.values());
  }, [context.sceneObjects]);
  
  // Physics Helpers
  const hasPhysicsBody = useCallback((objectId) => {
    return context.world && context.sceneObjects.has(objectId);
  }, [context.world, context.sceneObjects]);
  
  // ========== MEMOIZED RETURN OBJECT ==========
  return useMemo(() => ({
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
    
    // ========== CONVENIENCE GETTERS (memoized) ==========
    ...computedProperties,
    
    // ========== OBJECT MANAGEMENT HELPERS (memoized) ==========
    getObjectById,
    getObjectsByCategory,
    
    // ========== HUMAN MANAGEMENT HELPERS (memoized) ==========
    getHumanById,
    getActiveHuman,
    getHumanPosition,
    
    // ========== CATEGORY HELPERS (memoized) ==========
    getCategoryById,
    
    // ========== STATE CHECKS (memoized) ==========
    isObjectLoaded,
    isHumanSpawned,
    
    // ========== SCENE OBJECT HELPERS (memoized) ==========
    getSceneObjectById,
    getAllSceneObjects,
    
    // ========== PHYSICS HELPERS (memoized) ==========
    hasPhysicsBody
  }), [
    // Context state dependencies
    context.categories,
    context.loadedObjects,
    context.selectedCategory,
    context.currentView,
    context.spawnedHumans,
    context.selectedHuman,
    context.humanPositions,
    context.isLoading,
    context.error,
    context.successMessage,
    context.sceneObjects,
    context.objectRegistries,
    context.world,
    context.isPhysicsEnabled,
    
    // Context method dependencies (these should be stable from EnvironmentContext)
    context.scanEnvironment,
    context.loadObject,
    context.updateObject,
    context.removeObject,
    context.clearAllObjects,
    context.handleMoveHuman,
    context.deleteObject,
    context.deleteCategory,
    context.selectCategory,
    context.goBackToCategories,
    context.setCurrentView,
    context.setSelectedCategory,
    context.registerObject,
    context.unregisterObject,
    context.getObjectsByType,
    context.addObject,
    context.isInScene,
    context.calculateSmartPosition,
    context.setCameraPosition,
    context.setCameraTarget,
    context.resetCamera,
    context.focusOnObject,
    context.createPhysicsBody,
    context.removePhysicsBody,
    context.syncWithObject,
    context.setCategories,
    context.setLoadedObjects,
    context.setSpawnedHumans,
    context.setSelectedHuman,
    context.setHumanPositions,
    context.setError,
    context.setSuccessMessage,
    context.clearError,
    context.clearSuccess,
    
    // Computed properties
    computedProperties,
    
    // Memoized methods
    getObjectById,
    getObjectsByCategory,
    getHumanById,
    getActiveHuman,
    getHumanPosition,
    getCategoryById,
    isObjectLoaded,
    isHumanSpawned,
    getSceneObjectById,
    getAllSceneObjects,
    hasPhysicsBody
  ]);
};

// ========== SPECIALIZED HOOKS (Optimized) ==========

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
  
  return useMemo(() => ({
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
  }), [
    loadedObjects,
    loadObject,
    updateObject,
    removeObject,
    clearAllObjects,
    getObjectById,
    getObjectsByCategory,
    isObjectLoaded
  ]);
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
  
  const hasActive = useMemo(() => 
    spawnedHumans.some(h => h.isActive), 
    [spawnedHumans]
  );
  
  return useMemo(() => ({
    humans: spawnedHumans,
    selectedHuman,
    positions: humanPositions,
    moveHuman: handleMoveHuman,
    getHuman: getHumanById,
    getActive: getActiveHuman,
    getPosition: getHumanPosition,
    isSpawned: isHumanSpawned,
    count: spawnedHumans.length,
    hasActive,
    isEmpty: spawnedHumans.length === 0
  }), [
    spawnedHumans,
    selectedHuman,
    humanPositions,
    handleMoveHuman,
    getHumanById,
    getActiveHuman,
    getHumanPosition,
    isHumanSpawned,
    hasActive
  ]);
};

export const useEnvironmentCategories = () => {
  const {
    categories,
    selectedCategory,
    selectCategory,
    deleteCategory,
    getCategoryById
  } = useEnvironment();
  
  return useMemo(() => ({
    categories,
    selected: selectedCategory,
    select: selectCategory,
    delete: deleteCategory,
    getById: getCategoryById,
    count: categories.length,
    isEmpty: categories.length === 0
  }), [
    categories,
    selectedCategory,
    selectCategory,
    deleteCategory,
    getCategoryById
  ]);
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
  
  return useMemo(() => ({
    currentView,
    selectedCategory,
    selectCategory,
    goBack: goBackToCategories,
    setView: setCurrentView,
    isCategoriesView,
    isObjectsView: isInObjectsView
  }), [
    currentView,
    selectedCategory,
    selectCategory,
    goBackToCategories,
    setCurrentView,
    isCategoriesView,
    isInObjectsView
  ]);
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
  
  return useMemo(() => ({
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
  }), [
    sceneObjects,
    objectRegistries,
    registerObject,
    unregisterObject,
    getObjectsByType,
    addObject,
    isInScene,
    getSceneObjectById,
    getAllSceneObjects
  ]);
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
  
  return useMemo(() => ({
    world,
    isEnabled: isPhysicsEnabled,
    createBody: createPhysicsBody,
    removeBody: removePhysicsBody,
    syncWith: syncWithObject,
    hasBody: hasPhysicsBody
  }), [
    world,
    isPhysicsEnabled,
    createPhysicsBody,
    removePhysicsBody,
    syncWithObject,
    hasPhysicsBody
  ]);
};

export const useEnvironmentPlacement = () => {
  const { calculateSmartPosition } = useEnvironment();
  
  return useMemo(() => ({
    calculatePosition: calculateSmartPosition
  }), [calculateSmartPosition]);
};

export default useEnvironment;