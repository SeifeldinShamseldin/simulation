/**
 * Simple event bus implementation for handling application-wide events
 */
class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - The name of the event to subscribe to
   * @param {Function} callback - The callback function to execute when the event is triggered
   * @returns {Function} - Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    
    const callbacks = this.events.get(eventName);
    callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.events.get(eventName);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.events.delete(eventName);
        }
      }
    };
  }

  /**
   * Emit an event
   * @param {string} eventName - The name of the event to emit
   * @param {*} data - The data to pass to the event handlers
   */
  emit(eventName, data) {
    const callbacks = this.events.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} eventName - The name of the event to clear
   */
  clear(eventName) {
    this.events.delete(eventName);
  }

  /**
   * Remove all event listeners
   */
  clearAll() {
    this.events.clear();
  }
}

// Create and export a singleton instance
const eventBus = new EventBus();
export default eventBus; 