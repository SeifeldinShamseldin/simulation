// src/contexts/IKContext.jsx - Fixed animation completion handling
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobot } from './RobotContext';
import { useTCP } from './TCPContext';
import { useJoint } from './JointContext';
import EventBus from '../utils/EventBus';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { getRobotManager } = useViewer();
  const { activeRobotId, getRobot } = useRobot();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  // Listen for robot selection changes
  useEffect(() => {
    const handleRobotSelected = (data) => {
      setActiveRobotId(data.robotId);
    };

    const unsubscribe = EventBus.on('robot:selected', handleRobotSelected);
    return () => unsubscribe();
  }, []);

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
      if (data.robotId === activeRobotId && !isAnimating) {
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
  }, [activeRobotId, isUsingTCP, getEndEffectorInfo, isAnimating]);

  // Listen for animation completion from JointContext
  useEffect(() => {
    const handleAnimationComplete = (data) => {
      if (data.robotId === activeRobotId) {
        console.log(`[IK Context] Animation completion received for ${activeRobotId}:`, data);
        
        setIsAnimating(false);
        
        if (data.success) {
          setSolverStatus('Move Complete');
          
          // Reset status after a delay
          setTimeout(() => {
            setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
          }, 2000);
        } else {
          setSolverStatus('Move Cancelled');
          
          // Reset status after a delay
          setTimeout(() => {
            setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
          }, 1000);
        }
      }
    };

    const unsubscribe = EventBus.on('ik:animation-complete', handleAnimationComplete);
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

  const solve = useCallback(async (targetPos, currentPos, options = {}) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current) return null;
    
    const solver = solversRef.current[currentSolver];
    if (!solver) {
      setSolverStatus(`Unknown solver: ${currentSolver}`);
      return null;
    }
    
    console.log(`[IK Context] Solving from:`, currentPos, 'to:', targetPos);
    console.log(`[IK Context] Target orientation:`, options.targetOrientation);
    console.log(`[IK Context] Current orientation:`, options.currentOrientation);
    
    // Pass the actual robot to CCD with orientation data
    return await solver.solve(
      robot, 
      targetPos, 
      () => robot.userData?.endEffectorLink, 
      currentPos,
      {
        targetOrientation: options.targetOrientation,
        currentOrientation: options.currentOrientation
      }
    );
  }, [activeRobotId, getRobot, currentSolver]);

  const executeIK = useCallback(async (target, options = {}) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current || isAnimating) {
      console.log(`[IK Context] Cannot execute: robot=${!!robot}, ready=${isReady.current}, animating=${isAnimating}`);
      return false;
    }
    
    // Get current position from options (passed from useIK)
    const currentPos = options.currentPosition || { x: 0, y: 0, z: 0 };
    
    console.log(`[IK Context] Starting IK execution for ${activeRobotId}`);
    console.log(`[IK Context] Target orientation:`, options.targetOrientation);
    console.log(`[IK Context] Current orientation:`, options.currentOrientation);
    setIsAnimating(true);
    setSolverStatus('Solving...');
    
    try {
      const result = await solve(target, currentPos, {
        targetOrientation: options.targetOrientation,
        currentOrientation: options.currentOrientation
      });
      
      if (result) {
        setSolverStatus(options.animate ? 'Moving...' : 'Applying...');
        
        console.log(`[IK Context] Emitting joint values to JointContext:`, result);
        
        // Emit event to Joint Control with the goal angles
        EventBus.emit('ik:joint-values-calculated', {
          robotId: activeRobotId,
          jointValues: result, // CCD now returns goal angles starting from current position
          animate: options.animate,
          duration: options.duration || 1000
        });
        
        // Don't set isAnimating to false here - wait for JointContext completion
        return true;
      } else {
        console.log(`[IK Context] Solver returned no solution`);
        setSolverStatus('Failed to solve');
        setIsAnimating(false);
        return false;
      }
    } catch (error) {
      console.error('[IK Context] Error executing IK:', error);
      setSolverStatus('Error');
      setIsAnimating(false);
      return false;
    }
  }, [activeRobotId, getRobot, solve, isAnimating]);

  const stopAnimation = useCallback(() => {
    console.log(`[IK Context] Stopping animation for ${activeRobotId}`);
    
    // Notify JointContext to stop animation
    EventBus.emit('joint:stop-animation', { robotId: activeRobotId });
    
    setIsAnimating(false);
    setSolverStatus('Stopped');
    
    // Reset status after a delay
    setTimeout(() => {
      setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
    }, 1000);
  }, [activeRobotId, isUsingTCP, getEndEffectorInfo]);

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