// src/contexts/IKContext.jsx - IK as Central API with Dynamic Solvers
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useRobotSelection, useRobotManagement } from './hooks/useRobotManager';
import { useTCPContext } from './TCPContext';
import EventBus from '../utils/EventBus';
import { useAnimationContext } from './AnimationContext';

const IKContext = createContext(null);

export const IKProvider = ({ children }) => {
  const { activeId: activeRobotId } = useRobotSelection();
  const { getRobot } = useRobotManagement();
  const { 
    getCurrentEndEffectorPoint,
    getCurrentEndEffectorOrientation,
    getEndEffectorLink,
    hasToolAttached,
    recalculateEndEffector
  } = useTCPContext();
  const animation = useAnimationContext();

  // State
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [currentEndEffector, setCurrentEndEffector] = useState({
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 }
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Initializing...');
  const [currentSolver, setCurrentSolver] = useState('CCD');
  const [availableSolvers, setAvailableSolvers] = useState([]);
  const [loadedSolvers, setLoadedSolvers] = useState({});
  
  // Refs
  const solversRef = useRef({});
  const isReady = useRef(false);

  // ========== FETCH AVAILABLE SOLVERS FROM SERVER ==========
  useEffect(() => {
    const fetchAvailableSolvers = async () => {
      try {
        const response = await fetch('/api/ik-solvers');
        const data = await response.json();
        
        if (data.success && data.solvers) {
          const solverNames = data.solvers.map(s => s.name);
          setAvailableSolvers(solverNames);
          console.log('[IK] Available solvers from server:', solverNames);
          
          // Load default solver
          if (solverNames.length > 0) {
            const defaultSolver = solverNames.includes('CCD') ? 'CCD' : solverNames[0];
            setCurrentSolver(defaultSolver);
          }
        }
      } catch (error) {
        console.error('[IK] Failed to fetch solvers:', error);
        setSolverStatus('Failed to fetch solvers');
      }
    };
    
    fetchAvailableSolvers();
  }, []);

  // ========== DYNAMIC SOLVER LOADER ==========
  const loadSolver = useCallback(async (solverName) => {
    if (solversRef.current[solverName]) {
      return true; // Already loaded
    }

    try {
      console.log(`[IK] Loading solver: ${solverName}`);
      setSolverStatus(`Loading ${solverName}...`);
      
      // Fetch solver code
      const response = await fetch(`/IKSolvers/${solverName}.jsx`);
      const solverCode = await response.text();
      
      // Remove imports and exports, inject THREE
      const modifiedCode = solverCode
        .replace(/import\s+.*?from\s+['"].*?['"];?/g, '') // Remove all imports
        .replace(/export\s+default\s+/, 'return '); // Replace export with return
      
      // Create solver instance
      const createSolver = new Function('THREE', modifiedCode);
      const SolverClass = createSolver(THREE);
      
      // Initialize solver with its default config
      const solverInstance = new SolverClass(SolverClass.defaultConfig || {});
      
      // Store solver
      solversRef.current[solverName] = solverInstance;
      setLoadedSolvers(prev => ({ ...prev, [solverName]: true }));
      
      console.log(`[IK] Successfully loaded solver: ${solverName}`);
      return true;
    } catch (error) {
      console.error(`[IK] Failed to load solver ${solverName}:`, error);
      setSolverStatus(`Failed to load ${solverName}`);
      return false;
    }
  }, []);

  // ========== LOAD CURRENT SOLVER ==========
  useEffect(() => {
    if (currentSolver && availableSolvers.includes(currentSolver)) {
      loadSolver(currentSolver).then(success => {
        if (success) {
          isReady.current = true;
          setSolverStatus('Ready');
        }
      });
    }
  }, [currentSolver, availableSolvers, loadSolver]);

  // ========== SUBSCRIBE TO TCP END EFFECTOR UPDATES ==========
  useEffect(() => {
    if (!activeRobotId) return;

    // Update end effector data whenever it changes
    const updateEndEffectorData = () => {
      const position = getCurrentEndEffectorPoint(activeRobotId);
      const orientation = getCurrentEndEffectorOrientation(activeRobotId);
      
      setCurrentEndEffector({
        position: position || { x: 0, y: 0, z: 0 },
        orientation: orientation || { x: 0, y: 0, z: 0, w: 1 }
      });
      
      console.log(`[IK] Updated end effector data for ${activeRobotId}:`, {
        position,
        orientation,
        hasTCP: hasToolAttached(activeRobotId)
      });
    };

    // Initial update
    updateEndEffectorData();

    // Listen for TCP changes
    const handleTCPUpdate = (data) => {
      if (data.robotId === activeRobotId) {
        console.log('[IK] TCP update detected, refreshing end effector data');
        updateEndEffectorData();
      }
    };

    const handleJointChange = (data) => {
      if (data.robotId === activeRobotId) {
        // Recalculate end effector after joint changes
        setTimeout(() => {
          recalculateEndEffector(activeRobotId);
          updateEndEffectorData();
        }, 10);
      }
    };

    const unsubscribeTCP = EventBus.on('tcp:endeffector-updated', handleTCPUpdate);
    const unsubscribeTool = EventBus.on('tcp:tool-attached', handleTCPUpdate);
    const unsubscribeRemove = EventBus.on('tcp:tool-removed', handleTCPUpdate);
    const unsubscribeJoint = EventBus.on('robot:joint-changed', handleJointChange);
    const unsubscribeJoints = EventBus.on('robot:joints-changed', handleJointChange);

    return () => {
      unsubscribeTCP();
      unsubscribeTool();
      unsubscribeRemove();
      unsubscribeJoint();
      unsubscribeJoints();
    };
  }, [activeRobotId, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation, hasToolAttached, recalculateEndEffector]);

  // ========== ANIMATION COMPLETE HANDLER ==========
  useEffect(() => {
    const handleAnimationComplete = (data) => {
      if (data.robotId === activeRobotId) {
        console.log(`[IK] Animation complete for ${activeRobotId}`);
        setIsAnimating(false);
        setSolverStatus(data.success ? 'Movement Complete' : 'Movement Stopped');
        
        // Update end effector position after movement
        setTimeout(() => {
          const position = getCurrentEndEffectorPoint(activeRobotId);
          const orientation = getCurrentEndEffectorOrientation(activeRobotId);
          setCurrentEndEffector({
            position: position || { x: 0, y: 0, z: 0 },
            orientation: orientation || { x: 0, y: 0, z: 0, w: 1 }
          });
          setSolverStatus('Ready');
        }, 100);
      }
    };
    
    const unsubscribe = EventBus.on('ik:animation-complete', handleAnimationComplete);
    return () => unsubscribe();
  }, [activeRobotId, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation]);

  // ========== MAIN SOLVE FUNCTION ==========
  const solve = useCallback(async (robot, targetPos, targetOri = null) => {
    const solver = solversRef.current[currentSolver];
    if (!solver || !solver.solve) {
      console.error(`[IK] Solver ${currentSolver} not loaded or invalid`);
      return null;
    }

    console.log(`[IK] Solving with ${currentSolver}`);
    console.log('[IK] Current end effector:', currentEndEffector);
    console.log('[IK] Target position:', targetPos);
    console.log('[IK] Target orientation:', targetOri);

    try {
      // Get end effector link from TCP Context
      const endEffectorLink = getEndEffectorLink(activeRobotId);
      if (!endEffectorLink) {
        console.error('[IK] Could not find end effector link');
        return null;
      }

      // Call solver with standardized interface
      const result = await solver.solve({
        robot,
        endEffectorLink,  // Pass it to solver from TCP Context
        currentPosition: currentEndEffector.position,
        currentOrientation: currentEndEffector.orientation,
        targetPosition: targetPos,
        targetOrientation: targetOri
      });

      return result;
    } catch (error) {
      console.error(`[IK] Solver ${currentSolver} failed:`, error);
      return null;
    }
  }, [currentSolver, currentEndEffector, getEndEffectorLink, activeRobotId]);

  // ========== EXECUTE IK ==========
  const executeIK = useCallback(async (target, options = {}) => {
    if (!activeRobotId || isAnimating || !isReady.current) {
      console.warn('[IK] Cannot execute IK:', { activeRobotId, isAnimating, isReady: isReady.current });
      return false;
    }

    const robot = getRobot(activeRobotId);
    if (!robot) {
      console.error('[IK] Robot not found:', activeRobotId);
      return false;
    }

    setIsAnimating(true);
    setSolverStatus('Solving...');

    try {
      // Prepare target orientation if provided
      const targetOri = options.targetOrientation || targetOrientation;
      
      // Solve IK
      const jointValues = await solve(robot, target, targetOri);
      
      if (jointValues && Object.keys(jointValues).length > 0) {
        console.log('[IK] Solution found:', jointValues);
        setSolverStatus(options.animate !== false ? 'Moving...' : 'Applying...');
        
        // Default joint constraints for 6-axis robot
        const defaultJointConstraints = {
          'joint_1': { 
            maxVelocity: 2.1,      // rad/s (~120 deg/s)
            maxAcceleration: 5.0,   // rad/s²
            maxJerk: 25.0          // rad/s³
          },
          'joint_2': { 
            maxVelocity: 1.9,      // rad/s (~110 deg/s)
            maxAcceleration: 4.0,
            maxJerk: 20.0
          },
          'joint_3': { 
            maxVelocity: 2.3,      // rad/s (~130 deg/s)
            maxAcceleration: 5.0,
            maxJerk: 25.0
          },
          'joint_4': { 
            maxVelocity: 3.5,      // rad/s (~200 deg/s)
            maxAcceleration: 8.0,
            maxJerk: 40.0
          },
          'joint_5': { 
            maxVelocity: 3.5,      // rad/s
            maxAcceleration: 8.0,
            maxJerk: 40.0
          },
          'joint_6': { 
            maxVelocity: 5.2,      // rad/s (~300 deg/s)
            maxAcceleration: 12.0,
            maxJerk: 60.0
          }
        };
        
        // Send to Joint Context with motion profile options
        EventBus.emit('ik:joint-values-calculated', {
          robotId: activeRobotId,
          jointValues,
          animate: options.animate !== false,
          duration: options.duration || 1000,
          // NEW: Pass motion profile options
          motionProfile: options.motionProfile || 'trapezoidal',
          jointConstraints: options.jointConstraints || defaultJointConstraints,
          animationSpeed: options.animationSpeed || 1.0,
          onProgress: (progressData) => {
            // Optional: emit progress for UI updates
            EventBus.emit('ik:animation-progress', {
              robotId: activeRobotId,
              ...progressData
            });
          }
        });
        
        return true;
      } else {
        console.warn('[IK] No solution found');
        setSolverStatus('No solution');
        setIsAnimating(false);
        return false;
      }
    } catch (error) {
      console.error('[IK] Error executing IK:', error);
      setSolverStatus('Error');
      setIsAnimating(false);
      return false;
    }
  }, [activeRobotId, getRobot, solve, targetOrientation, isAnimating]);

  // ========== STOP ANIMATION ==========
  const stopAnimation = useCallback(() => {
    if (activeRobotId) {
      EventBus.emit('joint:stop-animation', { robotId: activeRobotId });
      setIsAnimating(false);
      setSolverStatus('Stopped');
    }
  }, [activeRobotId]);

  // ========== SOLVER CONFIGURATION ==========
  const configureSolver = useCallback((solverName, config) => {
    const solver = solversRef.current[solverName];
    if (solver) {
      if (typeof solver.configure === 'function') {
        solver.configure(config);
      } else {
        // Fallback: directly assign config properties
        Object.assign(solver, config);
      }
      console.log(`[IK] Configured ${solverName}:`, config);
    }
  }, []);

  const getSolverSettings = useCallback((solverName) => {
    const solver = solversRef.current[solverName];
    if (solver) {
      if (typeof solver.getConfig === 'function') {
        return solver.getConfig();
      } else {
        // Extract config properties
        const config = {};
        const configKeys = Object.keys(solver).filter(key => 
          typeof solver[key] !== 'function' && !key.startsWith('_')
        );
        configKeys.forEach(key => {
          config[key] = solver[key];
        });
        return config;
      }
    }
    return {};
  }, []);

  // ========== ANIMATE IK SOLUTION ==========
  const applySolution = (ikSolution, options = {}) => {
    return animation.animateIK(ikSolution, {
      duration: 500,
      profile: 's-curve',
      ...options
    });
  };

  // ========== CONTEXT VALUE ==========
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    targetPosition,
    targetOrientation,
    currentEndEffector,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    // Animation-based state
    animationIsAnimating: animation.isAnimating,
    animationProgressValue: animation.animationProgress,
    // Methods
    setTargetPosition,
    setTargetOrientation,
    setCurrentSolver,
    executeIK,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    // Animation-based API
    applySolution
    // Info
    ,isReady: isReady.current,
    hasValidEndEffector: currentEndEffector.position.x !== 0 || 
                        currentEndEffector.position.y !== 0 || 
                        currentEndEffector.position.z !== 0
  }), [
    targetPosition,
    targetOrientation,
    currentEndEffector,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setTargetOrientation,
    setCurrentSolver,
    executeIK,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    applySolution,
    animation
  ]);

  return (
    <IKContext.Provider value={value}>
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