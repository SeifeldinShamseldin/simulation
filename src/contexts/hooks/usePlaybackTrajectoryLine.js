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
  const currentMarkerRef = useRef(null);
  const activePlaybackRef = useRef(null);

  useEffect(() => {
    if (!isViewerReady) return;

    const scene = getScene();
    if (!scene) return;

    // Listen for playback start and load full trajectory
    const handlePlaybackStarted = async (data) => {
      const { robotId, trajectoryName } = data;
      console.log('[usePlaybackTrajectoryLine] Playback started:', trajectoryName);
      
      // Store active playback info
      activePlaybackRef.current = { robotId, trajectoryName };
      
      // Clean up existing visualization
      cleanup();
    };

    // Listen for the trajectory data when it's loaded for playback
    const handleTrajectoryDataAvailable = async (data) => {
      const { trajectory, robotId } = data;
      
      if (!trajectory || !trajectory.endEffectorPath || trajectory.endEffectorPath.length < 2) {
        console.log('[usePlaybackTrajectoryLine] No valid trajectory data');
        return;
      }

      console.log('[usePlaybackTrajectoryLine] Creating full trajectory visualization');

      // Use the trajectory context's visualization method
      const visualization = createTrajectoryVisualization(trajectory);
      
      if (!visualization || !visualization.smoothPoints) {
        console.log('[usePlaybackTrajectoryLine] No visualization data');
        return;
      }

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

      console.log('[usePlaybackTrajectoryLine] Trajectory visualization created with', points.length, 'points');
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
      
      if (currentMarkerRef.current && scene) {
        scene.remove(currentMarkerRef.current);
        currentMarkerRef.current.geometry.dispose();
        currentMarkerRef.current.material.dispose();
        currentMarkerRef.current = null;
      }
    };

    // Handle playback stop
    const handlePlaybackStopped = () => {
      console.log('[usePlaybackTrajectoryLine] Playback stopped');
      
      // Keep visible for 2 seconds then remove
      setTimeout(() => {
        cleanup();
        activePlaybackRef.current = null;
      }, 2000);
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