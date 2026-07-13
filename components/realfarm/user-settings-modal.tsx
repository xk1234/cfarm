"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandYoutube,
  IconCheck,
  IconCreditCard,
  IconExternalLink,
  IconPlus,
  IconSettings,
  IconUpload,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import { cn } from "@/lib/utils"

type Tab = "billing" | "accounts" | "team" | "demos"
type Member = {
  id: string
  email: string
  status: "pending" | "accepted"
  createdAt: string
}
type Demo = { id: string; title: string; url: string; createdAt: string }

const tabs = [
  { id: "billing", label: "Billing & plans", icon: IconCreditCard },
  { id: "accounts", label: "Connected accounts", icon: IconExternalLink },
  { id: "team", label: "Team members", icon: IconUsers },
  { id: "demos", label: "Demos", icon: IconVideo },
] as const

export function UserSettingsModal({
  email,
  onClose,
}: {
  email: string
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("billing")
  return (
    <AppModal className="z-[100] bg-[#242136]/45" onClose={onClose}>
      <AppModalPanel className="max-w-[980px] overflow-hidden p-0">
        <AppModalHeader
          title="Workspace settings"
          description={email}
          closeLabel="Close settings"
          onClose={onClose}
        />
        <div className="grid min-h-[600px] md:grid-cols-[220px_1fr]">
          <nav className="border-b border-[#e7e7ee] bg-[#fafafd] p-3 md:border-r md:border-b-0">
            {tabs.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "mb-1 flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-medium",
                    tab === item.id
                      ? "bg-[#111117] text-white"
                      : "text-[#686875] hover:bg-[#f0eef8] hover:text-[#111117]"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="min-w-0 p-6 sm:p-8">
            {tab === "billing" && <BillingPanel />}
            {tab === "accounts" && <AccountsPanel />}
            {tab === "team" && <TeamPanel />}
            {tab === "demos" && <DemosPanel />}
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function PanelHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="mb-7">
      <h2 className="text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#686875]">{description}</p>
    </div>
  )
}

function BillingPanel() {
  return (
    <div>
      <PanelHeading
        title="Billing & plans"
        description="Manage your LumenClip subscription and usage."
      />
      <div className="rounded-[14px] border border-[#e4d7ff] bg-[#f6f2ff] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-[#6d28d9] uppercase">
              Current plan
            </p>
            <h3 className="mt-1 text-xl font-semibold">LumenClip Free</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6d28d9]">
            Active
          </span>
        </div>
        <p className="mt-4 text-sm text-[#686875]">
          Billing is being finalized. You’ll be able to upgrade, manage payment
          methods, and download invoices here.
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {["Generations", "Storage", "Team seats"].map((label) => (
          <div key={label} className="border-t border-[#e7e7ee] pt-4">
            <p className="text-xs font-medium text-[#858592]">{label}</p>
            <p className="mt-1 text-sm font-semibold">Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountsPanel() {
  const [accounts, setAccounts] = useState<PostFastSocialIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  async function load() {
    setLoading(true)
    const r = await fetch("/api/postfast/integrations")
    const p = await r.json().catch(() => null)
    setAccounts(Array.isArray(p?.integrations) ? p.integrations : [])
    setError(r.ok ? "" : p?.error || "Could not load accounts.")
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])
  async function connect() {
    const r = await fetch("/api/postfast/connect-url")
    const p = await r.json().catch(() => null)
    if (r.ok && p?.url) window.open(p.url, "_blank", "noopener,noreferrer")
    else setError(p?.error || "Could not create a connection link.")
  }
  return (
    <div>
      <PanelHeading
        title="Connected accounts"
        description="Connect social profiles once, then choose them in any automation."
      />
      <button
        onClick={connect}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#6d28d9] px-4 text-sm font-semibold text-white hover:bg-[#5b21b6]"
      >
        <IconPlus className="size-4" />
        Add social account
      </button>
      {error ? (
        <p className="mb-4 text-sm font-medium text-[#b43e4d]">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[#686875]">Loading connected accounts…</p>
      ) : accounts.length ? (
        <div className="divide-y divide-[#ececf1] border-y border-[#ececf1]">
          {accounts.map((a) => (
            <div
              key={`${a.provider}:${a.integration_id}`}
              className="flex items-center gap-3 py-4"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#111117] text-white">
                {a.provider === "instagram" ? (
                  <IconBrandInstagram className="size-5" />
                ) : a.provider === "youtube" ? (
                  <IconBrandYoutube className="size-5" />
                ) : (
                  <IconBrandTiktok className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {a.name || a.profile || a.provider}
                </p>
                <p className="text-xs text-[#858592] capitalize">
                  {a.provider}
                </p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#27845b]">
                <IconCheck className="size-4" />
                Connected
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconExternalLink}
          title="No social accounts yet"
          text="Connect Instagram, TikTok, YouTube, and other publishing destinations."
        />
      )}
    </div>
  )
}

function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("")
  async function load() {
    const r = await fetch("/api/settings/team")
    const p = await r.json().catch(() => null)
    if (r.ok) setMembers(p.members || [])
  }
  useEffect(() => {
    void load()
  }, [])
  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError("")
    const r = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const p = await r.json().catch(() => null)
    if (r.ok) {
      setOpen(false)
      setEmail("")
      await load()
    } else setError(p?.error || "Invitation failed.")
    setPending(false)
  }
  return (
    <div>
      <PanelHeading
        title="Team members"
        description="Collaborators can view your generations and swipes. Your automations stay private and editable only by you."
      />
      <button
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#6d28d9] px-4 text-sm font-semibold text-white"
      >
        <IconPlus className="size-4" />
        Add member
      </button>
      {members.length ? (
        <div className="divide-y divide-[#ececf1] border-y border-[#ececf1]">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-[#f0eef8] text-sm font-semibold text-[#6d28d9]">
                {m.email[0]?.toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold">{m.email}</p>
                <p className="text-xs text-[#858592]">
                  Can view shared generations and swipes
                </p>
              </div>
              <span
                className={cn(
                  "ml-auto rounded-full px-2.5 py-1 text-xs font-semibold",
                  m.status === "accepted"
                    ? "bg-[#e9f7ef] text-[#27845b]"
                    : "bg-[#fff5df] text-[#93630c]"
                )}
              >
                {m.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconUsers}
          title="No collaborators"
          text="Invite someone by email to share selected workspace output."
        />
      )}
      {open ? (
        <AppModal
          className="z-[120] bg-[#242136]/45"
          onClose={() => setOpen(false)}
        >
          <AppModalPanel className="max-w-[470px] p-0">
            <AppModalHeader
              title="Invite collaborator"
              description="They’ll receive an email invitation to LumenClip."
              closeLabel="Close invite"
              onClose={() => setOpen(false)}
            />
            <form onSubmit={invite} className="p-5">
              <label className="text-sm font-semibold">
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11 w-full rounded-[10px] border border-[#d8d8e2] px-3 outline-none focus:border-[#6d28d9]"
                />
              </label>
              {error ? (
                <p className="mt-3 text-sm text-[#b43e4d]">{error}</p>
              ) : null}
              <button
                disabled={pending}
                className="mt-5 h-10 w-full rounded-[10px] bg-[#6d28d9] text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send invitation"}
              </button>
            </form>
          </AppModalPanel>
        </AppModal>
      ) : null}
    </div>
  )
}

function DemosPanel() {
  const [demos, setDemos] = useState<Demo[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)
  async function load() {
    const r = await fetch("/api/settings/demos")
    const p = await r.json().catch(() => null)
    if (r.ok) setDemos(p.demos || [])
  }
  useEffect(() => {
    void load()
  }, [])
  async function upload(file: File) {
    setPending(true)
    setError("")
    const form = new FormData()
    form.set("file", file)
    form.set("title", file.name.replace(/\.[^.]+$/, ""))
    const r = await fetch("/api/settings/demos", { method: "POST", body: form })
    const p = await r.json().catch(() => null)
    if (r.ok) await load()
    else setError(p?.error || "Upload failed.")
    setPending(false)
  }
  return (
    <div>
      <PanelHeading
        title="Demos"
        description="Upload product walkthroughs and example videos for your workspace."
      />
      <input
        ref={input}
        hidden
        type="file"
        accept="video/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={pending}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#6d28d9] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        <IconUpload className="size-4" />
        {pending ? "Uploading…" : "Upload demo"}
      </button>
      {error ? <p className="mb-4 text-sm text-[#b43e4d]">{error}</p> : null}
      {demos.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {demos.map((d) => (
            <article
              key={d.id}
              className="overflow-hidden rounded-[14px] border border-[#e7e7ee] bg-white"
            >
              <video
                controls
                preload="metadata"
                src={d.url}
                className="aspect-video w-full bg-[#111117]"
              />
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-1 text-xs text-[#858592]">
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={IconVideo}
          title="No demos uploaded"
          text="Your uploaded walkthroughs will appear here in a reusable grid."
        />
      )}
    </div>
  )
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof IconSettings
  title: string
  text: string
}) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[#d8d8e2] bg-[#fbfbfd] p-8 text-center">
      <div>
        <Icon className="mx-auto size-6 text-[#6d28d9]" />
        <p className="mt-3 text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[#858592]">{text}</p>
      </div>
    </div>
  )
}
