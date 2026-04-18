import React from "react";
import TextInput from "@leafygreen-ui/text-input";
import TextArea from "@leafygreen-ui/text-area";

/**
 * STEP 4 & 5: Bind ALL fields as controlled components.
 * Props: workOrder (data object), onChange (callback to update state)
 */
export default function WorkOrderForm({ workOrder, onChange }) {
  // STEP 6: NULL / EMPTY STATE
  if (!workOrder) {
    return (
      <div className="flex items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-gray-400">
        No work order selected. Generate tasks or select one from the list.
      </div>
    );
  }

  // STEP 7: DEBUG
  console.log("Rendering WorkOrderForm for:", workOrder.id);

  const updateField = (field, value) => {
    onChange({ ...workOrder, [field]: value });
  };

  return (
    <div className="flex flex-col w-full gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center border-b pb-4 mb-2">
         <h4 className="text-lg font-bold text-gray-800">Edit Task: {workOrder.id}</h4>
         <div className={`px-3 py-1 rounded-full text-xs font-bold ${workOrder.priority === 'P1' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
            {workOrder.priority}
         </div>
      </div>

      <TextInput
        label="Task Title"
        value={workOrder.title || ""}
        onChange={(e) => updateField("title", e.target.value)}
        className="mb-1"
      />
      
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Machine ID"
          value={workOrder.machineId || ""}
          onChange={(e) => updateField("machineId", e.target.value)}
          className="mb-1"
        />
        <TextInput
          label="Est. Duration (Steps/Hours)"
          value={workOrder.duration || ""}
          onChange={(e) => updateField("duration", e.target.value)}
          className="mb-1"
        />
      </div>

      <TextInput
        label="Required Skills"
        value={workOrder.skills || ""}
        onChange={(e) => updateField("skills", e.target.value)}
        className="mb-1"
      />

      <TextInput
        label="Required Materials"
        value={workOrder.materials || ""}
        onChange={(e) => updateField("materials", e.target.value)}
        className="mb-1"
      />

      <TextArea
        label="Detailed Description"
        value={workOrder.description || ""}
        onChange={(e) => updateField("description", e.target.value)}
        className="mb-1"
        rows={3}
      />

      <TextArea
        label="Technical Observations"
        value={workOrder.observations || ""}
        onChange={(e) => updateField("observations", e.target.value)}
        className="mb-1"
        rows={3}
      />
    </div>
  );
}
