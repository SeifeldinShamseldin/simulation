import EventBus from '../../utils/EventBus';
import trajectoryAPI from '../Trajectory/TrajectoryAPI';
import tcpProvider from '../IK/TCP/TCPProvider';

class WorldAPI {
  constructor() {
    if (WorldAPI.instance) {
      return WorldAPI.instance;
    }
    WorldAPI.instance = this;
    
    this.worlds = new Map();
    this.currentWorld = null;
  }

  /**
   * Save current world state
   */
  saveWorld(name, sceneData) {
    const worldState = {
      id: `world_${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Scene settings
      scene: {
        camera: sceneData.camera,
        lighting: sceneData.lighting,
        background: sceneData.background,
        upAxis: sceneData.upAxis
      },
      
      // Robots
      robots: sceneData.robots.map(robot => ({
        id: robot.id,
        name: robot.name,
        urdfPath: robot.urdfPath,
        position: robot.position,
        rotation: robot.rotation,
        jointValues: robot.jointValues,
        isActive: robot.isActive
      })),
      
      // Trajectories for each robot
      trajectories: {},
      
      // Environment objects
      environment: sceneData.environment.map(obj => ({
        id: obj.id,
        path: obj.path,
        category: obj.category,
        position: obj.position,
        rotation: obj.rotation,
        scale: obj.scale,
        material: obj.material,
        visible: obj.visible
      })),
      
      // Humans
      humans: sceneData.humans || [],
      
      // TCP settings for each robot
      tcpSettings: {}
    };
    
    // Save trajectories for each robot
    sceneData.robots.forEach(robot => {
      const trajectoryNames = trajectoryAPI.getTrajectoryNames(robot.id);
      worldState.trajectories[robot.id] = {};
      
      trajectoryNames.forEach(trajName => {
        worldState.trajectories[robot.id][trajName] = trajectoryAPI.getTrajectory(trajName, robot.id);
      });
    });
    
    // Save TCP settings for each robot
    sceneData.robots.forEach(robot => {
      const tcps = tcpProvider.getAllTCPs();
      worldState.tcpSettings[robot.id] = {
        tcps: tcps,
        activeTcpId: tcpProvider.getActiveTCP()?.id
      };
    });
    
    this.worlds.set(worldState.id, worldState);
    this.currentWorld = worldState.id;
    
    // Save to localStorage
    this.saveToStorage();
    
    EventBus.emit('world:saved', { worldId: worldState.id, name });
    
    return worldState;
  }
  
  /**
   * Load a world state
   */
  async loadWorld(worldId, callbacks) {
    const world = this.worlds.get(worldId);
    if (!world) {
      console.error('World not found:', worldId);
      return false;
    }
    
    const {
      clearScene,
      loadRobot,
      loadEnvironmentObject,
      loadHuman,
      setCamera,
      setSceneSettings
    } = callbacks;
    
    try {
      // Clear current scene
      await clearScene();
      
      // Load scene settings
      if (setSceneSettings) {
        setSceneSettings(world.scene);
      }
      
      // Load robots
      for (const robotData of world.robots) {
        const robot = await loadRobot(robotData.id, robotData.urdfPath, {
          position: robotData.position,
          rotation: robotData.rotation,
          makeActive: robotData.isActive
        });
        
        // Apply joint values
        if (robot && robotData.jointValues) {
          robot.setJointValues(robotData.jointValues);
        }
        
        // Load trajectories for this robot
        if (world.trajectories[robotData.id]) {
          Object.values(world.trajectories[robotData.id]).forEach(trajectory => {
            trajectoryAPI.importTrajectory(JSON.stringify(trajectory), robotData.id);
          });
        }
        
        // Load TCP settings
        if (world.tcpSettings[robotData.id]) {
          const tcpData = world.tcpSettings[robotData.id];
          // Restore TCPs
          tcpData.tcps.forEach(tcp => {
            tcpProvider.addTCP(tcp);
          });
          if (tcpData.activeTcpId) {
            tcpProvider.setActiveTCP(tcpData.activeTcpId);
          }
        }
      }
      
      // Load environment objects
      for (const envData of world.environment) {
        if (!envData.path) {
          console.warn('Skipping environment object with no path:', envData.id);
          continue;
        }
        await loadEnvironmentObject({
          ...envData,
          id: envData.id,
          path: envData.path.startsWith('/') ? envData.path : `/${envData.path}`
        });
      }
      
      // Load humans
      if (loadHuman) {
        for (const humanData of world.humans) {
          await loadHuman(humanData);
        }
      }
      
      // Set camera
      if (setCamera && world.scene.camera) {
        setCamera(world.scene.camera);
      }
      
      this.currentWorld = worldId;
      EventBus.emit('world:loaded', { worldId, name: world.name });
      
      return true;
      
    } catch (error) {
      console.error('Error loading world:', error);
      EventBus.emit('world:load-error', { worldId, error });
      return false;
    }
  }
  
  /**
   * Delete a world
   */
  deleteWorld(worldId) {
    if (this.worlds.delete(worldId)) {
      if (this.currentWorld === worldId) {
        this.currentWorld = null;
      }
      this.saveToStorage();
      EventBus.emit('world:deleted', { worldId });
      return true;
    }
    return false;
  }
  
  /**
   * Get all worlds
   */
  getAllWorlds() {
    return Array.from(this.worlds.values()).map(world => ({
      id: world.id,
      name: world.name,
      createdAt: world.createdAt,
      updatedAt: world.updatedAt,
      robotCount: world.robots.length,
      objectCount: world.environment.length
    }));
  }
  
  /**
   * Get current world
   */
  getCurrentWorld() {
    return this.currentWorld ? this.worlds.get(this.currentWorld) : null;
  }
  
  /**
   * Export world to JSON
   */
  exportWorld(worldId) {
    const world = this.worlds.get(worldId);
    if (!world) return null;
    
    return JSON.stringify(world, null, 2);
  }
  
  /**
   * Import world from JSON
   */
  importWorld(jsonData) {
    try {
      const world = JSON.parse(jsonData);
      world.id = `world_${Date.now()}`; // Generate new ID
      world.updatedAt = new Date().toISOString();
      
      this.worlds.set(world.id, world);
      this.saveToStorage();
      
      EventBus.emit('world:imported', { worldId: world.id, name: world.name });
      return world;
    } catch (error) {
      console.error('Error importing world:', error);
      return null;
    }
  }
  
  /**
   * Save to localStorage
   */
  saveToStorage() {
    try {
      const worldsData = Array.from(this.worlds.entries());
      localStorage.setItem('botfellows_worlds', JSON.stringify(worldsData));
    } catch (error) {
      console.error('Error saving worlds to storage:', error);
    }
  }
  
  /**
   * Load from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem('botfellows_worlds');
      if (stored) {
        const worldsData = JSON.parse(stored);
        this.worlds = new Map(worldsData);
      }
    } catch (error) {
      console.error('Error loading worlds from storage:', error);
    }
  }
}

const worldAPI = new WorldAPI();

// Load saved worlds on initialization
worldAPI.loadFromStorage();

export default worldAPI; 