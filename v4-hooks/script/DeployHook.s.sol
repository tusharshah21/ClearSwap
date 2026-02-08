// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {VolatilityFeeHook} from "../src/VolatilityFeeHook.sol";

/// @notice Deploys the VolatilityFeeHook to an address with correct hook flags.
///
/// In Uniswap v4, the hook's address itself encodes which hooks are active.
/// We need to mine a salt that produces an address matching our required flags:
///   - AFTER_INITIALIZE (to record starting tick)
///   - BEFORE_SWAP (to set dynamic fee)
///   - AFTER_SWAP (to update volatility)
///
/// Usage:
///   forge script script/DeployHook.s.sol \
///     --rpc-url <RPC_URL> \
///     --account <KEYSTORE_NAME> \
///     --sender <DEPLOYER_ADDRESS> \
///     --broadcast
contract DeployHookScript is Script {
    function run() public {
        // ── 1. Get the PoolManager address for the target network ──
        // Update this for your target chain. See:
        // https://docs.uniswap.org/contracts/v4/deployments
        address poolManagerAddress = vm.envAddress("POOL_MANAGER");
        IPoolManager poolManager = IPoolManager(poolManagerAddress);

        // ── 2. Define the hook flags we need ──────────────────────
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        );

        // ── 3. Mine a salt that produces a valid hook address ─────
        bytes memory constructorArgs = abi.encode(poolManager);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(VolatilityFeeHook).creationCode,
            constructorArgs
        );

        console.log("Deploying VolatilityFeeHook to:", hookAddress);
        console.log("Salt:", vm.toString(salt));

        // ── 4. Deploy ─────────────────────────────────────────────
        vm.startBroadcast();
        VolatilityFeeHook hook = new VolatilityFeeHook{salt: salt}(poolManager);
        vm.stopBroadcast();

        require(
            address(hook) == hookAddress,
            "DeployHook: address mismatch - flags or salt incorrect"
        );

        console.log("VolatilityFeeHook deployed successfully at:", address(hook));
    }
}
