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
 */
export const EVENT_ROBOT_NEEDS_SCENE = 'robot:needs-scene';

/**
 * EVENT: robot:loaded
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext, ViewerContext, UI components, others
 * 
 * PURPOSE: Announce that a robot has been successfully loaded
 * WHEN: After a robot URDF is loaded and added to the scene
 * 
 * PAYLOAD: {
 *   robotId: String,      // Unique identifier for the robot
 *   robotName: String,    // Display name of the robot
 *   robot: Object,        // THREE.js robot object with joints
 *   manufacturer: String, // Robot manufacturer
 *   position: Object      // { x, y, z } position in scene
 * }
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
 * EMITTED BY: RobotContext, JointContext
 * LISTENED BY: JointContext, UI components, TrajectoryContext
 * 
 * PURPOSE: Notify when robot joint values have been updated
 * WHEN: After setJointValues() successfully updates joints
 * 
 * PAYLOAD: {
 *   robotId: String,        // ID of the robot
 *   robotName: String,      // Name of the robot
 *   values: Object,         // { jointName: value, ... }
 *   source: String          // 'manual', 'ik', 'trajectory', etc.
 * }
 */
export const EVENT_ROBOT_JOINTS_CHANGED = 'robot:joints-changed';

/**
 * EVENT: robot:joint-changed
 * EMITTED BY: RobotContext, JointContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when a single joint value changes
 * WHEN: After setJointValue() updates a joint
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   robotName: String,
 *   jointName: String,
 *   value: Number,
 *   allValues: Object    // All current joint values
 * }
 */
export const EVENT_ROBOT_JOINT_CHANGED = 'robot:joint-changed';

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

/**
 * EVENT: robot:workspace-updated
 * EMITTED BY: RobotContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when workspace robots list changes
 * WHEN: When robots are added/removed from workspace
 * 
 * PAYLOAD: {
 *   robots: Array,      // Current workspace robots
 *   action: String,     // 'add', 'remove', 'clear'
 *   robotId?: String    // Affected robot ID (if applicable)
 * }
 */
export const EVENT_ROBOT_WORKSPACE_UPDATED = 'robot:workspace-updated';

/**
 * EVENT: robot:discovery-complete
 * EMITTED BY: RobotContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when robot discovery/scanning is complete
 * WHEN: After discoverRobots() completes
 * 
 * PAYLOAD: {
 *   categories: Array,     // Robot categories
 *   robots: Array,         // All discovered robots
 *   count: Number         // Total robot count
 * }
 */
export const EVENT_ROBOT_DISCOVERY_COMPLETE = 'robot:discovery-complete';

/**
 * EVENT: robot:loading-state-changed
 * EMITTED BY: RobotContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when a robot's loading state changes
 * WHEN: During robot loading process
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   state: String,        // 'idle', 'loading', 'loaded', 'error'
 *   progress?: Number,    // Loading progress (0-1)
 *   error?: String       // Error message if state is 'error'
 * }
 */
export const EVENT_ROBOT_LOADING_STATE_CHANGED = 'robot:loading-state-changed';

/**
 * EVENT: robot:position-changed
 * EMITTED BY: RobotContext
 * LISTENED BY: UI components, collision detection
 * 
 * PURPOSE: Notify when robot position in scene changes
 * WHEN: When robot is moved/repositioned
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   position: Object,     // { x, y, z }
 *   rotation?: Object    // { x, y, z } euler angles
 * }
 */
export const EVENT_ROBOT_POSITION_CHANGED = 'robot:position-changed';

/**
 * EVENT: robot:tcp-attached
 * EMITTED BY: RobotContext/TCPContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when TCP tool is attached to robot
 * WHEN: When attachTCP() is called
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   toolId: String,
 *   toolData: Object     // Tool information
 * }
 */
export const EVENT_ROBOT_TCP_ATTACHED = 'robot:tcp-attached';

/**
 * EVENT: robot:tcp-detached
 * EMITTED BY: RobotContext/TCPContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when TCP tool is detached from robot
 * WHEN: When detachTCP() is called
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   toolId: String
 * }
 */
export const EVENT_ROBOT_TCP_DETACHED = 'robot:tcp-detached';

