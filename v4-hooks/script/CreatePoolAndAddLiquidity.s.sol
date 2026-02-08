// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @notice Creates a pool with the VolatilityFeeHook and adds initial liquidity.
///
/// Prerequisites:
///   - VolatilityFeeHook deployed (run DeployHook.s.sol first)
///   - Two ERC20 tokens deployed and funded
///
/// Usage:
///   POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
///   HOOK=<deployed-hook-address> \
///   TOKEN_A=<token-address> \
///   TOKEN_B=<token-address> \
///   MODIFY_LIQUIDITY_ROUTER=0x0c478023803a644c94c4ce1c1e7b9a087e411b0a \
///   forge script script/CreatePoolAndAddLiquidity.s.sol \
///     --rpc-url <RPC_URL> --account <KEYSTORE> --sender <ADDRESS> --broadcast
contract CreatePoolAndAddLiquidityScript is Script {
    function run() public {
        IPoolManager poolManager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        address hookAddr = vm.envAddress("HOOK");
        address tokenA = vm.envAddress("TOKEN_A");
        address tokenB = vm.envAddress("TOKEN_B");
        address modifyLiquidityRouter = vm.envAddress("MODIFY_LIQUIDITY_ROUTER");

        // ── Sort tokens (Uniswap v4 requires currency0 < currency1) ──
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Hook:", hookAddr);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });

        // sqrtPriceX96 for 1:1 price
        uint160 startPrice = 79228162514264337593543950336;

        vm.startBroadcast();

        // ── 1. Initialize the pool ──────────────────────────────
        poolManager.initialize(poolKey, startPrice);
        console.log("Pool initialized at 1:1 price");

        // ── 2. Approve tokens for the ModifyLiquidity router ────
        uint256 liquidityAmount = 100e18;
        IERC20(token0).approve(modifyLiquidityRouter, type(uint256).max);
        IERC20(token1).approve(modifyLiquidityRouter, type(uint256).max);
        console.log("Tokens approved for liquidity router");

        // ── 3. Add liquidity across a wide tick range ───────────
        // Uses the PoolModifyLiquidityTest helper deployed on Sepolia
        (bool success,) = modifyLiquidityRouter.call(
            abi.encodeWithSignature(
                "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)",
                poolKey,
                ModifyLiquidityParams({
                    tickLower: -6000,
                    tickUpper: 6000,
                    liquidityDelta: int256(liquidityAmount),
                    salt: bytes32(0)
                }),
                ""
            )
        );
        require(success, "ModifyLiquidity failed");
        console.log("Liquidity added: 100e18 across [-6000, 6000]");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Pool Created Successfully ===");
        console.log("PoolManager:", address(poolManager));
        console.log("Hook:", hookAddr);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Fee: DYNAMIC (managed by VolatilityFeeHook)");
        console.log("Tick Spacing: 60");
    }
}
