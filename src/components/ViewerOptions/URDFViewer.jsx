import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SceneSetup from '../../core/Scene/SceneSetup';
import RobotManager from '../robot/RobotManager';
import { PointerURDFDragControls } from '../../core/Loader/URDFControls';
import EventBus from '../../utils/EventBus';

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  upAxis: '+Z',
  highlightColor: '#ff0000'
};

const EVENTS = {
  onLoadStart: 'robot:load-start',
  onLoadComplete: 'robot:load-complete',
  onLoadError: 'robot:load-error',
  onJointChange: 'robot:joint-change'
};

const Logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

/**
 * URDF Viewer component for displaying and interacting with robot models
 */
const URDFViewer = ({
  robotName = '', 
  urdfPath = '',
  width = '100%',
  height = '100%',
  backgroundColor = DEFAULT_CONFIG.backgroundColor,
  enableShadows = DEFAULT_CONFIG.enableShadows,
  showCollision = DEFAULT_CONFIG.showCollisions,
  upAxis = DEFAULT_CONFIG.upAxis,
  enableDragging = DEFAULT_CONFIG.enableDragging,
  highlightColor = DEFAULT_CONFIG.highlightColor,
  onRobotLoad,
  onJointChange
}, ref) => {
  // References for DOM elements and classes
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const robotManagerRef = useRef(null);
  const dragControlsRef = useRef(null);
  
  // State for tracking loading status and joint info
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadedRobot, setLoadedRobot] = useState(null);
  const [jointValues, setJointValues] = useState({});
  
  // Table-related state
  const [tableLoaded, setTableLoaded] = useState(false);
  const [tableVisible, setTableVisible] = useState(false);
  
  // Initialize scene and robot manager
  useEffect(() => {
    if (!containerRef.current) return;
    
    Logger.info('Initializing URDF Viewer');
    
    // Create scene setup with adjusted camera settings
    const sceneSetup = new SceneSetup({
      container: containerRef.current,
      backgroundColor,
      enableShadows,
      ambientColor: DEFAULT_CONFIG.ambientColor
    });
    
    // Adjust camera for better view
    if (sceneSetup.camera) {
      sceneSetup.camera.fov = 50; // Narrower FOV for better zoom
      sceneSetup.camera.near = 0.01; // Closer near plane
      sceneSetup.camera.far = 1000;
      sceneSetup.camera.updateProjectionMatrix();
    }
    
    sceneRef.current = sceneSetup;
    
    // Create robot manager
    const robotManager = new RobotManager(sceneSetup);
    robotManagerRef.current = robotManager;
    
    // Configure UI options
    sceneSetup.setUpAxis(upAxis);
    
    // Set up event handlers
    setupEventHandlers();
    
    // Listen to scene events for coordination
    const unsubscribeCamera = EventBus.on('scene:camera-updated', (data) => {
      // Can be used by other components to sync with camera state
      Logger.debug('Camera updated:', data);
    });
    
    const unsubscribeObjects = EventBus.on('scene:object-added', (data) => {
      // Can trigger UI updates or other actions
      Logger.debug('Object added to scene:', data);
    });
    
    return () => {
      // Clean up
      Logger.info('Cleaning up URDF Viewer');
      
      if (dragControlsRef.current) {
        dragControlsRef.current.dispose();
        dragControlsRef.current = null;
      }
      
      if (robotManagerRef.current) {
        robotManagerRef.current.dispose();
        robotManagerRef.current = null;
      }
      
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      
      // Clean up event listeners
      unsubscribeCamera();
      unsubscribeObjects();
    };
  }, [backgroundColor, enableShadows, showCollision, upAxis]);
  
  // Load the robot model when robotName or urdfPath changes
  useEffect(() => {
    if (!robotManagerRef.current || !urdfPath || !robotName) return;
    
    loadRobot(robotName, urdfPath);
  }, [robotName, urdfPath]);
  
  // Set up drag controls when enableDragging or highlightColor changes
  useEffect(() => {
    if (!sceneRef.current || !robotManagerRef.current) return;
    
    if (enableDragging) {
      setupDragControls();
    } else if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
      dragControlsRef.current = null;
    }
  }, [enableDragging, highlightColor, loadedRobot]);
  
  // Add resize handling effect
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Update camera aspect ratio
      if (sceneRef.current.camera) {
        sceneRef.current.camera.aspect = width / height;
        sceneRef.current.camera.updateProjectionMatrix();
        
        // Force re-focus on first active robot if available
        if (robotManagerRef.current) {
          const robots = robotManagerRef.current.getAllRobots();
          const activeRobots = Array.from(robots.values()).filter(r => r.isActive);
          if (activeRobots.length > 0 && activeRobots[0].model) {
            sceneRef.current.focusOnObject(activeRobots[0].model);
          }
        }
      }
      
      // Update renderer size
      if (sceneRef.current.renderer) {
        sceneRef.current.renderer.setSize(width, height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial resize
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  /**
   * Set up event handlers for robot loading and joint changes
   */
  const setupEventHandlers = () => {
    // Register load events
    EVENTS.onLoadStart = (name) => {
      Logger.info(`Loading robot: ${name}`);
      setIsLoading(true);
      setError(null);
    };
    
    EVENTS.onLoadComplete = (name, robot) => {
      Logger.info(`Robot loaded: ${name}`);
      setIsLoading(false);
      setLoadedRobot(robot);
      setJointValues(robot.jointValues);
      
      if (onRobotLoad) {
        onRobotLoad(robot);
      }
    };
    
    EVENTS.onLoadError = (name, err) => {
      Logger.error(`Error loading robot ${name}:`, err);
      setIsLoading(false);
      setError(err.message || 'Failed to load robot');
    };
    
    // Register joint change events
    EVENTS.onJointChange = (jointName, values) => {
      // Update local state with a new object to ensure React detects the change
      setJointValues({...values});
      
      // Notify parent component with the specific joint that changed
      if (onJointChange) {
        onJointChange(jointName, {...values});
      }
    };
  };
  
  /**
   * Set up drag controls for manipulating the robot
   */
  const setupDragControls = () => {
    if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
    }
    
    const scene = sceneRef.current;
    if (!scene || !scene.scene || !scene.camera || !scene.renderer || !scene.renderer.domElement) {
      return;
    }
    
    // Create highlight material
    const highlightMaterial = new THREE.MeshPhongMaterial({
      shininess: 10,
      color: new THREE.Color(highlightColor),
      emissive: new THREE.Color(highlightColor),
      emissiveIntensity: 0.25,
    });
    
    // Find the nearest joint and highlight it
    const isJoint = (j) => j.isURDFJoint && j.jointType !== 'fixed';
    
    // Highlight link geometry under a joint
    const highlightLinkGeometry = (joint, revert) => {
      if (!joint) return;
      
      // Safe traverse function with object checks
      const traverse = (obj) => {
        if (!obj) return;
        
        // Safe check for mesh type
        if (obj.type === 'Mesh') {
          if (revert) {
            if (obj.__origMaterial) {
              obj.material = obj.__origMaterial;
              delete obj.__origMaterial;
            }
          } else {
            obj.__origMaterial = obj.material;
            obj.material = highlightMaterial;
          }
        }
        
        // Safe check for children
        if (!obj.children) return;
        
        // Process children if this is not another joint
        if (obj === joint || !isJoint(obj)) {
          for (let i = 0; i < obj.children.length; i++) {
            const child = obj.children[i];
            if (child && !child.isURDFCollider) {
              traverse(child);
            }
          }
        }
      };
      
      traverse(joint);
    };
    
    // Create drag controls
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement
    );
    
    // Set up drag event handlers
    dragControls.onDragStart = (joint) => {
      Logger.debug('Drag start:', joint.name);
      scene.controls.enabled = false;
    };
    
    dragControls.onDragEnd = (joint) => {
      Logger.debug('Drag end:', joint.name);
      scene.controls.enabled = true;
      
      // Important: Update joint values in the UI after manual manipulation
      if (onJointChange) {
        const updatedValues = robotManagerRef.current.getJointValues();
        onJointChange(joint.name, updatedValues);
      }
    };
    
    dragControls.onHover = (joint) => {
      Logger.debug('Hover:', joint.name);
      highlightLinkGeometry(joint, false);
    };
    
    dragControls.onUnhover = (joint) => {
      Logger.debug('Unhover:', joint.name);
      highlightLinkGeometry(joint, true);
    };
    
    dragControlsRef.current = dragControls;
  };
  
  /**
   * Load a robot model
   * @param {string} name - The name of the robot
   * @param {string} path - The path to the URDF file
   */
  const loadRobot = async (name, path) => {
    try {
      if (!robotManagerRef.current) {
        throw new Error('Robot manager not initialized');
      }
      
      setIsLoading(true);
      setError(null);
      
      await robotManagerRef.current.loadRobot(name, path);
      
      // Force a better camera view after loading
      setTimeout(() => {
        if (sceneRef.current) {
          const robot = robotManagerRef.current.getCurrentRobot();
          // Apply custom focusing with reduced padding
          sceneRef.current.focusOnObject(robot, 0.8);
          
          // Hide any fallback geometries (red cubes)
          if (robot) {
            robot.traverse((child) => {
              if (child.isMesh && child.material) {
                // Check if this is likely a fallback geometry
                if (child.geometry instanceof THREE.BoxGeometry) {
                  const size = child.geometry.parameters;
                  if (size.width === 0.1 && size.height === 0.1 && size.depth === 0.1) {
                    child.visible = false;
                    Logger.debug('Hidden fallback geometry');
                  }
                }
              }
            });
          }
        }
      }, 100);
    } catch (err) {
      Logger.error('Error loading robot:', err);
      setError(err.message || 'Failed to load robot');
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Set a joint value
   * @param {string} jointName - The name of the joint
   * @param {number} value - The value to set
   */
  const setJointValue = (jointName, value) => {
    if (!robotManagerRef.current) return;
    
    robotManagerRef.current.setJointValue(jointName, value);
  };
  
  /**
   * Set multiple joint values
   * @param {Object} values - Map of joint names to values
   */
  const updateJointValues = (values) => {
    if (!robotManagerRef.current) return;
    
    robotManagerRef.current.setJointValues(values);
  };
  
  /**
   * Reset all joints to their zero position
   */
  const resetJoints = () => {
    if (!robotManagerRef.current) return;
    
    robotManagerRef.current.resetJoints();
  };
  
  /**
   * Get the current robot state
   * @returns {Object|null} The current robot state
   */
  const getRobotState = () => {
    if (!robotManagerRef.current) return null;
    
    return robotManagerRef.current.saveState();
  };
  
  /**
   * Get information about the current robot
   * @returns {Object|null} Information about the robot
   */
  const getRobotInfo = () => {
    if (!robotManagerRef.current) return null;
    
    return robotManagerRef.current.getRobotInfo();
  };
  
  /**
   * Load table into the scene
   * @returns {Promise<boolean>} Whether the table was loaded successfully
   */
  const loadTable = async () => {
    if (!sceneRef.current) return false;
    
    try {
      await sceneRef.current.loadTable();
      setTableLoaded(true);
      setTableVisible(true);
      return true;
    } catch (error) {
      console.error('Error loading table:', error);
      return false;
    }
  };

  /**
   * Toggle table visibility
   * @param {boolean} visible - Whether to show the table
   */
  const toggleTable = (visible) => {
    if (!sceneRef.current || !tableLoaded) return;
    
    sceneRef.current.setTableVisible(visible);
    setTableVisible(visible);
  };
  
  // Expose methods to parent component
  React.useImperativeHandle(
    ref,
    () => ({
      // Multi-robot methods
      loadRobot: (robotName, urdfPath, options) => robotManagerRef.current?.loadRobot(robotName, urdfPath, options),
      getAllRobots: () => robotManagerRef.current?.getAllRobots(),
      getRobot: (robotName) => robotManagerRef.current?.getRobot(robotName),
      setRobotActive: (robotName, isActive) => robotManagerRef.current?.setRobotActive(robotName, isActive),
      removeRobot: (robotName) => robotManagerRef.current?.removeRobot(robotName),
      
      // Joint control methods (updated for multi-robot)
      setJointValue: (robotNameOrJointName, jointNameOrValue, value) => {
        // Handle both old API (jointName, value) and new API (robotName, jointName, value)
        if (value === undefined) {
          // Old API: use current robot
          const currentRobotName = robotManagerRef.current?.getCurrentRobotName();
          if (currentRobotName) {
            return robotManagerRef.current?.setJointValue(currentRobotName, robotNameOrJointName, jointNameOrValue);
          }
        } else {
          // New API: robot name specified
          return robotManagerRef.current?.setJointValue(robotNameOrJointName, jointNameOrValue, value);
        }
      },
      updateJointValues: (robotNameOrValues, values) => {
        // Handle both old API (values) and new API (robotName, values)
        if (values === undefined) {
          // Old API: use current robot
          const currentRobotName = robotManagerRef.current?.getCurrentRobotName();
          if (currentRobotName) {
            return robotManagerRef.current?.setJointValues(currentRobotName, robotNameOrValues);
          }
        } else {
          // New API: robot name specified
          return robotManagerRef.current?.setJointValues(robotNameOrValues, values);
        }
      },
      resetJoints: (robotName) => {
        // If no robot name specified, reset current robot
        const targetRobot = robotName || robotManagerRef.current?.getCurrentRobotName();
        if (targetRobot) {
          robotManagerRef.current?.resetJoints(targetRobot);
        }
      },
      getJointValues: (robotName) => {
        // If no robot name specified, get current robot's values
        const targetRobot = robotName || robotManagerRef.current?.getCurrentRobotName();
        return targetRobot ? robotManagerRef.current?.getJointValues(targetRobot) : {};
      },
      
      // Backward compatibility methods
      getCurrentRobot: () => robotManagerRef.current?.getCurrentRobot(),
      focusOnRobot: (robotName, forceRefocus = false) => {
        // Only focus if explicitly requested (forceRefocus = true)
        if (!forceRefocus) return;
        
        const robot = robotName 
          ? robotManagerRef.current?.getRobot(robotName)
          : robotManagerRef.current?.getCurrentRobot();
        if (robot) sceneRef.current?.focusOnObject(robot);
      },
      
      // General methods
      getRobotState: () => robotManagerRef.current?.getAllRobots(),
      getRobotInfo: () => ({
        totalRobots: robotManagerRef.current?.getAllRobots()?.size || 0,
        activeRobots: robotManagerRef.current?.getActiveRobots() || []
      }),
      getSceneSetup: () => sceneRef.current,
      robotManagerRef, // Expose the robot manager ref
      
      // Table-related methods
      loadTable,
      toggleTable,
      isTableLoaded: () => tableLoaded,
      isTableVisible: () => tableVisible,
    }),
    [tableLoaded, tableVisible]
  );
  
  const handleOptionChange = (name, value) => {
    // Existing code...
    
    // Add this special handling for upAxis changes
    if (name === 'upAxis' && sceneRef.current) {
      // Allow time for the axis change to take effect
      setTimeout(() => {
        ref.current.focusOnRobot();
      }, 200);
    }
  };
  
  return (
    <div 
      ref={containerRef}
      style={{
        width: width || '100%',
        height: height || '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        backgroundColor: backgroundColor || DEFAULT_CONFIG.backgroundColor
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '1rem 2rem',
          borderRadius: '4px',
          zIndex: 1000
        }}>
          Loading robot...
        </div>
      )}
      
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '10px 20px',
          backgroundColor: 'rgba(255, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '4px',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

// Remove the wrapping of URDFViewerWithRef and directly export the forwardRef
export default React.forwardRef(URDFViewer);