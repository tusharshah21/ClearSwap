# Step-by-Step Deployment Guide with Explanations

## What You've Done So Far ✅

**Step 1 Complete:** You created a keystore account called "deployer"
- This encrypts your private key with a password
- It's stored safely on your machine
- You'll use this to sign transactions

---

## Getting Your Wallet Address (Do This First)

```bash
cast wallet address --account deployer
```

**What this does:** Shows you the Ethereum address for your "deployer" account.
- Example output: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- **This is YOUR_WALLET_ADDRESS** — copy it!

---

## Understanding What Each Deployment Step Does

### STEP 2: Deploy the Hook Contract

#### What This Does:
1. **Mines a CREATE2 salt** — finds a random number that makes your contract deploy to an address with the correct "flag bits"
2. **Deploys VolatilityFeeHook.sol** — puts your smart contract on Sepolia
3. **Generates a TxID** — proof of deployment for hackathon submission

#### The Command:
```bash
cd /home/tushar/open/ClearSwap/v4-hooks

POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
  forge script script/DeployHook.s.sol \
    --rpc-url $SEPOLIA_RPC_URL \
    --account deployer \
    --sender 0x2b33E4D2bD2f34310956dCb462d58413d3dCcdf8 \
    --broadcast
```

#### Breaking Down the Command:
- `POOL_MANAGER=0xE03...` — The official Uniswap v4 PoolManager on Sepolia (this is fixed)
- `forge script` — Foundry's deployment tool
- `script/DeployHook.s.sol` — Your deployment script
- `--rpc-url $SEPOLIA_RPC_URL` — Connect to Sepolia via Alchemy/Infura
- `--account deployer` — Use the keystore you created
- `--sender 0xYOUR_ADDRESS...` — The address that pays gas fees (must match deployer)
- `--broadcast` — Actually send the transaction (without this, it's a dry run)

#### Output You'll See:
```
[⠊] Compiling...
Compiler run successful!

Script ran successfully.

## Setting up 1 EVM.
==========================
Deploying VolatilityFeeHook to: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Salt: 0x0000000000000000000000000000000000000000000000000000000000000042

== Logs ==
  VolatilityFeeHook deployed successfully at: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Total Paid: 0.00123 ETH (2,456,789 gas * 0.5 gwei)

Transaction hash: 0xabc123def456...
```

**COPY THESE TWO THINGS:**
1. Hook address: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
2. Transaction hash: `0xabc123def456...` ← **TxID for hackathon**

---

### STEP 3: Create Pool + Add Liquidity

#### What This Does:
1. **Creates a new Uniswap v4 pool** with your hook attached
2. **Enables dynamic fees** (controlled by your hook)
3. **Adds 100 ETH of liquidity** so people can swap
4. **Generates Pool ID** — needed for the dashboard

#### Why This Step:
Your hook needs a pool to monitor. Without a pool, there are no swaps, no tick changes, no volatility to measure.

#### The Command:
```bash
# Option A: Use your existing test tokens from the V2 deployment
TOKEN_A=0x0daABD82B88FA5056E52BaE7312987b5e17B917F  # Your SG token
TOKEN_B=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e  # Your SHIS token
HOOK=0xYOUR_HOOK_ADDRESS_FROM_STEP_2

POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
MODIFY_LIQUIDITY_ROUTER=0x0c478023803a644c94c4ce1c1e7b9a087e411b0a \
  forge script script/CreatePoolAndAddLiquidity.s.sol \
    --rpc-url $SEPOLIA_RPC_URL \
    --account deployer \
    --sender 0xYOUR_WALLET_ADDRESS \
    --broadcast
```

#### Breaking Down the Parameters:
- `TOKEN_A` / `TOKEN_B` — The two tokens for the trading pair (must be ERC20)
- `HOOK` — Your deployed hook address from Step 2
- `POOL_MANAGER` — Uniswap v4's pool factory
- `MODIFY_LIQUIDITY_ROUTER` — Helper contract to add liquidity

#### Output You'll See:
```
Token0: 0x0daABD82B88FA5056E52BaE7312987b5e17B917F
Token1: 0xf65fFb885Abdd91dE948239bA476d264FdEFA37e
Hook: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

Pool initialized at 1:1 price
Tokens approved for liquidity router
Liquidity added: 100e18 across [-6000, 6000]

=== Pool Created Successfully ===
PoolManager: 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
Hook: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Token0: 0x0daABD82B88FA5056E52BaE7312987b5e17B917F
Token1: 0xf65fFb885Abdd91dE948239bA476d264FdEFA37e
Fee: DYNAMIC (managed by VolatilityFeeHook)
Tick Spacing: 60

Transaction hash: 0xdef789ghi012...
```

**COPY:**
1. Transaction hash ← **TxID #2 for hackathon**
2. **Pool ID:** Not directly shown, but you can compute it:

```bash
# Run this to get Pool ID:
TOKEN0=0x0daABD82B88FA5056E52BaE7312987b5e17B917F
TOKEN1=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e
HOOK=0xYOUR_HOOK_ADDRESS

cast keccak $(cast abi-encode \
  "f(address,address,uint24,int24,address)" \
  $TOKEN0 $TOKEN1 0x800000 60 $HOOK)
```

This outputs a bytes32 hash like:
```
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```
**THIS IS YOUR POOL ID** for the dashboard!

---

### STEP 4: Run Demo Swaps (Generate Fee Adaptation TxIDs)

#### What This Does:
1. **Phase 1:** 3 small swaps → fee stays low (5 bps)
2. **Phase 2:** 1 giant swap → volatility spikes → fee jumps to 100 bps
3. **Phase 3:** 5 small recovery swaps → fee decays back to 5 bps
4. **Logs EWMA and fee after each phase**

#### Why This Step:
This proves your hook works on-chain. Judges will see the TxIDs on Etherscan showing adaptive fees in action.

#### The Command:
```bash
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
SWAP_ROUTER=0x9b6b46e2c869aa39918db7f52f5557fe577b6eee \
HOOK=0xYOUR_HOOK_ADDRESS \
TOKEN_A=0x0daABD82B88FA5056E52BaE7312987b5e17B917F \
TOKEN_B=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e \
  forge script script/DemoSwaps.s.sol \
    --rpc-url $SEPOLIA_RPC_URL \
    --account deployer \
    --sender 0xYOUR_WALLET_ADDRESS \
    --broadcast
```

#### Output You'll See:
```
=== VolatilityFeeHook Demo Swaps ===

--- Phase 1: Calm Market ---
After calm phase
  EWMA Volatility: 0
  Current Fee (bps): 500

--- Phase 2: Volatility Shock ---
After shock
  EWMA Volatility: 285187
  Current Fee (bps): 10000

--- Phase 3: Recovery ---
After recovery
  EWMA Volatility: 66
  Current Fee (bps): 500

Demo complete. Check TxIDs on block explorer.

Transaction hash: 0xghi345jkl678...
```

**COPY:** Transaction hash ← **TxID #3 for hackathon**

---

## 🧪 TESTING LOCALLY FIRST (Recommended!)

Before spending real Sepolia ETH, test everything on Anvil (local fork):

### Terminal 1: Start Anvil
```bash
anvil --fork-url $SEPOLIA_RPC_URL
```

**What this does:** Forks Sepolia to your local machine. You get 10 test accounts with 10,000 fake ETH each.

### Terminal 2: Deploy Locally
```bash
cd /home/tushar/open/ClearSwap/v4-hooks

# Step 2 (local)
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
  forge script script/DeployHook.s.sol \
    --rpc-url http://127.0.0.1:8545 \
    --broadcast

# Step 3 (local)
TOKEN_A=0x0daABD82B88FA5056E52BaE7312987b5e17B917F \
TOKEN_B=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e \
HOOK=<hook-address-from-above> \
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
MODIFY_LIQUIDITY_ROUTER=0x0c478023803a644c94c4ce1c1e7b9a087e411b0a \
  forge script script/CreatePoolAndAddLiquidity.s.sol \
    --rpc-url http://127.0.0.1:8545 \
    --broadcast

# Step 4 (local)
SWAP_ROUTER=0x9b6b46e2c869aa39918db7f52f5557fe577b6eee \
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
HOOK=<hook-address> \
TOKEN_A=0x0daABD82B88FA5056E52BaE7312987b5e17B917F \
TOKEN_B=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e \
  forge script script/DemoSwaps.s.sol \
    --rpc-url http://127.0.0.1:8545 \
    --broadcast
```

**Benefits:**
- ✅ Free (no real ETH)
- ✅ Instant blocks (no waiting)
- ✅ Same behavior as Sepolia
- ✅ Practice before real deployment

**Limitation:** No TxIDs on Etherscan (can't submit for hackathon)

---

## Dashboard Configuration

After deployment, open http://localhost:5174/hook and fill in:

```
Hook Contract Address: 0xYOUR_HOOK_ADDRESS_FROM_STEP_2
Pool ID: 0xYOUR_POOL_ID_FROM_STEP_3
```

Click "Save" → "Load Hook Metrics"

**What you'll see:**
- 📊 EWMA Volatility chart
- 💰 Current fee (5 bps to 100 bps gauge)
- 📜 Event log of recent swaps
- 🔄 Auto-refresh every 6 seconds

---

## Cost Estimate (Sepolia)

| Step | Gas Cost | At 1 gwei | At 10 gwei |
|------|----------|-----------|------------|
| Deploy Hook | ~2.5M gas | 0.0025 ETH | 0.025 ETH |
| Create Pool | ~1.8M gas | 0.0018 ETH | 0.018 ETH |
| Demo Swaps | ~0.8M gas | 0.0008 ETH | 0.008 ETH |
| **Total** | **~5.1M gas** | **~0.0051 ETH** | **~0.051 ETH** |

Get free Sepolia ETH: https://sepoliafaucet.com/

---

## 🎯 Summary: What's Happening Under the Hood

1. **DeployHook.s.sol** → Puts your EWMA-based fee controller on-chain
2. **CreatePoolAndAddLiquidity.s.sol** → Links a trading pair to your hook
3. **DemoSwaps.s.sol** → Exercises the hook through market phases
4. **Dashboard** → Visualizes the real-time fee adaptation

**The magic:** Every swap triggers `afterSwap()`, which:
- Reads the new tick from PoolManager
- Computes tick delta²
- Updates EWMA: `ewma = 0.3 × Δtick² + 0.7 × ewma_prev`
- Maps EWMA to fee (5bp to 100bp)
- Next swap uses the new fee via `beforeSwap()`

This is **fully on-chain**, **zero oracles**, **instant adaptation** — that's what makes it novel.

---

## ✅ Your Next Action

Once you get your wallet address from `cast wallet address --account deployer`:

**Test locally first:**
```bash
# Terminal 1
anvil --fork-url $SEPOLIA_RPC_URL

# Terminal 2
cd /home/tushar/open/ClearSwap/v4-hooks
# Run the 3 deployment commands with --rpc-url http://127.0.0.1:8545
```

**Then deploy to Sepolia** using the exact same commands but with:
```bash
--rpc-url $SEPOLIA_RPC_URL \
--account deployer \
--sender 0xYOUR_WALLET_ADDRESS
```

Let me know what your wallet address is and I'll give you the exact commands to copy-paste!
