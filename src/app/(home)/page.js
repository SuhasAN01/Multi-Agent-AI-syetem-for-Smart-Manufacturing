"use client";
import { H1 } from "@leafygreen-ui/typography";
import Image from "next/image";

export default function Page() {
  return (
    <main className="flex flex-col items-center w-full min-h-[calc(100vh-4rem)] overflow-hidden mt-8 mb-8 px-4">
      {/* Title */}
      <H1 className="mt-8 mb-4 text-center">
        Multi-Agent Predictive Maintenance Demo
      </H1>
      
      {/* Amplified Diagram Section */}
      <div className="w-full flex justify-center items-center mt-10 relative">
        <div className="w-full max-w-6xl relative h-[60vh] rounded-xl shadow-lg transition-transform duration-300 hover:scale-105">
          <Image
            src="/img/steps.svg"
            alt="Workflow Diagram"
            fill
            className="object-contain rounded-xl"
            priority
            sizes="(max-width: 1200px) 100vw, 1200px"
          />
        </div>
      </div>
    </main>
  );
}
