import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pocketbaseService } from '../../services/mcpPocketbaseService'
import type { AdminUser } from '../../types'
import Navigation from '../../components/Navigation'

// ── Timezone list ─────────────────────────────────────────────────────────────

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Adak',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'America/Toronto',
  'America/Vancouver',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'UTC',
]

// ── SHA-256 helper (same as LoginPage) ───────────────────────────────────────

async function sha256(message: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const msgBuffer = new TextEncoder().encode(message)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Pure JS fallback
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]
  const msg = unescape(encodeURIComponent(message))
  const bytes: number[] = []
  for (let i = 0; i < msg.length; ++i) bytes.push(msg.charCodeAt(i))
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const bitLen = msg.length * 8
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff)
  for (let i = 0; i < bytes.length; i += 64) {
    const w: number[] = []
    for (let j = 0; j < 16; j++) w[j] = (bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3]
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j-15]>>>7)|(w[j-15]<<25)) ^ ((w[j-15]>>>18)|(w[j-15]<<14)) ^ (w[j-15]>>>3)
      const s1 = ((w[j-2]>>>17)|(w[j-2]<<15)) ^ ((w[j-2]>>>19)|(w[j-2]<<13)) ^ (w[j-2]>>>10)
      w[j] = (w[j-16]+s0+w[j-7]+s1) | 0
    }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7]
    for (let j = 0; j < 64; j++) {
      const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7))
      const ch = (e&f) ^ (~e&g)
      const temp1 = (h+S1+ch+k[j]+w[j]) | 0
      const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10))
      const maj = (a&b) ^ (a&c) ^ (b&c)
      const temp2 = (S0+maj) | 0
      h=g; g=f; f=e; e=(d+temp1)|0; d=c; c=b; b=a; a=(temp1+temp2)|0
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(x=>('00000000'+x.toString(16)).slice(-8)).join('')
}

// ── Profile picker ────────────────────────────────────────────────────────────

function composeProfile(companyCode: string, buCode: string, teamCode: string): string {
  return `${companyCode}${buCode || '000'}${teamCode || '000'}`
}

interface ProfilePickerProps {
  companyCode: string
  buCode: string
  teamCode: string
  onChange: (companyCode: string, buCode: string, teamCode: string) => void
}

