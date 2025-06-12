// src/contexts/CreateLogoContext.jsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';

const CreateLogoContext = createContext(null);

export const CreateLogoProvider = ({ children }) => {
  // State for preview management
  const [previewScene, setPreviewScene] = useState(null);
  const [previewRenderer, setPreviewRenderer] = useState(null);
  const [previewCamera, setPreviewCamera] = useState(null);
  const [loadedRobot, setLoadedRobot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const urdfLoaderRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Initialize Three.js scene for preview
  const initializePreviewScene = useCallback((container) => {
    if (!container) return null;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      1000
    );
    camera.position.set(1, 1, 1);
    camera.lookAt(0, 0, 0);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Store references locally for this instance
    const previewData = {
      scene,
      camera,
      renderer,
      container,
      robot: null,
      animationId: null
    };

    // Start animation loop
    const animate = () => {
      if (previewData.robot) {
        previewData.robot.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
      previewData.animationId = requestAnimationFrame(animate);
    };
    animate();

    // Store preview data
    setPreviewScene(scene);
    setPreviewCamera(camera);
    setPreviewRenderer(renderer);

    // Initialize URDF loader
    if (!urdfLoaderRef.current) {
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
    }

    return previewData;
  }, []);

  // Load robot preview
  const loadRobotPreview = useCallback(async (robotData) => {
    if (!previewScene || !robotData?.urdfPath) return;

    try {
      setIsLoading(true);
      setError(null);

      // Clear existing robot
      if (loadedRobot) {
        previewScene.remove(loadedRobot);
        loadedRobot.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }

      // Extract package path
      const packagePath = robotData.urdfPath.substring(0, robotData.urdfPath.lastIndexOf('/'));
      
      // Reset loader
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = packagePath;
      urdfLoaderRef.current.currentRobotName = robotData.name;
      
      // Set up mesh loading callback
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${packagePath}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
            done(null, err);
            return;
          }
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = material || new THREE.MeshPhongMaterial({ 
                    color: 0x888888,
                    metalness: 0.4,
                    roughness: 0.6
                  });
                }
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            done(obj);
          } else {
            done(null, new Error('No mesh object returned'));
          }
        }, material);
      };

      // Load the robot
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(robotData.urdfPath, resolve, null, reject);
      });

      // Position and scale robot for preview
      robot.position.set(0, 0, 0);
      
      // Calculate bounding box to fit in view
      const box = new THREE.Box3().setFromObject(robot);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 1.5 / maxDim; // Fit in 1.5 units
      
      robot.scale.set(scale, scale, scale);
      robot.position.sub(center.multiplyScalar(scale));
      robot.position.y = 0;

      // Add to scene
      previewScene.add(robot);
      setLoadedRobot(robot);

      // Adjust camera to fit robot
      if (previewCamera) {
        const distance = maxDim * 2;
        previewCamera.position.set(distance, distance * 0.7, distance);
        previewCamera.lookAt(0, 0, 0);
      }

      // Start rotation animation
      startRotation();

      return robot;
    } catch (err) {
      console.error('Error loading robot preview:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [previewScene, previewCamera, loadedRobot]);

  // Start rotation animation
  const startRotation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const animate = () => {
      if (loadedRobot && previewRenderer && previewScene && previewCamera) {
        // Rotate robot
        loadedRobot.rotation.y += 0.005;
        
        // Render
        previewRenderer.render(previewScene, previewCamera);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, [loadedRobot, previewRenderer, previewScene, previewCamera]);

  // Stop rotation animation
  const stopRotation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Cleanup preview
  const cleanupPreview = useCallback(() => {
    stopRotation();

    if (loadedRobot && previewScene) {
      previewScene.remove(loadedRobot);
      loadedRobot.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    if (previewRenderer) {
      previewRenderer.dispose();
      if (previewRenderer.domElement && previewRenderer.domElement.parentNode) {
        previewRenderer.domElement.parentNode.removeChild(previewRenderer.domElement);
      }
    }

    setPreviewScene(null);
    setPreviewCamera(null);
    setPreviewRenderer(null);
    setLoadedRobot(null);
  }, [loadedRobot, previewRenderer, previewScene, stopRotation]);

  // Take screenshot of current preview
  const takeScreenshot = useCallback(() => {
    if (!previewRenderer || !previewScene || !previewCamera) return null;
    
    previewRenderer.render(previewScene, previewCamera);
    return previewRenderer.domElement.toDataURL('image/png');
  }, [previewRenderer, previewScene, previewCamera]);

  const value = {
    // State
    isLoading,
    error,
    hasPreview: !!loadedRobot,
    
    // Methods
    initializePreviewScene,
    loadRobotPreview,
    cleanupPreview,
    takeScreenshot,
    startRotation,
    stopRotation,
    
    // Clear error
    clearError: () => setError(null)
  };

  return (
    <CreateLogoContext.Provider value={value}>
      {children}
    </CreateLogoContext.Provider>
  );
};

export const useCreateLogoContext = () => {
  const context = useContext(CreateLogoContext);
  if (!context) {
    throw new Error('useCreateLogoContext must be used within CreateLogoProvider');
  }
  return context;
};

export default CreateLogoContext;