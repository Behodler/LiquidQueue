// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../../openzeppelin/IERC20.sol";

contract MockIronCrown {
    IERC20 SCX;
    address rewardContract;

    constructor(address scx, address reward) {
        SCX = IERC20(scx);
        rewardContract = reward;
    }

    function settlePayments() public {
        uint256 balance = SCX.balanceOf(address(this));
        SCX.transfer(rewardContract, balance);
    }
}
