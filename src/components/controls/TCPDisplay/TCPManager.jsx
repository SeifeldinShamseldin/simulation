// src/components/controls/TCPDisplay/TCPManager.jsx - MERGED WITH DISPLAY FUNCTIONALITY
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';
import EventBus from '../../../utils/EventBus';
import { useRobot } from '../../../contexts/RobotContext';

/**
 * Comprehensive TCP Component - Combines display and management functionality
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
  const [tcpType, setTcpType] = useState('custom');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [newTcpForm, setNewTcpForm] = useState({
    name: '',
    stlPath: null,
    visible: true,
    size: 0.03,
    color: '#ff0000',
    offset: { x: 0, y: 0, z: 0 }
  });

  // State for display mode
  const [displayMode, setDisplayMode] = useState('display'); // 'display' or 'manage'
  
  // TCP Library state
  const [tcpLibrary, setTcpLibrary] = useState([]);

  // 3D visualization state
  const [tcpObjects, setTcpObjects] = useState(new Map());
  const tcpObjectsRef = useRef(new Map());
  const animationRef = useRef(null);

  // Define predefined TCP types
  const PREDEFINED_TCPS = {
    er20: {
      name: 'ER20 Collet',
      stlPath: '/tcp/er20.stl',
      category: 'tool',
      color: '#c0c0c0',
      size: 0.04,
      offset: { x: 0, y: 0, z: 0.02 }
    },
    square_tcp: {
      name: 'Square TCP',
      stlPath: '/tcp/square_tcp.stl',
      category: 'custom',
      color: '#ff0000',
      size: 0.05,
      offset: { x: 0, y: 0, z: 0 }
    },
    gripper: {
      name: 'Standard Gripper',
      stlPath: '/tcp/gripper.stl',
      category: 'gripper',
      color: '#333333',
      size: 0.08,
      offset: { x: 0, y: 0, z: 0.05 }
    }
  };

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
    loadTCPLibrary();
    
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

  // 3D visualization effect (keeping as is for Three.js functionality)
  useEffect(() => {
    if (!viewerRef?.current || !activeTcp) return;

    const sceneSetup = viewerRef.current.getSceneSetup?.() || viewerRef.current.sceneRef?.current;
    if (!sceneSetup?.scene) return;

    createTCPVisualization(sceneSetup.scene, activeTcp);
    startTCPVisualizationLoop();

    return () => {
      cleanupTCPVisualization(sceneSetup.scene);
      stopTCPVisualizationLoop();
    };
  }, [activeTcp, viewerRef, isConnected]);

  // Load all TCPs from provider
  const loadTCPs = () => {
    const allTcps = tcpProvider.getAllTCPs();
    const activeTcp = tcpProvider.getActiveTCP();
    
    setTcps(allTcps);
    setActiveTcpId(activeTcp?.id || null);
  };

  // Load active TCP data
  const loadActiveTCP = () => {
    const tcp = tcpProvider.getActiveTCP();
    setActiveTcp(tcp);
    if (tcp) {
      setPosition(tcp.position);
    }
  };

  // Load TCP library from server
  const loadTCPLibrary = async () => {
    try {
      const response = await fetch('/api/tcp/list');
      const result = await response.json();
      
      if (result.success) {
        setTcpLibrary(result.tcps);
      }
    } catch (error) {
      console.error('Error loading TCP library:', error);
    }
  };

  // Handle TCP added event from EventBus
  const handleTCPAdded = (data) => {
    loadTCPs();
  };

  // Handle TCP removed event from EventBus  
  const handleTCPRemoved = (data) => {
    loadTCPs();
  };

  // Handle TCP activated event from EventBus
  const handleTCPActivated = (data) => {
    setActiveTcpId(data.id);
    setActiveTcp(data.tcp);
    if (data.tcp && data.tcp.position) {
      setPosition(data.tcp.position);
    }
  };

  // Handle settings updated event from EventBus
  const handleSettingsUpdated = (data) => {
    loadTCPs();
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp) {
      setActiveTcp({ ...currentActiveTcp });
    }
  };

  // Handle active TCP position updates from EventBus
  const handleActivePositionUpdated = (data) => {
    setPosition(data.position);
  };

  // Handle active TCP settings updates from EventBus
  const handleActiveSettingsUpdated = (data) => {
    const currentActiveTcp = tcpProvider.getActiveTCP();
    if (currentActiveTcp) {
      setActiveTcp({ ...currentActiveTcp });
    }
  };

  // Handle general positions updated from EventBus
  const handlePositionsUpdated = (data) => {
    const activeTcpData = data.tcps.find(tcp => tcp.id === data.activeTcpId);
    if (activeTcpData) {
      setPosition(activeTcpData.position);
    }
  };

  // Handle form input changes
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

  // Add new TCP
  const handleAddTCP = () => {
    if (!newTcpForm.name.trim()) {
      alert('Please enter a TCP name');
      return;
    }

    let stlPath = null;
    if (tcpType !== 'custom' && PREDEFINED_TCPS[tcpType]) {
      stlPath = PREDEFINED_TCPS[tcpType].stlPath;
    }

    const tcpId = tcpProvider.addTCP({
      name: newTcpForm.name.trim(),
      stlPath: stlPath,
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    setNewTcpForm({
      name: '',
      stlPath: null,
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
    setTcpType('custom');
    setIsAddModalOpen(false);

    tcpProvider.setActiveTCP(tcpId);
  };

  // Remove TCP
  const handleRemoveTCP = (tcpId) => {
    if (window.confirm('Are you sure you want to remove this TCP?')) {
      tcpProvider.removeTCP(tcpId);
    }
  };

  // Activate TCP
  const handleActivateTCP = (tcpId) => {
    tcpProvider.setActiveTCP(tcpId);
  };

  // Start editing TCP
  const handleEditTCP = (tcp) => {
    setEditingTcp(tcp.id);
    setNewTcpForm({
      name: tcp.name,
      stlPath: tcp.stlPath || null,
      visible: tcp.settings.visible,
      size: tcp.settings.size,
      color: tcp.settings.color,
      offset: { ...tcp.settings.offset }
    });
  };

  // Save TCP edits
  const handleSaveEdit = () => {
    if (!editingTcp) return;

    tcpProvider.updateTCPSettings(editingTcp, {
      stlPath: newTcpForm.stlPath,
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    const tcp = tcpProvider.getTCP(editingTcp);
    if (tcp && tcp.name !== newTcpForm.name.trim()) {
      tcp.name = newTcpForm.name.trim();
      EventBus.emit('tcp:name_updated', { id: editingTcp, name: tcp.name });
    }

    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      stlPath: null,
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      stlPath: null,
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
  };

  // Format coordinate value for display
  const formatCoordinate = (value) => {
    return parseFloat(value).toFixed(4);
  };

  // Three.js visualization functions (keeping as is)
  const createTCPVisualization = async (scene, tcpData) => {
    cleanupTCPVisualization(scene);

    if (!tcpData.settings.visible) return;

    const tcpGroup = new THREE.Group();
    tcpGroup.name = `TCP_${tcpData.id}`;
    tcpGroup.userData = { isTCP: true, tcpId: tcpData.id };

    if (tcpData.stlPath) {
      const loader = new STLLoader();
      
      try {
        const geometry = await new Promise((resolve, reject) => {
          loader.load(
            tcpData.stlPath,
            (geometry) => resolve(geometry),
            (progress) => console.log('Loading TCP STL:', progress),
            (error) => reject(error)
          );
        });

        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(tcpData.settings.color),
          specular: 0x111111,
          shininess: 200,
          transparent: true,
          opacity: 0.9
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        geometry.center();
        
        const bbox = new THREE.Box3().setFromObject(mesh);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const targetSize = tcpData.settings.size || 0.05;
        const scale = targetSize / maxDim;
        mesh.scale.set(scale, scale, scale);
        
        tcpGroup.add(mesh);
        
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
        );
        line.scale.copy(mesh.scale);
        tcpGroup.add(line);
        
      } catch (error) {
        console.error('Error loading TCP STL:', error);
        createDefaultTCPCube(tcpGroup, tcpData);
      }
    } else {
      createDefaultTCPCube(tcpGroup, tcpData);
    }

    const axesSize = tcpData.settings.size * 0.8;
    const axesHelper = new THREE.AxesHelper(axesSize);
    axesHelper.renderOrder = 100001;
    axesHelper.material.depthTest = false;
    tcpGroup.add(axesHelper);

    scene.add(tcpGroup);
    tcpObjectsRef.current.set(tcpData.id, tcpGroup);
  };

  const createDefaultTCPCube = (tcpGroup, tcpData) => {
    const size = tcpData.settings.size;
    const cubeGeom = new THREE.BoxGeometry(size, size, size);
    const cubeMat = new THREE.MeshBasicMaterial({ 
      color: new THREE.Color(tcpData.settings.color),
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    const cube = new THREE.Mesh(cubeGeom, cubeMat);
    cube.renderOrder = 99999;
    tcpGroup.add(cube);

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
  };

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

  const startTCPVisualizationLoop = () => {
    const updateLoop = () => {
      updateTCPVisualization();
      animationRef.current = requestAnimationFrame(updateLoop);
    };
    animationRef.current = requestAnimationFrame(updateLoop);
  };

  const stopTCPVisualizationLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

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

  const loadTCPFromLibrary = (tcp) => {
    console.log('Loading TCP from library:', tcp);
  };

  // If no active TCP, show error state
  if (!activeTcp) {
    return (
      <div className={`controls-section ${compact ? 'controls-compact' : ''}`}>
        <div className="controls-section-header">
          <h3 className="controls-h3 controls-mb-0">TCP</h3>
          <span className={`controls-badge ${isConnected ? 'controls-badge-danger' : 'controls-badge-secondary'}`}>
            No TCP
          </span>
        </div>
        <div className="controls-card-body controls-text-center">
          <p className="controls-text-muted">No active TCP found</p>
          <button 
            className="controls-btn controls-btn-primary"
            onClick={() => setIsAddModalOpen(true)}
          >
            Create your first TCP
          </button>
        </div>
      </div>
    );
  }

  // Render based on display mode and compact setting
  return (
    <div className={`controls-section ${compact ? 'controls-compact' : ''}`}>
      <div className="controls-section-header">
        <h3 className="controls-h3 controls-mb-0">TCP</h3>
        <div className="controls-d-flex controls-align-items-center" style={{ gap: '0.5rem' }}>
          <span className={`controls-badge ${isConnected ? 'controls-badge-success' : 'controls-badge-secondary'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {showManagement && !compact && (
            <div className="controls-btn-group">
              <button 
                className={`controls-btn controls-btn-sm ${displayMode === 'display' ? 'controls-btn-primary' : 'controls-btn-light'}`}
                onClick={() => setDisplayMode('display')}
              >
                Display
              </button>
              <button 
                className={`controls-btn controls-btn-sm ${displayMode === 'manage' ? 'controls-btn-primary' : 'controls-btn-light'}`}
                onClick={() => setDisplayMode('manage')}
              >
                Manage
              </button>
            </div>
          )}
          {showManagement && displayMode === 'manage' && (
            <button 
              className="controls-btn controls-btn-success controls-btn-sm"
              onClick={() => setIsAddModalOpen(true)}
            >
              + Add TCP
            </button>
          )}
        </div>
      </div>

      <div className="controls-card-body">
        {/* Display Mode - Shows current TCP info */}
        {(displayMode === 'display' || compact) && (
          <div>
            {/* TCP Info */}
            <div className="controls-mb-3">
              <div className="controls-d-flex controls-align-items-center controls-mb-2" style={{ gap: '0.5rem' }}>
                <strong className="controls-h5 controls-mb-0">{activeTcp.name}</strong>
                {activeTcp.isDefault && <span className="controls-badge controls-badge-primary">Default</span>}
              </div>
              <div className="controls-text-muted">ID: {activeTcp.id}</div>
            </div>

            {/* Position Display */}
            <div className="controls-mb-3">
              <h4 className="controls-h6">Current Position</h4>
              <div className="controls-grid controls-grid-cols-3" style={{ gap: '0.5rem' }}>
                <div className="controls-card">
                  <div className="controls-card-body controls-text-center controls-p-2">
                    <label className="controls-form-label controls-text-muted controls-mb-1">X</label>
                    <div className="controls-h6 controls-text-primary controls-mb-0">{formatCoordinate(position.x)}</div>
                    <small className="controls-text-muted">m</small>
                  </div>
                </div>
                <div className="controls-card">
                  <div className="controls-card-body controls-text-center controls-p-2">
                    <label className="controls-form-label controls-text-muted controls-mb-1">Y</label>
                    <div className="controls-h6 controls-text-primary controls-mb-0">{formatCoordinate(position.y)}</div>
                    <small className="controls-text-muted">m</small>
                  </div>
                </div>
                <div className="controls-card">
                  <div className="controls-card-body controls-text-center controls-p-2">
                    <label className="controls-form-label controls-text-muted controls-mb-1">Z</label>
                    <div className="controls-h6 controls-text-primary controls-mb-0">{formatCoordinate(position.z)}</div>
                    <small className="controls-text-muted">m</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Settings Display */}
            {!compact && (
              <div className="controls-mb-3">
                <h4 className="controls-h6">Settings</h4>
                <div className="controls-grid controls-grid-cols-3" style={{ gap: '0.5rem' }}>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">Visible</label>
                      <span className={`controls-badge ${activeTcp.settings.visible ? 'controls-badge-success' : 'controls-badge-secondary'}`}>
                        {activeTcp.settings.visible ? '●' : '○'}
                      </span>
                    </div>
                  </div>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">Size</label>
                      <span>{activeTcp.settings.size.toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">Color</label>
                      <div 
                        style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '50%',
                          backgroundColor: activeTcp.settings.color,
                          margin: '0 auto',
                          border: '2px solid #fff',
                          boxShadow: '0 0 0 1px #ddd'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Offset Display */}
            {!compact && (
              <div className="controls-mb-3">
                <h4 className="controls-h6">TCP Offset</h4>
                <div className="controls-grid controls-grid-cols-3" style={{ gap: '0.5rem' }}>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">X</label>
                      <div className="controls-text-primary">{formatCoordinate(activeTcp.settings.offset.x)}</div>
                    </div>
                  </div>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">Y</label>
                      <div className="controls-text-primary">{formatCoordinate(activeTcp.settings.offset.y)}</div>
                    </div>
                  </div>
                  <div className="controls-card">
                    <div className="controls-card-body controls-text-center controls-p-2">
                      <label className="controls-form-label controls-text-muted controls-mb-1">Z</label>
                      <div className="controls-text-primary">{formatCoordinate(activeTcp.settings.offset.z)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick edit button in display mode */}
            {showManagement && !compact && (
              <div className="controls-text-center">
                <button 
                  className="controls-btn controls-btn-warning"
                  onClick={() => handleEditTCP(activeTcp)}
                >
                  Edit Current TCP
                </button>
              </div>
            )}

            {/* Last Updated */}
            <div className="controls-text-center controls-mt-3">
              <small className="controls-text-muted">Updated: {new Date(activeTcp.lastUpdated).toLocaleTimeString()}</small>
            </div>
          </div>
        )}

        {/* Management Mode - Shows all TCPs */}
        {displayMode === 'manage' && showManagement && !compact && (
          <div>
            {tcps.length === 0 ? (
              <div className="controls-text-center controls-p-4">
                <p className="controls-text-muted">No TCPs available</p>
                <button 
                  className="controls-btn controls-btn-primary"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  Create your first TCP
                </button>
              </div>
            ) : (
              <div>
                {tcps.map(tcp => (
                  <div 
                    key={tcp.id}
                    className={`controls-list-item ${tcp.id === activeTcpId ? 'controls-active' : ''}`}
                  >
                    <div className="controls-list-item-content">
                      <h5 className="controls-list-item-title">
                        {tcp.name}
                        {tcp.isDefault && <span className="controls-badge controls-badge-primary controls-ml-2">Default</span>}
                      </h5>
                      <div className="controls-text-muted">ID: {tcp.id}</div>
                      
                      <div className="controls-d-flex controls-align-items-center controls-mt-2" style={{ gap: '1rem' }}>
                        <span className={`controls-badge ${tcp.settings.visible ? 'controls-badge-success' : 'controls-badge-secondary'}`}>
                          {tcp.settings.visible ? '👁️ Visible' : '🚫 Hidden'}
                        </span>
                        <span className="controls-text-muted">Size: {tcp.settings.size.toFixed(3)}</span>
                        <div className="controls-d-flex controls-align-items-center" style={{ gap: '0.25rem' }}>
                          <div 
                            style={{ 
                              width: '16px', 
                              height: '16px', 
                              borderRadius: '50%',
                              backgroundColor: tcp.settings.color,
                              border: '2px solid white',
                              boxShadow: '0 0 0 1px #ddd'
                            }}
                          ></div>
                          <span className="controls-text-muted">{tcp.settings.color}</span>
                        </div>
                      </div>
                      
                      <div className="controls-text-muted controls-mt-1">
                        <strong>Offset:</strong> 
                        X: {tcp.settings.offset.x.toFixed(3)}, 
                        Y: {tcp.settings.offset.y.toFixed(3)}, 
                        Z: {tcp.settings.offset.z.toFixed(3)}
                      </div>
                    </div>
                    
                    <div className="controls-list-item-actions">
                      {tcp.id !== activeTcpId && (
                        <button 
                          className="controls-btn controls-btn-success controls-btn-sm"
                          onClick={() => handleActivateTCP(tcp.id)}
                        >
                          Activate
                        </button>
                      )}
                      <button 
                        className="controls-btn controls-btn-warning controls-btn-sm"
                        onClick={() => handleEditTCP(tcp)}
                      >
                        Edit
                      </button>
                      {!tcp.isDefault && (
                        <button 
                          className="controls-btn controls-btn-danger controls-btn-sm"
                          onClick={() => handleRemoveTCP(tcp.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TCP Library Section */}
        {displayMode === 'manage' && tcpLibrary.length > 0 && (
          <div className="controls-mt-4">
            <h4 className="controls-h5">TCP Tool Library</h4>
            <div className="controls-grid controls-grid-cols-4" style={{ gap: '0.5rem' }}>
              {tcpLibrary.map(tcp => (
                <div key={tcp.id} className="controls-card">
                  <div className="controls-card-body">
                    <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-2">
                      <div 
                        style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '50%',
                          backgroundColor: tcp.color,
                          border: '2px solid white',
                          boxShadow: '0 0 0 1px #ddd'
                        }}
                      />
                      <span className="controls-badge controls-badge-secondary">{tcp.category}</span>
                    </div>
                    <h6 className="controls-card-title">{tcp.name}</h6>
                    {tcp.dimensions && (
                      <small className="controls-text-muted">
                        {tcp.dimensions.width.toFixed(2)} × {tcp.dimensions.height.toFixed(2)} × {tcp.dimensions.depth.toFixed(2)}m
                      </small>
                    )}
                    <button 
                      onClick={() => loadTCPFromLibrary(tcp)}
                      className="controls-btn controls-btn-success controls-btn-sm controls-btn-block controls-mt-2"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || editingTcp) && createPortal(
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '500px' }}>
            <div className="controls-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{editingTcp ? 'Edit TCP' : 'Add New TCP'}</h2>
              <button 
                className="controls-close"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '2rem',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '0',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
              >
                ×
              </button>
            </div>

            <div className="controls-modal-body" style={{ padding: '2rem' }}>
              {/* TCP Type Selector */}
              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>TCP Type:</label>
                <select
                  className="controls-form-select"
                  value={tcpType}
                  onChange={(e) => {
                    setTcpType(e.target.value);
                    if (e.target.value !== 'custom') {
                      const predefined = PREDEFINED_TCPS[e.target.value];
                      setNewTcpForm(prev => ({
                        ...prev,
                        name: predefined.name,
                        size: predefined.size,
                        color: predefined.color,
                        offset: predefined.offset
                      }));
                    }
                  }}
                >
                  <option value="custom">Custom TCP</option>
                  <option value="er20">ER20 Collet</option>
                  <option value="square_tcp">Square TCP</option>
                  <option value="gripper">Standard Gripper</option>
                </select>
              </div>

              {/* Show STL preview for predefined TCPs */}
              {tcpType !== 'custom' && (
                <div className="controls-alert controls-alert-info controls-mb-3">
                  <small>Using predefined STL: {PREDEFINED_TCPS[tcpType].stlPath}</small>
                </div>
              )}

              {/* TCP Name */}
              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>TCP Name:</label>
                <input
                  type="text"
                  className="controls-form-control"
                  value={newTcpForm.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Enter TCP name"
                  style={{ fontSize: '1rem' }}
                />
              </div>

              {/* Settings Grid */}
              <div className="controls-grid controls-grid-cols-3" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="controls-form-group">
                  <label className="controls-form-label">
                    <input
                      type="checkbox"
                      checked={newTcpForm.visible}
                      onChange={(e) => handleFormChange('visible', e.target.checked)}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Visible
                  </label>
                </div>
                <div className="controls-form-group">
                  <label className="controls-form-label">Size:</label>
                  <input
                    type="number"
                    className="controls-form-control"
                    step="0.001"
                    min="0.001"
                    max="0.5"
                    value={newTcpForm.size}
                    onChange={(e) => handleFormChange('size', e.target.value)}
                  />
                </div>
                <div className="controls-form-group">
                  <label className="controls-form-label">Color:</label>
                  <input
                    type="color"
                    className="controls-form-control"
                    value={newTcpForm.color}
                    onChange={(e) => handleFormChange('color', e.target.value)}
                    style={{ height: '40px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* TCP Offset */}
              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>TCP Offset:</label>
                <div className="controls-grid controls-grid-cols-3" style={{ gap: '1rem' }}>
                  <div>
                    <label className="controls-form-label">X:</label>
                    <input
                      type="number"
                      className="controls-form-control"
                      step="0.001"
                      value={newTcpForm.offset.x}
                      onChange={(e) => handleFormChange('offset.x', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="controls-form-label">Y:</label>
                    <input
                      type="number"
                      className="controls-form-control"
                      step="0.001"
                      value={newTcpForm.offset.y}
                      onChange={(e) => handleFormChange('offset.y', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="controls-form-label">Z:</label>
                    <input
                      type="number"
                      className="controls-form-control"
                      step="0.001"
                      value={newTcpForm.offset.z}
                      onChange={(e) => handleFormChange('offset.z', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="controls-modal-footer" style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem',
              padding: '1.5rem 2rem',
              borderTop: '1px solid #e0e0e0'
            }}>
              <button 
                className="controls-btn controls-btn-secondary"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
              >
                Cancel
              </button>
              <button 
                className="controls-btn controls-btn-primary"
                onClick={editingTcp ? handleSaveEdit : handleAddTCP}
              >
                {editingTcp ? 'Save Changes' : 'Add TCP'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TCPManager;