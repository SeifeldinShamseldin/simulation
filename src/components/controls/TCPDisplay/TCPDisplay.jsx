// src/components/controls/TCPDisplay/TCPDisplay.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';
import EventBus from '../../../utils/EventBus';
import './TCPDisplay.css';

/**
 * TCP Display Component - Shows current TCP position and basic info in UI
 * This component is read-only and displays the active TCP data
 */
const TCPDisplay = ({ viewerRef, compact = false }) => {
  const [activeTcp, setActiveTcp] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isConnected, setIsConnected] = useState(false);
  
  // Add state for 3D objects
  const [tcpObjects, setTcpObjects] = useState(new Map());
  const tcpObjectsRef = useRef(new Map());
  const animationRef = useRef(null);

  // Set up robot connection and event listeners
  useEffect(() => {
    // Connect TCP provider to robot
    if (viewerRef?.current) {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        tcpProvider.setRobot(robot);
        setIsConnected(true);
      }
    }

    // Subscribe to TCP events
    const unsubscribeActivated = EventBus.on('tcp:activated', handleTCPActivated);
    const unsubscribePositions = EventBus.on('tcp:positions_updated', handlePositionsUpdated);
    const unsubscribeSettings = EventBus.on('tcp:settings_updated', handleSettingsUpdated);

    // Initial data load
    loadActiveTCP();

    return () => {
      unsubscribeActivated();
      unsubscribePositions();
      unsubscribeSettings();
    };
  }, [viewerRef]);

  // Monitor robot changes
  useEffect(() => {
    if (!viewerRef?.current) return;

    const checkRobot = () => {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        tcpProvider.setRobot(robot);
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    };

    checkRobot();
    const interval = setInterval(checkRobot, 1000);

    return () => clearInterval(interval);
  }, [viewerRef]);

  // Add 3D visualization effect
  useEffect(() => {
    if (!viewerRef?.current || !activeTcp) return;

    // Get scene
    const sceneSetup = viewerRef.current.getSceneSetup?.() || viewerRef.current.sceneRef?.current;
    if (!sceneSetup?.scene) return;

    // Create TCP 3D visualization
    createTCPVisualization(sceneSetup.scene, activeTcp);

    // Start update loop for 3D position
    startTCPVisualizationLoop();

    return () => {
      cleanupTCPVisualization(sceneSetup.scene);
      stopTCPVisualizationLoop();
    };
  }, [activeTcp, viewerRef, isConnected]);

  /**
   * Handle TCP activation events
   */
  const handleTCPActivated = (data) => {
    loadActiveTCP();
  };

  /**
   * Handle position updates
   */
  const handlePositionsUpdated = (data) => {
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp) {
      setPosition(currentActiveTcp.position);
    }
  };

  /**
   * Handle settings updates
   */
  const handleSettingsUpdated = (data) => {
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp && data.id === currentActiveTcp.id) {
      setActiveTcp({ ...currentActiveTcp });
    }
  };

  /**
   * Load active TCP data
   */
  const loadActiveTCP = () => {
    const tcp = tcpProvider.getActiveTCP();
    setActiveTcp(tcp);
    if (tcp) {
      setPosition(tcp.position);
    }
  };

  /**
   * Format coordinate value for display
   */
  const formatCoordinate = (value) => {
    return parseFloat(value).toFixed(4);
  };

  /**
   * Create TCP 3D visualization
   */
  const createTCPVisualization = (scene, tcpData) => {
    // Remove existing TCP
    cleanupTCPVisualization(scene);

    if (!tcpData.settings.visible) return;

    // Create TCP group
    const tcpGroup = new THREE.Group();
    tcpGroup.name = `TCP_${tcpData.id}`;
    tcpGroup.userData = { isTCP: true, tcpId: tcpData.id };

    // Create cube
    const size = tcpData.settings.size;
    const cubeGeom = new THREE.BoxGeometry(size, size, size);
    const cubeMat = new THREE.MeshBasicMaterial({ 
      color: new THREE.Color(tcpData.settings.color),
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    const cube = new THREE.Mesh(cubeGeom, cubeMat);
    cube.name = 'TCP_Cube';
    cube.renderOrder = 99999;
    tcpGroup.add(cube);

    // Add wireframe
    const wireframe = new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeom),
      new THREE.LineBasicMaterial({ 
        color: 0xffffff, 
        linewidth: 2,
        depthTest: false
      })
    );
    wireframe.renderOrder = 100000;
    cube.add(wireframe);

    // Add axes
    const axesHelper = new THREE.AxesHelper(size * 1.5);
    axesHelper.renderOrder = 100001;
    axesHelper.material.depthTest = false;
    tcpGroup.add(axesHelper);

    // Add to scene
    scene.add(tcpGroup);
    tcpObjectsRef.current.set(tcpData.id, tcpGroup);

    console.log('TCP cube created in scene');
  };

  /**
   * Update TCP 3D position
   */
  const updateTCPVisualization = () => {
    if (!activeTcp || !viewerRef?.current) return;

    const tcpObject = tcpObjectsRef.current.get(activeTcp.id);
    if (!tcpObject) return;

    try {
      // Get robot and find last joint
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) return;

      // Find the last joint (same logic as TCP Provider)
      const lastJoint = findLastJoint(robot);
      if (!lastJoint) return;

      // Update matrices
      lastJoint.updateMatrixWorld(true);

      // Get world position and rotation
      const jointWorldPos = new THREE.Vector3();
      const jointWorldQuat = new THREE.Quaternion();
      
      lastJoint.getWorldPosition(jointWorldPos);
      lastJoint.getWorldQuaternion(jointWorldQuat);

      // Apply TCP offset
      const offset = new THREE.Vector3(
        activeTcp.settings.offset.x,
        activeTcp.settings.offset.y,
        activeTcp.settings.offset.z
      );
      offset.applyQuaternion(jointWorldQuat);
      jointWorldPos.add(offset);

      // Update TCP object position and rotation
      tcpObject.position.copy(jointWorldPos);
      tcpObject.quaternion.copy(jointWorldQuat);
      tcpObject.visible = activeTcp.settings.visible;

    } catch (error) {
      console.error('Error updating TCP visualization:', error);
    }
  };

  /**
   * Find last joint in robot
   */
  const findLastJoint = (robot) => {
    if (!robot?.joints) return null;

    // Try common end joint names
    const endJointNames = [
      'joint_a6', 'a6', 'joint_6', 'tool0',
      'wrist_3_joint', 'tool0',
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
  };

  /**
   * Start TCP visualization update loop
   */
  const startTCPVisualizationLoop = () => {
    const updateLoop = () => {
      updateTCPVisualization();
      animationRef.current = requestAnimationFrame(updateLoop);
    };
    animationRef.current = requestAnimationFrame(updateLoop);
  };

  /**
   * Stop TCP visualization update loop
   */
  const stopTCPVisualizationLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  /**
   * Cleanup TCP visualization
   */
  const cleanupTCPVisualization = (scene) => {
    tcpObjectsRef.current.forEach((tcpObject, tcpId) => {
      if (scene && tcpObject.parent) {
        scene.remove(tcpObject);
      }
      
      // Dispose resources
      tcpObject.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    
    tcpObjectsRef.current.clear();
  };

  if (!activeTcp) {
    return (
      <div className={`tcp-display ${compact ? 'tcp-display--compact' : ''}`}>
        <div className="tcp-display__header">
          <h3>TCP Display</h3>
          <div className="tcp-display__status tcp-display__status--disconnected">
            No TCP
          </div>
        </div>
        <div className="tcp-display__content">
          <p>No active TCP found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`tcp-display ${compact ? 'tcp-display--compact' : ''}`}>
      <div className="tcp-display__header">
        <h3>TCP Display</h3>
        <div className={`tcp-display__status ${isConnected ? 'tcp-display__status--connected' : 'tcp-display__status--disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="tcp-display__content">
        {/* TCP Info */}
        <div className="tcp-display__info">
          <div className="tcp-display__name">
            <strong>{activeTcp.name}</strong>
            {activeTcp.isDefault && <span className="tcp-display__badge">Default</span>}
          </div>
          <div className="tcp-display__id">ID: {activeTcp.id}</div>
        </div>

        {/* Position Display */}
        <div className="tcp-display__position">
          <h4>Current Position</h4>
          <div className="tcp-display__coordinates">
            <div className="tcp-display__coordinate">
              <label>X:</label>
              <span className="tcp-display__value">{formatCoordinate(position.x)}</span>
              <span className="tcp-display__unit">m</span>
            </div>
            <div className="tcp-display__coordinate">
              <label>Y:</label>
              <span className="tcp-display__value">{formatCoordinate(position.y)}</span>
              <span className="tcp-display__unit">m</span>
            </div>
            <div className="tcp-display__coordinate">
              <label>Z:</label>
              <span className="tcp-display__value">{formatCoordinate(position.z)}</span>
              <span className="tcp-display__unit">m</span>
            </div>
          </div>
        </div>

        {/* Settings Display */}
        {!compact && (
          <div className="tcp-display__settings">
            <h4>Settings</h4>
            <div className="tcp-display__settings-grid">
              <div className="tcp-display__setting">
                <label>Visible:</label>
                <span className={`tcp-display__indicator ${activeTcp.settings.visible ? 'tcp-display__indicator--active' : ''}`}>
                  {activeTcp.settings.visible ? '●' : '○'}
                </span>
              </div>
              <div className="tcp-display__setting">
                <label>Size:</label>
                <span>{activeTcp.settings.size.toFixed(3)}</span>
              </div>
              <div className="tcp-display__setting">
                <label>Color:</label>
                <div 
                  className="tcp-display__color-indicator"
                  style={{ backgroundColor: activeTcp.settings.color }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* Offset Display */}
        {!compact && (
          <div className="tcp-display__offset">
            <h4>TCP Offset</h4>
            <div className="tcp-display__coordinates tcp-display__coordinates--small">
              <div className="tcp-display__coordinate">
                <label>X:</label>
                <span className="tcp-display__value">{formatCoordinate(activeTcp.settings.offset.x)}</span>
              </div>
              <div className="tcp-display__coordinate">
                <label>Y:</label>
                <span className="tcp-display__value">{formatCoordinate(activeTcp.settings.offset.y)}</span>
              </div>
              <div className="tcp-display__coordinate">
                <label>Z:</label>
                <span className="tcp-display__value">{formatCoordinate(activeTcp.settings.offset.z)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="tcp-display__footer">
          <small>Updated: {new Date(activeTcp.lastUpdated).toLocaleTimeString()}</small>
        </div>
      </div>
    </div>
  );
};

export default TCPDisplay;