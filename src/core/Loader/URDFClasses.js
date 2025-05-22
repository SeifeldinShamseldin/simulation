import * as THREE from 'three';

// Temporary vectors and matrices for calculations (optimization to avoid creating new objects)
const _tempAxis = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _tempTransform = new THREE.Matrix4();
const _tempOrigTransform = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3(1.0, 1.0, 1.0);
const _tempPosition = new THREE.Vector3();

/**
 * Base class for all URDF elements
 * @extends THREE.Object3D
 */
class URDFBase extends THREE.Object3D {
    /**
     * Create a URDFBase object
     */
    constructor(...args) {
        super(...args);
        this.urdfNode = null;  // Reference to the XML node in the URDF file
        this.urdfName = '';    // Name of the element from the URDF file
    }

    /**
     * Copy properties from another URDFBase object
     * @param {URDFBase} source - The source object to copy from
     * @param {boolean} recursive - Whether to copy child objects
     * @returns {URDFBase} This object
     */
    copy(source, recursive) {
        super.copy(source, recursive);
        this.urdfNode = source.urdfNode;
        this.urdfName = source.urdfName;
        return this;
    }
}

/**
 * Class representing a collision body in a URDF model
 * @extends URDFBase
 */
class URDFCollider extends URDFBase {
    /**
     * Create a URDFCollider object
     */
    constructor(...args) {
        super(...args);
        this.isURDFCollider = true;
        this.type = 'URDFCollider';
    }
}

/**
 * Class representing a visual body in a URDF model
 * @extends URDFBase
 */
class URDFVisual extends URDFBase {
    /**
     * Create a URDFVisual object
     */
    constructor(...args) {
        super(...args);
        this.isURDFVisual = true;
        this.type = 'URDFVisual';
    }
}

/**
 * Class representing a link in a URDF model
 * @extends URDFBase
 */
class URDFLink extends URDFBase {
    /**
     * Create a URDFLink object
     */
    constructor(...args) {
        super(...args);
        this.isURDFLink = true;
        this.type = 'URDFLink';
    }
}

/**
 * Class representing a joint in a URDF model
 * @extends URDFBase
 */
class URDFJoint extends URDFBase {
    /**
     * Get the joint type
     * @returns {string} The joint type
     */
    get jointType() {
        return this._jointType;
    }

    /**
     * Set the joint type and initialize properties accordingly
     * @param {string} v - The joint type
     */
    set jointType(v) {
        if (this.jointType === v) return;
        this._jointType = v;
        this.matrixWorldNeedsUpdate = true;
        
        switch (v) {
            case 'fixed':
                this.jointValue = [];
                break;
            case 'continuous':
            case 'revolute':
            case 'prismatic':
                this.jointValue = new Array(1).fill(0);
                break;
            case 'planar':
                // Planar joints have 3 degrees of freedom: position XY and rotation Z
                this.jointValue = new Array(3).fill(0);
                this.axis = new THREE.Vector3(0, 0, 1);
                break;
            case 'floating':
                // Floating joints have 6 degrees of freedom: X, Y, Z, roll, pitch, yaw
                this.jointValue = new Array(6).fill(0);
                break;
        }
    }

    /**
     * Get the joint angle (first joint value)
     * @returns {number} The joint angle
     */
    get angle() {
        return this.jointValue[0];
    }

    /**
     * Create a URDFJoint object
     */
    constructor(...args) {
        super(...args);
        
        this.isURDFJoint = true;
        this.type = 'URDFJoint';
        
        this.jointValue = null;
        this.jointType = 'fixed';
        this.axis = new THREE.Vector3(1, 0, 0);
        this.limit = { lower: 0, upper: 0 };
        this.ignoreLimits = false;
        
        this.origPosition = null;
        this.origQuaternion = null;
        
        this.mimicJoints = [];
    }

    /**
     * Copy properties from another URDFJoint object
     * @param {URDFJoint} source - The source object to copy from
     * @param {boolean} recursive - Whether to copy child objects
     * @returns {URDFJoint} This object
     */
    copy(source, recursive) {
        super.copy(source, recursive);
        
        this.jointType = source.jointType;
        this.axis = source.axis.clone();
        this.limit.lower = source.limit.lower;
        this.limit.upper = source.limit.upper;
        this.ignoreLimits = false;
        
        this.jointValue = [...source.jointValue];
        
        this.origPosition = source.origPosition ? source.origPosition.clone() : null;
        this.origQuaternion = source.origQuaternion ? source.origQuaternion.clone() : null;
        
        this.mimicJoints = [...source.mimicJoints];
        
        return this;
    }

