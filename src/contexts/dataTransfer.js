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
 *    createRequest(JointEvents.Commands.GET_VALUES, 
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
 * Primary consumers: RobotContext, JointContext, UI Components
 * 
 * @namespace RobotEvents
 */
export const RobotEvents = {
  // ========== System Events ==========
  
  /**
   * Requests access to the 3D scene from ViewerContext
   * EMITTED BY: RobotContext (on initialization)
   * LISTENED BY: ViewerContext
   * PAYLOAD: { requestId: string }
   * RESPONSE: ViewerEvents.HERE_IS_SCENE
   */
  NEEDS_SCENE: 'robot:needs-scene',
  
  /**
   * Robot successfully loaded and added to scene
   * EMITTED BY: RobotContext
   * LISTENED BY: JointContext, ViewerContext, UI components
   * PAYLOAD: {
   *   robotId: string,      // Unique identifier
   *   robotName: string,    // Display name
   *   robot: Object,        // THREE.js robot object
   *   manufacturer: string, // Robot manufacturer
   *   position: {x,y,z}     // Position in scene
   * }
   */
  LOADED: 'robot:loaded',
  
  /**
   * Robot removed from scene
   * EMITTED BY: RobotContext
   * LISTENED BY: JointContext, ViewerContext
   * PAYLOAD: { robotId: string }
   */
  UNLOADED: 'robot:unloaded',
  
  /**
   * Robot removed (alias for unloaded)
   * EMITTED BY: RobotContext
   * LISTENED BY: ViewerContext
   * PAYLOAD: { robotId: string, robotName: string }
   */
  REMOVED: 'robot:removed',
  
  /**
   * Robot registered for joint control
   * EMITTED BY: RobotContext
   * LISTENED BY: JointContext
   * PAYLOAD: { robotId: string, robotName: string, robot: Object }
   */
  REGISTERED: 'robot:registered',
  
  // ========== State Events ==========
  
  /**
   * Active robot selection changed
   * EMITTED BY: RobotContext
   * LISTENED BY: JointContext, UI components
   * PAYLOAD: { robotId: string|null, robot: Object|null }
   */
  ACTIVE_CHANGED: 'robot:active-changed',
  
  /**
   * Robot loading state changed
   * EMITTED BY: RobotContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robotId: string,
   *   state: 'idle'|'loading'|'loaded'|'error',
   *   progress?: number,    // 0-1
   *   error?: string       // Error message if state is 'error'
   * }
   */
  LOADING_STATE_CHANGED: 'robot:loading-state-changed',
  
  /**
   * Robot position in scene changed
   * EMITTED BY: RobotContext
   * LISTENED BY: UI components, collision detection
   * PAYLOAD: {
   *   robotId: string,
   *   position: {x,y,z},
   *   rotation?: {x,y,z}   // Euler angles
   * }
   */
  POSITION_CHANGED: 'robot:position-changed',
  
  // ========== Joint Events ==========
  
  /**
   * Multiple joint values changed
   * EMITTED BY: RobotContext, JointContext
   * LISTENED BY: JointContext, UI components, TrajectoryContext
   * PAYLOAD: {
   *   robotId: string,
   *   robotName: string,
   *   values: Object,      // { jointName: value, ... }
   *   source: string       // 'manual', 'ik', 'trajectory', etc.
   * }
   */
  JOINTS_CHANGED: 'robot:joints-changed',
  
  /**
   * Single joint value changed
   * EMITTED BY: RobotContext, JointContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robotId: string,
   *   robotName: string,
   *   jointName: string,
   *   value: number,       // Radians
   *   allValues: Object    // All current joint values
   * }
   */
  JOINT_CHANGED: 'robot:joint-changed',
  
  /**
   * Robot joints reset to zero
   * EMITTED BY: RobotContext
   * LISTENED BY: JointContext, UI components
   * PAYLOAD: { robotId: string, robotName: string }
   */
  JOINTS_RESET: 'robot:joints-reset',
  
  // ========== Workspace Events ==========
  
  /**
   * Workspace robots list changed
   * EMITTED BY: RobotContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robots: Array,       // Current workspace robots
   *   action: string,      // 'add', 'remove', 'clear'
   *   robotId?: string     // Affected robot ID
   * }
   */
  WORKSPACE_UPDATED: 'robot:workspace-updated',
  
  /**
   * Robot discovery/scanning complete
   * EMITTED BY: RobotContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   categories: Array,   // Robot categories
   *   robots: Array,       // All discovered robots
   *   count: number        // Total robot count
   * }
   */
  DISCOVERY_COMPLETE: 'robot:discovery-complete',
  
  // ========== TCP Events ==========
  
  /**
   * TCP tool attached to robot
   * EMITTED BY: RobotContext/TCPContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robotId: string,
   *   toolId: string,
   *   toolData: Object     // Tool information
   * }
   */
  TCP_ATTACHED: 'robot:tcp-attached',
  
  /**
   * TCP tool detached from robot
   * EMITTED BY: RobotContext/TCPContext
   * LISTENED BY: UI components
   * PAYLOAD: { robotId: string, toolId: string }
   */
  TCP_DETACHED: 'robot:tcp-detached',
  
  // ========== Commands (Requests) ==========
  Commands: {
    /**
     * Move a single robot joint
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   jointName: string,
     *   value: number,       // Target angle in radians
     *   duration?: number,   // Animation duration (ms)
     *   easing?: string      // Easing function name
     * }
     * EXAMPLE:
     *   EventBus.emit(RobotEvents.Commands.MOVE_JOINT, {
     *     robotId: 'ur5_123',
     *     jointName: 'shoulder_pan_joint',
     *     value: 1.57,
     *     duration: 1000
     *   });
     */
    MOVE_JOINT: 'robot:command:move-joint',
    
    /**
     * Move multiple robot joints
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   values: Object,          // { jointName: value, ... }
     *   duration?: number,       // Animation duration (ms)
     *   simultaneous?: boolean   // Move all joints at once
     * }
     */
    MOVE_JOINTS: 'robot:command:move-joints',
    
    /**
     * Request current joint values
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { robotId: string, requestId: string }
     * RESPONSE: RobotEvents.Responses.JOINT_VALUES
     */
    REQUEST_JOINTS: 'robot:command:request-joints',
    
    /**
     * Load a robot
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   urdfPath: string,
     *   options?: {
     *     position?: {x,y,z},
     *     manufacturer?: string,
     *     requestId?: string
     *   }
     * }
     */
    LOAD: 'robot:command:load',
    
    /**
     * Unload a robot
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { robotId: string }
     */
    UNLOAD: 'robot:command:unload',
    
    /**
     * Set the active robot
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { robotId: string|null }
     */
    SET_ACTIVE: 'robot:command:set-active',
    
    /**
     * Reset robot joints to zero
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { robotId: string }
     */
    RESET_JOINTS: 'robot:command:reset-joints',
    
    /**
     * Add robot to workspace
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { robotData: Object }
     */
    ADD_TO_WORKSPACE: 'robot:command:add-to-workspace',
    
    /**
     * Remove robot from workspace
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: { workspaceRobotId: string }
     */
    REMOVE_FROM_WORKSPACE: 'robot:command:remove-from-workspace',
    
    /**
     * Discover available robots
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {}
     */
    DISCOVER: 'robot:command:discover',
    
    /**
     * Set robot position in scene
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   position: {x,y,z},
     *   rotation?: {x,y,z}
     * }
     */
    SET_POSITION: 'robot:command:set-position'
  },
  
  // ========== Responses ==========
  Responses: {
    /**
     * Response to joint values request
     * EMITTED BY: RobotContext
     * LISTENED BY: Requesting component
     * PAYLOAD: {
     *   robotId: string,
     *   requestId: string,
     *   values: Object,      // { jointName: value, ... }
     *   timestamp: number
     * }
     */
    JOINT_VALUES: 'robot:response:joint-values'
  }
};

// ============================================
// ROBOT POSE EVENTS
// ============================================
/**
 * Robot pose events namespace
 * 
 * Handles robot position and rotation in world space.
 * Primary consumers: RobotContext, Reposition UI
 * 
 * @namespace RobotPoseEvents
 */
export const RobotPoseEvents = {
  // ========== Commands ==========
  Commands: {
    /**
     * Set robot pose (position and rotation)
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   position?: {x,y,z},
     *   rotation?: {x,y,z},    // Euler angles
     *   requestId?: string
     * }
     * RESPONSE: RobotPoseEvents.Responses.SET_POSE
     */
    SET_POSE: 'robotpose:command:set-pose',
    
    /**
     * Get current robot pose
     * EMITTED BY: Any component
     * LISTENED BY: RobotContext
     * PAYLOAD: {
     *   robotId: string,
     *   requestId: string    // Required
     * }
     * RESPONSE: RobotPoseEvents.Responses.GET_POSE
     */
    GET_POSE: 'robotpose:command:get-pose'
  },
  
  // ========== Responses ==========
  Responses: {
    /**
     * Response to set robot pose
     * PAYLOAD: {
     *   robotId: string,
     *   position: {x,y,z},
     *   rotation: {x,y,z},
     *   success: boolean,
     *   requestId?: string
     * }
     */
    SET_POSE: 'robotpose:response:set-pose',
    
    /**
     * Response to get robot pose
     * PAYLOAD: {
     *   robotId: string,
     *   position: {x,y,z},
     *   rotation: {x,y,z},
     *   requestId: string
     * }
     */
    GET_POSE: 'robotpose:response:get-pose'
  }
};

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
  /**
   * Viewer initialized and ready
   * EMITTED BY: ViewerContext
   * LISTENED BY: RobotContext, TCPContext
   * PAYLOAD: none
   */
  READY: 'viewer:ready',
  
  /**
   * Detailed initialization complete
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components, debugging tools
   * PAYLOAD: { sceneSetup: Object }
   */
  INITIALIZED: 'viewer:initialized',
  
  /**
   * Scene access response
   * EMITTED BY: ViewerContext
   * LISTENED BY: RobotContext
   * PAYLOAD: {
   *   success: boolean,
   *   requestId: string,
   *   payload: { getSceneSetup: Function },
   *   error?: string
   * }
   */
  HERE_IS_SCENE: 'viewer:here-is-the-scene',
  
  /**
   * Scene access response for TCP
   * EMITTED BY: ViewerContext
   * LISTENED BY: TCPContext
   * PAYLOAD: Same as HERE_IS_SCENE
   */
  TCP_SCENE_RESPONSE: 'viewer:tcp-scene-response',
  
  /**
   * Viewer configuration updated
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   backgroundColor?: string,
   *   enableShadows?: boolean,
   *   ambientColor?: string,
   *   upAxis?: string,
   *   highlightColor?: string
   * }
   */
  CONFIG_UPDATED: 'viewer:config-updated',
  
  /**
   * Viewer dimensions changed
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components, camera controllers
   * PAYLOAD: { width: number, height: number }
   */
  RESIZED: 'viewer:resized',
  
  /**
   * Viewer being destroyed
   * EMITTED BY: ViewerContext
   * LISTENED BY: Cleanup handlers
   * PAYLOAD: none
   */
  DISPOSED: 'viewer:disposed',
  
  /**
   * Robot loaded via viewer
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { robotId: string, options: Object }
   */
  ROBOT_LOADED: 'viewer:robot-loaded',
  
  /**
   * Robot loading failed
   * EMITTED BY: ViewerContext
   * LISTENED BY: Error handlers
   * PAYLOAD: { robotId: string, error: Error }
   */
  ROBOT_LOAD_ERROR: 'viewer:robot-load-error',
  
  /**
   * Joints reset via viewer
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { robotId: string }
   */
  JOINTS_RESET: 'viewer:joints-reset',
  
  // ========== Drag Control Events ==========
  
  /**
   * Joint dragging started
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { joint: Object }
   */
  DRAG_START: 'viewer:drag-start',
  
  /**
   * Joint dragging ended
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { joint: Object }
   */
  DRAG_END: 'viewer:drag-end',
  
  /**
   * Hovering over joint
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { joint: Object }
   */
  JOINT_HOVER: 'viewer:joint-hover',
  
  /**
   * Left joint hover
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { joint: Object }
   */
  JOINT_UNHOVER: 'viewer:joint-unhover',
  
  // ========== Table Events ==========
  
  /**
   * Table model loaded
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: none
   */
  TABLE_LOADED: 'viewer:table-loaded',
  
  /**
   * Table visibility changed
   * EMITTED BY: ViewerContext
   * LISTENED BY: UI components
   * PAYLOAD: { visible: boolean }
   */
  TABLE_TOGGLED: 'viewer:table-toggled'
};

// ============================================
// JOINT EVENTS
// ============================================
/**
 * Joint control events namespace
 * 
 * Handles direct joint value manipulation with command/response pattern.
 * Primary consumers: JointContext, IKContext, TrajectoryContext
 * 
 * @namespace JointEvents
 */
export const JointEvents = {
  // ========== Commands ==========
  Commands: {
    /**
     * Set single joint value
     * EMITTED BY: Any component
     * LISTENED BY: JointContext
     * PAYLOAD: {
     *   robotId: string,
     *   jointName: string,
     *   value: number,
     *   requestId?: string
     * }
     * RESPONSE: JointEvents.Responses.SET_VALUE
     */
    SET_VALUE: 'joint:command:set-value',
    
    /**
     * Set multiple joint values
     * EMITTED BY: Any component
     * LISTENED BY: JointContext
     * PAYLOAD: {
     *   robotId: string,
     *   values: Object,      // { jointName: value, ... }
     *   requestId?: string
     * }
     * RESPONSE: JointEvents.Responses.SET_VALUES
     */
    SET_VALUES: 'joint:command:set-values',
    
    /**
     * Get current joint values
     * EMITTED BY: Any component
     * LISTENED BY: JointContext
     * PAYLOAD: {
     *   robotId: string,
     *   requestId: string    // Required
     * }
     * RESPONSE: JointEvents.Responses.GET_VALUES
     */
    GET_VALUES: 'joint:command:get-values',
    
    /**
     * Reset all joints to zero
     * EMITTED BY: Any component
     * LISTENED BY: JointContext
     * PAYLOAD: {
     *   robotId: string,
     *   requestId?: string
     * }
     * RESPONSE: JointEvents.Responses.RESET
     */
    RESET: 'joint:command:reset'
  },
  
  // ========== Responses ==========
  Responses: {
    /**
     * Response to set single joint value
     * PAYLOAD: {
     *   robotId: string,
     *   jointName: string,
     *   value: number,
     *   success: boolean,
     *   requestId?: string
     * }
     */
    SET_VALUE: 'joint:response:set-value',
    
    /**
     * Response to set multiple joint values
     * PAYLOAD: {
     *   robotId: string,
     *   values: Object,
     *   success: boolean,
     *   requestId?: string
     * }
     */
    SET_VALUES: 'joint:response:set-values',
    
    /**
     * Response to get joint values
     * PAYLOAD: {
     *   robotId: string,
     *   values: Object,
     *   requestId: string
     * }
     */
    GET_VALUES: 'joint:response:get-values',
    
    /**
     * Response to reset joints
     * PAYLOAD: {
     *   robotId: string,
     *   success: boolean,
     *   requestId?: string
     * }
     */
    RESET: 'joint:response:reset'
  }
};

