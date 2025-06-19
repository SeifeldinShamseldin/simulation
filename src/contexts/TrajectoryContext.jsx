// src/contexts/TrajectoryContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import EventBus from '../utils/EventBus';
import { useJointContext } from './JointContext';
import { useRobotContext } from './RobotContext';
import { useTCPContext } from './TCPContext';
import { useViewer } from './ViewerContext';

const TrajectoryContext = createContext(null);

// Enable detailed logging
const DEBUG = true;
const log = (...args) => {
  if (DEBUG) console.log(...args);
};

/**
 * Dynamic Joint Mapper - NO HARDCODING
 * Automatically detects patterns and creates mappings
 */
class DynamicJointMapper {
  constructor() {
    this.cache = new Map(); // Cache mappings for performance
  }

  /**
   * Extract joint pattern from joint names
   */
  detectPattern(jointNames) {
    if (!jointNames || jointNames.length === 0) return null;

    // Analyze first joint to detect pattern
    const firstJoint = jointNames[0];
    
    // Try different regex patterns
    const patterns = [
      { regex: /^joint_(\d+)$/, type: 'underscore', extract: match => match[1] },
      { regex: /^joint_a(\d+)$/, type: 'kuka_a', extract: match => match[1] },
      { regex: /^joint_?([a-zA-Z])(\d+)$/, type: 'letter_number', extract: match => match[1] + match[2] },
      { regex: /^axis_?(\d+)$/, type: 'axis', extract: match => match[1] },
      { regex: /^j(\d+)$/, type: 'short', extract: match => match[1] },
      { regex: /^([a-zA-Z]+)(\d+)$/, type: 'prefix_number', extract: match => ({ prefix: match[1], num: match[2] }) },
      { regex: /^(\d+)$/, type: 'number_only', extract: match => match[1] },
    ];

    for (const pattern of patterns) {
      const match = firstJoint.match(pattern.regex);
      if (match) {
        // Verify all joints follow same pattern
        const valid = jointNames.every(name => pattern.regex.test(name));
        if (valid) {
          return {
            type: pattern.type,
            regex: pattern.regex,
            extract: pattern.extract,
            prefix: pattern.type === 'prefix_number' ? match[1] : null
          };
        }
      }
    }

    // No pattern found - treat as custom names
    return { type: 'custom', names: jointNames };
  }

