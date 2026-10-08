"use client";

import dynamic from "next/dynamic";
import { Spinner } from "./ui";

export const MapView = dynamic(() => import("./FloodMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[400px] place-items-center rounded-xl bg-slate-100">
      <Spinner label="Loading map…" />
    </div>
  ),
});
