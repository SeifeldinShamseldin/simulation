// src/core/IK/API/IKAPI.js
import * as THREE from 'three';
import EventBus from '../../../utils/EventBus';

const Logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

/**
 * Unified API for Inverse Kinematics functionality
 */
class IKAPI {
  constructor() {
    // Singleton instance
    if (IKAPI.instance) {
      return IKAPI.instance;
    }
    IKAPI.instance = this;
    
    // Initialize IK solver settings
    this.solverSettings = {
      maxIterations: 10,
      tolerance: 0.01,
      dampingFactor: 0.5
    };
    
    // Temporary vectors for calculations (reused to reduce GC)
    this._worldEndPos = new THREE.Vector3();
    this._jointPos = new THREE.Vector3();
    this._toEnd = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._tempQuat = new THREE.Quaternion();
    
    // Animation state
    this.animating = false;
    this.startAngles = {};
    this.goalAngles = {};
    
    // Joint value update callbacks
    this.jointValueCallbacks = new Set();

    // Animation promises tracking
    this.animationPromises = new Map();
  }
  
  /**
   * Get the current end effector position
   * @param {Object} robot - Robot instance
   * @returns {Object} Current position {x, y, z}
   */
  getEndEffectorPosition(robot) {
    if (!robot) return { x: 0, y: 0, z: 0 };
    // Find the end effector - it's typically the last link in the kinematic chain
    const endEffector = this.findEndEffector(robot);
    if (!endEffector) return { x: 0, y: 0, z: 0 };
    const worldPos = new THREE.Vector3();
    endEffector.getWorldPosition(worldPos);
    return {
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z
    };
  }
  
  /**
   * Find the end effector link of the robot
   * @param {Object} robot - The robot object
   * @returns {Object|null} The end effector link or null
   */
  findEndEffector(robot) {
    if (!robot) return null;
    // Method 1: Look for common end effector names
    const endEffectorNames = [
      'end_effector', 'tool0', 'ee_link', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange'
    ];
    for (const name of endEffectorNames) {
      if (robot.links && robot.links[name]) {
        return robot.links[name];
      }
    }
    // Method 2: Find the link that has no child joints
    if (robot.links && robot.joints) {
      const linksWithChildJoints = new Set();
      // Find all links that are parents of joints
      Object.values(robot.joints).forEach(joint => {
        joint.traverse(child => {
          if (child.parent && child.parent.isURDFLink) {
            linksWithChildJoints.add(child.parent.name);
          }
        });
      });
      // Find links that have no child joints
      const leafLinks = [];
      Object.values(robot.links).forEach(link => {
        if (!linksWithChildJoints.has(link.name)) {
          leafLinks.push(link);
        }
      });
      // Return the last leaf link (typically the end effector)
      if (leafLinks.length > 0) {
        return leafLinks[leafLinks.length - 1];
      }
    }
    // Method 3: Fallback - traverse to find the deepest link
    let deepestLink = null;
    let maxDepth = 0;
    const findDeepestLink = (obj, depth = 0) => {
      if (obj.isURDFLink && depth > maxDepth) {
        maxDepth = depth;
        deepestLink = obj;
      }
      if (obj.children) {
        obj.children.forEach(child => {
          findDeepestLink(child, depth + 1);
        });
      }
    };
    findDeepestLink(robot);
    return deepestLink;
  }
  
  /**
   * Register a callback for joint value updates during animation
   * @param {Function} callback - Function to call when joint values update
   * @returns {Function} Unsubscribe function
   */
  registerForJointUpdates(callback) {
    this.jointValueCallbacks.add(callback);
    return () => this.jointValueCallbacks.delete(callback);
  }
  
  /**
   * Solve IK to find joint angles that reach the target
   * @param {Object} robot - Robot instance
   * @param {Object} targetPosition - Target position {x, y, z}
   * @returns {Promise<Object|null>} Joint angles or null if not solvable
   */
  async solve(robot, targetPosition) {
    if (!robot) return null;
    
    // Store original settings
    const originalSettings = { ...this.solverSettings };
    this.configureSolver(this.analyzeRobotStructure(robot));
    
    // Ensure target is a Vector3
    const targetPos = targetPosition instanceof THREE.Vector3 ? 
      targetPosition : this.createTarget(targetPosition);
    
    // Store start angles
    this.startAngles = {};
    Object.values(robot.joints).forEach(joint => {
      this.startAngles[joint.name] = joint.angle || 0;
    });
    
    // Check if target is reachable
    if (!this.isTargetReachable(targetPos, robot)) {
      console.warn('Target position may be unreachable, maximum reach is', this.solverSettings.maxReach);
    }
    
    // Use CCD (Cyclic Coordinate Descent) algorithm
    for (let iter = 0; iter < this.solverSettings.maxIterations; iter++) {
      // Get current end effector position
      const currentPosData = this.getEndEffectorPosition(robot);
      const currentPos = new THREE.Vector3(currentPosData.x, currentPosData.y, currentPosData.z);
      
      // Check convergence
      const distanceToTarget = currentPos.distanceTo(targetPos);
      console.log(`Iteration ${iter}: distance = ${distanceToTarget.toFixed(4)}`);
      
      if (distanceToTarget < this.solverSettings.tolerance) {
        console.log(`IK converged after ${iter} iterations`);
        break;
      }
      
      // If stuck, increase damping
      if (iter > 10 && distanceToTarget > 0.1) {
        this.solverSettings.dampingFactor = Math.min(1.0, this.solverSettings.dampingFactor * 1.1);
      }
      
      // Process joints with better angle calculation
      for (const jointName in this.startAngles) {
        const joint = robot.joints[jointName];
        if (joint.jointType === 'fixed') continue;
        
        // Get joint world position and axis
        joint.getWorldPosition(this._jointPos);
        this._axis.copy(joint.axis)
          .applyQuaternion(joint.getWorldQuaternion(this._tempQuat))
          .normalize();
        
        // Vectors from joint to current end effector and target
        this._toEnd.copy(currentPos).sub(this._jointPos);
        this._toTarget.copy(targetPos).sub(this._jointPos);
        
        // Only proceed if vectors are significant
        if (this._toEnd.length() < 0.001 || this._toTarget.length() < 0.001) continue;
        
        this._toEnd.normalize();
        this._toTarget.normalize();
        
        // Calculate angle with better clamping
        const dotProduct = THREE.MathUtils.clamp(this._toEnd.dot(this._toTarget), -0.999, 0.999);
        let angle = Math.acos(dotProduct);
        
        // Determine direction
        const cross = this._toEnd.clone().cross(this._toTarget);
        if (cross.dot(this._axis) < 0) {
          angle = -angle;
        }
        
        // Apply stronger damping for large movements
        const adjustedDamping = distanceToTarget > 0.1 ? this.solverSettings.dampingFactor * 1.5 : this.solverSettings.dampingFactor;
        angle *= adjustedDamping;
        
        // Limit angle change per iteration
        angle = THREE.MathUtils.clamp(angle, -0.2, 0.2);
        
        // Update joint
        let newAngle = joint.angle + angle;
        
        // Apply limits
        if (!joint.ignoreLimits && joint.limit) {
          newAngle = THREE.MathUtils.clamp(newAngle, joint.limit.lower, joint.limit.upper);
        }
        
        // Apply change
        robot.setJointValue(joint.name, newAngle);
        
        // Force matrix updates for next real-time calculation
        joint.updateMatrixWorld(true);
      }
    }
    
    // Store goal angles
    this.goalAngles = {};
    Object.values(robot.joints).forEach(joint => {
      this.goalAngles[joint.name] = joint.angle || 0;
    });
    
    // Reset to start for animation
    Object.values(robot.joints).forEach(joint => {
      robot.setJointValue(joint.name, this.startAngles[joint.name]);
    });
    
    // Restore original settings
    this.configureSolver(originalSettings);
    
    return this.goalAngles;
  }
  
  /**
   * Execute IK with EventBus communication
   */
  async executeIK(robot, targetPosition, options = {}) {
    try {
      // Configure solver with options
      if (options.maxIterations) this.solverSettings.maxIterations = options.maxIterations;
      if (options.tolerance) this.solverSettings.tolerance = options.tolerance;
      if (options.dampingFactor) this.solverSettings.dampingFactor = options.dampingFactor;
      
      // Solve using EventBus for real-time positions
      const solution = await this.solve(robot, targetPosition);
      if (!solution) {
        throw new Error('Failed to solve IK');
      }

      // Check if we actually need to move (goal is different from start)
      let needsMovement = false;
      for (const jointName in solution) {
        if (Math.abs(solution[jointName] - this.startAngles[jointName]) > 0.001) {
          needsMovement = true;
          break;
        }
      }

      if (!needsMovement) {
        console.log('Already at target position');
        return true;
      }

      // Store the solution as goal angles for animation
      this.goalAngles = solution;

      // Animate the movement if requested
      if (options.animate !== false) {
        await new Promise((resolve) => {
          this.animate(robot, options.duration || 1000, () => {
            resolve();
          });
        });
      } else {
        // Apply immediately without animation
        robot.setJointValues(solution);
      }
      
      return true;
    } catch (error) {
      console.error("Error executing IK:", error);
      return false;
    }
  }
  
