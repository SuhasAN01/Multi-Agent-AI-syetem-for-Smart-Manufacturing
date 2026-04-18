export const ACTION_MAP = {
  temperature: "Inspect cooling system and heat exchangers",
  vibration: "Check bearings, alignment, and mounting bolts",
  rpm: "Inspect motor speed controller and drive train",
  current: "Check electrical load, phase balance, and insulation"
};

export function getRecommendedAction(sensor) {
  return ACTION_MAP[sensor] || "General maintenance inspection required";
}
