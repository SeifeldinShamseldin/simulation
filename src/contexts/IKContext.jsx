// src/contexts/IKContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useRobotControl } from './hooks/useRobotControl';
import EventBus from '../utils/EventBus';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  
  // State
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Ready');
  
  // Refs for solver state
  const solverSettingsRef = useRef({
    maxIterations: 10,
    tolerance: 0.01,
    dampingFactor: 0.5
  });
  
  const animationRef = useRef({
    startAngles: {},
    goalAngles: {},
    animationId: null
  });

  // Temporary vectors for calculations (reused to reduce GC)
  const vectorsRef = useRef({
    worldEndPos: new THREE.Vector3(),
    jointPos: new THREE.Vector3(),
    toEnd: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    tempQuat: new THREE.Quaternion()
  });

  // Update current position periodically
  useEffect(() => {
    if (!robot || !isReady) return;
    
    const updatePosition = () => {
      const endEffector = findEndEffector(robot);
      if (endEffector) {
        const worldPos = new THREE.Vector3();
        endEffector.getWorldPosition(worldPos);
        setCurrentPosition({
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z
        });
      }
    };
    
    const interval = setInterval(updatePosition, 100);
    updatePosition(); // Initial update
    
    return () => clearInterval(interval);
  }, [robot, isReady]);

  // Reset target when robot changes
  useEffect(() => {
    if (robot && isReady) {
      const endEffector = findEndEffector(robot);
      if (endEffector) {
        const worldPos = new THREE.Vector3();
        endEffector.getWorldPosition(worldPos);
        setTargetPosition({
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z
        });
      }
    }
  }, [robot, activeRobotId, isReady]);

  // Core IK methods
  const findEndEffector = useCallback((robot) => {
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
      Object.values(robot.joints).forEach(joint => {
        joint.traverse(child => {
          if (child.parent && child.parent.isURDFLink) {
            linksWithChildJoints.add(child.parent.name);
          }
        });
      });
      
      const leafLinks = [];
      Object.values(robot.links).forEach(link => {
        if (!linksWithChildJoints.has(link.name)) {
          leafLinks.push(link);
        }
      });
      
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
  }, []);

  const solve = useCallback(async (targetPos) => {
    if (!robot || !isReady) return null;
    
    // Store start angles
    animationRef.current.startAngles = {};
    Object.values(robot.joints).forEach(joint => {
      animationRef.current.startAngles[joint.name] = joint.angle || 0;
    });
    
    // Use CCD (Cyclic Coordinate Descent) algorithm
    for (let iter = 0; iter < solverSettingsRef.current.maxIterations; iter++) {
      const endEffector = findEndEffector(robot);
      if (!endEffector) return null;
      
      const currentPos = new THREE.Vector3();
      endEffector.getWorldPosition(currentPos);
      
      // Check convergence
      const distanceToTarget = currentPos.distanceTo(targetPos);
      if (distanceToTarget < solverSettingsRef.current.tolerance) {
        break;
      }
      
      // Process joints
      for (const jointName in animationRef.current.startAngles) {
        const joint = robot.joints[jointName];
        if (joint.jointType === 'fixed') continue;
        
        // Get joint world position and axis
        joint.getWorldPosition(vectorsRef.current.jointPos);
        vectorsRef.current.axis.copy(joint.axis)
          .applyQuaternion(joint.getWorldQuaternion(vectorsRef.current.tempQuat))
          .normalize();
        
        // Vectors from joint to current end effector and target
        vectorsRef.current.toEnd.copy(currentPos).sub(vectorsRef.current.jointPos);
        vectorsRef.current.toTarget.copy(targetPos).sub(vectorsRef.current.jointPos);
        
        if (vectorsRef.current.toEnd.length() < 0.001 || vectorsRef.current.toTarget.length() < 0.001) continue;
        
        vectorsRef.current.toEnd.normalize();
        vectorsRef.current.toTarget.normalize();
        
        // Calculate angle
        const dotProduct = THREE.MathUtils.clamp(vectorsRef.current.toEnd.dot(vectorsRef.current.toTarget), -0.999, 0.999);
        let angle = Math.acos(dotProduct);
        
        // Determine direction
        const cross = vectorsRef.current.toEnd.clone().cross(vectorsRef.current.toTarget);
        if (cross.dot(vectorsRef.current.axis) < 0) {
          angle = -angle;
        }
        
        // Apply damping
        angle *= solverSettingsRef.current.dampingFactor;
        
        // Limit angle change per iteration
        angle = THREE.MathUtils.clamp(angle, -0.2, 0.2);
        
        // Update joint
        let newAngle = joint.angle + angle;
        
        // Apply limits
        if (!joint.ignoreLimits && joint.limit) {
          newAngle = THREE.MathUtils.clamp(newAngle, joint.limit.lower, joint.limit.upper);
        }
        
        robot.setJointValue(joint.name, newAngle);
        joint.updateMatrixWorld(true);
      }
    }
    
    // Store goal angles
    animationRef.current.goalAngles = {};
    Object.values(robot.joints).forEach(joint => {
      animationRef.current.goalAngles[joint.name] = joint.angle || 0;
    });
    
    // Reset to start for animation
    Object.values(robot.joints).forEach(joint => {
      robot.setJointValue(joint.name, animationRef.current.startAngles[joint.name]);
    });
    
    return animationRef.current.goalAngles;
  }, [robot, isReady, findEndEffector]);

  const executeIK = useCallback(async (target, options = {}) => {
    if (!robot || !isReady || isAnimating) return false;
    
    try {
      setIsAnimating(true);
      setSolverStatus('Solving...');
      
      const targetPos = target instanceof THREE.Vector3 ? 
        target : new THREE.Vector3(target.x, target.y, target.z);
      
      const solution = await solve(targetPos);
      if (!solution) {
        setSolverStatus('Failed to solve');
        return false;
      }
      
      if (options.animate !== false) {
        await animateToSolution(solution, options.duration || 1000);
      }
      
      setSolverStatus('Success');
      return true;
      
    } catch (error) {
      setSolverStatus(`Error: ${error.message}`);
      return false;
    } finally {
      setIsAnimating(false);
    }
  }, [robot, isReady, isAnimating, solve]);

  const animateToSolution = useCallback((solution, duration) => {
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        
        if (progress >= 1.0) {
          // Apply final angles
          Object.entries(solution).forEach(([jointName, angle]) => {
            robot.setJointValue(jointName, angle);
          });
          resolve();
          return;
        }
        
        // Ease progress
        const easedProgress = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        
        // Interpolate angles
        Object.entries(animationRef.current.startAngles).forEach(([jointName, startAngle]) => {
          const goalAngle = solution[jointName];
          const currentAngle = startAngle + (goalAngle - startAngle) * easedProgress;
          robot.setJointValue(jointName, currentAngle);
        });
        
        animationRef.current.animationId = requestAnimationFrame(animate);
      };
      
      animationRef.current.animationId = requestAnimationFrame(animate);
    });
  }, [robot]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current.animationId) {
      cancelAnimationFrame(animationRef.current.animationId);
      animationRef.current.animationId = null;
    }
    setIsAnimating(false);
  }, []);

  const value = {
    // State
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    activeRobotId,
    
    // Methods
    setTargetPosition,
    executeIK,
    stopAnimation,
    
    // Settings
    configureSolver: (settings) => {
      solverSettingsRef.current = { ...solverSettingsRef.current, ...settings };
    }
  };

  return (
    <IKContext.Provider value={value}>
      {children}
    </IKContext.Provider>
  );
};

export const useIK = () => {
  const context = useContext(IKContext);
  if (!context) {
    throw new Error('useIK must be used within an IKProvider');
  }
  return context;
};

export default IKContext; 