import * as THREE from 'three';
import URDFLoader from '@/core/Loader/URDFLoader';
import { ROBOT_EVENTS, GLOBAL_CONFIG, Logger } from '@/utils/GlobalVariables';
import { robotRegistry } from '@/core/Config/RobotConfigRegistry';

/**
 * Class for managing URDF robot models
 */
class RobotManager {
    /**
     * Create a RobotManager instance
     * @param {SceneSetup} sceneSetup - The scene setup instance
     */
    constructor(sceneSetup) {
        this.sceneSetup = sceneSetup;
        this.currentRobot = null;
        this.robotMap = new Map();  // Store robots by ID/name
        
        // Create loader
        this.loader = new URDFLoader(new THREE.LoadingManager());
        
        // Configure loader
        this.loader.parseVisual = true;
        this.loader.parseCollision = GLOBAL_CONFIG.showCollisions;
        
        // Set default packages path
        this.setPackagesPath('/robots/');
    }
    
    /**
     * Set the path to the packages directory
     * @param {string} path - The path to the packages directory
     */
    setPackagesPath(path) {
        this.loader.packages = path;
    }
    
    /**
     * Load a URDF model
     * @param {string} robotName - The name of the robot
     * @param {string} urdfPath - The path to the URDF file
     * @returns {Promise<Object>} A promise that resolves to the loaded robot
     */
    async loadRobot(robotName, urdfPath) {
        // Show loading indicator
        if (ROBOT_EVENTS.onLoadStart) {
            ROBOT_EVENTS.onLoadStart(robotName);
        }
        
        // Clear existing robot
        this.clearRobot();
        
        try {
            // Set the current robot name in the loader
            this.loader.currentRobotName = robotName;
            
            // Set packages path to the URDF's directory (not just /robots/robotName)
            // This ensures meshes are found even for multi-level paths
            const urdfDir = urdfPath.substring(0, urdfPath.lastIndexOf('/') + 1);
            this.loader.packages = urdfDir;
            
            // Load the URDF model
            const robot = await this.loader.loadAsync(urdfPath);
            
            // Store the robot
            this.robotMap.set(robotName, robot);
            this.currentRobot = robot;
            
            // Add to scene
            this.sceneSetup.addRobotObject(robot);
            
            // Update scene based on robot
            this.updateSceneForRobot(robot);
            
            // Trigger load completed event
            if (ROBOT_EVENTS.onLoadComplete) {
                ROBOT_EVENTS.onLoadComplete(robotName, robot);
            }
            
            return robot;
        } catch (error) {
            Logger.error(`Error loading robot ${robotName}:`, error);
            
            // Trigger load error event
            if (ROBOT_EVENTS.onLoadError) {
                ROBOT_EVENTS.onLoadError(robotName, error);
            }
            
            throw error;
        }
    }
    
    /**
     * Update the scene for a specific robot
     * @param {Object} robot - The robot to update the scene for
     */
    updateSceneForRobot(robot) {
        console.log("Robot geometry:", robot);
        console.log("Robot children:", robot.children);
        // Set up the coordinate system
        this.sceneSetup.setUpAxis(GLOBAL_CONFIG.upAxis);
        
        // Apply initial joint values if specified
        if (GLOBAL_CONFIG.initialJointValues && typeof GLOBAL_CONFIG.initialJointValues === 'object') {
            robot.setJointValues(GLOBAL_CONFIG.initialJointValues);
        }
        
        // Focus camera on the robot with a slight delay to ensure everything is ready
        setTimeout(() => {
            this.sceneSetup.focusOnObject(robot);
        }, 100);
    }
    
    /**
     * Clear the current robot from the scene
     */
    clearRobot() {
        this.sceneSetup.clearRobot();
        this.currentRobot = null;
    }
    
    /**
     * Switch to a different robot model
     * @param {string} robotName - The name of the robot to switch to
     * @returns {boolean} Whether the switch was successful
     */
    switchRobot(robotName) {
        if (!this.robotMap.has(robotName)) {
            console.warn(`Robot '${robotName}' not loaded`);
            return false;
        }
        
        // Clear current robot
        this.clearRobot();
        
        // Get the robot from the map
        const robot = this.robotMap.get(robotName);
        this.currentRobot = robot;
        
        // Add to scene
        this.sceneSetup.addRobotObject(robot);
        
        // Update scene based on robot
        this.updateSceneForRobot(robot);
        
        return true;
    }
    