    /**
     * Set the joint value
     * @param {...number|null} values - The joint values to set
     * @returns {boolean} Whether the joint value was changed
     */
    setJointValue(...values) {
        // Parse all incoming values into numbers except null, which we treat as a no-op for that value component
        values = values.map(v => v === null ? null : parseFloat(v));
        
        if (!this.origPosition || !this.origQuaternion) {
            this.origPosition = this.position.clone();
            this.origQuaternion = this.quaternion.clone();
        }
        
        let didUpdate = false;
        
        // Update mimic joints first
        this.mimicJoints.forEach(joint => {
            didUpdate = joint.updateFromMimickedJoint(...values) || didUpdate;
        });
        
        switch (this.jointType) {
            case 'fixed': {
                return didUpdate;
            }
            
            case 'continuous':
            case 'revolute': {
                let angle = values[0];
                if (angle == null) return didUpdate;
                if (angle === this.jointValue[0]) return didUpdate;
                
                // Apply joint limits for revolute joints
                if (!this.ignoreLimits && this.jointType === 'revolute') {
                    angle = Math.min(this.limit.upper, angle);
                    angle = Math.max(this.limit.lower, angle);
                }
                
                // Set the rotation quaternion
                this.quaternion
                    .setFromAxisAngle(this.axis, angle)
                    .premultiply(this.origQuaternion);
                
                if (this.jointValue[0] !== angle) {
                    this.jointValue[0] = angle;
                    this.matrixWorldNeedsUpdate = true;
                    return true;
                } else {
                    return didUpdate;
                }
            }
            
            case 'prismatic': {
                let pos = values[0];
                if (pos == null) return didUpdate;
                if (pos === this.jointValue[0]) return didUpdate;
                
                // Apply joint limits
                if (!this.ignoreLimits) {
                    pos = Math.min(this.limit.upper, pos);
                    pos = Math.max(this.limit.lower, pos);
                }
                
                // Set the position
                this.position.copy(this.origPosition);
                _tempAxis.copy(this.axis).applyEuler(this.rotation);
                this.position.addScaledVector(_tempAxis, pos);
                
                if (this.jointValue[0] !== pos) {
                    this.jointValue[0] = pos;
                    this.matrixWorldNeedsUpdate = true;
                    return true;
                } else {
                    return didUpdate;
                }
            }
            
            case 'floating': {
                // No-op if all values are identical to existing value or are null
                if (this.jointValue.every((value, index) => 
                    values[index] === value || values[index] === null)) {
                    return didUpdate;
                }
                
                // Update joint values
                for (let i = 0; i < 6; i++) {
                    if (values[i] !== null) {
                        this.jointValue[i] = values[i];
                    }
                }
                
                // Compose transform of joint origin and transform due to joint values
                _tempOrigTransform.compose(this.origPosition, this.origQuaternion, _tempScale);
                _tempQuat.setFromEuler(_tempEuler.set(
                    this.jointValue[3],
                    this.jointValue[4],
                    this.jointValue[5],
                    'XYZ'
                ));
                _tempPosition.set(this.jointValue[0], this.jointValue[1], this.jointValue[2]);
                _tempTransform.compose(_tempPosition, _tempQuat, _tempScale);
                
                // Calculate new transform
                _tempOrigTransform.premultiply(_tempTransform);
                this.position.setFromMatrixPosition(_tempOrigTransform);
                this.rotation.setFromRotationMatrix(_tempOrigTransform);
                
                this.matrixWorldNeedsUpdate = true;
                return true;
            }
            
            case 'planar': {
                // No-op if all values are identical to existing value or are null
                if (this.jointValue.every((value, index) => 
                    values[index] === value || values[index] === null)) {
                    return didUpdate;
                }
                
                // Update joint values
                for (let i = 0; i < 3; i++) {
                    if (values[i] !== null) {
                        this.jointValue[i] = values[i];
                    }
                }
                
                // Compose transform of joint origin and transform due to joint values
                _tempOrigTransform.compose(this.origPosition, this.origQuaternion, _tempScale);
                _tempQuat.setFromAxisAngle(this.axis, this.jointValue[2]);
                _tempPosition.set(this.jointValue[0], this.jointValue[1], 0.0);
                _tempTransform.compose(_tempPosition, _tempQuat, _tempScale);
                
                // Calculate new transform
                _tempOrigTransform.premultiply(_tempTransform);
                this.position.setFromMatrixPosition(_tempOrigTransform);
                this.rotation.setFromRotationMatrix(_tempOrigTransform);
                
                this.matrixWorldNeedsUpdate = true;
                return true;
            }
        }
        
        return didUpdate;
    }
}

