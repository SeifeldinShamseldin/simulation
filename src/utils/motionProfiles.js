/**
 * @file motionProfiles.js
 * @description Realistic robot motion profiles for smooth movement
 * Provides trapezoidal and S-curve velocity profiles for robot motion control
 */

/**
 * Trapezoidal velocity profile generator
 * Creates smooth acceleration -> constant velocity -> deceleration curve
 */
export class TrapezoidalProfile {
  constructor(options = {}) {
    this.maxVelocity = options.maxVelocity || 1.0;
    this.maxAcceleration = options.maxAcceleration || 2.0;
    this.maxJerk = options.maxJerk || 10.0; // For S-curve profile
  }

  /**
   * Calculate motion profile parameters
   * @param {number} distance - Total distance to travel
   * @param {number} currentVel - Current velocity (usually 0)
   * @param {number} targetVel - Target velocity (usually 0)
   * @returns {Object} Profile parameters
   */
  calculateProfile(distance, currentVel = 0, targetVel = 0) {
    const d = Math.abs(distance);
    const v_max = this.maxVelocity;
    const a_max = this.maxAcceleration;
    
    // Calculate time to accelerate to max velocity
    const t_acc = (v_max - currentVel) / a_max;
    const d_acc = currentVel * t_acc + 0.5 * a_max * t_acc * t_acc;
    
    // Calculate time to decelerate from max velocity
    const t_dec = (v_max - targetVel) / a_max;
    const d_dec = v_max * t_dec - 0.5 * a_max * t_dec * t_dec;
    
    let profile;
    
    // Check if we can reach max velocity
    if (d_acc + d_dec <= d) {
      // Trapezoidal profile (with constant velocity phase)
      const d_const = d - d_acc - d_dec;
      const t_const = d_const / v_max;
      
      profile = {
        type: 'trapezoidal',
        t_acc,
        t_const,
        t_dec,
        t_total: t_acc + t_const + t_dec,
        v_max,
        a_max,
        phases: [
          { duration: t_acc, type: 'acceleration' },
          { duration: t_const, type: 'constant' },
          { duration: t_dec, type: 'deceleration' }
        ]
      };
    } else {
      // Triangular profile (no constant velocity phase)
      const v_peak = Math.sqrt(a_max * d);
      const t_acc_tri = v_peak / a_max;
      const t_dec_tri = v_peak / a_max;
      
      profile = {
        type: 'triangular',
        t_acc: t_acc_tri,
        t_const: 0,
        t_dec: t_dec_tri,
        t_total: t_acc_tri + t_dec_tri,
        v_max: v_peak,
        a_max,
        phases: [
          { duration: t_acc_tri, type: 'acceleration' },
          { duration: t_dec_tri, type: 'deceleration' }
        ]
      };
    }
    
    return profile;
  }

  /**
   * Get position at time t using the calculated profile
   * @param {number} t - Time in seconds
   * @param {Object} profile - Calculated profile
   * @param {number} distance - Total distance (with sign)
   * @returns {number} Position at time t
   */
  getPosition(t, profile, distance) {
    const sign = Math.sign(distance);
    let position = 0;
    let currentTime = 0;
    
    // Acceleration phase
    if (t <= profile.t_acc) {
      position = 0.5 * profile.a_max * t * t;
    }
    // Constant velocity phase (if exists)
    else if (profile.t_const > 0 && t <= profile.t_acc + profile.t_const) {
      const t_in_phase = t - profile.t_acc;
      position = 0.5 * profile.a_max * profile.t_acc * profile.t_acc + 
                 profile.v_max * t_in_phase;
    }
    // Deceleration phase
    else if (t < profile.t_total) {
      const t_in_phase = t - profile.t_acc - profile.t_const;
      const t_remaining = profile.t_dec - t_in_phase;
      
      if (profile.t_const > 0) {
        // From trapezoidal profile
        position = 0.5 * profile.a_max * profile.t_acc * profile.t_acc +
                   profile.v_max * profile.t_const +
                   profile.v_max * t_in_phase - 0.5 * profile.a_max * t_in_phase * t_in_phase;
      } else {
        // From triangular profile
        position = Math.abs(distance) - 0.5 * profile.a_max * t_remaining * t_remaining;
      }
    }
    // After profile completes
    else {
      position = Math.abs(distance);
    }
    
    return position * sign;
  }

