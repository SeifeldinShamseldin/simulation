// src/core/Scene/SceneSetup.js - SCENE SETUP WITHOUT WORLD FUNCTIONS
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import EventBus from '../../utils/EventBus';

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  upAxis: '+Z'
};

/**
 * SceneSetup class - Handles core 3D scene without world visualization
 * World visualization (grid, ground) is now handled by WorldContext
 */
class SceneSetup {
  constructor(container, options = {}) {
    this.container = container;
    
    // Validate container
    if (!container || !container.appendChild) {
      throw new Error('SceneSetup: container must be a valid DOM element with appendChild method');
    }
    
    // Merge options with defaults
    this.backgroundColor = options.backgroundColor || DEFAULT_CONFIG.backgroundColor;
    this.enableShadows = options.enableShadows !== undefined ? options.enableShadows : DEFAULT_CONFIG.enableShadows;
    this.ambientColor = options.ambientColor || DEFAULT_CONFIG.ambientColor;
    this.upAxis = options.upAxis || DEFAULT_CONFIG.upAxis;
    
    // Dynamic environment system
    this.environmentObjects = new Map();
    this.objectLoaders = this.initializeLoaders();
    this.defaultMaterial = new THREE.MeshPhongMaterial({
      color: 0x888888,
      shininess: 100,
      specular: 0x222222
    });
    
    // Initialize scene components
    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initLights();
    this.initControls();
    this.initPhysics();
    
    // Add the renderer to the container
    this.container.appendChild(this.renderer.domElement);
    
    // Start render loop
    this.startRenderLoop();
    
    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));
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
    this.scene.add(this.robotRoot);
  }
  
  /**
   * Initialize the camera
   */
  initCamera() {
    // Use wider FOV to see more of the robot
    this.camera = new THREE.PerspectiveCamera(
      60,                 // Wider field of view
      1,                  // Aspect ratio (will be updated)
      0.01,               // Near clipping plane
      1000                // Far clipping plane
    );
    
    // Position camera to see robot well
    this.camera.position.set(3, 2, 3);
    this.camera.lookAt(0, 0.5, 0);
  }
  
  /**
   * Initialize the renderer
   */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(1, 1); // Will be resized
    this.renderer.shadowMap.enabled = this.enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // High quality settings
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }
  
  /**
   * Initialize lights
   */
  initLights() {
    // Bright ambient light for even illumination
    this.ambientLight = new THREE.AmbientLight(this.ambientColor, 0.6);
    this.scene.add(this.ambientLight);

    // Main directional light (sun-like)
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(5, 8, 5);
    this.directionalLight.castShadow = this.enableShadows;
    
    // Shadow settings
    this.directionalLight.shadow.camera.left = -5;
    this.directionalLight.shadow.camera.right = 5;
    this.directionalLight.shadow.camera.top = 5;
    this.directionalLight.shadow.camera.bottom = -5;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.bias = -0.0005;
    
    this.scene.add(this.directionalLight);
    
    // Create a target for the directional light
    this.directionalLight.target = new THREE.Object3D();
    this.scene.add(this.directionalLight.target);

    // Add a fill light from the opposite direction
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    this.fillLight.position.set(-3, 4, -3);
    this.scene.add(this.fillLight);

    // Add a rim light for edge highlighting
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.rimLight.position.set(0, 4, -5);
    this.scene.add(this.rimLight);

    // Add a bottom fill light for under-illumination
    this.bottomLight = new THREE.DirectionalLight(0xffffff, 0.2);
    this.bottomLight.position.set(0, -4, 0);
    this.scene.add(this.bottomLight);
  }
  
  /**
   * Initialize orbit controls
   */
  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 50;
    
    // Emit camera updates when controls change
    this.controls.addEventListener('change', () => {
      EventBus.emit('scene:camera-moved', {
        position: this.camera.position.toArray(),
        target: this.controls.target.toArray()
      });
    });
  }
  
  /**
   * Initialize physics world
   */
  initPhysics() {
    // Create physics world
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    
    // Physics materials
    this.groundMaterial = new CANNON.Material('ground');
    this.objectMaterial = new CANNON.Material('object');
    
    // Contact material - how materials interact
    const contactMaterial = new CANNON.ContactMaterial(
      this.groundMaterial,
      this.objectMaterial,
      {
        friction: 0.4,
        restitution: 0.1
      }
    );
    this.world.addContactMaterial(contactMaterial);
    
    // Store physics bodies
    this.physicsBodies = new Map();
    
    // Create physics ground body
    const groundShape = new CANNON.Box(
      new CANNON.Vec3(50, 0.1, 50)
    );
    
    this.groundBody = new CANNON.Body({
      mass: 0, // Static body
      shape: groundShape,
      material: this.groundMaterial,
      position: new CANNON.Vec3(0, -0.1, 0)
    });
    
    this.world.addBody(this.groundBody);
  }
  
  /**
   * Initialize object loaders
   */
  initializeLoaders() {
    return {
      gltf: new GLTFLoader(),
      stl: new STLLoader(),
      obj: new OBJLoader(),
      mtl: new MTLLoader()
    };
  }
  
  /**
   * Update physics simulation
   */
  updatePhysics(deltaTime = 1/60) {
    if (!this.world) return;
    
    // Step physics world
    this.world.step(deltaTime);
    
    // Update visual objects to match physics bodies
    this.physicsBodies.forEach((body, objectId) => {
      const object = this.environmentObjects.get(objectId);
      if (object && body.type === CANNON.Body.DYNAMIC) {
        object.position.copy(body.position);
        object.quaternion.copy(body.quaternion);
      }
    });
  }
  
  /**
   * Start the render loop
   */
  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update physics
      this.updatePhysics();
      
      // Update controls
      this.controls.update();
      
      // Render scene
      this.renderer.render(this.scene, this.camera);
    };
    
    animate();
  }
  
  /**
   * Handle window resize
   */
  handleResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }
  
  /**
   * Set the scene's coordinate system orientation
   */
  setUpAxis(up) {
    if (!up) up = '+Z';
    
    up = up.toUpperCase();
    const sign = up.replace(/[^-+]/g, '')[0] || '+';
    const axis = up.replace(/[^XYZ]/gi, '')[0] || 'Z';
    
    const PI = Math.PI;
    const HALFPI = PI / 2;
    
    // Reset rotation
    this.robotRoot.rotation.set(0, 0, 0);
    
    // Apply rotation based on the up axis
    if (axis === 'X') {
      this.robotRoot.rotation.set(0, 0, sign === '+' ? HALFPI : -HALFPI);
    } else if (axis === 'Z') {
      this.robotRoot.rotation.set(sign === '+' ? -HALFPI : HALFPI, 0, 0);
    } else if (axis === 'Y') {
      this.robotRoot.rotation.set(sign === '+' ? 0 : PI, 0, 0);
    }
  }
  
  /**
   * Set background color
   */
  setBackgroundColor(color) {
    if (this.scene) {
      this.scene.background = new THREE.Color(color);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(color);
      }
    }
  }
  
  /**
   * Set shadows enabled/disabled
   */
  setShadows(enabled) {
    this.enableShadows = enabled;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = enabled;
    }
    if (this.directionalLight) {
      this.directionalLight.castShadow = enabled;
    }
  }
  
  /**
   * Focus camera on an object
   */
  focusOnObject(object, paddingMultiplier = 1.0) {
    if (!object || !this.camera || !this.controls) return;
    
    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // Calculate distance based on object size
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * paddingMultiplier * 2;
    
    // Set camera position
    this.camera.position.copy(center);
    this.camera.position.z += distance;
    
    // Set controls target
    this.controls.target.copy(center);
    this.controls.update();
  }
  
  /**
   * Load table (placeholder - to be implemented)
   */
  async loadTable() {
    console.warn('[SceneSetup] loadTable method not implemented');
    return false;
  }
  
  /**
   * Set table visibility (placeholder - to be implemented)
   */
  setTableVisible(visible) {
    console.warn('[SceneSetup] setTableVisible method not implemented');
  }
  
  /**
   * Load an environment object
   */
  async loadEnvironmentObject(config) {
    const {
      path,
      position = { x: 0, y: 0, z: 0 },
      rotation = { x: 0, y: 0, z: 0 },
      scale = { x: 1, y: 1, z: 1 },
      physics = true,
      mass = 1,
      material = null
    } = config;
    
    const extension = path.split('.').pop().toLowerCase();
    const id = config.id || `env_object_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      let object;
      
      switch (extension) {
        case 'gltf':
        case 'glb':
          const gltf = await this.objectLoaders.gltf.loadAsync(path);
          object = gltf.scene;
          break;
          
        case 'stl':
          const geometry = await this.objectLoaders.stl.loadAsync(path);
          const stlMaterial = material || this.defaultMaterial;
          object = new THREE.Mesh(geometry, stlMaterial);
          break;
          
        case 'obj':
          object = await this.objectLoaders.obj.loadAsync(path);
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
      
      // Enable shadows
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // Add to scene
      this.scene.add(object);
      this.environmentObjects.set(id, object);
      
      // Add physics if enabled
      if (physics && this.world) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        
        const shape = new CANNON.Box(
          new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)
        );
        
        const body = new CANNON.Body({
          mass: mass,
          shape: shape,
          position: new CANNON.Vec3(position.x, position.y, position.z),
          material: this.objectMaterial
        });
        
        this.world.addBody(body);
        this.physicsBodies.set(id, body);
      }
      
      EventBus.emit('scene:object-loaded', { id, object, config });
      
      return { id, object };
      
    } catch (error) {
      console.error(`Failed to load environment object: ${path}`, error);
      throw error;
    }
  }
  
  /**
   * Load multiple environment objects
   */
  async loadEnvironmentObjects(objectConfigs, options = {}) {
    const { layout = 'none', spacing = 2, centerOffset = { x: 0, y: 0, z: 0 } } = options;
    const results = [];
    
    for (let i = 0; i < objectConfigs.length; i++) {
      const config = { ...objectConfigs[i] };
      
      // Apply layout if specified
      if (layout !== 'none' && !config.position) {
        const radius = spacing * Math.sqrt(objectConfigs.length);
        
        switch (layout) {
          case 'circle':
            const angle = (i / objectConfigs.length) * Math.PI * 2;
            config.position = {
              x: centerOffset.x + Math.cos(angle) * radius,
              y: centerOffset.y,
              z: centerOffset.z + Math.sin(angle) * radius
            };
            break;
          case 'grid':
            const cols = Math.ceil(Math.sqrt(objectConfigs.length));
            const row = Math.floor(i / cols);
            const col = i % cols;
            config.position = {
              x: centerOffset.x + (col - cols / 2) * spacing,
              y: centerOffset.y,
              z: centerOffset.z + (row - cols / 2) * spacing
            };
            break;
          case 'random':
            config.position = {
              x: centerOffset.x + (Math.random() - 0.5) * radius * 2,
              y: centerOffset.y,
              z: centerOffset.z + (Math.random() - 0.5) * radius * 2
            };
            break;
        }
      }
      
      try {
        const object = await this.loadEnvironmentObject(config);
        results.push(object);
      } catch (error) {
        console.error(`Failed to load object: ${config.path}`, error);
      }
    }
    
    return results;
  }

  /**
   * Remove an environment object
   */
  removeEnvironmentObject(id) {
    const object = this.environmentObjects.get(id);
    if (object) {
      // Remove physics body
      const body = this.physicsBodies.get(id);
      if (body) {
        this.world.removeBody(body);
        this.physicsBodies.delete(id);
      }
      
      // Remove from scene
      this.scene.remove(object);
      
      // Dispose of resources
      object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      
      this.environmentObjects.delete(id);
      
      EventBus.emit('scene:object-removed', { id });
    }
  }
  
  /**
   * Clear all environment objects
   */
  clearEnvironmentObjects() {
    const ids = Array.from(this.environmentObjects.keys());
    ids.forEach(id => this.removeEnvironmentObject(id));
  }
  
  /**
   * Get environment object by ID
   */
  getEnvironmentObject(id) {
    return this.environmentObjects.get(id);
  }
  
  /**
   * Get all environment objects
   */
  getAllEnvironmentObjects() {
    return Array.from(this.environmentObjects.entries()).map(([id, object]) => ({
      id,
      object
    }));
  }
  
  /**
   * Update environment object transform
   */
  updateEnvironmentObject(id, updates) {
    const object = this.environmentObjects.get(id);
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
    
    // Update physics body if exists
    const body = this.physicsBodies.get(id);
    if (body && updates.position) {
      body.position.set(
        updates.position.x ?? body.position.x,
        updates.position.y ?? body.position.y,
        updates.position.z ?? body.position.z
      );
    }
    
    EventBus.emit('scene:object-updated', { id, updates });
  }
  
  /**
   * Dispose of all resources
   */
  dispose() {
    // Clear environment objects
    this.clearEnvironmentObjects();
    
    // Dispose of renderer
    this.renderer.dispose();
    
    // Remove from container
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Clear physics
    if (this.world) {
      while (this.world.bodies.length > 0) {
        this.world.removeBody(this.world.bodies[0]);
      }
    }
  }
}

export default SceneSetup;