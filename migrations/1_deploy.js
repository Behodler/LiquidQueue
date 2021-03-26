const UniswapFactory = artifacts.require("UniswapV2Factory");
const WETH = artifacts.require('WETH')
const UniswapRouter = artifacts.require('UniswapV2Router02')

const MockToken = artifacts.require('MockToken')


const LiquidQueue = artifacts.require('LiquidQueue')
const MintingModule = artifacts.require('MintingModule')
const Reward = artifacts.require('Reward')
const Sluicegate = artifacts.require('SluiceGate')

const MockIronCrown = artifacts.require("MockIronCrown")
const zero = '0x0000000000000000000000000000000000000000'

module.exports = async function (deployer, network, accounts) {
    let wethInstance, factoryInstance, rewardInstance, ironCrownInstance, routerInstance, eyeInstance, daiInstance, scxInstance
    let liquidQueueInstance, mintingModuleInstance
    if (network === 'development') {
        //uniswap
        await deployer.deploy(WETH)
        wethInstance = await WETH.deployed()

        await deployer.deploy(UniswapFactory, accounts[0])
        factoryInstance = await UniswapFactory.deployed()
        await deployer.deploy(UniswapRouter, factoryInstance.address, wethInstance.address)
        routerInstance = await UniswapRouter.deployed()


        await deployer.deploy(Reward)
        rewardInstance = await Reward.deployed()

        //mock tokens

        scxInstance = await MockToken.new("SCX", "SCX", rewardInstance.address, true)
        eyeInstance = await MockToken.new("EYE", "EYE", accounts[0], false)
        daiInstance = await MockToken.new("DAI", "DAI", accounts[0], false)

        //Morgoth
        await deployer.deploy(MockIronCrown, scxInstance.address, rewardInstance.address)
        ironCrownInstance = await MockIronCrown.deployed()


        //LiquidQueue
        await deployer.deploy(LiquidQueue)
        liquidQueueInstance = await LiquidQueue.deployed()
        await liquidQueueInstance.setReward(rewardInstance.address)

        await deployer.deploy(MintingModule, daiInstance.address, scxInstance.address, eyeInstance.address, routerInstance.address, factoryInstance.address, liquidQueueInstance.address)
        mintingModuleInstance = await MintingModule.deployed()

        await mintingModuleInstance.seed(factoryInstance.address, routerInstance.address, rewardInstance.address, 20)
        await liquidQueueInstance.setMintingModule(mintingModuleInstance.address)

        await liquidQueueInstance.configure(10, 21, eyeInstance.address, 10000, 10000, false)
    }
};
