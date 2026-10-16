'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    rememberMe: false
  })

  // Dummy credentials for now (same for student, teacher, and admin)
  const DUMMY_CREDENTIALS = {
    identifier: 'admin123',
    password: 'password123',
  }

  const roleConfig = {
    student: {
      title: 'Student Log In',
      idLabel: 'Enrollment No.',
      idPlaceholder: 'e.g. admin123',
    },
    teacher: {
      title: 'Teacher Log In',
      idLabel: 'Teacher ID / Email',
      idPlaceholder: 'e.g. admin123',
    },
    admin: {
      title: 'Admin Log In',
      idLabel: 'Admin ID / Email',
      idPlaceholder: 'e.g. admin123',
    },
  }

  const otherRoles = (
    [
      { key: 'student', label: 'Sign in as Student' },
      { key: 'teacher', label: 'Sign in as Teacher' },
      { key: 'admin', label: 'Sign in as Admin' },
    ] as const
  ).filter((r) => r.key !== role)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    if (error) setError(null)
    if (success) setSuccess(null)
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (
      formData.identifier.trim() === DUMMY_CREDENTIALS.identifier &&
      formData.password === DUMMY_CREDENTIALS.password
    ) {
      setSuccess(`Signed in successfully as ${roleConfig[role].title.replace(' Log In', '')}! Redirecting...`)
      console.log(`Login successful for ${role}:`, formData)

      if (role === 'student') {
        setTimeout(() => {
          router.push('/student')
        }, 600)
      } else if (role === 'teacher') {
        setTimeout(() => {
          router.push('/teachers')
        }, 600)
      } else if (role === 'admin') {
        setTimeout(() => {
          router.push('/admin')
        }, 600)
      }
    } else {
      setError(`Invalid credentials. Demo ID: ${DUMMY_CREDENTIALS.identifier} | Pass: ${DUMMY_CREDENTIALS.password}`)
    }
  }

  return (
    <div className="min-h-screen md:h-screen w-screen bg-white flex flex-col md:flex-row relative">
        
        {/* Left Panel - Image Section */}
        <div className="h-64 min-h-[250px] md:h-full md:w-[45%] relative overflow-hidden shrink-0">
          {/* Overlay Text */}
          <div className="absolute top-8 left-0 right-0 z-10 px-8 flex items-start gap-3">
            <div className="w-12 h-12 bg-white rounded-full p-1 flex-shrink-0">
              <img 
                src="https://upload.wikimedia.org/wikipedia/en/c/c4/J.C._Bose_University_of_Science_and_Technology%2C_YMCA_logo.png" 
                alt="University Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-white pt-1">
              <h2 className="font-semibold text-[15px] leading-tight drop-shadow-md">
                Emmanuel Mission Sr.Sec School Dhaulpur Rajasthan
              </h2>
              <p className="text-[15px] font-medium drop-shadow-md">
                Dhaulpur, Rajasthan
              </p>
            </div>
          </div>

          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&q=80&w=2086&ixlib=rb-4.0.3"
              alt="University Building"
              className="w-full h-full object-cover"
            />
            {/* Subtle dark gradient overlay to make text readable */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent h-1/2"></div>
          </div>
        </div>

        {/* Right Panel - Form Section */}
        <div className="flex-1 flex flex-col bg-white relative py-10 md:py-0 overflow-y-auto">

          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-[400px]">
              <div className="mb-10">
                <h1 className="text-4xl font-bold text-[#1e2756]">
                  {roleConfig[role].title}
                </h1>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Demo Credentials Info Hint */}
                <div className="bg-[#eef2ff] border border-[#c7d2fe] text-[#312e81] p-3 rounded-xl text-xs flex flex-col gap-0.5">
                  <span className="font-semibold text-[#1e2756]">Demo Credentials:</span>
                  <span>ID: <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-[#1e2756]">{DUMMY_CREDENTIALS.identifier}</code> &nbsp;|&nbsp; Password: <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-[#1e2756]">{DUMMY_CREDENTIALS.password}</code></span>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                    {error}
                  </div>
                )}

                {/* Success Banner */}
                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl font-medium">
                    {success}
                  </div>
                )}

                {/* Identifier (Enrollment No. / Teacher ID / Admin ID) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    {roleConfig[role].idLabel}
                  </label>
                  <input
                    type="text"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleInputChange}
                    placeholder={roleConfig[role].idPlaceholder}
                    className="w-full px-4 py-3 bg-[#e8ebfc] border-none rounded-xl focus:ring-2 focus:ring-[#1e2756] outline-none text-gray-900 transition-shadow"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 pr-12 bg-[#e8ebfc] border-none rounded-xl focus:ring-2 focus:ring-[#1e2756] outline-none text-gray-900 transition-shadow"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-[#d5d9f0] rounded-lg transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-700" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full bg-[#111827] md:bg-[#1a2258] text-white py-3 px-4 rounded-xl font-semibold hover:bg-opacity-90 transition-opacity mt-4 shadow-md"
                >
                  Log In
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white text-gray-400 font-medium uppercase">or</span>
                  </div>
                </div>

                {/* Buttons for the other two roles */}
                <div className="grid grid-cols-2 gap-4">
                  {otherRoles.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setRole(r.key)
                        setFormData(prev => ({ ...prev, identifier: '', password: '' }))
                      }}
                      className="flex items-center justify-center px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-center"
                    >
                      <span className="text-sm font-semibold text-gray-700">
                        {r.label}
                      </span>
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
      </div>
    </div>
  )
}
