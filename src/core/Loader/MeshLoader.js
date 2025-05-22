import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { Logger } from '../../utils/GlobalVariables';

/**
 * Enhanced mesh loader with better error handling and support for multiple formats
 */
class MeshLoader {
    /**
     * Load a mesh from a file
     * @param {string} path - The path to the mesh file
     * @param {THREE.LoadingManager} manager - The Three.js loading manager
     * @param {Function} done - Callback when mesh is loaded
     * @param {THREE.Material} [material] - Optional material to apply to the mesh
     */
    static load(path, manager, done, material) {
        if (!path) {
            Logger.error('MeshLoader: No path provided');
            this.createFallbackGeometry(done, material);
            return;
        }

        Logger.info('Loading mesh from:', path);
        
        // Determine file extension
        const fileExt = path.split('.').pop().toLowerCase();
        Logger.debug(`Detected file extension: ${fileExt}`);
        
        // If it's an unsupported format, try alternative extensions
        if (fileExt === 'obj' || (fileExt !== 'stl' && fileExt !== 'dae')) {
            Logger.info(`File format ${fileExt} not directly supported, trying alternatives...`);
            this.tryAlternativeFormats(path, manager, done, material);
            return;
        }
        
        // Load based on file type
        try {
            if (fileExt === 'stl') {
                this.loadSTL(path, manager, done, material);
            } else if (fileExt === 'dae') {
                this.loadCOLLADA(path, manager, done, material);
            } else {
                Logger.warn(`Unsupported file format: ${fileExt}`);
                this.createFallbackGeometry(done, material);
            }
        } catch (error) {
            Logger.error(`Error loading mesh file ${path}:`, error);
            this.createFallbackGeometry(done, material);
        }
    }
    
    /**
     * Try alternative file formats when the original format is not supported
     * @private
     */
    static tryAlternativeFormats(path, manager, done, material) {
        const basePath = path.substring(0, path.lastIndexOf('.'));
        const alternatives = ['stl', 'dae'];
        
        // Try each alternative format
        for (const ext of alternatives) {
            const altPath = `${basePath}.${ext}`;
            Logger.info(`Trying alternative format: ${altPath}`);
            
            // Check if file exists
            fetch(altPath, { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        Logger.info(`Found alternative format: ${altPath}`);
                        this.load(altPath, manager, done, material);
                        return true;
                    }
                    return false;
                })
                .catch(() => false);
        }
        
        // If no alternatives work, create fallback geometry
        Logger.warn('No alternative formats found, using fallback geometry');
        this.createFallbackGeometry(done, material);
    }
    
    /**
     * Load an STL file
     * @private
     */
    static loadSTL(path, manager, done, material) {
        const loader = new STLLoader(manager);
        
        loader.load(
            path,
            (geometry) => {
                try {
                    // Validate geometry
                    if (!geometry || !geometry.attributes || !geometry.attributes.position) {
                        throw new Error('Invalid STL geometry');
                    }
                    
                    const mesh = new THREE.Mesh(
                        geometry,
                        material ? material.clone() : new THREE.MeshStandardMaterial()
                    );
                    mesh.castShadow = mesh.receiveShadow = true;
                    done(mesh);
                } catch (error) {
                    Logger.error('Error processing STL geometry:', error);
                    this.createFallbackGeometry(done, material);
                }
            },
            undefined,
            (error) => {
                Logger.error('STL loading failed:', error);
                this.createFallbackGeometry(done, material);
            }
        );
    }
    
    /**
     * Load a COLLADA file
     * @private
     */
    static loadCOLLADA(path, manager, done, material) {
        const loader = new ColladaLoader(manager);
        
        loader.load(
            path,
            (collada) => {
                try {
                    const model = collada.scene.clone();
                    model.traverse(n => {
                        if (n.isMesh) {
                            n.castShadow = n.receiveShadow = true;
                            if (material) n.material = material.clone();
                        }
                    });
                    done(model);
                } catch (error) {
                    Logger.error('Error processing COLLADA file:', error);
                    this.createFallbackGeometry(done, material);
                }
            },
            undefined,
            (error) => {
                Logger.error('COLLADA loading failed:', error);
                this.createFallbackGeometry(done, material);
            }
        );
    }
    
    /**
     * Create a fallback geometry when mesh loading fails
     * @private
     */
    static createFallbackGeometry(done, material) {
        // Instead of creating a visible red cube, create a tiny invisible placeholder
        const geometry = new THREE.BoxGeometry(0.001, 0.001, 0.001); // Much smaller
        const mesh = new THREE.Mesh(
            geometry,
            material || new THREE.MeshPhongMaterial({ 
                color: 0x808080,  // Gray instead of red
                opacity: 0.1,     // Nearly transparent
                transparent: true 
            })
        );
        mesh.castShadow = false;  // Don't cast shadows
        mesh.receiveShadow = false;
        mesh.visible = false;     // Make it invisible by default
        
        Logger.warn('Using invisible fallback geometry for missing mesh');
        done(mesh);
    }
}

export default MeshLoader; 