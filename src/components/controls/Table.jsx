import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader';

const Table = ({ 
  modelPath = '/objects/table/complete_table.dae',
  width = 800,
  height = 600,
  backgroundColor = 0xf0f0f0,
  onLoad = null,
  onError = null
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const frameId = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      width / height,
      0.1,
      1000
    );
    camera.position.set(2, 1.5, 2);
    camera.lookAt(0, 0.3, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Add renderer to DOM
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 5;
    controls.target.set(0, 0.3, 0);
    controls.update();

    // Lighting setup
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light for shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -2;
    directionalLight.shadow.camera.right = 2;
    directionalLight.shadow.camera.top = 2;
    directionalLight.shadow.camera.bottom = -2;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Helper light from below to brighten dark areas
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, -5, -5);
    scene.add(fillLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.ShadowMaterial({ 
      opacity: 0.3,
      color: 0x000000
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(4, 20, 0x888888, 0xcccccc);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Load the table model
    const loader = new ColladaLoader();
    loader.load(
      modelPath,
      (collada) => {
        const model = collada.scene;
        
        // Apply the gray material from URDF
        const grayMaterial = new THREE.MeshPhongMaterial({
          color: new THREE.Color(0.56, 0.67, 0.67),
          shininess: 100,
          specular: 0x222222
        });

        // Apply material and shadows to all meshes
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Apply the gray material
            child.material = grayMaterial;
            
            // Enable shadows
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Scale and position the model if needed
        model.scale.set(1, 1, 1);
        model.position.set(0, 0, 0);

        scene.add(model);
        setLoading(false);
        
        if (onLoad) {
          onLoad(model);
        }
      },
      (xhr) => {
        // Progress callback
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log(`Loading: ${percentComplete.toFixed(2)}%`);
      },
      (err) => {
        console.error('Error loading model:', err);
        setError(err.message || 'Failed to load model');
        setLoading(false);
        
        if (onError) {
          onError(err);
        }
      }
    );

    // Animation loop
    const animate = () => {
      frameId.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const newWidth = mountRef.current?.clientWidth || width;
      const newHeight = mountRef.current?.clientHeight || height;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
      
      window.removeEventListener('resize', handleResize);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
      controls.dispose();
      
      // Dispose of geometries and materials
      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, [modelPath, width, height, backgroundColor, onLoad, onError]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={mountRef} 
        className="w-full h-full"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-sm text-gray-600">Loading table model...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center p-4">
            <p className="text-red-600 font-semibold">Error loading model</p>
            <p className="text-sm text-gray-600 mt-1">{error}</p>
            <p className="text-xs text-gray-500 mt-2">Make sure the model file exists at: {modelPath}</p>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 text-xs text-gray-600 bg-white bg-opacity-75 p-2 rounded">
        <p>Use mouse to rotate, scroll to zoom</p>
      </div>
    </div>
  );
};

export default Table;