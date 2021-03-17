// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/IERC20.sol";
import "hardhat/console.sol";

abstract contract IronCrownLike {
    function settlePayments() public virtual;
}

contract Reward is Ownable {
    struct RewardTokenAddresses {
        address EYE;
        address SCX;
    }
    IronCrownLike public ironCrown;
    RewardTokenAddresses rewardTokens;
    address mintingModule;
    bool public enabled;

    constructor() {
        enabled = true;
    }

    receive() external payable {}

    function seed(
        address _mintingModule,
        address _ironCrown,
        address eye,
        address scx
    ) public onlyOwner {
        rewardTokens.EYE = eye;
        rewardTokens.SCX = scx;
        mintingModule = _mintingModule;
        ironCrown = IronCrownLike(_ironCrown);
    }

    modifier onlyValidTokens(address token) {
        require(
            token == rewardTokens.SCX || token == rewardTokens.EYE,
            "LIQUID QUEUE: invalid token"
        );
        _;
    }

    modifier isEnabled(bool e) {
        require(enabled == e, "LIQUID QUEUE: Reward enabled status wrong");
        _;
    }

    function canReward(address token, uint256 amount)
        public
        view
        onlyValidTokens(token)
        returns (bool)
    {
        uint256 balance = IERC20(token).balanceOf(address(this));
        return (balance >= amount);
    }

    function requestReward(address token, uint256 value)
        public
        onlyValidTokens(token)
        isEnabled(true)
    {
        ironCrown.settlePayments();
        console.log("reward requested for token:", token);
        require(
            msg.sender == mintingModule,
            "LIQUID QUEUE: only minting module"
        );
        require(
            canReward(token, value),
            "LIQUID QUEUE: insufficient reward token balance"
        );
        IERC20(token).transfer(mintingModule, value);
    }

    function withdraw(address token) public onlyOwner isEnabled(false) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(msg.sender, balance);
    }

    function toggle(bool e) public onlyOwner {
        enabled = e;
    }
}