// ============================================
// IK EVENTS
// ============================================
/**
 * Inverse Kinematics events namespace
 * 
 * Handles IK solver requests and results.
 * Primary consumers: IKContext, UI components
 * 
 * @namespace IKEvents
 */
export const IKEvents = {
  Commands: {
    /**
     * Request IK solution
     * EMITTED BY: Any component
     * LISTENED BY: IKContext
     * PAYLOAD: {
     *   robotId: string,
     *   targetPosition: {x,y,z},
     *   targetOrientation?: Object,  // Quaternion or euler
     *   requestId?: string
     * }
     */
    SOLVE: 'ik:command:solve'
  },
  
  /**
   * IK solution found
   * EMITTED BY: IKContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robotId: string,
   *   requestId?: string,
   *   solution: Object,    // Joint values
   *   iterations: number,
   *   error: number
   * }
   */
  SOLUTION_FOUND: 'ik:solution-found',
  
  /**
   * IK solver couldn't find solution
   * EMITTED BY: IKContext
   * LISTENED BY: UI components
   * PAYLOAD: {
   *   robotId: string,
   *   requestId?: string,
   *   reason: string,
   *   lastError: number
   * }
   */
  NO_SOLUTION: 'ik:no-solution'
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
  /**
   * Object added to environment
   * PAYLOAD: {
   *   objectId: string,
   *   type: string,
   *   position: {x,y,z},
   *   modelPath: string
   * }
   */
  OBJECT_SPAWNED: 'environment:object-spawned',
  
  /**
   * Object removed from environment
   * PAYLOAD: { objectId: string }
   */
  OBJECT_REMOVED: 'environment:object-removed',
  
  /**
   * Object selected in environment
   * PAYLOAD: {
   *   objectId: string,
   *   object: Object
   * }
   */
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
  /**
   * Object registered with scene
   * PAYLOAD: {
   *   type: string,      // 'robots', 'environment', 'trajectories', 'humans', 'custom'
   *   id: string,
   *   object: Object,
   *   metadata: Object
   * }
   */
  OBJECT_REGISTERED: 'scene:object-registered',
  
  /**
   * Object removed from scene registry
   * PAYLOAD: {
   *   type: string,
   *   id: string
   * }
   */
  OBJECT_UNREGISTERED: 'scene:object-unregistered',
  
  /**
   * Scene object properties updated
   * PAYLOAD: {
   *   type: string,
   *   id: string,
   *   updates: Object    // { position?, rotation?, scale?, visible? }
   * }
   */
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
  /**
   * Human character spawned
   * PAYLOAD: {
   *   id: string,
   *   name: string,
   *   isActive: boolean
   * }
   */
  SPAWNED: 'human:spawned',
  
  /**
   * Human character removed
   * PAYLOAD: { id: string }
   */
  REMOVED: 'human:removed',
  
  /**
   * Human character selected
   * PAYLOAD: { id: string }
   */
  SELECTED: 'human:selected',
  
  /**
   * Generate position update event name for specific human
   * @param {string} id - Human ID
   * @returns {string} Event name
   * @example
   *   const eventName = HumanEvents.positionUpdate('human_123');
   *   // Returns: 'human:position-update:human_123'
   */
  positionUpdate: (id) => `human:position-update:${id}`,
  
  /**
   * Helper to create position event name
   * @param {string} id - Human ID
   * @returns {string} Event name
   */
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
  /**
   * World initialization complete
   * PAYLOAD: { ground: Object, gridHelper: Object }
   */
  READY: 'world:ready',
  
  /**
   * World reset to defaults
   * PAYLOAD: none
   */
  RESET: 'world:reset',
  
  /**
   * World scene fully loaded
   * PAYLOAD: {
   *   environment: Array,
   *   robots: Array,
   *   timestamp: number
   * }
   */
  FULLY_LOADED: 'world:fully-loaded',
  
  /**
   * Gravity setting changed
   * PAYLOAD: { gravity: number }
   */
  GRAVITY_CHANGED: 'world:gravity-changed',
  
  /**
   * Grid visibility toggled
   * PAYLOAD: { visible: boolean }
   */
  GRID_TOGGLED: 'world:grid-toggled',
  
  /**
   * Grid appearance updated
   * PAYLOAD: {
   *   gridSize?: number,
   *   gridDivisions?: number,
   *   gridColor?: string,
   *   gridCenterColor?: string,
   *   gridHeight?: number
   * }
   */
  GRID_UPDATED: 'world:grid-updated',
  
  /**
   * Ground visibility toggled
   * PAYLOAD: { visible: boolean }
   */
  GROUND_TOGGLED: 'world:ground-toggled',
  
  /**
   * Ground color changed
   * PAYLOAD: { color: string }
   */
  GROUND_COLOR_CHANGED: 'world:ground-color-changed',
  
  /**
   * Ground opacity changed
   * PAYLOAD: { opacity: number }
   */
  GROUND_OPACITY_CHANGED: 'world:ground-opacity-changed',
  
  /**
   * Ground material properties changed
   * PAYLOAD: {
   *   roughness?: number,
   *   metalness?: number
   * }
   */
  GROUND_MATERIAL_CHANGED: 'world:ground-material-changed'
};

