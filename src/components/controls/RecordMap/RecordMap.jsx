// components/controls/RecordMap/RecordMap.jsx
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import { createStandardGrids } from '../../../utils/threeHelpers';

/**
 * Component for visualizing end effector trajectories in 3D
 */
const RecordMap = ({ trajectoryName }) => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pathRef = useRef(null);
  const axesRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [viewMode, setViewMode] = useState('perspective'); // perspective, top, side, front
  const [showGrid, setShowGrid] = useState(true);
  const [pathColor, setPathColor] = useState('#ff0000');
  const [showExternalGraph, setShowExternalGraph] = useState(false);
  
  // Initialize 3D scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initialize scene
    initScene();
    
    // Clean up on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, []);
  
  // Handle trajectory changes
  useEffect(() => {
    if (!isInitialized || !trajectoryName) return;
    
    // Load trajectory data
    loadTrajectoryPath(trajectoryName);
  }, [isInitialized, trajectoryName]);
  
  // Handle playback updates
  useEffect(() => {
    const handlePlaybackUpdate = (info) => {
      if (!isInitialized || info.trajectoryName !== trajectoryName) return;
      
      // Highlight current position
      updateCurrentPosition(info.endEffectorPosition);
    };
    
    trajectoryAPI.registerPlaybackUpdateCallback(handlePlaybackUpdate);
    
    return () => {
      // Clean up callback
      trajectoryAPI.registerPlaybackUpdateCallback(null);
    };
  }, [isInitialized, trajectoryName]);
  
  /**
   * Initialize the 3D scene
   */
  const initScene = () => {
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      45, 
      containerRef.current.clientWidth / containerRef.current.clientHeight, 
      0.1, 
      1000
    );
    camera.position.set(2, 2, 2);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controlsRef.current = controls;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);
    
    // Use utility for grid and axes
    const { grid, axes } = createStandardGrids(scene, { gridSize: 2, gridDivisions: 20, addAxes: true, axesSize: 1 });
    
    // Start animation loop
    animate();
    
    // Handle resize
    window.addEventListener('resize', handleResize);
    
    setIsInitialized(true);
  };
  
  /**
   * Animation loop
   */
  const animate = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // Update controls
    controlsRef.current.update();
    
    // Render scene
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    
    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animate);
  };
  
  /**
   * Handle window resize
   */
  const handleResize = () => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Update camera aspect ratio
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    
    // Update renderer size
    rendererRef.current.setSize(width, height);
  };
  
  /**
   * Load trajectory path data
   * @param {string} name - Name of the trajectory
   */
  const loadTrajectoryPath = (name) => {
    // Clear existing path
    if (pathRef.current) {
      sceneRef.current.remove(pathRef.current);
      pathRef.current = null;
    }
    
    // Get trajectory data
    const pathData = trajectoryAPI.getEndEffectorPath(name);
    if (!pathData || pathData.length === 0) {
      setHasData(false);
      return;
    }
    
    // Extract position points
    const points = pathData.map(point => 
      new THREE.Vector3(point.position.x, point.position.y, point.position.z)
    );
    
    // Create a thicker line for better visibility
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const pathMaterial = new THREE.LineBasicMaterial({ 
      color: new THREE.Color(pathColor),
      linewidth: 3 // Thicker line (note: this has limited effect in WebGL)
    });
    
    // Create a line to represent the path
    const path = new THREE.Line(pathGeometry, pathMaterial);
    sceneRef.current.add(path);
    pathRef.current = path;
    
    // For better visibility, also add a tube geometry around the line
    if (points.length > 1) {
      try {
        // Create a smooth curve through the points
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, 
          Math.min(64, points.length * 8), // Segments - more for smoother curves
          0.005, // Radius - small but visible tube
          8, // Radial segments
          false // Closed
        );
        
        // Create tube mesh
        const tubeMaterial = new THREE.MeshLambertMaterial({
          color: new THREE.Color(pathColor),
          transparent: true,
          opacity: 0.7,
          emissive: new THREE.Color(pathColor),
          emissiveIntensity: 0.3
        });
        
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.name = "pathTube";
        sceneRef.current.add(tube);
        
        // Store reference to tube for later updates
        pathRef.current.userData.tube = tube;
      } catch (error) {
        console.warn("Could not create tube for path", error);
        // Fall back to just the line if tube creation fails
      }
    }
    
    // Add point markers at start and end for clarity
    addPathPoints(points);
    
    // Focus camera on path
    focusOnPath(points);
    
    setHasData(true);
  };
  
  /**
   * Add markers at path points
   * @param {THREE.Vector3[]} points - Array of path points
   */
  const addPathPoints = (points) => {
    const group = new THREE.Group();
    
    // Create markers for each point
    points.forEach((point, index) => {
      const geometry = new THREE.SphereGeometry(0.01, 8, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: index === 0 ? 0x00ff00 : (index === points.length - 1 ? 0xff0000 : 0x0000ff),
        transparent: true,
        opacity: 0.7
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(point);
      group.add(marker);
    });
    
    sceneRef.current.add(group);
    return group;
  };
  
  /**
   * Focus camera on path
   * @param {THREE.Vector3[]} points - Array of path points
   */
  const focusOnPath = (points) => {
    if (!points || points.length === 0) return;
    
    // Create bounding box
    const box = new THREE.Box3().setFromPoints(points);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
    
    // Set camera position based on view mode
    switch (viewMode) {
      case 'top':
        cameraRef.current.position.set(center.x, center.y + cameraDistance, center.z);
        break;
      case 'side':
        cameraRef.current.position.set(center.x + cameraDistance, center.y, center.z);
        break;
      case 'front':
        cameraRef.current.position.set(center.x, center.y, center.z + cameraDistance);
        break;
      default: // perspective
        cameraRef.current.position.set(
          center.x + cameraDistance * 0.7,
          center.y + cameraDistance * 0.7,
          center.z + cameraDistance * 0.7
        );
    }
    
    // Look at center
    cameraRef.current.lookAt(center);
    cameraRef.current.updateProjectionMatrix();
    
    // Update controls target
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };
  
  /**
   * Update current position marker during playback
   * @param {Object} position - Current end effector position {x, y, z}
   */
  const updateCurrentPosition = (position) => {
    if (!position) return;
    
    // Remove existing current position marker
    const existingMarker = sceneRef.current.getObjectByName('currentPositionMarker');
    if (existingMarker) {
      sceneRef.current.remove(existingMarker);
    }
    
    // Create new marker
    const geometry = new THREE.SphereGeometry(0.02, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff9900 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, position.y, position.z);
    marker.name = 'currentPositionMarker';
    sceneRef.current.add(marker);
  };
  
  /**
   * Handle view mode change
   * @param {string} mode - New view mode
   */
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    
    // Re-focus on path with new view mode
    if (pathRef.current) {
      const points = pathRef.current.geometry.attributes.position;
      const vertices = [];
      
      for (let i = 0; i < points.count; i++) {
        vertices.push(new THREE.Vector3(
          points.getX(i),
          points.getY(i),
          points.getZ(i)
        ));
      }
      
      focusOnPath(vertices);
    }
  };
  
  /**
   * Toggle grid visibility
   */
  const toggleGrid = () => {
    const newShowGrid = !showGrid;
    setShowGrid(newShowGrid);
    
    // Update grid visibility
    const grid = sceneRef.current.children.find(child => child instanceof THREE.GridHelper);
    if (grid) {
      grid.visible = newShowGrid;
    }
  };
  
  /**
   * Change path color
   * @param {string} color - New path color
   */
  const changePathColor = (color) => {
    setPathColor(color);
    
    // Update path color
    if (pathRef.current) {
      pathRef.current.material.color.set(color);
      
      // Update tube color if it exists
      if (pathRef.current.userData.tube) {
        pathRef.current.userData.tube.material.color.set(color);
        pathRef.current.userData.tube.material.emissive.set(color);
      }
    }
  };
  
  return (
    <div className="urdf-controls-section">
      <h3>End Effector Path Visualization</h3>
      <div className="record-map">
        {!isInitialized ? (
          <div className="record-map-loading">Initializing 3D view...</div>
        ) : !hasData ? (
          <div className="record-map-empty">
            {trajectoryName ? 
              `No path data available for "${trajectoryName}"` : 
              "Select a trajectory to visualize its path"
            }
          </div>
        ) : (
          <>
            <div className="record-map-controls">
              <select 
                value={viewMode}
                onChange={(e) => handleViewModeChange(e.target.value)}
                style={{ marginRight: '5px' }}
              >
                <option value="perspective">3D View</option>
                <option value="top">Top View</option>
                <option value="side">Side View</option>
                <option value="front">Front View</option>
              </select>
              
              <button onClick={toggleGrid}>
                {showGrid ? 'Hide Grid' : 'Show Grid'}
              </button>
              
              <input
                type="color"
                value={pathColor}
                onChange={(e) => changePathColor(e.target.value)}
                style={{ width: '24px', height: '24px', marginLeft: '5px' }}
                title="Path Color"
              />
            </div>
            
            <div className="axis-legend">
              <div className="axis-label">
                <div className="axis-color" style={{ backgroundColor: '#ff0000' }}></div>
                <span>X-axis</span>
              </div>
              <div className="axis-label">
                <div className="axis-color" style={{ backgroundColor: '#00ff00' }}></div>
                <span>Y-axis</span>
              </div>
              <div className="axis-label">
                <div className="axis-color" style={{ backgroundColor: '#0000ff' }}></div>
                <span>Z-axis</span>
              </div>
            </div>
          </>
        )}
        <div 
          ref={containerRef}
          className="record-map-container"
        />
      </div>
    </div>
  );
};

export default RecordMap;