// src/contexts/dataTransfer.js
/**
 * MODULAR EventBus Contract - Centralized Event Architecture
 * 
 * This file defines all EventBus events used across the application, organized into
 * modular namespaces. Each namespace represents a specific domain/context and can be
 * imported and extended independently.
 * 
 * ARCHITECTURE:
 * - Each context (Robot, Viewer, TCP, etc.) has its own event namespace
 * - Events are categorized as: System Events, State Events, Commands, and Responses
 * - Legacy exports are maintained for backward compatibility
 * - Utility functions help with common event patterns
 * 
 * USAGE PATTERNS:
 * 
 * 1. Import specific namespaces:
 *    import { RobotEvents, TCPEvents } from './dataTransfer';
 * 
 * 2. Emit events:
 *    EventBus.emit(RobotEvents.LOADED, { robotId, robot });
 * 
 * 3. Listen to events:
 *    EventBus.on(RobotEvents.Commands.MOVE_JOINT, (payload) => {
 *      console.log(payload.robotId, payload.jointName, payload.value);
 *    });
 * 
 * 4. Command/Response pattern:
 *    createRequest(RobotEvents.GET_JOINT_VALUES, 
 *      { robotId: 'ur5_001' }, 
 *      (response) => console.log(response.values)
 *    );
 * 
 * 5. Extend namespaces:
 *    RobotEvents.MY_CUSTOM_EVENT = 'robot:my-custom-event';
 * 
 * @module dataTransfer
 */

import EventBus from '../utils/EventBus';

// ============================================
// ROBOT EVENTS
// ============================================
/**
 * Robot-related events namespace
 * 
 * Handles all robot lifecycle, state changes, joint control, and workspace management.
 * Primary consumers: RobotContext, UI Components
 * 
 * @namespace RobotEvents
 */
export const RobotEvents = {
  // ========== System Events ==========
  NEEDS_SCENE: 'robot:needs-scene',
  LOADED: 'robot:loaded',
  UNLOADED: 'robot:unloaded',
  REMOVED: 'robot:removed',
  REGISTERED: 'robot:registered',
  ACTIVE_CHANGED: 'robot:active-changed',
  JOINTS_CHANGED: 'robot:joints-changed',
  JOINTS_RESET: 'robot:joints-reset',
  WORKSPACE_UPDATED: 'robot:workspace-updated',
  DISCOVERY_COMPLETE: 'robot:discovery-complete',
  MANAGER_SYNCED: 'robot:manager-synced',
  
  // ========== State Events ==========
  LOADING_STATE_CHANGED: 'robot:loading-state-changed',
  POSITION_CHANGED: 'robot:position-changed',
  
  // ========== Robot Instance Management ==========
  GET_INSTANCE_REQUEST: 'robot:get-instance-request',
  GET_INSTANCE_RESPONSE: 'robot:get-instance-response',
  
  // ========== Joint Commands ==========
  SET_JOINT_VALUE: 'robot:set-joint-value',
  SET_JOINT_VALUES: 'robot:set-joint-values',
  GET_JOINT_VALUES: 'robot:get-joint-values',
  
  // ========== Workspace Events ==========
  WORKSPACE_UPDATED: 'robot:workspace-updated',
  
  // ========== Commands (Requests) ==========
  Commands: {
    MOVE_JOINT: 'robot:command:move-joint',
    MOVE_JOINTS: 'robot:command:move-joints',
    REQUEST_JOINTS: 'robot:command:request-joints',
    LOAD: 'robot:command:load',
    UNLOAD: 'robot:command:unload',
    SET_ACTIVE: 'robot:command:set-active',
    RESET_JOINTS: 'robot:command:reset-joints',
    ADD_TO_WORKSPACE: 'robot:command:add-to-workspace',
    REMOVE_FROM_WORKSPACE: 'robot:command:remove-from-workspace',
    DISCOVER: 'robot:command:discover',
    SET_POSITION: 'robot:command:set-position',
    SET_POSE: 'robot:set-pose',
    GET_POSE: 'robot:get-pose',
    POSE_UPDATED: 'robot:pose-updated'
  },
  
  // ========== Responses ==========
  Responses: {
    JOINT_VALUES: 'robot:response:joint-values'
  },
  
  // ========== Commands (Requests) ==========
  NEEDS_REMOVAL: 'robot:needs-removal',
  NEEDS_ADDITION: 'robot:needs-addition'
};

/**
 * Helper to emit a robot:needs-removal handshake event with a unique requestId.
 * @param {string} robotId - The robot's unique ID.
 * @returns {string} requestId - The unique request ID used for the handshake.
 */
