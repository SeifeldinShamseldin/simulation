import * as THREE from 'three';
import EventBus from '../../utils/EventBus';
import { RobotEvents, EndEffectorEvents, BaseLinkEvents } from '../../contexts/dataTransfer';
import { getRobotGlobal } from '../../contexts/RobotContext';

const DEBUG = false; // Set to true for debugging

/**
 * EndEffector - Analyzes robot kinematic chain to identify base link and end effector
 * 
 * This module identifies:
 * - Base Link: The first link in the kinematic chain (at origin, no parent link)
 * - End Effector: The last link in the kinematic chain (leaf node with no child links)
 * 
 * Works purely on kinematic structure, not naming conventions.
 */
class EndEffector {
  constructor() {
    this.kinematicCache = new Map(); // robotId -> { baseLink, endEffector }
    this.latestEndEffector = null;
    this.lastEmitTime = 0;
    this.emitInterval = 100; // ms
    this._vecBase = new THREE.Vector3();
    this._vecEE = new THREE.Vector3();
    this._quatBase = new THREE.Quaternion();
    this._quatEE = new THREE.Quaternion();

    this.handleGetEndEffectorGlobal = this.handleGetEndEffectorGlobal.bind(this);
    this.handleJointsUpdated = this.handleJointsUpdated.bind(this);

    this.initialize();
    EventBus.on('EndEffector/GET', this.handleGetEndEffectorGlobal);
    EventBus.on(RobotEvents.GET_JOINT_VALUES, this.handleJointsUpdated);
    EventBus.on(RobotEvents.LOADED, this.handleRobotLoaded.bind(this));
    EventBus.on(RobotEvents.UNLOADED, this.handleRobotUnloaded.bind(this));
  }

  initialize() {
    if (DEBUG) console.log('[EndEffector] Initialized');
  }

  analyzeKinematicChain(robot) {
    const links = [];
    const joints = [];
    const linkNameToLink = new Map();

    // Collect all links and joints, and map link names to link objects
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

    // Find all child link names (i.e., links that are children of joints)
    const childLinkNames = new Set();
    joints.forEach(joint => {
      if (joint.child && joint.child.isURDFLink) {
        childLinkNames.add(joint.child.name);
      }
    });

    // The base link is the one that is NOT a child of any joint
    const baseLink = links.find(link => !childLinkNames.has(link.name));

    // Find end effector as before
    const endEffector = this.findEndEffector(baseLink, links, joints);

    return {
      baseLink,
      endEffector
    };
  }

  cacheKinematicChain(robotId, robot) {
    const analysis = this.analyzeKinematicChain(robot);
    if (analysis && analysis.baseLink && analysis.endEffector) {
      this.kinematicCache.set(robotId, analysis);
    }
  }

  handleRobotLoaded({ robotId, robot }) {
    if (!robot) return;
    this.cacheKinematicChain(robotId, robot);
    this.updateAndEmit(robotId);
  }

  handleRobotUnloaded({ robotId }) {
    this.kinematicCache.delete(robotId);
  }

  handleJointsUpdated({ robotId }) {
    this.updateAndEmit(robotId);
  }

  updateAndEmit(robotId) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return;
    let analysis = this.kinematicCache.get(robotId);
    if (!analysis) {
      analysis = this.analyzeKinematicChain(robot);
      if (!analysis || !analysis.baseLink || !analysis.endEffector) return;
      this.kinematicCache.set(robotId, analysis);
    }
    analysis.baseLink.updateMatrixWorld(true);
    analysis.endEffector.updateMatrixWorld(true);

    analysis.baseLink.getWorldPosition(this._vecBase);
    analysis.baseLink.getWorldQuaternion(this._quatBase);
    analysis.endEffector.getWorldPosition(this._vecEE);
    analysis.endEffector.getWorldQuaternion(this._quatEE);

    const relativePos = this._vecEE.clone().sub(this._vecBase);
    const relativeQuat = this._quatEE.clone().multiply(this._quatBase.clone().invert());

