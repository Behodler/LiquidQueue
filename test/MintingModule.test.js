const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
describe("MintingModule", function () {
    let owner, secondPerson, feeSetter, mintingModule, uniswapRouter, MockToken, scx, eye, dai, uniSwapFactory, reward, weth, ironCrown
    const zero = '0x0000000000000000000000000000000000000000'
    beforeEach(async function () {
        [owner, secondPerson, feeSetter] = await ethers.getSigners();
        const WETHFactory = await ethers.getContractFactory('WETH')
        weth = await WETHFactory.deploy()
        const UniswapFactory = await ethers.getContractFactory("UniswapV2Factory")
        uniSwapFactory = await UniswapFactory.deploy(feeSetter.address)
        const RouterFactory = await ethers.getContractFactory('UniswapV2Router02')
        uniswapRouter = await RouterFactory.deploy(uniSwapFactory.address, weth.address)

        const RewardFactory = await ethers.getContractFactory("Reward")
        reward = await RewardFactory.deploy();
        MockToken = await ethers.getContractFactory("MockToken")
        scx = await MockToken.deploy("SCX", "SCX", reward.address, true);

        eye = await MockToken.deploy("EYE", "EYE", zero, false)
        dai = await MockToken.deploy('DAI', 'dai', zero, false)

        const IronCrownFactory = await ethers.getContractFactory("MockIronCrown")
        ironCrown = await IronCrownFactory.deploy(scx.address, reward.address)

        const LiquidQueueFactory = await ethers.getContractFactory('MockLiquidQueue')
        const liquidQueue = await LiquidQueueFactory.deploy()

        const MintingModuleFactory = await ethers.getContractFactory('MintingModule')

        mintingModule = await MintingModuleFactory.deploy(dai.address, scx.address, eye.address, uniswapRouter.address, uniSwapFactory.address, liquidQueue.address)
        await reward.seed(mintingModule.address, ironCrown.address, eye.address, scx.address)
        await mintingModule.seed(uniSwapFactory.address, uniswapRouter.address, reward.address, 30)

        // await liquidQueue.setMintingModule(mintingModule.address)
        // await liquidQueue.configure(10, 21, eye.address, 10000, 10000)
    })

    it("purchaseLP by sending eth but not referencing weth fails", async function () {
        await expect(
            mintingModule.purchaseLP(mintingModule.address, '1000', { value: 1000 })
        ).to.be.revertedWith("LIQUID QUEUE: positive eth value requires WETH address");
    })

    it("purchaseLP by sending eth with non matching value fails", async function () {
        const weth = await uniswapRouter.WETH()
        await expect(
            mintingModule.purchaseLP(weth, '2000', { value: 1000 })
        ).to.be.revertedWith("LIQUID QUEUE: eth value must match input amount");
    })

    it("purchase with invalid input token fails", async function () {
        const unsupportedToken = await MockToken.deploy("NO", "NO", zero, false)
        await unsupportedToken.approve(mintingModule.address, '10000')
        await expect(
            mintingModule.purchaseLP(unsupportedToken.address, '1000')
        ).to.be.revertedWith("LIQUID QUEUE: input token not supported");
    })

    it("purchasing small amount with large reserves tilts price", async function () {
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await pair.mint(secondPerson.address)
        const balanceOfLPHolder = await pair.balanceOf(secondPerson.address)
        assert.equal(balanceOfLPHolder, '31304951684997054749')
        //measure price
        const expectedSCXOutBefore = await uniswapRouter.getAmountOut('1000000000000000', '10000000000000000000', '100000000000000000000')

        //uncomment the next chunk to verify your estimation logic is correct
        //    const sortedTokens = await mintingModule.sortTokens(scx.address, eye.address)
        //    const scxFirst = sortedTokens[0] == scx.address
        //    const balanceBefore = await scx.balanceOf(owner.address)

        //    await eye.approve(pair.address, '1000000000000000000000')
        //    await eye.transfer(pair.address, '1000000000000000')
        //    await pair.swap(scxFirst ? expectedSCXOut : 0, scxFirst ? 0 : expectedSCXOut, owner.address, [])

        //    const balanceAfter = await scx.balanceOf(owner.address)

        //    const balanceChange = balanceAfter.sub(balanceBefore)
        //    const error = expectedSCXOut.sub(balanceChange)
        //    assert.isBelow(error.toNumber(), 2000000000000) //fee on transfer etc.
        //end chunk

        //mintingModule.purchaseLP

        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        //measure price and assert increase
        const scxBalanceOfPair = await scx.balanceOf(pair.address)
        const eyeBalanceOfPair = await eye.balanceOf(pair.address)

        const expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', eyeBalanceOfPair, scxBalanceOfPair)

        const expectedTiltIncrease = '199686760003036';
        const actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)
        //ha! It works
    })

    it("purchasing large amount with small reserves", async function () {
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '1000')
        await eye.transfer(pairAddress, '10000')
        await pair.mint(secondPerson.address)
        const balanceOfLPHolder = await pair.balanceOf(secondPerson.address)

        assert.equal(balanceOfLPHolder, 2130)
        //measure price
        const expectedSCXOutBefore = await uniswapRouter.getAmountOut('1000000000000000', '10000000000000000000', '100000000000000000000')

        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        //measure price and assert increase
        const scxBalanceOfPair = await scx.balanceOf(pair.address)
        const eyeBalanceOfPair = await eye.balanceOf(pair.address)

        const expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', eyeBalanceOfPair, scxBalanceOfPair)

        const expectedTiltIncrease = '9935442586837614';
        const actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)
    })

    it("purchasing multiple amounts", async function () {
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await pair.mint(secondPerson.address)
        const balanceOfLPHolder = await pair.balanceOf(secondPerson.address)
        assert.equal(balanceOfLPHolder, '31304951684997054749')
        //measure price
        const expectedSCXOutBefore = await uniswapRouter.getAmountOut('1000000000000000', '10000000000000000000', '100000000000000000000')

        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        //measure price and assert increase
        let scxBalanceOfPair = await scx.balanceOf(pair.address)
        let eyeBalanceOfPair = await eye.balanceOf(pair.address)

        let expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', eyeBalanceOfPair, scxBalanceOfPair)

        let expectedTiltIncrease = '199686760003036';
        let actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)

        await mintingModule.purchaseLP(eye.address, '1000000000000000')

        scxBalanceOfPair = await scx.balanceOf(pair.address)
        eyeBalanceOfPair = await eye.balanceOf(pair.address)
        expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', eyeBalanceOfPair, scxBalanceOfPair)
        expectedTiltIncrease = '199993357932805'; // in the absence of arbitrage, tilting increases
        actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)
    })

    it("purchasing with eth", async function () {
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        let tx = {
            to: reward.address,
            value: ethers.utils.parseEther('10'),
            gasLimit: ethers.utils.hexlify(10000000)
        };
        //    const wallet = new ethers.Wallet(owner)
        //     await wallet.sendTransaction(tx)

        // const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
        let privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        let wallet = new ethers.Wallet(privateKey, owner.provider);

        // await owner.sendTransaction(tx)
        await wallet.sendTransaction(tx);


        // //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, weth.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await weth.deposit({ value: ethers.utils.parseEther('10') })

        await weth.transfer(pairAddress, ethers.utils.parseEther('10'))
        await pair.mint(secondPerson.address)
        const balanceOfLPHolder = await pair.balanceOf(secondPerson.address)
        assert.equal(balanceOfLPHolder.toString(), '31304951684997054749')
        // //measure price
        const expectedSCXOutBefore = await uniswapRouter.getAmountOut('1000000000000000', '10000000000000000000', '100000000000000000000')

        //mintingModule.purchaseLP


        await mintingModule.purchaseLP(weth.address, '1000000000000000', { value: '1000000000000000' })
        //measure price and assert increase
        const scxBalanceOfPair = await scx.balanceOf(pair.address)
        const wethBalanceOfPair = await weth.balanceOf(pair.address)

        const expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', wethBalanceOfPair, scxBalanceOfPair)

        const expectedTiltIncrease = '199686760003036';
        const actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)

    })

    it("tilted input token rises, tilted output token rises", async function () {
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await pair.mint(secondPerson.address)
        const balanceOfLPHolder = await pair.balanceOf(secondPerson.address)
        assert.equal(balanceOfLPHolder, '31304951684997054749')
        //measure price
        const expectedSCXOutBefore = await uniswapRouter.getAmountOut('1000000000000000',

            '10000000000000000000', '100000000000000000000');

        //mintingModule.purchaseLP

        await scx.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(scx.address, '1000000000000000')
        //measure price and assert increase
        const scxBalanceOfPair = await scx.balanceOf(pair.address)
        const eyeBalanceOfPair = await eye.balanceOf(pair.address)

        const expectedSCXOutAfter = await uniswapRouter.getAmountOut('1000000000000000', eyeBalanceOfPair, scxBalanceOfPair)

        const expectedTiltIncrease = '199412009278849';
        const actualTiltIncrease = expectedSCXOutBefore.sub(expectedSCXOutAfter)

        expect(actualTiltIncrease).to.equal(expectedTiltIncrease)
    })

    it("request reward drains ironCrown and transfers to reward", async function () {
        await scx.mint(ironCrown.address, 270000)
        expect(await scx.balanceOf(reward.address)).to.equal(0)

        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.mint(pairAddress, '100000000000000000000')
        await eye.mint(pairAddress, '10000000000000000000')
        await pair.mint(secondPerson.address)

        await eye.mint(owner.address, 10000)
        await eye.approve(mintingModule.address, 10000)
        await mintingModule.purchaseLP(eye.address, 1)
        console.log('scx balance of reward: ' + await scx.balanceOf(reward.address))
        expect(await scx.balanceOf(reward.address)).to.equal(269993)
    })
})