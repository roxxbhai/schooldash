'use client'

import { useState } from 'react'
import { Eye, EyeOff, Globe, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    enrollment: '',
    password: '',
    rememberMe: false
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Login submitted:', formData)
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
                J.C. Bose University of Science & Technology,
              </h2>
              <p className="text-[15px] font-medium drop-shadow-md">
                YMCA, Faridabad
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
          {/* Language Selector */}
          <div className="absolute top-8 right-8 hidden md:block">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-full text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Globe className="w-4 h-4 text-gray-600" />
              <span>Eng (UK)</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-[400px]">
              <div className="mb-10">
                <h1 className="text-4xl font-bold text-[#1e2756] mb-3">
                  Log In
                </h1>
                <p className="text-sm text-gray-800 font-semibold">
                  New User?{' '}
                  <button
                    onClick={() => router.push('/signup')}
                    className="text-[#3b478f] hover:underline hover:text-[#1e2756]"
                  >
                    Sign Up
                  </button>
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Enrollment No */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Enrollment No.
                  </label>
                  <input
                    type="text"
                    name="enrollment"
                    value={formData.enrollment}
                    onChange={handleInputChange}
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-[#d5d9f0] rounded-full transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-700" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-700" />
                      )}
                    </button>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      className="text-[13px] text-[#3b478f] hover:text-[#1e2756] hover:underline font-semibold"
                    >
                      Forgot Password?
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

                {/* Social Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    className="flex items-center justify-center px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {/* Teacher */}
                    <span className="text-sm font-semibold text-gray-700">
                      Sign in as Teacher
                    </span>
                  </button>

                  <button
                    type="button"
                    className="flex items-center justify-center px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {/* Admin */}
                    <span className="text-sm font-semibold text-gray-700">
                      Sign in as Admin
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
      </div>
    </div>
  )
}
