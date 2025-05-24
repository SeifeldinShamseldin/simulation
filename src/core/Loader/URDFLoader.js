import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { URDFRobot, URDFJoint, URDFLink, URDFCollider, URDFVisual, URDFMimicJoint } from './URDFClasses.js';
import { LOADER_EVENTS, Logger } from '../../utils/GlobalVariables.js';
import robotService from '../services/RobotService.js';
import MeshLoader from './MeshLoader.js';

// Temporary variables for calculations
const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();

/**
 * Process a vector string ("x y z") into an array [x, y, z]
 * @param {string} val - The vector string to process
 * @returns {number[]} The vector as an array of numbers
 */
function processTuple(val) {
    if (!val) return [0, 0, 0];
    return val.trim().split(/\s+/g).map(num => parseFloat(num));
}

/**
 * Apply a rotation to a Three.js object in URDF order (ZYX)
 * @param {THREE.Object3D} obj - The object to rotate
 * @param {number[]} rpy - The roll, pitch, yaw values in radians
 * @param {boolean} additive - Whether to add to existing rotation (true) or replace it (false)
 */
function applyRotation(obj, rpy, additive = false) {
    // If additive is false, reset rotation
    if (!additive) obj.rotation.set(0, 0, 0);
    
    // Apply rotation in ZYX order
    tempEuler.set(rpy[0], rpy[1], rpy[2], 'ZYX');
    tempQuaternion.setFromEuler(tempEuler);
    tempQuaternion.multiply(obj.quaternion);
    obj.quaternion.copy(tempQuaternion);
}

/**
 * Class for loading and parsing URDF files
 * Now integrates with unified RobotService for mesh resolution
 */
