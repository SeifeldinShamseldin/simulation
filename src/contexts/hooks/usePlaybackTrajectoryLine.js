import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewer } from '../ViewerContext';
import { useTrajectory } from './useTrajectory';
import EventBus from '../../utils/EventBus';

export const usePlaybackTrajectoryLine = (robotId = null) => {
  const { isViewerReady, getScene } = useViewer();
  const { loadTrajectory, createTrajectoryVisualization, getRobotInfo } = useTrajectory(robotId);
  const lineRef = useRef(null);
  const waypointsRef = useRef([]);
  const orientationFramesRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const activePlaybackRef = useRef(null);
  const storedTrajectoryRef = useRef(null);
  const activeRobotIdRef = useRef(null);

  useEffect(() => {
    if (!isViewerReady) return;

    const scene = getScene();
    if (!scene) return;

    // Listen for playback start and load full trajectory
    const handlePlaybackStarted = async (data) => {
      const { robotId, trajectoryName, hadPreAnimation, frameCount } = data;
      console.log('[usePlaybackTrajectoryLine] Playback started - Full event data:', data);
      console.log('[usePlaybackTrajectoryLine] Extracted values:', { robotId, trajectoryName, hadPreAnimation, frameCount });
      
      // Set active robot ID and playback ref
      const prevActiveRobotId = activeRobotIdRef.current;
      if (prevActiveRobotId && prevActiveRobotId !== robotId) {
        cleanup(prevActiveRobotId);
      } else if (!prevActiveRobotId && getScene()) {
        const scene = getScene();
        const allVisObjects = scene.children.filter(child =>
          child.name.startsWith('playback_trajectory_line_') ||
          child.name.startsWith('waypoint_sphere_') ||
          child.name.startsWith('orientation_frame_') ||
          child.name.startsWith('trajectory_marker_')
        );
        allVisObjects.forEach(obj => {
          scene.remove(obj);
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
          if (obj.isGroup) {
            obj.children.forEach(child => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) child.material.dispose();
            });
          }
        });
      }
      activeRobotIdRef.current = robotId;
      activePlaybackRef.current = { robotId, trajectoryName };
      
      // Try to load trajectory data for visualization
      if (robotId && trajectoryName) {
        try {
          // Get proper manufacturer and model from robot info
          const { manufacturer, model } = getRobotInfo(robotId);
          
          console.log('[usePlaybackTrajectoryLine] Loading trajectory:', {
            robotId,
            trajectoryName,
            manufacturer,
            model
          });
          
          // Try to load trajectory data
          const trajectory = await loadTrajectory(manufacturer, model, trajectoryName);
          if (trajectory) {
            handleTrajectoryDataAvailable({ trajectory, robotId });
          } else {
            console.warn('[usePlaybackTrajectoryLine] Failed to load trajectory data');
          }
        } catch (error) {
          console.error('[usePlaybackTrajectoryLine] Error loading trajectory for visualization:', error);
        }
      } else {
        console.warn('[usePlaybackTrajectoryLine] Missing robotId or trajectoryName:', { robotId, trajectoryName });
      }
    };

    // Listen for trajectory data when it's loaded for playback
    const handleTrajectoryDataAvailable = async (data) => {
      const { trajectory, robotId } = data;

      if (activePlaybackRef.current?.robotId !== robotId) {
        return;
      }

      if (!trajectory || !trajectory.endEffectorPath || trajectory.endEffectorPath.length < 2) {
        return;
      }

      // Store trajectory for later use
      storedTrajectoryRef.current = trajectory;

      // Use the trajectory hook's visualization method
      const visualization = createTrajectoryVisualization(trajectory.endEffectorPath);
      
      if (!visualization || !visualization.smoothPoints) {
        return;
      }

      const scene = getScene();
      if (!scene) {
        return;
      }

      // Create all visualization elements synchronously
      createFullVisualization(trajectory, visualization, scene, robotId);
    };
    
    // Separate function to create all visualization elements
    const createFullVisualization = (trajectory, visualization, scene, robotId) => {
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
      line.name = `playback_trajectory_line_${robotId}`;
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
          sphere.name = `waypoint_sphere_${robotId}_${index}`; // Assign unique name
          sphere.position.set(waypoint.position.x, waypoint.position.y, waypoint.position.z);
          scene.add(sphere);
          waypointsRef.current.push(sphere);
        });
      }

      // Create orientation frames immediately
      createOrientationFrames(trajectory, scene, robotId);

      // Create current position marker
      const markerGeometry = new THREE.SphereGeometry(0.025, 16, 16);
      const markerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.name = `trajectory_marker_${robotId}`;
      if (points.length > 0) {
        marker.position.copy(points[0]);
      }
      scene.add(marker);
      currentMarkerRef.current = marker;

      console.log('[usePlaybackTrajectoryLine] Full visualization created');
    };

    // Function to create orientation frames
    const createOrientationFrames = (trajectory, scene, robotId) => {
      if (!scene) {
        return;
      }
      
      const endEffectorPath = trajectory.endEffectorPath;
      
      // Enhanced validation
      if (!endEffectorPath || !Array.isArray(endEffectorPath) || endEffectorPath.length < 2) {
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
          continue;
        }

        // Create a group for this frame
        const frameGroup = new THREE.Group();
        frameGroup.name = `orientation_frame_${robotId}_${i}`;
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

      // Force a render update
      if (scene.parent && scene.parent.type === 'Scene') {
        scene.updateMatrixWorld(true);
      }
    };

    // Update marker position during playback
    const handleEndEffectorUpdate = (data) => {
      if (!currentMarkerRef.current || !data.endEffectorPoint) return;
      
      const { x, y, z } = data.endEffectorPoint;
      currentMarkerRef.current.position.set(x, y, z);
    };

    // Handle playback stop
    const handlePlaybackStopped = () => {
      if (activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      } else {
        // Fallback cleanup if for some reason activeRobotIdRef is null
        const scene = getScene();
        if (scene) {
          const allVisObjects = scene.children.filter(child =>
            child.name.startsWith('playback_trajectory_line_') ||
            child.name.startsWith('waypoint_sphere_') ||
            child.name.startsWith('orientation_frame_') ||
            child.name.startsWith('trajectory_marker_')
          );
          allVisObjects.forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (obj.isGroup) {
              obj.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
              });
            }
          });
        }
      }
    };

    // Clean up function
    const cleanup = (targetRobotId) => {
      const scene = getScene();
      if (!scene) {
        return;
      }

      // Remove existing visualization elements for the targetRobotId
      const objectsToRemove = [];
      scene.children.forEach(child => {
        if (child.name.startsWith(`playback_trajectory_line_${targetRobotId}`) ||
            child.name.startsWith(`waypoint_sphere_${targetRobotId}`) ||
            child.name.startsWith(`orientation_frame_${targetRobotId}`) ||
            child.name.startsWith(`trajectory_marker_${targetRobotId}`)) {
          objectsToRemove.push(child);
        }
      });

      objectsToRemove.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        // For groups, dispose children's geometries and materials
        if (obj.isGroup) {
          obj.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      });

      // Clear refs that are no longer managing all objects but specifically for last one
      if (lineRef.current?.name?.startsWith(`playback_trajectory_line_${targetRobotId}`)) {
        lineRef.current = null;
      }
      waypointsRef.current = waypointsRef.current.filter(wp => !wp.name.startsWith(`waypoint_sphere_${targetRobotId}`));
      orientationFramesRef.current = orientationFramesRef.current.filter(of => !of.name.startsWith(`orientation_frame_${targetRobotId}`));
      if (currentMarkerRef.current?.name?.startsWith(`trajectory_marker_${targetRobotId}`)) {
        currentMarkerRef.current = null;
      }
      
      // Clear references only if the robot that was cleaned up is the active one
      if (activeRobotIdRef.current === targetRobotId) {
        activePlaybackRef.current = null;
        storedTrajectoryRef.current = null;
        activeRobotIdRef.current = null;
      }
    };

    // Subscribe to events from the optimized useTrajectory hook
    const unsubscribes = [
      EventBus.on('trajectory:playback-started', handlePlaybackStarted),
      EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped)
    ];

    return () => {
      unsubscribes.forEach(unsub => unsub());
      // Clean up on unmount for the last active robot
      if (activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      }
    };
  }, [isViewerReady, getScene, loadTrajectory, createTrajectoryVisualization, getRobotInfo, robotId]);

  return null;
};