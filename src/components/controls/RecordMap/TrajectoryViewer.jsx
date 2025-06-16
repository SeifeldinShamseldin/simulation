// src/components/controls/RecordMap/TrajectoryViewer.jsx - UPDATED FOR NEW ARCHITECTURE
import React, { useState, useEffect, useMemo } from 'react';
import { useTrajectory, useTrajectoryRecording, useTrajectoryPlayback, useTrajectoryManagement } from '../../../contexts/hooks/useTrajectory';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import { useRobotManager } from '../../../contexts/hooks/useRobotManager';
import LiveTrajectoryGraph from './LiveTrajectoryGraph';

/**
 * TrajectoryViewer component - UI for trajectory recording, playback, and management
 * Now simplified since TrajectoryContext handles data collection directly
 */
const TrajectoryViewer = ({ viewerRef }) => {
  const { activeRobotId, isReady, hasJoints, hasValidEndEffector, isUsingTCP } = useRobotControl(viewerRef);
  const { categories, getRobotById } = useRobotManager();
  
  // Use specialized hooks for clean separation
  const {
    isRecording,
    startRecording,
    stopRecording,
    lastRecordedFrame,
    recordingState,
    canRecord
  } = useTrajectoryRecording(activeRobotId);
  
  const {
    isPlaying,
    playbackStatus,
    playTrajectory,
    stopPlayback,
    progress: playbackProgress,
    currentPosition: playbackPosition,
    canPlay
  } = useTrajectoryPlayback(activeRobotId);
  
  const {
    trajectories,
    deleteTrajectory,
    hasTrajectories,
    count: trajectoryCount,
    analyzeTrajectory,
    scanTrajectories,
    isScanning
  } = useTrajectoryManagement(activeRobotId);
  
  // Get main hook for error handling and file system operations
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
    speed: 1.0,
    loop: false
  });
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // ========== UI EFFECTS ==========
  
  // Auto-select first trajectory from available (file-based) trajectories
  useEffect(() => {
    if (trajectories.length > 0 && !selectedTrajectory) {
      setSelectedTrajectory(trajectories[0]);
    } else if (trajectories.length === 0) {
      setSelectedTrajectory(null);
    }
  }, [trajectories, selectedTrajectory]);

  // Initial scan of file system trajectories on mount and when robot changes
  useEffect(() => {
    if (activeRobotId) {
      scanTrajectories();
    }
  }, [activeRobotId, scanTrajectories]);

  // The robotTrajectories memo is no longer strictly needed here,
  // as `useTrajectoryManagement`'s `trajectories` already filters by robot.
  // However, keeping it for clarity if filtering logic ever changes.
  const robotTrajectories = useMemo(() => {
    return trajectories;
  }, [trajectories]);

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
      setSelectedTrajectory(trajectory);
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
          <span>Recording "{recordingState.trajectoryName}"</span>
          {recordingState.frameCount > 0 && (
            <small className="controls-text-muted">
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="playback-indicator" style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#28a745',
            animation: 'pulse 1s infinite'
          }}></div>
          <span>Playing "{selectedTrajectory?.name}"</span>
          <small className="controls-text-muted">
            {Math.round(playbackProgress * 100)}% complete
          </small>
        </div>
      </div>
    );
  };

  const renderTrajectoryList = () => (
    <div className="controls-mb-3">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h5 className="controls-h6 controls-mb-0">Saved Trajectory Files ({trajectoryCount})</h5>
        <button
          className="controls-btn controls-btn-sm controls-btn-outline-secondary"
          onClick={scanTrajectories}
          disabled={isScanning || isLoading}
          title="Refresh"
        >
          🔄
        </button>
      </div>
      
      {isScanning || isLoading ? (
        <p className="controls-text-muted">Loading trajectories...</p>
      ) : robotTrajectories.length === 0 ? (
        <p className="controls-text-muted">No saved trajectories for this robot</p>
      ) : (
        <div className="controls-list-group">
          {robotTrajectories.map((traj) => (
            <div
              key={traj.id}
              className={`controls-list-group-item ${selectedTrajectory?.id === traj.id ? 'active' : ''}`}
              onClick={() => setSelectedTrajectory(traj)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <div>{traj.name}</div>
                <small className="controls-text-muted">
                  {traj.frameCount} frames • {(traj.duration / 1000).toFixed(1)}s
                  {traj.recordedAt && ` • ${new Date(traj.recordedAt).toLocaleDateString()}`}
                </small>
              </div>
              <div className="controls-btn-group">
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-primary"
                  onClick={(e) => { e.stopPropagation(); handlePlayTrajectory(traj); }}
                  disabled={isPlaying || isRecording}
                  title="Play"
                >
                  ▶
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-info"
                  onClick={(e) => { e.stopPropagation(); handleAnalyzeTrajectory(traj); }}
                  title="Analyze"
                >
                  📊
                </button>
                <button
                  className="controls-btn controls-btn-sm controls-btn-outline-danger"
                  onClick={(e) => { e.stopPropagation(); handleDeleteTrajectory(traj); }}
                  disabled={isLoading || isPlaying || isRecording}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ========== MAIN RENDER ==========
  if (!activeRobotId) {
    return (
      <div className="controls-p-3">
        <div className="controls-alert controls-alert-warning">
          Please select a robot to use trajectory recording
        </div>
      </div>
    );
  }

  return (
    <div className="controls-p-3">
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
          <button
            type="button"
            className="controls-close"
            onClick={clearError}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}

      {renderRobotStatus()}
      {renderRecordingStatus()}
      {renderPlaybackStatus()}

      {/* Recording Controls */}
      <div className="controls-mb-3">
        <h5 className="controls-h6 controls-mb-2">Recording</h5>
        {!isRecording ? (
          <div className="controls-input-group">
            <input
              type="text"
              className="controls-form-control"
              placeholder="Trajectory name"
              value={newTrajectoryName}
              onChange={(e) => setNewTrajectoryName(e.target.value)}
              disabled={!canRecord || isPlaying}
            />
            <button
              className="controls-btn controls-btn-primary"
              onClick={handleStartRecording}
              disabled={!canRecord || !newTrajectoryName.trim() || isPlaying}
            >
              Start Recording
            </button>
          </div>
        ) : (
          <div className="controls-alert controls-alert-warning">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Recording in progress...</span>
              <button
                className="controls-btn controls-btn-danger"
                onClick={handleStopRecording}
              >
                Stop Recording
              </button>
            </div>
          </div>
        )}
      </div>

      {renderTrajectoryList()}

      {/* Playback Controls (optional, moved from TrajectoryPanel example) */}
      {selectedTrajectory && !isRecording && (
        <div className="controls-mb-3">
          <h5 className="controls-h6 controls-mb-2">Playback Options</h5>
          <div className="controls-input-group controls-mb-2">
            <span className="controls-input-group-text">Speed</span>
            <input
              type="number"
              className="controls-form-control"
              value={playbackOptions.speed}
              onChange={(e) => handlePlaybackOptionChange('speed', parseFloat(e.target.value))}
              step="0.1"
              min="0.1"
              max="5.0"
              disabled={isPlaying}
            />
          </div>
          <div className="controls-form-check">
            <input
              type="checkbox"
              className="controls-form-check-input"
              id="loopPlayback"
              checked={playbackOptions.loop}
              onChange={(e) => handlePlaybackOptionChange('loop', e.target.checked)}
              disabled={isPlaying}
            />
            <label className="controls-form-check-label" htmlFor="loopPlayback">Loop Playback</label>
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      {showAnalysis && analysisData && (
        <div className="controls-modal" style={{ display: 'block' }}>
          <div className="controls-modal-dialog">
            <div className="controls-modal-content">
              <div className="controls-modal-header">
                <h5 className="controls-modal-title">
                  Trajectory Analysis: {analysisData.name}
                </h5>
                <button
                  type="button"
                  className="controls-close"
                  onClick={() => setShowAnalysis(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="controls-modal-body">
                <div className="controls-row">
                  <div className="controls-col-md-4">
                    <h6>General</h6>
                    <p>Frames: {analysisData.frameCount}</p>
                    <p>Duration: {(analysisData.duration / 1000).toFixed(2)}s</p>
                  </div>
                  <div className="controls-col-md-4">
                    <h6>Joint Statistics</h6>
                    {Object.entries(analysisData.jointStats).map(([joint, stats]) => (
                      <div key={joint}>
                        <strong>{joint}:</strong>
                        <span> Range: {stats.range.toFixed(3)}rad</span>
                        <span> ({stats.min.toFixed(3)} to {stats.max.toFixed(3)})</span>
                        {stats.final !== undefined && <span> • Final: {stats.final.toFixed(3)}</span>}
                      </div>
                    ))}
                  </div>
                  {analysisData.endEffectorStats.totalDistance > 0 && (
                    <div className="controls-col-md-4">
                      <h6>End Effector</h6>
                      <p>Total Distance: {analysisData.endEffectorStats.totalDistance.toFixed(3)}m</p>
                      <p>Max Velocity: {analysisData.endEffectorStats.maxVelocity.toFixed(3)}m/s</p>
                      <p>Avg Velocity: {analysisData.endEffectorStats.averageVelocity.toFixed(3)}m/s</p>
                      <p>Bounds X: [{analysisData.endEffectorStats.bounds.min.x.toFixed(3)}, {analysisData.endEffectorStats.bounds.max.x.toFixed(3)}]</p>
                      <p>Bounds Y: [{analysisData.endEffectorStats.bounds.min.y.toFixed(3)}, {analysisData.endEffectorStats.bounds.max.y.toFixed(3)}]</p>
                      <p>Bounds Z: [{analysisData.endEffectorStats.bounds.min.z.toFixed(3)}, {analysisData.endEffectorStats.bounds.max.z.toFixed(3)}]</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryViewer;