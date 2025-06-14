import React from 'react';
import { useIK } from '../../contexts/IKContext';

export function SceneControls() {
  const { 
    ikEnabled, 
    setIkEnabled,
    availableIKSolvers,
    selectedIKSolver,
    setSelectedIKSolver,
    ikIterations,
    setIkIterations,
    ikTolerance,
    setIkTolerance
  } = useIK();

  return (
    <div className="scene-controls">
      {/* IK Controls Section */}
      <div className="control-section">
        <h3>IK Controls</h3>
        
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={ikEnabled}
              onChange={(e) => setIkEnabled(e.target.checked)}
            />
            Enable IK
          </label>
        </div>

        {ikEnabled && (
          <>
            <div className="control-group">
              <label>IK Solver</label>
              <select
                value={selectedIKSolver}
                onChange={(e) => setSelectedIKSolver(e.target.value)}
              >
                {availableIKSolvers.map(solver => (
                  <option key={solver.name} value={solver.name}>
                    {solver.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Iterations: {ikIterations}</label>
              <input
                type="range"
                min="1"
                max="50"
                value={ikIterations}
                onChange={(e) => setIkIterations(parseInt(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label>Tolerance: {ikTolerance}</label>
              <input
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={ikTolerance}
                onChange={(e) => setIkTolerance(parseFloat(e.target.value))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
} 