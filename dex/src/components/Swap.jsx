import React, { useState, useEffect, useCallback } from "react";
import { Input, Popover, Radio, Modal, message } from "antd";
import {
  ArrowDownOutlined,
  DownOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useAccount, useSigner, useNetwork } from "wagmi";
import { ethers } from "ethers";

// Import token lists based on network
import tokenListMainnet from "../tokenList.json";
import tokenListSepolia from "../tokenListSepolia.json";

// Import ABIs
import uniswapFactoryABI from "../UniFactory.json";
import uniPair from "../UniPair.json";
import uniRouter from "../UniRouter.json";

// Network configurations
const NETWORK_CONFIG = {
  1: {
    name: "mainnet",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    rpcUrl: `https://mainnet.infura.io/v3/`,
    tokenList: tokenListMainnet,
  },
  11155111: {
    name: "sepolia",
    factory: "", // Will be set from localStorage after deployment
    router: "", // Will be set from localStorage after deployment
    rpcUrl: `https://sepolia.infura.io/v3/`,
    tokenList: tokenListSepolia,
  },
  31337: {
    name: "localhost",
    factory: "", // Will be set from localStorage after deployment
    router: "", // Will be set from localStorage after deployment
    rpcUrl: "http://127.0.0.1:8545",
    tokenList: tokenListSepolia,
  },
};

// Load deployed contract addresses from localStorage or use defaults
const getNetworkConfig = (chainId) => {
  const config = NETWORK_CONFIG[chainId] || NETWORK_CONFIG[11155111];
  
  // Try to load from localStorage
  const savedConfig = localStorage.getItem(`dex_config_${chainId}`);
  if (savedConfig) {
    const parsed = JSON.parse(savedConfig);
    return { ...config, ...parsed };
  }
  
  return config;
};

