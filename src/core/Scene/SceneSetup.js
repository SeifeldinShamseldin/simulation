import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as CANNON from 'cannon-es';
import { createStandardGrids } from '../../utils/threeHelpers';
import EventBus from '../../utils/EventBus';

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  groundSize: 40,
  upAxis: '+Z'
};

/**
 * Class for setting up and managing a Three.js scene for URDF viewing
 */
class SceneSetup {
    /**
     * Create a SceneSetup instance
     * @param {Object} [options] - Configuration options
     * @param {HTMLElement} [options.container] - Container element for the renderer
     * @param {string} [options.backgroundColor] - Background color
     * @param {boolean} [options.enableShadows] - Whether to enable shadows
     * @param {string} [options.ambientColor] - Ambient light color
     */
    constructor(options = {}) {
        this.container = options.container || document.body;
        this.backgroundColor = options.backgroundColor || DEFAULT_CONFIG.backgroundColor;
        this.enableShadows = options.enableShadows ?? DEFAULT_CONFIG.enableShadows;
        this.ambientColor = options.ambientColor || DEFAULT_CONFIG.ambientColor;
        this.groundSize = options.groundSize || DEFAULT_CONFIG.groundSize;
        this.upAxis = options.upAxis || DEFAULT_CONFIG.upAxis;
        
        // Dynamic environment system
        this.environmentObjects = new Map(); // Store all dynamic objects
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
        this.initPhysics(); // Initialize physics before ground
        this.initGround();
        
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
        this.robotRoot = new THREE.Object3D();
        this.scene.add(this.robotRoot);
        // Use utility for grid and axes
        const { grid, axes } = createStandardGrids(this.scene, { gridSize: 10, gridDivisions: 20, addAxes: true, axesSize: 1 });
        this.gridHelper = grid;
        this.axesHelper = axes;
    }
    
