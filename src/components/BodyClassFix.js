"use client";

import { useEffect } from "react";

export default function BodyClassFix() {
  useEffect(() => {
    document.body.classList.add("antigravity-scroll-lock");

    return () => {
      document.body.classList.remove("antigravity-scroll-lock");
    };
  }, []);

  return null;
}