export function emitRobotNeedsRemoval(robotId) {
  const requestId = `remove-${robotId}-${Date.now()}`;
  EventBus.emit(RobotEvents.NEEDS_REMOVAL, { robotId, requestId });
  return requestId;
}

/**
 * Helper to emit a robot:needs-addition handshake event with a unique requestId.
 * @param {string} robotId - The robot's unique ID.
 * @param {string} urdfPath - The URDF path for the robot.
 * @param {Object} [options] - Additional options.
 * @returns {string} requestId - The unique request ID used for the handshake.
 */
export function emitRobotNeedsAddition(robotId, urdfPath, options = {}) {
  const requestId = `add-${robotId}-${Date.now()}`;
  EventBus.emit(RobotEvents.NEEDS_ADDITION, { robotId, urdfPath, options, requestId });
  return requestId;
}

// ============================================
// VIEWER EVENTS
// ============================================
/**
 * Viewer and 3D scene events namespace
 * 
 * Handles scene initialization, configuration, drag controls, and table management.
 * Primary consumers: ViewerContext, RobotContext, TCPContext
 * 
 * @namespace ViewerEvents
 */
export const ViewerEvents = {
  READY: 'viewer:ready',
  HERE_IS_SCENE: 'viewer:here-is-the-scene',
  ROBOT_LOAD_ERROR: 'viewer:robot-load-error',
  JOINTS_RESET: 'viewer:joints-reset',
  TABLE_LOADED: 'viewer:table-loaded',
  TABLE_TOGGLED: 'viewer:table-toggled',
  ROBOT_REMOVED: 'viewer:robot-removed',
  ROBOT_ADDED: 'viewer:robot-added'
};

// ============================================
// ENVIRONMENT EVENTS
// ============================================
/**
 * Environment object events namespace
 * 
 * Handles spawning, removing, and selecting environment objects.
 * Primary consumers: EnvironmentContext, UI components
 * 
 * @namespace EnvironmentEvents
 */
export const EnvironmentEvents = {
  OBJECT_SPAWNED: 'environment:object-spawned',
  OBJECT_REMOVED: 'environment:object-removed',
  OBJECT_SELECTED: 'environment:object-selected'
};

// ============================================
// SCENE EVENTS
// ============================================
/**
 * Scene registry events namespace
 * 
 * Handles object registration/unregistration in scene.
 * Primary consumers: EnvironmentContext, Debug tools
 * 
 * @namespace SceneEvents
 */
export const SceneEvents = {
  OBJECT_REGISTERED: 'scene:object-registered',
  OBJECT_UNREGISTERED: 'scene:object-unregistered',
  OBJECT_UPDATED: 'scene:object-updated'
};

// ============================================
// HUMAN EVENTS
// ============================================
/**
 * Human character events namespace
 * 
 * Handles human spawning, movement, and selection.
 * Primary consumers: EnvironmentContext, HumanController
 * 
 * @namespace HumanEvents
 */
export const HumanEvents = {
  SPAWNED: 'human:spawned',
  REMOVED: 'human:removed',
  SELECTED: 'human:selected',
  positionUpdate: (id) => `human:position-update:${id}`,
  createPositionEventName: (id) => `human:position-update:${id}`
};

// ============================================
// WORLD EVENTS
// ============================================
/**
 * World visualization events namespace
 * 
 * Handles world environment settings like grid, ground, gravity.
 * Primary consumers: WorldContext, Physics systems
 * 
 * @namespace WorldEvents
 */
export const WorldEvents = {
  FULLY_LOADED: 'world:fully-loaded'
};

// ============================================
// TCP EVENTS
// ============================================
/**
 * TCP events namespace
 * 
 * Handles TCP connection and tool management.
 * Primary consumers: TCPContext
 * 
 * @namespace TCPEvents
 */
export const TCPEvents = {
  ENDEFFECTOR_UPDATED: 'tcp:endeffector-updated',
  FORCE_RECALCULATE: 'tcp:force-recalculate',
  MOUNT: 'tcp:mount',
  UNMOUNT: 'tcp:unmount',
  MOUNT_STATUS: 'tcp:mount:status',
  UNMOUNT_STATUS: 'tcp:unmount:status',
};

// ============================================
// TRAJECTORY EVENTS
// ============================================
/**
 * Trajectory events namespace
 * 
 * Handles trajectory recording and playback.
 * Primary consumers: TrajectoryContext
 * 
 * @namespace TrajectoryEvents
 */
export const TrajectoryEvents = {
  FRAME_RECORDED: 'trajectory:frame-recorded',
  PLAYBACK_STOPPED: 'trajectory:playback-stopped',
  PLAYBACK_COMPLETED: 'trajectory:playback-completed',
  REQUEST_STATE: 'trajectory:request-state',
};