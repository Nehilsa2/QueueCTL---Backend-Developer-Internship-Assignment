import { useEffect, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Play,
  Settings,
  CheckCircle,
  AlertTriangle,
  Skull,
  Hourglass,
  PauseCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  fetchStatus,
  fetchJobs,
  fetchMetrics,
  resetQueue,
} from "../api.js";

export default function Dashboard() {
  const [summary, setSummary] = useState({ by_state: {} });
  const [jobs, setJobs] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 🔄 Fetch backend data
  const loadData = async () => {
    try {
      const [statusRes, jobsRes, metricsRes] = await Promise.all([
        fetchStatus(),
        fetchJobs(),
        fetchMetrics(),
      ]);
      setSummary(statusRes.data);
      setJobs(jobsRes.data);
      setMetrics(metricsRes.data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Fetch failed", err);
    }
  };

  // 🧠 Auto-refresh logic
  useEffect(() => {
    loadData();
    if (autoRefresh) {
      const interval = setInterval(loadData, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // 🧹 Reset queue
  const handleReset = async () => {
    await resetQueue();
    loadData();
  };

  // 🎨 State configs (added waiting)
  const stateConfig = {
    pending: {
      color: "bg-yellow-500/20 border-yellow-400/30 text-yellow-300",
      icon: <Hourglass className="text-yellow-400" size={22} />,
    },
    processing: {
      color: "bg-blue-500/20 border-blue-400/30 text-blue-300",
      icon: (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="text-blue-400" size={22} />
        </motion.div>
      ),
    },
    waiting: {
      color: "bg-purple-500/20 border-purple-400/30 text-purple-300",
      icon: (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <PauseCircle className="text-purple-400" size={22} />
        </motion.div>
      ),
    },
    completed: {
      color: "bg-green-500/20 border-green-400/30 text-green-300",
      icon: <CheckCircle className="text-green-400" size={22} />,
    },
    failed: {
      color: "bg-red-500/20 border-red-400/30 text-red-300",
      icon: <AlertTriangle className="text-red-400" size={22} />,
    },
    dead: {
      color: "bg-gray-500/20 border-gray-400/30 text-gray-300",
      icon: <Skull className="text-gray-400" size={22} />,
    },
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6">
      {/* Header */}
      <motion.header
        className="flex justify-between items-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <span className="text-[#58a6ff]">QueueCTL Dashboard</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Monitor background jobs and queue health in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">
            ● Last updated: {lastUpdated}
          </span>
          <button
            className={`px-3 py-1 rounded-md border flex items-center gap-1 transition ${
              autoRefresh
                ? "bg-green-500/20 border-green-400"
                : "border-gray-500 hover:bg-gray-800"
            }`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Play size={16} /> Auto-refresh
          </button>
          <button
            onClick={loadData}
            className="px-3 py-1 rounded-md border border-gray-600 flex items-center gap-1 hover:bg-gray-800 transition"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1 rounded-md border border-red-600 text-red-400 flex items-center gap-1 hover:bg-red-500/20 transition"
          >
            <Trash2 size={16} /> Reset Queue
          </button>
          <button className="p-2 border border-gray-700 rounded-md hover:bg-gray-800 transition">
            <Settings size={16} />
          </button>
        </div>
      </motion.header>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        {["pending", "processing", "completed", "failed", "waiting", "dead"].map(
          (state, i) => (
            <motion.div
              key={i}
              className={`p-4 rounded-xl border ${
                stateConfig[state].color
              } backdrop-blur-sm shadow-md flex flex-col items-start gap-2 cursor-pointer transform transition-all hover:scale-105 hover:shadow-lg`}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center gap-2">
                {stateConfig[state].icon}
                <h2 className="text-sm font-semibold uppercase text-gray-400">
                  {state === "dead" ? "DEAD (DLQ)" : state}
                </h2>
              </div>
              <p className="text-3xl font-bold text-white mt-1">
                {summary.by_state[state] || 0}
              </p>
            </motion.div>
          )
        )}
      </motion.div>

      {/* Jobs and Metrics Section */}
      <div className="grid grid-cols-3 gap-6">
        {/* Jobs Table */}
        <motion.div
          className="col-span-2 bg-[#161b22] p-4 rounded-xl border border-gray-800"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold mb-3">
            Jobs ({jobs.length})
          </h3>
          <div className="max-h-[500px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900 rounded-md">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-[#161b22] z-10">
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left p-2">Job ID</th>
                  <th className="text-left p-2">Command</th>
                  <th className="text-left p-2">State</th>
                  <th className="text-left p-2">Attempts</th>
                  <th className="text-left p-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <motion.tr
                    key={job.id}
                    className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition"
                    whileHover={{ scale: 1.01 }}
                  >
                    <td className="p-2 text-[#58a6ff]">{job.id}</td>
                    <td className="p-2">{job.command}</td>
                    <td className="p-2 capitalize">{job.state}</td>
                    <td className="p-2">
                      {job.attempts}/{job.max_retries}
                    </td>
                    <td className="p-2 text-gray-400">
                      {job.updated_at?.split("T")[0]}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Metrics and Activity */}
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="bg-[#161b22] p-4 rounded-xl border border-gray-800">
            <h3 className="text-lg font-semibold mb-3">
              Performance Metrics
            </h3>
            <div className="text-sm space-y-1 text-gray-300">
              <p>Total Jobs: {metrics?.metrics?.total_jobs || 0}</p>
              <p>Completed: {metrics?.metrics?.completed || 0}</p>
              <p>Failed: {metrics?.metrics?.failed || 0}</p>
              <p>
                Avg Duration: {metrics?.metrics?.avg_duration || 0}s
              </p>
            </div>
          </div>

          <div className="bg-[#161b22] p-4 rounded-xl border border-gray-800">
            <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              {metrics?.recent?.slice(0, 5)?.map((m) => (
                <li
                  key={m.job_id}
                  className="hover:text-[#58a6ff] transition"
                >
                  <span className="text-[#58a6ff]">{m.job_id}</span> →{" "}
                  {m.state} ({m.duration}s)
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
