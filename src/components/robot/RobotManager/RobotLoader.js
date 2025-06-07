import * as THREE from 'three';
import URDFLoader from '../../../core/Loader/URDFLoader';
import EventBus from '../../../utils/EventBus';
import MeshLoader from '../../../core/Loader/MeshLoader';

// Robot event handlers
const ROBOT_EVENTS = {
    onLoadComplete: null,
    onLoadError: null
};

/**
 * Class for loading and managing URDF robot models in the scene
 * Updated to support multiple robots simultaneously
 */
class RobotLoader {
    /**
     * Create a RobotLoader instance
     * @param {SceneSetup} sceneSetup - The scene setup instance
     */
    constructor(sceneSetup) {
        this.sceneSetup = sceneSetup;
        this.loader = new URDFLoader(new THREE.LoadingManager());
        this.robots = new Map(); // Changed from single robot to map of robots
        this.activeRobots = new Set(); // Track which robots are active
        
        // Configure loader
        this.loader.parseVisual = true;
        this.loader.parseCollision = false;
    }
    
    /**
     * Load a URDF model and add to scene
     * @param {string} robotName - The name of the robot
     * @param {string} urdfPath - The path to the URDF file
     * @param {Object} options - Loading options
     * @returns {Promise<Object>} A promise that resolves to the loaded robot
     */
    async loadRobot(robotName, urdfPath, options = {}) {
        const {
            position = { x: 0, y: 0, z: 0 },
            makeActive = true,
            clearOthers = false
        } = options;

        try {
            // Extract package path from urdf path
            const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
            
            // Reset loader state
            this.loader.resetLoader();
            this.loader.packages = packagePath;
            this.loader.currentRobotName = robotName;
            
            // Set up loadMeshCb
            this.loader.loadMeshCb = (path, manager, done, material) => {
                const filename = path.split('/').pop();
                const resolvedPath = `${this.loader.packages}/${filename}`;
                
                MeshLoader.load(resolvedPath, manager, (obj, err) => {
                    if (err) {
                        console.error('Error loading mesh:', err);
                        done(null, err);
                        return;
                    }
                    
                    if (obj) {
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
            
            // Load the URDF model
            const robot = await new Promise((resolve, reject) => {
                this.loader.load(urdfPath, resolve, null, reject);
            });
            
            // Store the robot with metadata
            const robotData = {
                name: robotName,
                model: robot,
                urdfPath: urdfPath,
                isActive: makeActive
            };
            
            // Only clear if explicitly requested
            if (clearOthers) {
                this.clearAllRobots();
            }
            
            // Remove existing robot with same name if exists
            if (this.robots.has(robotName)) {
                this.removeRobot(robotName);
            }
            
            // Store the robot
            this.robots.set(robotName, robotData);
            if (makeActive) {
                this.activeRobots.add(robotName);
            }
            
            // Add to scene with a container for proper orientation
            const robotContainer = new THREE.Object3D();
            robotContainer.name = `${robotName}_container`;
            robotContainer.add(robot);
            
            // Apply position to the container
            robotContainer.position.set(position.x, position.y, position.z);
            
            // Add container to scene
            this.sceneSetup.robotRoot.add(robotContainer);
            
            // Store reference to container
            robotData.container = robotContainer;
            
            // Update scene orientation and focus
            this.updateSceneForRobot(robotContainer);
            
            // Emit events
            EventBus.emit('robot:loaded', { 
                robotName, 
                robot,
                totalRobots: this.robots.size,
                activeRobots: Array.from(this.activeRobots)
            });
            
            if (ROBOT_EVENTS.onLoadComplete) {
                ROBOT_EVENTS.onLoadComplete(robotName, robot);
            }
            
            console.info(`Successfully loaded robot: ${robotName}`);
            return robot;
            
        } catch (error) {
            console.error(`Error loading robot ${robotName}:`, error);
            
            if (ROBOT_EVENTS.onLoadError) {
                ROBOT_EVENTS.onLoadError(robotName, error);
            }
            
            throw error;
        }
    }
    
    /**
     * Update scene orientation for robot
     * @param {Object} robot - The loaded robot object
     */
    updateSceneForRobot(robot) {
        // Apply the up axis transformation to ensure correct orientation
        if (this.sceneSetup.setUpAxis) {
            this.sceneSetup.setUpAxis('+Z'); // Default URDF convention
        }
        
        // Don't auto-focus when switching robots
        // Only focus if it's the first robot being loaded
        if (this.robots.size === 1 && this.sceneSetup.robotRoot.children.length === 1) {
            setTimeout(() => {
                this.sceneSetup.focusOnObject(robot);
            }, 100);
        }
        
        // Emit robot loaded event
        EventBus.emit('robot:loaded', { robot });
    }
    
    /**
     * Get a specific robot by name
     * @param {string} robotName - The name of the robot
     * @returns {Object|null} The robot data or null
     */
    getRobot(robotName) {
        const robotData = this.robots.get(robotName);
        return robotData ? robotData.model : null;
    }
    
    /**
     * Get all loaded robots
     * @returns {Map} Map of all robots
     */
    getAllRobots() {
        return new Map(this.robots);
    }
    
    /**
     * Get active robots
     * @returns {Array} Array of active robot names
     */
    getActiveRobots() {
        return Array.from(this.activeRobots);
    }
    
    /**
     * Set robot active state
     * @param {string} robotName - The robot name
     * @param {boolean} isActive - Whether the robot should be active
     */
    setRobotActive(robotName, isActive) {
        const robotData = this.robots.get(robotName);
        if (!robotData) return false;
        
        robotData.isActive = isActive;
        if (isActive) {
            this.activeRobots.add(robotName);
            if (robotData.container) {
                robotData.container.visible = true;
            } else {
                robotData.model.visible = true;
            }
        } else {
            this.activeRobots.delete(robotName);
            if (robotData.container) {
                robotData.container.visible = false;
            } else {
                robotData.model.visible = false;
            }
        }
        
        // Don't trigger any camera movements here
        EventBus.emit('robot:active-changed', {
            robotName,
            isActive,
            activeRobots: Array.from(this.activeRobots)
        });
        
        return true;
    }
    
    /**
     * Remove a specific robot
     * @param {string} robotName - The robot to remove
     */
    removeRobot(robotName) {
        const robotData = this.robots.get(robotName);
        if (!robotData) return;
        
        // Remove from scene
        if (robotData.container) {
            this.sceneSetup.robotRoot.remove(robotData.container);
            robotData.container.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        // Remove from tracking
        this.robots.delete(robotName);
        this.activeRobots.delete(robotName);
        
        // Emit event
        EventBus.emit('robot:removed', { robotName });
    }
    
    /**
     * Clear all robots from the scene
     */
    clearAllRobots() {
        // Remove all robots
        for (const [robotName] of this.robots) {
            this.removeRobot(robotName);
        }
        
        // Clear tracking
        this.robots.clear();
        this.activeRobots.clear();
    }
    
    /**
     * Set a joint value for a specific robot
     * @param {string} robotName - The robot name
     * @param {string} jointName - The joint name
     * @param {number} value - The joint value
     */
    setJointValue(robotName, jointName, value) {
        const robotData = this.robots.get(robotName);
        if (!robotData) {
            console.warn(`Robot ${robotName} not found for joint update`);
            return false;
        }
        
        if (robotData.model.joints && robotData.model.joints[jointName]) {
            try {
                // Use robot's setJointValue method, not joint's
                const success = robotData.model.setJointValue(jointName, value);
                if (success) {
                    // Emit joint change event
                    EventBus.emit('robot:joint-changed', { 
                        robotName, 
                        jointName, 
                        value,
                        robotId: robotName // Also emit with robotId for consistency
                    });
                    
                    console.log(`[RobotLoader] Set joint ${jointName} = ${value} for robot ${robotName}`);
                    return true;
                }
            } catch (error) {
                console.error(`Error setting joint ${jointName} on robot ${robotName}:`, error);
            }
        } else {
            console.warn(`Joint ${jointName} not found on robot ${robotName}`);
        }
        return false;
    }
    
    /**
     * Set multiple joint values for a specific robot
     * @param {string} robotName - The robot name
     * @param {Object} values - Map of joint names to values
     */
    setJointValues(robotName, values) {
        const robotData = this.robots.get(robotName);
        if (!robotData) {
            console.warn(`Robot ${robotName} not found for joint updates`);
            return false;
        }
        
        let anySuccess = false;
        
        try {
            // Use robot's setJointValues method
            const success = robotData.model.setJointValues(values);
            if (success) {
                anySuccess = true;
            }
        } catch (error) {
            console.error(`Error setting multiple joints on robot ${robotName}:`, error);
            
            // Fallback: try setting joints individually
            Object.entries(values).forEach(([jointName, value]) => {
                try {
                    if (robotData.model.joints && robotData.model.joints[jointName]) {
                        const success = robotData.model.setJointValue(jointName, value);
                        if (success) {
                            anySuccess = true;
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to set joint ${jointName}:`, err);
                }
            });
        }
        
        if (anySuccess) {
            // Emit joints change event
            EventBus.emit('robot:joints-changed', { 
                robotName, 
                values,
                robotId: robotName // Also emit with robotId for consistency
            });
            
            console.log(`[RobotLoader] Set multiple joints for robot ${robotName}:`, values);
        }
        
        return anySuccess;
    }
    
    /**
     * Get current joint values for a specific robot
     * @param {string} robotName - The robot name
     * @returns {Object} Map of joint names to values
     */
    getJointValues(robotName) {
        const robotData = this.robots.get(robotName);
        if (!robotData || !robotData.model) return {};
        
        const values = {};
        Object.entries(robotData.model.joints).forEach(([name, joint]) => {
            values[name] = joint.angle;
        });
        
        return values;
    }
    
    /**
     * Reset all joints to zero position for a specific robot
     * @param {string} robotName - The robot name
     */
    resetJoints(robotName) {
        const robotData = this.robots.get(robotName);
        if (!robotData || !robotData.model) return;
        
        Object.values(robotData.model.joints).forEach(joint => {
            joint.setJointValue(0);
        });
        
        EventBus.emit('robot:joints-reset', { robotName });
    }
    
    /**
     * Calculate positions for multiple robots
     * @param {number} robotCount - Number of robots to position
     * @returns {Array} Array of position objects
     */
    calculateRobotPositions(robotCount) {
        const positions = [];
        const spacing = 2; // Space between robots
        
        for (let i = 0; i < robotCount; i++) {
            positions.push({
                x: i * spacing,
                y: 0,
                z: 0
            });
        }
        
        return positions;
    }
    
    /**
     * Get the current active robot
     * @returns {Object|null} The current robot or null
     */
    getCurrentRobot() {
        if (this.activeRobots.size === 0) return null;
        
        const activeRobotName = Array.from(this.activeRobots)[0];
        return this.getRobot(activeRobotName);
    }
    
    /**
     * Get the name of the current active robot
     * @returns {string|null} The current robot name or null
     */
    getCurrentRobotName() {
        if (this.activeRobots.size === 0) return null;
        return Array.from(this.activeRobots)[0];
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        this.clearAllRobots();
        this.loader = null;
        this.sceneSetup = null;
    }
}

export default RobotLoader; 