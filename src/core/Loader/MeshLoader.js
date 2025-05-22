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
        Logger.info('Loading mesh from:', path);
        
        // Determine file extension
        const fileExt = path.split('.').pop().toLowerCase();
        
        // Load based on file type
        if (fileExt === 'stl') {
            this.loadSTL(path, manager, done, material);
        } else if (fileExt === 'dae') {
            this.loadCOLLADA(path, manager, done, material);
        } else {
            Logger.warn(`Unsupported file format: ${fileExt}`);
            this.createFallbackGeometry(done, material);
        }
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
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const mesh = new THREE.Mesh(
            geometry,
            material || new THREE.MeshPhongMaterial({ color: 0xFA8072 })
        );
        mesh.castShadow = mesh.receiveShadow = true;
        done(mesh);
    }
}

export default MeshLoader; 