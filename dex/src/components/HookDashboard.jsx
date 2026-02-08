import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input, Card, Statistic, Tag, Modal, message, Tooltip, Button } from "antd";
import {
  ThunderboltOutlined,
  DashboardOutlined,
  SettingOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useAccount, useNetwork } from "wagmi";
import { ethers } from "ethers";
import hookABI from "../VolatilityFeeHook.json";

// ═══════════════════════════════════════════════════════════════════
//  DEFAULT ADDRESSES — Update after deploying to Sepolia
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  11155111: {
    hookAddress: "",
    poolId: "",
    name: "Sepolia",
    explorer: "https://sepolia.etherscan.io",
    rpcUrl: "https://sepolia.infura.io/v3/21ce56472be047e48c454bd87691cd2f",
  },
  31337: {
    hookAddress: "",
    poolId: "",
    name: "Localhost",
    explorer: "",
    rpcUrl: "http://127.0.0.1:8545",
  },
};

// ═══════════════════════════════════════════════════════════════════
//  FEE BAR — Visual fee gauge (5bp to 100bp)
// ═══════════════════════════════════════════════════════════════════
function FeeBar({ fee, minFee = 500, maxFee = 10000 }) {
  const pct = Math.min(100, Math.max(0, ((fee - minFee) / (maxFee - minFee)) * 100));
  const bps = (fee / 100).toFixed(1);

  let color, label;
  if (pct < 20) {
    color = "#52c41a"; label = "LOW";
  } else if (pct < 60) {
    color = "#faad14"; label = "MID";
  } else {
    color = "#ff4d4f"; label = "HIGH";
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#888", fontSize: 12 }}>5 bps</span>
        <Tag color={color} style={{ margin: 0, fontWeight: 600 }}>{label} — {bps} bps</Tag>
        <span style={{ color: "#888", fontSize: 12 }}>100 bps</span>
      </div>
      <div style={{
        width: "100%", height: 16, borderRadius: 8,
        background: "rgba(255,255,255,0.06)", overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)"
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 8,
          background: `linear-gradient(90deg, #52c41a, ${color})`,
          transition: "width 0.5s ease, background 0.5s ease",
          boxShadow: `0 0 8px ${color}44`
        }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  VOLATILITY SPARK — mini chart of recent EWMA readings
// ═══════════════════════════════════════════════════════════════════
function VolatilitySpark({ history, maxHeight = 50 }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  const w = 280;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = maxHeight - (v / max) * maxHeight;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={maxHeight + 4} style={{ marginTop: 8 }}>
      <polyline
        points={points}
        fill="none"
        stroke="#1890ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  EVENT LOG — Recent VolatilityUpdated events
// ═══════════════════════════════════════════════════════════════════
function EventLog({ events }) {
  if (events.length === 0) {
    return <div style={{ color: "#666", textAlign: "center", padding: 16 }}>No events yet. Swaps will appear here.</div>;
  }

  return (
    <div style={{ maxHeight: 200, overflowY: "auto" }}>
      {events.map((e, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontSize: 13
        }}>
          <span style={{ color: "#888" }}>#{events.length - i}</span>
          <span>
            <Tag color={e.tickDelta > 0 ? "green" : e.tickDelta < 0 ? "red" : "default"} style={{ margin: 0 }}>
              Δtick: {e.tickDelta > 0 ? "+" : ""}{e.tickDelta}
            </Tag>
          </span>
          <span style={{ color: "#ccc" }}>EWMA: {e.ewma.toLocaleString()}</span>
          <span style={{ fontWeight: 600 }}>→ {(e.fee / 100).toFixed(1)} bps</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════
function HookDashboard() {
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();
  const chainId = chain?.id || 11155111;

  // ── State ──────────────────────────────────────────────────────
  const [hookAddress, setHookAddress] = useState("");
  const [poolId, setPoolId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [ewmaHistory, setEwmaHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [tempHook, setTempHook] = useState("");
  const [tempPool, setTempPool] = useState("");
  const intervalRef = useRef(null);

  // ── Load saved config ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`hook_config_${chainId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setHookAddress(parsed.hookAddress || "");
      setPoolId(parsed.poolId || "");
    } else {
      const def = DEFAULT_CONFIG[chainId];
      if (def) {
        setHookAddress(def.hookAddress || "");
        setPoolId(def.poolId || "");
      }
    }
  }, [chainId]);

  // ── Get provider ───────────────────────────────────────────────
  const getProvider = useCallback(() => {
    const config = DEFAULT_CONFIG[chainId] || DEFAULT_CONFIG[11155111];
    return new ethers.providers.JsonRpcProvider(config.rpcUrl);
  }, [chainId]);

  // ── Fetch metrics from hook contract ───────────────────────────
  const fetchMetrics = useCallback(async () => {
    if (!hookAddress || !poolId) return;

    try {
      setLoading(true);
      const provider = getProvider();
      const hook = new ethers.Contract(hookAddress, hookABI, provider);

      const [lastTick, ewmaVolatility, currentFee, isInitialized] =
        await hook.getPoolMetrics(poolId);

      const newMetrics = {
        lastTick: lastTick,
        ewmaVolatility: ewmaVolatility.toNumber(),
        currentFee: currentFee,
        isInitialized: isInitialized,
        timestamp: Date.now(),
      };

      setMetrics(newMetrics);
      setEwmaHistory((prev) => [...prev.slice(-29), newMetrics.ewmaVolatility]);
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
      message.error("Failed to read hook. Check address and network.");
    } finally {
      setLoading(false);
    }
  }, [hookAddress, poolId, getProvider]);

  // ── Fetch recent VolatilityUpdated events ──────────────────────
  const fetchEvents = useCallback(async () => {
    if (!hookAddress || !poolId) return;

    try {
      const provider = getProvider();
      const hook = new ethers.Contract(hookAddress, hookABI, provider);

      const filter = hook.filters.VolatilityUpdated(poolId);
      const blockNumber = await provider.getBlockNumber();
      const fromBlock = Math.max(0, blockNumber - 5000);
      const logs = await hook.queryFilter(filter, fromBlock, "latest");

      const parsed = logs.slice(-20).reverse().map((log) => ({
        ewma: log.args.ewmaVolatility.toNumber(),
        fee: log.args.newFee,
        tickDelta: log.args.tickDelta,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      }));

      setEvents(parsed);
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  }, [hookAddress, poolId, getProvider]);

  // ── Auto-poll ──────────────────────────────────────────────────
  useEffect(() => {
    if (polling && hookAddress && poolId) {
      fetchMetrics();
      fetchEvents();
      intervalRef.current = setInterval(() => {
        fetchMetrics();
        fetchEvents();
      }, 6000); // Every 6 seconds (~2 Sepolia blocks)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [polling, hookAddress, poolId, fetchMetrics, fetchEvents]);

  // ── Save config ────────────────────────────────────────────────
  const saveConfig = () => {
    setHookAddress(tempHook);
    setPoolId(tempPool);
    localStorage.setItem(
      `hook_config_${chainId}`,
      JSON.stringify({ hookAddress: tempHook, poolId: tempPool })
    );
    setConfigOpen(false);
    message.success("Hook config saved");
  };

  // ── UI constants ───────────────────────────────────────────────
  const explorerUrl = DEFAULT_CONFIG[chainId]?.explorer || "";
  const isConfigured = hookAddress && poolId;

  return (
    <div style={{
      maxWidth: 520, margin: "40px auto", fontFamily: "'Inter', sans-serif",
    }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20
      }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 20 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: "#1890ff" }} />
            VolatilityFeeHook
          </h2>
          <span style={{ color: "#888", fontSize: 12 }}>
            Adaptive fees powered by on-chain EWMA
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Tooltip title="Configure hook address">
            <Button
              shape="circle"
              icon={<SettingOutlined />}
              onClick={() => {
                setTempHook(hookAddress);
                setTempPool(poolId);
                setConfigOpen(true);
              }}
              style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#ccc" }}
            />
          </Tooltip>
          {isConfigured && (
            <Tooltip title={polling ? "Stop auto-refresh" : "Start auto-refresh"}>
              <Button
                shape="circle"
                icon={<ReloadOutlined spin={polling} />}
                onClick={() => setPolling(!polling)}
                style={{
                  background: polling ? "rgba(24,144,255,0.15)" : "rgba(255,255,255,0.06)",
                  border: polling ? "1px solid #1890ff" : "none",
                  color: polling ? "#1890ff" : "#ccc"
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── Not configured ────────────────────────────────────────── */}
      {!isConfigured && (
        <Card style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, textAlign: "center", padding: 24, color: "#ccc"
        }}>
          <DashboardOutlined style={{ fontSize: 40, color: "#444", marginBottom: 12 }} />
          <p style={{ margin: "8px 0 16px", color: "#888" }}>
            Deploy VolatilityFeeHook to Sepolia, then configure the address here.
          </p>
          <Button
            type="primary"
            onClick={() => {
              setTempHook(hookAddress);
              setTempPool(poolId);
              setConfigOpen(true);
            }}
          >
            Configure Hook
          </Button>
        </Card>
      )}

      {/* ── Live metrics ──────────────────────────────────────────── */}
      {isConfigured && metrics && (
        <>
          {/* Fee gauge */}
          <Card style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, marginBottom: 12
          }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Current Swap Fee
              </span>
              {metrics.isInitialized ? (
                <Tag icon={<CheckCircleOutlined />} color="success">Live</Tag>
              ) : (
                <Tag icon={<WarningOutlined />} color="warning">Not Initialized</Tag>
              )}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
              {(metrics.currentFee / 100).toFixed(1)} <span style={{ fontSize: 16, color: "#888" }}>bps</span>
            </div>
            <FeeBar fee={metrics.currentFee} />
            <div style={{ color: "#666", fontSize: 11, marginTop: 8 }}>
              Static Uniswap: always 30 bps — this hook adapts per-swap
            </div>
          </Card>

          {/* Volatility + Tick */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <Card style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12
            }}>
              <Statistic
                title={<span style={{ color: "#888" }}>EWMA Volatility</span>}
                value={metrics.ewmaVolatility.toLocaleString()}
                valueStyle={{ color: "#fff", fontSize: 20 }}
              />
              <VolatilitySpark history={ewmaHistory} />
            </Card>
            <Card style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12
            }}>
              <Statistic
                title={<span style={{ color: "#888" }}>Last Tick</span>}
                value={metrics.lastTick}
                valueStyle={{ color: "#fff", fontSize: 20 }}
              />
              <div style={{ marginTop: 12, color: "#888", fontSize: 12 }}>
                <div>Low threshold: 100</div>
                <div>High threshold: 10,000</div>
              </div>
            </Card>
          </div>

          {/* Fetch / refresh button */}
          {!polling && (
            <Button
              block
              onClick={() => { fetchMetrics(); fetchEvents(); }}
              loading={loading}
              style={{
                marginBottom: 12, height: 40, borderRadius: 8,
                background: "rgba(24,144,255,0.12)", border: "1px solid #1890ff",
                color: "#1890ff", fontWeight: 600
              }}
            >
              Refresh Metrics
            </Button>
          )}

          {/* Event log */}
          <Card
            title={<span style={{ color: "#ccc", fontSize: 14 }}>Recent VolatilityUpdated Events</span>}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12
            }}
            headStyle={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <EventLog events={events} />
          </Card>

          {/* Contract link */}
          {explorerUrl && hookAddress && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <a
                href={`${explorerUrl}/address/${hookAddress}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1890ff", fontSize: 12 }}
              >
                View contract on Etherscan ↗
              </a>
            </div>
          )}
        </>
      )}

      {/* ── Loading / initial fetch ───────────────────────────────── */}
      {isConfigured && !metrics && (
        <Card style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, textAlign: "center", padding: 24
        }}>
          <Button type="primary" loading={loading} onClick={() => { fetchMetrics(); fetchEvents(); }}>
            Load Hook Metrics
          </Button>
        </Card>
      )}

      {/* ── Config modal ──────────────────────────────────────────── */}
      <Modal
        title="Configure VolatilityFeeHook"
        open={configOpen}
        onOk={saveConfig}
        onCancel={() => setConfigOpen(false)}
        okText="Save"
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Hook Contract Address
          </label>
          <Input
            value={tempHook}
            onChange={(e) => setTempHook(e.target.value)}
            placeholder="0x..."
            style={{ fontFamily: "monospace" }}
          />
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Deploy with: <code>forge script script/DeployHook.s.sol --broadcast</code>
          </div>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Pool ID (bytes32)
          </label>
          <Input
            value={tempPool}
            onChange={(e) => setTempPool(e.target.value)}
            placeholder="0x..."
            style={{ fontFamily: "monospace" }}
          />
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Get from pool initialization tx logs or <code>keccak256(abi.encode(poolKey))</code>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default HookDashboard;
