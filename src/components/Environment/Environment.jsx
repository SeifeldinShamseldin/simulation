// src/components/Environment/Environment.jsx
import React, { useState, useEffect } from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';
import DeleteManager from './DeleteManager/DeleteManager';
import SpawnedObjects from './SpawnedObjects/SpawnedObjects';
import AddEnvironment from './AddEnvironment/AddEnvironment';
import Grid from './Grid/Grid';
import EventBus from '../../utils/EventBus';

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  // Shared state that multiple components need
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState({ items: [], callback: null });
  
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
    <div className="controls">
      <section className="controls-section-wrapper">
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
        />
      </section>

      {Object.keys(loadedObjects).length > 0 && (
        <div style={{ 
          padding: '1rem',
          background: 'rgba(0, 169, 157, 0.1)',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <h4 style={{ 
            fontSize: '1.1rem', 
            marginBottom: '0.75rem',
            color: '#00a99d'
          }}>
            Loaded Objects ({Object.keys(loadedObjects).length})
          </h4>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem' 
          }}>
            {Object.values(loadedObjects).map(obj => (
              <div key={obj.id} style={{
                padding: '0.25rem 0.75rem',
                background: 'white',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '0.875rem'
              }}>
                {obj.name} <span style={{ color: '#666' }}>({obj.category})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <section className="controls-section-wrapper">
        <SpawnedObjects
          viewerRef={viewerRef}
          loadedObjects={loadedObjects}
          setLoadedObjects={setLoadedObjects}
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