function Swap() {
  const { address, isConnected } = useAccount();
  const { data: signer } = useSigner();
  const { chain } = useNetwork();
  
  const [slippage, setSlippage] = useState(2.5);
  const [tokenOneAmount, setTokenOneAmount] = useState("");
  const [tokenTwoAmount, setTokenTwoAmount] = useState("");
  const [tokenOne, setTokenOne] = useState(null);
  const [tokenTwo, setTokenTwo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [changeToken, setChangeToken] = useState(1);
  const [oneN, setOneN] = useState();
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [networkConfig, setNetworkConfig] = useState(null);
  const [tokenList, setTokenList] = useState([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [customFactory, setCustomFactory] = useState("");
  const [customRouter, setCustomRouter] = useState("");

  // Initialize based on connected network
  useEffect(() => {
    const chainId = chain?.id || 11155111;
    const config = getNetworkConfig(chainId);
    setNetworkConfig(config);
    setTokenList(config.tokenList);
    setCustomFactory(config.factory || "");
    setCustomRouter(config.router || "");
    
    if (config.tokenList.length >= 2) {
      setTokenOne(config.tokenList[0]);
      setTokenTwo(config.tokenList[1]);
    }
  }, [chain?.id]);

  // Function to get provider
  const getProvider = useCallback(() => {
    if (!networkConfig) return null;
    
    const INFURA_ID = import.meta.env.VITE_INFURA_ID;
    const rpcUrl = networkConfig.rpcUrl.includes("infura") 
      ? `${networkConfig.rpcUrl}${INFURA_ID}`
      : networkConfig.rpcUrl;
    
    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }, [networkConfig]);

  // Fetch price and calculate output amount
  const fetchPairAndCalculateAmount = useCallback(async (
    tokenOneAddress,
    tokenTwoAddress,
    inputAmount
  ) => {
    if (!networkConfig?.router || !networkConfig?.factory) {
      console.log("Network config not set. Please configure contract addresses.");
      return;
    }

    const provider = getProvider();
    if (!provider) return;

    try {
      setIsLoading(true);
      
      const uniswapRouter = new ethers.Contract(
        networkConfig.router,
        uniRouter,
        provider
      );

      const amountIn = ethers.utils.parseUnits(
        inputAmount.toString(),
        tokenOne.decimals
      );
      const path = [tokenOneAddress, tokenTwoAddress];
      
      const amounts = await uniswapRouter.getAmountsOut(amountIn, path);
      
      // Get rate for 1 token
      const oneUnit = ethers.utils.parseUnits("1", tokenOne.decimals);
      const rateAmounts = await uniswapRouter.getAmountsOut(oneUnit, path);

      setTokenTwoAmount(
        parseFloat(
          ethers.utils.formatUnits(amounts[1], tokenTwo.decimals)
        ).toFixed(6)
      );
      setOneN(
        parseFloat(
          ethers.utils.formatUnits(rateAmounts[1], tokenTwo.decimals)
        ).toFixed(6)
      );
    } catch (error) {
      console.error("Error fetching price:", error);
      setTokenTwoAmount("");
      setOneN(null);
      
      if (error.message.includes("PAIR_NOT_EXISTS")) {
        message.error("No liquidity pool exists for this pair!");
      }
    } finally {
      setIsLoading(false);
    }
  }, [networkConfig, tokenOne, tokenTwo, getProvider]);

  // Handle input amount change
  function changeAmount(e) {
    const value = e.target.value;
    setTokenOneAmount(value);
    
    if (value && parseFloat(value) > 0 && tokenOne && tokenTwo) {
      fetchPairAndCalculateAmount(tokenOne.address, tokenTwo.address, value);
    } else {
      setTokenTwoAmount("");
      setOneN(null);
    }
  }

  function handleSlippageChange(e) {
    setSlippage(e.target.value);
  }

  function switchTokens() {
    setTokenOneAmount("");
    setTokenTwoAmount("");
    setOneN(null);
    const one = tokenOne;
    const two = tokenTwo;
    setTokenOne(two);
    setTokenTwo(one);
  }

  function openModal(asset) {
    setChangeToken(asset);
    setIsOpen(true);
  }

  function modifyToken(i) {
    setTokenOneAmount("");
    setTokenTwoAmount("");
    setOneN(null);
    if (changeToken === 1) {
      setTokenOne(tokenList[i]);
    } else {
      setTokenTwo(tokenList[i]);
    }
    setIsOpen(false);
  }

  // Execute swap
  async function executeSwap() {
    if (!isConnected) {
      message.error("Please connect your wallet first!");
      return;
    }

    if (!signer) {
      message.error("Signer not available. Please reconnect wallet.");
      return;
    }

    if (!networkConfig?.router) {
      message.error("Router not configured. Set contract addresses in settings.");
      setConfigModalOpen(true);
      return;
    }

    if (!tokenOneAmount || parseFloat(tokenOneAmount) <= 0) {
      message.error("Please enter an amount to swap");
      return;
    }

    try {
      setIsSwapping(true);
      message.loading("Preparing swap...", 0);

      const routerAddress = networkConfig.router;
      const router = new ethers.Contract(routerAddress, uniRouter, signer);
      const tokenContract = new ethers.Contract(
        tokenOne.address,
        ["function approve(address spender, uint256 amount) external returns (bool)"],
        signer
      );

      const amountIn = ethers.utils.parseUnits(tokenOneAmount, tokenOne.decimals);
      const amountOutMin = ethers.utils.parseUnits(
        (parseFloat(tokenTwoAmount) * (1 - slippage / 100)).toFixed(tokenTwo.decimals > 6 ? 6 : tokenTwo.decimals),
        tokenTwo.decimals
      );

      // Approve router to spend tokens
      message.destroy();
      message.loading("Approving token spend...", 0);
      const approveTx = await tokenContract.approve(routerAddress, amountIn);
      await approveTx.wait();
      
      message.destroy();
      message.loading("Executing swap...", 0);

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const path = [tokenOne.address, tokenTwo.address];

      const swapTx = await router.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        address,
        deadline,
        { gasLimit: 300000 }
      );

      const receipt = await swapTx.wait();
      
      message.destroy();
      message.success(`Swap successful! TX: ${receipt.transactionHash.slice(0, 10)}...`);
      
      setTokenOneAmount("");
      setTokenTwoAmount("");
      setOneN(null);

    } catch (error) {
      message.destroy();
      console.error("Swap error:", error);
      
      if (error.code === "ACTION_REJECTED") {
        message.error("Transaction rejected by user");
      } else if (error.message.includes("insufficient")) {
        message.error("Insufficient token balance");
      } else {
        message.error(`Swap failed: ${error.reason || error.message?.slice(0, 50)}`);
      }
    } finally {
      setIsSwapping(false);
    }
  }

  // Save custom contract addresses
  function saveCustomConfig() {
    if (!customFactory || !customRouter) {
      message.error("Please enter both Factory and Router addresses");
      return;
    }

    const chainId = chain?.id || 11155111;
    const config = { factory: customFactory, router: customRouter };
    
    localStorage.setItem(`dex_config_${chainId}`, JSON.stringify(config));
    setNetworkConfig({ ...networkConfig, ...config });
    setConfigModalOpen(false);
    message.success("Contract addresses saved!");
  }

  const settings = (
    <div>
      <div style={{ marginBottom: 10 }}>Slippage Tolerance</div>
      <Radio.Group value={slippage} onChange={handleSlippageChange}>
        <Radio.Button value={0.5}>0.5%</Radio.Button>
        <Radio.Button value={2.5}>2.5%</Radio.Button>
        <Radio.Button value={5}>5.0%</Radio.Button>
      </Radio.Group>
      <div style={{ marginTop: 15 }}>
        <a onClick={() => setConfigModalOpen(true)} style={{ cursor: "pointer", color: "#1890ff" }}>
          ⚙️ Configure Contracts
        </a>
      </div>
    </div>
  );

  if (!tokenOne || !tokenTwo) {
    return <div className="tradeBox">Loading tokens...</div>;
  }

  return (
    <>
      <Modal
        open={isOpen}
        footer={null}
        onCancel={() => setIsOpen(false)}
        title="Select a token"
      >
        <div className="modalContent">
          {tokenList?.map((e, i) => (
            <div className="tokenChoice" key={i} onClick={() => modifyToken(i)}>
              <img src={e.img} alt={e.ticker} className="tokenLogo" />
              <div className="tokenChoiceNames">
                <div className="tokenName">{e.name}</div>
                <div className="tokenTicker">{e.ticker}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={configModalOpen}
        title="Configure Contract Addresses"
        onCancel={() => setConfigModalOpen(false)}
        onOk={saveCustomConfig}
        okText="Save"
      >
        <div style={{ marginBottom: 15 }}>
          <p>Network: {chain?.name || "Sepolia"} (Chain ID: {chain?.id || 11155111})</p>
          <p style={{ fontSize: 12, color: "#888" }}>
            Enter the deployed contract addresses from your blockchain deployment.
          </p>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Factory Address:</label>
          <Input value={customFactory} onChange={(e) => setCustomFactory(e.target.value)} placeholder="0x..." />
        </div>
        <div>
          <label>Router Address:</label>
          <Input value={customRouter} onChange={(e) => setCustomRouter(e.target.value)} placeholder="0x..." />
        </div>
      </Modal>

      <div className="tradeBox">
        <div className="tradeBoxHeader">
          <h4>Swap</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#888" }}>{chain?.name || "Sepolia"}</span>
            <Popover content={settings} title="Settings" trigger="click" placement="bottomRight">
              <SettingOutlined className="cog" />
            </Popover>
          </div>
        </div>
        <div className="inputs">
          <Input type="number" placeholder="0" value={tokenOneAmount} onChange={changeAmount} disabled={isSwapping} />
          <Input type="number" placeholder="0" value={isLoading ? "..." : tokenTwoAmount} disabled={true} />
          <div className="switchButton" onClick={switchTokens}>
            <ArrowDownOutlined className="switchArrow" />
          </div>
          <div className="assetOne" onClick={() => openModal(1)}>
            <img src={tokenOne.img} alt="assetOneLogo" className="assetLogo" />
            {tokenOne.ticker}
            <DownOutlined />
          </div>
          <div className="assetTwo" onClick={() => openModal(2)}>
            <img src={tokenTwo.img} alt="assetTwoLogo" className="assetLogo" />
            {tokenTwo.ticker}
            <DownOutlined />
          </div>
        </div>
        {tokenOneAmount && parseFloat(tokenOneAmount) > 0 && (
          <div className="calculate">
            {oneN ? `1 ${tokenOne.ticker} = ${oneN} ${tokenTwo.ticker}` : isLoading ? "Calculating..." : "Enter amount"}
          </div>
        )}
        <div
          className="swapButton"
          onClick={executeSwap}
          style={{
            cursor: (!tokenOneAmount || !tokenTwoAmount || isSwapping) ? "not-allowed" : "pointer",
            opacity: (!tokenOneAmount || !tokenTwoAmount || isSwapping) ? 0.5 : 1,
          }}
        >
          {!isConnected ? "Connect Wallet" : isSwapping ? "Swapping..." : !networkConfig?.router ? "Configure Contracts" : "Swap"}
        </div>
      </div>
    </>
  );
}

export default Swap;
