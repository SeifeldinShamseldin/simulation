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
      endEffectorLink,      // End effector link (provided by IK Context)
      currentPosition,      // This includes TCP offset!
      currentOrientation,
      targetPosition,
      targetOrientation
    } = params;

    if (!robot || !robot.joints) {
      console.error('[HalimIK] Invalid robot model');
      return null;
    }

    if (!endEffectorLink) {
      console.error('[HalimIK] End effector link not provided by IK Context');
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
    
    // Convert solution to joint angles object
    const solution = {};
    movableJoints.forEach((jointData, idx) => {
      solution[jointData.name] = xBest[idx];
    });
    
    console.log('[HalimIK] Solution:', solution);
    return solution;
  }

  /**
   * Calculate error between current and target positions/orientations
   */
  calculateError(endEffector, x, startingAngles, movableJoints, tcpOffset) {
    // Get current end effector position
    endEffector.getWorldPosition(this.vectors.currentPos);
    
    // Apply TCP offset
    this.vectors.virtualPos.copy(this.vectors.currentPos).add(
      new THREE.Vector3(tcpOffset.x, tcpOffset.y, tcpOffset.z)
    );
    
    // Position error
    const positionError = this.vectors.virtualPos.distanceToSquared(this.vectors.targetPos);
    
    // Orientation error if enabled
    let orientationError = 0;
    if (this.orientationMode && this.quaternions.targetQuat) {
      endEffector.getWorldQuaternion(this.quaternions.currentQuat);
      orientationError = this.quaternions.currentQuat.angleTo(this.quaternions.targetQuat);
    }
    
    // Regularization term to prevent large joint movements
    const regularization = movableJoints.reduce((sum, jointData, idx) => {
      const diff = x[idx] - startingAngles[jointData.name];
      return sum + diff * diff;
    }, 0) * this.regularizationParameter;
    
    // Combine errors
    return positionError + (orientationError * this.orientationCoeff) + regularization;
  }

  /**
   * Calculate gradient of error function
   */
  calculateGradient(robot, endEffector, x, startingAngles, movableJoints, tcpOffset) {
    const gradient = new Array(movableJoints.length).fill(0);
    const delta = 0.0001; // Small angle change for numerical gradient
    
    // Calculate gradient for each joint
    movableJoints.forEach((jointData, idx) => {
      // Store original angle
      const originalAngle = x[idx];
      
      // Calculate error with positive delta
      x[idx] = originalAngle + delta;
      robot.setJointValue(jointData.name, x[idx]);
      robot.updateMatrixWorld(true);
      const errorPlus = this.calculateError(endEffector, x, startingAngles, movableJoints, tcpOffset);
      
      // Calculate error with negative delta
      x[idx] = originalAngle - delta;
      robot.setJointValue(jointData.name, x[idx]);
      robot.updateMatrixWorld(true);
      const errorMinus = this.calculateError(endEffector, x, startingAngles, movableJoints, tcpOffset);
      
      // Restore original angle
      x[idx] = originalAngle;
      robot.setJointValue(jointData.name, x[idx]);
      robot.updateMatrixWorld(true);
      
      // Calculate gradient using central difference
      gradient[idx] = (errorPlus - errorMinus) / (2 * delta);
    });
    
    return gradient;
  }
}

export default HalimIK;