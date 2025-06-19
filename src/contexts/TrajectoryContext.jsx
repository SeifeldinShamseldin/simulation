import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRobotContext } from './RobotContext';
import { useJointContext } from './JointContext';
import { useAnimationContext } from './AnimationContext';
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
  
  // Context hooks
  const { activeRobotId: robotId, isAnimating, getRobot } = useRobotContext();
  const jointContext = useJointContext();
  const { animate, animateTrajectory: animateTrajectoryBase } = useAnimationContext();
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

  // Helper function to get robot info
  const getRobotInfo = useCallback((robotId) => {
    const robot = getRobot(robotId);
    if (!robot) {
      console.warn(`[TrajectoryContext] Robot ${robotId} not found`);
      return { manufacturer: 'unknown', model: 'unknown' };
    }
    return {
      manufacturer: robot.manufacturer || 'unknown',
      model: robot.model || robot.name || 'unknown'
    };
  }, [getRobot]);

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
    
    // Reset recording state
    frameBufferRef.current = [];
    frameCountRef.current = 0;
    recordingStartTimeRef.current = Date.now();
    
    setRecordingName(trajectoryName);
    setIsRecording(true);
    setFrameCount(0);
    
    // Emit event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName
    });
    
    return true;
  }, [robotId, isRecording]);
  
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
      
      log(`[TrajectoryContext] Saved trajectory "${trajectory.name}"`);
      
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
    
    if (trajectoryInfo.frames && Array.isArray(trajectoryInfo.frames)) {
      // Direct trajectory object provided
      trajectory = trajectoryInfo;
    } else if (trajectoryInfo.manufacturer && trajectoryInfo.model && trajectoryInfo.name) {
      // Trajectory metadata provided - load the full trajectory
      trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
    } else {
      console.warn('[TrajectoryContext] Cannot play trajectory: invalid trajectory info provided');
      return false;
    }

    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.warn('[TrajectoryContext] Cannot play trajectory: missing trajectory, frames, or empty frames');
      return false;
    }

    // Check if we need to do pre-animation first
    const hasPreAnimation = trajectory.preAnimationJoints && 
                           Object.keys(trajectory.preAnimationJoints).length > 0;
    
    // Emit playback started event (important for visualization)
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      hadPreAnimation: hasPreAnimation,
      frameCount: trajectory.frameCount
    });

    log(`[TrajectoryContext] Playing trajectory: ${trajectory.name} with ${trajectory.frames.length} frames`);
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);
    
    // Calculate actual duration
    const actualDuration = trajectory.duration || 
                          trajectory.frames.length * (options.frameInterval || 50);
    
    try {
      // Use AnimationContext for smooth playback
      await animateTrajectoryBase(trajectory, {
        ...options,
        duration: actualDuration,
        onUpdate: (values, progress, frame) => {
          setProgress(progress);
          
          // Update end effector visualization
          if (trajectory.endEffectorPath && frame < trajectory.endEffectorPath.length) {
            const effectorData = trajectory.endEffectorPath[frame];
            setPlaybackEndEffectorPoint(effectorData.position);
            setPlaybackEndEffectorOrientation(effectorData.rotation);
            
            // Emit update event for visualization
            EventBus.emit('tcp:endeffector-updated', {
              robotId,
              position: effectorData.position,
              rotation: effectorData.rotation,
              isPlayback: true,
              frame,
              progress
            });
          }
          
          if (options.onUpdate) {
            options.onUpdate(values, progress, frame);
          }
        },
        onComplete: () => {
          log(`[TrajectoryContext] Trajectory playback completed: ${trajectory.name}`);
          setIsPlaying(false);
          setProgress(0);
          setCurrentTrajectory(null);
          setPlaybackEndEffectorPoint(null);
          setPlaybackEndEffectorOrientation(null);
          
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: trajectory.name
          });
          
          if (options.onComplete) {
            options.onComplete();
          }
        }
      });
      
      return true;
    } catch (error) {
      console.error('[TrajectoryContext] Playback error:', error);
      setIsPlaying(false);
      setProgress(0);
      setCurrentTrajectory(null);
      EventBus.emit('trajectory:playback-stopped', {
        robotId,
        trajectoryName: trajectory.name,
        reason: 'error'
      });
      return false;
    }
  }, [robotId, loadTrajectory, animateTrajectoryBase]);
  
  const stopPlayback = useCallback(() => {
    if (!isPlaying || !currentTrajectory) return;
    
    log(`[TrajectoryContext] Stopping playback: ${currentTrajectory.name}`);
    
    setIsPlaying(false);
    setProgress(0);
    
    const trajectoryName = currentTrajectory.name;
    setCurrentTrajectory(null);
    setPlaybackEndEffectorPoint(null);
    setPlaybackEndEffectorOrientation(null);
    
    EventBus.emit('trajectory:playback-stopped', {
      robotId,
      trajectoryName,
      reason: 'user'
    });
  }, [isPlaying, currentTrajectory, robotId]);

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
          const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: new THREE.Color().setHSL(index / visualization.waypoints.length, 0.8, 0.5) 
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
      
      // Add current position marker
      const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ 
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
      const { robotId, trajectoryName } = data;
      
      const prevActiveRobotId = activeRobotIdRef.current;
      if (prevActiveRobotId && prevActiveRobotId !== robotId) {
        cleanup(prevActiveRobotId);
      } else if (!prevActiveRobotId && getScene()) {
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
          const robotInfo = getRobotInfo(robotId);
          const trajectory = await loadTrajectory(robotInfo.manufacturer, robotInfo.model, trajectoryName);
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
  }, [isViewerReady, getScene, loadTrajectory, createTrajectoryVisualization, getRobotInfo]);

  // ========== EVENT LISTENERS FOR RECORDING ==========
  useEffect(() => {
    if (!isRecording) return;
    
    const handleJointUpdate = (data) => {
      if (data.robotId !== robotId) return;
      
      const frame = {
        timestamp: Date.now() - recordingStartTimeRef.current,
        joints: data.values || data.joints,
        endEffector: data.endEffector
      };
      
      frameBufferRef.current.push(frame);
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);
    };
    
    const unsubscribe = EventBus.on('robot:joints-updated', handleJointUpdate);
    return () => unsubscribe();
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
    clearError: () => setError(null)
  }), [
    robotId, isRecording, isPlaying, isScanning, recordingName, frameCount,
    progress, currentTrajectory, availableTrajectories, error,
    playbackEndEffectorPoint, playbackEndEffectorOrientation,
    startRecording, stopRecording, playTrajectory, stopPlayback,
    scanTrajectories, loadTrajectory, deleteTrajectory, analyzeTrajectory,
    getRobotTrajectories, createTrajectoryVisualization, calculateBounds,
    calculateCameraPosition, getTrajectoryVisualization,
    isAnimating, getRobotInfo
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