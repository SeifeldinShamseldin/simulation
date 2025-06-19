import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRobotContext } from './RobotContext';
import { useJointContext } from './JointContext';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';
import * as THREE from 'three';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // ========== STATE MANAGEMENT ==========
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [recordingName, setRecordingName] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTrajectory, setCurrentTrajectory] = useState(null);
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [error, setError] = useState(null);
  const [playbackEndEffectorPoint, setPlaybackEndEffectorPoint] = useState(null);
  const [playbackEndEffectorOrientation, setPlaybackEndEffectorOrientation] = useState(null);
  
  // Context hooks - GET ALL NEEDED DATA
  const { 
    activeRobotId: robotId, 
    isAnimating, 
    getRobot,
    getManufacturer,    // GET THIS
    categories,         // GET THIS
    workspaceRobots,    // GET THIS
    availableRobots     // GET THIS
  } = useRobotContext();
  
  const jointContext = useJointContext();
  const { isViewerReady, getScene } = useViewer();
  
  // Refs for recording and visualization
  const frameBufferRef = useRef([]);
  const frameCountRef = useRef(0);
  const recordingStartTimeRef = useRef(null);
  
  // Refs for playback line visualization
  const lineRef = useRef(null);
  const waypointsRef = useRef([]);
  const orientationFramesRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const activePlaybackRef = useRef(null);
  const storedTrajectoryRef = useRef(null);
  const activeRobotIdRef = useRef(null);

  // Debug logging helper
  const log = (message) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(message);
    }
  };

  // FIXED getRobotInfo with all fallbacks
  const getRobotInfo = useCallback((robotId) => {
    if (!robotId) {
      console.warn('[TrajectoryContext] No robotId provided to getRobotInfo');
      return { manufacturer: 'unknown', model: 'unknown' };
    }
    
    // Extract base robot ID
    const baseRobotId = robotId.split('_')[0];
    
    // Method 1: Use getManufacturer if available
    if (getManufacturer) {
      const manufacturer = getManufacturer(robotId);
      if (manufacturer && manufacturer !== 'unknown') {
        return {
          manufacturer: manufacturer,
          model: baseRobotId.toLowerCase()
        };
      }
    }
    
    // Method 2: Check categories directly (most reliable)
    if (categories && categories.length > 0) {
      for (const category of categories) {
        const robot = category.robots?.find(r => r.id === baseRobotId);
        if (robot) {
          return {
            manufacturer: category.id,
            model: baseRobotId.toLowerCase()
          };
        }
      }
    }
    
    // Method 3: Check workspace robots
    if (workspaceRobots) {
      const wsRobot = workspaceRobots.find(r => 
        r.id === robotId || r.robotId === baseRobotId
      );
      if (wsRobot?.manufacturer) {
        return {
          manufacturer: wsRobot.manufacturer,
          model: baseRobotId.toLowerCase()
        };
      }
    }
    
    // Method 4: Try getRobot
    const robot = getRobot ? getRobot(robotId) : null;
    if (robot?.manufacturer) {
      return {
        manufacturer: robot.manufacturer,
        model: robot.model || baseRobotId.toLowerCase()
      };
    }
    
    // Last resort
    console.warn(`[TrajectoryContext] Could not find manufacturer for ${robotId}`);
    return { 
      manufacturer: 'unknown', 
      model: baseRobotId.toLowerCase() 
    };
  }, [getRobot, getManufacturer, categories, workspaceRobots]);

  // ========== FILE SYSTEM OPERATIONS ==========
  const scanTrajectories = useCallback(async () => {
    try {
      setIsScanning(true);
      const response = await fetch('/api/trajectory/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories);
        log(`[TrajectoryContext] Found ${result.trajectories.length} trajectories`);
      }
    } catch (error) {
      console.error('[TrajectoryContext] Scan error:', error);
      setError('Failed to scan trajectories');
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ========== RECORDING IMPLEMENTATION ==========
  const startRecording = useCallback((trajectoryName) => {
    if (!robotId) {
      console.warn('[TrajectoryContext] Cannot start recording: no active robot');
      return false;
    }
    
    if (isRecording) {
      console.warn('[TrajectoryContext] Already recording');
      return false;
    }
    
    log(`[TrajectoryContext] Starting recording: ${trajectoryName}`);
    
    // Get initial joint values
    const initialJointValues = jointContext.getJointValues ? 
      jointContext.getJointValues(robotId) : {};
    
    // Reset recording state with initial frame
    frameBufferRef.current = [{
      timestamp: 0,
      jointValues: { ...initialJointValues }
    }];
    frameCountRef.current = 1; // Start with 1 frame
    recordingStartTimeRef.current = Date.now();
    
    setRecordingName(trajectoryName);
    setIsRecording(true);
    setFrameCount(1);
    
    // Emit event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName,
      initialJointValues
    });
    
    log(`[TrajectoryContext] Recording started with initial frame`);
    
    return true;
  }, [robotId, isRecording, jointContext]);
  
  const stopRecording = useCallback(async () => {
    if (!isRecording || !recordingName) {
      console.warn('[TrajectoryContext] Not recording');
      return null;
    }
    
    log(`[TrajectoryContext] Stopping recording: ${recordingName}`);
    setIsRecording(false);
    
    const frames = frameBufferRef.current;
    if (frames.length === 0) {
      console.warn('[TrajectoryContext] No frames recorded');
      setRecordingName(null);
      setFrameCount(0);
      return null;
    }
    
    // Create trajectory object
    const robotInfo = getRobotInfo(robotId);
    const recordingDuration = Date.now() - recordingStartTimeRef.current;
    // Log the robot info for debugging
    console.log('[TrajectoryContext] Recording robot info:', {
      robotId,
      manufacturer: robotInfo.manufacturer,
      model: robotInfo.model
    });
    const trajectory = {
      name: recordingName,
      manufacturer: robotInfo.manufacturer,
      model: robotInfo.model,
      robotId,
      frames,
      frameCount: frames.length,
      duration: recordingDuration,
      recordedAt: new Date().toISOString(),
      endEffectorPath: frames.map(frame => ({
        position: frame.endEffector?.position || { x: 0, y: 0, z: 0 },
        rotation: frame.endEffector?.rotation || { x: 0, y: 0, z: 0, w: 1 }
      }))
    };
    
    // Save to file system
    try {
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer: robotInfo.manufacturer,
          model: robotInfo.model,
          name: trajectory.name,
          data: trajectory
        })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" for ${robotInfo.manufacturer}/${robotInfo.model}`);
      
      // Refresh available trajectories
      await scanTrajectories();
    } catch (error) {
      console.error('[TrajectoryContext] Save error:', error);
      setError('Failed to save trajectory');
    }
    
    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Reset
    setRecordingName(null);
    setFrameCount(0);
    
    return trajectory;
  }, [isRecording, robotId, getRobotInfo, recordingName, scanTrajectories]);

  // ========== PLAYBACK IMPLEMENTATION ==========
  const stopPlayback = useCallback(() => {
    if (!isPlaying) return;
    
    log(`[TrajectoryContext] Stopping playback`);
    
    // Stop frame-based animation if active
    if (activePlaybackRef.current?.stop) {
      activePlaybackRef.current.stop();
      activePlaybackRef.current = null;
    }
    
    setIsPlaying(false);
    setProgress(0);
    
    const trajectoryName = currentTrajectory?.name;
    setCurrentTrajectory(null);
    setPlaybackEndEffectorPoint(null);
    setPlaybackEndEffectorOrientation(null);
    
    if (trajectoryName) {
      EventBus.emit('trajectory:playback-stopped', {
        robotId,
        trajectoryName,
        reason: 'user'
      });
    }
  }, [isPlaying, currentTrajectory, robotId]);

  const loadTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/load/${manufacturer}/${model}/${name}`);
      const result = await response.json();
      
      if (result.success) {
        return result.trajectory;
      }
      throw new Error(result.message || 'Failed to load');
    } catch (error) {
      console.error('[TrajectoryContext] Load error:', error);
      setError('Failed to load trajectory');
      return null;
    }
  }, []);

  const playTrajectory = useCallback(async (trajectoryInfo, options = {}) => {
    if (!robotId) {
      console.warn('[TrajectoryContext] Cannot play trajectory: missing robotId');
      return false;
    }

    // Handle both trajectory metadata objects and full trajectory objects
    let trajectory;
    let manufacturer, model;
    
    if (trajectoryInfo.frames && Array.isArray(trajectoryInfo.frames)) {
      // Direct trajectory object provided
      trajectory = trajectoryInfo;
      manufacturer = trajectoryInfo.manufacturer;
      model = trajectoryInfo.model;
    } else if (trajectoryInfo.manufacturer && trajectoryInfo.model && trajectoryInfo.name) {
      // Trajectory metadata provided - use the provided manufacturer and model
      manufacturer = trajectoryInfo.manufacturer;
      model = trajectoryInfo.model;
      
      trajectory = await loadTrajectory(manufacturer, model, trajectoryInfo.name);
    } else {
      console.warn('[TrajectoryContext] Trajectory info incomplete');
      return false;
    }

    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.warn('[TrajectoryContext] Cannot play trajectory: missing trajectory, frames, or empty frames');
      return false;
    }

    // === CRITICAL CHECK: Ensure active robot matches trajectory robot type ===
    const activeRobotInfo = getRobotInfo(robotId);
    if (
      activeRobotInfo.manufacturer !== manufacturer ||
      activeRobotInfo.model !== model
    ) {
      const errorMsg = `Active robot (${activeRobotInfo.manufacturer}/${activeRobotInfo.model}) does not match trajectory robot (${manufacturer}/${model}). Please select the correct robot before playing this trajectory.`;
      setError(errorMsg);
      console.warn('[TrajectoryContext] ' + errorMsg);
      return false;
    }
    // === END CRITICAL CHECK ===

    // === FLEXIBLE JOINT COMPATIBILITY CHECK ===
    const firstFrame = trajectory.frames[0];
    const frameJointNames = firstFrame.jointValues ? Object.keys(firstFrame.jointValues) : [];
    const robotJointNames = jointContext.getJointValues ? Object.keys(jointContext.getJointValues(robotId) || {}) : [];
    const missingJoints = frameJointNames.filter(joint => !robotJointNames.includes(joint));
    if (missingJoints.length > 0) {
      const errorMsg = `Active robot is missing required joints for this trajectory: ${missingJoints.join(', ')}. Please select a compatible robot or check your trajectory.`;
      setError(errorMsg);
      console.warn('[TrajectoryContext] ' + errorMsg);
      return false;
    }
    // === END FLEXIBLE CHECK ===

    // Stop any existing playback
    stopPlayback();
    
    const {
      speed = 1.0,
      loop = false,
      onComplete = () => {},
      onFrame = () => {},
      enablePreAnimation = true,
      animationDuration = 2000
    } = options;

    // Emit playback started event with complete info
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount,
      trajectoryInfo: {
        manufacturer: manufacturer || trajectory.manufacturer,
        model: model || trajectory.model,
        name: trajectory.name
      }
    });

    log(`[TrajectoryContext] Playing trajectory: ${trajectory.name} with ${trajectory.frames.length} frames`);
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);

    // Create a ref to track playback state
    const playbackStateRef = { current: {
      trajectory,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      frameIndex: 0,
      isPlaying: true,
      animationFrameId: null
    }};

    // Pre-animation to first frame if enabled
    if (enablePreAnimation && trajectory.frames.length > 0) {
      const firstFrame = trajectory.frames[0];
      if (firstFrame.joints && Object.keys(firstFrame.joints).length > 0) {
        console.log('[TrajectoryContext] Pre-animating to first frame');
        try {
          // Use JointContext's animateToJointValues for smooth pre-animation
          await jointContext.animateToJointValues(robotId, firstFrame.joints, {
            duration: animationDuration,
            motionProfile: 'trapezoidal'
          });
          // Small delay before starting playback
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('[TrajectoryContext] Pre-animation failed:', error);
        }
      }
    }

    // Frame-based playback loop
    const playFrame = () => {
      const state = playbackStateRef.current;
      if (!state || !state.isPlaying) {
        log('[TrajectoryContext] Playback stopped');
        return;
      }
      
      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      // Find current frame based on timestamp
      let frameIndex = state.frameIndex;
      const frames = state.trajectory.frames;
      
      // Find the frame that matches current elapsed time
      for (let i = frameIndex; i < frames.length; i++) {
        if (frames[i].timestamp <= elapsed) {
          frameIndex = i;
        } else {
          break;
        }
      }
      
      // Apply frame if changed and has valid joint values
      if (frameIndex !== state.frameIndex && frameIndex < frames.length) {
        const frame = frames[frameIndex];
        
        if (frame.jointValues && Object.keys(frame.jointValues).length > 0) {
          // CRITICAL FIX: Use JointContext directly without checking robot info
          try {
            // Apply joint values through JointContext
            const success = jointContext.setJointValues(robotId, frame.jointValues);
            
            if (success) {
              state.frameIndex = frameIndex;
              
              // Log progress occasionally to avoid spam
              if (frameIndex % 10 === 0) {
                log(`[TrajectoryContext] Playing frame ${frameIndex}/${frames.length}`);
              }
              
              // Update playback end effector state
              const endEffectorFrame = state.trajectory.endEffectorPath?.[frameIndex];
              if (endEffectorFrame) {
                setPlaybackEndEffectorPoint(endEffectorFrame.position);
                setPlaybackEndEffectorOrientation(endEffectorFrame.orientation || endEffectorFrame.rotation);
                
                // Emit update event for visualization
                EventBus.emit('tcp:endeffector-updated', {
                  robotId,
                  position: endEffectorFrame.position,
                  rotation: endEffectorFrame.orientation || endEffectorFrame.rotation,
                  isPlayback: true,
                  frame: frameIndex,
                  progress
                });
              }
              
              // Call frame callback
              state.onFrame(frame, endEffectorFrame, progress);
              
              // Emit frame played event
              EventBus.emit('trajectory:frame-played', {
                robotId,
                trajectoryName: state.trajectory.name,
                frameIndex,
                progress,
                hasEndEffector: !!endEffectorFrame
              });
            } else if (frameIndex === 0) {
              // Only warn on first frame failure
              console.warn('[TrajectoryContext] Failed to apply joint values for first frame');
            }
          } catch (error) {
            if (frameIndex === 0) {
              console.error('[TrajectoryContext] Error applying joint values:', error);
            }
          }
        }
      }
      
      // Update progress
      setProgress(progress);
      
      // Check completion
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          state.frameIndex = 0;
          setProgress(0);
        } else {
          // Complete
          state.isPlaying = false;
          stopPlayback();
          state.onComplete();
          
          // Emit playback completed event
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: state.trajectory.name
          });
          
          log(`[TrajectoryContext] Trajectory playback completed: ${state.trajectory.name}`);
          return;
        }
      }
      
      // Continue playback
      state.animationFrameId = requestAnimationFrame(playFrame);
    };
    // Store ref for cleanup
    const animationFrameId = requestAnimationFrame(playFrame);
    playbackStateRef.current.animationFrameId = animationFrameId;
    // Store cleanup function
    activePlaybackRef.current = {
      stop: () => {
        if (playbackStateRef.current?.animationFrameId) {
          cancelAnimationFrame(playbackStateRef.current.animationFrameId);
        }
        playbackStateRef.current.isPlaying = false;
      }
    };
    return true;
  }, [robotId, loadTrajectory, stopPlayback, jointContext]);

  // ========== FILE SYSTEM OPERATIONS ==========
  const deleteTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        log(`[TrajectoryContext] Deleted trajectory: ${name}`);
        await scanTrajectories();
        return true;
      } else {
        setError(result.message || 'Failed to delete trajectory');
        return false;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error deleting trajectory:', error);
      setError('Failed to delete trajectory');
      return false;
    }
  }, [scanTrajectories]);
  
  const analyzeTrajectory = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo) return null;
    
    try {
      const response = await fetch(`/api/trajectory/analyze/${trajectoryInfo.manufacturer}/${trajectoryInfo.model}/${trajectoryInfo.name}`);
      const result = await response.json();
      
      if (result.success) {
        log(`[TrajectoryContext] Analyzed trajectory: ${trajectoryInfo.name}`);
        return result.analysis;
      } else {
        console.warn(`[TrajectoryContext] Analysis failed for trajectory: ${trajectoryInfo.name}`);
        return null;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error analyzing trajectory:', error);
      return null;
    }
  }, []);

  // ========== VISUALIZATION METHODS ==========
  const createTrajectoryVisualization = useCallback((pathData) => {
    if (!pathData || !Array.isArray(pathData)) {
      return null;
    }

    const points = pathData.map(p => p.position);
    const colors = [];
    
    // Create gradient colors
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      colors.push({
        r: 1 - t,
        g: t,
        b: 0.3
      });
    }

    // Create waypoints
    const waypointInterval = Math.max(1, Math.floor(points.length / 10));
    const waypoints = [];
    for (let i = waypointInterval; i < points.length - 1; i += waypointInterval) {
      waypoints.push({
        position: points[i],
        index: i
      });
    }

    return {
      smoothPoints: points,
      colors,
      waypoints,
      startPoint: points[0],
      endPoint: points[points.length - 1],
      bounds: calculateBounds(points)
    };
  }, []);

  const calculateBounds = (points) => {
    if (!points || points.length === 0) return null;
    
    const bounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };
    
    points.forEach(point => {
      bounds.min.x = Math.min(bounds.min.x, point.x);
      bounds.min.y = Math.min(bounds.min.y, point.y);
      bounds.min.z = Math.min(bounds.min.z, point.z);
      bounds.max.x = Math.max(bounds.max.x, point.x);
      bounds.max.y = Math.max(bounds.max.y, point.y);
      bounds.max.z = Math.max(bounds.max.z, point.z);
    });
    
    return bounds;
  };

  const calculateCameraPosition = useCallback((bounds) => {
    if (!bounds) return null;
    
    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };
    
    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );
    
    const distance = Math.max(size * 2.5, 1);
    
    return {
      position: {
        x: center.x + distance * 0.7,
        y: center.y + distance * 0.7,
        z: center.z + distance * 0.7
      },
      target: center
    };
  }, []);

  const getTrajectoryVisualization = useCallback(async (trajectoryInfo) => {
    try {
      const trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
      
      if (!trajectory) {
        console.error('[TrajectoryContext] Failed to load trajectory for visualization');
        return null;
      }
      
      const visualization = createTrajectoryVisualization(trajectory.endEffectorPath);
      const analysis = await analyzeTrajectory(trajectoryInfo);
      
      return {
        trajectoryData: trajectory,
        visualization: visualization,
        analysis: analysis,
        stats: {
          frameCount: trajectory.frameCount || 0,
          duration: trajectory.duration / 1000,
          pathPoints: trajectory.endEffectorPath?.length || 0,
          totalDistance: analysis?.endEffectorStats?.totalDistance || 0,
          bounds: analysis?.endEffectorStats?.bounds || visualization?.bounds
        }
      };
    } catch (error) {
      console.error('[TrajectoryContext] Error creating visualization:', error);
      return null;
    }
  }, [loadTrajectory, createTrajectoryVisualization, analyzeTrajectory]);

  // ========== PLAYBACK LINE VISUALIZATION ==========
  useEffect(() => {
    if (!isViewerReady) return;
    const scene = getScene();
    if (!scene) return;

    const cleanup = (targetRobotId) => {
      if (!scene) return;
      
      const objectsToRemove = [];
      scene.traverse((child) => {
        if (child.name?.startsWith(`playback_trajectory_line_${targetRobotId}`) ||
            child.name?.startsWith(`waypoint_sphere_${targetRobotId}`) ||
            child.name?.startsWith(`orientation_frame_${targetRobotId}`) ||
            child.name?.startsWith(`trajectory_marker_${targetRobotId}`)) {
          objectsToRemove.push(child);
        }
      });
      
      objectsToRemove.forEach(obj => {
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
      
      if (lineRef.current?.name?.startsWith(`playback_trajectory_line_${targetRobotId}`)) {
        lineRef.current = null;
      }
      waypointsRef.current = waypointsRef.current.filter(wp => 
        !wp.name.startsWith(`waypoint_sphere_${targetRobotId}`)
      );
      orientationFramesRef.current = orientationFramesRef.current.filter(of => 
        !of.name.startsWith(`orientation_frame_${targetRobotId}`)
      );
      if (currentMarkerRef.current?.name?.startsWith(`trajectory_marker_${targetRobotId}`)) {
        currentMarkerRef.current = null;
      }
      
      if (activeRobotIdRef.current === targetRobotId) {
        activePlaybackRef.current = null;
        storedTrajectoryRef.current = null;
        activeRobotIdRef.current = null;
      }
    };

    const createFullVisualization = (trajectory, visualization, scene, robotId) => {
      const points = visualization.smoothPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const colors = [];
      visualization.colors.forEach(color => {
        colors.push(color.r, color.g, color.b);
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const material = new THREE.LineBasicMaterial({ 
        vertexColors: true, 
        linewidth: 3, 
        opacity: 0.9, 
        transparent: true 
      });
      
      const line = new THREE.Line(geometry, material);
      line.name = `playback_trajectory_line_${robotId}`;
      scene.add(line);
      lineRef.current = line;
      
      // Add waypoints
      if (visualization.waypoints) {
        visualization.waypoints.forEach((waypoint, index) => {
          const sphereGeometry = new THREE.SphereGeometry(0.01, 8, 8);
          const sphereMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color().setHSL(index / visualization.waypoints.length, 0.8, 0.5),
            emissive: new THREE.Color().setHSL(index / visualization.waypoints.length, 0.8, 0.3),
            emissiveIntensity: 0.3
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.copy(new THREE.Vector3(
            waypoint.position.x,
            waypoint.position.y,
            waypoint.position.z
          ));
          sphere.name = `waypoint_sphere_${robotId}_${index}`;
          scene.add(sphere);
          waypointsRef.current.push(sphere);
        });
      }
      
      // Add current position marker with proper material
      const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16);
      // Use MeshPhongMaterial for emissive support
      const markerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.name = `trajectory_marker_${robotId}`;
      marker.visible = false;
      scene.add(marker);
      currentMarkerRef.current = marker;
    };

    const handlePlaybackStarted = async (data) => {
      const { robotId, trajectoryName, trajectoryInfo } = data;
      
      cleanup(activeRobotIdRef.current);
      
      if (robotId !== activeRobotIdRef.current && activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      } else if (!activeRobotIdRef.current && getScene()) {
        // Clean up any existing visualization objects
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
        });
      }
      
      activeRobotIdRef.current = robotId;
      activePlaybackRef.current = { robotId, trajectoryName };
      
      if (robotId && trajectoryName) {
        try {
          let manufacturer, model;
          
          // TEMPORARY WORKAROUND: Always use trajectoryInfo if available
          if (trajectoryInfo && trajectoryInfo.manufacturer && trajectoryInfo.model) {
            manufacturer = trajectoryInfo.manufacturer;
            model = trajectoryInfo.model;
          } else {
            // Fallback: Try to extract from available trajectories
            const matchingTrajectory = availableTrajectories.find(t => 
              t.name === trajectoryName
            );
            
            if (matchingTrajectory) {
              manufacturer = matchingTrajectory.manufacturer;
              model = matchingTrajectory.model;
            } else {
              // Last resort: Use base robot ID
              const baseRobotId = robotId.split('_')[0];
              
              // Try to find in categories
              for (const category of categories || []) {
                const robot = category.robots?.find(r => r.id === baseRobotId);
                if (robot) {
                  manufacturer = category.id;
                  model = baseRobotId.toLowerCase();
                  break;
                }
              }
              
              if (!manufacturer) {
                console.error('[TrajectoryContext] Cannot determine manufacturer/model for trajectory visualization');
                manufacturer = 'unknown';
                model = baseRobotId.toLowerCase();
              }
            }
          }
          
          const trajectory = await loadTrajectory(manufacturer, model, trajectoryName);
          if (trajectory) {
            storedTrajectoryRef.current = trajectory;
            const visualization = createTrajectoryVisualization(trajectory.endEffectorPath);
            if (visualization && visualization.smoothPoints) {
              const scene = getScene();
              if (scene) {
                createFullVisualization(trajectory, visualization, scene, robotId);
              }
            }
          }
        } catch (error) {
          console.error('[TrajectoryContext] Error creating visualization:', error);
        }
      }
    };

    const handleEndEffectorUpdate = (data) => {
      if (!data.isPlayback || !currentMarkerRef.current) return;
      if (data.robotId !== activeRobotIdRef.current) return;
      
      const { position } = data;
      if (position) {
        currentMarkerRef.current.position.set(position.x, position.y, position.z);
        currentMarkerRef.current.visible = true;
      }
    };

    const handlePlaybackStopped = (data) => {
      const { robotId } = data;
      if (robotId === activeRobotIdRef.current) {
        if (currentMarkerRef.current) {
          currentMarkerRef.current.visible = false;
        }
      }
    };

    // Subscribe to events
    const unsubscribes = [
      EventBus.on('trajectory:playback-started', handlePlaybackStarted),
      EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped)
    ];

    return () => {
      unsubscribes.forEach(unsub => unsub());
      if (activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      }
    };
  }, [isViewerReady, getScene, loadTrajectory, createTrajectoryVisualization, getRobotInfo, availableTrajectories]);

  // ========== EVENT LISTENERS FOR RECORDING ==========
  useEffect(() => {
    if (!isRecording || !robotId) return;
    
    let lastFrameTime = 0;
    const FRAME_THROTTLE_MS = 16; // ~60fps
    
    const handleJointChange = (data) => {
      if (data.robotId !== robotId) return;
      
      const currentTime = Date.now();
      
      // Throttle to prevent too many frames
      if (currentTime - lastFrameTime < FRAME_THROTTLE_MS) return;
      lastFrameTime = currentTime;
      
      const elapsed = currentTime - recordingStartTimeRef.current;
      
      // Get joint values from event data
      const jointValues = data.values || data.joints || {};
      
      // Create frame with timestamp and joint values
      const frame = {
        timestamp: elapsed,
        jointValues: { ...jointValues }
      };
      
      // Add end effector data if available (from TCP system)
      if (data.endEffector) {
        frame.endEffector = {
          position: data.endEffector.position,
          rotation: data.endEffector.rotation || data.endEffector.orientation
        };
      }
      
      frameBufferRef.current.push(frame);
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);
      
      // Log every 10th frame to avoid spam
      if (frameCountRef.current % 10 === 0) {
        log(`[TrajectoryContext] Recorded frame ${frameCountRef.current} at ${elapsed}ms`);
      }
      
      // Emit frame recorded event
      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: frameCountRef.current,
        hasEndEffector: !!frame.endEffector
      });
    };
    
    // Also listen for TCP updates to capture end effector data
    const handleTCPUpdate = (data) => {
      if (data.robotId !== robotId || !data.position) return;
      
      // Update the last frame with end effector data if it exists
      if (frameBufferRef.current.length > 0) {
        const lastFrame = frameBufferRef.current[frameBufferRef.current.length - 1];
        lastFrame.endEffector = {
          position: { ...data.position },
          rotation: data.rotation || data.orientation || { x: 0, y: 0, z: 0, w: 1 }
        };
      }
    };
    
    // Listen to joint changes from JointContext
    const unsubscribeJoints = EventBus.on('robot:joints-changed', handleJointChange);
    const unsubscribeTCP = EventBus.on('tcp:endeffector-updated', handleTCPUpdate);
    
    return () => {
      unsubscribeJoints();
      unsubscribeTCP();
    };
  }, [isRecording, robotId]);

  // ========== GET ROBOT TRAJECTORIES ==========
  const getRobotTrajectories = useCallback(() => {
    // DEBUG: Show all trajectories regardless of robot for troubleshooting
    return availableTrajectories;
    // Original filtering logic:
    // if (!robotId) return [];
    // const robotInfo = getRobotInfo(robotId);
    // return availableTrajectories.filter(traj => 
    //   traj.manufacturer === robotInfo.manufacturer && traj.model === robotInfo.model
    // );
  }, [availableTrajectories]);

  // Initialize by scanning trajectories
  useEffect(() => {
    // Delay initial scan slightly to ensure API is ready
    const timer = setTimeout(() => {
      scanTrajectories().catch(error => {
        console.error('[TrajectoryContext] Initial scan failed:', error);
      });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [scanTrajectories]);

  // Debug function for robot lookup
  const debugRobotLookup = useCallback((robotId) => {
    // Access RobotContext internals for debugging
    const robotManager = useRobotContext();
    const loadedRobots = robotManager.loadedRobots || new Map();
    const workspaceRobots = robotManager.workspaceRobots || [];
    const categories = robotManager.categories || [];

    console.group(`[TrajectoryContext Debug] Robot Lookup for: ${robotId}`);
    // Step 1: Extract base ID
    const baseRobotId = robotId.split('_')[0];
    console.log('Base Robot ID:', baseRobotId);
    // Step 2: Try getRobot
    const robot = getRobot(robotId);
    console.log('getRobot result:', robot);
    // Step 3: Try getManufacturer
    const manufacturer = getManufacturer(robotId);
    console.log('getManufacturer result:', manufacturer);
    // Step 4: Check loadedRobots directly
    console.log('All loaded robots:', Array.from(loadedRobots.keys()));
    // Step 5: Check workspace robots
    console.log('Workspace robots:', workspaceRobots.map(r => ({
      id: r.id,
      robotId: r.robotId,
      manufacturer: r.manufacturer
    })));
    // Step 6: Check categories for base ID
    let foundInCategories = false;
    for (const category of categories) {
      const robot = category.robots?.find(r => r.id === baseRobotId);
      if (robot) {
        console.log(`Found in category "${category.id}":`, robot);
        foundInCategories = true;
        break;
      }
    }
    if (!foundInCategories) {
      console.log('Not found in categories');
    }
    // Step 7: Final getRobotInfo result
    const robotInfo = getRobotInfo(robotId);
    console.log('getRobotInfo result:', robotInfo);
    console.groupEnd();
    return {
      robotId,
      baseRobotId,
      robot: !!robot,
      manufacturer,
      robotInfo,
      inLoadedRobots: loadedRobots.has(robotId),
      inWorkspace: workspaceRobots.some(r => r.id === robotId)
    };
  }, [getRobot, getManufacturer, getRobotInfo]);

  // ========== CONTEXT VALUE ==========
  const value = useMemo(() => ({
    // State
    robotId,
    isRecording,
    isPlaying,
    isScanning,
    recordingName,
    frameCount,
    progress,
    currentTrajectory,
    availableTrajectories,
    error,
    playbackEndEffectorPoint,
    playbackEndEffectorOrientation,
    
    // Recording
    startRecording,
    stopRecording,
    
    // Playback
    playTrajectory,
    stopPlayback,
    
    // File operations
    scanTrajectories,
    loadTrajectory,
    deleteTrajectory,
    analyzeTrajectory,
    getRobotTrajectories,
    
    // Visualization
    createTrajectoryVisualization,
    calculateBounds,
    calculateCameraPosition,
    getTrajectoryVisualization,
    
    // Computed values
    canRecord: !!robotId && !isAnimating && !isPlaying,
    canPlay: !!robotId && !isAnimating && !isRecording,
    hasFrames: frameCount > 0,
    hasTrajectories: getRobotTrajectories().length > 0,
    count: getRobotTrajectories().length,
    
    // Error handling
    clearError: () => setError(null),
    debugRobotLookup, // Expose for debugging
  }), [
    robotId, isRecording, isPlaying, isScanning, recordingName, frameCount,
    progress, currentTrajectory, availableTrajectories, error,
    playbackEndEffectorPoint, playbackEndEffectorOrientation,
    startRecording, stopRecording, playTrajectory, stopPlayback,
    scanTrajectories, loadTrajectory, deleteTrajectory, analyzeTrajectory,
    getRobotTrajectories, createTrajectoryVisualization, calculateBounds,
    calculateCameraPosition, getTrajectoryVisualization,
    isAnimating, getRobotInfo, debugRobotLookup
  ]);

  return (
    <TrajectoryContext.Provider value={value}>
      {children}
    </TrajectoryContext.Provider>
  );
};

export const useTrajectoryContext = () => {
  const context = useContext(TrajectoryContext);
  if (!context) {
    throw new Error('useTrajectoryContext must be used within TrajectoryProvider');
  }
  return context;
};

// ========== SPECIALIZED HOOKS THAT USE THE CONTEXT ==========
export const useTrajectoryRecording = () => {
  const trajectory = useTrajectoryContext();
  
  return {
    robotId: trajectory.robotId,
    isRecording: trajectory.isRecording,
    startRecording: trajectory.startRecording,
    stopRecording: trajectory.stopRecording,
    recordingName: trajectory.recordingName,
    frameCount: trajectory.frameCount,
    canRecord: trajectory.canRecord,
    hasFrames: trajectory.hasFrames
  };
};

export const useTrajectoryPlayback = () => {
  const trajectory = useTrajectoryContext();
  
  return {
    robotId: trajectory.robotId,
    isPlaying: trajectory.isPlaying,
    progress: trajectory.progress,
    currentTrajectory: trajectory.currentTrajectory,
    playTrajectory: trajectory.playTrajectory,
    stopPlayback: trajectory.stopPlayback,
    canPlay: trajectory.canPlay,
    playbackEndEffectorPoint: trajectory.playbackEndEffectorPoint,
    playbackEndEffectorOrientation: trajectory.playbackEndEffectorOrientation
  };
};

export const useTrajectoryManagement = () => {
  const trajectory = useTrajectoryContext();
  
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.getRobotTrajectories(),
    availableTrajectories: trajectory.availableTrajectories,
    deleteTrajectory: trajectory.deleteTrajectory,
    scanTrajectories: trajectory.scanTrajectories,
    loadTrajectory: trajectory.loadTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory,
    isScanning: trajectory.isScanning,
    error: trajectory.error,
    count: trajectory.count
  };
};

export const useTrajectoryVisualization = () => {
  const trajectory = useTrajectoryContext();
  
  return {
    createTrajectoryVisualization: trajectory.createTrajectoryVisualization,
    calculateBounds: trajectory.calculateBounds,
    calculateCameraPosition: trajectory.calculateCameraPosition,
    getTrajectoryVisualization: trajectory.getTrajectoryVisualization,
    hasVisualization: !!(trajectory.currentTrajectory && trajectory.playbackEndEffectorPoint)
  };
};

// Export the main context as default
export default TrajectoryContext;