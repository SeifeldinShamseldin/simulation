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
  // ========== Robot Instance Management ==========
  GET_INSTANCE_REQUEST: 'robot:get-instance-request',
  GET_INSTANCE_RESPONSE: 'robot:get-instance-response',
  // ========== Joint Commands ==========
  SET_JOINT_VALUE: 'robot:set-joint-value',
  SET_JOINT_VALUES: 'robot:set-joint-values',
  GET_JOINT_VALUES: 'robot:get-joint-values',
  // ========== Commands (Requests) ==========
  Commands: {
    SET_POSE: 'robot:set-pose',
    POSE_UPDATED: 'robot:pose-updated'
  },
  // ========== Commands (Requests) ==========
  NEEDS_REMOVAL: 'robot:needs-removal'
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
  ROBOT_ADDED: 'viewer:robot-added',
  SCENE_STATUS: 'viewer:scene:status',
  INITIALIZED: 'viewer:initialized',
  CONFIG_UPDATED: 'viewer:config-updated',
  DRAG_START: 'viewer:drag-start',
  DRAG_END: 'viewer:drag-end',
  JOINT_VALUES_UPDATED: 'viewer:joint-values-updated',
  DISPOSED: 'viewer:disposed'
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
// ENDEFFECTOR EVENTS
// ============================================
/**
 * EndEffector events namespace
 * Handles end effector data requests and updates.
 * Primary consumers: EndEffectorContext, Controls
 * @namespace EndEffectorEvents
 */
export const EndEffectorEvents = {
  SET: 'EndEffector/SET',
  GET: 'EndEffector/GET'
};