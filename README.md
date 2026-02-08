# ClearSwap

A decentralized exchange (DEX) built on Uniswap V2 protocol, with a **Uniswap v4 Adaptive Fee Hook** that dynamically adjusts swap fees based on on-chain volatility.

## HackMoney 2026 — Uniswap v4 Track + ENS

**VolatilityFeeHook** is a Uniswap v4 Hook that uses an EWMA (Exponential Weighted Moving Average) of realized tick volatility to automatically adjust LP fees from **5 bps** (calm markets) to **100 bps** (volatile markets) — earning LPs **2.7x more revenue** versus static fees.

See [v4-hooks/README.md](v4-hooks/README.md) for full details, architecture, and test results.

### Deployed on Sepolia
- **VolatilityFeeHook:** `0xF615dF4Eec1f0D5f85E187ac7ad6F386C42990C0`
- **Pool ID:** `0xc28230269cc9e49e9e76a6a80e5f21fdc22f192004f88eeacf9be25367231af4`
- **Deployment Tx:** [`0x6437b93b...`](https://sepolia.etherscan.io/tx/0x6437b93b3961d241754aee2b765815d2911d1b61cf68db9d89fdd3b4a6258431)

## Features

- 🔄 Token swaps with real-time price calculation
- 💧 Liquidity pool integration (AMM model)
- 📊 **Adaptive fee dashboard** — live EWMA volatility, fee gauge, event log
- 🔗 **ENS hook discovery** — resolve hook config from ENS text records (e.g. `clearswap.eth`)
- 🌐 Multi-network support (Sepolia, Mainnet, Localhost)
- 🔗 MetaMask wallet connection
- ⚡ Fast execution with instant price updates

## Tech Stack

**Frontend:** React 18, Vite, Wagmi, Ethers.js, Ant Design  
**Blockchain:** Hardhat, Solidity (0.5.16/0.6.6/0.8.19), Uniswap V2 Protocol  
**v4 Hook:** Foundry, Solidity 0.8.26, Uniswap v4-core, OpenZeppelin uniswap-hooks  
**ENS:** Text record resolution for decentralized hook discovery  
**Network:** Ethereum Sepolia Testnet

## Quick Start

### Frontend
```bash
cd dex
npm install
npm run dev
```
Access at `http://localhost:5173`

### Smart Contracts
```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

## Deployed Contracts (Sepolia)

- **Factory:** `0xE93324086a82c5CC0B132Ea3173b4Af70633B2b6`
- **Router:** `0xd6E93fc3ba53615017F92f9138FF92c0967de869`
- **SG/SHIS Pair:** `0xE65059453A785b94F09aEdD12b2700852e0A4d32`

### Token Addresses
- **SG Token:** `0x0daABD82B88FA5056E52BaE7312987b5e17B917F`
- **SHIS Token:** `0xf65fFb885Abdd91dE948239bA476d264FdEFA37e`

## Project Structure

```
ClearSwap/
├── v4-hooks/              # Uniswap v4 Hook (HackMoney 2025)
│   ├── src/               # VolatilityFeeHook.sol
│   ├── test/              # 8 tests (all passing)
│   └── script/            # Deploy, Pool, Swap scripts
├── blockchain/            # Hardhat project (Uniswap V2)
│   ├── contracts/         # V2 contracts
│   └── scripts/           # Deployment scripts
├── dex/                   # React frontend
│   ├── src/components/    # Swap, HookDashboard, Header
│   └── vite.config.js
└── DEPLOYMENT_GUIDE.md
```

## Configuration

1. **Environment Setup:**
   ```bash
   # blockchain/.env
   PRIVATE_KEY=your_private_key
   SEPOLIA_RPC_URL=your_alchemy_url
   ```

2. **Network Selection:**
   ```bash
   # dex/.env
   VITE_NETWORK=sepolia
   ```

## Usage

1. Connect MetaMask wallet
2. Switch to Sepolia network
3. Select tokens to swap
4. Enter amount and execute swap
5. Approve token if first-time use
6. Confirm transaction

## Testing

```bash
# V4 Hook tests
cd v4-hooks
forge test --via-ir -vv
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for Sepolia deployment instructions.

## License

MIT
