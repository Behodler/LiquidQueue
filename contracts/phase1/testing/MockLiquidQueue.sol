// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../../facades/RewardLike.sol";

contract MockLiquidQueue {
    function join(address pair, address recipient) public {}

    function requestEyeReward(
        address reward,
        address eye,
        uint256 amount
    ) public {
        RewardLike(reward).requestSlowQueueReward(eye, amount);
    }
}
