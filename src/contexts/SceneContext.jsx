// src/contexts/SceneContext.jsx
import React, { createContext, useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import EventBus from '../utils/EventBus';
import { createStandardGrids } from '../utils/threeHelpers';

const SceneContext = createContext(null);

// Custom hook for scene setup
const useSceneSetup = (config) => {
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const worldRef = useRef(null);
  const containerRef = useRef(null);
  const animationIdRef = useRef(null);
  
  // Object registries
  const registriesRef = useRef({
    robots: new Map(),
    environment: new Map(),
    trajectories: new Map(),
    humans: new Map(),
    custom: new Map()
  });

  const initializeScene = useCallback((container) => {
    if (!container || sceneRef.current) return;
    
    containerRef.current = container;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);
    scene.fog = new THREE.FogExp2(config.backgroundColor, 0.02);
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      1000
    );
    camera.position.set(2, 2, 2);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = config.enableShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 50;
    controlsRef.current = controls;
    
    // Initialize physics if enabled
    if (config.enablePhysics) {
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0);
      world.broadphase = new CANNON.NaiveBroadphase();
      world.solver.iterations = 10;
      worldRef.current = world;
    }
    
    return true;
  }, [config]);

  return {
    sceneRef,
    rendererRef,
    cameraRef,
    controlsRef,
    worldRef,
    containerRef,
    animationIdRef,
    registriesRef,
    initializeScene
  };
};

// Custom hook for animation loop
const useAnimationLoop = (refs, isInitialized) => {
  const startRenderLoop = useCallback(() => {
    const clock = new THREE.Clock();
    
    const animate = () => {
      refs.animationIdRef.current = requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      
      // Update physics
      if (refs.worldRef.current) {
        refs.worldRef.current.step(deltaTime);
      }
      
      // Update controls
      if (refs.controlsRef.current) {
        refs.controlsRef.current.update();
      }
      
      // Render
      if (refs.rendererRef.current && refs.sceneRef.current && refs.cameraRef.current) {
        refs.rendererRef.current.render(refs.sceneRef.current, refs.cameraRef.current);
      }
      
      // Emit frame event
      EventBus.emit('scene:frame', { deltaTime });
    };
    
    animate();
  }, [refs]);

  const stopRenderLoop = useCallback(() => {
    if (refs.animationIdRef.current) {
      cancelAnimationFrame(refs.animationIdRef.current);
      refs.animationIdRef.current = null;
    }
  }, [refs]);

  useEffect(() => {
    if (isInitialized) {
      startRenderLoop();
      return () => stopRenderLoop();
    }
  }, [isInitialized, startRenderLoop, stopRenderLoop]);
};