class URDFLoader {
    /**
     * Create a URDFLoader
     * @param {THREE.LoadingManager} manager - The Three.js loading manager
     */
    constructor(manager) {
        this.manager = manager || THREE.DefaultLoadingManager;
        this.parseVisual = true;         // Whether to parse visual elements
        this.parseCollision = false;     // Whether to parse collision elements
        this.packages = '';              // Path to packages or map of package names to paths
        this.workingPath = '';           // Current working path
        this.fetchOptions = {};          // Options for fetch() calls
        this.currentRobotName = '';      // Current robot being loaded
        
        // Event handlers
        this.onProgress = null;
        this.onError = null;
        this.onLoad = null;

        // Enhanced URL modifier using RobotService
        this.manager.setURLModifier(url => {
            Logger.debug('URDFLoader URL modifier - Original URL:', url);
            
            if (url.startsWith('package://')) {
                // Use RobotService for mesh path resolution if we have a current robot
                if (this.currentRobotName) {
                    const resolvedUrl = robotService.resolveMeshPath(this.currentRobotName, url);
                    Logger.debug('URDFLoader URL modifier - Resolved via RobotService:', url, '->', resolvedUrl);
                    return resolvedUrl;
                }
                
                // Fallback to basic resolution
                const file = url.split('/').pop();
                const newUrl = `${this.packages.replace(/\/?$/, '/')}${file}`;
                Logger.debug('URDFLoader URL modifier - Basic resolution:', url, '->', newUrl);
                return newUrl;
            }
            
            return url;
        });

        // Enhanced mesh callback using RobotService
        this.loadMeshCb = (path, manager, done, material) => {
            Logger.debug('URDFLoader loading mesh from:', path);
            
            let resolvedPath = path;
            
            // Use RobotService for mesh resolution if we have a current robot
            if (this.currentRobotName) {
                resolvedPath = robotService.resolveMeshPath(this.currentRobotName, path);
                Logger.debug('URDFLoader mesh resolved via RobotService:', path, '->', resolvedPath);
            } else {
                // Fallback to extracting filename
                const file = path.split('/').pop().toLowerCase();
                const packagePath = this.packages;
                resolvedPath = `${packagePath.replace(/\/?$/, '/')}${file}`;
                Logger.debug('URDFLoader mesh basic resolution:', path, '->', resolvedPath);
            }
            
            // Use the enhanced MeshLoader with better error handling
            MeshLoader.load(resolvedPath, manager, (obj, err) => {
                if (err) {
                    Logger.error('URDFLoader: Error loading mesh.', err);
                    done(null, err);
                    return;
                }
                
                if (obj) {
                    // Only apply URDF material if mesh has no material or has a default material
                    if (!obj.material || obj.material.isMeshBasicMaterial || obj.material.name === '' || obj.material.name === 'default') {
                        obj.material = material;
                        Logger.debug('Applied URDF material to single mesh:', path);
                    } else {
                        Logger.debug('Preserved original mesh material for:', path);
                    }
                    
                    // Reset position and orientation
                    obj.position.set(0, 0, 0);
                    obj.quaternion.identity();
                    
                    // Enable shadows for all meshes
                    obj.traverse(child => {
                        if (child instanceof THREE.Mesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    Logger.debug('Successfully loaded and processed mesh:', path);
                    done(obj);
                } else {
                    Logger.warn('URDFLoader: No mesh object returned from loader');
                    done(null, new Error('No mesh object returned'));
                }
            }, material);
        };
    }

    /**
     * Create a fallback geometry when mesh loading fails
     * @private
     */
    _createFallbackGeometry(done, material) {
        const geometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const mesh = new THREE.Mesh(
            geometry,
            material || new THREE.MeshPhongMaterial({ 
                color: 0x808080,
                opacity: 0.1,
                transparent: true
            })
        );
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.visible = false;
        
        Logger.warn('Created invisible fallback geometry for missing mesh');
        done(mesh);
    }

    /**
     * Load a URDF file asynchronously
     * @param {string} urdf - The URL or path to the URDF file
     * @returns {Promise<URDFRobot>} A promise that resolves to the loaded robot
     */
    loadAsync(urdf) {
        return new Promise((resolve, reject) => {
            this.load(urdf, resolve, null, reject);
        });
    }

    /**
     * Load a URDF file
     * @param {string} urdf - The URL or path to the URDF file
     * @param {Function} onComplete - Callback when loading is complete
     * @param {Function} [onProgress] - Callback for loading progress
     * @param {Function} [onError] - Callback for loading errors
     */
    load(urdf, onComplete, onProgress, onError) {
        // Extract robot name from path if not already set
        if (!this.currentRobotName) {
            this.currentRobotName = urdf.split('/').pop().replace('.urdf', '');
        }
        
        // Get robot configuration from service for enhanced loading
        const robotConfig = robotService.getRobotConfig(this.currentRobotName);
        if (robotConfig) {
            Logger.info(`URDFLoader using config for ${this.currentRobotName}:`, robotConfig);
            this.packages = robotConfig.packagePath;
        }
        
        // Check if a full URI is specified before prepending the package info
        const manager = this.manager;
        const workingPath = THREE.LoaderUtils.extractUrlBase(urdf);
        const urdfPath = this.manager.resolveURL(urdf);
        
        // Store callbacks
        this.onProgress = onProgress;
        this.onError = onError;
        this.onLoad = onComplete;
        
        // Start loading
        manager.itemStart(urdfPath);
        
        // Dispatch load start event
        if (LOADER_EVENTS.onLoadStart) {
            LOADER_EVENTS.onLoadStart(urdfPath);
        }
        
        fetch(urdfPath, this.fetchOptions)
            .then(res => {
                if (res.ok) {
                    if (onProgress) {
                        onProgress(null);
                    }
                    return res.text();
                } else {
                    throw new Error(`URDFLoader: Failed to load url '${urdfPath}' with error code ${res.status}: ${res.statusText}.`);
                }
            })
            .then(data => {
                // Parse the URDF and create the robot model
                const model = this.parse(data, this.workingPath || workingPath);
                
                // Dispatch load complete event
                if (LOADER_EVENTS.onLoadComplete) {
                    LOADER_EVENTS.onLoadComplete(model);
                }
                
                // Call the onComplete callback
                onComplete(model);
                manager.itemEnd(urdfPath);
            })
            .catch(e => {
                // Handle errors
                if (onError) {
                    onError(e);
                } else {
                    console.error('URDFLoader: Error loading file.', e);
                }
                
                // Dispatch load error event
                if (LOADER_EVENTS.onLoadError) {
                    LOADER_EVENTS.onLoadError(e);
                }
                
                manager.itemError(urdfPath);
                manager.itemEnd(urdfPath);
            });
    }

    /**
     * Parse URDF content
     * @param {string|Element|Document} content - The URDF content to parse
     * @param {string} [workingPath] - The working path for resolving relative URLs
     * @returns {URDFRobot} The parsed robot model
     */
    parse(content, workingPath = this.workingPath) {
        const packages = this.packages;
        const loadMeshCb = this.loadMeshCb;
        const parseVisual = this.parseVisual;
        const parseCollision = this.parseCollision;
        const manager = this.manager;
        const currentRobotName = this.currentRobotName;
        
        // Maps to store links, joints, and materials by name
        const linkMap = {};
        const jointMap = {};
        const materialMap = {};
        
        /**
         * Resolve the path of a mesh file using RobotService
         * @param {string} path - The path from the URDF file
         * @returns {string} The resolved path
         */
        function resolvePath(path) {
            // Use RobotService for resolution if we have a current robot
            if (currentRobotName) {
                return robotService.resolveMeshPath(currentRobotName, path);
            }
            
            // Fallback to original logic
            if (!/^package:\/\//.test(path)) {
                return workingPath ? workingPath + path : path;
            }
            
            // Remove "package://" prefix and split at first slash
            const [targetPkg, relPath] = path.replace(/^package:\/\//, '').split(/\/(.+)/);
            
            // Handle different package formats
            if (typeof packages === 'string') {
                if (packages.endsWith(targetPkg)) {
                    return packages + '/' + relPath;
                } else {
                    return packages + '/' + targetPkg + '/' + relPath;
                }
            } else if (packages instanceof Function) {
                return packages(targetPkg) + '/' + relPath;
            } else if (typeof packages === 'object') {
                if (targetPkg in packages) {
                    return packages[targetPkg] + '/' + relPath;
                } else {
                    console.error(`URDFLoader: ${targetPkg} not found in provided package list.`);
                    return null;
                }
            }
        }
        
        /**
         * Process the URDF content
         * @param {string|Element|Document} data - The URDF content
         * @returns {URDFRobot} The parsed robot model
         */
        function processUrdf(data) {
            let children;
            
            // Get the root elements
            if (data instanceof Document) {
                children = [...data.children];
            } else if (data instanceof Element) {
                children = [data];
            } else {
                // Parse from string
                const parser = new DOMParser();
                const urdf = parser.parseFromString(data, 'text/xml');
                children = [...urdf.children];
            }
            
            // Find the robot node and process it
            const robotNode = children.filter(c => c.nodeName === 'robot').pop();
            return processRobot(robotNode);
        }
        
        /**
         * Process a robot node
         * @param {Element} robot - The robot XML element
         * @returns {URDFRobot} The parsed robot model
         */
        function processRobot(robot) {
            const robotNodes = [...robot.children];
            
            // Filter nodes by type
            const links = robotNodes.filter(c => c.nodeName.toLowerCase() === 'link');
            const joints = robotNodes.filter(c => c.nodeName.toLowerCase() === 'joint');
            const materials = robotNodes.filter(c => c.nodeName.toLowerCase() === 'material');
            
            // Create the robot object
            const obj = new URDFRobot();
            obj.robotName = robot.getAttribute('name');
            obj.urdfRobotNode = robot;
            
            // Process materials
            materials.forEach(m => {
                const name = m.getAttribute('name');
                materialMap[name] = processMaterial(m);
            });
            
            // Process links
            const visualMap = {};
            const colliderMap = {};
            links.forEach(l => {
                const name = l.getAttribute('name');
                // Check if this is the root link
                const isRoot = robot.querySelector(`child[link="${name}"]`) === null;
                linkMap[name] = processLink(l, visualMap, colliderMap, isRoot ? obj : null);
            });
            
            // Process joints
            joints.forEach(j => {
                const name = j.getAttribute('name');
                jointMap[name] = processJoint(j);
            });
            
            // Store maps in the robot object
            obj.joints = jointMap;
            obj.links = linkMap;
            obj.colliders = colliderMap;
            obj.visual = visualMap;
            
            // Link up mimic joints
            const jointList = Object.values(jointMap);
            jointList.forEach(j => {
                if (j instanceof URDFMimicJoint) {
                    jointMap[j.mimicJoint].mimicJoints.push(j);
                }
            });
            
            // Detect infinite loops of mimic joints
            jointList.forEach(j => {
                const uniqueJoints = new Set();
                
                // Recursive function to check for loops
                const iterFunction = joint => {
                    if (uniqueJoints.has(joint)) {
                        throw new Error('URDFLoader: Detected an infinite loop of mimic joints.');
                    }
                    
                    uniqueJoints.add(joint);
                    joint.mimicJoints.forEach(j => {
                        iterFunction(j);
                    });
                };
                
                iterFunction(j);
            });
            
            // Create frames map (all named objects)
            obj.frames = {
                ...colliderMap,
                ...visualMap,
                ...linkMap,
                ...jointMap,
            };
            
            return obj;
        }
        
        /**
         * Process a joint node
         * @param {Element} joint - The joint XML element
         * @returns {URDFJoint} The parsed joint
         */
        function processJoint(joint) {
            const children = [...joint.children];
            const jointType = joint.getAttribute('type');
            
            let obj;
            
            // Check if this is a mimic joint
            const mimicTag = children.find(n => n.nodeName.toLowerCase() === 'mimic');
            if (mimicTag) {
                obj = new URDFMimicJoint();
                obj.mimicJoint = mimicTag.getAttribute('joint');
                obj.multiplier = parseFloat(mimicTag.getAttribute('multiplier') || 1.0);
                obj.offset = parseFloat(mimicTag.getAttribute('offset') || 0.0);
            } else {
                obj = new URDFJoint();
            }
            
            // Set common properties
            obj.urdfNode = joint;
            obj.name = joint.getAttribute('name');
            obj.urdfName = obj.name;
            obj.jointType = jointType;
            
            // Initialize variables for parent, child links, and position/orientation
            let parent = null;
            let child = null;
            let xyz = [0, 0, 0];
            let rpy = [0, 0, 0];
            
            // Extract attributes from child nodes
            children.forEach(n => {
                const type = n.nodeName.toLowerCase();
                
                if (type === 'origin') {
                    // Get position and orientation
                    xyz = processTuple(n.getAttribute('xyz'));
                    rpy = processTuple(n.getAttribute('rpy'));
                } else if (type === 'child') {
                    // Get child link
                    child = linkMap[n.getAttribute('link')];
                } else if (type === 'parent') {
                    // Get parent link
                    parent = linkMap[n.getAttribute('link')];
                } else if (type === 'limit') {
                    // Get joint limits
                    obj.limit.lower = parseFloat(n.getAttribute('lower') || obj.limit.lower);
                    obj.limit.upper = parseFloat(n.getAttribute('upper') || obj.limit.upper);
                }
            });
            
            // Join the links
            parent.add(obj);
            obj.add(child);
            applyRotation(obj, rpy);
            obj.position.set(xyz[0], xyz[1], xyz[2]);
            
            // Set up the joint axis
            const axisNode = children.filter(n => n.nodeName.toLowerCase() === 'axis')[0];
            if (axisNode) {
                const axisXYZ = axisNode.getAttribute('xyz').split(/\s+/g).map(num => parseFloat(num));
                obj.axis = new THREE.Vector3(axisXYZ[0], axisXYZ[1], axisXYZ[2]);
                obj.axis.normalize();
            }
            
            return obj;
        }
        
        /**
         * Process a link node
         * @param {Element} link - The link XML element
         * @param {Object} visualMap - Map to store visual elements
         * @param {Object} colliderMap - Map to store collision elements
         * @param {URDFLink} [target] - The target link object, or null to create a new one
         * @returns {URDFLink} The parsed link
         */
        function processLink(link, visualMap, colliderMap, target = null) {
            // Create a new link if target is null
            if (target === null) {
                target = new URDFLink();
            }
            
            // Set common properties
            const children = [...link.children];
            target.name = link.getAttribute('name');
            target.urdfName = target.name;
            target.urdfNode = link;
            
            // Process visual elements
            if (parseVisual) {
                const visualNodes = children.filter(n => n.nodeName.toLowerCase() === 'visual');
                visualNodes.forEach(vn => {
                    const v = processLinkElement(vn, materialMap);
                    target.add(v);
                    
                    // If the visual has a name, add it to the visual map
                    if (vn.hasAttribute('name')) {
                        const name = vn.getAttribute('name');
                        v.name = name;
                        v.urdfName = name;
                        visualMap[name] = v;
                    }
                });
            }
            
            // Process collision elements
            if (parseCollision) {
                const collisionNodes = children.filter(n => n.nodeName.toLowerCase() === 'collision');
                collisionNodes.forEach(cn => {
                    const c = processLinkElement(cn);
                    target.add(c);
                    
                    // If the collision has a name, add it to the collider map
                    if (cn.hasAttribute('name')) {
                        const name = cn.getAttribute('name');
                        c.name = name;
                        c.urdfName = name;
                        colliderMap[name] = c;
                    }
                });
            }
            
            return target;
        }
        
        /**
         * Process a material node
         * @param {Element} node - The material XML element
         * @returns {THREE.Material} The parsed material
         */
        function processMaterial(node) {
            const matNodes = [...node.children];
            const material = new THREE.MeshPhongMaterial();
            
            material.name = node.getAttribute('name') || '';
            
            // Process material properties
            matNodes.forEach(n => {
                const type = n.nodeName.toLowerCase();
                
                if (type === 'color') {
                    // Set color and transparency
                    const rgba = n.getAttribute('rgba').split(/\s/g).map(v => parseFloat(v));
                    material.color.setRGB(rgba[0], rgba[1], rgba[2]);
                    material.opacity = rgba[3];
                    material.transparent = rgba[3] < 1;
                    material.depthWrite = !material.transparent;
                } else if (type === 'texture') {
                    // Load texture if filename is provided
                    const filename = n.getAttribute('filename');
                    if (filename) {
                        const loader = new THREE.TextureLoader(manager);
                        const filePath = resolvePath(filename);
                        material.map = loader.load(filePath);
                        material.map.colorSpace = THREE.SRGBColorSpace;
                    }
                }
            });
            
            return material;
        }
        
        /**
         * Process a visual or collision element
         * @param {Element} vn - The visual or collision XML element
         * @param {Object} materialMap - Map of materials by name
         * @returns {URDFVisual|URDFCollider} The parsed visual or collision element
         */
        function processLinkElement(vn, materialMap = {}) {
            const isCollisionNode = vn.nodeName.toLowerCase() === 'collision';
            const children = [...vn.children];
            let material = null;
            
            // Get the material
            const materialNode = children.filter(n => n.nodeName.toLowerCase() === 'material')[0];
            if (materialNode) {
                const name = materialNode.getAttribute('name');
                if (name && name in materialMap) {
                    // Use existing material
                    material = materialMap[name];
                } else {
                    // Create new material
                    material = processMaterial(materialNode);
                }
            } else {
                // Create default material
                material = new THREE.MeshPhongMaterial();
            }
            
            // Create the appropriate group
            const group = isCollisionNode ? new URDFCollider() : new URDFVisual();
            group.urdfNode = vn;
            
            // Process child nodes
            children.forEach(n => {
                const type = n.nodeName.toLowerCase();
                
                if (type === 'geometry') {
                    // Process geometry
                    const geoType = n.children[0].nodeName.toLowerCase();
                    
                    if (geoType === 'mesh') {
                        // Load mesh from file
                        const filename = n.children[0].getAttribute('filename');
                        const filePath = resolvePath(filename);
                        
                        Logger.info(`URDF mesh reference: ${filename}`);
                        Logger.info(`Resolved mesh path: ${filePath}`);
                        
                        // Load the mesh if path is valid
                        if (filePath !== null) {
                            // Apply scale if provided
                            const scaleAttr = n.children[0].getAttribute('scale');
                            if (scaleAttr) {
                                const scale = processTuple(scaleAttr);
                                group.scale.set(scale[0], scale[1], scale[2]);
                                Logger.debug(`Applied scale: [${scale.join(', ')}]`);
                            }
                            
                            // Load the mesh with better error handling
                            loadMeshCb(filePath, manager, (obj, err) => {
                                if (err) {
                                    Logger.error(`Failed to load mesh: ${filename}`, err);
                                    Logger.error(`Attempted path: ${filePath}`);
                                    // Don't add fallback geometry - just skip this mesh
                                    return;
                                } else if (obj) {
                                    // Only apply URDF material if mesh has no material or has a default material
                                    if (!obj.material || obj.material.isMeshBasicMaterial || obj.material.name === '' || obj.material.name === 'default') {
                                        obj.material = material;
                                        Logger.debug('Applied URDF material to single mesh:', filePath);
                                    } else {
                                        Logger.debug('Preserved original mesh material for:', filePath);
                                    }
                                    
                                    // Reset position and orientation
                                    obj.position.set(0, 0, 0);
                                    obj.quaternion.identity();
                                    group.add(obj);
                                    Logger.debug('Successfully loaded and added mesh:', filename);
                                }
                            }, material);
                        } else {
                            Logger.error(`Cannot resolve mesh path for: ${filename}`);
                            // Don't create fallback geometry
                        }
                    } else if (geoType === 'box') {
                        // Create box primitive
                        const primitiveModel = new THREE.Mesh();
                        primitiveModel.geometry = new THREE.BoxGeometry(1, 1, 1);
                        primitiveModel.material = material;
                        
                        // Apply size
                        const size = processTuple(n.children[0].getAttribute('size'));
                        primitiveModel.scale.set(size[0], size[1], size[2]);
                        
                        group.add(primitiveModel);
                    } else if (geoType === 'sphere') {
                        // Create sphere primitive
                        const primitiveModel = new THREE.Mesh();
                        primitiveModel.geometry = new THREE.SphereGeometry(1, 30, 30);
                        primitiveModel.material = material;
                        
                        // Apply radius
                        const radius = parseFloat(n.children[0].getAttribute('radius')) || 0;
                        primitiveModel.scale.set(radius, radius, radius);
                        
                        group.add(primitiveModel);
                    } else if (geoType === 'cylinder') {
                        // Create cylinder primitive
                        const primitiveModel = new THREE.Mesh();
                        primitiveModel.geometry = new THREE.CylinderGeometry(1, 1, 1, 30);
                        primitiveModel.material = material;
                        
                        // Apply radius and length
                        const radius = parseFloat(n.children[0].getAttribute('radius')) || 0;
                        const length = parseFloat(n.children[0].getAttribute('length')) || 0;
                        primitiveModel.scale.set(radius, length, radius);
                        primitiveModel.rotation.set(Math.PI / 2, 0, 0);
                        
                        group.add(primitiveModel);
                    }
                } else if (type === 'origin') {
                    // Apply position and orientation
                    const xyz = processTuple(n.getAttribute('xyz'));
                    const rpy = processTuple(n.getAttribute('rpy'));
                    
                    group.position.set(xyz[0], xyz[1], xyz[2]);
                    group.rotation.set(0, 0, 0);
                    applyRotation(group, rpy);
                }
            });
            
            return group;
        }
        
        // Process the URDF content
        return processUrdf(content);
    }
    
    /**
     * Default mesh loading function using RobotService
     * @param {string} path - The path to the mesh file
     * @param {THREE.LoadingManager} manager - The Three.js loading manager
     * @param {Function} done - Callback when mesh is loaded
     * @param {THREE.Material} [material] - Optional material to apply to the mesh
     */
    loadMeshCb(path, manager, done, material) {
        Logger.debug('URDFLoader loading mesh from:', path);
        
        let resolvedPath = path;
        
        // Use RobotService for mesh resolution if we have a current robot
        if (this.currentRobotName) {
            resolvedPath = robotService.resolveMeshPath(this.currentRobotName, path);
            Logger.debug('URDFLoader mesh resolved via RobotService:', path, '->', resolvedPath);
        } else {
            // Fallback to extracting filename
            const file = path.split('/').pop().toLowerCase();
            const packagePath = this.packages;
            resolvedPath = `${packagePath.replace(/\/?$/, '/')}${file}`;
            Logger.debug('URDFLoader mesh basic resolution:', path, '->', resolvedPath);
        }
        
        // Use the enhanced MeshLoader with better error handling
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
            if (err) {
                Logger.error('URDFLoader: Error loading mesh.', err);
                done(null, err);
                return;
            }
            
            if (obj) {
                // Only apply URDF material if mesh has no material or has a default material
                if (!obj.material || obj.material.isMeshBasicMaterial || obj.material.name === '' || obj.material.name === 'default') {
                    obj.material = material;
                    Logger.debug('Applied URDF material to single mesh:', path);
                } else {
                    Logger.debug('Preserved original mesh material for:', path);
                }
                
                // Reset position and orientation
                obj.position.set(0, 0, 0);
                obj.quaternion.identity();
                
                // Enable shadows for all meshes
                obj.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                Logger.debug('Successfully loaded and processed mesh:', path);
                done(obj);
            } else {
                Logger.warn('URDFLoader: No mesh object returned from loader');
                done(null, new Error('No mesh object returned'));
            }
        }, material);
    }
}

export default URDFLoader;