// components/controls/RecordMap/ExternalTrajectoryGraph.jsx
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import { createStandardGrids } from '../../../utils/threeHelpers';
import './ExternalTrajectoryGraph.css';

const ExternalTrajectoryGraph = ({ trajectoryName, onClose }) => {
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
  const [viewMode, setViewMode] = useState('perspective');
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [pathColor, setPathColor] = useState('#ff0000');
  const [statistics, setStatistics] = useState({
    length: 0,
    points: 0,
    boundingBox: { min: {x: 0, y: 0, z: 0}, max: {x: 0, y: 0, z: 0} }
  });
  
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
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);
    
    // Add coordinate axes
    const { grid, axes } = createStandardGrids(scene, { gridSize: 3, gridDivisions: 30, addAxes: true, axesSize: 1.5 });
    
    // Add grid
    addGrid();
    
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
      
      // Remove tube if it exists
      if (pathRef.current.userData.tube) {
        sceneRef.current.remove(pathRef.current.userData.tube);
      }
      
      // Remove position markers if they exist
      if (pathRef.current.userData.markers) {
        sceneRef.current.remove(pathRef.current.userData.markers);
      }
      
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
    
    // Create path container
    const pathContainer = new THREE.Group();
    pathContainer.name = "trajectoryPath";
    sceneRef.current.add(pathContainer);
    pathRef.current = pathContainer;
    
    // Create a line for the path
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const pathMaterial = new THREE.LineBasicMaterial({ 
      color: new THREE.Color(pathColor),
      linewidth: 3
    });
    
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathContainer.add(pathLine);
    
    // Create a tube geometry for better visualization
    if (points.length > 1) {
      try {
        // Create a smooth curve through the points
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, 
          Math.min(128, points.length * 10), // More segments for smoother curve
          0.01, // Thicker tube for better visibility
          10, // More radial segments for smoother tube
          false // Not closed
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
        pathContainer.add(tube);
        pathContainer.userData.tube = tube;
        
        // Calculate path length
        let pathLength = 0;
        for (let i = 1; i < points.length; i++) {
          pathLength += points[i].distanceTo(points[i-1]);
        }
        
        // Calculate bounding box
        const bbox = new THREE.Box3().setFromPoints(points);
        const min = bbox.min;
        const max = bbox.max;
        
        // Update statistics
        setStatistics({
          length: pathLength.toFixed(3),
          points: points.length,
          boundingBox: {
            min: {x: min.x.toFixed(3), y: min.y.toFixed(3), z: min.z.toFixed(3)},
            max: {x: max.x.toFixed(3), y: max.y.toFixed(3), z: max.z.toFixed(3)}
          }
        });
        
      } catch (error) {
        console.warn("Could not create tube for path", error);
      }
    }
    
    // Add markers for reference
    const markersGroup = addPathPoints(points);
    pathContainer.add(markersGroup);
    pathContainer.userData.markers = markersGroup;
    
    // Focus camera on path
    focusOnPath(points);
    
    setHasData(true);
  };
  
  /**
   * Add markers at path points
   * @param {THREE.Vector3[]} points - Array of path points
   * @returns {THREE.Group} Group containing markers
   */
  const addPathPoints = (points) => {
    const group = new THREE.Group();
    
    // Add start and end markers
    if (points.length > 0) {
      // Start marker (green)
      const startGeometry = new THREE.SphereGeometry(0.03, 16, 16);
      const startMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const startMarker = new THREE.Mesh(startGeometry, startMaterial);
      startMarker.position.copy(points[0]);
      group.add(startMarker);
      
      // End marker (red)
      if (points.length > 1) {
        const endGeometry = new THREE.SphereGeometry(0.03, 16, 16);
        const endMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const endMarker = new THREE.Mesh(endGeometry, endMaterial);
        endMarker.position.copy(points[points.length - 1]);
        group.add(endMarker);
      }
      
      // Add small markers for intermediate points (every 10th point)
      for (let i = 1; i < points.length - 1; i += 10) {
        const geometry = new THREE.SphereGeometry(0.015, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x0088ff,
          transparent: true,
          opacity: 0.7
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(points[i]);
        group.add(marker);
      }
    }
    
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
    
    // Ensure minimum distance
    cameraDistance = Math.max(cameraDistance, 1.5);
    
    // Set camera position based on view mode
    switch (viewMode) {
      case 'top':
        cameraRef.current.position.set(center.x, center.y + cameraDistance, center.z);
        break;
      case 'front':
        cameraRef.current.position.set(center.x, center.y, center.z + cameraDistance);
        break;
      case 'side':
        cameraRef.current.position.set(center.x + cameraDistance, center.y, center.z);
        break;
      case 'perspective':
      default:
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
   * Handle view mode change
   * @param {string} mode - New view mode
   */
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    
    // Re-focus on path with new view mode
    if (pathRef.current) {
      const geometry = pathRef.current.children.find(child => child instanceof THREE.Line)?.geometry;
      if (geometry && geometry.attributes.position) {
        const points = [];
        const positions = geometry.attributes.position;
        
        for (let i = 0; i < positions.count; i++) {
          points.push(new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          ));
        }
        
        focusOnPath(points);
      }
    }
  };
  
  /**
   * Toggle grid visibility
   */
  const toggleGrid = () => {
    const newShowGrid = !showGrid;
    setShowGrid(newShowGrid);
    
    // Update grid visibility
    sceneRef.current.children.forEach(child => {
      if (child instanceof THREE.GridHelper) {
        child.visible = newShowGrid;
      }
    });
  };
  
  /**
   * Toggle axes visibility
   */
  const toggleAxes = () => {
    const newShowAxes = !showAxes;
    setShowAxes(newShowAxes);
    
    if (axesRef.current) {
      axesRef.current.visible = newShowAxes;
    }
    
    // Also toggle axis labels
    sceneRef.current.children.forEach(child => {
      if (child instanceof THREE.Sprite) {
        child.visible = newShowAxes;
      }
    });
  };
  
  /**
   * Change path color
   * @param {string} color - New path color
   */
  const changePathColor = (color) => {
    setPathColor(color);
    
    // Update path color
    if (pathRef.current) {
      // Update line color
      pathRef.current.children.forEach(child => {
        if (child instanceof THREE.Line) {
          child.material.color.set(color);
        }
        
        // Update tube color
        if (child instanceof THREE.Mesh && child.name === "pathTube") {
          child.material.color.set(color);
          child.material.emissive.set(color);
        }
      });
    }
  };
  
  /**
   * Export image of the current view
   */
  const exportImage = () => {
    if (!rendererRef.current) return;
    
    // Render the scene
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    
    // Get the image data
    const imgData = rendererRef.current.domElement.toDataURL('image/png');
    
    // Create a download link
    const link = document.createElement('a');
    link.href = imgData;
    link.download = `${trajectoryName}_path.png`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(imgData);
    }, 0);
  };

  return (
    <div className="external-graph-overlay">
      <div className="external-graph-container">
        <div className="external-graph-header">
          <h2>Trajectory Path: {trajectoryName}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="external-graph-content">
          <div className="external-graph-controls">
            <div className="control-group">
              <label>View:</label>
              <select 
                value={viewMode}
                onChange={(e) => handleViewModeChange(e.target.value)}
              >
                <option value="perspective">3D View</option>
                <option value="top">Top View (XZ)</option>
                <option value="front">Front View (XY)</option>
                <option value="side">Side View (YZ)</option>
              </select>
            </div>
            
            <div className="control-group">
              <button onClick={toggleGrid}>
                {showGrid ? 'Hide Grid' : 'Show Grid'}
              </button>
              <button onClick={toggleAxes}>
                {showAxes ? 'Hide Axes' : 'Show Axes'}
              </button>
            </div>
            
            <div className="control-group">
              <label>Path Color:</label>
              <input
                type="color"
                value={pathColor}
                onChange={(e) => changePathColor(e.target.value)}
              />
            </div>
            
            <div className="control-group">
              <button onClick={exportImage}>
                Export Image
              </button>
            </div>
          </div>
          
          <div className="external-graph-view">
            {!isInitialized ? (
              <div className="loading-indicator">Initializing 3D view...</div>
            ) : !hasData ? (
              <div className="no-data-message">
                No path data available for "{trajectoryName}"
              </div>
            ) : (
              <div ref={containerRef} className="graph-container"></div>
            )}
          </div>
          
          <div className="external-graph-stats">
            <h3>Path Statistics</h3>
            <div className="stats-content">
              <div><strong>Path Length:</strong> {statistics.length} units</div>
              <div><strong>Points:</strong> {statistics.points}</div>
              <div><strong>Bounding Box:</strong></div>
              <div className="stats-nested">
                <div>Min: X: {statistics.boundingBox.min.x}, Y: {statistics.boundingBox.min.y}, Z: {statistics.boundingBox.min.z}</div>
                <div>Max: X: {statistics.boundingBox.max.x}, Y: {statistics.boundingBox.max.y}, Z: {statistics.boundingBox.max.z}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExternalTrajectoryGraph;