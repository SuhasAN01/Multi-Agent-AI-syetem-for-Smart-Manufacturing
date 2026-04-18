import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function SensorChart({ title, data, dataKey, color, threshold, onAnomalyClick }) {
  // Custom dot rendering for anomaly highlighting
  const renderCustomDot = (props) => {
    const { cx, cy, payload } = props;
    const isAlert = payload[dataKey] > threshold;

    if (isAlert) {
      return (
        <circle 
          cx={cx} 
          cy={cy} 
          r={5} 
          stroke="red" 
          strokeWidth={3} 
          fill="#fee2e2" 
          style={{ cursor: "pointer", filter: "drop-shadow(0 0 4px rgba(255, 0, 0, 0.5))" }}
          onClick={() => {
            if (onAnomalyClick) {
              onAnomalyClick({
                sensor: title,
                dataKey,
                value: payload[dataKey],
                threshold,
                time: payload.time,
                payload
              });
            }
          }}
        />
      );
    }
    return <circle cx={cx} cy={cy} r={2} stroke={color} strokeWidth={1} fill={color} />;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 w-full h-64 flex flex-col">
      <h3 className="text-sm font-bold text-gray-700 mb-4">{title}</h3>
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#888" }}
              tickMargin={8}
            />
            <YAxis
              domain={["dataMin - 5", "dataMax + 5"]}
              tick={{ fontSize: 10, fill: "#888" }}
              width={40}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "1px solid #ddd", fontSize: "12px" }}
              itemStyle={{ color: color, fontWeight: "bold" }}
            />
            <ReferenceLine y={threshold} stroke="red" strokeDasharray="4 4" label={{ position: 'top', value: 'Threshold', fill: 'red', fontSize: 10 }} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={renderCustomDot}
              activeDot={{ r: 6 }}
              isAnimationActive={false} // Disable animation to prevent visual jitter on real-time rapid updates
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
