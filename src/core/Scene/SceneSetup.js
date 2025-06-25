// src/core/Scene/SceneSetup.js - OPTIMIZED VERSION
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import EventBus from '../../utils/EventBus';
import { createStandardGrids } from '../../utils/threeHelpers';

const DEFAULT_CONFIG = {
  backgroundColor: '#f0f0f0',
  enableShadows: true,
  ambientColor: '#404040',
  groundSize: 10000,
  upAxis: '+Z',
};

// Debug flag
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

/**
 * Optimized SceneSetup class with proper resource management
 */
class SceneSetup {
  constructor(container, options = {}) {
    // Validate container first
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('SceneSetup: container must be a valid DOM element');
    }
    
    this.container = container;
    this.frameInterval = 1000 / 60;
    this.lastFrameTime = 0;
    this.isDisposed = false;
    this.resizeTimeout = null;
    
    // Configuration
    this.backgroundColor = options.backgroundColor || DEFAULT_CONFIG.backgroundColor;
    this.enableShadows = options.enableShadows !== undefined ? options.enableShadows : DEFAULT_CONFIG.enableShadows;
    this.ambientColor = options.ambientColor || DEFAULT_CONFIG.ambientColor;
    this.groundSize = options.groundSize || DEFAULT_CONFIG.groundSize;
    this.upAxis = options.upAxis || DEFAULT_CONFIG.upAxis;
    
    // Dynamic environment system
    this.environmentObjects = new Map();
    this.objectLoaders = null; // Lazy initialization
    this.defaultMaterial = null; // Lazy initialization
    this.animationFrameId = null;
    
    // Performance optimization
    this.targetFPS = 60;
    this.frameInterval = 1000 / this.targetFPS;
    
    // Initialize scene components IN THE CORRECT ORDER
    this.initScene();
    this.initCamera(); // MUST be before initControls
    this.initRenderer();
    this.initLights();
    this.initControls(); // Now camera exists
    this.initPhysics();
    this.initGround();
    
    // Add the renderer to the container
    this.container.appendChild(this.renderer.domElement);
    
    // Start render loop
    this.startRenderLoop();
    
