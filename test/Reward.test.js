const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reward", function () {
  let owner, mintingModule
  beforeEach(async function () {
    [owner, mintingModule] = await ethers.getSigners();
    const Reward = await ethers.getContractFactory("Reward")
    const reward = await Reward.deploy();
    const MockERC20 = await ethers.getContractFactory("ERC20")
    const mockSCX = await MockERC20.deploy("SCX", "SCX", reward.address, true);

    const mockEYE = await MockERC20.deploy("EYE", "EYE", "0x0000000000000000000000000000000000000000", false)
    const IronCrown = await ethers.getContractFactory("MockIronCrown")
    const ironCrown = await IronCrown.deploy(mockSCX.address, reward.address)

    await reward.seed(mintingModule.address, ironCrown.address, mockEYE.address, mockSCX.address)
  })

  it("canReward fails on invalid token and returns false on empty valid token", async function () {

    // const Greeter = await ethers.getContractFactory("Greeter");
    // const greeter = await Greeter.deploy("Hello, world!");

    // await greeter.deployed();
    // expect(await greeter.greet()).to.equal("Hello, world!");

    // await greeter.setGreeting("Hola, mundo!");
    // expect(await greeter.greet()).to.equal("Hola, mundo!");
  });

  it("canReward succeeds on positive token balance of valid token", async function () {
  });

  //await greeter.connect(addr1).setGreeting("Hallo, Erde!");
  it("requestReward can only be called from minting module", async function () {
  });

  it("request reward drains ironCrown and transfers to minting module", async function () { })

  it("withdraw only possible when disabled", async function () {

  })
});
