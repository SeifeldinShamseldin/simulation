// core/Trajectory/TrajectoryAPI.js
// Update the API to track end effector positions

import * as THREE from 'three';
import ikAPI from '../IK/API/IKAPI';
import EventBus from '../../utils/EventBus';

/**
 * API for recording, storing and playing back robot joint trajectories
 * with end effector path tracking
 */
class TrajectoryAPI {
  constructor() {
    // Singleton pattern
    if (TrajectoryAPI.instance) {
      return TrajectoryAPI.instance;
    }
    TrajectoryAPI.instance = this;
    
    this.trajectories = new Map(); // Map<robotId, Map<trajectoryName, trajectory>>
    // Change from single state to robot-specific states
    this.recordingStates = new Map(); // Map<robotId, recordingState>
    this.playbackStates = new Map(); // Map<robotId, playbackState>
    this.playbackUpdateCallbacks = [];
  }

  /**
   * Get robot-specific trajectories
   * @param {string} robotId - The ID of the robot
   * @returns {Map} Map of trajectories for the specified robot
   */
  getRobotTrajectories(robotId) {
    if (!this.trajectories.has(robotId)) {
      this.trajectories.set(robotId, new Map());
    }
    return this.trajectories.get(robotId);
  }

  /**
   * Start recording a new trajectory
   * @param {string} trajectoryName - The name of the trajectory
   * @param {Object} options - Recording options (robot, robotId, interval, getJointValues, getTCPPosition)
   * @returns {boolean} Whether recording started successfully
   */
  startRecording(trajectoryName, options = {}) {
    const { 
      robot, 
      robotId, 
      interval = 100,
      getJointValues,
      getTCPPosition
    } = options;
    
    if (!robot || !robotId) {
      console.error('Robot and robotId required for recording');
      return false;
    }

    // Stop any existing recording for THIS robot only
    if (this.recordingStates.has(robotId)) {
      this.stopRecording(robotId);
    }

    // Create recording state for this robot
    const recordingState = {
      name: trajectoryName,
      robotId: robotId,
      robot: robot,
      interval: interval,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      getJointValues: getJointValues, // Store the getter functions
      getTCPPosition: getTCPPosition
    };

    // Start recording interval
    recordingState.intervalId = setInterval(() => {
      this._recordFrame(robotId);
    }, interval);

    // Store robot-specific recording state
    this.recordingStates.set(robotId, recordingState);

    console.log(`Started recording trajectory "${trajectoryName}" for robot ${robotId}`);
    return true;
  }

  /**
   * Record a single frame for a robot
   * @private
   * @param {string} robotId - The ID of the robot
   */
  _recordFrame(robotId) {
    const recordingState = this.recordingStates.get(robotId);
    if (!recordingState) return;

    const { 
      startTime, 
      frames, 
      endEffectorPath,
      getJointValues,
      getTCPPosition
    } = recordingState;

    // Get current joint values using the provided function
    const jointValues = getJointValues ? getJointValues() : {};

    // Get TCP position using the provided function
    const tcpPos = getTCPPosition ? getTCPPosition() : { x: 0, y: 0, z: 0 };

    const timestamp = Date.now() - startTime;

    frames.push({
      timestamp,
      jointValues
    });

    endEffectorPath.push({
      timestamp,
      position: {
        x: tcpPos.x,
        y: tcpPos.y,
        z: tcpPos.z
      }
    });

    // Emit update event
    EventBus.emit('trajectory:recording-update', {
      robotId,
      trajectoryName: recordingState.name,
      currentTime: timestamp,
      frames: frames.length
    });

    console.log(`Recorded frame ${frames.length} at ${timestamp}ms - TCP: [${tcpPos.x.toFixed(3)}, ${tcpPos.y.toFixed(3)}, ${tcpPos.z.toFixed(3)}]`);
  }

  /**
   * Stop recording for a specific robot
   * @param {string} robotId - The ID of the robot
   * @returns {Object|null} The recorded trajectory, or null if not recording
   */
  stopRecording(robotId) {
    const recordingState = this.recordingStates.get(robotId);
    if (!recordingState) return null;

    clearInterval(recordingState.intervalId);

    const trajectory = {
      name: recordingState.name,
      robotId: recordingState.robotId,
      frames: recordingState.frames,
      endEffectorPath: recordingState.endEffectorPath,
      duration: Date.now() - recordingState.startTime,
      recordedAt: new Date().toISOString()
    };

    // Save to robot-specific storage
    const robotTrajectories = this.getRobotTrajectories(recordingState.robotId);
    robotTrajectories.set(trajectory.name, trajectory);

    // Clear recording state for this robot
    this.recordingStates.delete(robotId);
    
    console.log(`Stopped recording for robot ${robotId}. Captured ${trajectory.frames.length} keyframes`);
    return trajectory;
  }

  /**
   * Play a recorded trajectory
   * @param {string} name - The name of the trajectory to play
   * @param {Object} robot - The robot to apply the trajectory to
   * @param {string} robotId - The ID of the robot
   * @param {Object} [options] - Playback options (speed, loop, onComplete, onFrame, setJointValues)
   * @returns {boolean} Whether playback started successfully
   */
  playTrajectory(name, robot, robotId, options = {}) {
    // Only stop playback for THIS robot
    if (this.playbackStates.has(robotId)) {
      this.stopPlayback(robotId);
    }
    
    // Get robot-specific trajectory
    const trajectory = this.getTrajectory(name, robotId);
    if (!trajectory) {
      console.error(`Trajectory "${name}" not found for robot ${robotId}`);
      return false;
    }

    const {
      speed = 1.0,
      loop = false,
      onComplete = () => {},
      onFrame = () => {},
      setJointValues
    } = options;

    // Create playback state for this robot
    const playbackState = {
      trajectory: trajectory,
      robot: robot,
      robotId: robotId,
      currentFrameIndex: 0,
      startTime: Date.now(),
      speed: speed,
      loop: loop,
      onComplete: onComplete,
      onFrame: onFrame,
      isPlaying: true,
      setJointValues: setJointValues || ((values) => robot.setJointValues(values))
    };

    // Store robot-specific playback state
    this.playbackStates.set(robotId, playbackState);

    console.log(`Starting playback of trajectory "${name}" for robot ${robotId} with ${trajectory.frames.length} keyframes`);
    
    // Start playback for this robot
    this._playbackFrame(robotId);
    return true;
  }

  /**
   * Handle playback animation frame for a specific robot
   * @private
   * @param {string} robotId - The ID of the robot
   */
  _playbackFrame(robotId) {
    const playbackState = this.playbackStates.get(robotId);
    if (!playbackState || !playbackState.isPlaying) return;

    const {
      trajectory,
      robot,
      currentFrameIndex,
      startTime,
      speed,
      loop,
      onComplete,
      onFrame,
      setJointValues
    } = playbackState;

    // Check if trajectory exists and has frames
    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.error('Invalid trajectory data');
      this.stopPlayback(robotId);
      return;
    }

    const elapsed = (Date.now() - startTime) * speed;
    
    // Find the appropriate frame based on elapsed time
    let targetFrameIndex = 0;
    for (let i = 0; i < trajectory.frames.length; i++) {
      if (trajectory.frames[i].timestamp <= elapsed) {
        targetFrameIndex = i;
      } else {
        break;
      }
    }

    // Apply joint values using the custom setter
    if (targetFrameIndex < trajectory.frames.length) {
      const frame = trajectory.frames[targetFrameIndex];
      if (frame && frame.jointValues) {
        setJointValues(frame.jointValues);
      }
    }

    // Call frame callback
    onFrame(trajectory.frames[targetFrameIndex]);

    // Update progress
    const progress = targetFrameIndex / (trajectory.frames.length - 1);
    EventBus.emit('trajectory:playback-update', {
      robotId,
      progress,
      currentFrame: targetFrameIndex,
      totalFrames: trajectory.frames.length
    });

    // Check if we've reached the end
    if (targetFrameIndex >= trajectory.frames.length - 1) {
      if (loop) {
        // Reset playback for looping
        playbackState.startTime = Date.now();
        playbackState.currentFrameIndex = 0;
      } else {
        // End playback
        this.stopPlayback(robotId);
        onComplete();
        return;
      }
    }

    // Schedule next frame
    requestAnimationFrame(() => this._playbackFrame(robotId));
  }

  /**
   * Stop playback for a specific robot
   * @param {string} robotId - The ID of the robot
   * @returns {boolean} Whether playback was stopped
   */
  stopPlayback(robotId) {
    const playbackState = this.playbackStates.get(robotId);
    if (!playbackState) return false;

    playbackState.isPlaying = false;
    this.playbackStates.delete(robotId);
    
    console.log(`Stopped playback for robot ${robotId}`);
    return true;
  }

  /**
   * Check if a robot is currently playing
   * @param {string} robotId - The ID of the robot
   * @returns {boolean} Whether the robot is playing
   */
  isPlaying(robotId) {
    return this.playbackStates.has(robotId) && this.playbackStates.get(robotId).isPlaying;
  }

  /**
   * Check if a robot is currently recording
   * @param {string} robotId - The ID of the robot
   * @returns {boolean} Whether the robot is recording
   */
  isRecording(robotId) {
    return this.recordingStates.has(robotId);
  }

  /**
   * Reset all states and data
   */
  reset() {
    // Stop all recordings
    for (const robotId of this.recordingStates.keys()) {
      this.stopRecording(robotId);
    }
    
    // Stop all playbacks
    for (const robotId of this.playbackStates.keys()) {
      this.stopPlayback(robotId);
    }
    
    // Clear all data
    this.trajectories.clear();
    this.recordingStates.clear();
    this.playbackStates.clear();
  }

  /**
   * Get the joint values from a robot
   * @private
   * @param {Object} robot - The robot to get joint values from
   * @returns {Object} Map of joint names to values
   */
  _getJointValues(robot) {
    if (!robot || !robot.joints) return {};
    
    const values = {};
    Object.entries(robot.joints).forEach(([name, joint]) => {
      if (joint.jointType !== 'fixed') {
        values[name] = joint.angle;
      }
    });
    
    return values;
  }

  /**
   * Get end effector position using TCPProvider via EventBus
   * @param {Object} robot - Robot instance
   * @returns {Promise<Object>} Position {x, y, z}
   */
  _getEndEffectorPosition(robot) {
    try {
      // Request real-time TCP position from TCPProvider
      return new Promise((resolve) => {
        const requestId = `tcp_traj_${Date.now()}`;
        
        // Set up one-time listener for response
        const unsubscribe = EventBus.on('tcp:realtime-result', (data) => {
          if (data.requestId === requestId) {
            unsubscribe();
            resolve(data.position || { x: 0, y: 0, z: 0 });
          }
        });
        
        // Request calculation
        EventBus.emit('tcp:calculate-realtime', { robot, requestId });
        
        // Timeout fallback
        setTimeout(() => {
          unsubscribe();
          resolve({ x: 0, y: 0, z: 0 });
        }, 100);
      });
    } catch (error) {
      console.warn('Error getting end effector position:', error);
      return { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Apply joint values to a robot
   * @private
   * @param {Object} jointValues - Map of joint names to values
   * @param {Object} robot - The robot to apply values to
   */
  _applyJointValues(jointValues, robot) {
    if (!robot || !robot.setJointValues) {
      console.warn('Cannot apply joint values: invalid robot');
      return;
    }
    
    robot.setJointValues(jointValues);
  }

  /**
   * Export a trajectory to JSON
   * @param {string} name - The name of the trajectory to export
   * @param {string} robotId - The ID of the robot
   * @returns {string|null} JSON string of the trajectory, or null if not found
   */
  exportTrajectory(name, robotId) {
    const trajectory = this.getTrajectory(name, robotId);
    if (!trajectory) return null;
    
    return JSON.stringify(trajectory, null, 2);
  }

  /**
   * Import a trajectory from JSON
   * @param {string} jsonData - JSON string of the trajectory
   * @param {string} [robotId] - Optional robot ID to override trajectory's robotId
   * @returns {Object|null} The imported trajectory, or null if invalid
   */
  importTrajectory(jsonData, robotId) {
    try {
      const trajectory = JSON.parse(jsonData);
      
      // Use provided robotId or the one from trajectory
      const targetRobotId = robotId || trajectory.robotId;
      if (!targetRobotId) {
        console.error('No robot ID specified for import');
        return null;
      }
      
      // Store in robot-specific storage
      const robotTrajectories = this.getRobotTrajectories(targetRobotId);
      robotTrajectories.set(trajectory.name, trajectory);
      
      console.log(`Imported trajectory "${trajectory.name}" for robot ${targetRobotId}`);
      return trajectory;
    } catch (error) {
      console.error('Error importing trajectory:', error);
      return null;
    }
  }

  /**
   * Delete a trajectory
   * @param {string} name - The name of the trajectory
   * @param {string} robotId - The ID of the robot
   * @returns {boolean} Whether the trajectory was deleted
   */
  deleteTrajectory(name, robotId) {
    if (!robotId) return false;
    const robotTrajectories = this.getRobotTrajectories(robotId);
    return robotTrajectories.delete(name);
  }

  /**
   * Get all trajectory names for a specific robot
   * @param {string} robotId - The ID of the robot
   * @returns {string[]} Array of trajectory names
   */
  getTrajectoryNames(robotId) {
    if (!robotId) return [];
    const robotTrajectories = this.getRobotTrajectories(robotId);
    return Array.from(robotTrajectories.keys());
  }

  /**
   * Get a specific trajectory
   * @param {string} name - The name of the trajectory
   * @param {string} robotId - The ID of the robot
   * @returns {Object|null} The trajectory, or null if not found
   */
  getTrajectory(name, robotId) {
    if (!robotId) return null;
    const robotTrajectories = this.getRobotTrajectories(robotId);
    return robotTrajectories.get(name);
  }

  /**
   * Get end effector path of a trajectory
   * @param {string} name - The name of the trajectory
   * @returns {Array|null} Array of position points, or null if not found
   */
  getEndEffectorPath(name) {
    if (!this.trajectories.has(name)) {
      console.warn(`Trajectory '${name}' not found`);
      return null;
    }
    
    const trajectory = this.trajectories.get(name);
    return trajectory.endEffectorPath || [];
  }
}

// Create singleton instance
const trajectoryAPI = new TrajectoryAPI();
export default trajectoryAPI;