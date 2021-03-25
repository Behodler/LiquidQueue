// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/SafeMath.sol";
import "../uniswapv2/interfaces/IUniswapV2Factory.sol";
import "../uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../uniswapv2/WETH.sol";
import "../uniswapv2/libraries/UniswapV2Library.sol";
import "../facades/RewardLike.sol";
import "../facades/SluiceGateLike.sol";

abstract contract LiquidQueueLike {
    function join(address LP, address recipient) public virtual;
}

contract MintingModule is Ownable {
    using SafeMath for uint256;

    struct UniswapValues {
        address token0;
        address token1;
        uint256 reserveA;
        uint256 reserveB;
        IUniswapV2Pair pair;
    }

    IUniswapV2Factory uniswapFactory;
    IUniswapV2Router02 uniswapRouter;

    RewardLike rewardContract;
    SluiceGateLike public sluiceGate;
    address liquidQueue;
    bool locked;
    uint8 tiltPercentage;
    mapping(address => address) inputTokenTilting; // eg inputTokenTilting[address(EYE)] == address(SCX)
    mapping(address => address) inputOutputToken; // eg inputOutputToken(address(dai)) == address (EYE)

    modifier lock {
        require(!locked, "LIQUID QUEUE: reentrancy guard");
        locked = true;
        _;
        locked = false;
    }

    modifier gateKeep {
        require(
            address(sluiceGate) == address(0) ||
                sluiceGate.whitelist(msg.sender),
            "LIQUID QUEUE: forbidden, closed beta"
        );
        _;
    }

    function seed(
        address factory,
        address router,
        address reward,
        uint8 _tiltPercentage
    ) public onlyOwner {
        uniswapFactory = IUniswapV2Factory(factory);
        rewardContract = RewardLike(reward);
        uniswapRouter = IUniswapV2Router02(router);
        require(
            tiltPercentage < 100,
            "LIQUID QUEUE: tilt percentage between 1 and 100"
        );
        tiltPercentage = _tiltPercentage;
    }

    constructor(
        address dai,
        address scx,
        address eye,
        address router,
        address factory,
        address queue
    ) {
        uniswapRouter = IUniswapV2Router02(router);
        uniswapFactory = IUniswapV2Factory(factory);
        address weth = uniswapRouter.WETH();
        mapTokens(dai, eye, eye);
        mapTokens(weth, scx, scx);
        mapTokens(scx, eye, scx);
        mapTokens(eye, scx, scx);
        liquidQueue = queue;
        tiltPercentage = 30;
    }

    function mapTokens(
        address input,
        address output,
        address tilting
    ) public onlyOwner {
        inputTokenTilting[input] = tilting;
        inputOutputToken[input] = output;
        if (uniswapFactory.getPair(input, output) == address(0)) {
            uniswapFactory.createPair(input, output);
        }
    }

    function setSluiceGate(address s) public onlyOwner {
        sluiceGate = SluiceGateLike(s);
    }

    //Entry point for an external user into the Liquid Queue
    function purchaseLP(address inputToken, uint256 amount)
        public
        payable
        lock
        gateKeep
    {
        if (msg.value > 0) {
            address wethAddress = uniswapRouter.WETH();
            require(
                inputToken == wethAddress,
                "LIQUID QUEUE: positive eth value requires WETH address"
            );
            require(
                msg.value == amount,
                "LIQUID QUEUE: eth value must match input amount"
            );
            WETH weth = WETH(wethAddress);
            weth.deposit{value: msg.value}();
        } else {
            IERC20(inputToken).transferFrom(msg.sender, address(this), amount);
        }
        purchaseLPFor(inputToken, amount, msg.sender);
    }

    function purchaseLPFor(
        address inputToken,
        uint256 amount,
        address recipient
    ) internal {
        address outputToken = inputOutputToken[inputToken];
        require(
            outputToken != address(0),
            "LIQUID QUEUE: input token not supported"
        );

        //The next section fetches a quote from uniswap so we know what the ratios should be in the absence of tilting.
        UniswapValues memory VARS;

        VARS.pair = IUniswapV2Pair(
            uniswapFactory.getPair(inputToken, outputToken)
        );
        (VARS.token0, VARS.token1) = inputToken < outputToken
            ? (inputToken, outputToken)
            : (outputToken, inputToken);
        (uint256 reserve1, uint256 reserve2, ) = VARS.pair.getReserves();
        VARS.reserveA = inputToken == VARS.token0 ? reserve1 : reserve2;
        VARS.reserveB = inputToken == VARS.token0 ? reserve2 : reserve1;

        uint256 expectedOutputToken =
            uniswapRouter.quote(amount, VARS.reserveA, VARS.reserveB);

        address tiltedToken = inputTokenTilting[inputToken];
        require(
            tiltedToken == outputToken || tiltedToken == inputToken,
            "LIQUID QUEUE: invalid tilted token."
        );

        uint256 tiltAdjustment =
            tiltedToken == inputToken
                ? 100 + tiltPercentage
                : 100 - tiltPercentage;

        uint256 outputAmount = expectedOutputToken.mul(tiltAdjustment).div(100);
        rewardContract.requestReward(outputToken, outputAmount);

        IERC20(inputToken).transfer(address(VARS.pair), amount);
        IERC20(outputToken).transfer(address(VARS.pair), outputAmount);

        VARS.pair.mint(address(this));
        VARS.pair.approve(liquidQueue, uint256(-1));

        LiquidQueueLike(liquidQueue).join(address(VARS.pair), recipient);
    }
}
