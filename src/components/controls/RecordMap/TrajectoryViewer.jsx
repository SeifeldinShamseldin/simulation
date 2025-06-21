// src/components/controls/RecordMap/TrajectoryViewer.jsx
// Refactored to only import from useTrajectory hook

import React, { useState, useEffect } from 'react';
import useTrajectory from '../../../contexts/hooks/useTrajectory';

/**
 * TrajectoryViewer component - UI for trajectory recording, playback, and management
 * Now only imports from useTrajectory hook for cleaner architecture
 */
const TrajectoryViewer = ({ viewerRef }) => {
  // Get all trajectory functionality from single hook
  const trajectory = useTrajectory();
  
  // Destructure what we need
  const {
    robotId,
    isReady,
    hasJoints,
    recording,
    playback,
    management,
    tcp,
    status,
    error,
    clearError
  } = trajectory;
  
  // Local UI state
  const [userRecordingName, setUserRecordingName] = useState('');
  const [selectedTrajectory, setSelectedTrajectory] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [playbackOptions, setPlaybackOptions] = useState({
    speed: 1.0,
    interpolation: 'linear',
    enableDynamics: true,
    maxVelocity: 2.0,
    maxAcceleration: 5.0,
    maxJerk: 10.0
  });
  
  // Initialize trajectory scanning
  useEffect(() => {
    if (isReady) {
      management.scanTrajectories();
    }
  }, [isReady]);
  
  // Handle recording start
  const handleStartRecording = () => {
    const name = userRecordingName.trim() || `trajectory_${Date.now()}`;
    recording.startRecording(name);
  };
  
  // Handle recording stop
  const handleStopRecording = async () => {
    await recording.stopRecording();
    setUserRecordingName('');
  };
  
  // Handle trajectory play
  const handlePlayTrajectory = async (traj) => {
    setSelectedTrajectory(traj);
    await playback.playTrajectory(traj, playbackOptions);
  };
  
  // Handle trajectory delete
  const handleDeleteTrajectory = async (traj) => {
    if (window.confirm(`Are you sure you want to delete "${traj.name}"?`)) {
      await management.deleteTrajectory(traj);
      setSelectedTrajectory(null);
    }
  };
  
  // Handle trajectory analysis
  const handleAnalyzeTrajectory = async (traj) => {
    const analysis = await management.analyzeTrajectory(traj);
    if (analysis) {
      setAnalysisData(analysis);
      setShowAnalysis(true);
    }
  };
  
  // Handle playback option changes
  const handlePlaybackOptionChange = (option, value) => {
    setPlaybackOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };
  
  // If not ready
  if (!robotId || !isReady || !hasJoints) {
    return (
      <div className="controls-section-wrapper controls-p-3">
        <p className="controls-text-muted controls-text-center">
          {!robotId ? 'No robot selected' :
           !isReady ? 'Loading robot...' :
           !hasJoints ? 'Robot has no joints' :
           'Not ready'}
        </p>
      </div>
    );
  }
  
  return (
    <div className="controls-section-wrapper">
      <h3>Trajectory Control</h3>
      
      {/* Status Display */}
      {(recording.isRecording || playback.isPlaying) && (
        <div className={`controls-alert ${recording.isRecording ? 'controls-alert-danger' : 'controls-alert-info'} controls-mb-3`}>
          <strong>{status.message}</strong>
          {tcp.isUsingTCP && <span className="controls-ml-2">(TCP Active)</span>}
        </div>
      )}
      
      {/* Recording Section */}
      <div className="controls-mb-4">
        <h4>Recording</h4>
        <div className="controls-form-group">
          <input
            type="text"
            className="controls-form-control controls-mb-2"
            placeholder="Enter trajectory name..."
            value={userRecordingName}
            onChange={(e) => setUserRecordingName(e.target.value)}
            disabled={recording.isRecording || !recording.canRecord}
          />
          
          {!recording.isRecording ? (
            <button
              className="controls-btn controls-btn-primary controls-btn-block"
              onClick={handleStartRecording}
              disabled={!recording.canRecord}
            >
              🔴 Start Recording
            </button>
          ) : (
            <div>
              <button
                className="controls-btn controls-btn-danger controls-btn-block"
                onClick={handleStopRecording}
                disabled={false}
              >
                ⏹️ Stop Recording ({recording.frameCount} frames)
              </button>
              <div className="controls-progress controls-mt-2">
                <div 
                  className="controls-progress-bar controls-progress-bar-animated controls-progress-bar-striped controls-bg-danger"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Playback Options */}
      <div className="controls-mb-4">
        <h4>Playback Options</h4>
        <div className="controls-row">
          <div className="controls-col-6">
            <label className="controls-small">
              Speed: {playbackOptions.speed.toFixed(1)}x
              <input
                type="range"
                className="controls-form-range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={playbackOptions.speed}
                onChange={(e) => handlePlaybackOptionChange('speed', parseFloat(e.target.value))}
                disabled={recording.isRecording || playback.isPlaying}
              />
            </label>
          </div>
          
          <div className="controls-col-6">
            <label className="controls-small">
              Interpolation:
              <select
                className="controls-form-select controls-form-select-sm"
                value={playbackOptions.interpolation}
                onChange={(e) => handlePlaybackOptionChange('interpolation', e.target.value)}
                disabled={recording.isRecording || playback.isPlaying}
              >
                <option value="linear">Linear</option>
                <option value="cubic">Cubic</option>
                <option value="quintic">Quintic</option>
              </select>
            </label>
          </div>
        </div>
        
        <div className="controls-form-check controls-mt-2">
          <input
            type="checkbox"
            className="controls-form-check-input"
            id="enableDynamics"
            checked={playbackOptions.enableDynamics}
            onChange={(e) => handlePlaybackOptionChange('enableDynamics', e.target.checked)}
            disabled={recording.isRecording || playback.isPlaying}
          />
          <label className="controls-form-check-label controls-small" htmlFor="enableDynamics">
            Enable Dynamic Limits
          </label>
        </div>
        
        {playbackOptions.enableDynamics && (
          <div className="controls-mt-2 controls-small">
            <label>
              Max Velocity: 
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={playbackOptions.maxVelocity}
                onChange={(e) => handlePlaybackOptionChange('maxVelocity', parseFloat(e.target.value))}
                disabled={recording.isRecording || playback.isPlaying}
                style={{ width: '80px', marginLeft: '0.5rem' }}
              />
            </label>
            
            <label className="controls-ml-3">
              Max Acceleration:
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={playbackOptions.maxAcceleration}
                onChange={(e) => handlePlaybackOptionChange('maxAcceleration', parseFloat(e.target.value))}
                disabled={recording.isRecording || playback.isPlaying}
                style={{ width: '80px', marginLeft: '0.5rem' }}
              />
            </label>
            
            <label className="controls-ml-3">
              Max Jerk:
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={playbackOptions.maxJerk}
                onChange={(e) => handlePlaybackOptionChange('maxJerk', parseFloat(e.target.value))}
                disabled={recording.isRecording || playback.isPlaying}
                style={{ width: '80px', marginLeft: '0.5rem' }}
              />
            </label>
          </div>
        )}
      </div>
      
      {/* Trajectory List */}
      <div className="trajectory-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>Saved Trajectories ({management.count})</h4>
          <button
            className="controls-btn controls-btn-sm controls-btn-secondary"
            onClick={management.scanTrajectories}
            disabled={false}
            title="Refresh trajectory list"
          >
            🔄 Refresh
          </button>
        </div>
        
        {management.trajectories.length === 0 ? (
          <div className="controls-text-muted controls-text-center controls-p-3">
            No trajectories recorded for {robotId}
          </div>
        ) : (
          <div className="controls-list">
            {management.trajectories.map(trajectory => (
              <div key={`${trajectory.manufacturer}_${trajectory.model}_${trajectory.name}`} className="controls-list-item">
                <div className="controls-list-item-content">
                  <h6 
                    className="controls-list-item-title"
                    style={{ 
                      cursor: 'pointer',
                      color: selectedTrajectory?.name === trajectory.name ? '#007bff' : 'inherit'
                    }}
                    onClick={() => setSelectedTrajectory(trajectory)}
                  >
                    {trajectory.name}
                    {selectedTrajectory?.name === trajectory.name && (
                      <span className="controls-badge controls-badge-primary controls-ml-2">
                        Selected
                      </span>
                    )}
                  </h6>
                  
                  <div className="controls-text-muted controls-small">
                    {(trajectory.frames ? trajectory.frames.length : trajectory.frameCount || 0)} frames • 
                    {trajectory.duration ? ` ${(trajectory.duration / 1000).toFixed(1)}s` : ''} 
                    {trajectory.recordedAt && (
                      <span> • {new Date(trajectory.recordedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                
                <div className="controls-list-item-actions">
                  <div className="controls-btn-group controls-btn-group-sm">
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-success"
                      onClick={() => handlePlayTrajectory(trajectory)}
                      disabled={!playback.canPlay}
                      title="Play trajectory"
                    >
                      ▶️
                    </button>
                    
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-info"
                      onClick={() => handleAnalyzeTrajectory(trajectory)}
                      disabled={false}
                      title="Analyze trajectory"
                    >
                      📊
                    </button>
                    
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-danger"
                      onClick={() => handleDeleteTrajectory(trajectory)}
                      disabled={playback.isPlaying}
                      title="Delete trajectory"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Active Playback Controls */}
      {playback.isPlaying && (
        <div className="controls-mt-4" style={{
          position: 'sticky',
          bottom: 0,
          background: '#fff',
          padding: '1rem',
          borderTop: '1px solid #dee2e6',
          boxShadow: '0 -2px 4px rgba(0,0,0,0.1)'
        }}>
          <div className="controls-d-flex controls-align-items-center">
            <button
              className="controls-btn controls-btn-danger controls-btn-sm"
              onClick={playback.stopPlayback}
            >
              ⏹️ Stop
            </button>
            
            <div className="controls-progress controls-flex-grow-1 controls-mx-3" style={{ height: '20px' }}>
              <div 
                className="controls-progress-bar controls-bg-success"
                style={{ width: `${playback.progress * 100}%` }}
              >
                {Math.round(playback.progress * 100)}%
              </div>
            </div>
            
            <span className="controls-text-muted controls-small">
              Playing: {playback.currentTrajectory?.name}
            </span>
          </div>
        </div>
      )}
      
      {/* Analysis Modal */}
      {showAnalysis && analysisData && (
        <div className="controls-modal-backdrop" onClick={() => setShowAnalysis(false)}>
          <div className="controls-modal" onClick={(e) => e.stopPropagation()}>
            <div className="controls-modal-header">
              <h5 className="controls-modal-title">Trajectory Analysis</h5>
              <button
                className="controls-btn-close"
                onClick={() => setShowAnalysis(false)}
              >
                ×
              </button>
            </div>
            
            <div className="controls-modal-body">
              <div className="controls-row">
                <div className="controls-col-6">
                  <h6>General Info</h6>
                  <p><strong>Name:</strong> {analysisData.name}</p>
                  <p><strong>Frames:</strong> {analysisData.frameCount}</p>
                  <p><strong>Duration:</strong> {(analysisData.duration / 1000).toFixed(1)}s</p>
                  <p><strong>Robot:</strong> {analysisData.robotId}</p>
                </div>
                
                {analysisData.endEffectorStats && (
                  <div className="controls-col-6">
                    <h6>End Effector</h6>
                    <p><strong>Distance:</strong> {analysisData.endEffectorStats.totalDistance.toFixed(3)}m</p>
                    <p><strong>Max Velocity:</strong> {analysisData.endEffectorStats.maxVelocity.toFixed(3)}m/s</p>
                    <p><strong>Avg Velocity:</strong> {analysisData.endEffectorStats.averageVelocity.toFixed(3)}m/s</p>
                  </div>
                )}
              </div>
              
              {analysisData.jointStats && Object.keys(analysisData.jointStats).length > 0 && (
                <div className="controls-mt-4">
                  <h6>Joint Statistics</h6>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {Object.entries(analysisData.jointStats).map(([jointName, stats]) => (
                      <div key={jointName} className="controls-mb-2">
                        <strong>{jointName}:</strong> 
                        <span className="controls-ml-2">
                          Range: {stats.range.toFixed(3)} rad • 
                          Final: {stats.final.toFixed(3)} rad
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryViewer;