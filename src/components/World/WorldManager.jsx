// src/components/World/WorldManager.jsx - FIXED VERSION
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorld, useWorldSave, useWorldLoad, useWorldImportExport } from '../../contexts/hooks/useWorld';

const WorldManager = ({ isOpen, onClose, viewerRef }) => {
  const world = useWorld();
  const { save, saveAs, quickSave, isDirty, setAutoSave } = useWorldSave();
  const { load, worlds } = useWorldLoad(); // worlds is already an array, not a function
  const { export: exportWorld, import: importWorld } = useWorldImportExport();
  
  // ========== UI STATE ==========
  const [activeTab, setActiveTab] = useState('current');
  const [newWorldName, setNewWorldName] = useState('');
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ========== EVENT HANDLERS ==========
  
  const handleSaveAs = () => {
    if (!newWorldName.trim()) {
      alert('Please enter a world name');
      return;
    }
    
    if (world.exists(newWorldName)) {
      if (!window.confirm(`World "${newWorldName}" already exists. Overwrite?`)) {
        return;
      }
    }
    
    saveAs(newWorldName);
    setShowSaveAsDialog(false);
    setNewWorldName('');
  };

  const handleLoadWorld = (worldName) => {
    if (isDirty && !window.confirm('You have unsaved changes. Load anyway?')) {
      return;
    }
    
    load(worldName);
    setActiveTab('current');
  };

  const handleDeleteWorld = (worldName) => {
    if (!window.confirm(`Delete world "${worldName}"? This cannot be undone.`)) {
      return;
    }
    
    world.delete(worldName);
    if (selectedWorld === worldName) {
      setSelectedWorld(null);
    }
  };

  const handleExport = (worldName = null) => {
    exportWorld(worldName);
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const success = await importWorld(e.target.result);
        if (success) {
          setActiveTab('saved');
        }
      } catch (error) {
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleNewWorld = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Create new world anyway?')) {
      return;
    }
    
    world.clear();
    setActiveTab('current');
  };

  // ========== FILTERED WORLDS - FIXED ==========
  const filteredWorlds = worlds.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ========== RENDER HELPERS ==========
  
  const renderCurrentWorld = () => (
    <div className="controls-p-4">
      <div className="controls-mb-4">
        <h4 className="controls-h4 controls-mb-3">
          Current World: {world.currentWorld || 'Untitled'}
          {isDirty && <span className="controls-badge controls-badge-warning controls-ml-2">Unsaved</span>}
        </h4>
        
        <div className="controls-btn-group controls-mb-3">
          <button 
            className="controls-btn controls-btn-primary"
            onClick={quickSave}
            disabled={world.isLoading}
          >
            {isDirty ? '💾 Save' : '✓ Saved'}
          </button>
          
          <button 
            className="controls-btn controls-btn-secondary"
            onClick={() => setShowSaveAsDialog(true)}
          >
            💾 Save As...
          </button>
          
          <button 
            className="controls-btn controls-btn-info"
            onClick={() => handleExport()}
          >
            📤 Export
          </button>
        </div>
        
        <div className="controls-form-group">
          <label className="controls-form-check">
            <input
              type="checkbox"
              className="controls-form-check-input"
              checked={world.autoSaveEnabled}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
            <span className="controls-form-check-label">Enable Auto-Save</span>
          </label>
        </div>
      </div>
      
      {/* World Statistics */}
      <div className="controls-card">
        <div className="controls-card-body">
          <h5 className="controls-h5 controls-mb-3">World Contents</h5>
          
          {(() => {
            try {
              const state = world.capture();
              return (
                <div className="controls-grid controls-grid-cols-2 controls-gap-3">
                  <div>
                    <strong>Robots:</strong>
                    <div className="controls-text-muted">{state.robots?.length || 0}</div>
                  </div>
                  <div>
                    <strong>Objects:</strong>
                    <div className="controls-text-muted">{state.environment?.length || 0}</div>
                  </div>
                  <div>
                    <strong>Humans:</strong>
                    <div className="controls-text-muted">{state.humans?.length || 0}</div>
                  </div>
                  <div>
                    <strong>TCP Tools:</strong>
                    <div className="controls-text-muted">{state.tcpTools?.length || 0}</div>
                  </div>
                  <div>
                    <strong>Trajectories:</strong>
                    <div className="controls-text-muted">
                      {Object.values(state.trajectories || {}).reduce((sum, robotTrajs) => 
                        sum + Object.keys(robotTrajs).length, 0
                      )}
                    </div>
                  </div>
                  <div>
                    <strong>Last Save:</strong>
                    <div className="controls-text-muted">
                      {state.timestamp ? new Date(state.timestamp).toLocaleTimeString() : 'Never'}
                    </div>
                  </div>
                </div>
              );
            } catch (error) {
              console.error('[WorldManager] Error capturing state:', error);
              return (
                <div className="controls-text-muted">
                  Error loading world statistics
                </div>
              );
            }
          })()}
        </div>
      </div>
    </div>
  );

  const renderSavedWorlds = () => (
    <div className="controls-p-4">
      <div className="controls-mb-4">
        <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-3">
          <h4 className="controls-h4 controls-mb-0">Saved Worlds ({filteredWorlds.length})</h4>
          
          <div className="controls-btn-group">
            <button 
              className="controls-btn controls-btn-success controls-btn-sm"
              onClick={handleNewWorld}
            >
              + New World
            </button>
            
            <label className="controls-btn controls-btn-info controls-btn-sm controls-mb-0">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
              📥 Import
            </label>
          </div>
        </div>
        
        {/* Search */}
        <div className="controls-form-group">
          <input
            type="text"
            className="controls-form-control"
            placeholder="Search worlds..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {/* World List */}
      <div className="controls-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {filteredWorlds.length === 0 ? (
          <div className="controls-text-center controls-text-muted controls-p-4">
            {searchTerm ? 'No worlds found' : 'No saved worlds'}
          </div>
        ) : (
          filteredWorlds.map(worldInfo => (
            <div 
              key={worldInfo.name}
              className={`controls-list-item ${selectedWorld === worldInfo.name ? 'controls-active' : ''}`}
              onClick={() => setSelectedWorld(worldInfo.name)}
            >
              <div className="controls-list-item-content">
                <h6 className="controls-list-item-title">
                  {worldInfo.name}
                  {world.currentWorld === worldInfo.name && (
                    <span className="controls-badge controls-badge-primary controls-ml-2">Current</span>
                  )}
                </h6>
                <div className="controls-text-muted controls-small">
                  {new Date(worldInfo.timestamp).toLocaleString()}
                </div>
              </div>
              
              <div className="controls-list-item-actions">
                <div className="controls-btn-group controls-btn-group-sm">
                  <button 
                    className="controls-btn controls-btn-sm controls-btn-success"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadWorld(worldInfo.name);
                    }}
                    title="Load world"
                  >
                    📂
                  </button>
                  
                  <button 
                    className="controls-btn controls-btn-sm controls-btn-info"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(worldInfo.name);
                    }}
                    title="Export world"
                  >
                    📤
                  </button>
                  
                  <button 
                    className="controls-btn controls-btn-sm controls-btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWorld(worldInfo.name);
                    }}
                    title="Delete world"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ========== MAIN RENDER ==========
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            World Manager
          </h2>
          <button 
            className="controls-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              color: '#999'
            }}
          >
            ×
          </button>
        </div>
        
        {/* Tabs */}
        <div className="controls-tabs">
          <div className="controls-tab-list" style={{
            display: 'flex',
            borderBottom: '1px solid #dee2e6',
            background: '#f8f9fa'
          }}>
            <button
              className={`controls-tab ${activeTab === 'current' ? 'controls-active' : ''}`}
              onClick={() => setActiveTab('current')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'current' ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'current' ? '2px solid #007bff' : 'none',
                cursor: 'pointer'
              }}
            >
              Current World
            </button>
            
            <button
              className={`controls-tab ${activeTab === 'saved' ? 'controls-active' : ''}`}
              onClick={() => setActiveTab('saved')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeTab === 'saved' ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'saved' ? '2px solid #007bff' : 'none',
                cursor: 'pointer'
              }}
            >
              Saved Worlds
            </button>
          </div>
          
          <div className="controls-tab-content">
            {activeTab === 'current' ? renderCurrentWorld() : renderSavedWorlds()}
          </div>
        </div>
        
        {/* Messages */}
        {world.error && (
          <div className="controls-alert controls-alert-danger controls-m-3">
            {world.error}
            <button 
              className="controls-close"
              onClick={world.clearError}
            >
              ×
            </button>
          </div>
        )}
        
        {world.successMessage && (
          <div className="controls-alert controls-alert-success controls-m-3">
            {world.successMessage}
            <button 
              className="controls-close"
              onClick={world.clearSuccess}
            >
              ×
            </button>
          </div>
        )}
        
        {/* Loading overlay */}
        {world.isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div className="controls-text-center">
              <div className="controls-spinner-border controls-mb-3" role="status">
                <span className="controls-sr-only">Loading...</span>
              </div>
              <div>Loading world...</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Save As Dialog */}
      {showSaveAsDialog && (
        <div className="controls-modal-overlay" style={{ zIndex: 1001 }}>
          <div className="controls-modal" style={{ maxWidth: '400px' }}>
            <div className="controls-modal-header">
              <h3>Save World As</h3>
              <button 
                className="controls-close"
                onClick={() => setShowSaveAsDialog(false)}
              >
                ×
              </button>
            </div>
            
            <div className="controls-modal-body">
              <div className="controls-form-group">
                <label>World Name:</label>
                <input
                  type="text"
                  className="controls-form-control"
                  value={newWorldName}
                  onChange={(e) => setNewWorldName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleSaveAs();
                  }}
                  autoFocus
                />
              </div>
            </div>
            
            <div className="controls-modal-footer">
              <button 
                className="controls-btn controls-btn-secondary"
                onClick={() => setShowSaveAsDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="controls-btn controls-btn-primary"
                onClick={handleSaveAs}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default WorldManager;