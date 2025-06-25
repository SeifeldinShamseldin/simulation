import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRobotContext } from './RobotContext';
import EventBus from '../utils/EventBus';
import { RobotEvents } from './dataTransfer';

const DEBUG = false; // Set to true for debugging

const EndEffectorContext = createContext(null);

export const EndEffectorProvider = ({ children }) => {
  // ========== ROBOT ACCESS (THE ONE WAY) ==========
  const { getRobot } = useRobotContext();
  
  // ========== STATE ==========
  const [kinematicCache] = useState(new Map()); // robotId -> { baseLink, endEffector }
  const [poseCache] = useState(new Map()); // robotId -> { pose, orientation }
  const [processingStatus] = useState(new Map()); // robotId -> boolean (prevent concurrent processing)
  const updateIntervalRef = useRef(null); // Update loop interval
  const updateRate = 100; // Update rate in ms (10 Hz)
  
  // ========== ROBOT ACCESS HELPER ==========
  const accessRobot = useCallback((robotId) => {
    const robot = getRobot(robotId);
    if (!robot) {
      console.warn(`[EndEffector] Robot ${robotId} not found`);
      return null;
    }
    return robot;
  }, [getRobot]);
  
  // ========== KINEMATIC ANALYSIS ==========
  const findEndEffector = useCallback((startLink, allLinks, allJoints) => {
    if (!startLink) return null;
    
    // Prefer TCP link if it exists
    const tcpLink = allLinks.find(link => link.name === 'tcp');
    if (tcpLink) return tcpLink;
    
    // Build parent-child relationships
    const linkChildren = new Map();
    
    allJoints.forEach(joint => {
      let parentLink = null;
      let childLink = null;
      
      joint.traverse((child) => {
        if (child.isURDFLink && child !== joint) {
          if (!parentLink) {
            parentLink = child;
          } else if (!childLink && child !== parentLink) {
            childLink = child;
          }
        }
      });
      
      if (parentLink && childLink) {
        if (!linkChildren.has(parentLink)) {
          linkChildren.set(parentLink, []);
        }
        linkChildren.get(parentLink).push(childLink);
      }
    });
    
    // Find leaf links
    const leafLinks = allLinks.filter(link => {
      const children = linkChildren.get(link) || [];
      return children.length === 0 && link !== startLink;
    });
    
    return leafLinks.length > 0 ? leafLinks[0] : startLink;
  }, []);
  
  const analyzeKinematicChain = useCallback((robot) => {
    const links = [];
    const joints = [];
    const linkNameToLink = new Map();

    // Collect all links and joints
    robot.traverse((child) => {
      if (child.isURDFLink) {
        links.push(child);
        linkNameToLink.set(child.name, child);
      } else if (child.isURDFJoint) {
        joints.push(child);
      }
    });

    if (links.length === 0) {
      console.warn('[EndEffector] No URDF links found in robot');
      return null;
    }

    // Find child link names
    const childLinkNames = new Set();
    joints.forEach(joint => {
      if (joint.child && joint.child.isURDFLink) {
        childLinkNames.add(joint.child.name);
      }
    });

    // Base link is the one that is NOT a child of any joint
    const baseLink = links.find(link => !childLinkNames.has(link.name));
    
    // Find end effector
    const endEffector = findEndEffector(baseLink, links, joints);

    return { baseLink, endEffector };
  }, [findEndEffector]);
  
  // ========== POSE CALCULATION ==========
  const calculatePoseAndOrientation = useCallback((robotId) => {
    const cache = kinematicCache.get(robotId);
    if (!cache || !cache.baseLink || !cache.endEffector) return null;
    
    // Update world matrices
    cache.baseLink.updateWorldMatrix(true, false);
    cache.endEffector.updateWorldMatrix(true, false);
    
    // Get base position
    const basePos = new THREE.Vector3();
    cache.baseLink.getWorldPosition(basePos);
    
    // Find the tip of the end effector
    let tipPosition = new THREE.Vector3();
    let foundMesh = false;
    
    cache.endEffector.traverse(child => {
      if (child.isMesh && child.geometry && !foundMesh) {
        child.geometry.computeBoundingBox();
        const bbox = child.geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        center.applyMatrix4(child.matrixWorld);
        tipPosition.copy(center);
        foundMesh = true;
      }
    });
    
    // Fallback to link position if no mesh
    if (!foundMesh) {
      cache.endEffector.getWorldPosition(tipPosition);
    }
    
    // Calculate pose (offset from base)
    const pose = {
      x: tipPosition.x - basePos.x,
      y: tipPosition.y - basePos.y,
      z: tipPosition.z - basePos.z
    };
    
    // Get orientation
    const quaternion = new THREE.Quaternion();
    cache.endEffector.getWorldQuaternion(quaternion);
    const orientation = {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    };
    
    return { pose, orientation };
  }, [kinematicCache]);
  
  // ========== HELPER FUNCTIONS ==========
  const isPoseEqual = useCallback((pose1, pose2) => {
    const epsilon = 0.0001;
    return Math.abs(pose1.x - pose2.x) < epsilon &&
           Math.abs(pose1.y - pose2.y) < epsilon &&
           Math.abs(pose1.z - pose2.z) < epsilon;
  }, []);
  
  const isOrientationEqual = useCallback((ori1, ori2) => {
    const epsilon = 0.0001;
    return Math.abs(ori1.x - ori2.x) < epsilon &&
           Math.abs(ori1.y - ori2.y) < epsilon &&
           Math.abs(ori1.z - ori2.z) < epsilon &&
           Math.abs(ori1.w - ori2.w) < epsilon;
  }, []);
  
  const emitEndEffectorUpdate = useCallback((robotId) => {
    const kinematicData = kinematicCache.get(robotId);
    const poseData = poseCache.get(robotId);
    
    if (!kinematicData) return;
    
    const payload = {
      robotId,
      baseLink: kinematicData.baseLink?.name || 'unknown',
      endEffector: kinematicData.endEffector?.name || 'unknown',
      pose: poseData?.pose || { x: 0, y: 0, z: 0 },
      orientation: poseData?.orientation || { x: 0, y: 0, z: 0, w: 1 },
      status: 'Done',
      timestamp: Date.now()
    };
    
    EventBus.emit('EndEffector/SET', payload);
  }, [kinematicCache, poseCache]);
  
  // ========== EVENT HANDLERS ==========
  const handleGetEndEffector = useCallback(() => {
    // Emit the latest data for all robots
    for (const [robotId, cache] of kinematicCache.entries()) {
      emitEndEffectorUpdate(robotId);
    }
  }, [kinematicCache, emitEndEffectorUpdate]);
  
  const handleRobotLoaded = useCallback(({ robotId, robot }) => {
    if (!robot) return;
    
    const analysis = analyzeKinematicChain(robot);
    if (analysis && analysis.baseLink && analysis.endEffector) {
      kinematicCache.set(robotId, analysis);
      
      // Calculate initial pose
      const poseData = calculatePoseAndOrientation(robotId);
      if (poseData) {
        poseCache.set(robotId, poseData);
        emitEndEffectorUpdate(robotId);
      }
    }
  }, [analyzeKinematicChain, calculatePoseAndOrientation, kinematicCache, poseCache, emitEndEffectorUpdate]);
  
  const handleRobotUnloaded = useCallback(({ robotId }) => {
    kinematicCache.delete(robotId);
    poseCache.delete(robotId);
    processingStatus.delete(robotId);
  }, [kinematicCache, poseCache, processingStatus]);
  
  const handleJointChange = useCallback(({ robotId }) => {
    // Mark robot as needing update
    if (kinematicCache.has(robotId)) {
      // Update will happen in the next update loop cycle
      if (DEBUG) console.log(`[EndEffector] Joint changed for robot ${robotId}`);
    }
  }, [kinematicCache]);
  
  const handleTCPMount = useCallback(async ({ robotId, toolId, toolName, timestamp }) => {
    if (DEBUG) console.log(`[EndEffector] TCP mounted on robot ${robotId}:`, toolName);
    
    // Prevent concurrent processing
    if (processingStatus.get(robotId)) {
      if (DEBUG) console.log('[EndEffector] Already processing, skipping');
      return;
    }
    
    processingStatus.set(robotId, true);
    
    try {
      // Get updated robot state
      const robot = accessRobot(robotId);
      if (!robot) {
        console.warn(`[EndEffector] Robot ${robotId} not found`);
        return;
      }
      
      // Recalculate kinematic chain
      const analysis = analyzeKinematicChain(robot);
      if (analysis && analysis.baseLink && analysis.endEffector) {
        kinematicCache.set(robotId, analysis);
        
        // Calculate new pose
        const poseData = calculatePoseAndOrientation(robotId);
        if (poseData) {
          poseCache.set(robotId, poseData);
          emitEndEffectorUpdate(robotId);
        }
      }
      
      // Wait 1 second before sending done status
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send done status
      EventBus.emit('tcp:mount:status', {
        robotId,
        status: 'Done',
        timestamp: Date.now()
      });
      
    } finally {
      processingStatus.set(robotId, false);
    }
  }, [processingStatus, accessRobot, analyzeKinematicChain, kinematicCache, calculatePoseAndOrientation, poseCache, emitEndEffectorUpdate]);
  
  const handleTCPUnmount = useCallback(async ({ robotId, timestamp }) => {
    if (DEBUG) console.log(`[EndEffector] TCP unmounted from robot ${robotId}`);
    
    // Prevent concurrent processing
    if (processingStatus.get(robotId)) {
      if (DEBUG) console.log('[EndEffector] Already processing, skipping');
      return;
    }
    
    processingStatus.set(robotId, true);
    
    try {
      // Get updated robot state
      const robot = accessRobot(robotId);
      if (!robot) {
        console.warn(`[EndEffector] Robot ${robotId} not found`);
        return;
      }
      
      // Recalculate kinematic chain
      const analysis = analyzeKinematicChain(robot);
      if (analysis && analysis.baseLink && analysis.endEffector) {
        kinematicCache.set(robotId, analysis);
        
        // Calculate new pose
        const poseData = calculatePoseAndOrientation(robotId);
        if (poseData) {
          poseCache.set(robotId, poseData);
          emitEndEffectorUpdate(robotId);
        }
      }
      
      // Wait 1 second before sending done status
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send done status
      EventBus.emit('tcp:unmount:status', {
        robotId,
        status: 'Done',
        timestamp: Date.now()
      });
      
    } finally {
      processingStatus.set(robotId, false);
    }
  }, [processingStatus, accessRobot, analyzeKinematicChain, kinematicCache, calculatePoseAndOrientation, poseCache, emitEndEffectorUpdate]);
  
  // ========== UPDATE LOOP ==========
  const startUpdateLoop = useCallback(() => {
    if (updateIntervalRef.current) return;
    
    updateIntervalRef.current = setInterval(() => {
      // Update all tracked robots
      for (const robotId of kinematicCache.keys()) {
        const poseData = calculatePoseAndOrientation(robotId);
        if (poseData) {
          // Check if pose has changed
          const cachedPose = poseCache.get(robotId);
          if (!cachedPose || 
              !isPoseEqual(cachedPose.pose, poseData.pose) ||
              !isOrientationEqual(cachedPose.orientation, poseData.orientation)) {
            poseCache.set(robotId, poseData);
            emitEndEffectorUpdate(robotId);
          }
        }
      }
    }, updateRate);
  }, [kinematicCache, calculatePoseAndOrientation, poseCache, isPoseEqual, isOrientationEqual, emitEndEffectorUpdate]);
  
  const stopUpdateLoop = useCallback(() => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
  }, []);
  
  // ========== PUBLIC API ==========
  const recalculate = useCallback((robotId) => {
    const robot = accessRobot(robotId);
    if (!robot) return;
    
    const analysis = analyzeKinematicChain(robot);
    if (analysis && analysis.baseLink && analysis.endEffector) {
      kinematicCache.set(robotId, analysis);
      
      const poseData = calculatePoseAndOrientation(robotId);
      if (poseData) {
        poseCache.set(robotId, poseData);
        emitEndEffectorUpdate(robotId);
      }
    }
  }, [accessRobot, analyzeKinematicChain, kinematicCache, calculatePoseAndOrientation, poseCache, emitEndEffectorUpdate]);
  
  // ========== EFFECTS ==========
  useEffect(() => {
    // Listen to events
    const unsubscribeGet = EventBus.on('EndEffector/GET', handleGetEndEffector);
    const unsubscribeLoaded = EventBus.on(RobotEvents.LOADED, handleRobotLoaded);
    const unsubscribeUnloaded = EventBus.on(RobotEvents.UNLOADED, handleRobotUnloaded);
    const unsubscribeTCPMount = EventBus.on('tcp:mount', handleTCPMount);
    const unsubscribeTCPUnmount = EventBus.on('tcp:unmount', handleTCPUnmount);
    const unsubscribeJointChange = EventBus.on(RobotEvents.SET_JOINT_VALUE, handleJointChange);
    const unsubscribeJointChanges = EventBus.on(RobotEvents.SET_JOINT_VALUES, handleJointChange);
    
    // Start update loop
    startUpdateLoop();
    
    if (DEBUG) console.log('[EndEffector] Initialized');
    
    // Cleanup
    return () => {
      stopUpdateLoop();
      unsubscribeGet();
      unsubscribeLoaded();
      unsubscribeUnloaded();
      unsubscribeTCPMount();
      unsubscribeTCPUnmount();
      unsubscribeJointChange();
      unsubscribeJointChanges();
    };
  }, [handleGetEndEffector, handleRobotLoaded, handleRobotUnloaded, handleTCPMount, handleTCPUnmount, handleJointChange, startUpdateLoop, stopUpdateLoop]);
  
  const value = {
    recalculate,
    getEndEffectorData: (robotId) => ({
      kinematic: kinematicCache.get(robotId),
      pose: poseCache.get(robotId)
    })
  };
  
  return (
    <EndEffectorContext.Provider value={value}>
      {children}
    </EndEffectorContext.Provider>
  );
};

export const useEndEffector = () => {
  const context = useContext(EndEffectorContext);
  if (!context) {
    throw new Error('useEndEffector must be used within EndEffectorProvider');
  }
  return context;
};