/**
 * EVENT: robot:registered
 * EMITTED BY: RobotContext
 * LISTENED BY: JointContext
 * 
 * PURPOSE: Register a robot instance for joint control
 * WHEN: After robot is fully loaded and validated
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   robotName: String,
 *   robot: Object
 * }
 */
export const EVENT_ROBOT_REGISTERED = 'robot:registered';

// --- GLOBAL CONTROL EVENTS (Can be emitted by any component) ---

/**
 * EVENT: robot:command:move-joint
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to move a single robot joint
 * WHEN: Any component wants to move a robot joint
 * 
 * PAYLOAD: {
 *   robotId: String,      // Target robot ID
 *   jointName: String,    // Joint to move
 *   value: Number,        // Target angle (radians)
 *   duration?: Number,    // Animation duration (ms)
 *   easing?: String      // Easing function name
 * }
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_MOVE_JOINT, {
 *   robotId: 'ur5_123',
 *   jointName: 'shoulder_pan_joint',
 *   value: 1.57,
 *   duration: 1000
 * });
 */
export const EVENT_MOVE_JOINT = 'robot:command:move-joint';

/**
 * EVENT: robot:command:move-joints
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to move multiple robot joints
 * WHEN: Any component wants to move multiple joints
 * 
 * PAYLOAD: {
 *   robotId: String,      // Target robot ID
 *   values: Object,       // { jointName: value, ... }
 *   duration?: Number,    // Animation duration (ms)
 *   simultaneous?: Boolean // Move all joints at once
 * }
 * 
 * USAGE EXAMPLE:
 * EventBus.emit(DataTransfer.EVENT_MOVE_JOINTS, {
 *   robotId: 'ur5_123',
 *   values: {
 *     'shoulder_pan_joint': 1.57,
 *     'shoulder_lift_joint': -0.5,
 *     'elbow_joint': 1.2
 *   },
 *   duration: 2000
 * });
 */
export const EVENT_MOVE_JOINTS = 'robot:command:move-joints';

/**
 * EVENT: robot:command:request-joints
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Request current joint values
 * WHEN: Component needs to know current joint positions
 * 
 * PAYLOAD: {
 *   robotId: String,      // Target robot ID
 *   requestId: String     // Unique request ID for response matching
 * }
 * 
 * RESPONSE EVENT: robot:response:joint-values
 */
export const EVENT_REQUEST_JOINTS = 'robot:command:request-joints';

/**
 * EVENT: robot:response:joint-values
 * EMITTED BY: RobotContext
 * LISTENED BY: Requesting component
 * 
 * PURPOSE: Response to joint values request
 * WHEN: In response to EVENT_REQUEST_JOINTS
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   requestId: String,    // Matching request ID
 *   values: Object,       // { jointName: value, ... }
 *   timestamp: Number     // When values were read
 * }
 */
export const EVENT_RECEIVE_JOINTS = 'robot:response:joint-values';

/**
 * EVENT: robot:command:load
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to load a robot
 * WHEN: Component wants to load a robot
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   urdfPath: String,
 *   options?: {
 *     position?: Object,    // { x, y, z }
 *     manufacturer?: String,
 *     requestId?: String   // For tracking request
 *   }
 * }
 */
export const EVENT_COMMAND_LOAD_ROBOT = 'robot:command:load';

/**
 * EVENT: robot:command:unload
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to unload a robot
 * WHEN: Component wants to unload a robot
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_COMMAND_UNLOAD_ROBOT = 'robot:command:unload';

/**
 * EVENT: robot:command:set-active
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to set the active robot
 * WHEN: Component wants to change active robot
 * 
 * PAYLOAD: {
 *   robotId: String    // null to deactivate all
 * }
 */
export const EVENT_COMMAND_SET_ACTIVE_ROBOT = 'robot:command:set-active';

/**
 * EVENT: robot:command:reset-joints
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to reset robot joints to zero
 * WHEN: Component wants to reset robot pose
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_COMMAND_RESET_JOINTS = 'robot:command:reset-joints';

/**
 * EVENT: robot:command:add-to-workspace
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to add robot to workspace
 * WHEN: User selects robot from catalog
 * 
 * PAYLOAD: {
 *   robotData: Object    // Robot catalog data
 * }
 */
export const EVENT_COMMAND_ADD_TO_WORKSPACE = 'robot:command:add-to-workspace';