  /**
   * Stop all current animations and resolve their promises
   */
  stopAnimation() {
    this.animating = false;
    
    // Resolve all pending animation promises
    this.animationPromises.forEach(promiseData => {
      promiseData.resolve();
    });
    this.animationPromises.clear();
  }
  
  // Additional helper methods...
  
  /**
   * Configure IK solver settings
   * @param {Object} settings - Settings object with parameters to change
   */
  configureSolver(settings = {}) {
    this.solverSettings = {
      ...this.solverSettings,
      ...settings
    };
  }
  
  /**
   * Get a 3D vector representing the target position
   * @param {Object} targetPosition - Target position object {x,y,z}
   * @returns {THREE.Vector3} Target as Vector3
   */
  createTarget(targetPosition) {
    return new THREE.Vector3(
      parseFloat(targetPosition.x || 0),
      parseFloat(targetPosition.y || 0),
      parseFloat(targetPosition.z || 0)
    );
  }
  
  /**
   * Check if target is reachable based on maximum reach
   * @param {THREE.Vector3} targetPos - Target position
   * @param {Object} robot - Robot object
   * @returns {boolean} Whether target appears reachable
   */
  isTargetReachable(targetPos, robot) {
    if (!robot) return false;
    
    try {
      const joints = Object.values(robot.joints).filter(
        j => j.jointType !== 'fixed' && j.limit && typeof j.limit.lower === 'number'
      );
      
      if (joints.length === 0) return false;
      
      // Calculate max reach
      const maxReach = this.calculateMaxReach(joints);
      
      // Get base position
      const baseLink = this.findBaseLink(robot);
      if (!baseLink) return false;
      
      const basePos = new THREE.Vector3();
      baseLink.getWorldPosition(basePos);
      
      // Check if target is within reach
      const distance = basePos.distanceTo(targetPos);
      return distance <= maxReach;
    } catch (error) {
      console.error('Error checking if target is reachable:', error);
      return false; 
    }
  }
  
  /**
   * Calculate maximum reach of the robot arm
   * @param {Array} joints - Array of joints
   * @returns {number} Maximum reach distance
   */
  calculateMaxReach(joints) {
    if (!joints || joints.length <= 1) return 0;
    
    let totalLength = 0;
    
    // Calculate distance between consecutive joints
    for (let i = 0; i < joints.length - 1; i++) {
      const joint1Pos = new THREE.Vector3();
      const joint2Pos = new THREE.Vector3();
      
      joints[i].getWorldPosition(joint1Pos);
      joints[i+1].getWorldPosition(joint2Pos);
      
      totalLength += joint1Pos.distanceTo(joint2Pos);
    }
    
    // Add estimated distance from last joint to end effector
    if (joints.length > 0) {
      const lastJoint = joints[joints.length - 1];
      if (lastJoint.children.length > 0) {
        const lastJointPos = new THREE.Vector3();
        const endEffectorPos = new THREE.Vector3();
        
        lastJoint.getWorldPosition(lastJointPos);
        lastJoint.children[0].getWorldPosition(endEffectorPos);
        
        totalLength += lastJointPos.distanceTo(endEffectorPos);
      }
    }
    
    return totalLength;
  }
  
  /**
   * Find the base link of a robot
   * @param {Object} robot - The robot object
   * @returns {Object|null} The base link or null if not found
   */
  findBaseLink(robot) {
    if (!robot || !robot.links) return null;
    
    // Try to find base_link or world first
    if (robot.links["base_link"]) return robot.links["base_link"];
    if (robot.links["world"]) return robot.links["world"];
    if (robot.links["base"]) return robot.links["base"];
    
    // For KUKA robots, look for specific base names
    const kukaBaseNames = ["base", "base_link", "joint_a1", "fixed_base"];
    for (const name of kukaBaseNames) {
      if (robot.links[name]) return robot.links[name];
    }
    
    // Otherwise use the first link
    const linkNames = Object.keys(robot.links);
    if (linkNames.length > 0) {
      return robot.links[linkNames[0]];
    }
    
    return null;
  }
  
  /**
   * Calculate appropriate duration based on joint changes
   * @param {Object} robot - Robot object
   * @returns {number} Duration in milliseconds
   */
  calculateAnimationDuration(robot) {
    if (!robot || !this.startAngles || !this.goalAngles) return 1500; // Longer default
    
    let maxTime = 0;
    
    for (const jointName in this.startAngles) {
      const joint = robot.joints[jointName];
      if (!joint) continue;
      
      const startAngle = this.startAngles[jointName];
      const goalAngle = this.goalAngles[jointName];
      const angleChange = Math.abs(goalAngle - startAngle);
      
      // Slower movement for smoother animation
      const maxVelocity = (joint.limit && joint.limit.velocity) || 1.0; // Back to 1.0
      
      const jointTime = angleChange / maxVelocity;
      maxTime = Math.max(maxTime, jointTime);
    }
    
    // Longer minimum duration for visible movement
    return Math.max(maxTime * 1000, 800); // Minimum 800ms
  }
  
