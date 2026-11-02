"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Camera, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SetupNotice, Spinner } from "@/components/ui/feedback";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { uploadMedia, type UploadHandle } from "@/lib/upload";
import { qk } from "@/lib/query-keys";
import { displayNameSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/models";
import { FormAlert } from "./auth-bits";
import { UsernameField, useUsernameAvailability } from "./username-field";

const STEPS = ["Username", "About you", "Photo"] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                done ? "bg-brand text-white" : active ? "brand-gradient text-white shadow-[var(--shadow-soft)]" : "bg-surface-3 text-muted",
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-semibold sm:inline", active ? "text-ink" : "text-muted")}>{label}</span>
            {i < STEPS.length - 1 ? <span className={cn("h-0.5 flex-1 rounded-full", done ? "bg-brand" : "bg-surface-3")} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, loading, signOut } = useSession();
  const config = useAppConfig();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const upload = useRef<UploadHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const initialised = useRef(false);
  const availability = useUsernameAvailability(username);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace("/login?next=/onboarding");
      return;
    }
    if (me.profile.status === "suspended" || me.profile.status === "banned") router.replace("/suspended");
    else if (me.profile.onboarded) router.replace("/home");
    else if (!initialised.current) {
      initialised.current = true;
      // Auto-generated fallback names ("user1a2b…") are not a good suggestion.
      setUsername(/^user[0-9a-f]{10}$/.test(me.profile.username) ? "" : me.profile.username);
      setDisplayName(me.profile.display_name);
      setBio(me.profile.bio);
      setAvatarId(me.profile.avatar_media_id);
    }
  }, [loading, me, router]);

  useEffect(() => () => upload.current?.cancel(), []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (loading || !me || me.profile.onboarded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setProgress(0);
    const handle = uploadMedia(file, { purpose: "avatar", onProgress: setProgress });
    upload.current = handle;
    handle.promise
      .then((m) => setAvatarId(m.id))
      .catch((err) => {
        setPreview(null);
        if ((err as { code?: string }).code !== "cancelled") setError(errorMessage(err));
      })
      .finally(() => {
        setProgress(null);
        upload.current = null;
      });
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      if (avatarId !== me!.profile.avatar_media_id || bio !== me!.profile.bio) {
        await api.patch<Profile>("/api/profiles/me", {
          ...(avatarId !== me!.profile.avatar_media_id ? { avatarMediaId: avatarId } : {}),
          ...(bio !== me!.profile.bio ? { bio } : {}),
        });
      }
      await api.post<Profile>("/api/users/me/onboarding", { username: availability.value, displayName: displayName.trim() });
      await queryClient.invalidateQueries({ queryKey: qk.me });
      toast.success("Welcome to Quick Chat!");
      router.replace("/home");
    } catch (err) {
      setError(errorMessage(err));
      setFinishing(false);
    }
  }

  const uploadsEnabled = config.data?.features.uploads ?? false;
  const uploading = progress !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <button type="button" onClick={() => void signOut()} className="text-sm font-semibold text-muted hover:text-ink">
          Sign out
        </button>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-12 pt-4 sm:items-center">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <Stepper step={step} />
          {error ? <FormAlert>{error}</FormAlert> : null}
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              {step === 0 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (availability.ok) setStep(1);
                  }}
                  className="space-y-5"
                >
                  <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-tight">Pick your username</h1>
                    <p className="mt-1 text-sm text-muted">This is how friends find and add you. You can change it later.</p>
                  </div>
                  <UsernameField value={username} onChange={setUsername} availability={availability} autoFocus />
                  <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={!availability.ok}>
                    Continue
                  </Button>
                </form>
              ) : step === 1 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const r = displayNameSchema.safeParse(displayName);
                    if (!r.success) {
                      setNameError(r.error.issues[0]?.message ?? "Required");
                      return;
                    }
                    setNameError(null);
                    setStep(2);
                  }}
                  className="space-y-5"
                  noValidate
                >
                  <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-tight">Tell people about you</h1>
                    <p className="mt-1 text-sm text-muted">Your display name appears in chats and on your profile.</p>
                  </div>
                  <Field label="Display name" error={nameError}>
                    {(p) => <Input {...p} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} autoFocus autoComplete="name" />}
                  </Field>
                  <Field label="Bio (optional)" hint={`${bio.length}/300`}>
                    {(p) => <Textarea {...p} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} placeholder="A few words about yourself" />}
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="lg" onClick={() => setStep(0)}>
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button type="submit" variant="gradient" size="lg" className="flex-1">
                      Continue
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-tight">Add a profile photo</h1>
                    <p className="mt-1 text-sm text-muted">Optional — helps friends recognise you.</p>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="Selected profile photo" className="h-28 w-28 rounded-full object-cover ring-4 ring-brand-soft" />
                      ) : (
                        <Avatar mediaId={avatarId} name={displayName || username} size="2xl" />
                      )}
                      {uploading ? (
                        <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/55 text-xs font-bold text-white">
                          <Loader2 className="mb-1 h-5 w-5 animate-spin" />
                          {Math.round((progress ?? 0) * 100)}%
                        </span>
                      ) : null}
                    </div>
                    {uploadsEnabled ? (
                      <div className="flex gap-2">
                        <input
                          ref={fileInput}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                          className="sr-only"
                          aria-label="Choose profile photo"
                          onChange={(e) => {
                            pickFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                          {avatarId ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                          {avatarId ? "Change photo" : "Upload photo"}
                        </Button>
                        {uploading ? (
                          <Button variant="ghost" onClick={() => upload.current?.cancel()}>
                            Cancel
                          </Button>
                        ) : avatarId ? (
                          <Button
                            variant="ghost"
                            aria-label="Remove photo"
                            onClick={() => {
                              setAvatarId(null);
                              setPreview(null);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ) : config.isPending ? null : (
                      <SetupNotice feature="Photo uploads">You can add a photo later once media storage is configured.</SetupNotice>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="lg" onClick={() => setStep(1)} disabled={finishing}>
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button variant="gradient" size="lg" className="flex-1" loading={finishing} disabled={uploading} onClick={() => void finish()}>
                      {avatarId ? "Finish" : "Skip & finish"}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-muted">
            <LogoMark className="h-4 w-4" /> Signed in as {me.user.email}
          </p>
        </div>
      </main>
    </div>
  );
}

/** Standalone first-run setup (outside the app shell). */
export function OnboardingFlow() {
  return (
    <SessionProvider>
      <OnboardingInner />
    </SessionProvider>
  );
}
