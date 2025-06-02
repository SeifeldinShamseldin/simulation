import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import EventBus from '../../utils/EventBus';

class HumanController {
  constructor() {
    this.humans = new Map(); // Store multiple humans
    this.activeHumanId = null; // Currently controlled human
    this.humanCounter = 0; // For generating unique IDs
    
    // Input state
    this.keysPressed = {};
    
    // Shared loader
    this.loader = new GLTFLoader();
    this.modelCache = null; // Cache the loaded model
    
    // Bind event handlers once
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    
    // Add event listeners once
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }
  
  async spawnHuman(scene, world, position = { x: 0, y: 0, z: 2 }) {
    const humanId = `human_${++this.humanCounter}`;
    
    try {
      // Load or clone model
      let model;
      if (this.modelCache) {
        // Clone cached model
        model = this.modelCache.clone();
      } else {
        // First time loading
        const modelPath = '/hazard/human/Soldier.glb';
        const gltf = await new Promise((resolve, reject) => {
          this.loader.load(
            modelPath,
            (loaded) => resolve(loaded),
            (progress) => {
              EventBus.emit('human:loading-progress', {
                loaded: progress.loaded,
                total: progress.total,
                humanId
              });
            },
            (error) => reject(error)
          );
        });
        
        // Cache the scene for future clones
        this.modelCache = gltf.scene;
        model = gltf.scene.clone();
        
        // Store animations if available
        if (gltf.animations && gltf.animations.length > 0) {
          this.cachedAnimations = gltf.animations;
        }
      }
      
      // Configure model
      model.scale.set(0.5, 0.5, 0.5);
      model.position.set(position.x, position.y, position.z);
      
      // Fix materials
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          if (child.material) {
            child.material.visible = true;
            child.material.side = THREE.DoubleSide;
            if (child.material.map) {
              child.material.map.encoding = THREE.sRGBEncoding;
            }
            child.material.needsUpdate = true;
          }
        }
      });
      
      // Add to scene
      scene.add(model);
      
      // Create physics body
      const shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.5, 0.25));
      const body = new CANNON.Body({
        mass: 70,
        shape: shape,
        fixedRotation: true,
        linearDamping: 0.95,
        position: new CANNON.Vec3(position.x, position.y + 0.5, position.z)
      });
      world.addBody(body);
      
      // Set up animations
      let mixer = null;
      let animations = {};
      let currentAction = null;
      
      if (this.cachedAnimations) {
        mixer = new THREE.AnimationMixer(model);
        
        this.cachedAnimations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          const clipName = clip.name.toLowerCase();
          
          if (clipName.includes('idle')) {
            animations.idle = action;
          } else if (clipName.includes('walk')) {
            animations.walk = action;
          } else if (clipName.includes('run')) {
            animations.run = action;
          } else {
            animations[clipName] = action;
          }
        });
        
        // Play idle animation
        const idleAction = animations.idle || Object.values(animations)[0];
        if (idleAction) {
          currentAction = idleAction;
          currentAction.play();
        }
      }
      
      // Create human data object
      const humanData = {
        id: humanId,
        model,
        body,
        mixer,
        animations,
        currentAction,
        scene,
        world,
        isActive: this.humans.size === 0, // First human is active by default
        moveDirection: new THREE.Vector3(),
        rotateQuaternion: new THREE.Quaternion(),
        walkSpeed: 4,
        runSpeed: 8,
        currentSpeed: 4,
        isRunning: false,
        color: this.getHumanColor(this.humans.size) // Assign unique color
      };
      
      // Apply color to distinguish humans
      this.applyHumanColor(model, humanData.color);
      
      // Store human
      this.humans.set(humanId, humanData);
      
      // Set as active if first human
      if (this.humans.size === 1) {
        this.activeHumanId = humanId;
      }
      
      // Start update loop if not already running
      if (this.humans.size === 1) {
        this.startUpdateLoop();
      }
      
      // Emit events
      EventBus.emit('human:spawned', {
        id: humanId,
        position: position,
        isActive: humanData.isActive,
        totalHumans: this.humans.size
      });
      
      return humanId;
      
    } catch (error) {
      console.error('Failed to spawn human:', error);
      EventBus.emit('human:error', { message: error.message, humanId });
      throw error;
    }
  }
  
  getHumanColor(index) {
    const colors = [
      0x0080ff, // Blue
      0xff0080, // Pink
      0x00ff80, // Green
      0xff8000, // Orange
      0x8000ff, // Purple
      0x80ff00, // Lime
    ];
    return colors[index % colors.length];
  }
  
  applyHumanColor(model, color) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        // Add colored emission to distinguish
        if (child.material.emissive !== undefined) {
          child.material.emissive = new THREE.Color(color);
          child.material.emissiveIntensity = 0.2;
        }
      }
    });
  }
  
  selectHuman(humanId) {
    if (!this.humans.has(humanId)) return false;
    
    // Deactivate previous
    if (this.activeHumanId && this.humans.has(this.activeHumanId)) {
      const prevHuman = this.humans.get(this.activeHumanId);
      prevHuman.isActive = false;
      
      // Stop movement
      prevHuman.body.velocity.set(0, 0, 0);
      prevHuman.moveDirection.set(0, 0, 0);
      
      // Play idle animation
      this.playAnimation(prevHuman, 'idle');
    }
    
    // Activate new
    this.activeHumanId = humanId;
    const human = this.humans.get(humanId);
    human.isActive = true;
    
    EventBus.emit('human:selected', {
      id: humanId,
      position: human.model.position.toArray()
    });
    
    return true;
  }
  
  removeHuman(humanId) {
    const human = this.humans.get(humanId);
    if (!human) return false;
    
    // Remove from scene
    human.scene.remove(human.model);
    
    // Remove physics
    human.world.removeBody(human.body);
    
    // Stop animations
    if (human.mixer) {
      human.mixer.stopAllAction();
    }
    
    // Remove from map
    this.humans.delete(humanId);
    
    // Select another human if this was active
    if (this.activeHumanId === humanId) {
      this.activeHumanId = null;
      if (this.humans.size > 0) {
        const firstId = this.humans.keys().next().value;
        this.selectHuman(firstId);
      }
    }
    
    // Stop update loop if no humans left
    if (this.humans.size === 0 && this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    EventBus.emit('human:removed', { id: humanId });
    
    return true;
  }
  
  handleKeyDown(event) {
    if (event.repeat) return;
    
    const key = event.key.toLowerCase();
    this.keysPressed[key] = true;
    
    // Number keys to select human
    if (key >= '1' && key <= '9') {
      const index = parseInt(key) - 1;
      const humanIds = Array.from(this.humans.keys());
      if (index < humanIds.length) {
        this.selectHuman(humanIds[index]);
      }
      return;
    }
    
    // Running
    if (key === 'shift' && this.activeHumanId) {
      const human = this.humans.get(this.activeHumanId);
      if (human) {
        human.isRunning = true;
        human.currentSpeed = human.runSpeed;
      }
    }
    
    // Movement
    if (['w', 'a', 's', 'd'].includes(key) && this.activeHumanId) {
      EventBus.emit('human:movement-start', { 
        key, 
        humanId: this.activeHumanId 
      });
    }
  }
  
  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.keysPressed[key] = false;
    
    // Stop running
    if (key === 'shift' && this.activeHumanId) {
      const human = this.humans.get(this.activeHumanId);
      if (human) {
        human.isRunning = false;
        human.currentSpeed = human.walkSpeed;
      }
    }
    
    // Check if all movement keys are released
    if (!this.keysPressed.w && !this.keysPressed.a && 
        !this.keysPressed.s && !this.keysPressed.d && this.activeHumanId) {
      const human = this.humans.get(this.activeHumanId);
      if (human) {
        EventBus.emit('human:movement-stop', { humanId: this.activeHumanId });
        this.playAnimation(human, 'idle');
      }
    }
  }
  
  updateMovement(human, deltaTime) {
    if (!human.isActive) return;
    
    // Reset movement direction
    human.moveDirection.set(0, 0, 0);
    
    // Calculate movement direction based on keys
    if (this.keysPressed.w) human.moveDirection.z -= 1;
    if (this.keysPressed.s) human.moveDirection.z += 1;
    if (this.keysPressed.a) human.moveDirection.x -= 1;
    if (this.keysPressed.d) human.moveDirection.x += 1;
    
    // Normalize and apply speed
    if (human.moveDirection.length() > 0) {
      human.moveDirection.normalize();
      human.moveDirection.multiplyScalar(human.currentSpeed);
      
      // Play appropriate animation
      this.playAnimation(human, human.isRunning ? 'run' : 'walk');
      
      // Rotate model to face movement direction
      if (human.moveDirection.x !== 0 || human.moveDirection.z !== 0) {
        const angle = Math.atan2(human.moveDirection.x, -human.moveDirection.z);
        human.rotateQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        human.model.quaternion.slerp(human.rotateQuaternion, 0.1);
      }
    }
    
    // Apply movement to physics body
    human.body.velocity.x = human.moveDirection.x;
    human.body.velocity.z = human.moveDirection.z;
    
    // Sync model position with physics body
    human.model.position.copy(human.body.position);
    human.model.position.y -= 0.5; // Adjust for body center
  }
  
  playAnimation(human, name) {
    if (!human.mixer || !human.animations[name]) return;
    
    const newAction = human.animations[name];
    
    if (newAction && newAction !== human.currentAction) {
      if (human.currentAction) {
        human.currentAction.fadeOut(0.2);
      }
      
      newAction.reset().fadeIn(0.2).play();
      human.currentAction = newAction;
      
      EventBus.emit('human:animation-change', { 
        animation: name,
        humanId: human.id
      });
    }
  }
  
  startUpdateLoop() {
    if (this.animationId) return; // Already running
    
    const clock = new THREE.Clock();
    
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      
      // Update all humans
      this.humans.forEach((human) => {
        // Update movement for active human
        this.updateMovement(human, deltaTime);
        
        // Update animations for all humans
        if (human.mixer) {
          human.mixer.update(deltaTime);
        }
        
        // Emit position updates
        EventBus.emitThrottled(`human:position-update:${human.id}`, {
          humanId: human.id,
          position: human.model.position.toArray(),
          rotation: human.model.rotation.y,
          velocity: human.moveDirection.toArray(),
          isRunning: human.isRunning,
          isActive: human.isActive
        }, 50);
      });
    };
    
    animate();
  }
  
  getAllHumans() {
    return Array.from(this.humans.entries()).map(([id, human]) => ({
      id,
      position: human.model.position.toArray(),
      isActive: human.isActive,
      isRunning: human.isRunning,
      color: human.color
    }));
  }
  
  dispose() {
    // Remove all humans
    const humanIds = Array.from(this.humans.keys());
    humanIds.forEach(id => this.removeHuman(id));
    
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    
    // Clear cache
    this.modelCache = null;
    this.cachedAnimations = null;
    
    EventBus.emit('human:disposed');
  }
}

// Create singleton instance
const humanController = new HumanController();
export default humanController; 