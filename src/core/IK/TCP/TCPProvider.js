// src/core/IK/TCP/TCPProvider.js
import * as THREE from 'three';
import EventBus from '../../../utils/EventBus';

/**
 * Core TCP Provider - Manages TCP data and communicates with IK API
 * Enhanced to find TCP based on visual elements
 */
class TCPProvider {
  constructor() {
    if (TCPProvider.instance) {
      return TCPProvider.instance;
    }
    TCPProvider.instance = this;

    // TCP storage
    this.tcps = new Map();
    this.activeTcpId = null;
    this.defaultTcpId = 'default';

    // Robot reference for position calculation
    this.currentRobot = null;
    this.isCalculating = false;

    // Cache for last visual element
    this.lastVisualCache = new WeakMap();

    // Initialize default TCP
    this.createDefaultTCP();

    // EventBus listeners
    EventBus.on('tcp:calculate-realtime', this.handleRealTimeCalculation.bind(this));
    EventBus.on('tcp:force-update', this.forceUpdate.bind(this));
    
    // Start update loop
    this.startUpdateLoop();
  }

  /**
   * Create default TCP configuration
   */
  createDefaultTCP() {
    this.tcps.set(this.defaultTcpId, {
      id: this.defaultTcpId,
      name: 'Default TCP',
      stlPath: null,
      settings: {
        visible: true,
        size: 0.03,
        color: '#ff0000',
        offset: { x: 0.0, y: 0.0, z: 0.0 }
      },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      isDefault: true,
      lastUpdated: Date.now()
    });
    this.activeTcpId = this.defaultTcpId;
  }

  /**
   * Find the last visual element in the robot hierarchy
   * This is more reliable than looking for specific joint names
   * @param {Object} robot - Robot instance
   * @returns {Object|null} Last visual element and its metadata
   */
  findLastVisualElement(robot) {
    if (!robot) return null;

    // Check cache first
    if (this.lastVisualCache.has(robot)) {
      const cached = this.lastVisualCache.get(robot);
      // Validate cache is still valid
      if (cached && cached.element && cached.element.parent) {
        return cached;
      }
    }

    let furthestVisual = null;
    let furthestDistance = -Infinity;
    let furthestJoint = null;
    
    // First, collect all visual elements and their positions
    const visualElements = [];
    
    robot.traverse((child) => {
      // Look for visual elements that have actual geometry
      if (child.isURDFVisual && child.children.length > 0) {
        // Check if this visual has actual rendered geometry
        let hasGeometry = false;
        child.traverse((grandChild) => {
          if (grandChild.isMesh && grandChild.geometry && grandChild.visible !== false) {
            hasGeometry = true;
          }
        });
        
        if (hasGeometry) {
          // Find the parent joint of this visual
          let parentJoint = child.parent;
          while (parentJoint && !parentJoint.isURDFJoint) {
            parentJoint = parentJoint.parent;
          }
          
          visualElements.push({
            visual: child,
            joint: parentJoint,
            hasGeometry: hasGeometry
          });
        }
      }
    });

    // If we have visual elements, find the one that's furthest along the kinematic chain
    if (visualElements.length > 0) {
      // Calculate the "distance" along the kinematic chain for each visual
      visualElements.forEach(({ visual, joint }) => {
        let distance = 0;
        let current = visual;
        
        // Count the number of joints from root to this visual
        while (current && current !== robot) {
          if (current.isURDFJoint) {
            distance++;
          }
          current = current.parent;
        }
        
        // Also consider the world position as a tiebreaker
        const worldPos = new THREE.Vector3();
        visual.getWorldPosition(worldPos);
        const positionBonus = worldPos.length() * 0.01; // Small bonus for elements further from origin
        
        const totalDistance = distance + positionBonus;
        
        if (totalDistance > furthestDistance) {
          furthestDistance = totalDistance;
          furthestVisual = visual;
          furthestJoint = joint;
        }
      });
    }

    // If no visual elements found, fall back to finding the last joint with children
    if (!furthestVisual && robot.joints) {
      const joints = Object.values(robot.joints).filter(
        j => j.jointType !== 'fixed' && j.isURDFJoint && j.children.length > 0
      );
      
      if (joints.length > 0) {
        // Sort joints by their depth in the hierarchy
        joints.sort((a, b) => {
          let depthA = 0, depthB = 0;
          let current = a;
          while (current && current !== robot) {
            depthA++;
            current = current.parent;
          }
          current = b;
          while (current && current !== robot) {
            depthB++;
            current = current.parent;
          }
          return depthB - depthA;
        });
        
        furthestJoint = joints[0];
        // Use the joint's first child as the visual reference
        if (furthestJoint.children.length > 0) {
          furthestVisual = furthestJoint.children[0];
        }
      }
    }

    const result = furthestVisual ? {
      element: furthestVisual,
      joint: furthestJoint,
      type: furthestVisual.isURDFVisual ? 'visual' : 'link'
    } : null;

    // Cache the result
    if (result && robot) {
      this.lastVisualCache.set(robot, result);
    }

    return result;
  }

