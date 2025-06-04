// src/hooks/useScene.js
import { useContext, useCallback, useEffect, useState } from 'react';
import { SceneContext } from '../SceneContext';
import EventBus from '../../utils/EventBus';

export const useScene = () => {
  const context = useContext(SceneContext);
  
  if (!context) {
    throw new Error('useScene must be used within SceneProvider');
  }
  
  return context;
};

// Helper hooks for common operations

/**
 * Hook for managing scene objects
 */
export const useSceneObject = (type, id) => {
  const { registerObject, unregisterObject, scene } = useScene();
  const [object, setObject] = useState(null);
  
  const addObject = useCallback((obj, metadata = {}) => {
    if (!obj || !id) return;
    
    registerObject(type, id, obj, metadata);
    setObject(obj);
    
    return () => {
      unregisterObject(type, id);
      setObject(null);
    };
  }, [type, id, registerObject, unregisterObject]);
  
  const removeObject = useCallback(() => {
    unregisterObject(type, id);
    setObject(null);
  }, [type, id, unregisterObject]);
  
  const updateObject = useCallback((updates) => {
    if (!object) return;
    
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
    
    EventBus.emit('scene:object-updated', { type, id, updates });
  }, [object, type, id]);
  
  return {
    object,
    addObject,
    removeObject,
    updateObject,
    isInScene: !!object && scene?.children.includes(object)
  };
};

/**
 * Hook for smart object placement
 */
export const useSmartPlacement = () => {
  const { getObjectsByType, scene } = useScene();
  
  const calculateSmartPosition = useCallback((category, basePosition = { x: 0, y: 0, z: 0 }) => {
    const robots = getObjectsByType('robots');
    const existingObjects = getObjectsByType('environment');
    
    // Get robot center if available
    let robotCenter = basePosition;
    let robotRadius = 1;
    
    if (robots.length > 0) {
      const robot = robots[0].object;
      const box = new THREE.Box3().setFromObject(robot);
      robotCenter = box.getCenter(new THREE.Vector3());
      robotRadius = box.getSize(new THREE.Vector3()).length() / 2;
    }
    
    // Smart placement rules by category
    const placements = {
      furniture: { distance: robotRadius + 1.5, angle: Math.PI },
      industrial: { distance: robotRadius + 2, angle: Math.PI / 2 },
      storage: { distance: robotRadius + 2.5, angle: -Math.PI / 2 },
      safety: { distance: robotRadius + 3, angle: 0 },
      controls: { distance: robotRadius + 2, angle: Math.PI / 4 }
    };
    
    const placement = placements[category] || { distance: robotRadius + 2, angle: 0 };
    
    // Find non-overlapping position
    let angle = placement.angle;
    let attempts = 0;
    let position;
    
    while (attempts < 16) {
      position = {
        x: robotCenter.x + Math.cos(angle) * placement.distance,
        y: 0,
        z: robotCenter.z + Math.sin(angle) * placement.distance
      };
      
      // Check for overlaps
      let hasOverlap = false;
      for (const obj of existingObjects) {
        if (!obj.object) continue;
        
        const distance = Math.sqrt(
          Math.pow(position.x - obj.object.position.x, 2) +
          Math.pow(position.z - obj.object.position.z, 2)
        );
        
        if (distance < 1.5) {
          hasOverlap = true;
          break;
        }
      }
      
      if (!hasOverlap) break;
      
      angle += Math.PI / 8;
      attempts++;
    }
    
    // Calculate rotation to face robot
    const lookAngle = Math.atan2(
      robotCenter.x - position.x,
      robotCenter.z - position.z
    );
    
    return {
      position,
      rotation: { x: 0, y: lookAngle, z: 0 }
    };
  }, [getObjectsByType]);
  
  return { calculateSmartPosition };
};

/**
 * Hook for camera operations
 */
export const useCameraControls = () => {
  const { camera, controls, focusOnObject } = useScene();
  
  const setCameraPosition = useCallback((position) => {
    if (!camera) return;
    camera.position.set(position.x, position.y, position.z);
    if (controls) controls.update();
  }, [camera, controls]);
  
  const setCameraTarget = useCallback((target) => {
    if (!controls) return;
    controls.target.set(target.x, target.y, target.z);
    controls.update();
  }, [controls]);
  
  const resetCamera = useCallback(() => {
    setCameraPosition({ x: 2, y: 2, z: 2 });
    setCameraTarget({ x: 0, y: 0, z: 0 });
  }, [setCameraPosition, setCameraTarget]);
  
  return {
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOnObject
  };
};

/**
 * Hook for physics operations
 */
export const usePhysics = () => {
  const { world, addPhysicsBody, removePhysicsBody } = useScene();
  const [bodies] = useState(new Map());
  
  const createPhysicsBody = useCallback((id, shape, options = {}) => {
    if (!world) return null;
    
    const body = new CANNON.Body({
      mass: options.mass ?? 1,
      shape,
      position: new CANNON.Vec3(
        options.position?.x ?? 0,
        options.position?.y ?? 0,
        options.position?.z ?? 0
      ),
      ...options
    });
    
    addPhysicsBody(body, id);
    bodies.set(id, body);
    
    return body;
  }, [world, addPhysicsBody, bodies]);
  
  const removeBody = useCallback((id) => {
    removePhysicsBody(id);
    bodies.delete(id);
  }, [removePhysicsBody, bodies]);
  
  const syncWithObject = useCallback((id, object) => {
    const body = bodies.get(id);
    if (!body || !object) return;
    
    object.position.copy(body.position);
    object.quaternion.copy(body.quaternion);
  }, [bodies]);
  
  useEffect(() => {
    // Clean up on unmount
    return () => {
      bodies.forEach((body, id) => removeBody(id));
    };
  }, []);
  
  return {
    world,
    createPhysicsBody,
    removeBody,
    syncWithObject,
    isPhysicsEnabled: !!world
  };
};

export default useScene;