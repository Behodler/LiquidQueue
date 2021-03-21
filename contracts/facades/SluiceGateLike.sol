// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

abstract contract SluiceGateLike {
    function whitelist(address a) public virtual returns (bool);
    function betaApply(address lp) public virtual;    
    function unstake(address lp) public virtual;
}
