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
const fs = require('fs')
const pairJSON = JSON.parse(fs.readFileSync('../build/contracts/UniswapV2Pair.json', 'utf-8'))

module.exports = async function (deployer, network, accounts) {
    let deploymentObject = JSON.parse(fs.readFileSync('/home/justin/weidai ecosystem/LiquidQueue/deploymentObject.json', "utf-8"))

    let wethInstance, factoryInstance, rewardInstance, ironCrownInstance, routerInstance, eyeInstance, daiInstance, scxInstance
    let liquidQueueInstance, mintingModuleInstance, sluiceGateInstance
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

        //create eyeWeth pool
        await factoryInstance.createPair(eyeInstance.address, wethInstance.address)
        const eyeWeth = await factoryInstance.getPair(eyeInstance.address, wethInstance.address)
        await eyeInstance.mint(eyeWeth, '10000000000000000000000')
        await wethInstance.deposit({ from: accounts[0], value: '200030000000000' })
        await wethInstance.transfer(eyeWeth, '200030000000000')

        const eyeWethLP = new web3.eth.Contract(pairJSON.abi, eyeWeth)
        let gas = await eyeWethLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        console.log('gas: ' + gas)
        await eyeWethLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        console.log('EYE_WETH total supply: ' + (await eyeWethLP.methods.totalSupply().call()).toString())
        console.log('EYE WETH address ' + eyeWeth)
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

        await liquidQueueInstance.configure(10, 21, eyeInstance.address, 10000, '35000000000000000', false)

        const scx_eye = await factoryInstance.getPair(scxInstance.address, eyeInstance.address)
        const eye_weth = await factoryInstance.getPair(wethInstance.address, eyeInstance.address)

        await eyeInstance.mint(scx_eye, '1000000000000000000000')
        await scxInstance.mint(scx_eye, '20000000000000000000001')

        const scx_eyeLP = new web3.eth.Contract(pairJSON.abi, scx_eye)
        gas = await scx_eyeLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        await scx_eyeLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        const totalSCXEYESupply = (await scx_eyeLP.methods.totalSupply().call()).toString()
        console.log('SCX_EYE LP total Supply: ' + totalSCXEYESupply)
        await deployer.deploy(Sluicegate, scx_eye, eye_weth, eyeInstance.address)
        sluiceGateInstance = await Sluicegate.deployed()
        let contracts = {
            LiquidQueue: liquidQueueInstance.address,
            MintingModule: mintingModuleInstance.address,
            Reward: rewardInstance.address,
            SluiceGate: sluiceGateInstance.address,
            UniswapV2Factory: factoryInstance.address,
            EYE: eyeInstance.address,
            WETH: wethInstance.address,
            SCX: scxInstance.address,
            DAI: daiInstance.address
        }
        deploymentObject[network] = contracts
        fs.writeFileSync("deploymentObject.json", JSON.stringify(deploymentObject, null, 4), "utf-8")
    }
};