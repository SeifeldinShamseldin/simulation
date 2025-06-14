import * as THREE from 'three';

class HalimIKSolver {
  constructor(options = {}) {
    // Solver parameters
    this.regularizationParameter = options.regularizationParameter || 0.001;
    this.maxIterations = options.maxIterations || 100;
    this.tolerance = options.tolerance || 0.001;
    this.orientationMode = options.orientationMode || null; // null, 'X', 'Y', 'Z', 'all'
    this.noPosition = options.noPosition || false;
    this.orientationCoeff = options.orientationCoeff || 0.5;
    this.learningRate = options.learningRate || 0.1;
    
    // Reusable objects to reduce GC
    this.matrices = {
      targetMatrix: new THREE.Matrix4(),
      currentMatrix: new THREE.Matrix4(),
      tempMatrix: new THREE.Matrix4()
    };
    
    this.vectors = {
      targetPos: new THREE.Vector3(),
      currentPos: new THREE.Vector3(),
      targetAxis: new THREE.Vector3(),
      currentAxis: new THREE.Vector3(),
      gradient: new THREE.Vector3(),
      tempVec: new THREE.Vector3()
    };
    
    this.quaternions = {
      targetQuat: new THREE.Quaternion(),
      currentQuat: new THREE.Quaternion(),
      tempQuat: new THREE.Quaternion()
    };
  }

  /**
   * Solve IK using optimization approach similar to scipy.optimize.least_squares
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
    
    console.log('[HalimIK] Starting optimization-based IK solve');
    console.log('[HalimIK] Target position:', targetPos);
    console.log('[HalimIK] Target orientation:', targetOrientation);
    console.log('[HalimIK] Orientation mode:', this.orientationMode);
    
    // Get the actual robot end effector
    const realEndEffector = robot.userData?.endEffectorLink;
    if (!realEndEffector) {
      console.error('[HalimIK] No end effector link found');
      return null;
    }
    
    // Get movable joints
    const movableJoints = [];
    const jointLimits = {};
    const startingAngles = {};
    
    if (robot.joints) {
      Object.entries(robot.joints).forEach(([name, joint]) => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          movableJoints.push({
            name: name,
            joint: joint,
            index: movableJoints.length
          });
          
          // Store joint limits
          jointLimits[name] = {
            lower: joint.limit?.lower ?? -Math.PI,
            upper: joint.limit?.upper ?? Math.PI
          };
          
          // Store starting angles (current position)
          startingAngles[name] = joint.angle;
        }
      });
    }
    
    if (movableJoints.length === 0) {
      console.warn('[HalimIK] No movable joints found');
      return null;
    }
    
    console.log(`[HalimIK] Found ${movableJoints.length} movable joints`);
    console.log('[HalimIK] Starting angles:', startingAngles);
    
    // Initialize optimization variables
    const x = movableJoints.map(j => startingAngles[j.name]);
    const xBest = [...x];
    let bestError = Infinity;
    
    // Set up target matrix for orientation
    this.matrices.targetMatrix.makeRotationFromEuler(new THREE.Euler(
      targetOrientation?.roll || 0,
      targetOrientation?.pitch || 0,
      targetOrientation?.yaw || 0,
      'XYZ'
    ));
    
    // Optimization loop (gradient descent)
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Apply current joint values
      movableJoints.forEach((jointData, idx) => {
        robot.setJointValue(jointData.name, x[idx]);
      });
      
      // Update matrices
      robot.updateMatrixWorld(true);
      
      // Calculate current error
      const error = this.calculateError(
        realEndEffector,
        targetPos,
        targetOrientation,
        x,
        startingAngles,
        movableJoints
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
      
      // Calculate gradient using finite differences
      const gradient = this.calculateGradient(
        robot,
        realEndEffector,
        targetPos,
        targetOrientation,
        x,
        startingAngles,
        movableJoints
      );
      
      // Update joint values using gradient descent with adaptive learning rate
      let stepSize = this.learningRate;
      let improved = false;
      
      for (let attempt = 0; attempt < 5; attempt++) {
        const xNew = [...x];
        
        // Apply gradient step
        movableJoints.forEach((jointData, idx) => {
          xNew[idx] = x[idx] - stepSize * gradient[idx];
          
          // Apply joint limits
          const limits = jointLimits[jointData.name];
          xNew[idx] = THREE.MathUtils.clamp(xNew[idx], limits.lower, limits.upper);
        });
        
        // Test new position
        movableJoints.forEach((jointData, idx) => {
          robot.setJointValue(jointData.name, xNew[idx]);
        });
        robot.updateMatrixWorld(true);
        
        const newError = this.calculateError(
          realEndEffector,
          targetPos,
          targetOrientation,
          xNew,
          startingAngles,
          movableJoints
        );
        
        if (newError < error) {
          // Accept the step
          x.forEach((val, idx) => x[idx] = xNew[idx]);
          improved = true;
          break;
        } else {
          // Reduce step size and try again
          stepSize *= 0.5;
        }
      }
      
      if (!improved) {
        console.log(`[HalimIK] No improvement at iteration ${iter}, stopping`);
        break;
      }
      
      if (iter % 10 === 0) {
        console.log(`[HalimIK] Iteration ${iter}: error = ${error.toFixed(6)}`);
      }
    }
    
    // Restore robot to starting position for smooth animation
    console.log('[HalimIK] Restoring robot to starting position');
    Object.entries(startingAngles).forEach(([name, angle]) => {
      if (robot.joints[name]) {
        robot.setJointValue(name, angle);
      }
    });
    robot.updateMatrixWorld(true);
    
    // Return best solution found
    const solution = {};
    movableJoints.forEach((jointData, idx) => {
      solution[jointData.name] = xBest[idx];
    });
    
    console.log('[HalimIK] Solution found with error:', bestError);
    console.log('[HalimIK] Final joint values:', solution);
    
    return solution;
  }

  /**
   * Calculate the error function for optimization
   */
  calculateError(endEffector, targetPos, targetOrientation, x, startingAngles, movableJoints) {
    let totalError = 0;
    
    // Position error (if not disabled)
    if (!this.noPosition) {
      endEffector.getWorldPosition(this.vectors.currentPos);
      const posError = this.vectors.currentPos.distanceTo(targetPos);
      totalError += posError * posError;
    }
    
    // Orientation error (if enabled)
    if (this.orientationMode && targetOrientation) {
      const orientError = this.calculateOrientationError(endEffector, targetOrientation);
      totalError += this.orientationCoeff * orientError * orientError;
    }
    
    // Regularization term (deviation from starting position)
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

  /**
   * Calculate orientation error based on mode
   */
  calculateOrientationError(endEffector, targetOrientation) {
    endEffector.getWorldQuaternion(this.quaternions.currentQuat);
    
    // Convert current quaternion to matrix
    this.matrices.currentMatrix.makeRotationFromQuaternion(this.quaternions.currentQuat);
    
    // Set up target rotation matrix
    this.matrices.targetMatrix.makeRotationFromEuler(new THREE.Euler(
      targetOrientation.roll || 0,
      targetOrientation.pitch || 0,
      targetOrientation.yaw || 0,
      'XYZ'
    ));
    
    let error = 0;
    
    switch (this.orientationMode) {
      case 'X':
        // Compare X axes
        this.vectors.targetAxis.set(1, 0, 0).applyMatrix4(this.matrices.targetMatrix);
        this.vectors.currentAxis.set(1, 0, 0).applyMatrix4(this.matrices.currentMatrix);
        error = 1 - this.vectors.currentAxis.dot(this.vectors.targetAxis);
        break;
        
      case 'Y':
        // Compare Y axes
        this.vectors.targetAxis.set(0, 1, 0).applyMatrix4(this.matrices.targetMatrix);
        this.vectors.currentAxis.set(0, 1, 0).applyMatrix4(this.matrices.currentMatrix);
        error = 1 - this.vectors.currentAxis.dot(this.vectors.targetAxis);
        break;
        
      case 'Z':
        // Compare Z axes
        this.vectors.targetAxis.set(0, 0, 1).applyMatrix4(this.matrices.targetMatrix);
        this.vectors.currentAxis.set(0, 0, 1).applyMatrix4(this.matrices.currentMatrix);
        error = 1 - this.vectors.currentAxis.dot(this.vectors.targetAxis);
        break;
        
      case 'all':
        // Compare all axes (Frobenius norm of rotation matrix difference)
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const diff = this.matrices.currentMatrix.elements[i * 4 + j] - 
                        this.matrices.targetMatrix.elements[i * 4 + j];
            error += diff * diff;
          }
        }
        error = Math.sqrt(error);
        break;
        
      default:
        // Use quaternion angle difference
        this.quaternions.targetQuat.setFromRotationMatrix(this.matrices.targetMatrix);
        error = this.quaternions.currentQuat.angleTo(this.quaternions.targetQuat);
    }
    
