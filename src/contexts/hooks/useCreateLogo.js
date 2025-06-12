// src/contexts/hooks/useCreateLogo.js
import { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import URDFLoader from '../../core/Loader/URDFLoader';
import MeshLoader from '../../core/Loader/MeshLoader';

export const useCreateLogo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const previewDataRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  
  // Initialize preview
  const initializePreview = useCallback((container) => {
    if (!container || previewDataRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      1000
    );
    camera.position.set(1.5, 1.5, 1.5);
    camera.lookAt(0, 0, 0);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Store preview data
    previewDataRef.current = {
      scene,
      camera,
      renderer,
      container,
      robot: null,
      animationId: null
    };

    // Initialize URDF loader
    if (!urdfLoaderRef.current) {
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
    }

    // Start animation loop
    const animate = () => {
      if (previewDataRef.current && previewDataRef.current.robot) {
        previewDataRef.current.robot.rotation.y += 0.005;
        renderer.render(scene, camera);
      }
      previewDataRef.current.animationId = requestAnimationFrame(animate);
    };
    animate();
  }, []);
  
  // Load robot
  const loadRobot = useCallback(async (robotData) => {
    if (!previewDataRef.current || !robotData?.urdfPath) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const { scene } = previewDataRef.current;
      
      // Clear existing robot
      if (previewDataRef.current.robot) {
        scene.remove(previewDataRef.current.robot);
        previewDataRef.current.robot = null;
      }
      
      // Extract package path
      const packagePath = robotData.urdfPath.substring(0, robotData.urdfPath.lastIndexOf('/'));
      
      // Reset loader
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = packagePath;
      urdfLoaderRef.current.currentRobotName = robotData.name;
      
      // Set up mesh loading
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${packagePath}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
            done(null, err);
            return;
          }
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = material || new THREE.MeshPhongMaterial({ 
                    color: 0x888888,
                    metalness: 0.4,
                    roughness: 0.6
                  });
                }
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            done(obj);
          }
        }, material);
      };
      
      // Load the robot
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(robotData.urdfPath, resolve, null, reject);
      });
      
      // Position and scale robot
      const box = new THREE.Box3().setFromObject(robot);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 1.2 / maxDim;
      
      robot.scale.set(scale, scale, scale);
      robot.position.sub(center.multiplyScalar(scale));
      robot.position.y = 0;
      
      // Add to scene
      scene.add(robot);
      previewDataRef.current.robot = robot;
      
      // Adjust camera
      const { camera } = previewDataRef.current;
      const distance = maxDim * 2;
      camera.position.set(distance, distance * 0.7, distance);
      camera.lookAt(0, 0, 0);
      
    } catch (err) {
      console.error('Error loading robot preview:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Cleanup
  const cleanup = useCallback(() => {
    if (!previewDataRef.current) return;
    
    const { animationId, renderer, robot, scene } = previewDataRef.current;
    
    // Stop animation
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    
    // Clean up robot
    if (robot) {
      scene.remove(robot);
      robot.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    
    // Clean up renderer
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    
    previewDataRef.current = null;
  }, []);
  
  return {
    isLoading,
    error,
    initializePreview,
    loadRobot,
    cleanup,
    clearError: () => setError(null)
  };
};

export default useCreateLogo;