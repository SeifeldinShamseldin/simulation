// src/contexts/IKContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useRobotControl } from './hooks/useRobotControl';
import EventBus from '../utils/EventBus';
import CCDSolver from '../components/controls/IKSolvers/CCD';
import { useEndEffector } from './hooks/useEndEffector';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const { 
    position: currentPosition, 
    getEndEffectorObject,
    isReady: endEffectorReady 
  } = useEndEffector();
  
  // State
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Ready');
  const [currentSolver, setCurrentSolver] = useState('CCD');
  
  // Available solvers
  const solversRef = useRef({
    CCD: new CCDSolver(),
    // Future: FABRIK: new FABRIKSolver(),
    // Future: Jacobian: new JacobianSolver(),
  });
  
  // Animation state
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
    if (!robot || !isReady || !endEffectorReady) return null;
    
    const endEffectorObject = getEndEffectorObject();
    if (!endEffectorObject) return null;
    
    const solver = solversRef.current[currentSolver];
    if (!solver) {
      setSolverStatus(`Unknown solver: ${currentSolver}`);
      return null;
    }
    
    return await solver.solve(robot, targetPos, () => endEffectorObject);
  }, [robot, isReady, endEffectorReady, currentSolver, getEndEffectorObject]);

  const executeIK = useCallback(async (target, options = {}) => {
    if (!robot || !isReady || isAnimating) return false;
    
    try {
      setIsAnimating(true);
      setSolverStatus(`Solving with ${currentSolver}...`);
      
      const targetPos = target instanceof THREE.Vector3 ? 
        target : new THREE.Vector3(target.x, target.y, target.z);
      
      const solution = await solve(targetPos);
      if (!solution) {
        setSolverStatus('Failed to solve');
        return false;
      }
      
      animationRef.current = solution;
      
      if (options.animate !== false) {
        await animateToSolution(solution.goalAngles, options.duration || 1000);
      } else {
        // Apply immediately
        Object.entries(solution.goalAngles).forEach(([name, angle]) => {
          robot.setJointValue(name, angle);
        });
      }
      
      setSolverStatus(solution.converged ? 'Converged' : 'Best effort - did not fully converge');
      return true;
      
    } catch (error) {
      setSolverStatus(`Error: ${error.message}`);
      return false;
    } finally {
      setIsAnimating(false);
    }
  }, [robot, isReady, isAnimating, solve, currentSolver]);

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
    currentSolver,
    availableSolvers: Object.keys(solversRef.current),
    
    // Methods
    setTargetPosition,
    executeIK,
    stopAnimation,
    setCurrentSolver,
    
    // Solver configuration
    configureSolver: (solverName, settings) => {
      const solver = solversRef.current[solverName];
      if (solver && solver.configure) {
        solver.configure(settings);
      }
    },
    
    // Get current solver settings
    getSolverSettings: (solverName) => {
      const solver = solversRef.current[solverName || currentSolver];
      return solver ? {
        maxIterations: solver.maxIterations,
        tolerance: solver.tolerance,
        dampingFactor: solver.dampingFactor,
        angleLimit: solver.angleLimit
      } : null;
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