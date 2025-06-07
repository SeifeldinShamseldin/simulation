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
   * Solve IK using CCD algorithm
   * @param {Object} robot - The robot model
   * @param {THREE.Vector3} targetPos - Target position
   * @param {Function} findEndEffector - Function to find end effector
   * @returns {Object} Joint angles solution or null
   */
  async solve(robot, targetPos, findEndEffector) {
    if (!robot) return null;
    
    console.log('[CCD] Starting IK solve for target:', targetPos);
    console.log('[CCD] Available joints:', robot.joints ? Object.keys(robot.joints) : 'No joints');
    
    // Store initial joint angles - only for movable joints
    const startAngles = {};
    const movableJoints = [];
    
    if (robot.joints) {
      Object.entries(robot.joints).forEach(([name, joint]) => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          startAngles[name] = joint.angle;
          movableJoints.push(name);
        }
      });
    }
    
    console.log('[CCD] Movable joints:', movableJoints);
    console.log('[CCD] Initial angles:', startAngles);
    
    if (movableJoints.length === 0) {
      console.warn('[CCD] No movable joints found');
      return null;
    }
    
    // CCD iterations
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const endEffector = findEndEffector(robot);
      if (!endEffector) {
        console.warn('[CCD] End effector not found');
        return null;
      }
      
      // Get current end effector position
      endEffector.getWorldPosition(this.vectors.worldEndPos);
      
      // Check convergence
      const distanceToTarget = this.vectors.worldEndPos.distanceTo(targetPos);
      console.log(`[CCD] Iteration ${iter}: distance to target = ${distanceToTarget.toFixed(4)}`);
      
      if (distanceToTarget < this.tolerance) {
        console.log('[CCD] Converged!');
        break; // Converged!
      }
      
      // Process each joint from end to base
      const jointNames = movableJoints.slice().reverse(); // Work backwards
      
      for (const jointName of jointNames) {
        const joint = robot.joints[jointName];
        if (!joint || joint.jointType === 'fixed') continue;
        
        // Get joint world position and axis
        joint.getWorldPosition(this.vectors.jointPos);
        this.vectors.axis.copy(joint.axis)
          .applyQuaternion(joint.getWorldQuaternion(this.vectors.tempQuat))
          .normalize();
        
        // Update end effector position after previous joint updates
        endEffector.getWorldPosition(this.vectors.worldEndPos);
        
        // Vectors from joint to current end effector and target
        this.vectors.toEnd.subVectors(this.vectors.worldEndPos, this.vectors.jointPos);
        this.vectors.toTarget.subVectors(targetPos, this.vectors.jointPos);
        
        const toEndLength = this.vectors.toEnd.length();
        const toTargetLength = this.vectors.toTarget.length();
        
        if (toEndLength < 0.001 || toTargetLength < 0.001) continue;
        
        this.vectors.toEnd.normalize();
        this.vectors.toTarget.normalize();
        
        // Calculate rotation angle
        const dotProduct = THREE.MathUtils.clamp(
          this.vectors.toEnd.dot(this.vectors.toTarget), 
          -0.999, 
          0.999
        );
        let angle = Math.acos(dotProduct);
        
        // Determine rotation direction
        this.vectors.cross.crossVectors(this.vectors.toEnd, this.vectors.toTarget);
        if (this.vectors.cross.dot(this.vectors.axis) < 0) {
          angle = -angle;
        }
        
        // Apply damping
        angle *= this.dampingFactor;
        
        // Limit angle change
        angle = THREE.MathUtils.clamp(angle, -this.angleLimit, this.angleLimit);
        
        // Calculate new joint angle
        let newAngle = joint.angle + angle;
        
        // Apply joint limits
        if (!joint.ignoreLimits && joint.limit) {
          newAngle = THREE.MathUtils.clamp(
            newAngle, 
            joint.limit.lower, 
            joint.limit.upper
          );
        }
        
        // Update joint
        robot.setJointValue(joint.name, newAngle);
        joint.updateMatrixWorld(true);
      }
    }
    
    // Get final joint angles - only for joints that were moved
    const goalAngles = {};
    movableJoints.forEach(jointName => {
      const joint = robot.joints[jointName];
      if (joint) {
        goalAngles[jointName] = joint.angle || 0;
      }
    });
    
    // Reset to initial angles (for animation)
    Object.entries(startAngles).forEach(([name, angle]) => {
      if (robot.joints[name]) {
        robot.setJointValue(name, angle);
      }
    });
    
    // Check final convergence
    const endEffector = findEndEffector(robot);
    let converged = false;
    if (endEffector) {
      // Temporarily apply goal angles to check convergence
      Object.entries(goalAngles).forEach(([name, angle]) => {
        if (robot.joints[name]) {
          robot.setJointValue(name, angle);
        }
      });
      
      endEffector.getWorldPosition(this.vectors.worldEndPos);
      converged = this.vectors.worldEndPos.distanceTo(targetPos) < this.tolerance;
      
      // Reset to initial angles again
      Object.entries(startAngles).forEach(([name, angle]) => {
        if (robot.joints[name]) {
          robot.setJointValue(name, angle);
        }
      });
    }
    
    console.log('[CCD] Final solution:', goalAngles);
    console.log('[CCD] Converged:', converged);
    
    return goalAngles; // Return just the goal angles - executeIK expects this format
  }

  /**
   * Update solver settings
   */
  configure(settings) {
    Object.assign(this, settings);
  }
}

export default CCDSolver; 