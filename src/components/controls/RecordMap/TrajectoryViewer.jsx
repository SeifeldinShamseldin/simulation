// components/controls/RecordMap/TrajectoryViewer.jsx
import React, { useState, useEffect } from 'react';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import RecordMap from './RecordMap';
import './RecordMap.css';

/**
 * Integrated component for trajectory control and visualization
 */
const TrajectoryViewer = ({ viewerRef }) => {
  const [trajectories, setTrajectories] = useState([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selectedTrajectory, setSelectedTrajectory] = useState('');
  const [newTrajectoryName, setNewTrajectoryName] = useState('');
  const [recordInterval, setRecordInterval] = useState(100); // ms
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackOptions, setPlaybackOptions] = useState({
    speed: 1.0,
    loop: false
  });
  
  // Initialize and load trajectories
  useEffect(() => {
    updateTrajectoryList();
    
    // Set up callbacks
    trajectoryAPI.registerPlaybackUpdateCallback((info) => {
      setPlaybackProgress(info.progress * 100);
    });
    
    return () => {
      // Clean up
      if (playing) trajectoryAPI.stopPlayback();
      if (recording) trajectoryAPI.stopRecording();
    };
  }, []);
  
  const updateTrajectoryList = () => {
    setTrajectories(trajectoryAPI.getTrajectoryNames());
  };
  
  const handleStartRecording = () => {
    if (!newTrajectoryName.trim()) return;
    
    // Get robot
    const robot = viewerRef?.current?.getCurrentRobot();
    if (!robot) {
      alert('No robot loaded');
      return;
    }
    
    const success = trajectoryAPI.startRecording(newTrajectoryName, {
      robot,
      interval: recordInterval
    });
    
    if (success) {
      setRecording(true);
      setSelectedTrajectory(newTrajectoryName);
      setNewTrajectoryName('');
    }
  };
  
  const handleStopRecording = () => {
    trajectoryAPI.stopRecording();
    setRecording(false);
    updateTrajectoryList();
  };
  
  const handlePlayTrajectory = (name) => {
    if (!viewerRef?.current) return;
    
    const robot = viewerRef.current.getCurrentRobot();
    if (!robot) {
      alert('No robot loaded');
      return;
    }
    
    setPlaying(true);
    setSelectedTrajectory(name);
    
    trajectoryAPI.playTrajectory(name, robot, {
      ...playbackOptions,
      onComplete: () => {
        setPlaying(false);
        setPlaybackProgress(0);
      }
    });
  };
  
  const handleStopPlayback = () => {
    trajectoryAPI.stopPlayback();
    setPlaying(false);
    setPlaybackProgress(0);
  };
  
  const handleDeleteTrajectory = (name) => {
    if (window.confirm(`Delete trajectory "${name}"?`)) {
      trajectoryAPI.deleteTrajectory(name);
      
      if (selectedTrajectory === name) {
        setSelectedTrajectory('');
      }
      
      updateTrajectoryList();
    }
  };
  
  const handleRecordIntervalChange = (e) => {
    setRecordInterval(parseInt(e.target.value, 10));
  };
  
  const handlePlaybackOptionChange = (option, value) => {
    setPlaybackOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };
  
  const handleExportTrajectory = (name) => {
    const json = trajectoryAPI.exportTrajectory(name);
    if (!json) return;
    
    // Create blob and download link
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };
  
  const handleImportTrajectory = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target.result;
        const trajectory = trajectoryAPI.importTrajectory(json);
        if (trajectory) {
          updateTrajectoryList();
          setSelectedTrajectory(trajectory.name);
        }
      } catch (error) {
        console.error('Error importing trajectory:', error);
        alert('Error importing trajectory');
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
  };
  
  const handleSelectTrajectory = (name) => {
    setSelectedTrajectory(name);
  };
  
  return (
    <div className="urdf-controls-section">
      <h3>Trajectory Recording</h3>
      
      {/* Recording controls */}
      <div className="trajectory-recording">
        <h4>Record Trajectory</h4>
        <div className="trajectory-name-input">
          <input
            type="text"
            placeholder="Trajectory name"
            value={newTrajectoryName}
            onChange={(e) => setNewTrajectoryName(e.target.value)}
            disabled={recording}
          />
        </div>
        
        <div style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="record-interval">
            Recording interval (ms):
            <input
              id="record-interval"
              type="number"
              min="10"
              max="1000"
              step="10"
              value={recordInterval}
              onChange={handleRecordIntervalChange}
              disabled={recording}
              style={{ width: '80px', marginLeft: '0.5rem' }}
            />
          </label>
        </div>
        
        <div className="trajectory-buttons">
          {!recording ? (
            <button 
              className="record-btn"
              onClick={handleStartRecording}
              disabled={!newTrajectoryName.trim()}
            >
              Start Recording
            </button>
          ) : (
            <button 
              className="stop-btn"
              onClick={handleStopRecording}
            >
              Stop Recording
            </button>
          )}
        </div>
      </div>
      
      {/* Playback controls */}
      <div style={{ marginBottom: '1rem' }}>
        <h4>Playback Options</h4>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label htmlFor="playback-speed">
            Speed:
            <input
              id="playback-speed"
              type="number"
              min="0.1"
              max="5"
              step="0.1"
              value={playbackOptions.speed}
              onChange={(e) => handlePlaybackOptionChange('speed', parseFloat(e.target.value))}
              disabled={playing}
              style={{ width: '60px', marginLeft: '0.5rem' }}
            />
          </label>
          
          <label style={{ marginLeft: '1rem' }}>
            <input
              type="checkbox"
              checked={playbackOptions.loop}
              onChange={(e) => handlePlaybackOptionChange('loop', e.target.checked)}
              disabled={playing}
            />
            Loop
          </label>
        </div>
      </div>
      
      {/* Import/Export */}
      <div style={{ marginBottom: '1rem' }}>
        <h4>Import/Export</h4>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <label className="custom-file-upload" style={{ flex: 1 }}>
            <input
              type="file"
              accept=".json"
              onChange={handleImportTrajectory}
              style={{ display: 'none' }}
            />
            <button style={{ width: '100%' }}>Import Trajectory</button>
          </label>
        </div>
      </div>
      
      {/* 3D Visualization */}
      <RecordMap trajectoryName={selectedTrajectory} />
      
      {/* Trajectory list */}
      <div className="trajectory-list">
        <h4>Saved Trajectories</h4>
        {trajectories.length === 0 ? (
          <div className="no-trajectories">No trajectories recorded</div>
        ) : (
          <ul>
            {trajectories.map(name => (
              <li key={name} className="trajectory-item">
                <span 
                  className="trajectory-name" 
                  onClick={() => handleSelectTrajectory(name)}
                  style={{ 
                    cursor: 'pointer',
                    fontWeight: selectedTrajectory === name ? 'bold' : 'normal',
                    color: selectedTrajectory === name ? '#3498db' : 'inherit'
                  }}
                >
                  {name}
                </span>
                <div className="trajectory-actions">
                  <button 
                    onClick={() => handlePlayTrajectory(name)}
                    disabled={playing}
                  >
                    Play
                  </button>
                  <button onClick={() => handleExportTrajectory(name)}>
                    Export
                  </button>
                  <button onClick={() => handleDeleteTrajectory(name)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Active playback controls */}
      {playing && (
        <div className="playback-controls">
          <div style={{ marginBottom: '0.5rem' }}>
            Playing: <strong>{selectedTrajectory}</strong>
          </div>
          
          <div className="playback-progress">
            <div
              className="playback-progress-bar"
              style={{ width: `${playbackProgress}%` }}
            />
          </div>
          
          <button 
            className="stop-playback-btn"
            onClick={handleStopPlayback}
            style={{ marginTop: '0.5rem' }}
          >
            Stop Playback
          </button>
        </div>
      )}
    </div>
  );
};

export default TrajectoryViewer;