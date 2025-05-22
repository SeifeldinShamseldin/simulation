// src/components/controls/TCPDisplay/TCPManager.jsx - MERGED WITH DISPLAY FUNCTIONALITY
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';
import EventBus from '../../../utils/EventBus';
import './TCPManager.css';

/**
 * Comprehensive TCP Manager Component - Combines display and management functionality
 * Merged from TCPDisplay and TCPManager for unified TCP operations
 */
const TCPManager = ({ viewerRef, compact = false, showManagement = true }) => {
  // State for TCP data
  const [tcps, setTcps] = useState([]);
  const [activeTcpId, setActiveTcpId] = useState(null);
  const [activeTcp, setActiveTcp] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isConnected, setIsConnected] = useState(false);
  
  // State for management
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTcp, setEditingTcp] = useState(null);
  const [newTcpForm, setNewTcpForm] = useState({
    name: '',
    visible: true,
    size: 0.03,
    color: '#ff0000',
    offset: { x: 0, y: 0, z: 0 }
  });

  // State for display mode
  const [displayMode, setDisplayMode] = useState('display'); // 'display' or 'manage'
  
  // 3D visualization state
  const [tcpObjects, setTcpObjects] = useState(new Map());
  const tcpObjectsRef = useRef(new Map());
  const animationRef = useRef(null);

  // Load initial data and set up EventBus listeners
  useEffect(() => {
    // Connect TCP provider to robot
    if (viewerRef?.current) {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        tcpProvider.setRobot(robot);
        setIsConnected(true);
      }
    }

    // Load initial data
    loadTCPs();
    loadActiveTCP();
    
    // Set up EventBus listeners
    const unsubscribeAdded = EventBus.on('tcp:added', handleTCPAdded);
    const unsubscribeRemoved = EventBus.on('tcp:removed', handleTCPRemoved);
    const unsubscribeActivated = EventBus.on('tcp:activated', handleTCPActivated);
    const unsubscribeSettingsUpdated = EventBus.on('tcp:settings-updated', handleSettingsUpdated);
    const unsubscribeActivePosition = EventBus.on('tcp:active-position-updated', handleActivePositionUpdated);
    const unsubscribeActiveSettings = EventBus.on('tcp:active-settings-updated', handleActiveSettingsUpdated);
    const unsubscribePositionsUpdated = EventBus.on('tcp:positions-updated', handlePositionsUpdated);

    return () => {
      unsubscribeAdded();
      unsubscribeRemoved();
      unsubscribeActivated();
      unsubscribeSettingsUpdated();
      unsubscribeActivePosition();
      unsubscribeActiveSettings();
      unsubscribePositionsUpdated();
    };
  }, []);

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

  // 3D visualization effect
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
   * Load all TCPs from provider
   */
  const loadTCPs = () => {
    const allTcps = tcpProvider.getAllTCPs();
    const activeTcp = tcpProvider.getActiveTCP();
    
    setTcps(allTcps);
    setActiveTcpId(activeTcp?.id || null);
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
   * Handle TCP added event from EventBus
   */
  const handleTCPAdded = (data) => {
    loadTCPs();
  };

  /**
   * Handle TCP removed event from EventBus  
   */
  const handleTCPRemoved = (data) => {
    loadTCPs();
  };

  /**
   * Handle TCP activated event from EventBus
   */
  const handleTCPActivated = (data) => {
    setActiveTcpId(data.id);
    setActiveTcp(data.tcp);
    if (data.tcp && data.tcp.position) {
      setPosition(data.tcp.position);
    }
  };

  /**
   * Handle settings updated event from EventBus
   */
  const handleSettingsUpdated = (data) => {
    loadTCPs();
    // Reload active TCP to get updated settings
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp) {
      setActiveTcp({ ...currentActiveTcp });
    }
  };

  /**
   * Handle active TCP position updates from EventBus
   */
  const handleActivePositionUpdated = (data) => {
    setPosition(data.position);
  };

  /**
   * Handle active TCP settings updates from EventBus
   */
  const handleActiveSettingsUpdated = (data) => {
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp) {
      setActiveTcp({ ...currentActiveTcp });
    }
  };

  /**
   * Handle general positions updated from EventBus
   */
  const handlePositionsUpdated = (data) => {
    const activeTcpData = data.tcps.find(tcp => tcp.id === data.activeTcpId);
    if (activeTcpData) {
      setPosition(activeTcpData.position);
    }
  };

  /**
   * Handle form input changes
   */
  const handleFormChange = (field, value) => {
    if (field.startsWith('offset.')) {
      const offsetField = field.split('.')[1];
      setNewTcpForm(prev => ({
        ...prev,
        offset: {
          ...prev.offset,
          [offsetField]: parseFloat(value) || 0
        }
      }));
    } else {
      setNewTcpForm(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  /**
   * Add new TCP
   */
  const handleAddTCP = () => {
    if (!newTcpForm.name.trim()) {
      alert('Please enter a TCP name');
      return;
    }

    const tcpId = tcpProvider.addTCP({
      name: newTcpForm.name.trim(),
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    // Reset form and close modal
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
    setIsAddModalOpen(false);

    // Activate the new TCP
    tcpProvider.setActiveTCP(tcpId);
  };

  /**
   * Remove TCP
   */
  const handleRemoveTCP = (tcpId) => {
    if (window.confirm('Are you sure you want to remove this TCP?')) {
      tcpProvider.removeTCP(tcpId);
    }
  };

  /**
   * Activate TCP
   */
  const handleActivateTCP = (tcpId) => {
    tcpProvider.setActiveTCP(tcpId);
  };

  /**
   * Start editing TCP
   */
  const handleEditTCP = (tcp) => {
    setEditingTcp(tcp.id);
    setNewTcpForm({
      name: tcp.name,
      visible: tcp.settings.visible,
      size: tcp.settings.size,
      color: tcp.settings.color,
      offset: { ...tcp.settings.offset }
    });
  };

  /**
   * Save TCP edits
   */
  const handleSaveEdit = () => {
    if (!editingTcp) return;

    tcpProvider.updateTCPSettings(editingTcp, {
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    // Update name if changed
    const tcp = tcpProvider.getTCP(editingTcp);
    if (tcp && tcp.name !== newTcpForm.name.trim()) {
      tcp.name = newTcpForm.name.trim();
      EventBus.emit('tcp:name_updated', { id: editingTcp, name: tcp.name });
    }

    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
  };

  /**
   * Cancel editing
   */
  const handleCancelEdit = () => {
    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
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
  };

  /**
   * Update TCP 3D position
   */
  const updateTCPVisualization = () => {
    if (!activeTcp || !viewerRef?.current) return;

    const tcpObject = tcpObjectsRef.current.get(activeTcp.id);
    if (!tcpObject) return;

    try {
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) return;

      const lastJoint = findLastJoint(robot);
      if (!lastJoint) return;

      lastJoint.updateMatrixWorld(true);

      const jointWorldPos = new THREE.Vector3();
      const jointWorldQuat = new THREE.Quaternion();
      
      lastJoint.getWorldPosition(jointWorldPos);
      lastJoint.getWorldQuaternion(jointWorldQuat);

      const offset = new THREE.Vector3(
        activeTcp.settings.offset.x,
        activeTcp.settings.offset.y,
        activeTcp.settings.offset.z
      );
      offset.applyQuaternion(jointWorldQuat);
      jointWorldPos.add(offset);

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

  // If no active TCP, show error state
  if (!activeTcp) {
    return (
      <div className={`tcp-manager ${compact ? 'tcp-manager--compact' : ''}`}>
        <div className="tcp-manager__header">
          <h3>TCP Manager</h3>
          <div className="tcp-manager__status tcp-manager__status--disconnected">
            No TCP
          </div>
        </div>
        <div className="tcp-manager__content">
          <div className="tcp-manager__empty">
            <p>No active TCP found</p>
            <button onClick={() => setIsAddModalOpen(true)}>
              Create your first TCP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render based on display mode and compact setting
  return (
    <div className={`tcp-manager ${compact ? 'tcp-manager--compact' : ''}`}>
      <div className="tcp-manager__header">
        <h3>TCP Manager</h3>
        <div className="tcp-manager__header-controls">
          <div className={`tcp-manager__status ${isConnected ? 'tcp-manager__status--connected' : 'tcp-manager__status--disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          {showManagement && !compact && (
            <div className="tcp-manager__mode-toggle">
              <button 
                className={`tcp-manager__mode-btn ${displayMode === 'display' ? 'tcp-manager__mode-btn--active' : ''}`}
                onClick={() => setDisplayMode('display')}
              >
                Display
              </button>
              <button 
                className={`tcp-manager__mode-btn ${displayMode === 'manage' ? 'tcp-manager__mode-btn--active' : ''}`}
                onClick={() => setDisplayMode('manage')}
              >
                Manage
              </button>
            </div>
          )}
          {showManagement && displayMode === 'manage' && (
            <button 
              className="tcp-manager__add-btn"
              onClick={() => setIsAddModalOpen(true)}
            >
              + Add TCP
            </button>
          )}
        </div>
      </div>

      <div className="tcp-manager__content">
        {/* Display Mode - Shows current TCP info */}
        {(displayMode === 'display' || compact) && (
          <div className="tcp-manager__display">
            {/* TCP Info */}
            <div className="tcp-manager__info">
              <div className="tcp-manager__name">
                <strong>{activeTcp.name}</strong>
                {activeTcp.isDefault && <span className="tcp-manager__badge">Default</span>}
              </div>
              <div className="tcp-manager__id">ID: {activeTcp.id}</div>
            </div>

            {/* Position Display */}
            <div className="tcp-manager__position">
              <h4>Current Position</h4>
              <div className="tcp-manager__coordinates">
                <div className="tcp-manager__coordinate">
                  <label>X:</label>
                  <span className="tcp-manager__value">{formatCoordinate(position.x)}</span>
                  <span className="tcp-manager__unit">m</span>
                </div>
                <div className="tcp-manager__coordinate">
                  <label>Y:</label>
                  <span className="tcp-manager__value">{formatCoordinate(position.y)}</span>
                  <span className="tcp-manager__unit">m</span>
                </div>
                <div className="tcp-manager__coordinate">
                  <label>Z:</label>
                  <span className="tcp-manager__value">{formatCoordinate(position.z)}</span>
                  <span className="tcp-manager__unit">m</span>
                </div>
              </div>
            </div>

            {/* Settings Display */}
            {!compact && (
              <div className="tcp-manager__settings">
                <h4>Settings</h4>
                <div className="tcp-manager__settings-grid">
                  <div className="tcp-manager__setting">
                    <label>Visible:</label>
                    <span className={`tcp-manager__indicator ${activeTcp.settings.visible ? 'tcp-manager__indicator--active' : ''}`}>
                      {activeTcp.settings.visible ? '●' : '○'}
                    </span>
                  </div>
                  <div className="tcp-manager__setting">
                    <label>Size:</label>
                    <span>{activeTcp.settings.size.toFixed(3)}</span>
                  </div>
                  <div className="tcp-manager__setting">
                    <label>Color:</label>
                    <div 
                      className="tcp-manager__color-indicator"
                      style={{ backgroundColor: activeTcp.settings.color }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {/* Offset Display */}
            {!compact && (
              <div className="tcp-manager__offset">
                <h4>TCP Offset</h4>
                <div className="tcp-manager__coordinates tcp-manager__coordinates--small">
                  <div className="tcp-manager__coordinate">
                    <label>X:</label>
                    <span className="tcp-manager__value">{formatCoordinate(activeTcp.settings.offset.x)}</span>
                  </div>
                  <div className="tcp-manager__coordinate">
                    <label>Y:</label>
                    <span className="tcp-manager__value">{formatCoordinate(activeTcp.settings.offset.y)}</span>
                  </div>
                  <div className="tcp-manager__coordinate">
                    <label>Z:</label>
                    <span className="tcp-manager__value">{formatCoordinate(activeTcp.settings.offset.z)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick edit button in display mode */}
            {showManagement && !compact && (
              <div className="tcp-manager__quick-actions">
                <button 
                  className="tcp-manager__btn tcp-manager__btn--edit"
                  onClick={() => handleEditTCP(activeTcp)}
                >
                  Edit Current TCP
                </button>
              </div>
            )}

            {/* Last Updated */}
            <div className="tcp-manager__footer">
              <small>Updated: {new Date(activeTcp.lastUpdated).toLocaleTimeString()}</small>
            </div>
          </div>
        )}

        {/* Management Mode - Shows all TCPs */}
        {displayMode === 'manage' && showManagement && !compact && (
          <div className="tcp-manager__management">
            {tcps.length === 0 ? (
              <div className="tcp-manager__empty">
                <p>No TCPs available</p>
                <button onClick={() => setIsAddModalOpen(true)}>
                  Create your first TCP
                </button>
              </div>
            ) : (
              <div className="tcp-manager__list">
                {tcps.map(tcp => (
                  <div 
                    key={tcp.id}
                    className={`tcp-manager__item ${tcp.id === activeTcpId ? 'tcp-manager__item--active' : ''}`}
                  >
                    <div className="tcp-manager__item-header">
                      <div className="tcp-manager__item-info">
                        <div className="tcp-manager__item-name">
                          {tcp.name}
                          {tcp.isDefault && <span className="tcp-manager__badge">Default</span>}
                        </div>
                        <div className="tcp-manager__item-id">ID: {tcp.id}</div>
                      </div>
                      <div className="tcp-manager__item-actions">
                        {tcp.id !== activeTcpId && (
                          <button 
                            className="tcp-manager__btn tcp-manager__btn--activate"
                            onClick={() => handleActivateTCP(tcp.id)}
                          >
                            Activate
                          </button>
                        )}
                        <button 
                          className="tcp-manager__btn tcp-manager__btn--edit"
                          onClick={() => handleEditTCP(tcp)}
                        >
                          Edit
                        </button>
                        {!tcp.isDefault && (
                          <button 
                            className="tcp-manager__btn tcp-manager__btn--remove"
                            onClick={() => handleRemoveTCP(tcp.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="tcp-manager__item-details">
                      <div className="tcp-manager__item-settings">
                        <span className={`tcp-manager__visibility ${tcp.settings.visible ? 'tcp-manager__visibility--visible' : 'tcp-manager__visibility--hidden'}`}>
                          {tcp.settings.visible ? '👁️ Visible' : '🚫 Hidden'}
                        </span>
                        <span className="tcp-manager__size">Size: {tcp.settings.size.toFixed(3)}</span>
                        <div className="tcp-manager__color-info">
                          <div 
                            className="tcp-manager__color-preview"
                            style={{ backgroundColor: tcp.settings.color }}
                          ></div>
                          <span>{tcp.settings.color}</span>
                        </div>
                      </div>
                      <div className="tcp-manager__item-offset">
                        <strong>Offset:</strong> 
                        X: {tcp.settings.offset.x.toFixed(3)}, 
                        Y: {tcp.settings.offset.y.toFixed(3)}, 
                        Z: {tcp.settings.offset.z.toFixed(3)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || editingTcp) && (
        <div className="tcp-manager__modal-overlay">
          <div className="tcp-manager__modal">
            <div className="tcp-manager__modal-header">
              <h3>{editingTcp ? 'Edit TCP' : 'Add New TCP'}</h3>
              <button 
                className="tcp-manager__modal-close"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
              >
                ×
              </button>
            </div>

            <div className="tcp-manager__modal-content">
              <div className="tcp-manager__form-group">
                <label>TCP Name:</label>
                <input
                  type="text"
                  value={newTcpForm.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Enter TCP name"
                />
              </div>

              <div className="tcp-manager__form-row">
                <div className="tcp-manager__form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newTcpForm.visible}
                      onChange={(e) => handleFormChange('visible', e.target.checked)}
                    />
                    Visible
                  </label>
                </div>
                <div className="tcp-manager__form-group">
                  <label>Size:</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="0.5"
                    value={newTcpForm.size}
                    onChange={(e) => handleFormChange('size', e.target.value)}
                  />
                </div>
                <div className="tcp-manager__form-group">
                  <label>Color:</label>
                  <input
                    type="color"
                    value={newTcpForm.color}
                    onChange={(e) => handleFormChange('color', e.target.value)}
                  />
                </div>
              </div>

              <div className="tcp-manager__form-group">
                <label>TCP Offset:</label>
                <div className="tcp-manager__offset-inputs">
                  <div>
                    <label>X:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.x}
                      onChange={(e) => handleFormChange('offset.x', e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Y:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.y}
                      onChange={(e) => handleFormChange('offset.y', e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Z:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.z}
                      onChange={(e) => handleFormChange('offset.z', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="tcp-manager__modal-actions">
              <button 
                className="tcp-manager__btn tcp-manager__btn--cancel"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
              >
                Cancel
              </button>
              <button 
                className="tcp-manager__btn tcp-manager__btn--save"
                onClick={editingTcp ? handleSaveEdit : handleAddTCP}
              >
                {editingTcp ? 'Save Changes' : 'Add TCP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TCPManager;