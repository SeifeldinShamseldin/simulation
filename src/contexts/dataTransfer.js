// src/contexts/dataTransfer.js
// GLOBAL EventBus Contract & Shared Utilities
//
// This file documents all EventBus events used across contexts.
// Each context section is independent and shows:
// - What events it EMITS (outgoing data)
// - What events it LISTENS TO (incoming data)
//
// Usage:
//   import * as DataTransfer from './dataTransfer';
//   EventBus.emit(DataTransfer.EVENT_ROBOT_LOADED, payload);

// ============================================
// ROBOT CONTEXT
// ============================================

// --- EVENTS EMITTED BY ROBOT CONTEXT ---

/**
 * EVENT: robot:needs-scene
 * EMITTED BY: RobotContext
 * LISTENED BY: ViewerContext
 * 
 * PURPOSE: Request access to the 3D scene from ViewerContext
 * WHEN: On RobotContext initialization when it needs to load robots
 * 
 * PAYLOAD: {
 *   requestId: String  // Unique ID to match request/response
 * }
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, { 
 *   requestId: `req-scene-${Date.now()}` 
 * });
 */
export const EVENT_ROBOT_NEEDS_SCENE = 'robot:needs-scene';

/**
 * EVENT: robot:loaded
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, ViewerContext, others
 * 
 * PURPOSE: Announce that a robot has been successfully loaded
 * WHEN: After a robot URDF is loaded and added to the scene
 * 
 * PAYLOAD: {
 *   robotId: String,      // Unique identifier for the robot
 *   robotName: String,    // Display name of the robot
 *   robot: Object         // THREE.js robot object with joints
 * }
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_ROBOT_LOADED, { 
 *   robotId: 'ur5_123456',
 *   robotName: 'UR5',
 *   robot: robotObject 
 * });
 */
export const EVENT_ROBOT_LOADED = 'robot:loaded';

/**
 * EVENT: robot:unloaded
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, ViewerContext, others
 * 
 * PURPOSE: Announce that a robot has been removed from the scene
 * WHEN: When unloadRobot() is called
 * 
 * PAYLOAD: {
 *   robotId: String  // ID of the robot that was unloaded
 * }
 */
export const EVENT_ROBOT_UNLOADED = 'robot:unloaded';

/**
 * EVENT: robot:active-changed
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, UI components
 * 
 * PURPOSE: Notify when the active robot selection changes
 * WHEN: When setActiveRobotId() is called
 * 
 * PAYLOAD: {
 *   robotId: String,     // ID of the newly active robot (or null)
 *   robot: Object        // Robot object (or null)
 * }
 */
export const EVENT_ROBOT_ACTIVE_CHANGED = 'robot:active-changed';

/**
 * EVENT: robot:joints-changed
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, UI components
 * 
 * PURPOSE: Notify when robot joint values have been updated
 * WHEN: After setJointValues() successfully updates joints
 * 
 * PAYLOAD: {
 *   robotId: String,        // ID of the robot
 *   robotName: String,      // Name of the robot
 *   values: Object          // { jointName: value, ... }
 * }
 */
export const EVENT_ROBOT_JOINTS_CHANGED = 'robot:joints-changed';

/**
 * EVENT: robot:joints-reset
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, UI components
 * 
 * PURPOSE: Notify when robot joints have been reset to zero
 * WHEN: After resetJoints() is called
 * 
 * PAYLOAD: {
 *   robotId: String,     // ID of the robot
 *   robotName: String    // Name of the robot
 * }
 */
export const EVENT_ROBOT_JOINTS_RESET = 'robot:joints-reset';

/**
 * EVENT: robot:removed
 * EMITTED BY: RobotContext
 * LISTENED BY: ViewerContext, others
 * 
 * PURPOSE: Notify when a robot is removed (unloaded)
 * WHEN: When removeRobot() is called
 * 
 * PAYLOAD: {
 *   robotId: String,     // ID of the removed robot
 *   robotName: String    // Name of the removed robot
 * }
 */
