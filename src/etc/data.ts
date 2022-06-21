import * as dotenv from "dotenv";
dotenv.config();
const data = {
  STABLE: process.env.STABLE_CONTRACT, // 'STABLE' COIN
  COIN: process.env.COIN_CONTRACT, // COIN
  pair: process.env.PAIR_CONTRACT, // STABLE-COIN pair
  router: process.env.ROUTER, // router CHECK!!
  recipient: process.env.ADDRESS, //your wallet address,
  slippage: process.env.SLIPPAGE, //in Percentage
  gasPrice: process.env.GWEI, //in bignumber
  gasLimit: process.env.GAS_LIMIT, //at least 21000
  timeFrame: +process.env.TIMEFRAME, //interval between candles
  deadLine: +process.env.DEADLINE, //tx deadline
  stPeriod: +process.env.ST_PERIOD,
  stMult: +process.env.ST_MULT,
  emaPeriod: +process.env.EMA_PERIOD,
};
export default data;
