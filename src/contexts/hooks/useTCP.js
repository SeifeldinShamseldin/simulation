// src/contexts/hooks/useTCP.js
import { useContext } from 'react';
import TCPContext from '../TCPContext';

/**
 * Hook to use the TCP context
 * @returns {Object} TCP context value
 * @throws {Error} If used outside of TCPProvider
 */
export const useTCP = () => {
  const context = useContext(TCPContext);
  if (!context) {
    throw new Error('useTCP must be used within TCPProvider');
  }
  return context;
};

export default useTCP;