    /**
     * Initialize the camera
     */
    initCamera() {
        // Use wider FOV to see more of the robot
        this.camera = new THREE.PerspectiveCamera(
            60,                 // Wider field of view
            1,                  // Aspect ratio (will be updated)
            0.01,               // Near clipping plane - closer to see details
            1000                // Far clipping plane
        );
        this.camera.position.set(2, 2, 2);
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * Initialize the renderer
     */
    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        
        this.renderer.setClearColor(0xffffff, 0);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Configure shadows
        if (this.enableShadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    
    /**
     * Initialize lights
     */
    initLights() {
        // Ambient light - softer intensity for KUKA-like lighting
        this.ambientLight = new THREE.HemisphereLight(
            this.ambientColor || '#ffffff',     // Sky color
            '#000000',                          // Ground color  
            0.5                                 // Reduced intensity for softer ambient
        );
        this.ambientLight.groundColor.lerp(this.ambientLight.color, 0.3);
        this.ambientLight.position.set(0, 1, 0);
        this.scene.add(this.ambientLight);
        
        // Main directional light (sun) - KUKA-like intensity
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(3, 8, 3);
        
        if (this.enableShadows) {
            this.directionalLight.castShadow = true;
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            this.directionalLight.shadow.normalBias = 0.001;
            
            // Configure shadow camera for KUKA-like shadows
            const shadowCam = this.directionalLight.shadow.camera;
            shadowCam.left = shadowCam.bottom = -4;
            shadowCam.right = shadowCam.top = 4;
            shadowCam.near = 0.5;
            shadowCam.far = 100;
        }
        
        this.scene.add(this.directionalLight);
        
        // Create a target for the directional light
        this.directionalLight.target = new THREE.Object3D();
        this.scene.add(this.directionalLight.target);

        // Add a fill light from the opposite direction
        this.fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        this.fillLight.position.set(-3, 4, -3);
        this.scene.add(this.fillLight);

        // Add a rim light for KUKA-like edge highlighting
        this.rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
        this.rimLight.position.set(0, 4, -5);
        this.scene.add(this.rimLight);

        // Add a bottom fill light for KUKA-like under-illumination
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
    }
    
    /**
     * Initialize ground plane with physics
     */
    initGround() {
        // Visual ground
        const planeGeometry = new THREE.PlaneGeometry(
            this.groundSize, 
            this.groundSize
        );
        
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            roughness: 0.7,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        this.ground = new THREE.Mesh(planeGeometry, planeMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = 0;
        this.ground.receiveShadow = this.enableShadows;
        this.ground.castShadow = false;
        
        // Store original opacity
        this.ground.userData.defaultOpacity = 0.8;
        
        this.scene.add(this.ground);
        
        // Physics ground
        const groundShape = new CANNON.Box(
            new CANNON.Vec3(
                this.groundSize / 2,
                0.1, // Very thin but solid
                this.groundSize / 2
            )
        );
        
        this.groundBody = new CANNON.Body({
            mass: 0, // Static body
            shape: groundShape,
            material: this.groundMaterial,
            position: new CANNON.Vec3(0, -0.1, 0)
        });
        
        this.world.addBody(this.groundBody);
        
        // Grid helper
        this.gridHelper = new THREE.GridHelper(
            this.groundSize, 
            this.groundSize, 
            0x888888, 
            0xdddddd
        );
        this.gridHelper.position.y = 0.002;
        this.scene.add(this.gridHelper);
    }
    
    /**
     * Set ground transparency
     * @param {number} opacity - Opacity value (0-1)
     */
    setGroundOpacity(opacity) {
        if (this.ground && this.ground.material) {
            this.ground.material.opacity = opacity;
            this.ground.material.transparent = opacity < 1;
            
            // Update grid visibility
            if (this.gridHelper) {
                this.gridHelper.visible = opacity > 0.1;
            }
        }
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
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    /**
     * Set the scene's coordinate system orientation
     * @param {string} up - The up direction (e.g., '+Z', '-Y')
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
        
        // Important: recenter the robot after changing the axis
        const robot = this.robotRoot.children.find(child => child.isURDFRobot);
        if (robot) {
            // Delay the focus to allow rotation to complete
            setTimeout(() => this.focusOnObject(robot), 100);
        }
    }
    
    /**
     * Focus the camera on a specific object
     * @param {THREE.Object3D} object - The object to focus on
     * @param {number} [padding] - Extra padding around the object
     */
    focusOnObject(object, padding = 1.2) {
        if (!object) return;
        
        // Create a bounding box
        const bbox = new THREE.Box3();
        bbox.makeEmpty();
        
        // Only include visual elements in the bounding box
        object.traverse(c => {
            if (c.isURDFVisual && c.children.length > 0) {
                bbox.expandByObject(c);
            }
        });
        
        // Check if bounding box is valid
        const size = bbox.getSize(new THREE.Vector3());
        if (size.length() < 0.001) {
            console.warn('Object has no visible geometry');
            return;
        }
        
        const center = bbox.getCenter(new THREE.Vector3());
        
        // Set controls target to center of object
        this.controls.target.copy(center);
        
        // Calculate camera position to frame the object nicely
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        
        // Calculate camera distance
        let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
        cameraDistance *= padding;
        
        // Use a better camera angle
        const direction = new THREE.Vector3(0.5, 0.3, 1).normalize();
        this.camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
        
        // Update controls
        this.controls.update();
        
        // Update directional light to match camera position
        const sphere = bbox.getBoundingSphere(new THREE.Sphere());
        const lightDistance = sphere.radius * 2;
        this.directionalLight.position.copy(center).add(
            new THREE.Vector3(1, 2, 1).normalize().multiplyScalar(lightDistance)
        );
        this.directionalLight.target.position.copy(center);
        
        // Update shadow camera
        if (this.enableShadows) {
            const shadowCam = this.directionalLight.shadow.camera;
            const shadowSize = sphere.radius * 1.5;
            shadowCam.left = shadowCam.bottom = -shadowSize;
            shadowCam.right = shadowCam.top = shadowSize;
            shadowCam.updateProjectionMatrix();
        }
        
        // Update ground position
        if (this.ground) {
            this.ground.position.y = bbox.min.y - 0.001;
        }
        
        // Emit event for other components
        EventBus.emit('scene:focus-changed', {
            targetId: object.userData?.id || object.name,
            position: center.toArray(),
            bounds: {
                min: bbox.min.toArray(),
                max: bbox.max.toArray()
            },
            cameraDistance
        });
        
        // Force rendering to update immediately
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Add an object to the scene's robot root
     * @param {THREE.Object3D} object - The object to add
     */
    addRobotObject(object) {
        this.robotRoot.add(object);
        this.focusOnObject(object);
    }
    
    /**
     * Clear all objects from the robot root
     */
    clearRobot() {
        while (this.robotRoot.children.length > 0) {
            const child = this.robotRoot.children[0];
            this.robotRoot.remove(child);
            
            // Dispose of resources if possible
            if (child.dispose) {
                child.dispose();
            } else if (child.geometry || child.material) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        }
    }
    
    /**
     * Dispose of scene resources
     */
    dispose() {
        // Remove event listener
        window.removeEventListener('resize', this.handleResize);
        
        // Dispose of controls
        if (this.controls) {
            this.controls.dispose();
        }
        
        // Clear the scene
        this.clearRobot();
        
        // Dispose of scene objects
        this.scene.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => disposeMaterial(material));
                } else {
                    disposeMaterial(object.material);
                }
            }
        });
        
        // Dispose of materials
        function disposeMaterial(material) {
            if (material.map) material.map.dispose();
            if (material.lightMap) material.lightMap.dispose();
            if (material.bumpMap) material.bumpMap.dispose();
            if (material.normalMap) material.normalMap.dispose();
            if (material.specularMap) material.specularMap.dispose();
            if (material.envMap) material.envMap.dispose();
            material.dispose();
        }
        
        // Dispose of renderer
        this.renderer.dispose();
        
        // Remove renderer from DOM
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }

    /**
     * Initialize all supported loaders
     */
    initializeLoaders() {
        return {
            'dae': new ColladaLoader(),
            'stl': new STLLoader(),
            'obj': new OBJLoader(),
            'fbx': new FBXLoader(),
            'gltf': new GLTFLoader(),
            'glb': new GLTFLoader(),
            'ply': new PLYLoader()
        };
    }

    /**
     * Calculate smart position and orientation for environment objects
     * @param {Object} config - Object configuration
     * @returns {Object} Updated config with smart positioning
     */
    calculateSmartPlacement(config) {
        const robot = this.robotRoot.children.find(child => child.isURDFRobot);
        const robotBounds = new THREE.Box3();
        const robotCenter = new THREE.Vector3();
        let robotRadius = 1; // Default if no robot
        let groundY = 0; // Ground level
        
        // Find ground plane
        if (this.ground) {
            groundY = this.ground.position.y + 0.01; // Slightly above ground
        }
        
        if (robot) {
            robotBounds.setFromObject(robot);
            robotBounds.getCenter(robotCenter);
            robotRadius = robotBounds.getSize(new THREE.Vector3()).length() / 2;
            
            // Make sure robot center is at ground level for calculations
            robotCenter.y = groundY;
        }
        
        // Smart positioning based on object type
        const smartPlacements = {
            'furniture': {
                distance: robotRadius + 1.5,
                heightOffset: 0, // Will be adjusted based on object bounds
                angleOffset: Math.PI, // Behind robot
                alignToGrid: true
            },
            'industrial': {
                distance: robotRadius + 2,
                heightOffset: 0,
                angleOffset: Math.PI / 2, // Side of robot
                alignToGrid: true
            },
            'storage': {
                distance: robotRadius + 2.5,
                heightOffset: 0,
                angleOffset: -Math.PI / 2, // Other side
                alignToGrid: true
            },
            'safety': {
                distance: robotRadius + 3,
                heightOffset: 0,
                angleOffset: 0, // In front
                alignToGrid: false,
                createPerimeter: true
            },
            'controls': {
                distance: robotRadius + 2,
                heightOffset: 0.8, // Control panels elevated
                angleOffset: Math.PI / 4, // Diagonal
                alignToGrid: true
            }
        };
        
        const placement = smartPlacements[config.category] || {
            distance: robotRadius + 2,
            heightOffset: 0,
            angleOffset: 0,
            alignToGrid: true
        };
        
        // Calculate position based on existing objects
        const existingObjects = Array.from(this.environmentObjects.values());
        let angle = placement.angleOffset;
        let attempts = 0;
        let position = new THREE.Vector3();
        let foundValidPosition = false;
        
        // Find non-overlapping position
        while (attempts < 16 && !foundValidPosition) {
            position.set(
                robotCenter.x + Math.cos(angle) * placement.distance,
                groundY + placement.heightOffset, // Start at ground level
                robotCenter.z + Math.sin(angle) * placement.distance
            );
            
            // Check for overlaps with existing objects
            let overlap = false;
            for (const obj of existingObjects) {
                if (!obj.geometry) {
                    // Calculate bounding box for objects
                    const objBounds = new THREE.Box3().setFromObject(obj);
                    const objSize = objBounds.getSize(new THREE.Vector3());
                    const objCenter = objBounds.getCenter(new THREE.Vector3());
                    
                    // Check 2D distance (ignore Y for now)
                    const distance2D = Math.sqrt(
                        Math.pow(position.x - objCenter.x, 2) + 
                        Math.pow(position.z - objCenter.z, 2)
                    );
                    
                    // Minimum spacing based on object sizes
                    const minSpacing = Math.max(objSize.x, objSize.z) / 2 + 1.5;
                    
                    if (distance2D < minSpacing) {
                        overlap = true;
                        break;
                    }
                }
            }
            
            if (!overlap) {
                foundValidPosition = true;
            } else {
                // Try different angle
                angle += Math.PI / 8; // Try every 22.5 degrees
                attempts++;
                
                // After trying all angles, increase distance
                if (attempts % 16 === 0) {
                    placement.distance += 1;
                }
            }
        }
        
        // Align to grid if needed
        if (placement.alignToGrid) {
            const gridSize = 0.5;
            position.x = Math.round(position.x / gridSize) * gridSize;
            position.z = Math.round(position.z / gridSize) * gridSize;
        }
        
        // Calculate rotation to face robot
        const lookDirection = new THREE.Vector3()
            .subVectors(robotCenter, position)
            .normalize();
        const rotationY = Math.atan2(lookDirection.x, lookDirection.z);
        
        // Special cases for certain objects
        let rotation = { x: 0, y: rotationY, z: 0 };
        
        if (config.category === 'safety') {
            // Safety fences should be perpendicular to robot
            rotation.y = rotationY + Math.PI / 2;
        } else if (config.category === 'industrial') {
            // Conveyors should be tangential
            rotation.y = rotationY + Math.PI / 2;
        }
        
        // Return updated config
        return {
            ...config,
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            rotation: rotation,
            needsGroundAdjustment: true // Flag to adjust after loading
        };
    }
    