/**
 * EVENT: robot:command:remove-from-workspace
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to remove robot from workspace
 * WHEN: User removes robot from workspace
 * 
 * PAYLOAD: {
 *   workspaceRobotId: String
 * }
 */
export const EVENT_COMMAND_REMOVE_FROM_WORKSPACE = 'robot:command:remove-from-workspace';

/**
 * EVENT: robot:command:discover
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to discover available robots
 * WHEN: UI needs to refresh robot catalog
 * 
 * PAYLOAD: {} // No payload needed
 */
export const EVENT_COMMAND_DISCOVER_ROBOTS = 'robot:command:discover';

/**
 * EVENT: robot:command:set-position
 * EMITTED BY: Any component/context
 * LISTENED BY: RobotContext
 * 
 * PURPOSE: Command to set robot position in scene
 * WHEN: Component wants to move robot
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   position: Object,     // { x, y, z }
 *   rotation?: Object    // { x, y, z } euler angles
 * }
 */
export const EVENT_COMMAND_SET_ROBOT_POSITION = 'robot:command:set-position';

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

// ============================================
// JOINT CONTEXT (Event-driven contract)
// ============================================

/**
 * EVENT: joint:command:set-value
 * EMITTED BY: Any component/context
 * LISTENED BY: JointContext
 *
 * PURPOSE: Command to set a single joint value
 * WHEN: Any component wants to set a joint value
 *
 * PAYLOAD: {
 *   robotId: String,
 *   jointName: String,
 *   value: Number,
 *   requestId?: String // Optional, for response matching
 * }
 *
 * RESPONSE EVENT: joint:response:set-value
 */
export const EVENT_JOINT_SET_VALUE = 'joint:command:set-value';

/**
 * EVENT: joint:response:set-value
 * EMITTED BY: JointContext
 * LISTENED BY: Requesting component
 *
 * PURPOSE: Response to set joint value command
 * WHEN: After setting joint value
 *
 * PAYLOAD: {
 *   robotId: String,
 *   jointName: String,
 *   value: Number,
 *   success: Boolean,
 *   requestId?: String
 * }
 */
export const EVENT_JOINT_SET_VALUE_RESPONSE = 'joint:response:set-value';

/**
 * EVENT: joint:command:set-values
 * EMITTED BY: Any component/context
 * LISTENED BY: JointContext
 *
 * PURPOSE: Command to set multiple joint values
 * WHEN: Any component wants to set multiple joint values
 *
 * PAYLOAD: {
 *   robotId: String,
 *   values: Object, // { jointName: value, ... }
 *   requestId?: String
 * }
 *
 * RESPONSE EVENT: joint:response:set-values
 */
export const EVENT_JOINT_SET_VALUES = 'joint:command:set-values';

/**
 * EVENT: joint:response:set-values
 * EMITTED BY: JointContext
 * LISTENED BY: Requesting component
 *
 * PURPOSE: Response to set multiple joint values
 * WHEN: After setting joint values
 *
 * PAYLOAD: {
 *   robotId: String,
 *   values: Object, // { jointName: value, ... }
 *   success: Boolean,
 *   requestId?: String
 * }
 */
export const EVENT_JOINT_SET_VALUES_RESPONSE = 'joint:response:set-values';

/**
 * EVENT: joint:command:get-values
 * EMITTED BY: Any component/context
 * LISTENED BY: JointContext
 *
 * PURPOSE: Request current joint values
 * WHEN: Any component needs current joint values
 *
 * PAYLOAD: {
 *   robotId: String,
 *   requestId: String // Required for response matching
 * }
 *
 * RESPONSE EVENT: joint:response:get-values
 */
export const EVENT_JOINT_GET_VALUES = 'joint:command:get-values';

/**
 * EVENT: joint:response:get-values
 * EMITTED BY: JointContext
 * LISTENED BY: Requesting component
 *
 * PURPOSE: Response to get joint values request
 * WHEN: After reading joint values
 *
 * PAYLOAD: {
 *   robotId: String,
 *   values: Object, // { jointName: value, ... }
 *   requestId: String
 * }
 */
export const EVENT_JOINT_GET_VALUES_RESPONSE = 'joint:response:get-values';

