// Import controllers
// import ccdSolver from './CCDSolver'; // Removed because file does not exist

/**
 * Global configuration for the URDF viewer application
 * @type {Object}
 */
export const GLOBAL_CONFIG = {
    // Scene and renderer settings
    backgroundColor: '#f0f0f0',
    enableShadows: true,
    ambientColor: '#404040',
    
    // URDF loader settings
    showCollisions: false,
    defaultPackagePath: '/robots/',
    
    // Camera settings
    defaultCameraPosition: [3, 3, 3],  // Default camera position when no object to focus on
    defaultCameraTarget: [0, 0, 0],    // Default camera target when no object to focus on
    
    // Focus settings
    focusPadding: 10,                   // Padding multiplier for camera distance when focusing (higher = further away)
    focusLightOffset: [2, 3, 1],       // Directional light offset relative to focused object
    shadowCameraSize: 1.5,             // Multiplier for shadow camera size relative to object radius
    
    // Ground settings
    groundOffset: 0.01,                // Offset of ground plane below the object's bottom
    groundSize: 40,                    // Size of the ground plane
    groundOpacity: 0.25,               // Opacity of the ground shadow material
    
    // Joint limits
    defaultJointLimit: 3.14,           // Default joint limit when ignoring limits (PI radians)
    jointStepSize: 0.01,               // Step size for joint sliders
    
    // Robot settings
    upAxis: '+Z',
    initialJointValues: null,  // Set to null so it doesn't override user changes
    
    // UI settings
    autoRotate: false,
    showAxes: true,
    showGrid: true,
    enableDragging: true,
    highlightColor: '#ff0000',
    
    // Debug settings
    debug: false,
    logLevel: 'info'  // 'debug', 'info', 'warn', 'error'
};

/**
 * Event handlers for the URDF loader
 * @type {Object}
 */
export const LOADER_EVENTS = {
    // Called when loading starts
    onLoadStart: null,
    
    // Called when loading completes
    onLoadComplete: null,
    
    // Called when loading fails
    onLoadError: null,
    
    // Called when loading progresses
    onLoadProgress: null
};

/**
 * Event handlers for robot state changes
 * @type {Object}
 */
export const ROBOT_EVENTS = {
    // Called when a joint changes
    onJointChange: null,
    
    // Called when options change
    onOptionsChange: null,
    
    // Called when a robot is loaded
    onLoadStart: null,
    onLoadComplete: null,
    onLoadError: null,
    
    // Called when state is saved or loaded
    onStateSave: null,
    onStateLoad: null,
    
    // Called when undoing or redoing changes
    onUndo: null,
    onRedo: null,
    
    // Called when joints are reset
    onReset: null
};

/**
 * Robot presets for quick loading
 * @type {Object}
 */
export const ROBOT_PRESETS = {
    'UR5': {
        name: 'UR5',
        path: '/robots/ur5/ur5.urdf',
        description: 'Universal Robots UR5'
    },
    // Add more robots here as needed
};

/**
 * END_EFFECTOR_CONTROLLER has been moved to the unified IK API
 * Please import ikAPI from '../core/IK/API/IKAPI' instead
 * @deprecated
 */
export const END_EFFECTOR_CONTROLLER = {}; // Empty object for backward compatibility

/**
 * Register a callback for a loader event
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function registerLoaderEvent(event, callback) {
    if (event in LOADER_EVENTS && typeof callback === 'function') {
        LOADER_EVENTS[event] = callback;
    } else {
        console.warn(`Invalid loader event: ${event}`);
    }
}

/**
 * Register a callback for a robot event
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function registerRobotEvent(event, callback) {
    if (event in ROBOT_EVENTS && typeof callback === 'function') {
        ROBOT_EVENTS[event] = callback;
    } else {
        console.warn(`Invalid robot event: ${event}`);
    }
}

/**
 * Update a global configuration value
 * @param {string} key - The configuration key
 * @param {*} value - The new value
 */
export function updateGlobalConfig(key, value) {
    if (key in GLOBAL_CONFIG) {
        GLOBAL_CONFIG[key] = value;
    } else {
        console.warn(`Invalid configuration key: ${key}`);
    }
}

/**
 * Reset global configuration to defaults
 */
export function resetGlobalConfig() {
    Object.assign(GLOBAL_CONFIG, {
        backgroundColor: '#f5f5f5',
        enableShadows: true,
        ambientColor: '#8ea0a8',
        showCollisions: false,
        defaultPackagePath: '/robots/',
        defaultCameraPosition: [2, 2, 2],
        upAxis: '+Z',
        initialJointValues: null,
        autoRotate: false,
        showAxes: true,
        showGrid: true,
        enableDragging: true,
        highlightColor: '#00a8ff',
        debug: false,
        logLevel: 'info'
    });
}

/**
 * Toggle debug mode on/off
 * @param {boolean} [enabled] - Optional boolean to explicitly set debug mode. If not provided, toggles current state
 * @returns {boolean} The new debug mode state
 */
export function toggleDebugMode(enabled) {
    GLOBAL_CONFIG.debug = enabled === undefined ? !GLOBAL_CONFIG.debug : enabled;
    Logger.info(`Debug mode ${GLOBAL_CONFIG.debug ? 'enabled' : 'disabled'}`);
    return GLOBAL_CONFIG.debug;
}

/**
 * Logger for the application
 */
export const Logger = {
    levels: {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    },
    
    /**
     * Get the current log level
     * @returns {number} The log level
     */
    getLevel() {
        return this.levels[GLOBAL_CONFIG.logLevel] || 1;
    },
    
    /**
     * Log a debug message
     * @param {...*} args - Arguments to log
     */
    debug(...args) {
        if (this.getLevel() <= this.levels.debug) {
            console.debug('[URDF Viewer]', ...args);
        }
    },
    
    /**
     * Log an info message
     * @param {...*} args - Arguments to log
     */
    info(...args) {
        if (this.getLevel() <= this.levels.info) {
            console.info('[URDF Viewer]', ...args);
        }
    },
    
    /**
     * Log a warning message
     * @param {...*} args - Arguments to log
     */
    warn(...args) {
        if (this.getLevel() <= this.levels.warn) {
            console.warn('[URDF Viewer]', ...args);
        }
    },
    
    /**
     * Log an error message
     * @param {...*} args - Arguments to log
     */
    error(...args) {
        if (this.getLevel() <= this.levels.error) {
            console.error('[URDF Viewer]', ...args);
        }
    }
};

// Export everything as a namespace
export default {
    GLOBAL_CONFIG,
    LOADER_EVENTS,
    ROBOT_EVENTS,
    ROBOT_PRESETS,
    END_EFFECTOR_CONTROLLER,
    registerLoaderEvent,
    registerRobotEvent,
    updateGlobalConfig,
    resetGlobalConfig,
    toggleDebugMode,
    Logger
};