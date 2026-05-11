import { useState } from 'react';
import { X, Mail, CheckCircle, ArrowLeft } from 'lucide-react';

interface PasswordRecoveryProps {
  onClose: () => void;
}

export function PasswordRecovery({ onClose }: PasswordRecoveryProps) {
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate sending recovery code
    setTimeout(() => {
      setStep('code');
    }, 500);
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate code verification
    setTimeout(() => {
      setStep('success');
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-gray-900">Password Recovery</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Email Step */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-900">Enter your email address</p>
                  <p className="text-xs text-blue-700 mt-1">
                    We'll send you a recovery code to reset your password.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="recovery-email" className="block text-sm text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="your.email@kfu.edu.sa"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Code
              </button>
            </div>
          </form>
        )}

        {/* Code Verification Step */}
        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm text-green-900">Code sent successfully!</p>
                  <p className="text-xs text-green-700 mt-1">
                    Check your email at {email} for the recovery code.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="recovery-code" className="block text-sm text-gray-700 mb-2">
                Recovery Code
              </label>
              <input
                id="recovery-code"
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
                required
              />
              <p className="text-xs text-gray-600 mt-2">Demo: Use any 6-digit code</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Verify Code
              </button>
            </div>
          </form>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-gray-900 mb-2">Password Reset Link Sent!</h3>
              <p className="text-sm text-gray-600">
                We've sent a password reset link to your email. Click the link to create a new password.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