    return error;
  }

  /**
   * Calculate gradient using finite differences
   */
  calculateGradient(robot, endEffector, targetPos, targetOrientation, x, startingAngles, movableJoints) {
    const gradient = new Array(x.length);
    const h = 0.001; // Small step for finite difference
    
    // Current error
    const currentError = this.calculateError(
      endEffector,
      targetPos,
      targetOrientation,
      x,
      startingAngles,
      movableJoints
    );
    
    // Calculate partial derivatives
    movableJoints.forEach((jointData, idx) => {
      // Save current value
      const originalValue = x[idx];
      
      // Forward difference
      x[idx] = originalValue + h;
      robot.setJointValue(jointData.name, x[idx]);
      robot.updateMatrixWorld(true);
      
      const errorPlus = this.calculateError(
        endEffector,
        targetPos,
        targetOrientation,
        x,
        startingAngles,
        movableJoints
      );
      
      // Calculate gradient
      gradient[idx] = (errorPlus - currentError) / h;
      
      // Restore original value
      x[idx] = originalValue;
      robot.setJointValue(jointData.name, x[idx]);
    });
    
    // Update matrices after gradient calculation
    robot.updateMatrixWorld(true);
    
    return gradient;
  }

  /**
   * Update solver settings
   */
  configure(settings) {
    Object.assign(this, settings);
  }
}

export default HalimIKSolver;