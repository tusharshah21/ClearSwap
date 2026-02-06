# DEX Sepolia Testing Guide

This guide will help you deploy Uniswap V2 contracts to Sepolia testnet and test your DEX with your SG and SHIS tokens.

## Prerequisites

- Node.js v18+ installed
- MetaMask wallet with Sepolia ETH (get from faucets)
- Your tokens on Sepolia:
  - **SG**: `0x0daABD82B88FA5056E52BaE7312987b5e17B917F`
  - **SHIS**: `0xf65fFb885Abdd91dE948239bA476d264FdEFA37e`

## Quick Start

### Step 1: Install Dependencies

```bash
# Install blockchain dependencies
cd blockchain
npm install

# Install frontend dependencies  
cd ../dex
npm install
```

### Step 2: Configure Environment

Create `blockchain/.env` from the example:

```bash
cd blockchain
copy .env.example .env
```

Edit `blockchain/.env` with your credentials:

```env
INFURA_ID=your_infura_project_id
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_id
PRIVATE_KEY=your_wallet_private_key_without_0x_prefix
ETHERSCAN_API_KEY=your_etherscan_api_key_optional

# Your tokens (already set)
SG_TOKEN_ADDRESS=0x0daABD82B88FA5056E52BaE7312987b5e17B917F
SHIS_TOKEN_ADDRESS=0xf65fFb885Abdd91dE948239bA476d264FdEFA37e
```

### Step 3: Deploy Uniswap V2 to Sepolia

```bash
cd blockchain
npx hardhat compile
npm run deploy:sepolia
```

**Save the output!** You'll see:
```
UniswapV2Factory deployed to: 0x...
UniswapV2Router02 deployed to: 0x...
SG/SHIS Pair created at: 0x...
```

### Step 4: Add Liquidity to SG/SHIS Pool

```bash
npm run add-liquidity:sepolia
```

This will:
1. Approve the router to spend your SG and SHIS tokens
2. Add 100,000 of each token to the liquidity pool
3. Create the trading pair

**Note**: Make sure you have enough SG and SHIS tokens. Adjust the amount in `scripts/addLiquidity.js` if needed.

### Step 5: Start the Frontend

```bash
cd ../dex
npm run dev
```

### Step 6: Configure MetaMask

1. **Add Sepolia Network** (if not already added):
   - Network Name: `Sepolia`
   - RPC URL: `https://sepolia.infura.io/v3/YOUR_INFURA_ID`
   - Chain ID: `11155111`
   - Currency Symbol: `ETH`
   - Block Explorer: `https://sepolia.etherscan.io`

2. **Import your tokens** to see balances:
   - SG: `0x0daABD82B88FA5056E52BaE7312987b5e17B917F`
   - SHIS: `0xf65fFb885Abdd91dE948239bA476d264FdEFA37e`

### Step 7: Configure DEX Frontend

1. Open http://localhost:5173
2. Connect MetaMask (make sure you're on Sepolia)
3. Click the Settings (gear icon) in the Swap box
4. Click "Configure Contracts"
5. Enter the addresses from Step 3:
   - Factory Address: `0x...` (from deployment output)
   - Router Address: `0x...` (from deployment output)
6. Click Save

### Step 8: Test Swapping!

1. Select SG as input token
2. Select SHIS as output token
3. Enter an amount to swap
4. You should see the calculated output amount
5. Click "Swap" and confirm in MetaMask

---

## Troubleshooting

### "No liquidity pool exists for this pair"
- Make sure you ran `npm run add-liquidity:sepolia` successfully
- Check the pair address exists using Etherscan

### "Insufficient token balance"
- Make sure you have enough tokens in your wallet
- You need gas (Sepolia ETH) for transactions

### "Router not configured"
- Follow Step 7 to configure contract addresses in the frontend

### Transaction fails
- Increase slippage tolerance in settings
- Make sure you have enough gas (Sepolia ETH)

---

## Contract Addresses Reference

After deployment, your contracts will be saved to:
- `blockchain/deployments/sepolia.json`
- `dex/src/config/networks.js` (auto-updated)

## Getting Sepolia ETH

- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)
- [QuickNode Faucet](https://faucet.quicknode.com/ethereum/sepolia)

---

## Architecture

```
DEX-Exchange/
├── blockchain/           # Hardhat project for contracts
│   ├── contracts/        # Uniswap V2 contracts
│   ├── scripts/          # Deploy & liquidity scripts
│   └── deployments/      # Saved deployment addresses
│
└── dex/                  # React frontend
    └── src/
        ├── config/       # Network configuration
        ├── components/   # Swap UI components
        └── tokenListSepolia.json  # Your test tokens
```