/**
 * EVENT: joint:command:reset
 * EMITTED BY: Any component/context
 * LISTENED BY: JointContext
 *
 * PURPOSE: Command to reset all joints to zero
 * WHEN: Any component wants to reset robot joints
 *
 * PAYLOAD: {
 *   robotId: String,
 *   requestId?: String
 * }
 *
 * RESPONSE EVENT: joint:response:reset
 */
export const EVENT_JOINT_RESET = 'joint:command:reset';

/**
 * EVENT: joint:response:reset
 * EMITTED BY: JointContext
 * LISTENED BY: Requesting component
 *
 * PURPOSE: Response to reset joints command
 * WHEN: After resetting joints
 *
 * PAYLOAD: {
 *   robotId: String,
 *   success: Boolean,
 *   requestId?: String
 * }
 */
export const EVENT_JOINT_RESET_RESPONSE = 'joint:response:reset';

// ============================================
// IK CONTEXT
// ============================================

/**
 * EVENT: ik:command:solve
 * EMITTED BY: Any component
 * LISTENED BY: IKContext
 * 
 * PURPOSE: Request IK solution for target position
 * WHEN: Component needs IK calculation
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   targetPosition: Object,    // { x, y, z }
 *   targetOrientation?: Object, // Quaternion or euler
 *   requestId?: String
 * }
 */
export const EVENT_IK_SOLVE = 'ik:command:solve';

/**
 * EVENT: ik:solution-found
 * EMITTED BY: IKContext
 * LISTENED BY: UI components, requesting component
 * 
 * PURPOSE: IK solution calculated
 * WHEN: After IK solver finds solution
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   requestId?: String,
 *   solution: Object,     // Joint values
 *   iterations: Number,
 *   error: Number
 * }
 */
export const EVENT_IK_SOLUTION_FOUND = 'ik:solution-found';

/**
 * EVENT: ik:no-solution
 * EMITTED BY: IKContext
 * LISTENED BY: UI components, requesting component
 * 
 * PURPOSE: IK solver couldn't find solution
 * WHEN: Target is unreachable
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   requestId?: String,
 *   reason: String,
 *   lastError: Number
 * }
 */
export const EVENT_IK_NO_SOLUTION = 'ik:no-solution';

// ============================================
// TRAJECTORY CONTEXT
// ============================================

/**
 * EVENT: trajectory:command:play
 * EMITTED BY: Any component
 * LISTENED BY: TrajectoryContext
 * 
 * PURPOSE: Start playing a trajectory
 * WHEN: User clicks play on trajectory
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   trajectoryId: String,
 *   loop?: Boolean,
 *   speed?: Number
 * }
 */
export const EVENT_TRAJECTORY_PLAY = 'trajectory:command:play';

/**
 * EVENT: trajectory:command:pause
 * EMITTED BY: Any component
 * LISTENED BY: TrajectoryContext
 * 
 * PURPOSE: Pause trajectory playback
 * WHEN: User clicks pause
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_TRAJECTORY_PAUSE = 'trajectory:command:pause';

/**
 * EVENT: trajectory:command:stop
 * EMITTED BY: Any component
 * LISTENED BY: TrajectoryContext
 * 
 * PURPOSE: Stop trajectory playback
 * WHEN: User clicks stop
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_TRAJECTORY_STOP = 'trajectory:command:stop';

/**
 * EVENT: trajectory:playing
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Trajectory playback started
 * WHEN: Trajectory begins playing
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   trajectoryId: String,
 *   totalFrames: Number,
 *   duration: Number
 * }
 */
export const EVENT_TRAJECTORY_PLAYING = 'trajectory:playing';

/**
 * EVENT: trajectory:paused
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Trajectory playback paused
 * WHEN: Trajectory is paused
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   currentFrame: Number,
 *   progress: Number     // 0-1
 * }
 */
export const EVENT_TRAJECTORY_PAUSED = 'trajectory:paused';

/**
 * EVENT: trajectory:stopped
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Trajectory playback stopped
 * WHEN: Trajectory is stopped
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_TRAJECTORY_STOPPED = 'trajectory:stopped';

/**
 * EVENT: trajectory:frame-update
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Current frame changed during playback
 * WHEN: Every frame during playback
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   currentFrame: Number,
 *   totalFrames: Number,
 *   progress: Number,    // 0-1
 *   jointValues: Object  // Current joint positions
 * }
 */
