// src/contexts/hooks/useEnvironment.js
import { useContext, useCallback } from 'react';
import EnvironmentContext from '../EnvironmentContext';

/**
 * Hook to use the environment context
 * @returns {Object} Environment context value
 * @throws {Error} If used outside of EnvironmentProvider
 */
export const useEnvironment = () => {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within EnvironmentProvider');
  }
  return context;
};

/**
 * Hook for managing environment objects
 * @returns {Object} Object management utilities
 */
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

/**
 * Hook for managing environment humans
 * @returns {Object} Human management utilities
 */
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

/**
 * Hook for managing environment categories
 * @returns {Object} Category management utilities
 */
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

/**
 * Hook for managing environment view state
 * @returns {Object} View management utilities
 */
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

/**
 * Hook for managing environment scene objects
 * @returns {Object} Scene object management utilities
 */
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

/**
 * Hook for managing environment camera
 * @returns {Object} Camera management utilities
 */
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

/**
 * Hook for managing environment physics
 * @returns {Object} Physics management utilities
 */
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

/**
 * Hook for managing environment placement
 * @returns {Object} Placement management utilities
 */
export const useEnvironmentPlacement = () => {
  const { calculateSmartPosition } = useEnvironment();
  
  return {
    calculatePosition: calculateSmartPosition
  };
};

export default useEnvironment;