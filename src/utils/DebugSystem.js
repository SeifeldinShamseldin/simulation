// utils/DebugSystem.js
class DebugSystem {
    constructor() {
      this.isEnabled = process.env.NODE_ENV !== 'production' || localStorage.getItem('debug') === 'true';
      this.logLevel = localStorage.getItem('logLevel') || 'info';
      this.logs = [];
      this.maxLogs = 1000;
      this.listeners = new Set();
      
      // Levels: debug < info < warn < error
      this.levels = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
      };
      
      // Context-specific debug flags
      this.DEBUG_CONTEXTS = {
        TCP: localStorage.getItem('debug_tcp') === 'true',
        IK: localStorage.getItem('debug_ik') === 'true',
        JOINT: localStorage.getItem('debug_joint') === 'true',
        TRAJECTORY: localStorage.getItem('debug_trajectory') === 'true',
        ROBOT: localStorage.getItem('debug_robot') === 'true',
        VIEWER: localStorage.getItem('debug_viewer') === 'true',
        EVENT: localStorage.getItem('debug_event') === 'true',
        ANIMATION: localStorage.getItem('debug_animation') === 'true'
      };
      
      // Initialize console recording if enabled
      if (this.isEnabled) {
        this.setupConsoleRecording();
      }
    }
    
    // Main debug function with context filtering
    debug(context, ...args) {
      if (this.isEnabled && this.DEBUG_CONTEXTS[context]) {
        console.log(`[${context}]`, ...args);
        this.addLog('debug', [`[${context}]`, ...args]);
      }
    }
    
    // Context-specific debug functions for convenience
    tcp(...args) {
      this.debug('TCP', ...args);
    }
    
    ik(...args) {
      this.debug('IK', ...args);
    }
    
    joint(...args) {
      this.debug('JOINT', ...args);
    }
    
    trajectory(...args) {
      this.debug('TRAJECTORY', ...args);
    }
    
    robot(...args) {
      this.debug('ROBOT', ...args);
    }
    
    viewer(...args) {
      this.debug('VIEWER', ...args);
    }
    
    event(...args) {
      this.debug('EVENT', ...args);
    }
    
    animation(...args) {
      this.debug('ANIMATION', ...args);
    }
    
    // Enable/disable specific contexts
    enableContext(context) {
      if (this.DEBUG_CONTEXTS.hasOwnProperty(context)) {
        this.DEBUG_CONTEXTS[context] = true;
        localStorage.setItem(`debug_${context.toLowerCase()}`, 'true');
      }
    }
    
    disableContext(context) {
      if (this.DEBUG_CONTEXTS.hasOwnProperty(context)) {
        this.DEBUG_CONTEXTS[context] = false;
        localStorage.setItem(`debug_${context.toLowerCase()}`, 'false');
      }
    }
    
    // Enable/disable all contexts
    enableAllContexts() {
      Object.keys(this.DEBUG_CONTEXTS).forEach(context => {
        this.enableContext(context);
      });
    }
    
    disableAllContexts() {
      Object.keys(this.DEBUG_CONTEXTS).forEach(context => {
        this.disableContext(context);
      });
    }
    
    // Get current context status
    getContextStatus() {
      return { ...this.DEBUG_CONTEXTS };
    }
    
    setupConsoleRecording() {
      // Store original console methods
      this.originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug
      };
      
      // Override console methods
      console.log = (...args) => {
        this.originalConsole.log(...args);
        this.addLog('debug', args);
      };
      
      console.info = (...args) => {
        this.originalConsole.info(...args);
        this.addLog('info', args);
      };
      
      console.warn = (...args) => {
        this.originalConsole.warn(...args);
        this.addLog('warn', args);
      };
      
      console.error = (...args) => {
        this.originalConsole.error(...args);
        this.addLog('error', args);
      };
      
      console.debug = (...args) => {
        this.originalConsole.debug(...args);
        this.addLog('debug', args);
      };
      
      // Also capture unhandled errors
      window.addEventListener('error', (event) => {
        this.addLog('error', [`Unhandled error: ${event.message}`, event.error]);
      });
      
      window.addEventListener('unhandledrejection', (event) => {
        this.addLog('error', [`Unhandled promise rejection: ${event.reason}`]);
      });
    }
    
    addLog(level, args) {
      if (!this.isEnabled || this.levels[level] < this.levels[this.logLevel]) {
        return;
      }
      
      const log = {
        timestamp: new Date(),
        level,
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        details: args
      };
      
      this.logs.push(log);
      
      // Trim logs if exceeded max
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs);
      }
      
      // Notify listeners
      this.notifyListeners(log);
    }
    
    notifyListeners(log) {
      this.listeners.forEach(listener => {
        try {
          listener(log);
        } catch (e) {
          this.originalConsole.error('Error in debug listener:', e);
        }
      });
    }
    
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    
    enable() {
      this.isEnabled = true;
      localStorage.setItem('debug', 'true');
      if (!this.originalConsole) {
        this.setupConsoleRecording();
      }
    }
    
    disable() {
      this.isEnabled = false;
      localStorage.setItem('debug', 'false');
      this.restoreConsole();
    }
    
    setLogLevel(level) {
      if (this.levels.hasOwnProperty(level)) {
        this.logLevel = level;
        localStorage.setItem('logLevel', level);
      }
    }
    
    getLogs(level = null) {
      if (level) {
        return this.logs.filter(log => log.level === level);
      }
      return [...this.logs];
    }
    
    clearLogs() {
      this.logs = [];
    }
    
    restoreConsole() {
      if (this.originalConsole) {
        Object.keys(this.originalConsole).forEach(key => {
          console[key] = this.originalConsole[key];
        });
        this.originalConsole = null;
      }
    }
  }
  
  const debugSystem = new DebugSystem();
  
  // Export both the instance and the debug function for convenience
  export const debug = (context, ...args) => debugSystem.debug(context, ...args);
  
  // Export context-specific functions
  export const debugTCP = (...args) => debugSystem.tcp(...args);
  export const debugIK = (...args) => debugSystem.ik(...args);
  export const debugJoint = (...args) => debugSystem.joint(...args);
  export const debugTrajectory = (...args) => debugSystem.trajectory(...args);
  export const debugRobot = (...args) => debugSystem.robot(...args);
  export const debugViewer = (...args) => debugSystem.viewer(...args);
  export const debugEvent = (...args) => debugSystem.event(...args);
  export const debugAnimation = (...args) => debugSystem.animation(...args);
  
  export default debugSystem;