const { expect, assert } = require("chai");
const { ethers } = require("hardhat");

describe("Liquid Queue", function () {
    let owner, secondPerson, feeSetter, mintingModule, uniswapRouter, MockToken, scx, eye, dai, uniSwapFactory, reward, weth, ironCrown, liquidQueue
    const zero = '0x0000000000000000000000000000000000000000'
    const RECIPIENT_index = 0, LP_index = 1, AMOUNT_index = 2, JOINTIMESTAMP_index = 3, DURATIONSINCELAST_index = 4, EYEHEIGHTATJOIN_index = 5, VALID_index = 6
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

        const LiquidQueueFactory = await ethers.getContractFactory('LiquidQueue')
        liquidQueue = await LiquidQueueFactory.deploy()
        await liquidQueue.setReward(reward.address)
        const MintingModuleFactory = await ethers.getContractFactory('MintingModule')

        mintingModule = await MintingModuleFactory.deploy(dai.address, scx.address, eye.address, uniswapRouter.address, uniSwapFactory.address, liquidQueue.address)
        await reward.seed(mintingModule.address, liquidQueue.address, ironCrown.address, eye.address, scx.address)
        await mintingModule.seed(uniSwapFactory.address, uniswapRouter.address, reward.address, 30)

        await liquidQueue.setMintingModule(mintingModule.address)
        await liquidQueue.configure(10, 21, eye.address, 10000, 10000, false)
    })

    it("tried to join from non minting module and fails", async function () {

        await expect(liquidQueue.join(owner.address, secondPerson.address))
            .to.be.revertedWith("LIQUID QUEUE: restricted function")
    })

    it("purchasing when paused fails", async function () {
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
        await liquidQueue.pause(true)
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await expect(mintingModule.purchaseLP(eye.address, '1000000000000000'))
            .to.be.revertedWith("LIQUID QUEUE: currently paused")
    })

    it("minting zero LP fails", async function () {
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
        await liquidQueue.pause(true)
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await expect(mintingModule.purchaseLP(eye.address, '0'))
            .to.be.revertedWith("UniswapV2Library: INSUFFICIENT_AMOUNT")
    })

    it("queue pops LP into wallets, emits correct events", async function () {
        await liquidQueue.configure(1, 3, eye.address, 2, 1, true)
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const scx_eye_pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await scx_eye_pair.mint(secondPerson.address)

        let queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry]
        expect(queueData[0]).to.equal(0)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(0)

        let batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][VALID_index]).to.be.false
        expect(batches[1][VALID_index]).to.be.false
        expect(batches[2][VALID_index]).to.be.false

        //FIRST PURCHASE    
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')

        batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][VALID_index]).to.be.true
        expect(batches[1][VALID_index]).to.be.false
        expect(batches[2][VALID_index]).to.be.false

        expect(batches[0][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[0][LP_index]).to.equal(scx_eye_pair.address)
        expect(batches[0][AMOUNT_index].toNumber()).to.be.above(0)
        expect(batches[0][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[0][DURATIONSINCELAST_index].toNumber()).to.equal(604800) // first item is made to look slow

        queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry]
        expect(queueData[0]).to.equal(1)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(0)


        await dai.mint(owner.address, ethers.utils.parseEther('10'))
        const daiEyePairAddress = await uniSwapFactory.getPair(dai.address, eye.address)
        const daiEyePair = await ethers.getContractAt('UniswapV2Pair', daiEyePairAddress)
        await dai.transfer(daiEyePairAddress, '100000000000000000000')
        await eye.transfer(daiEyePairAddress, '10000000000000000000')
        await daiEyePair.mint(secondPerson.address)

        await network.provider.send("evm_increaseTime", [1000])

        //SECOND PURCHASE
        await dai.approve(mintingModule.address, ethers.utils.parseEther('10'))
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry]
        expect(queueData[0]).to.equal(2)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(1)
        expect(queueData[3]).to.be.above(150)
        expect(queueData[3]).to.be.below(400)

        batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        /*UNCOMMENT TO PRINT DEBUG OUTPUT 
        let printbatches = batches.map(b => {
             b = b.map((r, i) => {
                 let val = ''
                 if (i > 1 && i < 6)
                     val = r.toString();
                 val = r;
                 return `${i}: ${val}`
             })
             return b
         })
         console.log(JSON.stringify(printbatches, null, 4))
         console.log('scx_eye ' + scx_eye_pair.address)
         console.log('dai_eye ' + daiEyePair.address)
 */

        expect(batches[0][VALID_index]).to.be.true
        expect(batches[1][VALID_index]).to.be.true
        expect(batches[2][VALID_index]).to.be.false

        expect(batches[0][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[0][LP_index]).to.equal(scx_eye_pair.address)
        expect(batches[0][AMOUNT_index].gt(0)).to.be.true
        expect(batches[0][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[0][DURATIONSINCELAST_index].toNumber()).to.equal(604800)

        expect(batches[1][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[1][LP_index]).to.equal(daiEyePair.address)
        expect(batches[1][AMOUNT_index].gt(0)).to.be.true
        expect(batches[1][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[1][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        await network.provider.send("evm_increaseTime", [1000])

        //THIRD PURCHASE
        await dai.approve(mintingModule.address, ethers.utils.parseEther('10'))
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry,velocity]
        expect(queueData[0]).to.equal(3)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(2)
        expect(queueData[3]).to.be.above(300)
        expect(queueData[3]).to.be.below(500)

        batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[0][LP_index]).to.equal(scx_eye_pair.address)
        expect(batches[0][AMOUNT_index].gt(0)).to.be.true
        expect(batches[0][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[0][DURATIONSINCELAST_index].toNumber()).to.equal(604800)

        expect(batches[1][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[1][LP_index]).to.equal(daiEyePair.address)
        expect(batches[1][AMOUNT_index].gt(0)).to.be.true
        expect(batches[1][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[1][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        expect(batches[2][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[2][LP_index]).to.equal(daiEyePair.address)
        expect(batches[2][AMOUNT_index].gt(0)).to.be.true
        expect(batches[2][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[2][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        expect(await scx_eye_pair.balanceOf(owner.address)).to.equal(0)
        const expectedReward = batches[0][AMOUNT_index]

        await network.provider.send("evm_increaseTime", [1000])
        //FOURTH PURCHASE    
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')

        expect(await scx_eye_pair.balanceOf(owner.address)).to.equal(expectedReward)

        queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry,velocity]
        expect(queueData[0]).to.equal(3)
        expect(queueData[1]).to.equal(1)
        expect(queueData[2]).to.equal(0)
        expect(queueData[3]).to.be.above(500)
        expect(queueData[3]).to.be.below(700)

        batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[0][LP_index]).to.equal(scx_eye_pair.address)
        expect(batches[0][AMOUNT_index].gt(0)).to.be.true
        expect(batches[0][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[1][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        expect(batches[1][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[1][LP_index]).to.equal(daiEyePair.address)
        expect(batches[1][AMOUNT_index].gt(0)).to.be.true
        expect(batches[1][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[1][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        expect(batches[2][RECIPIENT_index]).to.equal(owner.address)
        expect(batches[2][LP_index]).to.equal(daiEyePair.address)
        expect(batches[2][AMOUNT_index].gt(0)).to.be.true
        expect(batches[2][JOINTIMESTAMP_index].toString()).to.not.equal('0')
        expect(batches[2][DURATIONSINCELAST_index].toNumber()).to.be.above(1000)

        expect(await daiEyePair.balanceOf(owner.address)).to.equal(0)
        await network.provider.send("evm_increaseTime", [1000])
        //FOURTH PURCHASE    
        await mintingModule.purchaseLP(eye.address, '1123000000000000')

        expect(await daiEyePair.balanceOf(owner.address)).to.equal(batches[1][AMOUNT_index])

        queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry,velocity]
        expect(queueData[0]).to.equal(3)
        expect(queueData[1]).to.equal(2)
        expect(queueData[2]).to.equal(1)
        expect(queueData[3]).to.be.above(500)
        expect(queueData[3]).to.be.below(700)
    })

    it("fast queue increases LP burn until max", async function () {
        //1 week = 604800 seconds
        await liquidQueue.configure(1, 3, eye.address, 2000, 1, false)
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const scx_eye_pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await scx_eye_pair.mint(secondPerson.address)

        let queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry]
        expect(queueData[0]).to.equal(0)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(0)

        let batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][VALID_index]).to.be.false
        expect(batches[1][VALID_index]).to.be.false
        expect(batches[2][VALID_index]).to.be.false

        //FILL QUEUE FIRST 
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        queueData = await liquidQueue.getQueueData()
        expect(queueData[4]).to.equal(0)

        await network.provider.send("evm_increaseTime", [500])
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        queueData = await liquidQueue.getQueueData()
        expect(queueData[4]).to.equal(0)

        for (let i = 0; i < 60; i++) {
            const expectedBurnRatio = i > 49 ? 49 : i
            await network.provider.send("evm_increaseTime", [500])
            await eye.approve(mintingModule.address, '1000000000000000000000')
            await mintingModule.purchaseLP(eye.address, '1000000000000000')
            queueData = await liquidQueue.getQueueData()
            expect(queueData[4]).to.equal(expectedBurnRatio)
        }
    })

    it("fast queue with LP burn turned off doesn't burn", async function () {
        //1 week = 604800 seconds
        await liquidQueue.configure(1, 3, eye.address, 2000, 1, true)
        //mint scx and eye
        await scx.mint(owner.address, '1000000000000000000000')
        await eye.mint(owner.address, '1000000000000000000000')
        await scx.mint(reward.address, '1000000000000000000000')
        await eye.mint(reward.address, '1000000000000000000000')
        //preseed LP with large reserves
        const pairAddress = await uniSwapFactory.getPair(scx.address, eye.address)
        const scx_eye_pair = await ethers.getContractAt('UniswapV2Pair', pairAddress)
        await scx.transfer(pairAddress, '100000000000000000000')
        await eye.transfer(pairAddress, '10000000000000000000')
        await scx_eye_pair.mint(secondPerson.address)

        let queueData = (await liquidQueue.getQueueData())
            .map(item => item.toNumber());//[length,last,entry]
        expect(queueData[0]).to.equal(0)
        expect(queueData[1]).to.equal(0)
        expect(queueData[2]).to.equal(0)

        let batches = []
        for (let i = 0; i < 3; i++)
            batches.push(await liquidQueue.getBatch(i))

        expect(batches[0][VALID_index]).to.be.false
        expect(batches[1][VALID_index]).to.be.false
        expect(batches[2][VALID_index]).to.be.false

        //FILL QUEUE FIRST 
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        queueData = await liquidQueue.getQueueData()
        expect(queueData[4]).to.equal(0)

        await network.provider.send("evm_increaseTime", [500])
        await eye.approve(mintingModule.address, '1000000000000000000000')
        await mintingModule.purchaseLP(eye.address, '1000000000000000')
        queueData = await liquidQueue.getQueueData()
        expect(queueData[4]).to.equal(0)

        for (let i = 0; i < 60; i++) {
            const expectedBurnRatio = 0
            await network.provider.send("evm_increaseTime", [500])
            await eye.approve(mintingModule.address, '1000000000000000000000')
            await mintingModule.purchaseLP(eye.address, '1000000000000000')
            queueData = await liquidQueue.getQueueData()
            expect(queueData[4]).to.equal(expectedBurnRatio)
        }
    })

    it("stagnant queue has eye reward until queue moving. Cumulative eye reward per user correct.", async function () {
        //1 week = 604800 seconds
        await liquidQueue.configure(50000, 3, eye.address, 2000, 2, false)
        await eye.mint(reward.address, ethers.utils.parseEther('1000'))
        await dai.mint(owner.address, ethers.utils.parseEther('100'))
        const daiEyePairAddress = await uniSwapFactory.getPair(dai.address, eye.address)
        const daiEyePair = await ethers.getContractAt('UniswapV2Pair', daiEyePairAddress)
        await dai.transfer(daiEyePairAddress, '100000000000000000000')
        await eye.mint(daiEyePairAddress, '10000000000000000000')
        daiEyePair.mint(secondPerson.address)

        await dai.approve(mintingModule.address, ethers.utils.parseEther('10'))
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))

        await network.provider.send("evm_increaseTime", [40000])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))

        await network.provider.send("evm_increaseTime", [40000])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))

        await network.provider.send("evm_increaseTime", [40000])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))

        expect((await eye.balanceOf(owner.address)).toNumber()).to.be.greaterThan(80000 - 1)

        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        let velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        let eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)

        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)

        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)

        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)

        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)


        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)


        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)


        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        eyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + eyeBal)


        await network.provider.send("evm_increaseTime", [10])
        await mintingModule.purchaseLP(dai.address, ethers.utils.parseEther('1'))
        velocity = (await liquidQueue.getQueueData())[3]
        console.log('velocity: ' + velocity)
        let lastEyeBal = (await eye.balanceOf(owner.address)).toNumber()
        console.log('eyeBal: ' + lastEyeBal)

        expect(eyeBal).to.equal(lastEyeBal)
    })

    it("configuring paused queue fails", async function () {

    })

    it("Q pop can't happen on pause", async function () {

    })

    it("Q pop reduces queue size and still functions correctly", async function () {

    })
})