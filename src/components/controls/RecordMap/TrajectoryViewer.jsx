// src/components/controls/RecordMap/TrajectoryViewer.jsx - UPDATED FOR FILE SYSTEM ARCHITECTURE
import React, { useState, useEffect, useMemo } from 'react';
import { useTrajectory, useTrajectoryRecording, useTrajectoryPlayback, useTrajectoryManagement } from '../../../contexts/hooks/useTrajectory';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import { useRobotManager } from '../../../contexts/hooks/useRobotManager';
import LiveTrajectoryGraph from './LiveTrajectoryGraph';

/**
 * TrajectoryViewer component - UI for trajectory recording, playback, and management
 * Now uses file system storage instead of in-memory
 */
const TrajectoryViewer = ({ viewerRef }) => {
  const { activeRobotId, isReady, hasJoints, hasValidEndEffector, isUsingTCP } = useRobotControl(viewerRef);
  const { categories, getRobotById } = useRobotManager();
  
  // Use specialized hooks for clean separation
  const {
    isRecording,
    startRecording,
    stopRecording,
    recordingName,
    frameCount,
    canRecord
  } = useTrajectoryRecording(activeRobotId);
  
  const {
    isPlaying,
    playTrajectory,
    stopPlayback,
    progress: playbackProgress,
    currentTrajectory,
    playbackEndEffectorPoint,
    canPlay
  } = useTrajectoryPlayback(activeRobotId);
  
  const {
    trajectories,
    deleteTrajectory,
    hasTrajectories,
    count: trajectoryCount,
    scanTrajectories,
    isScanning
  } = useTrajectoryManagement(activeRobotId);
  
  // Get main hook for error handling
  const {
    error,
    isLoading,
    clearError,
  } = useTrajectory(activeRobotId);

  // ========== UI-ONLY STATE ==========
  const [selectedTrajectory, setSelectedTrajectory] = useState(null);
  const [newTrajectoryName, setNewTrajectoryName] = useState('');
  const [recordInterval, setRecordInterval] = useState(100);
  const [showLiveGraph, setShowLiveGraph] = useState(false);
  const [playbackOptions, setPlaybackOptions] = useState({
    speed: 0.5,
    loop: false
  });
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // ========== UI EFFECTS ==========
  
  // Auto-select first trajectory
  useEffect(() => {
    if (trajectories.length > 0 && !selectedTrajectory) {
      setSelectedTrajectory(trajectories[0]);
    }
  }, [trajectories, selectedTrajectory]);

  // Initial scan when robot changes
  useEffect(() => {
    if (activeRobotId) {
      scanTrajectories();
    }
  }, [activeRobotId, scanTrajectories]);

  // ========== UI EVENT HANDLERS ==========

  const handleStartRecording = () => {
    if (!newTrajectoryName.trim() || !canRecord) {
      alert('Please enter a trajectory name and ensure robot is ready');
      return;
    }

    const success = startRecording(newTrajectoryName, {
      interval: recordInterval
    });

    if (success) {
      setNewTrajectoryName('');
    } else {
      alert('Failed to start recording. Check console for details.');
    }
  };

  const handleStopRecording = async () => {
    const trajectory = await stopRecording();
    if (trajectory) {
      console.log(`[TrajectoryViewer] Recording completed: ${trajectory.frameCount} frames`);
      // Refresh trajectories list after recording
      setTimeout(() => {
        scanTrajectories();
      }, 500);
    }
  };

  const handlePlayTrajectory = (trajectoryInfo) => {
    if (!canPlay) {
      alert('Robot not ready for playback');
      return;
    }

    const success = playTrajectory(trajectoryInfo, {
      ...playbackOptions,
      onComplete: () => {
        console.log(`[TrajectoryViewer] Playback of "${trajectoryInfo.name}" completed`);
      }
    });

    if (success) {
      setSelectedTrajectory(trajectoryInfo);
    } else {
      alert('Failed to start playback. Check console for details.');
    }
  };

  const handleStopPlayback = () => {
    const success = stopPlayback();
    if (!success) {
      console.warn('[TrajectoryViewer] Failed to stop playback');
    }
  };

  const handleDeleteTrajectory = async (trajectoryInfo) => {
    if (!window.confirm(`Delete trajectory "${trajectoryInfo.name}"?`)) return;

    const success = await deleteTrajectory(trajectoryInfo.manufacturer, trajectoryInfo.model, trajectoryInfo.name);
    if (success) {
      if (selectedTrajectory?.id === trajectoryInfo.id) {
        setSelectedTrajectory(null);
      }
      console.log(`[TrajectoryViewer] Deleted trajectory: ${trajectoryInfo.name}`);
    } else {
      alert('Failed to delete trajectory');
    }
  };

  const handleAnalyzeTrajectory = async (trajectoryInfo) => {
    // Since analyzeTrajectory now takes trajectoryInfo directly
    const { analyzeTrajectory } = useTrajectoryManagement(activeRobotId);
    const analysis = await analyzeTrajectory(trajectoryInfo);
    if (analysis) {
      setAnalysisData(analysis);
      setShowAnalysis(true);
    } else {
      alert('Failed to analyze trajectory');
    }
  };

  const handlePlaybackOptionChange = (option, value) => {
    setPlaybackOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  // ========== UI RENDER HELPERS ==========

  const renderRobotStatus = () => (
    <div className="controls-mb-3" style={{
      padding: '0.75rem',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      border: '1px solid #e9ecef'
    }}>
      <h5 className="controls-h6 controls-mb-2">Robot Status</h5>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
        <div><strong>Robot:</strong> {activeRobotId || 'None'}</div>
        <div><strong>Joints:</strong> {hasJoints ? '✓' : '✗'}</div>
        <div><strong>End Effector:</strong> {hasValidEndEffector ? '✓' : '✗'}</div>
        <div><strong>TCP Tool:</strong> {isUsingTCP ? '✓' : '✗'}</div>
      </div>
      {!canRecord && (
        <div className="controls-text-danger controls-small controls-mt-2">
          Robot not ready for trajectory operations
        </div>
      )}
    </div>
  );

  const renderRecordingStatus = () => {
    if (!isRecording) return null;
    return (
      <div className="controls-alert controls-alert-info controls-mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="recording-indicator" style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ff0000',
            animation: 'pulse 1s infinite'
          }}></div>
          <span>Recording "{recordingName}"</span>
          {frameCount > 0 && (
            <small className="controls-text-muted">
              {frameCount} frames
              {hasValidEndEffector ? ' • End effector tracked' : ' • No end effector'}
            </small>
          )}
        </div>
      </div>
    );
  };

  const renderPlaybackStatus = () => {
    if (!isPlaying) return null;
    return (
      <div className="controls-alert controls-alert-success controls-mb-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Playing "{currentTrajectory?.name || selectedTrajectory?.name}"</span>
          <span>{(playbackProgress * 100).toFixed(1)}%</span>
        </div>
        <div className="controls-progress controls-mt-2">
          <div 
            className="controls-progress-bar" 
            style={{ width: `${playbackProgress * 100}%` }}
          />
        </div>
        {playbackEndEffectorPoint && (
          <div className="controls-small controls-text-muted controls-mt-1">
            End Effector: ({playbackEndEffectorPoint.x.toFixed(3)}, {playbackEndEffectorPoint.y.toFixed(3)}, {playbackEndEffectorPoint.z.toFixed(3)})
          </div>
        )}
      </div>
    );
  };

  // ========== MAIN RENDER ==========

  if (!isReady || !activeRobotId) {
    return (
      <div className="urdf-controls-section">
        <h3>Trajectory Recording</h3>
        <p className="controls-text-muted">No robot selected. Please load a robot first.</p>
      </div>
    );
  }

  return (
    <div className="urdf-controls-section">
      <h3>Trajectory Recording - {activeRobotId}</h3>

      {/* Error Display */}
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
          <button 
            className="controls-btn controls-btn-sm controls-btn-outline-danger controls-mt-2"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Robot Status */}
      {renderRobotStatus()}

      {/* Recording Status */}
      {renderRecordingStatus()}

      {/* Playback Status */}
      {renderPlaybackStatus()}

      {/* Recording Controls */}
      <div className="trajectory-recording controls-mb-4">
        <h4>Record New Trajectory</h4>
        
        <div className="controls-form-group">
          <label className="controls-form-label">Trajectory Name:</label>
          <input
            type="text"
            className="controls-form-control"
            placeholder="Enter trajectory name"
            value={newTrajectoryName}
            onChange={(e) => setNewTrajectoryName(e.target.value)}
            disabled={isRecording || isPlaying}
          />
        </div>

        <div className="controls-form-group">
          <label className="controls-form-label">
            Recording Interval (ms):
            <input
              type="number"
              className="controls-form-control"
              min="10"
              max="1000"
              step="10"
              value={recordInterval}
              onChange={(e) => setRecordInterval(parseInt(e.target.value, 10))}
              disabled={isRecording || isPlaying}
              style={{ width: '100px', marginLeft: '0.5rem' }}
            />
          </label>
        </div>

        <div className="controls-btn-group">
          {!isRecording ? (
            <button 
              className="controls-btn controls-btn-success"
              onClick={handleStartRecording}
              disabled={!canRecord || !newTrajectoryName.trim() || isPlaying}
            >
              🔴 Start Recording
            </button>
          ) : (
            <button 
              className="controls-btn controls-btn-danger"
              onClick={handleStopRecording}
            >
              ⏹️ Stop Recording
            </button>
          )}
        </div>
      </div>

      {/* Playback Options */}
      <div className="controls-mb-4">
        <h4>Playback Options</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <label>
            Speed:
            <input
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              value={playbackOptions.speed}
              onChange={(e) => handlePlaybackOptionChange('speed', parseFloat(e.target.value))}
              disabled={isRecording || isPlaying}
              style={{ width: '80px', marginLeft: '0.5rem' }}
            />
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={playbackOptions.loop}
              onChange={(e) => handlePlaybackOptionChange('loop', e.target.checked)}
              disabled={isRecording || isPlaying}
            />
            Loop
          </label>
        </div>
      </div>

      {/* 3D Visualization */}
      <div className="controls-mb-4">
        <button 
          className="controls-btn controls-btn-info controls-btn-block"
          onClick={() => setShowLiveGraph(true)}
          style={{ fontSize: '1rem', fontWeight: '500' }}
        >
          📊 View 3D Trajectory Graph
        </button>

        {showLiveGraph && (
          <LiveTrajectoryGraph 
            isOpen={showLiveGraph}
            onClose={() => setShowLiveGraph(false)}
            activeRobotId={activeRobotId}
          />
        )}
      </div>

      {/* Trajectory List */}
      <div className="trajectory-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>Saved Trajectories ({trajectoryCount})</h4>
          <button
            className="controls-btn controls-btn-sm controls-btn-secondary"
            onClick={scanTrajectories}
            disabled={isScanning || isLoading}
            title="Refresh trajectory list"
          >
            🔄 Refresh
          </button>
        </div>
        
        {isScanning || isLoading ? (
          <div className="controls-text-center controls-p-3">
            <div className="controls-spinner-border controls-spinner-border-sm" role="status">
              <span className="controls-sr-only">Loading...</span>
            </div>
            <p className="controls-text-muted controls-mt-2">Loading trajectories...</p>
          </div>
        ) : !hasTrajectories ? (
          <div className="controls-text-muted controls-text-center controls-p-3">
            No trajectories recorded for {activeRobotId}
          </div>
        ) : (
          <div className="controls-list">
            {trajectories.map(trajectory => (
              <div key={trajectory.id} className="controls-list-item">
                <div className="controls-list-item-content">
                  <h6 
                    className="controls-list-item-title"
                    style={{ 
                      cursor: 'pointer',
                      color: selectedTrajectory?.id === trajectory.id ? '#007bff' : 'inherit'
                    }}
                    onClick={() => setSelectedTrajectory(trajectory)}
                  >
                    {trajectory.name}
                    {selectedTrajectory?.id === trajectory.id && (
                      <span className="controls-badge controls-badge-primary controls-ml-2">
                        Selected
                      </span>
                    )}
                  </h6>
                  
                  <div className="controls-text-muted controls-small">
                    {trajectory.frameCount || 0} frames • {(trajectory.duration / 1000).toFixed(1)}s
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
                      disabled={!canPlay || isRecording || isPlaying}
                      title="Play trajectory"
                    >
                      ▶️
                    </button>
                    
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-info"
                      onClick={() => handleAnalyzeTrajectory(trajectory)}
                      disabled={isRecording || isPlaying}
                      title="Analyze trajectory"
                    >
                      📊
                    </button>
                    
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-danger"
                      onClick={() => handleDeleteTrajectory(trajectory)}
                      disabled={isRecording || isPlaying || isLoading}
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
      {isPlaying && (
        <div className="controls-mt-4" style={{
          padding: '1rem',
          backgroundColor: '#e8f5e8',
          borderRadius: '4px',
          border: '1px solid #28a745'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Playing:</strong> {currentTrajectory?.name || selectedTrajectory?.name}
            </div>
            <button 
              className="controls-btn controls-btn-sm controls-btn-warning"
              onClick={handleStopPlayback}
            >
              ⏹️ Stop Playback
            </button>
          </div>
          
          <div className="controls-mt-2">
            <div><strong>Progress:</strong> {(playbackProgress * 100).toFixed(1)}%</div>
            
            {playbackEndEffectorPoint && (
              <div className="controls-small controls-text-muted">
                End Effector: ({playbackEndEffectorPoint.x.toFixed(3)}, {playbackEndEffectorPoint.y.toFixed(3)}, {playbackEndEffectorPoint.z.toFixed(3)})
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      {showAnalysis && analysisData && (
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '800px' }}>
            <div className="controls-modal-header">
              <h3>Trajectory Analysis: {analysisData.name}</h3>
              <button 
                className="controls-close"
                onClick={() => setShowAnalysis(false)}
              >
                ×
              </button>
            </div>
            
            <div className="controls-modal-body">
              <div className="controls-grid controls-grid-cols-2 controls-gap-4">
                <div>
                  <h5>Basic Info</h5>
                  <p><strong>Frames:</strong> {analysisData.frameCount}</p>
                  <p><strong>Duration:</strong> {(analysisData.duration / 1000).toFixed(1)}s</p>
                  <p><strong>Robot:</strong> {analysisData.robotId}</p>
                </div>
                
                {analysisData.endEffectorStats && (
                  <div>
                    <h5>End Effector</h5>
                    <p><strong>Distance:</strong> {analysisData.endEffectorStats.totalDistance.toFixed(3)}m</p>
                    <p><strong>Max Velocity:</strong> {analysisData.endEffectorStats.maxVelocity.toFixed(3)}m/s</p>
                    <p><strong>Avg Velocity:</strong> {analysisData.endEffectorStats.averageVelocity.toFixed(3)}m/s</p>
                  </div>
                )}
              </div>
              
              {analysisData.jointStats && Object.keys(analysisData.jointStats).length > 0 && (
                <div className="controls-mt-4">
                  <h5>Joint Statistics</h5>
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

      {/* Loading Overlay */}
      {isLoading && (
        <div className="controls-loading-overlay">
          <div className="controls-spinner-border" role="status">
            <span className="controls-sr-only">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryViewer;