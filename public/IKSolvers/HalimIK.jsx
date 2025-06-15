import * as THREE from 'three';

class HalimIK {
  static metadata = {
    name: "Halim's Gradient Descent IK",
    description: "Gradient-based IK solver using IK-provided end effector",
    author: "Halim",
    version: "4.0.0"
  };

  static defaultConfig = {
    regularizationParameter: 0.001,
    maxIterations: 100,
    tolerance: 0.001,
    orientationMode: null, // null, 'X', 'Y', 'Z', 'all'
    noPosition: false,
    orientationCoeff: 0.5,
    learningRate: 0.1
  };

  constructor(config = {}) {
    Object.assign(this, HalimIK.defaultConfig, config);
    
    // Reusable objects
    this.vectors = {
      targetPos: new THREE.Vector3(),
      currentPos: new THREE.Vector3(),
      virtualPos: new THREE.Vector3(),
      gradient: new THREE.Vector3()
    };
    
    this.matrices = {
      targetMatrix: new THREE.Matrix4(),
      currentMatrix: new THREE.Matrix4()
    };
    
    this.quaternions = {
      targetQuat: new THREE.Quaternion(),
      currentQuat: new THREE.Quaternion()
    };
  }

  getConfig() {
    return {
      regularizationParameter: this.regularizationParameter,
      maxIterations: this.maxIterations,
      tolerance: this.tolerance,
      orientationMode: this.orientationMode,
      noPosition: this.noPosition,
      orientationCoeff: this.orientationCoeff,
      learningRate: this.learningRate
    };
  }

  configure(config) {
    Object.assign(this, config);
  }

  /**
   * Standardized solve interface - uses IK-provided positions
   */
  async solve(params) {
    const {
      robot,
      currentPosition,  // This includes TCP offset!
      currentOrientation,
      targetPosition,
      targetOrientation
    } = params;

    if (!robot || !robot.joints) {
      console.error('[HalimIK] Invalid robot model');
      return null;
    }

    console.log('[HalimIK] Starting gradient descent solve');
    console.log('[HalimIK] IK current position (includes TCP):', currentPosition);
    console.log('[HalimIK] Target position:', targetPosition);
    console.log('[HalimIK] Orientation mode:', this.orientationMode);

    // Store IK-provided position for error calculations
    const ikPosition = {
      x: currentPosition.x,
      y: currentPosition.y,
      z: currentPosition.z
    };

    // Find end effector link (for joint chain calculation only)
    const endEffectorLink = this.findEndEffectorLink(robot);
    if (!endEffectorLink) {
      console.error('[HalimIK] Could not find end effector link');
      return null;
    }

    // Calculate initial offset between IK position and robot end effector
    endEffectorLink.getWorldPosition(this.vectors.currentPos);
    const tcpOffset = {
      x: ikPosition.x - this.vectors.currentPos.x,
      y: ikPosition.y - this.vectors.currentPos.y,
      z: ikPosition.z - this.vectors.currentPos.z
    };
    console.log('[HalimIK] TCP offset detected:', tcpOffset);

    // Get movable joints
    const movableJoints = [];
    const startingAngles = {};
    const jointLimits = {};
    
    Object.entries(robot.joints).forEach(([name, joint]) => {
      if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
        movableJoints.push({
          name,
          joint,
          index: movableJoints.length
        });
        
        startingAngles[name] = joint.angle;
        jointLimits[name] = {
          lower: joint.limit?.lower ?? -Math.PI,
          upper: joint.limit?.upper ?? Math.PI
        };
      }
    });

    if (movableJoints.length === 0) {
      console.warn('[HalimIK] No movable joints found');
      return null;
    }

    console.log(`[HalimIK] Found ${movableJoints.length} movable joints`);

    // Initialize optimization
    const x = movableJoints.map(j => startingAngles[j.name]);
    const xBest = [...x];
    let bestError = Infinity;
    
    // Set target position
    this.vectors.targetPos.set(
      targetPosition.x,
      targetPosition.y,
      targetPosition.z
    );
    
    // Set target orientation if provided
    if (targetOrientation && this.orientationMode) {
      this.matrices.targetMatrix.makeRotationFromEuler(new THREE.Euler(
        targetOrientation.roll || 0,
        targetOrientation.pitch || 0,
        targetOrientation.yaw || 0,
        'XYZ'
      ));
      this.quaternions.targetQuat.setFromRotationMatrix(this.matrices.targetMatrix);
    }

    // Gradient descent optimization
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Apply current angles
      movableJoints.forEach((jointData, idx) => {
        robot.setJointValue(jointData.name, x[idx]);
      });
      
      // Update robot
      robot.updateMatrixWorld(true);
      
      // Calculate error using TCP-aware position
      const error = this.calculateError(
        endEffectorLink,
        x,
        startingAngles,
        movableJoints,
        tcpOffset
      );
      
      // Track best solution
      if (error < bestError) {
        bestError = error;
        xBest.forEach((val, idx) => xBest[idx] = x[idx]);
      }
      
      // Check convergence
      if (error < this.tolerance) {
        console.log(`[HalimIK] Converged at iteration ${iter} with error ${error}`);
        break;
      }
      
