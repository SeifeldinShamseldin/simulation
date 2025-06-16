import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewer } from '../ViewerContext';
import { useTrajectoryContext } from '../TrajectoryContext';
import EventBus from '../../utils/EventBus';

export const usePlaybackTrajectoryLine = () => {
  const { isViewerReady, getScene } = useViewer();
  const { loadTrajectoryFromFile, createTrajectoryVisualization } = useTrajectoryContext();
  const lineRef = useRef(null);
  const waypointsRef = useRef([]);
  const orientationFramesRef = useRef([]); // NEW: Store orientation frames
  const currentMarkerRef = useRef(null);
  const activePlaybackRef = useRef(null);
  const storedTrajectoryRef = useRef(null); // Store the full trajectory data

  useEffect(() => {
    if (!isViewerReady) return;

    const scene = getScene();
    if (!scene) return;

    // Listen for playback start and load full trajectory
    const handlePlaybackStarted = async (data) => {
      const { robotId, trajectoryName } = data;
      console.log('[usePlaybackTrajectoryLine] Playback started:', trajectoryName);
      
      // Clean up any existing visualization first
      cleanup();
      
      // Store active playback info
      activePlaybackRef.current = { robotId, trajectoryName };
    };

    // Listen for the trajectory data when it's loaded for playback
    const handleTrajectoryDataAvailable = async (data) => {
      const { trajectory, robotId } = data;
      
      if (!trajectory || !trajectory.endEffectorPath || trajectory.endEffectorPath.length < 2) {
        console.log('[usePlaybackTrajectoryLine] No valid trajectory data');
        return;
      }

      // Store trajectory for later use
      storedTrajectoryRef.current = trajectory;

      // Debug log trajectory structure
      console.log('[usePlaybackTrajectoryLine] Trajectory structure:', {
        hasEndEffectorPath: !!trajectory.endEffectorPath,
        pathLength: trajectory.endEffectorPath?.length,
        firstPoint: trajectory.endEffectorPath?.[0],
        hasOrientation: trajectory.endEffectorPath?.[0]?.orientation
      });

      console.log('[usePlaybackTrajectoryLine] Creating full trajectory visualization');

      // Use the trajectory context's visualization method
      const visualization = createTrajectoryVisualization(trajectory);
      
      if (!visualization || !visualization.smoothPoints) {
        console.log('[usePlaybackTrajectoryLine] No visualization data');
        return;
      }

      // Create all visualization elements synchronously
      createFullVisualization(trajectory, visualization, scene);
    };
    
    // Separate function to create all visualization elements
    const createFullVisualization = (trajectory, visualization, scene) => {
      // Create the full trajectory line with gradient colors
      const points = visualization.smoothPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      
      // Create gradient colors from visualization data
      const colors = [];
      visualization.colors.forEach(color => {
        colors.push(color.r, color.g, color.b);
      });

      // Create line geometry
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      // Create line material
      const material = new THREE.LineBasicMaterial({ 
        vertexColors: true,
        linewidth: 3,
        opacity: 0.9,
        transparent: true
      });

      // Create and add line to scene
      const line = new THREE.Line(geometry, material);
      line.name = 'playback_trajectory_line';
      scene.add(line);
      lineRef.current = line;

      // Create waypoint spheres
      if (visualization.waypoints) {
        visualization.waypoints.forEach((waypoint, index) => {
          const sphereGeometry = new THREE.SphereGeometry(0.01, 8, 8);
          const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: new THREE.Color().setHSL(index / visualization.waypoints.length, 1, 0.5)
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.set(waypoint.position.x, waypoint.position.y, waypoint.position.z);
          scene.add(sphere);
          waypointsRef.current.push(sphere);
        });
      }

      // Create orientation frames immediately
      createOrientationFrames(trajectory, scene);

      // Create current position marker
      const markerGeometry = new THREE.SphereGeometry(0.025, 16, 16);
      const markerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.name = 'trajectory_marker';
      if (points.length > 0) {
        marker.position.copy(points[0]);
      }
      scene.add(marker);
      currentMarkerRef.current = marker;

      console.log('[usePlaybackTrajectoryLine] Full visualization created');
    };

    // NEW: Function to create orientation frames
    const createOrientationFrames = (trajectory, scene) => {
      if (!scene) {
        console.error('[usePlaybackTrajectoryLine] No scene provided for orientation frames');
        return;
      }
      
      const endEffectorPath = trajectory.endEffectorPath;
      
      // Enhanced validation
      if (!endEffectorPath || !Array.isArray(endEffectorPath) || endEffectorPath.length < 2) {
        console.warn('[usePlaybackTrajectoryLine] No valid endEffectorPath for orientation frames');
        return;
      }

      // Check if we have orientation data
      const hasOrientationData = endEffectorPath.some(point => 
        point && point.orientation && 
        typeof point.orientation.x === 'number' &&
        typeof point.orientation.y === 'number' &&
        typeof point.orientation.z === 'number' &&
        typeof point.orientation.w === 'number'
      );

      console.log('[usePlaybackTrajectoryLine] Orientation data available:', hasOrientationData);

      // Calculate frame interval (show frames every N points)
      const totalPoints = endEffectorPath.length;
      const desiredFrameCount = 20; // Adjust this for more/fewer frames
      const frameInterval = Math.max(1, Math.floor(totalPoints / desiredFrameCount));

      // Clear existing frames
      orientationFramesRef.current.forEach(frameGroup => {
        scene.remove(frameGroup);
        frameGroup.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      });
      orientationFramesRef.current = [];

      let framesCreated = 0;

      // Helper function to calculate orientation from trajectory direction
      const calculateOrientationFromPath = (index) => {
        if (index >= totalPoints - 1) {
          // Use previous direction for last point
          return calculateOrientationFromPath(index - 1);
        }
        
        const current = endEffectorPath[index].position;
        const next = endEffectorPath[index + 1].position;
        
        // Calculate direction vector
        const direction = new THREE.Vector3(
          next.x - current.x,
          next.y - current.y,
          next.z - current.z
        );
        direction.normalize();
        
        // Create rotation matrix to align Z-axis with direction
        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(direction.y) > 0.999) {
          // If direction is nearly vertical, use X as up
          up.set(1, 0, 0);
        }
        
        const matrix = new THREE.Matrix4();
        matrix.lookAt(
          new THREE.Vector3(0, 0, 0),
          direction,
          up
        );
        
        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(matrix);
        
        return quaternion;
      };

      // Create frames at intervals
      for (let i = 0; i < totalPoints; i += frameInterval) {
        const pathPoint = endEffectorPath[i];
        
        // Validate position data
        if (!pathPoint || !pathPoint.position ||
            typeof pathPoint.position.x !== 'number' ||
            typeof pathPoint.position.y !== 'number' ||
            typeof pathPoint.position.z !== 'number') {
          console.warn(`[usePlaybackTrajectoryLine] Invalid position data at index ${i}`);
          continue;
        }

        // Create a group for this frame
        const frameGroup = new THREE.Group();
        frameGroup.name = `orientation_frame_${i}`;
        frameGroup.position.set(
          pathPoint.position.x,
          pathPoint.position.y,
          pathPoint.position.z
        );

        // Get or calculate orientation
        let quaternion;
        if (hasOrientationData && pathPoint.orientation &&
            typeof pathPoint.orientation.x === 'number' &&
            typeof pathPoint.orientation.y === 'number' &&
            typeof pathPoint.orientation.z === 'number' &&
            typeof pathPoint.orientation.w === 'number') {
          // Use provided orientation
          quaternion = new THREE.Quaternion(
            pathPoint.orientation.x,
            pathPoint.orientation.y,
            pathPoint.orientation.z,
            pathPoint.orientation.w
          );
          quaternion.normalize();
        } else {
          // Calculate orientation from path direction
          quaternion = calculateOrientationFromPath(i);
        }
        
        frameGroup.quaternion.copy(quaternion);

        // Create coordinate axes
        const axisLength = 0.05; // Adjust size as needed
        const axisThickness = 1.5; // Line thickness

        // X-axis (Red)
        const xDir = new THREE.Vector3(1, 0, 0);
        const xOrigin = new THREE.Vector3(0, 0, 0);
        const xArrow = new THREE.ArrowHelper(xDir, xOrigin, axisLength, 0xff0000, axisLength * 0.3, axisLength * 0.2);
        xArrow.line.material.linewidth = axisThickness;
        frameGroup.add(xArrow);

        // Y-axis (Green)
        const yDir = new THREE.Vector3(0, 1, 0);
        const yArrow = new THREE.ArrowHelper(yDir, xOrigin, axisLength, 0x00ff00, axisLength * 0.3, axisLength * 0.2);
        yArrow.line.material.linewidth = axisThickness;
        frameGroup.add(yArrow);

        // Z-axis (Blue)
        const zDir = new THREE.Vector3(0, 0, 1);
        const zArrow = new THREE.ArrowHelper(zDir, xOrigin, axisLength, 0x0000ff, axisLength * 0.3, axisLength * 0.2);
        zArrow.line.material.linewidth = axisThickness;
        frameGroup.add(zArrow);

        // Add frame to scene
        scene.add(frameGroup);
        orientationFramesRef.current.push(frameGroup);
        framesCreated++;
      }

      console.log(`[usePlaybackTrajectoryLine] Created ${framesCreated} orientation frames`);
      
      // Force a render update
      if (scene.parent && scene.parent.type === 'Scene') {
        scene.updateMatrixWorld(true);
      }
    };

    // Alternative: Listen for available trajectories and load when playback starts
    let cachedTrajectoryInfo = null;
    
    const handleTrajectoriesAvailable = (data) => {
      if (data.trajectories) {
        cachedTrajectoryInfo = data.trajectories;
      }
    };

    const enhancedPlaybackHandler = async (data) => {
      const { robotId, trajectoryName } = data;
      
      // Try to find trajectory info from cached data
      if (cachedTrajectoryInfo) {
        const trajectoryInfo = cachedTrajectoryInfo.find(t => t.name === trajectoryName);
        if (trajectoryInfo) {
          try {
            // Load the full trajectory data
            const trajectory = await loadTrajectoryFromFile(
              trajectoryInfo.manufacturer,
              trajectoryInfo.model,
              trajectoryInfo.name
            );
            
            if (trajectory) {
              handleTrajectoryDataAvailable({ trajectory, robotId });
            }
          } catch (error) {
            console.error('[usePlaybackTrajectoryLine] Error loading trajectory:', error);
          }
        }
      }
    };

    // Update marker position during playback
    const handleEndEffectorUpdate = (data) => {
      if (!currentMarkerRef.current || !data.endEffectorPoint) return;
      
      const { x, y, z } = data.endEffectorPoint;
      currentMarkerRef.current.position.set(x, y, z);

      // NEW: Optionally update current frame orientation
      if (data.endEffectorOrientation && orientationFramesRef.current.length > 0) {
        // You could add a special "current" orientation frame that follows the marker
        // This is optional - remove if you only want static frames
      }
    };

    // Clean up function
    const cleanup = () => {
      if (lineRef.current && scene) {
        scene.remove(lineRef.current);
        lineRef.current.geometry.dispose();
        lineRef.current.material.dispose();
        lineRef.current = null;
      }
      
      waypointsRef.current.forEach(waypoint => {
        scene.remove(waypoint);
        waypoint.geometry.dispose();
        waypoint.material.dispose();
      });
      waypointsRef.current = [];

      // NEW: Clean up orientation frames
      orientationFramesRef.current.forEach(frameGroup => {
        scene.remove(frameGroup);
        frameGroup.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      });
      orientationFramesRef.current = [];
      
      if (currentMarkerRef.current && scene) {
        scene.remove(currentMarkerRef.current);
        currentMarkerRef.current.geometry.dispose();
        currentMarkerRef.current.material.dispose();
        currentMarkerRef.current = null;
      }
      
      // Clear references
      activePlaybackRef.current = null;
      storedTrajectoryRef.current = null;
    };

    // Handle playback stop
    const handlePlaybackStopped = () => {
      console.log('[usePlaybackTrajectoryLine] Playback stopped - cleaning up immediately');
      cleanup();
    };

    // Subscribe to events
    const unsubscribes = [
      EventBus.on('trajectory:playback-started', enhancedPlaybackHandler),
      EventBus.on('trajectory:loaded-for-playback', handleTrajectoryDataAvailable),
      EventBus.on('trajectory:available-trajectories', handleTrajectoriesAvailable),
      EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped)
    ];

    return () => {
      unsubscribes.forEach(unsub => unsub());
      cleanup();
    };
  }, [isViewerReady, getScene, loadTrajectoryFromFile, createTrajectoryVisualization]);

  return null;
};