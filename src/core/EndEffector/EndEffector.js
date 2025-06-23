import * as THREE from 'three';
import EventBus from '../../utils/EventBus';
import { RobotEvents } from '../../contexts/dataTransfer';
import { getRobotGlobal } from '../../contexts/RobotContext';

const DEBUG = false; // Set to true for debugging

/**
 * EndEffector - Optimized module for tracking robot end effector state
 * 
 * Key optimizations:
 * - Only recalculates on TCP mount/unmount events
 * - Caches calculations to avoid redundant processing
 * - Emits updates only when values change
 * - Implements delay before sending status to prevent race conditions
 */
class EndEffector {
  constructor() {
    this.kinematicCache = new Map(); // robotId -> { baseLink, endEffector }
    this.poseCache = new Map(); // robotId -> { pose, orientation }
    this.processingStatus = new Map(); // robotId -> boolean (prevent concurrent processing)
    this.updateInterval = null; // Update loop interval
    this.updateRate = 100; // Update rate in ms (10 Hz)
    
    // Bind methods
    this.handleGetEndEffector = this.handleGetEndEffector.bind(this);
    this.handleTCPMount = this.handleTCPMount.bind(this);
    this.handleTCPUnmount = this.handleTCPUnmount.bind(this);
    this.handleRobotLoaded = this.handleRobotLoaded.bind(this);
    this.handleRobotUnloaded = this.handleRobotUnloaded.bind(this);
    this.handleJointChange = this.handleJointChange.bind(this);
    
    this.initialize();
  }

  initialize() {
    // Listen to events
    EventBus.on('EndEffector/GET', this.handleGetEndEffector);
    EventBus.on(RobotEvents.LOADED, this.handleRobotLoaded);
    EventBus.on(RobotEvents.UNLOADED, this.handleRobotUnloaded);
    EventBus.on('tcp:mount', this.handleTCPMount);
    EventBus.on('tcp:unmount', this.handleTCPUnmount);
    
    // Listen to joint changes for real-time updates
    EventBus.on(RobotEvents.SET_JOINT_VALUE, this.handleJointChange);
    EventBus.on(RobotEvents.SET_JOINT_VALUES, this.handleJointChange);
    
    // Start update loop for real-time pose updates
    this.startUpdateLoop();
    
    if (DEBUG) console.log('[EndEffector] Initialized');
  }

  /**
   * Analyze kinematic chain to find base and end effector links
   */
  analyzeKinematicChain(robot) {
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
    const endEffector = this.findEndEffector(baseLink, links, joints);

    return { baseLink, endEffector };
  }

  /**
   * Find the end effector link (leaf node or TCP)
   */
  findEndEffector(startLink, allLinks, allJoints) {
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
  }

  /**
   * Calculate pose and orientation for a robot
   */
  calculatePoseAndOrientation(robotId) {
    const cache = this.kinematicCache.get(robotId);
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
  }

  /**
   * Handle robot loaded event
   */
  handleRobotLoaded({ robotId, robot }) {
    if (!robot) return;
    
    const analysis = this.analyzeKinematicChain(robot);
    if (analysis && analysis.baseLink && analysis.endEffector) {
      this.kinematicCache.set(robotId, analysis);
      
      // Calculate initial pose
      const poseData = this.calculatePoseAndOrientation(robotId);
      if (poseData) {
        this.poseCache.set(robotId, poseData);
        this.emitEndEffectorUpdate(robotId);
      }
    }
  }

  /**
   * Handle robot unloaded event
   */
  handleRobotUnloaded({ robotId }) {
    this.kinematicCache.delete(robotId);
    this.poseCache.delete(robotId);
    this.processingStatus.delete(robotId);
  }

  /**
   * Handle TCP mount event
   */
  async handleTCPMount({ robotId, toolId, toolName, timestamp }) {
    if (DEBUG) console.log(`[EndEffector] TCP mounted on robot ${robotId}:`, toolName);
    
    // Prevent concurrent processing
    if (this.processingStatus.get(robotId)) {
      if (DEBUG) console.log('[EndEffector] Already processing, skipping');
      return;
    }
    
    this.processingStatus.set(robotId, true);
    
    try {
      // Get updated robot state
      const robot = getRobotGlobal(robotId);
      if (!robot) {
        console.warn(`[EndEffector] Robot ${robotId} not found`);
        return;
      }
      
      // Recalculate kinematic chain
      const analysis = this.analyzeKinematicChain(robot);
      if (analysis && analysis.baseLink && analysis.endEffector) {
        this.kinematicCache.set(robotId, analysis);
        
        // Calculate new pose
        const poseData = this.calculatePoseAndOrientation(robotId);
        if (poseData) {
          this.poseCache.set(robotId, poseData);
          this.emitEndEffectorUpdate(robotId);
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
      this.processingStatus.set(robotId, false);
    }
  }

  /**
   * Handle TCP unmount event
   */
  async handleTCPUnmount({ robotId, timestamp }) {
    if (DEBUG) console.log(`[EndEffector] TCP unmounted from robot ${robotId}`);
    
    // Prevent concurrent processing
    if (this.processingStatus.get(robotId)) {
      if (DEBUG) console.log('[EndEffector] Already processing, skipping');
      return;
    }
    
    this.processingStatus.set(robotId, true);
    
    try {
      // Get updated robot state
      const robot = getRobotGlobal(robotId);
      if (!robot) {
        console.warn(`[EndEffector] Robot ${robotId} not found`);
        return;
      }
      
      // Recalculate kinematic chain
      const analysis = this.analyzeKinematicChain(robot);
      if (analysis && analysis.baseLink && analysis.endEffector) {
        this.kinematicCache.set(robotId, analysis);
        
        // Calculate new pose
        const poseData = this.calculatePoseAndOrientation(robotId);
        if (poseData) {
          this.poseCache.set(robotId, poseData);
          this.emitEndEffectorUpdate(robotId);
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
      this.processingStatus.set(robotId, false);
    }
  }

  /**
   * Handle EndEffector/GET request
   */
  handleGetEndEffector() {
    // Emit the latest data for all robots
    for (const [robotId, cache] of this.kinematicCache.entries()) {
      this.emitEndEffectorUpdate(robotId);
    }
  }

  /**
   * Handle joint change events
   */
  handleJointChange({ robotId }) {
    // Mark robot as needing update
    if (this.kinematicCache.has(robotId)) {
      // Update will happen in the next update loop cycle
      if (DEBUG) console.log(`[EndEffector] Joint changed for robot ${robotId}`);
    }
  }

  /**
   * Start the update loop for real-time pose updates
   */
  startUpdateLoop() {
    if (this.updateInterval) return;
    
    this.updateInterval = setInterval(() => {
      // Update all tracked robots
      for (const robotId of this.kinematicCache.keys()) {
        const poseData = this.calculatePoseAndOrientation(robotId);
        if (poseData) {
          // Check if pose has changed
          const cachedPose = this.poseCache.get(robotId);
          if (!cachedPose || 
              !this.isPoseEqual(cachedPose.pose, poseData.pose) ||
              !this.isOrientationEqual(cachedPose.orientation, poseData.orientation)) {
            this.poseCache.set(robotId, poseData);
            this.emitEndEffectorUpdate(robotId);
          }
        }
      }
    }, this.updateRate);
  }

  /**
   * Stop the update loop
   */
  stopUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Check if two poses are equal
   */
  isPoseEqual(pose1, pose2) {
    const epsilon = 0.0001;
    return Math.abs(pose1.x - pose2.x) < epsilon &&
           Math.abs(pose1.y - pose2.y) < epsilon &&
           Math.abs(pose1.z - pose2.z) < epsilon;
  }

  /**
   * Check if two orientations are equal
   */
  isOrientationEqual(ori1, ori2) {
    const epsilon = 0.0001;
    return Math.abs(ori1.x - ori2.x) < epsilon &&
           Math.abs(ori1.y - ori2.y) < epsilon &&
           Math.abs(ori1.z - ori2.z) < epsilon &&
           Math.abs(ori1.w - ori2.w) < epsilon;
  }

  /**
   * Emit EndEffector/SET event with current data
   */
  emitEndEffectorUpdate(robotId) {
    const kinematicData = this.kinematicCache.get(robotId);
    const poseData = this.poseCache.get(robotId);
    
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
  }

  /**
   * Force recalculation (for external use if needed)
   */
  recalculate(robotId) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return;
    
    const analysis = this.analyzeKinematicChain(robot);
    if (analysis && analysis.baseLink && analysis.endEffector) {
      this.kinematicCache.set(robotId, analysis);
      
      const poseData = this.calculatePoseAndOrientation(robotId);
      if (poseData) {
        this.poseCache.set(robotId, poseData);
        this.emitEndEffectorUpdate(robotId);
      }
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    // Stop update loop
    this.stopUpdateLoop();
    
    // Remove event listeners
    EventBus.off('EndEffector/GET', this.handleGetEndEffector);
    EventBus.off(RobotEvents.LOADED, this.handleRobotLoaded);
    EventBus.off(RobotEvents.UNLOADED, this.handleRobotUnloaded);
    EventBus.off('tcp:mount', this.handleTCPMount);
    EventBus.off('tcp:unmount', this.handleTCPUnmount);
    EventBus.off(RobotEvents.SET_JOINT_VALUE, this.handleJointChange);
    EventBus.off(RobotEvents.SET_JOINT_VALUES, this.handleJointChange);
    
    // Clear caches
    this.kinematicCache.clear();
    this.poseCache.clear();
    this.processingStatus.clear();
  }
}

// Create singleton instance
const endEffector = new EndEffector();

// Export for use in other modules
export default endEffector;
export { EndEffector };