      // Calculate gradient
      const gradient = this.calculateGradient(
        robot,
        endEffectorLink,
        x,
        startingAngles,
        movableJoints,
        tcpOffset
      );
      
      // Update with adaptive learning rate
      let stepSize = this.learningRate;
      let improved = false;
      
      for (let attempt = 0; attempt < 5; attempt++) {
        const xNew = [...x];
        
        // Apply gradient step
        movableJoints.forEach((jointData, idx) => {
          xNew[idx] = x[idx] - stepSize * gradient[idx];
          
          // Apply limits
          const limits = jointLimits[jointData.name];
          xNew[idx] = THREE.MathUtils.clamp(xNew[idx], limits.lower, limits.upper);
        });
        
        // Test new position
        movableJoints.forEach((jointData, idx) => {
          robot.setJointValue(jointData.name, xNew[idx]);
        });
        robot.updateMatrixWorld(true);
        
        const newError = this.calculateError(
          endEffectorLink,
          xNew,
          startingAngles,
          movableJoints,
          tcpOffset
        );
        
        if (newError < error) {
          x.forEach((val, idx) => x[idx] = xNew[idx]);
          improved = true;
          break;
        } else {
          stepSize *= 0.5;
        }
      }
      
      if (!improved) {
        console.log(`[HalimIK] No improvement at iteration ${iter}`);
        break;
      }
      
      if (iter % 10 === 0) {
        console.log(`[HalimIK] Iteration ${iter}: error = ${error.toFixed(6)} (using TCP-aware position)`);
      }
    }
    
    // Restore original angles for smooth animation
    movableJoints.forEach(({ name }) => {
      robot.setJointValue(name, startingAngles[name]);
    });
    robot.updateMatrixWorld(true);
    
    // Return best solution
    const solution = {};
    movableJoints.forEach((jointData, idx) => {
      solution[jointData.name] = xBest[idx];
    });
    
    console.log('[HalimIK] Solution found with error:', bestError);
    console.log('[HalimIK] Joint values:', solution);
    
    return solution;
  }

  calculateError(endEffector, x, startingAngles, movableJoints, tcpOffset) {
    let totalError = 0;
    
    // Position error - use TCP-aware position
    if (!this.noPosition) {
      // Get robot's end effector position
      endEffector.getWorldPosition(this.vectors.currentPos);
      
      // Apply TCP offset to get virtual position
      this.vectors.virtualPos.set(
        this.vectors.currentPos.x + tcpOffset.x,
        this.vectors.currentPos.y + tcpOffset.y,
        this.vectors.currentPos.z + tcpOffset.z
      );
      
      const posError = this.vectors.virtualPos.distanceTo(this.vectors.targetPos);
      totalError += posError * posError;
    }
    
    // Orientation error
    if (this.orientationMode && this.quaternions.targetQuat) {
      endEffector.getWorldQuaternion(this.quaternions.currentQuat);
      const orientError = this.quaternions.currentQuat.angleTo(this.quaternions.targetQuat);
      totalError += this.orientationCoeff * orientError * orientError;
    }
    
    // Regularization
    if (this.regularizationParameter > 0) {
      let regularization = 0;
      movableJoints.forEach((jointData, idx) => {
        const diff = x[idx] - startingAngles[jointData.name];
        regularization += diff * diff;
      });
      totalError += this.regularizationParameter * regularization;
    }
    
    return Math.sqrt(totalError);
  }

  calculateGradient(robot, endEffector, x, startingAngles, movableJoints, tcpOffset) {
    const gradient = new Array(x.length);
    const h = 0.001;
    
    const currentError = this.calculateError(
      endEffector,
      x,
      startingAngles,
      movableJoints,
      tcpOffset
    );
    
    movableJoints.forEach((jointData, idx) => {
      const originalValue = x[idx];
      
      // Forward difference
      x[idx] = originalValue + h;
      robot.setJointValue(jointData.name, x[idx]);
      robot.updateMatrixWorld(true);
      
      const errorPlus = this.calculateError(
        endEffector,
        x,
        startingAngles,
        movableJoints,
        tcpOffset
      );
      
      gradient[idx] = (errorPlus - currentError) / h;
      
      // Restore
      x[idx] = originalValue;
      robot.setJointValue(jointData.name, x[idx]);
    });
    
    robot.updateMatrixWorld(true);
    return gradient;
  }

  /**
   * Find the robot's end effector link (used for joint chain only)
   */
  findEndEffectorLink(robot) {
    // Look for common end effector names
    const endEffectorNames = [
      'tool0', 'ee_link', 'end_effector', 'gripper_link',
      'link_6', 'link_7', 'wrist_3_link', 'tool_link'
    ];
    
    for (const name of endEffectorNames) {
      if (robot.links && robot.links[name]) {
        return robot.links[name];
      }
    }
    
    // Fallback: find deepest link
    let deepestLink = null;
    let maxDepth = 0;
    
    const findDeepest = (obj, depth = 0) => {
      if (obj.isURDFLink && depth > maxDepth) {
        maxDepth = depth;
        deepestLink = obj;
      }
      obj.children?.forEach(child => findDeepest(child, depth + 1));
    };
    
    findDeepest(robot);
    return deepestLink;
  }
}

export default HalimIK;