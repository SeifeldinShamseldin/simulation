// src/components/controls/RecordMap/LiveTrajectoryGraph.jsx - Updated UI Component
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTrajectoryManagement } from '../../../contexts/hooks/useTrajectory';
import { useTCP } from '../../../contexts/hooks/useTCP';
import EventBus from '../../../utils/EventBus';
import { createStandardGrids } from '../../../utils/threeHelpers';

const LiveTrajectoryGraph = ({ isOpen, onClose, activeRobotId }) => {
  // Use trajectory and TCP hooks
  const {
    trajectories,
    getTrajectory,
    analyzeTrajectory
  } = useTrajectoryManagement(activeRobotId);
  
  const {
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP
  } = useTCP(activeRobotId);

  // 3D Scene refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pathLineRef = useRef(null);
  const currentMarkerRef = useRef(null);
  
  // UI State
  const [step, setStep] = useState(1); // 1: Select, 2: Display
  const [selectedTrajectory, setSelectedTrajectory] = useState('');
  const [trajectoryData, setTrajectoryData] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });
  const [statistics, setStatistics] = useState({
    points: 0,
    length: 0,
    duration: 0,
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 }
    }
  });

  // Update available trajectories
  useEffect(() => {
    if (isOpen && activeRobotId && trajectories.length > 0 && !selectedTrajectory) {
      setSelectedTrajectory(trajectories[0]);
    }
  }, [isOpen, activeRobotId, trajectories, selectedTrajectory]);

  // Initialize 3D scene when displaying
  useEffect(() => {
    if (step === 2 && containerRef.current) {
      initScene();
      return () => {
        cleanupScene();
      };
    }
  }, [step]);

  // Load and display selected trajectory
  useEffect(() => {
    if (step === 2 && selectedTrajectory && !isLive) {
      loadTrajectory(selectedTrajectory);
    }
  }, [step, selectedTrajectory, isLive]);

  // Listen for live TCP updates
  useEffect(() => {
    if (!isLive || step !== 2 || !activeRobotId) return;

    // Update position from TCP hook
    setCurrentPosition(currentEndEffectorPoint);
    updateCurrentMarker(currentEndEffectorPoint);

    // Also listen for playback updates during live tracking
    const handlePlaybackUpdate = (data) => {
      if (data.robotId === activeRobotId && data.endEffectorPosition) {
        setCurrentPosition(data.endEffectorPosition);
        updateCurrentMarker(data.endEffectorPosition);
      }
    };

    const handleRecordingUpdate = (data) => {
      if (data.robotId === activeRobotId && data.endEffectorPosition) {
        setCurrentPosition(data.endEffectorPosition);
        updateCurrentMarker(data.endEffectorPosition);
      }
    };

    const unsubscribePlayback = EventBus.on('trajectory:playback-update', handlePlaybackUpdate);
    const unsubscribeRecording = EventBus.on('trajectory:recording-update', handleRecordingUpdate);

    return () => {
      unsubscribePlayback();
      unsubscribeRecording();
    };
  }, [isLive, step, activeRobotId, currentEndEffectorPoint]);

  const initScene = () => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(2, 2, 2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Add coordinate system
    const { grid, axes } = createStandardGrids(scene, { 
      gridSize: 4, 
      gridDivisions: 40, 
      addAxes: true, 
      axesSize: 2 
    });

    // Add current position marker for live tracking
    const currentGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const currentMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff9900,
      emissive: 0xff9900,
      emissiveIntensity: 0.3
    });
    const currentMarker = new THREE.Mesh(currentGeometry, currentMaterial);
    currentMarker.position.copy(currentEndEffectorPoint);
    scene.add(currentMarker);
    currentMarkerRef.current = currentMarker;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (controls) controls.update();
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  const loadTrajectory = (trajectoryName) => {
    if (!activeRobotId) return;
    
    const trajectory = getTrajectory(trajectoryName);
    if (!trajectory) {
      console.warn(`[LiveTrajectoryGraph] Trajectory "${trajectoryName}" not found`);
      return;
    }

    const pathData = trajectory.endEffectorPath || [];
    setTrajectoryData(trajectory);

    // Calculate statistics using the analysis function
    const analysis = analyzeTrajectory(trajectoryName);
    if (analysis) {
      setStatistics({
        points: analysis.frameCount,
        length: analysis.endEffectorStats.totalDistance,
        duration: analysis.duration / 1000,
        bounds: analysis.endEffectorStats.bounds
      });
    }

    if (pathData.length > 0) {
      // Draw the path
      drawTrajectoryPath(pathData);

      // Focus camera on path
      if (analysis && analysis.endEffectorStats.bounds) {
        focusOnTrajectory(analysis.endEffectorStats.bounds);
      }
    }
  };

  const drawTrajectoryPath = (pathData) => {
    if (!sceneRef.current || pathData.length < 2) return;

    // Remove old path
    if (pathLineRef.current) {
      sceneRef.current.remove(pathLineRef.current);
      if (pathLineRef.current.geometry) pathLineRef.current.geometry.dispose();
      if (pathLineRef.current.material) pathLineRef.current.material.dispose();
    }

    // Create path points
    const points = pathData.map(p => new THREE.Vector3(p.position.x, p.position.y, p.position.z));

    // Create curve for smooth path
    const curve = new THREE.CatmullRomCurve3(points);
    const pathPoints = curve.getPoints(points.length * 5); // Smooth but not too dense

    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);

    // Create gradient colors from start (green) to end (red)
    const colors = [];
    for (let i = 0; i < pathPoints.length; i++) {
      const t = i / (pathPoints.length - 1);
      colors.push(1 - t, t, 0.3); // Red to green gradient with some blue
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create line material
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 3
    });

    const line = new THREE.Line(geometry, material);
    sceneRef.current.add(line);
    pathLineRef.current = line;

    // Add start marker (green)
    const startGeometry = new THREE.SphereGeometry(0.025, 16, 16);
    const startMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x00ff00,
      emissive: 0x004400,
      emissiveIntensity: 0.2
    });
    const startMarker = new THREE.Mesh(startGeometry, startMaterial);
    startMarker.position.copy(points[0]);
    sceneRef.current.add(startMarker);

    // Add end marker (red)
    const endGeometry = new THREE.SphereGeometry(0.025, 16, 16);
    const endMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff0000,
      emissive: 0x440000,
      emissiveIntensity: 0.2
    });
    const endMarker = new THREE.Mesh(endGeometry, endMaterial);
    endMarker.position.copy(points[points.length - 1]);
    sceneRef.current.add(endMarker);

    // Add waypoint markers at regular intervals
    const waypointInterval = Math.max(1, Math.floor(points.length / 10));
    for (let i = waypointInterval; i < points.length - 1; i += waypointInterval) {
      const waypointGeometry = new THREE.SphereGeometry(0.015, 12, 12);
      const waypointMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x0088ff,
        transparent: true,
        opacity: 0.7
      });
      const waypoint = new THREE.Mesh(waypointGeometry, waypointMaterial);
      waypoint.position.copy(points[i]);
      sceneRef.current.add(waypoint);
    }
  };

  const updateCurrentMarker = (position) => {
    if (currentMarkerRef.current && position) {
      currentMarkerRef.current.position.set(position.x, position.y, position.z);
    }
  };

  const focusOnTrajectory = (bounds) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );

    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    const distance = Math.max(size * 2, 1); // Ensure minimum distance
    cameraRef.current.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const cleanupScene = () => {
    if (rendererRef.current && containerRef.current) {
      if (rendererRef.current.domElement && containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }

    sceneRef.current = null;
    cameraRef.current = null;
    pathLineRef.current = null;
    currentMarkerRef.current = null;
  };

  const handleNext = () => {
    if ((selectedTrajectory && !isLive) || isLive) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
    cleanupScene();
  };

  const exportData = () => {
    if (!trajectoryData) return;

    const exportData = {
      name: selectedTrajectory,
      robotId: activeRobotId,
      path: trajectoryData.endEffectorPath,
      statistics: statistics,
      analysis: analyzeTrajectory(selectedTrajectory),
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory_${selectedTrajectory}_${activeRobotId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '1200px', width: '90%', height: '85vh' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            Trajectory 3D Visualization - {activeRobotId}
          </h2>
          <button 
            className="controls-close"
            onClick={onClose}
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
        
        {/* Step Indicators */}
        <div style={{
          display: 'flex',
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #e0e0e0',
          background: '#f8f9fa'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: step >= 1 ? '#1976d2' : '#999',
            marginRight: '3rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: step >= 1 ? '#1976d2' : '#e0e0e0',
              color: step >= 1 ? '#fff' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}>1</span>
            <span style={{ fontWeight: '500' }}>Select Source</span>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: step >= 2 ? '#1976d2' : '#999'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: step >= 2 ? '#1976d2' : '#e0e0e0',
              color: step >= 2 ? '#fff' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}>2</span>
            <span style={{ fontWeight: '500' }}>3D Visualization</span>
          </div>
        </div>
        
        <div className="controls-modal-body" style={{ padding: '2rem', minHeight: '300px' }}>
          {/* Step 1: Selection */}
          {step === 1 ? (
            <div>
              <h3 style={{ marginBottom: '1.5rem' }}>Select Trajectory Source</h3>
              
              {/* Recorded Trajectory Option */}
              <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '1rem',
                background: !isLive ? '#e3f2fd' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setIsLive(false)}>
                <input
                  type="radio"
                  id="recorded"
                  name="source"
                  checked={!isLive}
                  onChange={() => setIsLive(false)}
                  style={{ marginRight: '0.5rem' }}
                />
                <label htmlFor="recorded" style={{ cursor: 'pointer' }}>
                  <strong>Recorded Trajectory</strong>
                  <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                    View a previously recorded trajectory path
                  </p>
                </label>
              </div>

              {/* Trajectory Selection */}
              {!isLive && (
                <div style={{ marginLeft: '2rem', marginBottom: '1rem' }}>
                  <label className="controls-form-label">Select Trajectory:</label>
                  <select
                    value={selectedTrajectory}
                    onChange={(e) => setSelectedTrajectory(e.target.value)}
                    className="controls-form-select"
                    style={{ width: '100%', maxWidth: '400px' }}
                  >
                    {trajectories.length === 0 ? (
                      <option value="">No trajectories available</option>
                    ) : (
                      trajectories.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))
                    )}
                  </select>
                  
                  {selectedTrajectory && (() => {
                    const trajectory = getTrajectory(selectedTrajectory);
                    return trajectory ? (
                      <div className="controls-mt-2 controls-text-muted controls-small">
                        {trajectory.frameCount} frames • {(trajectory.duration / 1000).toFixed(1)}s
                        {trajectory.endEffectorPath && ` • ${trajectory.endEffectorPath.length} path points`}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Live Tracking Option */}
              <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1.5rem',
                background: isLive ? '#e3f2fd' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setIsLive(true)}>
                <input
                  type="radio"
                  id="live"
                  name="source"
                  checked={isLive}
                  onChange={() => setIsLive(true)}
                  style={{ marginRight: '0.5rem' }}
                />
                <label htmlFor="live" style={{ cursor: 'pointer' }}>
                  <strong>Live Tracking</strong>
                  <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                    Real-time end effector position tracking
                    {isUsingTCP && <span> (TCP Tool Active)</span>}
                    {!hasValidEndEffector && <span style={{ color: '#d32f2f' }}> (No end effector detected)</span>}
                  </p>
                </label>
              </div>
            </div>
          ) : (
            /* Step 2: Visualization */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>
                  {isLive ? 'Live End Effector Tracking' : `Trajectory: ${selectedTrajectory}`}
                </h3>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isLive && (
                    <button 
                      onClick={exportData} 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      disabled={!trajectoryData}
                    >
                      📤 Export Data
                    </button>
                  )}
                </div>
              </div>

              {/* Status Information */}
              {!isLive && trajectoryData && (
                <div style={{
                  padding: '1rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem'
                }}>
                  <div><strong>Points:</strong> {statistics.points}</div>
                  <div><strong>Length:</strong> {statistics.length.toFixed(3)}m</div>
                  <div><strong>Duration:</strong> {statistics.duration.toFixed(1)}s</div>
                  <div><strong>Robot:</strong> {activeRobotId}</div>
                </div>
              )}

              {/* Live Status */}
              {isLive && (
                <div style={{
                  padding: '1rem',
                  background: hasValidEndEffector ? '#e8f5e8' : '#fff3cd',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  border: `1px solid ${hasValidEndEffector ? '#28a745' : '#ffc107'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: hasValidEndEffector ? '#28a745' : '#ffc107',
                      animation: 'pulse 2s infinite'
                    }}></div>
                    <strong>
                      {hasValidEndEffector ? 'Live Tracking Active' : 'End Effector Not Detected'}
                    </strong>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
                    <div><strong>X:</strong> {currentPosition.x.toFixed(3)}</div>
                    <div><strong>Y:</strong> {currentPosition.y.toFixed(3)}</div>
                    <div><strong>Z:</strong> {currentPosition.z.toFixed(3)}</div>
                    <div><strong>TCP:</strong> {isUsingTCP ? '✓' : '✗'}</div>
                  </div>
                </div>
              )}

              {/* 3D Viewport */}
              <div ref={containerRef} style={{
                height: '400px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                background: '#fafafa',
                marginBottom: '1rem',
                width: '100%',
                position: 'relative'
              }}>
                {!sceneRef.current && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                    <div>Initializing 3D visualization...</div>
                  </div>
                )}
              </div>

              {/* Trajectory Bounds (for recorded trajectories) */}
              {!isLive && statistics.bounds && (
                <div style={{
                  padding: '0.75rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  color: '#666'
                }}>
                  <strong>Workspace Bounds:</strong><br />
                  X: [{statistics.bounds.min.x.toFixed(3)}, {statistics.bounds.max.x.toFixed(3)}] • 
                  Y: [{statistics.bounds.min.y.toFixed(3)}, {statistics.bounds.max.y.toFixed(3)}] • 
                  Z: [{statistics.bounds.min.z.toFixed(3)}, {statistics.bounds.max.z.toFixed(3)}]
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Modal Footer */}
        <div className="controls-modal-footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '1.5rem 2rem',
          borderTop: '1px solid #e0e0e0'
        }}>
          <button 
            onClick={handleBack}
            className="controls-btn controls-btn-secondary"
            style={{ visibility: step > 1 ? 'visible' : 'hidden' }}
          >
            ← Previous
          </button>
          
          <div style={{ marginLeft: 'auto' }}>
            {step < 2 && (
              <button 
                onClick={handleNext}
                className="controls-btn controls-btn-primary"
                disabled={!isLive && (!selectedTrajectory || trajectories.length === 0)}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LiveTrajectoryGraph;