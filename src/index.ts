import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as abi from "./etc/abi.json";
import data from "./etc/data";
import { SuperTrend, EMA } from "@debut/indicators";
import { MaxUint256 } from "@ethersproject/constants";
dotenv.config();

const wss = process.env.WSS_NODE;
const http = process.env.HTTP_NODE;
const mnemonic = process.env.MNEMONIC; //your memonic;
const tokenIn = data.STABLE;
const tokenOut = data.COIN;
const provider = new ethers.providers.JsonRpcProvider(http);
const wallet = new ethers.Wallet(mnemonic);
const signer = wallet.connect(provider);

const pairContract = new ethers.Contract(
  data.pair,
  [
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
    "function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
  ],
  signer
);

const routerContract = new ethers.Contract(
  data.router,
  [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns(uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  ],
  signer
);

//price get
let conversions: Array<number> = [];

const getSwap = async () => {
  const pairData = await pairContract.getReserves();
  const coinReserve = ethers.utils.formatUnits(pairData[0], "ether");
  const stableReserve = ethers.utils.formatUnits(pairData[1], "ether");
  const conversion = Number(stableReserve) / Number(coinReserve);
  conversions.push(conversion);
};

pairContract.on("Swap", getSwap); // function to detect swap and run getSwap function

function runOnInterval(interval_in_ms, function_to_run, only_run_once = false) {
  setTimeout(() => {
    function_to_run();
    if (!only_run_once)
      runOnInterval(interval_in_ms, function_to_run, (only_run_once = false));
  }, interval_in_ms - ((Math.round(Date.now() / 1000) * 1000) % interval_in_ms));
}

const timeFrame = data.timeFrame * 60 * 1000; //timeframe in minutes
const supertrend = new SuperTrend(data.stPeriod, data.stMult);
const ema = new EMA(data.emaPeriod);
let initialized;
let mp = 1;
let prevClose;
let prevDir;

console.info(`
  script started with the following configs:
  timeframe: ${data.timeFrame} minutes
  supertrend_period: ${data.stPeriod}
  supertrend_multiplier: ${data.stMult}
  ema_period: ${data.emaPeriod}
  current_position: ${mp} (${mp ? "buy" : "sell"})
  `);

// function to run every timeFrame
runOnInterval(timeFrame, () => {
  const conversionsLenght = conversions.length;
  const open = conversions[0];
  const high = Math.max.apply(null, conversions);
  const low = Math.min.apply(null, conversions);
  const close = conversions[conversions.length - 1];
  conversions = [];
  const d = new Date();
  const c = d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
  let st;
  let e;
  if (conversionsLenght !== 0) {
    console.log(`Candle created ${c}`);
    // console.table({ o: open, h: high, l: low, c: close });
    st = supertrend.nextValue(high, low, close);
    e = ema.nextValue(close);
  } else if (!initialized) {
    return;
    // return console.log(
    //   `Candle reseted cause first timeframe interval was not conversions ${c}`
    // );
  } else {
    console.log(`Timeframe without conversions, copying prevClose value ${c}`);
    // console.table({ o: prev, h: prev, l: prev, c: prev });
    st = supertrend.nextValue(prevClose, prevClose, prevClose);
    e = ema.nextValue(prevClose);
  }
  if (st && e) {
    const dir = st.direction;
    if (prevClose > e && dir === -1 && prevDir === 1 && mp === 0) {
      console.log(`Buyin ${new Date()}`);
      console.log(`
        e: ${e},
        prevClose: ${prevClose},
        dir: ${dir}
      `);
      buyAction();
    }
    if (prevClose < e && dir === 1 && prevDir === -1 && mp === 1) {
      console.log(`
        e: ${e},
        prevClose: ${prevClose},
        dir: ${dir}
      `);
      console.log(`Selling ${new Date()}`);
      sellAction();
    }

    prevDir = dir;
  }
  if (!initialized) initialized = true;
  prevClose = close;
});

const getBalance = async (token) => {
  const contract = new ethers.Contract(token, abi, provider);
  const balance = await contract.balanceOf(data.recipient);
  return balance.toString();
};

const approveHandler = async (token) => {
  console.log("Checking for approved token:", token);
  const contract = new ethers.Contract(token, abi, provider);
  const allow = await contract.allowance(data.recipient, data.router);
  if (allow.isZero()) {
    const contract = new ethers.Contract(token, abi, signer);
    const approve = await contract.approve(data.router, MaxUint256);
    const receipt = await approve.wait();
    console.log(receipt);
  } else {
    console.log("Token is already approved.");
  }
};

approveHandler(tokenIn);
approveHandler(tokenOut);

// buy

const buyAction = async () => {
  try {
    const amountIn = await getBalance(tokenIn);
    const amounts = await routerContract.getAmountsOut(amountIn, [
      tokenIn,
      tokenOut,
    ]);
    const amountOutMin = amounts[1].sub(amounts[1].div(`${data.slippage}`));
    console.log(ethers.utils.formatUnits(amountIn, "ether"));
    console.log(ethers.utils.formatUnits(amountOutMin, "ether"));
    // const swapTx = await routerContract.swapExactTokensForTokens(
    //   amountIn,
    //   amountOutMin,
    //   [tokenIn, tokenOut],
    //   data.recipient,
    //   Date.now() + 1000 * 60 * data.deadLine,
    //   {
    //     gasLimit: data.gasLimit,
    // gasPrice: ethers.utils.parseUnits(`${data.gasPrice}`, "gwei"),
    //   }
    // );
    // receipt = await swapTx.wait();
    // console.log(receipt);
    mp = 1;
  } catch (err) {
    console.error(err.reason);
    console.log("mp is set back to", mp);
  }
};

// sell

const sellAction = async () => {
  try {
    const amountIn = await getBalance(tokenOut);
    const amounts = await routerContract.getAmountsOut(amountIn, [
      tokenOut,
      tokenIn,
    ]);
    const amountOutMin = amounts[1].sub(amounts[1].div(`${data.slippage}`));
    console.log(ethers.utils.formatUnits(amountIn, "ether"));
    console.log(ethers.utils.formatUnits(amountOutMin, "ether"));
    // const swapTx = await routerContract.swapExactTokensForTokens(
    //   amountIn,
    //   amountOutMin,
    //   [tokenOut, tokenIn],
    //   data.recipient,
    //   Date.now() + 1000 * 60 * data.deadLine,
    //   {
    //     gasLimit: data.gasLimit,
    //     // gasPrice: ethers.utils.parseUnits(`${data.gasPrice}`, "gwei"),
    //   }
    // );
    // receipt = await swapTx.wait();
    // console.log(receipt);
    mp = 0;
  } catch (err) {
    console.error(err.reason);
    console.log("mp is set back to", mp);
  }
};
