// src/components/controls/RecordMap/LiveTrajectoryGraph.jsx - PURE UI COMPONENT
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTrajectoryVisualization } from '../../../contexts/hooks/useTrajectory';
import { useTCP } from '../../../contexts/hooks/useTCP';
import useAnimate from '../../../contexts/hooks/useAnimate';

const LiveTrajectoryGraph = ({ isOpen, onClose, activeRobotId }) => {
  // Use hooks for data
  const {
    trajectories,
    visualizationData,
    smoothPoints,
    pathColors,
    startPoint,
    endPoint,
    waypoints,
    stats,
    isLoading,
    hasVisualizationData,
    loadVisualization,
    clearVisualization,
    getCameraConfig
  } = useTrajectoryVisualization(activeRobotId);
  
  const { currentEndEffectorPoint, hasValidEndEffector, isUsingTCP } = useTCP(activeRobotId);
  const { isAnimating, animationProgress } = useAnimate();

  // 3D Scene refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pathLineRef = useRef(null);
  const markersRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // UI State only
  const [step, setStep] = useState(1);
  const [selectedTrajectory, setSelectedTrajectory] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });

  // ========== UI EFFECTS ==========
  
  // Auto-select first trajectory
  useEffect(() => {
    if (isOpen && activeRobotId && trajectories.length > 0 && !selectedTrajectory) {
      setSelectedTrajectory(trajectories[0]);
    }
  }, [isOpen, activeRobotId, trajectories, selectedTrajectory]);

  // Initialize 3D scene when displaying
  useEffect(() => {
    if (step === 2 && containerRef.current && !sceneRef.current) {
      initScene();
    }
    return () => {
      if (step !== 2) {
        cleanupScene();
      }
    };
  }, [step]);

  // Load visualization data when trajectory selected
  useEffect(() => {
    if (step === 2 && selectedTrajectory && !isLive) {
      // Add a check to prevent re-loading if the same trajectory is already loaded
      const isAlreadyLoaded = visualizationData &&
                             visualizationData.trajectoryData &&
                             visualizationData.trajectoryData.name === selectedTrajectory.name &&
                             visualizationData.trajectoryData.manufacturer === selectedTrajectory.manufacturer &&
                             visualizationData.trajectoryData.model === selectedTrajectory.model;

      if (!isAlreadyLoaded) {
        loadVisualization(selectedTrajectory);
      }
    }
  }, [step, selectedTrajectory, isLive, loadVisualization, visualizationData]);

  // Update visualization when data changes
  useEffect(() => {
    if (sceneRef.current && hasVisualizationData && !isLive) {
      updateVisualization();
    }
  }, [visualizationData, hasVisualizationData, isLive]);

  // Update live position
  useEffect(() => {
    if (isLive && hasValidEndEffector) {
      setCurrentPosition(currentEndEffectorPoint);
      updateCurrentMarker(currentEndEffectorPoint);
    }
  }, [isLive, hasValidEndEffector, currentEndEffectorPoint]);

  // ========== 3D SCENE FUNCTIONS (Pure Rendering) ==========
  
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
    scene.add(dirLight);

    // Grid and axes
    const gridHelper = new THREE.GridHelper(4, 40, 0x444444, 0x888888);
    scene.add(gridHelper);
    
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // Current position marker
    const currentGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const currentMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff9900,
      emissive: 0xff9900,
      emissiveIntensity: 0.3
    });
    const currentMarker = new THREE.Mesh(currentGeometry, currentMaterial);
    currentMarker.position.set(0, 0, 0);
    scene.add(currentMarker);
    currentMarkerRef.current = currentMarker;

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
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

    return () => window.removeEventListener('resize', handleResize);
  };

  const updateVisualization = () => {
    if (!sceneRef.current || !smoothPoints || smoothPoints.length < 2) return;

    // Clear old visualization
    clearOldVisualization();

    // Create line geometry from smooth points
    const points = smoothPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Apply colors
    const colors = [];
    pathColors.forEach(color => {
      colors.push(color.r, color.g, color.b);
    });
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create line
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 3
    });
    const line = new THREE.Line(geometry, material);
    sceneRef.current.add(line);
    pathLineRef.current = line;

    // Add markers
    if (startPoint) {
      const startMarker = createMarker(startPoint, 0x00ff00, 0.025);
      sceneRef.current.add(startMarker);
      markersRef.current.push(startMarker);
    }

    if (endPoint) {
      const endMarker = createMarker(endPoint, 0xff0000, 0.025);
      sceneRef.current.add(endMarker);
      markersRef.current.push(endMarker);
    }

    waypoints.forEach(waypoint => {
      const marker = createMarker(waypoint.position, 0x0088ff, 0.015, 0.7);
      sceneRef.current.add(marker);
      markersRef.current.push(marker);
    });

    // Update camera position
    const cameraConfig = getCameraConfig();
    if (cameraRef.current && controlsRef.current && cameraConfig) {
      cameraRef.current.position.set(
        cameraConfig.position.x,
        cameraConfig.position.y,
        cameraConfig.position.z
      );
      controlsRef.current.target.set(
        cameraConfig.target.x,
        cameraConfig.target.y,
        cameraConfig.target.z
      );
      controlsRef.current.update();
    }
  };

  const createMarker = (position, color, size, opacity = 1) => {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshPhongMaterial({ 
      color: color,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: opacity < 1,
      opacity: opacity
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, position.y, position.z);
    marker.userData.isTrajectoryMarker = true;
    return marker;
  };

  const clearOldVisualization = () => {
    // Remove line
    if (pathLineRef.current) {
      sceneRef.current.remove(pathLineRef.current);
      if (pathLineRef.current.geometry) pathLineRef.current.geometry.dispose();
      if (pathLineRef.current.material) pathLineRef.current.material.dispose();
      pathLineRef.current = null;
    }

    // Remove markers
    markersRef.current.forEach(marker => {
      sceneRef.current.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    });
    markersRef.current = [];
  };

  const updateCurrentMarker = (position) => {
    if (currentMarkerRef.current && position) {
      currentMarkerRef.current.position.set(position.x, position.y, position.z);
    }
  };

  const cleanupScene = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    clearOldVisualization();

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
    currentMarkerRef.current = null;
  };

  // ========== UI EVENT HANDLERS ==========

  const handleNext = () => {
    if ((selectedTrajectory && !isLive) || isLive) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
    clearVisualization();
  };

  const exportData = () => {
    if (!visualizationData) return;

    const exportData = {
      name: selectedTrajectory.name,
      robotId: activeRobotId,
      path: visualizationData.trajectoryData.endEffectorPath,
      statistics: stats,
      analysis: visualizationData.analysis,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory_${selectedTrajectory.name}_${activeRobotId}_${Date.now()}.json`;
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
                    value={selectedTrajectory?.id || ''}
                    onChange={(e) => {
                      const selected = trajectories.find(t => t.id === e.target.value);
                      setSelectedTrajectory(selected);
                    }}
                    className="controls-form-select"
                    style={{ width: '100%', maxWidth: '400px' }}
                  >
                    {trajectories.length === 0 ? (
                      <option value="">No trajectories available</option>
                    ) : (
                      trajectories.map(traj => (
                        <option key={traj.id} value={traj.id}>{traj.name}</option>
                      ))
                    )}
                  </select>
                  
                  {selectedTrajectory && (
                    <div className="controls-mt-2 controls-text-muted controls-small">
                      {selectedTrajectory.frameCount} frames • {(selectedTrajectory.duration / 1000).toFixed(1)}s
                      {selectedTrajectory.recordedAt && ` • ${new Date(selectedTrajectory.recordedAt).toLocaleDateString()}`}
                    </div>
                  )}
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
                  {isLive ? 'Live End Effector Tracking' : `Trajectory: ${selectedTrajectory?.name}`}
                </h3>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isLive && visualizationData && (
                    <button 
                      onClick={exportData} 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                    >
                      📤 Export Data
                    </button>
                  )}
                </div>
              </div>

              {/* Loading indicator */}
              {isLoading && (
                <div style={{
                  padding: '1rem',
                  background: '#e3f2fd',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <div className="controls-spinner-border controls-spinner-border-sm" role="status">
                    <span className="controls-sr-only">Loading...</span>
                  </div>
                  <span className="controls-ml-2">Loading trajectory data...</span>
                </div>
              )}

              {/* Status Information */}
              {!isLive && !isLoading && stats && (
                <div style={{
                  padding: '1rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem'
                }}>
                  <div><strong>Points:</strong> {stats.frameCount}</div>
                  <div><strong>Length:</strong> {stats.totalDistance.toFixed(3)}m</div>
                  <div><strong>Duration:</strong> {stats.duration.toFixed(1)}s</div>
                  <div><strong>Robot:</strong> {activeRobotId}</div>
                  <div><strong>Path Points:</strong> {stats.pathPoints}</div>
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
                
                {!isLive && stats?.pathPoints === 0 && !isLoading && (
                  <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ffc107',
                    color: '#856404',
                    fontSize: '0.875rem'
                  }}>
                    ⚠️ No end effector path data available for this trajectory
                  </div>
                )}
              </div>

              {/* Trajectory Bounds */}
              {!isLive && visualizationData?.visualization?.bounds && !isLoading && (
                <div style={{
                  padding: '0.75rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  color: '#666'
                }}>
                  <strong>Workspace Bounds:</strong><br />
                  X: [{visualizationData.visualization.bounds.min.x.toFixed(3)}, {visualizationData.visualization.bounds.max.x.toFixed(3)}] • 
                  Y: [{visualizationData.visualization.bounds.min.y.toFixed(3)}, {visualizationData.visualization.bounds.max.y.toFixed(3)}] • 
                  Z: [{visualizationData.visualization.bounds.min.z.toFixed(3)}, {visualizationData.visualization.bounds.max.z.toFixed(3)}]
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