// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

abstract contract RewardLike {
    function requestReward(address token, uint256 value) public virtual;

    function requestSlowQueueReward(address token, uint256 value)
        public
        virtual
        returns (bool);
}
