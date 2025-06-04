// src/contexts/SceneObjectContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import EventBus from '../utils/EventBus';

const SceneObjectContext = createContext(null);

export const SceneObjectProvider = ({ children }) => {
  const [objects, setObjects] = useState(new Map());
  const [categories, setCategories] = useState(new Map());
  const [sceneReady, setSceneReady] = useState(false);
  const [error, setError] = useState(null);
  const sceneSetupRef = useRef(null);

  // Connect to scene when it's ready
  useEffect(() => {
    const unsubscribeReady = EventBus.on('scene:ready', (data) => {
      sceneSetupRef.current = data.sceneSetup;
      setSceneReady(true);
    });

    const unsubscribeObjectAdded = EventBus.on('scene:object-added', (data) => {
      setObjects(prev => new Map(prev).set(data.objectId, data));
    });

    const unsubscribeObjectRemoved = EventBus.on('scene:object-removed', (data) => {
      setObjects(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.objectId);
        return newMap;
      });
    });

    return () => {
      unsubscribeReady();
      unsubscribeObjectAdded();
      unsubscribeObjectRemoved();
    };
  }, []);

  // Add any 3D object to scene
  const addObject = async (config) => {
    if (!sceneSetupRef.current) {
      throw new Error('Scene not ready');
    }

    try {
      setError(null);
      
      // Generate ID if not provided
      const objectId = config.id || `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const objectConfig = {
        id: objectId,
        name: config.name || 'Unnamed Object',
        path: config.path || config.url || config.file,
        position: config.position || { x: 0, y: 0, z: 0 },
        rotation: config.rotation || { x: 0, y: 0, z: 0 },
        scale: config.scale || { x: 1, y: 1, z: 1 },
        material: config.material,
        category: config.category || 'custom',
        metadata: config.metadata || {},
        visible: config.visible !== false,
        castShadow: config.castShadow !== false,
        receiveShadow: config.receiveShadow !== false,
        ...config
      };

      // Load through SceneSetup
      const object3D = await sceneSetupRef.current.loadEnvironmentObject(objectConfig);
      
      // Store in our state
      const objectData = {
        ...objectConfig,
        object3D,
        addedAt: Date.now()
      };
      
      setObjects(prev => new Map(prev).set(objectId, objectData));
      
      // Update categories
      setCategories(prev => {
        const newCats = new Map(prev);
        const category = objectConfig.category;
        if (!newCats.has(category)) {
          newCats.set(category, []);
        }
        newCats.get(category).push(objectId);
        return newCats;
      });

      EventBus.emit('sceneObject:added', objectData);
      
      return objectData;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Remove object from scene
  const removeObject = (objectId) => {
    if (!sceneSetupRef.current) return;
    
    const object = objects.get(objectId);
    if (!object) return;
    
    sceneSetupRef.current.removeEnvironmentObject(objectId);
    
    // Update categories
    setCategories(prev => {
      const newCats = new Map(prev);
      const category = object.category;
      if (newCats.has(category)) {
        const items = newCats.get(category).filter(id => id !== objectId);
        if (items.length === 0) {
          newCats.delete(category);
        } else {
          newCats.set(category, items);
        }
      }
      return newCats;
    });
    
    EventBus.emit('sceneObject:removed', { objectId });
  };

  // Update object properties
  const updateObject = (objectId, updates) => {
    if (!sceneSetupRef.current) return;
    
    const object = objects.get(objectId);
    if (!object) return;
    
    sceneSetupRef.current.updateEnvironmentObject(objectId, updates);
    
    // Update our state
    setObjects(prev => {
      const newMap = new Map(prev);
      newMap.set(objectId, { ...object, ...updates });
      return newMap;
    });
    
    EventBus.emit('sceneObject:updated', { objectId, updates });
  };

  // Clear all objects
  const clearAll = () => {
    if (!sceneSetupRef.current) return;
    
    objects.forEach((_, objectId) => {
      sceneSetupRef.current.removeEnvironmentObject(objectId);
    });
    
    setObjects(new Map());
    setCategories(new Map());
    
    EventBus.emit('sceneObject:cleared');
  };

  // Get objects by category
  const getObjectsByCategory = (category) => {
    const objectIds = categories.get(category) || [];
    return objectIds.map(id => objects.get(id)).filter(Boolean);
  };

  // Load from file (browser file input)
  const loadFromFile = async (file, config = {}) => {
    const url = URL.createObjectURL(file);
    
    try {
      const result = await addObject({
        ...config,
        path: url,
        name: config.name || file.name,
        metadata: {
          ...config.metadata,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }
      });
      
      // Clean up blob URL after loading
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      return result;
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  };

  // Batch operations
  const addMultiple = async (configs) => {
    const results = [];
    for (const config of configs) {
      try {
        const result = await addObject(config);
        results.push({ success: true, data: result });
      } catch (err) {
        results.push({ success: false, error: err.message, config });
      }
    }
    return results;
  };

  const value = {
    // State
    objects: Array.from(objects.values()),
    objectsMap: objects,
    categories: Array.from(categories.keys()),
    sceneReady,
    error,
    
    // Methods
    addObject,
    removeObject,
    updateObject,
    clearAll,
    getObjectsByCategory,
    loadFromFile,
    addMultiple,
    
    // Utils
    getObject: (id) => objects.get(id),
    hasObject: (id) => objects.has(id),
    getObjectCount: () => objects.size,
  };

  return (
    <SceneObjectContext.Provider value={value}>
      {children}
    </SceneObjectContext.Provider>
  );
};

export const useSceneObject = () => {
  const context = useContext(SceneObjectContext);
  if (!context) {
    throw new Error('useSceneObject must be used within SceneObjectProvider');
  }
  return context;
};