// components/controls/RecordMap/TrajectoryViewer.jsx
import React, { useState, useEffect } from 'react';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import RecordMap from './RecordMap';
import LiveTrajectoryGraph from './LiveTrajectoryGraph';
import EventBus from '../../../utils/EventBus';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import ikAPI from '../../../core/IK/API/IKAPI';

/**
 * Integrated component for trajectory control and visualization
 */
const TrajectoryViewer = ({ viewerRef }) => {
  const { activeRobotId, robot, isReady, getJointValues, robotManager } = useRobotControl(viewerRef);
  const [trajectories, setTrajectories] = useState([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selectedTrajectory, setSelectedTrajectory] = useState('');
  const [newTrajectoryName, setNewTrajectoryName] = useState('');
  const [recordInterval, setRecordInterval] = useState(100); // ms
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [showLiveGraph, setShowLiveGraph] = useState(false);
  const [playbackOptions, setPlaybackOptions] = useState({
    speed: 1.0,
    loop: false
  });
  const [endEffectorPosition, setEndEffectorPosition] = useState({ x: 0, y: 0, z: 0 });
  
  // Initialize and load trajectories
  useEffect(() => {
    updateTrajectoryList();
    
    // Use EventBus with robot ID filtering
    const unsubscribe = EventBus.on('trajectory:playback-update', (info) => {
      // Only update if it's for the current robot
      if (info.robotId === activeRobotId) {
        setPlaybackProgress(info.progress * 100);
      }
    });
    
    return () => {
      // Clean up only for current robot
      if (playing && activeRobotId) {
        trajectoryAPI.stopPlayback(activeRobotId);
      }
      if (recording && activeRobotId) {
        trajectoryAPI.stopRecording(activeRobotId);
      }
      unsubscribe();
    };
  }, [activeRobotId]); // Add activeRobotId to dependencies

  // Update trajectories when robot changes
  useEffect(() => {
    updateTrajectoryList();
    // Clear selected trajectory when switching robots
    setSelectedTrajectory('');
    setPlaying(false);
    setRecording(false);
  }, [activeRobotId]);
  
  useEffect(() => {
    if (!robot || !isReady) return;
    const updatePosition = () => {
      const pos = ikAPI.getEndEffectorPosition(robot);
      setEndEffectorPosition(pos);
    };
    const interval = setInterval(updatePosition, 100);
    updatePosition();
    return () => clearInterval(interval);
  }, [robot, isReady]);
  
  const updateTrajectoryList = () => {
    if (!activeRobotId) {
      setTrajectories([]);
      return;
    }
    setTrajectories(trajectoryAPI.getTrajectoryNames(activeRobotId));
  };
  
  const handleStartRecording = () => {
    if (!newTrajectoryName.trim() || !robot || !isReady || !activeRobotId) return;
    
    const success = trajectoryAPI.startRecording(newTrajectoryName, {
      robot,
      robotId: activeRobotId,
      interval: recordInterval,
      // Pass functions to get current state
      getJointValues: () => getJointValues(),
    });
    
    if (success) {
      setRecording(true);
      setSelectedTrajectory(newTrajectoryName);
      setNewTrajectoryName('');
    } else {
      alert('Failed to start recording');
    }
  };
  
  const handleStopRecording = () => {
    if (!activeRobotId) return;
    trajectoryAPI.stopRecording(activeRobotId); // Pass robot ID
    setRecording(false);
    updateTrajectoryList();
  };
  
  const handlePlayTrajectory = (name) => {
    if (!robot || !isReady || !activeRobotId) return;
    
    setPlaying(true);
    setSelectedTrajectory(name);
    
    trajectoryAPI.playTrajectory(name, robot, activeRobotId, {
      ...playbackOptions,
      setJointValues: (values) => {
        // Use the robotManager to set joint values
        if (robotManager) {
          robotManager.setJointValues(activeRobotId, values);
        } else {
          // Fallback to direct robot method
          robot.setJointValues(values);
        }
      },
      onComplete: () => {
        setPlaying(false);
        setPlaybackProgress(0);
      }
    });
  };
  
  const handleStopPlayback = () => {
    if (!activeRobotId) return;
    trajectoryAPI.stopPlayback(activeRobotId); // Pass robot ID
    setPlaying(false);
    setPlaybackProgress(0);
  };
  
  const handleDeleteTrajectory = (name) => {
    if (!activeRobotId) return;
    if (window.confirm(`Delete trajectory "${name}"?`)) {
      trajectoryAPI.deleteTrajectory(name, activeRobotId);
      
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
    const json = trajectoryAPI.exportTrajectory(name, activeRobotId);
    if (!json) return;
    
    // Create blob and download link
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeRobotId}_${name}.json`; // Include robot ID in filename
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
    if (!file || !activeRobotId) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target.result;
        // Pass activeRobotId to import
        const trajectory = trajectoryAPI.importTrajectory(json, activeRobotId);
        if (trajectory) {
          updateTrajectoryList();
          setSelectedTrajectory(trajectory.name);
        } else {
          alert('Failed to import trajectory. Please ensure the file is valid and contains trajectory data.');
        }
      } catch (error) {
        console.error('Error importing trajectory:', error);
        alert('Error importing trajectory. Please check the file format and try again.');
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
      <h3>Trajectory Recording - {activeRobotId || 'No Robot Selected'}</h3>
      
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

        <button 
          className="graph-button"
          onClick={() => setShowLiveGraph(true)}
          style={{
            backgroundColor: 'var(--controls-brand-teal)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            marginTop: '1rem',
            width: '100%',
            fontSize: '1rem',
            fontWeight: '500'
          }}
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
        <h4>Saved Trajectories for {activeRobotId || 'No Robot Selected'}</h4>
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