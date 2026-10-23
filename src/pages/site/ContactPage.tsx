import { CheckCircle2, Clock, CreditCard, Loader2, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount } from '../../features/account/account'
import { supabase, supabaseMessage } from '../../services/supabase'
import { PageHeader, SiteShell } from './SiteShell'

const TOPICS = [
  ['general', 'General question'],
  ['support', 'Help using the app'],
  ['billing', 'Plans & payments'],
  ['refund', 'Refund'],
  ['privacy', 'Privacy & my data'],
] as const

type Topic = (typeof TOPICS)[number][0]

export function ContactPage() {
  const profile = useAccount((s) => s.profile)
  const [search] = useSearchParams()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [topic, setTopic] = useState<Topic>(() => (TOPICS.some(([t]) => t === search.get('topic')) ? (search.get('topic') as Topic) : 'general'))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.from('contact_messages').insert({ name: name.trim(), email: email.trim(), topic, message: message.trim() })
    setBusy(false)
    if (error) setError(supabaseMessage(error))
    else setSent(true)
  }

  return (
    <SiteShell title="Contact us">
      <PageHeader eyebrow="Support" title="Contact us">
        Questions about the app, your plan, a payment or a refund? Send us a message and we'll reply by email.
      </PageHeader>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Info icon={<Clock size={18} />} title="Reply within 2 business days">
            Every message reaches the team. Most are answered the same day.
          </Info>
          <Info icon={<CreditCard size={18} />} title="Payments & refunds">
            Include your Razorpay payment ID (it's in your receipt email) so we can find the payment straight away.
          </Info>
          <Info icon={<ShieldCheck size={18} />} title="Your data">
            Ask us for a copy of your account data, or to delete your account, and we'll take care of it.
          </Info>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-emerald-200 bg-emerald-50/60 p-10 text-center">
            <CheckCircle2 size={36} className="text-emerald-600" />
            <h2 className="mt-4 text-[20px] font-semibold">Message sent</h2>
            <p className="mt-2 max-w-sm text-[14.5px] text-slate-600">Thanks, {name.split(' ')[0] || 'there'}. We'll reply to {email} soon.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={INPUT} />
              </Field>
              <Field label="Email">
                <input required type="email" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={INPUT} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Topic">
                <select value={topic} onChange={(e) => setTopic(e.target.value as Topic)} className={INPUT}>
                  {TOPICS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Message">
                <textarea
                  required
                  maxLength={5000}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help?"
                  className={`${INPUT} h-auto resize-y py-3 leading-relaxed`}
                />
              </Field>
            </div>
            {error && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Send message
            </button>
          </form>
        )}
      </section>
    </SiteShell>
  )
}

const INPUT =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function Info({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">{icon}</span>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-600">{children}</p>
      </div>
    </div>
  )
}