function ProfilePicker({ companyCode, buCode, teamCode, onChange }: ProfilePickerProps) {
  const { data: companies = [] } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => pocketbaseService.listCompanies(),
  })
  const { data: bus = [] } = useQuery({
    queryKey: ['admin-bus', companyCode],
    queryFn: () => pocketbaseService.listBusinessUnits(companyCode),
    enabled: !!companyCode,
  })
  const { data: teams = [] } = useQuery({
    queryKey: ['admin-teams', companyCode, buCode],
    queryFn: () => pocketbaseService.listTeams(companyCode, buCode),
    enabled: !!companyCode && !!buCode,
  })

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Company</label>
        <select
          className="input-field"
          value={companyCode}
          onChange={(e) => onChange(e.target.value, '', '')}
        >
          <option value="">— select company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
      </div>
      {companyCode && (
        <div>
          <label className="label">Business Unit <span className="text-gray-400">(optional)</span></label>
          <select
            className="input-field"
            value={buCode}
            onChange={(e) => onChange(companyCode, e.target.value, '')}
          >
            <option value="">— none —</option>
            {bus.map((bu) => (
              <option key={bu.id} value={bu.code}>{bu.name} ({bu.code})</option>
            ))}
          </select>
        </div>
      )}
      {companyCode && buCode && (
        <div>
          <label className="label">Team <span className="text-gray-400">(optional)</span></label>
          <select
            className="input-field"
            value={teamCode}
            onChange={(e) => onChange(companyCode, buCode, e.target.value)}
          >
            <option value="">— none —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.code}>{t.name} ({t.code})</option>
            ))}
          </select>
        </div>
      )}
      {companyCode && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Profile code:</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {composeProfile(companyCode, buCode, teamCode)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── User Modal ────────────────────────────────────────────────────────────────

interface UserFormData {
  user_email: string
  password: string
  companyCode: string
  buCode: string
  teamCode: string
  user_timezone: string
}

interface UserModalProps {
  user: AdminUser | null  // null = new user
  onClose: () => void
  onSave: (data: UserFormData) => Promise<void>
  isSaving: boolean
}

function UserModal({ user, onClose, onSave, isSaving }: UserModalProps) {
  const [form, setForm] = useState<UserFormData>(() => {
    const profile = user?.profile || ''
    return {
      user_email: user?.user_email || '',
      password: '',
      companyCode: profile.slice(0, 3).trim() === '000' ? '' : profile.slice(0, 3).trim(),
      buCode: profile.slice(3, 6).trim() === '000' ? '' : profile.slice(3, 6).trim(),
      teamCode: profile.slice(6, 9).trim() === '000' ? '' : profile.slice(6, 9).trim(),
      user_timezone: user?.user_timezone || 'America/Los_Angeles',
    }
  })

  const isNew = !user

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isNew && !form.password.trim()) {
      toast.error('Password is required for new users')
      return
    }
    if (!form.companyCode) {
      toast.error('Company is required')
      return
    }
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {isNew ? 'Add User' : 'Edit User'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input-field"
                type="email"
                value={form.user_email}
                onChange={(e) => setForm((f) => ({ ...f, user_email: e.target.value }))}
                disabled={!isNew}
                required
              />
            </div>
            <div>
              <label className="label">
                {isNew ? 'Temporary Password' : 'New Password'}{' '}
                {!isNew && <span className="text-gray-400">(leave blank to keep current)</span>}
              </label>
              <input
                className="input-field"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={isNew ? 'Temporary password' : 'Leave blank to keep unchanged'}
                required={isNew}
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select
                className="input-field"
                value={form.user_timezone}
                onChange={(e) => setForm((f) => ({ ...f, user_timezone: e.target.value }))}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="pt-1">
              <label className="label mb-2 block">Profile Assignment</label>
              <ProfilePicker
                companyCode={form.companyCode}
                buCode={form.buCode}
                teamCode={form.teamCode}
                onChange={(c, b, t) => setForm((f) => ({ ...f, companyCode: c, buCode: b, teamCode: t }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserManagerPage() {
  const qc = useQueryClient()
  const [modalUser, setModalUser] = useState<AdminUser | null | undefined>(undefined) // undefined = closed
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => pocketbaseService.listAllUsers(),
  })

  const createMutation = useMutation({
    mutationFn: async (form: UserFormData) => {
      const hash = await sha256(form.password)
      return pocketbaseService.createUser({
        user_email: form.user_email,
        password_hash: hash,
        profile: composeProfile(form.companyCode, form.buCode, form.teamCode),
        user_timezone: form.user_timezone,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User created')
      setModalUser(undefined)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ user, form }: { user: AdminUser; form: UserFormData }) => {
      const updates: Parameters<typeof pocketbaseService.updateUser>[1] = {
        profile: composeProfile(form.companyCode, form.buCode, form.teamCode),
        user_timezone: form.user_timezone,
      }
      if (form.password.trim()) {
        updates.password_hash = await sha256(form.password)
      }
      return pocketbaseService.updateUser(user.id, updates)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User updated')
      setModalUser(undefined)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pocketbaseService.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User deleted')
      setConfirmDelete(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSave = async (form: UserFormData) => {
    if (modalUser === null) {
      await createMutation.mutateAsync(form)
    } else if (modalUser) {
      await updateMutation.mutateAsync({ user: modalUser, form })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Manager</h1>
          <button className="btn-primary px-4" onClick={() => setModalUser(null)}>
            Add User
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Add, edit, or remove user accounts and their profile assignments.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No users yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Profile</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Timezone</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{u.user_email}</td>
                    <td className="px-4 py-3">
                      {u.profile ? (
                        <span className="font-mono text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded">
                          {u.profile}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{u.user_timezone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          className="btn-secondary px-3 py-1 text-xs"
                          onClick={() => setModalUser(u)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger px-3 py-1 text-xs"
                          onClick={() => setConfirmDelete(u)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUser !== undefined && (
        <UserModal
          user={modalUser}
          onClose={() => setModalUser(undefined)}
          onSave={handleSave}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-gray-800 dark:text-gray-200 mb-6">
              Delete user <strong>{confirmDelete.user_email}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary px-4" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-danger px-4"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
