import { Suspense } from "react";
import { CameraStudio } from "@/components/camera/camera-studio";

export default function CameraPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black md:static md:h-dvh" />}>
      <CameraStudio />
    </Suspense>
  );
}
