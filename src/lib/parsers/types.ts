export interface ParseResult {
  amount: number;
  direction: 'credit' | 'debit';
  /**
   * Post-transaction balance stated in the message ("Your new balance is
   * Rs.X"). When present, handlers set the wallet to this absolute value
   * instead of applying a delta — it self-corrects any earlier missed SMS.
   */
  newBalance?: number;
}

export interface ParserConfig {
  providerKey: string;
  patterns: RegExp[];
  parse: (body: string) => ParseResult | null;
}
