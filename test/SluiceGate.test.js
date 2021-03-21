const { expect, assert } = require("chai");
const { ethers } = require("hardhat");


describe("SluiceGate", function () {
    let owner, secondPerson, feeSetter, eye, scx, dai, scx_eye, eye_dai, uniswapRouter, uniSwapFactory, weth, sluiceGate
    const zero = '0x0000000000000000000000000000000000000000'
    const RECIPIENT_index = 0, LP_index = 1, AMOUNT_index = 2, JOINTIMESTAMP_index = 3, DURATIONSINCELAST_index = 4, EYEHEIGHTATJOIN_index = 5, VALID_index = 6
    beforeEach(async function () {
        [owner, secondPerson, feeSetter] = await ethers.getSigners();

        const WETHFactory = await ethers.getContractFactory('WETH')
        weth = await WETHFactory.deploy()
        const UniswapFactory = await ethers.getContractFactory("UniswapV2Factory")
        const uniswapFactory = await UniswapFactory.deploy(feeSetter.address)
        const RouterFactory = await ethers.getContractFactory('UniswapV2Router02')
        uniswapRouter = await RouterFactory.deploy(uniswapFactory.address, weth.address)

        MockToken = await ethers.getContractFactory("MockToken")
        scx = await MockToken.deploy("SCX", "SCX", owner.address, false);
        eye = await MockToken.deploy("EYE", "EYE", owner.address, false);
        dai = await MockToken.deploy("DAI", "DAI", owner.address, false);

        await uniswapFactory.createPair(scx.address, eye.address);
        await uniswapFactory.createPair(eye.address, dai.address);

        scx_eye = await uniswapFactory.getPair(scx.address, eye.address)
        eye_dai = await uniswapFactory.getPair(dai.address, eye.address)

        const sluiceFactory = await ethers.getContractFactory('SluiceGate')
        sluiceGate = await sluiceFactory.deploy(scx_eye, eye_dai, eye.address)
    })

    it('applying with invalid address does nothing', async function () {
        await sluiceGate.betaApply(secondPerson.address)
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
    })

    it('applying with any SCX_EYE works', async function () {
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
        await scx.mint(scx_eye, 10000)
        await eye.mint(scx_eye, 10000)
        const pair = await ethers.getContractAt('UniswapV2Pair', scx_eye)
        await pair.mint(owner.address)

        await pair.approve(sluiceGate.address, ethers.utils.parseEther("1"))
        await sluiceGate.betaApply(scx_eye)
        expect(await sluiceGate.whitelist(owner.address)).to.be.true
    })

    it("applying with 999 EYE on EYE_DAI doesn't work", async function () {
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
        await dai.mint(eye_dai, ethers.utils.parseEther("100"))
        await eye.mint(eye_dai, ethers.utils.parseEther("999"))
        const pair = await ethers.getContractAt('UniswapV2Pair', eye_dai)
        await pair.mint(owner.address)

        await pair.approve(sluiceGate.address, ethers.utils.parseEther("1000"))
        await sluiceGate.betaApply(eye_dai)
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
    })

    it("applying with 1000 EYE on EYE_DAI succeeds", async function () {
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
        await dai.mint(eye_dai, ethers.utils.parseEther("100"))
        await eye.mint(eye_dai, ethers.utils.parseEther("1000"))
        const pair = await ethers.getContractAt('UniswapV2Pair', eye_dai)
        await pair.mint(owner.address)

        await pair.approve(sluiceGate.address, ethers.utils.parseEther("1000"))
        const balanceBefore = await pair.balanceOf(owner.address)
        await sluiceGate.betaApply(eye_dai)
        expect(await sluiceGate.whitelist(owner.address)).to.be.true

        expect(await pair.balanceOf(owner.address)).to.equal(0)

        await sluiceGate.unstake(eye_dai)
        expect(await pair.balanceOf(owner.address)).to.equal(balanceBefore)
        expect(await sluiceGate.whitelist(owner.address)).to.be.false
    })
})