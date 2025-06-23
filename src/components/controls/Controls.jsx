// src/components/controls/Controls.jsx - Updated to remove unwanted sections
import React, { useEffect, useState } from 'react';
import ControlJoints from './ControlJoints/ControlJoints';
//import TCPController from './tcp/TCPController';
import Reposition from './Reposition/Reposition';
//import IKController from './IKController/IKController';
import { useRobotSelection } from '../../contexts/hooks/useRobotManager';
import EventBus from '../../utils/EventBus';
import addTCP from '../../core/AddTCP';

const Controls = ({ viewerRef }) => {
  const { activeId: activeRobotId } = useRobotSelection();

  // End effector pose/orientation state
  const [endEffector, setEndEffector] = useState(null);
  // TCP UI state
  const [tcpTools, setTcpTools] = useState([]);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [isLoadingTCP, setIsLoadingTCP] = useState(false);
  const [attachedTCP, setAttachedTCP] = useState(null);

  useEffect(() => {
    // Handler for global EndEffector/SET event
    const handler = (data) => {
      setEndEffector(data);
    };
    EventBus.on('EndEffector/SET', handler);
    EventBus.emit('EndEffector/GET');
    return () => {
      EventBus.off('EndEffector/SET', handler);
    };
  }, []);

  useEffect(() => {
    // Fetch available TCP tools on mount
    addTCP.scanAvailableTools().then(setTcpTools);
  }, []);

  useEffect(() => {
    // Update attached TCP info when robot changes
    if (activeRobotId) {
      setAttachedTCP(addTCP.getAttachedTool(activeRobotId));
    } else {
      setAttachedTCP(null);
    }
  }, [activeRobotId]);

  const handleAddTCP = async () => {
    if (!activeRobotId || !selectedToolId) return;
    setIsLoadingTCP(true);
    await addTCP.addTCPById(activeRobotId, selectedToolId);
    setAttachedTCP(addTCP.getAttachedTool(activeRobotId));
    setIsLoadingTCP(false);
  };

  const handleRemoveTCP = () => {
    if (!activeRobotId) return;
    const robot = getRobotGlobal(activeRobotId);
    if (robot) {
      addTCP.removeTCP(activeRobotId, robot);
      setAttachedTCP(null);
    }
  };

  if (!activeRobotId) {
    return (
      <div className="controls-placeholder">
        <p>Please select a robot to view controls</p>
      </div>
    );
  }

  return (
    <div className="controls">
      {/* TCP Tool Control UI */}
      <div style={{ marginBottom: 16, padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>TCP Tool Control</h4>
        {attachedTCP ? (
          <div style={{ marginBottom: 8 }}>
            <div><strong>Attached Tool:</strong> {attachedTCP.toolName || 'Unknown'}</div>
            <div>Type: {attachedTCP.toolType || 'N/A'}</div>
            <div>Position: {attachedTCP.position ? `[${attachedTCP.position.x.toFixed(3)}, ${attachedTCP.position.y.toFixed(3)}, ${attachedTCP.position.z.toFixed(3)}]` : 'N/A'}</div>
            <div>Orientation: {attachedTCP.orientation ? `[${attachedTCP.orientation.x.toFixed(4)}, ${attachedTCP.orientation.y.toFixed(4)}, ${attachedTCP.orientation.z.toFixed(4)}, ${attachedTCP.orientation.w.toFixed(4)}]` : 'N/A'}</div>
            <button onClick={handleRemoveTCP} disabled={isLoadingTCP} style={{ marginTop: 8 }}>Remove TCP</button>
          </div>
        ) : (
          <>
            <select
              value={selectedToolId}
              onChange={e => setSelectedToolId(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            >
              <option value="">Select TCP Tool...</option>
              {tcpTools.map(tool => (
                <option key={tool.id} value={tool.id}>{tool.name} ({tool.type})</option>
              ))}
            </select>
            <button onClick={handleAddTCP} disabled={!selectedToolId || isLoadingTCP} style={{ width: '100%' }}>
              {isLoadingTCP ? 'Adding...' : 'Add TCP'}
            </button>
          </>
        )}
      </div>
      {/* End Effector Pose & Orientation Only */}
      {endEffector && (
        <div style={{ color: '#333', fontSize: 13, marginBottom: 8, background: '#f8f8f8', padding: 6, borderRadius: 4 }}>
          <div><strong>End Effector Pose & Orientation</strong></div>
          {endEffector.robotId && (
            <div>Robot ID: <span style={{ color: '#888' }}>{endEffector.robotId}</span></div>
          )}
          <div>Pose: <span style={{ color: '#888' }}>{`[${endEffector.pose.x.toFixed(3)}, ${endEffector.pose.y.toFixed(3)}, ${endEffector.pose.z.toFixed(3)}]`}</span></div>
          <div>Orientation: <span style={{ color: '#888' }}>{`[${endEffector.orientation.x.toFixed(4)}, ${endEffector.orientation.y.toFixed(4)}, ${endEffector.orientation.z.toFixed(4)}, ${endEffector.orientation.w.toFixed(4)}]`}</span></div>
        </div>
      )}
      {/* Joint Control */}
      <ControlJoints viewerRef={viewerRef} />
      
      {/* IK Control 
      <IKController />*/}

      {/* Reposition Control */}
      <Reposition viewerRef={viewerRef} />
      
    </div>
  );
};

export default Controls;