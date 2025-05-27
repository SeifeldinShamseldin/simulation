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
    
    this.trajectories = new Map(); // Store trajectories by name
    this.recording = false;
    this.currentTrajectory = null;
    this.currentTrajectoryName = '';
    this.recordingStartTime = 0;
    this.recordingInterval = null;
    this.playback = {
      active: false,
      trajectoryName: '',
      startTime: 0,
      duration: 0,
      animationFrameId: null,
      robot: null,
      onComplete: null
    };
    
    // Callbacks
    this.onRecordUpdate = null;
    this.onPlaybackUpdate = null;
  }

  /**
   * Start recording a new trajectory
   * @param {string} name - The name of the trajectory
   * @param {Object} options - Recording options (robot, interval)
   * @returns {boolean} Whether recording started successfully
   */
  startRecording(name, options = {}) {
    if (this.recording || this.playback.active) {
      console.warn('Cannot start recording: already recording or playing back');
      return false;
    }
    
    if (!name) {
      console.warn('Cannot start recording: no name provided');
      return false;
    }
    
    // Initialize new trajectory
    this.currentTrajectoryName = name;
    this.currentTrajectory = {
      name,
      keyframes: [],
      duration: 0,
      endEffectorPath: [] // Add end effector path tracking
    };
    
    this.recording = true;
    this.recordingStartTime = Date.now();
    
    // Set up automatic recording if interval is specified
    const interval = options.interval || 0;
    if (interval > 0 && options.robot) {
      this.recordingInterval = setInterval(() => {
        const jointValues = this._getJointValues(options.robot);
        this.recordKeyframe(jointValues, null, options.robot);
      }, interval);
    }
    
    console.log(`Started recording trajectory '${name}'`);
    return true;
  }

  /**
   * Add current joint values to trajectory
   * @param {Object} jointValues - Map of joint names to values
   * @param {number} [timestamp] - Timestamp for the keyframe (default: current time relative to start)
   * @param {Object} [robot] - Robot to get end effector position from
   * @returns {Promise<boolean>} Whether keyframe was added successfully
   */
  async recordKeyframe(jointValues, timestamp = null, robot = null) {
    if (!this.recording || !this.currentTrajectory) {
      console.warn('Cannot record keyframe: not recording');
      return false;
    }
    
    // Calculate timestamp if not provided
    const time = timestamp !== null ? timestamp : Date.now() - this.recordingStartTime;
    
    // Get end effector position from TCPProvider
    let endEffectorPosition = null;
    if (robot) {
      endEffectorPosition = await this._getEndEffectorPosition(robot);
    }
    
    // Add keyframe
    this.currentTrajectory.keyframes.push({
      timestamp: time,
      jointValues: {...jointValues},
      endEffectorPosition
    });
    
    // Add to end effector path if position is available
    if (endEffectorPosition) {
      this.currentTrajectory.endEffectorPath.push({
        time,
        position: {...endEffectorPosition}
      });
    }
    
    // Update duration
    this.currentTrajectory.duration = Math.max(
      this.currentTrajectory.duration,
      time
    );
    
    // Notify listeners
    if (this.onRecordUpdate) {
      this.onRecordUpdate(this.currentTrajectory);
    }
    
    return true;
  }

  /**
   * Stop recording
   * @returns {Object|null} The recorded trajectory, or null if not recording
   */
  stopRecording() {
    if (!this.recording) {
      console.warn('Cannot stop recording: not recording');
      return null;
    }
    
    // Clear automatic recording interval if active
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    
    // Finalize trajectory
    const trajectory = {...this.currentTrajectory};
    
    // Store trajectory
    this.trajectories.set(trajectory.name, trajectory);
    
    // Reset recording state
    this.recording = false;
    this.currentTrajectory = null;
    this.currentTrajectoryName = '';
    this.recordingStartTime = 0;
    
    console.log(`Stopped recording trajectory '${trajectory.name}' with ${trajectory.keyframes.length} keyframes`);
    return trajectory;
  }

  /**
   * Play a recorded trajectory
   * @param {string} name - The name of the trajectory to play
   * @param {Object} robot - The robot to apply the trajectory to
   * @param {Object} [options] - Playback options (speed, loop, onComplete)
   * @returns {boolean} Whether playback started successfully
   */
  playTrajectory(name, robot, options = {}) {
    if (this.recording || this.playback.active) {
      console.warn('Cannot play trajectory: already recording or playing back');
      return false;
    }
    
    if (!this.trajectories.has(name)) {
      console.warn(`Cannot play trajectory: '${name}' not found`);
      return false;
    }
    
    const trajectory = this.trajectories.get(name);
    if (!trajectory.keyframes.length) {
      console.warn(`Cannot play trajectory: '${name}' has no keyframes`);
      return false;
    }
    
    // Set up playback
    this.playback = {
      active: true,
      trajectoryName: name,
      startTime: Date.now(),
      duration: trajectory.duration,
      speed: options.speed || 1.0,
      loop: options.loop || false,
      robot,
      onComplete: options.onComplete || null,
      currentEndEffectorPosition: null // Track current end effector position
    };
    
    // Start animation loop
    this._playbackFrame();
    
    console.log(`Started playing trajectory '${name}'`);
    return true;
  }

  /**
   * Handle playback animation frame
   * @private
   */
  _playbackFrame() {
    if (!this.playback.active) return;
    
    const trajectory = this.trajectories.get(this.playback.trajectoryName);
    const elapsed = (Date.now() - this.playback.startTime) * this.playback.speed;
    
    // Check if playback is complete
    if (elapsed >= trajectory.duration && !this.playback.loop) {
      this._completePlayback();
      return;
    }
    
    // Calculate current time in the trajectory (with looping)
    const currentTime = this.playback.loop ? 
      elapsed % trajectory.duration : 
      Math.min(elapsed, trajectory.duration);
    
    // Find the keyframes before and after the current time
    const keyframes = trajectory.keyframes;
    let prevKeyframe = null;
    let nextKeyframe = null;
    
    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].timestamp <= currentTime) {
        prevKeyframe = keyframes[i];
      }
      
      if (keyframes[i].timestamp >= currentTime && (!nextKeyframe || keyframes[i].timestamp < nextKeyframe.timestamp)) {
        nextKeyframe = keyframes[i];
      }
    }
    
    // Apply interpolated joint values
    if (prevKeyframe && nextKeyframe && prevKeyframe !== nextKeyframe) {
      const t = (currentTime - prevKeyframe.timestamp) / (nextKeyframe.timestamp - prevKeyframe.timestamp);
      const interpolatedValues = this._interpolateJointValues(prevKeyframe.jointValues, nextKeyframe.jointValues, t);
      this._applyJointValues(interpolatedValues, this.playback.robot);
      
      // Interpolate end effector position if available
      if (prevKeyframe.endEffectorPosition && nextKeyframe.endEffectorPosition) {
        this.playback.currentEndEffectorPosition = this._interpolatePosition(
          prevKeyframe.endEffectorPosition,
          nextKeyframe.endEffectorPosition,
          t
        );
      }
    } else if (prevKeyframe) {
      this._applyJointValues(prevKeyframe.jointValues, this.playback.robot);
      if (prevKeyframe.endEffectorPosition) {
        this.playback.currentEndEffectorPosition = {...prevKeyframe.endEffectorPosition};
      }
    }
    
    // Update end effector position if not available from trajectory
    if (!this.playback.currentEndEffectorPosition && this.playback.robot) {
      this.playback.currentEndEffectorPosition = this._getEndEffectorPosition(this.playback.robot);
    }
    
    // Notify listeners
    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate({
        trajectoryName: this.playback.trajectoryName,
        currentTime,
        duration: trajectory.duration,
        progress: currentTime / trajectory.duration,
        endEffectorPosition: this.playback.currentEndEffectorPosition
      });
    }
    
    // Continue animation
    this.playback.animationFrameId = requestAnimationFrame(() => this._playbackFrame());
  }

  /**
   * Complete playback and clean up
   * @private
   */
  _completePlayback() {
    const onComplete = this.playback.onComplete;
    
    // Reset playback state
    this.playback = {
      active: false,
      trajectoryName: '',
      startTime: 0,
      duration: 0,
      animationFrameId: null,
      robot: null,
      onComplete: null,
      currentEndEffectorPosition: null
    };
    
    // Notify completion callback
    if (onComplete) {
      onComplete();
    }
    
    console.log('Playback complete');
  }

  /**
   * Stop playback
   * @returns {boolean} Whether playback was stopped
   */
  stopPlayback() {
    if (!this.playback.active) {
      console.warn('Cannot stop playback: not playing');
      return false;
    }
    
    // Cancel animation frame
    if (this.playback.animationFrameId) {
      cancelAnimationFrame(this.playback.animationFrameId);
    }
    
    // Reset playback state
    const trajectoryName = this.playback.trajectoryName;
    this.playback = {
      active: false,
      trajectoryName: '',
      startTime: 0,
      duration: 0,
      animationFrameId: null,
      robot: null,
      onComplete: null,
      currentEndEffectorPosition: null
    };
    
    console.log(`Stopped playing trajectory '${trajectoryName}'`);
    return true;
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
   * Interpolate between two sets of joint values
   * @private
   * @param {Object} values1 - First set of joint values
   * @param {Object} values2 - Second set of joint values
   * @param {number} t - Interpolation factor (0-1)
   * @returns {Object} Interpolated joint values
   */
  _interpolateJointValues(values1, values2, t) {
    const result = {};
    
    // Combine all joint names from both sets
    const allJoints = new Set([
      ...Object.keys(values1),
      ...Object.keys(values2)
    ]);
    
    // Interpolate each joint value
    allJoints.forEach(joint => {
      const v1 = values1[joint] !== undefined ? values1[joint] : values2[joint];
      const v2 = values2[joint] !== undefined ? values2[joint] : values1[joint];
      
      // If both values exist, interpolate
      if (v1 !== undefined && v2 !== undefined) {
        result[joint] = v1 + (v2 - v1) * t;
      } 
      // Otherwise use whichever value exists
      else if (v1 !== undefined) {
        result[joint] = v1;
      } else if (v2 !== undefined) {
        result[joint] = v2;
      }
    });
    
    return result;
  }

  /**
   * Interpolate between two positions
   * @private
   * @param {Object} pos1 - First position {x, y, z}
   * @param {Object} pos2 - Second position {x, y, z}
   * @param {number} t - Interpolation factor (0-1)
   * @returns {Object} Interpolated position {x, y, z}
   */
  _interpolatePosition(pos1, pos2, t) {
    return {
      x: pos1.x + (pos2.x - pos1.x) * t,
      y: pos1.y + (pos2.y - pos1.y) * t,
      z: pos1.z + (pos2.z - pos1.z) * t
    };
  }

  /**
   * Export a trajectory to JSON
   * @param {string} name - The name of the trajectory to export
   * @returns {string|null} JSON string of the trajectory, or null if not found
   */
  exportTrajectory(name) {
    if (!this.trajectories.has(name)) {
      console.warn(`Cannot export trajectory: '${name}' not found`);
      return null;
    }
    
    const trajectory = this.trajectories.get(name);
    return JSON.stringify(trajectory);
  }

  /**
   * Import a trajectory from JSON
   * @param {string} json - JSON string of the trajectory
   * @returns {Object|null} The imported trajectory, or null if invalid
   */
  importTrajectory(json) {
    try {
      const trajectory = JSON.parse(json);
      
      if (!trajectory.name || !Array.isArray(trajectory.keyframes)) {
        console.warn('Cannot import trajectory: invalid format');
        return null;
      }
      
      // Ensure endEffectorPath exists
      if (!trajectory.endEffectorPath) {
        trajectory.endEffectorPath = [];
        
        // Try to construct endEffectorPath from keyframes
        trajectory.keyframes.forEach(keyframe => {
          if (keyframe.endEffectorPosition) {
            trajectory.endEffectorPath.push({
              time: keyframe.timestamp,
              position: keyframe.endEffectorPosition
            });
          }
        });
      }
      
      // Store trajectory
      this.trajectories.set(trajectory.name, trajectory);
      console.log(`Imported trajectory '${trajectory.name}'`);
      return trajectory;
    } catch (error) {
      console.error('Cannot import trajectory:', error);
      return null;
    }
  }

  /**
   * Delete a trajectory
   * @param {string} name - The name of the trajectory to delete
   * @returns {boolean} Whether the trajectory was deleted
   */
  deleteTrajectory(name) {
    if (!this.trajectories.has(name)) {
      console.warn(`Cannot delete trajectory: '${name}' not found`);
      return false;
    }
    
    this.trajectories.delete(name);
    console.log(`Deleted trajectory '${name}'`);
    return true;
  }

  /**
   * Get all trajectory names
   * @returns {string[]} Array of trajectory names
   */
  getTrajectoryNames() {
    return Array.from(this.trajectories.keys());
  }

  /**
   * Get specific trajectory data
   * @param {string} name - The name of the trajectory
   * @returns {Object|null} The trajectory, or null if not found
   */
  getTrajectory(name) {
    if (!this.trajectories.has(name)) {
      console.warn(`Trajectory '${name}' not found`);
      return null;
    }
    
    return {...this.trajectories.get(name)};
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

  /**
   * Check if currently recording
   * @returns {boolean} Whether currently recording
   */
  isRecording() {
    return this.recording;
  }

  /**
   * Check if currently playing back
   * @returns {boolean} Whether currently playing back
   */
  isPlaying() {
    return this.playback.active;
  }

  /**
   * Register a callback for recording updates
   * @param {Function} callback - Function to call when recording updates
   */
  registerRecordUpdateCallback(callback) {
    this.onRecordUpdate = callback;
  }

  /**
   * Register a callback for playback updates
   * @param {Function} callback - Function to call when playback updates
   */
  registerPlaybackUpdateCallback(callback) {
    this.onPlaybackUpdate = callback;
  }
}

// Create singleton instance
const trajectoryAPI = new TrajectoryAPI();
export default trajectoryAPI;