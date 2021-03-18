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

        const LiquidQueueFactory = await ethers.getContractFactory('LiquidQueue')
        const liquidQueue = await LiquidQueueFactory.deploy()

        const MintingModuleFactory = await ethers.getContractFactory('MintingModule')

        mintingModule = await MintingModuleFactory.deploy(dai.address, scx.address, eye.address, uniswapRouter.address, uniSwapFactory.address, liquidQueue.address)
        await reward.seed(mintingModule.address, ironCrown.address, eye.address, scx.address)
        await mintingModule.seed(uniSwapFactory.address, uniswapRouter.address, reward.address, 30)

        await liquidQueue.setMintingModule(mintingModule.address)
        await liquidQueue.configure(10, 21, eye.address, 10000, 10000)
    })

    it("tried to join from non minting module and fails", async function (){

    })
    
    it("purchasing when paused fails", async function (){
        
    })

    it("minting zero LP fails", async function (){
        
    })

    it("queue pops LP into wallets, emits correct events", async function (){
        
    })

    it("fast queue increases LP burn until max", async function (){
        
    })

    it("fast queue with LP burn turned off doesn't burn", async function (){
        
    })

    it("stagnant queue has eye reward until queue moving. Cumulative eye reward per user correct.", async function (){
        
    })

    it("configuring paused queue fails", async function (){
        
    })

    it("Q pop can't happen on pause", async function (){
        
    })

    it("Q pop reduces queue size and still functions correctly", async function (){
        
    })
})