  /**
   * Create mapping between source and target joints
   */
  createMapping(sourceJoints, targetJoints) {
    // Check cache first
    const cacheKey = `${sourceJoints.join(',')}->${targetJoints.join(',')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const sourcePattern = this.detectPattern(sourceJoints);
    const targetPattern = this.detectPattern(targetJoints);
    const mapping = {};

    log('[DynamicJointMapper] Source pattern:', sourcePattern);
    log('[DynamicJointMapper] Target pattern:', targetPattern);

    // If both have patterns with numbers, map by number
    if (sourcePattern && targetPattern && 
        sourcePattern.type !== 'custom' && targetPattern.type !== 'custom') {
      
      sourceJoints.forEach(sourceJoint => {
        const sourceMatch = sourceJoint.match(sourcePattern.regex);
        if (sourceMatch) {
          const extracted = sourcePattern.extract(sourceMatch);
          const num = typeof extracted === 'object' ? extracted.num : extracted;
          
          // Find corresponding target joint with same number
          const targetJoint = targetJoints.find(tj => {
            const targetMatch = tj.match(targetPattern.regex);
            if (targetMatch) {
              const targetExtracted = targetPattern.extract(targetMatch);
              const targetNum = typeof targetExtracted === 'object' ? targetExtracted.num : targetExtracted;
              return targetNum === num;
            }
            return false;
          });
          
          if (targetJoint) {
            mapping[sourceJoint] = targetJoint;
          }
        }
      });
    }

    // If mapping is incomplete, use position-based fallback
    if (Object.keys(mapping).length < sourceJoints.length) {
      sourceJoints.forEach((sj, idx) => {
        if (!mapping[sj] && idx < targetJoints.length) {
          mapping[sj] = targetJoints[idx];
        }
      });
    }

    // Cache the mapping
    this.cache.set(cacheKey, mapping);
    
    log('[DynamicJointMapper] Created mapping:', mapping);
    return mapping;
  }

  /**
   * Apply mapping to joint values
   */
  applyMapping(jointValues, mapping) {
    const mapped = {};
    for (const [sourceJoint, value] of Object.entries(jointValues)) {
      const targetJoint = mapping[sourceJoint];
      if (targetJoint) {
        mapped[targetJoint] = value;
      }
    }
    return mapped;
  }
}

// Helper: Create a THREE.js line for the end effector path
function createEndEffectorVisualization(endEffectorPath) {
  if (!endEffectorPath || endEffectorPath.length < 2) return null;
  const points = endEffectorPath.map(p => new THREE.Vector3(p.position.x, p.position.y, p.position.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
  return new THREE.Line(geometry, material);
}

export const TrajectoryProvider = ({ children }) => {
  const jointContext = useJointContext();
  const { getRobot, activeRobotId, workspaceRobots } = useRobotContext();
  const { currentEndEffectorPoint, currentEndEffectorOrientation, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation, getEndEffectorLink } = useTCPContext();
  const { isViewerReady, getScene } = useViewer();

  // Dynamic joint mapper instance
  const jointMapper = useRef(new DynamicJointMapper()).current;

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [frameCount, setFrameCount] = useState(0);
  const recordingStartTimeRef = useRef(null);
  const frameBufferRef = useRef([]);
  const endEffectorBufferRef = useRef([]);
  const frameCountRef = useRef(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTrajectory, setCurrentTrajectory] = useState(null);
  const [playbackEndEffectorPoint, setPlaybackEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [playbackEndEffectorOrientation, setPlaybackEndEffectorOrientation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  const playbackStateRef = useRef(null);

  // Available trajectories
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  // Visualization
  const visualizationRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const previewLineRef = useRef(null);

  // Track current robot
  const robotId = activeRobotId;

  // Get robot info for trajectory file management (manufacturer, model, name)
  const getTrajectoryInfo = useCallback((id) => {
    const robot = getRobot(id || robotId);
    return {
      manufacturer: robot?.manufacturer || 'unknown',
      model: robot?.model || robot?.robotId || robot?.name || 'unknown',
      name: robot?.name || id || robotId // name is not used for file, but for completeness
    };
  }, [getRobot, robotId]);

  // New state for tcpAttached
  const [tcpAttached, setTcpAttached] = useState(false);

  /**
   * Scan for available trajectories
   */
  const scanTrajectories = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    if (!robotId || !workspaceRobots || workspaceRobots.length === 0) {
      setAvailableTrajectories([]);
      setIsScanning(false);
      return;
    }
    const robot = workspaceRobots.find(r => r.id === robotId);
    if (!robot) {
      setAvailableTrajectories([]);
      setIsScanning(false);
      return;
    }
    const trajectoryInfo = {
      manufacturer: robot.manufacturer || 'unknown',
      model: robot.model || robot.robotId || robot.name || 'unknown',
    };
    try {
      const response = await fetch(`/api/trajectory/scan?manufacturer=${encodeURIComponent(trajectoryInfo.manufacturer)}&model=${encodeURIComponent(trajectoryInfo.model)}`);
      const data = await response.json();
      if (data.success && data.trajectories) {
        setAvailableTrajectories(data.trajectories.filter(
          t => t.manufacturer === trajectoryInfo.manufacturer && t.model === trajectoryInfo.model
        ));
      } else {
        setAvailableTrajectories([]);
      }
    } catch (error) {
      setError('Failed to scan trajectories');
      setAvailableTrajectories([]);
    } finally {
      setIsScanning(false);
    }
  }, [workspaceRobots, robotId]);

  /**
   * Get trajectories for current robot (show all for type)
   */
  const getRobotTrajectories = useCallback(() => {
    // Return all availableTrajectories (already filtered by manufacturer/model)
    return availableTrajectories;
  }, [availableTrajectories]);

  /**
   * Load trajectory data
   */
  const loadTrajectory = useCallback(async (manufacturer, model, name) => {
    if (!manufacturer || !model || !name) {
      setError('Missing manufacturer, model, or trajectory name');
      return null;
    }
    try {
      const response = await fetch('/api/trajectory/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trajectoryInfo: { manufacturer, model, name }
        })
      });
      if (!response.ok) throw new Error(`Failed to load trajectory: ${response.statusText}`);
      const data = await response.json();
      if (data.success && data.trajectory) return data.trajectory;
      throw new Error(data.error || 'Failed to load trajectory');
    } catch (error) {
      setError(error.message);
      return null;
    }
  }, []);

  /**
   * Start recording trajectory
   */
  const startRecording = useCallback((name, manufacturer, model, robotName) => {
    if (!robotId || isRecording || isPlaying) {
      console.warn('[TrajectoryContext] Cannot start recording:', { robotId, isRecording, isPlaying });
      return false;
    }

    // Determine if TCP/tool is attached at the start
    const endEffectorLink = getEndEffectorLink ? getEndEffectorLink(robotId) : null;
    const hasTCP = !!(endEffectorLink && endEffectorLink.children && endEffectorLink.children.length > 0);
    setTcpAttached(hasTCP);
    // Store the end effector link name (TCP/tool or flange)
    let endEffectorLinkName = null;
    if (endEffectorLink) {
      if (hasTCP && endEffectorLink.children.length > 0) {
        // Use the first child's name as the TCP/tool link name
        endEffectorLinkName = endEffectorLink.children[0]?.name || endEffectorLink.name;
      } else {
        // Use the flange (end effector link itself)
        endEffectorLinkName = endEffectorLink.name;
      }
    }
    // Save to ref for use in stopRecording
    recordingStartTimeRef.current_endEffectorLinkName = endEffectorLinkName;

    log('[TrajectoryContext] Starting recording:', name);
    setIsRecording(true);
    setRecordingName(name);
    setFrameCount(0);
    recordingStartTimeRef.current = Date.now();
    frameBufferRef.current = [];
    endEffectorBufferRef.current = [];
    frameCountRef.current = 0;
    EventBus.emit('trajectory:recording-started', { 
      robotId, 
      name,
      robotInfo: getTrajectoryInfo(robotId)
    });
    return true;
  }, [robotId, isRecording, isPlaying, getTrajectoryInfo, getEndEffectorLink]);

  /**
   * Stop recording and save trajectory
   */
  const stopRecording = useCallback(async () => {
    if (!isRecording) return null;
    const duration = Date.now() - recordingStartTimeRef.current;
    const frames = frameBufferRef.current;
    const endEffectorPath = endEffectorBufferRef.current;
    // Use the same logic as scanTrajectories for manufacturer/model
    const robot = workspaceRobots.find(r => r.id === robotId) || getRobot(robotId);
    const trajectoryInfo = {
      manufacturer: robot?.manufacturer || 'unknown',
      model: robot?.model || robot?.robotId || robot?.name || 'unknown',
      name: recordingName
    };
    const trajectory = {
      frames,
      tcp: tcpAttached,
      endEffectorLinkName: recordingStartTimeRef.current_endEffectorLinkName || null,
      endEffectorPath,
      name: recordingName,
      robotName: robot?.name || '',
      manufacturer: trajectoryInfo.manufacturer,
      model: trajectoryInfo.model,
      frameCount: frames.length,
      duration,
      recordedAt: new Date().toISOString()
    };
    if (!trajectory.frames || !Array.isArray(trajectory.frames) || trajectory.frames.length === 0) {
      setError('No frames recorded. Cannot save empty trajectory.');
      setIsRecording(false);
      setRecordingName('');
      setFrameCount(0);
      return null;
    }
    try {
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trajectoryInfo,
          trajectoryData: trajectory
        })
      });
      const result = await response.json();
      if (result.success) {
        await scanTrajectories();
        EventBus.emit('trajectory:recording-stopped', {
          name: recordingName,
          frameCount: frames.length,
          duration
        });
      } else {
        throw new Error(result.error || 'Failed to save trajectory');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setIsRecording(false);
      setRecordingName('');
      setFrameCount(0);
    }
    return trajectory;
  }, [isRecording, robotId, recordingName, workspaceRobots, getRobot, scanTrajectories, tcpAttached, getEndEffectorLink]);

  /**
   * Stop playback
   */
  const stopPlayback = useCallback(() => {
    if (playbackStateRef.current) {
      playbackStateRef.current.isPlaying = false;
      playbackStateRef.current = null;
    }
    
    setIsPlaying(false);
    setProgress(0);
    setCurrentTrajectory(null);
    setPlaybackEndEffectorPoint({ x: 0, y: 0, z: 0 });
    setPlaybackEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });

    // Clean up visualization
    if (visualizationRef.current) {
      const scene = getScene();
      if (scene) {
        scene.remove(visualizationRef.current);
      }
      visualizationRef.current = null;
    }

    EventBus.emit('trajectory:playback-stopped', { robotId });
  }, [robotId, getScene]);

  /**
   * Create trajectory visualization
   */
  const createTrajectoryVisualization = useCallback((trajectory) => {
    if (!isViewerReady || !trajectory.endEffectorPath || trajectory.endEffectorPath.length === 0) {
      return null;
    }

    const scene = getScene();
    if (!scene) return null;

    // Clean up existing visualization
    if (visualizationRef.current) {
      scene.remove(visualizationRef.current);
    }

    const visualization = createEndEffectorVisualization(trajectory.endEffectorPath);
    visualizationRef.current = visualization;
    scene.add(visualization);

    return visualization;
  }, [isViewerReady, getScene]);

  /**
   * Play trajectory with dynamic joint mapping
   */
  const playTrajectory = useCallback(async (trajectoryInfo, options = {}) => {
    if (!robotId) {
      console.warn('[TrajectoryContext] Cannot play trajectory: no active robot');
      return false;
    }

    // Load trajectory if needed
    let trajectory;
    if (trajectoryInfo.frames) {
      trajectory = trajectoryInfo;
    } else if (trajectoryInfo.manufacturer && trajectoryInfo.model && trajectoryInfo.name) {
      trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
    } else {
      console.warn('[TrajectoryContext] Invalid trajectory info');
      return false;
    }

    // === ENFORCE NEW FORMAT ===
    // Validate that trajectory.frames is an array of {timestamp, jointValues}
    if (!trajectory || !Array.isArray(trajectory.frames) || trajectory.frames.length === 0) {
      console.warn('[TrajectoryContext] Invalid trajectory data');
      return false;
    }
    // Check that every frame has jointValues
    for (const frame of trajectory.frames) {
      if (!frame.jointValues || typeof frame.jointValues !== 'object') {
        console.error('[TrajectoryContext] Frame missing jointValues:', frame);
        return false;
      }
    }
    // Validate endEffectorPath if present
    if (trajectory.endEffectorPath && !Array.isArray(trajectory.endEffectorPath)) {
      console.warn('[TrajectoryContext] endEffectorPath is not an array');
      trajectory.endEffectorPath = [];
    }

    // Get current robot joint names
    const robotJointValues = jointContext.getJointValues(robotId);
    if (!robotJointValues) {
      console.error('[TrajectoryContext] Cannot get robot joint values');
      return false;
    }
    const robotJointNames = Object.keys(robotJointValues);

    // Get trajectory joint names from first frame (new format)
    const firstFrame = trajectory.frames[0];
    const trajectoryJointNames = Object.keys(firstFrame.jointValues);

    if (trajectoryJointNames.length === 0) {
      console.warn('[TrajectoryContext] Trajectory has no joint data');
      return false;
    }

    // Create dynamic joint mapping
    const jointMapping = jointMapper.createMapping(trajectoryJointNames, robotJointNames);
    
    // Log the mapping for debugging
    log('[TrajectoryContext] Playing trajectory from', trajectory.manufacturer, '/', trajectory.model);
    log('[TrajectoryContext] On robot:', getTrajectoryInfo(robotId));
    log('[TrajectoryContext] Joint mapping:', jointMapping);

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

    // Pre-animation to first frame (new format)
    if (enablePreAnimation && trajectory.frames.length > 0) {
      const firstFrameJoints = jointMapper.applyMapping(firstFrame.jointValues, jointMapping);
      log('[TrajectoryContext] Pre-animating to first frame');
      try {
        await jointContext.animateToJointValues(robotId, firstFrameJoints, {
          duration: animationDuration,
          motionProfile: 'trapezoidal'
        });
        if (trajectory.endEffectorPath && trajectory.endEffectorPath.length > 0) {
          createTrajectoryVisualization(trajectory);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('[TrajectoryContext] Pre-animation failed:', error);
      }
    }

    // Start playback (after pre-animation)
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);

    // Initialize playback state (reset timer and frame index)
    playbackStateRef.current = {
      trajectory,
      jointMapping,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      frameIndex: 0,
      isPlaying: true
    };

    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frames.length,
      trajectoryInfo: {
        manufacturer: trajectory.manufacturer,
        model: trajectory.model,
        name: trajectory.name
      }
    });

    // Start playback loop (new format only)
    const playFrame = () => {
      const state = playbackStateRef.current;
      if (!state || !state.isPlaying) {
        return;
      }

      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);

      // Find current frame (always use timestamp and jointValues)
      let frameIndex = 0;
      const frames = state.trajectory.frames;
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].timestamp <= elapsed) {
          frameIndex = i;
        } else {
          break;
        }
      }

      // Apply frame if changed or if this is the very first frame
      if ((frameIndex !== state.frameIndex || state.frameIndex === 0) && frameIndex < frames.length) {
        const frame = frames[frameIndex];
        // Only use jointValues from the new format
        const mappedJoints = jointMapper.applyMapping(frame.jointValues, state.jointMapping);
        const success = jointContext.setJointValues(robotId, mappedJoints);
        if (success) {
          state.frameIndex = frameIndex;
          // Update end effector visualization (new format)
          const endEffectorFrame = state.trajectory.endEffectorPath?.[frameIndex];
          if (endEffectorFrame) {
            setPlaybackEndEffectorPoint(endEffectorFrame.position);
            setPlaybackEndEffectorOrientation(endEffectorFrame.orientation || endEffectorFrame.rotation);
            EventBus.emit('tcp:endeffector-updated', {
              robotId,
              position: endEffectorFrame.position,
              rotation: endEffectorFrame.orientation || endEffectorFrame.rotation,
              isPlayback: true,
              frame: frameIndex,
              progress
            });
          }
          state.onFrame(frame, endEffectorFrame, progress);
        }
      }

      setProgress(progress);

      // Check if completed
      if (progress >= 1) {
        if (state.loop) {
          state.startTime = Date.now();
          state.frameIndex = 0;
          requestAnimationFrame(playFrame);
        } else {
          stopPlayback();
          state.onComplete();
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: state.trajectory.name
          });
        }
      } else {
        requestAnimationFrame(playFrame);
      }
    };
    requestAnimationFrame(playFrame);
    return true;
  }, [robotId, jointContext, getTrajectoryInfo, loadTrajectory, stopPlayback, createTrajectoryVisualization]);

  /**
   * Delete trajectory
   */
  const deleteTrajectory = useCallback(async (trajectory) => {
    // Build trajectoryInfo just like in save
    const trajectoryInfo = {
      manufacturer: trajectory.manufacturer,
      model: trajectory.model,
      name: trajectory.name
    };
    console.log('Deleting trajectory:', trajectoryInfo);
    try {
      const response = await fetch('/api/trajectory/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoryInfo })
      });
      const result = await response.json();
      if (result.success) {
        await scanTrajectories();
        return true;
      }
      throw new Error(result.error || 'Failed to delete trajectory');
    } catch (error) {
      setError(error.message);
      return false;
    }
  }, [scanTrajectories]);

  /**
   * Analyze trajectory
   */
  const analyzeTrajectory = useCallback(async (trajectoryInfo) => {
    try {
      const response = await fetch('/api/trajectory/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoryInfo })
      });
      const data = await response.json();
      if (data.success) return data.analysis;
      throw new Error(data.error || 'Failed to analyze trajectory');
    } catch (error) {
      setError(error.message);
      return null;
    }
  }, []);

  /**
   * Calculate trajectory bounds
   */
  const calculateBounds = useCallback((trajectory) => {
    if (!trajectory.endEffectorPath || trajectory.endEffectorPath.length === 0) {
      return null;
    }

    const bounds = new THREE.Box3();
    trajectory.endEffectorPath.forEach(point => {
      bounds.expandByPoint(new THREE.Vector3(
        point.position.x,
        point.position.y,
        point.position.z
      ));
    });

    return bounds;
  }, []);

  /**
   * Calculate camera position for trajectory
   */
  const calculateCameraPosition = useCallback((bounds, padding = 1.5) => {
    if (!bounds) return null;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const distance = maxDim * padding;
    const position = center.clone().add(new THREE.Vector3(distance, distance, distance));
    
    return { position, target: center };
  }, []);

  // Recording event listener
  useEffect(() => {
    if (!isRecording || !robotId) return;

    let lastFrameTime = 0;
    const FRAME_THROTTLE_MS = 16; // ~60fps

    const handleJointChange = (data) => {
      if (data.robotId !== robotId) return;

      const currentTime = Date.now();
      if (currentTime - lastFrameTime < FRAME_THROTTLE_MS) return;
      lastFrameTime = currentTime;

      const elapsed = currentTime - recordingStartTimeRef.current;
      const jointValues = data.values || data.joints || {};

      // Get end effector info from TCP context
      const position = getCurrentEndEffectorPoint(robotId);
      const orientation = getCurrentEndEffectorOrientation(robotId);
      // const endEffectorLink = getEndEffectorLink ? getEndEffectorLink(robotId) : null;
      // const hasTCP = !!(endEffectorLink && endEffectorLink.children && endEffectorLink.children.length > 0);

      // Record frame (only timestamp and jointValues)
      const frame = {
        timestamp: elapsed,
        jointValues: { ...jointValues }
      };

      frameBufferRef.current.push(frame);
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);

      // Record end effector path as a separate array
      if (position.x !== 0 || 
          position.y !== 0 || 
          position.z !== 0) {
        endEffectorBufferRef.current.push({
          timestamp: elapsed,
          position: { ...position },
          orientation: { ...orientation }
        });
      }

      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: frameCountRef.current,
        hasEndEffector: endEffectorBufferRef.current.length > 0
      });
    };

    const unsubscribe = EventBus.on('robot:joints-changed', handleJointChange);
    return () => unsubscribe();
  }, [isRecording, robotId, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation, getEndEffectorLink]);

  // Scan trajectories on mount and when robot changes
  useEffect(() => {
    if (isViewerReady) {
      scanTrajectories();
    }
  }, [isViewerReady, robotId, scanTrajectories]);

  // Context value
  const value = {
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
    
    // Actions
    startRecording,
    stopRecording,
    playTrajectory,
    stopPlayback,
    scanTrajectories,
    loadTrajectory,
    deleteTrajectory,
    analyzeTrajectory,
    getRobotTrajectories,
    createTrajectoryVisualization,
    calculateBounds,
    calculateCameraPosition,
    getTrajectoryInfo,
    
    // Computed
    canRecord: !!robotId && !isRecording && !isPlaying,
    canPlay: !!robotId && !isRecording && !isPlaying,
    hasFrames: frameCount > 0,
    hasTrajectories: availableTrajectories.length > 0,
    
    // Error handling
    clearError: () => setError(null)
  };

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

export const useTrajectoryRecording = () => {
  const context = useTrajectoryContext();
  return {
    isRecording: context.isRecording,
    startRecording: context.startRecording,
    stopRecording: context.stopRecording,
    recordingName: context.recordingName,
    frameCount: context.frameCount,
    canRecord: context.canRecord,
  };
};

export const useTrajectoryPlayback = () => {
  const context = useTrajectoryContext();
  return {
    isPlaying: context.isPlaying,
    playTrajectory: context.playTrajectory,
    stopPlayback: context.stopPlayback,
    progress: context.progress,
    currentTrajectory: context.currentTrajectory,
    playbackEndEffectorPoint: context.playbackEndEffectorPoint,
    canPlay: context.canPlay,
  };
};

export const useTrajectoryManagement = () => {
  const context = useTrajectoryContext();
  return {
    trajectories: context.getRobotTrajectories(),
    deleteTrajectory: context.deleteTrajectory,
    scanTrajectories: context.scanTrajectories,
    analyzeTrajectory: context.analyzeTrajectory,
    isScanning: context.isScanning,
    error: context.error,
    count: context.availableTrajectories.length,
    availableTrajectories: context.availableTrajectories,
  };
};

export const useTrajectoryVisualization = () => {
  const context = useTrajectoryContext();
  return {
    createTrajectoryVisualization: context.createTrajectoryVisualization,
    calculateBounds: context.calculateBounds,
    calculateCameraPosition: context.calculateCameraPosition,
  };
};

export default TrajectoryContext;