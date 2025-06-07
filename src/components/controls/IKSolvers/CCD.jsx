import * as THREE from 'three';

class CCDSolver {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.tolerance = options.tolerance || 0.01;
    this.dampingFactor = options.dampingFactor || 0.5;
    this.angleLimit = options.angleLimit || 0.2; // Max angle change per iteration
    
    // Reusable vectors to reduce GC
    this.vectors = {
      worldEndPos: new THREE.Vector3(),
      jointPos: new THREE.Vector3(),
      toEnd: new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      tempQuat: new THREE.Quaternion(),
      cross: new THREE.Vector3()
    };
  }

  /**
   * Solve IK using CCD algorithm - VIRTUAL SOLVING (don't reset robot position)
   * @param {Object} robot - The robot model
   * @param {THREE.Vector3} targetPos - Target position
   * @param {Function} findEndEffector - Function to find end effector
   * @param {Object} currentPos - Current end effector position {x, y, z}
   * @returns {Object} Joint angles solution or null
   */
  async solve(robot, targetPos, findEndEffector, currentPos) {
    if (!robot) return null;
    
    console.log('[CCD] Starting IK solve');
    console.log('[CCD] Target position:', targetPos);
    console.log('[CCD] Current end effector position:', currentPos);
    
    // Get the actual robot end effector (not virtual)
    const realEndEffector = robot.userData?.endEffectorLink;
    if (!realEndEffector) {
      console.error('[CCD] No end effector link found in robot.userData');
      return null;
    }
    
    console.log(`[CCD] Using end effector: ${realEndEffector.name}`);
    
    // Store CURRENT joint angles (don't reset!)
    const startingAngles = {};
    const movableJoints = [];
    
    if (robot.joints) {
      Object.entries(robot.joints).forEach(([name, joint]) => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          startingAngles[name] = joint.angle; // Use CURRENT angles, not reset
          movableJoints.push(name);
        }
      });
    }
    
    if (movableJoints.length === 0) {
      console.warn('[CCD] No movable joints found');
      return null;
    }
    
    console.log(`[CCD] Starting from current joint angles:`, startingAngles);
    console.log(`[CCD] Movable joints: ${movableJoints.join(', ')}`);
    
    // Create working copy of joint values for virtual solving
    const virtualAngles = { ...startingAngles }; // Start from CURRENT position
    
    // CCD iterations
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Apply virtual angles temporarily for calculations
      Object.entries(virtualAngles).forEach(([name, angle]) => {
        if (robot.joints[name]) {
          robot.setJointValue(name, angle);
        }
      });
      
      // Update matrices to ensure correct positions
      robot.updateMatrixWorld(true);
      
      // Get current end effector world position
      realEndEffector.getWorldPosition(this.vectors.worldEndPos);
      
      // Check convergence
      const distanceToTarget = this.vectors.worldEndPos.distanceTo(targetPos);
      console.log(`[CCD] Iteration ${iter}: distance = ${distanceToTarget.toFixed(4)}`);
      
      if (distanceToTarget < this.tolerance) {
        console.log('[CCD] Converged!');
        break;
      }
      
      // Process joints from end to base (reverse kinematic chain)
      const jointNames = movableJoints.slice().reverse();
      
      for (const jointName of jointNames) {
        const joint = robot.joints[jointName];
        if (!joint || joint.jointType === 'fixed') continue;
        
        // Get joint world position
        joint.getWorldPosition(this.vectors.jointPos);
        
        // Get joint axis in world coordinates
        this.vectors.axis.copy(joint.axis)
          .applyQuaternion(joint.getWorldQuaternion(this.vectors.tempQuat))
          .normalize();
        
        // Update end effector position after any joint changes
        realEndEffector.getWorldPosition(this.vectors.worldEndPos);
        
        // Calculate vectors from joint to end effector and target
        this.vectors.toEnd.subVectors(this.vectors.worldEndPos, this.vectors.jointPos);
        this.vectors.toTarget.subVectors(targetPos, this.vectors.jointPos);
        
        const toEndLength = this.vectors.toEnd.length();
        const toTargetLength = this.vectors.toTarget.length();
        
        // Skip if vectors are too small
        if (toEndLength < 0.001 || toTargetLength < 0.001) continue;
        
        // Normalize vectors
        this.vectors.toEnd.normalize();
        this.vectors.toTarget.normalize();
        
        // Calculate angle between vectors
        const dotProduct = THREE.MathUtils.clamp(
          this.vectors.toEnd.dot(this.vectors.toTarget), 
          -0.999, 
          0.999
        );
        let angle = Math.acos(dotProduct);
        
        // Determine rotation direction using cross product
        this.vectors.cross.crossVectors(this.vectors.toEnd, this.vectors.toTarget);
        if (this.vectors.cross.dot(this.vectors.axis) < 0) {
          angle = -angle;
        }
        
        // Apply damping to prevent overshooting
        angle *= this.dampingFactor;
        
        // Limit maximum angle change per iteration
        angle = THREE.MathUtils.clamp(angle, -this.angleLimit, this.angleLimit);
        
        // Calculate new joint angle
        let newAngle = virtualAngles[jointName] + angle;
        
        // Apply joint limits if they exist
        if (!joint.ignoreLimits && joint.limit) {
          newAngle = THREE.MathUtils.clamp(
            newAngle, 
            joint.limit.lower, 
            joint.limit.upper
          );
        }
        
        // Update virtual angle
        virtualAngles[jointName] = newAngle;
      }
    }
    
    // DON'T restore robot position - leave it at the solution position!
    // The JointContext will handle the animation from current to target
    console.log('[CCD] Solution calculated:', virtualAngles);
    console.log('[CCD] Robot left at solution position for smooth animation');
    
    return virtualAngles;
  }

  /**
   * Update solver settings
   */
  configure(settings) {
    Object.assign(this, settings);
  }
}

export default CCDSolver;