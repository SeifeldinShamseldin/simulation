// utils/EventBus.js
import debugSystem from './DebugSystem';

class EventBus {
  constructor() {
    this.listeners = new Map();
    
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
    debugSystem.addLog('info', ['EventBus: All listeners cleared']);
  }
}

const eventBus = new EventBus();
export default eventBus;