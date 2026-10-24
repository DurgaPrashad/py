import { CircleUserRound, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { entitlements, useAccount } from './account'

/** Title-bar entry to the account: the current plan, or "Choose a plan". */
export function AccountChip() {
  const navigate = useNavigate()
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  if (!session) {
    return (
      <Button size="sm" variant="ghost" icon={<CircleUserRound size={14} />} onClick={() => navigate('/login')}>
        Sign in
      </Button>
    )
  }
  const ent = entitlements(profile)
  if (!profile) return null
  if (!ent.canPresent) {
    return (
      <Button size="sm" variant="primary" icon={<Sparkles size={13} />} onClick={() => navigate('/account')}>
        Choose a plan
      </Button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => navigate('/account')}
      title={profile.email}
      className="flex h-7 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[10.5px] font-semibold text-accent uppercase">
        {(profile.full_name || profile.email).slice(0, 1)}
      </span>
      <span className={`font-medium ${ent.si ? 'text-accent' : 'text-fg'}`}>{ent.si ? 'SI' : 'Standard'}</span>
    </button>
  )
}
