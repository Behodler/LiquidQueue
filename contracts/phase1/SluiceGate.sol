// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/SafeMath.sol";

contract SluiceGate is Ownable {
    using SafeMath for uint256;
    mapping(address => mapping(address => uint256)) public LPstake; //user=>LP=>balance
    mapping(address => bool) public whitelist;
    struct LPRequirement {
        IERC20 LP;
        uint256 required;
        address tokenToCheck;
    }

    uint256 constant ONE = 1e18;

    LPRequirement[3] LPs;

    constructor(
        address scx_eye,
        address eye_eth,
        address eye
    ) {
        LPs[0].LP = IERC20(scx_eye);
        LPs[0].required = 0;
        LPs[0].tokenToCheck = eye;
        LPs[1].LP = IERC20(eye_eth);
        LPs[1].required = 1000 * ONE;
        LPs[1].tokenToCheck = eye;
    }

    function configureLPs(
        address lp,
        uint8 index,
        uint256 required
    ) public onlyOwner {
        LPs[index].LP = IERC20(lp);
        LPs[index].required = required;
    }

    function betaApply(address lp) public {
        for (uint256 i = 0; i < 3; i++) {
            IERC20 currentLP = LPs[i].LP;
            if (address(currentLP) == lp) {
                uint256 balance = currentLP.balanceOf(msg.sender);
                if (LPs[i].required == 0 && balance > 0) {
                    currentLP.transferFrom(
                        msg.sender,
                        address(this),
                        balance / 10
                    ); // take 10% deposit
                    LPstake[msg.sender][address(currentLP)] += balance / 10;
                    whitelist[msg.sender] = true;
                    return;
                } else if (LPs[i].required > 0) {
                    uint256 totalSupply = currentLP.totalSupply();
                    uint256 balanceOfUnderlyingToken =
                        IERC20(LPs[i].tokenToCheck).balanceOf(
                            address(currentLP)
                        );
                    uint256 requiredShare =
                        (LPs[i].required.mul(ONE)) / balanceOfUnderlyingToken;
                    uint256 lptokenBalanceRequired =
                        requiredShare.mul(totalSupply).div(ONE) - 1e17;

                    if (balance >= lptokenBalanceRequired) {
                        currentLP.transferFrom(
                            msg.sender,
                            address(this),
                            lptokenBalanceRequired
                        );
                        LPstake[msg.sender][
                            address(currentLP)
                        ] += lptokenBalanceRequired;
                        whitelist[msg.sender] = true;
                        return;
                    }
                }
            }
        }
    }

    function unstake(address lp) public {
        whitelist[msg.sender] = false;
        uint256 balance = LPstake[msg.sender][lp];
        IERC20 pair = IERC20(lp);
        uint256 remainingBalance = pair.balanceOf(address(this));
        balance = remainingBalance > balance ? balance : remainingBalance;
        IERC20(lp).transfer(msg.sender, balance);
    }
}
