import * as THREE from 'three';

/**
 * Find the nearest parent that is a joint
 * @param {THREE.Object3D} j - The object to check
 * @returns {boolean} Whether the object is a joint
 */
function isJoint(j) {
    return j.isURDFJoint && j.jointType !== 'fixed';
}

/**
 * Find the nearest joint in the parent hierarchy
 * @param {THREE.Object3D} child - The child object
 * @returns {THREE.Object3D|null} The nearest joint, or null if none found
 */
function findNearestJoint(child) {
    let curr = child;
    while (curr) {
        if (isJoint(curr)) {
            return curr;
        }
        curr = curr.parent;
    }
    return curr;
}

// Temporary vectors and objects for calculations
const prevHitPoint = new THREE.Vector3();
const newHitPoint = new THREE.Vector3();
const pivotPoint = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const tempVector2 = new THREE.Vector3();
const projectedStartPoint = new THREE.Vector3();
const projectedEndPoint = new THREE.Vector3();
const plane = new THREE.Plane();

/**
 * Base class for URDF drag controls
 */
class URDFDragControls {
    /**
     * Create a URDFDragControls instance
     * @param {THREE.Scene} scene - The Three.js scene
     */
    constructor(scene) {
        this.enabled = true;
        this.scene = scene;
        this.raycaster = new THREE.Raycaster();
        this.initialGrabPoint = new THREE.Vector3();
        
        this.hitDistance = -1;
        this.hovered = null;
        this.manipulating = null;
    }
    
    /**
     * Update hover state based on raycaster
     */
    update() {
        const {
            raycaster,
            hovered,
            manipulating,
            scene,
        } = this;
        
        // Skip if already manipulating
        if (manipulating) {
            return;
        }
        
        let hoveredJoint = null;
        
        // Cast ray into the scene
        const intersections = raycaster.intersectObject(scene, true);
        if (intersections.length !== 0) {
            const hit = intersections[0];
            this.hitDistance = hit.distance;
            hoveredJoint = findNearestJoint(hit.object);
            this.initialGrabPoint.copy(hit.point);
        }
        
        // Update hover state if changed
        if (hoveredJoint !== hovered) {
            if (hovered) {
                this.onUnhover(hovered);
            }
            
            this.hovered = hoveredJoint;
            
            if (hoveredJoint) {
                this.onHover(hoveredJoint);
            }
        }
    }
    
    /**
     * Update a joint's value
     * @param {THREE.Object3D} joint - The joint to update
     * @param {number} angle - The new joint value
     */
    updateJoint(joint, angle) {
        joint.setJointValue(angle);
    }
    
    /**
     * Called when starting to drag a joint
     * @param {THREE.Object3D} joint - The joint being dragged
     */
    onDragStart(joint) {
        // Override in subclass
    }
    
    /**
     * Called when done dragging a joint
     * @param {THREE.Object3D} joint - The joint that was dragged
     */
    onDragEnd(joint) {
        // Override in subclass
    }
    
    /**
     * Called when hovering over a joint
     * @param {THREE.Object3D} joint - The joint being hovered
     */
    onHover(joint) {
        // Override in subclass
    }
    
    /**
     * Called when no longer hovering over a joint
     * @param {THREE.Object3D} joint - The joint that was hovered
     */
    onUnhover(joint) {
        // Override in subclass
    }
    
    /**
     * Calculate the angle delta for a revolute joint
     * @param {THREE.Object3D} joint - The joint
     * @param {THREE.Vector3} startPoint - The start point of the drag
     * @param {THREE.Vector3} endPoint - The end point of the drag
     * @returns {number} The angle change in radians
     */
    getRevoluteDelta(joint, startPoint, endPoint) {
        // Set up the plane of rotation
        tempVector
            .copy(joint.axis)
            .transformDirection(joint.matrixWorld)
            .normalize();
            
        pivotPoint
            .set(0, 0, 0)
            .applyMatrix4(joint.matrixWorld);
            
        plane
            .setFromNormalAndCoplanarPoint(tempVector, pivotPoint);
        
        // Project the drag points onto the plane
        plane.projectPoint(startPoint, projectedStartPoint);
        plane.projectPoint(endPoint, projectedEndPoint);
        
        // Get the directions relative to the pivot
        projectedStartPoint.sub(pivotPoint);
        projectedEndPoint.sub(pivotPoint);
        
        // Calculate the angle between the projected points
        tempVector.crossVectors(projectedStartPoint, projectedEndPoint);
        
        const direction = Math.sign(tempVector.dot(plane.normal));
        return direction * projectedEndPoint.angleTo(projectedStartPoint);
    }
    
    /**
     * Calculate the position delta for a prismatic joint
     * @param {THREE.Object3D} joint - The joint
     * @param {THREE.Vector3} startPoint - The start point of the drag
     * @param {THREE.Vector3} endPoint - The end point of the drag
     * @returns {number} The position change
     */
    getPrismaticDelta(joint, startPoint, endPoint) {
        tempVector.subVectors(endPoint, startPoint);
        
        plane
            .normal
            .copy(joint.axis)
            .transformDirection(joint.parent.matrixWorld)
            .normalize();
        
        return tempVector.dot(plane.normal);
    }
    
