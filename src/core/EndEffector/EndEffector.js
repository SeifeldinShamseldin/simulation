import * as THREE from 'three';
import EventBus from '../../utils/EventBus';
import { RobotEvents } from '../../contexts/dataTransfer';
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
    this.handleTCPMount = this.handleTCPMount.bind(this);
    this.handleTCPUnmount = this.handleTCPUnmount.bind(this);

    this.initialize();
    
    // Listen to simplified events only
    EventBus.on('EndEffector/GET', this.handleGetEndEffectorGlobal);
    EventBus.on(RobotEvents.LOADED, this.handleRobotLoaded.bind(this));
    EventBus.on(RobotEvents.UNLOADED, this.handleRobotUnloaded.bind(this));
    
    // Listen to global TCP events
    EventBus.on('tcp:mount', this.handleTCPMount);
    EventBus.on('tcp:unmount', this.handleTCPUnmount);
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

  /**
   * Handle TCP mount event
   */
  handleTCPMount({ robotId, toolId, toolName, timestamp }) {
    if (DEBUG) console.log(`[EndEffector] TCP mounted on robot ${robotId}:`, toolName);
    
    // Invalidate cache to force recalculation
    this.kinematicCache.delete(robotId);

    // Get the latest robot state
    const robot = getRobotGlobal(robotId);
    if (DEBUG) console.log('[EndEffector] Robot state after TCP mount:', robot);
    if (robot) {
      this.cacheKinematicChain(robotId, robot);
      this.updateAndEmit(robotId);
    }
    
    // Send "Done" status
    EventBus.emit('tcp:mount:status', {
      robotId,
      status: 'Done',
      timestamp: Date.now()
    });
  }

  /**
   * Handle TCP unmount event
   */
  handleTCPUnmount({ robotId, timestamp }) {
    
    
    // Invalidate cache to force recalculation
    this.kinematicCache.delete(robotId);

    // Get the latest robot state
    const robot = getRobotGlobal(robotId);
    if (DEBUG) console.log('[EndEffector] Robot state after TCP unmount:', robot);
    if (robot) {
      this.cacheKinematicChain(robotId, robot);
      this.updateAndEmit(robotId);
    }
    
    // Send "Done" status
    EventBus.emit('tcp:unmount:status', {
      robotId,
      status: 'Done',
      timestamp: Date.now()
    });
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
    
    // Calculate pose (vector from baseLink to TCP tip) and orientation (endEffector quaternion)
    let pose = null;
    let orientation = null;
    if (analysis.baseLink && analysis.endEffector) {
      analysis.baseLink.updateWorldMatrix(true, false);
      analysis.endEffector.updateWorldMatrix(true, false);
      const basePos = new THREE.Vector3();
      analysis.baseLink.getWorldPosition(basePos);

      // === Find the last point of the end effector mesh ===
      let lastPointWorld = null;
      analysis.endEffector.traverse(child => {
        if (child.isMesh && child.geometry) {
          // Ensure geometry is up to date
          child.geometry.computeBoundingBox();
          // Get all vertices in local space
          const position = child.geometry.attributes.position;
          let maxDist = -Infinity;
          let lastPoint = new THREE.Vector3();
          for (let i = 0; i < position.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(position, i);
            const dist = v.length(); // or use v.z, v.x, etc. for axis-based
            if (dist > maxDist) {
              maxDist = dist;
              lastPoint.copy(v);
            }
          }
          // Transform to world coordinates
          lastPointWorld = lastPoint.clone().applyMatrix4(child.matrixWorld);
        }
      });

      // Fallback: if no mesh found, use link origin
      if (!lastPointWorld) {
        lastPointWorld = new THREE.Vector3();
        analysis.endEffector.getWorldPosition(lastPointWorld);
      }

      pose = {
        x: lastPointWorld.x - basePos.x,
        y: lastPointWorld.y - basePos.y,
        z: lastPointWorld.z - basePos.z
      };

      const eeQuat = new THREE.Quaternion();
      analysis.endEffector.getWorldQuaternion(eeQuat);
      orientation = {
        x: eeQuat.x,
        y: eeQuat.y,
        z: eeQuat.z,
        w: eeQuat.w
      };
    }
    // Emit names, pose, and orientation
    EventBus.emit('EndEffector/SET', {
      robotId,
      baseLink: analysis.baseLink.name,
      endEffector: analysis.endEffector.name,
      pose,
      orientation,
      status: 'Done',
      timestamp: Date.now()
    });
  }

  emitEndEffectorGlobal(pose, orientation, robotId) {
    const now = Date.now();
    if (now - this.lastEmitTime < this.emitInterval) return;
    
    this.lastEmitTime = now;
    this.latestEndEffector = { pose, orientation, robotId, timestamp: now };
    
    // Use only EndEffector/SET event
    EventBus.emit('EndEffector/SET', { 
      pose, 
      orientation, 
      robotId, 
      timestamp: now,
      status: 'Done'  // Include "Done" status
    });
  }

  handleGetEndEffectorGlobal() {
    if (this.latestEndEffector) {
      // Respond to EndEffector/GET with EndEffector/SET
      EventBus.emit('EndEffector/SET', {
        ...this.latestEndEffector,
        status: 'Done'  // Include "Done" status
      });
    }
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
    EventBus.off(RobotEvents.LOADED, this.handleRobotLoaded.bind(this));
    EventBus.off(RobotEvents.UNLOADED, this.handleRobotUnloaded.bind(this));
    EventBus.off('tcp:mount', this.handleTCPMount);
    EventBus.off('tcp:unmount', this.handleTCPUnmount);
  }

  /**
   * Print the current base link and end effector for all robots
   */
  printAll() {
    console.log('[EndEffector] Current robot analyses:');
    for (const [robotId, analysis] of this.kinematicCache.entries()) {
      console.log(`  Robot ${robotId}: baseLink = ${analysis.baseLink?.name}, endEffector = ${analysis.endEffector?.name}`);
    }
  }

  findEndEffector(startLink, allLinks, allJoints) {
    if (!startLink) return null;
    
    // Prefer a link named 'tcp' as the end effector if it exists
    const tcpLink = allLinks.find(link => link.name === 'tcp');
    if (tcpLink) {
      return tcpLink;
    }
    
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