export const EVENT_ROBOT_REMOVED = 'robot:removed';

// --- EVENTS LISTENED TO BY ROBOT CONTEXT ---

/**
 * EVENT: viewer:ready
 * EMITTED BY: ViewerContext
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Signal that the viewer is initialized and ready
 * WHEN: After ViewerContext initializes the 3D scene
 * 
 * EXPECTED PAYLOAD: none
 * 
 * RESPONSE ACTION: RobotContext will emit robot:needs-scene
 */
export const EVENT_VIEWER_READY = 'viewer:ready';

/**
 * EVENT: viewer:here-is-the-scene
 * EMITTED BY: ViewerContext
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Provide scene access in response to robot:needs-scene
 * WHEN: In response to EVENT_ROBOT_NEEDS_SCENE request
 * 
 * EXPECTED PAYLOAD: {
 *   success: Boolean,          // Whether scene is available
 *   requestId: String,         // Matching request ID
 *   payload: {
 *     getSceneSetup: Function  // () => sceneSetup instance
 *   },
 *   error?: String            // Error message if success=false
 * }
 * 
 * RESPONSE ACTION: Initialize URDF loader and process queued robot loads
 */
export const EVENT_VIEWER_HERE_IS_SCENE = 'viewer:here-is-the-scene';

// ============================================
// VIEWER CONTEXT
// ============================================

// --- EVENTS EMITTED BY VIEWER CONTEXT ---

/**
 * EVENT: viewer:ready
 * EMITTED BY: ViewerContext
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Announce viewer initialization is complete
 * WHEN: After scene, camera, renderer are set up
 * 
 * PAYLOAD: none
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_VIEWER_READY);
 */
// Already defined above - reusing constant

/**
 * EVENT: viewer:here-is-the-scene
 * EMITTED BY: ViewerContext
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Provide scene access to requesting context
 * WHEN: In response to robot:needs-scene request
 * 
 * PAYLOAD: {
 *   success: Boolean,          // true if scene is available
 *   requestId: String,         // Echo back the request ID
 *   payload: {
 *     getSceneSetup: Function  // Function returning scene setup
 *   },
 *   error?: String            // Error message if failed
 * }
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
 *   success: true,
 *   requestId: request.requestId,
 *   payload: { getSceneSetup: () => sceneSetupRef.current }
 * });
 */
// Already defined above - reusing constant

/**
 * EVENT: viewer:initialized
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components, debugging tools
 * 
 * PURPOSE: Detailed initialization complete notification
 * WHEN: After initializeViewer() completes
 * 
 * PAYLOAD: {
 *   sceneSetup: Object  // The SceneSetup instance
 * }
 */
export const EVENT_VIEWER_INITIALIZED = 'viewer:initialized';

/**
 * EVENT: viewer:config-updated
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when viewer configuration changes
 * WHEN: After updateViewerConfig() is called
 * 
 * PAYLOAD: {
 *   backgroundColor?: String,
 *   enableShadows?: Boolean,
 *   ambientColor?: String,
 *   upAxis?: String,
 *   highlightColor?: String
 * }
 */
export const EVENT_VIEWER_CONFIG_UPDATED = 'viewer:config-updated';

/**
 * EVENT: viewer:robot-loaded
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when a robot is loaded via viewer
 * WHEN: After loadRobot() completes successfully
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   options: Object  // Loading options used
 * }
 */
export const EVENT_VIEWER_ROBOT_LOADED = 'viewer:robot-loaded';

/**
 * EVENT: viewer:robot-load-error
 * EMITTED BY: ViewerContext
 * LISTENED BY: Error handlers, UI components
 * 
 * PURPOSE: Notify when robot loading fails
 * WHEN: When loadRobot() encounters an error
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   error: Error     // The error object
 * }
 */
export const EVENT_VIEWER_ROBOT_LOAD_ERROR = 'viewer:robot-load-error';

/**
 * EVENT: viewer:joints-reset
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when joints are reset via viewer
 * WHEN: After resetJoints() is called
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_VIEWER_JOINTS_RESET = 'viewer:joints-reset';

/**
 * EVENT: viewer:resized
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components, camera controllers
 * 
 * PURPOSE: Notify when viewer dimensions change
 * WHEN: On window resize
 * 
 * PAYLOAD: {
 *   width: Number,
 *   height: Number
 * }
 */
export const EVENT_VIEWER_RESIZED = 'viewer:resized';

/**
 * EVENT: viewer:disposed
 * EMITTED BY: ViewerContext
 * LISTENED BY: Cleanup handlers
 * 
 * PURPOSE: Notify when viewer is being destroyed
 * WHEN: On dispose() or unmount
 * 
 * PAYLOAD: none
 */
export const EVENT_VIEWER_DISPOSED = 'viewer:disposed';

// --- DRAG CONTROL EVENTS ---

/**
 * EVENT: viewer:drag-start
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when joint dragging starts
 * WHEN: User starts dragging a joint
 * 
 * PAYLOAD: {
 *   joint: Object  // The joint being dragged
 * }
 */
export const EVENT_VIEWER_DRAG_START = 'viewer:drag-start';

/**
 * EVENT: viewer:drag-end
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when joint dragging ends
 * WHEN: User releases a dragged joint
 * 
 * PAYLOAD: {
 *   joint: Object  // The joint that was dragged
 * }
 */
export const EVENT_VIEWER_DRAG_END = 'viewer:drag-end';

/**
 * EVENT: viewer:joint-hover
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when hovering over a joint
 * WHEN: Mouse enters a draggable joint
 * 
 * PAYLOAD: {
 *   joint: Object  // The joint being hovered
 * }
 */
export const EVENT_VIEWER_JOINT_HOVER = 'viewer:joint-hover';

/**
 * EVENT: viewer:joint-unhover
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when leaving a joint hover
 * WHEN: Mouse leaves a draggable joint
 * 
 * PAYLOAD: {
 *   joint: Object  // The joint no longer hovered
 * }
 */
export const EVENT_VIEWER_JOINT_UNHOVER = 'viewer:joint-unhover';

// --- TABLE EVENTS ---

/**
 * EVENT: viewer:table-loaded
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when table model is loaded
 * WHEN: After loadTable() completes
 * 
 * PAYLOAD: none
 */
export const EVENT_VIEWER_TABLE_LOADED = 'viewer:table-loaded';

/**
 * EVENT: viewer:table-toggled
 * EMITTED BY: ViewerContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when table visibility changes
 * WHEN: After toggleTable() is called
 * 
 * PAYLOAD: {
 *   visible: Boolean  // New visibility state
 * }
 */
export const EVENT_VIEWER_TABLE_TOGGLED = 'viewer:table-toggled';

// --- EVENTS LISTENED TO BY VIEWER CONTEXT ---

/**
 * EVENT: robot:needs-scene
 * EMITTED BY: RobotContext
 * LISTENED BY: ViewerContext
 * 
 * PURPOSE: Request for scene access
 * WHEN: RobotContext needs to load robots
 * 
 * EXPECTED PAYLOAD: {
 *   requestId: String  // Unique request identifier
 * }
 * 
 * RESPONSE ACTION: Emit viewer:here-is-the-scene with scene data
 */
// Already defined above - reusing constant

// ============================================
// JOINT CONTEXT (if needed)
// ============================================

// --- EVENTS LISTENED TO BY JOINT CONTEXT ---

/**
 * EVENT: robot:loaded
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext
 * 
 * PURPOSE: New robot available for joint control
 * WHEN: Robot successfully loaded
 * 
 * EXPECTED PAYLOAD: {
 *   robotId: String,
 *   robotName: String,
 *   robot: Object  // Robot with joints property
 * }
 * 
 * RESPONSE ACTION: Extract and store joint information
 */
// Already defined above - reusing constant

// ============================================
// FUTURE CONTEXTS
// ============================================

// Add new context sections here following the same pattern:
// - Section header with context name
// - Events emitted by the context
// - Events listened to by the context
// - Clear documentation for each event