  /**
   * Get velocity at time t
   * @param {number} t - Time in seconds
   * @param {Object} profile - Calculated profile
   * @param {number} distance - Total distance (with sign)
   * @returns {number} Velocity at time t
   */
  getVelocity(t, profile, distance) {
    const sign = Math.sign(distance);
    let velocity = 0;
    
    // Acceleration phase
    if (t <= profile.t_acc) {
      velocity = profile.a_max * t;
    }
    // Constant velocity phase
    else if (profile.t_const > 0 && t <= profile.t_acc + profile.t_const) {
      velocity = profile.v_max;
    }
    // Deceleration phase
    else if (t < profile.t_total) {
      const t_in_phase = t - profile.t_acc - profile.t_const;
      velocity = profile.v_max - profile.a_max * t_in_phase;
    }
    // After profile completes
    else {
      velocity = 0;
    }
    
    return velocity * sign;
  }
}

/**
 * S-Curve profile generator for even smoother motion
 * Adds jerk limiting for ultra-smooth acceleration changes
 */
export class SCurveProfile extends TrapezoidalProfile {
  /**
   * Calculate S-curve motion profile with jerk limiting
   * @param {number} distance - Total distance to travel
   * @returns {Object} Profile parameters
   */
  calculateProfile(distance) {
    const d = Math.abs(distance);
    const v_max = this.maxVelocity;
    const a_max = this.maxAcceleration;
    const j_max = this.maxJerk;
    
    // Calculate jerk-limited acceleration phase times
    const t_j = a_max / j_max; // Time to reach max acceleration
    const t_a = v_max / a_max; // Time at constant acceleration
    
    // Total acceleration time includes jerk phases
    const t_acc_total = t_a + t_j;
    
    // Distance during acceleration (with jerk phases)
    const d_j = (1/6) * j_max * Math.pow(t_j, 3); // Distance during jerk phase
    const d_a = 0.5 * a_max * Math.pow(t_a - t_j, 2) + a_max * t_j * (t_a - t_j); // Distance at constant acc
    const d_acc = 2 * d_j + d_a;
    
    return {
      type: 's-curve',
      t_j,
      t_a,
      t_acc_total,
      t_total: 2 * t_acc_total + (d - 2 * d_acc) / v_max,
      v_max,
      a_max,
      j_max
    };
  }

  /**
   * Get position using S-curve profile
   * @param {number} t - Time in seconds
   * @param {Object} profile - Calculated profile
   * @param {number} distance - Total distance
   * @returns {number} Position at time t
   */
  getPosition(t, profile, distance) {
    const sign = Math.sign(distance);
    const { t_j, t_a, j_max, a_max, v_max } = profile;
    let position = 0;
    
    // Jerk phase 1 (increasing acceleration)
    if (t <= t_j) {
      position = (1/6) * j_max * Math.pow(t, 3);
    }
    // Constant acceleration phase
    else if (t <= t_a) {
      const t_const = t - t_j;
      position = (1/6) * j_max * Math.pow(t_j, 3) +
                 0.5 * a_max * Math.pow(t_const, 2) + 
                 a_max * t_j * t_const;
    }
    // Jerk phase 2 (decreasing acceleration)
    else if (t <= t_a + t_j) {
      const t_jerk2 = t - t_a;
      position = (1/6) * j_max * Math.pow(t_j, 3) +
                 0.5 * a_max * Math.pow(t_a - t_j, 2) + 
                 a_max * t_j * (t_a - t_j) +
                 v_max * t_jerk2 - (1/6) * j_max * Math.pow(t_jerk2, 3);
    }
    // Continue with constant velocity and deceleration phases...
    
    return position * sign;
  }
}

