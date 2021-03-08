
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../openzeppelin/ERC20.sol";
import "./interfaces/IWETH.sol";

contract WETH is ERC20, IWETH {
    constructor() ERC20("WETH", "WETH", address(0), false) {}

    function deposit() external payable override {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 value) external override {
        _burn(msg.sender, value);
        address payable sender = msg.sender;
        (bool success, ) = sender.call{value: value}("");
        require(success, "Unwrapping failed.");
    }
}
