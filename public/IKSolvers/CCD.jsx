import * as THREE from 'three';

class CCD {
  static metadata = {
    name: "Cyclic Coordinate Descent",
    description: "Fast iterative IK solver following standardized interface",
    author: "URDF Viewer Team",
    version: "5.0.0"
  };

  static defaultConfig = {
    maxIterations: 10,
    tolerance: 0.01,
    dampingFactor: 0.7,
    angleLimit: 0.3,
    orientationWeight: 0.1
  };

  constructor(config = {}) {
    Object.assign(this, CCD.defaultConfig, config);
    
    // Reusable THREE.js objects to reduce GC pressure
    this.vectors = {
      jointPos: new THREE.Vector3(),
      toEnd: new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
      cross: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      tempVec: new THREE.Vector3()
    };
    
    this.quaternions = {
      targetQuat: new THREE.Quaternion(),
      currentQuat: new THREE.Quaternion(),
      tempQuat: new THREE.Quaternion()
    };
  }

  // Method to get current config
  getConfig() {
    return {
      maxIterations: this.maxIterations,
      tolerance: this.tolerance,
      dampingFactor: this.dampingFactor,
      angleLimit: this.angleLimit,
      orientationWeight: this.orientationWeight
    };
  }

  // Method to update config
  configure(config) {
    Object.assign(this, config);
  }

  /**
   * Solve IK using standardized interface
   * @param {Object} params - Standardized parameters object
   * @returns {Object} Joint angles solution or null
   */
  async solve(params) {
    const {
      robot,                // Robot model
      endEffectorLink,      // End effector link (provided by IK Context)
      currentPosition,      // Current end effector position (includes TCP!)
      currentOrientation,   // Current orientation quaternion
      targetPosition,       // Target position
      targetOrientation     // Target orientation (euler angles)
    } = params;

    if (!robot || !robot.joints) {
      console.error('[CCD] Invalid robot model');
      return null;
    }

    if (!endEffectorLink) {
      console.error('[CCD] End effector link not provided by IK Context');
      return null;
    }

    console.log('[CCD] Starting solve with standardized interface');
    console.log('[CCD] IK-provided current position (TCP-aware):', currentPosition);
    console.log('[CCD] Target position:', targetPosition);
    console.log('[CCD] Target orientation:', targetOrientation);

    // Get movable joints and store starting angles
    const movableJoints = [];
    const startingAngles = {};
    
    Object.entries(robot.joints).forEach(([name, joint]) => {
      if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
        movableJoints.push({ name, joint });
        startingAngles[name] = joint.angle; // Store current position
      }
    });

    if (movableJoints.length === 0) {
      console.warn('[CCD] No movable joints found');
      return null;
    }

    console.log(`[CCD] Found ${movableJoints.length} movable joints`);
    console.log('[CCD] Starting angles:', startingAngles);

    // Working copy of angles (start from current position)
    const workingAngles = { ...startingAngles };
    
    // Convert target position to Vector3
    const targetVec = new THREE.Vector3(
      targetPosition.x,
      targetPosition.y,
      targetPosition.z
    );

    // Convert target orientation to quaternion if provided
    let targetQuaternion = null;
    if (targetOrientation) {
      this.quaternions.targetQuat.setFromEuler(new THREE.Euler(
        targetOrientation.roll || 0,
        targetOrientation.pitch || 0,
        targetOrientation.yaw || 0,
        'XYZ'
      ));
      targetQuaternion = this.quaternions.targetQuat.clone();
    }

    // CCD iterations
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Apply current working angles to robot
      movableJoints.forEach(({ name }) => {
        robot.setJointValue(name, workingAngles[name]);
      });
      
      // Update robot matrices
      robot.updateMatrixWorld(true);
      
      // IMPORTANT: Use IK-provided position, NOT calculated position
      const virtualEndPos = new THREE.Vector3(
        currentPosition.x,
        currentPosition.y,
        currentPosition.z
      );
      
      // Check convergence
      const positionError = virtualEndPos.distanceTo(targetVec);
      
      // Check orientation convergence if target orientation provided
      let orientationError = 0;
      if (targetQuaternion && currentOrientation) {
        this.quaternions.currentQuat.set(
          currentOrientation.x,
          currentOrientation.y,
          currentOrientation.z,
          currentOrientation.w
        );
        orientationError = this.quaternions.currentQuat.angleTo(targetQuaternion);
      }
      
      console.log(`[CCD] Iteration ${iter}: pos_error = ${positionError.toFixed(4)}, orient_error = ${orientationError.toFixed(4)}`);
      
      // Combined convergence check
      const positionConverged = positionError < this.tolerance;
      const orientationConverged = !targetQuaternion || orientationError < (this.tolerance * 2);
      
      if (positionConverged && orientationConverged) {
        console.log('[CCD] Converged!');
        break;
      }
      
      // Process joints from end to base (reverse kinematic chain)
      const reversedJoints = [...movableJoints].reverse();
      
      for (const { name, joint } of reversedJoints) {
        // Get joint world position
        joint.getWorldPosition(this.vectors.jointPos);
        
        // Get joint axis in world space
        this.vectors.axis.copy(joint.axis || new THREE.Vector3(0, 0, 1));
        const worldQuat = new THREE.Quaternion();
        joint.getWorldQuaternion(worldQuat);
        this.vectors.axis.applyQuaternion(worldQuat).normalize();
        
        // IMPORTANT: Always use IK-provided position
        virtualEndPos.set(
          currentPosition.x,
          currentPosition.y,
          currentPosition.z
        );
        
        // Calculate vectors from joint to end effector and target
        this.vectors.toEnd.subVectors(virtualEndPos, this.vectors.jointPos);
        this.vectors.toTarget.subVectors(targetVec, this.vectors.jointPos);
        
        // Skip if vectors are too small
        if (this.vectors.toEnd.length() < 0.001 || this.vectors.toTarget.length() < 0.001) {
          continue;
        }
        
        // Normalize vectors
        this.vectors.toEnd.normalize();
        this.vectors.toTarget.normalize();
        
        // Calculate angle between vectors
        const dot = THREE.MathUtils.clamp(
          this.vectors.toEnd.dot(this.vectors.toTarget), 
          -0.999, 
          0.999
        );
        let positionAngle = Math.acos(dot);
        
        // Determine rotation direction using cross product
        this.vectors.cross.crossVectors(this.vectors.toEnd, this.vectors.toTarget);
        if (this.vectors.cross.dot(this.vectors.axis) < 0) {
          positionAngle = -positionAngle;
        }
        
        // Calculate orientation-based angle contribution if target orientation provided
        let orientationAngle = 0;
        if (targetQuaternion && this.orientationWeight > 0 && currentOrientation) {
          this.quaternions.currentQuat.set(
            currentOrientation.x,
            currentOrientation.y,
            currentOrientation.z,
            currentOrientation.w
          );
          const currentOrientError = this.quaternions.currentQuat.angleTo(targetQuaternion);
          
          if (currentOrientError > 0.01) { // ~0.6 degrees threshold
            // Distribute orientation error among joints
            const jointIndex = movableJoints.indexOf({ name, joint });
            const jointCount = movableJoints.length;
            const endEffectorWeight = (jointCount - jointIndex) / jointCount;
            
            orientationAngle = currentOrientError * this.orientationWeight * endEffectorWeight * 0.1;
          }
        }
        
        // Combine position and orientation angles
        let totalAngle = positionAngle;
        if (targetQuaternion) {
          const posWeight = positionError > 0.1 ? 0.8 : 0.3;
          const oriWeight = 1.0 - posWeight;
          totalAngle = (positionAngle * posWeight) + (orientationAngle * oriWeight);
        }
        
        // Apply damping
        totalAngle *= this.dampingFactor;
        
        // Apply angle limits
        totalAngle = THREE.MathUtils.clamp(totalAngle, -this.angleLimit, this.angleLimit);
        
        // Update angle
        workingAngles[name] += totalAngle;
        
        // Apply joint limits if they exist
        if (joint.limit) {
          workingAngles[name] = THREE.MathUtils.clamp(
            workingAngles[name],
            joint.limit.lower || -Math.PI,
            joint.limit.upper || Math.PI
          );
        }
      }
    }
    
    // Restore original angles for smooth animation
    console.log('[CCD] Restoring robot to starting position');
    movableJoints.forEach(({ name }) => {
      robot.setJointValue(name, startingAngles[name]);
    });
    robot.updateMatrixWorld(true);
    
    console.log('[CCD] Solution:', workingAngles);
    
    return workingAngles;
  }
}

export default CCD;