import * as THREE from 'three';
import URDFLoader from '../../core/Loader/URDFLoader';
import EventBus from '../../utils/EventBus';
import MeshLoader from '../../core/Loader/MeshLoader';

// Robot event handlers
const ROBOT_EVENTS = {
    onLoadComplete: null,
    onLoadError: null
};

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
        this.robotMap = new Map();
        
        // Configure loader
        this.loader.parseVisual = true;
        this.loader.parseCollision = false;
    }
    
    /**
     * Load a URDF model using unified RobotService
     * @param {string} robotName - The name of the robot
     * @param {string} urdfPath - The path to the URDF file
     * @returns {Promise<Object>} A promise that resolves to the loaded robot
     */
    async loadRobot(robotName, urdfPath) {
        try {
            // Extract package path from urdf path
            const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
            
            // Reset loader state
            this.loader.resetLoader();
            this.loader.packages = packagePath;
            this.loader.currentRobotName = robotName;
            
            // Always set up loadMeshCb before loading
            this.loader.loadMeshCb = (path, manager, done, material) => {
                // Get just the filename
                const filename = path.split('/').pop();
                
                // Use current packages path
                const resolvedPath = `${this.loader.packages}/${filename}`;
                
                console.debug('Loading mesh:', path);
                console.debug('Resolved mesh path:', resolvedPath);
                
                MeshLoader.load(resolvedPath, manager, (obj, err) => {
                    if (err) {
                        console.error('Error loading mesh:', err);
                        done(null, err);
                        return;
                    }
                    
                    if (obj) {
                        // Apply material if needed
                        obj.traverse(child => {
                            if (child instanceof THREE.Mesh) {
                                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                                    child.material = material;
                                }
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        
                        done(obj);
                    } else {
                        done(null, new Error('No mesh object returned'));
                    }
                }, material);
            };
            
            console.info(`Loading robot ${robotName} from ${urdfPath}`);
            console.info(`Package path: ${packagePath}`);
            
            // Load the URDF model using a promise wrapper
            const robot = await new Promise((resolve, reject) => {
                this.loader.load(urdfPath, resolve, null, reject);
            });
            
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
            
            console.info(`Successfully loaded robot: ${robotName}`);
            return robot;
            
        } catch (error) {
            console.error(`Error loading robot ${robotName}:`, error);
            
            // Trigger load error event
            if (ROBOT_EVENTS.onLoadError) {
                ROBOT_EVENTS.onLoadError(robotName, error);
            }
            
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
        this.robotMap.clear();
        this.currentRobot = null;
    }
    
    /**
     * Update scene based on loaded robot
     * @param {Object} robot - The loaded robot object
     */
    updateSceneForRobot(robot) {
        // Focus camera on robot
        setTimeout(() => {
            this.sceneSetup.focusOnObject(robot);
        }, 100);
        
        // Emit robot loaded event
        EventBus.emit('robot:loaded', { robot });
    }
}

export default RobotManager;