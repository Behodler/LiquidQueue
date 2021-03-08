
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "./IERC20.sol";

contract ERC20 is IERC20 {
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) spendingAllowance;

    constructor(
        string memory _name,
        string memory _symbol,
        address _feeDestination,
        bool _burnOnTransfer
    ) {
        name = _name;
        symbol = _symbol;
        feeDestination = _feeDestination;
        burnOnTransfer = _burnOnTransfer;
    }

    bool burnOnTransfer;
    address feeDestination;
    string public name;
    string public symbol;

    uint256 public override totalSupply;

    function balanceOf(address account) external override view returns (uint256) {
        return balances[account];
    }

    uint8 public override constant decimals = 8;

    function transfer(address recipient, uint256 amount)
        external
        override
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender)
        external
        override
        view
        returns (uint256)
    {
        return spendingAllowance[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        spendingAllowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(
            spendingAllowance[sender][recipient] >= amount,
            "ERC20: allowance exceeded"
        );
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal {
        uint256 fee = feeDestination == address(0) ? 0 : amount / 100;
        if (burnOnTransfer) {
            fee *= 2;
            totalSupply -= fee;
        }
        uint256 netAmount = amount - fee;
        balances[from] -= amount;
        balances[to] += netAmount;
        balances[feeDestination] += fee;
    }

    function _mint(address holder, uint256 value) internal {
        balances[holder] += value;
        totalSupply += value;
    }

    function _burn(address holder, uint256 value) internal {
        balances[holder] -= value;
        require(totalSupply >= value, "ERC20:burn underflow");
        totalSupply -= value;
    }
}
