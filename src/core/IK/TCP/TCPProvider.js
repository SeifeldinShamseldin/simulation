// src/core/IK/TCP/TCPProvider.js
import * as THREE from 'three';
import EventBus from '../../../utils/EventBus';

/**
 * Core TCP Provider - Manages TCP data and communicates with IK API
 * This is the single source of truth for all TCP operations
 */
class TCPProvider {
  constructor() {
    if (TCPProvider.instance) {
      return TCPProvider.instance;
    }
    TCPProvider.instance = this;

    // TCP storage
    this.tcps = new Map(); // Map of TCP ID to TCP data
    this.activeTcpId = null;
    this.defaultTcpId = 'default';

    // Position update callbacks for IK API
    this.positionSubscribers = new Set();
    this.settingsSubscribers = new Set();

    // Robot reference for position calculation
    this.currentRobot = null;
    this.isCalculating = false;

    // Initialize default TCP
    this.createDefaultTCP();

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
   * Add a new TCP
   * @param {Object} tcpConfig - TCP configuration
   * @returns {string} TCP ID
   */
  addTCP(tcpConfig) {
    const id = tcpConfig.id || `tcp_${Date.now()}`;
    
    const tcpData = {
      id,
      name: tcpConfig.name || `TCP ${id}`,
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
    
    // Emit event for UI updates
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

    // Switch to default if this was active
    if (this.activeTcpId === tcpId) {
      this.activeTcpId = this.defaultTcpId;
      EventBus.emit('tcp:activated', { id: this.defaultTcpId });
    }

    EventBus.emit('tcp:removed', { id: tcpId });
    return true;
  }

  /**
   * Update TCP settings
   * @param {string} tcpId - TCP ID
   * @param {Object} settings - New settings
   */
  updateTCPSettings(tcpId, settings) {
    const tcp = this.tcps.get(tcpId);
    if (!tcp) {
      console.warn(`TCP ${tcpId} not found`);
      return;
    }

    // Deep merge settings
    tcp.settings = {
      ...tcp.settings,
      ...settings,
      offset: {
        ...tcp.settings.offset,
        ...(settings.offset || {})
      }
    };

    tcp.lastUpdated = Date.now();

    // Send updated settings to IK API
    if (tcpId === this.activeTcpId) {
      this.sendDataToIKAPI();
    }

    // Notify subscribers
    this.settingsSubscribers.forEach(callback => {
      try {
        callback(tcpId, tcp.settings);
      } catch (error) {
        console.error('Error notifying settings subscribers:', error);
      }
    });

    EventBus.emit('tcp:settings_updated', {
      tcpId,
      settings: tcp.settings
    });
  }

  /**
   * Set active TCP
   * @param {string} tcpId - TCP ID to activate
   */
  setActiveTCP(tcpId) {
    if (!this.tcps.has(tcpId)) {
      console.warn(`TCP ${tcpId} not found`);
      return;
    }

    this.activeTcpId = tcpId;
    EventBus.emit('tcp:activated', { id: tcpId });
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
   * Set current robot for position calculations
   * @param {Object} robot - Robot instance
   */
  setRobot(robot) {
    this.currentRobot = robot;
  }

  /**
   * Calculate TCP position based on robot state
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
      // Find the EXACT same joint that IK uses
      const lastJoint = this.findLastJoint(this.currentRobot);
      if (!lastJoint) {
        return null;
      }

      // Get the END EFFECTOR (joint's child), not the joint itself
      const endEffector = lastJoint.children && lastJoint.children.length > 0 
        ? lastJoint.children[0] 
        : lastJoint;

      // Get world position of the END EFFECTOR
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      
      endEffector.getWorldPosition(position);
      endEffector.getWorldQuaternion(quaternion);

      // Apply TCP offset from END EFFECTOR position
      const offset = new THREE.Vector3(
        tcp.settings.offset.x,
        tcp.settings.offset.y,
        tcp.settings.offset.z
      );
      
      // Transform offset by end effector rotation
      offset.applyQuaternion(quaternion);
      position.add(offset);

      return {
        x: parseFloat(position.x.toFixed(6)),
        y: parseFloat(position.y.toFixed(6)),
        z: parseFloat(position.z.toFixed(6))
      };
    } catch (error) {
      console.error('Error calculating TCP position:', error);
      return null;
    }
  }

  /**
   * Find the last joint in the robot
   * @param {Object} robot - Robot instance
   * @returns {Object|null} Last joint
   */
  findLastJoint(robot) {
    if (!robot || !robot.joints) return null;

    // Try common end joint names first
    const endJointNames = [
      'joint_a6', 'a6', 'joint_6', 'tool0',  // KUKA
      'wrist_3_joint', 'tool0',              // UR
      'tool_joint', 'end_effector', 'tcp_joint', 'flange'
    ];

    for (const name of endJointNames) {
      if (robot.joints[name]) {
        return robot.joints[name];
      }
    }

    // Fall back to last movable joint
    const joints = Object.values(robot.joints).filter(
      j => j.jointType !== 'fixed' && j.isURDFJoint
    );

    return joints.length > 0 ? joints[joints.length - 1] : null;
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
          
          // Check if position actually changed (avoid unnecessary updates)
          if (oldPosition.x !== newPosition.x || 
              oldPosition.y !== newPosition.y || 
              oldPosition.z !== newPosition.z) {
            
            tcp.position = newPosition;
            tcp.lastUpdated = Date.now();
            hasUpdates = true;

            // Notify position subscribers (for IK API)
            if (tcpId === this.activeTcpId) {
              this.positionSubscribers.forEach(callback => {
                try {
                  callback(newPosition);
                } catch (error) {
                  console.error('Error in position subscriber:', error);
                }
              });
            }
          }
        }
      });

      // Send data to IK API when positions update
      if (hasUpdates) {
        this.sendDataToIKAPI();
        
        EventBus.emit('tcp:positions_updated', {
          tcps: Array.from(this.tcps.values())
        });
      }
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * Subscribe to position updates (for IK API)
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToPositionUpdates(callback) {
    this.positionSubscribers.add(callback);
    
    // Send current position immediately
    const activeTcp = this.getActiveTCP();
    if (activeTcp && activeTcp.position) {
      try {
        callback(activeTcp.position);
      } catch (error) {
        console.error('Error in immediate position callback:', error);
      }
    }

    return () => this.positionSubscribers.delete(callback);
  }

  /**
   * Subscribe to settings updates
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToSettingsUpdates(callback) {
    this.settingsSubscribers.add(callback);
    return () => this.settingsSubscribers.delete(callback);
  }

  /**
   * Start the update loop for TCP position calculations
   */
  startUpdateLoop() {
    let lastUpdateTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    const updateLoop = (currentTime) => {
      // Throttle updates to 60fps
      if (currentTime - lastUpdateTime >= frameInterval) {
        this.updatePositions();
        lastUpdateTime = currentTime;
      }
      requestAnimationFrame(updateLoop);
    };
    
    requestAnimationFrame(updateLoop);
  }

  /**
   * Get current active TCP position (for IK API compatibility)
   * @returns {Object} Position {x, y, z}
   */
  getCurrentPosition() {
    const activeTcp = this.getActiveTCP();
    return activeTcp ? activeTcp.position : { x: 0, y: 0, z: 0 };
  }

  /**
   * Get current active TCP settings (for IK API compatibility)
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
   * Send current TCP data to IK API
   */
  sendDataToIKAPI() {
    const activeTcp = this.getActiveTCP();
    if (!activeTcp) return;
    
    // Send position update
    this.positionSubscribers.forEach(callback => {
      try {
        callback(activeTcp.position);
      } catch (error) {
        console.error('Error sending position to IK API:', error);
      }
    });
    
    // Send settings update
    this.settingsSubscribers.forEach(callback => {
      try {
        callback(activeTcp.id, activeTcp.settings);
      } catch (error) {
        console.error('Error sending settings to IK API:', error);
      }
    });
  }
}

// Create singleton instance
const tcpProvider = new TCPProvider();
export default tcpProvider;