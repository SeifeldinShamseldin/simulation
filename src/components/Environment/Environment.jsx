// src/components/Environment/Environment.jsx
import React, { useState } from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';
import DeleteManager from './DeleteManager/DeleteManager';
import SpawnedObjects from './SpawnedObjects/SpawnedObjects';
import AddEnvironment from './AddEnvironment/AddEnvironment';
import Grid from './Grid/Grid';

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  // Shared state that multiple components need
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState({ items: [], callback: null });
  
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