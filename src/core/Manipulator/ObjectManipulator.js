import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * Object Manipulator for selecting and transforming objects in 3D space
 * Supports translation, rotation, and scaling of objects
 */
class ObjectManipulator {
    constructor(scene, camera, renderer, orbitControls) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.orbitControls = orbitControls;
        
        this.enabled = false;
        this.mode = 'translate'; // 'translate', 'rotate', 'scale'
        
        // Raycaster for object selection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Currently selected objects
        this.selectedObjects = [];
        this.selectableObjects = new Set();
        
        // Transform controls
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.addEventListener('change', () => this.renderer.render(this.scene, this.camera));
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
        });
        
        // Selection box helper
        this.selectionBox = null;
        
        // Event handlers
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onKeyDown = this.onKeyDown.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        
        // State
        this.isMultiSelectMode = false;
        
        // Callback functions
        this.onSelectionChange = null;
        this.onTransformChange = null;
    }
    
    /**
     * Enable the manipulator
     */
    enable() {
        if (this.enabled) return;
        
        this.enabled = true;
        this.scene.add(this.transformControls);
        
        // Add event listeners
        this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
        this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        
        // Highlight selectable objects
        this.updateSelectableObjects();
    }
    
    /**
     * Disable the manipulator
     */
    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this.clearSelection();
        this.scene.remove(this.transformControls);
        
        // Remove event listeners
        this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
        this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        
        // Clear highlights
        this.clearHighlights();
    }
    
    /**
     * Set transform mode
     * @param {string} mode - 'translate', 'rotate', or 'scale'
     */
    setMode(mode) {
        this.mode = mode;
        if (this.transformControls) {
            this.transformControls.setMode(mode);
        }
    }
    
    /**
     * Update mouse position
     */
    onMouseMove(event) {
        if (!this.enabled) return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Highlight objects on hover
        if (!this.transformControls.dragging) {
            this.highlightHoveredObject();
        }
    }
    
    /**
     * Handle mouse click for selection
     */
    onMouseDown(event) {
        if (!this.enabled || event.button !== 0) return;
        
        // Don't select if clicking on transform controls
        if (this.transformControls.axis) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Find selectable objects
        const intersects = this.raycaster.intersectObjects(Array.from(this.selectableObjects), true);
        
        if (intersects.length > 0) {
            // Find the root selectable object
            let selectedObject = intersects[0].object;
            while (selectedObject.parent && !this.selectableObjects.has(selectedObject)) {
                selectedObject = selectedObject.parent;
            }
            
            if (this.selectableObjects.has(selectedObject)) {
                if (this.isMultiSelectMode) {
                    // Multi-select mode (Shift key)
                    this.toggleObjectSelection(selectedObject);
                } else {
                    // Single select mode
                    this.selectObject(selectedObject);
                }
            }
        } else if (!this.isMultiSelectMode) {
            // Clear selection when clicking empty space
            this.clearSelection();
        }
    }
    
    /**
     * Handle keyboard input
     */
    onKeyDown(event) {
        if (!this.enabled) return;
        
        switch (event.key) {
            case 'Shift':
                this.isMultiSelectMode = true;
                break;
            case 'g':
            case 'G':
                this.setMode('translate');
                break;
            case 'r':
            case 'R':
                this.setMode('rotate');
                break;
            case 's':
            case 'S':
                if (!event.ctrlKey) { // Avoid interfering with save
                    this.setMode('scale');
                }
                break;
            case 'x':
            case 'X':
                if (this.transformControls.object) {
                    this.transformControls.showX = !this.transformControls.showX;
                    this.transformControls.showY = false;
                    this.transformControls.showZ = false;
                }
                break;
            case 'y':
            case 'Y':
                if (this.transformControls.object) {
                    this.transformControls.showX = false;
                    this.transformControls.showY = !this.transformControls.showY;
                    this.transformControls.showZ = false;
                }
                break;
            case 'z':
            case 'Z':
                if (this.transformControls.object) {
                    this.transformControls.showX = false;
                    this.transformControls.showY = false;
                    this.transformControls.showZ = !this.transformControls.showZ;
                }
                break;
            case 'Delete':
            case 'Backspace':
                // Optional: implement delete functionality
                break;
            case 'Escape':
                this.clearSelection();
                break;
        }
    }
    
    onKeyUp(event) {
        if (event.key === 'Shift') {
            this.isMultiSelectMode = false;
        }
    }
    
    /**
     * Update list of selectable objects
     */
    updateSelectableObjects() {
        this.selectableObjects.clear();
        
        // Add all robots
        this.scene.traverse((object) => {
            if (object.isURDFRobot || object.userData.selectable) {
                this.selectableObjects.add(object);
            }
            
            // Also add environment objects
            if (object.userData.environmentId) {
                this.selectableObjects.add(object);
            }
        });
    }
    
    /**
     * Select an object
     */
    selectObject(object) {
        this.clearSelection();
        this.selectedObjects = [object];
        
        // Attach transform controls
        this.transformControls.attach(object);
        this.transformControls.setMode(this.mode);
        
        // Add selection outline
        this.addSelectionOutline(object);
        
        // Notify callback
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedObjects);
        }
    }
    
    /**
     * Toggle object selection (for multi-select)
     */
    toggleObjectSelection(object) {
        const index = this.selectedObjects.indexOf(object);
        
        if (index > -1) {
            // Deselect
            this.selectedObjects.splice(index, 1);
            this.removeSelectionOutline(object);
        } else {
            // Select
            this.selectedObjects.push(object);
            this.addSelectionOutline(object);
        }
        
        // Update transform controls (attach to last selected)
        if (this.selectedObjects.length > 0) {
            const lastSelected = this.selectedObjects[this.selectedObjects.length - 1];
            this.transformControls.attach(lastSelected);
            this.transformControls.setMode(this.mode);
        } else {
            this.transformControls.detach();
        }
        
        // Notify callback
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedObjects);
        }
    }
    
    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedObjects.forEach(obj => this.removeSelectionOutline(obj));
        this.selectedObjects = [];
        this.transformControls.detach();
        
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedObjects);
        }
    }
    
    /**
     * Add selection outline to object
     */
    addSelectionOutline(object) {
        const outline = new THREE.BoxHelper(object, 0x00ff00);
        outline.name = 'selection_outline';
        outline.userData.isHelper = true;
        this.scene.add(outline);
        
        // Store reference
        object.userData.selectionOutline = outline;
    }
    
    /**
     * Remove selection outline from object
     */
    removeSelectionOutline(object) {
        if (object.userData.selectionOutline) {
            this.scene.remove(object.userData.selectionOutline);
            object.userData.selectionOutline.geometry.dispose();
            delete object.userData.selectionOutline;
        }
    }
    
    /**
     * Highlight hovered object
     */
    highlightHoveredObject() {
        // Clear previous highlight
        this.clearHighlights();
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(Array.from(this.selectableObjects), true);
        
        if (intersects.length > 0) {
            let hoveredObject = intersects[0].object;
            while (hoveredObject.parent && !this.selectableObjects.has(hoveredObject)) {
                hoveredObject = hoveredObject.parent;
            }
            
            if (this.selectableObjects.has(hoveredObject) && !this.selectedObjects.includes(hoveredObject)) {
                // Add hover highlight
                const highlight = new THREE.BoxHelper(hoveredObject, 0xffff00);
                highlight.name = 'hover_highlight';
                highlight.userData.isHelper = true;
                this.scene.add(highlight);
                hoveredObject.userData.hoverHighlight = highlight;
            }
        }
    }
    
    /**
     * Clear all highlights
     */
    clearHighlights() {
        this.scene.traverse((object) => {
            if (object.userData.hoverHighlight) {
                this.scene.remove(object.userData.hoverHighlight);
                object.userData.hoverHighlight.geometry.dispose();
                delete object.userData.hoverHighlight;
            }
        });
    }
    
    /**
     * Get selected objects
     */
    getSelectedObjects() {
        return [...this.selectedObjects];
    }
    
    /**
     * Set space mode (local/world)
     */
    setSpace(space) {
        if (this.transformControls) {
            this.transformControls.setSpace(space);
        }
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.disable();
        if (this.transformControls) {
            this.transformControls.dispose();
        }
    }
}

export default ObjectManipulator;