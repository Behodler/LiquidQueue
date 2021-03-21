// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

contract MockSluiceGate {
    mapping(address => bool) public whitelist;

    function setWhiteList(address user, bool w) public {
        whitelist[user] = w;
    }
}
