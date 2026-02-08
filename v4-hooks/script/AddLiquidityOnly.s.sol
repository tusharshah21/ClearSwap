// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @notice Adds liquidity to an already-initialized pool
contract AddLiquidityOnlyScript is Script {
    function run() public {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address hookAddr = vm.envAddress("HOOK");
        address tokenA = vm.envAddress("TOKEN_A");
        address tokenB = vm.envAddress("TOKEN_B");
        address modifyLiquidityRouter = vm.envAddress("MODIFY_LIQUIDITY_ROUTER");

        // Sort tokens
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

        vm.startBroadcast();

        // Approve tokens for PoolManager
        uint256 liquidityAmount = 1000e18;
        IERC20(token0).approve(poolManager, type(uint256).max);
        IERC20(token1).approve(poolManager, type(uint256).max);
        console.log("Tokens approved for PoolManager");

        // Add liquidity across a wide tick range
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
                "")
        );
        require(success, "ModifyLiquidity failed");
        console.log("Liquidity added: 1000e18 across [-6000, 6000]");

        vm.stopBroadcast();

        console.log("=== Liquidity Added Successfully ===");
    }
}
