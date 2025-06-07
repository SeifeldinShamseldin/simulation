// src/contexts/IKContext.jsx - Updated to work with simplified TCP system
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useRobot } from './RobotContext';
import { useTCP } from './hooks/useTCP';
import EventBus from '../utils/EventBus';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { activeRobotId, getRobot } = useRobot();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Initializing...');
  const [currentSolver, setCurrentSolver] = useState('CCD');
  const [availableSolvers, setAvailableSolvers] = useState(['CCD']);
  const solversRef = useRef({});
  const isReady = useRef(false);

  // Initialize solvers
  useEffect(() => {
    const initializeSolvers = async () => {
      try {
        const { default: CCD } = await import('../components/controls/IKSolvers/CCD');
        
        solversRef.current = {
          CCD: new CCD()
        };
        
        isReady.current = true;
        setSolverStatus('Ready');
      } catch (error) {
        console.error('Error initializing IK solvers:', error);
        setSolverStatus('Error initializing solvers');
      }
    };
    
    initializeSolvers();
  }, []);

  // Listen for TCP changes and update status
  useEffect(() => {
    if (isUsingTCP) {
      setSolverStatus(`Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})`);
    } else {
      setSolverStatus('Ready (Robot End Effector)');
    }
  }, [isUsingTCP, getEndEffectorInfo]);

  // Listen for TCP end effector updates
  useEffect(() => {
    const handleTCPEndEffectorUpdate = (data) => {
      if (data.robotId === activeRobotId) {
        const endEffectorType = data.hasTCP ? 'TCP' : 'Robot';
        setSolverStatus(`Ready (${endEffectorType} End Effector - Position Updated)`);
        
        // Reset status after a delay
        setTimeout(() => {
          setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
        }, 2000);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-updated', handleTCPEndEffectorUpdate);
    return () => unsubscribe();
  }, [activeRobotId, isUsingTCP, getEndEffectorInfo]);

  // Simplified end effector getter - creates virtual end effector at final position
  const getEffectiveEndEffector = useCallback((robot) => {
    // Create a virtual end effector object at the final calculated position
    // This works for both TCP and robot end effector since currentEndEffectorPoint
    // already contains the final calculated position (robot + tcp)
    const virtualEndEffector = new THREE.Object3D();
    virtualEndEffector.name = 'virtual_end_effector';
    
    // Position it at the current calculated end effector point
    virtualEndEffector.position.set(
      currentEndEffectorPoint.x,
      currentEndEffectorPoint.y,
      currentEndEffectorPoint.z
    );
    
    // Make sure it has the necessary matrices
    virtualEndEffector.updateMatrix();
    virtualEndEffector.updateMatrixWorld(true);
    
    const endEffectorType = isUsingTCP ? 'TCP' : 'Robot';
    console.log(`[IK] Using ${endEffectorType} end effector at: (${currentEndEffectorPoint.x.toFixed(3)}, ${currentEndEffectorPoint.y.toFixed(3)}, ${currentEndEffectorPoint.z.toFixed(3)})`);
    
    return virtualEndEffector;
  }, [currentEndEffectorPoint, isUsingTCP]);

  const solve = useCallback(async (targetPos) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current) return null;
    
    const endEffectorObject = getEffectiveEndEffector(robot);
    if (!endEffectorObject) return null;
    
    const solver = solversRef.current[currentSolver];
    if (!solver) {
      setSolverStatus(`Unknown solver: ${currentSolver}`);
      return null;
    }
    
    const endEffectorType = isUsingTCP ? 'TCP' : 'Robot';
    console.log(`[IK:${activeRobotId}] Solving with ${currentSolver} for ${endEffectorType} end effector`);
    
    return await solver.solve(robot, targetPos, () => endEffectorObject);
  }, [activeRobotId, getRobot, currentSolver, getEffectiveEndEffector, isUsingTCP]);

  const executeIK = useCallback(async (target, options = {}) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current || isAnimating) return false;
    
    setIsAnimating(true);
    setSolverStatus('Solving...');
    
    try {
      const result = await solve(target);
      
      if (result) {
        setSolverStatus('Success');
        if (options.animate) {
          // Animate the movement
          const duration = options.duration || 1000;
          const startTime = Date.now();
          const startAngles = {};
          const targetAngles = result;
          
          // Store initial angles
          Object.keys(targetAngles).forEach(jointName => {
            startAngles[jointName] = robot.joints[jointName].angle || 0; // Get current angle value
          });
          
          // Animation loop
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Interpolate angles
            Object.keys(targetAngles).forEach(jointName => {
              const start = startAngles[jointName];
              const end = targetAngles[jointName];
              const interpolatedAngle = start + (end - start) * progress;
              robot.setJointValue(jointName, interpolatedAngle); // Use setJointValue method
            });
            
            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setIsAnimating(false);
              setSolverStatus('Ready');
            }
          };
          
          animate();
        } else {
          // Apply angles immediately
          Object.entries(result).forEach(([jointName, angle]) => {
            robot.setJointValue(jointName, angle); // Use setJointValue method, not direct angle property
          });
          setIsAnimating(false);
          setSolverStatus('Ready');
        }
        
        return true;
      } else {
        setSolverStatus('Failed to solve');
        setIsAnimating(false);
        return false;
      }
    } catch (error) {
      console.error('Error executing IK:', error);
      setSolverStatus('Error');
      setIsAnimating(false);
      return false;
    }
  }, [activeRobotId, getRobot, solve, isAnimating]);

  const stopAnimation = useCallback(() => {
    setIsAnimating(false);
    setSolverStatus('Ready');
  }, []);

  const configureSolver = useCallback((solverName, config) => {
    const solver = solversRef.current[solverName];
    if (solver) {
      Object.assign(solver, config);
      console.log(`[IK] Configured solver ${solverName}:`, config);
    }
  }, []);

  const getSolverSettings = useCallback((solverName) => {
    const solver = solversRef.current[solverName];
    if (solver) {
      return { ...solver };
    }
    return null;
  }, []);

  return (
    <IKContext.Provider value={{
      targetPosition,
      isAnimating,
      solverStatus,
      currentSolver,
      availableSolvers,
      setTargetPosition,
      setCurrentSolver,
      executeIK,
      stopAnimation,
      configureSolver,
      getSolverSettings
    }}>
      {children}
    </IKContext.Provider>
  );
};

export const useIKContext = () => {
  const context = useContext(IKContext);
  if (!context) {
    throw new Error('useIKContext must be used within IKProvider');
  }
  return context;
};

export default IKContext;