    // Handle window resize
    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
    this.handleResize();
  }
  
  /**
   * Initialize the Three.js scene
   */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.backgroundColor || '#f0f0f0');
    this.scene.fog = new THREE.FogExp2(this.backgroundColor || '#f0f0f0', 0.02);
    
    // Create robot root for proper orientation handling
    this.robotRoot = new THREE.Object3D();
    this.robotRoot.name = 'RobotRoot';
    this.scene.add(this.robotRoot);
    
    // Use utility for grid and axes
    const { grid, axes } = createStandardGrids(this.scene, { 
      gridSize: 10, 
      gridDivisions: 20, 
      addAxes: true, 
      axesSize: 1 
    });
    this.gridHelper = grid;
    this.axesHelper = axes;
  }
  
  /**
   * Initialize the camera
   */
  initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    
    this.camera = new THREE.PerspectiveCamera(
      60,     // FOV
      aspect, // Aspect ratio
      0.01,   // Near
      1000    // Far
    );
    
    // Set initial camera position
    this.camera.position.set(3, 2, 3);
    this.camera.lookAt(0, 0.5, 0);
    
    // Ensure camera has updateProjectionMatrix method
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Initialize the renderer with optimized settings
   */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    
    this.renderer.setSize(
      this.container.clientWidth, 
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance
    
    // Configure shadows if enabled
    if (this.enableShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false; // Manual update for performance
    }
    
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }
  
  /**
   * Initialize lights
   */
  initLights() {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(this.ambientColor, 0.4);
    this.scene.add(this.ambientLight);
    
    // Directional light (sun)
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(10, 10, 5);
    this.directionalLight.castShadow = this.enableShadows;
    
    if (this.enableShadows) {
      this.directionalLight.shadow.mapSize.width = 2048;
      this.directionalLight.shadow.mapSize.height = 2048;
      this.directionalLight.shadow.camera.near = 0.5;
      this.directionalLight.shadow.camera.far = 50;
      this.directionalLight.shadow.camera.left = -10;
      this.directionalLight.shadow.camera.right = 10;
      this.directionalLight.shadow.camera.top = 10;
      this.directionalLight.shadow.camera.bottom = -10;
    }
    
    this.scene.add(this.directionalLight);
  }
  
  /**
   * Initialize orbit controls
   */
  initControls() {
    // Check that camera exists
    if (!this.camera) {
      throw new Error('SceneSetup: Camera must be initialized before controls');
    }
    
    // Check that renderer exists
    if (!this.renderer || !this.renderer.domElement) {
      throw new Error('SceneSetup: Renderer must be initialized before controls');
    }
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 50;
    
    // Store the change listener for cleanup
    this.controlsChangeHandler = () => {
      // Placeholder for compatibility
    };
    
    this.controls.addEventListener('change', this.controlsChangeHandler);
  }
  
  /**
   * Initialize physics world
   */
  initPhysics() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    
    // Use fixed timestep for consistent physics
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.3;
  }
  
  /**
   * Initialize ground
   */
  initGround() {
    // Create ground material
    this.groundMaterial = new CANNON.Material('ground');
    const groundShape = new CANNON.Box(new CANNON.Vec3(this.groundSize / 2, 0.1, this.groundSize / 2));
    
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      material: this.groundMaterial,
      position: new CANNON.Vec3(0, -0.1, 0)
    });
    
    this.world.addBody(this.groundBody);
  }
  
  /**
   * Lazy initialize object loaders
   */
  getObjectLoaders() {
    if (!this.objectLoaders) {
      const loadingManager = new THREE.LoadingManager();
      
      loadingManager.onStart = () => {
        // Placeholder for compatibility
      };
      
      loadingManager.onLoad = () => {
        // Placeholder for compatibility
      };
      
      loadingManager.onError = (url) => {
        // Placeholder for compatibility
      };
      
      this.objectLoaders = {
        gltf: new GLTFLoader(loadingManager),
        stl: new STLLoader(loadingManager),
        obj: new OBJLoader(loadingManager),
        mtl: new MTLLoader(loadingManager)
      };
    }
    return this.objectLoaders;
  }
  
  /**
   * Get default material (lazy initialization)
   */
  getDefaultMaterial() {
    if (!this.defaultMaterial) {
      this.defaultMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        shininess: 100,
        specular: 0x222222
      });
    }
    return this.defaultMaterial;
  }
  
  /**
   * Optimized render loop with FPS limiting
   */
  startRenderLoop() {
    const animate = (currentTime) => {
      if (this.isDisposed) return;
      
      this.animationFrameId = requestAnimationFrame(animate);
      
      // FPS limiting
      const deltaTime = currentTime - this.lastFrameTime;
      if (deltaTime < this.frameInterval) return;
      
      this.lastFrameTime = currentTime - (deltaTime % this.frameInterval);
      
      // Update physics with fixed timestep
      if (this.world) {
        this.world.step(1/60);
      }
      
      // Update controls
      if (this.controls?.enabled !== false) {
        this.controls.update();
      }
      
      // Update shadow map if needed
      if (this.enableShadows && this.renderer.shadowMap.needsUpdate) {
        this.renderer.shadowMap.needsUpdate = false;
      }
      
      // Render
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    
    animate(0);
  }
  
  /**
   * Debounced resize handler
   */
  handleResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    this.resizeTimeout = setTimeout(() => {
      if (!this.container || !this.camera || !this.renderer || this.isDisposed) return;
      
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      
      // Only update if size actually changed
      if (this.renderer.domElement.width !== width || 
          this.renderer.domElement.height !== height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    }, 150); // 150ms debounce
  }
  
  /**
   * Set the scene's coordinate system orientation
   */
  setUpAxis(up) {
    if (!up) up = '+Z';
    
    up = up.toUpperCase();
    const sign = up.includes('-') ? -1 : 1;
    const axis = up.replace(/[^XYZ]/gi, '')[0] || 'Z';
    
    const PI = Math.PI;
    const HALFPI = PI / 2;
    
    this.robotRoot.rotation.set(0, 0, 0);
    
    switch (axis) {
      case 'X':
        this.robotRoot.rotation.z = sign * HALFPI;
        break;
      case 'Y':
        this.robotRoot.rotation.x = sign === 1 ? 0 : PI;
        break;
      case 'Z':
        this.robotRoot.rotation.x = sign * -HALFPI;
        break;
    }
  }
  
  /**
   * Set background color
   */
  setBackgroundColor(color) {
    if (this.scene) {
      this.scene.background = new THREE.Color(color);
    }
  }
  
  /**
   * Toggle shadows
   */
  setShadows(enabled) {
    this.enableShadows = enabled;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = enabled;
      if (enabled) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
  }
  
  /**
   * Focus camera on object with smooth transition
   */
  focusOnObject(object, paddingMultiplier = 1.0) {
    if (!object || !this.camera || !this.controls) return;
    
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * paddingMultiplier * 2;
    
    // Set new position
    const newPosition = center.clone();
    newPosition.z += distance;
    
    // Smooth transition
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let progress = 0;
    
    const animateFocus = () => {
      progress += 0.05;
      if (progress >= 1) {
        this.camera.position.copy(newPosition);
        this.controls.target.copy(center);
        this.controls.update();
        return;
      }
      
      this.camera.position.lerpVectors(startPosition, newPosition, progress);
      this.controls.target.lerpVectors(startTarget, center, progress);
      this.controls.update();
      
      requestAnimationFrame(animateFocus);
    };
    
    animateFocus();
  }
  
  /**
   * Load environment object with error handling
   */
  async loadEnvironmentObject(config) {
    const {
      path,
      position = { x: 0, y: 0, z: 0 },
      rotation = { x: 0, y: 0, z: 0 },
      scale = { x: 1, y: 1, z: 1 },
      material = null
    } = config;
    
    const extension = path.split('.').pop().toLowerCase();
    const id = config.id || `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const loaders = this.getObjectLoaders();
      let object;
      
      switch (extension) {
        case 'gltf':
        case 'glb':
          const gltf = await loaders.gltf.loadAsync(path);
          object = gltf.scene;
          
          // Optimize GLTF animations if present
          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(object);
            object.userData.mixer = mixer;
            object.userData.animations = gltf.animations;
          }
          break;
          
        case 'stl':
          const geometry = await loaders.stl.loadAsync(path);
          geometry.computeVertexNormals(); // Ensure proper lighting
          const stlMaterial = material || this.getDefaultMaterial();
          object = new THREE.Mesh(geometry, stlMaterial);
          break;
          
        case 'obj':
          object = await loaders.obj.loadAsync(path);
          if (material) {
            object.traverse((child) => {
              if (child.isMesh) child.material = material;
            });
          }
          break;
          
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }
      
      // Apply transforms
      object.position.set(position.x, position.y, position.z);
      object.rotation.set(rotation.x, rotation.y, rotation.z);
      object.scale.set(scale.x, scale.y, scale.z);
      
      // Optimize for rendering
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = this.enableShadows;
          child.receiveShadow = this.enableShadows;
          child.frustumCulled = true;
          
          // Optimize geometry if possible
          if (child.geometry && !child.geometry.attributes.normal) {
            child.geometry.computeVertexNormals();
          }
        }
      });
      
      // Add to scene
      this.scene.add(object);
      this.environmentObjects.set(id, object);
      
      // Update shadow map if needed
      if (this.enableShadows) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      
      return { id, object };
      
    } catch (error) {
      console.error(`Failed to load environment object: ${path}`, error);
      throw error;
    }
  }
  
  /**
   * Remove environment object with proper cleanup
   */
  removeEnvironmentObject(id) {
    const object = this.environmentObjects.get(id);
    if (!object) return;
    
    // Stop animations if present
    if (object.userData.mixer) {
      object.userData.mixer.stopAllAction();
      object.userData.mixer = null;
    }
    
    // Remove from scene
    this.scene.remove(object);
    
    // Dispose resources
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            this.disposeMaterial(m);
          });
        } else {
          this.disposeMaterial(child.material);
        }
      }
    });
    
    this.environmentObjects.delete(id);
  }
  
  /**
   * Properly dispose material and its textures
   */
  disposeMaterial(material) {
    if (!material) return;
    
    // Dispose textures
    const textureProperties = [
      'map', 'lightMap', 'bumpMap', 'normalMap', 
      'specularMap', 'envMap', 'alphaMap', 'aoMap',
      'emissiveMap', 'metalnessMap', 'roughnessMap'
    ];
    
    textureProperties.forEach(prop => {
      if (material[prop]) {
        material[prop].dispose();
      }
    });
    
    material.dispose();
  }
  
  /**
   * Clear all environment objects
   */
  clearEnvironmentObjects() {
    const ids = Array.from(this.environmentObjects.keys());
    ids.forEach(id => this.removeEnvironmentObject(id));
  }
  
  /**
   * Complete disposal of all resources
   */
  dispose() {
    log('[SceneSetup] Disposing all resources');
    
    this.isDisposed = true;
    
    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clear timeouts
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    
    if (this.controls) {
      this.controls.removeEventListener('change', this.controlsChangeHandler);
      this.controls.dispose();
    }
    
    // Clear environment objects
    this.clearEnvironmentObjects();
    
    // Dispose default material
    if (this.defaultMaterial) {
      this.defaultMaterial.dispose();
    }
    
    // Dispose loaders
    if (this.objectLoaders) {
      // Loaders don't have dispose methods, but clear references
      this.objectLoaders = null;
    }
    
    // Clear physics world
    if (this.world) {
      while (this.world.bodies.length > 0) {
        this.world.removeBody(this.world.bodies[0]);
      }
      this.world = null;
    }
    
    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    
    // Clear all references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.robotRoot = null;
    this.container = null;
  }
  
  /**
   * Placeholder methods for compatibility
   */
  async loadTable() {
    console.warn('[SceneSetup] loadTable not implemented');
    return false;
  }
  
  setTableVisible(visible) {
    console.warn('[SceneSetup] setTableVisible not implemented');
  }
  
  /**
   * Update FPS target
   */
  setTargetFPS(fps) {
    this.targetFPS = Math.max(1, Math.min(120, fps));
    this.frameInterval = 1000 / this.targetFPS;
  }
}

export default SceneSetup;