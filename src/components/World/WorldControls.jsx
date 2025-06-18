// src/components/WorldControls.jsx - EXAMPLE WORLD CONTROL COMPONENT
import React from 'react';
import { useWorld } from '../contexts/hooks/useWorld';

/**
 * Example component showing how to use the World context
 * Uses only the controlTheme CSS classes
 */
const WorldControls = () => {
  const world = useWorld();
  
  // Don't render if world is not ready
  if (!world.isReady) {
    return (
      <div className="controls-alert controls-alert-info">
        <div className="controls-spinner-border controls-spinner-border-sm controls-mr-2" />
        Initializing world...
      </div>
    );
  }
  
  return (
    <div className="controls-panel controls-p-3">
      <h5 className="controls-mb-3">World Settings</h5>
      
      {/* Grid Controls */}
      <div className="controls-form-group">
        <label className="controls-form-label">Grid</label>
        <div className="controls-btn-group controls-mb-2">
          <button
            className={`controls-btn ${world.showGrid ? 'controls-btn-primary' : 'controls-btn-secondary'}`}
            onClick={() => world.toggleGrid()}
          >
            {world.showGrid ? 'Hide Grid' : 'Show Grid'}
          </button>
        </div>
        
        {world.showGrid && (
          <div className="controls-ml-3">
            <div className="controls-form-group">
              <label className="controls-form-label controls-form-label-sm">Size</label>
              <input
                type="range"
                className="controls-form-control"
                min="5"
                max="50"
                step="5"
                value={world.gridSize}
                onChange={(e) => world.grid.setSize(Number(e.target.value))}
              />
              <small className="controls-text-muted">{world.gridSize}m</small>
            </div>
            
            <div className="controls-form-group">
              <label className="controls-form-label controls-form-label-sm">Divisions</label>
              <input
                type="range"
                className="controls-form-control"
                min="10"
                max="50"
                step="5"
                value={world.gridDivisions}
                onChange={(e) => world.grid.setDivisions(Number(e.target.value))}
              />
              <small className="controls-text-muted">{world.gridDivisions}</small>
            </div>
          </div>
        )}
      </div>
      
      {/* Ground Controls */}
      <div className="controls-form-group">
        <label className="controls-form-label">Ground</label>
        <div className="controls-btn-group controls-mb-2">
          <button
            className={`controls-btn ${world.showGround ? 'controls-btn-primary' : 'controls-btn-secondary'}`}
            onClick={() => world.toggleGround()}
          >
            {world.showGround ? 'Hide Ground' : 'Show Ground'}
          </button>
        </div>
        
        {world.showGround && (
          <div className="controls-ml-3">
            <div className="controls-form-group">
              <label className="controls-form-label controls-form-label-sm">Opacity</label>
              <input
                type="range"
                className="controls-form-control"
                min="0"
                max="100"
                step="5"
                value={world.groundOpacity * 100}
                onChange={(e) => world.updateGroundOpacity(Number(e.target.value) / 100)}
              />
              <small className="controls-text-muted">{Math.round(world.groundOpacity * 100)}%</small>
            </div>
            
            <div className="controls-form-group">
              <label className="controls-form-label controls-form-label-sm">Color</label>
              <div className="controls-input-group">
                <input
                  type="color"
                  className="controls-form-control"
                  value={world.groundColor}
                  onChange={(e) => world.updateGroundColor(e.target.value)}
                />
                <span className="controls-form-control-static controls-ml-2">
                  {world.groundColor}
                </span>
              </div>
            </div>
            
            <div className="controls-form-group">
              <label className="controls-form-label controls-form-label-sm">Roughness</label>
              <input
                type="range"
                className="controls-form-control"
                min="0"
                max="100"
                step="5"
                value={world.groundRoughness * 100}
                onChange={(e) => world.ground.setMaterial({ roughness: Number(e.target.value) / 100 })}
              />
              <small className="controls-text-muted">{Math.round(world.groundRoughness * 100)}%</small>
            </div>
          </div>
        )}
      </div>
      
      {/* Themes */}
      <div className="controls-form-group">
        <label className="controls-form-label">Themes</label>
        <div className="controls-btn-group">
          <button
            className="controls-btn controls-btn-sm controls-btn-secondary"
            onClick={() => world.setTheme('light')}
          >
            Light
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-secondary"
            onClick={() => world.setTheme('dark')}
          >
            Dark
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-secondary"
            onClick={() => world.setTheme('industrial')}
          >
            Industrial
          </button>
        </div>
      </div>
      
      {/* Reset */}
      <div className="controls-mt-3">
        <button
          className="controls-btn controls-btn-warning controls-btn-block"
          onClick={() => world.reset()}
        >
          Reset World Settings
        </button>
      </div>
    </div>
  );
};

export default WorldControls;