// ============================================
// TCP EVENTS
// ============================================
/**
 * Tool Center Point events namespace
 * 
 * Handles TCP tool attachment, transformation, and end effector updates.
 * Primary consumers: TCPContext, IKContext
 * 
 * @namespace TCPEvents
 */
export const TCPEvents = {
  /**
   * Request scene access from ViewerContext
   * PAYLOAD: { requestId: string }
   * RESPONSE: ViewerEvents.TCP_SCENE_RESPONSE
   */
  NEEDS_SCENE: 'tcp:needs-scene',
  
  /**
   * TCP tool attached to robot
   * PAYLOAD: {
   *   robotId: string,
   *   toolId: string,
   *   toolName: string,         // Always "tcp"
   *   originalToolName: string,
   *   endEffectorPoint: {x,y,z},
   *   toolDimensions: {x,y,z}
   * }
   */
  TOOL_ATTACHED: 'tcp:tool-attached',
  
  /**
   * TCP tool removed
   * PAYLOAD: {
   *   robotId: string,
   *   toolId: string
   * }
   */
  TOOL_REMOVED: 'tcp:tool-removed',
  
  /**
   * Tool transform changed
   * PAYLOAD: {
   *   robotId: string,
   *   toolId: string,
   *   transforms: Object,
   *   endEffectorPoint: {x,y,z},
   *   toolDimensions: {x,y,z}
   * }
   */
  TOOL_TRANSFORMED: 'tcp:tool-transformed',
  
  /**
   * Cross-context transform notification
   * PAYLOAD: {
   *   robotId: string,
   *   transforms: Object
   * }
   */
  TOOL_TRANSFORM_CHANGED: 'tcp:tool-transform-changed',
  
  /**
   * End effector position/orientation updated
   * PAYLOAD: {
   *   robotId: string,
   *   endEffectorPoint: {x,y,z},
   *   endEffectorOrientation: {x,y,z,w},
   *   hasTCP: boolean,
   *   toolDimensions?: {x,y,z}
   * }
   */
  ENDEFFECTOR_UPDATED: 'tcp:endeffector-updated',
  
  /**
   * Force recalculation of end effector
   * PAYLOAD: { robotId: string }
   */
  FORCE_RECALCULATE: 'tcp:force-recalculate'
};

// ============================================
// END EFFECTOR EVENTS
// ============================================
/**
 * End Effector events namespace
 * 
 * Dedicated namespace for end effector state management.
 * Ensures end effector is always up to date regardless of TCP attachment.
 * Primary consumers: Any component needing real-time end effector data
 * 
 * @namespace EndEffectorEvents
 */
export const EndEffectorEvents = {
  /**
   * End effector state updated (always emitted on any change)
   * EMITTED BY: TCPContext, JointContext
   * LISTENED BY: Any component needing end effector data
   * PAYLOAD: {
   *   robotId: string,
   *   position: {x,y,z},           // World position
   *   orientation: {x,y,z,w},      // World quaternion
   *   hasTCP: boolean,             // Whether TCP tool is attached
   *   tcpOffset?: {x,y,z},         // TCP offset if attached
   *   toolDimensions?: {x,y,z},    // Tool dimensions if TCP attached
   *   source: string,              // 'joint-change', 'tcp-attach', 'tcp-transform', etc.
   *   timestamp: number            // Update timestamp
   * }
   */
  UPDATED: 'endeffector:updated',
  
  /**
   * Request current end effector state
   * EMITTED BY: Any component
   * LISTENED BY: TCPContext
   * PAYLOAD: {
   *   robotId: string,
   *   requestId: string
   * }
   * RESPONSE: EndEffectorEvents.Responses.STATE
   */
  Commands: {
    GET_STATE: 'endeffector:command:get-state',
    
    /**
     * Force recalculation of end effector
     * EMITTED BY: Any component
     * LISTENED BY: TCPContext
     * PAYLOAD: {
     *   robotId: string,
     *   requestId?: string
     * }
     */
    RECALCULATE: 'endeffector:command:recalculate'
  },
  
  /**
   * Response events
   */
  Responses: {
    /**
     * Response to get end effector state
     * PAYLOAD: {
     *   robotId: string,
     *   position: {x,y,z},
     *   orientation: {x,y,z,w},
     *   hasTCP: boolean,
     *   tcpOffset?: {x,y,z},
     *   toolDimensions?: {x,y,z},
     *   requestId: string
     * }
     */
    STATE: 'endeffector:response:state'
  },
  
  /**
   * End effector tracking started for robot
   * PAYLOAD: { robotId: string }
   */
  TRACKING_STARTED: 'endeffector:tracking-started',
  
  /**
   * End effector tracking stopped for robot
   * PAYLOAD: { robotId: string }
   */
  TRACKING_STOPPED: 'endeffector:tracking-stopped'
};

// ============================================
// CAMERA EVENTS
// ============================================
/**
 * Camera control events namespace
 * 
 * Handles camera position, target, and property changes.
 * Primary consumers: CameraContext, ViewerContext
 * 
 * @namespace CameraEvents
 */
export const CameraEvents = {
  /**
   * Camera position changed
   * PAYLOAD: { position: {x,y,z} }
   */
  POSITION_CHANGED: 'camera:position-changed',
  
  /**
   * Camera target changed
   * PAYLOAD: { target: {x,y,z} }
   */
  TARGET_CHANGED: 'camera:target-changed',
  
  /**
   * Camera reset to default
   * PAYLOAD: none
   */
  RESET: 'camera:reset',
  
  /**
   * Focus on object requested
   * PAYLOAD: {
   *   object: Object,
   *   paddingMultiplier?: number
   * }
   */
  FOCUS_ON: 'camera:focus-on',
  
  /**
   * Focus operation complete
   * PAYLOAD: {
   *   position: {x,y,z},
   *   target: {x,y,z}
   * }
   */
  FOCUS_COMPLETE: 'camera:focus-complete',
  
  /**
   * Camera aspect ratio changed
   * PAYLOAD: { aspect: number }
   */
  ASPECT_CHANGED: 'camera:aspect-changed',
  
  /**
   * Camera field of view changed
   * PAYLOAD: { fov: number }
   */
  FOV_CHANGED: 'camera:fov-changed'
};

// ============================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================
// Robot Events
export const EVENT_ROBOT_NEEDS_SCENE = RobotEvents.NEEDS_SCENE;
export const EVENT_ROBOT_LOADED = RobotEvents.LOADED;
export const EVENT_ROBOT_UNLOADED = RobotEvents.UNLOADED;
export const EVENT_ROBOT_ACTIVE_CHANGED = RobotEvents.ACTIVE_CHANGED;
export const EVENT_ROBOT_JOINTS_CHANGED = RobotEvents.JOINTS_CHANGED;
export const EVENT_ROBOT_JOINT_CHANGED = RobotEvents.JOINT_CHANGED;
export const EVENT_ROBOT_JOINTS_RESET = RobotEvents.JOINTS_RESET;
export const EVENT_ROBOT_REMOVED = RobotEvents.REMOVED;
export const EVENT_ROBOT_WORKSPACE_UPDATED = RobotEvents.WORKSPACE_UPDATED;
export const EVENT_ROBOT_DISCOVERY_COMPLETE = RobotEvents.DISCOVERY_COMPLETE;
export const EVENT_ROBOT_LOADING_STATE_CHANGED = RobotEvents.LOADING_STATE_CHANGED;
export const EVENT_ROBOT_POSITION_CHANGED = RobotEvents.POSITION_CHANGED;
export const EVENT_ROBOT_TCP_ATTACHED = RobotEvents.TCP_ATTACHED;
export const EVENT_ROBOT_TCP_DETACHED = RobotEvents.TCP_DETACHED;
export const EVENT_ROBOT_REGISTERED = RobotEvents.REGISTERED;

// Robot Commands
export const EVENT_MOVE_JOINT = RobotEvents.Commands.MOVE_JOINT;
export const EVENT_MOVE_JOINTS = RobotEvents.Commands.MOVE_JOINTS;
export const EVENT_REQUEST_JOINTS = RobotEvents.Commands.REQUEST_JOINTS;
export const EVENT_RECEIVE_JOINTS = RobotEvents.Responses.JOINT_VALUES;
export const EVENT_COMMAND_LOAD_ROBOT = RobotEvents.Commands.LOAD;
export const EVENT_COMMAND_UNLOAD_ROBOT = RobotEvents.Commands.UNLOAD;
export const EVENT_COMMAND_SET_ACTIVE_ROBOT = RobotEvents.Commands.SET_ACTIVE;
export const EVENT_COMMAND_RESET_JOINTS = RobotEvents.Commands.RESET_JOINTS;
export const EVENT_COMMAND_ADD_TO_WORKSPACE = RobotEvents.Commands.ADD_TO_WORKSPACE;
export const EVENT_COMMAND_REMOVE_FROM_WORKSPACE = RobotEvents.Commands.REMOVE_FROM_WORKSPACE;
export const EVENT_COMMAND_DISCOVER_ROBOTS = RobotEvents.Commands.DISCOVER;
export const EVENT_COMMAND_SET_ROBOT_POSITION = RobotEvents.Commands.SET_POSITION;

// Viewer Events
export const EVENT_VIEWER_READY = ViewerEvents.READY;
export const EVENT_VIEWER_HERE_IS_SCENE = ViewerEvents.HERE_IS_SCENE;
export const EVENT_VIEWER_INITIALIZED = ViewerEvents.INITIALIZED;
export const EVENT_VIEWER_CONFIG_UPDATED = ViewerEvents.CONFIG_UPDATED;
export const EVENT_VIEWER_ROBOT_LOADED = ViewerEvents.ROBOT_LOADED;
export const EVENT_VIEWER_ROBOT_LOAD_ERROR = ViewerEvents.ROBOT_LOAD_ERROR;
export const EVENT_VIEWER_JOINTS_RESET = ViewerEvents.JOINTS_RESET;
export const EVENT_VIEWER_RESIZED = ViewerEvents.RESIZED;
export const EVENT_VIEWER_DISPOSED = ViewerEvents.DISPOSED;
export const EVENT_VIEWER_DRAG_START = ViewerEvents.DRAG_START;
export const EVENT_VIEWER_DRAG_END = ViewerEvents.DRAG_END;
export const EVENT_VIEWER_JOINT_HOVER = ViewerEvents.JOINT_HOVER;
export const EVENT_VIEWER_JOINT_UNHOVER = ViewerEvents.JOINT_UNHOVER;
export const EVENT_VIEWER_TABLE_LOADED = ViewerEvents.TABLE_LOADED;
export const EVENT_VIEWER_TABLE_TOGGLED = ViewerEvents.TABLE_TOGGLED;
export const EVENT_VIEWER_TCP_SCENE_RESPONSE = ViewerEvents.TCP_SCENE_RESPONSE;

// Joint Events
export const EVENT_JOINT_SET_VALUE = JointEvents.Commands.SET_VALUE;
export const EVENT_JOINT_SET_VALUE_RESPONSE = JointEvents.Responses.SET_VALUE;
export const EVENT_JOINT_SET_VALUES = JointEvents.Commands.SET_VALUES;
export const EVENT_JOINT_SET_VALUES_RESPONSE = JointEvents.Responses.SET_VALUES;
export const EVENT_JOINT_GET_VALUES = JointEvents.Commands.GET_VALUES;
export const EVENT_JOINT_GET_VALUES_RESPONSE = JointEvents.Responses.GET_VALUES;
export const EVENT_JOINT_RESET = JointEvents.Commands.RESET;
export const EVENT_JOINT_RESET_RESPONSE = JointEvents.Responses.RESET;

// IK Events
export const EVENT_IK_SOLVE = IKEvents.Commands.SOLVE;
export const EVENT_IK_SOLUTION_FOUND = IKEvents.SOLUTION_FOUND;
export const EVENT_IK_NO_SOLUTION = IKEvents.NO_SOLUTION;

// Environment Events
export const EVENT_ENVIRONMENT_OBJECT_SPAWNED = EnvironmentEvents.OBJECT_SPAWNED;
export const EVENT_ENVIRONMENT_OBJECT_REMOVED = EnvironmentEvents.OBJECT_REMOVED;
export const EVENT_ENVIRONMENT_OBJECT_SELECTED = EnvironmentEvents.OBJECT_SELECTED;

// Scene Events
export const EVENT_SCENE_OBJECT_REGISTERED = SceneEvents.OBJECT_REGISTERED;
export const EVENT_SCENE_OBJECT_UNREGISTERED = SceneEvents.OBJECT_UNREGISTERED;
export const EVENT_SCENE_OBJECT_UPDATED = SceneEvents.OBJECT_UPDATED;

// Human Events
export const EVENT_HUMAN_SPAWNED = HumanEvents.SPAWNED;
export const EVENT_HUMAN_REMOVED = HumanEvents.REMOVED;
export const EVENT_HUMAN_SELECTED = HumanEvents.SELECTED;
export const EVENT_HUMAN_POSITION_UPDATE = HumanEvents.positionUpdate;
export const createHumanPositionEventName = HumanEvents.createPositionEventName;

// World Events
export const EVENT_WORLD_READY = WorldEvents.READY;
export const EVENT_WORLD_RESET = WorldEvents.RESET;
export const EVENT_WORLD_FULLY_LOADED = WorldEvents.FULLY_LOADED;
export const EVENT_WORLD_GRAVITY_CHANGED = WorldEvents.GRAVITY_CHANGED;
export const EVENT_WORLD_GRID_TOGGLED = WorldEvents.GRID_TOGGLED;
export const EVENT_WORLD_GRID_UPDATED = WorldEvents.GRID_UPDATED;
export const EVENT_WORLD_GROUND_TOGGLED = WorldEvents.GROUND_TOGGLED;
export const EVENT_WORLD_GROUND_COLOR_CHANGED = WorldEvents.GROUND_COLOR_CHANGED;
export const EVENT_WORLD_GROUND_OPACITY_CHANGED = WorldEvents.GROUND_OPACITY_CHANGED;
export const EVENT_WORLD_GROUND_MATERIAL_CHANGED = WorldEvents.GROUND_MATERIAL_CHANGED;