// Custom hook for resize handling
const useResizeHandler = (refs, isInitialized) => {
  useEffect(() => {
    if (!isInitialized) return;

    const handleResize = () => {
      const container = refs.containerRef.current;
      if (!container || !refs.cameraRef.current || !refs.rendererRef.current) return;
      
      refs.cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      refs.cameraRef.current.updateProjectionMatrix();
      refs.rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size setup
    
    return () => window.removeEventListener('resize', handleResize);
  }, [refs, isInitialized]);
};

// Main provider component
export const SceneProvider = ({ children, config = {} }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sceneConfig] = useState({
    backgroundColor: '#e6f2ff',
    enableShadows: true,
    enablePhysics: true,
    groundSize: 40,
    upAxis: '+Z',
    ...config
  });
  
  // Use custom hooks
  const refs = useSceneSetup(sceneConfig);
  useAnimationLoop(refs, isInitialized);
  useResizeHandler(refs, isInitialized);
  
  // Scene setup functions
  const setupLights = useCallback((scene) => {
    const ambientLight = new THREE.HemisphereLight('#ffffff', '#000000', 0.5);
    ambientLight.position.set(0, 1, 0);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(3, 8, 3);
    directionalLight.castShadow = sceneConfig.enableShadows;
    if (sceneConfig.enableShadows) {
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.left = -4;
      directionalLight.shadow.camera.right = 4;
      directionalLight.shadow.camera.top = 4;
      directionalLight.shadow.camera.bottom = -4;
    }
    scene.add(directionalLight);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-3, 4, -3);
    scene.add(fillLight);
  }, [sceneConfig.enableShadows]);
  
  const setupGround = useCallback((scene) => {
    const groundGeometry = new THREE.PlaneGeometry(sceneConfig.groundSize, sceneConfig.groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.7,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = sceneConfig.enableShadows;
    ground.userData.isGround = true;
    scene.add(ground);
    
    if (refs.worldRef.current) {
      const groundShape = new CANNON.Box(
        new CANNON.Vec3(sceneConfig.groundSize / 2, 0.1, sceneConfig.groundSize / 2)
      );
      const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        position: new CANNON.Vec3(0, -0.1, 0)
      });
      refs.worldRef.current.addBody(groundBody);
    }
    
    createStandardGrids(scene, {
      gridSize: sceneConfig.groundSize,
      gridDivisions: sceneConfig.groundSize,
      addAxes: true,
      axesSize: 1
    });
  }, [sceneConfig, refs]);
  
  // Initialize scene
  const initializeScene = useCallback((container) => {
    if (isInitialized || !container) return;
    
    const initialized = refs.initializeScene(container);
    if (!initialized) return;
    
    const scene = refs.sceneRef.current;
    setupLights(scene);
    setupGround(scene);
    
    setIsInitialized(true);
    
    EventBus.emit('scene:initialized', {
      scene: refs.sceneRef.current,
      camera: refs.cameraRef.current,
      renderer: refs.rendererRef.current,
      controls: refs.controlsRef.current,
      world: refs.worldRef.current
    });
  }, [isInitialized, refs, setupLights, setupGround]);
  
  // Object management
  const registerObject = useCallback((type, id, object, metadata = {}) => {
    const registry = refs.registriesRef.current[type];
    if (!registry) return;
    
    registry.set(id, {
      object,
      metadata,
      timestamp: Date.now()
    });
    
    if (object && object.isObject3D && refs.sceneRef.current) {
      refs.sceneRef.current.add(object);
    }
    
    EventBus.emit('scene:object-registered', { type, id, object, metadata });
  }, [refs]);
  
  const unregisterObject = useCallback((type, id) => {
    const registry = refs.registriesRef.current[type];
    if (!registry) return;
    
    const entry = registry.get(id);
    if (!entry) return;
    
    if (entry.object && entry.object.isObject3D && refs.sceneRef.current) {
      refs.sceneRef.current.remove(entry.object);
    }
    
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
    
    registry.delete(id);
    EventBus.emit('scene:object-unregistered', { type, id });
  }, [refs]);
  
  const getObjectsByType = useCallback((type) => {
    const registry = refs.registriesRef.current[type];
    if (!registry) return [];
    
    return Array.from(registry.entries()).map(([id, entry]) => ({
      id,
      ...entry
    }));
  }, [refs]);
  
  const focusOnObject = useCallback((object, padding = 1.2) => {
    if (!object || !refs.cameraRef.current || !refs.controlsRef.current) return;
    
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = refs.cameraRef.current.fov * (Math.PI / 180);
    let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
    cameraDistance *= padding;
    
    const direction = new THREE.Vector3(0.5, 0.3, 1).normalize();
    refs.cameraRef.current.position.copy(center).add(direction.multiplyScalar(cameraDistance));
    
    refs.controlsRef.current.target.copy(center);
    refs.controlsRef.current.update();
    
    EventBus.emit('scene:camera-focused', { target: object, center, distance: cameraDistance });
  }, [refs]);
  
  const addPhysicsBody = useCallback((body, objectId) => {
    if (!refs.worldRef.current) return;
    
    refs.worldRef.current.addBody(body);
    
    if (!refs.registriesRef.current.physics) {
      refs.registriesRef.current.physics = new Map();
    }
    refs.registriesRef.current.physics.set(objectId, body);
  }, [refs]);
  
  const removePhysicsBody = useCallback((objectId) => {
    if (!refs.worldRef.current) return;
    
    const body = refs.registriesRef.current.physics?.get(objectId);
    if (body) {
      refs.worldRef.current.removeBody(body);
      refs.registriesRef.current.physics.delete(objectId);
    }
  }, [refs]);
  
  const dispose = useCallback(() => {
    // Stop animation loop
    if (refs.animationIdRef.current) {
      cancelAnimationFrame(refs.animationIdRef.current);
    }
    
    // Clean up registries
    Object.values(refs.registriesRef.current).forEach(registry => {
      registry.clear();
    });
    
    // Dispose Three.js resources
    if (refs.sceneRef.current) {
      refs.sceneRef.current.traverse(child => {
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
    
    if (refs.rendererRef.current) {
      refs.rendererRef.current.dispose();
      if (refs.containerRef.current && refs.rendererRef.current.domElement) {
        refs.containerRef.current.removeChild(refs.rendererRef.current.domElement);
      }
    }
    
    if (refs.controlsRef.current) {
      refs.controlsRef.current.dispose();
    }
    
    setIsInitialized(false);
  }, [refs]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => dispose();
  }, [dispose]);
  
  const value = {
    isInitialized,
    config: sceneConfig,
    initializeScene,
    registerObject,
    unregisterObject,
    getObjectsByType,
    focusOnObject,
    addPhysicsBody,
    removePhysicsBody,
    dispose,
    scene: refs.sceneRef.current,
    camera: refs.cameraRef.current,
    renderer: refs.rendererRef.current,
    controls: refs.controlsRef.current,
    world: refs.worldRef.current
  };
  
  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  );
};

export default SceneContext;
export { SceneContext };