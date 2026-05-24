/**
 * Etsy fee structure (2024/2025 approximate):
 *  - Transaction fee: 6.5% of (item price + shipping price charged to buyer)
 *  - Payment processing (US): 3% + $0.25
 *  - Listing fee: $0.20 (flat, per listing)
 *  - Offsite Ads (worst case for under-$10k sellers): 15% — optional, configurable
 *
 * We assume shipping is included in the item price (free shipping listing),
 * which is the recommended POD strategy.
 *
 * Goal: find item price P such that:
 *   P - (printifyCost + shippingCost)
 *     - 0.065 * P
 *     - (0.03 * P + 0.25)
 *     - 0.20
 *   = targetProfit
 *
 *   P * (1 - 0.065 - 0.03) - (printifyCost + shippingCost + 0.25 + 0.20)
 *     = targetProfit
 *
 *   P = (targetProfit + printifyCost + shippingCost + 0.45) / 0.905
 */

export const ETSY_TRANSACTION_FEE = 0.065;
export const ETSY_PAYMENT_PERCENT = 0.03;
export const ETSY_PAYMENT_FIXED = 0.25;
export const ETSY_LISTING_FEE = 0.2;

export function calculateEtsyPrice(
  printifyCost: number,
  shippingCost: number,
  targetProfit: number
): { price: number; breakdown: { transactionFee: number; paymentFee: number; listingFee: number; netProfit: number } } {
  const fixedCosts = printifyCost + shippingCost + ETSY_PAYMENT_FIXED + ETSY_LISTING_FEE;
  const percentMultiplier = 1 - ETSY_TRANSACTION_FEE - ETSY_PAYMENT_PERCENT;
  const rawPrice = (targetProfit + fixedCosts) / percentMultiplier;
  const price = Math.ceil(rawPrice * 100) / 100;

  const transactionFee = price * ETSY_TRANSACTION_FEE;
  const paymentFee = price * ETSY_PAYMENT_PERCENT + ETSY_PAYMENT_FIXED;
  const listingFee = ETSY_LISTING_FEE;
  const netProfit =
    price - printifyCost - shippingCost - transactionFee - paymentFee - listingFee;

  return {
    price,
    breakdown: {
      transactionFee,
      paymentFee,
      listingFee,
      netProfit,
    },
  };
}
