import React, { useState, useCallback } from "react";
import { Input, Button, Tag, Tooltip } from "antd";
import { LinkOutlined, CheckCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════════
//  ENSHookLoader — Decentralized Hook Discovery via ENS
// ═══════════════════════════════════════════════════════════════════
//
//  WHY ENS?
//  Protocol agents and dashboards currently rely on copy-pasting hex
//  addresses to connect to hooks. ENS transforms this into a human-
//  readable discovery layer:
//
//    clearswap.eth → text record "uniswapV4Hook" → 0xF615dF4...
//    clearswap.eth → text record "poolId"         → 0xc28230...
//
//  This is NOT just name resolution — it's a decentralized control
//  plane for protocol agents. Anyone can publish hook configurations
//  under their ENS name, enabling permissionless hook discovery
//  without centralized registries.
//
//  READ-ONLY: This component only reads from ENS. No writes, no
//  transactions, no new contracts.
// ═══════════════════════════════════════════════════════════════════

// ENS resolution requires mainnet — ENS registry lives on L1
const ENS_PROVIDER = new ethers.providers.JsonRpcProvider(
  "https://mainnet.infura.io/v3/21ce56472be047e48c454bd87691cd2f"
);

/**
 * Resolves ENS text records for hook configuration.
 *
 * Reads two text records from the given ENS name:
 *   - "uniswapV4Hook"  → hook contract address
 *   - "poolId"          → bytes32 pool identifier
 *
 * @param {string} ensName - e.g. "clearswap.eth"
 * @returns {{ hookAddress, poolId, owner }} or throws
 */
async function resolveHookFromENS(ensName) {
  const resolver = await ENS_PROVIDER.getResolver(ensName);
  if (!resolver) {
    throw new Error(`No ENS resolver found for "${ensName}"`);
  }

  // Read hook address from text record "uniswapV4Hook"
  const hookAddress = await resolver.getText("uniswapV4Hook");

  // Read pool ID from text record "poolId"
  const poolId = await resolver.getText("poolId");

  // Also resolve the owner address for display
  const owner = await ENS_PROVIDER.resolveName(ensName);

  return {
    hookAddress: hookAddress || "",
    poolId: poolId || "",
    owner: owner || "",
  };
}

/**
 * ENSHookLoader — A single component for human-readable hook discovery.
 *
 * Props:
 *   onHookResolved(hookAddress, poolId) — Called when valid config is
 *     resolved from ENS. Parent (HookDashboard) uses this to populate
 *     the hook address & pool ID fields.
 *
 * Behavior:
 *   - User types an ENS name (e.g. "clearswap.eth")
 *   - Component resolves text records from mainnet ENS
 *   - If found, passes config to parent via callback
 *   - If missing/invalid, shows a non-blocking warning
 *   - Never blocks the app, never writes on-chain
 */
export default function ENSHookLoader({ onHookResolved }) {
  const [ensName, setEnsName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { hookAddress, poolId, owner, ensName }
  const [error, setError] = useState("");

  const resolve = useCallback(async () => {
    const name = ensName.trim();
    if (!name) return;

    // Basic validation: must end with .eth (or similar)
    if (!name.includes(".")) {
      setError("Enter a valid ENS name (e.g. clearswap.eth)");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const resolved = await resolveHookFromENS(name);

      if (!resolved.hookAddress) {
        // ENS name exists but no hook text record set
        setError(
          `"${name}" exists but has no "uniswapV4Hook" text record. ` +
          `Set it at app.ens.domains → your name → Text Records.`
        );
        setResult(null);
        setLoading(false);
        return;
      }

      // Validate the resolved address is a proper hex address
      if (!ethers.utils.isAddress(resolved.hookAddress)) {
        setError(`"uniswapV4Hook" record contains an invalid address: ${resolved.hookAddress}`);
        setResult(null);
        setLoading(false);
        return;
      }

      setResult({ ...resolved, ensName: name });

      // Notify parent — this populates the dashboard config
      if (onHookResolved) {
        onHookResolved(resolved.hookAddress, resolved.poolId);
      }
    } catch (err) {
      // Non-breaking: ENS resolution failure does NOT block the app
      if (err.message.includes("No ENS resolver")) {
        setError(`ENS name "${name}" not found. Check the name and try again.`);
      } else {
        setError(`ENS lookup failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [ensName, onHookResolved]);

  return (
    <div
      style={{
        background: "rgba(88, 101, 242, 0.06)",
        border: "1px solid rgba(88, 101, 242, 0.2)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 14,
      }}
    >
      {/* Section label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
          color: "#8b95ff",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          fontWeight: 600,
        }}
      >
        <LinkOutlined />
        ENS Hook Discovery
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <Input
          value={ensName}
          onChange={(e) => {
            setEnsName(e.target.value);
            setError("");
            setResult(null);
          }}
          placeholder="clearswap.eth"
          onPressEnter={resolve}
          style={{
            flex: 1,
            fontFamily: "monospace",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            borderRadius: 6,
          }}
        />
        <Button
          onClick={resolve}
          loading={loading}
          style={{
            background: "rgba(88, 101, 242, 0.15)",
            border: "1px solid rgba(88, 101, 242, 0.3)",
            color: "#8b95ff",
            fontWeight: 600,
            borderRadius: 6,
          }}
        >
          Resolve
        </Button>
      </div>

      {/* Success state */}
      {result && (
        <div style={{ marginTop: 10 }}>
          <Tag
            icon={<CheckCircleOutlined />}
            color="success"
            style={{ marginBottom: 6 }}
          >
            Hook loaded from {result.ensName}
          </Tag>
          <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
            <div>
              <span style={{ color: "#666" }}>Hook: </span>
              <span style={{ fontFamily: "monospace", color: "#8b95ff" }}>
                {result.hookAddress.slice(0, 10)}...{result.hookAddress.slice(-8)}
              </span>
            </div>
            {result.poolId && (
              <div>
                <span style={{ color: "#666" }}>Pool: </span>
                <span style={{ fontFamily: "monospace", color: "#8b95ff" }}>
                  {result.poolId.slice(0, 10)}...{result.poolId.slice(-8)}
                </span>
              </div>
            )}
            {result.owner && (
              <div>
                <span style={{ color: "#666" }}>Owner: </span>
                <span style={{ fontFamily: "monospace", color: "#8b95ff" }}>
                  {result.owner.slice(0, 10)}...{result.owner.slice(-8)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error / warning — never blocks the app */}
      {error && (
        <div style={{ marginTop: 8 }}>
          <Tag icon={<WarningOutlined />} color="warning" style={{ whiteSpace: "normal", height: "auto", lineHeight: 1.4, padding: "4px 8px" }}>
            {error}
          </Tag>
        </div>
      )}

      {/* Subtle explainer */}
      {!result && !error && (
        <div style={{ fontSize: 10, color: "#555", marginTop: 8 }}>
          Resolve hook config from ENS text records — no copy-pasting hex addresses.
        </div>
      )}
    </div>
  );
}
