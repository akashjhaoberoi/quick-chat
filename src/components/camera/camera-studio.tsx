"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CameraCapture, type Captured } from "./camera-capture";
import { MediaEditor, toEditorSource, type EditedMedia, type EditorSource } from "./media-editor";
import { SendSheet, type SendResult } from "./send-sheet";

type Stage = { step: "capture" } | { step: "edit"; source: EditorSource } | { step: "send"; source: EditorSource; media: EditedMedia };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /camera — capture or upload → edit → send (?to={userId}, ?mode=story). */
export function CameraStudio() {
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get("to");
  const initialRecipients = to && UUID_RE.test(to) ? [to] : [];
  const initialStory = params.get("mode") === "story";

  const [stage, setStage] = useState<Stage>({ step: "capture" });
  // Object URLs for the user's own local media; revoked when replaced or on leave.
  const urls = useRef(new Set<string>());
  const bitmaps = useRef(new Set<ImageBitmap>());

  useEffect(() => {
    const u = urls.current;
    const b = bitmaps.current;
    return () => {
      u.forEach((x) => URL.revokeObjectURL(x));
      b.forEach((x) => x.close());
      u.clear();
      b.clear();
    };
  }, []);

  const releaseAll = () => {
    urls.current.forEach((x) => URL.revokeObjectURL(x));
    bitmaps.current.forEach((x) => x.close());
    urls.current.clear();
    bitmaps.current.clear();
  };

  const onCapture = (c: Captured) => {
    let videoUrl: string | undefined;
    if (c.kind === "video") {
      videoUrl = URL.createObjectURL(c.blob);
      urls.current.add(videoUrl);
    } else {
      bitmaps.current.add(c.bitmap);
    }
    setStage({ step: "edit", source: toEditorSource(c, videoUrl) });
  };

  const retake = () => {
    releaseAll();
    setStage({ step: "capture" });
  };

  const close = () => {
    if (window.history.length > 1) router.back();
    else router.push("/home");
  };

  const onSent = (r: SendResult) => {
    releaseAll();
    router.replace(r.snapId ? "/snaps?tab=sent" : "/stories");
  };

  return (
    <div className="fixed inset-0 z-40 bg-black md:static md:z-auto md:flex md:h-dvh md:items-center md:justify-center md:p-6">
      <div className="relative h-full w-full overflow-hidden md:aspect-[9/16] md:h-full md:w-auto md:max-w-full md:rounded-3xl md:shadow-[var(--shadow-pop)]">
        {stage.step === "capture" ? (
          <CameraCapture onCapture={onCapture} onClose={close} />
        ) : (
          <>
            {/* Kept mounted while sending so "Back" returns to the same edits. */}
            <div className={stage.step === "send" ? "hidden" : "h-full w-full"}>
              <MediaEditor
                source={stage.source}
                onRetake={retake}
                onDone={(media) => {
                  if (media.kind === "image") urls.current.add(media.previewUrl);
                  setStage({ step: "send", source: stage.source, media });
                }}
              />
            </div>
            {stage.step === "send" ? (
              <SendSheet
                media={stage.media}
                initialRecipients={initialRecipients}
                initialStory={initialStory}
                onBack={() => {
                  if (stage.media.kind === "image") {
                    URL.revokeObjectURL(stage.media.previewUrl);
                    urls.current.delete(stage.media.previewUrl);
                  }
                  setStage({ step: "edit", source: stage.source });
                }}
                onSent={onSent}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
