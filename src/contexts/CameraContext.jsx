import React, { createContext, useContext, useRef, useCallback } from 'react';
import * as THREE from 'three';

const CameraContext = createContext(null);

export const CameraProvider = ({ children }) => {
  // Camera reference
  const cameraRef = useRef(null);

  // Initialize camera (mimic SceneSetup.js logic)
  if (!cameraRef.current) {
    const camera = new THREE.PerspectiveCamera(
      60, // FOV
      1,  // Aspect ratio (should be updated by consumer)
      0.01, // Near
      1000 // Far
    );
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;
  }

  // Camera control methods
  const setCameraPosition = useCallback((position) => {
    if (!cameraRef.current) return;
    cameraRef.current.position.set(position.x, position.y, position.z);
  }, []);

  const setCameraTarget = useCallback((target) => {
    if (!cameraRef.current) return;
    cameraRef.current.lookAt(target.x, target.y, target.z);
  }, []);

  const resetCamera = useCallback(() => {
    if (!cameraRef.current) return;
    cameraRef.current.position.set(3, 2, 3);
    cameraRef.current.lookAt(0, 0.5, 0);
  }, []);

  // Optionally: focusOn method (bounding box logic)
  const focusOn = useCallback((object, paddingMultiplier = 1.0) => {
    if (!object || !cameraRef.current) return;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * paddingMultiplier * 2;
    cameraRef.current.position.copy(center);
    cameraRef.current.position.z += distance;
    cameraRef.current.lookAt(center);
  }, []);

  const contextValue = {
    camera: cameraRef.current,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn
  };

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