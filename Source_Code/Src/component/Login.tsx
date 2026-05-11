import { useState } from 'react';
import { Shield, Eye, EyeOff, AlertCircle, Lock } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => void;
  onForgotPassword: () => void;
  onCreateAccount: () => void;
  error: string | null;
  failedAttempts: number;
}

export function Login({ onLogin, onForgotPassword, onCreateAccount, error, failedAttempts }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [showTwoFactor, setShowTwoFactor] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showTwoFactor) {
      // In a real system, this would verify the 2FA code
      if (verificationCode === '123456') {
        onLogin(username, password);
      }
    } else {
      // Simulate 2FA requirement for supervisor role
      if (username === 'supervisor' || username === 'admin') {
        setShowTwoFactor(true);
      } else {
        onLogin(username, password);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Shield className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-gray-900 mb-2">Lab Safety Monitoring System</h1>
          <p className="text-gray-600">King Faisal University</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-gray-900 mb-6 text-center">Sign In to Dashboard</h2>

          {/* Failed Attempts Warning */}
          {failedAttempts > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-900">Failed login attempts: {failedAttempts}</p>
                {failedAttempts >= 3 && (
                  <p className="text-xs text-yellow-700 mt-1">
                    Multiple failed attempts detected. Account may be locked after 5 attempts.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!showTwoFactor ? (
              <>
                <div>
                  <label htmlFor="username" className="block text-sm text-gray-700 mb-2">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Enter your username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Lock className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-900">Two-Factor Authentication Required</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Enter the 6-digit verification code from your authenticator app.
                      </p>
                      <p className="text-xs text-blue-600 mt-2 italic">
                        Demo: Use code "123456"
                      </p>
                    </div>
                  </div>
                </div>

                <label htmlFor="code" className="block text-sm text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              {showTwoFactor ? 'Verify & Sign In' : 'Sign In'}
            </button>

            {showTwoFactor && (
              <button
                type="button"
                onClick={() => {
                  setShowTwoFactor(false);
                  setVerificationCode('');
                }}
                className="w-full text-gray-600 py-2 text-sm hover:text-gray-900"
              >
                ← Back to login
              </button>
            )}
          </form>

          {/* Create Account Link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onCreateAccount}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              Create a new account
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-6">
          © 2024 King Faisal University - Saudi Vision 2030
        </p>
      </div>
    </div>
  );
}