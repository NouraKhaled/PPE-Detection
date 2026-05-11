import { useState, useEffect } from 'react';
import { Activity, User, Search, Download } from 'lucide-react';

export interface ActivityEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  details: string;
  type: 'login' | 'logout' | 'control' | 'settings' | 'alert';
}

interface ActivityLogProps {
  activities: ActivityEntry[];
}

export function ActivityLog({ activities }: ActivityLogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredActivities, setFilteredActivities] = useState(activities);

  useEffect(() => {
    const filtered = activities.filter(
      (activity) =>
        activity.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredActivities(filtered);
  }, [searchTerm, activities]);

  const getActivityColor = (type: ActivityEntry['type']) => {
    switch (type) {
      case 'login':
        return 'text-green-800 bg-green-50/90 border-green-200';
      case 'logout':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      case 'control':
        return 'text-sky-900 bg-sky-50 border-sky-200';
      case 'settings':
        return 'text-purple-800 bg-purple-50 border-purple-200';
      case 'alert':
        return 'text-sky-900 bg-sky-50 border-sky-200';
      default:
        return 'text-gray-700 bg-sky-50/80 border-sky-100';
    }
  };

  const exportLogs = () => {
    const csvContent = [
      'Timestamp,User,Action,Details,Type',
      ...filteredActivities.map(
        (a) =>
          `"${a.timestamp.toLocaleString()}","${a.user}","${a.action}","${a.details}","${a.type}"`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div id="activity-log" className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-600" aria-hidden />
          <h2 className="text-gray-900">User Activity Log</h2>
        </div>
        <button
          type="button"
          onClick={exportLogs}
          aria-label="Download activity log as a CSV file"
          title="Download activity log as CSV"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-sm"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          Export
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search activities..."
            aria-label="Search activities"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Activity List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No activities found</p>
          </div>
        ) : (
          filteredActivities.map((activity) => (
            <div
              key={activity.id}
              className={`p-4 rounded-lg border ${getActivityColor(activity.type)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <User className="w-5 h-5 mt-0.5 shrink-0 text-sky-700" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{activity.user}</p>
                      <span className="text-xs text-gray-500" aria-hidden>
                        •
                      </span>
                      <p className="text-sm text-gray-800">{activity.action}</p>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{activity.details}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  {activity.timestamp.toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
