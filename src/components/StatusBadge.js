import React from "react";

export default function StatusBadge({ severity }) {
  const styles = {
    CRITICAL: "bg-red-500 text-white",
    WARNING: "bg-yellow-400 text-black",
    NORMAL: "bg-green-500 text-white",
  };

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded ${styles[severity] || styles.NORMAL}`}>
      {severity}
    </span>
  );
}
