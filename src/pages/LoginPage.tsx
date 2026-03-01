import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { pocketbaseService } from '../services/mcpPocketbaseService'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

// Pure-JS SHA-256 fallback for non-secure HTTP contexts (crypto.subtle unavailable)
function rotr32(v: number, n: number): number {
  return ((v >>> n) | (v << (32 - n))) >>> 0
}

function sha256PureJS(bytes: number[]): string {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]
  let H: [number,number,number,number,number,number,number,number] = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ]
  const origLen = bytes.length
  const padded = [...bytes, 0x80]
  while (padded.length % 64 !== 56) padded.push(0)
  const bitLen = origLen * 8
  padded.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff)
  for (let b = 0; b < padded.length; b += 64) {
    const W = new Array<number>(64)
    for (let i = 0; i < 16; i++) {
      const j = b + i * 4
      W[i] = ((padded[j] << 24) | (padded[j+1] << 16) | (padded[j+2] << 8) | padded[j+3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(W[i-15],7) ^ rotr32(W[i-15],18) ^ (W[i-15] >>> 3)
      const s1 = rotr32(W[i-2],17) ^ rotr32(W[i-2],19) ^ (W[i-2] >>> 10)
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0
    }
    let [a,b2,c,d,e,f,g,h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22)
      const maj = (a & b2) ^ (a & c) ^ (b2 & c)
      const t2 = (S0 + maj) >>> 0
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b2; b2=a; a=(t1+t2)>>>0
    }
    H = [(H[0]+a)>>>0,(H[1]+b2)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0]
  }
  return H.map(n => n.toString(16).padStart(8,'0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = Array.from(new TextEncoder().encode(text))
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
  return sha256PureJS(bytes)
}

// Sun icon for light mode
function SunIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  )
}

// Moon icon for dark mode
function MoonIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoggedIn } = useSession()
  const { theme, toggleTheme } = useTheme()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  if (isLoggedIn) {
    navigate('/analyze', { replace: true })
    return null
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true)
    setLoginError(null)
    try {
      const profile = await pocketbaseService.getUserProfile(data.email)
      if (!profile) {
        setLoginError('Invalid email or password.')
        return
      }
      if (!profile.password_hash) {
        setLoginError('Account not configured. Please contact your administrator.')
        return
      }
      const inputHash = await sha256Hex(data.password)
      if (inputHash !== profile.password_hash) {
        setLoginError('Invalid email or password.')
        return
      }
      login(data.email, undefined, profile.profile)
      navigate('/analyze')
    } catch {
      setLoginError('Unable to sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 py-12 px-4 transition-colors duration-200">
      {/* Theme Toggle - Fixed position */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shadow-md transition-colors duration-200"
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
      </button>

      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Data Analyzer</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Sign in to analyze your datasets with AI</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 transition-colors duration-200">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="email" className="label">
                Email Address
              </label>
              <input
                {...register('email')}
                type="email"
                id="email"
                autoComplete="email"
                className="input-field"
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                id="password"
                autoComplete="current-password"
                className="input-field"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
            </div>

            {loginError && (
              <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Sign in with your credentials to access your datasets and start analyzing data with AI-powered insights.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
