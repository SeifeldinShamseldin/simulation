// src/components/Environment/Environment.jsx
import React, { useState, useEffect } from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';
import DeleteManager from './DeleteManager/DeleteManager';
import SpawnedObjects from './SpawnedObjects/SpawnedObjects';
import AddEnvironment from './AddEnvironment/AddEnvironment';
import Grid from './Grid/Grid';
import EventBus from '../../utils/EventBus';
import humanManager from './Human/HumanController';

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  // Shared state that multiple components need
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState({ items: [], callback: null });
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Restore spawned objects on mount
  useEffect(() => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup?.();
    if (!sceneSetup) return;
    
    // Restore environment objects
    const environmentObjects = Array.from(sceneSetup.environmentObjects || new Map());
    const restoredObjects = environmentObjects.map(([id, obj]) => ({
      instanceId: id,
      objectId: id,
      name: obj.userData?.name || 'Unknown Object',
      category: obj.userData?.category || 'uncategorized',
      path: obj.userData?.path || obj.userData?.modelPath || '',
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z
      },
      rotation: {
        x: obj.rotation.x,
        y: obj.rotation.y,
        z: obj.rotation.z
      },
      scale: {
        x: obj.scale.x,
        y: obj.scale.y,
        z: obj.scale.z
      }
    }));
    
    // Restore human objects
    const allHumans = humanManager.getAllHumans();
    const restoredHumans = allHumans.map(human => ({
      id: human.id,
      name: 'Soldier',
      isActive: human.movementEnabled
    }));
    
    // Add human entries to loaded objects
    const humanObjects = allHumans.map(human => ({
      instanceId: human.id,
      objectId: human.id,
      name: 'Soldier',
      category: 'human',
      path: '/hazard/human/Soldier.glb'
    }));
    
    setLoadedObjects([...restoredObjects, ...humanObjects]);
    setSpawnedHumans(restoredHumans);
    
    // Find active human
    const activeHuman = allHumans.find(h => h.movementEnabled);
    if (activeHuman) {
      setSelectedHuman(activeHuman.id);
    }
  }, [viewerRef]);
  
  useEffect(() => {
    // Listen for world fully loaded event
    const handleWorldFullyLoaded = (data) => {
      if (data.environment && data.environment.length > 0) {
        const newLoadedObjects = data.environment.map(obj => {
          const name = obj.path.split('/').pop().replace(/\.[^/.]+$/, '');
          return {
            instanceId: obj.id,
            objectId: obj.id,
            name: name,
            path: obj.path,
            category: obj.category,
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale
          };
        });
        setLoadedObjects(newLoadedObjects);
      }
    };
    
    const unsubscribe = EventBus.on('world:fully-loaded', handleWorldFullyLoaded);
    
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section className="controls-section-wrapper" style={{ flex: 1, overflow: 'hidden' }}>
        <EnvironmentManager 
          viewerRef={viewerRef}
          isPanel={isPanel}
          onClose={onClose}
          categories={categories}
          setCategories={setCategories}
          loadedObjects={loadedObjects}
          setLoadedObjects={setLoadedObjects}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          currentView={currentView}
          setCurrentView={setCurrentView}
          setShowAddModal={setShowAddModal}
          setShowDeleteConfirm={setShowDeleteConfirm}
          setDeleteConfirmData={setDeleteConfirmData}
          spawnedHumans={spawnedHumans}
          setSpawnedHumans={setSpawnedHumans}
          selectedHuman={selectedHuman}
          setSelectedHuman={setSelectedHuman}
          successMessage={successMessage}
          setSuccessMessage={setSuccessMessage}
        />
      </section>
      
      {/* Modals */}
      <AddEnvironment
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(result) => {
          setShowAddModal(false);
          // Trigger refresh in EnvironmentManager
        }}
        existingCategories={categories}
      />
      
      <DeleteManager
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        deleteConfirmData={deleteConfirmData}
        setDeleteConfirmData={setDeleteConfirmData}
        categories={categories}
        setCategories={setCategories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        setCurrentView={setCurrentView}
      />
    </div>
  );
};

export default Environment;