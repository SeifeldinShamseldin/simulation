// src/components/controls/Controls.jsx - Control components only
import React, { useState, useEffect } from 'react';
import { useViewer } from '../../contexts/ViewerContext';
import { useRobotSelection, useRobotManagement } from '../../contexts/hooks/useRobot';
import { useTCP } from '../../contexts/hooks/useTCP';
import { useJoints } from '../../contexts/hooks/useJoints';
import { useIK } from '../../contexts/hooks/useIK';
import EventBus from '../../utils/EventBus';
import ControlJoints from './ControlJoints/ControlJoints';
import IKController from './IKController/IKController';
import Reposition from './Reposition/Reposition';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
import TCPController from './TCP/TCPController';

const Controls = ({ viewerRef, onClose }) => {
  const { isViewerReady } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  const { getRobot } = useRobotManagement();
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

  if (!activeRobotId) {
    return (
      <div className="controls">
        <div className="controls-section">
          <h3 className="controls-section-title">Robot Controls</h3>
          <p className="controls-text-muted">No robot selected. Please select a robot first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #dee2e6'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Robot Controls</h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.8rem',
            cursor: 'pointer',
            color: '#6c757d',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <section className="controls-section-wrapper">
          <ControlJoints />
        </section>
        
        <section className="controls-section-wrapper">
          <IKController />
        </section>
        
        <section className="controls-section-wrapper">
          <Reposition viewerRef={viewerRef} />
        </section>
        
        <section className="controls-section-wrapper">
          <TCPController viewerRef={viewerRef} />
        </section>
        
        <section className="controls-section-wrapper">
          <TrajectoryViewer viewerRef={viewerRef} />
        </section>
      </div>
    </div>
  );
};

export default Controls;