export const EVENT_TRAJECTORY_FRAME_UPDATE = 'trajectory:frame-update';

/**
 * EVENT: trajectory:command:record-start
 * EMITTED BY: Any component
 * LISTENED BY: TrajectoryContext
 * 
 * PURPOSE: Start recording trajectory
 * WHEN: User starts recording
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   name?: String
 * }
 */
export const EVENT_TRAJECTORY_RECORD_START = 'trajectory:command:record-start';

/**
 * EVENT: trajectory:command:record-stop
 * EMITTED BY: Any component
 * LISTENED BY: TrajectoryContext
 * 
 * PURPOSE: Stop recording trajectory
 * WHEN: User stops recording
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   save?: Boolean    // Whether to save the recording
 * }
 */
export const EVENT_TRAJECTORY_RECORD_STOP = 'trajectory:command:record-stop';

/**
 * EVENT: trajectory:recording-started
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Recording has started
 * WHEN: After record start command
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   startTime: Number
 * }
 */
export const EVENT_TRAJECTORY_RECORDING_STARTED = 'trajectory:recording-started';

/**
 * EVENT: trajectory:recording-stopped
 * EMITTED BY: TrajectoryContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Recording has stopped
 * WHEN: After record stop command
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   duration: Number,
 *   frameCount: Number,
 *   trajectoryId?: String  // If saved
 * }
 */
export const EVENT_TRAJECTORY_RECORDING_STOPPED = 'trajectory:recording-stopped';

// ============================================
// ENVIRONMENT CONTEXT
// ============================================

/**
 * EVENT: environment:object-spawned
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Object added to environment
 * WHEN: User spawns object
 * 
 * PAYLOAD: {
 *   objectId: String,
 *   type: String,
 *   position: Object,
 *   modelPath: String
 * }
 */
export const EVENT_ENVIRONMENT_OBJECT_SPAWNED = 'environment:object-spawned';

/**
 * EVENT: environment:object-removed
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Object removed from environment
 * WHEN: User deletes object
 * 
 * PAYLOAD: {
 *   objectId: String
 * }
 */
export const EVENT_ENVIRONMENT_OBJECT_REMOVED = 'environment:object-removed';

/**
 * EVENT: environment:object-selected
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Object selected in environment
 * WHEN: User clicks on object
 * 
 * PAYLOAD: {
 *   objectId: String,
 *   object: Object
 * }
 */
export const EVENT_ENVIRONMENT_OBJECT_SELECTED = 'environment:object-selected';

// --- SCENE EVENTS ---

/**
 * EVENT: scene:object-registered
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: Debug tools, UI components
 * 
 * PURPOSE: Object registered with scene
 * WHEN: Object added to scene registry
 * 
 * PAYLOAD: {
 *   type: String,      // 'robots', 'environment', 'trajectories', 'humans', 'custom'
 *   id: String,
 *   object: Object,
 *   metadata: Object
 * }
 */
export const EVENT_SCENE_OBJECT_REGISTERED = 'scene:object-registered';

/**
 * EVENT: scene:object-unregistered
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: Debug tools, UI components
 * 
 * PURPOSE: Object removed from scene registry
 * WHEN: Object removed from scene
 * 
 * PAYLOAD: {
 *   type: String,
 *   id: String
 * }
 */
export const EVENT_SCENE_OBJECT_UNREGISTERED = 'scene:object-unregistered';

/**
 * EVENT: scene:object-updated
 * EMITTED BY: EnvironmentContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Scene object properties updated
 * WHEN: Object position/rotation/scale changed
 * 
 * PAYLOAD: {
 *   type: String,
 *   id: String,
 *   updates: Object    // { position?, rotation?, scale?, visible? }
 * }
 */
export const EVENT_SCENE_OBJECT_UPDATED = 'scene:object-updated';

// --- HUMAN EVENTS ---

/**
 * EVENT: human:spawned
 * EMITTED BY: EnvironmentContext, HumanController
 * LISTENED BY: EnvironmentContext, UI components
 * 
 * PURPOSE: Human character spawned in scene
 * WHEN: Human added to environment
 * 
 * PAYLOAD: {
 *   id: String,
 *   name: String,
 *   isActive: Boolean
 * }
 */
export const EVENT_HUMAN_SPAWNED = 'human:spawned';

