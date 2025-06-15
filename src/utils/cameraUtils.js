import EventBus from './EventBus';
import * as THREE from 'three';

/**
 * Creates a camera controller that can be used across different contexts
 * @param {Object} sceneSetup - The scene setup object containing camera and controls
 * @returns {Object} Camera control methods
 */
export const createCameraController = (sceneSetup) => {
  if (!sceneSetup) {
    console.warn('[cameraUtils] Scene setup not provided');
    return null;
  }

  const setCameraPosition = (position) => {
    if (!sceneSetup.camera) return;
    sceneSetup.camera.position.set(position.x, position.y, position.z);
    if (sceneSetup.controls) {
      sceneSetup.controls.update();
    }
    EventBus.emit('camera:moved', { position });
  };

  const setCameraTarget = (target) => {
    if (!sceneSetup.controls) return;
    sceneSetup.controls.target.set(target.x, target.y, target.z);
    sceneSetup.controls.update();
    EventBus.emit('camera:target-changed', { target });
  };

  const focusOnObject = (object, paddingMultiplier = 1.0) => {
    if (!sceneSetup || !object) return;
    
    // Create a bounding box
    const bbox = new THREE.Box3();
    bbox.makeEmpty();
    
    // Only include visual elements in the bounding box
    object.traverse(c => {
      if (c.isURDFVisual && c.children.length > 0) {
        bbox.expandByObject(c);
      }
    });
    
    // Check if bounding box is valid
    const size = bbox.getSize(new THREE.Vector3());
    if (size.length() < 0.001) {
      console.warn('[cameraUtils] Object has no visible geometry');
      return;
    }
    
    const center = bbox.getCenter(new THREE.Vector3());
    
    // Set controls target to center of object
    sceneSetup.controls.target.copy(center);
    
    // Calculate camera position to frame the object nicely
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = sceneSetup.camera.fov * (Math.PI / 180);
    
    // Calculate camera distance
    let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
    cameraDistance *= paddingMultiplier;
    
    // Use a better camera angle
    const direction = new THREE.Vector3(0.5, 0.3, 1).normalize();
    sceneSetup.camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
    
    // Update controls
    sceneSetup.controls.update();
    
    // Update directional light to match camera position
    const sphere = bbox.getBoundingSphere(new THREE.Sphere());
    const lightDistance = sphere.radius * 2;
    sceneSetup.directionalLight.position.copy(center).add(
      new THREE.Vector3(1, 2, 1).normalize().multiplyScalar(lightDistance)
    );
    sceneSetup.directionalLight.target.position.copy(center);
    
    // Update shadow camera
    if (sceneSetup.enableShadows) {
      const shadowCam = sceneSetup.directionalLight.shadow.camera;
      const shadowSize = sphere.radius * 1.5;
      shadowCam.left = shadowCam.bottom = -shadowSize;
      shadowCam.right = shadowCam.top = shadowSize;
      shadowCam.updateProjectionMatrix();
    }
    
    // Update ground position
    if (sceneSetup.ground) {
      sceneSetup.ground.position.y = bbox.min.y - 0.001;
    }
    
    // Emit event for other components
    EventBus.emit('camera:focused', {
      targetId: object.userData?.id || object.name,
      position: center.toArray(),
      bounds: {
        min: bbox.min.toArray(),
        max: bbox.max.toArray()
      },
      cameraDistance
    });
    
    // Force rendering to update immediately
    sceneSetup.renderer.render(sceneSetup.scene, sceneSetup.camera);
  };

  const resetCamera = () => {
    setCameraPosition({ x: 2, y: 2, z: 2 });
    setCameraTarget({ x: 0, y: 0, z: 0 });
  };

  return {
    setPosition: setCameraPosition,
    setTarget: setCameraTarget,
    focusOn: focusOnObject,
    reset: resetCamera
  };
}; 