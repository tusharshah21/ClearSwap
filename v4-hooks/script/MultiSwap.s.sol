// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {VolatilityFeeHook} from "../src/VolatilityFeeHook.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }
    
    function swap(
        PoolKey memory key,
        SwapParams memory params,
        TestSettings memory testSettings,
        bytes memory hookData
    ) external payable returns (BalanceDelta delta);
}

/// @notice Execute multiple swaps to demonstrate adaptive fees
contract MultiSwapScript is Script {
    using PoolIdLibrary for PoolKey;
    
    function run() public {
        address hookAddr = vm.envAddress("HOOK");
        address tokenA = vm.envAddress("TOKEN_A");
        address tokenB = vm.envAddress("TOKEN_B");
        address swapRouter = vm.envAddress("SWAP_ROUTER");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });

        PoolId poolId = poolKey.toId();
        VolatilityFeeHook hook = VolatilityFeeHook(hookAddr);

        vm.startBroadcast();

        // Approve tokens
        IERC20(token0).approve(swapRouter, type(uint256).max);
        IERC20(token1).approve(swapRouter, type(uint256).max);

        console.log("=== Multi-Swap Demo ===");
        console.log("");

        // Swap 1: Large swap to trigger volatility
        console.log("--- Executing LARGE swap (100 tokens) ---");
        IPoolSwapTest(swapRouter).swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -100e18,
                sqrtPriceLimitX96: 4295128740
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        _logMetrics(hook, poolId, "After large swap");

        // Swap 2: Another large swap (opposite direction)
        console.log("");
        console.log("--- Executing LARGE swap opposite direction (80 tokens) ---");
        IPoolSwapTest(swapRouter).swap(
            poolKey,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -80e18,
                sqrtPriceLimitX96: 1461446703485210103287273052203988822378723970341
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        _logMetrics(hook, poolId, "After 2nd large swap");

        // Swap 3: Small swap while volatility is high
        console.log("");
        console.log("--- Executing small swap (0.1 tokens) during high volatility ---");
        IPoolSwapTest(swapRouter).swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -0.1e18,
                sqrtPriceLimitX96: 4295128740
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        _logMetrics(hook, poolId, "After small swap (fee should be high)");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Demo Complete ===");
        console.log("Check dashboard at localhost:5174/hook for live updates!");
    }

    function _logMetrics(VolatilityFeeHook hook, PoolId poolId, string memory label) internal view {
        (, uint256 ewma, uint24 fee,) = hook.getPoolMetrics(poolId);
        console.log(label);
        console.log("  EWMA Volatility:", ewma);
        console.log("  Current Fee (bps):", fee);
    }
}
