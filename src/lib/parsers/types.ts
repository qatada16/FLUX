export interface ParseResult {
  amount: number;
  direction: 'credit' | 'debit';
}

export interface ParserConfig {
  providerKey: string;
  patterns: RegExp[];
  parse: (body: string) => ParseResult | null;
}
