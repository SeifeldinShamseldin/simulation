/**
 * Initialize lights
 */
initLights() {
    // Ambient light - increased intensity
    this.ambientLight = new THREE.HemisphereLight(
        0xffffff,              // Sky color (white)
        0x444444,              // Ground color (dark gray)
        0.7                    // Increased intensity
    );
    this.ambientLight.position.set(0, 1, 0);
    this.scene.add(this.ambientLight);
    
    // Main directional light (sun) - increased intensity
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(4, 10, 4);
    
    if (this.enableShadows) {
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.normalBias = 0.001;
        
        // Configure shadow camera
        const shadowCam = this.directionalLight.shadow.camera;
        shadowCam.left = shadowCam.bottom = -5;
        shadowCam.right = shadowCam.top = 5;
        shadowCam.near = 0.5;
        shadowCam.far = 100;
    }
    
    this.scene.add(this.directionalLight);
    
    // Create a target for the directional light
    this.directionalLight.target = new THREE.Object3D();
    this.scene.add(this.directionalLight.target);
    
    // Add a fill light from the opposite direction
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.fillLight.position.set(-4, 5, -4);
    this.scene.add(this.fillLight);
} 