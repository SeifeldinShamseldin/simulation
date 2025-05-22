import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLOBAL_CONFIG } from '../../utils/GlobalVariables';

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
        this.backgroundColor = options.backgroundColor || GLOBAL_CONFIG.backgroundColor || '#f5f5f5';
        this.enableShadows = options.enableShadows !== undefined ? options.enableShadows : 
                            (GLOBAL_CONFIG.enableShadows !== undefined ? GLOBAL_CONFIG.enableShadows : true);
        this.ambientColor = options.ambientColor || GLOBAL_CONFIG.ambientColor || '#8ea0a8';
        
        // Initialize scene components
        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initLights();
        this.initControls();
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
        
        // Add a subtle fog for depth perception
        this.scene.fog = new THREE.FogExp2(this.backgroundColor || '#f0f0f0', 0.02);
        
        // Create a root object for the robot
        this.robotRoot = new THREE.Object3D();
        this.scene.add(this.robotRoot);
        
        // Add grid helper immediately to ensure it's visible
        this.gridHelper = new THREE.GridHelper(10, 20, 0x888888, 0xcccccc);
        this.scene.add(this.gridHelper);
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
        // Ambient light
        this.ambientLight = new THREE.HemisphereLight(
            this.ambientColor,     // Sky color
            '#000',                // Ground color
            0.5                    // Intensity
        );
        this.ambientLight.groundColor.lerp(this.ambientLight.color, 0.5);
        this.ambientLight.position.set(0, 1, 0);
        this.scene.add(this.ambientLight);
        
        // Directional light (sun)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        this.directionalLight.position.set(4, 10, 4);
        
        if (this.enableShadows) {
            this.directionalLight.castShadow = true;
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            this.directionalLight.shadow.normalBias = 0.001;
            
            // Configure shadow camera
            const shadowCam = this.directionalLight.shadow.camera;
            shadowCam.left = shadowCam.bottom = -5;
            shadowCam.right = shadowCam.top = 5;
            shadowCam.near = 0.5;
            shadowCam.far = 100;
        }
        
        this.scene.add(this.directionalLight);
        
        // Create a target for the directional light
        this.directionalLight.target = new THREE.Object3D();
        this.scene.add(this.directionalLight.target);
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
    }
    
    /**
     * Initialize ground plane
     */
    initGround() {
        // Create a visible ground plane instead of just shadow receiver
        const planeGeometry = new THREE.PlaneGeometry(
            GLOBAL_CONFIG.groundSize || 20, 
            GLOBAL_CONFIG.groundSize || 20
        );
        
        // Use a material with subtle grid texture for better visibility
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            roughness: 0.7,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        this.ground = new THREE.Mesh(planeGeometry, planeMaterial);
        this.ground.rotation.x = -Math.PI / 2;  // Rotate to be horizontal
        this.ground.position.y = -0.01;         // Slightly below the origin to avoid z-fighting
        this.ground.receiveShadow = this.enableShadows;
        this.ground.castShadow = false;
        
        this.scene.add(this.ground);
        
        // Add grid lines on the ground for better orientation
        const gridHelper = new THREE.GridHelper(
            GLOBAL_CONFIG.groundSize || 20, 
            GLOBAL_CONFIG.groundSize || 20, 
            0x888888, 
            0xdddddd
        );
        gridHelper.position.y = 0.002; // Slightly above ground to avoid z-fighting
        this.scene.add(gridHelper);
    }
    
    /**
     * Start the render loop
     */
    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            
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
    focusOnObject(object, padding = 0.5) { // Very small padding to make robot much larger in view
        if (!object) return;
        
        // Create a bounding box
        const bbox = new THREE.Box3().setFromObject(object);
        
        // Check if bounding box is valid
        const size = bbox.getSize(new THREE.Vector3());
        if (size.length() < 0.001) return;
        
        const center = bbox.getCenter(new THREE.Vector3());
        
        // Set controls target to center of object
        this.controls.target.copy(center);
        
        // Calculate camera position to make robot fill most of the screen
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        
        // Calculate minimal camera distance
        let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
        cameraDistance *= padding;
        
        // Use a better camera angle to show robot structure
        // More from front-side and slightly above
        const direction = new THREE.Vector3(1.0, 0.6, 0.8).normalize();
        this.camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
        
        // Update controls
        this.controls.update();
        
        // Update directional light to match camera position
        this.directionalLight.position.copy(center).add(
            new THREE.Vector3(1, 2, 1).normalize().multiplyScalar(cameraDistance * 1.5)
        );
        this.directionalLight.target.position.copy(center);
        
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
}

export default SceneSetup;