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
 * Updated to support multiple robots simultaneously
 */
class RobotManager {
    /**
     * Create a RobotManager instance
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
            
            // Clear other robots if requested
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
        
        // Focus camera on robot if it's the only one or first one
        if (this.robots.size === 1) {
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
        
        // Remove from scene (use container if available)
        const objectToRemove = robotData.container || robotData.model;
        if (this.sceneSetup.robotRoot) {
            this.sceneSetup.robotRoot.remove(objectToRemove);
        } else {
            this.sceneSetup.scene.remove(objectToRemove);
        }
        
        // Clean up
        robotData.model.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        // Remove from collections
        this.robots.delete(robotName);
        this.activeRobots.delete(robotName);
        
        EventBus.emit('robot:removed', {
            robotName,
            remainingRobots: this.robots.size
        });
    }
    
    /**
     * Clear all robots
     */
    clearAllRobots() {
        const robotNames = Array.from(this.robots.keys());
        robotNames.forEach(name => this.removeRobot(name));
    }
    
    /**
     * Set joint value for a specific robot
     * @param {string} robotName - The robot name
     * @param {string} jointName - The joint name
     * @param {number} value - The joint value
     */
    setJointValue(robotName, jointName, value) {
        const robot = this.getRobot(robotName);
        if (!robot) return false;
        return robot.setJointValue(jointName, parseFloat(value));
    }
    
    /**
     * Set multiple joint values for a robot
     * @param {string} robotName - The robot name
     * @param {Object} values - Map of joint names to values
     */
    setJointValues(robotName, values) {
        const robot = this.getRobot(robotName);
        if (!robot) return false;
        return robot.setJointValues(values);
    }
    
    /**
     * Get joint values for a robot
     * @param {string} robotName - The robot name
     * @returns {Object} Joint values
     */
    getJointValues(robotName) {
        const robot = this.getRobot(robotName);
        if (!robot) return {};
        
        const values = {};
        Object.entries(robot.joints).forEach(([name, joint]) => {
            if (joint.jointType !== 'fixed') {
                values[name] = joint.jointValue ? joint.jointValue[0] : 0;
            }
        });
        
        return values;
    }
    
    /**
     * Reset joints for a specific robot
     * @param {string} robotName - The robot name
     */
    resetJoints(robotName) {
        const robot = this.getRobot(robotName);
        if (!robot) return;
        
        const resetValues = {};
        Object.keys(robot.joints).forEach(name => {
            const joint = robot.joints[name];
            if (joint.jointType !== 'fixed') {
                resetValues[name] = 0;
            }
        });
        
        robot.setJointValues(resetValues);
    }
    
    /**
     * Calculate smart positions for multiple robots
     * @param {number} robotCount - Number of robots to position
     * @returns {Array} Array of positions
     */
    calculateRobotPositions(robotCount) {
        const positions = [];
        const spacing = 2.5; // Space between robots
        
        // Arrange robots in a line or grid
        if (robotCount <= 3) {
            // Line arrangement
            for (let i = 0; i < robotCount; i++) {
                positions.push({
                    x: (i - (robotCount - 1) / 2) * spacing,
                    y: 0,
                    z: 0
                });
            }
        } else {
            // Grid arrangement
            const cols = Math.ceil(Math.sqrt(robotCount));
            for (let i = 0; i < robotCount; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                positions.push({
                    x: (col - (cols - 1) / 2) * spacing,
                    y: 0,
                    z: (row - (Math.ceil(robotCount / cols) - 1) / 2) * spacing
                });
            }
        }
        
        return positions;
    }
    
    /**
     * Get the current robot (first active robot) for backward compatibility
     * @returns {Object|null} The first active robot or null
     */
    getCurrentRobot() {
        const activeRobotNames = this.getActiveRobots();
        if (activeRobotNames.length > 0) {
            return this.getRobot(activeRobotNames[0]);
        }
        
        // If no active robots, return the first loaded robot
        if (this.robots.size > 0) {
            const firstRobot = this.robots.values().next().value;
            return firstRobot ? firstRobot.model : null;
        }
        
        return null;
    }

    /**
     * Get the current robot name (for backward compatibility)
     * @returns {string|null} The name of the current robot
     */
    getCurrentRobotName() {
        const activeRobotNames = this.getActiveRobots();
        if (activeRobotNames.length > 0) {
            return activeRobotNames[0];
        }
        
        // If no active robots, return the first loaded robot name
        if (this.robots.size > 0) {
            return this.robots.keys().next().value;
        }
        
        return null;
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAllRobots();
        this.robots.clear();
        this.activeRobots.clear();
    }
}

export default RobotManager;