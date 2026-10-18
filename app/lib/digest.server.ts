/**
 * Pro weekly P&L digest. The sender is a stub until an outbound mail provider is configured.
 * No buyer contact data is included; the digest is shop-level totals only.
 */
export interface DigestSender {
  sendWeeklyDigest(input: { shopDomain: string; periodLabel: string; netProfit: string }): Promise<void>;
}

export const digestSender: DigestSender = {
  async sendWeeklyDigest(input) {
    console.info(
      `digest stub: weekly P&L for ${input.shopDomain} (${input.periodLabel}) net ${input.netProfit}`,
    );
  },
};
