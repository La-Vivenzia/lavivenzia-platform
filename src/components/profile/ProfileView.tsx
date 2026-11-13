"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Compass,
  Laptop,
  Lock,
  LogOut,
  MapPin,
  Shield,
  Smartphone,
  Sparkles,
  User,
  Utensils,
} from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  CLUSTER_OPTIONS,
  type ClusterKey,
  DIETARY_OPTIONS,
  type DietaryKey,
  PROFILE_LIMITS,
  VIBE_OPTIONS,
  type VibeKey,
} from "@/modules/user-profile/profile";
import type { UserProfile, UserSessionItem } from "@/modules/user-profile/types";

type TabId = "personal" | "taste" | "security" | "journeys";

interface ProfileViewProps {
  readonly initialProfile: UserProfile;
  readonly initialSessions: readonly UserSessionItem[];
}

export function ProfileView({ initialProfile, initialSessions }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [sessions, setSessions] = useState<readonly UserSessionItem[]>(initialSessions);
  const [activeTab, setActiveTab] = useState<TabId>("personal");

  // Personal details state
  const [fullName, setFullName] = useState(initialProfile.fullName ?? "");
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl ?? "");
  const [avatarError, setAvatarError] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAlert, setProfileAlert] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  // Taste preferences state
  const [dietary, setDietary] = useState<readonly DietaryKey[]>(initialProfile.preferences.dietary);
  const [vibes, setVibes] = useState<readonly VibeKey[]>(initialProfile.preferences.vibes);
  const [clusters, setClusters] = useState<readonly ClusterKey[]>(
    initialProfile.preferences.clusters,
  );
  const [tasteSaving, setTasteSaving] = useState(false);
  const [tasteAlert, setTasteAlert] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordAlert, setPasswordAlert] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [sessionAlert, setSessionAlert] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  // Formatting helpers
  const initials = (profile.fullName || profile.email || "LV")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const memberSinceYear = new Date(profile.createdAt).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  // Handlers
  async function handleSavePersonal(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileAlert(null);

    try {
      const res = await api.patch<{ profile: UserProfile }>("/api/v1/user/profile", {
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
      });
      setProfile(res.profile);
      setProfileAlert({ tone: "success", message: "Personal details updated with distinction." });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to update profile. Please try again.";
      setProfileAlert({ tone: "danger", message: msg });
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleDietary(val: DietaryKey) {
    if (val === "none") {
      setDietary(dietary.includes("none") ? [] : ["none"]);
      return;
    }
    const withoutNone = dietary.filter((d) => d !== "none");
    if (withoutNone.includes(val)) {
      setDietary(withoutNone.filter((d) => d !== val));
    } else {
      setDietary([...withoutNone, val]);
    }
  }

  function toggleVibe(val: VibeKey) {
    if (vibes.includes(val)) {
      setVibes(vibes.filter((v) => v !== val));
    } else {
      setVibes([...vibes, val]);
    }
  }

  function toggleCluster(val: ClusterKey) {
    if (clusters.includes(val)) {
      setClusters(clusters.filter((c) => c !== val));
    } else {
      setClusters([...clusters, val]);
    }
  }

  async function handleSaveTaste(e: FormEvent) {
    e.preventDefault();
    setTasteSaving(true);
    setTasteAlert(null);

    try {
      const res = await api.patch<{ profile: UserProfile }>("/api/v1/user/profile", {
        preferences: { dietary, vibes, clusters },
      });
      setProfile(res.profile);
      setTasteAlert({
        tone: "success",
        message:
          "Taste preferences saved. VivenIQ and our hosts will tailor your journeys accordingly.",
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save preferences.";
      setTasteAlert({ tone: "danger", message: msg });
    } finally {
      setTasteSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordAlert(null);

    if (newPassword !== confirmPassword) {
      setPasswordAlert({ tone: "danger", message: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await api.post<{ ok: boolean; revokedSessions: number }>(
        "/api/v1/user/password",
        { currentPassword, newPassword },
      );
      setPasswordAlert({
        tone: "success",
        message: `Password updated securely. ${res.revokedSessions} other session(s) signed out.`,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Refresh sessions
      const sessionRes = await api.get<{ sessions: UserSessionItem[] }>("/api/v1/user/sessions");
      setSessions(sessionRes.sessions);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not update password. Please check your current password.";
      setPasswordAlert({ tone: "danger", message: msg });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleRevokeOtherSessions() {
    if (!confirm("Are you sure you want to sign out of all other devices?")) return;

    setRevokingSessions(true);
    setSessionAlert(null);

    try {
      const res = await api.delete<{ revokedSessions: number }>("/api/v1/user/sessions");
      setSessionAlert({
        tone: "success",
        message: `Signed out of ${res.revokedSessions} other active device(s).`,
      });
      // Filter sessions locally to keep only the current one
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to sign out other devices.";
      setSessionAlert({ tone: "danger", message: msg });
    } finally {
      setRevokingSessions(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Patron Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-surface-1 p-6 sm:p-8 lg:p-10 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-2 text-xl font-medium tracking-wider text-text">
              {profile.avatarUrl && !avatarError ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.fullName ?? "Patron Avatar"}
                  fill
                  sizes="80px"
                  className="object-cover"
                  onError={() => setAvatarError(true)}
                  unoptimized
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-light text-text sm:text-3xl">
                  {profile.fullName || "Esteemed Patron"}
                </h1>
                {profile.emailVerifiedAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold-light/40 px-2.5 py-0.5 text-[10px] tracking-wider uppercase text-gold font-medium">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                    Verified
                  </span>
                ) : null}
              </div>

              <p className="text-[13px] text-text-subtle font-light">{profile.email}</p>
              <p className="text-[11px] text-text-subtle/80 tracking-wide uppercase">
                Member of La Vivenzia since {memberSinceYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-center">
            {profile.roles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-medium tracking-wider uppercase text-text-muted"
              >
                {r.replace("_", " ")}
              </span>
            ))}

            <form action="/sign-out" method="post" className="inline-flex">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 py-1 text-[11px] font-medium tracking-wider uppercase text-text-muted hover:border-danger/40 hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-line">
        <nav className="-mb-px flex space-x-6 overflow-x-auto pb-1" aria-label="Settings tabs">
          {[
            { id: "personal", label: "Personal Details", icon: User },
            { id: "taste", label: "Taste & Curation", icon: Utensils },
            { id: "security", label: "Security & Devices", icon: Shield },
            { id: "journeys", label: "My Curations", icon: Compass },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabId)}
                className={cn(
                  "group inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-[13px] font-medium tracking-wide uppercase transition-colors duration-200",
                  isSelected
                    ? "border-gold text-gold"
                    : "border-transparent text-text-muted hover:border-line-strong hover:text-text",
                )}
                aria-current={isSelected ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isSelected ? "text-gold" : "text-text-subtle group-hover:text-text",
                  )}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Personal Details */}
      {activeTab === "personal" && (
        <form onSubmit={handleSavePersonal} className="flex max-w-2xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl text-text">Personal Details</h2>
            <p className="text-[13px] text-text-subtle font-light">
              Your name, contact coordinates, and the narrative you share with hosts across Pune.
            </p>
          </div>

          {profileAlert && (
            <Alert tone={profileAlert.tone}>
              <p>{profileAlert.message}</p>
            </Alert>
          )}

          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-1 p-6 sm:p-8">
            <TextField
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={PROFILE_LIMITS.fullName}
              placeholder="e.g. Victoria Sterling"
              hint={`${fullName.length}/${PROFILE_LIMITS.fullName}`}
              help="How our hosts and concierge will address you."
            />

            <TextField
              label="Contact Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={PROFILE_LIMITS.phone}
              placeholder="+91 98765 43210"
              help="Used solely for critical reservation updates and private transport coordination."
            />

            <TextField
              label="Avatar Image URL"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setAvatarError(false);
              }}
              maxLength={PROFILE_LIMITS.avatarUrl}
              placeholder="https://images.unsplash.com/..."
              help="Direct secure HTTPS image URL for your patron profile portrait."
            />

            <TextAreaField
              label="Patron Bio & Notes"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={PROFILE_LIMITS.bio}
              placeholder="Tell our hosts about your travel style, connoisseur passions, or private interests..."
              hint={`${bio.length}/${PROFILE_LIMITS.bio}`}
              help="Shared with hosts when your intimate booking is confirmed."
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={profileSaving}
                loading={profileSaving}
              >
                Save Details
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Taste & Curation */}
      {activeTab === "taste" && (
        <form onSubmit={handleSaveTaste} className="flex max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl text-text">Taste & Palate Preferences</h2>
            <p className="text-[13px] text-text-subtle font-light">
              Fine-tune your personal culinary and exploration parameters. VivenIQ AI Concierge and
              private estate hosts adapt pairings and itineraries to your choices.
            </p>
          </div>

          {tasteAlert && (
            <Alert tone={tasteAlert.tone}>
              <p>{tasteAlert.message}</p>
            </Alert>
          )}

          {/* Dietary Restrictions */}
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-6 sm:p-8">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium tracking-wide uppercase text-text">
                Dietary Discipline & Dining Preferences
              </h3>
              <p className="text-[12px] text-text-subtle">
                Private dining chefs and master distillers strictly honor these requirements.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {DIETARY_OPTIONS.map((opt) => {
                const isSelected = dietary.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleDietary(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium tracking-wider uppercase transition-all duration-200",
                      isSelected
                        ? "border border-gold bg-gold/15 text-gold shadow-sm"
                        : "border border-line bg-surface-2 text-text-muted hover:border-line-strong hover:text-text",
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vibe Selection */}
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-6 sm:p-8">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium tracking-wide uppercase text-text">
                Preferred Experiential Vibes
              </h3>
              <p className="text-[12px] text-text-subtle">
                Choose the atmospheres that resonate most with your leisure time.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {VIBE_OPTIONS.map((opt) => {
                const isSelected = vibes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleVibe(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium tracking-wider uppercase transition-all duration-200",
                      isSelected
                        ? "border border-gold bg-gold/15 text-gold shadow-sm"
                        : "border border-line bg-surface-2 text-text-muted hover:border-line-strong hover:text-text",
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pune Neighborhood Clusters */}
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-6 sm:p-8">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium tracking-wide uppercase text-text">
                Favorite Pune Neighborhood Clusters
              </h3>
              <p className="text-[12px] text-text-subtle">
                Prioritize experiences in proximity to your Pune residences and private clubs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {CLUSTER_OPTIONS.map((opt) => {
                const isSelected = clusters.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleCluster(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium tracking-wider uppercase transition-all duration-200",
                      isSelected
                        ? "border border-gold bg-gold/15 text-gold shadow-sm"
                        : "border border-line bg-surface-2 text-text-muted hover:border-line-strong hover:text-text",
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 opacity-70" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Button type="submit" variant="primary" disabled={tasteSaving} loading={tasteSaving}>
              Save Preferences
            </Button>
          </div>
        </form>
      )}

      {/* Tab 3: Security & Devices */}
      {activeTab === "security" && (
        <div className="flex max-w-2xl flex-col gap-10">
          {/* Password Security */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl text-text">Account Authentication</h2>
              <p className="text-[13px] text-text-subtle font-light">
                Manage your credentials and access protections.
              </p>
            </div>

            {profile.hasPassword ? (
              <form
                onSubmit={handleChangePassword}
                className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-1 p-6 sm:p-8"
              >
                <h3 className="text-sm font-medium tracking-wide uppercase text-text">
                  Change Password
                </h3>

                {passwordAlert && (
                  <Alert tone={passwordAlert.tone}>
                    <p>{passwordAlert.message}</p>
                  </Alert>
                )}

                <TextField
                  type="password"
                  label="Current Password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                />

                <TextField
                  type="password"
                  label="New Password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  help="Must be at least 8 characters long."
                />

                <TextField
                  type="password"
                  label="Confirm New Password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={passwordSaving}
                    loading={passwordSaving}
                  >
                    Update Password
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-gold/30 bg-gold-light/20 p-6 flex items-start gap-4">
                <Lock className="h-5 w-5 text-gold shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-text">Passwordless Magic Code Sign-in</h3>
                  <p className="text-[13px] text-text-subtle leading-relaxed font-light">
                    Your patron account is authenticated securely via one-time magic codes sent
                    directly to <span className="font-medium text-text">{profile.email}</span>. No
                    static password to remember or compromise.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Active Devices & Sessions */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-lg text-text">Active Devices & Sessions</h3>
                <p className="text-[12px] text-text-subtle">
                  Devices currently authorized to access your La Vivenzia account.
                </p>
              </div>

              {sessions.length > 1 && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={revokingSessions}
                  loading={revokingSessions}
                  onClick={handleRevokeOtherSessions}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out Other Devices
                </Button>
              )}
            </div>

            {sessionAlert && (
              <Alert tone={sessionAlert.tone}>
                <p>{sessionAlert.message}</p>
              </Alert>
            )}

            <div className="divide-y divide-line rounded-2xl border border-line bg-surface-1 overflow-hidden">
              {sessions.map((sess) => {
                const isMobile = /iOS|Android/i.test(sess.device);
                const Icon = isMobile ? Smartphone : Laptop;

                return (
                  <div
                    key={sess.id}
                    className="flex items-center justify-between p-4 sm:p-5 transition-colors hover:bg-surface-2/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-text">
                        <Icon className="h-5 w-5 opacity-80" />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-text">{sess.device}</span>
                          {sess.isCurrent ? (
                            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-success">
                              This Device
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-text-subtle">
                          {sess.ip ? `IP: ${sess.ip} • ` : ""}
                          Last seen{" "}
                          {new Date(sess.lastSeenAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: My Curations & Journeys */}
      {activeTab === "journeys" && (
        <div className="flex max-w-4xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl text-text">Your Curations & Journeys</h2>
            <p className="text-[13px] text-text-subtle font-light">
              Direct access to your scheduled Pune experiences, private bookings, and custom
              itineraries.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Link
              href="/journeys"
              className="group flex flex-col justify-between rounded-2xl border border-line bg-surface-1 p-6 transition-all duration-200 hover:border-gold/50 hover:bg-surface-2/60"
            >
              <div className="flex flex-col gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold-light/20 text-gold">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg text-text group-hover:text-gold transition-colors">
                  Signature Journeys
                </h3>
                <p className="text-[13px] text-text-subtle leading-relaxed font-light">
                  Choreographed multi-venue evening arcs in Pune with single VIP pass entry and
                  companion routing.
                </p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold">
                View Journeys →
              </span>
            </Link>

            <Link
              href="/experiences"
              className="group flex flex-col justify-between rounded-2xl border border-line bg-surface-1 p-6 transition-all duration-200 hover:border-gold/50 hover:bg-surface-2/60"
            >
              <div className="flex flex-col gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-text">
                  <Compass className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg text-text group-hover:text-gold transition-colors">
                  Explore Curated Pune
                </h3>
                <p className="text-[13px] text-text-subtle leading-relaxed font-light">
                  Browse third-wave roasters, private heritage walks, micro-vineyards, and sunset
                  retreats.
                </p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted group-hover:text-gold transition-colors">
                Discover More →
              </span>
            </Link>
          </div>

          {/* VivenIQ Concierge Callout */}
          <div className="rounded-2xl border border-gold/30 bg-surface-1 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gold-light/30 text-gold">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-lg text-text">VivenIQ Private Concierge</h3>
                <p className="text-[13px] text-text-subtle leading-relaxed max-w-xl font-light">
                  Powered by curated AI with high-touch hospitality tone. Ask for customized 48-hour
                  Pune weekend itineraries tailored to your taste profile.
                </p>
              </div>
            </div>

            <Link
              href="/viveniq"
              className="shrink-0 rounded-pill bg-gold px-6 py-2.5 text-xs font-medium tracking-wider uppercase text-ink transition-transform hover:scale-[1.02] shadow-sm"
            >
              Curate With VivenIQ
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
