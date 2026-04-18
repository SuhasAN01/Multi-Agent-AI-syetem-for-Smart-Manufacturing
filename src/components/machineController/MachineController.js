import React from "react";
import Slider from "@mui/material/Slider";
import Icon from "@leafygreen-ui/icon";
import Image from "next/image";
import { useMachineController } from "./hooks";
import { SENSOR_FIELDS, SENSOR_CONFIG } from "@/config/sensorConfig";

export default function MachineController({
  status,
  sensorValues,
  onSensorChange
}) {
  useMachineController(); // For future extensibility

  return (
    <div className="flex flex-row items-center gap-3 w-full h-full min-h-[100px] max-h-[120px]">
      {/* Machine Image with alert icon */}
      <div
        className="flex items-center justify-center relative"
        style={{ flexBasis: "40%", flexGrow: 0, flexShrink: 0 }}
      >
        <Image
          src="/img/robot.png"
          alt="Machine"
          width={100}
          height={100}
          className="object-contain"
          priority
        />
        {status === "alert" && (
          <span className="absolute top-1 right-2">
            <Icon glyph="Warning" fill="red" size={25} />
          </span>
        )}
      </div>
      {/* STEP 11: Render sliders dynamically from SENSOR_FIELDS */}
      <div
        className="flex flex-col gap-1 overflow-y-auto max-h-[120px] scrollbar-hide"
        style={{ flexBasis: "60%", flexGrow: 1, flexShrink: 1 }}
      >
        {SENSOR_FIELDS.map(field => {
          const config = SENSOR_CONFIG[field];
          // Determine slider range based on critical threshold
          const max = config.defaultThresholds.critical * 1.5;
          
          return (
            <div key={field} className="mb-1">
              <div className="flex justify-between items-center text-xs font-medium">
                <span>{config.label}</span>
                <span className="text-gray-500">{sensorValues[field]} {config.unit}</span>
              </div>
              <Slider
                value={sensorValues[field]}
                min={0}
                max={max}
                step={field === 'vibration' ? 0.01 : 1}
                onChange={(_, v) => onSensorChange(field, v)}
                valueLabelDisplay="off"
                size="small"
                sx={{ py: 0.5 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
