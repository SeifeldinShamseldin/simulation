// components/controls/TrajectoryControl/TrajectoryControl.jsx
import React, { useState, useEffect, useRef } from 'react';
import trajectoryAPI from '../../../core/Trajectory/TrajectoryAPI';
import * as THREE from 'three';
import EventBus from '../../../core/EventBus';

/**
 * Component for trajectory recording and playback
 */
const TrajectoryControl = ({ viewerRef }) => {
  const [trajectories, setTrajectories] = useState([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTrajectory, setCurrentTrajectory] = useState('');
  const [newTrajectoryName, setNewTrajectoryName] = useState('');
  const [recordInterval, setRecordInterval] = useState(100); // ms
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackOptions, setPlaybackOptions] = useState({
    speed: 1.0,
    loop: false
  });
  
  const tcpMarkerRef = useRef(null);
  const trajLineRef = useRef(null);
  
  // Initialize and load trajectories
  useEffect(() => {
    updateTrajectoryList();
    
    // Set up EventBus listener
    const unsubscribe = EventBus.on('trajectory:playback-update', (info) => {
      setPlaybackProgress(info.progress * 100);
    });
    
    return () => {
      // Clean up
      unsubscribe();
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
      setCurrentTrajectory(newTrajectoryName);
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
    
    // Remove previous marker if any
    if (tcpMarkerRef.current && viewerRef.current.scene) {
      viewerRef.current.scene.remove(tcpMarkerRef.current);
      tcpMarkerRef.current = null;
    }
    
    // Remove previous trajectory line if any
    if (trajLineRef.current && viewerRef.current.scene) {
      viewerRef.current.scene.remove(trajLineRef.current);
      trajLineRef.current.geometry.dispose();
      trajLineRef.current.material.dispose();
      trajLineRef.current = null;
    }
    
    // Get trajectory data and add marker at start
    const traj = trajectoryAPI.getTrajectory(name);
    if (traj && traj.endEffectorPath && traj.endEffectorPath.length > 0) {
      const start = traj.endEffectorPath[0].position;
      const geometry = new THREE.SphereGeometry(0.025, 16, 16);
      const currentMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff9900
      });
      const marker = new THREE.Mesh(geometry, currentMaterial);
      marker.position.set(start.x, start.y, start.z);
      viewerRef.current.scene.add(marker);
      tcpMarkerRef.current = marker;
    }
    
    // Draw trajectory line
    if (traj && traj.endEffectorPath && traj.endEffectorPath.length > 1) {
      const points = traj.endEffectorPath.map(p => new THREE.Vector3(p.position.x, p.position.y, p.position.z));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x00aaff, linewidth: 3 });
      const line = new THREE.Line(geometry, material);
      viewerRef.current.scene.add(line);
      trajLineRef.current = line;
    }
    
    setPlaying(true);
    setCurrentTrajectory(name);
    
    trajectoryAPI.playTrajectory(name, robot, {
      ...playbackOptions,
      onComplete: () => {
        setPlaying(false);
        setPlaybackProgress(0);
        // Remove marker when done
        if (tcpMarkerRef.current && viewerRef.current.scene) {
          viewerRef.current.scene.remove(tcpMarkerRef.current);
          tcpMarkerRef.current = null;
        }
        // Remove trajectory line when stopped
        if (trajLineRef.current && viewerRef.current.scene) {
          viewerRef.current.scene.remove(trajLineRef.current);
          trajLineRef.current.geometry.dispose();
          trajLineRef.current.material.dispose();
          trajLineRef.current = null;
        }
      }
    });
  };
  
  const handleStopPlayback = () => {
    trajectoryAPI.stopPlayback();
    setPlaying(false);
    setPlaybackProgress(0);
    // Remove marker when stopped
    if (tcpMarkerRef.current && viewerRef.current.scene) {
      viewerRef.current.scene.remove(tcpMarkerRef.current);
      tcpMarkerRef.current = null;
    }
  };
  
  const handleDeleteTrajectory = (name) => {
    if (confirm(`Delete trajectory "${name}"?`)) {
      trajectoryAPI.deleteTrajectory(name);
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
        trajectoryAPI.importTrajectory(json);
        updateTrajectoryList();
      } catch (error) {
        console.error('Error importing trajectory:', error);
        alert('Error importing trajectory');
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
  };
  
  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Trajectory Control</h3>
      </div>
      
      {/* Recording controls */}
      <div className="controls-card-body">
        <div className="controls-form-group">
          <h4 className="controls-subtitle">Record Trajectory</h4>
          <div className="controls-form-group">
            <input
              type="text"
              placeholder="Trajectory name"
              value={newTrajectoryName}
              onChange={(e) => setNewTrajectoryName(e.target.value)}
              disabled={recording}
              className="controls-form-input"
            />
          </div>
          
          <div className="controls-form-group">
            <label className="controls-form-label" htmlFor="record-interval">
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
                className="controls-form-input controls-form-input-sm"
              />
            </label>
          </div>
          
          <div className="controls-btn-group">
            {!recording ? (
              <button 
                className="controls-btn controls-btn-primary"
                onClick={handleStartRecording}
                disabled={!newTrajectoryName.trim()}
              >
                Start Recording
              </button>
            ) : (
              <button 
                className="controls-btn controls-btn-danger"
                onClick={handleStopRecording}
              >
                Stop Recording
              </button>
            )}
          </div>
        </div>
        
        {/* Playback controls */}
        <div className="controls-form-group">
          <h4 className="controls-subtitle">Playback Options</h4>
          <div className="controls-form-group">
            <label className="controls-form-label" htmlFor="playback-speed">
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
                className="controls-form-input controls-form-input-sm"
              />
            </label>
            
            <label className="controls-form-label controls-ml-3">
              <input
                type="checkbox"
                checked={playbackOptions.loop}
                onChange={(e) => handlePlaybackOptionChange('loop', e.target.checked)}
                disabled={playing}
                className="controls-form-checkbox"
              />
              Loop
            </label>
          </div>
        </div>
        
        {/* Import/Export */}
        <div className="controls-form-group">
          <h4 className="controls-subtitle">Import/Export</h4>
          <div className="controls-btn-group">
            <label className="controls-btn controls-btn-light">
              <input
                type="file"
                accept=".json"
                onChange={handleImportTrajectory}
                className="controls-hidden"
              />
              Import Trajectory
            </label>
          </div>
        </div>
        
        {/* Trajectory list */}
        <div className="controls-form-group">
          <h4 className="controls-subtitle">Saved Trajectories</h4>
          {trajectories.length === 0 ? (
            <div className="controls-text-muted">No trajectories recorded</div>
          ) : (
            <ul className="controls-list">
              {trajectories.map(name => (
                <li key={name} className="controls-list-item">
                  <span className="controls-text">{name}</span>
                  <div className="controls-btn-group">
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-primary"
                      onClick={() => handlePlayTrajectory(name)}
                      disabled={playing}
                    >
                      Play
                    </button>
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-light"
                      onClick={() => handleExportTrajectory(name)}
                    >
                      Export
                    </button>
                    <button 
                      className="controls-btn controls-btn-sm controls-btn-danger"
                      onClick={() => handleDeleteTrajectory(name)}
                    >
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
          <div className="controls-form-group">
            <div className="controls-text controls-mb-2">
              Playing: <strong>{currentTrajectory}</strong>
            </div>
            
            <div className="controls-progress">
              <div
                className="controls-progress-bar"
                style={{ width: `${playbackProgress}%` }}
              />
            </div>
            
            <button 
              className="controls-btn controls-btn-danger controls-mt-2"
              onClick={handleStopPlayback}
            >
              Stop Playback
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrajectoryControl;