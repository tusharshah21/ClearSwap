// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

// The v4-core test Deployers gives us PoolManager, SwapRouter, LiquidityRouter, and helpers
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";

import {VolatilityFeeHook} from "../src/VolatilityFeeHook.sol";

/// @title VolatilityFeeHook Test — Demonstrates adaptive fee behavior
///
/// TEST SCENARIO (what we show judges):
///
///   1. Deploy pool with VolatilityFeeHook + DYNAMIC_FEE_FLAG
///   2. Perform small swaps → minimal tick movement → fee drops to minimum
///   3. Perform large swap → big price impact → volatility spikes → fee rises
///   4. Perform more large swaps → fee hits maximum
///   5. Perform small swaps → volatility decays → fee drops back down
///
/// This proves: the hook ADAPTS fees to real market conditions.
/// A static 30bp pool cannot do this.
contract VolatilityFeeHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    VolatilityFeeHook hook;
    PoolKey poolKey;
    PoolId poolId;

    function setUp() public {
        // ── 1. Deploy v4 infrastructure ─────────────────────────
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();

        // ── 2. Deploy hook at address with correct permission flags ─
        // In Uniswap v4, the hook address itself encodes which hooks are active.
        // We need AFTER_INITIALIZE + BEFORE_SWAP + AFTER_SWAP flags set.
        address flags = address(
            uint160(
                Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            ) ^ (0x4444 << 144) // Namespace to avoid address collisions
        );

        bytes memory constructorArgs = abi.encode(manager);
        deployCodeTo("VolatilityFeeHook.sol:VolatilityFeeHook", constructorArgs, flags);
        hook = VolatilityFeeHook(flags);

        // ── 3. Create pool with DYNAMIC FEE FLAG ────────────────
        // This tells the PoolManager that fees are not static — they'll be
        // set by our hook's beforeSwap return value.
        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG, // <-- THE KEY DIFFERENCE from V2/V3
            tickSpacing: 60,
            hooks: IHooks(hook)
        });
        poolId = poolKey.toId();

        // Initialize pool at 1:1 price (sqrtPriceX96 for price = 1.0)
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        // ── 4. Add deep liquidity across a wide range ───────────
        // Wide range so we can do large swaps without hitting tick boundaries
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -6000,   // Wide range
                tickUpper: 6000,    // Wide range
                liquidityDelta: 1000e18,
                salt: 0
            }),
            ZERO_BYTES
        );
    }

    // =====================================================================
    //  TEST 1: Hook initializes correctly
    // =====================================================================

    function test_hookInitialization() public view {
        (int24 lastTick, uint256 ewmaVol, uint24 currentFee, bool initialized) =
            hook.getPoolMetrics(poolId);

        assertEq(initialized, true, "Pool should be initialized");
        assertEq(lastTick, 0, "Starting tick should be 0 for 1:1 price");
        assertEq(ewmaVol, 0, "Initial volatility should be 0");
        assertEq(currentFee, 3000, "Initial fee should be DEFAULT_FEE (30bp)");
    }

    // =====================================================================
    //  TEST 2: Small swaps → low volatility → fee drops toward minimum
    // =====================================================================

    function test_smallSwaps_lowVolatility_lowFee() public {
        // Perform several tiny swaps — these barely move the price
        for (uint256 i = 0; i < 5; i++) {
            swap(poolKey, true, -0.001e18, ZERO_BYTES); // Small exact-input swap
        }

        (, uint256 ewmaVol, uint24 currentFee,) = hook.getPoolMetrics(poolId);

        // With tiny swaps, tick barely moves → squared returns are tiny → EWMA stays low
        console.log("After 5 small swaps:");
        console.log("  EWMA Volatility:", ewmaVol);
        console.log("  Current Fee (pips):", currentFee);

        // Fee should be at or near minimum since volatility is very low
        assertTrue(currentFee <= 3000, "Fee should be at or below default after small swaps");
    }

    // =====================================================================
    //  TEST 3: Large swap → price impact → volatility spike → fee rises
    // =====================================================================

    function test_largeSwap_highVolatility_highFee() public {
        // First, do small swaps to establish low baseline
        for (uint256 i = 0; i < 3; i++) {
            swap(poolKey, true, -0.001e18, ZERO_BYTES);
        }

        (, , uint24 feeBeforeLargeSwap,) = hook.getPoolMetrics(poolId);
        console.log("Fee before large swap (pips):", feeBeforeLargeSwap);

        // Now do a LARGE swap that moves the price significantly
        swap(poolKey, true, -50e18, ZERO_BYTES);

        (, uint256 ewmaVolAfter, uint24 feeAfterLargeSwap,) = hook.getPoolMetrics(poolId);
        console.log("After large swap:");
        console.log("  EWMA Volatility:", ewmaVolAfter);
        console.log("  Current Fee (pips):", feeAfterLargeSwap);

        // Fee must have increased — this is THE core assertion
        assertTrue(
            feeAfterLargeSwap > feeBeforeLargeSwap,
            "Fee MUST increase after a large price-moving swap"
        );
    }

    // =====================================================================
    //  TEST 4: Sustained volatility → fee climbs toward maximum
    // =====================================================================

    function test_sustainedVolatility_feeClimbs() public {
        uint24 previousFee = 3000; // default

        // Do several large swaps alternating direction (simulates volatile market)
        for (uint256 i = 0; i < 5; i++) {
            bool zeroForOne = (i % 2 == 0);
            swap(poolKey, zeroForOne, -30e18, ZERO_BYTES);
        }

        (, uint256 ewmaVol, uint24 finalFee,) = hook.getPoolMetrics(poolId);
        console.log("After 5 large alternating swaps:");
        console.log("  EWMA Volatility:", ewmaVol);
        console.log("  Final Fee (pips):", finalFee);

        // After sustained large swaps, fee should be well above default
        assertTrue(finalFee > previousFee, "Fee should exceed default after sustained volatility");
    }

    // =====================================================================
    //  TEST 5: Volatility decay — fees come back down after calm trading
    //  THIS IS THE KILLER DEMO SLIDE: "Fees adapt in BOTH directions"
    // =====================================================================

    function test_volatilityDecay_feeFallsBack() public {
        // Phase 1: Create high volatility
        swap(poolKey, true, -50e18, ZERO_BYTES);
        swap(poolKey, false, -50e18, ZERO_BYTES);

        (, , uint24 peakFee,) = hook.getPoolMetrics(poolId);
        console.log("Peak fee after volatile trading (pips):", peakFee);

        // Phase 2: Many small swaps — volatility should decay via EWMA
        // With alpha=0.3, each zero-tick swap decays EWMA by 0.7x.
        // After 25 swaps: 0.7^25 ≈ 0.00013x — enough to bring any peak below threshold.
        for (uint256 i = 0; i < 25; i++) {
            bool zeroForOne = (i % 2 == 0);
            swap(poolKey, zeroForOne, -0.001e18, ZERO_BYTES);
        }

        (, uint256 decayedVol, uint24 decayedFee,) = hook.getPoolMetrics(poolId);
        console.log("After 25 small swaps (volatility decay):");
        console.log("  EWMA Volatility:", decayedVol);
        console.log("  Decayed Fee (pips):", decayedFee);

        // Fee should have come down from the peak
        assertTrue(
            decayedFee < peakFee,
            "Fee MUST decrease after calm trading period"
        );
    }

    // =====================================================================
    //  TEST 6: previewFee pure function works correctly
    // =====================================================================

    function test_previewFee_boundaries() public view {
        // Below low threshold → minimum fee
        assertEq(hook.previewFee(0), 500, "Zero vol should give MIN_FEE");
        assertEq(hook.previewFee(100), 500, "At LOW_VOL_THRESHOLD should give MIN_FEE");

        // Above high threshold → maximum fee
        assertEq(hook.previewFee(10000), 10000, "At HIGH_VOL_THRESHOLD should give MAX_FEE");
        assertEq(hook.previewFee(99999), 10000, "Above HIGH_VOL_THRESHOLD should give MAX_FEE");

        // Midpoint → should be roughly midpoint fee
        uint24 midFee = hook.previewFee(5050); // midpoint of [100, 10000]
        assertTrue(midFee > 500 && midFee < 10000, "Mid-volatility should give mid-range fee");
        console.log("Mid-volatility fee (pips):", midFee);
    }

    // =====================================================================
    //  TEST 7: QUANTITATIVE COMPARISON — Adaptive vs Static 30bp
    //  THE metric for judges. Run with:
    //    forge test --match-test test_feeRevenue_adaptiveVsStatic -vv
    //
    //  Same 20-swap sequence. Only difference: fee regime.
    //  We track |amountSpecified| × fee for every swap.
    //  This is proportional to actual LP fee revenue.
    // =====================================================================

    function test_feeRevenue_adaptiveVsStatic() public {
        uint256 STATIC_FEE = 3000; // Vanilla Uniswap v3/v4 at 30bp

        uint256 adaptiveTotal;
        uint256 staticTotal;
        uint256 adaptiveVolPhase;
        uint256 staticVolPhase;

        console.log("");
        console.log("=== LP Fee Revenue: Adaptive vs Static 30bp ===");
        console.log("Same swaps, same pool, same liquidity. Only fees differ.");
        console.log("");

        // ── Phase 1: Calm market (5 × 0.01 ETH) ─────────────────
        uint256 calmAmount = 0.01e18;
        uint256 pAdaptive;
        uint256 pStatic;
        for (uint256 i = 0; i < 5; i++) {
            (,,uint24 fee,) = hook.getPoolMetrics(poolId);
            pAdaptive += calmAmount * uint256(fee);
            pStatic  += calmAmount * STATIC_FEE;
            swap(poolKey, true, -int256(calmAmount), ZERO_BYTES);
        }
        adaptiveTotal += pAdaptive;
        staticTotal   += pStatic;
        console.log("Phase 1 (calm, 5 x 0.01 ETH):");
        console.log("  Adaptive rev (scaled):", pAdaptive / 1e18);
        console.log("  Static rev   (scaled):", pStatic / 1e18);

        // ── Phase 2: Volatility shock (5 × 50 ETH, alternating) ─
        uint256 volAmount = 50e18;
        pAdaptive = 0;
        pStatic   = 0;
        for (uint256 i = 0; i < 5; i++) {
            (,,uint24 fee,) = hook.getPoolMetrics(poolId);
            pAdaptive += volAmount * uint256(fee);
            pStatic   += volAmount * STATIC_FEE;
            swap(poolKey, (i % 2 == 0), -int256(volAmount), ZERO_BYTES);
        }
        adaptiveVolPhase = pAdaptive;
        staticVolPhase   = pStatic;
        adaptiveTotal   += pAdaptive;
        staticTotal     += pStatic;
        console.log("Phase 2 (volatile, 5 x 50 ETH):");
        console.log("  Adaptive rev (scaled):", pAdaptive / 1e18);
        console.log("  Static rev   (scaled):", pStatic / 1e18);

        // ── Phase 3: Recovery (10 × 0.001 ETH) ──────────────────
        uint256 recoveryAmount = 0.001e18;
        pAdaptive = 0;
        pStatic   = 0;
        for (uint256 i = 0; i < 10; i++) {
            (,,uint24 fee,) = hook.getPoolMetrics(poolId);
            pAdaptive += recoveryAmount * uint256(fee);
            pStatic   += recoveryAmount * STATIC_FEE;
            swap(poolKey, (i % 2 == 0), -int256(recoveryAmount), ZERO_BYTES);
        }
        adaptiveTotal += pAdaptive;
        staticTotal   += pStatic;
        console.log("Phase 3 (recovery, 10 x 0.001 ETH):");
        console.log("  Adaptive rev (scaled):", pAdaptive / 1e18);
        console.log("  Static rev   (scaled):", pStatic / 1e18);

        // ── Summary ──────────────────────────────────────────────
        console.log("");
        console.log("--- TOTAL ---");
        console.log("  Adaptive total (scaled):", adaptiveTotal / 1e18);
        console.log("  Static total   (scaled):", staticTotal / 1e18);

        uint256 totalRatioX10 = (adaptiveTotal * 10) / staticTotal;
        uint256 volRatioX10   = (adaptiveVolPhase * 10) / staticVolPhase;
        console.log("  Volatile-phase multiplier (x10):", volRatioX10);
        console.log("  Overall multiplier       (x10):", totalRatioX10);

        // What share of the gain came from the volatile phase?
        uint256 totalGain = adaptiveTotal - staticTotal;
        uint256 volGain   = adaptiveVolPhase - staticVolPhase;
        uint256 volSharePct = (volGain * 100) / totalGain;
        console.log("  % of extra revenue from vol phase:", volSharePct);

        console.log("");

        // ── Assertions ───────────────────────────────────────────
        assertTrue(
            adaptiveTotal > staticTotal,
            "Adaptive LPs should earn more across a full market cycle"
        );
        assertTrue(
            volSharePct > 95,
            "Virtually all extra revenue should come from the volatile phase"
        );
    }

    // =====================================================================
    //  TEST 8: Full lifecycle demo — the hackathon demo scenario
    //  Run with: forge test --match-test test_fullLifecycleDemo -vv
    // =====================================================================

    function test_fullLifecycleDemo() public {
        console.log("");
        console.log("=== ClearSwap v4: Volatility-Responsive Fee Demo ===");
        console.log("");

        // ── Phase 1: Calm market (small trades) ──────────────────
        console.log("--- Phase 1: Calm Market ---");
        for (uint256 i = 0; i < 5; i++) {
            swap(poolKey, true, -0.01e18, ZERO_BYTES);
        }
        (, uint256 vol1, uint24 fee1,) = hook.getPoolMetrics(poolId);
        console.log("  Volatility:", vol1);
        console.log("  Fee (pips):", fee1);

        // ── Phase 2: Market shock (large trade) ──────────────────
        console.log("--- Phase 2: Market Shock (large swap) ---");
        swap(poolKey, true, -80e18, ZERO_BYTES);
        (, uint256 vol2, uint24 fee2,) = hook.getPoolMetrics(poolId);
        console.log("  Volatility:", vol2);
        console.log("  Fee (pips):", fee2);

        // ── Phase 3: Continued volatility ────────────────────────
        console.log("--- Phase 3: Continued Volatility ---");
        swap(poolKey, false, -80e18, ZERO_BYTES);
        (, uint256 vol3, uint24 fee3,) = hook.getPoolMetrics(poolId);
        console.log("  Volatility:", vol3);
        console.log("  Fee (pips):", fee3);

        // ── Phase 4: Market calms down ───────────────────────────
        console.log("--- Phase 4: Market Calms Down ---");
        for (uint256 i = 0; i < 30; i++) {
            bool direction = (i % 2 == 0);
            swap(poolKey, direction, -0.001e18, ZERO_BYTES);
        }
        (, uint256 vol4, uint24 fee4,) = hook.getPoolMetrics(poolId);
        console.log("  Volatility:", vol4);
        console.log("  Fee (pips):", fee4);

        console.log("");
        console.log("Fees adapted across 4 phases:");
        console.log("  Phase 1 (calm):", fee1);
        console.log("  Phase 2 (shock):", fee2);
        console.log("  Phase 3 (volatile):", fee3);
        console.log("  Phase 4 (recovery):", fee4);
        console.log("A static 30bp pool cannot do this.");
        console.log("");

        // Verify the lifecycle: fee went up during volatility, came down after
        assertTrue(fee2 > fee1, "Fee rose during market shock");
        assertTrue(fee4 < fee3, "Fee fell after market calmed");
    }
}
