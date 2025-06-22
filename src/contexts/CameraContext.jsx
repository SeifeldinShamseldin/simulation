// src/contexts/CameraContext.jsx - OPTIMIZED VERSION
import React, { createContext, useContext, useRef, useCallback, useMemo, useEffect } from 'react';
import * as THREE from 'three';

const CameraContext = createContext(null);

export const CameraProvider = ({ children }) => {
  // Initialize camera only once using lazy initialization
  const cameraRef = useRef(null);
  
  // Lazy initialize camera
  const getCamera = useCallback(() => {
    if (!cameraRef.current) {
      const camera = new THREE.PerspectiveCamera(
        60,   // FOV
        1,    // Aspect ratio (will be updated by consumer)
        0.01, // Near
        1000  // Far
      );
      camera.position.set(3, 2, 3);
      camera.lookAt(0, 0.5, 0);
      cameraRef.current = camera;
    }
    return cameraRef.current;
  }, []);

  // Camera control methods
  const setCameraPosition = useCallback((position) => {
    const camera = getCamera();
    if (position instanceof THREE.Vector3) {
      camera.position.copy(position);
    } else {
      camera.position.set(position.x, position.y, position.z);
    }
  }, [getCamera]);

  const setCameraTarget = useCallback((target) => {
    const camera = getCamera();
    if (target instanceof THREE.Vector3) {
      camera.lookAt(target);
    } else {
      camera.lookAt(target.x, target.y, target.z);
    }
  }, [getCamera]);

  const resetCamera = useCallback(() => {
    const camera = getCamera();
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0.5, 0);
  }, [getCamera]);

  // Optimized focusOn with object pooling
  const vectorPool = useRef({
    size: new THREE.Vector3(),
    center: new THREE.Vector3()
  });

  const focusOn = useCallback((object, paddingMultiplier = 1.0) => {
    if (!object) return;
    
    const camera = getCamera();
    const box = new THREE.Box3().setFromObject(object);
    const size = vectorPool.current.size;
    const center = vectorPool.current.center;
    
    box.getSize(size);
    box.getCenter(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * paddingMultiplier * 2;
    
    camera.position.copy(center);
    camera.position.z += distance;
    camera.lookAt(center);
  }, [getCamera]);

  // Get camera properties
  const getCameraInfo = useCallback(() => {
    const camera = getCamera();
    return {
      position: camera.position.clone(),
      rotation: camera.rotation.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far
    };
  }, [getCamera]);

  // Update camera aspect ratio
  const updateAspect = useCallback((aspect) => {
    const camera = getCamera();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }, [getCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Dispose camera resources
      if (cameraRef.current) {
        // Clear any camera-specific resources
        cameraRef.current = null;
      }
      
      // Clear vector pool
      if (vectorPool.current) {
        vectorPool.current = null;
      }
    };
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    // Direct camera access (lazy)
    get camera() { return getCamera(); },
    
    // Control methods
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn,
    
    // Utility methods
    getCameraInfo,
    updateAspect,
    
    // For direct access when needed
    getCamera
  }), [
    getCamera,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn,
    getCameraInfo,
    updateAspect
  ]);

  return (
    <CameraContext.Provider value={contextValue}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCameraContext = () => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCameraContext must be used within a CameraProvider');
  }
  return context;
};

export default CameraContext;