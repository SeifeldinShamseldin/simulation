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
      
      // Initialize console recording if enabled
      if (this.isEnabled) {
        this.setupConsoleRecording();
      }
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
  export default debugSystem;