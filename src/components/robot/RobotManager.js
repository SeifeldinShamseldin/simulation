import * as THREE from 'three';
import URDFLoader from '../../core/Loader/URDFLoader';
import EventBus from '../../utils/EventBus';

/**
 * Class for managing URDF robot models
 * Now uses unified RobotService for configuration management
 */
class RobotManager {
    /**
     * Create a RobotManager instance
     * @param {SceneSetup} sceneSetup - The scene setup instance
     */
    constructor(sceneSetup) {
        this.sceneSetup = sceneSetup;
        this.loader = new URDFLoader(new THREE.LoadingManager());
        this.currentRobot = null;
        this.robots = new Map();
        
        // Configure loader
        this.loader.parseVisual = true;
        this.loader.parseCollision = false;
    }
    
    /**
     * Load a URDF model using unified RobotService
     * @param {string} robotId - The ID of the robot
     * @param {string} urdfPath - The path to the URDF file
     * @returns {Promise<Object>} A promise that resolves to the loaded robot
     */
    async loadRobot(robotId, urdfPath) {
        try {
            // Clear current robot
            if (this.currentRobot) {
                this.sceneSetup.clearRobot();
                this.currentRobot = null;
            }
            
            // Extract package path from urdf path
            const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
            
            // Reset loader state
            this.loader.packages = packagePath;
            this.loader.currentRobotName = robotId;
            
            console.log(`Loading robot ${robotId} from ${urdfPath}`);
            console.log(`Package path: ${packagePath}`);
            
            // Load URDF using a promise wrapper since loadAsync might not exist
            const robot = await new Promise((resolve, reject) => {
                this.loader.load(urdfPath, resolve, null, reject);
            });
            
            // Store and add to scene
            this.robots.set(robotId, robot);
            this.currentRobot = robot;
            this.sceneSetup.addRobotObject(robot);
            
            // Focus camera
            setTimeout(() => {
                this.sceneSetup.focusOnObject(robot);
            }, 100);
            
            return robot;
            
        } catch (error) {
            console.error(`Failed to load robot ${robotId}:`, error);
            throw error;
        }
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
        if (!this.currentRobot) return false;
        return this.currentRobot.setJointValue(jointName, parseFloat(value));
    }
    
    /**
     * Set multiple joint values on the current robot
     * @param {Object} values - Map of joint names to values
     * @returns {boolean} Whether any joints were found and set
     */
    setJointValues(values) {
        if (!this.currentRobot) return false;
        return this.currentRobot.setJointValues(values);
    }
    
    /**
     * Get all joint values from the current robot
     * @returns {Object|null} Map of joint names to values, or null if no robot is loaded
     */
    getJointValues() {
        if (!this.currentRobot) return {};
        
        const values = {};
        Object.entries(this.currentRobot.joints).forEach(([name, joint]) => {
            if (joint.jointType !== 'fixed') {
                values[name] = joint.jointValue ? joint.jointValue[0] : 0;
            }
        });
        
        return values;
    }
    
    /**
     * Reset all joints to their zero position
     */
    resetJoints() {
        if (!this.currentRobot) return;
        
        const resetValues = {};
        Object.keys(this.currentRobot.joints).forEach(name => {
            const joint = this.currentRobot.joints[name];
            if (joint.jointType !== 'fixed') {
                resetValues[name] = 0;
            }
        });
        
        this.currentRobot.setJointValues(resetValues);
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.sceneSetup.clearRobot();
        this.robots.clear();
        this.currentRobot = null;
    }
}

export default RobotManager;