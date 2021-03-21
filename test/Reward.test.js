const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reward", function () {
  let owner, mintingModule, MockERC20Factory, reward, eye, scx, ironCrown, liquidQueue
  beforeEach(async function () {
    [owner, mintingModule] = await ethers.getSigners();
    const Reward = await ethers.getContractFactory("Reward")
    reward = await Reward.deploy();
    MockERC20Factory = await ethers.getContractFactory("MockToken")
    scx = await MockERC20Factory.deploy("SCX", "SCX", reward.address, true);

    eye = await MockERC20Factory.deploy("EYE", "EYE", "0x0000000000000000000000000000000000000000", false)
    const IronCrown = await ethers.getContractFactory("MockIronCrown")
    ironCrown = await IronCrown.deploy(scx.address, reward.address)

    const LiquidQueueFactory = await ethers.getContractFactory("MockLiquidQueue")
    liquidQueue = await LiquidQueueFactory.deploy()

    await reward.seed(mintingModule.address, liquidQueue.address, ironCrown.address, eye.address, scx.address)
  })

  it("canReward fails on invalid token and returns false on empty valid token", async function () {
    const invalidToken = await MockERC20Factory.deploy("AYE", "AYE", "0x0000000000000000000000000000000000000000", false)
    await expect(reward.canReward(invalidToken.address, 10))
      .to.be.revertedWith("LIQUID QUEUE: invalid token")

    const canRewardEye = await reward.canReward(eye.address, 1)
    expect(canRewardEye).to.be.false
  });

  it("canReward succeeds on positive token balance of valid token", async function () {
    await eye.mint(reward.address, 1)
    const canRewardEye = await reward.canReward(eye.address, 1)
    expect(canRewardEye).to.be.true
  });

  //await greeter.connect(addr1).setGreeting("Hallo, Erde!");
  it("requestReward can only be called from minting module", async function () {
    await eye.mint(reward.address, 1)
    await expect(reward.requestReward(eye.address, 1)).to.be.revertedWith("LIQUID QUEUE: only minting module")
  });


  it("withdraw only possible when disabled", async function () {
    await scx.mint(reward.address, 10000)
    expect(await scx.balanceOf(owner.address)).to.equal(0)

    await expect(reward.withdraw(scx.address)).to.be.revertedWith('LIQUID QUEUE: Reward enabled status wrong')
    await reward.toggle(false)

    await reward.withdraw(scx.address)
    expect(await scx.balanceOf(owner.address)).to.equal(9800)//fee on transfer

    await reward.toggle(true)
    await expect(reward.withdraw(scx.address)).to.be.revertedWith('LIQUID QUEUE: Reward enabled status wrong')
  })

  it("request slow reward works for liquid queue", async function () {
    await eye.mint(reward.address, 10000)
    expect(await eye.balanceOf(liquidQueue.address)).to.equal(0)

    await liquidQueue.requestEyeReward(reward.address, eye.address, 2000)

    expect(await eye.balanceOf(liquidQueue.address)).to.equal(2000)

  })

  it("requestSlowQueueReward can only be called from LQ", async function () {
    await eye.mint(reward.address, 1)
    await expect(reward.requestSlowQueueReward(eye.address, 1)).to.be.revertedWith("LIQUID QUEUE: only Liquid Queue")
  });
});
