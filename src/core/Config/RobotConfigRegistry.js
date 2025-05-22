// Create a new file: src/utils/RobotConfigRegistry.js

import { Logger } from '../../utils/GlobalVariables';

/**
 * Registry for auto-discovering and managing robot configurations
 */
export class RobotConfigRegistry {
  constructor() {
    this.configs = new Map();
    this.basePath = '/robots';
    this.autoDiscoverRobots();
  }
  
  /**
   * Auto-discover available robots
   * @returns {Promise<void>}
   */
  async autoDiscoverRobots() {
    try {
      // Try server endpoint for dynamic discovery
      const response = await fetch('/robots/list');
      
      if (response.ok) {
        const categories = await response.json();
        categories.forEach(category => {
          category.robots?.forEach(robot => {
            this.register(robot.id, {
              name: robot.name || robot.id,
              packagePath: robot.packagePath,
              urdfFile: robot.urdfPath.split('/').pop(),
              urdfPath: robot.urdfPath
            });
          });
        });
        return;
      }
      
      // Fallback to default robots if server fails
      Logger.info('Server discovery failed, using default robots');
      this.register('ur5', {
        name: 'UR5',
        packagePath: `${this.basePath}/Universal Robot/ur5`,
        urdfFile: 'ur5.urdf'
      });
      
      this.register('kr3r540', {
        name: 'KR3R540', 
        packagePath: `${this.basePath}/kuka/kr3r540`,
        urdfFile: 'kr3r540.urdf'
      });
      
    } catch (error) {
      Logger.warn('Error auto-discovering robots:', error);
      // Use minimal fallback
      this.register('ur5', {
        name: 'UR5',
        packagePath: `${this.basePath}/Universal Robot/ur5`,
        urdfFile: 'ur5.urdf'
      });
    }
  }
  
  /**
   * Register a robot configuration
   * @param {string} robotName - The robot name/ID
   * @param {Object} config - The robot configuration
   */
  register(robotName, config) {
    // Make sure we have the minimal required config
    const robotConfig = {
      name: config.name || robotName,
      packagePath: config.packagePath || `${this.basePath}/${robotName}`,
      urdfFile: config.urdfFile || `${robotName}.urdf`,
      urdfPath: config.urdfPath || `${this.basePath}/${robotName}/${config.urdfFile || `${robotName}.urdf`}`,
      ...config
    };
    
    this.configs.set(robotName, robotConfig);
    Logger.info(`Registered robot configuration for: ${robotName}`);
  }
  
  /**
   * Get a robot configuration, auto-creating if not registered
   * @param {string} robotName - The robot name/ID
   * @returns {Object} The robot configuration
   */
  getConfig(robotName) {
    if (!this.configs.has(robotName)) {
      // Auto-register a new robot config
      this.register(robotName, {
        name: robotName,
        packagePath: `${this.basePath}/${robotName}`,
        urdfFile: `${robotName}.urdf`
      });
      Logger.info(`Auto-registered new robot: ${robotName}`);
    }
    
    return this.configs.get(robotName);
  }
  
  /**
   * Get a list of all registered robot names
   * @returns {string[]} Array of robot names
   */
  getRegisteredRobots() {
    return Array.from(this.configs.keys());
  }
  
  /**
   * Resolve mesh path for any robot
   * @param {string} robotName - Name of the robot
   * @param {string} meshPath - Original mesh path from URDF
   * @returns {string} Resolved file path
   */
  resolveMeshPath(robotName, meshPath) {
    // First check if it's a package URL
    if (meshPath.startsWith('package://')) {
      // Extract the filename only, ignore the package structure
      const filename = meshPath.split('/').pop();
      return `${this.basePath}/${robotName}/${filename}`;
    }
    
    // If it's already a full path, use it
    if (meshPath.startsWith('/')) {
      return meshPath;
    }
    
    // Otherwise treat as relative to robot directory
    return `${this.basePath}/${robotName}/${meshPath}`;
  }
}

// Create a singleton instance
export const robotRegistry = new RobotConfigRegistry();