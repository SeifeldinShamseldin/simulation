import React, { useEffect, useState } from 'react';
import EventBus from '../utils/EventBus';
import { EndEffectorEvents } from '../contexts/dataTransfer';

/**
 * Test/demo component that listens to global end effector events
 * and logs all received data to the console for debugging.
 */
const EndEffectorListenerTest = ({ robotId }) => {
  console.log('EndEffectorListenerTest rendered', robotId);
  const [endEffectorState, setEndEffectorState] = useState({
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    link: null,
    hasTCP: false
  });

  // Log the latest end effector state and link whenever they change
  React.useEffect(() => {
    console.log('[EndEffectorListenerTest] Current End Effector:', {
      position: endEffectorState.position,
      orientation: endEffectorState.orientation,
      link: endEffectorState.link
    });
  }, [endEffectorState.position, endEffectorState.orientation, endEffectorState.link]);

  useEffect(() => {
    // Listen for end effector position/orientation updates
    const handleEndEffectorUpdate = (data) => {
      if (data.robotId === robotId) {
        setEndEffectorState(prev => ({
          ...prev,
          position: data.position,
          orientation: data.orientation,
          hasTCP: data.hasTCP
        }));
        console.log('[EndEffectorListenerTest] UPDATED event:', data);
      } else {
        console.log('[EndEffectorListenerTest] Ignored UPDATED for robotId', data.robotId);
      }
    };

    // Listen for end effector link changes
    const handleLinkUpdate = (data) => {
      if (data.robotId === robotId) {
        setEndEffectorState(prev => ({
          ...prev,
          link: data.link
        }));
        console.log('[EndEffectorListenerTest] LINK_UPDATED event:', data);
      } else {
        console.log('[EndEffectorListenerTest] Ignored LINK_UPDATED for robotId', data.robotId);
      }
    };

    // Listen for direct response to GET_LINK
    const handleLinkResponse = (data) => {
      if (data.robotId === robotId) {
        setEndEffectorState(prev => ({
          ...prev,
          link: data.link
        }));
        console.log('[EndEffectorListenerTest] LINK RESPONSE:', data);
      }
    };

    // Listen for direct response to GET_STATE
    const handleStateResponse = (data) => {
      if (data.robotId === robotId) {
        setEndEffectorState(prev => ({
          ...prev,
          position: data.position,
          orientation: data.orientation,
          hasTCP: data.hasTCP
        }));
        console.log('[EndEffectorListenerTest] STATE RESPONSE:', data);
      }
    };

    // Subscribe to global and response events
    const unsubscribeUpdate = EventBus.on(EndEffectorEvents.UPDATED, handleEndEffectorUpdate);
    const unsubscribeLink = EventBus.on(EndEffectorEvents.LINK_UPDATED, handleLinkUpdate);
    const unsubscribeLinkResponse = EventBus.on(EndEffectorEvents.Responses.LINK, handleLinkResponse);
    const unsubscribeStateResponse = EventBus.on(EndEffectorEvents.Responses.STATE, handleStateResponse);

    // Request initial state
    const reqId1 = `listener-init-${Date.now()}`;
    const reqId2 = `listener-link-${Date.now()}`;
    EventBus.emit(EndEffectorEvents.Commands.GET_STATE, {
      robotId,
      requestId: reqId1
    });
    EventBus.emit(EndEffectorEvents.Commands.GET_LINK, {
      robotId,
      requestId: reqId2
    });
    console.log('[EndEffectorListenerTest] Requested initial state and link', { reqId1, reqId2 });

    return () => {
      unsubscribeUpdate();
      unsubscribeLink();
      unsubscribeLinkResponse();
      unsubscribeStateResponse();
      console.log('[EndEffectorListenerTest] Unsubscribed from events');
    };
  }, [robotId]);

  return (
    <div className="end-effector-info-test">
      <h3>End Effector State (Test)</h3>
      <p>Link: {endEffectorState.link || 'Unknown'}</p>
      <p>Position: ({endEffectorState.position.x.toFixed(3)}, {endEffectorState.position.y.toFixed(3)}, {endEffectorState.position.z.toFixed(3)})</p>
      <p>Has TCP: {endEffectorState.hasTCP ? 'Yes' : 'No'}</p>
      <pre>{JSON.stringify(endEffectorState, null, 2)}</pre>
    </div>
  );
};

/**
 * Example hook for using end effector data anywhere, with console logging.
 */
export const useEndEffectorStateTest = (robotId) => {
  const [state, setState] = useState({
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    link: null,
    hasTCP: false,
    lastUpdate: null
  });

  useEffect(() => {
    const handleUpdate = (data) => {
      if (data.robotId === robotId) {
        setState(prev => ({
          ...prev,
          position: data.position,
          orientation: data.orientation,
          hasTCP: data.hasTCP,
          lastUpdate: data.timestamp
        }));
        console.log('[useEndEffectorStateTest] UPDATED event:', data);
      }
    };

    const handleLinkUpdate = (data) => {
      if (data.robotId === robotId) {
        setState(prev => ({
          ...prev,
          link: data.link
        }));
        console.log('[useEndEffectorStateTest] LINK_UPDATED event:', data);
      }
    };

    // Listen for direct response to GET_LINK
    const handleLinkResponse = (data) => {
      if (data.robotId === robotId) {
        setState(prev => ({
          ...prev,
          link: data.link
        }));
        console.log('[useEndEffectorStateTest] LINK RESPONSE:', data);
      }
    };

    // Listen for direct response to GET_STATE
    const handleStateResponse = (data) => {
      if (data.robotId === robotId) {
        setState(prev => ({
          ...prev,
          position: data.position,
          orientation: data.orientation,
          hasTCP: data.hasTCP
        }));
        console.log('[useEndEffectorStateTest] STATE RESPONSE:', data);
      }
    };

    const unsubscribe1 = EventBus.on(EndEffectorEvents.UPDATED, handleUpdate);
    const unsubscribe2 = EventBus.on(EndEffectorEvents.LINK_UPDATED, handleLinkUpdate);
    const unsubscribe3 = EventBus.on(EndEffectorEvents.Responses.LINK, handleLinkResponse);
    const unsubscribe4 = EventBus.on(EndEffectorEvents.Responses.STATE, handleStateResponse);

    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      console.log('[useEndEffectorStateTest] Unsubscribed from events');
    };
  }, [robotId]);

  // Force recalculation
  const recalculate = () => {
    EventBus.emit(EndEffectorEvents.Commands.RECALCULATE, { robotId });
    console.log('[useEndEffectorStateTest] Emitted RECALCULATE for', robotId);
  };

  return { ...state, recalculate };
};

export default EndEffectorListenerTest; 