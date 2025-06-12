// src/components/controls/Controls.jsx - PURE UI ORCHESTRATOR
import React from 'react';
import { useRobotSelection } from '../../contexts/hooks/useRobot';
import ControlJoints from './ControlJoints/ControlJoints';
import IKController from './IKController/IKController';
import RecordMap from './RecordMap/RecordMap';
import Reposition from './Reposition/Reposition';
import TCPController from './tcp/TCPController';

const Controls = ({ viewerRef }) => {
  const { activeId: activeRobotId } = useRobotSelection();

  return (
    <div className="controls">
      <div className="controls-container">
        
        {/* Robot Status Indicator */}
        <section className="controls-section">
          <div className="controls-card" style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: activeRobotId ? '#e8f5e8' : '#f8f9fa',
            border: `2px solid ${activeRobotId ? '#28a745' : '#dee2e6'}`,
            borderRadius: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: activeRobotId ? '#28a745' : '#6c757d',
                borderRadius: '3px',
                flexShrink: 0
              }}></div>
              <span style={{
                fontSize: '0.875rem',
                fontWeight: '500',
                color: activeRobotId ? '#155724' : '#6c757d'
              }}>
                Robot using right now: {activeRobotId || 'No robot loaded'}
              </span>
            </div>
          </div>
        </section>

        {/* Joint Control */}
        <section className="controls-section">
          <div className="controls-section-header">
            <h3 className="controls-section-title">Joint Control</h3>
          </div>
          <div className="controls-section-body">
            <ControlJoints />
          </div>
        </section>

        {/* IK Controller */}
        <section className="controls-section">
          <div className="controls-section-header">
            <h3 className="controls-section-title">Inverse Kinematics</h3>
          </div>
          <div className="controls-section-body">
            <IKController />
          </div>
        </section>

        {/* TCP Tool Controller */}
        <section className="controls-section">
          <div className="controls-section-header">
            <h3 className="controls-section-title">TCP Tools</h3>
          </div>
          <div className="controls-section-body">
            <TCPController />
          </div>
        </section>

        {/* Reposition Controls */}
        <section className="controls-section">
          <div className="controls-section-header">
            <h3 className="controls-section-title">Robot Position</h3>
          </div>
          <div className="controls-section-body">
            <Reposition />
          </div>
        </section>

        {/* Trajectory Recording & Mapping */}
        <section className="controls-section">
          <div className="controls-section-header">
            <h3 className="controls-section-title">Trajectory & Recording</h3>
          </div>
          <div className="controls-section-body">
            <RecordMap viewerRef={viewerRef} />
          </div>
        </section>

      </div>
    </div>
  );
};

export default Controls;