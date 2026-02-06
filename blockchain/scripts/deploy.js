const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  const network = hre.network.name;
  console.log("\n=== Deploying to", network, "===\n");

  // Step 1: Deploy or use existing WETH
  let wethAddress;
  
  if (network === "sepolia") {
    // Use existing Sepolia WETH (canonical address)
    wethAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
    console.log("Using existing Sepolia WETH:", wethAddress);
  } else {
    // Deploy WETH for local testing
    console.log("Deploying WETH...");
    const WETH = await hre.ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.waitForDeployment();
    wethAddress = await weth.getAddress();
    console.log("WETH deployed to:", wethAddress);
  }

  // Step 2: Deploy UniswapV2Factory
  console.log("\nDeploying UniswapV2Factory...");
  const Factory = await hre.ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("UniswapV2Factory deployed to:", factoryAddress);

  // Step 3: Deploy UniswapV2Router02
  console.log("\nDeploying UniswapV2Router02...");
  const Router = await hre.ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(factoryAddress, wethAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("UniswapV2Router02 deployed to:", routerAddress);

  // Step 4: Create pair for user's tokens on Sepolia
  if (network === "sepolia") {
    const SG_TOKEN = process.env.SG_TOKEN_ADDRESS || "0x0daABD82B88FA5056E52BaE7312987b5e17B917F";
    const SHIS_TOKEN = process.env.SHIS_TOKEN_ADDRESS || "0xf65fFb885Abdd91dE948239bA476d264FdEFA37e";
    
    console.log("\nCreating SG/SHIS pair...");
    console.log("SG Token:", SG_TOKEN);
    console.log("SHIS Token:", SHIS_TOKEN);
    
    try {
      const tx = await factory.createPair(SG_TOKEN, SHIS_TOKEN);
      await tx.wait();
      const pairAddress = await factory.getPair(SG_TOKEN, SHIS_TOKEN);
      console.log("SG/SHIS Pair created at:", pairAddress);
    } catch (error) {
      console.log("Pair creation error (may already exist):", error.message);
    }
  }

  // Save deployment addresses
  const deploymentInfo = {
    network: network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      WETH: wethAddress,
      UniswapV2Factory: factoryAddress,
      UniswapV2Router02: routerAddress,
    },
    tokens: network === "sepolia" ? {
      SG: process.env.SG_TOKEN_ADDRESS || "0x0daABD82B88FA5056E52BaE7312987b5e17B917F",
      SHIS: process.env.SHIS_TOKEN_ADDRESS || "0xf65fFb885Abdd91dE948239bA476d264FdEFA37e",
    } : {}
  };

  // Save to deployments folder
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", deploymentFile);

  // Update frontend config
  await updateFrontendConfig(deploymentInfo);

  console.log("\n=== Deployment Complete ===");
  console.log("\nNext steps:");
  console.log("1. Run 'npm run add-liquidity:sepolia' to add liquidity to the SG/SHIS pool");
  console.log("2. Start the frontend with 'cd ../dex && npm run dev'");
  console.log("3. Connect MetaMask to Sepolia and test swaps!");
}

async function updateFrontendConfig(deployment) {
  const dexConfigDir = path.join(__dirname, "..", "..", "dex", "src", "config");
  if (!fs.existsSync(dexConfigDir)) {
    fs.mkdirSync(dexConfigDir, { recursive: true });
  }

  // Create networks config for frontend
  const networksConfig = {
    sepolia: {
      chainId: 11155111,
      name: "Sepolia",
      rpcUrl: "https://sepolia.infura.io/v3/",
      factory: deployment.contracts.UniswapV2Factory,
      router: deployment.contracts.UniswapV2Router02,
      weth: deployment.contracts.WETH,
    },
    localhost: {
      chainId: 31337,
      name: "Localhost",
      rpcUrl: "http://127.0.0.1:8545",
      factory: deployment.network === "localhost" ? deployment.contracts.UniswapV2Factory : "",
      router: deployment.network === "localhost" ? deployment.contracts.UniswapV2Router02 : "",
      weth: deployment.network === "localhost" ? deployment.contracts.WETH : "",
    }
  };

  // Update or create networks.js
  const existingNetworksPath = path.join(dexConfigDir, "networks.js");
  let existingConfig = {};
  if (fs.existsSync(existingNetworksPath)) {
    try {
      const content = fs.readFileSync(existingNetworksPath, 'utf8');
      const match = content.match(/export const networks = ({[\s\S]*});/);
      if (match) {
        existingConfig = eval('(' + match[1] + ')');
      }
    } catch (e) {
      console.log("Could not parse existing networks config, will overwrite");
    }
  }

  // Merge configs
  const mergedConfig = { ...existingConfig };
  mergedConfig[deployment.network] = networksConfig[deployment.network] || {
    chainId: parseInt(deployment.chainId),
    name: deployment.network,
    factory: deployment.contracts.UniswapV2Factory,
    router: deployment.contracts.UniswapV2Router02,
    weth: deployment.contracts.WETH,
  };

  const configContent = `// Auto-generated by deploy script - DO NOT EDIT MANUALLY
export const networks = ${JSON.stringify(mergedConfig, null, 2)};

export const getNetworkConfig = (chainId) => {
  return Object.values(networks).find(n => n.chainId === chainId);
};
`;

  fs.writeFileSync(existingNetworksPath, configContent);
  console.log("Frontend network config updated:", existingNetworksPath);

  // Create Sepolia token list
  if (deployment.network === "sepolia" && deployment.tokens) {
    const tokenListPath = path.join(__dirname, "..", "..", "dex", "src", "tokenListSepolia.json");
    const tokenList = [
      {
        ticker: "SG",
        img: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
        name: "SG Token",
        address: deployment.tokens.SG,
        decimals: 18
      },
      {
        ticker: "SHIS",
        img: "https://s2.coinmarketcap.com/static/img/coins/64x64/2396.png",
        name: "SHIS Token", 
        address: deployment.tokens.SHIS,
        decimals: 18
      },
      {
        ticker: "WETH",
        img: "https://s2.coinmarketcap.com/static/img/coins/64x64/2396.png",
        name: "Wrapped Ether",
        address: deployment.contracts.WETH,
        decimals: 18
      }
    ];
    fs.writeFileSync(tokenListPath, JSON.stringify(tokenList, null, 4));
    console.log("Sepolia token list created:", tokenListPath);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
