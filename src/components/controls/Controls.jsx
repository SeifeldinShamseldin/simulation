// src/components/controls/Controls.jsx - Updated to remove unwanted sections
import React, { useEffect, useState, useCallback } from 'react';
import ControlJoints from './ControlJoints/ControlJoints';
//import TCPController from './tcp/TCPController';
import Reposition from './Reposition/Reposition';
//import IKController from './IKController/IKController';
import { useRobotSelection } from '../../contexts/hooks/useRobotManager';
import { useTCP } from '../../contexts/TCPContext';
import { useEndEffector } from '../../contexts/EndEffectorContext';
import { useRobotContext } from '../../contexts/RobotContext';
import EventBus from '../../utils/EventBus';

const Controls = ({ viewerRef }) => {
  const { activeId: activeRobotId } = useRobotSelection();
  
  // ========== ROBOT ACCESS (THE ONE WAY) ==========
  const { getRobot } = useRobotContext();
  
  // ========== ROBOT ACCESS HELPER ==========
  const accessRobot = useCallback((robotId) => {
    const robot = getRobot(robotId);
    if (!robot) {
      console.warn(`[Controls] Robot ${robotId} not found`);
      return null;
    }
    return robot;
  }, [getRobot]);
  
  const { 
    getAvailableTools, 
    addTCPById, 
    removeTCP, 
    getAttachedTool, 
    scanAvailableTools 
  } = useTCP();
  const { getEndEffectorData } = useEndEffector();

  // TCP UI state
  const [selectedToolId, setSelectedToolId] = useState('');
  const [isLoadingTCP, setIsLoadingTCP] = useState(false);
  const [attachedTCP, setAttachedTCP] = useState(null);
  const [availableTools, setAvailableTools] = useState([]);
  const [endEffectorData, setEndEffectorData] = useState(null);

  useEffect(() => {
    // Fetch available TCP tools on mount
    scanAvailableTools();
  }, [scanAvailableTools]);

  useEffect(() => {
    // Get available tools from context
    const tools = getAvailableTools();
    setAvailableTools(tools || []);
  }, [getAvailableTools]);

  useEffect(() => {
    // Update attached TCP info when robot changes
    if (activeRobotId) {
      setAttachedTCP(getAttachedTool(activeRobotId));
    } else {
      setAttachedTCP(null);
    }
  }, [activeRobotId, getAttachedTool]);

  useEffect(() => {
    // Get end effector data for active robot
    if (activeRobotId) {
      const data = getEndEffectorData(activeRobotId);
      setEndEffectorData(data);
    } else {
      setEndEffectorData(null);
    }
  }, [activeRobotId, getEndEffectorData]);

  useEffect(() => {
    // Listen for end effector updates
    const handler = (data) => {
      if (data.robotId === activeRobotId) {
        setEndEffectorData({
          robotId: data.robotId,
          baseLink: data.baseLink,
          endEffector: data.endEffector,
          pose: data.pose,
          orientation: data.orientation,
          status: data.status
        });
      }
    };
    
    EventBus.on('EndEffector/SET', handler);
    
    // Request initial data
    if (activeRobotId) {
      EventBus.emit('EndEffector/GET');
    }
    
    return () => {
      EventBus.off('EndEffector/SET', handler);
    };
  }, [activeRobotId]);

  const handleAddTCP = async () => {
    if (!activeRobotId || !selectedToolId) return;
    setIsLoadingTCP(true);
    await addTCPById(activeRobotId, selectedToolId);
    setAttachedTCP(getAttachedTool(activeRobotId));
    setIsLoadingTCP(false);
  };

  const handleRemoveTCP = () => {
    if (!activeRobotId) return;
    
    // Use the proper robot access pattern
    const robot = accessRobot(activeRobotId);
    if (robot) {
      removeTCP(activeRobotId, robot);
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
              {availableTools.map(tool => (
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
      {endEffectorData && (
        <div style={{ color: '#333', fontSize: 13, marginBottom: 8, background: '#f8f8f8', padding: 6, borderRadius: 4 }}>
          <div><strong>End Effector Reading</strong></div>
          {endEffectorData.robotId && (
            <div>Robot ID: <span style={{ color: '#888' }}>{endEffectorData.robotId}</span></div>
          )}
          {/* Show pose/orientation if present */}
          {endEffectorData.pose && endEffectorData.orientation ? (
            <>
              <div>Pose: <span style={{ color: '#888' }}>{`[${endEffectorData.pose.x.toFixed(3)}, ${endEffectorData.pose.y.toFixed(3)}, ${endEffectorData.pose.z.toFixed(3)}]`}</span></div>
              <div>Orientation: <span style={{ color: '#888' }}>{`[${endEffectorData.orientation.x.toFixed(4)}, ${endEffectorData.orientation.y.toFixed(4)}, ${endEffectorData.orientation.z.toFixed(4)}, ${endEffectorData.orientation.w.toFixed(4)}]`}</span></div>
            </>
          ) : null}
          <div>Base Link: <span style={{ color: '#888' }}>{endEffectorData.baseLink}</span></div>
          <div>End Effector: <span style={{ color: '#888' }}>{endEffectorData.endEffector}</span></div>
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