    /**
     * Get a list of loaded robot names
     * @returns {string[]} The names of loaded robots
     */
    getLoadedRobots() {
        return Array.from(this.robotMap.keys());
    }
    
    /**
     * Get a robot by name
     * @param {string} robotName - The name of the robot
     * @returns {Object|null} The robot, or null if not found
     */
    getRobot(robotName) {
        return this.robotMap.get(robotName) || null;
    }
    
    /**
     * Get the current robot
     * @returns {Object|null} The current robot, or null if none
     */
    getCurrentRobot() {
        return this.currentRobot;
    }
    
    /**
     * Set a joint value
     * @param {string} jointName - The name of the joint
     * @param {number|string} value - The value to set
     * @returns {boolean} Whether the joint value was changed
     */
    setJointValue(jointName, value) {
        if (!this.currentRobot) {
            Logger.warn('No robot loaded');
            return false;
        }
        
        // Make sure value is a number
        value = parseFloat(value);
        
        Logger.info(`Setting joint ${jointName} to value: ${value}`);
        
        // Set joint value and get whether it changed
        const changed = this.currentRobot.setJointValue(jointName, value);
        
        // Store the value in our local map for reference
        if (changed) {
            // Store the value in the robot's jointValues
            if (!this.currentRobot.jointValues) {
                this.currentRobot.jointValues = {};
            }
            this.currentRobot.jointValues[jointName] = value;
            
            // Fire event
            if (ROBOT_EVENTS.onJointChange) {
                ROBOT_EVENTS.onJointChange(jointName, this.currentRobot.jointValues);
            }
        }
        
        return changed;
    }
    
    /**
     * Set multiple joint values on the current robot
     * @param {Object} jointValues - Map of joint names to values
     * @returns {boolean} Whether any joints were found and set
     */
    setJointValues(jointValues) {
        if (!this.currentRobot) {
            console.warn('No robot loaded');
            return false;
        }
        
        return this.currentRobot.setJointValues(jointValues);
    }
    
    /**
     * Get all joint values from the current robot
     * @returns {Object|null} Map of joint names to values, or null if no robot is loaded
     */
    getJointValues() {
        if (!this.currentRobot) {
            return null;
        }
        
        // Get the joint values from the robot's joints (make a copy)
        const values = {};
        Object.entries(this.currentRobot.joints).forEach(([name, joint]) => {
            if (joint.jointType !== 'fixed' && joint.jointValue) {
                values[name] = joint.jointValue[0]; // Typically the first value is the angle
            }
        });
        
        return values;
    }
    
    /**
     * Get information about all joints in the current robot
     * @returns {Object[]|null} Array of joint information, or null if no robot is loaded
     */
    getJointsInfo() {
        if (!this.currentRobot) {
            return null;
        }
        
        const jointInfo = [];
        
        for (const [name, joint] of Object.entries(this.currentRobot.joints)) {
            jointInfo.push({
                name,
                type: joint.jointType,
                value: joint.jointValue,
                limit: joint.limit,
                axis: joint.axis.toArray()
            });
        }
        
        return jointInfo;
    }
    
    /**
     * Set whether to ignore joint limits
     * @param {boolean} ignore - Whether to ignore joint limits
     */
    setIgnoreLimits(ignore) {
        if (!this.currentRobot) {
            return;
        }
        
        Object.values(this.currentRobot.joints).forEach(joint => {
            joint.ignoreLimits = ignore;
        });
        
        // Re-apply current joint values to enforce or release limits
        this.currentRobot.setJointValues(this.currentRobot.jointValues);
    }
    
    /**
     * Reset all joints to their zero position
     */
    resetJoints() {
        if (!this.currentRobot) {
            return;
        }
        
        const resetValues = {};
        
        Object.keys(this.currentRobot.joints).forEach(name => {
            const joint = this.currentRobot.joints[name];
            if (joint.jointType !== 'fixed') {
                if (joint.jointValue.length === 1) {
                    resetValues[name] = 0;
                } else {
                    resetValues[name] = new Array(joint.jointValue.length).fill(0);
                }
            }
        });
        
        this.currentRobot.setJointValues(resetValues);
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.clearRobot();
        this.robotMap.clear();
    }
}

export default RobotManager;