  /**
   * Calculate TCP position based on the last visual element
   * @param {string} tcpId - TCP ID (optional, uses active if not provided)
   * @returns {Object|null} Position {x, y, z} or null
   */
  calculateTCPPosition(tcpId = null) {
    const targetTcpId = tcpId || this.activeTcpId;
    const tcp = this.tcps.get(targetTcpId);
    
    if (!tcp || !this.currentRobot) {
      return null;
    }

    try {
      // Find the last visual element
      const lastVisualData = this.findLastVisualElement(this.currentRobot);
      
      if (!lastVisualData || !lastVisualData.element) {
        console.warn('No visual element found for TCP calculation');
        return { x: 0, y: 0, z: 0 };
      }

      const { element, joint, type } = lastVisualData;
      
      // Get the bounding box of the visual element to find its tip
      const bbox = new THREE.Box3();
      bbox.makeEmpty();
      
      // Calculate bounding box in world space
      element.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const geometry = child.geometry;
          geometry.computeBoundingBox();
          const childBbox = geometry.boundingBox.clone();
          childBbox.applyMatrix4(child.matrixWorld);
          bbox.union(childBbox);
        }
      });
      
      // If we got a valid bounding box, use its furthest point
      let position = new THREE.Vector3();
      let quaternion = new THREE.Quaternion();
      
      if (!bbox.isEmpty()) {
        // Get the direction from the joint to the end of the visual
        if (joint) {
          const jointPos = new THREE.Vector3();
          joint.getWorldPosition(jointPos);
          
          // Find which end of the bounding box is furthest from the joint
          const corners = [
            new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
            new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
            new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
            new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
            new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
            new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
            new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
            new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z)
          ];
          
          let maxDist = -Infinity;
          corners.forEach(corner => {
            const dist = corner.distanceTo(jointPos);
            if (dist > maxDist) {
              maxDist = dist;
              position.copy(corner);
            }
          });
        } else {
          // No joint reference, use the center of the far end
          position.copy(bbox.max);
        }
        
        // Get orientation from the element
        element.getWorldQuaternion(quaternion);
      } else {
        // Fallback to element's world position
        element.getWorldPosition(position);
        element.getWorldQuaternion(quaternion);
      }

      // Apply TCP offset
      const offset = new THREE.Vector3(
        tcp.settings.offset.x,
        tcp.settings.offset.y,
        tcp.settings.offset.z
      );
      
      // Transform offset by element's rotation
      offset.applyQuaternion(quaternion);
      position.add(offset);

      return {
        x: parseFloat(position.x.toFixed(6)),
        y: parseFloat(position.y.toFixed(6)),
        z: parseFloat(position.z.toFixed(6))
      };
    } catch (error) {
      console.error('Error calculating TCP position:', error);
      return { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Set current robot for position calculations
   * @param {Object} robot - Robot instance
   */
  setRobot(robot) {
    this.currentRobot = robot;
    // Clear cache when robot changes
    this.lastVisualCache.delete(robot);
  }

  /**
   * Direct calculation for real-time requests
   * @param {Object} robot - Robot instance
   * @returns {Object} Position {x, y, z}
   */
  calculateTCPPositionDirect(robot) {
    if (!robot) return { x: 0, y: 0, z: 0 };

    try {
      // Find the last visual element
      const lastVisualData = this.findLastVisualElement(robot);
      
      if (!lastVisualData || !lastVisualData.element) {
        return { x: 0, y: 0, z: 0 };
      }

      const { element } = lastVisualData;
      
      // Get immediate world position
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      
      element.getWorldPosition(position);
      element.getWorldQuaternion(quaternion);

      // Apply TCP offset
      const activeTcp = this.getActiveTCP();
      if (activeTcp && activeTcp.settings.offset) {
        const offset = new THREE.Vector3(
          activeTcp.settings.offset.x,
          activeTcp.settings.offset.y,
          activeTcp.settings.offset.z
        );
        
        offset.applyQuaternion(quaternion);
        position.add(offset);
      }

      return {
        x: parseFloat(position.x.toFixed(6)),
        y: parseFloat(position.y.toFixed(6)),
        z: parseFloat(position.z.toFixed(6))
      };
    } catch (error) {
      console.error('Error in direct TCP calculation:', error);
      return { x: 0, y: 0, z: 0 };
    }
  }

  // ... rest of the methods remain the same ...
  
  /**
   * Add a new TCP
   * @param {Object} tcpConfig - TCP configuration
   * @returns {string} TCP ID
   */
  addTCP(tcpConfig) {
    const id = tcpConfig.id || `tcp_${Date.now()}`;
    
    const tcpData = {
      id,
      name: tcpConfig.name || `TCP ${id}`,
      stlPath: tcpConfig.stlPath || null,
      settings: {
        visible: tcpConfig.visible !== undefined ? tcpConfig.visible : true,
        size: tcpConfig.size || 0.03,
        color: tcpConfig.color || '#ff0000',
        offset: {
          x: tcpConfig.offset?.x || 0,
          y: tcpConfig.offset?.y || 0,
          z: tcpConfig.offset?.z || 0
        }
      },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      isDefault: false,
      lastUpdated: Date.now()
    };

    this.tcps.set(id, tcpData);
    EventBus.emit('tcp:added', { id, tcpData });
    
    return id;
  }

  /**
   * Remove a TCP
   * @param {string} tcpId - TCP ID to remove
   * @returns {boolean} Success status
   */
  removeTCP(tcpId) {
    if (tcpId === this.defaultTcpId) {
      console.warn('Cannot remove default TCP');
      return false;
    }

    if (!this.tcps.has(tcpId)) {
      console.warn(`TCP ${tcpId} not found`);
      return false;
    }

    this.tcps.delete(tcpId);

    if (this.activeTcpId === tcpId) {
      this.activeTcpId = this.defaultTcpId;
      EventBus.emit('tcp:activated', { id: this.defaultTcpId });
    }

    EventBus.emit('tcp:removed', { id: tcpId });
    return true;
  }

  /**
   * Update TCP settings
   */
  updateTCPSettings(tcpId, settings) {
    const tcp = this.tcps.get(tcpId);
    if (!tcp) {
      console.warn(`TCP ${tcpId} not found`);
      return;
    }

    tcp.settings = {
      ...tcp.settings,
      ...settings,
      offset: {
        ...tcp.settings.offset,
        ...(settings.offset || {})
      }
    };

    if (settings.stlPath !== undefined) {
      tcp.stlPath = settings.stlPath;
    }

    tcp.lastUpdated = Date.now();

    EventBus.emit('tcp:settings-updated', {
      tcpId,
      settings: tcp.settings,
      tcp: tcp
    });

    if (tcpId === this.activeTcpId) {
      EventBus.emit('tcp:active-settings-updated', {
        settings: tcp.settings,
        tcp: tcp
      });
    }

    this.forceUpdate();
  }

  /**
   * Set active TCP
   */
  setActiveTCP(tcpId) {
    if (!this.tcps.has(tcpId)) {
      console.warn(`TCP ${tcpId} not found`);
      return;
    }

    const oldActiveTcpId = this.activeTcpId;
    this.activeTcpId = tcpId;
    
    EventBus.emit('tcp:activated', { 
      id: tcpId, 
      tcp: this.tcps.get(tcpId),
      previousId: oldActiveTcpId
    });

    const activeTcp = this.getActiveTCP();
    if (activeTcp) {
      EventBus.emit('tcp:active-position-updated', {
        position: activeTcp.position,
        tcp: activeTcp
      });
      
      EventBus.emit('tcp:active-settings-updated', {
        settings: activeTcp.settings,
        tcp: activeTcp
      });
    }
  }

  /**
   * Get active TCP
   * @returns {Object|null} Active TCP data
   */
  getActiveTCP() {
    return this.tcps.get(this.activeTcpId) || null;
  }

  /**
   * Get all TCPs
   * @returns {Array} Array of TCP data
   */
  getAllTCPs() {
    return Array.from(this.tcps.values());
  }

  /**
   * Get TCP by ID
   * @param {string} tcpId - TCP ID
   * @returns {Object|null} TCP data
   */
  getTCP(tcpId) {
    return this.tcps.get(tcpId) || null;
  }

  /**
   * Update all TCP positions
   */
  updatePositions() {
    if (this.isCalculating || !this.currentRobot) return;
    
    this.isCalculating = true;

    try {
      let hasUpdates = false;

      this.tcps.forEach((tcp, tcpId) => {
        const newPosition = this.calculateTCPPosition(tcpId);
        if (newPosition) {
          const oldPosition = tcp.position;
          
          if (oldPosition.x !== newPosition.x || 
              oldPosition.y !== newPosition.y || 
              oldPosition.z !== newPosition.z) {
            
            tcp.position = newPosition;
            tcp.lastUpdated = Date.now();
            hasUpdates = true;

            EventBus.emit('tcp:position-updated', {
              tcpId,
              position: newPosition,
              tcp: tcp
            });

            if (tcpId === this.activeTcpId) {
              EventBus.emit('tcp:active-position-updated', {
                position: newPosition,
                tcp: tcp
              });
            }
          }
        }
      });

      if (hasUpdates) {
        EventBus.emit('tcp:positions-updated', {
          tcps: Array.from(this.tcps.values()),
          activeTcpId: this.activeTcpId
        });
      }
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * Start the update loop for TCP position calculations
   */
  startUpdateLoop() {
    let lastUpdateTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    const updateLoop = (currentTime) => {
      if (currentTime - lastUpdateTime >= frameInterval) {
        this.updatePositions();
        lastUpdateTime = currentTime;
      }
      requestAnimationFrame(updateLoop);
    };
    
    requestAnimationFrame(updateLoop);
  }

  /**
   * Get current active TCP position
   * @returns {Object} Position {x, y, z}
   */
  getCurrentPosition() {
    const activeTcp = this.getActiveTCP();
    return activeTcp ? activeTcp.position : { x: 0, y: 0, z: 0 };
  }

  /**
   * Get current active TCP settings
   * @returns {Object} Settings object
   */
  getCurrentSettings() {
    const activeTcp = this.getActiveTCP();
    return activeTcp ? activeTcp.settings : {
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    };
  }

  /**
   * Handle real-time calculation requests
   * @param {Object} data - Request data with robot and requestId
   */
  handleRealTimeCalculation(data) {
    const { robot, requestId } = data;
    
    if (!robot) {
      EventBus.emit('tcp:realtime-result', { requestId, position: null });
      return;
    }

    robot.updateMatrixWorld(true);
    const position = this.calculateTCPPositionDirect(robot);
    
    EventBus.emit('tcp:realtime-result', { 
      requestId, 
      position,
      timestamp: Date.now()
    });
  }

  /**
   * Force immediate update
   */
  forceUpdate() {
    this.updatePositions();
  }
}

// Create singleton instance
const tcpProvider = new TCPProvider();
export default tcpProvider;