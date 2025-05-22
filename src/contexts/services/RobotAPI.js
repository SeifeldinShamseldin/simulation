// src/contexts/services/RobotAPI.js
import { Logger } from '../../utils/GlobalVariables';

class RobotAPI {
  constructor() {
    this.baseUrl = '/robots';
    this.robotCache = new Map();
  }
  
  /**
   * Discover available robots
   * @returns {Promise<Object>} Object containing robots and categories
   */
  async discoverRobots() {
    try {
      // Try server endpoint first (dynamic)
      const serverResponse = await fetch('/robots/list', { 
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (serverResponse.ok) {
        const data = await serverResponse.json();
        return this._processServerData(data);
      }
      
      // If server endpoint fails, try index.json
      const indexResponse = await fetch(`${this.baseUrl}/index.json`, { 
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (indexResponse.ok) {
        const data = await indexResponse.json();
        return this._processIndexData(data);
      }
      
      // If both fail, return fallback
      return this._getFallbackRobots();
    } catch (error) {
      Logger.error("Error discovering robots:", error);
      return this._getFallbackRobots();
    }
  }
  
  /**
   * Process data from server endpoint
   * @param {Array} data - Server response data
   * @returns {Object} Processed robots and categories
   */
  _processServerData(data) {
    const categories = [];
    const robots = [];
    
    if (Array.isArray(data)) {
      data.forEach(category => {
        categories.push({
          id: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
          name: category.name
        });
        
        if (Array.isArray(category.robots)) {
          category.robots.forEach(robot => {
            robots.push({
              id: robot.id,
              name: robot.name || robot.id,
              category: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
              urdfPath: robot.urdfPath,
              packagePath: robot.packagePath
            });
          });
        }
      });
    }
    
    return { robots, categories };
  }
  
  /**
   * Process data from index.json
   * @private
   */
  _processIndexData(data) {
    const categories = [];
    const robots = [];
    
    // Process categories and robots
    if (Array.isArray(data.categories)) {
      data.categories.forEach(category => {
        categories.push({
          id: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
          name: category.name,
        });
        
        if (Array.isArray(category.robots)) {
          category.robots.forEach(robot => {
            robots.push({
              id: robot.id || robot.name.toLowerCase().replace(/\s+/g, '_'),
              name: robot.name || robot.id,
              category: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
              urdfPath: robot.urdfPath || `${this.baseUrl}/${category.name}/${robot.id}/${robot.id}.urdf`,
              packagePath: robot.packagePath || `${this.baseUrl}/${category.name}/${robot.id}`
            });
          });
        }
      });
    }
    
    return { robots, categories };
  }
  
  /**
   * Get fallback robots if directory scanning fails
   * @private
   */
  _getFallbackRobots() {
    const categories = [
      { id: 'universal_robots', name: 'Universal Robots' },
      { id: 'kuka', name: 'KUKA' }
    ];
    
    const robots = [
      {
        id: 'ur5',
        name: 'UR5',
        category: 'universal_robots',
        urdfPath: `${this.baseUrl}/Universal Robots/ur5/ur5.urdf`,
        packagePath: `${this.baseUrl}/Universal Robots/ur5`
      },
      {
        id: 'ur10',
        name: 'UR10',
        category: 'universal_robots',
        urdfPath: `${this.baseUrl}/Universal Robots/ur10/ur10.urdf`,
        packagePath: `${this.baseUrl}/Universal Robots/ur10`
      },
      {
        id: 'kr3r540',
        name: 'KR3R540',
        category: 'kuka',
        urdfPath: `${this.baseUrl}/KUKA/kr3r540/kr3r540.urdf`,
        packagePath: `${this.baseUrl}/KUKA/kr3r540`
      }
    ];
    
    Logger.warn("Using fallback robot data");
    return { robots, categories };
  }
  
  /**
   * Load a robot into the viewer
   * @param {string} robotId - The ID of the robot to load
   * @param {string} category - The category the robot belongs to
   * @param {Object} viewerRef - Reference to the URDFViewer component
   * @returns {Promise<Object>} The loaded robot
   */
  async loadRobot(robotId, category, viewerRef) {
    try {
      if (!viewerRef || !viewerRef.loadRobot) {
        throw new Error("Invalid viewer reference");
      }
      
      // Find the robot in our available robots
      const { robots } = await this.discoverRobots();
      const robotConfig = robots.find(r => r.id === robotId && r.category === category);
      
      if (!robotConfig) {
        throw new Error(`Robot ${robotId} in category ${category} not found`);
      }
      
      // Load the robot into the viewer
      Logger.info(`Loading robot ${robotId} from ${robotConfig.urdfPath}`);
      const robot = await viewerRef.loadRobot(robotId, robotConfig.urdfPath);
      
      // Cache the loaded robot
      this.robotCache.set(`${category}/${robotId}`, robot);
      
      return robot;
    } catch (error) {
      Logger.error(`Error loading robot ${robotId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a list of robots by category
   * @param {string} categoryId - The category ID
   * @returns {Array} Robots in the category
   */
  async getRobotsByCategory(categoryId) {
    const { robots } = await this.discoverRobots();
    return robots.filter(robot => robot.category === categoryId);
  }

  /**
   * Add a new robot dynamically
   * @param {FormData} robotData - Robot files and metadata
   * @returns {Promise<Object>} Result of the operation
   */
  async addRobot(robotData) {
    try {
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: robotData
      });
      
      if (response.ok) {
        const result = await response.json();
        // Refresh robot list
        await this.discoverRobots();
        return { success: true, robot: result };
      } else {
        const error = await response.json();
        return { success: false, error: error.message };
      }
    } catch (error) {
      Logger.error('Error adding robot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a robot
   * @param {string} robotId - Robot ID to remove
   * @param {string} category - Robot category
   * @returns {Promise<Object>} Result of the operation
   */
  async removeRobot(robotId, category) {
    try {
      const response = await fetch(`/api/robots/${category}/${robotId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Refresh robot list
        await this.discoverRobots();
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message };
      }
    } catch (error) {
      Logger.error('Error removing robot:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export default new RobotAPI(); 