import { AlertTriangle, AlertOctagon, CheckCircle, XCircle, User } from 'lucide-react';

interface ViolationRecord {
  userId: string;
  userName: string;
  violationCount: number;
  lastViolationTime: Date | null;
  violations: {
    timestamp: Date;
    type: string;
    details: string;
  }[];
}

interface ViolationTrackerProps {
  currentUserViolations: ViolationRecord;
  allViolations: ViolationRecord[];
  violationThreshold: number;
  currentUserRole: string;
}

export function ViolationTracker({
  currentUserViolations,
  allViolations,
  violationThreshold,
  currentUserRole,
}: ViolationTrackerProps) {
  const isAboveThreshold = currentUserViolations.violationCount >= violationThreshold;
  const isCritical = currentUserViolations.violationCount >= violationThreshold * 1.5;

  return (
    <div className="space-y-6">
      {/* Current User Violation Status */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" />
            <h2 className="text-gray-900">Your Safety Record</h2>
          </div>
          <div
            className={`px-4 py-2 rounded-lg ${
              isCritical
                ? 'bg-red-100 text-red-700'
                : isAboveThreshold
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            <p className="text-sm">
              {currentUserViolations.violationCount} Violation
              {currentUserViolations.violationCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Warning Messages */}
        {isCritical ? (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-6 h-6 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-900">Critical Safety Alert!</p>
                <p className="text-sm text-red-700 mt-1">
                  You have {currentUserViolations.violationCount} safety violations, significantly
                  exceeding the acceptable threshold of {violationThreshold}. Immediate action required!
                </p>
                <div className="mt-3 p-3 bg-red-100 rounded-lg">
                  <p className="text-sm text-red-800">
                    ⚠️ Consequences: Lab access may be suspended pending safety review
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : isAboveThreshold ? (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-yellow-900">Warning: Threshold Exceeded</p>
                <p className="text-sm text-yellow-700 mt-1">
                  You have reached {currentUserViolations.violationCount} violations, exceeding the
                  safety threshold of {violationThreshold}. Please ensure full PPE compliance.
                </p>
                <div className="mt-3 p-3 bg-yellow-100 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    📋 Next violation may result in temporary lab access restriction
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
              <div>
                <p className="text-green-900">Good Safety Record</p>
                <p className="text-sm text-green-700 mt-1">
                  You are within acceptable safety standards. Keep up the good work!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Violation Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-700">Safety Compliance Status</p>
            <p className="text-sm text-gray-600">
              {currentUserViolations.violationCount} / {violationThreshold} threshold
            </p>
          </div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isCritical
                  ? 'bg-red-600'
                  : isAboveThreshold
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{
                width: `${Math.min((currentUserViolations.violationCount / violationThreshold) * 100, 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Recent Violations */}
        {currentUserViolations.violations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-gray-900 mb-3">Recent Violations</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {currentUserViolations.violations.slice(0, 5).map((violation, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-start gap-3"
                >
                  <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{violation.type}</p>
                    <p className="text-xs text-gray-600 mt-1">{violation.details}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {violation.timestamp.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentUserViolations.violations.length === 0 && (
          <div className="text-center py-6">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">No violations recorded</p>
          </div>
        )}
      </div>

      {/* All Users Violations (Supervisor View) */}
      {currentUserRole === 'supervisor' && allViolations.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-gray-900 mb-4">All Personnel Safety Records</h2>
          <div className="space-y-3">
            {allViolations
              .sort((a, b) => b.violationCount - a.violationCount)
              .map((record, index) => (
                <div
                  key={record.userId}
                  className={`p-4 rounded-lg border-2 ${
                    record.violationCount >= violationThreshold * 1.5
                      ? 'bg-red-50 border-red-400'
                      : record.violationCount >= violationThreshold
                      ? 'bg-yellow-50 border-yellow-400'
                      : 'bg-green-50 border-green-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          record.violationCount >= violationThreshold * 1.5
                            ? 'bg-red-200'
                            : record.violationCount >= violationThreshold
                            ? 'bg-yellow-200'
                            : 'bg-green-200'
                        }`}
                      >
                        <User
                          className={`w-5 h-5 ${
                            record.violationCount >= violationThreshold * 1.5
                              ? 'text-red-700'
                              : record.violationCount >= violationThreshold
                              ? 'text-yellow-700'
                              : 'text-green-700'
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-gray-900">{record.userName}</p>
                        {record.lastViolationTime && (
                          <p className="text-xs text-gray-600">
                            Last violation: {record.lastViolationTime.toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`${
                          record.violationCount >= violationThreshold * 1.5
                            ? 'text-red-700'
                            : record.violationCount >= violationThreshold
                            ? 'text-yellow-700'
                            : 'text-green-700'
                        }`}
                      >
                        {record.violationCount} violation{record.violationCount !== 1 ? 's' : ''}
                      </p>
                      {record.violationCount >= violationThreshold && (
                        <p className="text-xs text-red-600 mt-1">⚠️ Above threshold</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