    /**
     * Enhanced loadEnvironmentObject with smart placement and ground detection
     */
    async loadEnvironmentObject(config) {
        // Apply smart placement if position not explicitly set
        if (!config.position || (config.position.x === 0 && config.position.z === 0)) {
            config = this.calculateSmartPlacement(config);
        }
        
        const {
            path,
            id = `env_object_${Date.now()}`,
            position = { x: 0, y: 0, z: 0 },
            rotation = { x: 0, y: 0, z: 0 },
            scale = { x: 1, y: 1, z: 1 },
            material = null,
            castShadow = true,
            receiveShadow = true,
            isDynamic = false // Whether object should have physics
        } = config;
        
        // Determine file type
        const extension = path.split('.').pop().toLowerCase();
        const loader = this.objectLoaders[extension];
        
        if (!loader) {
            throw new Error(`Unsupported file format: ${extension}`);
        }
        
        return new Promise((resolve, reject) => {
            const loadHandler = (result) => {
                let object;
                
                // Handle different loader return types
                if (extension === 'stl' || extension === 'ply') {
                    const geometry = result;
                    const mat = material ? this.createMaterial(material) : this.defaultMaterial.clone();
                    object = new THREE.Mesh(geometry, mat);
                } else if (extension === 'gltf' || extension === 'glb') {
                    object = result.scene;
                } else {
                    object = result.scene || result;
                }
                
                // Apply transformations
                object.position.set(position.x, position.y, position.z);
                object.rotation.set(rotation.x, rotation.y, rotation.z);
                object.scale.set(scale.x, scale.y, scale.z);
                
                // Adjust height based on object bounds if needed
                if (config.needsGroundAdjustment) {
                    // Wait for object to be added to scene to calculate bounds
                    setTimeout(() => {
                        const bounds = new THREE.Box3().setFromObject(object);
                        const size = bounds.getSize(new THREE.Vector3());
                        const center = bounds.getCenter(new THREE.Vector3());
                        
                        // Calculate how much to lift the object
                        const bottomY = center.y - size.y / 2;
                        const groundY = this.ground ? this.ground.position.y : 0;
                        const adjustment = groundY - bottomY + 0.01; // Small gap above ground
                        
                        // Adjust position
                        object.position.y += adjustment;
                        
                        // Update bounds for future collision checks
                        object.userData.bounds = bounds;
                        object.userData.size = size;
                    }, 100);
                }
                
                // Apply material if specified
                if (material && (extension !== 'stl' && extension !== 'ply')) {
                    const mat = this.createMaterial(material);
                    object.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.material = mat;
                        }
                    });
                }
                
                // Apply shadow settings
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = castShadow;
                        child.receiveShadow = receiveShadow;
                    }
                });
                
                // Store the object
                object.userData.environmentId = id;
                object.userData.category = config.category;
                this.environmentObjects.set(id, object);
                
                // Add to scene
                this.scene.add(object);
                
                // Emit object added event
                EventBus.emit('scene:object-added', {
                    objectId: id,
                    type: 'environment',
                    category: config.category,
                    position: object.position.toArray()
                });
                
                // After object is created and added to scene
                setTimeout(() => {
                    // Calculate bounds
                    const bounds = new THREE.Box3().setFromObject(object);
                    const size = bounds.getSize(new THREE.Vector3());
                    const center = bounds.getCenter(new THREE.Vector3());
                    
                    // Create physics body
                    const halfExtents = new CANNON.Vec3(
                        size.x / 2,
                        size.y / 2,
                        size.z / 2
                    );
                    
                    const boxShape = new CANNON.Box(halfExtents);
                    
                    // Calculate proper position (center of bounds)
                    const bodyPosition = new CANNON.Vec3(
                        center.x,
                        center.y,
                        center.z
                    );
                    
                    // Ensure object is above ground
                    if (bodyPosition.y - halfExtents.y < 0) {
                        bodyPosition.y = halfExtents.y + 0.01;
                        object.position.y = bodyPosition.y;
                    }
                    
                    const body = new CANNON.Body({
                        mass: isDynamic ? 10 : 0, // Static by default
                        shape: boxShape,
                        material: this.objectMaterial,
                        position: bodyPosition
                    });
                    
                    // Apply rotation
                    const euler = new CANNON.Vec3(rotation.x, rotation.y, rotation.z);
                    body.quaternion.setFromEuler(euler.x, euler.y, euler.z);
                    
                    this.world.addBody(body);
                    this.physicsBodies.set(id, body);
                    
                    // Store physics reference
                    object.userData.physicsBody = body;
                    
                }, 100);
                
                resolve(object);
            };
            
            // Load the file
            loader.load(path, loadHandler, undefined, reject);
        });
    }

    /**
     * Create material from configuration
     * @param {Object} config - Material configuration
     * @returns {THREE.Material} The created material
     */
    createMaterial(config) {
        const {
            type = 'phong',
            color = 0x888888,
            metalness = 0.5,
            roughness = 0.5,
            transparent = false,
            opacity = 1.0,
            emissive = 0x000000,
            shininess = 100,
            specular = 0x111111
        } = config;
        
        let material;
        
        switch (type) {
            case 'standard':
                material = new THREE.MeshStandardMaterial({
                    color, metalness, roughness, transparent, opacity, emissive
                });
                break;
            case 'physical':
                material = new THREE.MeshPhysicalMaterial({
                    color, metalness, roughness, transparent, opacity, emissive
                });
                break;
            case 'basic':
                material = new THREE.MeshBasicMaterial({
                    color, transparent, opacity
                });
                break;
            default:
                material = new THREE.MeshPhongMaterial({
                    color, shininess, specular, transparent, opacity, emissive
                });
        }
        
        return material;
    }

    /**
     * Arrange objects dynamically around the robot
     * @param {Array<Object>} objectConfigs - Array of object configurations
     * @param {Object} options - Arrangement options
     */
    async loadEnvironmentPreset(objectConfigs, options = {}) {
        const {
            arrangement = 'circle', // 'circle', 'grid', 'random'
            radius = 3,
            centerOffset = { x: 0, y: 0, z: 0 }
        } = options;
        
        const results = [];
        
        for (let i = 0; i < objectConfigs.length; i++) {
            const config = { ...objectConfigs[i] };
            
            // Calculate position based on arrangement
            if (!config.position) {
                switch (arrangement) {
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
                            x: centerOffset.x + (col - cols / 2) * 2,
                            y: centerOffset.y,
                            z: centerOffset.z + (row - cols / 2) * 2
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
     * @param {string} id - The object's unique identifier
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
            
            // Remove visual object
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
            
            // Emit object removed event
            EventBus.emit('scene:object-removed', {
                objectId: id,
                type: 'environment'
            });
        }
    }

    /**
     * Remove all environment objects
     */
    clearEnvironment() {
        this.environmentObjects.forEach((object, id) => {
            this.removeEnvironmentObject(id);
        });
    }

    /**
     * Get all environment objects
     * @returns {Map} Map of all environment objects
     */
    getEnvironmentObjects() {
        return new Map(this.environmentObjects);
    }

    /**
     * Update an environment object's properties
     * @param {string} id - The object's unique identifier
     * @param {Object} updates - Properties to update
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
        
        if (updates.visible !== undefined) {
            object.visible = updates.visible;
        }
    }

    /**
     * Load and add table to the scene
     * @param {string} modelPath - Path to the table model
     * @returns {Promise<THREE.Object3D>} The loaded table object
     */
    async loadTable(modelPath = '/objects/table/complete_table.dae') {
        // Backward compatibility wrapper
        return this.loadEnvironmentObject({
            path: modelPath,
            id: 'table',
            position: { x: 0, y: 0, z: 0 },
            material: {
                color: 0x8e9fa3,
                shininess: 100,
                specular: 0x222222
            }
        });
    }

    /**
     * Show or hide the table
     * @param {boolean} visible - Whether to show the table
     */
    setTableVisible(visible) {
        // Backward compatibility wrapper
        this.updateEnvironmentObject('table', { visible });
    }

    /**
     * Remove table from scene
     */
    removeTable() {
        // Backward compatibility wrapper
        this.removeEnvironmentObject('table');
    }
}

export default SceneSetup;