    /**
     * Update the raycaster ray
     * @param {THREE.Ray} toRay - The new ray
     */
    moveRay(toRay) {
        const { raycaster, hitDistance, manipulating } = this;
        const { ray } = raycaster;
        
        if (manipulating) {
            // Get the hit points
            ray.at(hitDistance, prevHitPoint);
            toRay.at(hitDistance, newHitPoint);
            
            // Calculate the movement delta
            let delta = 0;
            if (manipulating.jointType === 'revolute' || manipulating.jointType === 'continuous') {
                delta = this.getRevoluteDelta(manipulating, prevHitPoint, newHitPoint);
            } else if (manipulating.jointType === 'prismatic') {
                delta = this.getPrismaticDelta(manipulating, prevHitPoint, newHitPoint);
            }
            
            // Update the joint if there was movement
            if (delta) {
                this.updateJoint(manipulating, manipulating.angle + delta);
            }
        }
        
        // Update the raycaster and hover state
        this.raycaster.ray.copy(toRay);
        this.update();
    }
    
    /**
     * Set whether a joint is being grabbed
     * @param {boolean} grabbed - Whether the joint is grabbed
     */
    setGrabbed(grabbed) {
        const { hovered, manipulating } = this;
        
        if (grabbed) {
            // Start manipulation
            if (manipulating !== null || hovered === null) {
                return;
            }
            
            this.manipulating = hovered;
            this.onDragStart(hovered);
        } else {
            // End manipulation
            if (this.manipulating === null) {
                return;
            }
            
            this.onDragEnd(this.manipulating);
            this.manipulating = null;
            this.update();
        }
    }
}

/**
 * Mouse/pointer controls for manipulating URDF models
 * @extends URDFDragControls
 */
class PointerURDFDragControls extends URDFDragControls {
    /**
     * Create a PointerURDFDragControls instance
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {THREE.Camera} camera - The Three.js camera
     * @param {HTMLElement} domElement - The DOM element to attach to
     */
    constructor(scene, camera, domElement) {
        super(scene);
        
        this.camera = camera;
        this.domElement = domElement;
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        /**
         * Update the mouse position from an event
         * @param {MouseEvent} e - The mouse event
         */
        const updateMouse = (e) => {
            mouse.x = ((e.pageX - domElement.offsetLeft) / domElement.offsetWidth) * 2 - 1;
            mouse.y = -((e.pageY - domElement.offsetTop) / domElement.offsetHeight) * 2 + 1;
        };
        
        // Mouse event handlers
        this._mouseDown = e => {
            updateMouse(e);
            raycaster.setFromCamera(mouse, this.camera);
            this.moveRay(raycaster.ray);
            this.setGrabbed(true);
        };
        
        this._mouseMove = e => {
            updateMouse(e);
            raycaster.setFromCamera(mouse, this.camera);
            this.moveRay(raycaster.ray);
        };
        
        this._mouseUp = e => {
            updateMouse(e);
            raycaster.setFromCamera(mouse, this.camera);
            this.moveRay(raycaster.ray);
            this.setGrabbed(false);
        };
        
        // Attach event listeners
        domElement.addEventListener('mousedown', this._mouseDown);
        domElement.addEventListener('mousemove', this._mouseMove);
        domElement.addEventListener('mouseup', this._mouseUp);
    }
    
    /**
     * Calculate the angle delta for a revolute joint, with special handling for camera angle
     * @param {THREE.Object3D} joint - The joint
     * @param {THREE.Vector3} startPoint - The start point of the drag
     * @param {THREE.Vector3} endPoint - The end point of the drag
     * @returns {number} The angle change in radians
     */
    getRevoluteDelta(joint, startPoint, endPoint) {
        const { camera, initialGrabPoint } = this;
        
        // Set up the plane of rotation
        tempVector
            .copy(joint.axis)
            .transformDirection(joint.matrixWorld)
            .normalize();
            
        pivotPoint
            .set(0, 0, 0)
            .applyMatrix4(joint.matrixWorld);
            
        plane
            .setFromNormalAndCoplanarPoint(tempVector, pivotPoint);
        
        // Vector from camera to grab point
        tempVector
            .copy(camera.position)
            .sub(initialGrabPoint)
            .normalize();
        
        // Check if looking into the plane of rotation
        if (Math.abs(tempVector.dot(plane.normal)) > 0.3) {
            // Use standard calculation
            return super.getRevoluteDelta(joint, startPoint, endPoint);
        } else {
            // Special handling for when viewing from the side
            
            // Get the up direction
            tempVector.set(0, 1, 0).transformDirection(camera.matrixWorld);
            
            // Project points onto the plane of rotation
            plane.projectPoint(startPoint, projectedStartPoint);
            plane.projectPoint(endPoint, projectedEndPoint);
            
            // Calculate movement direction
            tempVector.set(0, 0, -1).transformDirection(camera.matrixWorld);
            tempVector.cross(plane.normal);
            tempVector2.subVectors(endPoint, startPoint);
            
            return tempVector.dot(tempVector2);
        }
    }
    
    /**
     * Dispose of the controls
     */
    dispose() {
        const { domElement } = this;
        
        // Remove event listeners
        domElement.removeEventListener('mousedown', this._mouseDown);
        domElement.removeEventListener('mousemove', this._mouseMove);
        domElement.removeEventListener('mouseup', this._mouseUp);
    }
}

export { URDFDragControls, PointerURDFDragControls };