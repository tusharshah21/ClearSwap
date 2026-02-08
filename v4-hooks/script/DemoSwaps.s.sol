// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {VolatilityFeeHook} from "../src/VolatilityFeeHook.sol";

/// @notice Executes swaps through the VolatilityFeeHook to demonstrate adaptive fees.
///
/// This script runs a sequence of swaps that exercises all fee regimes:
///   1. Small swaps (calm) -> fee stays low
///   2. Large swap (shock) -> fee spikes
///   3. Small swaps (recovery) -> fee decays
///
/// After each phase, it reads the hook's metrics to show the fee adaptation on-chain.
///
/// Usage:
///   POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
///   HOOK=<deployed-hook-address> \
///   TOKEN_A=<token-address> \
///   TOKEN_B=<token-address> \
///   SWAP_ROUTER=0x9b6b46e2c869aa39918db7f52f5557fe577b6eee \
///   forge script script/DemoSwaps.s.sol \
///     --rpc-url <RPC_URL> --account <KEYSTORE> --sender <ADDRESS> --broadcast
contract DemoSwapsScript is Script {
    using PoolIdLibrary for PoolKey;

    function run() public {
        vm.envAddress("POOL_MANAGER"); // validate env var exists
        address hookAddr = vm.envAddress("HOOK");
        address tokenA = vm.envAddress("TOKEN_A");
        address tokenB = vm.envAddress("TOKEN_B");
        address swapRouter = vm.envAddress("SWAP_ROUTER");

        // Sort tokens
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

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

        // Approve tokens for swap router
        IERC20(token0).approve(swapRouter, type(uint256).max);
        IERC20(token1).approve(swapRouter, type(uint256).max);

        console.log("");
        console.log("=== VolatilityFeeHook Demo Swaps ===");
        console.log("");

        // ── Phase 1: Calm Market (3 small swaps) ────────────────
        console.log("--- Phase 1: Calm Market ---");
        for (uint256 i = 0; i < 3; i++) {
            _doSwap(swapRouter, poolKey, true, -0.01e18);
        }
        _logMetrics(hook, poolId, "After calm phase");

        // ── Phase 2: Volatility Shock (1 large swap) ────────────
        console.log("--- Phase 2: Volatility Shock ---");
        _doSwap(swapRouter, poolKey, true, -10e18);
        _logMetrics(hook, poolId, "After shock");

        // ── Phase 3: Recovery (5 small swaps) ───────────────────
        console.log("--- Phase 3: Recovery ---");
        for (uint256 i = 0; i < 5; i++) {
            _doSwap(swapRouter, poolKey, (i % 2 == 0), -0.001e18);
        }
        _logMetrics(hook, poolId, "After recovery");

        vm.stopBroadcast();

        console.log("");
        console.log("Demo complete. Check TxIDs on block explorer.");
    }

    function _doSwap(
        address swapRouter,
        PoolKey memory poolKey,
        bool zeroForOne,
        int256 amountSpecified
    ) internal {
        // PoolSwapTest.swap() signature
        (bool success,) = swapRouter.call(
            abi.encodeWithSignature(
                "swap((address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
                poolKey,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: amountSpecified,
                    sqrtPriceLimitX96: zeroForOne
                        ? TickMath.MIN_SQRT_PRICE + 1
                        : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            )
        );
        require(success, "Swap failed");
    }

    function _logMetrics(VolatilityFeeHook hook, PoolId poolId, string memory label) internal view {
        (, uint256 ewma, uint24 fee,) = hook.getPoolMetrics(poolId);
        console.log(label);
        console.log("  EWMA Volatility:", ewma);
        console.log("  Current Fee (bps):", fee);
    }
}
