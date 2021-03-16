
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../../openzeppelin/ERC20.sol";

contract MockToken is ERC20 {
     constructor(
        string memory _name,
        string memory _symbol,
        address _feeDestination,
        bool _burnOnTransfer
    ) ERC20(_name, _symbol, _feeDestination, _burnOnTransfer) {}

    // function mint(uint value) external{
    //     _mint(msg.sender, value);
    // }

    function mint(address recipient, uint value) external{
        _mint(recipient, value);
    }
}