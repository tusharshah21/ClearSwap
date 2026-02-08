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

// PoolSwapTest interface (deployed on Sepolia)
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

/// @notice Minimal swap script using PoolManager.swap() directly
contract SimpleSwapScript is Script {
    
    function run() public {
        IPoolManager poolManager = IPoolManager(vm.envAddress("POOL_MANAGER"));
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

        vm.startBroadcast();

        // Approve tokens for swap router
        IERC20(token0).approve(swapRouter, type(uint256).max);
        IERC20(token1).approve(swapRouter, type(uint256).max);

        console.log("=== Executing Simple Swap ===");
        
        // Single swap to test
        IPoolSwapTest(swapRouter).swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18, // Swap 1 token
                sqrtPriceLimitX96: 4295128740 // Min sqrt price
            }),
            IPoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            ""
        );

        console.log("Swap executed successfully!");

        vm.stopBroadcast();
    }
}
