import { Logger } from '../../utils/GlobalVariables';

/**
 * Unified Robot Service - Consolidates robot discovery, configuration, and management
 * Replaces both RobotAPI.js and RobotConfigRegistry.js
 */
class RobotService {
  constructor() {
    // Singleton pattern
    if (RobotService.instance) {
      return RobotService.instance;
    }
    RobotService.instance = this;
    
    // Configuration
    this.baseUrl = '/robots';
    this.basePath = '/robots';
    
    // Internal storage
    this.robotCache = new Map(); // Cache for loaded robots
    this.robotConfigs = new Map(); // Registry of robot configurations
    this.categories = [];
    this.availableRobots = [];
    
    // Initialize with auto-discovery
    this.initialize();
  }
  
  /**
   * Initialize the service
   */
  async initialize() {
    try {
      await this.discoverRobots();
      Logger.info('RobotService initialized successfully');
    } catch (error) {
      Logger.warn('RobotService initialization failed, using fallback data:', error);
      this._loadFallbackData();
    }
  }
  
  /**
   * Discover available robots from server or fallback
   * Consolidates logic from both RobotAPI and RobotConfigRegistry
   * @returns {Promise<Object>} Object containing robots and categories
   */
  async discoverRobots() {
    try {
      // Try server endpoint first (dynamic discovery)
      Logger.info('Attempting robot discovery from server endpoint');
      const serverResponse = await fetch('/robots/list', { 
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (serverResponse.ok) {
        const data = await serverResponse.json();
        const result = this._processServerData(data);
        this._updateInternalStorage(result);
        Logger.info(`Discovered ${result.robots.length} robots from server`);
        return result;
      }
      
      // If server endpoint fails, try index.json
      Logger.info('Server endpoint failed, trying index.json');
      const indexResponse = await fetch(`${this.baseUrl}/index.json`, { 
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (indexResponse.ok) {
        const data = await indexResponse.json();
        const result = this._processIndexData(data);
        this._updateInternalStorage(result);
        Logger.info(`Discovered ${result.robots.length} robots from index.json`);
        return result;
      }
      
      // If both fail, use fallback
      Logger.warn('Both server and index.json failed, using fallback robots');
      const result = this._getFallbackRobots();
      this._updateInternalStorage(result);
      return result;
      
    } catch (error) {
      Logger.error('Error during robot discovery:', error);
      const result = this._getFallbackRobots();
      this._updateInternalStorage(result);
      return result;
    }
  }
  
  /**
   * Process data from server endpoint
   * @private
   * @param {Array} data - Server response data
   * @returns {Object} Processed robots and categories
   */
  _processServerData(data) {
    const categories = [];
    const robots = [];
    
    if (Array.isArray(data)) {
      data.forEach(category => {
        const categoryData = {
          id: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
          name: category.name
        };
        categories.push(categoryData);
        
        if (Array.isArray(category.robots)) {
          category.robots.forEach(robot => {
            const robotData = {
              id: robot.id,
              name: robot.name || robot.id,
              category: categoryData.id,
              urdfPath: robot.urdfPath,
              packagePath: robot.packagePath || this._extractPackagePath(robot.urdfPath),
              urdfFile: robot.urdfPath.split('/').pop()
            };
            
            robots.push(robotData);
            // Also register in internal config
            this._registerRobotConfig(robot.id, robotData);
          });
        }
      });
    }
    
    return { robots, categories };
  }
  
  /**
   * Process data from index.json
   * @private
   * @param {Object} data - Index.json data
   * @returns {Object} Processed robots and categories
   */
  _processIndexData(data) {
    const categories = [];
    const robots = [];
    
    if (Array.isArray(data.categories)) {
      data.categories.forEach(category => {
        const categoryData = {
          id: category.id || category.name.toLowerCase().replace(/\s+/g, '_'),
          name: category.name
        };
        categories.push(categoryData);
        
        if (Array.isArray(category.robots)) {
          category.robots.forEach(robot => {
            const robotId = robot.id || robot.name.toLowerCase().replace(/\s+/g, '_');
            const robotData = {
              id: robotId,
              name: robot.name || robotId,
              category: categoryData.id,
              urdfPath: robot.urdfPath || `${this.baseUrl}/${category.name}/${robotId}/${robotId}.urdf`,
              packagePath: robot.packagePath || `${this.baseUrl}/${category.name}/${robotId}`,
              urdfFile: robot.urdfFile || `${robotId}.urdf`
            };
            
            robots.push(robotData);
            // Also register in internal config
            this._registerRobotConfig(robotId, robotData);
          });
        }
      });
    }
    
    return { robots, categories };
  }
  
  /**
   * Get fallback robots if discovery fails
   * @private
   * @returns {Object} Fallback robots and categories
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
        packagePath: `${this.baseUrl}/Universal Robots/ur5`,
        urdfFile: 'ur5.urdf'
      },
      {
        id: 'ur10',
        name: 'UR10',
        category: 'universal_robots',
        urdfPath: `${this.baseUrl}/Universal Robots/ur10/ur10.urdf`,
        packagePath: `${this.baseUrl}/Universal Robots/ur10`,
        urdfFile: 'ur10.urdf'
      },
      {
        id: 'kr3r540',
        name: 'KR3R540',
        category: 'kuka',
        urdfPath: `${this.baseUrl}/KUKA/kr3r540/kr3r540.urdf`,
        packagePath: `${this.baseUrl}/KUKA/kr3r540`,
        urdfFile: 'kr3r540.urdf'
      }
    ];
    
    // Register fallback robots in internal config
    robots.forEach(robot => this._registerRobotConfig(robot.id, robot));
    
    Logger.warn("Using fallback robot data");
    return { robots, categories };
  }
  
  /**
   * Update internal storage with discovered data
   * @private
   * @param {Object} data - Robots and categories data
   */
  _updateInternalStorage(data) {
    this.availableRobots = data.robots;
    this.categories = data.categories;
  }
  
  /**
   * Register a robot configuration internally
   * @private
   * @param {string} robotId - Robot ID
   * @param {Object} config - Robot configuration
   */
  _registerRobotConfig(robotId, config) {
    const robotConfig = {
      id: robotId,
      name: config.name || robotId,
      category: config.category,
      urdfPath: config.urdfPath,
      packagePath: config.packagePath,
      urdfFile: config.urdfFile,
      ...config
    };
    
    this.robotConfigs.set(robotId, robotConfig);
  }
  
  /**
   * Extract package path from URDF path
   * @private
   * @param {string} urdfPath - Full URDF path
   * @returns {string} Package path
   */
  _extractPackagePath(urdfPath) {
    return urdfPath.substring(0, urdfPath.lastIndexOf('/'));
  }
  
  /**
   * Get robot configuration by ID
   * @param {string} robotId - Robot ID
   * @returns {Object|null} Robot configuration or null if not found
   */
  getRobotConfig(robotId) {
    if (!this.robotConfigs.has(robotId)) {
      // Auto-register if not found
      const robotData = this.availableRobots.find(r => r.id === robotId);
      if (robotData) {
        this._registerRobotConfig(robotId, robotData);
        Logger.info(`Auto-registered robot config for: ${robotId}`);
      } else {
        // Create basic config
        const basicConfig = {
          id: robotId,
          name: robotId,
          category: 'unknown',
          urdfPath: `${this.basePath}/${robotId}/${robotId}.urdf`,
          packagePath: `${this.basePath}/${robotId}`,
          urdfFile: `${robotId}.urdf`
        };
        this._registerRobotConfig(robotId, basicConfig);
        Logger.info(`Created basic config for unknown robot: ${robotId}`);
      }
    }
    
    return this.robotConfigs.get(robotId);
  }
  
  /**
   * Get all available robots
   * @returns {Array} Array of robot configurations
   */
  getAvailableRobots() {
    return [...this.availableRobots];
  }
  
  /**
   * Get all categories
   * @returns {Array} Array of category configurations
   */
  getCategories() {
    return [...this.categories];
  }
  
  /**
   * Get robots by category
   * @param {string} categoryId - Category ID
   * @returns {Array} Robots in the specified category
   */
  getRobotsByCategory(categoryId) {
    return this.availableRobots.filter(robot => robot.category === categoryId);
  }
  
  /**
   * Get all registered robot IDs
   * @returns {Array} Array of robot IDs
   */
  getRegisteredRobotIds() {
    return Array.from(this.robotConfigs.keys());
  }
  
  /**
   * Load a robot into the viewer
   * @param {string} robotId - Robot ID
   * @param {string} category - Robot category
   * @param {Object} viewerRef - Reference to the URDF viewer
   * @returns {Promise<Object>} Promise resolving to the loaded robot
   */
  async loadRobot(robotId, category, viewerRef) {
    try {
      if (!viewerRef || !viewerRef.loadRobot) {
        throw new Error("Invalid viewer reference");
      }
      
      // Get robot configuration
      const robotConfig = this.getRobotConfig(robotId);
      if (!robotConfig) {
        throw new Error(`Robot ${robotId} configuration not found`);
      }
      
      // Verify category matches (if provided)
      if (category && robotConfig.category !== category) {
        Logger.warn(`Category mismatch for ${robotId}: expected ${category}, got ${robotConfig.category}`);
      }
      
      Logger.info(`Loading robot ${robotId} from ${robotConfig.urdfPath}`);
      
      // Load the robot into the viewer
      const robot = await viewerRef.loadRobot(robotId, robotConfig.urdfPath);
      
      // Cache the loaded robot
      this.robotCache.set(`${robotConfig.category}/${robotId}`, robot);
      
      Logger.info(`Successfully loaded robot: ${robotId}`);
      return robot;
      
    } catch (error) {
      Logger.error(`Error loading robot ${robotId}:`, error);
      throw error;
    }
  }
  
  /**
   * Resolve mesh path for a robot
   * @param {string} robotId - Robot ID
   * @param {string} meshPath - Original mesh path from URDF
   * @returns {string} Resolved mesh path
   */
  resolveMeshPath(robotId, meshPath) {
    const config = this.getRobotConfig(robotId);
    if (!config) {
      Logger.warn(`No config found for robot ${robotId}, using basic path resolution`);
      return `${this.basePath}/${robotId}/${meshPath.split('/').pop()}`;
    }
    
    // Handle package:// URLs
    if (meshPath.startsWith('package://')) {
      const pathParts = meshPath.replace('package://', '').split('/');
      const packageName = pathParts[0];
      const filename = pathParts[pathParts.length - 1].toLowerCase(); // Convert to lowercase
      
      // Log for debugging
      Logger.debug(`Resolving package URL: ${meshPath}`);
      Logger.debug(`Package: ${packageName}, File: ${filename}`);
      
      // Return the resolved path
      const resolvedPath = `${config.packagePath}/${filename}`;
      Logger.debug(`Resolved to: ${resolvedPath}`);
      
      return resolvedPath;
    }
    
    // Handle absolute paths
    if (meshPath.startsWith('/')) {
      return meshPath;
    }
    
    // Handle relative paths - convert to lowercase for consistency
    const filename = meshPath.split('/').pop().toLowerCase();
    return `${config.packagePath}/${filename}`;
  }
  
  /**
   * Add a new robot dynamically
   * @param {FormData} robotData - Robot files and metadata
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<Object>} Result of the operation
   */
  async addRobot(robotData, onProgress) {
    try {
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: robotData
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Refresh robot discovery after adding
        await this.discoverRobots();
        
        Logger.info(`Successfully added robot: ${result.id}`);
        return { success: true, robot: result };
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add robot');
      }
    } catch (error) {
      Logger.error('Error adding robot:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Remove a robot
   * @param {string} robotId - Robot ID
   * @param {string} category - Robot category
   * @returns {Promise<Object>} Result of the operation
   */
  async removeRobot(robotId, category) {
    try {
      const response = await fetch(`/api/robots/${category}/${robotId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Remove from cache
        this.robotCache.delete(`${category}/${robotId}`);
        this.robotConfigs.delete(robotId);
        
        // Refresh robot discovery after removal
        await this.discoverRobots();
        
        Logger.info(`Successfully removed robot: ${robotId}`);
        return { success: true };
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove robot');
      }
    } catch (error) {
      Logger.error('Error removing robot:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Clear all cached data and re-discover robots
   * @returns {Promise<Object>} Fresh robot data
   */
  async refresh() {
    this.robotCache.clear();
    this.robotConfigs.clear();
    this.availableRobots = [];
    this.categories = [];
    
    Logger.info('Refreshing robot service data');
    return await this.discoverRobots();
  }
  
  /**
   * Get service status and statistics
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.availableRobots.length > 0,
      robotCount: this.availableRobots.length,
      categoryCount: this.categories.length,
      cachedRobots: this.robotCache.size,
      registeredConfigs: this.robotConfigs.size
    };
  }
}

// Create and export singleton instance
const robotService = new RobotService();
export default robotService; 