require("dotenv").config();
const ethers = require("ethers");
const { Contract } = require("ethers");
const abi = require("./etc/Erc20.json");

const data = {
  COIN: process.env.COIN_CONTRACT, // 'STABLE' COIN
  SHIT: process.env.SHIT_CONTRACT, // SHIT COIN
  DEC: +process.env.SHIT_DECIMALS,
  pair: process.env.PAIR_CONTRACT, // STABLE-SHIT pair
  router: process.env.ROUTER, // router CHECK!!
  recipient: process.env.ADDRESS, //your wallet address,
  slippage: process.env.SLIPPAGE, //in Percentage
  gasPrice: ethers.utils.parseUnits(`${process.env.GWEI}`, "gwei"), //in gwei
  gasLimit: process.env.GAS_LIMIT, //at least 21000
  timeFrame: process.env.TIMEFRAME, //interval between candles
  deadLine: +process.env.DEADLINE, //tx deadline
};

const wss = process.env.WSS_NODE;
const http = process.env.HTTP_NODE;
const mnemonic = process.env.MNEMONIC; //your memonic;
const tokenIn = data.COIN;
const tokenOut = data.SHIT;
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
const timeFrame = data.timeFrame * 60 * 1000; //timeframe in minutes
let babyCandle = [],
  openCandle = [],
  highCandle = [],
  lowCandle = [],
  closeCandle = [],
  maturCandle = [],
  candle = [];
const getSwap = async () => {
  const pairData = await pairContract.getReserves();
  const coinReserve = ethers.utils.formatUnits(pairData[1], "ether");
  const shitReserve = ethers.utils.formatUnits(pairData[0], "ether");
  const conversion = [Number(coinReserve) / Number(shitReserve)];
  console.log(`Conversion:${conversion}`);
  conversion.forEach(function (elemen) {
    babyCandle.push(elemen);
  });
};

pairContract.on("Swap", getSwap); // function to detect swap and run getSwap function

//candle born
let open = () => [babyCandle[0]];
let high = (time) => [Math.max.apply(null, time)];
let low = (time) => [Math.min.apply(null, time)];
let close = () => [babyCandle[babyCandle.length - 1]];
function runOnInterval(interval_in_ms, function_to_run, only_run_once = false) {
  setTimeout(() => {
    function_to_run();
    if (!only_run_once) runOnInterval(...arguments);
  }, interval_in_ms - ((Date.now() - new Date().getTimezoneOffset() * 6e4) % interval_in_ms));
}
runOnInterval(timeFrame, () => {
  // function to run every timeFrame
  const d = new Date();
  const current = d.getHours() + ":" + d.getMinutes();
  if (babyCandle.length != 0) {
    open().forEach(function (elemen) {
      openCandle.push(elemen);
    });
    high(babyCandle).forEach(function (elemen) {
      highCandle.push(elemen);
    });
    low(babyCandle).forEach(function (elemen) {
      lowCandle.push(elemen);
    });
    close().forEach(function (elemen) {
      closeCandle.push(elemen);
    });
    console.log(`Candles created ${current}`);
  } else if (closeCandle.length == 0) {
    return console.log(
      `Candles failed, but dont worry about that just keep script running ${current}`
    );
  } else {
    openCandle.push(openCandle[openCandle.length - 1]);
    highCandle.push(highCandle[highCandle.length - 1]);
    lowCandle.push(lowCandle[lowCandle.length - 1]);
    closeCandle.push(closeCandle[closeCandle.length - 1]);
    console.log(
      `Candles copy cause was not conversion at timeframe ${current}`
    );
  }
  maturCandle.push(`${d}`);
  maturCandle.push(openCandle[openCandle.length - 1]);
  maturCandle.push(highCandle[highCandle.length - 1]);
  maturCandle.push(lowCandle[lowCandle.length - 1]);
  maturCandle.push(closeCandle[closeCandle.length - 1]);
  candle.push(maturCandle);

  if (closeCandle.length > 10) {
    strategy();
  }
  babyCandle = [];
  maturCandle = [];
});

// strategy

let mp = 0; // change to 1 if you're already holding the asset
var Stock = require("stock-technical-indicators");
const Indicator = Stock.Indicator;
const { Supertrend } = require("stock-technical-indicators/study/Supertrend");

function strategy() {
  const newStudyATR = new Indicator(new Supertrend());
  const superTrend = newStudyATR.calculate(candle, {
    period: 10,
    multiplier: 10,
  });
  const lastSuperTrend = superTrend[superTrend.length - 1];
  const objSuperTrend = lastSuperTrend["Supertrend"];
  const dirSuperTrend = objSuperTrend["Direction"];
  const activeSuperTrend = objSuperTrend["ActiveTrend"];

  const lastCloseCandle = closeCandle[closeCandle.length - 1];

  if (dirSuperTrend == 1 && mp != 1) {
    console.log(`Comprando em ${new Date()}`);
    buyAction();
    mp = 1;
  }
  if (dirSuperTrend == -1 && mp != 0) {
    console.log(`Vendendo em ${new Date()}`);
    sellAction();
    mp = 0;
  }

  console.log(`${lastCloseCandle},${activeSuperTrend},${dirSuperTrend}`);
}

// buy

let buyAction = async () => {
  const getBalance = async () => {
    const contract = new Contract(tokenIn, abi, provider);
    const balance = await contract.balanceOf(data.recipient);
    return balance.toString();
  };
  const amountIn = await getBalance();
  const amounts = await routerContract.getAmountsOut(amountIn, [
    tokenIn,
    tokenOut,
  ]);
  const amountOutMin = amounts[1].sub(amounts[1].div(`${data.slippage}`));

  console.log(ethers.utils.formatUnits(amountIn, "ether"));
  console.log(ethers.utils.formatUnits(amountOutMin, "ether"));

  const swapTx = await routerContract.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    [tokenIn, tokenOut],
    data.recipient,
    Date.now() + 1000 * 60 * data.deadLine,
    {
      gasLimit: data.gasLimit,
      gasPrice: data.gasPrice,
    }
  );

  receipt = await swapTx.wait();
  console.log(receipt);
};

// sell

let sellAction = async () => {
  const getBalance = async () => {
    const contract = new Contract(tokenOut, abi, provider);
    const balance = await contract.balanceOf(data.recipient);
    return balance.toString();
  };
  const amountIn = await getBalance();
  const amounts = await routerContract.getAmountsOut(amountIn, [
    tokenOut,
    tokenIn,
  ]);
  const amountOutMin = amounts[1].sub(amounts[1].div(`${data.slippage}`));

  console.log(ethers.utils.formatUnits(amountIn, "ether"));
  console.log(ethers.utils.formatUnits(amountOutMin, "ether"));

  const swapTx = await routerContract.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    [tokenOut, tokenIn],
    data.recipient,
    Date.now() + 1000 * 60 * data.deadLine,
    {
      gasLimit: data.gasLimit,
      gasPrice: data.gasPrice,
    }
  );

  receipt = await swapTx.wait();
  console.log(receipt);
};
