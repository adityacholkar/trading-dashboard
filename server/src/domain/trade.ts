export interface Trade {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  brokerage: number;
  tradeDate: string; // YYYY-MM-DD
  timestamp: number;
}
