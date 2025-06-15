// src/contexts/IKContext.jsx - Fixed dynamic IK solver loading
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useRobotSelection, useRobotManagement } from './hooks/useRobot';
import { useTCP } from './hooks/useTCP';
import EventBus from '../utils/EventBus';
import { useRobotManagerContext } from './RobotManagerContext';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { activeId: activeRobotId } = useRobotSelection();
  const { getRobot } = useRobotManagement();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();
  const { isRobotReady } = useRobotManagerContext();

  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Initializing...');
  const [currentSolver, setCurrentSolver] = useState('CCD');
  const [availableSolvers, setAvailableSolvers] = useState(['CCD', 'HalimIK']); // Default fallback
  const [loadedSolvers, setLoadedSolvers] = useState([]);
  const solversRef = useRef({});
  const isReady = useRef(false);
  const loadingRef = useRef(false);

  // Fetch available IK solvers from backend
  useEffect(() => {
    const fetchAvailableSolvers = async () => {
      try {
        const response = await fetch('/api/ik-solvers');
        const data = await response.json();
        
        if (data.success && data.solvers) {
          const solverNames = data.solvers.map(s => s.name);
          setAvailableSolvers(solverNames);
          console.log('[IK] Available solvers from backend:', solverNames);
          
          // Load default solver if available
          if (solverNames.includes(currentSolver)) {
            await loadSolver(currentSolver);
          } else if (solverNames.length > 0) {
            await loadSolver(solverNames[0]);
            setCurrentSolver(solverNames[0]);
          }
        }
      } catch (error) {
        console.error('[IK] Failed to fetch available solvers:', error);
        setSolverStatus('Failed to fetch solvers');
      }
    };
    
    fetchAvailableSolvers();
  }, []);

  // Load a specific IK solver dynamically
  const loadSolver = useCallback(async (solverName) => {
    try {
      console.log(`[IK] Loading solver: ${solverName}`);
      
      // Fetch the solver code as text
      const response = await fetch(`/IKSolvers/${solverName}.jsx`);
      const solverCode = await response.text();
      
      // Remove the import statement and wrap the code to inject THREE
      const modifiedCode = solverCode
        .replace(/import\s+.*?from\s+['"]three['"];?/g, '') // Remove Three.js imports
        .replace(/export\s+default\s+/, 'return '); // Replace export with return
      
      // Create a function that returns the solver class with THREE injected
      const createSolver = new Function('THREE', modifiedCode);
      const SolverClass = createSolver(THREE);
      
      // Check if solver has static metadata (name, description, default config)
      const metadata = {
        name: SolverClass.metadata?.name || solverName,
        description: SolverClass.metadata?.description || `${solverName} IK Solver`,
        author: SolverClass.metadata?.author || 'Unknown',
        version: SolverClass.metadata?.version || '1.0.0'
      };
      
      console.log(`[IK] Loading ${metadata.name} v${metadata.version} by ${metadata.author}`);
      
      // Get default configuration from the solver class itself
      const defaultConfig = SolverClass.defaultConfig || SolverClass.DEFAULT_CONFIG || {};
      console.log(`[IK] Using solver's default config:`, defaultConfig);
      
      // Initialize solver with its own default configuration
      const solverInstance = new SolverClass(defaultConfig);
      
      // Store metadata with the solver
      solverInstance._metadata = metadata;
      solverInstance._defaultConfig = defaultConfig;
      
      solversRef.current[solverName] = solverInstance;
      
      // Mark this solver as loaded
      setLoadedSolvers(prev => [...prev, solverName]);
      
      if (solverName === currentSolver) {
        isReady.current = true;
        setSolverStatus('Ready');
      }
      
      console.log(`[IK] Successfully loaded solver: ${solverName}`);
      return true;
    } catch (error) {
      console.error(`[IK] Failed to load solver ${solverName}:`, error);
      setSolverStatus(`Failed to load ${solverName}`);
      return false;
    }
  }, [currentSolver]);

  // Handle solver change
  useEffect(() => {
    const handleSolverChange = async () => {
      if (currentSolver && availableSolvers.includes(currentSolver)) {
        // Check if solver is already loaded
        if (!loadedSolvers.includes(currentSolver)) {
          isReady.current = false;
          setSolverStatus(`Loading ${currentSolver}...`);
          const success = await loadSolver(currentSolver);
          if (!success) {
            setSolverStatus(`Failed to load ${currentSolver}`);
          }
        } else {
          isReady.current = true;
          setSolverStatus('Ready');
        }
      }
    };
    
    handleSolverChange();
  }, [currentSolver, availableSolvers, loadedSolvers]);

  // Listen for TCP changes and update status
  useEffect(() => {
    if (isReady.current) {
      if (isUsingTCP) {
        setSolverStatus(`Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})`);
      } else {
        setSolverStatus('Ready (Robot End Effector)');
      }
    }
  }, [isUsingTCP, getEndEffectorInfo]);

  // Listen for TCP end effector updates
  useEffect(() => {
    const handleTCPEndEffectorUpdate = (data) => {
      if (data.robotId === activeRobotId && !isAnimating && isReady.current) {
        const endEffectorType = data.hasTCP ? 'TCP' : 'Robot';
        setSolverStatus(`Ready (${endEffectorType} End Effector - Position Updated)`);
        
        // Reset status after a delay
        setTimeout(() => {
          if (isReady.current) {
            setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
          }
        }, 2000);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:end-effector-updated', handleTCPEndEffectorUpdate);
    return () => unsubscribe();
  }, [activeRobotId, isAnimating, isUsingTCP, getEndEffectorInfo]);

  // Listen for animation completion from JointContext
  useEffect(() => {
    const handleAnimationComplete = (data) => {
      if (data.robotId === activeRobotId) {
        console.log(`[IK Context] Animation complete for ${activeRobotId}, success: ${data.success}`);
        setIsAnimating(false);
        setSolverStatus(data.success ? 'Movement Complete' : 'Movement Stopped');
        
        // Reset status after a delay
        setTimeout(() => {
          if (isReady.current) {
            setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
          }
        }, 2000);
      }
    };
    
    const unsubscribe = EventBus.on('ik:animation-complete', handleAnimationComplete);
    return () => unsubscribe();
  }, [activeRobotId, isUsingTCP, getEndEffectorInfo]);

  // Create virtual end effector position (for solver reference)
  const getVirtualEndEffectorPosition = useCallback(() => {
    const virtualEndEffector = new THREE.Vector3(
      currentEndEffectorPoint.x || 0,
      currentEndEffectorPoint.y || 0,
      currentEndEffectorPoint.z || 0
    );
    
    const endEffectorType = isUsingTCP ? 'TCP' : 'Robot';
    console.log(`[IK] Using ${endEffectorType} end effector at: (${currentEndEffectorPoint.x.toFixed(3)}, ${currentEndEffectorPoint.y.toFixed(3)}, ${currentEndEffectorPoint.z.toFixed(3)})`);
    
    return virtualEndEffector;
  }, [currentEndEffectorPoint, isUsingTCP]);

  const solve = useCallback(async (targetPos, currentPos, options = {}) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current) return null;
    if (!isRobotReady || !isRobotReady(activeRobotId)) {
      console.warn(`[IK Context] Robot ${activeRobotId} not ready for IK solve`);
      return null;
    }
    const solver = solversRef.current[currentSolver];
    if (!solver) {
      setSolverStatus(`Unknown solver: ${currentSolver}`);
      return null;
    }
    
    console.log(`[IK Context] Solving from:`, currentPos, 'to:', targetPos);
    console.log(`[IK Context] Target orientation:`, options.targetOrientation);
    console.log(`[IK Context] Current orientation:`, options.currentOrientation);
    
    // Pass the actual robot to solver with orientation data
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
  }, [activeRobotId, getRobot, currentSolver, isRobotReady]);

  const executeIK = useCallback(async (target, options = {}) => {
    const robot = getRobot(activeRobotId);
    if (!robot || !isReady.current || isAnimating) {
      console.log(`[IK Context] Cannot execute: robot=${!!robot}, ready=${isReady.current}, animating=${isAnimating}`);
      if (!isReady.current) {
        console.log(`[IK Context] Current solver: ${currentSolver}, loaded: ${loadedSolvers.join(', ')}`);
      }
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
          jointValues: result, // Solver returns goal angles starting from current position
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
  }, [activeRobotId, getRobot, solve, isAnimating, currentSolver, loadedSolvers]);

  const stopAnimation = useCallback(() => {
    console.log(`[IK Context] Stopping animation for ${activeRobotId}`);
    
    // Notify JointContext to stop animation
    EventBus.emit('joint:stop-animation', { robotId: activeRobotId });
    
    setIsAnimating(false);
    setSolverStatus('Stopped');
    
    // Reset status after a delay
    setTimeout(() => {
      if (isReady.current) {
        setSolverStatus(isUsingTCP ? `Ready (TCP: ${getEndEffectorInfo()?.toolName || 'Tool'})` : 'Ready (Robot End Effector)');
      }
    }, 1000);
  }, [activeRobotId, isUsingTCP, getEndEffectorInfo]);

  const configureSolver = useCallback((solverName, config) => {
    const solver = solversRef.current[solverName];
    if (solver && solver.configure) {
      solver.configure(config);
      console.log(`[IK] Configured solver ${solverName}:`, config);
    } else if (solver) {
      // Fallback for solvers without configure method
      Object.assign(solver, config);
      console.log(`[IK] Updated solver ${solverName} properties:`, config);
    }
  }, []);

  const getSolverSettings = useCallback((solverName) => {
    const solver = solversRef.current[solverName];
    if (solver) {
      // Return only the configuration properties, not methods
      const settings = {};
      const configKeys = [
        'maxIterations', 'tolerance', 'dampingFactor', 'angleLimit', 'orientationWeight',
        'regularizationParameter', 'orientationMode', 'noPosition', 'orientationCoeff', 'learningRate'
      ];
      
      configKeys.forEach(key => {
        if (key in solver) {
          settings[key] = solver[key];
        }
      });
      
      return settings;
    }
    return {};
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