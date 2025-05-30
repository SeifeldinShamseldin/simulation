/**
 * Robot control component
 * Now using unified robotService for all robot operations
 */
import React, { useState, useEffect, useRef } from 'react';
import { GLOBAL_CONFIG } from '../../utils/GlobalVariables';
import robotService from '../../core/services/RobotService';
import { useRobot } from '../../contexts/RobotContext';
import ControlJoints from './ControlJoints/ControlJoints';
import RobotLoader from './RobotLoader/RobotLoader';
import Reposition from './Reposition/Reposition';
import TCPManager from '../controls/TCPDisplay/TCPManager';
import IKController from './IKController/IKController';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';
import FloorControls from './FloorControls/FloorControls';
import ikAPI from '../../core/IK/API/IKAPI';
import tcpProvider from '../../core/IK/TCP/TCPProvider';
import * as THREE from 'three';
import EventBus from '../../utils/EventBus';

/**
 * Debug information component for displaying joint data and values
 */
const DebugInfo = ({ enabled, jointInfo, jointValues }) => {
  if (!enabled) return null;
  
  return (
    <div style={{ 
      backgroundColor: '#f8f9fa', 
      border: '1px solid #dee2e6',
      marginBottom: '1rem',
      padding: '0.5rem',
      fontSize: '0.8rem',
      fontFamily: 'monospace',
      borderRadius: '4px'
    }}>
      <details>
        <summary style={{ 
          fontWeight: 'bold', 
          cursor: 'pointer',
          padding: '0.25rem',
          backgroundColor: '#e9ecef',
          borderRadius: '4px'
        }}>
          Debug Information
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div><strong>Joint Count:</strong> {jointInfo?.length || 0}</div>
          <div><strong>Joint Values:</strong> {Object.keys(jointValues || {}).length}</div>
          <div style={{ marginTop: '0.5rem' }}>
            <details>
              <summary>Joint Data</summary>
              <pre style={{ 
                maxHeight: '200px', 
                overflow: 'auto',
                backgroundColor: '#343a40',
                color: '#f8f9fa',
                padding: '0.5rem',
                fontSize: '0.7rem',
                marginTop: '0.5rem',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify(jointInfo, null, 2)}
              </pre>
            </details>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <details>
              <summary>Joint Values</summary>
              <pre style={{ 
                maxHeight: '200px', 
                overflow: 'auto',
                backgroundColor: '#343a40',
                color: '#f8f9fa',
                padding: '0.5rem',
                fontSize: '0.7rem',
                marginTop: '0.5rem',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify(jointValues, null, 2)}
              </pre>
            </details>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <details>
              <summary>RobotService Status</summary>
              <pre style={{ 
                maxHeight: '200px', 
                overflow: 'auto',
                backgroundColor: '#343a40',
                color: '#f8f9fa',
                padding: '0.5rem',
                fontSize: '0.7rem',
                marginTop: '0.5rem',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify(robotService.getStatus(), null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </details>
    </div>
  );
};

/**
 * Scan for available robots using unified RobotService
 * @returns {string[]} List of available robot names
 */
function scanForRobots() {
    // Use unified robot service instead of old registry
    try {
      const availableRobots = robotService.getAvailableRobots();
      const registeredIds = robotService.getRegisteredRobotIds();
      
      // Combine both lists and remove duplicates
      const allRobots = [...new Set([
        ...availableRobots.map(r => r.id),
        ...registeredIds,
        // Keep fallback robots for backward compatibility
        'ur5', 'ur10', 'kr3r540'
      ])];
      
      console.log('Available robots from RobotService:', allRobots);
      return allRobots;
    } catch (error) {
      console.warn('Error scanning robots from RobotService:', error);
      // Fallback to basic list
      return ['ur5', 'ur10', 'kr3r540'];
    }
}

/**
 * Controls component for manipulating URDF robots with integrated IK
 */
const Controls = ({ 
  viewerRef, 
  onOptionChange,
  showJointControls = true,
  showLoadOptions = false,
  showIKControls = true,
  showTableVisualization = true,
  defaultRobotPath = '/robots/ur5/ur5.urdf',
  defaultRobotName = 'ur5'
}) => {
  // State for controls
  const [jointInfo, setJointInfo] = useState([]);
  const [jointValues, setJointValues] = useState({});
  const [savedJointValues, setSavedJointValues] = useState({});
  const { viewOptions, setViewOptions } = useRobot();
  const [robotName, setRobotName] = useState(defaultRobotName);
  const [robotPath, setRobotPath] = useState(defaultRobotPath);
  const [availableRobots, setAvailableRobots] = useState([]);
  const [currentRobotName, setCurrentRobotName] = useState('');
  const [debugMode, setDebugMode] = useState(GLOBAL_CONFIG.debug);
  const [showIK, setShowIK] = useState(true);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isExecutingIK, setIsExecutingIK] = useState(false);
  const [ikStatus, setIkStatus] = useState('Ready');
  
  // Reference for the IK solver
  const ikSolverRef = useRef(null);
  
  // Populate the robot list when component mounts using RobotService
  useEffect(() => {
    const loadAvailableRobots = async () => {
      try {
        // Wait for robot service to initialize
        await robotService.discoverRobots();
        const robots = scanForRobots();
        setAvailableRobots(robots);
        console.log('Loaded available robots:', robots);
      } catch (error) {
        console.warn('Error loading robots:', error);
        // Use fallback
        setAvailableRobots(['ur5', 'ur10', 'kr3r540']);
      }
    };
    
    loadAvailableRobots();
  }, []);
  
  // Set up joint info and subscribe to joint updates
  useEffect(() => {
    if (!viewerRef?.current) return;
    
    const updateJointInfo = () => {
      try {
        // Get robot info
        const robot = viewerRef.current.getCurrentRobot();
        if (!robot) {
          if (debugMode) console.log("[DEBUG] No robot available");
          return;
        }
        
        if (debugMode) console.log(`[DEBUG] Robot found: ${robot.robotName}`);
        
        // Get joints directly from the robot
        const jointsList = [];
        if (robot.joints) {
          Object.entries(robot.joints).forEach(([name, joint]) => {
            if (joint && joint.jointType !== 'fixed') {
              jointsList.push({
                name,
                type: joint.jointType,
                jointType: joint.jointType,
                limit: joint.limit || { lower: -3.14, upper: 3.14 },
                value: joint.jointValue || [0]
              });
            }
          });
          
          // Only update if we have joints
          if (jointsList.length > 0) {
            if (debugMode) console.log(`[DEBUG] Found ${jointsList.length} movable joints`);
            
            setJointInfo(prev => {
              // Only update if the joint list has changed to avoid unnecessary re-renders
              if (JSON.stringify(prev) !== JSON.stringify(jointsList)) {
                if (debugMode) console.log("[DEBUG] Updating joint info");
                return jointsList;
              }
              return prev;
            });
            
            // Update joint values
            const values = {};
            jointsList.forEach(joint => {
              values[joint.name] = Array.isArray(joint.value) ? 
                                 joint.value[0] : 
                                 (typeof joint.value === 'number' ? joint.value : 0);
            });
            
            setJointValues(prev => {
              const newValues = {...prev, ...values};
              if (debugMode && JSON.stringify(prev) !== JSON.stringify(newValues)) {
                console.log("[DEBUG] Updating joint values:", newValues);
              }
              return newValues;
            });
          } else if (debugMode) {
            console.log("[DEBUG] No movable joints found in robot");
          }
        } else if (debugMode) {
          console.log("[DEBUG] Robot has no joints property");
        }
      } catch (error) {
        console.error("[DEBUG] Error updating joint info:", error);
      }
    };
    
    if (debugMode) console.log("[DEBUG] Setting up joint info watchers");
    
    // Update right away
    updateJointInfo();
    
    // Create timers at different intervals
    const timers = [
      setTimeout(() => {
        if (debugMode) console.log("[DEBUG] 500ms timer checking joints");
        updateJointInfo();
      }, 500),
      setTimeout(() => {
        if (debugMode) console.log("[DEBUG] 1s timer checking joints");
        updateJointInfo();
      }, 1000),
      setTimeout(() => {
        if (debugMode) console.log("[DEBUG] 2s timer checking joints");
        updateJointInfo();
      }, 2000)
    ];
    
    // Set up interval
    const intervalId = setInterval(() => {
      if (debugMode) console.log("[DEBUG] Interval checking joints");
      updateJointInfo();
    }, 3000);
    
    // Subscribe to joint updates from IK API
    const unsubscribe = ikAPI.registerForJointUpdates((updatedJointValues) => {
      if (debugMode) console.log("[DEBUG] Received joint updates from IK API:", updatedJointValues);
      setJointValues(prev => ({
        ...prev,
        ...updatedJointValues
      }));
    });
    
    return () => {
      if (debugMode) console.log("[DEBUG] Cleaning up joint info watchers");
      timers.forEach(clearTimeout);
      clearInterval(intervalId);
      unsubscribe();
    };
  }, [viewerRef, debugMode]); // Add debugMode as dependency
  
  // Initialize IK solver
  useEffect(() => {
    if (!viewerRef?.current) return;
    
    // Set up the IK solver when the component mounts
    ikSolverRef.current = {
      maxIterations: 100,
      tolerance: 0.01,
      dampingFactor: 0.5,
      animating: false,
      
      // Temporary vectors for calculations
      _worldEndPos: new THREE.Vector3(),
      _jointPos: new THREE.Vector3(),
      _toEnd: new THREE.Vector3(),
      _toTarget: new THREE.Vector3(),
      _axis: new THREE.Vector3(),
      _tempQuat: new THREE.Quaternion(),
      
      // Storage for animation
      startAngles: {},
      goalAngles: {},
      
      // Ease-in-out function for smooth movement
      easeInOut: function(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      },
      
      // Solve IK to find joint angles that reach the target
      solve: function(robot, endEffector, targetPos) {
        // Find movable joints
        const joints = Object.values(robot.joints).filter(
          j => j.jointType !== 'fixed' && j.limit && typeof j.limit.lower === 'number'
        );
        
        // Store start angles
        joints.forEach(joint => {
          this.startAngles[joint.name] = joint.angle || 0;
        });
        
        // Run CCD algorithm
        for (let iter = 0; iter < this.maxIterations; iter++) {
          // Get current end effector position
          if (!endEffector) break;
          endEffector.getWorldPosition(this._worldEndPos);
          
          // Check if we're close enough to target
          const distanceToTarget = this._worldEndPos.distanceTo(targetPos);
          if (distanceToTarget < this.tolerance) {
            console.log(`IK converged after ${iter} iterations`);
            break;
          }
          
          // Process joints from end to base
          for (let i = joints.length - 1; i >= 0; i--) {
            const joint = joints[i];
            
            // Get joint position in world space
            joint.getWorldPosition(this._jointPos);
            
            // Get joint axis in world space
            this._axis.copy(joint.axis)
              .applyQuaternion(joint.getWorldQuaternion(this._tempQuat))
              .normalize();
            
            // Calculate vectors from joint to end effector and target
            this._toEnd.copy(this._worldEndPos).sub(this._jointPos).normalize();
            this._toTarget.copy(targetPos).sub(this._jointPos).normalize();
            
            // Calculate angle between vectors
            let angle = Math.acos(
              THREE.MathUtils.clamp(this._toEnd.dot(this._toTarget), -1, 1)
            );
            
            // Determine rotation direction
            if (this._toEnd.clone().cross(this._toTarget).dot(this._axis) < 0) {
              angle = -angle;
            }
            
            // Apply damping
            angle *= this.dampingFactor;
            
            // Update joint angle
            let newAngle = joint.angle + angle;
            
            // Apply joint limits
            newAngle = THREE.MathUtils.clamp(
              newAngle,
              joint.limit.lower,
              joint.limit.upper
            );
            
            // Apply the new angle
            robot.setJointValue(joint.name, newAngle);
            
            // Update end effector position
            endEffector.getWorldPosition(this._worldEndPos);
          }
        }
        
        // Store goal angles
        joints.forEach(joint => {
          this.goalAngles[joint.name] = joint.angle;
          
          // Reset to start for animation
          robot.setJointValue(joint.name, this.startAngles[joint.name]);
        });
        
        return this.goalAngles;
      },
      
      // Animate movement from start to goal angles
      startAnimation: function(robot, duration, onComplete) {
        this.animating = true;
        this.animationStartTime = performance.now();
        this.animationDuration = duration || 1000;
        this.onAnimationComplete = onComplete;
        
        const animate = (time) => {
          if (!this.animating) return;
          
          const elapsed = time - this.animationStartTime;
          let progress = Math.min(elapsed / this.animationDuration, 1.0);
          
          if (progress >= 1.0) {
            progress = 1.0;
            this.animating = false;
          }
          
          // Apply easing
          const easedProgress = this.easeInOut(progress);
          
          // Update joint angles
          for (const jointName in this.startAngles) {
            const startAngle = this.startAngles[jointName];
            const goalAngle = this.goalAngles[jointName];
            const currentAngle = startAngle + (goalAngle - startAngle) * easedProgress;
            
            robot.setJointValue(jointName, currentAngle);
          }
          
          // Continue animation or complete
          if (this.animating) {
            requestAnimationFrame(animate);
          } else if (this.onAnimationComplete) {
            this.onAnimationComplete();
          }
        };
        
        requestAnimationFrame(animate);
      },
      
      // Calculate appropriate duration based on joint changes
      calculateDuration: function(robot) {
        let maxTime = 0;
        
        for (const jointName in this.startAngles) {
          const joint = robot.joints[jointName];
          const startAngle = this.startAngles[jointName];
          const goalAngle = this.goalAngles[jointName];
          const angleChange = Math.abs(goalAngle - startAngle);
          
          // Use default velocity if not specified
          const maxVelocity = (joint.limit && joint.limit.velocity) || 1.0;
          
          const jointTime = angleChange / maxVelocity;
          maxTime = Math.max(maxTime, jointTime);
        }
        
        // Convert to ms, ensure minimum duration
        return Math.max(maxTime * 1000, 100);
      },
      
      // Stop current animation
      stopAnimation: function() {
        this.animating = false;
      }
    };
  }, [viewerRef]);
  
  /**
   * Handle joint value change
   * @param {string} name - The name of the joint
   * @param {number|string} value - The new value
   */
  const handleJointChange = (name, value) => {
    if (!viewerRef?.current) return;
    
    // Convert to float
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    if (debugMode) console.log(`[DEBUG] Setting joint ${name} to ${numValue}`);
    
    // Emit to EventBus for all subscribers
    EventBus.emit('joint:value-changed', {
      jointName: name,
      value: numValue,
      source: 'manual'
    });
    
    // Set the joint value directly in the robot
    try {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot && robot.setJointValue) {
        robot.setJointValue(name, numValue);
        if (debugMode) console.log(`[DEBUG] Successfully set joint ${name} on robot directly`);
      }
      
      // Also update through the viewer to ensure UI syncs
      if (viewerRef.current.setJointValue(name, numValue)) {
        if (debugMode) console.log(`[DEBUG] Successfully set joint ${name} through viewer`);
      } else if (debugMode) {
        console.log(`[DEBUG] Failed to set joint ${name} through viewer`);
      }
      
      // Update our local state immediately
      setJointValues(prev => ({
        ...prev,
        [name]: numValue
      }));
    } catch (error) {
      console.error("[DEBUG] Error changing joint value:", error);
    }
  };
  
  /**
   * Handle option change
   * @param {string} name - The name of the option
   * @param {*} value - The new value
   */
  const handleOptionChange = (name, value) => {
    if (!viewerRef?.current) return;
    
    // Update context state
    setViewOptions((prev) => ({
      ...prev,
      [name]: value
    }));
    
    // Handle specific options
    if (name === 'ignoreLimits' && viewerRef.current) {
      // Need to call the robot state directly
      const robotState = viewerRef.current.getRobotState();
      if (robotState && robotState.setIgnoreLimits) {
        robotState.setIgnoreLimits(value);
      }
    }
    
    // Notify parent component if needed
    if (onOptionChange) {
      onOptionChange(name, value);
    }
  };
  
  /**
   * Reset joints to zero position
   */
  const handleReset = () => {
    if (!viewerRef?.current) return;
    
    viewerRef.current.resetJoints();
  };
  
  /**
   * Load a robot using RobotService
   */
  const handleLoadRobot = async () => {
    if (!viewerRef?.current) return;
    
    try {
      // Use RobotService to get robot config
      const robotConfig = robotService.getRobotConfig(robotName);
      if (robotConfig) {
        console.log('Loading robot with config:', robotConfig);
        await viewerRef.current.loadRobot(robotName, robotConfig.urdfPath);
      } else {
        // Fallback to basic path
        await viewerRef.current.loadRobot(robotName, robotPath);
      }
    } catch (error) {
      console.error('Error loading robot:', error);
    }
  };
  
  /**
   * Execute IK to move to target position
   */
  const executeIK = () => {
    if (!viewerRef?.current || isExecutingIK) return;
    
    try {
      setIsExecutingIK(true);
      setIkStatus('Solving...');
      
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) {
        setIkStatus('No robot loaded');
        setIsExecutingIK(false);
        return;
      }
      
      // Find end effector and joints using ikAPI
      const { endEffector, joints } = ikAPI.findEndEffectorAndJoints(robot);
      if (!endEffector || !joints.length) {
        setIkStatus('No end effector found');
        setIsExecutingIK(false);
        return;
      }
      
      // Create target position vector
      const targetPos = new THREE.Vector3(
        targetPosition.x,
        targetPosition.y,
        targetPosition.z
      );
      
      // Solve IK using ikAPI
      const solution = ikAPI.solve(robot, targetPos);
      
      if (solution) {
        setIkStatus('Moving...');
        
        // Animate the movement
        ikAPI.animateMovement(robot, solution, () => {
          setIkStatus('Complete');
          setIsExecutingIK(false);
        });
      } else {
        setIkStatus('No solution found');
        setIsExecutingIK(false);
      }
    } catch (error) {
      console.error('Error executing IK:', error);
      setIkStatus('Error');
      setIsExecutingIK(false);
    }
  };
  
  /**
   * Stop current IK execution
   */
  const stopIK = () => {
    if (ikSolverRef.current && isExecutingIK) {
      ikSolverRef.current.stopAnimation();
      setIsExecutingIK(false);
      setIkStatus('Movement stopped');
    }
  };
  
  /**
   * Set current TCP position as target
   */
  const useCurrentPosition = () => {
    const activeTcp = tcpProvider.getActiveTCP();
    if (activeTcp && activeTcp.position) {
      setTargetPosition({
        x: parseFloat(activeTcp.position.x.toFixed(3)),
        y: parseFloat(activeTcp.position.y.toFixed(3)),
        z: parseFloat(activeTcp.position.z.toFixed(3))
      });
    } else {
      // If no TCP active, try to get end effector position
      const robot = viewerRef?.current?.getCurrentRobot();
      if (robot) {
        const { endEffector } = ikAPI.findEndEffectorAndJoints(robot);
        if (endEffector) {
          const worldPos = new THREE.Vector3();
          endEffector.getWorldPosition(worldPos);
          setTargetPosition({
            x: parseFloat(worldPos.x.toFixed(3)),
            y: parseFloat(worldPos.y.toFixed(3)),
            z: parseFloat(worldPos.z.toFixed(3))
          });
        }
      }
    }
  };
  
  // Convert comma to period for numeric parsing
  const normalizeDecimal = (value) => {
    if (typeof value !== 'string') return value;
    // Replace comma with period for numeric handling
    return value.replace(',', '.');
  };

  // Format number for display (with comma as decimal separator if needed)
  const formatForDisplay = (value) => {
    if (typeof value !== 'number') return value;
    // Check if we should use comma as decimal separator
    return value.toString().replace('.', ',');
  };
  
  /**
   * Handle target position change
   * @param {string} axis - The axis to change (x, y, z)
   * @param {string|number} value - The new value
   */
  const handleTargetChange = (axis, value) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };
  
  /**
   * Toggle debug mode
   */
  const toggleDebug = () => {
    const newMode = !GLOBAL_CONFIG.debug;
    setDebugMode(newMode);
  };

  return (
    <div className="controls">
      <DebugInfo enabled={debugMode} jointInfo={jointInfo} jointValues={jointValues} />
      
      {showLoadOptions && (
        <RobotLoader
          availableRobots={availableRobots}
          onLoad={handleLoadRobot}
          currentRobotName={currentRobotName}
        />
      )}
      
      {showJointControls && (
        <ControlJoints
          jointInfo={jointInfo}
          jointValues={jointValues}
          ignoreLimits={viewOptions.ignoreLimits}
          onJointChange={handleJointChange}
          onResetJoints={handleReset}
        />
      )}
      
      {showIKControls && (
        <IKController
          viewerRef={viewerRef}
          showIK={showIK}
          setShowIK={setShowIK}
          targetPosition={targetPosition}
          onTargetChange={handleTargetChange}
          onExecute={executeIK}
          onStop={stopIK}
          onUseCurrent={useCurrentPosition}
          isExecuting={isExecutingIK}
          status={ikStatus}
        />
      )}
      
      {showTableVisualization && (
        <>
            <EnvironmentManager viewerRef={viewerRef} />
            <FloorControls viewerRef={viewerRef} />
        </>
      )}
      
      <TCPManager viewerRef={viewerRef} />
      
      <Reposition viewerRef={viewerRef} />
      
      <TrajectoryViewer viewerRef={viewerRef} />
    </div>
  );
};

export default Controls;