// TCP Events
export const EVENT_TCP_NEEDS_SCENE = TCPEvents.NEEDS_SCENE;
export const EVENT_TCP_TOOL_ATTACHED = TCPEvents.TOOL_ATTACHED;
export const EVENT_TCP_TOOL_REMOVED = TCPEvents.TOOL_REMOVED;
export const EVENT_TCP_TOOL_TRANSFORMED = TCPEvents.TOOL_TRANSFORMED;
export const EVENT_TCP_TOOL_TRANSFORM_CHANGED = TCPEvents.TOOL_TRANSFORM_CHANGED;
export const EVENT_TCP_ENDEFFECTOR_UPDATED = TCPEvents.ENDEFFECTOR_UPDATED;
export const EVENT_TCP_FORCE_RECALCULATE = TCPEvents.FORCE_RECALCULATE;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create a request/response pattern for async communication
 * 
 * @param {string} eventName - Base event name (usually a command)
 * @param {Object} payload - Event payload
 * @param {Function} callback - Callback for response
 * @returns {string} requestId - Unique request identifier
 * 
 * @example
 * // Request joint values
 * createRequest(JointEvents.Commands.GET_VALUES, 
 *   { robotId: 'ur5_001' }, 
 *   (response) => {
 *     console.log('Joint values:', response.values);
 *   }
 * );
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
 * Emit error events with standard format
 * 
 * @param {string} context - Context name (robot, viewer, tcp, etc)
 * @param {string} operation - Operation that failed
 * @param {Error} error - Error object
 * 
 * @example
 * emitError('robot', 'loadRobot', new Error('URDF not found'));
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
 * Create a typed event emitter function
 * 
 * @param {string} eventName - Event name
 * @returns {Function} Typed emitter function
 * 
 * @example
 * const emitRobotLoaded = createEmitter(RobotEvents.LOADED);
 * emitRobotLoaded({ robotId: 'ur5_001', robot: robotObject });
 */
export const createEmitter = (eventName) => {
  return (payload) => EventBus.emit(eventName, payload);
};

/**
 * Create a typed event listener function
 * 
 * @param {string} eventName - Event name
 * @returns {Function} Typed listener function
 * 
 * @example
 * const onRobotLoaded = createListener(RobotEvents.LOADED);
 * const unsubscribe = onRobotLoaded((payload) => {
 *   console.log('Robot loaded:', payload.robotId);
 * });
 */
export const createListener = (eventName) => {
  return (handler) => EventBus.on(eventName, handler);
};

/**
 * Create a namespaced event string
 * 
 * @param {string} namespace - Event namespace
 * @param {string} eventName - Event name
 * @returns {string} Namespaced event
 * 
 * @example
 * const myEvent = createNamespacedEvent('mymodule', 'custom-event');
 * // Returns: 'mymodule:custom-event'
 */
export const createNamespacedEvent = (namespace, eventName) => {
  return `${namespace}:${eventName}`;
};

/**
 * Emit multiple events in sequence
 * 
 * @param {Array<{event: string, payload: any}>} events - Array of events to emit
 * 
 * @example
 * batchEmit([
 *   { event: RobotEvents.LOADED, payload: { robotId: 'ur5_001' } },
 *   { event: RobotEvents.ACTIVE_CHANGED, payload: { robotId: 'ur5_001' } }
 * ]);
 */
export const batchEmit = (events) => {
  events.forEach(({ event, payload }) => {
    EventBus.emit(event, payload);
  });
};

/**
 * Create a subscription manager for handling multiple event subscriptions
 * 
 * @returns {Object} Subscription manager with subscribe and unsubscribeAll methods
 * 
 * @example
 * const subscriptions = createSubscriptionManager();
 * 
 * // Subscribe to multiple events
 * subscriptions.subscribe(RobotEvents.LOADED, handleRobotLoaded);
 * subscriptions.subscribe(RobotEvents.REMOVED, handleRobotRemoved);
 * 
 * // Later: unsubscribe from all
 * subscriptions.unsubscribeAll();
 */
export const createSubscriptionManager = () => {
  const subscriptions = [];
  
  return {
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {Function} Unsubscribe function
     */
    subscribe: (event, handler) => {
      const unsubscribe = EventBus.on(event, handler);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    },
    
    /**
     * Unsubscribe from all events
     */
    unsubscribeAll: () => {
      subscriptions.forEach(unsub => unsub());
      subscriptions.length = 0;
    },
    
    /**
     * Get count of active subscriptions
     * @returns {number} Number of active subscriptions
     */
    get count() {
      return subscriptions.length;
    }
  };
};