import * as THREE from 'three';

class CCD {
  // Static metadata for the solver
  static metadata = {
    name: "Cyclic Coordinate Descent",
    description: "Fast iterative IK solver for chain-based robots",
    author: "Your Name",
    version: "1.0.0"
  };

  // Static default configuration
  static defaultConfig = {
    maxIterations: 10,
    tolerance: 0.01,
    dampingFactor: 0.5,
    angleLimit: 0.2,
    orientationWeight: 0.1
  };

  constructor(config = {}) {
    // Merge default config with provided config
    Object.assign(this, CCD.defaultConfig, config);
  }

  // Optional: Method to get current config
  getConfig() {
    return {
      maxIterations: this.maxIterations,
      tolerance: this.tolerance,
      dampingFactor: this.dampingFactor,
      angleLimit: this.angleLimit,
      orientationWeight: this.orientationWeight
    };
  }

  // Optional: Method to update config
  configure(config) {
    Object.assign(this, config);
  }

  /**
   * Solve IK using CCD algorithm with position and orientation awareness
   * @param {Object} robot - The robot model
   * @param {THREE.Vector3} targetPos - Target position
   * @param {Function} findEndEffector - Function to find end effector
   * @param {Object} currentPos - Current end effector position {x, y, z}
   * @param {Object} options - Additional options including target orientation
   * @returns {Object} Joint angles solution or null
   */
  async solve(robot, targetPos, findEndEffector, currentPos, options = {}) {
    if (!robot) return null;
    
    const { targetOrientation, currentOrientation } = options;
    
    console.log('[CCD] Starting IK solve with orientation support');
    console.log('[CCD] Target position:', targetPos);
    console.log('[CCD] Current end effector position:', currentPos);
    console.log('[CCD] Target orientation (euler):', targetOrientation);
    console.log('[CCD] Current orientation (quat):', currentOrientation);
    
    // Get the actual robot end effector (not virtual)
    const realEndEffector = robot.userData?.endEffectorLink;
    if (!realEndEffector) {
      console.error('[CCD] No end effector link found in robot.userData');
      return null;
    }
    
    console.log(`[CCD] Using end effector: ${realEndEffector.name}`);
    
    // Store CURRENT joint angles as starting point (IMPORTANT: don't reset!)
    const startingAngles = {};
    const movableJoints = [];
    
    if (robot.joints) {
      Object.entries(robot.joints).forEach(([name, joint]) => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          startingAngles[name] = joint.angle; // Store current position
          movableJoints.push(name);
        }
      });
    }
    
    if (movableJoints.length === 0) {
      console.warn('[CCD] No movable joints found');
      return null;
    }
    
    // 🚨 CRITICAL: Verify starting angles
    const { hasNonZeroAngles, hasValidAngles } = this.verifyStartingAngles(robot, startingAngles);
    
    if (!hasValidAngles) {
      console.error('[CCD] Invalid starting angles detected - aborting solve');
      return null;
    }
    
    if (!hasNonZeroAngles) {
      console.warn('[CCD] Warning: All starting angles are zero - this may affect IK solution quality');
    }
    
    console.log(`[CCD] Starting from current joint angles:`, startingAngles);
    console.log(`[CCD] Movable joints: ${movableJoints.join(', ')}`);
    
    // Create working copy of joint values for virtual solving
    const virtualAngles = { ...startingAngles }; // Start from CURRENT position
    
    // Convert target orientation to quaternion if provided
    let targetQuaternion = null;
    if (targetOrientation) {
      this.vectors.targetQuat.setFromEuler(new THREE.Euler(
        targetOrientation.roll || 0,
        targetOrientation.pitch || 0,
        targetOrientation.yaw || 0,
        'XYZ'
      ));
      targetQuaternion = this.vectors.targetQuat.clone();
      console.log('[CCD] Target quaternion:', targetQuaternion);
    }
    
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
      
      // Check positional convergence
      const distanceToTarget = this.vectors.worldEndPos.distanceTo(targetPos);
      
      // Check orientation convergence if target orientation is provided
      let orientationError = 0;
      if (targetQuaternion) {
        realEndEffector.getWorldQuaternion(this.vectors.currentQuat);
        orientationError = this.vectors.currentQuat.angleTo(targetQuaternion);
      }
      
      console.log(`[CCD] Iteration ${iter}: distance = ${distanceToTarget.toFixed(4)}, orientation error = ${orientationError.toFixed(4)}`);
      
      // Combined convergence check
      const positionConverged = distanceToTarget < this.tolerance;
      const orientationConverged = !targetQuaternion || orientationError < (this.tolerance * 2); // More lenient for orientation
      
      if (positionConverged && orientationConverged) {
        console.log('[CCD] Converged (position and orientation)!');
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
        
        // Calculate position-based angle
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
        let positionAngle = Math.acos(dotProduct);
        
        // Determine rotation direction using cross product
        this.vectors.cross.crossVectors(this.vectors.toEnd, this.vectors.toTarget);
        if (this.vectors.cross.dot(this.vectors.axis) < 0) {
          positionAngle = -positionAngle;
        }
        
        // Calculate orientation-based angle contribution (if target orientation provided)
        let orientationAngle = 0;
        if (targetQuaternion && this.orientationWeight > 0) {
          realEndEffector.getWorldQuaternion(this.vectors.currentQuat);
          const orientationError = this.vectors.currentQuat.angleTo(targetQuaternion);
          
          if (orientationError > 0.01) { // ~0.6 degrees threshold
            // Simple heuristic: distribute orientation error among joints
            // Joints closer to end effector get more orientation responsibility
            const jointIndex = movableJoints.indexOf(jointName);
            const jointCount = movableJoints.length;
            const endEffectorWeight = (jointCount - jointIndex) / jointCount; // 1.0 for last joint, lower for earlier joints
            
            // Calculate orientation contribution
            const orientationContribution = orientationError * this.orientationWeight * endEffectorWeight;
            
            // Determine direction based on quaternion difference
            const quatDiff = this.vectors.currentQuat.clone().invert().multiply(targetQuaternion);
            
            // Project quaternion rotation onto joint axis
            const rotAxis = new THREE.Vector3(quatDiff.x, quatDiff.y, quatDiff.z).normalize();
            const axisAlignment = this.vectors.axis.dot(rotAxis);
            
            orientationAngle = orientationContribution * axisAlignment;
            
            console.log(`[CCD] Joint ${jointName} orientation: error=${(orientationError*180/Math.PI).toFixed(1)}°, weight=${endEffectorWeight.toFixed(2)}, contribution=${(orientationAngle*180/Math.PI).toFixed(2)}°`);
          }
        }
        
        // Combine position and orientation angles with simpler logic
        let totalAngle;
        if (targetQuaternion) {
          // For orientation tasks, use a balanced approach
          const posWeight = distanceToTarget > 0.1 ? 0.7 : 0.3; // Focus on position when far, orientation when close
          const oriWeight = 1.0 - posWeight;
          
          totalAngle = (positionAngle * posWeight) + (orientationAngle * oriWeight);
          
          console.log(`[CCD] ${jointName}: pos=${(positionAngle*180/Math.PI).toFixed(1)}°*${posWeight.toFixed(1)} + ori=${(orientationAngle*180/Math.PI).toFixed(1)}°*${oriWeight.toFixed(1)} = ${(totalAngle*180/Math.PI).toFixed(1)}°`);
        } else {
          totalAngle = positionAngle;
        }
        
        // Apply damping to prevent overshooting
        totalAngle *= this.dampingFactor;
        
        // Limit maximum angle change per iteration
        totalAngle = THREE.MathUtils.clamp(totalAngle, -this.angleLimit, this.angleLimit);
        
        // Calculate new joint angle
        let newAngle = virtualAngles[jointName] + totalAngle;
        
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
    
    // CRITICAL FIX: Restore robot to original position
    // This ensures the robot returns to its starting pose so JointContext can animate properly
    console.log('[CCD] Restoring robot to starting position for smooth animation');
    Object.entries(startingAngles).forEach(([name, angle]) => {
      if (robot.joints[name]) {
        robot.setJointValue(name, angle);
      }
    });
    
    // Update matrices to ensure robot is back to starting position
    robot.updateMatrixWorld(true);
    
    console.log('[CCD] Solution calculated:', virtualAngles);
    console.log('[CCD] Robot restored to starting position - ready for animation');
    
    return virtualAngles;
  }

  // Add this helper method in CCDSolver class
  verifyStartingAngles(robot, startingAngles) {
    let hasNonZeroAngles = false;
    let hasValidAngles = true;
    
    if (robot.joints) {
      Object.entries(robot.joints).forEach(([name, joint]) => {
        if (joint && joint.jointType !== 'fixed') {
          const currentAngle = joint.angle;
          const storedAngle = startingAngles[name];
          
          // Check if angle is defined and not NaN
          if (typeof currentAngle !== 'number' || isNaN(currentAngle)) {
            console.warn(`[CCD] Invalid angle for joint ${name}: ${currentAngle}`);
            hasValidAngles = false;
            return;
          }
          
          // Check if angle is non-zero
          if (Math.abs(currentAngle) > 0.001) {
            hasNonZeroAngles = true;
          }
          
          // Verify stored angle matches current angle
          if (Math.abs(currentAngle - storedAngle) > 0.001) {
            console.warn(`[CCD] Angle mismatch for joint ${name}: current=${currentAngle}, stored=${storedAngle}`);
            hasValidAngles = false;
          }
        }
      });
    }
    
    return { hasNonZeroAngles, hasValidAngles };
  }
}

export default CCD;