/**
 * EVENT: human:removed
 * EMITTED BY: EnvironmentContext, HumanController
 * LISTENED BY: EnvironmentContext, UI components
 * 
 * PURPOSE: Human character removed from scene
 * WHEN: Human deleted
 * 
 * PAYLOAD: {
 *   id: String
 * }
 */
export const EVENT_HUMAN_REMOVED = 'human:removed';

/**
 * EVENT: human:selected
 * EMITTED BY: HumanController
 * LISTENED BY: EnvironmentContext
 * 
 * PURPOSE: Human character selected
 * WHEN: User clicks on human
 * 
 * PAYLOAD: {
 *   id: String
 * }
 */
export const EVENT_HUMAN_SELECTED = 'human:selected';

/**
 * EVENT: human:position-update:{id}
 * EMITTED BY: HumanController
 * LISTENED BY: EnvironmentContext
 * 
 * PURPOSE: Human position updated
 * WHEN: Human moves
 * 
 * PAYLOAD: {
 *   position: Array    // [x, y, z]
 * }
 * 
 * NOTE: {id} is replaced with the actual human ID
 */
export const EVENT_HUMAN_POSITION_UPDATE = 'human:position-update';

// ============================================
// WORLD CONTEXT
// ============================================

/**
 * EVENT: world:reset
 * EMITTED BY: WorldContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: World reset to defaults
 * WHEN: User resets world
 * 
 * PAYLOAD: none
 */
export const EVENT_WORLD_RESET = 'world:reset';

/**
 * EVENT: world:gravity-changed
 * EMITTED BY: WorldContext
 * LISTENED BY: Physics systems
 * 
 * PURPOSE: Gravity setting changed
 * WHEN: User adjusts gravity
 * 
 * PAYLOAD: {
 *   gravity: Number      // -9.81, etc
 * }
 */
export const EVENT_WORLD_GRAVITY_CHANGED = 'world:gravity-changed';

/**
 * EVENT: world:fully-loaded
 * EMITTED BY: WorldAPI, SceneSetup
 * LISTENED BY: EnvironmentContext
 * 
 * PURPOSE: World scene fully loaded with all objects
 * WHEN: Scene loading complete
 * 
 * PAYLOAD: {
 *   environment: Array,    // Environment objects
 *   robots: Array,        // Robot objects
 *   timestamp: Number
 * }
 */
export const EVENT_WORLD_FULLY_LOADED = 'world:fully-loaded';

/**
 * EVENT: world:grid-toggled
 * EMITTED BY: WorldContext
 * LISTENED BY: ViewerContext
 * 
 * PURPOSE: Grid visibility toggled
 * WHEN: User toggles grid
 * 
 * PAYLOAD: {
 *   visible: Boolean
 * }
 */
export const EVENT_WORLD_GRID_TOGGLED = 'world:grid-toggled';

// ============================================
// TCP CONTEXT
// ============================================

// --- EVENTS EMITTED BY TCP CONTEXT ---

/**
 * EVENT: tcp:needs-scene
 * EMITTED BY: TCPContext
 * LISTENED BY: ViewerContext
 * 
 * PURPOSE: Request access to the 3D scene from ViewerContext
 * WHEN: On TCPContext initialization when it needs scene setup
 * 
 * PAYLOAD: {
 *   requestId: String  // Unique ID to match request/response
 * }
 */
export const EVENT_TCP_NEEDS_SCENE = 'tcp:needs-scene';

/**
 * EVENT: tcp:tool-attached
 * EMITTED BY: TCPContext
 * LISTENED BY: UI components, RobotContext
 * 
 * PURPOSE: Notify when TCP tool is attached to robot
 * WHEN: After successful tool attachment
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   toolId: String,
 *   toolName: String,      // Always "tcp"
 *   originalToolName: String,
 *   endEffectorPoint: Object,  // { x, y, z }
 *   toolDimensions: Object     // { x, y, z }
 * }
 */
export const EVENT_TCP_TOOL_ATTACHED = 'tcp:tool-attached';

/**
 * EVENT: tcp:tool-removed
 * EMITTED BY: TCPContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when TCP tool is removed
 * WHEN: After tool removal
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   toolId: String
 * }
 */
export const EVENT_TCP_TOOL_REMOVED = 'tcp:tool-removed';

/**
 * EVENT: tcp:tool-transformed
 * EMITTED BY: TCPContext
 * LISTENED BY: UI components
 * 
 * PURPOSE: Notify when tool transform changes
 * WHEN: After setToolTransform
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   toolId: String,
 *   transforms: Object,
 *   endEffectorPoint: Object,
 *   toolDimensions: Object
 * }
 */
export const EVENT_TCP_TOOL_TRANSFORMED = 'tcp:tool-transformed';

/**
 * EVENT: tcp:endeffector-updated
 * EMITTED BY: TCPContext
 * LISTENED BY: IKContext, UI components
 * 
 * PURPOSE: Notify when end effector position/orientation changes
 * WHEN: After any change affecting end effector
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   endEffectorPoint: Object,      // { x, y, z }
 *   endEffectorOrientation: Object, // { x, y, z, w }
 *   hasTCP: Boolean,
 *   toolDimensions?: Object
 * }
 */
export const EVENT_TCP_ENDEFFECTOR_UPDATED = 'tcp:endeffector-updated';

/**
 * EVENT: tcp:tool-transform-changed
 * EMITTED BY: TCPContext
 * LISTENED BY: ViewerContext
 * 
 * PURPOSE: Cross-context notification of transform changes
 * WHEN: After tool transform is modified
 * 
 * PAYLOAD: {
 *   robotId: String,
 *   transforms: Object
 * }
 */
export const EVENT_TCP_TOOL_TRANSFORM_CHANGED = 'tcp:tool-transform-changed';

/**
 * EVENT: tcp:force-recalculate
 * EMITTED BY: Any component
 * LISTENED BY: TCPContext
 * 
 * PURPOSE: Force recalculation of end effector
 * WHEN: Manual recalculation needed
 * 
 * PAYLOAD: {
 *   robotId: String
 * }
 */
export const EVENT_TCP_FORCE_RECALCULATE = 'tcp:force-recalculate';

// --- EVENTS LISTENED TO BY TCP CONTEXT ---

/**
 * EVENT: viewer:tcp-scene-response
 * EMITTED BY: ViewerContext
 * LISTENED BY: TCPContext
 * 
 * PURPOSE: Provide scene access in response to tcp:needs-scene
 * WHEN: In response to EVENT_TCP_NEEDS_SCENE request
 * 
 * EXPECTED PAYLOAD: {
 *   success: Boolean,
 *   requestId: String,
 *   payload: {
 *     getSceneSetup: Function  // () => sceneSetup instance
 *   },
 *   error?: String
 * }
 */
export const EVENT_VIEWER_TCP_SCENE_RESPONSE = 'viewer:tcp-scene-response';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Helper to create request/response pattern
 * @param {string} eventName - Base event name
 * @param {Object} payload - Event payload
 * @param {Function} callback - Response callback
 * @returns {string} requestId
 */
export const createRequest = (eventName, payload, callback) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const responseEvent = eventName.replace(':command:', ':response:');
  
  const handleResponse = (response) => {
    if (response.requestId === requestId) {
      EventBus.off(responseEvent, handleResponse);
      callback(response);
    }
  };
  
  EventBus.on(responseEvent, handleResponse);
  EventBus.emit(eventName, { ...payload, requestId });
  
  return requestId;
};

/**
 * Helper to emit error events
 * @param {string} context - Context name (robot, viewer, etc)
 * @param {string} operation - Operation that failed
 * @param {Error} error - Error object
 */
export const emitError = (context, operation, error) => {
  EventBus.emit(`${context}:error`, {
    operation,
    error: error.message,
    stack: error.stack,
    timestamp: Date.now()
  });
};

/**
 * Helper to create typed event emitters
 * @param {string} eventName - Event name
 * @returns {Function} Typed emitter function
 */
export const createEmitter = (eventName) => {
  return (payload) => EventBus.emit(eventName, payload);
};

/**
 * Helper to create typed event listeners
 * @param {string} eventName - Event name
 * @returns {Function} Typed listener function
 */
export const createListener = (eventName) => {
  return (handler) => EventBus.on(eventName, handler);
};

/**
 * Utility to generate the event name for human position updates
 * @param {string} id - Human ID
 * @returns {string} Event name for position update
 */
export function createHumanPositionEventName(id) {
  return `human:position-update:${id}`;
}