// src/components/controls/RecordMap/LiveTrajectoryGraph.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import EventBus from '../../../utils/EventBus';
import './LiveTrajectoryGraph.css';
import { createStandardGrids } from '../../../utils/threeHelpers';

const LiveTrajectoryGraph = ({ isOpen, onClose }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pathLineRef = useRef(null);
  const currentMarkerRef = useRef(null);
  
  const [step, setStep] = useState(1); // 1: Select, 2: Display
  const [trajectories, setTrajectories] = useState([]);
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

  // Load available trajectories
  useEffect(() => {
    if (isOpen) {
      const trajNames = trajectoryAPI.getTrajectoryNames();
      setTrajectories(trajNames);
      if (trajNames.length > 0 && !selectedTrajectory) {
        setSelectedTrajectory(trajNames[0]);
      }
    }
  }, [isOpen]);

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
    if (step === 2 && selectedTrajectory) {
      loadTrajectory(selectedTrajectory);
    }
  }, [step, selectedTrajectory]);

  // Subscribe to live updates
  useEffect(() => {
    if (!isLive || step !== 2) return;

    const unsubscribeTCP = EventBus.on('tcp:active-position-updated', (data) => {
      if (data.position) {
        setCurrentPosition(data.position);
        updateCurrentMarker(data.position);
      }
    });

    trajectoryAPI.registerPlaybackUpdateCallback((info) => {
      if (info.endEffectorPosition) {
        setCurrentPosition(info.endEffectorPosition);
        updateCurrentMarker(info.endEffectorPosition);
      }
    });

    return () => {
      unsubscribeTCP();
    };
  }, [isLive, step]);

  const initScene = () => {
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
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Add coordinate system
    const { grid, axes } = createStandardGrids(scene, { gridSize: 4, gridDivisions: 40, addAxes: true, axesSize: 2 });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
  };

  const loadTrajectory = (trajectoryName) => {
    const trajectory = trajectoryAPI.getTrajectory(trajectoryName);
    if (!trajectory) return;

    const pathData = trajectory.endEffectorPath || [];
    setTrajectoryData(trajectory);

    // Calculate statistics
    let totalLength = 0;
    const bounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };

    if (pathData.length > 0) {
      // Calculate bounds and path length
      for (let i = 0; i < pathData.length; i++) {
        const pos = pathData[i].position;
        bounds.min.x = Math.min(bounds.min.x, pos.x);
        bounds.min.y = Math.min(bounds.min.y, pos.y);
        bounds.min.z = Math.min(bounds.min.z, pos.z);
        bounds.max.x = Math.max(bounds.max.x, pos.x);
        bounds.max.y = Math.max(bounds.max.y, pos.y);
        bounds.max.z = Math.max(bounds.max.z, pos.z);

        if (i > 0) {
          const prev = pathData[i - 1].position;
          const dist = Math.sqrt(
            Math.pow(pos.x - prev.x, 2) +
            Math.pow(pos.y - prev.y, 2) +
            Math.pow(pos.z - prev.z, 2)
          );
          totalLength += dist;
        }
      }

      setStatistics({
        points: pathData.length,
        length: totalLength,
        duration: trajectory.duration / 1000, // Convert to seconds
        bounds: bounds
      });

      // Draw the path
      drawTrajectoryPath(pathData);

      // Focus camera on path
      focusOnTrajectory(bounds);
    }
  };

  const drawTrajectoryPath = (pathData) => {
    if (!sceneRef.current || pathData.length < 2) return;

    // Remove old path
    if (pathLineRef.current) {
      sceneRef.current.remove(pathLineRef.current);
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.material.dispose();
    }

    // Create path points
    const points = pathData.map(p => new THREE.Vector3(p.position.x, p.position.y, p.position.z));

    // Create curve for smooth path
    const curve = new THREE.CatmullRomCurve3(points);
    const pathPoints = curve.getPoints(points.length * 10);

    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);

    // Create gradient colors
    const colors = [];
    for (let i = 0; i < pathPoints.length; i++) {
      const t = i / (pathPoints.length - 1);
      colors.push(1 - t, t, 0.5); // Red to green gradient
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

    // Add start and end markers
    const startGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const startMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const startMarker = new THREE.Mesh(startGeometry, startMaterial);
    startMarker.position.copy(points[0]);
    sceneRef.current.add(startMarker);

    const endGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const endMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const endMarker = new THREE.Mesh(endGeometry, endMaterial);
    endMarker.position.copy(points[points.length - 1]);
    sceneRef.current.add(endMarker);

    // Add current position marker
    const currentGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const currentMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff9900,
      emissive: 0xff9900,
      emissiveIntensity: 0.5
    });
    const currentMarker = new THREE.Mesh(currentGeometry, currentMaterial);
    sceneRef.current.add(currentMarker);
    currentMarkerRef.current = currentMarker;
  };

  const updateCurrentMarker = (position) => {
    if (currentMarkerRef.current) {
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

    const distance = size * 2;
    cameraRef.current.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const cleanupScene = () => {
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (containerRef.current && rendererRef.current.domElement) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    }
  };

  const handleNext = () => {
    if (selectedTrajectory) {
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
      path: trajectoryData.endEffectorPath,
      statistics: statistics,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory_${selectedTrajectory}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="trajectory-modal-overlay">
      <div className="trajectory-modal">
        <div className="trajectory-modal-header">
          <h2>Trajectory 3D Visualization</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="trajectory-modal-steps">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Select Trajectory</span>
          </div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">3D Graph</span>
          </div>
        </div>

        <div className="trajectory-modal-content">
          {step === 1 ? (
            <div className="trajectory-selection">
              <h3>Select Trajectory to Visualize</h3>
              
              <div className="selection-option">
                <input
                  type="radio"
                  id="recorded"
                  name="source"
                  checked={!isLive}
                  onChange={() => setIsLive(false)}
                />
                <label htmlFor="recorded">
                  <div className="option-content">
                    <strong>Recorded Trajectory</strong>
                    <p>View a previously recorded trajectory</p>
                  </div>
                </label>
              </div>

              {!isLive && (
                <div className="trajectory-dropdown">
                  <select
                    value={selectedTrajectory}
                    onChange={(e) => setSelectedTrajectory(e.target.value)}
                  >
                    {trajectories.length === 0 ? (
                      <option value="">No trajectories available</option>
                    ) : (
                      trajectories.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="selection-option">
                <input
                  type="radio"
                  id="live"
                  name="source"
                  checked={isLive}
                  onChange={() => setIsLive(true)}
                />
                <label htmlFor="live">
                  <div className="option-content">
                    <strong>Live Tracking</strong>
                    <p>View real-time TCP movement</p>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="trajectory-display">
              <div className="display-header">
                <h3>{isLive ? 'Live TCP Tracking' : selectedTrajectory}</h3>
                <div className="display-controls">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isLive}
                      onChange={(e) => setIsLive(e.target.checked)}
                    />
                    Live Update
                  </label>
                  <button onClick={exportData} className="export-button">
                    Export Data
                  </button>
                </div>
              </div>

              {!isLive && (
                <div className="trajectory-stats">
                  <div className="stat-item">
                    <label>Points:</label>
                    <span>{statistics.points}</span>
                  </div>
                  <div className="stat-item">
                    <label>Length:</label>
                    <span>{statistics.length.toFixed(3)} m</span>
                  </div>
                  <div className="stat-item">
                    <label>Duration:</label>
                    <span>{statistics.duration.toFixed(1)} s</span>
                  </div>
                  <div className="stat-item">
                    <label>Current:</label>
                    <span>
                      X: {currentPosition.x.toFixed(3)}, 
                      Y: {currentPosition.y.toFixed(3)}, 
                      Z: {currentPosition.z.toFixed(3)}
                    </span>
                  </div>
                </div>
              )}

              <div ref={containerRef} className="graph-container"></div>

              <div className="bounds-info">
                <strong>Bounds:</strong>
                <span>
                  X: [{statistics.bounds.min.x.toFixed(3)}, {statistics.bounds.max.x.toFixed(3)}] 
                  Y: [{statistics.bounds.min.y.toFixed(3)}, {statistics.bounds.max.y.toFixed(3)}] 
                  Z: [{statistics.bounds.min.z.toFixed(3)}, {statistics.bounds.max.z.toFixed(3)}]
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="trajectory-modal-footer">
          {step === 2 && (
            <button onClick={handleBack} className="back-button">
              Back
            </button>
          )}
          {step === 1 && (
            <button 
              onClick={handleNext} 
              className="next-button"
              disabled={!isLive && (!selectedTrajectory || trajectories.length === 0)}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTrajectoryGraph;