// src/components/controls/RecordMap/RecordMap.jsx - Simplified UI Component
import React from 'react';
import { useTrajectoryManagement } from '../../../contexts/hooks/useTrajectory';

/**
 * Simple component showing trajectory status and basic info
 */
const RecordMap = ({ trajectoryName, robotId }) => {
  const {
    trajectories,
    getTrajectory,
    analyzeTrajectory,
    count: trajectoryCount
  } = useTrajectoryManagement(robotId);

  // Get trajectory info if name is provided
  const trajectory = trajectoryName ? getTrajectory(trajectoryName) : null;
  const analysis = trajectoryName ? analyzeTrajectory(trajectoryName) : null;

  return (
    <div className="urdf-controls-section">
      <h3>End Effector Path Visualization</h3>
      
      <div className="record-map">
        {!robotId ? (
          <div className="record-map-empty controls-text-muted">
            No robot selected
          </div>
        ) : !trajectoryName ? (
          <div className="record-map-empty">
            <div className="controls-text-center controls-p-3">
              <div style={{ fontSize: '2rem', marginBottom: '1rem', color: '#6c757d' }}>📊</div>
              <h5>No Trajectory Selected</h5>
              <p className="controls-text-muted">
                {trajectoryCount > 0 
                  ? `${trajectoryCount} trajectories available for ${robotId}`
                  : `No trajectories recorded for ${robotId}`
                }
              </p>
              <p className="controls-small controls-text-muted">
                Select a trajectory to visualize its path
              </p>
            </div>
          </div>
        ) : !trajectory ? (
          <div className="record-map-empty controls-text-warning">
            Trajectory "{trajectoryName}" not found
          </div>
        ) : (
          <div className="trajectory-info">
            <div className="controls-card">
              <div className="controls-card-body">
                <h5 className="controls-h5 controls-mb-3">
                  📊 {trajectoryName}
                </h5>
                
                {/* Basic Trajectory Information */}
                <div className="controls-grid controls-grid-cols-2 controls-gap-3 controls-mb-3">
                  <div>
                    <strong>Robot:</strong>
                    <div className="controls-text-muted">{trajectory.robotId}</div>
                  </div>
                  <div>
                    <strong>Frames:</strong>
                    <div className="controls-text-muted">{trajectory.frameCount || trajectory.frames?.length || 0}</div>
                  </div>
                  <div>
                    <strong>Duration:</strong>
                    <div className="controls-text-muted">{(trajectory.duration / 1000).toFixed(1)}s</div>
                  </div>
                  <div>
                    <strong>Recorded:</strong>
                    <div className="controls-text-muted">
                      {trajectory.recordedAt ? new Date(trajectory.recordedAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* End Effector Path Information */}
                {trajectory.endEffectorPath && trajectory.endEffectorPath.length > 0 && (
                  <div className="controls-mb-3">
                    <strong>End Effector Path:</strong>
                    <div className="controls-text-muted controls-small">
                      {trajectory.endEffectorPath.length} position points tracked
                    </div>
                    
                    {analysis && analysis.endEffectorStats && (
                      <div className="controls-mt-2">
                        <div className="controls-grid controls-grid-cols-3 controls-gap-2 controls-small">
                          <div>
                            <strong>Distance:</strong>
                            <div>{analysis.endEffectorStats.totalDistance.toFixed(3)}m</div>
                          </div>
                          <div>
                            <strong>Max Speed:</strong>
                            <div>{analysis.endEffectorStats.maxVelocity.toFixed(3)}m/s</div>
                          </div>
                          <div>
                            <strong>Avg Speed:</strong>
                            <div>{analysis.endEffectorStats.averageVelocity.toFixed(3)}m/s</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Path Bounds */}
                {analysis && analysis.endEffectorStats && analysis.endEffectorStats.bounds && (
                  <div className="controls-mb-3">
                    <strong>Workspace Bounds:</strong>
                    <div className="controls-small controls-text-muted controls-mt-1">
                      <div>X: [{analysis.endEffectorStats.bounds.min.x.toFixed(3)}, {analysis.endEffectorStats.bounds.max.x.toFixed(3)}]</div>
                      <div>Y: [{analysis.endEffectorStats.bounds.min.y.toFixed(3)}, {analysis.endEffectorStats.bounds.max.y.toFixed(3)}]</div>
                      <div>Z: [{analysis.endEffectorStats.bounds.min.z.toFixed(3)}, {analysis.endEffectorStats.bounds.max.z.toFixed(3)}]</div>
                    </div>
                  </div>
                )}

                {/* Joint Information */}
                {analysis && analysis.jointStats && Object.keys(analysis.jointStats).length > 0 && (
                  <div className="controls-mb-3">
                    <strong>Joint Movement:</strong>
                    <div className="controls-small controls-text-muted controls-mt-1" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {Object.entries(analysis.jointStats).map(([jointName, stats]) => (
                        <div key={jointName} className="controls-d-flex controls-justify-content-between">
                          <span>{jointName}:</span>
                          <span>{stats.range.toFixed(3)} rad</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status Indicators */}
                <div className="controls-d-flex controls-gap-2 controls-mt-3">
                  {trajectory.endEffectorPath && trajectory.endEffectorPath.length > 0 && (
                    <span className="controls-badge controls-badge-success controls-small">
                      Path Tracked
                    </span>
                  )}
                  {trajectory.frames && trajectory.frames.length > 0 && (
                    <span className="controls-badge controls-badge-info controls-small">
                      Joints Recorded
                    </span>
                  )}
                  {analysis && analysis.endEffectorStats.totalDistance > 0 && (
                    <span className="controls-badge controls-badge-secondary controls-small">
                      {analysis.endEffectorStats.totalDistance.toFixed(2)}m Total
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="controls-mt-3 controls-text-center">
              <p className="controls-small controls-text-muted">
                Use the 3D Trajectory Graph to visualize this path in detail
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordMap;