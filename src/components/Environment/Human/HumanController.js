import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import EventBus from '../../../utils/EventBus';

class HumanController {
  constructor() {
    this.model = null;
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    this.scene = null;
    this.world = null;
    this.body = null;
    
    // Movement state
    this.moveDirection = new THREE.Vector3();
    this.rotateAngle = new THREE.Vector3(0, 1, 0);
    this.rotateQuaternion = new THREE.Quaternion();
    this.cameraTarget = new THREE.Vector3();
    
    // Movement settings
    this.walkSpeed = 4;
    this.runSpeed = 8;
    this.currentSpeed = this.walkSpeed;
    this.isRunning = false;
    
    // Input state
    this.keysPressed = {};
    
    // Temporary vectors
    this.tempVector = new THREE.Vector3();
    this.upVector = new THREE.Vector3(0, 1, 0);
    
    // Animation frame
    this.animationId = null;
  }
  
  async initialize(scene, world) {
    this.scene = scene;
    this.world = world;
    
    try {
      // Load human model
      await this.loadModel();
      
      // Set up physics
      this.setupPhysics();
      
      // Add event listeners
      this.addEventListeners();
      
      // Start update loop
      this.startUpdateLoop();
      
      // Emit ready event
      EventBus.emit('human:ready', {
        position: this.model.position.toArray(),
        id: 'player_human'
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize human controller:', error);
      EventBus.emit('human:error', { message: error.message });
      return false;
    }
  }
  
  async loadModel() {
    const loader = new GLTFLoader();
    
    // Use your local Soldier.glb file
    const modelPath = '../../../../public/hazard/human/Soldier.glb';
    
    try {
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          modelPath,
          (loaded) => resolve(loaded),
          (progress) => {
            EventBus.emit('human:loading-progress', {
              loaded: progress.loaded,
              total: progress.total
            });
          },
          (error) => reject(error)
        );
      });
      
      this.model = gltf.scene;
      
      // Scale the model appropriately
      this.model.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
      
      // Fix materials and ensure visibility
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Ensure materials are visible
          if (child.material) {
            // Force material to be visible
            child.material.visible = true;
            child.material.side = THREE.DoubleSide;
            
            // Fix common material issues
            if (child.material.map) {
              child.material.map.encoding = THREE.sRGBEncoding;
            }
            
            // Ensure proper lighting response
            if (child.material.isMeshStandardMaterial || child.material.isMeshPhongMaterial) {
              child.material.needsUpdate = true;
            }
          }
        }
      });
      
      // Set initial position above ground
      this.model.position.set(0, 0, 2);
      
      // Add to scene
      this.scene.add(this.model);
      
      // Set up animations
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model);
        
        // Map animations by name
        gltf.animations.forEach((clip) => {
          const action = this.mixer.clipAction(clip);
          // Try to identify animation type by name
          const clipName = clip.name.toLowerCase();
          if (clipName.includes('idle')) {
            this.animations.idle = action;
          } else if (clipName.includes('walk')) {
            this.animations.walk = action;
          } else if (clipName.includes('run')) {
            this.animations.run = action;
          } else {
            // Store by original name as fallback
            this.animations[clipName] = action;
          }
        });
        
        // Play first animation or idle
        const firstAnimation = this.animations.idle || Object.values(this.animations)[0];
        if (firstAnimation) {
          this.currentAction = firstAnimation;
          this.currentAction.play();
        }
      }
      
      console.log('Human model loaded successfully');
      
    } catch (error) {
      console.error('Failed to load human model:', error);
      throw error;
    }
  }
  
  setupPhysics() {
    // Create physics body for the human
    const shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.5, 0.25));
    this.body = new CANNON.Body({
      mass: 70, // 70kg human
      shape: shape,
      fixedRotation: true, // Prevent tipping
      linearDamping: 0.95,
      position: new CANNON.Vec3(
        this.model.position.x,
        this.model.position.y + 0.5,
        this.model.position.z
      )
    });
    
    // Add to physics world
    this.world.addBody(this.body);
  }
  
  addEventListeners() {
    // Bind methods using arrow functions to preserve context
    this.handleKeyDown = (event) => {
      if (event.repeat) return;
      
      const key = event.key.toLowerCase();
      this.keysPressed[key] = true;
      
      // Running
      if (key === 'shift') {
        this.isRunning = true;
        this.currentSpeed = this.runSpeed;
      }
      
      // Emit movement start
      if (['w', 'a', 's', 'd'].includes(key)) {
        EventBus.emit('human:movement-start', { key });
      }
    };
    
    this.handleKeyUp = (event) => {
      const key = event.key.toLowerCase();
      this.keysPressed[key] = false;
      
      // Stop running
      if (key === 'shift') {
        this.isRunning = false;
        this.currentSpeed = this.walkSpeed;
      }
      
      // Check if all movement keys are released
      if (!this.keysPressed.w && !this.keysPressed.a && 
          !this.keysPressed.s && !this.keysPressed.d) {
        EventBus.emit('human:movement-stop');
        this.playAnimation('idle');
      }
    };
    
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    
    // Listen for external commands
    EventBus.on('human:move-to', (data) => {
      this.moveToPosition(data.position);
    });
    
    EventBus.on('human:set-animation', (data) => {
      this.playAnimation(data.animation);
    });
    
    EventBus.on('human:teleport', (data) => {
      this.teleport(data.position);
    });
  }
  
  updateMovement(deltaTime) {
    if (!this.model || !this.body) return;
    
    // Reset movement direction
    this.moveDirection.set(0, 0, 0);
    
    // Calculate movement direction based on keys
    if (this.keysPressed.w) this.moveDirection.z -= 1;
    if (this.keysPressed.s) this.moveDirection.z += 1;
    if (this.keysPressed.a) this.moveDirection.x -= 1;
    if (this.keysPressed.d) this.moveDirection.x += 1;
    
    // Normalize and apply speed
    if (this.moveDirection.length() > 0) {
      this.moveDirection.normalize();
      this.moveDirection.multiplyScalar(this.currentSpeed);
      
      // Play appropriate animation
      this.playAnimation(this.isRunning ? 'run' : 'walk');
      
      // Rotate model to face movement direction
      if (this.moveDirection.x !== 0 || this.moveDirection.z !== 0) {
        const angle = Math.atan2(this.moveDirection.x, -this.moveDirection.z);
        this.rotateQuaternion.setFromAxisAngle(this.upVector, angle);
        this.model.quaternion.slerp(this.rotateQuaternion, 0.1);
      }
    }
    
    // Apply movement to physics body
    this.body.velocity.x = this.moveDirection.x;
    this.body.velocity.z = this.moveDirection.z;
    
    // Sync model position with physics body
    this.model.position.copy(this.body.position);
    
    // Emit position update
    EventBus.emitThrottled('human:position-update', {
      position: this.model.position.toArray(),
      rotation: this.model.rotation.y,
      velocity: this.moveDirection.toArray(),
      isRunning: this.isRunning
    }, 50);
  }
  
  playAnimation(name) {
    if (!this.mixer || !this.animations[name]) {
      // If specific animation doesn't exist, try to keep current
      if (!this.animations[name] && this.currentAction) {
        return;
      }
    }
    
    const newAction = this.animations[name];
    
    if (newAction && newAction !== this.currentAction) {
      if (this.currentAction) {
        this.currentAction.fadeOut(0.2);
      }
      
      newAction.reset().fadeIn(0.2).play();
      this.currentAction = newAction;
      
      EventBus.emit('human:animation-change', { animation: name });
    }
  }
  
  moveToPosition(targetPosition) {
    if (!this.model || !this.body) return;
    
    // Simple move to position
    const direction = new THREE.Vector3()
      .subVectors(targetPosition, this.model.position)
      .normalize();
    
    this.body.velocity.x = direction.x * this.currentSpeed;
    this.body.velocity.z = direction.z * this.currentSpeed;
  }
  
  teleport(position) {
    if (!this.model || !this.body) return;
    
    this.body.position.set(position.x, position.y + 0.5, position.z);
    this.body.velocity.set(0, 0, 0);
    this.model.position.copy(position);
    
    EventBus.emit('human:teleported', { position });
  }
  
  startUpdateLoop() {
    const clock = new THREE.Clock();
    
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      
      // Update movement
      this.updateMovement(deltaTime);
      
      // Update animations
      if (this.mixer) {
        this.mixer.update(deltaTime);
      }
    };
    
    animate();
  }
  
  getPosition() {
    return this.model ? this.model.position.clone() : new THREE.Vector3();
  }
  
  getInfo() {
    return {
      position: this.model ? this.model.position.toArray() : [0, 0, 0],
      rotation: this.model ? this.model.rotation.y : 0,
      isRunning: this.isRunning,
      currentAnimation: this.currentAction ? this.currentAction.getClip().name : 'none'
    };
  }
  
  dispose() {
    // Stop update loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    
    // Remove from scene
    if (this.model && this.scene) {
      this.scene.remove(this.model);
    }
    
    // Remove physics body
    if (this.body && this.world) {
      this.world.removeBody(this.body);
    }
    
    // Clean up
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    
    EventBus.emit('human:disposed');
  }
}

// Create singleton instance
const humanController = new HumanController();
export default humanController;