    this.emitEndEffectorGlobal(
      { x: relativePos.x, y: relativePos.y, z: relativePos.z },
      { x: relativeQuat.x, y: relativeQuat.y, z: relativeQuat.z, w: relativeQuat.w },
      robotId
    );
  }

  emitEndEffectorGlobal(pose, orientation, robotId) {
    const now = Date.now();
    if (now - this.lastEmitTime < this.emitInterval) return;
    this.lastEmitTime = now;
    this.latestEndEffector = { pose, orientation, robotId, timestamp: now };
    EventBus.emit('EndEffector/SET', { pose, orientation, robotId, timestamp: now });
  }

  handleGetEndEffectorGlobal() {
    if (this.latestEndEffector) {
      EventBus.emit('EndEffector/SET', this.latestEndEffector);
    }
  }

  /**
   * Handle request for end effector link
   */
  handleGetEndEffectorLink({ robotId, requestId }) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return;
    const analysis = this.analyzeKinematicChain(robot);
    
    EventBus.emit(EndEffectorEvents.Responses.LINK, {
      robotId,
      link: analysis?.endEffector?.name || null,
      requestId
    });
  }

  /**
   * Handle request for end effector state
   */
  handleGetEndEffectorState({ robotId, requestId }) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return;
    const analysis = this.analyzeKinematicChain(robot);
    
    if (!analysis?.endEffector) {
      EventBus.emit(EndEffectorEvents.Responses.STATE, {
        robotId,
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        hasTCP: false,
        requestId
      });
      return;
    }
    
    // Get world position and orientation
    analysis.endEffector.updateMatrixWorld(true);
    
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    
    analysis.endEffector.getWorldPosition(position);
    analysis.endEffector.getWorldQuaternion(quaternion);
    
    EventBus.emit(EndEffectorEvents.Responses.STATE, {
      robotId,
      position: { x: position.x, y: position.y, z: position.z },
      orientation: { 
        x: quaternion.x, 
        y: quaternion.y, 
        z: quaternion.z, 
        w: quaternion.w 
      },
      hasTCP: false, // TCP module will update this
      requestId
    });
  }

  /**
   * Get base link for a robot
   * @param {string} robotId 
   * @returns {Object|null} Base link or null
   */
  getBaseLink(robotId) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return null;
    const analysis = this.analyzeKinematicChain(robot);
    return analysis?.baseLink || null;
  }

  /**
   * Get end effector for a robot
   * @param {string} robotId 
   * @returns {Object|null} End effector link or null
   */
  getEndEffector(robotId) {
    const robot = getRobotGlobal(robotId);
    if (!robot) return null;
    const analysis = this.analyzeKinematicChain(robot);
    return analysis?.endEffector || null;
  }

  /**
   * Force recalculation of kinematic chain
   * @param {string} robotId 
   * @param {Object} robot 
   */
  recalculate(robotId, robot) {
    this.handleRobotLoaded({ robotId, robot });
  }

  /**
   * Cleanup
   */
  dispose() {
    this.kinematicCache.clear();
    EventBus.off('EndEffector/GET', this.handleGetEndEffectorGlobal);
    EventBus.off(RobotEvents.GET_JOINT_VALUES, this.handleJointsUpdated);
    // Remove other listeners if needed
  }

  /**
   * Print the current base link and end effector for all robots
   */
  printAll() {
    console.log('[EndEffector] Current robot analyses:');
    for (const [robotId, analysis] of this.robots.entries()) {
      console.log(`  Robot ${robotId}: baseLink = ${analysis.baseLink?.name}, endEffector = ${analysis.endEffector?.name}`);
    }
  }

  findEndEffector(startLink, allLinks, allJoints) {
    if (!startLink) return null;
    
    // Build parent-child relationships through joints
    const linkChildren = new Map();
    
    allJoints.forEach(joint => {
      // Each joint connects a parent link to a child link
      let parentLink = null;
      let childLink = null;
      
      // Find parent and child links of this joint
      joint.traverse((child) => {
        if (child.isURDFLink && child !== joint) {
          if (!parentLink) {
            parentLink = child;
          } else if (!childLink && child !== parentLink) {
            childLink = child;
          }
        }
      });
      
      // Map parent to children
      if (parentLink && childLink) {
        if (!linkChildren.has(parentLink)) {
          linkChildren.set(parentLink, []);
        }
        linkChildren.get(parentLink).push(childLink);
      }
    });
    
    // Find the longest chain from base to end
    let endEffector = startLink;
    let maxDepth = 0;
    
    const findDeepestLink = (link, depth = 0) => {
      if (depth > maxDepth) {
        maxDepth = depth;
        endEffector = link;
      }
      
      const children = linkChildren.get(link) || [];
      children.forEach(child => {
        findDeepestLink(child, depth + 1);
      });
    };
    
    findDeepestLink(startLink);
    
    // Alternative method: find leaf links (links with no children)
    const leafLinks = allLinks.filter(link => {
      const children = linkChildren.get(link) || [];
      return children.length === 0 && link !== startLink;
    });
    
    // If we have leaf links, choose the one furthest from base
    if (leafLinks.length > 0) {
      // For now, return the first leaf link found
      // Could be enhanced to calculate actual kinematic distance
      endEffector = leafLinks[0];
    }
    
    return endEffector;
  }
}

// Create singleton instance
const endEffector = new EndEffector();

// Export for use in other modules
export default endEffector;

// Also export the class for testing
export { EndEffector }; 