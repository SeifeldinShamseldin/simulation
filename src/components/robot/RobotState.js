import { ROBOT_EVENTS } from '@/utils/GlobalVariables';

/**
 * Class for managing robot state and configuration
 */
class RobotState {
    /**
     * Create a RobotState instance
     * @param {RobotManager} robotManager - The robot manager instance
     */
    constructor(robotManager) {
        this.robotManager = robotManager;
        this.options = {
            ignoreLimits: false,
            showCollision: false,
            upAxis: '+Z',
            autoRecenter: true
        };
        
        // Keep track of joint change history for undo/redo
        this.jointStateHistory = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySize = 50;
        
        // Register for joint change events
        this._setupEventListeners();
    }
    
    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        document.addEventListener('angle-change', (e) => {
            // When a joint changes, save the state to history
            // This needs to be slight delayed to ensure the robot state is updated first
            setTimeout(() => {
                this._saveToHistory();
                
                // Notify listeners about the joint change
                if (ROBOT_EVENTS.onJointChange) {
                    ROBOT_EVENTS.onJointChange(e.detail.joint, this.robotManager.getJointValues());
                }
            }, 10);
        });
    }
    
    /**
     * Save current state to history
     * @private
     */
    _saveToHistory() {
        const robot = this.robotManager.getCurrentRobot();
        if (!robot) return;
        
        // Get current joint values
        const jointValues = this.robotManager.getJointValues();
        if (!jointValues) return;
        
        // Only save if joint values actually changed
        const currentState = JSON.stringify(jointValues);
        
        // Don't save if this is the same as the latest state
        if (this.jointStateHistory.length > 0 && 
            this.jointStateHistory[this.currentHistoryIndex] === currentState) {
            return;
        }
        
        // If we've gone back in history and now we're making a new change,
        // discard any future history
        if (this.currentHistoryIndex < this.jointStateHistory.length - 1) {
            this.jointStateHistory = this.jointStateHistory.slice(0, this.currentHistoryIndex + 1);
        }
        
        // Add current state to history
        this.jointStateHistory.push(currentState);
        this.currentHistoryIndex = this.jointStateHistory.length - 1;
        
        // Limit history size
        if (this.jointStateHistory.length > this.maxHistorySize) {
            this.jointStateHistory.shift();
            this.currentHistoryIndex--;
        }
        
        // Make sure to update the UI
        if (ROBOT_EVENTS.onJointChange) {
            ROBOT_EVENTS.onJointChange(null, jointValues);
        }
    }
    
    /**
     * Set whether to ignore joint limits
     * @param {boolean} ignore - Whether to ignore joint limits
     */
    setIgnoreLimits(ignore) {
        this.options.ignoreLimits = ignore;
        this.robotManager.setIgnoreLimits(ignore);
        
        if (ROBOT_EVENTS.onOptionsChange) {
            ROBOT_EVENTS.onOptionsChange('ignoreLimits', ignore);
        }
    }
    
    /**
     * Set whether to show collision geometry
     * @param {boolean} show - Whether to show collision geometry
     */
    setShowCollision(show) {
        this.options.showCollision = show;
        
        // This would need to reload the model with collision geometry enabled
        // or toggle visibility of existing collision geometry
        
        if (ROBOT_EVENTS.onOptionsChange) {
            ROBOT_EVENTS.onOptionsChange('showCollision', show);
        }
    }
    
    /**
     * Set the up axis for the robot
     * @param {string} axis - The up axis (e.g., '+Z', '-Y')
     */
    setUpAxis(axis) {
        this.options.upAxis = axis;
        
        // Update the scene
        const scene = this.robotManager.sceneSetup;
        if (scene) {
            scene.setUpAxis(axis);
        }
        
        if (ROBOT_EVENTS.onOptionsChange) {
            ROBOT_EVENTS.onOptionsChange('upAxis', axis);
        }
    }
    
    /**
     * Set whether to automatically recenter the camera on the robot
     * @param {boolean} auto - Whether to automatically recenter
     */
    setAutoRecenter(auto) {
        this.options.autoRecenter = auto;
        
        if (ROBOT_EVENTS.onOptionsChange) {
            ROBOT_EVENTS.onOptionsChange('autoRecenter', auto);
        }
    }
    
    /**
     * Recenter the camera on the robot
     */
    recenter() {
        const scene = this.robotManager.sceneSetup;
        const robot = this.robotManager.getCurrentRobot();
        
        if (scene && robot) {
            scene.focusOnObject(robot);
        }
    }
    
    /**
     * Undo the last joint change
     * @returns {boolean} Whether the undo was successful
     */
    undo() {
        if (this.currentHistoryIndex <= 0) {
            return false;  // Nothing to undo
        }
        
        this.currentHistoryIndex--;
        const previousState = JSON.parse(this.jointStateHistory[this.currentHistoryIndex]);
        
        // Apply the previous state
        this.robotManager.setJointValues(previousState);
        
        if (ROBOT_EVENTS.onUndo) {
            ROBOT_EVENTS.onUndo(previousState);
        }
        
        return true;
    }
    
    /**
     * Redo the last undone joint change
     * @returns {boolean} Whether the redo was successful
     */
    redo() {
        if (this.currentHistoryIndex >= this.jointStateHistory.length - 1) {
            return false;  // Nothing to redo
        }
        
        this.currentHistoryIndex++;
        const nextState = JSON.parse(this.jointStateHistory[this.currentHistoryIndex]);
        
        // Apply the next state
        this.robotManager.setJointValues(nextState);
        
        if (ROBOT_EVENTS.onRedo) {
            ROBOT_EVENTS.onRedo(nextState);
        }
        
        return true;
    }
    
    /**
     * Reset all joints to their zero position
     */
    resetJoints() {
        this.robotManager.resetJoints();
        
        // Save the reset state to history
        this._saveToHistory();
        
        if (ROBOT_EVENTS.onReset) {
            ROBOT_EVENTS.onReset();
        }
    }
    
    /**
     * Save the current robot state
     * @returns {Object} The saved state
     */
    saveState() {
        const robot = this.robotManager.getCurrentRobot();
        if (!robot) {
            return null;
        }
        
        // Create a state object with joint values and options
        const state = {
            robotName: robot.robotName,
            jointValues: {...robot.jointValues},
            options: {...this.options}
        };
        
        if (ROBOT_EVENTS.onStateSave) {
            ROBOT_EVENTS.onStateSave(state);
        }
        
        return state;
    }
    
    /**
     * Load a saved robot state
     * @param {Object} state - The state to load
     * @returns {boolean} Whether the state was loaded successfully
     */
    loadState(state) {
        if (!state || !state.robotName || !state.jointValues) {
            return false;
        }
        
        // Check if the robot is loaded
        const robot = this.robotManager.getRobot(state.robotName);
        if (!robot) {
            console.warn(`Robot '${state.robotName}' not loaded`);
            return false;
        }
        
        // Switch to the robot if not current
        if (this.robotManager.getCurrentRobot() !== robot) {
            this.robotManager.switchRobot(state.robotName);
        }
        
        // Apply joint values
        this.robotManager.setJointValues(state.jointValues);
        
        // Apply options
        if (state.options) {
            if (state.options.ignoreLimits !== undefined) {
                this.setIgnoreLimits(state.options.ignoreLimits);
            }
            
            if (state.options.showCollision !== undefined) {
                this.setShowCollision(state.options.showCollision);
            }
            
            if (state.options.upAxis !== undefined) {
                this.setUpAxis(state.options.upAxis);
            }
            
            if (state.options.autoRecenter !== undefined) {
                this.setAutoRecenter(state.options.autoRecenter);
            }
        }
        
        // Save to history
        this._saveToHistory();
        
        if (ROBOT_EVENTS.onStateLoad) {
            ROBOT_EVENTS.onStateLoad(state);
        }
        
        return true;
    }
    
    /**
     * Get information about the current robot
     * @returns {Object|null} Information about the robot, or null if no robot is loaded
     */
    getRobotInfo() {
        const robot = this.robotManager.getCurrentRobot();
        if (!robot) {
            return null;
        }
        
        return {
            name: robot.robotName,
            joints: this.robotManager.getJointsInfo(),
            links: Object.keys(robot.links).length,
            jointCount: Object.keys(robot.joints).length
        };
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        // Clean up event listeners if needed
        // ...
        
        // Clear history
        this.jointStateHistory = [];
        this.currentHistoryIndex = -1;
    }
}

export default RobotState;