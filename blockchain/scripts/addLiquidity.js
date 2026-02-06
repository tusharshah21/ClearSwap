const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ERC20 ABI for token interactions
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Adding liquidity with account:", deployer.address);

  const network = hre.network.name;
  console.log("Network:", network);

  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    console.error("Deployment file not found. Run deploy.js first!");
    console.error("Expected:", deploymentPath);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("Loaded deployment from:", deploymentPath);

  // Get contract instances
  const factory = await hre.ethers.getContractAt("UniswapV2Factory", deployment.contracts.UniswapV2Factory);
  const router = await hre.ethers.getContractAt("UniswapV2Router02", deployment.contracts.UniswapV2Router02);

  // Token addresses
  const SG_ADDRESS = deployment.tokens.SG || process.env.SG_TOKEN_ADDRESS;
  const SHIS_ADDRESS = deployment.tokens.SHIS || process.env.SHIS_TOKEN_ADDRESS;

  if (!SG_ADDRESS || !SHIS_ADDRESS) {
    console.error("Token addresses not found in deployment or environment variables!");
    process.exit(1);
  }

  console.log("\nToken addresses:");
  console.log("SG:", SG_ADDRESS);
  console.log("SHIS:", SHIS_ADDRESS);

  // Get token contracts
  const sgToken = new hre.ethers.Contract(SG_ADDRESS, ERC20_ABI, deployer);
  const shisToken = new hre.ethers.Contract(SHIS_ADDRESS, ERC20_ABI, deployer);

  // Check balances
  const sgBalance = await sgToken.balanceOf(deployer.address);
  const shisBalance = await shisToken.balanceOf(deployer.address);
  
  console.log("\nYour token balances:");
  console.log("SG:", hre.ethers.formatEther(sgBalance));
  console.log("SHIS:", hre.ethers.formatEther(shisBalance));

  // Amount to add to liquidity (adjust as needed)
  // Using 100,000 of each token for initial liquidity
  const liquidityAmount = hre.ethers.parseEther("100000");
  
  if (sgBalance < liquidityAmount || shisBalance < liquidityAmount) {
    console.error("\nInsufficient token balance for liquidity!");
    console.error("Need at least 100,000 of each token.");
    console.error("Adjust the liquidityAmount variable if you have less tokens.");
    process.exit(1);
  }

  // Check if pair exists, create if not
  let pairAddress = await factory.getPair(SG_ADDRESS, SHIS_ADDRESS);
  if (pairAddress === "0x0000000000000000000000000000000000000000") {
    console.log("\nCreating SG/SHIS pair...");
    const createTx = await factory.createPair(SG_ADDRESS, SHIS_ADDRESS);
    await createTx.wait();
    pairAddress = await factory.getPair(SG_ADDRESS, SHIS_ADDRESS);
    console.log("Pair created at:", pairAddress);
  } else {
    console.log("\nPair already exists at:", pairAddress);
  }

  // Approve router to spend tokens
  console.log("\nApproving SG token...");
  const approveSgTx = await sgToken.approve(deployment.contracts.UniswapV2Router02, liquidityAmount);
  await approveSgTx.wait();
  console.log("SG approved");

  console.log("Approving SHIS token...");
  const approveShisTx = await shisToken.approve(deployment.contracts.UniswapV2Router02, liquidityAmount);
  await approveShisTx.wait();
  console.log("SHIS approved");

  // Add liquidity
  console.log("\nAdding liquidity...");
  console.log("Amount SG:", hre.ethers.formatEther(liquidityAmount));
  console.log("Amount SHIS:", hre.ethers.formatEther(liquidityAmount));

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  try {
    const addLiquidityTx = await router.addLiquidity(
      SG_ADDRESS,
      SHIS_ADDRESS,
      liquidityAmount,
      liquidityAmount,
      0, // amountAMin - set to 0 for testing
      0, // amountBMin - set to 0 for testing
      deployer.address,
      deadline,
      { gasLimit: 500000 }
    );
    
    console.log("Transaction sent:", addLiquidityTx.hash);
    const receipt = await addLiquidityTx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Check pair reserves
    const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress);
    const reserves = await pair.getReserves();
    
    console.log("\n=== Liquidity Added Successfully! ===");
    console.log("Pair address:", pairAddress);
    console.log("Reserve0:", hre.ethers.formatEther(reserves[0]));
    console.log("Reserve1:", hre.ethers.formatEther(reserves[1]));
    
    // Check which token is token0/token1
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    console.log("\nToken0:", token0, token0.toLowerCase() === SG_ADDRESS.toLowerCase() ? "(SG)" : "(SHIS)");
    console.log("Token1:", token1, token1.toLowerCase() === SHIS_ADDRESS.toLowerCase() ? "(SHIS)" : "(SG)");

  } catch (error) {
    console.error("Error adding liquidity:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }

  console.log("\n=== Setup Complete! ===");
  console.log("\nYou can now:");
  console.log("1. Start the DEX frontend: cd ../dex && npm run dev");
  console.log("2. Connect MetaMask to Sepolia network");
  console.log("3. Test swapping SG <-> SHIS tokens!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
