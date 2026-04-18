export const SENSOR_CONFIG = {
  temperature: { 
    label: "Temperature", 
    unit: "°C", 
    defaultThresholds: { warning: 80, critical: 95 } 
  },
  vibration: { 
    label: "Vibration", 
    unit: "g", 
    defaultThresholds: { warning: 1.2, critical: 1.8 } 
  },
  rpm: { 
    label: "RPM", 
    unit: "rev/min", 
    defaultThresholds: { warning: 2500, critical: 3000 } 
  },
  current: { 
    label: "Current", 
    unit: "A", 
    defaultThresholds: { warning: 15, critical: 20 } 
  }
};

export const SENSOR_FIELDS = Object.keys(SENSOR_CONFIG);
