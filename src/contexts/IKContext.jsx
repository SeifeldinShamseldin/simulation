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
    effectiveEndEffector,
    isReady: endEffectorReady,
    hasTCP,
    effectiveType,
    toolInfo,
    forceUpdate: forceEndEffectorUpdate
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

  // Initialize target position from current position when robot/TCP changes
  useEffect(() => {
    if (currentPosition && endEffectorReady) {
      // Only update if target is at origin (first time or reset)
      if (targetPosition.x === 0 && targetPosition.y === 0 && targetPosition.z === 0) {
        setTargetPosition({
          x: currentPosition.x,
          y: currentPosition.y,
          z: currentPosition.z
        });
        console.log(`[IK:${activeRobotId}] Initialized target position from ${effectiveType} end effector:`, currentPosition);
      }
    }
  }, [currentPosition, endEffectorReady, activeRobotId, effectiveType, targetPosition]);

  // Listen for TCP changes and update status
  useEffect(() => {
    if (hasTCP && toolInfo) {
      setSolverStatus(`Ready (TCP: ${toolInfo.name})`);
    } else {
      setSolverStatus('Ready');
    }
  }, [hasTCP, toolInfo]);

  // Listen for TCP transform changes and update immediately
  useEffect(() => {
    const handleTCPTransformChange = (data) => {
      if (data.robotId === activeRobotId && hasTCP) {
        console.log(`[IK:${activeRobotId}] TCP transform changed, updating IK system`);
        
        // Force end effector update first
        forceEndEffectorUpdate();
        
        // Update status to reflect TCP change
        setSolverStatus(`Ready (TCP: ${toolInfo?.name || 'Tool'} - Transform Updated)`);
        
        // Reset status after a delay
        setTimeout(() => {
          setSolverStatus(hasTCP && toolInfo ? `Ready (TCP: ${toolInfo.name})` : 'Ready');
        }, 2000);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:transform-changed', handleTCPTransformChange);
    return () => unsubscribe();
  }, [activeRobotId, hasTCP, toolInfo, forceEndEffectorUpdate]);

  const solve = useCallback(async (targetPos) => {
    if (!robot || !isReady || !endEffectorReady) return null;
    
    const endEffectorObject = effectiveEndEffector;
    if (!endEffectorObject) return null;
    
    const solver = solversRef.current[currentSolver];
    if (!solver) {
      setSolverStatus(`Unknown solver: ${currentSolver}`);
      return null;
    }
    
    console.log(`[IK:${activeRobotId}] Solving with ${currentSolver} for ${effectiveType} end effector`);
    
    return await solver.solve(robot, targetPos, (robot) => effectiveEndEffector);
  }, [robot, isReady, endEffectorReady, currentSolver, effectiveEndEffector, activeRobotId, effectiveType]);

  const executeIK = useCallback(async (target, options = {}) => {
    if (!robot || !isReady || isAnimating) return false;
    
    try {
      setIsAnimating(true);
      
      // Enhanced status with TCP info
      const endEffectorInfo = hasTCP ? ` (TCP: ${toolInfo?.name || 'Tool'})` : '';
      setSolverStatus(`Solving with ${currentSolver}${endEffectorInfo}...`);
      
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
        
        // Force end effector update after immediate joint changes
        setTimeout(() => forceEndEffectorUpdate(), 10);
      }
      
      const statusSuffix = hasTCP ? ` (TCP: ${toolInfo?.name || 'Tool'})` : '';
      setSolverStatus(solution.converged ? 
        `Converged${statusSuffix}` : 
        `Best effort - did not fully converge${statusSuffix}`);
      
      return true;
      
    } catch (error) {
      setSolverStatus(`Error: ${error.message}`);
      return false;
    } finally {
      setIsAnimating(false);
    }
  }, [robot, isReady, isAnimating, solve, currentSolver, hasTCP, toolInfo, forceEndEffectorUpdate]);

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
          
          // Force end effector update after animation completes
          setTimeout(() => forceEndEffectorUpdate(), 10);
          
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
        
        // Update end effector during animation
        forceEndEffectorUpdate();
        
        animationRef.current.animationId = requestAnimationFrame(animate);
      };
      
      animationRef.current.animationId = requestAnimationFrame(animate);
    });
  }, [robot, forceEndEffectorUpdate]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current.animationId) {
      cancelAnimationFrame(animationRef.current.animationId);
      animationRef.current.animationId = null;
    }
    setIsAnimating(false);
    
    // Update status with TCP info
    const statusSuffix = hasTCP ? ` (TCP: ${toolInfo?.name || 'Tool'})` : '';
    setSolverStatus(`Ready${statusSuffix}`);
  }, [hasTCP, toolInfo]);

  const value = {
    // State
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    activeRobotId,
    currentSolver,
    availableSolvers: Object.keys(solversRef.current),
    
    // TCP awareness
    hasTCP,
    effectiveType,
    toolInfo,
    
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