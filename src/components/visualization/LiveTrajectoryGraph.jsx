const currentMaterial = new THREE.MeshPhongMaterial({ 
  color: 0xff9900,
  emissive: 0xff9900,
  emissiveIntensity: 0.5
}); 

const unsubscribePlayback = EventBus.on('trajectory:playback-update', (info) => {
  if (info.endEffectorPosition) {
    setCurrentPosition(info.endEffectorPosition);
    updateCurrentMarker(info.endEffectorPosition);
  }
});

return () => {
  unsubscribePlayback();
}; 