/**
 * Multi-axis motion profile coordinator
 * Ensures all joints reach target at the same time
 */
export class MultiAxisProfiler {
  constructor(options = {}) {
    this.profileType = options.profileType || 'trapezoidal';
    this.constraints = options.constraints || {};
  }

  /**
   * Calculate synchronized profiles for multiple joints
   * @param {Object} currentJoints - Current joint values
   * @param {Object} targetJoints - Target joint values
   * @param {Object} jointLimits - Velocity/acceleration limits per joint
   * @returns {Object} Profiles for each joint
   */
  calculateSynchronizedProfiles(currentJoints, targetJoints, jointLimits) {
    const profiles = {};
    let maxTime = 0;
    
    // First pass: calculate individual profiles
    Object.keys(targetJoints).forEach(jointName => {
      const current = currentJoints[jointName] || 0;
      const target = targetJoints[jointName];
      const distance = target - current;
      
      if (Math.abs(distance) < 0.0001) {
        profiles[jointName] = { 
          type: 'static', 
          distance: 0, 
          t_total: 0 
        };
        return;
      }
      
      const limits = jointLimits[jointName] || {
        maxVelocity: 1.0,
        maxAcceleration: 2.0
      };
      
      const profiler = new TrapezoidalProfile(limits);
      const profile = profiler.calculateProfile(distance);
      
      profiles[jointName] = {
        ...profile,
        distance,
        current,
        target,
        profiler
      };
      
      maxTime = Math.max(maxTime, profile.t_total);
    });
    
    // Second pass: scale velocities to synchronize
    Object.keys(profiles).forEach(jointName => {
      const profile = profiles[jointName];
      if (profile.type === 'static') return;
      
      const timeRatio = profile.t_total / maxTime;
      
      // Scale velocity and acceleration to match synchronized time
      profile.v_max *= timeRatio;
      profile.a_max *= timeRatio * timeRatio;
      profile.t_total = maxTime;
      
      // Recalculate profile with new constraints
      const scaledProfiler = new TrapezoidalProfile({
        maxVelocity: profile.v_max,
        maxAcceleration: profile.a_max
      });
      
      profiles[jointName] = {
        ...scaledProfiler.calculateProfile(profile.distance),
        distance: profile.distance,
        current: profile.current,
        target: profile.target,
        profiler: scaledProfiler
      };
    });
    
    return { profiles, totalTime: maxTime };
  }

  /**
   * Get interpolated joint values at time t
   * @param {number} t - Time in seconds
   * @param {Object} profileData - Synchronized profile data
   * @returns {Object} Joint values at time t
   */
  getJointValues(t, profileData) {
    const { profiles } = profileData;
    const jointValues = {};
    
    Object.keys(profiles).forEach(jointName => {
      const profile = profiles[jointName];
      
      if (profile.type === 'static') {
        jointValues[jointName] = profile.target || profile.current || 0;
      } else {
        const position = profile.profiler.getPosition(t, profile, profile.distance);
        jointValues[jointName] = profile.current + position;
      }
    });
    
    return jointValues;
  }

  /**
   * Get interpolation progress (0-1)
   * @param {number} t - Time in seconds
   * @param {Object} profileData - Profile data
   * @returns {number} Progress from 0 to 1
   */
  getProgress(t, profileData) {
    return Math.min(t / profileData.totalTime, 1);
  }
}

/**
 * Create a motion profile instance of the specified type
 * @param {string} type - Profile type ('trapezoidal' or 's-curve')
 * @param {Object} options - Configuration options
 * @returns {TrapezoidalProfile|SCurveProfile} Motion profile instance
 */
export function createMotionProfile(type = 'trapezoidal', options = {}) {
  switch (type) {
    case 's-curve':
      return new SCurveProfile(options);
    case 'trapezoidal':
    default:
      return new TrapezoidalProfile(options);
  }
} 