  /**
   * Animate movement from start to goal angles
   * @param {Object} robot - Robot object
   * @param {number} duration - Animation duration in milliseconds
   * @param {Function} onComplete - Callback when animation completes
   * @returns {Object} Animation control object
   */
  animate(robot, duration = 1000, onComplete = null) {
    if (!robot || !this.startAngles || !this.goalAngles) {
      if (onComplete) onComplete();
      return null;
    }
    
    this.animating = true;
    const animationStartTime = performance.now();
    
    const animateFrame = (currentTime) => {
      if (!this.animating) return;
      
      const elapsed = currentTime - animationStartTime;
      let progress = Math.min(elapsed / duration, 1.0);
      
      if (progress >= 1.0) {
        progress = 1.0;
        this.animating = false;
      }
      
      // Smoother easing
      const easedProgress = this._easeInOutCubic(progress);
      
      // Update all joints smoothly
      for (const jointName in this.startAngles) {
        const startAngle = this.startAngles[jointName];
        const goalAngle = this.goalAngles[jointName];
        const currentAngle = startAngle + (goalAngle - startAngle) * easedProgress;
        
        robot.setJointValue(jointName, currentAngle);
      }
      
      // Continue animation
      if (this.animating) {
        requestAnimationFrame(animateFrame);
      } else if (onComplete) {
        setTimeout(onComplete, 0);
      }
    };
    
    requestAnimationFrame(animateFrame);
    
    return {
      stop: () => { this.animating = false; },
      isRunning: () => this.animating
    };
  }
  
  /**
   * Easing function for smooth animation
   * @param {number} t - Progress from 0 to 1
   * @returns {number} Eased progress
   */
  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * Analyze robot structure to determine optimal IK parameters
   * @param {Object} robot - The robot object
   * @returns {Object} Dynamically tuned parameters for this robot
   */
  analyzeRobotStructure(robot) {
    if (!robot) return this.getDefaultParameters();
    
    // Get joints directly from robot
    const joints = Object.values(robot.joints).filter(
      j => j.jointType !== 'fixed' && j.limit && typeof j.limit.lower === 'number'
    );
    if (!joints || joints.length === 0) return this.getDefaultParameters();
    
    // Count the number of degrees of freedom (movable joints)
    const dof = joints.filter(j => j.jointType !== 'fixed').length;
    
    // Analyze the joint limits and ranges
    const jointRanges = joints.map(joint => {
      if (joint.limit && typeof joint.limit.lower === 'number' && typeof joint.limit.upper === 'number') {
        return Math.abs(joint.limit.upper - joint.limit.lower);
      }
      return Math.PI * 2; // Default to full rotation
    });
    
    // Calculate max reach
    const maxReach = this.calculateMaxReach(joints);
    
    // Calculate the complexity of the kinematic chain
    // More joints = more complex = need more iterations and lower damping
    const complexity = Math.min(1.0, dof / 7); // Normalize to 0-1
    
    // Calculate joint weights based on position in the kinematic chain
    // Typically base joints have more influence than end joints
    const jointWeights = joints.map((joint, index) => {
      // Calculate normalized position in chain (0 = base, 1 = end)
      const normalizedPos = index / Math.max(1, joints.length - 1);
      
      // Base joints (early in chain) get higher weight, decreasing toward end
      // Formula gives approximately: 1.0 for first joint, 0.7 for middle joints, 0.5 for last joints
      return 1.0 - (normalizedPos * 0.5);
    });
    
    // Dynamically tune the parameters based on robot characteristics
    return {
      maxIterations: Math.max(10, Math.min(30, Math.round(10 + dof * 2))),
      tolerance: Math.max(0.001, Math.min(0.02, 0.01 / complexity)),
      dampingFactor: Math.max(0.2, Math.min(0.8, 0.7 - (complexity * 0.4))),
      joint_weights: jointWeights,
      maxReach: maxReach,
      dof: dof
    };
  }

  /**
   * Get default IK parameters
   * @returns {Object} Default parameters
   */
  getDefaultParameters() {
    return {
      maxIterations: 25,      // Fewer iterations for speed
      tolerance: 0.01,        // Reasonable tolerance
      dampingFactor: 0.8,     // Higher damping for stability
      joint_weights: [1, 1, 1, 1, 1, 1],  // Equal weights
      maxReach: 2.0,
      dof: 6
    };
  }
}

// Export singleton instance
const ikAPI = new IKAPI();
export default ikAPI;