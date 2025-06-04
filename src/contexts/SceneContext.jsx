// src/contexts/SceneContext.jsx
import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import EventBus from '../utils/EventBus';
import { createStandardGrids } from '../utils/threeHelpers';

const SceneContext = createContext(null);

export const SceneProvider = ({ children, config = {} }) => {
  // Core Three.js references
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const worldRef = useRef(null);
  const containerRef = useRef(null);
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [sceneConfig, setSceneConfig] = useState({
    backgroundColor: '#e6f2ff',
    enableShadows: true,
    enablePhysics: true,
    groundSize: 40,
    upAxis: '+Z',
    ...config
  });
  
  // Object registries - each system manages its own objects
  const registries = useRef({
    robots: new Map(),
    environment: new Map(),
    tcp: new Map(),
    trajectories: new Map(),
    humans: new Map(),
    custom: new Map()
  });
  
  // Animation loop ID
  const animationIdRef = useRef(null);
  
  /**
   * Initialize the scene
   */
  const initializeScene = useCallback((container) => {
    if (isInitialized || !container) return;
    
    containerRef.current = container;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sceneConfig.backgroundColor);
    scene.fog = new THREE.FogExp2(sceneConfig.backgroundColor, 0.02);
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
    renderer.shadowMap.enabled = sceneConfig.enableShadows;
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
    if (sceneConfig.enablePhysics) {
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0);
      world.broadphase = new CANNON.NaiveBroadphase();
      world.solver.iterations = 10;
      worldRef.current = world;
    }
    
    // Add lights
    setupLights(scene);
    
    // Add ground and grids
    setupGround(scene);
    
    // Start render loop
    startRenderLoop();
    
    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    setIsInitialized(true);
    
    // Emit initialization event
    EventBus.emit('scene:initialized', {
      scene,
      camera,
      renderer,
      controls,
      world: worldRef.current
    });
    
    return () => {
      window.removeEventListener('resize', handleResize);
      dispose();
    };
  }, [isInitialized, sceneConfig]);
  
  /**
   * Setup lights
   */
  const setupLights = (scene) => {
    // Ambient light
    const ambientLight = new THREE.HemisphereLight('#ffffff', '#000000', 0.5);
    ambientLight.position.set(0, 1, 0);
    scene.add(ambientLight);
    
    // Main directional light
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
    
    // Fill lights
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-3, 4, -3);
    scene.add(fillLight);
  };
  
  /**
   * Setup ground
   */
  const setupGround = (scene) => {
    // Visual ground
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
    
    // Physics ground
    if (worldRef.current) {
      const groundShape = new CANNON.Box(
        new CANNON.Vec3(sceneConfig.groundSize / 2, 0.1, sceneConfig.groundSize / 2)
      );
      const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        position: new CANNON.Vec3(0, -0.1, 0)
      });
      worldRef.current.addBody(groundBody);
    }
    
    // Add grids
    const { grid, axes } = createStandardGrids(scene, {
      gridSize: sceneConfig.groundSize,
      gridDivisions: sceneConfig.groundSize,
      addAxes: true,
      axesSize: 1
    });
  };
  
  /**
   * Start render loop
   */
  const startRenderLoop = () => {
    const clock = new THREE.Clock();
    
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      
      // Update physics
      if (worldRef.current) {
        worldRef.current.step(deltaTime);
      }
      
      // Update controls
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      // Render
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      // Emit frame event for other systems
      EventBus.emit('scene:frame', { deltaTime });
    };
    
    animate();
  };
  
  /**
   * Register an object in the scene
   */
  const registerObject = useCallback((type, id, object, metadata = {}) => {
    if (!registries.current[type]) {
      registries.current[type] = new Map();
    }
    
    registries.current[type].set(id, {
      object,
      metadata,
      timestamp: Date.now()
    });
    
    // Add to scene if it's a 3D object
    if (object && object.isObject3D && sceneRef.current) {
      sceneRef.current.add(object);
    }
    
    EventBus.emit('scene:object-registered', { type, id, object, metadata });
  }, []);
  
  /**
   * Unregister an object from the scene
   */
  const unregisterObject = useCallback((type, id) => {
    const registry = registries.current[type];
    if (!registry) return;
    
    const entry = registry.get(id);
    if (!entry) return;
    
    // Remove from scene
    if (entry.object && entry.object.isObject3D && sceneRef.current) {
      sceneRef.current.remove(entry.object);
    }
    
    // Clean up
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
  }, []);
  
  /**
   * Get registered objects by type
   */
  const getObjectsByType = useCallback((type) => {
    const registry = registries.current[type];
    if (!registry) return [];
    
    return Array.from(registry.entries()).map(([id, entry]) => ({
      id,
      ...entry
    }));
  }, []);
  
  /**
   * Focus camera on object
   */
  const focusOnObject = useCallback((object, padding = 1.2) => {
    if (!object || !cameraRef.current || !controlsRef.current) return;
    
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
    cameraDistance *= padding;
    
    const direction = new THREE.Vector3(0.5, 0.3, 1).normalize();
    cameraRef.current.position.copy(center).add(direction.multiplyScalar(cameraDistance));
    
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
    
    EventBus.emit('scene:camera-focused', { target: object, center, distance: cameraDistance });
  }, []);
  
  /**
   * Add physics body
   */
  const addPhysicsBody = useCallback((body, objectId) => {
    if (!worldRef.current) return;
    
    worldRef.current.addBody(body);
    
    // Store reference
    if (!registries.current.physics) {
      registries.current.physics = new Map();
    }
    registries.current.physics.set(objectId, body);
  }, []);
  
  /**
   * Remove physics body
   */
  const removePhysicsBody = useCallback((objectId) => {
    if (!worldRef.current) return;
    
    const body = registries.current.physics?.get(objectId);
    if (body) {
      worldRef.current.removeBody(body);
      registries.current.physics.delete(objectId);
    }
  }, []);
  
  /**
   * Update scene configuration
   */
  const updateConfig = useCallback((newConfig) => {
    setSceneConfig(prev => {
      const updated = { ...prev, ...newConfig };
      
      // Apply changes
      if (sceneRef.current && newConfig.backgroundColor) {
        sceneRef.current.background = new THREE.Color(newConfig.backgroundColor);
      }
      
      if (rendererRef.current && newConfig.enableShadows !== undefined) {
        rendererRef.current.shadowMap.enabled = newConfig.enableShadows;
      }
      
      return updated;
    });
  }, []);
  
  /**
   * Get scene components
   */
  const getSceneComponents = useCallback(() => ({
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    world: worldRef.current
  }), []);
  
  /**
   * Dispose of scene resources
   */
  const dispose = useCallback(() => {
    // Stop animation loop
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    
    // Clean up registries
    Object.values(registries.current).forEach(registry => {
      registry.clear();
    });
    
    // Dispose Three.js resources
    if (sceneRef.current) {
      sceneRef.current.traverse(child => {
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
    
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (containerRef.current && rendererRef.current.domElement) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    }
    
    if (controlsRef.current) {
      controlsRef.current.dispose();
    }
    
    setIsInitialized(false);
  }, []);
  
  // Expose context value
  const value = {
    // State
    isInitialized,
    config: sceneConfig,
    
    // Methods
    initializeScene,
    registerObject,
    unregisterObject,
    getObjectsByType,
    focusOnObject,
    addPhysicsBody,
    removePhysicsBody,
    updateConfig,
    getSceneComponents,
    dispose,
    
    // Direct access (use carefully)
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    world: worldRef.current
  };
  
  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  );
};

export default SceneContext;
export { SceneContext };