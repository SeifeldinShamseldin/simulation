// utils/EventBus.js
import debugSystem from './DebugSystem';
import _ from 'lodash';

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.throttledEmitters = new Map();
    
    // For debugging
    this.debug = true;
    this.eventHistory = [];
    this.maxHistorySize = 100;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    if (this.debug) {
      debugSystem.addLog('debug', [`EventBus: Registered listener for "${event}"`]);
    }
    
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      
      if (this.debug) {
        debugSystem.addLog('debug', [`EventBus: Removed listener for "${event}"`]);
      }
    }
  }

  emit(event, data) {
    if (this.debug) {
      // Store event in history
      this.eventHistory.unshift({
        event,
        data,
        timestamp: new Date()
      });
      
      // Trim history if needed
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.pop();
      }
      
      debugSystem.addLog('debug', [`EventBus: Emitting "${event}"`, data]);
    }
    
    if (!this.listeners.has(event)) return;
    
    const errors = [];
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        errors.push(error);
        debugSystem.addLog('error', [`Error in event handler for ${event}:`, error]);
      }
    });
    
    if (errors.length > 0) {
      debugSystem.addLog('warn', [`${errors.length} errors occurred while handling "${event}"`]);
    }
  }

  // High-frequency event emitter with throttling
  emitThrottled(event, data, delay = 16) { // 60fps by default
    const key = `${event}_${delay}`;
    
    if (!this.throttledEmitters.has(key)) {
      this.throttledEmitters.set(key, 
        _.throttle((d) => this.emit(event, d), delay, {
          leading: true,
          trailing: true
        })
      );
    }
    
    this.throttledEmitters.get(key)(data);
  }

  // Emit with rate limiting for very high frequency updates
  emitDebounced(event, data, delay = 100) {
    const key = `${event}_debounced_${delay}`;
    
    if (!this.throttledEmitters.has(key)) {
      this.throttledEmitters.set(key, 
        _.debounce((d) => this.emit(event, d), delay)
      );
    }
    
    this.throttledEmitters.get(key)(data);
  }

  // Get all registered events
  getRegisteredEvents() {
    return Array.from(this.listeners.keys());
  }
  
  // Get event history for debugging
  getEventHistory() {
    return [...this.eventHistory];
  }

  // Clear all listeners
  clear() {
    this.listeners.clear();
    this.throttledEmitters.clear();
    debugSystem.addLog('info', ['EventBus: All listeners cleared']);
  }

  // Clear throttled emitters to free memory
  clearThrottledEmitters() {
    this.throttledEmitters.clear();
    debugSystem.addLog('info', ['EventBus: Throttled emitters cleared']);
  }
}

const eventBus = new EventBus();

// Remove or comment out noisy console logs for production cleanliness
// const originalOn = eventBus.on;
// eventBus.on = function(event, handler) {
//   console.log('[EventBus] on:', event, handler, 'instance:', eventBus);
//   return originalOn.call(this, event, handler);
// };

// const originalEmit = eventBus.emit;
// eventBus.emit = function(event, payload) {
//   console.log('[EventBus] emit:', event, payload, 'instance:', eventBus);
//   return originalEmit.call(this, event, payload);
// };

export default eventBus;