/**
 * Class representing a mimic joint in a URDF model
 * @extends URDFJoint
 */
class URDFMimicJoint extends URDFJoint {
    /**
     * Create a URDFMimicJoint object
     */
    constructor(...args) {
        super(...args);
        this.type = 'URDFMimicJoint';
        this.mimicJoint = null;  // The joint being mimicked
        this.offset = 0;         // Offset to add to the mimicked joint value
        this.multiplier = 1;     // Multiplier for the mimicked joint value
    }

    /**
     * Update this joint from the mimicked joint
     * @param {...number|null} values - The joint values of the mimicked joint
     * @returns {boolean} Whether the joint value was changed
     */
    updateFromMimickedJoint(...values) {
        const modifiedValues = values.map(x => x !== null ? x * this.multiplier + this.offset : null);
        return super.setJointValue(...modifiedValues);
    }

    /**
     * Copy properties from another URDFMimicJoint object
     * @param {URDFMimicJoint} source - The source object to copy from
     * @param {boolean} recursive - Whether to copy child objects
     * @returns {URDFMimicJoint} This object
     */
    copy(source, recursive) {
        super.copy(source, recursive);
        
        this.mimicJoint = source.mimicJoint;
        this.offset = source.offset;
        this.multiplier = source.multiplier;
        
        return this;
    }
}

/**
 * Class representing a complete robot in a URDF model
 * @extends URDFLink
 */
class URDFRobot extends URDFLink {
    /**
     * Create a URDFRobot object
     */
    constructor(...args) {
        super(...args);
        this.isURDFRobot = true;
        this.urdfNode = null;
        
        this.urdfRobotNode = null;
        this.robotName = null;
        
        this.links = null;       // Map of link names to link objects
        this.joints = null;      // Map of joint names to joint objects
        this.colliders = null;   // Map of collider names to collider objects
        this.visual = null;      // Map of visual names to visual objects
        this.frames = null;      // Map of all frames (links, joints, etc.)
    }

    /**
     * Copy properties from another URDFRobot object
     * @param {URDFRobot} source - The source object to copy from
     * @param {boolean} recursive - Whether to copy child objects
     * @returns {URDFRobot} This object
     */
    copy(source, recursive) {
        super.copy(source, recursive);
        
        this.urdfRobotNode = source.urdfRobotNode;
        this.robotName = source.robotName;
        
        this.links = {};
        this.joints = {};
        this.colliders = {};
        this.visual = {};
        
        // Map all named elements from the source robot to this robot
        this.traverse(c => {
            if (c.isURDFJoint && c.urdfName in source.joints) {
                this.joints[c.urdfName] = c;
            }
            
            if (c.isURDFLink && c.urdfName in source.links) {
                this.links[c.urdfName] = c;
            }
            
            if (c.isURDFCollider && c.urdfName in source.colliders) {
                this.colliders[c.urdfName] = c;
            }
            
            if (c.isURDFVisual && c.urdfName in source.visual) {
                this.visual[c.urdfName] = c;
            }
        });
        
        // Repair mimic joint references once we've re-accumulated all our joint data
        for (const joint in this.joints) {
            this.joints[joint].mimicJoints = this.joints[joint].mimicJoints.map(
                (mimicJoint) => this.joints[mimicJoint.name]
            );
        }
        
        this.frames = {
            ...this.colliders,
            ...this.visual,
            ...this.links,
            ...this.joints,
        };
        
        return this;
    }

    /**
     * Get a frame by name
     * @param {string} name - The name of the frame
     * @returns {URDFBase|null} The frame, or null if not found
     */
    getFrame(name) {
        return this.frames[name];
    }

    /**
     * Set a joint value
     * @param {string} jointName - The name of the joint
     * @param {...number} angle - The joint value(s) to set
     * @returns {boolean} Whether the joint value was changed
     */
    setJointValue(jointName, ...angle) {
        const joint = this.joints[jointName];
        if (joint) {
            return joint.setJointValue(...angle);
        }
        return false;
    }

    /**
     * Set multiple joint values
     * @param {Object} values - Map of joint names to joint values
     * @returns {boolean} Whether any joint values were changed
     */
    setJointValues(values) {
        let didChange = false;
        for (const name in values) {
            const value = values[name];
            if (Array.isArray(value)) {
                didChange = this.setJointValue(name, ...value) || didChange;
            } else {
                didChange = this.setJointValue(name, value) || didChange;
            }
        }
        return didChange;
    }
}

export { URDFRobot, URDFLink, URDFJoint, URDFMimicJoint, URDFVisual, URDFCollider };